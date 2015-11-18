#!/usr/bin/env node

var cluster   = require('cluster');
var path      = require('path');
var fs        = require('fs');
var commander = require('commander');

var PACKAGE = __dirname+path.sep+'..'+path.sep+'package.json';

init();



function init() {
	if (require.main !== module) {
		throw Error('server/index.js must be run as main module');
	}

	var options = processOptions();
	options.env.forEach(function (assign) {
		var parts = assign.split('=');
		if (parts.length < 2) {
			throw TypeError('failed to parse env: '+assign);
		}
		var name  = parts[0];
		var value = parts.slice(1).join('=');
		process.env[name] = value;
	});

	if (options.production) {
		new (require(__dirname+path.sep+'zerver'))(options);
	} else if (cluster.isMaster) {
		new (require(__dirname+path.sep+'master'))(options);
	} else {
		new (require(__dirname+path.sep+'zerver'))(options, function () {
			process.send({ started: true });
		});
	}
}

function processOptions() {
	var commands = new commander.Command('zerver');
	commands
		.version(getZerverVersion(), '-v, --version')
		.usage('[options] [dir]')
		.option('-P, --port <n>'            , 'set server port to listen on', parseInt)
		.option('-h, --hostname <addr>'     , 'set server hostname to listen to', undefined)
		.option('-p, --production'          , 'enable production mode (caching, concat, minfiy, gzip, etc)')
		.option('--env <assign>'            , 'set environment variables (name="value")', function(v,m){m.push(v);return m}, [])
		.option('--cache <paths>'           , 'set specific cache life for resources')
		.option('-M, --missing <paths>'     , 'set a custom 404 page')
		.option('--s3-deploy <path>'        , 'dump generated static output to S3')
		.option('--ignore-manifest <paths>' , 'disable processing for a particular HTML5 appCache manifest file')
		.option('--no-manifest'             , 'disable processing for ALL HTML5 appCache manifest files')
		.option('--no-gzip'                 , 'disable gzip compression in production mode')
		.option('--no-concat'               , 'disable file concatenation compression in production mode')
		.option('--no-compile'              , 'disable js, css minification in production mode')
		.option('--no-inline'               , 'disable file inlining in production mode')
		.option('--no-versioning'           , 'disable file versioning in production mode')
		.option('--no-coffee'               , 'disable compilation of CoffeeScript to JavaScript')
		.option('--no-less'                 , 'disable compilation of LESS to CSS')
		.option('--no-jade'                 , 'disable compilation of Jade to HTML')
		.option('--babel'                   , 'enable Babel compilation for JS/JSX')
		.option('--babel-exclude <paths>'   , 'exclude paths from Babel compilation')
		.option('-q, --quiet'               , 'turn off request logging')
		.option('-V, --verbose'             , 'verbose request logging')
		.parse(getCLIArgs());
	if (commands.s3Deploy) {
		commands.production = true;
	}
	if ( !commands.production ) {
		commands.gzip    = false;
		commands.concat  = false;
		commands.compile = false;
		commands.inline  = false;
	}
	commands.dir = path.resolve(process.cwd(), commands.args[0] || '.');
	if ( !commands.port ) {
		commands.port = parseInt(process.env.PORT) || 5000;
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
		console.log('[env="'+process.env.ZERVER_FLAGS+'"]');
		defaultArgs = parseShell(process.env.ZERVER_FLAGS);
	} else {
		defaultArgs = [];
	}
	return process.argv.slice(0,2).concat(defaultArgs).concat(process.argv.slice(2));
}

function getZerverVersion() {
	try {
		var packageFile = fs.readFileSync(PACKAGE),
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
			} else return s.replace(/\\([ "'\\$`(){}!#&*|])/g, '$1');
		});
}
