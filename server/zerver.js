var http        = require('http'),
	path        = require('path'),
	extend      = require('util')._extend,
	APICalls    = require(__dirname+path.sep+'api'),
	Logger      = require(__dirname+path.sep+'log'),
	StaticFiles = require(__dirname+path.sep+'static');

module.exports = Zerver;

Zerver.API_PATH = '/zerver';
Zerver.REQUEST_TIMEOUT = 25 * 1000;



function Zerver(options, callback) {
	var self = this;
	self._options = extend({
		ignores : Zerver.API_PATH+'/',
		apis    : Zerver.API_PATH
	}, options || {});

	global.ZERVER_DEBUG = !self._options.production;

	self._logger = new Logger(self._options);
	self._apis   = new APICalls(self._options);
	self._options._apiModule = self._apis;
	self._static = new StaticFiles(self._options, function () {
		var staticFiles = this;

		if (self._options.missing) {
			if (self._options.missing[0] !== '/') {
				self._options.missing = '/'+self._options.missing;
			}
			if ( staticFiles.get(self._options.missing) ) {
				self._missing = self._options.missing;
			}
		}

		http.globalAgent.maxSockets = 50;

		self._app = http.createServer(function (req, res) {
			self._handleRequest(req, res);
		});

		self._app.listen(self._options.port, function () {
			console.log('zerver running:');
			console.log('- path: ' + self._options.dir);
			console.log('- port: ' + self._options.port);
			var apiNames = self._apis.getNames();
			if (apiNames.length) {
				console.log('- apis: ' + apiNames.join(', '));
			}
			var manifestList = staticFiles.getManifestNames();
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
	}, Zerver.REQUEST_TIMEOUT);

	var resEnd = res.end;
	res.end = function () {
		clearTimeout(timeout);
		res.end = resEnd;
		res.end.apply(this, arguments);
		self._logger.endRequest(req, res);
	};
};

Zerver.middleware = function (rootDir) {
	var apis = new APICalls({
		dir        : path.resolve(process.cwd(), rootDir),
		production : true,
		apis       : Zerver.API_PATH,
	});

	return function (req, res, next) {
		apis.get(req.url.split('?')[0], req, function (status, headers, body) {
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
