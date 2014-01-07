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
		var apis = new APICalls({
			dir  : root,
			apis : '/zerver',
		});
		apis.test = testRequest;
		apis.customTest = customRequest;
		callback(apis);
	};
}

function testRequest(func, args, callback) {
	var body = '{"args":'+JSON.stringify(args)+'}';
	this.get('/zerver/'+func.split('?')[0], {
		url: '/zerver/'+func,
		method: 'POST',
		headers: {
			'content-length': body.length,
			'content-type': 'application/json',
			'connection': 'keep-alive',
			'accept': '*/*',
		},
		connection: {
			remoteAddress: '127.0.0.1'
		},
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
	}, function (status, headers, body) {
		process.nextTick(function () {
			assert.equal(status, 200);
			assert.equal(headers['Content-Type' ], 'application/json');
			assert.equal(headers['Cache-Control'], 'no-cache'        );
			callback(JSON.parse(body).data);
		});
	});
}

function customRequest(method, func, body, callback, isForm) {
	this.get('/zerver/'+func.split('?')[0], {
		url: '/zerver/'+func,
		method: method.toUpperCase(),
		headers: {
			'content-length': body.length,
			'content-type': (isForm ? 'application/x-www-form-urlencoded' : 'application/json'),
			'connection': 'keep-alive',
			'accept': '*/*',
		},
		connection: {
			remoteAddress: '127.0.0.1'
		},
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
	}, function (status, headers, body) {
		process.nextTick(function () {
			callback(status, headers, body);
		});
	});
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
		'test.js': 'exports.foo=function(x,c){c("x")};exports.foo.type="GET"'
	}
}, function (apis, files, callback) {
	apis.customTest('GET', 'test/foo?foo=bar', '', function (status, headers, body) {
		assert.equal(status, 200);
		assert.equal(body, 'x');
		callback();
	});
});

test.runTest(testObj(), {
	'zerver': {
		'test.js': 'exports.foo=function(p,c){c(p)};exports.foo.type="GET"'
	}
}, function (apis, files, callback) {
	apis.customTest('GET', 'test/foo?foo=bar', '', function (status, headers, body) {
		assert.equal(status, 200);
		assert.equal(headers['Content-Type'], 'application/json');
		assert.equal(body, '{"foo":"bar"}');
		callback();
	});
});

test.runTest(testObj(), {
	'zerver': {
		'test.js': 'exports.foo=function(p,c){c(p)};exports.foo.type="GET"'
	}
}, function (apis, files, callback) {
	apis.customTest('GET', 'test.js', '', function (status, headers, body) {
		assert.equal(status, 200);
		assert.equal(headers['Content-Type'], 'application/javascript');
		callback();
	});
});

test.runTest(testObj(), {}, function (apis, files, callback) {
	apis.customTest('GET', 'require.js', '', function (status, headers, body) {
		assert.equal(status, 200);
		assert.equal(headers['Content-Type'], 'application/javascript');
		callback();
	});
});
