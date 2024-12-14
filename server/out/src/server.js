"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
connection.onInitialize((params) => {
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true
            }
        }
    };
});
documents.onDidChangeContent(change => {
    // ...handle document changes...
});
connection.onDidChangeWatchedFiles(_change => {
    // ...handle file changes...
});
connection.onCompletion((textDocumentPosition) => {
    return [
        {
            label: 'INP',
            kind: node_1.CompletionItemKind.Keyword,
            data: 1
        },
        // ...other instructions...
    ];
});
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map