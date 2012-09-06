var fs      = require('fs'),
	findit  = require('findit'),
	stalker = require('stalker');




exports.watch = function (dir, callback) {
	var filesNames = findit.sync(dir),
		files      = {};

	filesNames.forEach(function (fileName) {
		setupWatcher(fileName);
	});

	stalker.watch(
		dir,
		function (err, fileName) {
			setupWatcher(fileName);
			changeDetected();
		},
		function (err, fileName) {
			destroyWatcher(fileName);
			changeDetected();
		}
	);

	function setupWatcher (fileName) {
		if ( files[fileName] ) {
			return;
		}

		var watcher;

		if (fs.watch) {
			watcher = fs.watch(fileName, changeDetected);
		}
		else {
			fs.watchFile(fileName, changeDetected);
			watcher = true;
		}

		files[fileName] = watcher;
	}

	function destroyWatcher (fileName) {
		var watcher = files[fileName];

		if ( !watcher ) {
			return;
		}

		if (watcher !== true) {
			watcher.close();
		}
		else {
			fs.unwatchFile(fileName);
		}

		delete files[fileName];
	}

	function changeDetected () {
		callback();
	}
};
