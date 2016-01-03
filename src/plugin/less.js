var path = require('path');

exports.mime = 'text/less';
exports.processor = function (pathname, headers, body, callback, options) {
    if (!options.less) {
        callback(headers, body);
        return;
    }

    try {
        require('less').render(body.toString(), {
            paths   : [options.dir, path.dirname(path.join(options.dir, pathname))],
            filename: path.join(options.dir, pathname),
        }, function (err, output) {
            if (err) {
                handleError(err);
            } else {
                headers['Content-Type'] = 'text/css';
                body = output.css;
                callback(headers, body);
            }
        });
    } catch (err) {
        handleError(err);
    }

    function handleError(err) {
        console.error('Failed to compile LESS file, ' + pathname);
        console.error(err.stack || err.message || err.toString());
        if (options.production) {
            process.exit(1);
        } else {
            callback(headers, body);
        }
    }
};
