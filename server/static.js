var crypto     = require('crypto'),
		fs         = require('fs'),
		path       = require('path'),
		urllib     = require('url'),
		extend     = require('util')._extend,
		zlib       = require('zlib'),
		mime       = require('mime'),
		uglify     = require('uglify-js'),
		coffee     = require('coffee-script'),
		less       = require('less'),
		jade       = require('jade'),
		CleanCSS   = require('clean-css'),
		htmlMinify = require('html-minifier'),
		async      = require(__dirname+path.sep+'lib'+path.sep+'async');

less.Parser.importer = function (file, paths, callback) {
	var pathname = path.join(paths.entryPath, file);
	try {
		fs.statSync(pathname);
	} catch (e) {
		throw new Error('File '+file+' not found');
	}

	var data = fs.readFileSync(pathname, 'utf-8');
	new(less.Parser)({
		paths    : [path.dirname(pathname)].concat(paths),
		filename : pathname,
	}).parse(data, function (e, root) {
		if (e) {
			less.writeError(e);
		}
		callback(e, root);
	})
};

mime.define({
	'text/coffeescript' : ['coffee'],
	'text/less'         : ['less'  ],
	'text/jade'         : ['jade'  ],
});

module.exports = StaticFiles;

StaticFiles.INDEX_FILES         = ['index.html', 'index.jade'];
StaticFiles.CSS_IMAGE           = /url\([\'\"]?([^\)]+)[\'\"]?\)/g;
StaticFiles.DEBUG_LINES         = /\s*\;\;\;.*/g;
StaticFiles.MANIFEST_CONCAT     = /\s*\#\s*zerver\:(\S+)\s*/g;
StaticFiles.MANIFEST_CONCAT_END = /\s*\#\s*\/zerver\s*/g;
StaticFiles.SCRIPT_MATCH        = /\<script(?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s+src\=[\'\"]\s*([^\>]+)\s*[\'\"](?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s*\>\<\/script\>/g;
StaticFiles.STYLES_MATCH        = /\<link(?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s+href\=[\'\"]\s*([^\>]+)\s*[\'\"](?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s*\/?\>/g;
StaticFiles.CONCAT_MATCH        = /\<\!\-\-\s*zerver\:(\S+)\s*\-\-\>((\s|\S)*?)\<\!\-\-\s*\/zerver\s*\-\-\>/g;
StaticFiles.GZIPPABLE           = {
	'application/json'       : true ,
	'application/javascript' : true ,
	'text/css'               : true ,
	'text/html'              : true ,
	'text/plain'             : true ,
	'text/cache-manifest'    : true ,
};



function StaticFiles(options, callback) {
	var self = this;
	self._options = extend({
		ignores: null,
	}, options);
	self._root = self._options.dir;

	if (self._options.concat) {
		self._concats = {};
	}
	if (self._options.production) {
		self._cache   = {};
	}
	self._defaultCache = (self._options.production ? 300 : 0),
	self._customCache = {};
	if (self._options.cache && self._cache) {
		self._options.cache.split(',').forEach(function (segment) {
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

	if (self._options.ignores) {
		self._ignores = self._options.ignores.split(',');
	} else {
		self._ignores = [];
	}

	if ( !self._options.manifest ) {
		self._manifests = {};
	} else {
		self._manifests = detectManifests(self._root, self._ignores);
		if (self._options.ignoreManifest) {
			self._options.ignoreManifest.split(',').forEach(function (pathname) {
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
		self._loadCache(finish);
	} else {
		finish();
	}

	function finish() {
		callback.call(self);
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
		if ( !self._concats ) {
			callback();
			return;
		}
		async.join(
			Object.keys(self._concats).map(function (pathname) {
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
	if ( isDirectoryRootFile(pathname) ) {
		altPath = pathname.split('/').slice(0,-1).join('/')+'/';
		if (altPath.length > 1) {
			self._cacheDirectory(altPath.substr(0,altPath.length-1));
		}
	}

	self._cache[pathname] = false;
	if (altPath) {
		self._cache[altPath] = false;
	}

	var filePath = path.join(self._root, pathname),
		body     = fs.readFileSync(filePath, 'binary'),
		headers  = {
			'Content-Type'  : mime.lookup(filePath),
			'Cache-Control' : self._getCacheControl(pathname),
		};

	async.forEach([
		'compileLanguages',
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

		setImmediate(function () {
			callback(headers, body);
		});
	});
};

StaticFiles.prototype._cacheDirectory = function (pathname) {
	this._cache[pathname] = {
		status  : 301,
		headers : {
			'Location' : pathname+'/'
		},
		body    : '',
	};
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
	if ( !(pathname in self._concats) ) {
		throw Error('path is not a concat file, ' + pathname);
	}

	var altPath;
	if ( isDirectoryRootFile(pathname) ) {
		altPath = pathname.split('/').slice(0,-1).join('/')+'/';
	}

	self._cache[pathname] = false;
	if (altPath) {
		self._cache[altPath] = false;
	}

	var filePath = path.join(self._root, pathname),
		headers  = {
			'Content-Type'  : mime.lookup(filePath),
			'Cache-Control' : self._getCacheControl(pathname),
		};

	async.join(
		self._concats[pathname].map(function (partPath) {
			return function (respond) {
				//TODO: what if file is zerver script
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
			var body;
			if (headers['Content-Type'] === 'application/javascript') {
				body = parts.join(';\n');
			} else {
				body = parts.join('\n');
			}

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
	if (!this._options.inline || !this._manifests[pathname]) {
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
	if (!this._concats || !this._manifests[pathname]) {
		callback(headers, body);
		return;
	}

	var lines = body.split('\n'),
		concatFile, concatIndex;

	for (var i=0, l=lines.length; i<l; i++) {
		lines[i] = lines[i].trim();

		if ( !concatFile ) {
			var match = StaticFiles.MANIFEST_CONCAT.exec( lines[i] );
			if (match) {
				concatFile  = match[1];
				concatIndex = i;
			}
		} else if ( StaticFiles.MANIFEST_CONCAT_END.test( lines[i] ) ) {
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

			if (absPath in this._concats) {
				if (this._concats[absPath].join('\n') !== concatList.join('\n')) {
					throw Error('Concat files did not match: '+absPath+'\nEnsure that the order and names of the files are the same in both HTML and manifest files');
				}
			}

			this._concats[absPath] = concatList;
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
	if (!this._concats || (headers['Content-Type'] !== 'text/html')) {
		callback(headers, body);
		return;
	}

	var self = this;

	body = body.replace(StaticFiles.CONCAT_MATCH, function (original, concatPath, concatables) {
		var files   = [],
			absPath = relativePath(pathname, concatPath),
			fileType, match;

		if ( !fileType ) {
			while (match=StaticFiles.SCRIPT_MATCH.exec(concatables)) {
				fileType = 'js';
				files.push( relativePath(pathname, match[1]) );
			}
		}

		if ( !fileType ) {
			while (match=StaticFiles.STYLES_MATCH.exec(concatables)) {
				fileType = 'css';
				files.push( relativePath(pathname, match[1]) );
			}
		}

		if ( !fileType ) {
			return original;
		}

		if (absPath in self._concats) {
			if (self._concats[absPath].join('\n') !== files.join('\n')) {
				throw Error('Concat files did not match: '+absPath+'\nEnsure that the order and names of the files are the same in both HTML and manifest files');
			}
		}

		self._concats[absPath] = files;

		switch (fileType) {
			case 'js':
				return '<script src="'+concatPath+'"></script>';

			case 'css':
				return '<link rel="stylesheet" href="'+concatPath+'">';

			default:
				delete self._concats[absPath];
				return original;
		}
	});

	callback(headers, body);
};

StaticFiles.prototype._inlineScripts = function (pathname, headers, body, callback) {
	if (!this._options.inline || (headers['Content-Type'] !== 'text/html')) {
		callback(headers, body);
		return;
	}

	var self = this;
	async.replace(body, StaticFiles.SCRIPT_MATCH, function (scriptPath, next) {
		if ( !urllib.parse(scriptPath,true).query.inline ) {
			next();
			return;
		}
		var fullPath = relativePath(pathname, scriptPath.split('?')[0]);
		var prefix = self._options.apis+'/';
		if (fullPath.substr(0, prefix.length) === prefix) {
			var apiName = fullPath.substr(prefix.length).split('.')[0];
			self._options._apiModule._apiScript(apiName, function (status, headers, body) {
				handleFile(headers, body);
			});
		} else {
			self._cacheFile(fullPath, handleFile);
		}

		function handleFile(headers, body) {
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
		}
	}, function (body) {
		callback(headers, body);
	});
};

StaticFiles.prototype._inlineStyles = function (pathname, headers, body, callback) {
	if (!this._options.inline || (headers['Content-Type'] !== 'text/html')) {
		callback(headers, body);
		return;
	}

	var self = this;
	async.replace(body, StaticFiles.STYLES_MATCH, function (stylePath, next) {
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
	if (!this._options.inline || (headers['Content-Type'] !== 'text/css')) {
		callback(headers, body);
		return;
	}

	var self = this;
	async.replace(body, StaticFiles.CSS_IMAGE, function (imgPath, respond) {
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
			respond('url(data:'+headers['Content-Type']+';base64,'+new Buffer(body, 'binary').toString('base64')+')');
		});
	}, function (body) {
		callback(headers, body);
	});
};

StaticFiles.prototype._compileLanguages = function (pathname, headers, body, callback) {
	if (this._options.coffee && headers['Content-Type'] === 'text/coffeescript') {
		try {
			body = coffee.compile(body.toString());
			headers['Content-Type'] = 'application/javascript'
		} catch (err) {
			console.error('failed to compile CoffeeScript file, '+pathname);
			console.error(err.toString());
			if (this._options.production) {
				process.exit(1);
			}
		}
	} else if (this._options.less && headers['Content-Type'] === 'text/less') {
		try {
			var parser = new(less.Parser)({
				filename: path.join(this._root, pathname)
			});
			parser.parse(body.toString(), function (e, r) {
				body = r.toCSS();
			});
			headers['Content-Type'] = 'text/css';
		} catch (err) {
			console.error('failed to compile LESS file, '+pathname);
			console.error(err.toString());
			if (this._options.production) {
				process.exit(1);
			}
		}
	} else if (this._options.jade && headers['Content-Type'] === 'text/jade') {
		try {
			body = jade.render(body.toString(), {
				filename     : path.join(this._root, pathname),
				pretty       : !this._options.production,
				compileDebug : !this._options.production,
			});
			headers['Content-Type'] = 'text/html';
		} catch (err) {
			console.error('failed to compile Jade file, '+pathname);
			console.error(err.toString());
			if (this._options.production) {
				process.exit(1);
			}
		}
	}
	callback(headers, body);
};

StaticFiles.prototype._compileOutput = function (pathname, headers, body, callback) {
	if ( !this._options.compile ) {
		callback(headers, body);
		return;
	}

	var code;
	switch (headers['Content-Type']) {
		case 'application/json':
			try {
				code = JSON.stringify(JSON.parse(body));
			} catch (err) {}
			break;

		case 'application/javascript':
			body = body.replace(StaticFiles.DEBUG_LINES, '');
			try {
				var ast = uglify.parser.parse(body);
				ast     = uglify.uglify.ast_mangle(ast);
				ast     = uglify.uglify.ast_squeeze(ast);
				code    = uglify.uglify.gen_code(ast);
				if (!code || code.length > body.length) {
					code = null;
				}
			} catch (err) {}
			break;

		case 'text/css':
			try {
				code = new CleanCSS().minify(body);
				if (!code || code.length > body.length) {
					code = null;
				}
			} catch (err) {}
			break;

		case 'text/html':
			try {
				code = htmlMinify.minify(body, {
					removeComments            : true,
					collapseWhitespace        : true,
					conservativeCollapse      : true,
					collapseBooleanAttributes : true,
					removeAttributeQuotes     : true,
					removeRedundantAttributes : true,
					removeEmptyAttributes     : true,
					caseSensitive             : true,
					minifyJS                  : true,
					minifyCSS                 : true,
				});
				if (!code || code.length > body.length) {
					code = null;
				}
			} catch (err) {}
			break;
	}

	if (code) {
		body = code;
	}
	callback(headers, body);
};

StaticFiles.prototype._gzipOutput = function (pathname, headers, body, callback) {
	if (!this._options.gzip || !StaticFiles.GZIPPABLE[headers['Content-Type']]) {
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
			status  : (response.status || 200),
			headers : extend({}, response.headers),
			body    : response.body,
		};
	}
};

StaticFiles.prototype._rawGet = function (pathname) {
	var filePath = path.join(this._root, pathname),
		parts    = pathname.split('/');

	for (var i=0, l=parts.length; i<l; i++) {
		if (parts[i][0] === '.') {
			return;
		}
	}

	for (var i=0, l=this._ignores.length; i<l; i++) {
		if (pathname.substr(0, this._ignores[i].length) === this._ignores[i]) {
			return;
		}
	}

	var isDirRoot = pathname[pathname.length-1] === '/',
		response;
	if (isDirRoot) {
		for (var i=0, l=StaticFiles.INDEX_FILES.length; i<l; i++) {
			response = this._rawGet(pathname+'/'+StaticFiles.INDEX_FILES[i]);
			if (typeof response !== 'undefined') {
				return response;
			}
		}
		return;
	}

	var stat;
	try {
		stat = fs.statSync(filePath);
	} catch (err) {
		return;
	}
	if (stat.isDirectory() && !isDirRoot) {
		return {
			status  : 301,
			headers : {
				'Location' : pathname+'/'
			},
			body    : '',
		};
	}

	var file;
	try {
		file = fs.readFileSync(filePath);
	} catch (err) {
		return;
	}

	var headers = {
		'Content-Type' : mime.lookup(filePath),
		'Cache-Control' : this._getCacheControl(pathname),
	};
	// synchronous
	this._compileLanguages(pathname, headers, file, function (_, f) {
		file = f;
	});
	if (isManifestFilename(pathname) && isManifestFile(file.toString())) {
		file += '\n# Zerver timestamp: ' + getLastModifiedTimestamp(this._root, this._ignores);
	}

	return {
		body    : file,
		headers : headers,
	};
};

StaticFiles.prototype.getManifestNames = function () {
	return Object.keys(this._manifests);
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
		if ( isManifestFilename(pathname) ) {
			var filePath = path.join(root, pathname),
				file     = fs.readFileSync(filePath, 'utf8').toString();
			if ( isManifestFile(file) ) {
				manifests[pathname] = true;
			}
		}
		callback();
	}, function(){});

	return manifests;
}

function isManifestFilename(pathname) {
	var ext = path.extname(pathname).toLowerCase();
	return (ext === '.appcache' || ext === '.manifest');
}

function isManifestFile(file) {
	return (file.trim().substr(0,14) === 'CACHE MANIFEST');
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

function isDirectoryRootFile(pathname) {
	var fileName = pathname.split('/').pop();
	return StaticFiles.INDEX_FILES.indexOf(fileName) !== -1;
}
