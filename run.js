#!/usr/bin/env node

var path = require('path'),
	fork = require('child_process').fork;

var ZERVER         = __dirname + '/zerver',
	WATCHER        = __dirname + '/watcher',
	PACKAGE        = __dirname + '/package.json',
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



function processFlags () {
	var flags = require(__dirname + '/flags');

	flags.add(['v', 'version'], function () {
		try {
			var packageFile = require('fs').readFileSync(PACKAGE),
				packageData = JSON.parse(packageFile);

			console.log('zerver v' + packageData.version);
		}
		catch (err) {
			console.log('zerver v0');
		}
		process.exit();
	});

	flags.add(['d', 'debug'], function () {
		DEBUG = true;
	});

	flags.add(['r', 'refresh'], function () {
		REFRESH = true;
	});

	flags.add(['l', 'logging'], function () {
		LOGGING = true;
	});

	flags.add(['b', 'verbose'], function () {
		VERBOSE = true;
	});

	flags.add(['p', 'production'], function () {
		PRODUCTION = true;
	});

	flags.add('port', function (port) {
		port = parseInt(port);

		if ( !port ) {
			throw TypeError('port must be an integer, got ' + port);
		}

		PORT = port;
	});

	flags.add('host', function (host) {
		API_HOST = host;
	});

	flags.add('zerver-dir', function (dir) {
		API_DIR = dir;
	});

	flags.arg('dir', function (dir) {
		CWD = path.join(process.cwd(), dir);
	});

	flags.add('manifest', function (manifest) {
		MANIFESTS.push(manifest);
	});

	flags.run(process.env.ZERVER_FLAGS);

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



function main () {
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

	try {
		require('socket.io');
		require('stalker'  );
	}
	catch (err) {
		console.error('please install zerver dev dependencies to use debug mode');
		console.error('command: npm install --dev zerver');
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



main();
