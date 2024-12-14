"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
connection.onInitialize((params) => {
    const capabilities = params.capabilities;
    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability = !!(capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation);
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true
            },
            diagnosticProvider: {
                interFileDependencies: false,
                workspaceDiagnostics: false
            },
            codeActionProvider: true // Add this line
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});
connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});
// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings = { maxNumberOfProblems: 1000 };
let globalSettings = defaultSettings;
// Cache the settings of all open documents
const documentSettings = new Map();
connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    }
    else {
        globalSettings = ((change.settings.languageServerExample || defaultSettings));
    }
    // Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
    // We could optimize things here and re-fetch the setting first can compare it
    // to the existing setting, but this is out of scope for this example.
    connection.languages.diagnostics.refresh();
});
function getDocumentSettings(resource) {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'languageServerExample'
        });
        documentSettings.set(resource, result);
    }
    return result;
}
// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});
// LMC instruction set
const LMC_INSTRUCTIONS = [
    'INP', 'OUT', 'ADD', 'SUB', 'STA',
    'LDA', 'BRA', 'BRZ', 'BRP', 'DAT', 'HLT'
];
// Add these template constants near the top with other constants
const LMC_TEMPLATES = {
    'MULTIPLY': `; Multiplication routine
MULT    LDA #0          ; Initialize result
LOOP    LDA RESULT      ; Load current result
        ADD NUM1        ; Add first number
        STA RESULT      ; Store result
        LDA NUM2        ; Load second number
        SUB #1          ; Decrement counter
        STA NUM2        ; Store counter
        BRP LOOP        ; Loop if positive
        HLT             ; End program
NUM1    DAT 0           ; First number
NUM2    DAT 0           ; Second number
RESULT  DAT 0           ; Result storage`,
    'INPUT_LOOP': `; Input processing loop
START   INP             ; Get input
        BRZ END         ; If zero, end
        STA VALUE       ; Store input
        ; Process here
        BRA START       ; Loop for more input
END     HLT             ; End program
VALUE   DAT 0           ; Storage for input`
};
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    validateTextDocument(change.document).then(diagnostics => {
        connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
    });
});
async function validateTextDocument(textDocument) {
    const text = textDocument.getText();
    const lines = text.split(/\r?\n/);
    const diagnostics = [];
    const labels = new Set();
    const parsedLines = [];
    // First pass: collect labels and parse lines
    lines.forEach((line, lineNumber) => {
        const trimmedLine = line.trim();
        if (trimmedLine === '' || trimmedLine.startsWith(';'))
            return;
        // Split comment from line if present
        const codePart = line.split(';')[0];
        // Improved regex to capture label, instruction, and operand
        const lineMatch = codePart.match(/^(?:([A-Za-z]\w*))?\s*([A-Z]{3})(?:\s+([^;\s]+))?/);
        if (lineMatch) {
            const [, label, instruction, operand] = lineMatch;
            // Calculate exact instruction position
            let startChar = codePart.indexOf(instruction);
            // Calculate exact operand position if it exists
            let operandStartChar = -1;
            if (operand) {
                operandStartChar = codePart.indexOf(operand, startChar + instruction.length);
            }
            if (label) {
                if (labels.has(label)) {
                    diagnostics.push({
                        severity: node_1.DiagnosticSeverity.Error,
                        range: {
                            start: { line: lineNumber, character: codePart.indexOf(label) },
                            end: { line: lineNumber, character: codePart.indexOf(label) + label.length }
                        },
                        message: `Duplicate label: ${label}`,
                        source: 'LMC'
                    });
                }
                labels.add(label);
            }
            parsedLines.push({
                label,
                instruction: instruction?.trim(),
                operand: operand?.trim(),
                lineNumber,
                startChar,
                operandStartChar
            });
        }
    });
    // Second pass: validate instructions and operands
    parsedLines.forEach((line) => {
        const { instruction, operand, lineNumber, startChar, operandStartChar } = line;
        if (!instruction)
            return;
        // Validate instruction
        if (!LMC_INSTRUCTIONS.includes(instruction)) {
            diagnostics.push({
                severity: node_1.DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNumber, character: startChar },
                    end: { line: lineNumber, character: startChar + instruction.length }
                },
                message: `Invalid instruction: ${instruction}`,
                source: 'LMC'
            });
        }
        // Validate operands
        if (operand) {
            if (instruction === 'DAT') {
                // DAT can accept an immediate value, a label, or a number without # prefix
                if (operand.startsWith('#')) {
                    let num;
                    try {
                        num = BigInt(operand.slice(1));
                        if (num < 0n || num > 18446744073709551615n) {
                            throw new Error();
                        }
                    }
                    catch {
                        diagnostics.push({
                            severity: node_1.DiagnosticSeverity.Error,
                            range: {
                                start: { line: lineNumber, character: operandStartChar },
                                end: { line: lineNumber, character: operandStartChar + operand.length }
                            },
                            message: 'Immediate value must be between 0 and 18446744073709551615',
                            source: 'LMC'
                        });
                    }
                }
                else if (!labels.has(operand) && !operand.match(/^\d+$/)) {
                    diagnostics.push({
                        severity: node_1.DiagnosticSeverity.Error,
                        range: {
                            start: { line: lineNumber, character: operandStartChar },
                            end: { line: lineNumber, character: operandStartChar + operand.length }
                        },
                        message: `DAT operand must be a number, a label, or an immediate value prefixed with '#'`,
                        source: 'LMC'
                    });
                }
                else if (operand.match(/^\d+$/)) {
                    let num;
                    try {
                        num = BigInt(operand);
                        if (num < 0n || num > 18446744073709551615n) {
                            throw new Error();
                        }
                    }
                    catch {
                        diagnostics.push({
                            severity: node_1.DiagnosticSeverity.Error,
                            range: {
                                start: { line: lineNumber, character: operandStartChar },
                                end: { line: lineNumber, character: operandStartChar + operand.length }
                            },
                            message: 'Numeric value must be between 0 and 18446744073709551615',
                            source: 'LMC'
                        });
                    }
                }
            }
            else {
                const needsOperand = !['INP', 'OUT', 'HLT'].includes(instruction);
                if (needsOperand) {
                    if (operand.match(/^\d+$/)) {
                        let num;
                        try {
                            num = BigInt(operand);
                            if (num < 0n || num > 18446744073709551615n) {
                                throw new Error();
                            }
                            // Numeric value without # prefix is an error
                            diagnostics.push({
                                severity: node_1.DiagnosticSeverity.Error,
                                range: {
                                    start: { line: lineNumber, character: operandStartChar },
                                    end: { line: lineNumber, character: operandStartChar + operand.length }
                                },
                                message: `Numeric value ${operand} must be prefixed with '#' for immediate addressing`,
                                source: 'LMC'
                            });
                        }
                        catch {
                            diagnostics.push({
                                severity: node_1.DiagnosticSeverity.Error,
                                range: {
                                    start: { line: lineNumber, character: operandStartChar },
                                    end: { line: lineNumber, character: operandStartChar + operand.length }
                                },
                                message: `Numeric value must be between 0 and 18446744073709551615`,
                                source: 'LMC'
                            });
                        }
                    }
                    else if (operand.startsWith('#')) {
                        // Added check for operand length after '#'
                        if (operand.length <= 1) {
                            diagnostics.push({
                                severity: node_1.DiagnosticSeverity.Error,
                                range: {
                                    start: { line: lineNumber, character: operandStartChar },
                                    end: { line: lineNumber, character: operandStartChar + operand.length }
                                },
                                message: `'${instruction}' operand '${operand}' is incomplete. A value must follow '#'`,
                                source: 'LMC'
                            });
                        }
                        else {
                            let num;
                            try {
                                num = BigInt(operand.slice(1));
                                if (num < 0n || num > 18446744073709551615n) {
                                    throw new Error();
                                }
                            }
                            catch {
                                diagnostics.push({
                                    severity: node_1.DiagnosticSeverity.Error,
                                    range: {
                                        start: { line: lineNumber, character: operandStartChar },
                                        end: { line: lineNumber, character: operandStartChar + operand.length }
                                    },
                                    message: 'Immediate value must be between 0 and 18446744073709551615',
                                    source: 'LMC'
                                });
                            }
                        }
                    }
                    else if (operand.startsWith('@')) {
                        // Validate indirect reference
                        const label = operand.slice(1);
                        if (!labels.has(label)) {
                            diagnostics.push({
                                severity: node_1.DiagnosticSeverity.Error,
                                range: {
                                    start: { line: lineNumber, character: operandStartChar },
                                    end: { line: lineNumber, character: operandStartChar + operand.length }
                                },
                                message: `Undefined label reference: ${label}`,
                                source: 'LMC'
                            });
                        }
                    }
                    else if (!labels.has(operand)) {
                        // Direct label reference
                        diagnostics.push({
                            severity: node_1.DiagnosticSeverity.Error,
                            range: {
                                start: { line: lineNumber, character: operandStartChar },
                                end: { line: lineNumber, character: operandStartChar + operand.length }
                            },
                            message: `Undefined label: ${operand}`,
                            source: 'LMC'
                        });
                    }
                }
            }
        }
        else if (!['INP', 'OUT', 'HLT', 'DAT'].includes(instruction)) {
            // Missing required operand (excluding DAT from requiring operand)
            diagnostics.push({
                severity: node_1.DiagnosticSeverity.Error,
                range: {
                    start: { line: lineNumber, character: startChar },
                    end: { line: lineNumber, character: startChar + instruction.length }
                },
                message: `Instruction ${instruction} requires an operand`,
                source: 'LMC'
            });
        }
    });
    return diagnostics;
}
connection.onDidChangeWatchedFiles(_change => {
    // Monitored files have change in VSCode
    connection.console.log('We received a file change event');
});
// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition) => {
    return LMC_INSTRUCTIONS.map(instruction => ({
        label: instruction,
        kind: node_1.CompletionItemKind.Keyword,
        data: instruction
    }));
});
// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item) => {
    if (item.data === 1) {
        item.detail = 'TypeScript details';
        item.documentation = 'TypeScript documentation';
    }
    else if (item.data === 2) {
        item.detail = 'JavaScript details';
        item.documentation = 'JavaScript documentation';
    }
    return item;
});
// Add this new handler after the existing handlers
const BRANCH_INSTRUCTIONS = ['BRA', 'BRP', 'BRZ'];
connection.onCodeAction((params) => {
    const textDocument = documents.get(params.textDocument.uri);
    if (!textDocument)
        return [];
    const codeActions = [];
    for (const diagnostic of params.context.diagnostics) {
        if (diagnostic.source !== 'LMC')
            continue;
        // Fix for missing '#' prefix
        if (diagnostic.message.includes("must be prefixed with '#'")) {
            const range = diagnostic.range;
            const text = textDocument.getText(range);
            codeActions.push({
                title: `Add '#' prefix to ${text}`,
                kind: node_1.CodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                edit: {
                    changes: {
                        [params.textDocument.uri]: [
                            node_1.TextEdit.replace(range, `#${text}`)
                        ]
                    }
                }
            });
        }
        // Fix for DAT with missing operand
        if (diagnostic.message.includes('DAT requires an operand')) {
            codeActions.push({
                title: 'Add default value 0',
                kind: node_1.CodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                edit: {
                    changes: {
                        [params.textDocument.uri]: [
                            node_1.TextEdit.insert(diagnostic.range.end, ' 0')
                        ]
                    }
                }
            });
        } // Fix for immediate value errors
        if (diagnostic.message.includes('Immediate value must be between')) {
            codeActions.push({
                title: 'Set to 0',
                kind: node_1.CodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                edit: {
                    changes: {
                        [params.textDocument.uri]: [
                            node_1.TextEdit.replace(diagnostic.range, '#0')
                        ]
                    }
                }
            });
        }
        // Handle undefined labels differently for branch instructions
        if (diagnostic.message.includes('Undefined label:')) {
            const range = diagnostic.range;
            const labelName = textDocument.getText(range);
            // Find the instruction that references this label
            const lineText = textDocument.getText({
                start: { line: range.start.line, character: 0 },
                end: { line: range.start.line, character: 100 }
            });
            const instructionMatch = lineText.match(/^\s*(?:[A-Za-z]\w*)?\s*([A-Z]{3})/);
            const instruction = instructionMatch ? instructionMatch[1] : '';
            if (BRANCH_INSTRUCTIONS.includes(instruction)) {
                // Create a code label for branch instructions
                const insertLine = findDATSectionLine(textDocument);
                codeActions.push({
                    title: `Create code label '${labelName}'`,
                    kind: node_1.CodeActionKind.QuickFix,
                    diagnostics: [diagnostic],
                    edit: {
                        changes: {
                            [params.textDocument.uri]: [
                                node_1.TextEdit.insert({ line: insertLine, character: 0 }, `${labelName}\tHLT\n\n`)
                            ]
                        }
                    }
                });
            }
            else {
                // Create a data label for other instructions
                codeActions.push({
                    title: `Create DAT label '${labelName}'`,
                    kind: node_1.CodeActionKind.QuickFix,
                    diagnostics: [diagnostic],
                    edit: {
                        changes: {
                            [params.textDocument.uri]: [
                                node_1.TextEdit.insert({ line: textDocument.lineCount, character: 0 }, `${labelName}\tDAT 0\n`)
                            ]
                        }
                    }
                });
            }
        }
        // Add fix for invalid instructions
        if (diagnostic.message.includes('Invalid instruction:')) {
            const text = textDocument.getText(diagnostic.range);
            const suggestions = LMC_INSTRUCTIONS.filter(instr => instr.startsWith(text[0]) ||
                levenshteinDistance(text, instr) <= 2);
            suggestions.forEach(suggestion => {
                codeActions.push({
                    title: `Change to '${suggestion}'`,
                    kind: node_1.CodeActionKind.QuickFix,
                    diagnostics: [diagnostic],
                    edit: {
                        changes: {
                            [params.textDocument.uri]: [
                                node_1.TextEdit.replace(diagnostic.range, suggestion)
                            ]
                        }
                    }
                });
            });
        }
    }
    // Add template insertions
    const text = textDocument.getText();
    if (text.trim().length === 0) {
        Object.entries(LMC_TEMPLATES).forEach(([name, template]) => {
            codeActions.push({
                title: `Insert ${name} template`,
                kind: node_1.CodeActionKind.QuickFix,
                edit: {
                    changes: {
                        [params.textDocument.uri]: [
                            node_1.TextEdit.insert({ line: 0, character: 0 }, template)
                        ]
                    }
                }
            });
        });
    }
    return codeActions;
});
// Add helper function to find DAT section
function findDATSectionLine(textDocument) {
    const text = textDocument.getText();
    const lines = text.split(/\r?\n/);
    // Look for first DAT instruction
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && !line.startsWith(';')) {
            const match = line.match(/^\s*(?:[A-Za-z]\w*)?\s*DAT/);
            if (match) {
                return i;
            }
        }
    }
    return textDocument.lineCount; // Default to end of file if no DAT section found
}
// Add helper function for suggesting similar instructions
function levenshteinDistance(a, b) {
    if (a.length === 0)
        return b.length;
    if (b.length === 0)
        return a.length;
    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++)
        matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++)
        matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[a.length][b.length];
}
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map