var fs      = require('fs'),
	path    = require('path'),
	stalker = require(__dirname + '/stalker');



exports.watch = function (dir, callback) {
	var filesNames = findSync(dir),
		files      = {};

	filesNames.forEach(function (fileName) {
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



// taken from node-findit@0.1.2
// wasnt included as a dependency because its
// devDependencies tend to take *really* long
// to install with all that C compilation.

function createInodeChecker () {
    var inodes = {};
    return function inodeSeen(inode) {
        if (inodes[inode]) {
            return true;
        } else {
            inodes[inode] = true;
            return false;
        }
    }
}

function findSync (dir, options, callback) {
    cb = arguments[arguments.length - 1];
    if (typeof(cb) !== 'function') {
        cb = undefined;
    }
    var inodeSeen = createInodeChecker();
    var files = [];
    var fileQueue = [];
    var processFile = function processFile(file) {
        var stat = fs.lstatSync(file);
        if (inodeSeen(stat.ino)) {
            return;
        }
        files.push(file);
        cb && cb(file, stat)
        if (stat.isDirectory()) {
            fs.readdirSync(file).forEach(function(f) { fileQueue.push(path.join(file, f)); });
        } else if (stat.isSymbolicLink()) {
            if (options && options.follow_symlinks && path.existsSync(file)) {
                fileQueue.push(fs.realpathSync(file));
            }
        }
    };
    /* we don't include the starting directory unless it is a file */
    var stat = fs.lstatSync(dir);
    if (stat.isDirectory()) {
        fs.readdirSync(dir).forEach(function(f) { fileQueue.push(path.join(dir, f)); });
    } else {
        fileQueue.push(dir);
    }
    while (fileQueue.length > 0) {
        processFile(fileQueue.shift());
    }
    return files;
};
