var assert   = require('assert'),
	extend   = require('util')._extend,
	test     = require(__dirname+'/index'),
	APICalls = require(__dirname+'/../server/api');

function testObj() {
	return function (root, callback) {
		var apis = new APICalls(root, '/zerver', {});
		callback(apis);
	};
}

function addBrowserClient(files) {
	//TODO
	return files;
}



test.runTest(testObj(), addBrowserClient({
	//TODO
}), function (apis, files, callback) {
	//TODO
	callback();
});
