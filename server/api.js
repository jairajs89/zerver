var extend = require('util')._extend;
var fs = require('fs');
var path = require('path');
var qs = require('querystring');
var zlib = require('zlib');
var urllib = require('url');
var Cookies = require(__dirname + path.sep + 'lib' + path.sep + 'cookies');

module.exports = APICalls;

APICalls.CLIENT_API = __dirname + path.sep + '..' + path.sep + 'client' + path.sep + 'index.js';
APICalls.CLIENT_POLYFILL = path.resolve(require.resolve('babel-core'), '..' + path.sep + 'browser-polyfill.js');
APICalls.INSERT_DIR = '{{__API_DIR__}}';
APICalls.INSERT_NAME = '{{__API_NAME__}}';
APICalls.INSERT_API = '{{__API_OBJ__}}';
APICalls.INSERT_FUNCTIONS = '{{__API_FUNCTIONS__}}';
APICalls.INSERT_ORIGIN = '{{__API_ORIGIN__}}';



function APICalls(options) {
    this._options = extend({}, options || {});
    this._root = this._options.dir;
    this._rootPath = this._options.apis;
    this._apis = {};
    this._apiScripts = {};
    this._cors = {};

    var scriptApi = fs.readFileSync(APICalls.CLIENT_API).toString();
    var apiNames;
    try {
        apiNames = fs.readdirSync(this._root + this._rootPath);
    } catch (err) {
        apiNames = [];
    }

    if (hasCoffeeScript(apiNames)) {
        require('coffee-script/register');
    }
    global.ZERVER_DEBUG = !this._options.production;

    apiNames.forEach(function (fileName) {
        var apiName = getApiName(fileName);
        if (!apiName) {
            return;
        }

        var fullName = path.join(this._root + this._rootPath, apiName);
        var api = require(fullName);
        this._apis[apiName] = api;

        if (typeof api._crossOrigin === 'string') {
            this._cors[apiName] = api._crossOrigin;
            delete api._crossOrigin;
        }

        var apiObj = {};
        var apiFunctions = {};
        setupAPIObj(api, apiObj, apiFunctions);

        var file = scriptApi;
        file = file.replace(APICalls.INSERT_DIR, JSON.stringify(this._rootPath));
        file = file.replace(APICalls.INSERT_NAME, JSON.stringify(apiName));
        file = file.replace(APICalls.INSERT_API, JSON.stringify(apiObj));
        file = file.replace(APICalls.INSERT_FUNCTIONS, JSON.stringify(apiFunctions));
        file = file.replace(APICalls.INSERT_ORIGIN, JSON.stringify(this._options.origin));
        if (this._options.production) {
            file = uglifyJs(file);
        }
        this._apiScripts[apiName] = file;
    }, this);

    this._polyfillScript = fs.readFileSync(APICalls.CLIENT_POLYFILL).toString();
    if (this._options.production) {
        this._polyfillScript = uglifyJs(this._polyfillScript);
    }
}



APICalls.prototype.get = function (pathname, req, callback) {
    if (pathname.substr(0, this._rootPath.length + 1) !== this._rootPath + '/') {
        callback();
        return;
    }

    var apiParts = pathname.substr(this._rootPath.length + 1).split('/');
    var apiName;
    if (apiParts.length === 1) {
        apiName = getApiName(apiParts[0]);
        if (apiName) {
            this._apiScript(apiName, callback);
        } else {
            callback(404, { 'Cache-Control': 'text/plain' }, '404');
        }
        return;
    }

    var func = this._apis[apiParts[0]];
    var i;
    try {
        for (i = 1; i < apiParts.length; i++) {
            func = func[apiParts[i]];
        }
    } catch (err) {
        func = null;
    }
    if (typeof func !== 'function') {
        callback(404, { 'Cache-Control': 'text/plain' }, '404');
        return;
    }

    this._apiCall(apiParts[0], req, func, callback);
};

APICalls.prototype.getNames = function () {
    return Object.keys(this._apis);
};

APICalls.prototype._apiScript = function (apiName, callback) {
    var script;
    if (apiName === 'polyfill') {
        script = this._polyfillScript;
    } else {
        script = this._apiScripts[apiName];
    }
    if (script) {
        callback(200, {
            'Content-Type' : 'application/javascript',
            'Cache-Control': 'no-cache',
        }, script);
    } else {
        callback(404, { 'Cache-Control': 'text/plain' }, '404');
    }
};

APICalls.prototype._apiCall = function (apiName, req, func, callback) {
    var self = this;

    var cors;
    if (apiName in self._cors) {
        if (typeof self._cors[apiName] === 'string') {
            cors = self._cors[apiName];
        } else {
            cors = self._cors[apiName].join(', ');
        }
    }

    var maxAge = 60 * 60 * 6;
    if (cors && req.method === 'OPTIONS') {
        callback(200, {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin' : cors,
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Max-Age'      : maxAge,
            'Cache-Control'               : 'public, max-age=' + maxAge,
        }, '');
        return;
    }

    if (req.method !== 'POST') {
        callback(415, { 'Cache-Control': 'text/plain' }, '415');
        return;
    }

    req.ip = getClientHost(req);
    req.protocol = getClientProtocol(req);
    req.host = req.headers.host;
    req.pathname = req.url.split('?')[0];
    req.query = urllib.parse(req.url, true).query;
    req.params = extend({}, req.query);
    req.referrer = req.headers.referrer || req.headers.referer;
    req.userAgent = req.headers['user-agent'];
    req.cookies = new Cookies(req);
    self._zerverApiCall(req, func, finish);

    function finish(status, headers, body) {
        req.cookies.setHeaders(headers);
        if (cors) {
            headers['Access-Control-Allow-Headers'] = 'Content-Type';
            headers['Access-Control-Allow-Origin'] = cors;
        }
        if (self._options.gzip && body) {
            zlib.gzip(body, function (err, gzipped) {
                if (err || body.length < gzipped.toString('utf8').length) {
                    callback(status, headers, body);
                } else {
                    headers['Content-Encoding'] = 'gzip';
                    callback(status, headers, gzipped);
                }
            });
        } else {
            callback(status, headers, body);
        }
    }
};

APICalls.prototype._zerverApiCall = function (req, func, finish) {
    var called = false;
    var oldApiStyle = false;

    getRequestBody(req, function (body) {
        var args;
        try {
            args = JSON.parse(body);
        } catch (err) {
            // no-op
        }
        if (args && typeof args === 'object' && args.args) {
            oldApiStyle = true;
            args = args.args;
        }
        if (!Array.isArray(args)) {
            finish(400, { 'Cache-Control': 'text/plain' }, '400');
            return;
        }
        args.push(successCallback);

        var val;
        try {
            val = func.apply(req, args);
        } catch (err) {
            errorCallback(err);
            return;
        }

        if (typeof val !== 'undefined') {
            successCallback(val);
        }
    });

    function successCallback() {
        respond(Array.prototype.slice.call(arguments));
    }

    function errorCallback(error) {
        respond(new Error(String(error)));
    }

    function respond(data) {
        if (called) {
            return;
        }
        called = true;

        var body;
        var err;
        if ( !(data instanceof Error) ) {
            try {
                if (oldApiStyle) {
                    body = JSON.stringify({ data: data });
                } else {
                    body = JSON.stringify(data);
                }
            } catch (e) {
                err = e;
            }
        } else {
            err = data;
        }

        if (err) {
            console.error(err.stack || err.message || '');
            finish(500, {
                'Cache-Control': 'text/plain',
            }, err.stack || err.message || '');
        } else {
            finish(200, {
                'Content-Type' : 'application/json',
                'Cache-Control': 'no-cache',
            }, body);
        }
    }
};



function getApiName(pathname) {
    var parts = pathname.split('/').pop().split('.');
    var ext = parts.length > 1 ? parts.pop() : null;
    if (['js', 'coffee'].indexOf(ext) >= 0) {
        return parts.join('.');
    } else {
        return null;
    }
}

function setupAPIObj(api, obj, functions) {
    var value;
    var key;
    for (key in api) {
        value = api[key];
        switch (typeof value) {
            case 'function':
                if (typeof value.type !== 'string' || value.type.toLowerCase() !== 'get') {
                    functions[key] = true;
                }
                break;

            case 'object':
                if (!value || Array.isArray(value)) {
                    obj[key] = value;
                } else {
                    obj[key] = {};
                    functions[key] = {};
                    setupAPIObj(value, obj[key], functions[key]);
                }
                break;

            default:
                obj[key] = value;
                break;
        }
    }
}

function getRequestBody(req, callback) {
    var body = '';
    req.on('data', function (chunk) {
        body += chunk;
    });
    req.on('end', function () {
        callback(body);
    });
}

function getClientHost(req) {
    var host = req.headers['x-forwarded-for'];
    if (host) {
        return host.split(',')[0];
    } else {
        return req.connection.remoteAddress;
    }
}

function getClientProtocol(req) {
    var proto = req.headers['x-forwarded-proto'];
    if (proto) {
        return proto.split(',')[0];
    } else {
        return 'http';
    }
}

function uglifyJs(code) {
    var uglify = require('uglify-js');
    var ast;
    try {
        ast = uglify.parser.parse(code);
        ast = uglify.uglify.ast_mangle(ast);
        ast = uglify.uglify.ast_squeeze(ast);
        return uglify.uglify.gen_code(ast);
    } catch (err) {
        return code;
    }
}

function hasCoffeeScript(apiNames) {
    var i;
    var parts;
    var ext;
    for (i = 0; i < apiNames.length; i++) {
        parts = apiNames[i].split('/').pop().split('.');
        ext = parts.length > 1 ? parts.pop() : null;
        if (ext === 'coffee') {
            return true;
        }
    }
    return false;
}
