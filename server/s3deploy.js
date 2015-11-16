var mime   = require('mime');
var urllib = require('url');
var async  = require('./lib/async');

module.exports = function (options, static, apis, callback) {
    var params  = parseS3Url(options.s3Deploy);
    var uploads = getUploads(options, static, apis);
    var s3      = new (require('aws-sdk').S3)();

    async.join(
        Object.keys(uploads).sort(function (pathname) {
            return {
                'text/cache-manifest'   : 4,
                'text/html'             : 3,
                'text/jade'             : 3,
                'text/jsx'              : 2,
                'text/coffeescript'     : 2,
                'application/javascript': 2,
                'text/css'              : 1,
                'text/less'             : 1,
            }[mime.lookup(pathname)] || 0;
        }).map(function (pathname) {
            return function (next) {
                uploadFile(
                    s3, params,
                    pathname,
                    uploads[pathname].headers,
                    uploads[pathname].body,
                    next
                );
            };
        }),
        function () {
            if (callback) {
                callback();
            }
        }
    );
};

function parseS3Url(url) {
    if (url.indexOf('://') === -1) {
        url = 's3://'+url;
    }
    var parsed    = urllib.parse(url);
    var bucket    = parsed.hostname;
    var keyPrefix = (parsed.pathname || '').substr(1);
    if ( !bucket ) {
        throw TypeError('s3deploy got invalid bucket='+bucket);
    }
    if (keyPrefix.length && keyPrefix[keyPrefix.length-1] !== '/') {
        keyPrefix += '/';
    }
    return { bucket: bucket, prefix: keyPrefix };
}

function getUploads(options, static, apis) {
    var uploads = static._cache;
    if (options.babel) {
        var polyfillPathname = apis._rootPath+'/polyfill.js';
        apis.get(apis._rootPath+'/polyfill.js', null, function (statusCode, headers, body) {
            uploads[polyfillPathname] = {
                headers: headers,
                body   : body,
            };
        });
    }
    Object.keys(uploads).forEach(function (pathname) {
        if (!pathname || pathname[pathname.length-1] === '/') {
            delete uploads[pathname];
        }
    });
    return uploads;
}

function uploadFile(s3, params, pathname, headers, body, callback) {
    var s3params = {
        Bucket: params.bucket,
        Key   : params.prefix+pathname.substr(1),
        ACL   : 'public-read',
        Body  : body,
    };
    if (headers['Content-Type']) {
        s3params['ContentType'] = headers['Content-Type'];
        delete headers['Content-Type'];
    }
    if (headers['Content-Encoding']) {
        s3params['ContentEncoding'] = headers['Content-Encoding'];
        delete headers['Content-Encoding'];
    }
    if (headers['Cache-Control']) {
        s3params['CacheControl'] = headers['Cache-Control'];
        delete headers['Cache-Control'];
    }
    delete headers['ETag'];
    delete headers['Vary'];
    s3params['Metadata'] = headers;

    s3.putObject(s3params, function(err, data) {
        if (err) {
            console.error('Failed to upload '+pathname);
            throw err;
        }
        console.log('Uploaded '+pathname);
        callback();
    });
}
