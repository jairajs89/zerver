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

function zipFiles(files, callback) {
	async.join(
		Object.keys(files).map(function (filename) {
			if ((typeof files[filename] === 'string') || Buffer.isBuffer(files[filename])) {
				return function (respond) {
					var ext = filename.split('.').pop();
					if (['html', 'css', 'js', 'appcache'].indexOf(ext) === -1) {
						respond([filename, files[filename]]);
					} else {
						zlib.gzip(files[filename], function (_, body) {
							respond([filename, body]);
						});
					}
				};
			} else {
				return function (respond) {
					zipFiles(files[filename], function (files) {
						respond([filename, files]);
					});
				};
			}
		}),
		function (map) {
			var newFiles = {};
			map.forEach(function (data) {
				newFiles[data[0]] = data[1];
			});
			callback(newFiles);
		}
	);
}

function zipCheck(file, data, callback) {
	if (file.headers['Content-Encoding'] === 'gzip') {
		zlib.gunzip(file.body, function (_, body) {
			finish(body.toString());
		});
	} else {
		finish(file.body);
	}
	function finish(body) {
		assert.deepEqual(body, data);
		callback();
	}
}

function zipChecker(file, data) {
	return function (callback) {
		zipCheck(file, data, callback);
	};
}



test.runTest(testObj({ disableManifest: true }), {
	'manifest.appcache' : 'CACHE MANIFEST\nmain.js',
}, function (cache, files, callback) {
	zipFiles(files, function (zipFiles) {
		var data = cache.get('/manifest.appcache');
		assert.deepEqual(data.body, zipFiles['manifest.appcache']);

		callback();
	});
});
test.runTest(testObj({ ignoreManifest: 'manifest.appcache' }), {
	'manifest.appcache' : 'CACHE MANIFEST\nmain.js',
}, function (cache, files, callback) {
	zipFiles(files, function (zipFiles) {
		var data = cache.get('/manifest.appcache');
		assert.deepEqual(data.body, zipFiles['manifest.appcache']);

		callback();
	});
});

test.runTest(testObj(), {
	'index.html'        : '<script src="main.js?inline=1"></script>',
	'manifest.appcache' : 'CACHE MANIFEST\nmain.js?inline=1',
	'main.js'           : 'console.log("hello, world")',
	'main.css'          : '#a{background-image:url(i.png?inline=1)}',
	'i.png'             : new Buffer('aaaa', 'base64'),
}, function (cache, files, callback) {
	async.join([
		zipChecker(
			cache.get('/index.html'),
			'<script>//<![CDATA[\n'+files['main.js']+'\n//]]></script>'
		),
		zipChecker(
			cache.get('/manifest.appcache'),
			'CACHE MANIFEST'+postfix
		),
		zipChecker(
			cache.get('/main.css'),
			'#a{background-image:url(data:image/png;base64,aaaa)}'
		),
	], callback);
});

test.runTest(testObj(), {
	'index.html'        : '<!-- zerver:main2.js -->\n<script src="main.js"></script>\n<script src="main.js"></script>\n<!-- /zerver -->',
	'manifest.appcache' : 'CACHE MANIFEST\n# zerver:alt2.js\nalt.js\nalt.js\n# /zerver',
	'main.js'           : 'console.log("hello, world")',
	'alt.js'            : 'console.log("alt world")',
}, function (cache, files, callback) {
	async.join([
		zipChecker(
			cache.get('/index.html'),
			'<script src="main2.js"></script>'
		),
		zipChecker(
			cache.get('/main2.js'),
			files['main.js']+'\n'+files['main.js']
		),
		zipChecker(
			cache.get('/manifest.appcache'),
			'CACHE MANIFEST\nalt2.js'+postfix
		),
		zipChecker(
			cache.get('/alt2.js'),
			files['alt.js']+'\n'+files['alt.js']
		),
	], callback);
});

test.runTest(testObj(), {
	'index.html' : '<script src="main.js?inline=1"></script>',
	'main.js'    : 'console.log("hello, world");',
	'main.css'   : '#a { color : red }',
}, function (cache, files, callback) {
	async.join([
		zipChecker(
			cache.get('/main.js'),
			'console.log("hello, world")'
		),
		zipChecker(
			cache.get('/main.css'),
			'#a{color:red}'
		),
		zipChecker(
			cache.get('/index.html'),
			'<script>//<![CDATA[\nconsole.log("hello, world")\n//]]></script>'
		),
	], callback);
});

test.runTest(testObj(), {
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
