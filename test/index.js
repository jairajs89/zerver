var fs     = require('fs');
var path   = require('path');
var Module = require('module');

var projectRoot = path.resolve(__dirname + '/../');
var time        = new Date();
var queue       = [];
var fsDir       = fs.readdirSync;
var fsRead      = fs.readFileSync;
var fsStat      = fs.statSync;
var fsLstat     = fs.lstatSync;
var moduleFind  = Module._findPath;

exports.time = time;
exports.runTest = runTest;

require(__dirname + '/static');
require(__dirname + '/api');



function queueTask(task) {
    queue.push(task);
    if (queue.length === 1) {
        process.nextTick(runTask);
    }
}

function runTask() {
    var task = queue[0];
    if (task) {
        task(function () {
            queue.shift();
            process.nextTick(runTask);
        });
    }
}

function runTest(testObj, files, callback) {
    var root = '';

    function isFile(file) {
        return typeof file === 'string' || Buffer.isBuffer(file);
    }

    function findFile(filename) {
        if (filename[filename.length - 1] === '/') {
            filename = filename.substr(0, filename.length - 1);
        }
        var segments = filename.split('/').slice(1);
        var folder   = files;
        var segment;
        while (segment = segments.shift()) {
            if (!(segment in folder)) {
                throw Error('file not found, ' + filename);
            }
            folder = folder[segment];
        }
        return folder;
    }

    queueTask(function (dequeue) {
        fs.readdirSync = function (filename) {
            if (filename.substr(0, projectRoot.length) === projectRoot) {
                return fsDir.call(fs, filename);
            }
            var file = findFile(filename);
            if (isFile(file)) {
                throw Error('directory is a file, ' + filename);
            }
            return Object.keys(file);
        };

        fs.readFileSync = function (filename) {
            if (filename.substr(0, projectRoot.length) === projectRoot) {
                return fsRead.call(fs, filename);
            }
            var file = findFile(filename);
            if (!isFile(file)) {
                throw Error('file is a directory, ' + filename);
            }
            return file;
        };

        fs.statSync = function (filename) {
            if (filename.substr(0, projectRoot.length) === projectRoot) {
                return fsStat.call(fs, filename);
            } else {
                return statFile(filename);
            }
        };

        fs.lstatSync = function (filename) {
            if (filename.substr(0, projectRoot.length) === projectRoot) {
                return fsLstat.call(fs, filename);
            } else {
                return statFile(filename);
            }
        };

        Module._findPath = function (filename, paths) {
            if (filename[0] === '/' && filename.substr(0, projectRoot.length) !== projectRoot) {
                return filename + '.js';
            } else {
                return moduleFind.apply(this, arguments);
            }
        };

        function statFile(filename) {
            var file = findFile(filename);
            return {
                atime      : time,
                mtime      : time,
                ctime      : time,
                isDirectory: function () {
                    return !isFile(file);
                },
                isFile: function () {
                    return !isFile(file);
                },
                isBlockDevice: function () {
                    return false;
                },
                isCharacterDevice: function () {
                    return false;
                },
                isSymbolicLink: function () {
                    return false;
                },
                isFiFO: function () {
                    return false;
                },
                isSocket: function () {
                    return false;
                },
            };
        }

        testObj(root, function (obj) {
            callback(obj, files, dequeue);
        });
    });
}
