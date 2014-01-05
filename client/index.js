(function (window) {
	var XHR_TIMEOUT = 30*1000;

	window.ZERVER_REFRESH_ENABLED = {{__API_REFRESH__}};
	window.ZERVER_LOGGING_ENABLED = {{__API_LOGGING__}};

	var apiDir       = {{__API_DIR__}},
		apiName      = {{__API_NAME__}},
		apiObj       = {{__API_OBJ__}},
		apiFunctions = {{__API_FUNCTIONS__}},
		apiData      = {{__API_APIS__}},
		apis         = {};

	if (apiData) {
		setupRequire();
	} else if (apiObj) {
		setupSingleAPI();
	}



	function setupRequire() {
		for (var apiName in apiData) {
			apis[apiName] = setupFunctions(apiData[apiName][0], apiData[apiName][1], [ apiName ]);
		}
		window.require = function (apiName) {
			if (apiName in apis) {
				return apis[apiName];
			} else {
				throw TypeError(apiName + ' is not a known Zerver API');
			}
		};
	}

	function setupSingleAPI() {
		window[apiName] = setupFunctions(apiObj, apiFunctions, [ apiName ]);
	}

	function setupFunctions(obj, functions, tree) {
		var value;
		for (var key in functions) {
			value = functions[key];
			if (value === true) {
				obj[key] = setupFunction(obj, key, tree);
			} else if ((typeof value === 'object') && (typeof obj[key] === 'object')) {
				obj[key] = setupFunctions(obj[key], value, tree.concat([ key ]));
			}
		}
		return obj;
	}

	function setupFunction(obj, key, tree) {
		return function () {
			var deferred = createDeferred(),
				data     = {},
				args     = Array.prototype.slice.call(arguments),
				numArgs  = args.length,
				callback = args[numArgs-1];

			if (typeof callback === 'function') {
				args.pop();
			} else {
				data.noResponse = true;
				callback = function () {};
			}
			data.args = args;

			apiCall(tree.concat(key), data, function (error, response) {
				if (error) {
					var errorHandlers = deferred.getErrors();
					if (errorHandlers.length) {
						for (var i=0, l=errorHandlers.length; i<l; i++) {
							try {
								errorHandlers[i].call(obj, error);
							} catch (err) {
								if (window.console && window.console.error) {
									window.console.error(err);
								}
							}
						}
					} else if (window.console && window.console.error) {
						window.console.error(error);
					}
				} else {
					callback.apply(obj, response);
				}
			});

			return deferred;
		};
	}

	function createDeferred() {
		var errorHandlers = [],
			deferred      = {
				error     : handleError,
				getErrors : getErrors
			};

		function handleError(handler) {
			if (typeof handler !== 'function') {
				throw TypeError('error handler must be a function, got ' + handler);
			}
			errorHandlers.push(handler);
			return deferred;
		}

		function getErrors() {
			return errorHandlers.slice();
		}

		return deferred;
	}

	function apiCall(tree, args, callback) {
		var url  = apiDir,
			data = JSON.stringify(args);
		for (var i=0, l=tree.length; i<l; i++) {
			url += '/'+encodeURIComponent(tree[i]);
		}

		ajaxPost(url, data, function (status, responseText) {
			var response, responseData, responseError;
			if (status === 200) {
				try {
					response = JSON.parse(responseText);
					if (response.error) {
						responseError = response.error;
					} else {
						responseData = response.data;
					}
				} catch (err) {
					responseError = 'zerver failed to parse response';
				}
			} else {
				responseError = 'zerver http error, ' + status;
			}
			callback(responseError, responseData);
		});
	}

	function ajaxPost(url, data, callback) {
		var done = false,
			xhr;

		if (typeof XMLHttpRequest !== 'undefined') {
			xhr = new XMLHttpRequest();
		} else if (typeof ActiveXObject !== 'undefined') {
			xhr = new ActiveXObject('Microsoft.XMLHTTP');
		} else {
			throw Error('browser does not support ajax');
		}

		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4) {
				xhrComplete(xhr.status);
			}
		};

		var timeout = parseInt(window['ZERVER_TIMEOUT']) || XHR_TIMEOUT;
		xhr.timeout = timeout;
		xhr.ontimeout = function () {
			xhrComplete(0);
		};

		setTimeout(function () {
			if ( !done ) {
				xhr.abort();
				xhrComplete(0);
			}
		}, timeout);

		xhr.open('POST', url, true);
		xhr.send(data);

		function xhrComplete (status) {
			if (done) {
				return;
			}
			done = true;

			if (callback) {
				callback(status, xhr.responseText);
			}
		}
	}
})(window);
