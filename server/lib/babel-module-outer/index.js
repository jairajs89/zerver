var path = require('path');

module.exports = function (babel) {
    var t = babel.types;
    var modules = t.memberExpression(t.identifier('this'), t.identifier('__ZERVER_MODULES'));

    function getModuleName(file) {
        var filename = file.opts.filenameRelative;
        if (filename) {
            return filename.substr(0, filename.length-path.extname(filename).length);
        }
    }

    function getModulePath(moduleName) {
        return getObjectKey(modules, moduleName);
    }

    function getObjectKey(node, keyName) {
        return t.memberExpression(node, t.literal(keyName), true);
    }

    function initWithDefaultVlaue(node, defaultValue) {
        return t.expressionStatement(
            t.assignmentPattern(
                node,
                t.binaryExpression('||', node, t.identifier(defaultValue))
            )
        );
    }

    return new babel.Transformer("bable-module-outer", {
        Program: {
            exit: function (node, parent, scope, file) {
                // Exit early if file is empty
                if (node.body.length === 0) {
                    return;
                }

                // Inject module declaration
                if ( Object.keys(scope.references).length ) {
                    var moduleName = getModuleName(file);
                    if (moduleName) {
                        var modulePath = getModulePath(moduleName);
                        node.body = [
                            initWithDefaultVlaue(modules, '{}'),
                            initWithDefaultVlaue(modulePath, '{}'),
                        ].concat(node.body);
                    }
                }

                // Inject "use strict";
                node.body.unshift(
                    t.expressionStatement(t.literal('use strict'))
                );

                // Function scope for module
                var functionWrap = t.parenthesizedExpression(t.functionDeclaration('',[],t.blockStatement(node.body)));
                var calledWrap = t.callExpression(t.memberExpression(functionWrap,t.identifier('call')), [t.identifier('this')]);
                node.body = [t.expressionStatement(calledWrap)];
            }
        },
    });
};
