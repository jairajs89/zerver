var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var urllib = require('url');
var extend = require('util')._extend;
var zlib = require('zlib');
var mime = require('mime');
var async = require(path.join(__dirname, 'lib', 'async'));

module.exports = StaticFiles;

StaticFiles.MAX_AUTO_HTML_FILE_SIZE = 300 * 1024;
StaticFiles.MAX_AUTO_CSS_FILE_SIZE = 100 * 1024;
StaticFiles.MAX_AUTO_JS_FILE_SIZE = 100 * 1024;
StaticFiles.MAX_AUTO_IMG_FILE_SIZE = 16 * 1024;
StaticFiles.PLUGIN_DIR = path.join(__dirname, 'plugin');
StaticFiles.INDEX_FILES = ['index.html'];

//TODO: use parsers
StaticFiles.CSS_IMAGE = /url\([\'\"]?([^\)]+)[\'\"]?\)/g;
StaticFiles.MANIFEST_CONCAT = /\s*\#\s*zerver\:(\S+)\s*/g;
StaticFiles.MANIFEST_CONCAT_END = /\s*\#\s*\/zerver\s*/g;
StaticFiles.SCRIPT_MATCH = /\<script(?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s+src\=[\'\"]\s*([^\>]+)\s*[\'\"](?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s*\>\<\/script\>/g;
StaticFiles.STYLES_MATCH = /\<link(?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s+href\=[\'\"]\s*([^\>]+)\s*[\'\"](?:\s+\w+\=[\'\"][^\>]+[\'\"])*\s*\/?\>/g;
StaticFiles.CONCAT_MATCH = /\<\!\-\-\s*zerver\:(\S+)\s*\-\-\>((\s|\S)*?)\<\!\-\-\s*\/zerver\s*\-\-\>/g;
StaticFiles.WHITESPACE_MATCH = /^[\s\n\t\r]*$/;

StaticFiles.GZIPPABLE = {
    'application/json'      : true,
    'application/javascript': true,
    'text/css'              : true,
    'text/html'             : true,
    'text/plain'            : true,
    'text/cache-manifest'   : true,
};



function StaticFiles(options, callback) {
    var self = this;
    self._options = extend({
        ignores: null,
    }, options);
    self._root = self._options.dir;

    global.ZERVER_DEBUG = !this._options.production;

    if (self._options.concat) {
        self._concats = {};
    }
    if (self._options.production) {
        self._cache = {};
    }
    self._defaultCache = self._options.production ? 300 : 0;
    self._customCache = {};
    if (self._options.cache && self._cache) {
        self._options.cache.split(',').forEach(function (segment) {
            var parts = segment.split(':');
            var path;
            var life;
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
            if (isNaN(life) || life < 0) {
                throw TypeError('invalid cache directive: ' + segment);
            } else if (path) {
                self._customCache[relativePath('/', path)] = life;
            } else {
                self._defaultCache = life;
            }
        });
    }

    if (self._options.ignores) {
        self._ignores = self._options.ignores.split(',');
    } else {
        self._ignores = [];
    }

    if (self._cache) {
        self._loadCache(finish);
    } else {
        finish();
    }

    function finish() {
        self._getPlugins();

        if (callback) {
            callback.call(self);
        }
    }
}

StaticFiles.prototype._getPlugins = function () {
    var self = this;
    var pluginPaths;
    if (!self._plugins) {
        pluginPaths = [];
        if (self._options.plugins) {
            self._options.plugins.split(',').forEach(function (pluginPath) {
                if (pluginPath[0] === '.') {
                    pluginPath = path.resolve(process.cwd(), pluginPath);
                }
                pluginPaths.push(pluginPath);
            });
        }
        fs.readdirSync(StaticFiles.PLUGIN_DIR).forEach(function (pluginPath) {
            if (path.extname(pluginPath) === '.js') {
                pluginPaths.push(path.join(StaticFiles.PLUGIN_DIR, pluginPath));
            }
        });
        self._plugins = pluginPaths.map(function (pluginPath) {
            var plugin = require(pluginPath);

            var mimes = [];
            var fileExtensions = [];
            if (!plugin.mime) {
                throw TypeError(pluginPath + ' must export a mime');
            }
            if (!Array.isArray(plugin.mime)) {
                plugin.mime = [plugin.mime];
            }
            plugin.mime.forEach(function (matcher) {
                if (typeof matcher === 'string') {
                    mimes.push(matcher);
                    if (mime.extension(matcher)) {
                        fileExtensions.push(mime.extension(matcher));
                    }
                    if (matcher.substr(0, 5) === 'text/') {
                        fileExtensions.push(matcher.substr(5));
                    }
                } else if (typeof matcher !== 'function' && Object.prototype.toString(matcher) !== '[object RegExp]') {
                    throw TypeError(pluginPath + ' exported valid mime=' + matcher);
                }
            });
            if (plugin.fileExtension) {
                if (!Array.isArray(plugin.fileExtension)) {
                    plugin.fileExtension = [plugin.fileExtension];
                }
                plugin.fileExtension.forEach(function (fileExtension) {
                    if (!fileExtension || typeof fileExtension !== 'string') {
                        throw TypeError(pluginPath + ' got an invalid fileExtension=' + fileExtension);
                    }
                    fileExtensions.push(fileExtension);
                });
            }
            if (typeof plugin.processor !== 'function') {
                throw TypeError(pluginPath + ' does not export a valid processor');
            }

            var mimeDeclarations = {};
            if (mimes.length && fileExtensions.length) {
                mimes.forEach(function (mime) {
                    mimeDeclarations[mime] = fileExtensions;
                });
                mime.define(mimeDeclarations);
                fileExtensions.forEach(function (fileExtension) {
                    StaticFiles.INDEX_FILES.push('index.' + fileExtension);
                });
            }

            return plugin;
        });
    }
    return self._plugins.slice();
};



/* Construct cache */

StaticFiles.prototype._loadCache = function (callback) {
    if (!this._cache) {
        throw Error('loadCache requires cache mode to be enabled');
    }
    var self = this;
    walkDirectory(self._root, self._ignores, function (pathname, next) {
        self._cacheFile(pathname, next);
    }, function () {
        if (!self._concats) {
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

StaticFiles.prototype._cacheFileOrConcat = function (pathname, callback) {
    if (this._concats && pathname in this._concats) {
        this._cacheConcatFile(pathname, callback);
    } else {
        this._cacheFile(pathname, callback);
    }
};

StaticFiles.prototype._cacheFile = function (pathname, callback) {
    var self = this;

    if (!self._cache) {
        throw Error('cacheFile requires cache mode to be enabled');
    }
    if (self._cache[pathname] === false) {
        throw Error('circular dependency detected for ' + pathname);
    }
    if (self._cache[pathname]) {
        callback(self._cache[pathname].headers, self._cache[pathname].body);
        return;
    }

    var altPath;
    if (isDirectoryRootFile(pathname)) {
        altPath = pathname.split('/').slice(0, -1).join('/') + '/';
        if (altPath.length > 1) {
            self._cacheDirectory(altPath.substr(0, altPath.length - 1));
        }
    }

    self._cache[pathname] = false;
    if (altPath) {
        self._cache[altPath] = false;
    }

    var filePath = path.join(self._root, pathname);
    var body = fs.readFileSync(filePath);
    var headers = {
        'Content-Type' : mime.lookup(filePath),
        'Cache-Control': self._getCacheControl(pathname),
    };

    async.forEach([
        self._applyPlugins,
        self._prepareAutomaticCSSOptimisations,
        self._prepareAutomaticHTMLOptimisations,
        self._prepareManifest,
        self._inlineManifestFiles,
        self._prepareManifestConcatFiles,
        self._prepareConcatFiles,
        self._inlineScripts,
        self._inlineStyles,
        self._inlineImages,
        self._versionScripts,
        self._versionStyles,
        self._versionImages,
        self._compileOutput,
        self._gzipOutput,
    ], function (transform, next) {
        transform.call(self, pathname, headers, body, function (newHeaders, newBody) {
            headers = newHeaders;
            body = newBody;
            next();
        });
    }, function () {
        var hash = crypto.createHash('md5');
        hash.update(body);
        headers.ETag = '"' + hash.digest('hex') + '"';
        headers.Vary = 'Accept-Encoding';

        self._cache[pathname] = {
            headers: headers,
            body   : body,
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
        status : 301,
        body   : '',
        headers: {
            Location: pathname + '/',
        },
    };
};

StaticFiles.prototype._cacheConcatFile = function (pathname, callback) {
    var self = this;

    if (!self._cache) {
        throw Error('cacheConcatFile requires cache mode to be enabled');
    }
    if (self._cache[pathname] === false) {
        throw Error('circular dependency detected for ' + pathname);
    }
    if (self._cache[pathname]) {
        callback(self._cache[pathname].headers, self._cache[pathname].body);
        return;
    }
    if (!(pathname in self._concats)) {
        throw Error('path is not a concat file, ' + pathname);
    }

    var altPath;
    if (isDirectoryRootFile(pathname)) {
        altPath = pathname.split('/').slice(0, -1).join('/') + '/';
    }

    self._cache[pathname] = false;
    if (altPath) {
        self._cache[altPath] = false;
    }

    var filePath = path.join(self._root, pathname);
    var headers = {
        'Content-Type' : mime.lookup(filePath),
        'Cache-Control': self._getCacheControl(pathname),
    };

    async.join(
        self._concats[pathname].map(function (partPath) {
            return function (respond) {
                var cached = self._cache[partPath];
                var prefix = self._options.apis + '/';
                var apiName;
                if (partPath.substr(0, prefix.length) === prefix) {
                    apiName = partPath.substr(prefix.length).split('.')[0];
                    self._options._apiModule._apiScript(apiName, function (status, headers, body) {
                        // This callback happens synchronously
                        if (status) {
                            cached = {
                                headers: headers,
                                body   : body,
                            };
                        }
                    });
                }
                if (cached) {
                    finish();
                } else {
                    setImmediate(function () {
                        self._cacheFile(partPath, function (headers, body) {
                            cached = {
                                headers: headers,
                                body   : body,
                            };
                            finish();
                        });
                    });
                }
                function finish() {
                    if (cached.headers['Content-Encoding'] === 'gzip') {
                        zlib.gunzip(cached.body, function (err, body) {
                            if (err) {
                                throw Error('failed to gunzip file, ' + partPath);
                            } else {
                                respond(body);
                            }
                        });
                    } else {
                        respond(cached.body);
                    }
                }
            };
        }),
        function (parts) {
            parts = parts.map(function (part) {
                return part.toString().trim();
            }).filter(function (part) {
                return part.length > 0;
            });

            var body;
            if (headers['Content-Type'] === 'application/javascript') {
                body = parts.join(';\n');
            } else {
                body = parts.join('\n');
            }

            var hash = crypto.createHash('md5');
            hash.update(body);
            headers.ETag = '"' + hash.digest('hex') + '"';
            headers.Vary = 'Accept-Encoding';

            self._cache[pathname] = {
                headers: headers,
                body   : body,
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
    var prefix;
    for (prefix in this._customCache) {
        if (pathname.substr(0, prefix.length) === prefix) {
            seconds = this._customCache[prefix];
            break;
        }
    }
    if (seconds === 0) {
        return 'no-cache';
    } else {
        return 'public, max-age=' + seconds;
    }
};

StaticFiles.prototype._prepareAutomaticCSSOptimisations = function (pathname, headers, body, callback) {
    if (!this._options.autoOptimize || headers['Content-Type'] !== 'text/css') {
        callback(headers, body);
        return;
    }

    var self = this;
    var fileSize = body.toString().length;
    async.replace(body.toString(), StaticFiles.CSS_IMAGE, function (imgPath, respond, matches) {
        if (imgPath.substr(0, 5) === 'data:') {
            respond();
            return;
        }
        var parsed = urllib.parse(imgPath, true);
        parsed.search = undefined;
        if (parsed.host !== null || parsed.query.version || parsed.query.inline) {
            respond();
            return;
        }

        if (fileSize > StaticFiles.MAX_AUTO_CSS_FILE_SIZE) {
            versionImg();
        } else {
            inlineImg();
        }

        function inlineImg() {
            var fullPath = relativePath(pathname, imgPath.split('?')[0]);
            self._cacheFileOrConcat(fullPath, function (headers, body) {
                var newFileSize = fileSize - imgPath.length + body.toString().length;
                if (newFileSize > StaticFiles.MAX_AUTO_CSS_FILE_SIZE || body.toString().length > StaticFiles.MAX_AUTO_IMG_FILE_SIZE) {
                    versionImg();
                } else {
                    fileSize = newFileSize;
                    parsed.query.inline = 1;
                    respond(matches[0].replace(matches[1], urllib.format(parsed)));
                }
            });
        }

        function versionImg() {
            parsed.query.version = 1;
            respond(matches[0].replace(matches[1], urllib.format(parsed)));
        }
    }, function (body) {
        callback(headers, body);
    });
};

StaticFiles.prototype._prepareAutomaticHTMLOptimisations = function (pathname, headers, body, callback) {
    if (!this._options.autoOptimize || headers['Content-Type'] !== 'text/html') {
        callback(headers, body);
        return;
    }

    var self = this;
    async.sequence(
        function inlineOrVersionImages(next) {
            var $ = require('cheerio').load(body.toString());
            var changedHTML = false;
            async.join(
                $('style').map(function () {
                    var $style = $(this);
                    return function (done) {
                        var type = ($style.attr('type') || '').trim();
                        if (type && type !== 'text/css') {
                            done();
                            return;
                        }
                        var code = $style.html();
                        self._prepareAutomaticCSSOptimisations(
                            pathname, { 'Content-Type': 'text/css' }, code,
                            function (_, newCode) {
                                if (newCode !== code) {
                                    $style.html(newCode);
                                    changedHTML = true;
                                }
                                done();
                            }
                        );
                    };
                }),
                function () {
                    if (changedHTML) {
                        body = $.html();
                    }
                    next();
                }
            );
        },
        function inlineOrVersionStylesheets(next) {
            var fileSize = body.toString().length;
            async.replace(body.toString(), StaticFiles.STYLES_MATCH, function (stylePath, done, matches) {
                var parsed = urllib.parse(stylePath, true);
                if (parsed.host !== null || parsed.query.version || parsed.query.inline) {
                    done();
                    return;
                }

                if (fileSize > StaticFiles.MAX_AUTO_HTML_FILE_SIZE) {
                    versionStylesheet();
                } else {
                    inlineStylesheet();
                }

                function inlineStylesheet() {
                    var fullPath = relativePath(pathname, stylePath.split('?')[0]);
                    self._cacheFileOrConcat(fullPath, function (headers, body) {
                        var newFileSize = fileSize + body.toString().length;
                        if (newFileSize > StaticFiles.MAX_AUTO_HTML_FILE_SIZE || body.toString().length > StaticFiles.MAX_AUTO_CSS_FILE_SIZE) {
                            versionStylesheet();
                        } else {
                            fileSize = newFileSize;
                            parsed.query.inline = 1;
                            done(matches[0].replace(matches[1], urllib.format(parsed)));
                        }
                    });
                }

                function versionStylesheet() {
                    parsed.query.version = 1;
                    done(matches[0].replace(matches[1], urllib.format(parsed)));
                }
            }, function (newBody) {
                body = newBody;
                next();
            });
        },
        function inlineOrVersionScripts(next) {
            var $ = require('cheerio').load(body.toString());
            var fileSize = body.toString().length;
            var changedHTML = false;
            async.join(
                $('script').map(function () {
                    var $script = $(this);
                    return function (done) {
                        var scriptPath = ($script.attr('src') || '').trim();
                        if (!scriptPath) {
                            done();
                            return;
                        }
                        var parsed = urllib.parse(scriptPath, true);
                        if (parsed.host || parsed.query.version || parsed.query.inline) {
                            done();
                            return;
                        }
                        if (fileSize > StaticFiles.MAX_AUTO_HTML_FILE_SIZE) {
                            versionScript();
                        } else {
                            inlineScript();
                        }

                        function inlineScript() {
                            var fullPath = relativePath(pathname, scriptPath.split('?')[0]);
                            var prefix = self._options.apis + '/';
                            var apiName;
                            if (fullPath.substr(0, prefix.length) === prefix) {
                                apiName = fullPath.substr(prefix.length).split('.')[0];
                                self._options._apiModule._apiScript(apiName, function (status, headers, body) {
                                    // This callback happens synchronously
                                    handleFile(headers, body);
                                });
                            } else {
                                self._cacheFileOrConcat(fullPath, handleFile);
                            }

                            function handleFile(headers, body) {
                                var newFileSize = fileSize + body.toString().length;
                                if (newFileSize > StaticFiles.MAX_AUTO_HTML_FILE_SIZE || body.toString().length > StaticFiles.MAX_AUTO_JS_FILE_SIZE) {
                                    versionScript();
                                } else {
                                    fileSize = newFileSize;
                                    changedHTML = true;
                                    parsed.query.inline = 1;
                                    $script.attr('src', urllib.format(parsed));
                                    done();
                                }
                            }
                        }

                        function versionScript() {
                            changedHTML = true;
                            parsed.query.version = 1;
                            $script.attr('src', urllib.format(parsed));
                            done();
                        }
                    };
                }),
                function () {
                    if (changedHTML) {
                        body = $.html();
                    }
                    next();
                }
            );
        },
        function concatStylesheets(next) {
            body = forNonManifestSections(body, processSection);
            next();

            function processSection(section) {
                return section.replace(
                    new RegExp('(' + StaticFiles.STYLES_MATCH.source + '\\s*)+', 'g'),
                    function (original) {
                        var concatted = '';
                        var inConcat = false;
                        original.replace(StaticFiles.STYLES_MATCH, function (stylesheetTag, stylePath) {
                            var parsed = urllib.parse(stylePath, true);
                            var localUrl = parsed.host === null && !parsed.query.inline;
                            var fullPath;
                            var hash;
                            if (inConcat && !localUrl) {
                                inConcat = false;
                                concatted += '\n<!-- /zerver -->';
                            } else if (!inConcat && localUrl) {
                                inConcat = true;
                                fullPath = relativePath(pathname, stylePath.split('?')[0]);
                                hash = crypto.createHash('md5').update(
                                    pathname + '\n' + fullPath
                                ).digest('hex');
                                concatted += '\n<!-- zerver:/_zerver/concat-' + hash + '.css?version=1 -->';
                            }
                            concatted += '\n' + stylesheetTag;
                        });
                        if (inConcat) {
                            concatted += '\n<!-- /zerver -->';
                        }
                        return concatted;
                    }
                );
            }
        },
        function concatScripts(next) {
            body = forNonManifestSections(body, processSection);
            next();

            function processSection(section) {
                return section.toString().replace(
                    new RegExp('(' + StaticFiles.SCRIPT_MATCH.source + '\\s*)+', 'g'),
                    function (original) {
                        var concatted = '';
                        var inConcat = false;
                        original.replace(StaticFiles.SCRIPT_MATCH, function (scriptTag, scriptPath) {
                            var parsed = urllib.parse(scriptPath, true);
                            var localUrl = parsed.host === null && !parsed.query.inline;
                            var fullPath;
                            var hash;
                            if (inConcat && !localUrl) {
                                inConcat = false;
                                concatted += '\n<!-- /zerver -->';
                            } else if (!inConcat && localUrl) {
                                inConcat = true;
                                fullPath = relativePath(pathname, scriptPath.split('?')[0]);
                                hash = crypto.createHash('md5').update(
                                    pathname + '\n' + fullPath
                                ).digest('hex');
                                concatted += '\n<!-- zerver:/_zerver/concat-' + hash + '.js?version=1 -->';
                            }
                            concatted += '\n' + scriptTag;
                        });
                        if (inConcat) {
                            concatted += '\n<!-- /zerver -->';
                        }
                        return concatted;
                    }
                );
            }
        },
        function finish() {
            callback(headers, body);
        }
    );
};

StaticFiles.prototype._prepareManifest = function (pathname, headers, body, callback) {
    if (!this._isManifest(pathname)) {
        callback(headers, body);
        return;
    }

    getLastModifiedTimestamp(this._root, this._ignores, function (timestamp) {
        body = body.toString() + '\n# Zerver timestamp: ' + timestamp;
        callback(headers, body);
    });
};

StaticFiles.prototype._inlineManifestFiles = function (pathname, headers, body, callback) {
    if (!this._options.inline || !this._isManifest(pathname)) {
        callback(headers, body);
        return;
    }

    var lines = body.toString().split('\n');
    var i;
    var urlParts;
    for (i = 0; i < lines.length; i++) {
        try {
            urlParts = urllib.parse(lines[i], true);
        } catch (err) {
            urlParts = null;
        }
        if (urlParts && urlParts.query.inline) {
            lines.splice(i, 1);
            i--;
        }
    }

    body = lines.join('\n');
    callback(headers, body);
};

StaticFiles.prototype._prepareManifestConcatFiles = function (pathname, headers, body, callback) {
    if (!this._concats || !this._isManifest(pathname)) {
        callback(headers, body);
        return;
    }

    var lines = body.toString().split('\n');
    var concatFile;
    var concatIndex;
    var match;
    var sectionLength;
    var concatList;
    var absPath;
    var l;
    var i;
    for (i = 0, l = lines.length; i < l; i++) {
        lines[i] = lines[i].trim();

        if (!concatFile) {
            match = StaticFiles.MANIFEST_CONCAT.exec(lines[i]);
            if (match) {
                concatFile = match[1];
                concatIndex = i;
            }
        } else if (StaticFiles.MANIFEST_CONCAT_END.test(lines[i])) {
            sectionLength = i - concatIndex + 1;
            concatList = lines.splice(concatIndex, sectionLength);
            absPath = relativePath(pathname, concatFile.split('?')[0]);

            concatList.shift();
            concatList.pop();
            concatList = concatList.map(function (fileName) {
                return relativePath(pathname, fileName.split('?')[0]);
            });
            i -= sectionLength;
            l -= sectionLength;

            lines.splice(i + 1, 0, concatFile);
            l++;

            if (absPath in this._concats) {
                if (this._concats[absPath].join('\n') !== concatList.join('\n')) {
                    throw Error('Concat files did not match: ' + absPath + '\nEnsure that the order and names of the files are the same in both HTML and manifest files');
                }
            }

            this._concats[absPath] = concatList;
            concatFile = null;
        } else if (!lines[i]) {
            lines.splice(i, 1);
            i--;
            l--;
        }
    }

    body = lines.join('\n');
    callback(headers, body);
};

StaticFiles.prototype._prepareConcatFiles = function (pathname, headers, body, callback) {
    if (!this._concats || headers['Content-Type'] !== 'text/html') {
        callback(headers, body);
        return;
    }

    var self = this;

    body = body.toString().replace(StaticFiles.CONCAT_MATCH, function (original, concatPath, concatables) {
        var files = [];
        var absPath = relativePath(pathname, concatPath.split('?')[0]);
        var fileType;
        var match;

        if (!fileType) {
            while (match = StaticFiles.SCRIPT_MATCH.exec(concatables)) {
                fileType = 'js';
                files.push(relativePath(pathname, match[1].split('?')[0]));
            }
        }

        if (!fileType) {
            while (match = StaticFiles.STYLES_MATCH.exec(concatables)) {
                fileType = 'css';
                files.push(relativePath(pathname, match[1].split('?')[0]));
            }
        }

        if (!fileType) {
            return original;
        }

        if (absPath in self._concats) {
            if (self._concats[absPath].join('\n') !== files.join('\n')) {
                throw Error('Concat files did not match: ' + absPath + '\nEnsure that the order and names of the files are the same in both HTML and manifest files');
            }
        }

        self._concats[absPath] = files;

        switch (fileType) {
            case 'js':
                return '<script src="' + concatPath + '"></script>';

            case 'css':
                return '<link rel="stylesheet" href="' + concatPath + '">';

            default:
                delete self._concats[absPath];
                return original;
        }
    });

    callback(headers, body);
};

StaticFiles.prototype._versionScripts = function (pathname, headers, body, callback) {
    if (!this._options.versioning || headers['Content-Type'] !== 'text/html') {
        callback(headers, body);
        return;
    }

    var self = this;
    var $ = require('cheerio').load(body.toString());
    var hadVersioning = false;
    async.join(
        $('script').map(function () {
            var $script = $(this);
            return function (next) {
                var src = ($script.attr('src') || '').trim();
                if (!src) {
                    next();
                    return;
                }
                var parsed = urllib.parse(src, true);
                parsed.search = undefined;
                if (!parsed.query.version) {
                    next();
                    return;
                }

                var fullPath = relativePath(pathname, src.split('?')[0]);
                var prefix = self._options.apis + '/';
                var apiName;
                if (fullPath.substr(0, prefix.length) === prefix) {
                    apiName = fullPath.substr(prefix.length).split('.')[0];
                    self._options._apiModule._apiScript(apiName, function (status, headers, body) {
                        // This callback happens synchronously
                        handleFile(headers, body);
                    });
                } else {
                    self._cacheFileOrConcat(fullPath, handleFile);
                }

                function handleFile(headers, body) {
                    if (headers['Content-Encoding'] === 'gzip') {
                        zlib.gunzip(body, function (err, newBody) {
                            if (err) {
                                next();
                            } else {
                                finish(newBody);
                            }
                        });
                    } else {
                        finish(body);
                    }
                }

                function finish(body) {
                    hadVersioning = true;
                    $script.attr('src', getVersionedUrl(src, body));
                    next();
                }
            };
        }),
        function () {
            if (hadVersioning) {
                body = $.html();
            }
            callback(headers, body);
        }
    );
};

StaticFiles.prototype._versionStyles = function (pathname, headers, body, callback) {
    if (!this._options.versioning || headers['Content-Type'] !== 'text/html') {
        callback(headers, body);
        return;
    }

    var self = this;
    async.replace(body.toString(), StaticFiles.STYLES_MATCH, function (stylePath, next, matches) {
        if (!urllib.parse(stylePath, true).query.version) {
            next();
            return;
        }
        var fullPath = relativePath(pathname, stylePath.split('?')[0]);
        self._cacheFileOrConcat(fullPath, function (headers, body) {
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
                next(matches[0].replace(matches[1], getVersionedUrl(stylePath, body)));
            }
        });
    }, function (body) {
        callback(headers, body);
    });
};

StaticFiles.prototype._versionImages = function (pathname, headers, body, callback) {
    if (!this._options.versioning || headers['Content-Type'] !== 'text/css') {
        callback(headers, body);
        return;
    }

    var self = this;
    async.replace(body.toString(), StaticFiles.CSS_IMAGE, function (imgPath, respond, matches) {
        if (imgPath.substr(0, 5) === 'data:') {
            respond();
            return;
        }
        if (!urllib.parse(imgPath, true).query.version) {
            respond();
            return;
        }
        var fullPath = relativePath(pathname, imgPath.split('?')[0]);
        self._cacheFileOrConcat(fullPath, function (headers, body) {
            respond(matches[0].replace(matches[1], getVersionedUrl(imgPath, body)));
        });
    }, function (body) {
        callback(headers, body);
    });
};

StaticFiles.prototype._inlineScripts = function (pathname, headers, body, callback) {
    if (!this._options.inline || headers['Content-Type'] !== 'text/html') {
        callback(headers, body);
        return;
    }

    var self = this;
    var $ = require('cheerio').load(body.toString());
    var changedHTML = false;
    async.join(
        $('script').map(function () {
            var $script = $(this);
            return function (next) {
                var scriptPath = ($script.attr('src') || '').trim();
                if (!scriptPath) {
                    next();
                    return;
                }
                if (!urllib.parse(scriptPath, true).query.inline) {
                    next();
                    return;
                }
                var fullPath = relativePath(pathname, scriptPath.split('?')[0]);
                var prefix = self._options.apis + '/';
                var apiName;
                if (fullPath.substr(0, prefix.length) === prefix) {
                    apiName = fullPath.substr(prefix.length).split('.')[0];
                    self._options._apiModule._apiScript(apiName, function (status, headers, body) {
                        // This callback happens synchronously
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
                        changedHTML = true;
                        $script.removeAttr('src');
                        $script.html('//<![CDATA[\n' + body.toString().trim() + '\n//]]>');
                        next();
                    }
                }
            };
        }),
        function () {
            if (changedHTML) {
                body = $.html();
            }
            callback(headers, body);
        }
    );
};

StaticFiles.prototype._inlineStyles = function (pathname, headers, body, callback) {
    if (!this._options.inline || headers['Content-Type'] !== 'text/html') {
        callback(headers, body);
        return;
    }

    var self = this;
    async.replace(body.toString(), StaticFiles.STYLES_MATCH, function (stylePath, next) {
        if (!urllib.parse(stylePath, true).query.inline) {
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
                next('<style>\n' + body.toString().trim() + '\n</style>');
            }
        });
    }, function (body) {
        callback(headers, body);
    });
};

StaticFiles.prototype._inlineImages = function (pathname, headers, body, callback) {
    if (!this._options.inline || headers['Content-Type'] !== 'text/css') {
        callback(headers, body);
        return;
    }

    var self = this;
    async.replace(body.toString(), StaticFiles.CSS_IMAGE, function (imgPath, respond) {
        if (imgPath.substr(0, 5) === 'data:') {
            respond();
            return;
        }
        if (!urllib.parse(imgPath, true).query.inline) {
            respond();
            return;
        }
        var fullPath = relativePath(pathname, imgPath.split('?')[0]);
        self._cacheFile(fullPath, function (headers, body) {
            if (!Buffer.isBuffer(body)) {
                body = new Buffer(body, 'binary');
            }
            respond('url(data:' + headers['Content-Type'] + ';base64,' + body.toString('base64') + ')');
        });
    }, function (body) {
        callback(headers, body);
    });
};

StaticFiles.prototype._applyPlugins = function (pathname, headers, body, callback, plugins) {
    var self = this;
    if (!plugins) {
        plugins = self._getPlugins();
    }

    var jobs;
    var $;
    var originalContentType = headers['Content-Type'];
    var plugin = findMatchingPlugin(plugins, headers);
    if (plugin) {
        plugin.processor(pathname, headers, body, function (headers, body) {
            if (headers['Content-Type'] === originalContentType) {
                plugins.splice(plugins.indexOf(plugin), 1);
            } else {
                plugins = null;
            }
            self._applyPlugins(pathname, headers, body, callback, plugins);
        }, self._options);
    } else if (headers['Content-Type'] === 'text/html') {
        jobs = [];
        $ = require('cheerio').load(body.toString());
        $('script').each(function () {
            var $script = $(this);
            var code = $script.html();
            var type = ($script.attr('type') || '').trim();
            if (['', 'text/javascript', 'text/jsx'].indexOf(type) >= 0) {
                type = 'application/javascript';
            }
            if (!StaticFiles.WHITESPACE_MATCH.test(code)) {
                jobs.push(function (next) {
                    self._applyPlugins(
                        pathname, { 'Content-Type': type }, code,
                        function (newHeaders, newBody) {
                            if (code === newBody) {
                                next(false);
                            } else {
                                $script.attr('type', newHeaders['Content-Type']).html(newBody);
                                next(true);
                            }
                        }
                    );
                });
            }
        });
        $('style').each(function () {
            var $style = $(this);
            var code = $style.html();
            var type = ($style.attr('type') || '').trim();
            if (!type) {
                type = 'text/css';
            }
            if (!StaticFiles.WHITESPACE_MATCH.test(code)) {
                jobs.push(function (next) {
                    self._applyPlugins(
                        pathname, { 'Content-Type': type }, code,
                        function (newHeaders, newBody) {
                            if (code === newBody) {
                                next(false);
                            } else {
                                $style.attr('type', newHeaders['Content-Type']).html(newBody);
                                next(true);
                            }
                        }
                    );
                });
            }
        });
        async.join(jobs, function (results) {
            var hadCompilation = results.reduce(function (a, b) {
                return a || b;
            }, false);
            if (hadCompilation) {
                body = $.html();
            }
            callback(headers, body);
        });
    } else {
        callback(headers, body);
    }
};

StaticFiles.prototype._compileOutput = function (pathname, headers, body, callback) {
    if (!this._options.compile) {
        callback(headers, body);
        return;
    }

    var code;
    var uglify;
    var ast;
    var CleanCSS;
    switch (headers['Content-Type']) {
        case 'application/json':
            try {
                code = JSON.stringify(JSON.parse(body.toString()));
            } catch (err) {
                // no-op
            }
            if (code) {
                body = code;
            }
            break;

        case 'application/javascript':
            body = body.toString();
            uglify = require('uglify-js');
            try {
                ast = uglify.parser.parse(body);
                ast = uglify.uglify.ast_mangle(ast);
                ast = uglify.uglify.ast_squeeze(ast);
                code = uglify.uglify.gen_code(ast);
                if (code && code.length < body.length) {
                    body = code;
                }
            } catch (err) {
                // no-op
            }
            break;

        case 'text/css':
            body = body.toString();
            CleanCSS = require('clean-css');
            try {
                code = new CleanCSS().minify(body);
                if (code && code.length < body.length) {
                    body = code;
                }
            } catch (err) {
                // no-op
            }
            break;

        case 'text/html':
            body = body.toString();
            try {
                code = require('html-minifier').minify(body, {
                    removeComments           : true,
                    collapseWhitespace       : true,
                    conservativeCollapse     : true,
                    collapseBooleanAttributes: true,
                    removeAttributeQuotes    : true,
                    removeRedundantAttributes: true,
                    removeEmptyAttributes    : true,
                    caseSensitive            : true,
                    minifyJS                 : true,
                    minifyCSS                : true,
                });
                if (code && code.length < body.length) {
                    body = code;
                }
            } catch (err) {
                // no-op
            }
            break;
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

StaticFiles.prototype.get = function (pathname, callback) {
    if (this._cache) {
        finish(this._cache[pathname]);
    } else {
        this._rawGet(pathname, finish);
    }

    function finish(response) {
        if (response) {
            callback({
                status : response.status || 200,
                headers: extend({}, response.headers),
                body   : response.body,
            });
        } else {
            callback();
        }
    }
};

StaticFiles.prototype._rawGet = function (pathname, callback) {
    var self = this;
    var filePath = path.join(this._root, pathname);
    var parts = pathname.split('/');

    var i;
    for (i = 0; i < parts.length; i++) {
        if (parts[i][0] === '.') {
            callback();
            return;
        }
    }

    for (i = 0; i < this._ignores.length; i++) {
        if (pathname.substr(0, this._ignores[i].length) === this._ignores[i]) {
            callback();
            return;
        }
    }

    var isDirRoot = pathname[pathname.length - 1] === '/';
    if (isDirRoot) {
        async.forEach(StaticFiles.INDEX_FILES, function (indexFile, next) {
            if (callback) {
                self._rawGet(pathname + indexFile, function (data) {
                    if (data && callback) {
                        callback(data);
                        callback = null;
                    }
                    next();
                });
            } else {
                next();
            }
        }, function () {
            if (callback) {
                callback();
            }
        });
        return;
    }

    var stat;
    try {
        stat = fs.statSync(filePath);
    } catch (err) {
        callback();
        return;
    }
    if (stat.isDirectory() && !isDirRoot) {
        callback({
            status : 301,
            body   : '',
            headers: {
                Location: pathname + '/',
            },
        });
        return;
    }

    var file;
    try {
        file = fs.readFileSync(filePath);
    } catch (err) {
        callback();
        return;
    }

    var headers = {
        'Content-Type' : mime.lookup(filePath),
        'Cache-Control': this._getCacheControl(pathname),
    };
    this._applyPlugins(pathname, headers, file, function (headers, file) {
        if (self._isManifest(pathname, file)) {
            getLastModifiedTimestamp(self._root, self._ignores, function (timestamp) {
                file += '\n# Zerver timestamp: ' + timestamp;
                callback({
                    body   : file,
                    headers: headers,
                });
            });
        } else {
            callback({
                body   : file,
                headers: headers,
            });
        }
    });
};

StaticFiles.prototype.getManifests = function (callback) {
    var self = this;
    var manifests = [];
    walkDirectory(self._root, self._ignores, function (pathname, next) {
        if (self._isManifest(pathname)) {
            manifests.push(pathname);
        }
        next();
    }, function () {
        callback(manifests);
    });
};

StaticFiles.prototype._isManifest = function (pathname, body) {
    if (!this._options.manifest) {
        return false;
    }

    var paths;
    var i;
    if (this._options.ignoreManifest) {
        paths = this._options.ignoreManifest.split(',');
        for (i = 0; i < paths.length; i++) {
            if (relativePath('/', paths[i]) === pathname) {
                return false;
            }
        }
    }

    var ext = path.extname(pathname).toLowerCase();
    if (ext !== '.appcache' && ext !== '.manifest') {
        return false;
    }

    if (typeof body === 'undefined') {
        body = fs.readFileSync(path.join(this._root, pathname), 'utf8');
    }
    return body.toString('utf8').trim().substr(0, 14) === 'CACHE MANIFEST';
};



/* FS helpers */

function relativePath(path1, path2) {
    if (path2[0] === '/') {
        return path2;
    }

    if (path1[path1.length - 1] === '/') {
        return path.resolve(path1, path2);
    } else {
        return path.resolve(path1, '../' + path2);
    }
}

function walkDirectory(root, ignores, handler, callback, pathname) {
    if (!pathname) {
        pathname = '/';
    }

    var i;
    for (i = 0; i < ignores.length; i++) {
        if (pathname.substr(0, ignores[i].length) === ignores[i]) {
            callback();
            return;
        }
    }

    var filePath = path.join(root, pathname);
    fs.stat(filePath, function (err, stats) {
        if (err) {
            throw err;
        }

        if (!stats.isDirectory()) {
            handler(pathname, callback);
            return;
        }

        fs.readdir(filePath, function (err, children) {
            if (err) {
                throw err;
            }

            children = children.filter(function (child) {
                return child[0] !== '.';
            });


            nextChild();
            function nextChild() {
                var child = children.shift();
                if (child) {
                    setImmediate(function () {
                        walkDirectory(root, ignores, handler, nextChild, path.join(pathname, child));
                    });
                } else {
                    callback();
                }
            }
        });
    });
}

function getLastModifiedTimestamp(root, ignores, callback) {
    var latest = new Date(0);
    walkDirectory(root, ignores, function (pathname, next) {
        var filePath = path.join(root, pathname);
        var stats = fs.statSync(filePath);
        if (latest < stats.mtime) {
            latest = stats.mtime;
        }
        next();
    }, function () {
        callback(latest);
    });
}

function isDirectoryRootFile(pathname) {
    var fileName = pathname.split('/').pop();
    return StaticFiles.INDEX_FILES.indexOf(fileName) !== -1;
}

function getVersionedUrl(url, body) {
    var parsed = urllib.parse(url, true);
    parsed.query.version = crypto.createHash('md5').update(body).digest('hex');
    parsed.search = undefined;
    return parsed.format();
}

function findMatchingPlugin(plugins, headers) {
    var i;
    var j;
    var matchers;
    var matcher;
    for (i = 0; i < plugins.length; i++) {
        matchers = plugins[i].mime;
        for (j = 0; j < matchers.length; j++) {
            matcher = matchers[j];
            if (typeof matcher === 'string' && matcher === headers['Content-Type']) {
                return plugins[i];
            } else if (typeof matcher === 'function' && matcher(headers['Content-Type'])) {
                return plugins[i];
            } else if (Object.prototype.toString.call(matcher) === '[object RegExp]' && matcher.test(headers['Content-Type'])) {
                return plugins[i];
            }
        }
    }
}

function forNonManifestSections(body, handler) {
    body = body.toString('utf8');
    var newBody = '';
    var index = 0;
    var matcher = new RegExp(StaticFiles.CONCAT_MATCH);
    var m;
    while (m = matcher.exec(body)) {
        newBody += handler(body.substr(index, m.index));
        newBody += m[0];
        index = m.index + m[0].length;
    }
    newBody += handler(body.substr(index));
    return newBody;
}
