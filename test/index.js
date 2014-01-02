var fs = require('fs');

var time  = new Date(),
	queue = [];

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
			var file = findFile(filename);
			if ( isFile(file) ) {
				throw Error('directory is a file, ' + filename);
			}
			return Object.keys(file);
		};

		fs.readFileSync = function (filename) {
			var file = findFile(filename);
			if ( !isFile(file) ) {
				throw Error('file is a directory, ' + filename);
			}
			return file;
		};

		fs.statSync = function (filename) {
			var file = findFile(filename);
			return {
				isDirectory: function () {
					return !isFile(file);
				},
				mtime: time
			};
		};

		testObj(root, function (obj) {
			callback(obj, files, dequeue);
		});
	});
}
