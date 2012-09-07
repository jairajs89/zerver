#!/usr/bin/env node --no-deprecation

var ZERVER         = __dirname + '/zerver',
	WATCHER        = __dirname + '/watcher',
	API_DIR        = 'zerver',
	CHANGE_TIMEOUT = 1000,
	DEBUG          = false,
	PORT           = 8888;



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

	flags.add('dir', function (dir) {
		API_DIR = dir;
	});

	flags.run();
}



function main () {
	processFlags();

	if ( !DEBUG ) {
		var zerver = require(ZERVER);
		zerver.run(PORT, API_DIR, DEBUG);
		return;
	}

	var fork    = require('child_process').fork,
		watcher = require(WATCHER);

	var apiDir = process.cwd() + '/' + API_DIR,
		args   = [ PORT, API_DIR ];

	var child      = fork(ZERVER, args),
		lastChange = null;

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
			child = fork(ZERVER, args);
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
