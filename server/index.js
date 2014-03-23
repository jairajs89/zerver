#!/usr/bin/env node

var cluster   = require('cluster'),
	path      = require('path'),
	fs        = require('fs'),
	commander = require('commander'),
	Master    = require(__dirname+path.sep+'master'),
	Slave     = require(__dirname+path.sep+'slave');

var PACKAGE = __dirname+path.sep+'..'+path.sep+'package.json';



process.nextTick(function () {
	if (require.main !== module) {
		throw Error('server/index.js must be run as main module');
	}

	var options = processOptions();
	if (cluster.isMaster) {
		new Master(options);
	} else {
		new Slave(options);
	}
});



function processOptions() {
	var commands = new commander.Command('zerver');
	commands
		.version(getZerverVersion(), '-v, --version')
		.usage('[options] [dir]')
		.option('-P, --port <n>'            , 'set server port to listen on', parseInt, process.env.PORT||5000)
		.option('-r, --refresh'             , 'auto-refresh browsers on file changes')
		.option('-c, --cli'                 , 'js shell for connect remote clients')
		.option('-p, --production'          , 'enable production mode (caching, concat, minfiy, gzip, etc)')
		.option('--cache <paths>'           , 'set specific cache life for resources')
		.option('-M, --missing <paths>'     , 'set a custom 404 page')
		.option('--ignore-manifest <paths>' , 'disable processing for a particular HTML5 appCache manifest file')
		.option('--no-manifest'             , 'disable processing for ALL HTML5 appCache manifest files')
		.option('--no-gzip'                 , 'disable gzip compression in production mode')
		.option('--no-concat'               , 'disable file concatenation compression in production mode')
		.option('--no-compile'              , 'disable js, css minification in production mode')
		.option('--no-inline'               , 'disable file inlining in production mode')
		.option('--no-coffee'               , 'disable compilation of CoffeeScript to JavaScript')
		.option('--no-less'                 , 'disable compilation of LESS to CSS')
		.option('--no-jade'                 , 'disable compilation of Jade to HTML')
		.option('-V, --verbose'             , 'verbose request logging')
		.option('-H, --headers'             , 'show headers in logs')
		.option('-j, --json'                , 'requests get logged as json')
		.option('-s, --stats'               , 'periodically print memory usage and other stats')
		.parse(getCLIArgs());
	if (commands.production) {
		commands.refresh = false;
		commands.cli     = false;
	} else {
		commands.gzip    = false;
		commands.concat  = false;
		commands.compile = false;
		commands.inline  = false;
	}
	commands.logging = commands.cli;
	commands.dir = path.resolve(process.cwd(), commands.args[0] || '.');

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
