#!/usr/bin/env node

var cluster   = require('cluster'),
	path      = require('path'),
	fs        = require('fs'),
	commander = require(__dirname+'/lib/commander'),
	zerver    = require(__dirname+'/zerver');

var PACKAGE   = __dirname+path.sep+'..'+path.sep+'package.json',
	MAX_AGE   = 2000,
	MAX_TRIES = 3;



process.nextTick(function () {
	if (require.main !== module) {
		throw Error('server/index.js must be run as main module');
	} else if (cluster.isMaster) {
		new Master();
	} else {
		zerver.start(processFlags()._json, function () {
			process.send({ started: true });
		});
	}
});



/* Slave driver */

function Master() {
	var self = this;
	self.sigint  = false;
	self.retries = [];
	self.child   = null;

	setInterval(function () {
		self.pruneRetries();
	}, MAX_AGE/2);

	self.createChild();

	process.on('SIGUSR2', function () {
		self.killChild();
	});
	process.on('SIGINT', function () {
		self.sigint = true;
		self.killChild();
		process.exit();
	});
}

Master.prototype.createChild = function () {
	var self    = this,
		started = false;

	self.child = cluster.fork(process.env);

	self.child.on('message', function (data) {
		try {
			if (data.started) {
				started = Date.now();
			}
		} catch (err) {}
	});

	self.child.on('exit', function () {
		if ( !started ) {
			process.exit();
			return;
		}

		self.retries.push(Date.now()-started);

		if (self.sigint) {
			return;
		}

		self.killChild();

		if ( self.shouldRetry() ) {
			self.createChild();
		} else {
			console.error('zerver: max retries due to exceptions exceeded');
			process.exit();
		}
	});
};

Master.prototype.killChild = function () {
	try {
		this.child.kill();
	} catch (err) {}
	this.child = null;
};

Master.prototype.shouldRetry = function () {
	this.pruneRetries();
	return (this.retries.length < MAX_TRIES);
};

Master.prototype.pruneRetries = function () {
	for (var t=0, i=this.retries.length; i--;) {
		t += this.retries[i];
		if (t >= MAX_AGE) {
			this.retries.splice(0,i);
			return;
		}
	}
};



/* CLI arguments */

function processFlags() {
	var defaultArgs = [];
	if (process.env.ZERVER_FLAGS) {
		console.log('[env="'+process.env.ZERVER_FLAGS+'"]');
		defaultArgs = parseShell(process.env.ZERVER_FLAGS);
	}
	var args = process.argv.slice(0,2).concat(defaultArgs).concat(process.argv.slice(2));

	var zerverVersion;
	try {
		var packageFile = fs.readFileSync(PACKAGE),
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
		.parse(args);
	if (commands.production) {
		commands.refresh = false;
		commands.cli     = false;
	}
	if (commands.cli) {
		commands.logging = true;
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
