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
        return t.memberExpression(node, t.stringLiteral(keyName), true);
    }

    function initWithDefaultValue(node, defaultValue) {
        return t.expressionStatement(
            t.assignmentExpression(
                '=',
                node,
                t.logicalExpression('||', node, t.identifier(defaultValue))
            )
        );
    }

    return {
        visitor: {
            Program: {
                exit: function (file, f) {
                    // Exit early if file is empty
                    if (file.node.body.length === 0) {
                        return;
                    }

                    // Inject module declaration
                    if ( Object.keys(file.scope.references).length ) {
                        var moduleName = getModuleName(f.file);
                        if (moduleName) {
                            var modulePath = getModulePath(moduleName);
                            file.node.body.unshift(initWithDefaultValue(modulePath, '{}'));
                            file.node.body.unshift(initWithDefaultValue(modules, '{}'));
                        }
                    }

                    // Inject "use strict";
                    file.node.body.unshift(
                        t.expressionStatement(t.stringLiteral('use strict'))
                    );

                    // Function scope for module
                    var functionWrap = t.parenthesizedExpression(t.functionExpression(null, [], t.blockStatement(file.node.body)));
                    var calledWrap = t.callExpression(t.memberExpression(functionWrap,t.identifier('call')), [t.identifier('this')]);
                    file.node.body = [t.expressionStatement(calledWrap)];
                }
            },
        },
    };
};
