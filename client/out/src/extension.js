"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const path = require("path");
const node_1 = require("vscode-languageclient/node");
let outputChannel;
function activate(context) {
    // Create output channel
    outputChannel = vscode.window.createOutputChannel('LMC Language Server');
    outputChannel.appendLine('LMC Language Server is starting...');
    const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: { module: serverModule, transport: node_1.TransportKind.ipc, options: { execArgv: ["--nolazy", "--inspect=6009"] } }
    };
    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'lmc' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.lmc')
        },
        outputChannel: outputChannel
    };
    const client = new node_1.LanguageClient('lmcLanguageServer', 'LMC Language Server', serverOptions, clientOptions);
    client.start().then(() => {
        outputChannel.appendLine('LMC Language Server is running');
    });
    context.subscriptions.push(new vscode.Disposable(() => {
        client.stop();
    }));
}
function deactivate() {
    outputChannel.appendLine('LMC Language Server is shutting down...');
}
//# sourceMappingURL=extension.js.map