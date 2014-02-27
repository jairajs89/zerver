(function (window, refreshEnabled, loggingEnabled) {
	var WebSocket      = (window['MozWebSocket'] || window.WebSocket),
		match          = /\bAndroid (\d+(\.\d+)?)/.exec(window.navigator.userAgent),
		isAndroid      = !!match,
		androidVersion = match ? window.parseFloat(match[1]) : null;
	if (!WebSocket || (isAndroid && androidVersion < 4.4)) {
		if (refreshEnabled || loggingEnabled) {
			console.error('zerver debug mode requires websockets');
		}
		return;
	}

	var stream = createStream();
	if (refreshEnabled) {
		setupRefresh();
	}
	setupCLI();
	if (loggingEnabled) {
		// dont want to hijack logs unless necessary
		// stack traces get all shitty
		setupLogging();
	}



	/* API stream */

	function createStream() {
		var listeners = [],
			queue     = [],
			socket;
		afterReady(startIncomingStream);
		return {
			send      : sendMessage ,
			onMessage : bindToMessage
		};

		function onMessage(payload) {
			var data;
			try {
				data = JSON.parse(payload);
			} catch (err) {}
			if ( isObject(data) ) {
				for (var i=0, l=listeners.length; i<l; i++) {
					listeners[i](data);
				}
			}
		}

		function sendMessage(data) {
			if (socket) {
				socket.send( JSON.stringify(data) );
			} else {
				queue.push(data);
			}
		}

		function bindToMessage(func) {
			listeners.push(func);
		}

		function startIncomingStream(fails) {
			var timeout;
			if ( !fails ) {
				fails   = 0;
				timeout = 0;
			} else {
				timeout = Math.pow(2, Math.min(fails, 5)) * 1000;
			}

			setTimeout(function () {
				openSocket(function (s) {
					socket = s;
					var messages = queue.splice();
					queue = [];
					for (var i=0, l=messages.length; i<l; i++) {
						sendMessage(messages[i]);
					}
				}, onMessage, function (status) {
					socket = null;
					fails = status ? 0 : fails+1;
					startIncomingStream(fails);
				});
			}, timeout);
		}
	}

	function openSocket(onOpen, onMessage, onClose) {
		var done       = false,
			hadConnect = false,
			conn;

		try {
			conn = new WebSocket('ws://'+window.location.host+'/zerver/?_='+(+new Date()), 'zerver-debug');
		} catch (err) {
			setTimeout(finish, 0);
			return;
		}

		conn.onmessage = function (e) {
			if (done) {
				return;
			}

			hadConnect = true;
			onMessage(e.data);
		};

		conn.onopen = function () {
			conn.onopen = null;
			onOpen(conn);
		};
		conn.onerror = finish;
		conn.onclose = finish;

		function finish() {
			if (done) {
				return;
			}
			done = true;

			onClose(hadConnect);

			try {
				conn.close();
			} catch (err) {}
		}
	}



	/* Auto refresh */

	function setupRefresh() {
		var REFRESH_FUNC = 'ZERVER_REFRESH';
		if (typeof window[REFRESH_FUNC] !== 'function') {
			window[REFRESH_FUNC] = function () {
				window.location.reload();
			};
		}

		stream.onMessage(function (data) {
			if (data.type !== 'refresh') {
				return;
			}

			var refresher = window[REFRESH_FUNC];
			if (typeof refresher === 'function') {
				refresher();
			}
		});
	}



	/* Piped logging */

	function setupLogging() {
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

	function interceptLogs(logger, level) {
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

	function interceptExceptions() {
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

	function logMessage(level, message) {
		if (logMessage.lock) {
			return;
		}
		logMessage.lock = true;

		stream.send({
			type    : 'log'   ,
			level   : level   ,
			message : message
		});

		logMessage.lock = false;
	}



	/* Remote CLI */

	function setupCLI() {
		stream.onMessage(function (data) {
			if (data.type !== 'eval') {
				return;
			}

			var success, val, error;
			try {
				val     = new Function('return ' + data.line)();
				success = true;
				error   = undefined;
			} catch (err) {
				val     = undefined;
				success = false;
				error   = err + '';
			}

			var type, jsonVal;
			if (success) {
				if ( isObject(val) ) {
					try {
						jsonVal = JSON.stringify(val);
						if (typeof jsonVal === 'string') {
							type = 'json';
						}
					} catch (err) {}
				}
				if ( !type ) {
					jsonVal = val + '';
					type    = 'string';
				}
			}

			stream.send({
				type      : 'eval'  ,
				requestID : data.requestID ,
				error     : error   ,
				output    : jsonVal ,
				dataType  : type
			});
		});
	}



	/* Utils */

	function afterReady(func) {
		if (window.document.readyState === 'complete') {
			func();
		} else {
			window.addEventListener('load', function () {
				func();
			});
		}
	}

	function isObject(obj) {
		return ((typeof obj === 'object') && (obj !== null));
	}
})(window, window.ZERVER_REFRESH_ENABLED, window.ZERVER_LOGGING_ENABLED);
