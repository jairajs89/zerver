Upgrading from old versions of Zerver
=====================================

Zerver 1.0.0 was a major refactor and cleanup of all the hackery that came before it. Several features were deprecated in favour of simplicity and a new plugin system. With very few exceptions upgrading should be as simple as bumping up the version number, but read below to understand the nuances.

* [CoffeeScript moved to plugin](#coffeescript-moved-to-plugin)
* [Remote debugging CLI mode deprecated](#remote-debugging-cli-mode-deprecated)
* [Device log streaming mode deprecated](#device-log-streaming-mode-deprecated)
* [Browser auto-refresh mode deprecated](#browser-auto-refresh-mode-deprecated)
* [Some Zerver API features deprecated](#some-zerver-api-features-deprecated)
* [Server logging format simplified](#server-logging-format-simplified)
* [Manual server hostname setting deprecated](#manual-server-hostname-setting-deprecated)

### CoffeeScript moved to plugin

Zerver no longer bundles CoffeeScript support by default. Migration can be seamless by simply [including the new CoffeeScript plugin](https://github.com/jairajs89/zerver-plugin-coffeescript).

### Remote debugging CLI mode deprecated

This feature was including during a time when debugging webapps on mobile devices was difficult due to lack of support in major browser. Since then both [Safari](https://developer.apple.com/library/safari/documentation/AppleApplications/Conceptual/Safari_Developer_Guide/GettingStarted/GettingStarted.html#//apple_ref/doc/uid/TP40007874-CH2-SW8) & [Chrome](https://developers.google.com/web/tools/chrome-devtools/debug/remote-debugging/remote-debugging) have released features for remote debugging iPhone & Android devices. Thus it has become unnecessary to support this feature in Zerver itself.

### Device log streaming mode deprecated

[Same story as with remote debugging.](#remote-debugging-cli-mode-deprecated)

### Browser auto-refresh mode deprecated

This feature was created to streamline the process for quick iterations with your browser environment. Unfortunately the overhead of supporting the feature outweighed the benefits and it was removed (cleaning up TONS of code). I think the best way forward with this is to mature the plugin system to be able to support a feature like this.

### Some Zerver API features deprecated

Zerver is a tool for frontend developers building modern webapps. Zerver APIs provide a means to quickly and conveniently get small server-side feature to support the frontend. It eventually got a bit out of hand and had a complex system for arbitrary custom HTTP methods. I strongly despised the design of that API system and entirely removed it as it didn't really meet the ends of a frontend developer and instead tempted backend developers to build out complex interfaces that should really be built using other tools.

So to be clear, [Zerver APIs still exist](README.md#zerver-apis) but arbitrary custom HTTP methods were deprecated (eg. you can't define a custom PUT request in any way anymore). Like the other deprecated features, as the new plugin system matures there may be an opportunity to bring this back is some form.

### Server logging format simplified

Zerver used to support an array of logging features from manually print headers to print logs in JSON to periodically printing server statistics. JSON logs and stats were entirely deprecated and the logging system was simplified greatly.

Zerver v1 logs in the same basic format as pre-v1 and can either be put in `--quiet` or `--verbose` mode. `--quiet` mode turns off all logging while `--verbose` mode additionally logs request origin, headers, and client IP.

### Manual server hostname setting deprecated

Zerver used to have a `--hostname` flag to manually set an alternative host for Node.js to use when the server starts listening for requests. I honestly have no idea why this ever got implemented and don't think it ever got used by anyone. Not saying it isn't useful, but literally don't remember why it became significant and necessary to implement.
