//TODO: remove dependency on JSON

(function (window) {
	var API_DIR = 'zerver';

	var apiName      = {{__API_NAME__}},
		apiObj       = {{__API_OBJ__}},
		apiFunctions = {{__API_FUNCTIONS__}};

	window[apiName] = setupFunctions(apiObj, apiFunctions, [ apiName ]);

	function setupFunctions (obj, functions, tree) {
		var value;

		for (var key in functions) {
			value = functions[key];

			if (value === true) {
				obj[key] = function (key) {
					return function () {
						var args     = Array.prototype.slice.call(arguments),
							numArgs  = args.length,
							callback = args[numArgs - 1];

						if (typeof callback === 'function') {
							args.pop();
						}
						else {
							callback = function () {};
						}

						apiCall(tree.concat(key), args, callback);
					};
				}(key);
			}

			else if ((typeof value === 'object') && (typeof obj[key] === 'object')) {
				obj[key] = setupFunctions(obj[key], value, tree.concat([ key ]));
			}
		}

		return obj;
	}

	function apiCall (tree, args, callback) {
		var url  = '/' + API_DIR,
			data = JSON.stringify(args),
			done = false,
			xhr;

		for (var i=0, len=tree.length; i<len; i++) {
			url += '/' + encodeURIComponent( tree[i] );
		}

		if (window.XMLHttpRequest) {
			xhr = new XMLHttpRequest();
		}
		else {
			xhr = new ActiveXObject('Microsoft.XMLHTTP');
		}

		xhr.open('POST', url, true);
		xhr.send(data);

		xhr.onreadystatechange = function () {
			if (done || (xhr.readyState !== 4)) {
				return;
			}
			done = true;

			var data = [],
				errorType, errorString;

			if (xhr.status === 200) {
				try {
					var response = JSON.parse(xhr.responseText);

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
				errorString = 'http error, ' + xhr.status;
			}

			var context = {
				error       : !!errorType ,
				errorType   : errorType   ,
				errorString : errorString
			};

			callback.apply(context, data);
		};
	}
})(window);
