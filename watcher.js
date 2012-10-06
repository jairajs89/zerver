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
			changeDetected(fileName);
		},
		function (err, fileName) {
			destroyWatcher(fileName);
			changeDetected(fileName);
		}
	);

	function setupWatcher (fileName) {
		if ( files[fileName] ) {
			return;
		}

		var watcher;

		if (fs.watch) {
			watcher = fs.watch(fileName, function () {
				changeDetected(fileName);
			});
		}
		else {
			fs.watchFile(fileName, function () {
				changeDetected(fileName);
			});
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

	function changeDetected (fileName) {
		callback(fileName);
	}
};
