Zerver - The webapp developer's best friend
===========================================

[![Build Status](https://travis-ci.org/jairajs89/zerver.png?branch=master)](https://travis-ci.org/jairajs89/zerver)

Quickly iterate & serve your webapp using modern tools.

### What is Zerver?

The frontend web development community is already adopting the mantra of building static code that uses RESTful APIs to fetch data from web services. In that frontend/backend split exists the need for a tool that specifically empowers frontend developers to quickly iterate on their products.

Zerver is a web server built specifically for frontend developers, making it easy to use modern tools, ship code and get great performance.

Zerver is not a frontend framework -- your existing HTML5 app is already good to go. While Zerver has great tools for backend API development, this is simply to supplement your frontend code -- if you're a backend engineer building a highly scalable REST API, this isn't the tool for you.



# Getting started

Clone one of our starter kits or add Zerver to your Node.js project:

* [ReactJS starter kit _(recommended)_](http://github.com/jairajs89/starter-kit-react)
* [Barebones starter kit](http://github.com/jairajs89/starter-kit)
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

Major updates to JavaScript are coming to browsers with [ECMAScript 6 (ES6)](https://github.com/lukehoban/es6features/blob/master/README.md#readme). These updates [aren't fully available across major browsers](https://kangax.github.io/compat-table/es6/) yet, but ES6 is definitely the future of JavaScript as a language.

[ES6 contains so many awesome features](https://github.com/lukehoban/es6features/blob/master/README.md#readme) that other languages take for granted. You'll stop and think "wow, JavaScript is finally a real language" and you'll be right. Here is a short list:

* Modules
* Classes
* Templated strings
* Generator functions
* Extended function parameter handling
* Promises
* [..and so much more goodness](https://github.com/lukehoban/es6features/blob/master/README.md#readme)

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

[LESS](http://lesscss.org/) is a superset of CSS that gives you many additional features, such as:

* Variables
* Mixins
* Functions
* Nested rules
* Arithmetic in rules
* [..and so much more](http://lesscss.org/features/)

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

[Jade](http://jade-lang.com/) is a clean & simple template language that compiles to HTML. It will make your HTML documents way more readable with its features:

* Variables
* Control structures
* Mixins
* Template imports & inheritance
* [..and so much more](http://jade-lang.com/reference/)

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

//TODO
//TODO: error handling

### More plugins

Zerver is extensible and makes it possible to integrate any tool though Zerver plugins. For example, here is how you would use the CoffeeScript script plugin which will automatically compile files that end with `.coffee` to JavaScript.

```
npm install zerver-plugin-coffeescript --save
zerver --plugins=zerver-plugin-coffeescript src
```

Simply add the name of the module to the `--plugins` command-line flag and Zerver will use it to process files.

Creating a plugin is easy -- simply follow [this guide](PLUGINS.md).


## Always be shipping

//TODO: intro

### Using Heroku

//TODO

### Using Amazon S3

//TODO

### Using static builds

//TODO

### Other environments

//TODO
//TODO: HTTPS
//TODO: Custom origins
//TODO: CORS


## Get better performance

Zerver does as many optimizations under-the-hood for you, but it also has simple tools to let you build the most performant user-experience.

### Automatic optimization mode

//TODO

### Manual optimizations

//TODO
//TODO: Bundle assets
//TODO: Inline assets
//TODO: Version assets

### Caching

//TODO: appcache
//TODO: cache control



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
