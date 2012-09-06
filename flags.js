var path = require('path');



var FLAG_MATCHER = /^(\w+)(?:\=(\w*))?$/,
	FUNC_MATCHER = /^[^\(]*\(([^\)]*)/;

var flagHandlers = {};



exports.add = function (flag, handler) {
	if ( Array.isArray(flag) ) {
		flag.forEach(function (singleFlag) {
			exports.add(singleFlag, handler);
		});
		return;
	}

	flagHandlers[flag] = handler;
};



exports.run = function () {
	process.argv.slice(2).forEach(function (arg) {
		if (arg[0] !== '-') {
			usageError();
		}

		else if (arg[1] === '-') {
			var match = FLAG_MATCHER.exec( arg.substr(2) );

			if (match) {
				try {
					flagHandlers[ match[1] ]( match[2] );
				}
				catch (err) {
					usageError();
				}
			}
			else {
				usageError();
			}
		}

		else {
			Array.prototype.slice.call( arg.substr(1) ).forEach(function (flag) {
				try {
					flagHandlers[flag]();
				}
				catch (err) {
					usageError();
				}
			});
		}
	});
};



function usageError () {
	var usage = 'Usage: ' + path.basename( process.argv[1] ),
		match;

	for (var flag in flagHandlers) {
		match = FUNC_MATCHER.exec( flagHandlers[flag] );

		if (match && match[1]) {
			usage += ' [--' + flag + '=VALUE]';
		}
		else if (flag.length > 1) {
			usage += ' [--' + flag + ']';
		}
		else {
			usage += ' [-' + flag + ']';
		}
	}

	console.error(usage);
	process.exit(1);
}
