var extend = require('util')._extend,
	crypto = require('crypto'),
	path   = require('path'),
	fs     = require('fs'),
	uglify = require('uglify-js'),
	zlib   = require('zlib'),
	mime   = require('mime'),
	urllib = require('url'),
	clean  = require(__dirname+'/clean-css');

var DEBUG_LINES         = /\s*\;\;\;.*/g,
	CSS_IMAGE           = /url\([\'\"]?([^\)]+)[\'\"]?\)/g,
	SCRIPT_MATCH        = /\<script(?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s+src\=[\'\"]\s*([^\>]+)\s*[\'\"](?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s*\>\<\/script\>/g,
	STYLES_MATCH        = /\<link(?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s+href\=[\'\"]\s*([^\>]+)\s*[\'\"](?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s*\/?\>/g,
	CONCAT_MATCH        = /\<\!\-\-\s*zerver\:(\S+)\s*\-\-\>((\s|\S)*?)\<\!\-\-\s*\/zerver\s*\-\-\>/g,
	MANIFEST_CONCAT     = /\s*\#\s*zerver\:(\S+)\s*/g,
	MANIFEST_CONCAT_END = /\s*\#\s*\/zerver\s*/g,
	GZIPPABLE           = {
		'application/json'       : true ,
		'application/javascript' : true ,
		'text/css'               : true ,
		'text/html'              : true ,
		'text/plain'             : true ,
		'text/cache-manifest'    : true ,
	};

module.exports = StaticFiles;



function StaticFiles(rootDir, options, callback) {
	var self     = this;
	self._root   = rootDir;
	self.options = extend({
		ignores         : null  ,
		memoryCache     : false ,
		cache           : null  ,
		disableManifest : false ,
		ignoreManifest  : null  ,
		gzip            : false ,
		compile         : false ,
		inline          : false ,
		concat          : false ,
	}, options);

	if (options.concat) {
		self.concats = {};
	}

	if (options.memoryCache) {
		self._cache = {};
	}
	self._defaultCache = (options.memoryCache ? 300 : 0),
	self._customCache = {};
	if (options.cache && self._cache) {
		options.cache.split(',').forEach(function (segment) {
			var parts = segment.split(':'),
				path, life;
			switch (parts.length) {
				case 1:
					life = parseInt(parts[0]);
					break;
				case 2:
					path = parts[0];
					life = parseInt(parts[1]);
					break;
				default:
					break;
			}
			if (isNaN(life) || (life < 0)) {
				throw TypeError('invalid cache directive: ' + segment);
			} else if ( !path ) {
				self._defaultCache = life;
			} else {
				self._customCache[relativePath('/',path)] = life;
			}
		});
	}

	if (options.ignores) {
		self._ignores = options.ignores.split(',');
	} else {
		self._ignores = [];
	}

	if (options.disableManifest) {
		self._manifests = {};
	} else {
		self._manifests = detectManifests(self._root, self._ignores);
		if (options.ignoreManifest) {
			options.ignoreManifest.split(',').forEach(function (pathname) {
				pathname = relativePath('/', pathname);
				if ( self._manifests[pathname] ) {
					delete self._manifests[pathname];
				} else {
					throw Error(pathname+' is not a manifest file, cannot ignore');
				}
			});
		}
	}

	if (self._cache) {
		self._loadCache(callback);
	} else {
		callback();
	}
}



/* Construct cache */

StaticFiles.prototype._loadCache = function (callback) {
	if ( !this._cache ) {
		throw Error('loadCache requires cache mode to be enabled');
	}
	var self = this;
	walkDirectory(self._root, self._ignores, function (pathname, next) {
		self._cacheFile(pathname, next);
	}, function () {
		if ( !self.concats ) {
			callback();
			return;
		}
		asyncJoin(
			Object.keys(self.concats).map(function (pathname) {
				return function (respond) {
					self._cacheConcatFile(pathname, respond);
				};
			}),
			function () {
				callback();
			}
		);
	});
};

StaticFiles.prototype._cacheFile = function (pathname, callback) {
	var self = this;

	if ( !self._cache ) {
		throw Error('cacheFile requires cache mode to be enabled');
	}
	if (self._cache[pathname] === false) {
		throw Error('circular dependency detected for '+pathname);
	}
	if ( self._cache[pathname] ) {
		callback(self._cache[pathname].headers, self._cache[pathname].body);
		return;
	}

	var altPath;
	if (pathname.split('/').pop() === 'index.html') {
		altPath = pathname.split('/').slice(0,-1).join('/')+'/';
	}

	self._cache[pathname] = false;
	if (altPath) {
		self._cache[altPath] = false;
	}

	var filePath = path.join(self._root, pathname),
		body     = fs.readFileSync(filePath, 'binary'),
		headers  = {
			'Content-Type'  : (mime.lookup(filePath) || 'application/octet-stream'),
			'Cache-Control' : self._getCacheControl(pathname),
		};

	asyncForEach([
		'prepareManifest',
		'inlineManifestFiles',
		'prepareManifestConcatFiles',
		'prepareConcatFiles',
		'inlineScripts',
		'inlineStyles',
		'inlineImages',
		'compileOutput',
		'gzipOutput',
	], function (transform, next) {
		self['_'+transform](pathname, headers, body, function (newHeaders, newBody) {
			headers = newHeaders;
			body    = newBody;
			next();
		});
	}, function () {
		var hash = crypto.createHash('md5');
		hash.update(body);
		headers['ETag'] = '"'+hash.digest('hex')+'"';
		headers['Vary'] = 'Accept-Encoding';

		self._cache[pathname] = {
			headers : headers ,
			body    : body    ,
		};
		if (altPath) {
			self._cache[altPath] = self._cache[pathname];
		}
		callback(headers, body);
	})
};

StaticFiles.prototype._cacheConcatFile = function (pathname, callback) {
	var self = this;

	if ( !self._cache ) {
		throw Error('cacheConcatFile requires cache mode to be enabled');
	}
	if (self._cache[pathname] === false) {
		throw Error('circular dependency detected for '+pathname);
	}
	if ( self._cache[pathname] ) {
		callback(self._cache[pathname].headers, self._cache[pathname].body);
		return;
	}
	if ( !(pathname in self.concats) ) {
		throw Error('path is not a concat file, ' + pathname);
	}

	var altPath;
	if (pathname.split('/').pop() === 'index.html') {
		altPath = pathname.split('/').slice(0,-1).join('/')+'/';
	}

	self._cache[pathname] = false;
	if (altPath) {
		self._cache[altPath] = false;
	}

	var filePath = path.join(self._root, pathname),
		headers  = {
			'Content-Type'  : (mime.lookup(filePath) || 'application/octet-stream'),
			'Cache-Control' : self._getCacheControl(pathname),
		};

	asyncJoin(
		self.concats[pathname].map(function (partPath) {
			return function (respond) {
				var cached = self._cache[partPath];
				if ( !cached ) {
					throw Error('file not found for concat, '+partPath);
				}
				if (cached.headers['Content-Encoding'] === 'gzip') {
					zlib.gunzip(cached.body, function (err, body) {
						if (err) {
							throw Error('failed to gunzip file, '+partPath);
						} else {
							respond(body);
						}
					});
				} else {
					respond(cached.body);
				}
			};
		}),
		function (parts) {
			var body = parts.join('\n');

			var hash = crypto.createHash('md5');
			hash.update(body);
			headers['ETag'] = '"'+hash.digest('hex')+'"';
			headers['Vary'] = 'Accept-Encoding';

			self._cache[pathname] = {
				headers : headers ,
				body    : body    ,
			};
			if (altPath) {
				self._cache[altPath] = self._cache[pathname];
			}
			callback(headers, body);
		}
	);
};

StaticFiles.prototype._getCacheControl = function (pathname) {
	var seconds = this._defaultCache;
	for (var prefix in this._customCache) {
		if (pathname.substr(0, prefix.length) === prefix) {
			seconds = this._customCache[prefix];
			break;
		}
	}
	if (seconds === 0) {
		return 'no-cache';
	} else {
		return 'public, max-age='+seconds;
	}
};

StaticFiles.prototype._prepareManifest = function (pathname, headers, body, callback) {
	if ( !this._manifests[pathname] ) {
		callback(headers, body);
		return;
	}

	body += '\n# Zerver timestamp: ' + getLastModifiedTimestamp(this._root, this._ignores);
	callback(headers, body);
};

StaticFiles.prototype._inlineManifestFiles = function (pathname, headers, body, callback) {
	if (!this.options.inline || !this._manifests[pathname]) {
		callback(headers, body);
		return;
	}

	var lines = body.split('\n');

	for (var i=0, l=lines.length; i<l; i++) {
		var urlParts;
		try {
			urlParts = urllib.parse(lines[i], true);
		} catch (err) {}
		if (urlParts && urlParts.query.inline) {
			lines.splice(i, 1);
			i--;
			l--;
		}
	}

	body = lines.join('\n');
	callback(headers, body);
};

StaticFiles.prototype._prepareManifestConcatFiles = function (pathname, headers, body, callback) {
	if (!this.concats || !this._manifests[pathname]) {
		callback(headers, body);
		return;
	}

	var lines = body.split('\n'),
		concatFile, concatIndex;

	for (var i=0, l=lines.length; i<l; i++) {
		lines[i] = lines[i].trim();

		if ( !concatFile ) {
			var match = MANIFEST_CONCAT.exec( lines[i] );
			if (match) {
				concatFile  = match[1];
				concatIndex = i;
			}
		} else if ( MANIFEST_CONCAT_END.test( lines[i] ) ) {
			var sectionLength = i-concatIndex+1,
				concatList    = lines.splice(concatIndex, sectionLength),
				absPath       = relativePath(pathname, concatFile);

			concatList.shift();
			concatList.pop();
			concatList = concatList.map(function (fileName) {
				return relativePath(pathname, fileName);
			});
			i -= sectionLength;
			l -= sectionLength;

			lines.splice(i+1, 0, concatFile);
			l++;

			if (absPath in this.concats) {
				if (this.concats[absPath].join('\n') !== concatList.join('\n')) {
					throw Error('Concat files did not match: '+absPath+'\nEnsure that the order and names of the files are the same in both HTML and manifest files');
				}
			}

			this.concats[absPath] = concatList;
			concatFile = null;
		} else if ( !lines[i] ) {
			lines.splice(i, 1);
			i--;
			l--;
		}
	}

	body = lines.join('\n');
	callback(headers, body);
};

StaticFiles.prototype._prepareConcatFiles = function (pathname, headers, body, callback) {
	if (!this.concats || (headers['Content-Type'] !== 'text/html')) {
		callback(headers, body);
		return;
	}

	var self = this;

	body = body.replace(CONCAT_MATCH, function (original, concatPath, concatables) {
		var files   = [],
			absPath = relativePath(pathname, concatPath),
			fileType, match;

		if ( !fileType ) {
			while (match=SCRIPT_MATCH.exec(concatables)) {
				fileType = 'js';
				files.push( relativePath(pathname, match[1]) );
			}
		}

		if ( !fileType ) {
			while (match=STYLES_MATCH.exec(concatables)) {
				fileType = 'css';
				files.push( relativePath(pathname, match[1]) );
			}
		}

		if ( !fileType ) {
			return original;
		}

		if (absPath in self.concats) {
			if (self.concats[absPath].join('\n') !== files.join('\n')) {
				throw Error('Concat files did not match: '+absPath+'\nEnsure that the order and names of the files are the same in both HTML and manifest files');
			}
		}

		self.concats[absPath] = files;

		switch (fileType) {
			case 'js':
				return '<script src="'+concatPath+'"></script>';

			case 'css':
				return '<link rel="stylesheet" href="'+concatPath+'">';

			default:
				delete self.concats[absPath];
				return original;
		}
	});

	callback(headers, body);
};

StaticFiles.prototype._inlineScripts = function (pathname, headers, body, callback) {
	if (!this.options.inline || (headers['Content-Type'] !== 'text/html')) {
		callback(headers, body);
		return;
	}

	var self = this;
	asyncReplace(body, SCRIPT_MATCH, function (scriptPath, next) {
		if ( !urllib.parse(scriptPath,true).query.inline ) {
			next();
			return;
		}
		var fullPath = relativePath(pathname, scriptPath.split('?')[0]);
		self._cacheFile(fullPath, function (headers, body) {
			if (headers['Content-Encoding'] === 'gzip') {
				zlib.gunzip(body, function (err, newBody) {
					if (err) {
						next();
					} else {
						body = newBody;
						finish();
					}
				});
			} else {
				finish();
			}
			function finish() {
				next('<script>//<![CDATA[\n'+body+'\n//]]></script>');
			}
		});
	}, function (body) {
		callback(headers, body);
	});
};

StaticFiles.prototype._inlineStyles = function (pathname, headers, body, callback) {
	if (!this.options.inline || (headers['Content-Type'] !== 'text/html')) {
		callback(headers, body);
		return;
	}

	var self = this;
	asyncReplace(body, STYLES_MATCH, function (stylePath, next) {
		if ( !urllib.parse(stylePath,true).query.inline ) {
			next();
			return;
		}
		var fullPath = relativePath(pathname, stylePath.split('?')[0]);
		self._cacheFile(fullPath, function (headers, body) {
			if (headers['Content-Encoding'] === 'gzip') {
				zlib.gunzip(body, function (err, newBody) {
					if (err) {
						next();
					} else {
						body = newBody;
						finish();
					}
				});
			} else {
				finish();
			}
			function finish() {
				next('<style>\n'+body+'\n</style>');
			}
		});
	}, function (body) {
		callback(headers, body);
	});
};

StaticFiles.prototype._inlineImages = function (pathname, headers, body, callback) {
	if (!this.options.inline || (headers['Content-Type'] !== 'text/css')) {
		callback(headers, body);
		return;
	}

	var self = this;
	asyncReplace(body, CSS_IMAGE, function (imgPath, respond) {
		if (imgPath.substr(0,5) === 'data:') {
			respond();
			return;
		}
		if ( !urllib.parse(imgPath,true).query.inline ) {
			respond();
			return;
		}
		var fullPath = relativePath(pathname, imgPath.split('?')[0]);
		self._cacheFile(fullPath, function (headers, body) {
			respond('url(data:'+headers['Content-Type']+';base64,'+body.toString('base64')+')');
		});
	}, function (body) {
		callback(headers, body);
	});
};

StaticFiles.prototype._compileOutput = function (pathname, headers, body, callback) {
	if ( !this.options.compile ) {
		callback(headers, body);
		return;
	}

	var code;
	switch (headers['Content-Type']) {
		case 'application/javascript':
			body = body.replace(DEBUG_LINES, '');
			try {
				var ast = uglify.parser.parse(body);
				ast     = uglify.uglify.ast_mangle(ast);
				ast     = uglify.uglify.ast_squeeze(ast);
				code    = uglify.uglify.gen_code(ast);
			} catch (err) {}
			break;

		case 'text/css':
			try{
				code = clean.process(body);
			} catch(err){}
			break;
	}

	if (code) {
		body = code;
	}
	callback(headers, body);
};

StaticFiles.prototype._gzipOutput = function (pathname, headers, body, callback) {
	if (!this.options.gzip || !GZIPPABLE[headers['Content-Type']]) {
		callback(headers, body);
		return;
	}
	zlib.gzip(body, function (err, gzipped) {
		if (err) {
			callback(headers, body);
		} else {
			headers['Content-Encoding'] = 'gzip';
			callback(headers, gzipped);
		}
	});
};



/* Access cache */

StaticFiles.prototype.get = function (pathname) {
	var response;
	if (this._cache) {
		response = this._cache[pathname];
	} else {
		response = this._rawGet(pathname);
	}

	if (response) {
		return {
			headers : extend({}, response.headers),
			body    : response.body,
		};
	}
};

StaticFiles.prototype._rawGet = function (pathname) {
	var filePath = path.join(this._root, pathname),
		file;

	if (pathname.split('/').pop()[0] === '.') {
		return;
	}

	for (var i=0, l=this._ignores.length; i<l; i++) {
		if (pathname.substr(0, this._ignores[i].length) === this._ignores[i]) {
			return;
		}
	}

	try {
		file = fs.readFileSync(filePath);
	} catch (err) {
		return;
	}

	if (pathname in this._manifests) {
		file += '\n# Zerver timestamp: ' + getLastModifiedTimestamp(this._root, this._ignores);
	}

	return {
		body    : file,
		headers : {
			'Content-Type'  : (mime.lookup(filePath) || 'application/octet-stream'),
			'Cache-Control' : this._getCacheControl(pathname),
		}
	};
};

StaticFiles.prototype.has = function (pathname) {
	return (pathname in this._cache);
};

StaticFiles.prototype.dump = function (pathname) {
	if ( !this._cache ) {
		throw Error('static builds must be run with cache enabled');
	}
	//TODO: dump built files to directory
	throw Error('not implemented');
};



/* FS helpers */

function relativePath(path1, path2) {
	if (path2[0] === '/') {
		return path2;
	}

	if (path1[path1.length-1] !== '/') {
		return path.resolve(path1, '../'+path2);
	} else {
		return path.resolve(path1, path2);
	}
}

function walkDirectory(root, ignores, handler, callback, pathname) {
	if ( !pathname ) {
		pathname = '/';
	}

	for (var i=0, l=ignores.length; i<l; i++) {
		if (pathname.substr(0, ignores[i].length) === ignores[i]) {
			callback();
			return;
		}
	}

	var filePath = path.join(root, pathname),
		stats    = fs.statSync(filePath);

	if ( !stats.isDirectory() ) {
		handler(pathname, callback);
		return;
	}

	var children = fs.readdirSync(filePath).filter(function (child) {
		return (child[0] !== '.');
	});

	nextChild();
	function nextChild() {
		var child = children.shift();
		if (child) {
			walkDirectory(root, ignores, handler, nextChild, path.join(pathname, child));
		} else {
			callback();
		}
	}
}

function detectManifests(root, ignores) {
	var manifests = {};

	walkDirectory(root, ignores, function (pathname, callback) {
		var filePath = path.join(root, pathname),
			ext      = path.extname(filePath).toLowerCase();
		if (ext === '.appcache') {
			var f = ('' + fs.readFileSync(filePath, 'utf8')).trim();
			if (f.substr(0,14) === 'CACHE MANIFEST') {
				manifests[pathname] = true;
			}
		}
		callback();
	}, function(){});

	return manifests;
}

function getLastModifiedTimestamp(root, ignores) {
	var latest = new Date(0);

	walkDirectory(root, ignores, function (pathname, callback) {
		var filePath = path.join(root, pathname),
			stats    = fs.statSync(filePath);
		if (latest < stats.mtime) {
			latest = stats.mtime;
		}
		callback();
	}, function(){});

	return latest;
}



/* Async helpers */

function asyncJoin(funcs, callback, self) {
	if ( !self ) {
		self = this;
	}

	var num = funcs.length;
	if ( !num ) {
		callback();
		return;
	}

	var responses = new Array(num);
	funcs.forEach(function (func, index) {
		var lock = false;

		func.call(self, function (data) {
			if (lock) {
				return;
			}
			lock = true;

			responses[index] = data;
			if ( !--num ) {
				callback.call(this, responses);
			}
		});
	});
}

function asyncSequence() {
	var funcs = Array.prototype.slice.call(arguments);
	next();
	function next() {
		var func = funcs.shift();
		if (func) {
			func(next);
		}
	}
}

function asyncForEach(arr, handler, callback) {
	arr = arr.slice();
	next();
	function next() {
		var elem = arr.shift();
		if (elem) {
			handler(elem, next);
		} else {
			callback();
		}
	}
}

function asyncReplace(str, matcher, handler, callback) {
	var self    = this,
		matches = {};
	str = str.replace(matcher, function (original, data) {
		var matchID = '__ZERVER_INLINE__'+Math.random();
		matches[matchID] = [original, data];
		return matchID;
	});

	var matchIDs = Object.keys(matches);
	if ( !matchIDs.length ) {
		callback(str);
		return;
	}

	asyncForEach(
		matchIDs,
		function (matchID, respond) {
			handler(matches[matchID][1], function (newData) {
				if (newData) {
					matches[matchID] = newData;
				} else {
					matches[matchID] = matches[matchID][0];
				}
				respond();
			});
		},
		function () {
			for (var matchID in matches) {
				str = str.replace(matchID, matches[matchID]);
			}
			callback(str);
		}
	);
}
