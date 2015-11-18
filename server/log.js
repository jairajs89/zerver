var extend = require('util')._extend;

module.exports = Logger;



function Logger(options) {
	this._options = extend({}, options || {});
}

Logger.prototype.startRequest = function (req, res) {
	req._logger = {
		time: process.hrtime(),
	};
};

Logger.prototype.endRequest = function (req, res) {
	if ( !req._logger ) {
		return;
	}

	var timeParts = process.hrtime(req._logger.time);
	var time = (timeParts[0]*1000 + timeParts[1]/1000000);
	this._print(req, res, time);

	delete req._logger;
};

Logger.prototype._print = function (req, res, time) {
	if (this._options.quiet) {
		return;
	}

	var logs = {
		method   : req.method,
		url      : req.url,
		status   : res.statusCode,
	};
	if (this._options.verbose || time > 30) {
		logs.time = time;
	}
	if (this._options.verbose) {
		if (req.headers['origin']) {
			logs.origin = req.headers['origin'];
		} else if (req.headers['host']) {
			logs.origin = getClientProtocol(req)+'://'+req.headers['host'];
		}
		logs.ip = getClientHost(req);
		if (req.headers['user-agent']) {
			logs.userAgent = req.headers['user-agent'];
		}
		if (req.headers['referer']) {
			logs.referrer = req.headers['referer'];
		}
	}

	var numSpaces = Math.max(0, 4-logs.method.length),
		spaces    = '',
		time      = '';
	for (var i=0; i<numSpaces; i++) spaces += ' ';
	if (logs.time) {
		time = ' ['+Math.round(logs.time*10)/10+'ms]';
	}
	console.log(logs.status+' '+logs.method+spaces+' '+logs.url+time);

	if (logs.origin) {
		console.log('  origin='+logs.origin);
	}
	if (logs.referrer) {
		console.log('  referrer=' + logs.referrer);
	}
	if (logs.ip) {
		console.log('  ip=' + logs.ip);
	}
	if (logs.userAgent) {
		console.log('  user-agent=' + logs.userAgent);
	}
	if (logs.origin || logs.referrer || logs.ip || logs.userAgent) {
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
