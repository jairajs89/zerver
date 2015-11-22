(function (window) {
    var TIMEOUT = 30 * 1000;

    var apiDir       = {{__API_DIR__}};
    var apiName      = {{__API_NAME__}};
    var apiObj       = {{__API_OBJ__}};
    var apiFunctions = {{__API_FUNCTIONS__}};
    var apiOrigin    = {{__API_ORIGIN__}};
    var apis         = {};

    window[apiName] = setupFunctions(apiObj, apiFunctions, [ apiName ]);



    function setupFunctions(obj, functions, tree) {
        var value;
        for (var key in functions) {
            value = functions[key];
            if (value === true) {
                obj[key] = setupFunction(obj, key, tree);
            } else if ((typeof value === 'object') && (typeof obj[key] === 'object')) {
                obj[key] = setupFunctions(obj[key], value, tree.concat([ key ]));
            }
        }
        return obj;
    }

    function setupFunction(obj, key, tree) {
        return function () {
            var deferred = createDeferred(),
                args     = Array.prototype.slice.call(arguments),
                numArgs  = args.length,
                callback = args[numArgs-1];

            if (typeof callback === 'function') {
                args.pop();
            } else {
                callback = function () {};
            }

            apiCall(tree.concat(key), args, function (error, response) {
                if (error) {
                    var errorHandlers = deferred.getErrorHandlers();
                    if (errorHandlers.length) {
                        for (var i=0, l=errorHandlers.length; i<l; i++) {
                            try {
                                errorHandlers[i].call(obj, error);
                            } catch (err) {
                                if (window.console && window.console.error) {
                                    window.console.error(err);
                                }
                            }
                        }
                    } else if (window.console && window.console.error) {
                        window.console.error(error);
                    }
                } else {
                    callback.apply(obj, response);
                }
            });

            return deferred;
        };
    }

    function createDeferred() {
        var errorHandlers = [],
            deferred      = {
                error     : handleError,
                getErrorHandlers : getErrorHandlers
            };

        function handleError(handler) {
            if (typeof handler !== 'function') {
                throw TypeError('error handler must be a function, got ' + handler);
            }
            errorHandlers.push(handler);
            return deferred;
        }

        function getErrorHandlers() {
            return errorHandlers.slice();
        }

        return deferred;
    }

    function apiCall(tree, args, callback) {
        var url = apiDir;
        for (var i=0, l=tree.length; i<l; i++) {
            url += '/'+encodeURIComponent(tree[i]);
        }
        makePostCall(url, args, function (json, raw, status) {
            if (status === 200) {
                if (json && (Object.prototype.toString.call(json) === '[object Array]')) {
                    callback(null, json);
                } else {
                    callback('zerver failed to parse response');
                }
            } else if (status === 500 && raw) {
                callback(raw);
            } else {
                callback('zerver http error, '+status);
            }
        });
    }

    function makePostCall(resource, data, callback) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                xhrComplete();
            }
        };
        xhr.onload = function () {
            xhrComplete();
        };
        xhr.onerror = function () {
            xhrComplete();
        };
        xhr.timeout = parseInt(window['ZERVER_TIMEOUT']) || TIMEOUT;
        xhr.ontimeout = function () {
            xhrComplete();
        };
        setTimeout(function () {
            if (callback) {
                xhr.abort();
                xhrComplete();
            }
        }, TIMEOUT);

        xhr.open('POST', apiOrigin+resource, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send( JSON.stringify(data) );

        function xhrComplete() {
            if ( !callback ) {
                return;
            }

            var response;
            try {
                response = JSON.parse(xhr.responseText);
            } catch (err) {}

            callback(response, xhr.responseText, xhr.status || 0);
            callback = null;
        }
    }
})(window);
