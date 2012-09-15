#!/usr/bin/env node

var path = require('path'),
	fork = require('child_process').fork;

var ZERVER         = __dirname + '/zerver',
	WATCHER        = __dirname + '/watcher',
	API_DIR        = 'zerver',
	CWD            = process.cwd(),
	CHANGE_TIMEOUT = 1000,
	DEBUG          = false,
	PORT           = 8888;
	MANIFESTS	   = [];



function processFlags () {
	var flags = require(__dirname + '/flags');

	flags.add(['d', 'debug'], function () {
		DEBUG = true;
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
}



function main () {
	processFlags();

	var apiDir = CWD + '/' + API_DIR,
		args   = [ PORT, API_DIR, (DEBUG ? '1' : '0'), MANIFESTS.join(',')],
		opts   = { cwd : CWD },
		child;

	function runServer () {
		child = fork(ZERVER, args, opts);
	}

	if ( !DEBUG ) {
		runServer();
		return;
	}

	var watcher = require(WATCHER);

	var lastChange = null;

	runServer();

	watcher.watch(apiDir, function () {
		if (lastChange === null) {
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
			runServer();
		}, CHANGE_TIMEOUT);
	});

	setTimeout(function () {
		lastChange = new Date();
	}, 500);

	process.on('exit', function () {
		try {
			child.kill();
		}
		catch (err) {}
	});
}



main();
