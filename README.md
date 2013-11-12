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

## Zerver options

```sh
# General usage
zerver [options] website-dir

# run server on a different port
zerver --port=8000 website-dir

# automatically append a comment timestamp whenever
# a HTML5 cache.manifest is requested
zerver --manifest=path/to/cache.manifest website-dir

# in production mode this will always have
# the timestamp of the time of deploy
zerver --manifest=path/to/cache.manifest website-dir

-r, --refresh
# Any webpage being viewed that has a Zerver script on it (`website-dir/index.html`) 
# will automatically refresh when any of its code is edited. 
# You can edit code and immediately see feedback on how it effects your running webapp.

-c, --cli               
# Creates a js shell to communicate with remote clients, press tab to enable. 
# Any code run in this shell will be run on the client.

-V, --verbose 
# Enable verbose request logging

-l, --less    
# Automatically compile less into css 
# Requires the less node module to work run: npm install less

-p, --production 
# Enables production mode (caching, concat, minfiy, gzip, etc)
```

### Command Line Interface

The command line interface (the `cli` flag) allows you to communicate with the client during development

For example:

```sh
zerver -cli website-dir

# Press tab to enable the cli
>>> 
# The following line will cause all clients listening to the server to refresh
>>> window.location.reload();

# You can also log things from the client
# The following line logs all the functions
# that are available in 'MyAPI'
>>> console.log(Object.keys(MyAPI));
log: ["function1FromMyApi", "function2FromMyApi"]
# Since anything that is logged on the client gets
# sent to the server you can see the result right in the command line
```

## Production mode

Passing the `--production` flag on startup enables zervers production features.

### Inlining files

Given the following link

```html
<link rel="stylesheet" href="/css/app.min.css?inline=1">
```

Zerver will create a `<style>` tag in place and place the css there instead, reducing the amount of requests to load files.

The same can be done with images inside the css file

```css
background-image: url(/img/background.png?inline=1);
```

### Gzip and minifying

Given the following files in your manifest.

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

When the server is run on production these files will be gzipped & minified into a file called `main.min.js`

### Manifest file

The cache manifest file is a simple text file that lists the resources the browser should cache for offline access.
It should be referenced at the top of your html file like this:

```html
<html manifest="cache.manifest">
...
</html>
```
The cache manifest allows you to specify which files the browser should cache and make available to offline users. Your app will load and work correctly, even if the user presses the refresh button while they're offline.

The advantage that zerver brings with the cache manifest is that zerver will refresh the cache whenever a file is changed.
This fixes the main drawback to developing with a cache as now you will always be working with the most up to date versions of the edited files.

### Default options

You can specify default options in an environment variable,
to avoid having to type them every time
```sh
export ZERVER_FLAGS='-drl'
```

### Running as an npm script

Another way to save time when running zerver is to add your default run configurations to an npm script in your `package.json`

```json
{
  "name"    : "zerver-sample" ,
  "version" : "0.0.1" ,
  "engines" : {
    "node"  : "0.8.x" ,
    "npm"   : "1.1.x"
  },
  "dependencies" : {
    "zerver" : "0.12.9"
  },
  "scripts" : {
    "start" : "zerver --manifest=cache.manifest --port=5000 -rlc web"
  }
}
```
Sample package.json file for a zerver application

This setup allows you to simply enter `npm start` to run the command `zerver --manifest=cache.manifest --port=5000 -rlc web`.

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
