Zerver is a lightweight Node.js-based webserver that lets you seamlessly make server API calls as if they were a library on the client. The goal is to provide a developer-focused toolset and remove all the boilerplate involved in serving a webapp.

## Install

```sh
npm install -g zerver
# or add zerver to your package.json dependencies and run npm install
```



# Basic usage

Let's say you have a directory of this structure.

```
website-dir/index.html
website-dir/zerver/MyAPI.js
```

Everything in `website-dir` will be served as static content except for code in `zerver/` which will run on the server.
Only files on the topmost level of the zerver folder will be saved as api's i.e. files in subfolders under zerver will not be used unless they are specifically required in one of the main api files.
```js
// in website-dir/zerver/MyAPI.js
// this runs on the server
exports.logStuff = function (str) {
    console.log(str); // 'hi from client'
    callback('hi from server');
};
```

```html
<!-- in website-dir/index.html -->
<!-- this runs in the browser -->
<script src="zerver/MyAPI.js"></script>
<script>
    MyAPI.logStuff('hi from client', function (str) {
        console.log(str); // "hi from server"
    });
</script>
```

```sh
# run the server
zerver website-dir
# go to http://localhost:5000/ to view the magic
```

### What just happened?

`MyAPI.logStuff` automatically serializes the arguments of the function call and makes an AJAX request to the server. The server runs the function in `website-dir/zerver/MyAPI.js` and responds to the client in a similar way.

Any amount of arguments can be used in the function calls as long as they are JSON stringify-able (with the exception of the callback function).

Note: any server code in a subdirectory of `website-dir/zerver` will not be available for import on the client allowing for libraries of private server functionality.



# Zerver options

```sh
# General usage
zerver [options] website-dir

# run server on a different port
zerver --port=8000 website-dir

-V, --verbose
# Verbose logging of requests, including host,
# protocol, referrer, ip address and user agent

-H, --headers
# Include request headers in logging

-j, --json
# Print request logs as JSON (easy to consume by log parsers)
```

### Default options

You can specify default options in an environment variable, to avoid having to type them every time or having different setups for different environments in which the code will run:
```sh
export ZERVER_FLAGS='-rc'
```

## Refresh mode (`-r, --refresh`)

```sh
zerver -r website-dir
```

When you are developing a webpage in the browser the `-r` flag causes the page to automatically refresh whenever you edit your code. This is a convenient utility that allows for frictionless rapid iteration.

Note: this feature requires that you have included a zerver script somewhere on the webpage and that the browser supports websockets.

## Command line interface (`-c, --cli`)

```sh
zerver -c website-dir
```

Enable command line JavaScript access to the browser that your webpage is currently running on. This is extremely usefull when running on a mobile device where it is difficult to debug and access logs. Right from your terminal you'll be able to run commands remotely and see their result as well as see a constant stream of logs from your client.

For example:

```sh
> zerver --cli website-dir

# Press <tab> to access remote command line
>>>
# The following line logs all the functions that are available in 'MyAPI'
>>> Object.keys(MyAPI)
["function1", "function2"]

# Logs are automatically streamed here as well
>>> console.log( Object.keys(MyAPI) )
log: ["function1", "function2"]
undefined
# Notice that the log occurred, as well as
# the 'undefined' return value from the command
```

Note: this feature requires that you have included a zerver script somewhere on the webpage and that the browser supports websockets.

## Production mode (`-p, --production`)

```sh
zerver -p website-dir
```

While zerver tries to provide the best developer experience it is built with production environments in mind. Enabling production mode turns on a list of features including:

* in-memory caching of static files
* auto compiled/minified JavaScript & CSS
* gzipped output
* inlined scripts, styles, images
* concatenated scripts, styles
* HTML5 appcache manifest management



### Inline scripts, styles, images

Zerver can automatically inline files to reduce the number of requests your app makes and protentially speed things up for your users.

```html
<link rel="stylesheet" href="/css/styles.css?inline=1">
<!-- will create a 'style' tag with the inlined css -->
```

```html
<script src="/js/main.js?inline=1"></script>
<!-- will create a 'script' tag with the inlined js -->
```

```css
#thing {
    background-image: url(/img/background.png?inline=1);
    /* will inline the image as a base64 data URI */
}
```

### Concatenate scripts, styles

The reduce the number of requests your app makes it often makes sense to combine stylesheets or scripts into single files.

```html
<!-- zerver:css/main.min.css -->
<link rel="stylesheet" href="/css/jquery.ui.css">
<link rel="stylesheet" href="/css/styles.css">
<!-- /zerver -->
<!-- will create a 'link' tag with href="css/main.min.css" -->
```

```html
<!-- zerver:js/main.min.js -->
<script src="js/jquery.js"></script>
<script src="js/jquery.ui.js"></script>
<script src="js/main.js"></script>
<!-- /zerver -->
<!-- will create a 'script' tag with src="js/main.min.js" -->
```

Zerver will automatically serve the combined files at the designated URL.

### HTML5 appcache manifest

HTML5 has support for offline apps using [appcache manifests](http://diveintohtml5.info/offline.html). Apps using appcache will update when the manifest itself changes in some way so it is convenient to have the file change whenever there is an update to your client-side code, allowing users to always get the up-to-date version.

Zerver will automatically detect these manifest files and insure they update on file changes by appending a comment at the end with the timestamp that the client-side code last changed. This fixes one of the major drawbacks of having to manually manage an appcache manifest.

If files that are inlined or concatenated are included in the manifest then they should be marked appropriately:

```appcache
CACHE MANIFEST

/img/background.png?inline=1

# zerver:js/main.min.js
/js/jquery.js
/js/jquery.ui.js
/js/main.js
# /zerver

NETWORK:
*
```



# Server side

### Custom API calls

Zerver allows you server custom API in a more tradional manner:

```js
/* in zerver/custom.js */
exports.doSomething = doSomething;

doSomething.type = 'GET';
function doSomething(params, callback) {
    callback({ thing: params.stuff });
}
```

```sh
> curl -s "localhost:5000/zerver/custom/doSomething?stuff=wat"
{ "thing" : "wat" }
```

In this case the HTTP status was automaticallys set to 200 and JSON was served.

Response status code, headers and body can all be set manually as well:

```js
doSomething.type = 'GET';
function doSomething(params, callback) {
    var status = 301;
    var headers = {
        'Location': '/zerver/custom/somethingElse'
    };
    var body = 'Moved permanently';
    callback(status, headers, body);
}
```

Some API resources make available multiple HTTP methods:

```js
doSomething.type = ['GET', 'PUT', 'DELETE'];
function doSomething(params, callback) {
    if (this.method === 'GET') {
        // get the resource
    } else if (this.method === 'PUT') {
        // update the resource
    } else if (this.method === 'DELETE') {
        // delete the resource
    }
}
```

The 'this' context for API calls is the raw request object. Several additonal properties are added onto the object for convenience:

```js
doSomething.type = 'POST';
function doSomething(params, callback) {
    this.ip        // client IP address
    this.protocol  // request protocol (http, https)
    this.host      // the hostname of the request (mysite.com)
    this.pathname  // the exact resource (/zerver/custom/doSomething)
    this.query     // a JSON object representation of URL query parameters
    this.referrer  // the URL that referred the client to this resource
    this.userAgent // the user agent string of the client

    // for POST and PUT requests
    this.body      // HTTP body as a string
    this.jsonBody  // parsed body if HTTP body is JSON
    this.formBody  // parsed body if HTTP body is form-encoded
}
```

Since incoming parameters come in various forms the `params` object serves as a convenient place to access them. The `params` object is a combination of URL query parameters and JSON or form-encoded HTTP body parameters.

Reading and setting cookies is simple as well:

```js
doSomething.type = 'POST';
function doSomething(params, callback) {
    var value = this.cookies.get('cookieName');
    this.cookies.set('cookieName', 'otherValue');

    // robust cookie set
    this.cookies.set('cookieName', 'otherValue', {
        maxAge   : 365*24*60*60,
        expires  : new Date(2020, 8, 13),
        domain   : 'mysite.com',
        path     : '/zerver/custom',
        httpOnly : true,
        secure   : true,
    });
}
```

### Cross origin requests

Enabling cross origin requests in zerver is a one-liner:

```js
exports._cors = 'mywebsite.com, myothersite.com';
```

For this zerver module all API requests will respond properly to OPTIONS calls as well as serve access control headers when the API calls are made.

To allow all cross origin requests:

```js
exports._cors = '*';
```



# Client side

### Require syntax

```html
<!-- in website-dir/index.html -->
<script src="/zerver/require.js"></script>
<script>
    var MyAPI = zerver.require('MyAPI');
    MyAPI.logStuff('hi from client', function (str) {
        console.log(str); // "hi from server"
    });
</script>
```

### Error handling

```html
<!-- in website-dir/index.html -->
<script src="zerver/MyAPI.js"></script>
<script>
    MyAPI.logStuff('hi from client', function (str) {
        // this === MyAPI
        console.log(str); // "hi from server"
    }).error(function (err) {
        // this === MyAPI
        console.log(err); // error string explaining failure
    });
</script>
```

### Custom API calls

Zerver's client-side code packs in a convenient interface for making custom API calls.

```js
/* in website-dir/zerver/custom.js */
exports.updateData = updateData;

updateData.type = 'POST';
function updateData(params, callback) {
    // params.data == { random: 'json' }
    callback({ success: true });
}
```

```html
<!-- in website-dir/index.html -->
<script src="zerver/require.js"></script>
<script>
    zerver.post('custom/updateData', {
        data: { random: 'json' }
    }, function (response, raw, status) {
        // response.success === true
        // raw === '{"success":true}'
        // status === 200
    });
</script>
```

`zerver.get`, `zerver.post`, `zerver.put` and `zerver.del` are all defined corresponding to their HTTP methods.

The second argument of API calls is the data to be passed to the server. This can be a raw string or a JSON object. For `POST` and `PUT` requests the data will be passed in the HTTP body, while all other requests will convert them into query string parameters.

API calls can be made to any service (not necessary zerver):

```js
zerver.get('http://api.mysite.com/data.json', function (response) {
    // do something with 'response'
});
```

If you're making repeated API calls to another service it's often convenient to not have to include the host prefix:

```js
zerver.prefix = 'http://api.mysite.com/';
zerver.get('data.json', function (response) {
    // do something with 'response'
});
zerver.get('otherdata.json', function (response) {
    // do something with 'response'
});
```



# ExpressJS integration

Zerver can be integrated with Express and other NodeJS servers to provide zerver APIs.

Here is an example Express app:

```
website-dir/app.js
website-dir/src/index.html
website-dir/zerver/MyAPI.js
```

```js
/* app.js */

var express = require('express');
var zerver  = require('zerver');

var app = express();
app.use( zerver.middleware(__dirname) );
app.use( express.static(__dirname + '/src') );
app.listen(3000);
```

Along with the rest of the Express app, zerver scripts will be accessible for importing into the client-side code.



# Example apps

[Basic app](https://github.com/jairajs89/zerver/tree/master/examples/basic-app)

[Express app](https://github.com/jairajs89/zerver/tree/master/examples/express-app)
