var extend      = require('util')._extend,
	http        = require('http'),
	path        = require('path'),
	StaticFiles = require(__dirname+path.sep+'static'),
	APICalls    = require(__dirname+path.sep+'api'),
	Logger      = require(__dirname+path.sep+'log');

var API_PATH        = '/zerver',
	REQUEST_TIMEOUT = 25 * 1000;



exports.middleware = function (rootDir) {
	var apis = new APICalls({
		dir        : path.resolve(process.cwd(), rootDir),
		production : true,
		apis       : API_PATH,
	});

	return function (req, res, next) {
		self._apis.get(req.url.split('?')[0], req, function (status, headers, body) {
			if (typeof status === 'undefined') {
				next();
			} else {
				res.writeHeader(status, headers);
				res.write(body, 'binary');
				res.end();
			}
		});
	};
};

exports.start = function (options, callback) {
	var zerver = new Zerver(options, function () {
		process.nextTick(function () {
			if (callback) {
				callback(zerver);
			}
		});
	});
	return zerver;
};



function Zerver(options, callback) {
	var self = this;
	self._options = extend({
		ignores : API_PATH+'/',
		apis    : API_PATH
	}, options || {});

	global.ZERVER_DEBUG = !self._options.production;

	self._logger = new Logger(self._options);
	self._apis   = new APICalls(self._options);
	self._static = new StaticFiles(self._options, function () {
		if (self._options.missing) {
			if (self._options.missing[0] !== '/') {
				self._options.missing = '/'+self._options.missing;
			}
			if ( self._static.get(self._options.missing) ) {
				self._missing = self._options.missing;
			}
		}

		http.globalAgent.maxSockets = 50;

		self._app = http.createServer(function (req, res) {
			self._handleRequest(req, res);
		});

		self._app.listen(self._options.port, function () {
			console.log('zerver running:');
			console.log('- port: ' + self._options.port);
			var apiNames = self._apis.getNames();
			if (apiNames.length) {
				console.log('- apis: ' + apiNames.join(', '));
			}
			var manifestList = self._static.getManifestNames();
			if (manifestList.length) {
				console.log('- manifests: ' + manifestList.join(', '));
			}
			if (self._options.production) {
				console.log('- production: true');
			}
			if (self._options.refresh) {
				console.log('- refresh: true');
			}
			if (self._options.cli) {
				console.log('- cli: true');
			}
			if (self._options.stats) {
				console.log('- stats: true');
			}
			console.log('');

			callback();
		});
	});
}

Zerver.prototype.stop = function (callback) {
	if (this._app) {
		this._app.close(callback);
	} else {
		throw Error('zerver has not started yet, unable to stop');
	}
};

Zerver.prototype._handleRequest = function (req, res) {
	var self     = this,
		pathname = req.url.split('?')[0];

	self._prepareRequest(req, res);

	self._apis.get(pathname, req, function (status, headers, body) {
		if (typeof status !== 'undefined') {
			finish(status, headers, body);
			return;
		}

		var data = self._static.get(pathname);
		if (!data && self._missing) {
			data = self._static.get(self._missing);
		}
		if ( !data ) {
			data = {
				status  : 404,
				headers : { 'Content-Type' : 'text/plain' },
				body    : '404',
			};
		}

		finish(data.status, data.headers, data.body);
	});

	function finish(status, headers, body) {
		res.writeHeader(status, headers);
		res.write(body, 'binary');
		res.end();
	}
};

Zerver.prototype._prepareRequest = function (req, res) {
	var self = this;

	self._logger.startRequest(req, res);

	req.on('error', function (err) {
		console.error('zerver: request error');
		console.error(err);
		console.error(err.stack);
	});

	res.on('error', function (err) {
		console.error('zerver: response error');
		console.error(err);
		console.error(err.stack);
	});

	var timeout = setTimeout(function () {
		console.error('zerver: request timeout');
		res.statusCode = 500;
		res.end('');
	}, REQUEST_TIMEOUT);

	var resEnd = res.end;
	res.end = function () {
		clearTimeout(timeout);
		res.end = resEnd;
		res.end.apply(this, arguments);
		self._logger.endRequest(req, res);
	};
};
