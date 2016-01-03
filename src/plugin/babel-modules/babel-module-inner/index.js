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

    return {
        visitor: {
            ExportDefaultDeclaration: {
                enter: function (file, f) {
                    // Declare module export
                    var moduleName = getModuleName(f.file);
                    if ( !moduleName ) {
                        return;
                    }
                    var modulePath = getModulePath(moduleName);
                    if (file.node.declaration.name) {
                        file.replaceWith(
                            t.expressionStatement(
                                t.assignmentExpression(
                                    '=',
                                    modulePath,
                                    t.identifier(file.node.declaration.name)
                                )
                            )
                        );
                    } else if (file.node.declaration.id) {
                        file.replaceWithMultiple([
                            file.node.declaration,
                            t.expressionStatement(
                                t.assignmentExpression(
                                    '=',
                                    modulePath,
                                    t.identifier(file.node.declaration.id.name)
                                )
                            )
                        ]);
                    } else if (file.node.declaration.type === 'ClassDeclaration') {
                        file.node.declaration.id = file.scope.generateUidIdentifier('class');
                        file.replaceWithMultiple([
                            file.node.declaration,
                            t.expressionStatement(
                                t.assignmentExpression(
                                    '=',
                                    modulePath,
                                    t.identifier(file.node.declaration.id.name)
                                )
                            )
                        ]);
                    } else {
                        file.replaceWith(
                            t.expressionStatement(
                                t.assignmentExpression(
                                    '=',
                                    modulePath,
                                    file.node.declaration
                                )
                            )
                        );
                    }
                }
            },
            ExportNamedDeclaration: {
                enter: function (file, f) {
                    // Declare export per variable
                    var moduleName = getModuleName(f.file);
                    if ( !moduleName ) {
                        return;
                    }
                    var modulePath = getModulePath(moduleName);
                    if (file.node.specifiers && file.node.specifiers.length) {
                        file.replaceWithMultiple(
                            file.node.specifiers.map(function (specifier) {
                                var varName = specifier.local.name;
                                var exportName = (specifier.exported && specifier.exported.name) || varName;
                                var exportNode = modulePath;
                                if (exportName !== 'default') {
                                    exportNode = getObjectKey(exportNode, exportName);
                                }
                                return t.expressionStatement(
                                    t.assignmentExpression(
                                        '=',
                                        exportNode,
                                        t.identifier(varName)
                                    )
                                );
                            })
                        );
                    } else {
                       file.replaceWithMultiple([
                            file.node.declaration,
                            t.expressionStatement(
                                t.assignmentExpression(
                                    '=',
                                    getObjectKey(modulePath, file.node.declaration.id.name),
                                    t.identifier(file.node.declaration.id.name)
                                )
                            )
                        ]);
                    }
                }
            },
            ImportDeclaration: {
                enter: function (file, f) {
                    if (!file.node.specifiers || !file.node.specifiers.length) {
                        return;
                    }
                    // Declare variable per import
                    var moduleName = path.resolve(path.dirname(f.file.opts.filenameRelative), file.node.source.value);
                    var modulePath = getModulePath(moduleName);
                    if (file.node.source.value === 'window') {
                        moduleName = '/window';
                        modulePath = t.identifier('this');
                    }
                    file.replaceWith(
                        t.variableDeclaration('var',
                            file.node.specifiers.map(function (specifier) {
                                var varName = specifier.local.name;
                                var importName = (specifier.imported && specifier.imported.name) || varName;
                                var importVar = modulePath;
                                if (specifier.imported && importName !== 'default') {
                                    importVar = getObjectKey(importVar, importName);
                                }
                                return t.variableDeclarator(t.identifier(varName), importVar);
                            })
                        )
                    );
                }
            },
        },
    };
};
