var fs = require('fs');

var CHANGE_TIMEOUT   = 1000,
	ROOT_DIR         = process.cwd(),
	REFRESH          = false,
	CLIENT_JS        = 'client.js',
	INSERT_REFRESH   = '{{__API_REFRESH__}}',
	INSERT_HOST      = '{{__API_HOST__}}',
	INSERT_DIR       = '{{__API_DIR__}}',
	INSERT_NAME      = '{{__API_NAME__}}',
	INSERT_APIS      = '{{__API_APIS__}}',
	INSERT_ROOT      = '{{__API_ROOT__}}',
	INSERT_API       = '{{__API_OBJ__}}',
	INSERT_FUNCTIONS = '{{__API_FUNCTIONS__}}';

var setupComplete  = false,
	scriptTemplate = fs.readFileSync(__dirname + '/' + CLIENT_JS) + '',
	apiNames       = [],
	apis           = {},
	apiScripts     = {},
	cors           = {},
	apiScheme, requireScript, refreshScript;



exports.setup = function (apiDir, refresh) {
	if (setupComplete) {
		throw Error('apis can be setup only once');
	}
	setupComplete = true;

	REFRESH = refresh;

	//TODO: validate apiDir

	try {
		apiNames = fs.readdirSync('./' + apiDir);
	}
	catch (err) {}

	var templateData = {};

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

		if (typeof api._crossOrigin === 'string') {
			cors[apiName] = api._crossOrigin;
			delete api._crossOrigin;
		}

		setupAPIObj(api, apiObj, apiFunctions);

		templateData[apiName] = [apiObj, apiFunctions];

		file = file.replace(INSERT_ROOT     , JSON.stringify(apiName)     );
		file = file.replace(INSERT_API      , JSON.stringify(apiObj)      );
		file = file.replace(INSERT_FUNCTIONS, JSON.stringify(apiFunctions));
		file = file.replace(INSERT_APIS     , JSON.stringify(null)        );

		apiScripts[apiName] = file;
	});

	requireScript = scriptTemplate;
	requireScript = requireScript.replace(INSERT_ROOT     , JSON.stringify(null)        );
	requireScript = requireScript.replace(INSERT_API      , JSON.stringify(null)        );
	requireScript = requireScript.replace(INSERT_FUNCTIONS, JSON.stringify(null)        );
	requireScript = requireScript.replace(INSERT_APIS     , JSON.stringify(templateData));

	refreshScript = scriptTemplate;
	refreshScript = requireScript.replace(INSERT_ROOT     , JSON.stringify(null)        );
	refreshScript = requireScript.replace(INSERT_API      , JSON.stringify(null)        );
	refreshScript = requireScript.replace(INSERT_FUNCTIONS, JSON.stringify(null)        );
	refreshScript = requireScript.replace(INSERT_APIS     , JSON.stringify(null)        );

	apiScheme = templateData;
};



exports.getScheme = function () {
	return apiScheme;
};



exports.get = function (apiName) {
	return apis[apiName];
};



exports.getScript = function (apiRoot, apiName, apiHost, apiDir) {
	var isRequire = (apiRoot === 'require'),
		isRefresh = (apiRoot === 'refresh'),
		isAPI     = (apiRoot in apiScripts);

	apiHost = apiHost || 'localhost:8888';

	var script;

	if (isAPI) {
		script = apiScripts[apiRoot];
	}
	else if (isRequire) {
		script = requireScript;
	}
	else if (isRefresh) {
		script = refreshScript;
	}
	else {
		return;
	}

	script = script.replace(INSERT_REFRESH, JSON.stringify(REFRESH));
	script = script.replace(INSERT_NAME   , JSON.stringify(apiName));
	script = script.replace(INSERT_HOST   , JSON.stringify(apiHost));
	script = script.replace(INSERT_DIR    , JSON.stringify(apiDir ));

	return script;
};



exports.getNames = function () {
	var names = [];

	for (var apiName in apis) {
		names.push(apiName);
	}

	return names;
};



exports.getCORS = function (apiName) {
	return cors[apiName];
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
