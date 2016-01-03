Zerver - The webapp developer's best friend
===========================================

[![Build Status](https://travis-ci.org/jairajs89/zerver.png?branch=master)](https://travis-ci.org/jairajs89/zerver)

Quickly iterate & serve your webapp using modern tools.

### What is Zerver?

The frontend web development community is already adopting the mantra of building static code that uses RESTful APIs to fetch data from web services. In that frontend/backend split exists the need for a tool that specifically empowers frontend developers to quickly iterate on their products.

Zerver is a web server built specifically for frontend developers, making it easy to use modern tools, ship code and get great performance.

Zerver is not a frontend framework -- your existing HTML5 app is already good to go. While Zerver has great tools for backend API development, this is simply to supplement your frontend code -- if you're a backend engineer building a highly scalable REST API, this isn't the tool for you.

**Upgrading from pre-1.0.0 versions of Zerver is easy using [this guide](MIGRATION.md).**



# Getting started

Clone one of our starter kits or add Zerver to your Node.js project:

* <a href="https://github.com/jairajs89/starter-kit-react" target="_blank">ReactJS starter kit _(recommended)_</a>
* <a href="https://github.com/jairajs89/starter-kit" target="_blank">Barebones starter kit</a>
* Add to existing Node.js project: `npm install zerver --save`

If you're using a starter kit:

``` bash
npm install
npm start
# Now serving your webapp at http://localhost:5000/
```

Or use Zerver directly from the command line:

``` bash
zerver src # <- dir with your frontend code
# Now serving your webapp at http://localhost:5000/
```

Now that you have a running server, iterate on your code with the features below.



# Contents

* [**Upgrade your frontend tools**](#upgrade-your-frontend-tools)
    - [*ECMAScript 6*](#ecmascript-6)
    - [*LESS stylesheets*](#less-stylesheets)
    - [*Jade markup*](#jade-markup)
    - [*Zerver APIs*](#zerver-apis)
    - [*More plugins*](#more-plugins)
* [**Always be shipping**](#always-be-shipping)
    - [*Using Heroku*](#using-heroku)
    - [*Using Amazon S3*](#using-amazon-s3)
    - [*Using static builds*](#using-static-builds)
    - [*Other environments*](#other-environments)
* [**Get better performance**](#get-better-performance)
    - [*Automatic optimization mode*](#automatic-optimization-mode)
    - [*Manual optimizations*](#manual-optimizations)
    - [*Caching*](#caching)
* [**Other**](#other)
    - [*CLI options*](#cli-options)
    - [*Node.js usage*](#nodejs-usage)


## Upgrade your frontend tools

Don't let the browser tell you which tools and languages you should use. Zerver comes with a bunch of built-in upgrades as well as a plugin system that let's you extend even further.

### ECMAScript 6

Major updates to JavaScript are coming to browsers with <a href="https://github.com/lukehoban/es6features/blob/master/README.md#readme" target="_blank">ECMAScript 6 (ES6)</a>. These updates <a href="https://kangax.github.io/compat-table/es6/" target="_blank">aren't fully available across major browsers</a> yet, but ES6 is definitely the future of JavaScript as a language.

<a href="https://github.com/lukehoban/es6features/blob/master/README.md#readme" target="_blank">ES6 contains so many awesome features</a> that other languages take for granted. You'll stop and think "wow, JavaScript is finally a real language" and you'll be right. Here is a short list:

* Modules
* Classes
* Templated strings
* Generator functions
* Extended function parameter handling
* Promises
* <a href="https://github.com/lukehoban/es6features/blob/master/README.md#readme" target="_blank">..and so much more goodness</a>

With the `--es6` command-line flag Zerver automatically compiles ES6 code down to browser-supported ES5 code. You must also include the `/zerver/es6.js` script which shims a bunch of features that aren't included in the automatic compilation.

```html
<script src="/zerver/es6.js"></script>
<script>
  // Module import/export
  import { location } from 'window';

  [1, 2, 3].forEach(v => {
    // arrow functions
  });

  // Classes
  class Animal {
    talk() {
      console.log('I\m a generic animal');
    }
  }
  class Dog extends Animal {
    talk() {
      console.log('ruff');
    }
  }
</script>
```

### LESS stylesheets

<a href="http://lesscss.org/" target="_blank">LESS</a> is a superset of CSS that gives you many additional features, such as:

* Variables
* Mixins
* Functions
* Nested rules
* Arithmetic in rules
* <a href="http://lesscss.org/features/" target="_blank">..and so much more</a>

Any file with a `.less` extension will automatically get compiled to CSS by Zerver.

```less
.border-radius(@radius) {
  -webkit-border-radius: @radius;
     -moz-border-radius: @radius;
       -o-border-radius: @radius;
          border-radius: @radius;
}

.my-elem {
  .border-radius(3px);
}
.my-other-elem {
  .border-radius(12px 0 0 12px);
}
```

### Jade markup

<a href="http://jade-lang.com/" target="_blank">Jade</a> is a clean & simple template language that compiles to HTML. It will make your HTML documents way more readable with its features:

* Variables
* Control structures
* Mixins
* Template imports & inheritance
* <a href="http://jade-lang.com/reference/" target="_blank">..and so much more</a>

Any file with a `.jade` extension will automatically get compile to HTML by Zerver.

```jade
doctype html
html
  head
    title JadeIsConcise.com
  body
    ul
      each val in ['Dog', 'Cat', 'Mouse']
        li= val
```

### Zerver APIs

Building and integrating APIs with a backend can be a pain when you're focused on getting the frontend and user experience right. Zerver can let you expose APIs in the most natural way: JavaScript functions.

```js
// in file /zerver/recipes.js, running on the server
exports.getRecipe = function (recipeId, callback) {
  // Go to my database and get the recipe
  callback(recipe);
};
```

```html
<!-- in file /index.html, running in the browser -->
<script src="/zerver/recipes.js"></script>
<script>
  recipes.getRecipe('butterchicken', function (recipe) {
    // do something with this data
  });
</script>
```

Simply write a function that will run on your server but will be called by your frontend code. `/zerver/` is a magical directory in which scripts can export their functions to be called in the browser. Note that this only applies to the `/zerver/` directory itself and all subdirectories are effectively private server resources.

**Error handling**

```html
<script src="/zerver/recipes.js"></script>
<script>
  recipes.getRecipe('butterchicken', function (recipe) {
    // do something with this data
  }).error(function (err) {
    // network error occurred
  });
</script>
```

**Word of caution**

These APIs are super-convenient, especially when making small server-side functionality to support a frontend. This does not translate well into building vast complex server-side functionality. Those kinds of services should be built in isolation of your frontend using the backend setup of your choice.

### More plugins

Zerver is extensible and makes it possible to integrate any tool though Zerver plugins. For example, here is how you would use the CoffeeScript script plugin which will automatically compile files that end with `.coffee` to JavaScript.

```
npm install zerver-plugin-coffeescript --save
zerver --plugins=zerver-plugin-coffeescript src
```

Simply add the name of the module to the `--plugins` command-line flag and Zerver will use it to process files.

Creating a plugin is easy -- simply follow [this guide](PLUGINS.md#readme).

Here are some available plugins:

* [Automatic CoffeeScript compliation](https://github.com/jairajs89/zerver-plugin-coffeescript)
* [I really need to make some more plugins..](PLUGINS.md#readme)


## Always be shipping

Along with the local development server, Zerver can be deployed in a bunch of different ways.

### Using Heroku

<a href="https://www.heroku.com/" target="_blank">Heroku</a> is a modern hosting platform for webapps. It is an excellent way to quickly deploy your webapp somewhere but not necessarily the most performant solution for large-scale production apps. Follow the intructions on their site for making an account if you don't have one already.

Tell Heroku how to run your webapp by putting your Zerver command in a file `Profile`:

```
web: zerver src
```

Now you `git push heroku master` and Heroku does the rest.

Additionally it is convenient to have Heroku configured in production mode so that you don't have to manually turn that on/off:

```bash
heroku config:set ZERVER_FLAGS="--production"
```

### Using Amazon S3

Many Zerver projects have exclusively frontend code. These kinds of projects can easily be dumped on Amazon S3 and have a CDN put in-front of it. This tends to be the most performant way to serve a modern webapp.

```bash
zerver --s3-deploy=mybucketname src
```

This will deploy the static servable output to the S3 bucket. Make sure to <a href="http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html#Credentials_from_the_Shared_Credentials_File_____aws_credentials_" target="_blank">setup your AWS credentials properly</a> and <a href="http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html#Using_Profiles_with_the_SDK" target="_blank">select the right profile if necessary</a>.

**CDNs make things fast**

The easiest way to get the benefit of CDN is to [effectively manage caching and versioning](#caching), then simply <a href="http://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GettingStarted.html" target="_blank">use Amazon Cloudfront</a>.

### Using static builds

Sometime you just need the generated static webapp code to dump on a server somewhere or in some custom configuration.

```bash
zerver --build mydir src
# mydir now contains webapp static content
```

### Other environments

Sometimes you just need to host Zerver in a very custom way. The common patterns that we support for these cases are listed below.

**HTTPS**

While using a gateway that handles HTTPS for you is preferred, we also support HTTPS right in Zerver.

```bash
zerver --ssl-key=supersecret.key --ssl-cert=notsosecret.pem src
```

**Custom origins**

Sometimes you host your frontend and backend separately and you need Zerver APIs to point at a different origin:

```bash
zerver --origin=https://othersite.com src
```

When [`/zerver/recipe.js`](#zerver-apis) gets used on the frontend it will go to othersite.com for API calls.

**CORS**

In the event that you have Zerver APIs hosted on different origin you'll also need to explicitely declare your cross-origin policy.

```js
exports._crossOrigin = '*'; // Allow all origins to access API
exports.getRecipe = function () { /* my code */ };
```

## Get better performance

Zerver does as many optimizations under-the-hood for you, but it also has simple tools to let you build the most performant user-experience.

### Automatic optimization mode

In `--production` mode Zerver already minifies your HTML/CSS/JS code, gzips resources, etc. Some additional optimizations can also be applied.

```bash
zerver --production --auto-optimize src
```

When run in this mode Zerver will look for optimizations that it can automatically make on your webapps code:

* Stylesheets and scripts will be bundled into single assets where possible
* Linked images, stylesheets and scripts will be inlined if optimal
* Else those asset URLs will be versioned for better cachability

### Manual optimizations

Sometimes you want to get your hands dirty and optimize individual resources instead of having it automatically done for you.

**Bundle assets**

Reduce the number of requests the browser needs to make by bundling resources together.

```html
<!-- zerver:/js/bundled.js -->
<script src="/js/one.js"></script>
<script src="/js/two.js"></script>
<script src="/js/three.js"></script>
<!-- /zerver -->
```

This HTML will be rewriten as the following with `/js/bundled.js` served as those three files concatenated.

```html
<script src="/js/bundled.js"></script>
```

**Inline assets**

Reduce the number of requests the browser needs to make by inlining resources.

```css
body {
  background: url(/img/bg.jpg?inline=1);
  /* will be rewritten to */
  background: url(data:image/jpg;base64,imagedatawouldbehere);
}
```

```html
<link rel="stylesheet" href="/css/style.css?inline=1">
<script src="/js/main.js?inline=1"></script>
<!-- will be rewritten to -->
<style>/* css in /css/style.css */</style>
<script>/* js in /js/main.js */</script>
```

**Version assets**

Reduce the number of requests the browser needs to make by versioning cachable resources.

```css
body {
  background: url(/img/bg.jpg?version=1);
  /* will be rewritten to */
  background: url(/img/bg.jpg?version=hashofjpgfiledata);
}
```

```html
<link rel="stylesheet" href="/css/style.css?version=1">
<script src="/js/main.js?version=1"></script>
<!-- will be rewritten to -->
<link rel="stylesheet" href="/css/style.css?version=hashofcssfiledata">
<script src="/js/main.js?version=hashofjsfiledata"></script>
```

### Caching

Being configured for optimal caching is a key part of delivering a smooth user experience. One decision that generally needs to get made in regards to this is whether or not you want to support an offline mode.

HTML5 AppCache allow you to declare files to be saved offline on the user's device. This is great for having those files be available when the device loses network access, but creates an awkwardice in regards to how up-to-date a browser client is. When you ship a new version of your frontend users will visit the app and be served the offline cached data and get the update in the background rather than on that visit. But at the end of the day this is the trade-off and you need to determine which is more important for your webapp.

**Optimal caching without offline mode**

Most of the time you don't need to support offline usage of your webapp but you still want to get fast of a load time as possible. The common approach to this is to take advantage of the asset versioning feature above and cache those assets for as long as possible.

```bash
zerver --cache=31536000,/index.html:0 --production src
```

```html
<script src="/js/main.js?version=1"></script>
```

`/js/main.js` will get cached by the browser and only refetched if the contents of the JavaScript file itself change. This is optimal as we never fetch code that has already by fetched.

Note that we entirely turn off caching for `index.html` so that it always gets fetched. This is the trade-off for getting great caching on all other resources. Basically make your `index.html` exteremely light-weight and reference other cachable resources from there. Zerver will already support ETags and other HTTP request-level caching so this trade-off isn't so bad when executed correctly.

**Offline mode with HTML5 AppCache**

An offline-capable webapp will have a manifest file, as <a href="http://www.html5rocks.com/en/tutorials/appcache/beginner/" target="_blank">documented here</a>. The browser fetches the manifest file to determine whether or not it needs to resynchronize the offline files. Since the browser simply checks if the manifest file is identical or not to the previous version it had, it is necessary to change some text in the manifest file every time you want them to update.

Zerver automatically does this for you by appending a comment to the end of your manifest file:

```
# Zerver timestamp: Thu Dec 10 2015 23:55:26 GMT+0000 (UTC)
```

This timestamp will simply get updated to the last modified timestamp of your frontend code so that your clients are always updating to the latest version.



## Other

### CLI options

```
> zerver --help

  Usage: zerver [options] [dir]

  Options:

    -h, --help                 output usage information
    -v, --version              output the version number
    -P, --port <n>             set server port to listen on
    -p, --production           enable production mode (caching, concat, minfiy, gzip, etc)
    -O, --auto-optimize        enable automatic optimizations
    -M, --missing <paths>      set a custom 404 page
    --cache <cachepaths>       set specific cache life for resources
    --plugins <paths>          turn on specific plugins (comma separated list)
    --es6                      enable ECMAScript 6 & JSX features
    --es6-exclude <paths>      exclude paths from ECMAScript 6 & JSX compilation
    -q, --quiet                turn off request logging
    -V, --verbose              verbose request logging
    --no-concat                disable file concatenation compression in production mode
    --no-compile               disable js, css minification in production mode
    --no-inline                disable file inlining in production mode
    --no-versioning            disable file versioning in production mode
    --no-less                  disable compilation of LESS to CSS
    --no-jade                  disable compilation of Jade to HTML
    --no-gzip                  disable gzip compression in production mode
    --ignore-manifest <paths>  disable processing for a particular HTML5 appCache manifest file
    --no-manifest              disable processing for ALL HTML5 appCache manifest files
    --s3-deploy <path>         dump generated static output to S3
    --build <path>             build static output to a directory
    --origin <origin>          set api origin
    --ssl-key <path>           SSL key for HTTPS handling
    --ssl-cert <path>          SSL certificate for HTTPS handling
    --env <assign>             set environment variables (name="value")
```

**Environment variables**

```bash
export ZERVER_FLAGS="--production"
zerver src # will run with --production flag on
```

The main usecase for this is having production specific flags or enabling debug plugins.

### Node.js usage

```js
var Zerver = require('zerver');
var zerver = new Zerver({
  dir        : 'src',
  production : true,
  quiet      : true,
  // all CLI options work
}, function () {
  // zerver is running
  zerver.stop(function () {
    // zerver has stopped
  });
});
```
