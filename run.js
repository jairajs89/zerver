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
	var envConfig = process.env.ZERVER;

	if (envConfig) {
		var m;
		while (m = ENV_MATCHER.exec(envConfig)) {
			switch ( m[1] ) {
				case 'd':
				case 'debug':
					if (m[2] === 'true') {
						DEBUG = true;
					}
					else if (m[2] === 'false') {
						DEBUG = false;
					}
					else {
						console.warn('[WARNING] ignoring invalid env debug=' + m[2]);
					}
					break;
				case 'r':
				case 'refresh':
					if (m[2] === 'true') {
						REFRESH = true;
					}
					else if (m[2] === 'false') {
						REFRESH = false;
					}
					else {
						console.warn('[WARNING] ignoring invalid env refresh=' + m[2]);
					}
					break;
				case 'l':
				case 'logging':
					if (m[2] === 'true') {
						LOGGING = true;
					}
					else if (m[2] === 'false') {
						LOGGING = false;
					}
					else {
						console.warn('[WARNING] ignoring invalid env logging=' + m[2]);
					}
					break;
				case 'b':
				case 'verbose':
					if (m[2] === 'true') {
						VERBOSE = true;
					}
					else if (m[2] === 'false') {
						VERBOSE = false;
					}
					else {
						console.warn('[WARNING] ignoring invalid env verbose=' + m[2]);
					}
					break;
				case 'p':
				case 'production':
					if (m[2] === 'true') {
						PRODUCTION = true;
					}
					else if (m[2] === 'false') {
						PRODUCTION = false;
					}
					else {
						console.warn('[WARNING] ignoring invalid env production=' + m[2]);
					}
					break;
				case 'port':
					var envPort = parseInt( m[2] );
					if (envPort) {
						PORT = envPort;
					}
					else {
						console.warn('[WARNING] ignoring invalid env port=' + m[2]);
					}
					break;
				case 'host':
					API_HOST = m[2];
					break;
				default:
					console.warn('[WARNING] ignoring invalid env '+m[1]+'='+m[2]);
					break;
			}
		}
	}

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

	flags.run();

	if (PRODUCTION) {
		DEBUG   = false;
		REFRESH = false;
		LOGGING = false;
	}
	else {
		if (LOGGING) {
			REFRESH = true;
		}
		if (REFRESH) {
			DEBUG = true;
		}
	}
}



function main () {
	processFlags();

	var death    = false,
		apiDir   = CWD + '/' + API_DIR,
		apiCheck = new RegExp('^' + CWD + '/' + API_DIR),
		args     = [ PORT, API_DIR, (DEBUG ? '1' : '0'), (REFRESH ? '1' : '0'), (LOGGING ? '1' : '0'), (VERBOSE ? '1' : '0'), MANIFESTS.join(','), (PRODUCTION ? '1' : '0'), (API_HOST || '')],
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
