var path = require('path');

exports.mime = 'text/jade';
exports.processor = function (pathname, headers, body, callback, options) {
    if (!options.jade) {
        callback(headers, body);
        return;
    }

    try {
        body = require('jade').render(body.toString(), {
            filename    : path.join(options.dir, pathname),
            pretty      : !options.production,
            compileDebug: !options.production,
        });
        headers['Content-Type'] = 'text/html';
    } catch (err) {
        console.error('Failed to compile Jade file, ' + pathname);
        console.error(err.toString());
        if (options.production) {
            process.exit(1);
        }
    }
    callback(headers, body);
};
