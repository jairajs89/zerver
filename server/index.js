#!/usr/bin/env node

var commander = require(__dirname + '/commander'),
	path      = require('path'),
	fork      = require('child_process').fork;

var ZERVER         = __dirname + '/zerver',
	WATCHER        = __dirname + '/watcher',
	PACKAGE        = __dirname + '/../package.json',
	ENV_MATCHER    = /([^\,]+)\=([^\,]+)/g,
	API_DIR        = 'zerver',
	CWD            = process.cwd(),
	CHANGE_TIMEOUT = 1000,
	DEBUG          = false,
	REFRESH        = false,
	LOGGING        = false,
	PRODUCTION     = false,
	VERBOSE        = false,
	PORT           = process.env.PORT || 8888,
	MANIFESTS	   = [],
	API_HOST;

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
		.option('-d, --debug', 'enable debug mode (auto-reload APIs on changes)')
		.option('-r, --refresh', 'auto-refresh browsers on file changes')
		.option('-l, --logging', 'stream browser logs to server console')
		.option('-b, --verbose', 'verbose request logging')
		.option('-p, --production', 'enable production mode (caching, concat, minfiy, gzip, etc)')
		.option('-P, --port <n>', 'set server port to listen on', parseInt)
		.option('-u, --host <str>', 'declare production hostname')
		.option('-m, --manifest <paths>', 'declare HTML5 appCache manifest files')
		.parse(args);

	if (commands.debug) {
		DEBUG = true;
	}
	if (commands.refresh) {
		REFRESH = true;
	}
	if (commands.logging) {
		LOGGING = true;
	}
	if (commands.verbose) {
		VERBOSE = true;
	}
	if (commands.production) {
		PRODUCTION = true;
	}
	if (commands.port) {
		PORT = commands.port;
	}
	if (commands.host) {
		API_HOST = commands.host;
	}
	if (commands.manifest) {
		MANIFESTS = MANIFESTS.concat( commands.manifest.split(',') );
	}
	if (commands.args[0]) {
		CWD = path.join(process.cwd(), commands.args[0]);
	}

	if (PRODUCTION) {
		DEBUG   = false;
		REFRESH = false;
		LOGGING = false;
	}
	else if (DEBUG || REFRESH || LOGGING) {
		DEBUG      = true;
		PRODUCTION = false;
	}
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
	var readline  = require('readline'),
		rlEnabled = false;
		rl        = readline.createInterface(process.stdin, process.stdout);

	rl.setPrompt('');

	process.stdin.on('keypress', function (s, key) {
		if ( !key ) {
			return;
		}

		if (rlEnabled && key.name === 'escape') {
			rlEnabled = false;
			rl.setPrompt('');
			rl.prompt();
		}
		else if (!rlEnabled && key.name === 'tab') {
			rlEnabled = true;
			rl.setPrompt('>>> ');
			rl.prompt();
		}
	});

	rl.on('line', function (line) {
		if ( !rlEnabled ) {
			return;
		}

		if ( !line ) {
			rl.prompt();
			return;
		}

		processCommand(line);
	});

	rl.on('close', function() {
		if (rlEnabled) {
			console.log('');
		}
		process.exit(0);
	});

	return rl;
}



function startServer () {
	processFlags();

	var death    = false,
		apiDir   = CWD + '/' + API_DIR,
		apiCheck = new RegExp('^' + CWD + '/' + API_DIR),
		args     = [ PORT, API_DIR, (DEBUG ? '1' : '0'), (REFRESH ? '1' : '0'), (LOGGING ? '1' : '0'), (VERBOSE ? '1' : '0'), MANIFESTS.join(','), (PRODUCTION ? '1' : '0'), (API_HOST || '')],
		opts     = { cwd : CWD },
		child, cli;

	function runServer (noRestart) {
		child = fork(ZERVER, args, opts);

		child.on('exit', function () {
			if ( !death ) {
				noRestart ? process.exit() : runServer();
			}
		});

		if (LOGGING) {
			child.on('message', function (data) {
				if (data && data.prompt && cli) {
					cli.prompt();
				}
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

	if ( !DEBUG ) {
		runServer(true);
		return;
	}

	if (LOGGING) {
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

	watcher.watch(CWD, function (fileName) {
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
				child.send({ debugRefresh: true });
				return;
			}

			console.log('');
			console.log('reloading debug server');

			child.kill();
		}, CHANGE_TIMEOUT);
	});

	setTimeout(function () {
		lastChange = new Date();
	}, 500);

	runServer();
}
