var fs   = require('fs'),
	path = require('path');

var projectRoot = path.resolve(__dirname+'/../'),
	time        = new Date(),
	queue       = [],
	fs_dir      = fs.readdirSync,
	fs_read     = fs.readFileSync,
	fs_stat     = fs.statSync,
	fs_lstat    = fs.lstatSync;

exports.time    = time;
exports.runTest = runTest;

require(__dirname+'/static');
require(__dirname+'/api'   );



function queueTask(task) {
	queue.push(task);
	if (queue.length === 1) {
		process.nextTick(runTask);
	}
}

function runTask() {
	var task = queue[0];
	if (task) {
		task(function () {
			queue.shift();
			process.nextTick(runTask);
		});
	}
}

function runTest(testObj, files, callback) {
	var root = '';

	function isRoot(filename) {
		return (filename === root || filename === root+'/');
	}

	function isFile(file) {
		return (typeof file === 'string' || Buffer.isBuffer(file))
	}

	function findFile(filename) {
		if (filename[filename.length-1] === '/') {
			filename = filename.substr(0, filename.length-1);
		}
		var segments = filename.split('/').slice(1),
			folder   = files,
			segment;
		while (segment = segments.shift()) {
			if ( !(segment in folder) ) {
				throw Error('file not found, ' + filename);
			}
			folder = folder[segment];
		}
		return folder;
	}

	queueTask(function (dequeue) {
		fs.readdirSync = function (filename) {
			if (filename.substr(0, projectRoot.length) === projectRoot) {
				return fs_dir.call(fs, filename);
			}
			var file = findFile(filename);
			if ( isFile(file) ) {
				throw Error('directory is a file, ' + filename);
			}
			return Object.keys(file);
		};

		fs.readFileSync = function (filename) {
			if (filename.substr(0, projectRoot.length) === projectRoot) {
				return fs_read.call(fs, filename);
			}
			var file = findFile(filename);
			if ( !isFile(file) ) {
				throw Error('file is a directory, ' + filename);
			}
			return file;
		};

		fs.statSync = function (filename) {
			if (filename.substr(0, projectRoot.length) === projectRoot) {
				return fs_stat.call(fs, filename);
			} else {
				return statFile(filename);
			}
		};

		fs.lstatSync = function (filename) {
			if (filename.substr(0, projectRoot.length) === projectRoot) {
				return fs_lstat.call(fs, filename);
			} else {
				return statFile(filename);
			}
		};

		function statFile(filename) {
			var file = findFile(filename);
			return {
				//TODO
				// dev: 16777218,
				// mode: 16877,
				// nlink: 12,
				// uid: 501,
				// gid: 20,
				// rdev: 0,
				// blksize: 4096,
				// ino: 44737575,
				// size: 408,
				// blocks: 0,
				atime: time,
				mtime: time,
				ctime: time,
				isDirectory: function () {
					return !isFile(file);
				},
				isFile: function () {
					return !isFile(file);
				},
				isBlockDevice: function () {
					return false;
				},
				isCharacterDevice: function () {
					return false;
				},
				isSymbolicLink: function () {
					return false;
				},
				isFiFO: function () {
					return false;
				},
				isSocket: function () {
					return false;
				},
			};
		}

		testObj(root, function (obj) {
			callback(obj, files, dequeue);
		});
	});
}
