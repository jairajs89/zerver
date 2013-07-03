var EventEmitter = require('events').EventEmitter;

var API_URL, REFRESH,
	DEBUG_PREFIX,
	FORCE_FLUSH;

var enabled = false,
	streams = new EventEmitter();
streams.list = {};

FORCE_FLUSH = '';
for (var i=0; i<128; i++) {
	FORCE_FLUSH += ';';
}
FORCE_FLUSH += '\n';

exports.setup  = setupDebugMode;
exports.handle = handleRequest;



function setupDebugMode (apiURL, refresh) {
	if (enabled) {
		return;
	}
	enabled = true;

	API_URL = apiURL;
	REFRESH = refresh;

	DEBUG_PREFIX = '/' + API_URL + '/_push/';

	setupAutoRefresh();
	setupLogging();
}

function setupAutoRefresh () {
	process.on('message', function (data) {
		if (data && data.debugRefresh) {
			for (var streamID in streams.list) {
				streams.list[streamID].send({ type : 'refresh' });
			}
		}
	});
}

function setupLogging () {
	streams.on('connection', function (stream) {
		stream.on('message', function (data) {
			if (data.type === 'log') {
				try {
					process.send({ log: (data.level+': '+data.message) });
				}
				catch (err) {}
			}
		});
	});

	process.on('message', function (data) {
		if (!data || !data.cli) {
			return;
		}

		var stream = getSingleStream();

		if ( !stream ) {
			console.warn('(no browsers available)');
			try {
				process.send({ prompt: true });
			}
			catch (err) {}
			return;
		}

		var requestID = 'x'+Math.random();

		stream.send({
			type      : 'eval'    ,
			line      : data.cli  ,
			requestID : requestID
		});

		stream.on('message', handleMessage);

		var timeout = setTimeout(function () {
			stream.removeListener('message', handleMessage);
			finish();
		}, 10 * 1000);

		function handleMessage (data) {
			if ((data.type !== 'eval') || (data.requestID !== requestID)) {
				return;
			}

			stream.removeListener('message', handleMessage);
			clearTimeout(timeout);

			if (data.dataType === 'string') {
				console.log(data.output);
			}
			else if (data.dataType === 'json') {
				try {
					console.log( JSON.parse(data.output) );
				}
				catch (err) {
					console.error('(zerver cli error)');
				}
			}
			else {
				console.error(data.error);
			}

			finish();
		}

		function finish () {
			try {
				process.send({ prompt: true });
			}
			catch (err) {}
		}
	});
}

function getSingleStream () {
	var stream;

	for (var streamID in streams.list) {
		if ( streams.list[streamID].handler ) {
			return streams.list[streamID];
		}
		else {
			stream = streams.list[streamID];
		}
	}

	return stream;
}



function handleRequest (handler) {
	if ( !enabled ) {
		return false;
	}

	if (handler.pathname.substr(0, DEBUG_PREFIX.length) !== DEBUG_PREFIX) {
		return false;
	}

	var tail = handler.pathname.substr(DEBUG_PREFIX.length);

	switch (tail) {
		case 'stream':
			handleListeningStream(handler);
			return true;

		case 'message':
			handleIncomingMessage(handler);
			return true;
	}

	return false;
}



function handleListeningStream (handler) {
	if ( !handler.params.id ) {
		if (handler.conn) {
			handler.conn.close();
		}
		else if (handler.response) {
			handler.response.writeHeader(200, {
				'Content-Type'  : 'text/plain' ,
				'Cache-Control' : 'no-cache'
			});
			handler.response.end('');
		}
		return;
	}

	var streamID = handler.params.id,
		stream   = streams.list[streamID];

	prepareHandler(streamID, handler);

	if ( !stream ) {
		stream = createStream(streamID, handler);
		return;
	}

	var oldHandler = stream.handler;
	stream.handler = handler;
	stream.emit('reconnect', handler);
	if (oldHandler) {
		if (oldHandler.conn) {
			oldHandler.conn.close();
		}
		else if (oldHandler.response) {
			oldHandler.response.end('');
		}
	}
}

function prepareHandler (streamID, handler) {
	var released = false,
		_end;

	if (handler.conn) {
		handler.conn.on('message', function (e) {
			if (e.type === 'utf8') {
				deliverMessage(handler, e.utf8Data);
			}
		});
		handler.conn.on('error', releaseHandler);
		handler.conn.on('close', releaseHandler);
	}
	else if (handler.response) {
		_end = handler.response.end;
		handler.response.end = function () {
			releaseHandler();
			return _end.apply(this, arguments);
		};

		handler.response.writeHeader(200, {
			'Content-Type'      : 'text/plain' ,
			'Cache-Control'     : 'no-cache' ,
			'Connection'        : 'keep-alive' ,
			'Transfer-Encoding' : 'chunked'
		});

		setTimeout(function () {
			handler.response.end('');
		}, 20 * 1000);

		handler.request.on('error', releaseHandler);
		handler.request.on('close', releaseHandler);
		handler.response.on('end'  , releaseHandler);
		handler.response.on('error', releaseHandler);
		handler.response.on('close', releaseHandler);
	}

	flushOutput(handler);

	function releaseHandler () {
		if (released) {
			return;
		}
		released = true;

		if (handler.conn) {
			handler.conn.close();
		}

		var stream = streams.list[streamID];

		if (!stream || (stream.handler !== handler)) {
			return;
		}

		stream.handler = null;

		stream.on('reconnect', cleanup);
		var timeout = setTimeout(giveUp, 10 * 1000);

		function cleanup () {
			stream.removeListener('reconnect', cleanup);
			clearTimeout(timeout);
		}

		function giveUp () {
			cleanup();

			if (stream === streams.list[streamID]) {
				delete streams.list[streamID];
			}
		}
	}
}

function createStream (streamID, handler) {
	var stream = new EventEmitter();
	stream.handler = handler;

	stream.send = function (data) {
		if ( !stream.handler ) {
			stream.once('reconnect', function () {
				stream.send(data);
			});
			return;
		}

		if (stream.handler.conn) {
			stream.handler.conn.send(JSON.stringify(data) + '\n');
		}
		else if (stream.handler.response) {
			stream.handler.response.write(JSON.stringify(data) + '\n');
			flushOutput(stream.handler);
		}
	};

	streams.list[streamID] = stream;
	streams.emit('connection', stream);

	return stream;
}

function flushOutput (handler) {
	for (var i=0; i<10; i++) {
		if (handler.conn) {
			handler.conn.send(FORCE_FLUSH);
		}
		else if (handler.response) {
			handler.response.write(FORCE_FLUSH);
		}
	}
}



function handleIncomingMessage (handler) {
	var rawData = '';

	handler.request.on('data', function (chunk) {
		rawData += chunk.toString();
	});

	handler.request.on('end', function () {
		handler.response.writeHeader(200, {
			'Content-Type'  : 'text/html' ,
			'Cache-Control' : 'no-cache'
		});
		handler.response.end('');

		deliverMessage(handler, rawData);
	});
}

function deliverMessage (handler, rawData) {
	var data;
	try {
		data = JSON.parse(rawData);
	}
	catch (err) {}
	if ((typeof data !== 'object') || (data === null)) {
		return;
	}

	var stream = streams.list[handler.params.id];
	if (stream) {
		stream.emit('message', data);
	}
}
