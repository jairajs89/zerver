Zerver is a lightweight Node.js-based webserver that lets you seamlessly make server API calls as if they were a library on the client. The goal is to provide a developer-focused toolset and remove all the boilerplate involved in serving a webapp.

### Install

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

### Require syntax

```html
<!-- in website-dir/index.html -->
<script src="/zerver/require.js"></script>
<script>
    var MyAPI = require('MyAPI');
    MyAPI.logStuff('hi from client', function (str) {
        console.log(str); // "hi from server"
    });
</script>
```

# Tools

### Options

Example usage

```sh
zerver -r -c website-dir # Runs the server with auto-refresh and cli activated
```

-r, --refresh
Any webpage being viewed that has a Zerver script on it (`website-dir/index.html`) will automatically refresh when any of its code is edited. You can edit code and immediately see feedback on how it effects your running webapp.

-c, --cli               
Creates a js shell to communicate with remote clients, press tab to enable. Any code run in this shell will be run on the client.

-P, --port <n>          
Set server port to listen on, defaults to process.env.PORT||5000

-V, --verbose           
Enable verbose request logging

-l, --less    
Automatically compile less into css (requires the less node module to work run: npm install less)

-m, --manifest <paths>  
Declare HTML5 appCache manifest files eg. --manifest=cache.manifest  (If the manifest is located in web/cache.manifest)

-p, --production        
Enables production mode (caching, concat, minfiy, gzip, etc)


### Manifest file

The cache.manifest can be used to speed up loading times by caching files and minifying groups of files into one.

For example if you have the following in your cache manifest file: 

```sh
# zerver:js/main.min.js
js/cards.js
js/app.js
js/main.js
# /zerver
```

And the following in your HTML file:

```html
<!-- zerver:js/main.min.js -->
<script src="js/cards.js"></script>
<script src="js/app.js"></script>
<script src="js/main.js"></script>
<!-- /zerver -->
```

This will create a file called `main.min.js` containing everything from `cards.js`, `app.js` and `main.js` in a minified format.
Note that for this to work the order, names and number of files must match across both the html and manifest file.

The type of files that can be minified are listed below:

```js
application/json
application/javascript    
text/javascript           
text/css                  
text/less
text/html                 
text/plain
text/cache-manifest
```

less depends on the less module run command: npm install less --save (--save flag saves the dependancy to your package.json file)

# ExpressJS integration

Zerver integrates well with Express, providing the same functionality to any existing webapp.

```js
// "app" is an ExpressJS app instance
var zerver = require('zerver');
app.use( zerver.middleware('path/to/zerver/scripts', 'url/to/zerve/at') );
```

Along with the rest of your Express app, Zerver scripts will be accessible the specified path (`url/to/zerve/at`) for importing into your client-side code.

# Node module

A convenient tool for testing and server-to-server integration is the NodeJS Zerver module.

```js
var zerver = require('zerver');

zerver.get('http://localhost:5000/zerver/', function (myzerver) {
    myzerver.MyAPI.logStuff('hi from another server', function (str, data) {
        console.log(str); // "hi from server"
    });
});
```

# Advanced usage

### Zerver options

```sh
# run server on a different port
zerver --port=8000 website-dir
```

```sh
# automatically append a comment timestamp whenever
# a HTML5 cache.manifest is requested
zerver -d --manifest=path/to/cache.manifest website-dir

# in production mode this will always have
# the timestamp of the time of deploy
zerver --manifest=path/to/cache.manifest website-dir
```

### Default options

You can specify default options in an environment variable,
to avoid having to type them every time
```sh
export ZERVER_FLAGS='-drl'
```

### Cross origin

Zerver can automatically make a script available to multiple host origins. This is especially useful if you are including a Zerver script from a subdomain of your webapp.

```js
// in website-dir/zerver/MyAPI.js

// all any website to include your zerver script
exports._crossOrigin = '*';
```

The value of `exports._crossOrigin` is exactly what will be served as the `Allow-Access-Control-Origin` header for cross origin requests if acceptable.

### Script names

Zerver scripts can be globalised on the client under whatever name you please. If you are afraid of object name collisions simply define the query argument `name` for the script and it will be globalised as such.

```html
<!-- in website-dir/index.html -->
<script src="zerver/MyAPI.js?name=SomeOtherAPI"></script>
<script>
    SomeOtherAPI.logStuff('hi from client', function (str) {
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

# Example apps

[Basic app](https://github.com/jairajs89/zerver/tree/master/examples/basic-app)

[Express app](https://github.com/jairajs89/zerver/tree/master/examples/express-app)
