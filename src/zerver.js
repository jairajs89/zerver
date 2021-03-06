var fs       = require('fs');
var path     = require('path');
var extend   = require('util')._extend;
var APICalls = require(path.join(__dirname, 'api'));
var Logger   = require(path.join(__dirname, 'log'));
var s3deploy = require(path.join(__dirname, 's3deploy'));
var buildToDirectory = require(path.join(__dirname, 'build'));

module.exports = Zerver;

Zerver.API_PATH = '/zerver';
Zerver.REQUEST_TIMEOUT = 25 * 1000;



function Zerver(options, callback) {
    var self = this;
    self._options = extend({
        ignores: Zerver.API_PATH + '/',
        apis   : Zerver.API_PATH,
    }, options || {});

    global.ZERVER_DEBUG = !self._options.production;

    self._logger = new Logger(self._options);
    self._apis = new APICalls(self._options);
    self._options._apiModule = self._apis;
    var StaticFiles = require(path.join(__dirname, 'static'));
    self._static = new StaticFiles(self._options, function () {
        self._static = this;
        if (self._options.s3Deploy) {
            s3deploy(self._options.s3Deploy, self._getFiles(), callback);
        } else if (self._options.build) {
            buildToDirectory(self._options.build, self._getFiles(), callback);
        } else {
            self._start(callback);
        }
    });
}

Zerver.prototype._start = function (callback) {
    var self = this;

    if (self._options.missing && self._options.missing[0] !== '/') {
        self._options.missing = '/' + self._options.missing;
    }

    var isSsl = self._options.sslKey && self._options.sslCert;
    var http;
    if (isSsl) {
        http = require('https');
    } else {
        http = require('http');
    }

    http.globalAgent.maxSockets = 50;

    if (isSsl) {
        self._app = http.createServer({
            key : fs.readFileSync(self._options.sslKey),
            cert: fs.readFileSync(self._options.sslCert),
        }, self._handleRequest.bind(self));
    } else {
        self._app = http.createServer(self._handleRequest.bind(self));
    }

    self._app.listen(self._options.port, function () {
        var apiNames;
        if (!self._options.quiet) {
            console.log('zerver running:');
            console.log('- path: ' + self._options.dir);
            console.log('- port: ' + self._options.port);
            apiNames = self._apis.getNames();
            if (apiNames.length) {
                console.log('- apis: ' + apiNames.join(', '));
            }
            self._static.getManifests(function (manifestList) {
                if (manifestList.length) {
                    console.log('- manifests: ' + manifestList.join(', '));
                }
                console.log('');
                if (callback) {
                    callback();
                }
            });
        } else if (callback) {
            callback();
        }
    });
};

Zerver.prototype.stop = function (callback) {
    if (this._app) {
        this._app.close(callback);
    } else {
        throw Error('zerver has not started yet, unable to stop');
    }
};

Zerver.prototype._handleRequest = function (req, res) {
    var self     = this;
    var pathname = req.url.split('?')[0];

    self._prepareRequest(req, res);

    self._apis.get(pathname, req, function (status, headers, body) {
        if (typeof status !== 'undefined') {
            finish(status, headers, body);
            return;
        }

        self._static.get(pathname, function (data) {
            if (!data && self._options.missing) {
                self._static.get(self._options.missing, handleStaticFetch);
            } else {
                handleStaticFetch(data);
            }

            function handleStaticFetch(data) {
                if (data) {
                    finish(data.status, data.headers, data.body);
                } else {
                    finish(404, { 'Content-Type': 'text/plain' }, '404');
                }
            }
        });
    });

    function finish(status, headers, body) {
        res.writeHeader(status, headers);
        if (Buffer.isBuffer(body)) {
            res.write(body, 'binary');
        } else {
            res.write(body, 'utf8');
        }
        res.end();
    }
};

Zerver.prototype._prepareRequest = function (req, res) {
    var self = this;

    self._logger.startRequest(req, res);

    req.on('error', function (err) {
        console.error('zerver: request error');
        console.error(err);
        console.error(err.stack);
    });

    res.on('error', function (err) {
        console.error('zerver: response error');
        console.error(err);
        console.error(err.stack);
    });

    var timeout = setTimeout(function () {
        console.error('zerver: request timeout');
        res.statusCode = 500;
        res.end('');
    }, Zerver.REQUEST_TIMEOUT);

    var resEnd = res.end;
    res.end = function () {
        clearTimeout(timeout);
        res.end = resEnd;
        res.end.apply(this, arguments);
        self._logger.endRequest(req, res);
    };
};

Zerver.prototype._getFiles = function () {
    var files = this._static._cache;
    var polyfillPathname = this._apis._rootPath + '/es6.js';
    if (this._options.es6) {
        this._apis.get(
            this._apis._rootPath + '/es6.js',
            null,
            function (statusCode, headers, body) {
                files[polyfillPathname] = {
                    headers: headers,
                    body   : body,
                };
            }
        );
    }
    Object.keys(files).forEach(function (pathname) {
        var file      = files[pathname];
        var notFile   = file.status && file.status !== 200;
        var isDirRoot = pathname[pathname.length - 1] === '/';
        if (!pathname || notFile || isDirRoot) {
            delete files[pathname];
        }
        if (!notFile && isDirRoot && !files[pathname + 'index.html']) {
            files[pathname + 'index.html'] = file;
        }
    });
    return files;
};
