exports.matcher = ['text/coffeescript'];
exports.processor = function (pathname, headers, body, callback, options) {
    if (!options.coffee) {
        callback(headers, body);
        return;
    }

    try {
        body = require('coffee-script').compile(body.toString());
        headers['Content-Type'] = 'application/javascript';
    } catch (err) {
        console.error('Failed to compile CoffeeScript file, ' + pathname);
        console.error(err.toString());
        if (options.production) {
            process.exit(1);
        }
    }
    callback(headers, body);
};
