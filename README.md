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
exports.logStuff = function (str, callback) {
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
```

### Default options

You can specify default options in an environment variable, to avoid having to type them every time or having different setups for different environments in which the code will run:
```sh
export ZERVER_FLAGS='-rc'
```

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

Zerver can automatically inline files to reduce the number of requests your app makes and potentially speed things up for your users.

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

### Static S3 builds

```bash
zerver --s3-build="mybucket/path/to/store"
```

Zerver will build static assets and deploy them to the chosen S3 bucket and directory. Zerver takes advantage of AWS' NodeJS SDK which standardizes credentials management. [Read their docs here](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html) and note that Zerver fully supports the `AWS_PROFILE` environment variable.

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
