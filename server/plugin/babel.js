var path = require('path');
var babelModuleInner = require(path.join(__dirname, 'babel-modules', 'babel-module-inner'));
var babelModuleOuter = require(path.join(__dirname, 'babel-modules', 'babel-module-outer'));

exports.mime = ['text/jsx', 'application/javascript'];
exports.processor = function (pathname, headers, body, callback, options) {
    if (!options.babel || isBabelExcluded(pathname, options)) {
        callback(headers, body);
        return;
    }

    try {
        body = require('babel-core').transform(body.toString(), {
            blacklist       : ['strict'],
            modules         : 'ignore',
            moduleIds       : true,
            filename        : path.join(options.dir, pathname),
            filenameRelative: pathname,
            compact         : false,
            ast             : false,
            comments        : false,
            loose           : 'all',
            plugins         : [
                {
                    transformer: babelModuleInner,
                    position   : 'before',
                },
                {
                    transformer: babelModuleOuter,
                    position   : 'after',
                },
            ],
        }).code;
        headers['Content-Type'] = 'application/javascript';
    } catch (err) {
        console.error('failed to compile JSX file, ' + pathname);
        console.error(err.toString());
        if (options.production) {
            process.exit(1);
        }
    }
    callback(headers, body);
};

function isBabelExcluded(pathname, options) {
    var paths;
    var excludePath;
    var i;
    if (options.babelExclude) {
        paths = options.babelExclude.split(',');
        for (i = 0; i < paths.length; i++) {
            excludePath = path.resolve('/', paths[i]);
            if (pathname.substr(0, excludePath.length) === excludePath) {
                return true;
            }
        }
    }
    return false;
}
