var fs = require('fs');

var CHANGE_TIMEOUT   = 1000,
	ROOT_DIR         = process.cwd(),
	CLIENT_JS        = 'client.js',
	INSERT_HOST      = '{{__API_HOST__}}',
	INSERT_NAME      = '{{__API_NAME__}}',
	INSERT_API       = '{{__API_OBJ__}}',
	INSERT_FUNCTIONS = '{{__API_FUNCTIONS__}}';

var setupComplete  = false,
	scriptTemplate = fs.readFileSync(__dirname + '/' + CLIENT_JS) + '',
	apiNames       = [],
	apis           = {},
	apiScripts     = {};



exports.setup = function (apiDir) {
	if (setupComplete) {
		throw Error('apis can be setup only once');
	}
	setupComplete = true;

	//TODO: validate apiDir

	try {
		apiNames = fs.readdirSync('./' + apiDir);
	}
	catch (err) {}

	apiNames.forEach(function (fileName) {
		var len = fileName.length;

		if (fileName.substr(len-3) !== '.js') {
			return;
		}

		var apiName  = fileName.substr(0, len-3),
			fileName = ROOT_DIR + '/' + apiDir + '/' + apiName;

		var api = require(fileName);
		apis[apiName] = api;

		var apiObj       = {},
			apiFunctions = {},
			file         = scriptTemplate;

		setupAPIObj(api, apiObj, apiFunctions);

		file = file.replace(INSERT_NAME     , JSON.stringify(apiName)     );
		file = file.replace(INSERT_API      , JSON.stringify(apiObj)      );
		file = file.replace(INSERT_FUNCTIONS, JSON.stringify(apiFunctions));

		apiScripts[apiName] = file;
	});
};



exports.get = function (apiName) {
	return apis[apiName];
};



exports.getScript = function (apiName, apiHost) {
	if ( !(apiName in apiScripts) ) {
		return;
	}

	apiHost = apiHost || 'localhost:8888';
	return apiScripts[apiName].replace(INSERT_HOST, JSON.stringify(apiHost));
};



exports.getNames = function () {
	var names = [];

	for (var apiName in apis) {
		names.push(apiName);
	}

	return names;
};



function setupAPIObj (api, obj, functions) {
	var value;

	for (var key in api) {
		value = api[key];

		switch (typeof value) {
			case 'function':
				functions[key] = true;
				break;

			case 'object':
				obj[key] = {};
				functions[key] = {};
				setupAPIObj(value, obj[key], functions[key]);
				break;

			default:
				obj[key] = value;
				break;
		}
	}
}
