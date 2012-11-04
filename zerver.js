/* Imports and static vars */

var cleanCSS = require('clean-css'),
	fs       = require('fs'  ),
	http     = require('http'),
	mime     = require('mime'),
	path     = require('path'),
	uglify   = require('uglify-js'),
	url      = require('url' ),
	zlib     = require('zlib');

var ROOT_DIR  = process.cwd(),
	SLASH     = /\//g,
	GZIP_ENABLED = false,
	COMPILATION_ENABLED = false,
	CACHE_ENABLED = false,
	GZIPPABLE = {
		'application/json'       : true ,
		'application/javascript' : true ,
		'text/javascript'        : true ,
		'text/css'               : true ,
		'text/html'              : true ,
		'text/plain'             : true ,
		'text/cache-manifest'    : true
	},
	HAS_MANIFEST = false,
	MANIFESTS,
	CACHE_CONTROL,
	DEBUG,
	REFRESH,
	PORT,
	API_DIR,
	API_URL,
	API_URL_LENGTH,
	API_SCRIPT_MATCH;

var memoryCache = {},
	fileCache   = {},
	app, apis;

var startTimestamp;



/* Run server */

exports.middleware = function (apiDir, apiURL) {
	configureZerver(8888, apiDir, apiURL, false, false, '');
	return handleMiddlewareRequest;
};

exports.run = function (port, apiDir, debug, refresh, manifests, production) {
	configureZerver(port, apiDir, apiDir, debug, refresh, manifests, production);

	app = http.createServer(handleRequest).listen(PORT);

	if (DEBUG) {
		console.log('[debug mode]');
	}
	else if (production) {
		console.log('[production mode]');
	}

	console.log('zerver running on port ' + PORT);

	var apiNames = apis.getNames();
	if ( apiNames.length ) {
		console.log('available apis:');
		apiNames.forEach(function (apiName) {
			console.log('\t' + apiName);
		});
	}
	else {
		console.log('no available apis');
	}

	if (manifests) {
		console.log('manifest files:');
		for (var path in MANIFESTS) {
			console.log('\t' + path);
		}
	}

	console.log('');
};

function configureZerver (port, apiDir, apiURL, debug, refresh, manifests, production) {
	PORT             = port;
	API_DIR          = apiDir;
	API_URL          = apiURL;
	API_URL_LENGTH   = apiURL.length;
	DEBUG            = debug;
	REFRESH          = refresh;
	API_SCRIPT_MATCH = new RegExp('\\/'+API_URL+'\\/([^\\/]+)\\.js');
	MANIFESTS        = {};

	if (REFRESH) {
		DEBUG = true;
	}

	if (!DEBUG && production) {
		GZIP_ENABLED        = true;
		COMPILATION_ENABLED = true;
		CACHE_ENABLED       = true;
	}

	startTimestamp = new Date();

	if (manifests) {
		manifests.split(',').forEach(function (path) {
			if (!path[0] !== '/') {
				path = '/' + path;
			}

			MANIFESTS[path] = true;
			HAS_MANIFEST    = true;
		});
	}

	if (DEBUG) {
		CACHE_CONTROL = 'no-cache';
	}
	else if (HAS_MANIFEST) {
		CACHE_CONTROL = 'max-age=0';
	}
	else {
		CACHE_CONTROL = 'max-age=14400';
	}

	fetchAPIs();

	http.globalAgent.maxSockets = 50;
}

function fetchAPIs () {
	apis = require(__dirname + '/apis');
	apis.setup(API_DIR, REFRESH);
}

function handleRequest (request, response) {
	var urlParts = url.parse(request.url),
		handler  = {
			request  : request                      ,
			response : response                     ,
			pathname : decodeURI(urlParts.pathname) ,
			query    : urlParts.search              ,
			hash     : urlParts.hash                ,
			time     : process.hrtime()             ,
			type     : null
		},
		pathname  = handler.pathname,
		isApiCall = pathname.substr(0, API_URL_LENGTH + 2) === '/'+API_URL+'/';

	tryResponseFromCache(handler, pathname, isApiCall, dynamicResponse);
}

function tryResponseFromCache (handler, pathname, isApiCall, fallback) {
	if (!CACHE_ENABLED || isApiCall || !(pathname in memoryCache)) {
		fallback(handler, pathname, isApiCall);
		return;
	}

	var args = memoryCache[pathname],
		data = fileCache[pathname];

	handler.type = args.type;
	finishResponse(handler, args.status, args.headers, data, args.isBinary, true);
}

function dynamicResponse (handler, pathname, isApiCall) {
	if ( !!MANIFESTS[pathname] ) {
		manifestRequest(handler, pathname);
	}
	else if ( !isApiCall ) {
		pathRequest(handler, pathname);
	}
	else if ( API_SCRIPT_MATCH.test(pathname) ) {
		scriptRequest(handler, pathname);
	}
	else {
		APIRequest(handler, pathname);
	}
}

function handleMiddlewareRequest (request, response, next) {
	var urlParts = url.parse(request.url),
		pathname = decodeURI(urlParts.pathname);

	if (pathname.substr(0, API_URL_LENGTH + 2) !== '/'+API_URL+'/') {
		next();
		return;
	}

	handleRequest(request, response);
}

function compileOutput (type, data, callback) {
	if (!COMPILATION_ENABLED || DEBUG) {
		callback(data);
		return;
	}

	var code;

	switch (type) {
		case 'application/javascript':
		case 'text/javascript':
			try {
				var ast = uglify.parser.parse(data);
				ast     = uglify.uglify.ast_mangle(ast);
				ast     = uglify.uglify.ast_squeeze(ast);
				code    = uglify.uglify.gen_code(ast);
			}
			catch (err) {}
			break;

		case 'text/css':
			try {
				code = cleanCSS.process(data);
			}
			catch (err) {}
			break;
	}

	callback(code || data);
}

function setupGZipOutput (type, data, headers, callback) {
	if (!GZIP_ENABLED || !(type in GZIPPABLE)) {
		callback(data, headers);
		return;
	}

	zlib.gzip(data, function (err, gzipped) {
		if (err) {
			callback(data, headers);
			return;
		}

		headers['Content-Encoding'] = 'gzip';

		callback(gzipped, headers);
	});
}



/* Request handler */

function finishResponse (handler, status, headers, data, isBinary, noCache) {
	var response = handler.response;

	response.writeHeader(status, headers);

	if ( !isBinary ) {
		response.end(data);
	}
	else {
		response.write(data, 'binary');
		response.end();
	}

	var pathname = handler.pathname,
		type     = handler.type;

	if (!noCache && CACHE_ENABLED && (type !== 'api') && (type !== 'scheme') && !(pathname in memoryCache)) {
		memoryCache[pathname] = {
			type     : type ,
			status   : status    ,
			headers  : headers   ,
			isBinary : isBinary
		};

		if ( Buffer.isBuffer(data) ) {
			var str = '';

			for (var i=0, len=data.length; i<len; i++) {
				str += String.fromCharCode( data[i] );
			}

			fileCache[pathname] = str || '';
		}
		else {
			fileCache[pathname] = data || '';
		}
	}

	logRequest(handler, status);
}

function respond (handler, status, type, data, headers) {
	headers['Content-Type'] = type;
	finishResponse(handler, status, headers, data, false);
}

function respondBinary (handler, status, type, data, headers) {
	headers['Content-Type'] = type;

	compileOutput(type, data, function (data) {
		setupGZipOutput(type, data, headers, function (data, headers) {
			finishResponse(handler, status, headers, data, true);
		});
	});
}

function respond404 (handler) {
	respond(handler, 404, 'text/plain', '404\n', {});
}

function respond500 (handler) {
	respond(handler, 500, 'text/plain', '500\n', {
		'Cache-Control' : 'no-cache'
	});
}

function pathRequest (handler, pathname) {
	handler.type = 'file';

	if (pathname.substr(0, 2) === '/.') {
		respond404(handler);
		return;
	}

	var fileName = path.join(ROOT_DIR, pathname);
	fileRequest(handler, fileName);
}

function fileRequest (handler, fileName) {
	fs.stat(fileName, function (err, stats) {
		if (err) {
			respond404(handler);
			return;
		}

		if ( stats.isDirectory() ) {
			if (fileName[fileName.length - 1] !== '/') {
				respond(handler, 301, 'text/plain', '', {
					'Location' : handler.pathname + (handler.query || '') + (handler.hash || '')
				});
			}
			else {
				fileRequest(handler, fileName + 'index.html');
			}
			return;
		}

		fs.readFile(fileName, 'binary', function (err, file) {
			if (err) {
				respond500(handler);
				return;
			}

			respondBinary(handler, 200, mime.lookup(fileName), file, {
				'Cache-Control' : CACHE_CONTROL
			});
		});
	});
}

function manifestRequest (handler, pathname) {
	handler.type = 'manifest';

	var fileName = path.join(ROOT_DIR, pathname);

	fs.stat(fileName, function (err, stats) {
		if (err || !stats.isFile()) {
			respond404(handler);
			return;
		}

		fs.readFile(fileName, 'utf8', function (err, data) {
			if (err || !data) {
				respond500(handler);
				return;
			}

			var timestamp = DEBUG ? new Date() : startTimestamp;
			data += '\n# Zerver: updated at ' + timestamp + '\n';

			respondBinary(handler, 200, 'text/cache-manifest', new Buffer(data), {});
		});
	});
}

function APIRequest (handler, pathname) {
	handler.type = 'api';

	var pathname = pathname.substr(API_URL_LENGTH + 1);

	if (pathname === '/') {
		APISchemeRequest(handler);
		return;
	}

	var apiParts = pathname.substr(1).split('/');

	if (apiParts.length < 2) {
		respond500(handler);
		return;
	}

	var apiName = apiParts[0],
		api     = apis.get(apiName);

	for (var i=1, len=apiParts.length; api && (i<len); api=api[ apiParts[i++] ]);

	if (typeof api !== 'function') {
		respond500(handler);
		return;
	}

	if (handler.request.method === 'OPTIONS') {
		respond(
			handler,
			200, 'text/plain', '\n',
			addCORSHeaders({}, ['POST'], apis.getCORS(apiName))
		);
		return;
	}

	if (handler.request.method !== 'POST') {
		respond500(handler);
		return;
	}

	var rawData = '';

	handler.request.on('data', function (chunk) {
		rawData += chunk.toString();
	});

	handler.request.on('end', function () {
		var data, args;
		try {
			data = JSON.parse(rawData);
			args = data.args;
		}
		catch (err) {
			respond500(handler);
			return;
		}
		if ( !Array.isArray(args) ) {
			respond500(handler);
			return;
		}

		if ( !data.noResponse ) {
			args.push(successCallback);
		}

		var val;

		try {
			val = api.apply(handler, args);
		}
		catch (err) {
			console.error(err);
			errorCallback(err);
			return;
		}

		if (data.noResponse) {
			successCallback();
		}
		else if (typeof val !== 'undefined') {
			successCallback(val);
		}
	});

	var called = false;

	function successCallback () {
		callback({ data : Array.prototype.slice.call(arguments) });
	}

	function errorCallback (error) {
		callback({ error : error + '' });
	}

	function callback (data) {
		if (called) {
			return;
		}
		called = true;

		var cors    = apis.getCORS(apiName),
			headers = {
				'Cache-Control' : 'no-cache'
			};

		if (cors) {
			addCORSHeaders(headers, ['POST'], cors);
		}

		try {
			respond(
				handler,
				200, 'application/json',
				JSON.stringify(data),
				headers
			);
		}
		catch (err) {
			console.error(err);
			respond500(handler);
		}
	}
}

function APISchemeRequest (handler) {
	handler.type = 'scheme';

	respond(
		handler,
		200, 'application/json',
		JSON.stringify( apis.getScheme() ),
		{ 'Cache-Control' : 'no-cache' }
	);
}

function scriptRequest (handler, pathname) {
	handler.type = 'script';

	var match = API_SCRIPT_MATCH.exec(pathname);

	if ( !match ) {
		respond404(handler);
		return;
	}

	var apiRoot = match[1],
		apiName = apiRoot;

	if (handler.query) {
		var query = parseQueryString( handler.query.substr(1) );

		if (query.name) {
			apiName = query.name;
		}
	}

	var file = apis.getScript(apiRoot, apiName, handler.request.headers.host, API_URL);

	if ( !file ) {
		respond404(handler);
		return;
	}

	respond(handler, 200, 'application/javascript', file, {
		'Cache-Control' : CACHE_CONTROL
	});
}

function logRequest (handler, status) {
	var logType     = 'ZERVER  ',
		statusField = (status === 200) ? '' : '['+status+'] ',
		pathname    = handler.pathname,
		timeParts   = process.hrtime(handler.time),
		timeMs      = (timeParts[0] * 1000 + timeParts[1] / 1000000) + '',
		time        = '[' + timeMs.substr(0, timeMs.indexOf('.')+3) + 'ms] ';

	switch (handler.type) {
		case 'file':
		case 'script':
			logType = 'FILE    ';
			break;
		case 'manifest':
			logType = 'MANIFEST';
			break;
		case 'scheme':
			logType = 'SCHEME  ';
			break;
		case 'api':
			logType = 'API     ';
			pathname = pathname.substr(2 + API_URL_LENGTH).replace(SLASH, '.') + '()';
			break;
	}

	console.log(logType + ' : ' + time + statusField + pathname);
}

var parseQueryString = function () {
	var re           = /([^&=]+)=([^&]+)/g,
		decodedSpace = /\+/g;

	return function (queryString) {
		var result = {},
			m, key, value;

		if (queryString) {
			queryString = queryString.replace(decodedSpace, '%20');

			while ((m = re.exec(queryString))) {
				key   = decodeURIComponent( m[1] );
				value = decodeURIComponent( m[2] );
				result[ key ] = value;
			}
		}

		return result;
	};
}();

function addCORSHeaders (headers, methods, host) {
	methods.push('OPTIONS');

	if ( !headers['Access-Control-Allow-Origin'] ) {
		headers['Access-Control-Allow-Origin'] = host;
	}

	if ( !headers['Access-Control-Allow-Methods'] ) {
		headers['Access-Control-Allow-Methods'] = methods.map(function (m) { return m.toUpperCase() }).join(', ');
	}

	if ( !headers['Access-Control-Max-Age'] ) {
		headers['Access-Control-Max-Age'] = 21600;
	}

	if ( !headers['Access-Control-Allow-Headers'] ) {
		headers['Access-Control-Allow-Headers'] = 'Content-Type';
	}

	return headers;
}



function setupAutoRefresh () {
	if ( !app ) {
		return;
	}

	var io      = require('socket.io').listen(app, { log: false }),
		sockets = io.of('/'+API_URL+'/_refresh');

	process.on('message', function (data) {
		if (data && data.debugRefresh) {
			sockets.emit('refresh');
		}
	});
}



/* Run in debug mode */

if (require.main === module) {
	exports.run(parseInt(process.argv[2]), process.argv[3], (process.argv[4]==='1'), (process.argv[5]==='1'), process.argv[6], (process.argv[7]==='1'));

	if (DEBUG && REFRESH) {
		setupAutoRefresh();
	}
}
