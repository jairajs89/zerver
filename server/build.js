var fs     = require('fs');
var mkpath = require('mkpath');
var path   = require('path');
var zlib   = require('zlib');

module.exports = function (buildDir, files, callback) {
    var buildPath = path.resolve(process.cwd(), buildDir);

    removeDirectory(buildPath);
    fs.mkdirSync(buildPath);

    Object.keys(files).forEach(function (pathname) {
        console.log('Building file: ' + pathname);

        var filePath = path.join(buildPath, pathname);
        var file     = files[pathname];

        mkpath.sync(path.dirname(filePath));

        var body = file.body;
        if (file.headers['Content-Encoding'] === 'gzip') {
            body = zlib.gunzipSync(body);
        }
        fs.writeFileSync(filePath, body, { encoding: 'utf8' });
    });

    if (callback) {
        callback();
    }
};

function removeDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach(function (file, index) {
            var curPath = dirPath + path.sep + file;
            if (fs.lstatSync(curPath).isDirectory()) {
                removeDirectory(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dirPath);
    }
}
