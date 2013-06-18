var fs   = require('fs'  ),
	path = require('path');

var watched = [],
	handles = {};

exports.watch = watchDirectory;



function watchDirectory (reqPath, fnAdd, fnRemove) {
	watchFolderTree(path.resolve(reqPath), fnAdd, fnRemove);
}



function removeSubDir (dir, fn) {
	if ( !watched[dir] ) {
		return;
	}

	if (watched[dir].files) {
		Object.keys(watched[dir].files).forEach(function (iFile) {
			var fPath = dir+'/'+iFile;
			if ( watched[fPath] ) {
				removeSubDir(fPath, fn);
			}
			else {
				fn && fn(fPath);
			}
		});
	}

	delete watched[dir];
}

function checkFile (fPath, fn) {
	var dir  = path.dirname(fPath),
		base = path.basename(fPath);

	if (typeof watched === 'undefined') {
		fn && fn(false);
		return;
	}

	fs.stat(fPath, function (err, stats) {
		if (err) {
			fn && fn(false);
			return;
		}

		if ((typeof watched[dir] === 'undefined') || (typeof watched[dir].files === 'undefined')) {
			fn && fn(false);
			return;
		}

		fn && fn(typeof watched[dir].files[base] !== 'undefined');
	});
}

function addFile (fPath, fn) {
	var dir  = path.dirname(fPath),
		base = path.basename(fPath);

	if (typeof watched[dir] === 'undefined') {
		watched[dir] = {};
	}
	if (typeof watched[dir].files === 'undefined') {
		watched[dir].files = {};
	}

	fs.stat(fPath, function (err, stats) {
		if (err) {
			return;
		}
		watched[dir].files[base] = stats.mtime.valueOf();
		fn && fn();
	});
}

function syncFolder (dir, fnRemove) {
	if ((typeof watched[dir] === 'undefined') || (typeof watched[dir].files === 'undefined')) {
		return;
	}

	Object.keys(watched[dir].files).forEach(function (tFile) {
		var fPath = path.join(dir, tFile);
		fs.stat(fPath, function (err, stats) {
			if ( !err ) {
				return;
			}

			if ( watched[fPath] ) {
				removeSubDir(fPath, fnRemove);
			}
			else {
				delete watched[dir].files[tFile];
				fnRemove && fnRemove(fPath);
			}
		});
	});
}



function watchFolderTree (fPath, fnAdd, fnRemove) {
	fs.stat(fPath, function (err, stats) {
		if (err) {
			return;
		}

		if ( stats.isDirectory() ) {
			checkFile(fPath, function (result) {
				if ( !result ) {
					addFile(fPath, function () {
						if (typeof handles[fPath] === 'object') {
							handles[fPath].close();
						}
						handles[fPath] = fs.watch(fPath, folderChanged(fPath, fnAdd, fnRemove));
					});
				}
			});

			fs.readdir(fPath, function (err, files) {
				if ( !err ) {
					files.forEach(function (file) {
						if (file[0] !== '.') {
							var rPath = path.join(fPath, file);
							watchFolderTree(rPath, fnAdd, fnRemove);
						}
					});
				}
			});
		}
		else if ( stats.isFile() ) {
			checkFile(fPath, function (result) {
				if ( !result ) {
					addFile(fPath, function () {
						fnAdd(fPath);
					});
				}
			});
		}
	});
}

function folderChanged (folderPath, fnAdd, fnRemove) {
	return function (event, filename) {
		var reset = (event !== 'change');

		if (reset) {
			handles[folderPath].close();
		}

		fs.stat(folderPath, function (err) {
			if (err) {
				return;
			}

			if (reset) {
				handles[folderPath] = fs.watch(folderPath, folderChanged(folderPath, fnAdd, fnRemove));
			}

			fs.readdir(folderPath, function (err, files) {
				if ( !err ) {
					files.forEach(function (file) {
						if (file[0] !== '.') {
							var fPath = path.join(folderPath, file);
							fs.stat(fPath, function (err, stats) {
								if (err) {
									return;
								}

								if ( stats.isFile() ) {
									checkFile(fPath, function (result) {
										if ( !result ) {
											addFile(fPath, function () {
												return fnAdd && fnAdd(fPath);
											});
										}
									});
								}
								else if ( stats.isDirectory() ) {
									watchFolderTree(fPath, fnAdd, fnRemove);
								}
							});
						}
					});
				}
			});

			syncFolder(folderPath, fnRemove);
		});
	};
}
