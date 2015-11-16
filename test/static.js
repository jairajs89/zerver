var assert      = require('assert'),
	extend      = require('util')._extend,
	zlib        = require('zlib'),
	test        = require(__dirname+'/index'),
	StaticFiles = require(__dirname+'/../server/static'),
	async       = require(__dirname+'/../server/lib/async');

var postfix = '\n# Zerver timestamp: '+test.time;

function testObj(options) {
	return function (root, callback) {
		var cache = new StaticFiles(
			extend({
				dir        : root,
				ignores    : '/zerver/',
				production : true,
			}, options || {}),
			function () {
				process.nextTick(function () {
					callback(cache);
				});
			}
		);
	};
}



test.runTest(testObj({
	manifest : false,
}), {
	'manifest.appcache' : 'CACHE MANIFEST\nmain.js',
}, function (cache, files, callback) {
	var data = cache.get('/manifest.appcache');
	assert.deepEqual(data.body, files['manifest.appcache']);
	callback();
});
test.runTest(testObj({ ignoreManifest: 'manifest.appcache' }), {
	'manifest.appcache' : 'CACHE MANIFEST\nmain.js',
}, function (cache, files, callback) {
	var data = cache.get('/manifest.appcache');
	assert.deepEqual(data.body, files['manifest.appcache']);
	callback();
});

test.runTest(testObj({
	inline   : true,
	manifest : true,
}), {
	'index.html'        : '<script src="main.js?inline=1"></script>',
	'manifest.appcache' : 'CACHE MANIFEST\nmain.js?inline=1',
	'main.js'           : 'console.log("hello, world")',
	'main.css'          : '#a{background-image:url(i.png?inline=1)}',
	'i.png'             : new Buffer('aaaa', 'base64'),
}, function (cache, files, callback) {
	var data1 = cache.get('/index.html');
	assert.deepEqual(data1.body, '<script>//<![CDATA[\n'+files['main.js']+'\n//]]></script>');

	var data2 = cache.get('/manifest.appcache');
	assert.deepEqual(data2.body, 'CACHE MANIFEST'+postfix);

	var data3 = cache.get('/main.css');
	assert.deepEqual(data3.body, '#a{background-image:url(data:image/png;base64,aaaa)}');

	callback();
});

test.runTest(testObj({
	concat   : true,
	manifest : true,
}), {
	'index.html'        : '<!-- zerver:main2.js -->\n<script src="main.js"></script>\n<script src="main.js"></script>\n<!-- /zerver -->',
	'inde2.html'        : '<!-- zerver:main3.js -->\n<script src="empty.js"></script>\n<script src="main.js"></script>\n<script src="empty.js"></script>\n<!-- /zerver -->',
	'manifest.appcache' : 'CACHE MANIFEST\n# zerver:alt2.js\nalt.js\nalt.js\n# /zerver',
	'main.js'           : 'console.log("hello, world")',
	'alt.js'            : 'console.log("alt world")',
	'empty.js'          : '',
}, function (cache, files, callback) {
	var data1 = cache.get('/index.html');
	assert.deepEqual(data1.body, '<script src="main2.js"></script>');

	var data2 = cache.get('/main2.js');
	assert.deepEqual(data2.body, files['main.js']+';\n'+files['main.js']);

	var data3 = cache.get('/manifest.appcache');
	assert.deepEqual(data3.body, 'CACHE MANIFEST\nalt2.js'+postfix);

	var data4 = cache.get('/alt2.js');
	assert.deepEqual(data4.body, files['alt.js']+';\n'+files['alt.js']);

	var data5 = cache.get('/main3.js');
	assert.deepEqual(data5.body, files['main.js']);

	callback();
});

test.runTest(testObj({
	compile : true,
	inline  : true,
}), {
	'index.html' : '<script src="main.js?inline=1"></script>',
	'main.js'    : 'console.log("hello, world");',
	'main.css'   : '#a { color : red }',
}, function (cache, files, callback) {
	var data1 = cache.get('/main.js');
	assert.deepEqual(data1.body, 'console.log("hello, world")');

	var data2 = cache.get('/main.css');
	assert.deepEqual(data2.body, '#a{color:red}');

	var data3 = cache.get('/index.html');
	assert.deepEqual(data3.body, '<script>//<![CDATA[\nconsole.log("hello, world")\n//]]></script>');

	callback();
});

test.runTest(testObj({
	compile: true,
	versioning: true,
}), {
	'index.html'  : '<script src="main.js?version=1"></script>',
	'main.js'     : 'console.log("hello, world");',
	'index2.html' : '<link rel="stylesheet" href="main.css?version=1">',
	'main.css'    : '#a { color : red }',
	'inline.css'  : 'div{background-image:url(img.png?version=1)}',
	'img.png'     : 'gahhhh',
}, function (cache, files, callback) {
	var data1 = cache.get('/index.html');
	assert.deepEqual(data1.body, '<script src="main.js?version=37de8ccba10a2ce4ae9d2648bb00f33a"></script>');

	var data2 = cache.get('/index2.html');
	assert.deepEqual(data2.body, '<link rel=stylesheet href="main.css?version=e22e2f02bc00f96eaef4e55895a363b7">');

	var data3 = cache.get('/inline.css');
	assert.deepEqual(data3.body, 'div{background-image:url(img.png?version=94e1c3da437b9edd176aeb47e12dab05)}');

	callback();
});

test.runTest(testObj({
	compile: true,
	babel: true,
}), {
	'test.js' : 'export function sum(arr) { return arr.reduce(((v, t) => v+t), 0) }',
}, function (cache, files, callback) {
	var data = cache.get('/test.js');
	assert.deepEqual(data.body, '(function(){"use strict";function e(e){return e.reduce(function(e,t){return e+t},0)}this.__ZERVER_MODULES=this.__ZERVER_MODULES||{},this.__ZERVER_MODULES["/test"]=this.__ZERVER_MODULES["/test"]||{},this.__ZERVER_MODULES["/test"].sum=e}).call(this)');
	callback();
});

test.runTest(testObj({
	gzip : true,
}), {
	'index.html' : '<script src="main.js"></script>',
	'main.js'    : 'console.log("hello, world")',
	'main.css'   : '#a{color:red}',
	'i.png'      : new Buffer('aaaa', 'base64'),
}, function (cache, files, callback) {
	async.join([
		function (respond) {
			var data1 = cache.get('/index.html');
			zlib.gzip(files['index.html'], function (_, body) {
				assert.deepEqual(data1.body, body);
				respond();
			});
		},
		function (respond) {
			var data2 = cache.get('/main.js');
			zlib.gzip(files['main.js'], function (_, body) {
				assert.deepEqual(data2.body, body);
				respond();
			});
		},
		function (respond) {
			var data3 = cache.get('/main.css');
			zlib.gzip(files['main.css'], function (_, body) {
				assert.deepEqual(data3.body, body);
				respond();
			});
		},
		function (respond) {
			var data4 = cache.get('/i.png');
			assert.deepEqual(data4.body, files['i.png']);
			respond();
		},
	], callback);
});
