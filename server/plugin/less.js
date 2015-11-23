var fs = require('fs');
var path = require('path');
var less;

exports.mime = 'text/less';
exports.processor = function (pathname, headers, body, callback, options) {
    if (!options.less) {
        callback(headers, body);
        return;
    }

    var LessParser;
    try {
        LessParser = getLess().Parser;
        new LessParser({
            filename: path.join(options.dir, pathname),
        }).parse(body.toString(), function (e, r) {
            headers['Content-Type'] = 'text/css';
            body = r.toCSS();
            callback(headers, body);
        });
    } catch (err) {
        console.error('Failed to compile LESS file, ' + pathname);
        console.error(err.toString());
        if (options.production) {
            process.exit(1);
        } else {
            callback(headers, body);
        }
    }
};

function getLess() {
    if (!less) {
        less = require('less');
        less.Parser.importer = function (file, paths, callback) {
            var pathname = path.join(paths.entryPath, file);
            try {
                fs.statSync(pathname);
            } catch (e) {
                throw new Error('File ' + file + ' not found');
            }

            var data = fs.readFileSync(pathname, 'utf-8');
            var LessParser = less.Parser;
            new LessParser({
                paths   : [path.dirname(pathname)].concat(paths),
                filename: pathname,
            }).parse(data, function (e, root) {
                if (e) {
                    less.writeError(e);
                }
                callback(e, root);
            });
        };
    }
    return less;
}
