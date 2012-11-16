exports.middleware = createMiddlewareClient;
exports.get        = createRemoteZerver;



var urllib   = require('url'),
	http     = require('http'),
	zerver   = require(__dirname + '/zerver'),
	globalServer;

function createMiddlewareClient (apiDir, apiURL) {
	switch (typeof apiDir) {
		case 'undefined':
			apiDir = 'zerver';
			break;

		case 'string':
			break;

		default:
			throw TypeError('zerver directory must be a string, got ' + apiDir);
	}

	switch (typeof apiURL) {
		case 'undefined':
			apiURL = apiDir;
			break;

		case 'string':
			break;

		default:
			throw TypeError('zerver url must be a string, got ' + apiURL);
	}

	return zerver.middleware(apiDir, apiURL);
}

function createRemoteZerver (url, callback) {
	if (typeof url !== 'string') {
		throw TypeError('remote server url must be a string, got ' + url);
	}

	if (typeof callback !== 'function') {
		throw TypeError('callback must be a function, got ' + callback);
	}

	getAPIData(url, function (apiData) {
		var api = createAPIObject(url, apiData);
		callback(api);
	});
}

function getURLParts (url) {
	var parts = urllib.parse(url),
		port  = parts.port,
		host  = parts.hostname,
		path  = parts.pathname;

	if ( !port ) {
		switch (parts.protocol) {
			case 'http:':
				port = 80;
				break;

			case 'https:':
				port = 443;
				break;

			default:
				throw TypeError('url protocol must be http(s), got ' + parts.protocol);
		}
	}

	if (typeof host !== 'string') {
		throw TypeError('url host must be defined');
	}

	if (typeof path !== 'string') {
		throw TypeError('url path must be defined');
	}

	return {
		host     : host ,
		port     : port ,
		path     : path ,
		protocol : parts.protocol
	};
}

function getAPIData (url, callback) {
	var parts = getURLParts(url);

	http.get(
		parts,
		function (res) {
			var data = '';

			res.on('data', function (chunk) {
				data += chunk;
			});

			res.on('end', function () {
				var apiData;

				try {
					apiData = JSON.parse(data);
				}
				catch (err) {
					respond();
					return;
				}

				respond(apiData);
			});
		}
	).on('error', function (e) {
		respond();
	});

	function respond (data) {
		var cb = callback;
		callback = function () {};
		cb(data);
	}
}

function createAPIObject (url, apiData) {
	if ( !apiData ) {
		return;
	}

	var apis = {};

	for (var apiRoot in apiData) {
		apis[apiRoot] = setupFunctions(url, apiData[apiRoot][0], apiData[apiRoot][1], [ apiRoot ]);
	}

	return apis;
}

function setupFunctions (url, obj, functions, tree) {
	var value;

	for (var key in functions) {
		value = functions[key];

		if (value === true) {
			obj[key] = function (key) {
				return function () {
					var data     = {},
						args     = Array.prototype.slice.call(arguments),
						numArgs  = args.length,
						callback = args[numArgs - 1];

					if (typeof callback === 'function') {
						args.pop();
					}
					else {
						data.noResponse = true;
						callback = function () {};
					}

					data.args = args;

					apiCall(url, tree.concat(key), data, callback);
				};
			}(key);
		}

		else if ((typeof value === 'object') && (typeof obj[key] === 'object')) {
			obj[key] = setupFunctions(url, obj[key], value, tree.concat([ key ]));
		}
	}

	return obj;
}

function apiCall (url, tree, args, callback) {
	var done  = false,
		parts = getURLParts(url),
		data  = JSON.stringify(args);

	for (var i=0, len=tree.length; i<len; i++) {
		parts.path += (i ? '/' : '') + encodeURIComponent( tree[i] );
	}

	parts.method = 'POST';

	var req = http.request(
		parts,
		function (res) {
			var data = '';

			res.on('data', function (chunk) {
				data += chunk;
			});

			res.on('end', function () {
				httpResponse(res.statusCode, data);
			});
		}
	);

	req.on('error', function (e) {
		httpResponse(0);
	});

	req.write(data + '\n');
	req.end();

	function httpResponse (status, response) {
		if (done) {
			return;
		}
		done = true;

		var data = [],
			errorType, errorString;

		if (status === 200) {
			try {
				response = JSON.parse(response);

				if (response.data) {
					data = response.data;
				}
				else {
					errorType = 'library';
					errorString = response.error;
				}
			}
			catch (err) {
				errorType = 'zerver';
				errorString = 'failed to parse response';
			}
		}
		else {
			errorType = 'zerver';
			errorString = 'http error, ' + status;
		}

		var context = {
			error       : !!errorType ,
			errorType   : errorType   ,
			errorString : errorString
		};

		callback.apply(context, data);
	}
}
