var assert   = require('assert');
var test     = require(__dirname + '/index');
var APICalls = require(__dirname + '/../src/api');

function testObj() {
    return function (root, callback) {
        var key;
        for (key in require.cache) {
            if (key.substr(0, 8) === '/zerver/') {
                delete require.cache[key];
            }
        }
        var apis = new APICalls({
            dir : root,
            apis: '/zerver',
        });
        apis.test = testRequest;
        callback(apis);
    };
}

function testRequest(func, args, callback) {
    var body = JSON.stringify(args);
    this.get('/zerver/' + func.split('?')[0], {
        url    : '/zerver/' + func,
        method : 'POST',
        headers: {
            'content-length': body.length,
            'content-type'  : 'application/json',
            connection      : 'keep-alive',
            accept          : '*/*',
        },
        connection: {
            remoteAddress: '127.0.0.1',
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
        },
    }, function (status, headers, body) {
        process.nextTick(function () {
            assert.equal(status, 200);
            assert.equal(headers['Content-Type'], 'application/json');
            assert.equal(headers['Cache-Control'], 'no-cache');
            callback(JSON.parse(body));
        });
    });
}



test.runTest(testObj(), {
    zerver: {
        'test.js': 'exports.foo=function(x,y,c){c(x+y)}',
    },
}, function (apis, files, callback) {
    apis.test('test/foo', [1, 2], function (y) {
        assert.equal(y, 3);
        callback();
    });
});
