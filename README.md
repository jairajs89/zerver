Zerver - The webapp developer's best friend
===========================================

Quickly iterate & serve your webapp using modern tools.

### What is Zerver?

The frontend web development community is already adopting the mantra of building static code that only uses RESTful APIs to fetch data from web services. In that frontend/backend split exists the need for a tool that specifically empowers frontend developers to quickly iterate on their products.

Zerver is a web server built specifically for frontend developers, making it easy to use modern tools, ship code and get great performance.

Zerver is not a frontend framework -- your existing HTML5 app is already good to go. While Zerver has great tools for backend API development, this is simply to supplement your frontend code -- if you're a backend engineer building a highly scalable REST API, this isn't the tool for you.


# Getting started

Clone one of our starter kits or add Zerver to your Node.js project:

* [Starter kit](http://github.com/jairajs89/starter-kit)
* [React starter kit](http://github.com/jairajs89/starter-kit-react)
* Add to Node.js project: `npm install zerver --save`

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


# Table of contents

* [Upgrade your frontend tools](#upgrade-your-frontend-tools)
    - [Babel](#babel)
    - [CoffeeScript](#coffeescript)
    - [LESS](#less)
    - [Jade](#jade)
    - [Zerver APIs](#zerver-apis)
* [Always be shipping](#always-be-shipping)
    - [Heroku](#heroku)
    - [S3](#s3)
    - [Static builds](#static-builds)
    - [Barebones](#barebones)
* [Get the best performance](#get-the-best-performance)
    - [Bundle assets](#bundle-assets)
    - [Inline assets](#inline-assets)
    - [Version assets](#version-assets)
    - [HTML5 AppCache, Caching](#html5-appcache-caching)
* [Other](#other)
    - [CLI options](#cli-options)
    - [Node.js usage](#nodejs-usage)


## Upgrade your frontend tools

//TODO: intro

* //TODO: Babel
* //TODO: CoffeeScript
* //TODO: LESS
* //TODO: Jade
* //TODO: Zerver APIs
    - Error handling


## Always be shipping

//TODO: intro

* //TODO: Heroku
* //TODO: S3
* //TODO: Static builds
* //TODO: Barebones
    - HTTPS
    - Custom origins
    - CORS


## Get the best performance

Zerver does as many optimizations under-the-hood for you, but it also has simple tools to let you build the most performant user-experience.

* //TODO: Bundle assets
* //TODO: Inline assets
* //TODO: Version assets
* //TODO: HTML5 AppCache, Caching


## Other

* //TODO: CLI options
    - Environment variable
* //TODO: Node.js usage
