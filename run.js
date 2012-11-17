#!/usr/bin/env node

var path = require('path'),
	fork = require('child_process').fork;

var ZERVER         = __dirname + '/zerver',
	WATCHER        = __dirname + '/watcher',
	PACKAGE        = __dirname + '/package.json',
	API_DIR        = 'zerver',
	CWD            = process.cwd(),
	CHANGE_TIMEOUT = 1000,
	DEBUG          = false,
	REFRESH        = false,
	PRODUCTION     = false,
	PORT           = process.env.PORT || 8888;
	MANIFESTS	   = [];



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
		DEBUG   = true;
		REFRESH = true;
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

	flags.add('zerver-dir', function (dir) {
		API_DIR = dir;
	});

	flags.arg('dir', function (dir) {
		CWD = path.join(process.cwd(), dir);
	});

	flags.add('manifest', function (manifest) {
		MANIFESTS.push(manifest);
	});

	flags.run();

	if (PRODUCTION) {
		DEBUG   = false;
		REFRESH = false;
	}
}



function main () {
	processFlags();

	var death    = false,
		apiDir   = CWD + '/' + API_DIR,
		apiCheck = new RegExp('^' + CWD + '/' + API_DIR),
		args     = [ PORT, API_DIR, (DEBUG ? '1' : '0'), (REFRESH ? '1' : '0'), MANIFESTS.join(','), (PRODUCTION ? '1' : '0')],
		opts     = { cwd : CWD },
		child;

	function runServer (noRestart) {
		child = fork(ZERVER, args, opts);

		child.on('exit', function () {
			if ( !death ) {
				noRestart ? process.exit() : runServer();
			}
		});
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

	var watcher    = require(WATCHER),
		lastChange = null;

	watcher.watch(CWD, function (fileName) {
		if (lastChange === null) {
			return;
		}

		if ( !apiCheck.test(fileName) ) {
			child.send({ debugRefresh: true });
			return;
		}

		var time   = new Date();
		lastChange = time;

		setTimeout(function () {
			if (lastChange !== time) {
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
