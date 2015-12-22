Creating Zerver Plugins
=======================

Zerver plugins simply tranform the static output for a particular resource. For example I may have a file `styles.less` written using LESS. Rather than serving the raw LESS file (which the browser cannot interperet) we can can get Zerver to automatically convert that file to CSS. Zerver provides this exact feature and implements it under-the-hood as a plugin.

A plugin is implemented as a Node module that exports declarations of which files it wants to transform as well as the transformation function.

```js
exports.mime = 'text/less';
exports.processor = function (pathname, headers, body, callback) {
    headers['Content-Type'] = 'text/css';
    body = convertToCSS(body);
    callback(headers, body);
};
```

File with content type `text/less` will automatically get processed by this plugin. Zerver's MIME detection will automatically assume that files ending with `.less` are of this content type.

**Alternate MIME matchers**

```js
// Regex matchers
exports.mime = /^image\/.*$/;
```

```js
// Function matchers
exports.mime = function (contentType) {
    // complex determination based on contentType
    return true;
};
```

```js
// Multiple matchers
exports.mime = ['application/json', /^test\/(css|html)$/];
```

**File extentions**

In some cases Zerver can't figure out what file extensions map to the content type you are matching. In these cases you can manually declare the file extensions to handle

```js
exports.mime = 'text/less';
exports.fileExtension = 'less';
```

Multiple file extensions can also be supported:

```js
exports.fileExtension = ['css', 'less'];
```
