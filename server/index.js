#!/usr/bin/env node

var extend      = require('util')._extend,
	cluster     = require('cluster'),
	http        = require('http'),
	path        = require('path'),
	commander   = require(__dirname+'/lib/commander'),
	StaticFiles = require(__dirname+'/static'),
	APICalls    = require(__dirname+'/api'),
	Logger      = require(__dirname+'/log');

var PACKAGE         = __dirname+path.sep+'..'+path.sep+'package.json',
	API_PATH        = '/zerver',
	REQUEST_TIMEOUT = 25 * 1000,
	MAX_AGE        = 2000,
	MAX_TRIES      = 3;



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
		callback && callback(zerver);
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

		var app = http.createServer(function (req, res) {
			self._handleRequest(req, res);
		});

		app.on('error', function (err) {
			console.error('zerver: server error');
			console.error(err);
			console.error(err.stack);
		});

		app.listen(self._options.port, function () {
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



function main() {
	if (cluster.isMaster) {
		masterMain();
	} else {
		slaveMain();
	}
}

function masterMain() {
	var sigint      = false,
		prodRetries = [],
		child;

	setInterval(pruneRetries, MAX_AGE/2);
	newChild();

	process.on('SIGUSR2', killChild);
	process.on('SIGINT', function () {
		sigint = true;
		killChild();
		process.exit();
	});

	function newChild() {
		var started = false;
		child = cluster.fork(process.env);
		child.on('message', function (data) {
			try {
				if (data.started) {
					started = Date.now();
				}
			} catch (err) {}
		});
		child.on('exit', function () {
			if ( !started ) {
				process.exit();
				return;
			}
			prodRetries.push(Date.now()-started);
			if (sigint) {
				return;
			}
			killChild();
			if ( shouldRetry() ) {
				newChild();
			} else {
				console.error('zerver: max retries due to exceptions exceeded');
				process.exit();
			}
		});
	}

	function shouldRetry() {
		pruneRetries();
		return (prodRetries.length < MAX_TRIES);
	}

	function pruneRetries() {
		for (var t=0, i=prodRetries.length; i--;) {
			t += prodRetries[i];
			if (t >= MAX_AGE) {
				prodRetries.splice(0,i);
				return;
			}
		}
	}

	function killChild() {
		try {
			child.kill();
		} catch (err) {}
		child = null;
	}
}

function slaveMain() {
	new Zerver(processFlags()._json, function () {
		process.send({ started: true });
	});
}

function processFlags() {
	var defaultArgs = [];
	if (process.env.ZERVER_FLAGS) {
		console.log('[env="'+process.env.ZERVER_FLAGS+'"]');
		defaultArgs = parseShell(process.env.ZERVER_FLAGS);
	}
	var args = process.argv.slice(0,2).concat(defaultArgs).concat(process.argv.slice(2));

	var zerverVersion;
	try {
		var packageFile = require('fs').readFileSync(PACKAGE),
			packageData = JSON.parse(packageFile);
		zerverVersion = packageData.version;
	} catch (err) {
		zerverVersion = '0.0.0';
	}

	var commands = new commander.Command('zerver');
	commands
		.version(zerverVersion, '-v, --version')
		.usage('[options] [dir]')
		.option('-P, --port <n>'            , 'set server port to listen on', parseInt, process.env.PORT||5000)
		.option('-p, --production'          , 'enable production mode (caching, concat, minfiy, gzip, etc)')
		.option('-r, --refresh'             , 'auto-refresh browsers on file changes')
		.option('-c, --cli'                 , 'js shell for connect remote clients')
		.option('--cache <paths>'           , 'set specific cache life for resources')
		.option('-M, --missing <paths>'     , 'set a custom 404 page')
		.option('--disable-manifest'        , 'disable processing for ALL HTML5 appCache manifest files')
		.option('--ignore-manifest <paths>' , 'disable processing for a particular HTML5 appCache manifest file')
		.option('-V, --verbose'             , 'verbose request logging')
		.option('-H, --headers'             , 'show headers in logs')
		.option('-j, --json'                , 'requests get logged as json')
		.option('-s, --stats'               , 'periodically print memory usage and other stats')
		.option('-m, --manifest <paths>'    , 'deprecated. does nothing and prints a warning.')
		.parse(args);
	if (commands.production) {
		commands.refresh = false;
		commands.cli     = false;
	}
	commands.dir = path.resolve(process.cwd(), commands.args[0] || '.');

	var jsonCommands = {};
	Object.keys(commands).filter(function (name) {
		if (name[0] === '_') {
			return false;
		}
		if (['rawArgs', 'args', 'commands', 'options'].indexOf(name) !== -1) {
			return false;
		}
		return true;
	}).forEach(function (name) {
		jsonCommands[name] = commands[name];
	});
	commands._json = jsonCommands;

	return commands;
}

function parseShell(s) {
	return s.match(/(['"])((\\\1|[^\1])*?)\1|(\\ |\S)+/g)
		.map(function (s) {
			if (/^'/.test(s)) {
				return s
					.replace(/^'|'$/g, '')
					.replace(/\\(["'\\$`(){}!#&*|])/g, '$1');
				;
			}
			else if (/^"/.test(s)) {
				return s
					.replace(/^"|"$/g, '')
					.replace(/\\(["'\\$`(){}!#&*|])/g, '$1');
				;
			}
			else return s.replace(/\\([ "'\\$`(){}!#&*|])/g, '$1');
		})
	;
}

if (require.main === module) {
	main();
}
