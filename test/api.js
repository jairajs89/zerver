var assert   = require('assert'),
	extend   = require('util')._extend,
	test     = require(__dirname+'/index'),
	APICalls = require(__dirname+'/../server/api');

function testObj() {
	return function (root, callback) {
		for (var key in require.cache) {
			if (key.substr(0,8) === '/zerver/') {
				delete require.cache[key];
			}
		}
		var apis = new APICalls(root, '/zerver', {});
		apis.test = testRequest;
		apis.customTest = customRequest;
		callback(apis);
	};
}

function testRequest(func, args, callback) {
	this.get('/zerver/'+func, {
		method: 'POST',
		on: function (type, handler) {
			var data;
			switch (type) {
				case 'data':
					data = '{"args":'+JSON.stringify(args)+'}';
					break;
				case 'end':
					break;
				default:
					return;
			}
			process.nextTick(function () {
				handler(data);
			});
		}
	}, function (status, headers, body) {
		assert.equal(status, 200);
		assert.equal(headers['Content-Type' ], 'application/json');
		assert.equal(headers['Cache-Control'], 'no-cache'        );
		callback(JSON.parse(body).data);
	});
}

function customRequest(method, func, body, callback) {
	this.get('/zerver/'+func, {
		method: method.toUpperCase(),
		on: function (type, handler) {
			var data;
			switch (type) {
				case 'data':
					data = body;
					break;
				case 'end':
					break;
				default:
					return;
			}
			process.nextTick(function () {
				handler(data);
			});
		}
	}, callback);
}



test.runTest(testObj(), {
	'zerver': {
		'test.js': 'exports.foo=function(x,c){c(x+2)}'
	}
}, function (apis, files, callback) {
	apis.test('test/foo', [1], function (y) {
		assert.equal(y, 3);
		callback();
	});
});

test.runTest(testObj(), {
	'zerver': {
		'test.js': 'exports.foo=function(x,c){console.log("w");c("x")};exports.foo.type="GET"'
	}
}, function (apis, files, callback) {
	apis.customTest('GET', 'test/foo', '', function (status, headers, body) {
		//TODO
		assert.equal(status, 503);
		assert.equal(body, 'not implemented');
		callback();
	});
});
