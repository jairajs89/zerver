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

    return new babel.Transformer("bable-module-inner", {
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
                        exportNode = getObjectKey(exportNode, exportName);
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
                if (node.source.value === 'window') {
                    moduleName = '/window';
                    modulePath = t.identifier('this');
                }
                return t.variableDeclaration('var',
                    node.specifiers.map(function (specifier) {
                        var varName = specifier.local.name;
                        var importName = (specifier.imported && specifier.imported.name) || varName;
                        var importVar = modulePath;
                        if (specifier.imported && importName !== 'default') {
                            importVar = getObjectKey(importVar, importName);
                        }
                        return t.variableDeclarator(t.identifier(varName), importVar);
                    })
                );
            }
        },
    });
};
