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
	GZIP_ENABLED = false,
	COMPILATION_ENABLED = false,
	GZIPPABLE = {
		'application/json'       : true ,
		'application/javascript' : true ,
		'text/javascript'        : true ,
		'text/css'               : true ,
		'text/html'              : true ,
		'text/plain'             : true ,
		'text/cache-manifest'    : true
	},
	IS_DEFLATE = /\bdeflate\b/,
	IS_GZIP    = /\bgzip\b/,
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

var app, apis;

var startTimestamp;



/* Run server */

exports.middleware = function (apiDir, apiURL) {
	configureZerver(8888, apiDir, apiURL, false, false, '');
	return handleMiddlewareRequest;
};

exports.run = function (port, apiDir, debug, refresh, manifests) {
	configureZerver(port, apiDir, apiDir, debug, refresh, manifests);

	app = http.createServer(handleRequest).listen(PORT);

	if (debug) {
		console.log('[debug mode]');
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

function configureZerver (port, apiDir, apiURL, debug, refresh, manifests) {
	PORT             = port;
	API_DIR          = apiDir;
	API_URL          = apiURL;
	API_URL_LENGTH   = apiURL.length;
	DEBUG            = debug;
	REFRESH          = refresh;
	API_SCRIPT_MATCH = new RegExp('\\/'+API_URL+'\\/([^\\/]+)\\.js');
	MANIFESTS        = {};

	startTimestamp = new Date();

	if (manifests) {
		manifests.split(',').forEach(function (path) {
			if (!path[0] !== '/') {
				path = '/' + path;
			}

			MANIFESTS[path] = true;
			HAS_MANIFEST = true;
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
}

function fetchAPIs () {
	apis = require(__dirname + '/apis');
	apis.setup(API_DIR, REFRESH);
}

function handleRequest (request, response) {
	var handler   	= new Handler(request, response),
		pathname  	= handler.pathname,
		isApiCall 	= pathname.substr(0, API_URL_LENGTH + 2) === '/'+API_URL+'/',
		isManifest	= !!MANIFESTS[pathname];

	if (isManifest) {
		handler.manifestRequest();
	}
	else if ( !isApiCall ) {
		handler.pathRequest();
	}
	else if ( API_SCRIPT_MATCH.test(pathname) ) {
		handler.scriptRequest();
	}
	else {
		handler.APIRequest();
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

function compileOutput (type, data, headers, callback) {
	var handler = this;

	if (!COMPILATION_ENABLED || DEBUG) {
		callback.call(handler, data, headers);
		return;
	}

	var args = handler.query && parseQueryString( handler.query.substr(1) ).compile;

	if ( !args ) {
		callback.call(handler, data, headers);
		return;
	}

	switch (type) {
		case 'application/javascript':
		case 'text/javascript':
			var code;
			try {
				var ast = uglify.parser.parse(data);
				ast     = uglify.uglify.ast_mangle(ast);
				ast     = uglify.uglify.ast_squeeze(ast);
				code    = uglify.uglify.gen_code(ast);
			}
			catch (err) {}
			if ( !code ) {
				callback.call(handler, data, headers);
			}
			else {
				callback.call(handler, code, headers);
			}
			break;

		case 'text/css':
			var code;
			try {
				code = cleanCSS.process(data);
			}
			catch (err) {}
			if ( !code ) {
				callback.call(handler, data, headers);
			}
			else {
				callback.call(handler, code, headers);
			}
			break;
	}

	callback.call(handler, data, headers);
}

function setupGZipOutput (type, data, headers, callback) {
	var handler = this;

	if (!GZIP_ENABLED || DEBUG || !(type in GZIPPABLE)) {
		callback.call(handler, data, headers);
		return;
	}

	var acceptEncoding = handler.request.headers['accept-encoding'] || '';

	if ( acceptEncoding.match(IS_DEFLATE) ) {
		zlib.deflate(data, function (err, deflated) {
			if (err) {
				callback.call(handler, data, headers);
				return;
			}

			headers['content-encoding'] = 'deflate';

			callback.call(handler, deflated, headers);
		});
	}
	else if (acceptEncoding.match(IS_GZIP)) {
		zlib.gzip(data, function (err, gzipped) {
			if (err) {
				callback.call(handler, data, headers);
				return;
			}

			headers['content-encoding'] = 'gzip';

			callback.call(handler, gzipped, headers);
		});
	}
	else {
		callback.call(handler, data, headers);
	}
}



/* Request handler */

function Handler (request, response) {
	var urlParts = url.parse(request.url),
		pathname = decodeURI(urlParts.pathname);

	this.request  = request;
	this.response = response;
	this.pathname = pathname;
	this.query    = urlParts.search;
	this.hash     = urlParts.hash;
	this.time     = process.hrtime();
	this.status   = null;
	this.type     = null;
}

Handler.prototype.respond = function (status, type, data, headers) {
	var handler = this;

	headers = headers || {};
	headers['Content-Type'] = type;

	compileOutput.call(this, type, data, headers, function (data, headers) {
		setupGZipOutput.call(this, type, data, headers, function (data, headers) {
			handler.response.writeHeader(status, headers);
			handler.response.end(data);

			handler.status = status;
			handler.logRequest();
		});
	});
};

Handler.prototype.respondBinary = function (type, data, headers) {
	var handler = this;

	headers = headers || {};
	headers['Content-Type'] = type;

	compileOutput.call(this, type, data, headers, function (data, headers) {
		setupGZipOutput.call(this, type, data, headers, function (data, headers) {
			handler.response.writeHeader(200, headers);
			handler.response.write(data, 'binary');
			handler.response.end();

			handler.status = 200;
			handler.logRequest();
		});
	});
};

Handler.prototype.respondJSON = function (data, headers) {
	var stringData = JSON.stringify(data);
	this.respond(200, 'application/json', stringData, headers);
};

Handler.prototype.respondRedirect = function (pathname, headers) {
	this.respond(301, 'text/plain', '', {
		'Location' : pathname + (this.query || '') + (this.hash || '')
	});
};

Handler.prototype.respond404 = function (headers) {
	//TODO: custom pages
	this.respond(404, 'text/plain', '404\n', headers);
};

Handler.prototype.respond500 = function (headers) {
	//TODO: custom pages
	headers = headers || {};

	if ( !headers['Cache-Control'] ) {
		headers['Cache-Control'] = 'no-cache';
	}

	this.respond(500, 'text/plain', '500\n', headers);
};

Handler.prototype.optionsRequest = function (methods, host, headers) {
	headers = headers || {};

	addCORSHeaders(headers, methods, host);

	this.respond(200, 'text/plain', '\n', headers);
};

Handler.prototype.pathRequest = function () {
	this.type = 'file';

	var pathname = this.pathname;

	if (pathname.substr(0, 2) === '/.') {
		this.respond404();
		return;
	}

	var fileName = path.join(ROOT_DIR, pathname);
	this.fileRequest(fileName);
};

Handler.prototype.fileRequest = function (fileName) {
	var handler = this;

	fs.stat(fileName, function (err, stats) {
		if (err) {
			handler.respond404();
			return;
		}

		if ( stats.isDirectory() ) {
			var pathname = handler.pathname;
			if (pathname[pathname.length - 1] !== '/') {
				handler.respondRedirect(pathname + '/');
			}
			else {
				handler.fileRequest(fileName + 'index.html');
			}
			return;
		}

		var fileMime = mime.lookup(fileName);

		fs.readFile(fileName, 'binary', function (err, file) {
			if (err) {
				handler.respond500();
				return;
			}

			handler.respondBinary(fileMime, file, {
				'Cache-Control' : CACHE_CONTROL
			});
		});
	});
};

Handler.prototype.manifestRequest = function () {
	this.type = 'manifest';

	var handler  = this,
		fileName = path.join(ROOT_DIR, this.pathname);

	fs.stat(fileName, function (err, stats) {
		if (err || !stats.isFile()) {
			handler.respond404();
			return;
		}

		fs.readFile(fileName, 'utf8', function (err, data) {
			if (err || !data) {
				handler.respond500();
				return;
			}

			var timestamp = DEBUG ? new Date() : startTimestamp;
			data += '\n# Zerver: updated at ' + timestamp + '\n';

			handler.respond(200, 'text/cache-manifest', data);
		});
	});
}

Handler.prototype.APIRequest = function () {
	this.type = 'api';

	var pathname = this.pathname.substr(API_URL_LENGTH + 1);

	if (pathname === '/') {
		this.APISchemeRequest();
		return;
	}

	var apiParts = pathname.substr(1).split('/');

	if (apiParts.length < 2) {
		this.respond500();
		return;
	}

	var apiName = apiParts[0],
		api     = apis.get(apiName);

	if ( !api ) {
		this.respond404();
		return;
	}

	apiParts.slice(1).forEach(function (apiPart) {
		if ( !api ) {
			return;
		}

		if (apiPart in api) {
			api = api[apiPart];
		}
		else {
			api = null;
		}
	});

	if (typeof api !== 'function') {
		this.respond500();
		return;
	}

	if (this.request.method === 'OPTIONS') {
		this.optionsRequest(['POST'], apis.getCORS(apiName));
		return;
	}

	if (this.request.method !== 'POST') {
		this.respond500();
		return;
	}

	var handler = this,
		rawData = '';

	this.request.on('data', function (chunk) {
		rawData += chunk.toString();
	});

	this.request.on('end', function () {
		var data, args;
		try {
			data = JSON.parse(rawData);
			args = data.args;
		}
		catch (err) {
			handler.respond500();
			return;
		}
		if ( !Array.isArray(args) ) {
			handler.respond500();
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
			handler.respondJSON(data, headers);
		}
		catch (err) {
			console.error(err);
			handler.respond500();
		}
	}
};

Handler.prototype.APISchemeRequest = function () {
	this.type = 'scheme';

	var scheme = apis.getScheme();

	this.respondJSON(scheme, {
		'Cache-Control' : 'no-cache'
	});
};

Handler.prototype.scriptRequest = function () {
	this.type = 'script';

	var match = API_SCRIPT_MATCH.exec(this.pathname);

	if ( !match ) {
		this.respond404();
		return;
	}

	var apiRoot = match[1],
		apiName = apiRoot;

	if (this.query) {
		var query = parseQueryString( this.query.substr(1) );

		if (query.name) {
			apiName = query.name;
		}
	}

	var file = apis.getScript(apiRoot, apiName, this.request.headers.host, API_URL);

	if ( !file ) {
		this.respond404();
		return;
	}

	this.respond(200, 'application/javascript', file, {
		'Cache-Control' : CACHE_CONTROL
	});
};

Handler.prototype.logRequest = function () {
	var logType   = 'ZERVER  ',
		status    = (this.status === 200) ? '' : '['+this.status+'] ',
		pathname  = this.pathname,
		timeParts = process.hrtime(this.time),
		timeMs    = (timeParts[0] * 1000 + timeParts[1] / 1000000) + '',
		time      = '[' + timeMs.substr(0, timeMs.indexOf('.')+3) + 'ms] ';

	switch (this.type) {
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
			pathname = pathname.substr(2 + API_URL_LENGTH).replace(/\//g, '.') + '()';
			break;
	}

	console.log(logType + ' : ' + time + status + pathname);
};

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
	exports.run(parseInt(process.argv[2]), process.argv[3], (process.argv[4]==='1'), (process.argv[5]==='1'), process.argv[6]);

	if (DEBUG && REFRESH) {
		setupAutoRefresh();
	}
}
