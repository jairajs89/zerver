var extend       = require('util')._extend,
	path         = require('path'),
	EventEmitter = require('events').EventEmitter,
	WebSocketServer;

module.exports = Slave;



function Slave(options) {
	var self = this;
	self.options = extend({}, options || {});

	if (options.refresh) {
		self.streams = new EventEmitter();
		self.streams.list = [];
	}

	var zerver = new (require(__dirname+path.sep+'zerver'))(self.options, function () {
		process.send({ started: true });
		if (options.refresh) {
			process.nextTick(function () {
				try {
					new (getWebsocketServer())({ httpServer: zerver._app })
						.on('request', function (req) {
							var conn = req.accept('zerver-debug', req.origin);
							self.handleRequest(conn);
						});
				} catch (err) {
					console.error('failed to init debug channel');
				}
			});
		}
	});

	process.on('message', function (data) {
		if (data && data.debugRefresh) {
			self.streams.list.forEach(function (stream) {
				stream._send({ type: 'refresh' });
			});
		}
	});
}

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


function getWebsocketServer() {
	if ( !WebSocketServer ) {
		var _warn = console.warn;
		console.warn = function () {};
		WebSocketServer = require('websocket').server;
		console.warn = _warn;
	}
	return WebSocketServer;
}
