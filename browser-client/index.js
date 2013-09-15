(function (window) {
	var XHR_TIMEOUT        = 22000,
		ZERVER_INIT        = 'ZERVER_INIT',
		ZERVER_KILL_STREAM = 'ZERVER_KILL_STREAM',
		IS_ANDROID         = /\bAndroid\b/gi.test(navigator.userAgent);

	var apiRefresh    = {{__API_REFRESH__}},
		apiLogging    = {{__API_LOGGING__}},
		apiDir        = {{__API_DIR__}},
		apiName       = {{__API_NAME__}},
		apiRoot       = {{__API_ROOT__}},
		apiObj        = {{__API_OBJ__}},
		apiFunctions  = {{__API_FUNCTIONS__}},
		apiData       = {{__API_APIS__}},
		apis          = {},
		apiSocketPath = '/'+apiDir+'/_push/',
		apiSocket,
		apiSocketID   = generateStreamID(),
		hadFirstConnect = false,
		notReady      = [],
		isConnected;

	startReadyCheck();
	main();

	function main () {
		if (apiData) {
			setupRequire();
		}
		else if (apiObj) {
			setupSingleAPI();
		}

		if ( window[ZERVER_INIT] ) {
			return;
		}
		window[ZERVER_INIT] = true;

		if (apiRefresh) {
			setupAutoRefresh();
		}
		if (apiLogging) {
			setupLogging();
		}
	}

	function setupRequire () {
		for (var apiRoot in apiData) {
			apis[apiRoot] = setupFunctions(apiData[apiRoot][0], apiData[apiRoot][1], [ apiRoot ]);
		}

		window[apiName] = function (apiRoot) {
			if (apiRoot in apis) {
				return apis[apiRoot];
			}
			else {
				throw TypeError(apiRoot + ' is not a known Zerver API');
			}
		};
	}

	function setupSingleAPI () {
		window[apiName] = setupFunctions(apiObj, apiFunctions, [ apiRoot ]);
	}

	function setupFunctions (obj, functions, tree) {
		var value;

		for (var key in functions) {
			value = functions[key];

			if (value === true) {
				obj[key] = setupFunction(obj, key, tree);
			}
			else if ((typeof value === 'object') && (typeof obj[key] === 'object')) {
				obj[key] = setupFunctions(obj[key], value, tree.concat([ key ]));
			}
		}

		return obj;
	}

	function setupFunction (obj, key, tree) {
		return function () {
			var errorHandlers = [],
				defered       = {
					error : handleError
				};

			function handleError (handler) {
				if (typeof handler !== 'function') {
					throw TypeError('error handler must be a function, got ' + handler);
				}

				errorHandlers.push(handler);

				return defered;
			}

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

			apiCall(tree.concat(key), data, function (error, response) {
				if (error) {
					if (errorHandlers.length) {
						errorHandlers.forEach(function (handler) {
							try {
								handler.call(obj, error);
							}
							catch (err) {
								if (window.console && window.console.error) {
									window.console.error(err);
								}
							}
						});
					}
					else if (window.console && window.console.error) {
						window.console.error(error);
					}
					return;
				}

				callback.apply(obj, response);
			});

			return {
				error : handleError
			};
		};
	}

	function apiCall (tree, args, callback) {
		var url  = '/' + apiDir,
			data = JSON.stringify(args);

		for (var i=0, len=tree.length; i<len; i++) {
			url += '/' + encodeURIComponent( tree[i] );
		}

		ajaxPost(url, data, function (status, responseText) {
			var responseData, responseError;

			if (status === 200) {
				try {
					var response = JSON.parse(responseText);

					if (response.data) {
						responseData = response.data;
					}
					else {
						responseError = response.error;
					}
				}
				catch (err) {
					responseError = 'zerver failed to parse response';
				}
			}
			else {
				responseError = 'zerver http error, ' + status;
			}

			callback(responseError, responseData);
		});
	}

	function ajaxPost (url, data, callback) {
		var done = false,
			xhr;

		if (typeof XMLHttpRequest !== 'undefined') {
			xhr = new XMLHttpRequest();
		}
		else if (typeof ActiveXObject !== 'undefined') {
			xhr = new ActiveXObject('Microsoft.XMLHTTP');
		}
		else {
			throw Error('browser does not support ajax');
		}

		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4) {
				xhrComplete(xhr.status);
			}
		};

		var timeout = window['ZERVER_TIMEOUT'] || XHR_TIMEOUT;

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

			callback && callback(status, xhr.responseText);
		}
	}

	function setupSocket (handler) {
		if (Object.prototype.toString.call(apiSocket) == '[object Array]') {
			apiSocket.push(handler);
			return;
		}
		else if (apiSocket) {
			handler();
			return;
		}

		apiSocket = [ handler ];

		createAPISocket(function (socket) {
			var handlers = apiSocket.slice();
			apiSocket = socket;

			handlers.forEach(function (handler) {
				handler();
			});
		});
	}

	function createAPISocket (callback) {
		var listeners = [],
			socket    = {
				send : sendMessage ,
				on   : bindToMessage
			};

		startIncomingStream(function (payload) {
			var data;
			try {
				data = JSON.parse(payload);
			}
			catch (err) {}
			if ((typeof data !== 'object') || (data === null)) {
				return;
			}

			for (var i=0, l=listeners.length; i<l; i++) {
				listeners[i](data);
			}
		});

		callback(socket);

		function sendMessage (data) {
			if (hadFirstConnect && !isConnected) {
				return;
			}

			var url     = apiSocketPath+'message?id='+apiSocketID+'&_='+(+new Date()),
				payload = JSON.stringify(data);

			if (isConnected && (isConnected !== true)) {
				isConnected.send(payload);
			}
			else {
				ajaxPost(url, payload);
			}
		}

		function bindToMessage (messageType, func) {
			listeners.push(func);
		}
	}

	function startIncomingStream (handler, fails) {
		var timeout;
		if ( !fails ) {
			fails   = 0;
			timeout = 0;
		}
		else {
			timeout = Math.pow(2, Math.min(fails, 5)) * 1000;
		}

		setTimeout(function () {
			afterReady(performStreamOpen);
		}, timeout);

		function performStreamOpen () {
			openStream(handler, function (status) {
				if (status) {
					fails = 0;
				}
				else {
					fails += 1;
				}
				startIncomingStream(handler, fails);
			});
		}
	}

	function openWSStream (onMessage, onClose) {
		var done       = false,
			hasConnect = false,
			text       = '',
			lastIndex  = 0,
			conn;

		try {
			var wsCtor = window['MozWebSocket'] || window.WebSocket;
			conn = new wsCtor('ws://'+window.location.host+apiSocketPath+'stream?id='+apiSocketID+'&_='+(+new Date()), 'zerver-debug');
		}
		catch (err) {
			setTimeout(function () {
				finish(false);
			}, 0);
			return;
		}

		conn.onmessage = function (e) {
			if (done) {
				return;
			}

			hasConnect      = true;
			hadFirstConnect = true;
			isConnected     = conn;

			text += e.data;

			var currIndex = text.length;
			if (currIndex === lastIndex) {
				return;
			}

			var raw       = text.substring(lastIndex, currIndex),
				lastBreak = raw.lastIndexOf('\n');
			if (lastBreak === -1) {
				return;
			}

			raw = raw.substr(0, lastBreak);
			lastIndex += raw.length + 1;

			raw.split('\n').forEach(function (line) {
				if (line && (line[0] !== ';')) {
					onMessage(line);
				}
			});
		};

		conn.onerror = finish;
		conn.onclose = finish;

		function finish () {
			if (done) {
				return;
			}
			done = true;

			isConnected = false;
			onClose(hasConnect);

			try {
				conn.close();
			}
			catch (err) {}
		}
	}

	function openStream (onMessage, onClose) {
		if ((window['MozWebSocket'] || window.WebSocket) && !IS_ANDROID) {
			openWSStream(onMessage, onClose);
			return;
		}

		var dying      = false,
			done       = false,
			hasConnect = false,
			url        = apiSocketPath+'stream?id='+apiSocketID+'&_='+(+new Date()),
			xhr        = new XMLHttpRequest();

		xhr.onreadystatechange = function () {
			if ((xhr.readyState >= 3) && (xhr.status === 200)) {
				hasConnect      = true;
				hadFirstConnect = true;
				isConnected     = true;
			}
			if (xhr.readyState === 4) {
				xhrComplete(xhr.status);
			}
		};

		var timeout = 45 * 1000;

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

		var messageInterval = setInterval(checkForUpdates, 200),
			lastIndex       = 0;

		xhr.open('GET', url, true);
		xhr.send('');

		function checkForUpdates () {
			if (dying) {
				return;
			}

			var currIndex = xhr.responseText.length;

			if (currIndex === lastIndex) {
				return;
			}

			var raw       = xhr.responseText.substring(lastIndex, currIndex),
				lastBreak = raw.lastIndexOf('\n');

			if (lastBreak === -1) {
				return;
			}

			raw = raw.substr(0, lastBreak);
			lastIndex += raw.length + 1;

			raw.split('\n').forEach(function (line) {
				if (line && (line[0] !== ';')) {
					onMessage(line);
				}
			});
		}

		function xhrComplete (status) {
			if (done || dying) {
				return;
			}
			done = true;

			isConnected = false;

			clearInterval(messageInterval);
			checkForUpdates();
			onClose && onClose(hasConnect);
		}

		window[ZERVER_KILL_STREAM] = function () {
			if (dying) {
				return;
			}
			dying = true;

			try {
				xhr.abort();
			}
			catch (err) {}
		};
	}

	function generateStreamID () {
		return ('x'+Math.random()).replace(/\.|\-/g, '');
	}

	function setupAutoRefresh () {
		var REFRESH_FUNC = 'ZERVER_REFRESH';

		if (typeof window[REFRESH_FUNC] !== 'function') {
			window[REFRESH_FUNC] = function () {
				window.location.reload();
			};
		}

		setupSocket(function () {
			apiSocket.on('message', function (data) {
				if (data.type !== 'refresh') {
					return;
				}

				var refresher = window[REFRESH_FUNC];

				if (typeof refresher === 'function') {
					refresher();
				}
			});
		});
	}

	function setupLogging () {
		var logLock    = false,
			queuedLogs = [];

		setupSocket(function () {
			pipeLogs();
			setupCLI();
		});
		setupLoggers();

		function setupCLI () {
			apiSocket.on('message', function (data) {
				if (data.type !== 'eval') {
					return;
				}

				var success, val, error;
				try {
					val     = new Function('return ' + data.line)();
					success = true;
					error   = undefined;
				}
				catch (err) {
					val     = undefined;
					success = false;
					error   = err + '';
				}

				var type, jsonVal;
				if (success) {
					if ((val !== null) && (typeof val === 'object')) {
						try {
							jsonVal = JSON.stringify(val);
							if (typeof jsonVal === 'string') {
								type = 'json';
							}
						}
						catch (err) {}
					}
					if ( !type ) {
						jsonVal = val + '';
						type    = 'string';
					}
				}

				apiSocket.send({
					type      : 'eval'  ,
					requestID : data.requestID ,
					error     : error   ,
					output    : jsonVal ,
					dataType  : type
				});
			});
		}

		function onLog (level, message) {
			queuedLogs.push([level, message]);
		}

		function pipeLogs () {
			var logs   = queuedLogs.slice();
			queuedLogs = null;
			onLog      = pipeLog;

			logs.forEach(function (data) {
				pipeLog(data[0], data[1]);
			});
		}

		function pipeLog (level, message) {
			apiSocket.send({
				type    : 'log'   ,
				level   : level   ,
				message : message
			});
		}

		function logMessage (level, message) {
			if (logLock) {
				return;
			}
			logLock = true;

			if (onLog) {
				onLog(level, message);
			}

			logLock = false;
		}

		function setupLoggers () {
			var console = window.console;

			if (typeof console !== 'object') {
				console = {};
			}

			console.log   = interceptLogs(console.log  , 'log'  );
			console.warn  = interceptLogs(console.warn , 'warn' );
			console.error = interceptLogs(console.error, 'error');
			interceptExceptions();

			window.console = console;
		}

		function interceptLogs (logger, level) {
			switch (typeof logger) {
				case 'undefined':
					logger = function () {};
				case 'function':
					break;

				default:
					return logger;
			}

			return function () {
				var message = Array.prototype.map.call(
					arguments,
					function (log) {
						return log + '';
					}
				).join(' ');

				logMessage(level, message);

				logger.apply(this, arguments);
			};
		}

		function interceptExceptions () {
			if ( !window.addEventListener ) {
				return;
			}

			window.addEventListener('error', function (msg, fileName, lineNum) {
				var evt;
				if (msg && msg.message) {
					evt      = msg;
					msg      = evt.message;
					fileName = evt.fileName;
					lineNum  = evt.lineno;
				}

				var err = msg + '';
				if (fileName) {
					err += ' (' + fileName;
					if (lineNum) {
						err += ':' + lineNum;
					}
					err += ')';
				}
				logMessage('exception', err);
			}, false);
		}
	}

	function afterReady (func) {
		if (notReady) {
			notReady.push(func);
		}
		else {
			func();
		}
	}

	function startReadyCheck () {
		if (!window.addEventListener || (document.readyState === 'complete')) {
			flushReadyQueue();
		}
		else {
			window.addEventListener('load', flushReadyQueue, false);
		}
	}

	function flushReadyQueue () {
		window.removeEventListener('load', flushReadyQueue);

		if ( !notReady ) {
			return;
		}

		setTimeout(function () {
			var funcs = notReady.slice();
			notReady = false;

			funcs.forEach(function (func) {
				func();
			});
		}, 500);
	}
})(window);
