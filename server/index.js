#!/usr/bin/env node

var cluster   = require('cluster');
var path      = require('path');
var fs        = require('fs');
var urllib    = require('url');
var commander = require('commander');

var PACKAGE = __dirname + path.sep + '..' + path.sep + 'package.json';

init();



function init() {
    if (require.main !== module) {
        throw Error('server/index.js must be run as main module');
    }

    var options = processOptions();
    options.env.forEach(function (assign) {
        var parts = assign.split('=');
        if (parts.length < 2) {
            throw TypeError('failed to parse env: ' + assign);
        }
        var name  = parts[0];
        var value = parts.slice(1).join('=');
        process.env[name] = value;
    });

    if (options.production) {
        new (require(__dirname + path.sep + 'zerver'))(options);
    } else if (cluster.isMaster) {
        new (require(__dirname + path.sep + 'master'))(options);
    } else {
        new (require(__dirname + path.sep + 'zerver'))(options, function () {
            process.send({ started: true });
        });
    }
}

function processOptions() {
    var cliArgs = getCLIArgs();
    var dir = process.cwd();
    if (cliArgs.length > 2 && cliArgs[cliArgs.length - 1][0] !== '-') {
        dir = path.resolve(dir, cliArgs.pop());
    }

    var commands = new commander.Command('zerver');
    commands
        .version(getZerverVersion(), '-v, --version')
        .usage('[options] [dir]')
        .option('-P, --port <n>', 'set server port to listen on', parseInt)
        .option('-p, --production', 'enable production mode (caching, concat, minfiy, gzip, etc)')
        .option('-M, --missing <paths>', 'set a custom 404 page')
        .option('--cache <cachepaths>', 'set specific cache life for resources')
        .option('--plugins <paths>', 'turn on specific plugins (comma separated list)')
        .option('--babel', 'enable Babel compilation for JS/JSX')
        .option('--babel-exclude <paths>', 'exclude paths from Babel compilation')
        .option('-q, --quiet', 'turn off request logging')
        .option('-V, --verbose', 'verbose request logging')
        .option('--no-concat', 'disable file concatenation compression in production mode')
        .option('--no-compile', 'disable js, css minification in production mode')
        .option('--no-inline', 'disable file inlining in production mode')
        .option('--no-versioning', 'disable file versioning in production mode')
        .option('--no-coffee', 'disable compilation of CoffeeScript to JavaScript')
        .option('--no-less', 'disable compilation of LESS to CSS')
        .option('--no-jade', 'disable compilation of Jade to HTML')
        .option('--no-gzip', 'disable gzip compression in production mode')
        .option('--ignore-manifest <paths>', 'disable processing for a particular HTML5 appCache manifest file')
        .option('--no-manifest', 'disable processing for ALL HTML5 appCache manifest files')
        .option('--s3-deploy <path>', 'dump generated static output to S3')
        .option('--build <path>', 'build static output to a directory')
        .option('--origin <origin>', 'set api origin', parseOrigin, '')
        .option('--ssl-key <path>', 'SSL key for HTTPS handling')
        .option('--ssl-cert <path>', 'SSL certificate for HTTPS handling')
        .option('--env <assign>', 'set environment variables (name="value")', function (v, m) { m.push(v); return m; }, [])
        .parse(cliArgs);
    commands.dir = dir;
    if (commands.s3Deploy || commands.build) {
        commands.production = true;
    }
    if (!commands.production) {
        commands.gzip = false;
        commands.concat = false;
        commands.compile = false;
        commands.inline = false;
    }
    if (!commands.port) {
        commands.port = parseInt(process.env.PORT) || 5000;
    }
    if (commands.sslKey !== commands.sslCert) {
        if (commands.sslKey) {
            console.error('--ssl-cert missing');
        } else {
            console.error('--ssl-key missing');
        }
        process.exit(1);
    }

    var jsonCommands = {};
    Object.keys(commands).filter(function (name) {
        if (name[0] === '_') {
            return false;
        }
        if (['rawArgs', 'args', 'commands', 'options'].indexOf(name) !== -1) {
            return false;
        }
        return true;
    }).forEach(function (name) {
        jsonCommands[name] = commands[name];
    });

    return jsonCommands;
}

function getCLIArgs() {
    var defaultArgs;
    if (process.env.ZERVER_FLAGS) {
        defaultArgs = parseShell(process.env.ZERVER_FLAGS);
    } else {
        defaultArgs = [];
    }
    return process.argv.slice(0, 2).concat(defaultArgs).concat(process.argv.slice(2));
}

function parseOrigin(origin, defaultValue) {
    if (!origin) {
        return defaultValue;
    }

    var parsed = urllib.parse(origin);
    if (!parsed.protocol) {
        console.error('Protocol is required for --origin, got ' + origin);
        process.exit(1);
    } else if (!parsed.host) {
        console.error('Host is required for --origin, got ' + origin);
        process.exit(1);
    }

    return origin;
}

function getZerverVersion() {
    var packageFile;
    var packageData;
    try {
        packageFile = fs.readFileSync(PACKAGE);
        packageData = JSON.parse(packageFile);
        return packageData.version;
    } catch (err) {
        return '0.0.0';
    }
}

function parseShell(s) {
    return s.match(/(['"])((\\\1|[^\1])*?)\1|(\\ |\S)+/g)
        .map(function (s) {
            if (/^'/.test(s)) {
                return s
                    .replace(/^'|'$/g, '')
                    .replace(/\\(["'\\$`(){}!#&*|])/g, '$1');
            } else if (/^"/.test(s)) {
                return s
                    .replace(/^"|"$/g, '')
                    .replace(/\\(["'\\$`(){}!#&*|])/g, '$1');
            } else {
                return s.replace(/\\([ "'\\$`(){}!#&*|])/g, '$1');
            }
        });
}
