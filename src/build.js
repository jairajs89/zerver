var fs     = require('fs');
var mkpath = require('mkpath');
var path   = require('path');

module.exports = function (buildDir, files, callback) {
    var buildPath = path.resolve(process.cwd(), buildDir);

    removeDirectory(buildPath);
    fs.mkdirSync(buildPath);

    Object.keys(files).forEach(function (pathname) {
        console.log('Building file: ' + pathname);

        var filePath = path.join(buildPath, pathname);
        var file     = files[pathname];

        mkpath.sync(path.dirname(filePath));
        fs.writeFileSync(filePath, file.body, { encoding: 'utf8' });
    });

    if (callback) {
        callback();
    }
};

function removeDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach(function (file, index) {
            var curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                removeDirectory(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dirPath);
    }
}
