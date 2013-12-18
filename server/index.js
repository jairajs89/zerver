#!/usr/bin/env node

var path      = require('path'),
	commander = require(__dirname + path.sep + 'commander'),
	fork      = require('child_process').fork;

var ZERVER         = __dirname + path.sep + 'zerver',
	WATCHER        = __dirname + path.sep + 'watcher',
	PACKAGE        = __dirname + path.sep + '..' + path.sep + 'package.json',
	ENV_MATCHER    = /([^\,]+)\=([^\,]+)/g,
	API_DIR        = 'zerver',
	CHANGE_TIMEOUT = 1000,
	MAX_AGE        = 2000,
	MAX_TRIES      = 3;

startServer();



function processFlags () {
	if (process.env.ZERVER) {
		console.error('ZERVER environment variable is not longer supported');
		console.error('use ZERVER_FLAGS instead');
	}
	var defaultArgs = [];
	if (process.env.ZERVER_FLAGS) {
		console.log('env: ' + process.env.ZERVER_FLAGS);
		defaultArgs = parseShell(process.env.ZERVER_FLAGS);
	}
	var args = process.argv.slice(0,2).concat(defaultArgs).concat(process.argv.slice(2));

	var zerverVersion;
	try {
		var packageFile = require('fs').readFileSync(PACKAGE),
			packageData = JSON.parse(packageFile);
		zerverVersion = packageData.version;
	}
	catch (err) {
		zerverVersion = '0.0.0';
	}

	var commands = new commander.Command('zerver');
	commands
		.version(zerverVersion, '-v, --version')
		.usage('[options] [dir]')
		.option('-r, --refresh'             , 'auto-refresh browsers on file changes')
		.option('-c, --cli'                 , 'js shell for connect remote clients')
		.option('-m, --manifest <paths>'    , 'deprecated. does nothing and prints a warning.')
		.option('--disable-manifest'        , 'disable processing for ALL HTML5 appCache manifest files')
		.option('--ignore-manifest <paths>' , 'disable processing for a particular HTML5 appCache manifest file')
		.option('-p, --production'          , 'enable production mode (caching, concat, minfiy, gzip, etc)')
		.option('-P, --port <n>'            , 'set server port to listen on', parseInt, process.env.PORT||5000)
		.option('-V, --verbose'             , 'verbose request logging')
		.option('-H, --headers'             , 'show headers in logs')
		.option('-l, --less'                , 'automatically compile less into css')
		.option('-s, --stats'               , 'periodically print memory usage and other stats')
		.option('-j, --json'                , 'requests get logged as json')
		.option('--cache <paths>'           , 'set specific cache life for resources')
		.option('-M, --missing <paths>'     , 'set a custom 404 page')
		.parse(args);
	if (commands.production) {
		commands.refresh = false;
		commands.cli     = false;
	}
	return commands;
}

function parseShell (s) {
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



function setupCLI (processCommand) {
	var readline = require('readline'),
		rl       = readline.createInterface(process.stdin, process.stdout);

	rl.isEnabled = false;
	rl.setPrompt('');

	process.stdin.on('keypress', function (s, key) {
		if ( !key ) {
			return;
		}

		if (rl.isEnabled && key.name === 'escape') {
			rl.isEnabled = false;
			rl.setPrompt('');
			rl.prompt();
		}
		else if (!rl.isEnabled && key.name === 'tab') {
			rl.isEnabled = true;
			rl.setPrompt('>>> ');
			rl.prompt();
		}
	});

	rl.on('line', function (line) {
		if ( !rl.isEnabled ) {
			return;
		}

		if ( !line ) {
			rl.prompt();
			return;
		}

		processCommand(line);
	});

	rl.on('close', function() {
		if (rl.isEnabled) {
			console.log('');
		}
		process.exit(0);
	});

	return rl;
}



function startServer () {
	var commands = processFlags();

	var death       = false,
		cwd         = commands.args[0] ? path.join(process.cwd(),commands.args[0]) : process.cwd(),
		apiCheck    = new RegExp('^' + cwd + path.sep + API_DIR),
		opts        = { cwd : cwd },
		prodRetries = [],
		args        = [new Buffer(JSON.stringify({
			port            : commands.port ,
			apiDir          : API_DIR ,
			apiURL          : API_DIR ,
			refresh         : !!commands.refresh ,
			cli             : !!commands.cli ,
			verbose         : !!commands.verbose ,
			headers         : !!commands.headers ,
			manifest        : (commands.manifest || ''),
			disableManifest : !!commands.disableManifest,
			ignoreManifest  : (commands.ignoreManifest || ''),
			production      : !!commands.production ,
			less            : !!commands.less ,
			cache           : (commands.cache || '') ,
			missing         : (commands.missing || '') ,
			stats           : !!commands.stats ,
			json            : !!commands.json ,
		})).toString('base64')],
		child, cli;

	if (commands.production) {
		setInterval(function () {
			var now = Date.now();
			prodRetries = prodRetries.filter(function (time) {
				return time > (now-MAX_AGE);
			});
		}, MAX_AGE/2);
	}

	function shouldRetry() {
		if ( !commands.production ) {
			return true;
		} else if (prodRetries.length >= MAX_TRIES) {
			console.error('zerver: max retries due to exceptions exceeded');
			return false;
		} else {
			prodRetries.push( Date.now() );
			return true;
		}
	}

	function runServer () {
		try {
			child = fork(ZERVER, args, opts);
		}
		catch (err) {
			onDeath();
			return;
		}

		child.on('exit', onDeath);

		function onDeath () {
			if ( !death ) {
				!shouldRetry() ? process.exit() : runServer();
			}
		}

		if ( !commands.production ) {
			child.on('message', function (data) {
				if ( !data ) {
					return;
				}
				try {
					if (data.prompt && cli) {
						cli.prompt();
					} else if (data.log) {
						if (cli && cli.isEnabled) {
							cli.setPrompt('');
							cli.prompt();
						}
						console.log(data.log);
						if (cli && cli.isEnabled) {
							cli.setPrompt('>>> ');
							cli.prompt();
						}
					}
				} catch (err) {}
			});
		}
	}

	process.on('exit', function () {
		death = true;

		try {
			child.kill();
		}
		catch (err) {}
	});

	if (commands.production) {
		runServer();
		return;
	}

	if (commands.cli) {
		cli = setupCLI(function (line) {
			if (child) {
				try {
					child.send({ cli : line });
				}
				catch (err) {}
			}
		});
	}

	var watcher    = require(WATCHER),
		lastChange = null;

	watcher.watch(cwd, function (fileName) {
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
					child.send({ debugRefresh: true });
				}
				catch (err) {}
				return;
			}

			console.log('');
			console.log('reloading debug server');

			try {
				child.kill();
			}
			catch (err) {}
		}, CHANGE_TIMEOUT);
	});

	setTimeout(function () {
		lastChange = new Date();
	}, 500);

	runServer();
}
