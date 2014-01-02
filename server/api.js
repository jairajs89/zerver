var extend = require('util')._extend,
	fs     = require('fs'  ),
	path   = require('path');

var SCRIPT_TEMPLATE = fs.readFileSync(__dirname+path.sep+'..'+path.sep+'browser-client'+path.sep+'index.js').toString(),
	INSERT_REFRESH   = '{{__API_REFRESH__}}',
	INSERT_LOGGING   = '{{__API_LOGGING__}}',
	INSERT_DIR       = '{{__API_DIR__}}',
	INSERT_NAME      = '{{__API_NAME__}}',
	INSERT_APIS      = '{{__API_APIS__}}',
	INSERT_API       = '{{__API_OBJ__}}',
	INSERT_FUNCTIONS = '{{__API_FUNCTIONS__}}';

module.exports = APICalls;



function APICalls(rootDir, pathname, options) {
	this._root       = rootDir;
	this._rootPath   = pathname;
	this._apis       = {};
	this._apiScripts = {};
	this._cors       = {};
	this._options    = extend({
		refresh: false,
		logging: false,
	}, options || {});

	var self         = this,
		templateData = {},
		apiNames;

	try {
		apiNames = fs.readdirSync(rootDir+pathname);
	} catch (err) {
		apiNames = [];
	}
	apiNames.forEach(function (fileName) {
		var len = fileName.length;
		if (fileName.substr(len-3) !== '.js') {
			return;
		}

		var apiName  = fileName.substr(0, len-3),
			fullName = path.join(rootDir+pathname, apiName);

		var api = require(fullName);
		self._apis[apiName] = api;

		var apiObj       = {},
			apiFunctions = {},
			file         = SCRIPT_TEMPLATE;

		if (typeof api._crossOrigin === 'string') {
			self._cors[apiName] = api._crossOrigin;
			delete api._crossOrigin;
		}

		setupAPIObj(api, apiObj, apiFunctions);
		templateData[apiName] = [apiObj, apiFunctions];

		file = file.replace(INSERT_DIR      , JSON.stringify(self._rootPath));
		file = file.replace(INSERT_NAME     , JSON.stringify(apiName)      );
		file = file.replace(INSERT_API      , JSON.stringify(apiObj)       );
		file = file.replace(INSERT_FUNCTIONS, JSON.stringify(apiFunctions) );
		file = file.replace(INSERT_APIS     , JSON.stringify(null)         );
		file = file.replace(INSERT_REFRESH  , JSON.stringify(!!self._options.refresh));
		file = file.replace(INSERT_LOGGING  , JSON.stringify(!!self._options.logging));

		self._apiScripts[apiName] = file;
	});

	this._requireScript = SCRIPT_TEMPLATE;
	this._requireScript = this._requireScript.replace(INSERT_DIR      , JSON.stringify(this._rootPath));
	this._requireScript = this._requireScript.replace(INSERT_NAME     , JSON.stringify('require')     );
	this._requireScript = this._requireScript.replace(INSERT_API      , JSON.stringify(null)          );
	this._requireScript = this._requireScript.replace(INSERT_FUNCTIONS, JSON.stringify(null)          );
	this._requireScript = this._requireScript.replace(INSERT_APIS     , JSON.stringify(templateData)  );
	this._requireScript = this._requireScript.replace(INSERT_REFRESH  , JSON.stringify(!!this._options.refresh));
	this._requireScript = this._requireScript.replace(INSERT_LOGGING  , JSON.stringify(!!this._options.logging));
}



APICalls.prototype.get = function (pathname, req, callback) {
	if (pathname.substr(0, this._rootPath.length+1) !== this._rootPath+'/') {
		callback(404, { 'Cache-Control': 'text/plain' }, '404');
		return;
	}

	var apiParts = pathname.substr(this._rootPath.length+1).split('/'),
		apiName;

	if (apiParts.length === 1) {
		apiName = apiParts[0].substr(0, apiParts[0].length-3);
		if (apiParts[0].substr(-3) !== '.js') {
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

APICalls.prototype._apiScript = function (apiName, callback) {
	var script;
	if (script === 'require') {
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
	var self      = this,
		customAPI = !!func.type,
		method    = (func.type || 'POST').toUpperCase(),
		cors;
	if (apiName in self._cors) {
		if (typeof self._cors[apiName] === 'string') {
			cors = self._cors[apiName];
		} else {
			cors = self._cors[apiName].join(', ');
		}
	}

	if ((req.method === 'OPTIONS') && cors) {
		callback(200, {
			'Access-Control-Allow-Headers' : 'Content-Type',
			'Access-Control-Allow-Origin'  : cors,
			'Access-Control-Allow-Methods' : method,
			'Cache-Control'                : 'public, max-age='+(60*60*6),
		}, '');
		return;
	}

	if (method !== req.method) {
		callback(415, { 'Cache-Control': 'text/plain' }, '415');
		return;
	}

	var body = '';
	req.on('data', function (chunk) {
		body += chunk;
	});
	req.on('end', function () {
		if (customAPI) {
			self._customApiCall(req, func, body, finish);
		} else {
			self._zerverApiCall(req, func, body, finish);
		}
	});

	function finish(status, headers, body) {
		if (cors) {
			headers['Access-Control-Allow-Headers'] = 'Content-Type';
			headers['Access-Control-Allow-Origin' ] = cors;
		}
		callback(status, headers, body);
	}
};

APICalls.prototype._zerverApiCall = function (parent, func, body, finish) {
	var called = false,
		data, args;
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
		val = func.apply(parent, args);
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

APICalls.prototype._customApiCall = function (parent, func, body, finish) {
	//TODO
	finish(503, {
		'Content-Type' : 'text/plain',
		'Cache-Control': 'no-cache',
	}, 'not implemented');
};



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
