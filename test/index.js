var fs     = require('fs');
var path   = require('path');
var Module = require('module');

var projectRoot = path.resolve(__dirname + '/../');
var time        = new Date();
var queue       = [];
var fsDirSync   = fs.readdirSync;
var fsReadSync  = fs.readFileSync;
var fsStatSync  = fs.statSync;
var fsLstatSync = fs.lstatSync;
var moduleFind  = Module._findPath;
var queueRunning = false;

exports.time = time;
exports.runTest = runTest;

// Preload dependencies
require(__dirname + '/../server/plugin/babel');
require(__dirname + '/../server/plugin/less');
require(__dirname + '/../server/plugin/jade');
require('babel-core');
require('cheerio');
require('clean-css');
require('html-minifier');
require('uglify-js');

require(__dirname + '/static');
require(__dirname + '/api');



function queueTask(task) {
    queue.push(task);
    if (!queueRunning) {
        process.nextTick(runTask);
    }
}

function runTask() {
    if (queueRunning) {
        return;
    }
    var task = queue.shift();
    if (task) {
        queueRunning = true;
        task(function () {
            queueRunning = false;
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
                return fsDirSync.call(fs, filename);
            }
            var file = findFile(filename);
            if (isFile(file)) {
                throw Error('directory is a file, ' + filename);
            }
            return Object.keys(file);
        };
        fs.readdir = function (filename, cb) {
            try {
                cb(null, fs.readdirSync(filename));
            } catch (err) {
                cb(err);
            }
        };

        fs.readFileSync = function (filename) {
            if (filename.substr(0, projectRoot.length) === projectRoot) {
                return fsReadSync.call(fs, filename);
            }
            var file = findFile(filename);
            if (!isFile(file)) {
                throw Error('file is a directory, ' + filename);
            }
            return file;
        };
        fs.readFile = function (filename, cb) {
            try {
                cb(null, fs.readFileSync(filename));
            } catch (err) {
                cb(err);
            }
        };

        fs.statSync = function (filename) {
            if (filename.substr(0, projectRoot.length) === projectRoot) {
                return fsStatSync.call(fs, filename);
            } else {
                return statFile(filename);
            }
        };
        fs.stat = function (filename, cb) {
            try {
                cb(null, fs.statSync(filename));
            } catch (err) {
                cb(err);
            }
        };

        fs.lstatSync = function (filename) {
            if (filename.substr(0, projectRoot.length) === projectRoot) {
                return fsLstatSync.call(fs, filename);
            } else {
                return statFile(filename);
            }
        };
        fs.lstat = function (filename, cb) {
            try {
                cb(null, fs.lstatSync(filename));
            } catch (err) {
                cb(err);
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
