var AWS = require('aws-sdk');

module.exports = function (options, static, apis, callback) {
    var s3url = options.s3Build;

    //TODO: loop through files accessible through static.get
    //TODO: include polyfill file
    //TODO: ignore paths that end with /
    //TODO: deploy files to s3

    console.error('URL:', s3url);
    throw Error('--s3-deploy not implemented');

    if (callback) {
        callback();
    }
};
