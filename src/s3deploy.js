var path   = require('path');
var mime   = require('mime');
var urllib = require('url');
var async  = require(path.join(__dirname, 'lib', 'async'));

var SORT_ORDER = {
    'text/cache-manifest'   : 4,
    'text/html'             : 3,
    'text/jade'             : 3,
    'text/jsx'              : 2,
    'application/javascript': 2,
    'text/css'              : 1,
    'text/less'             : 1,
};

module.exports = function (s3Url, uploads, callback) {
    var params = parseS3Url(s3Url);
    var S3     = require('aws-sdk').S3;
    var s3     = new S3();

    async.join(
        Object.keys(uploads).sort(function (a, b) {
            return (SORT_ORDER[mime.lookup(a)] || 0) - (SORT_ORDER[mime.lookup(b)] || 0);
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
        url = 's3://' + url;
    }
    var parsed    = urllib.parse(url);
    var bucket    = parsed.hostname;
    var keyPrefix = (parsed.pathname || '').substr(1);
    if (!bucket) {
        throw TypeError('s3deploy got invalid bucket=' + bucket);
    }
    if (keyPrefix.length && keyPrefix[keyPrefix.length - 1] !== '/') {
        keyPrefix += '/';
    }
    return {
        bucket: bucket,
        prefix: keyPrefix,
    };
}

function uploadFile(s3, params, pathname, headers, body, callback) {
    var s3params = {
        Bucket: params.bucket,
        Key   : params.prefix + pathname.substr(1),
        ACL   : 'public-read',
        Body  : body,
    };
    var metadata = Object.assign({}, headers);
    if (metadata['Content-Type']) {
        s3params.ContentType = metadata['Content-Type'];
        delete metadata['Content-Type'];
    }
    if (metadata['Content-Encoding']) {
        s3params.ContentEncoding = metadata['Content-Encoding'];
        delete metadata['Content-Encoding'];
    }
    if (metadata['Cache-Control']) {
        s3params.CacheControl = metadata['Cache-Control'];
        delete metadata['Cache-Control'];
    }
    delete metadata.ETag;
    delete metadata.Vary;
    s3params.Metadata = metadata;

    s3.putObject(s3params, function (err, data) {
        if (err) {
            console.error('Failed to upload ' + pathname);
            throw err;
        }
        console.log('Uploaded ' + pathname);
        callback();
    });
}
