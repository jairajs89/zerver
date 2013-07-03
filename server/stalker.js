var fs   = require('fs'  ),
	path = require('path');

var watched = [],
	handles = {};

exports.watch = function (reqPath, fnAdd, fnRemove) {
	watchFolder(path.resolve(reqPath), fnAdd, fnRemove);
};



function watchFolder (folderPath, fnAdd, fnRemove, shouldPrune, noReset) {
	if (!noReset && handles[folderPath]) {
		handles[folderPath].close();
	}

	fs.stat(folderPath, function (err, stats) {
		if (err) {
			return;
		}

		if ( stats.isFile() ) {
			addFile(folderPath, stats);
			fnAdd(folderPath);
			return;
		}
		else if ( !stats.isDirectory() ) {
			return;
		}

		addFile(folderPath, stats);

		if ( !noReset ) {
			handles[folderPath] = fs.watch(folderPath, function (evt) {
				watchFolder(folderPath, fnAdd, fnRemove, true, (evt === 'change'));
			});
		}

		fs.readdir(folderPath, function (err, files) {
			if (err) {
				return;
			}
			files.forEach(function (file) {
				if (file[0] === '.') {
					return;
				}
				var fPath = path.join(folderPath, file);
				watchFolder(fPath, fnAdd, fnRemove);
			});
		});

		if (shouldPrune) {
			pruneDir(folderPath, fnRemove);
		}
	});
}

function addFile (fPath, stats) {
	var dir  = path.dirname(fPath),
		base = path.basename(fPath);

	if ( !watched[dir] ) {
		watched[dir] = {};
	}
	if ( !watched[dir].files ) {
		watched[dir].files = {};
	}
	watched[dir].files[base] = stats.mtime.valueOf();
}

function pruneDir (dir, fnRemove, force) {
	if (!watched[dir] || !watched[dir].files) {
		return;
	}

	Object.keys(watched[dir].files).forEach(function (file) {
		var fPath = path.join(dir, file);

		if (force) {
			pruneFile(fPath, file);
		}
		else {
			fs.stat(fPath, function (err, stats) {
				if (err) {
					pruneFile(fPath, file);
				}
			});
		}
	});

	function pruneFile (fPath, file) {
		if ( watched[fPath] ) {
			pruneDir(fPath, fnRemove, true);
			delete watched[fPath];
		}
		else {
			delete watched[dir].files[file];
			fnRemove(fPath);
		}
	}
}
