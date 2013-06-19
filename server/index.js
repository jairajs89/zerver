#!/usr/bin/env node

var commander = require(__dirname + '/commander'),
	path      = require('path'),
	fork      = require('child_process').fork;

var ZERVER         = __dirname + '/zerver',
	WATCHER        = __dirname + '/watcher',
	PACKAGE        = __dirname + '/../package.json',
	ENV_MATCHER    = /([^\,]+)\=([^\,]+)/g,
	API_DIR        = 'zerver',
	CHANGE_TIMEOUT = 1000;

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
		.option('-p, --production'      , 'enable production mode (caching, concat, minfiy, gzip, etc)')
		.option('-d, --debug'           , 'no-op (backwards compatibility)')
		.option('-r, --refresh'         , 'auto-refresh browsers on file changes')
		.option('-l, --logging'         , 'stream browser logs to server console')
		.option('-V, --verbose'         , 'verbose request logging')
		.option('-L, --less'            , 'automatically compile less into css')
		.option('-P, --port <n>'        , 'set server port to listen on', parseInt, process.env.PORT||8888)
		.option('-H, --host <str>'      , 'declare production hostname')
		.option('-m, --manifest <paths>', 'declare HTML5 appCache manifest files')
		.parse(args);
	if (commands.production) {
		commands.refresh = false;
		commands.logging = false;
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
	var commands = processFlags();

	var death    = false,
		cwd      = commands.args[0] ? path.join(process.cwd(),commands.args[0]) : process.cwd(),
		apiDir   = cwd + '/' + API_DIR,
		apiCheck = new RegExp('^' + cwd + '/' + API_DIR),
		args     = [new Buffer(JSON.stringify({
			port       : commands.port ,
			apiDir     : apiDir ,
			apiURL     : apiDir ,
			refresh    : !!commands.refresh ,
			logging    : !!commands.logging ,
			verbose    : !!commands.verbose ,
			manifests  : (commands.manifest || '') ,
			production : !!commands.production ,
			less       : !!commands.less ,
			apiHost    : commands.host
		})).toString('base64')],
		opts     = { cwd : cwd },
		child, cli;

	function runServer (noRestart) {
		child = fork(ZERVER, args, opts);

		child.on('exit', function () {
			if ( !death ) {
				noRestart ? process.exit() : runServer();
			}
		});

		if (commands.logging) {
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

	if (commands.production) {
		runServer(true);
		return;
	}

	if (commands.logging) {
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
