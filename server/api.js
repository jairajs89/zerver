var extend  = require('util')._extend,
	fs      = require('fs'),
	path    = require('path'),
	qs      = require('querystring'),
	urllib  = require('url'),
	uglify  = require('uglify-js'),
	Cookies = require(__dirname+path.sep+'lib'+path.sep+'cookies');

require('coffee-script/register');

module.exports = APICalls;

APICalls.CLIENT_API       = __dirname+path.sep+'..'+path.sep+'client'+path.sep+'api.js';
APICalls.CLIENT_REQUIRE   = __dirname+path.sep+'..'+path.sep+'client'+path.sep+'require.js';
APICalls.CLIENT_DEBUG     = __dirname+path.sep+'..'+path.sep+'client'+path.sep+'debug.js';
APICalls.INSERT_REFRESH   = '{{__API_REFRESH__}}';
APICalls.INSERT_LOGGING   = '{{__API_LOGGING__}}';
APICalls.INSERT_DIR       = '{{__API_DIR__}}';
APICalls.INSERT_NAME      = '{{__API_NAME__}}';
APICalls.INSERT_APIS      = '{{__API_APIS__}}';
APICalls.INSERT_API       = '{{__API_OBJ__}}';
APICalls.INSERT_FUNCTIONS = '{{__API_FUNCTIONS__}}';



function APICalls(options) {
	this._options    = extend({}, options || {});
	this._root       = this._options.dir;
	this._rootPath   = this._options.apis;
	this._apis       = {};
	this._apiScripts = {};
	this._cors       = {};

	var self           = this,
		templateData   = {},
		scriptAPI      = fs.readFileSync(APICalls.CLIENT_API).toString(),
		scriptRequire  = scriptAPI+fs.readFileSync(APICalls.CLIENT_REQUIRE).toString(),
		scriptDebug    = fs.readFileSync(APICalls.CLIENT_DEBUG).toString(),
		apiNames;

	try {
		apiNames = fs.readdirSync(self._root+self._rootPath);
	} catch (err) {
		apiNames = [];
	}
	apiNames.forEach(function (fileName) {
		var apiName = getApiName(fileName);
		if ( !apiName ) {
			return;
		}

		var fullName = path.join(self._root+self._rootPath, apiName);

		var api = require(fullName);
		self._apis[apiName] = api;

		var apiObj       = {},
			apiFunctions = {},
			file         = scriptRequire;

		if (typeof api._crossOrigin === 'string') {
			self._cors[apiName] = api._crossOrigin;
			delete api._crossOrigin;
		}

		setupAPIObj(api, apiObj, apiFunctions);
		templateData[apiName] = [apiObj, apiFunctions];

		file = file.replace(APICalls.INSERT_DIR      , JSON.stringify(self._rootPath));
		file = file.replace(APICalls.INSERT_NAME     , JSON.stringify(apiName)      );
		file = file.replace(APICalls.INSERT_API      , JSON.stringify(apiObj)       );
		file = file.replace(APICalls.INSERT_FUNCTIONS, JSON.stringify(apiFunctions) );
		file = file.replace(APICalls.INSERT_APIS     , JSON.stringify(null)         );
		file = file.replace(APICalls.INSERT_REFRESH  , JSON.stringify(self._options.refresh));
		file = file.replace(APICalls.INSERT_LOGGING  , JSON.stringify(self._options.logging));

		if (self._options.production) {
			try {
				var ast = uglify.parser.parse(file);
				ast     = uglify.uglify.ast_mangle(ast);
				ast     = uglify.uglify.ast_squeeze(ast);
				file    = uglify.uglify.gen_code(ast);
			} catch (err) {}
		} else {
			file += scriptDebug;
		}

		self._apiScripts[apiName] = file;
	});

	this._requireScript = scriptRequire;
	this._requireScript = this._requireScript.replace(APICalls.INSERT_DIR      , JSON.stringify(this._rootPath));
	this._requireScript = this._requireScript.replace(APICalls.INSERT_NAME     , JSON.stringify(null)          );
	this._requireScript = this._requireScript.replace(APICalls.INSERT_API      , JSON.stringify(null)          );
	this._requireScript = this._requireScript.replace(APICalls.INSERT_FUNCTIONS, JSON.stringify(null)          );
	this._requireScript = this._requireScript.replace(APICalls.INSERT_APIS     , JSON.stringify(templateData)  );
	this._requireScript = this._requireScript.replace(APICalls.INSERT_REFRESH  , JSON.stringify(this._options.refresh));
	this._requireScript = this._requireScript.replace(APICalls.INSERT_LOGGING  , JSON.stringify(this._options.logging));
	if (this._options.production) {
		try {
			var ast             = uglify.parser.parse(this._requireScript);
			ast                 = uglify.uglify.ast_mangle(ast);
			ast                 = uglify.uglify.ast_squeeze(ast);
			this._requireScript = uglify.uglify.gen_code(ast);
		} catch (err) {}
	} else {
		this._requireScript += scriptDebug;
	}
}



APICalls.prototype.get = function (pathname, req, callback) {
	if (pathname.substr(0, this._rootPath.length+1) !== this._rootPath+'/') {
		callback();
		return;
	}

	var apiParts = pathname.substr(this._rootPath.length+1).split('/'),
		apiName;

	if (apiParts.length === 1) {
		apiName = getApiName(apiParts[0]);
		if ( !apiName ) {
			callback(404, { 'Cache-Control': 'text/plain' }, '404');
		} else {
			this._apiScript(apiName, callback);
		}
		return;
	}

	var func = this._apis[ apiParts[0] ];
	try {
		for (var i=1, l=apiParts.length; i<l; i++) {
			func = func[ apiParts[i] ];
		}
	} catch (err) {
		func = null;
	}
	if (typeof func !== 'function') {
		callback(404, { 'Cache-Control': 'text/plain' }, '404');
		return;
	}

	this._apiCall(apiParts[0], req, func, callback);
};

APICalls.prototype.getNames = function () {
	return Object.keys(this._apis);
};

APICalls.prototype._apiScript = function (apiName, callback) {
	var script;
	if (apiName === 'require') {
		script = this._requireScript;
	} else {
		script = this._apiScripts[apiName];
	}
	if ( !script ) {
		callback(404, { 'Cache-Control': 'text/plain' }, '404');
	} else {
		callback(200, {
			'Content-Type'  : 'application/javascript',
			'Cache-Control' : 'no-cache',
		}, script);
	}
};

APICalls.prototype._apiCall = function (apiName, req, func, callback) {
	var customAPI = false,
		cors;

	if (typeof func.type === 'string') {
		customAPI = [func.type];
	} else if ( Array.isArray(func.type) ) {
		customAPI = func.type.slice();
	}
	if (customAPI) {
		customAPI = customAPI.filter(function (type) {
			return (typeof type === 'string');
		}).map(function (type) {
			return type.toUpperCase();
		});
	}

	if (apiName in this._cors) {
		if (typeof this._cors[apiName] === 'string') {
			cors = this._cors[apiName];
		} else {
			cors = this._cors[apiName].join(', ');
		}
	}
	if ((req.method === 'OPTIONS') && cors) {
		var maxAge = 60*60*6;
		callback(200, {
			'Access-Control-Allow-Headers' : 'Content-Type',
			'Access-Control-Allow-Origin'  : cors,
			'Access-Control-Allow-Methods' : customAPI ? customAPI.join(', ') : 'POST',
			'Access-Control-Max-Age'       : maxAge,
			'Cache-Control'                : 'public, max-age='+maxAge,
		}, '');
		return;
	}

	if ((customAPI || ['POST']).indexOf(req.method) === -1) {
		callback(415, { 'Cache-Control': 'text/plain' }, '415');
		return;
	}

	req.ip        = getClientHost(req);
	req.protocol  = getClientProtocol(req);
	req.host      = req.headers['host']
	req.pathname  = req.url.split('?')[0];
	req.query     = urllib.parse(req.url, true).query;
	req.params    = extend({}, req.query);
	req.referrer  = (req.headers['referrer'] || req.headers['referer']);
	req.userAgent = req.headers['user-agent'];
	req.cookies   = new Cookies(req);

	if (customAPI) {
		this._customApiCall(req, func, finish);
	} else {
		this._zerverApiCall(req, func, finish);
	}

	function finish(status, headers, body) {
		req.cookies.setHeaders(headers);
		if (cors) {
			headers['Access-Control-Allow-Headers'] = 'Content-Type';
			headers['Access-Control-Allow-Origin' ] = cors;
		}
		callback(status, headers, body);
	}
};

APICalls.prototype._zerverApiCall = function (req, func, finish) {
	var called = false;

	getRequestBody(req, function (body) {
		var data, args;
		try {
			data = JSON.parse(body);
			args = data.args;
		} catch (err) {}
		if ( !Array.isArray(args) ) {
			finish(400, { 'Cache-Control': 'text/plain' }, '400');
			return;
		}

		if ( !data.noResponse ) {
			args.push(successCallback);
		}

		var val;
		try {
			val = func.apply(req, args);
		} catch (err) {
			console.error(err && (err.stack || err.message));
			errorCallback(err);
			return;
		}

		if (data.noResponse) {
			successCallback();
		} else if (typeof val !== 'undefined') {
			successCallback(val);
		}
	});

	function successCallback() {
		respond({ data: Array.prototype.slice.call(arguments) });
	}

	function errorCallback(error) {
		respond({ error: error+'' });
	}

	function respond(response) {
		if (called) {
			return;
		}
		called = true;

		var stringResponse;
		try {
			stringResponse = JSON.stringify(response);
		} catch (err) {
			console.error(err);
			finish(500, { 'Cache-Control': 'text/plain' }, '500');
			return;
		}

		finish(200, {
			'Content-Type' : 'application/json',
			'Cache-Control': 'no-cache',
		}, stringResponse);
	}
};

APICalls.prototype._customApiCall = function (req, func, finish) {
	var called = false;

	if (['POST', 'PUT'].indexOf(req.method) !== -1) {
		getRequestBody(req, callAPI);
	} else {
		callAPI('');
	}

	function callAPI(body) {
		req.body = body;
		try {
			req.jsonBody = JSON.parse(body);
			extend(req.params, req.jsonBody);
		} catch (err) {}
		if ((typeof req.jsonBody !== 'object') || (req.jsonBody === null)) {
			req.jsonBody = {};
		}
		if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
			req.formBody = qs.parse(req.body);
			extend(req.params, req.formBody);
		}

		var val;
		try {
			val = func.call(req, req.params, respond);
		} catch (err) {
			console.error(err && (err.stack || err.message));
			respondError();
			return;
		}

		if (typeof val !== 'undefined') {
			respond(val);
		}
	}

	function respond(status, headers, body) {
		if (called) {
			return;
		}
		called = true;

		switch (arguments.length) {
			case 0:
				body    = '';
				headers = {};
				status  = 200;
				break;
			case 1:
				body    = arguments[0];
				headers = {};
				status  = 200;
				break;
			case 2:
				body = arguments[1];
				if (typeof arguments[0] === 'number') {
					status  = arguments[0];
					headers = {};
				} else {
					headers = arguments[0];
					status  = 200;
				}
				break;
		}

		if (typeof status !== 'number') {
			console.error('response status must be a number, got ' + status);
			respondError();
			return;
		}
		if ((typeof headers !== 'object') || (headers === null)) {
			console.error('response headers must be an object, got ' + headers);
			respondError();
			return;
		}
		if ( !body ) {
			body = '';
		}
		switch (typeof body) {
			case 'object':
				if ( !Buffer.isBuffer(body) ) {
					try {
						body = JSON.stringify(body);
					} catch (err) {
						console.error('response body was not valid JSON');
						console.error(err && (err.stack || err.message));
						respondError();
						return;
					}
					var index = Object.keys(headers).map(function (key) {
						return key.toLowerCase();
					}).indexOf('content-type');
					if (index === -1) {
						headers['Content-Type'] = 'application/json';
					}
				}
				break;
			case 'string':
				break;
			default:
				console.error('response body must be a string or JSON object, got ' + body);
				respondError();
				return;
		}

		finish(status, headers, body);
	}

	function respondError() {
		called = true;
		finish(500, { 'Content-Type': 'text/plain' }, '500');
	}
};



function getApiName(pathname) {
	var parts = pathname.split('/').pop().split('.'),
			ext   = parts.length > 1 ? parts.pop() : null;
	if (['js', 'coffee'].indexOf(ext) !== -1)  {
		return parts.join('.');
	} else {
		return null;
	}
}

function setupAPIObj(api, obj, functions) {
	var value;
	for (var key in api) {
		value = api[key];
		switch (typeof value) {
			case 'function':
				if ((typeof value.type !== 'string') || (value.type.toLowerCase() !== 'get')) {
					functions[key] = true;
				}
				break;

			case 'object':
				if ( Array.isArray(value) ) {
					obj[key] = value;
				} else {
					obj[key] = {};
					functions[key] = {};
					setupAPIObj(value, obj[key], functions[key]);
				}
				break;

			default:
				obj[key] = value;
				break;
		}
	}
}

function getRequestBody(req, callback) {
	var body = '';
	req.on('data', function (chunk) {
		body += chunk;
	});
	req.on('end', function () {
		callback(body);
	});
}

function getClientHost(req) {
	var host = req.headers['x-forwarded-for'];
	if (host) {
		return host.split(',')[0];
	} else {
		return req.connection.remoteAddress;
	}
}

function getClientProtocol(req) {
	var proto = req.headers['x-forwarded-proto'];
	if (proto) {
		return proto.split(',')[0];
	} else {
		return 'http';
	}
}
