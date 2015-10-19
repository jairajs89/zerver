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
        return t.memberExpression(modules, t.identifier(moduleName));
    }

    function initWithDefaultVlaue(node, defaultValue) {
        return t.expressionStatement(
            t.assignmentPattern(
                node,
                t.binaryExpression('||', node, t.identifier(defaultValue))
            )
        );
    }

    return new babel.Transformer("bable-module-formatter", {
        ExportDefaultDeclaration: {
            enter: function (node, parent, scope, file) {
                // Declare module export
                var moduleName = getModuleName(file);
                if ( !moduleName ) {
                    return;
                }
                var modulePath = getModulePath(moduleName);
                return t.expressionStatement(
                    t.assignmentPattern(
                        modulePath,
                        t.identifier(node.declaration.name)
                    )
                );
            }
        },
        ExportNamedDeclaration: {
            enter: function (node, parent, scope, file) {
                if (!node.specifiers || !node.specifiers.length) {
                    return;
                }
                // Declare export per variable
                var moduleName = getModuleName(file);
                if ( !moduleName ) {
                    return;
                }
                var modulePath = getModulePath(moduleName);
                return node.specifiers.map(function (specifier) {
                    var varName = specifier.local.name;
                    var exportName = (specifier.exported && specifier.exported.name) || varName;
                    var exportNode = modulePath;
                    if (exportName !== 'default') {
                        exportNode = t.memberExpression(exportNode, t.identifier(exportName));
                    }
                    return t.expressionStatement(
                        t.assignmentPattern(
                            exportNode,
                            t.identifier(varName)
                        )
                    );
                });
            }
        },
        ImportDeclaration: {
            enter: function (node, parent, scope, file) {
                if (!node.specifiers || !node.specifiers.length) {
                    return;
                }
                // Declare variable per import
                var moduleName = path.resolve(path.dirname(file.opts.filenameRelative), node.source.value);
                var modulePath = getModulePath(moduleName);
                return t.variableDeclaration('var',
                    node.specifiers.map(function (specifier) {
                        var varName = specifier.local.name;
                        var importName = (specifier.imported && specifier.imported.name) || varName;
                        var importVar = modulePath;
                        if (specifier.imported && importName !== 'default') {
                            importVar = t.memberExpression(importVar, t.identifier(importName));
                        } else if (moduleName.substr(1).indexOf('/') === -1) {
                            importVar = t.binaryExpression(
                                '||',
                                importVar,
                                t.memberExpression(t.identifier('this'), t.identifier(moduleName.substr(1)))
                            );
                        }
                        return t.variableDeclarator(t.identifier(varName), importVar);
                    })
                );
            }
        },
        Program: {
            exit: function (node, parent, scope, file) {
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

                // Function scope for module
                var functionWrap = t.parenthesizedExpression(t.functionDeclaration('',[],t.blockStatement(node.body)));
                var calledWrap = t.callExpression(t.memberExpression(functionWrap,t.identifier('call')), [t.identifier('this')]);
                node.body = [t.expressionStatement(calledWrap)];
            }
        },
    });
};
