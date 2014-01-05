var cluster = require('cluster'),
	extend  = require('util')._extend,
	path    = require('path'),
	Zerver  = require(__dirname+path.sep+'zerver');

module.exports = Master;

Master.WATCHER        = __dirname+path.sep+'lib'+path.sep+'watcher',
Master.CHANGE_TIMEOUT = 500;
Master.MAX_AGE        = 2000;
Master.MAX_TRIES      = 3;



function Master(options) {
	var self = this;
	self.options  = extend({}, options || {});
	self.death    = false;
	self.retries  = [];
	self.child    = null;
	self.hadStart = false;

	setInterval(function () {
		self.pruneRetries();
	}, Master.MAX_AGE/2);

	self.createChild();

	if ( !self.options.production ) {
		self.setupWatcher();
		if (self.options.cli) {
			self.setupCLI();
		}
	}

	process.on('SIGUSR2', killMaster);
	process.on('SIGINT' , killMaster);
	process.on('exit'   , killMaster);

	function killMaster() {
		if (self.death) {
			return;
		}
		self.death = true;
		self.killChild();
		process.exit();
	}
}

Master.prototype.createChild = function () {
	var self    = this,
		started = false;

	self.child = cluster.fork(process.env);

	self.child.on('message', function (data) {
		try {
			if (data.started) {
				started = Date.now();
				if (!self.hadStart && self.cli) {
					console.log('(press <tab> to access remote command line)');
					console.log('');
				}
				self.hadStart = true;
			} else if (data.prompt && self.cli) {
				self.cli.prompt();
			} else if (data.log) {
				if (self.cli && self.cli.isEnabled) {
					self.cli.setPrompt('');
					self.cli.prompt();
				}
				console.log(data.log);
				if (self.cli && self.cli.isEnabled) {
					self.cli.setPrompt('>>> ');
					self.cli.prompt();
				}
			}
		} catch (err) {}
	});

	self.child.on('exit', function () {
		if ( !started ) {
			process.exit();
			return;
		}

		self.retries.push(Date.now()-started);

		if (self.death) {
			return;
		}

		self.killChild();
		self.pruneRetries();

		if (self.retries.length < Master.MAX_TRIES) {
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

Master.prototype.pruneRetries = function () {
	for (var t=0, i=this.retries.length; i--;) {
		t += this.retries[i];
		if (t >= Master.MAX_AGE) {
			this.retries.splice(0,i);
			return;
		}
	}
};

Master.prototype.setupWatcher = function () {
	var self       = this,
		watcher    = require(Master.WATCHER),
		apiCheck   = new RegExp('^'+path.join(this.options.dir, Zerver.API_PATH)),
		lastChange = null;

	watcher.watch(this.options.dir, function (fileName) {
		if (lastChange === null) {
			return;
		}

		var time   = new Date();
		lastChange = time;

		setTimeout(function () {
			if (lastChange !== time) {
				return;
			}

			if ( !apiCheck.test(fileName) ) {
				try {
					self.child.send({ debugRefresh: true });
				} catch (err) {}
			} else {
				console.log('');
				console.log('reloading debug server');
				self.killChild();
			}
		}, Master.CHANGE_TIMEOUT);
	});

	setTimeout(function () {
		lastChange = new Date();
	}, 500);
};

Master.prototype.setupCLI = function () {
	var self     = this,
		readline = require('readline');

	self.cli = readline.createInterface(process.stdin, process.stdout);
	self.cli.isEnabled = false;
	self.cli.setPrompt('');

	process.stdin.on('keypress', function (s, key) {
		if (key) {
			if (self.cli.isEnabled && key.name === 'escape') {
				self.cli.isEnabled = false;
				self.cli.setPrompt('');
				self.cli.prompt();
			} else if (!self.cli.isEnabled && key.name === 'tab') {
				self.cli.isEnabled = true;
				self.cli.setPrompt('>>> ');
				self.cli.prompt();
			}
		}
	});

	self.cli.on('line', function (line) {
		if (self.cli.isEnabled) {
			if (line) {
				if (self.child) {
					try {
						self.child.send({ cli: line });
					} catch (err) {}
				}
			} else {
				self.cli.prompt();
			}
		}
	});

	self.cli.on('close', function () {
		if (self.cli.isEnabled) {
			console.log('');
		}
		process.exit();
	});
};
