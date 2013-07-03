var fs      = require('fs'),
	path    = require('path'),
	stalker = require(__dirname + '/stalker');

var MAX_FILES = 1;

var numFiles = 0;



exports.watch = function (dir, callback) {
	var files = {};

	if (dir[dir.length-1] === '/') {
		dir = dir.substr(0, dir.length-1);
	}

	findSync(dir).forEach(function (fileName) {
		setupWatcher(fileName);
	});

	stalker.watch(
		dir,
		function (fileName) {
			setupWatcher(fileName);
			changeDetected(fileName);
		},
		function (fileName) {
			destroyWatcher(fileName);
			changeDetected(fileName);
		}
	);

	function setupWatcher (fileName) {
		if (numFiles >= MAX_FILES) {
			return;
		}

		if ( files[fileName] ) {
			return;
		}

		for (var parts=fileName.split('/'), i=0, l=parts.length; i<l; i++) {
			if (parts[i][0] === '.') {
				return;
			}
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
		numFiles++;
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
		numFiles--;
	}

	function changeDetected (fileName) {
		callback(fileName);
	}
};



function findSync (dir) {
	var inodes    = {},
		files     = [],
		fileQueue = [];

	prepopulateQueue();
	processQueue();
	return files;

	function prepopulateQueue () {
		var stat = fs.lstatSync(dir);
		if ( stat.isDirectory() ) {
			fs.readdirSync(dir).forEach(function (f) {
				fileQueue.push(path.join(dir, f));
			});
		}
		else {
			fileQueue.push(dir);
		}
	}

	function processQueue () {
		var file, stat;

		while (fileQueue.length) {
			if (files.length >= MAX_FILES) {
				return;
			}

			file = fileQueue.shift();
			stat = fs.lstatSync(file);
			if ( inodes[stat.ino] ) {
				continue;
			}

			inodes[stat.ino] = true;
			files.push(file);

			if ( stat.isDirectory() ) {
				fs.readdirSync(file).forEach(function (f) {
					fileQueue.push(path.join(file, f));
				});
			}
		}
	}
}
