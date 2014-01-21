var extend = require('util')._extend;

module.exports = Logger;

Logger.HIDDEN_HEADERS = [
	'host'   , 'connection', 'user-agent'     , 'if-none-match'  ,
	'referer', 'accept'    , 'accept-encoding', 'accept-language',
	'content-length'
];



function Logger(options) {
	var self = this;

	this._options = extend({}, options || {});

	if (this._options.stats) {
		this._stats = { openRequests: 0 };
		this._reset();
		setInterval(function () {
			self._printStats();
		}, 1000);
	}
}

Logger.prototype.startRequest = function (req, res) {
	req._logger = {
		time: process.hrtime(),
	};
	if (this._stats) {
		this._stats.openRequests += 1;
	}
};

Logger.prototype.endRequest = function (req, res) {
	if ( !req._logger ) {
		return;
	}
	var timeParts = process.hrtime(req._logger.time);
	req._logger.timeMs = (timeParts[0]*1000 + timeParts[1]/1000000);

	if (this._stats) {
		this._stats.openRequests -= 1;
		this._stats.requests += 1
		if (res.statusCode === 404) {
			this._stats.missing += 1;
		} else if (res.statusCode >= 400) {
			this._stats.error += 1;
		}
		this._stats.responseTime += req._logger.timeMs;
	}

	this._print(req, res);

	delete req._logger;
};

Logger.prototype._reset = function () {
	this._stats.requests     = 0;
	this._stats.missing      = 0;
	this._stats.error        = 0;
	this._stats.responseTime = 0;
};

Logger.prototype._printStats = function () {
	try {
		var usage = {
			type            : 'stats',
			time            : Date.now(),
			pid             : process.pid,
			memory          : process.memoryUsage().heapUsed,
			uptime          : parseInt(process.uptime()),
			requests        : this._stats.requests,
			missing         : this._stats.missing,
			error           : this._stats.error,
			openConnections : this._stats.openRequests,
		};
		if (this._stats.requests) {
			usage.avgResponse = Math.round(100*this._stats.responseTime/this._stats.requests)/100;
		} else {
			usage.avgResponse = 0;
		}
		console.log( JSON.stringify(usage) );
	} catch (err) {}
	this._reset();
};

Logger.prototype._print = function (req, res) {
	var logs = {
		ip       : getClientHost(req),
		method   : req.method,
		protocol : getClientProtocol(req),
		host     : req.headers['host'],
		url      : req.url,
		status   : res.statusCode,
		time     : req._logger.timeMs,
	};
	if (this._options.verbose) {
		logs.userAgent = req.headers['user-agent'];
		logs.referrer = (req.headers['referrer'] || req.headers['referer']);
	}
	if (this._options.headers) {
		logs.headers = {};
		for (var key in req.headers) {
			if (Logger.HIDDEN_HEADERS.indexOf(key) === -1) {
				logs.headers[key] = req.headers[key];
			}
		}
	}

	if (this._options.json) {
		console.log( JSON.stringify(logs) );
		return;
	}

	if (this._options.production && !this._options.verbose) {
		return;
	}

	var time      = Math.round(logs.time*10)/10 + '',
		numSpaces = Math.max(0, 4-logs.method.length),
		spaces    = '';
	for (var i=0; i<numSpaces; i++) spaces += ' ';
	console.log(logs.status+' '+logs.method+spaces+' '+logs.url+' ['+time+'ms]');

	if (this._options.verbose) {
		if (logs.host) {
			console.log('  host='+logs.protocol+'://'+logs.host);
		} else {
			console.log('  protocol='+logs.protocol);
		}
		if (logs.referrer) {
			console.log('  referrer=' + logs.referrer);
		}
		if (logs.ip) {
			console.log('  ip=' + logs.ip);
		}
		if (logs.userAgent) {
			console.log('  agent='+logs.userAgent);
		}
	}

	if (this._options.headers && Object.keys(logs.headers).length) {
		console.log('  headers=');
		for (var header in logs.headers) {
			console.log('    '+header+': '+logs.headers[header]);
		}
	}

	if (this._options.verbose || this._options.headers) {
		console.log('');
	}
};



function getClientHost(req) {
	var host = req.headers['x-forwarded-for'];
	if (host) {
		return host.split(',')[0];
	} else {
		return req.connection.remoteAddress;
	}
}

function getClientProtocol(req) {
	var proto = req.headers['x-forwarded-proto'];
	if (proto) {
		return proto.split(',')[0];
	} else {
		return 'http';
	}
}
