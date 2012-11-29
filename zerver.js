/* Imports and static vars */

var cleanCSS = require('clean-css'),
	fs       = require('fs'  ),
	http     = require('http'),
	mime     = require('mime'),
	path     = require('path'),
	uglify   = require('uglify-js'),
	url      = require('url' ),
	zlib     = require('zlib');

var ROOT_DIR            = process.cwd(),
	GZIPPABLE           = {
		'application/json'       : true ,
		'application/javascript' : true ,
		'text/javascript'        : true ,
		'text/css'               : true ,
		'text/html'              : true ,
		'text/plain'             : true ,
		'text/cache-manifest'    : true
	},
	SLASH               = /\//g,
	CSS_IMAGE           = /url\([\'\"]?([^\)]+)[\'\"]?\)/g,
	MANIFEST_CONCAT     = /\s*\#\s*zerver\:(\S+)\s*/g,
	MANIFEST_FILE       = /\s*([^\s\#]+).*/g,
	MANIFEST_CONCAT_END = /\s*\#\s*\/zerver\s*/g,
	CONCAT_MATCH        = /\<\!\-\-\s*zerver\:(\S+)\s*\-\-\>((\s|\S)*?)\<\!\-\-\s*\/zerver\s*\-\-\>/g,
	SCRIPT_MATCH        = /\<script(?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s+src\=[\'\"]\s*([^\>]+)\s*[\'\"](?:\s+\w+\=[\'\"][^\>]+[\'\"])*\>\<\/script\>/g,
	STYLES_MATCH        = /\<link(?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s+href\=[\'\"]\s*([^\>]+)\s*[\'\"](?:\s+\w+\=[\'\"][^\>]+[\'\"])*\/?\>/g,
	CONCAT_FILES        = false,
	GZIP_ENABLED        = false,
	COMPILATION_ENABLED = false,
	INLINING_ENABLED    = false,
	CACHE_ENABLED       = false,
	HAS_MANIFEST        = false,
	PRODUCTION          = false,
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
	concatCache = {},
	app, apis, lastModTimestamp;



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
	PRODUCTION       = production;
	REFRESH          = refresh;
	API_SCRIPT_MATCH = new RegExp('\\/'+API_URL+'\\/([^\\/]+)\\.js');
	MANIFESTS        = {};

	if (REFRESH) {
		DEBUG = true;
	}

	if (!DEBUG && PRODUCTION) {
		GZIP_ENABLED        = true;
		COMPILATION_ENABLED = true;
		INLINING_ENABLED    = true;
		CACHE_ENABLED       = true;
		CONCAT_FILES        = true;
	}

	updateLastModifiedTime();

	if (manifests) {
		manifests.split(',').forEach(function (path) {
			if (!path[0] !== '/') {
				path = '/' + path;
			}

			MANIFESTS[path] = true;
			HAS_MANIFEST    = true;

			prefetchManifestFile(path);
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

function updateLastModifiedTime () {
	lastModTimestamp = getMaxLastModifiedTime(ROOT_DIR) || new Date();
}

function getMaxLastModifiedTime (file) {
	var stats;
	try {
		stats = fs.statSync(file);
	}
	catch (err) {
		console.error('unable to get last mod time for file ' + file);
		return;
	}

	if ( !stats.isDirectory() ) {
		return stats.mtime || undefined;
	}

	var dirListing;
	try {
		dirListing = fs.readdirSync(file);
	}
	catch (err) {
		console.error('unable to get last mod time for directory ' + file);
		return;
	}

	var maxModTime = 0;
	dirListing.forEach(function (child) {
		var modTime = getMaxLastModifiedTime( path.join(file, child) );
		if (modTime > maxModTime) {
			maxModTime = modTime;
		}
	});

	if ( !maxModTime ) {
		console.error('unable to get last mod time for directory ' + file);
		return;
	}

	return maxModTime;
}

function relativePath (path1, path2) {
	if (path2[0] === '/') {
		return path2;
	}

	var pathLength = path1.length;

	if (path1[path1-1] !== '/') {
		return path.resolve(path1, '../'+path2);
	}
	else {
		return path.resolve(path1, path2);
	}
}

function prefetchManifestFile (pathname, callback) {
	var fileName = path.join(ROOT_DIR, pathname);

	fs.stat(fileName, function (err, stats) {
		if (err || !stats.isFile()) {
			return;
		}

		fs.readFile(fileName, 'utf8', function (err, data) {
			if (err || !data) {
				return;
			}

			prepareManifestConcatFiles(data, pathname, function () {
				if (callback) {
					callback();
				}
			});
		});
	});
}

function handleRequest (request, response) {
	var urlParts = url.parse(request.url),
		handler  = {
			request  : request                      ,
			response : response                     ,
			pathname : decodeURI(urlParts.pathname) ,
			query    : urlParts.search              ,
			hash     : urlParts.hash                ,
			referrer : request.headers['referrer'] || request.headers['referer'] ,
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
	if (pathname in MANIFESTS) {
		manifestRequest(handler, pathname);
	}
	else if (pathname in concatCache) {
		concatRequest(handler, pathname);
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

function prepareConcatFiles (type, data, pathname, callback) {
	if (!CONCAT_FILES || DEBUG || (type !== 'text/html') || (typeof data !== 'string')) {
		callback(data);
		return;
	}

	data = data.replace(CONCAT_MATCH, function (original, concatPath, concatables) {
		var files        = [],
			aboslutePath = relativePath(pathname, concatPath),
			fileType, match;

		if ( !fileType ) {
			while (match=SCRIPT_MATCH.exec(concatables)) {
				fileType = 'js';
				files.push( relativePath(pathname, match[1]) );
			}
		}

		if ( !fileType ) {
			while (match=STYLES_MATCH.exec(concatables)) {
				fileType = 'css';
				files.push( relativePath(pathname, match[1]) );
			}
		}

		if ( !fileType ) {
			return original;
		}

		concatCache[aboslutePath] = files;

		switch (fileType) {
			case 'js':
				return '<script src="'+concatPath+'"></script>';

			case 'css':
				return '<link rel="stylesheet" href="'+concatPath+'">';

			default:
				delete concatCache[aboslutePath];
				return original;
		}
	});

	callback(data);
}

function prepareManifestConcatFiles (data, pathname, callback) {
	if (!CONCAT_FILES || DEBUG || (typeof data !== 'string')) {
		callback(data);
		return;
	}

	var lines = data.split('\n'),
		concatFile, concatIndex;

	for (var i=0,l=lines.length; i<l; i++) {
		var urlParts;
		try {
			urlParts = url.parse(lines[i].trim(), true);
		}
		catch (err) {}

		if (urlParts && urlParts.query.inline) {
			lines.splice(i, 1);
			i--;
			l--;
		}
		else if ( !concatFile ) {
			var match = MANIFEST_CONCAT.exec( lines[i] );

			if (match) {
				concatFile  = match[1];
				concatIndex = i;
			}
		}
		else if ( MANIFEST_CONCAT_END.test( lines[i] ) ) {
			var sectionLength = i-concatIndex+1,
				concatList    = lines.splice(concatIndex, sectionLength);
			concatList.shift();
			concatList.pop();
			i -= sectionLength;
			l -= sectionLength;

			lines.splice(i, 1, concatFile);
			i++;
			l++;

			concatCache[ relativePath(pathname, concatFile) ] = concatList;

			concatFile = null;
		}
	}

	data = lines.join('\n');

	callback(data);
}

function inlineImages (type, data, pathname, callback) {
	if (!INLINING_ENABLED || DEBUG || (type !== 'text/css') || (typeof data !== 'string')) {
		callback(data);
		return;
	}

	data = data.replace(CSS_IMAGE, function (original, relativeURL) {
		var urlParts;

		try {
			urlParts = url.parse(relativeURL, true);
		}
		catch (err) {
			return original;
		}

		if ( !urlParts.query.inline ) {
			return original;
		}


		var absoluteURL;

		try {
			absoluteURL = url.resolve(pathname, urlParts.pathname);
		}
		catch (err) {
			return original;
		}


		var fileName = path.join(ROOT_DIR, absoluteURL),
			fileData;

		try {
			fileData = fs.readFileSync(fileName).toString('base64');
		}
		catch (err) {
			return original;
		}


		var mimeType = mime.lookup(fileName),
			dataURL  = 'data:'+mimeType+';base64,'+fileData;

		return 'url(' + dataURL + ')';
	});

	callback(data);
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

	if (!noCache && CACHE_ENABLED && (type !== 'api') && (type !== 'scheme') && (status === 200) && !(pathname in memoryCache)) {
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

	prepareConcatFiles(type, data, handler.pathname, function (data) {
		inlineImages(type, data, handler.pathname, function (data) {
			compileOutput(type, data, function (data) {
				setupGZipOutput(type, data, headers, function (data, headers) {
					finishResponse(handler, status, headers, data, true);
				});
			});
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

function concatRequest (handler, pathname) {
	handler.type = 'file';

	var files = concatCache[pathname];

	if ( !files ) {
		respond404(handler);
		return;
	}

	var filesLeft = files.length,
		hasError  = false,
		file      = '';

	files.forEach(function (fileName) {
		if (hasError) {
			return;
		}

		try {
			var data = fs.readFileSync( path.join(ROOT_DIR, fileName) );
		}
		catch (err) {
			hasError = true;
			return;
		}

		file += data;
	});

	if (hasError) {
		respond404(handler);
	}
	else {
		respondBinary(handler, 200, mime.lookup(pathname), file, {
			'Cache-Control' : CACHE_CONTROL
		});
	}
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

			prepareManifestConcatFiles(data, pathname, function (data) {
				if (DEBUG) {
					updateLastModifiedTime();
				}

				data += '\n# Zerver: updated at ' + lastModTimestamp + '\n';

				respondBinary(handler, 200, 'text/cache-manifest', new Buffer(data), {});
			});
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
	if (PRODUCTION) {
		return;
	}

	var logType     = 'ZERVER  ',
		agent       = handler.request.headers['user-agent'],
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

	if (agent) {
		console.log('  ' + agent);
	}

	if (handler.referrer) {
		console.log('  referrer=' + handler.referrer);
	}

	console.log('');
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
