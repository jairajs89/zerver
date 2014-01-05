var extend       = require('util')._extend,
	path         = require('path'),
	EventEmitter = require('events').EventEmitter,
	Zerver       = require(__dirname+path.sep+'zerver'),
	WebSocketServer;

var _warn = console.warn;
console.warn = function () {};
WebSocketServer = require('websocket').server;
console.warn = _warn;

module.exports = Slave;



function Slave(options) {
	var self = this;
	self.options = extend({}, options || {});

	self.streams = new EventEmitter();
	self.streams.list = [];
	self.streams.on('connection', function (stream) {
		stream.on('_message', function (data) {
			if (data.type === 'log') {
				try {
					process.send({ log: (data.level+': '+data.message) });
				} catch (err) {}
			}
		});
	});

	var zerver = new Zerver(self.options, function () {
		process.send({ started: true });
		process.nextTick(function () {
			try {
				new WebSocketServer({ httpServer: zerver._app })
					.on('request', function (req) {
						var conn = req.accept('zerver-debug', req.origin);
						self.handleRequest(conn);
					});
			} catch (err) {
				console.error('failed to init debug channel');
			}
		});
	});

	process.on('message', function (data) {
		if (data) {
			if (data.debugRefresh) {
				self.refresh();
			} else if (data.cli) {
				self.cliRequest(data.cli);
			}
		}
	});
}

Slave.prototype.refresh = function () {
	this.streams.list.forEach(function (stream) {
		stream._send({ type: 'refresh' });
	});
};

Slave.prototype.cliRequest = function (line) {
	var done   = false,
		stream = this.streams.list[0];
	if ( !stream ) {
		console.warn('(no browsers available)');
		finish();
		return;
	}

	var requestID = 'x'+Math.random();
	stream._send({
		type      : 'eval'    ,
		line      : line      ,
		requestID : requestID ,
	});

	stream.on('_message', handleMessage);

	var timeout = setTimeout(function () {
		stream.removeListener('message', handleMessage);
		console.warn('(cli timeout)');
		finish();
	}, 10 * 1000);

	function handleMessage(data) {
		if ((data.type !== 'eval') || (data.requestID !== requestID)) {
			return;
		}

		stream.removeListener('message', handleMessage);
		clearTimeout(timeout);

		if (data.dataType === 'string') {
			console.log(data.output);
		} else if (data.dataType === 'json') {
			try {
				console.log( JSON.parse(data.output) );
			} catch (err) {
				console.error('(zerver cli error)');
			}
		} else {
			console.error(data.error);
		}

		finish();
	}

	function finish() {
		if (done) {
			return;
		}
		done = true;
		try {
			process.send({ prompt: true });
		} catch (err) {}
	}
};

Slave.prototype.handleRequest = function (stream) {
	var self = this;

	self.streams.list.push(stream);
	self.streams.emit('connection', stream);

	stream._send = function (data) {
		try {
			this.send(JSON.stringify(data) + '\n');
		} catch (err) {}
	};

	stream.on('message', function (e) {
		var data;
		if (e.type === 'utf8') {
			try {
				data = JSON.parse(e.utf8Data);
			} catch (err) {}
		}
		if ((typeof data !== 'object') || (data === null)) {
			return;
		}
		stream.emit('_message', data);
	});
	stream.on('error', releaseHandler);
	stream.on('close', releaseHandler);

	var released = false;
	function releaseHandler() {
		if (released) {
			return;
		}
		released = true;

		try {
			stream.close();
		} catch (err) {}

		for (var i=0, l=self.streams.list.length; i<l; i++) {
			if (self.streams.list[i] === stream) {
				self.streams.list.splice(i, 1);
				break;
			}
		}
	}
};
