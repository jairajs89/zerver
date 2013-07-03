var fs   = require('fs'  ),
	path = require('path');

var watched  = {},
	handles  = {},
	maxFiles = 1500;

exports.watch = function (reqPath, onChange) {
	watchFolder(path.resolve(reqPath), onChange);
};



function watchFolder (folderPath, onChange, shouldPrune, noReset) {
	if (!noReset && handles[folderPath]) {
		handles[folderPath].close();
	}

	fs.stat(folderPath, function (err, stats) {
		if (err || (Object.keys(handles).length >= maxFiles)) {
			return;
		}

		if ( stats.isFile() ) {
			if ( handles[folderPath] ) {
				handles[folderPath].close();
			}
			try {
				handles[folderPath] = fs.watch(folderPath, function () {
					onChange(folderPath);
				});
			} catch (err) {
				maxFiles = parseInt(Object.keys(handles).length * 0.75);
			}
			addFile(folderPath, stats);
			onChange(folderPath);
			return;
		}
		else if ( !stats.isDirectory() ) {
			return;
		}

		addFile(folderPath, stats);

		if ( !noReset ) {
			try {
				handles[folderPath] = fs.watch(folderPath, function (evt) {
					watchFolder(folderPath, onChange, true, (evt === 'change'));
				});
			} catch (err) {
				maxFiles = parseInt(Object.keys(handles).length * 0.75);
			}
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
				watchFolder(fPath, onChange);
			});
		});

		if (shouldPrune) {
			pruneDir(folderPath, onChange);
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

function pruneDir (dir, onChange, force) {
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
			pruneDir(fPath, onChange, true);
			delete watched[fPath];
		}
		else {
			if ( handles[fPath] ) {
				handles[fPath].close();
				delete handles[fPath];
			}
			delete watched[dir].files[file];
			onChange(fPath);
		}
	}
}
