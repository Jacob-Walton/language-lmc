"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Imports necessary modules and types from vscode-languageserver and vscode-languageserver-textdocument.
 */
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
/**
 * Establishes a connection for the server using Node's IPC as a transport.
 * Incorporates all preview and proposed LSP features.
 */
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
/**
 * Manages open text documents.
 */
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
/**
 * Handles the initialization of the server, determining client capabilities and setting up server capabilities.
 * @param params - Initialization parameters provided by the client.
 * @returns InitializeResult containing server capabilities.
 */
connection.onInitialize((params) => {
    const capabilities = params.capabilities;
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability = !!(capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation);
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true
            },
            diagnosticProvider: {
                interFileDependencies: false,
                workspaceDiagnostics: false
            },
            codeActionProvider: true
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
/**
 * Performs actions after the server has been initialized, such as registering for configuration changes and workspace folder changes.
 */
connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});
/**
 * Defines the default settings used when the client does not support workspace configuration.
 */
const defaultSettings = { maxNumberOfProblems: 1000 };
let globalSettings = defaultSettings;
/**
 * Caches the settings of all open documents.
 */
const documentSettings = new Map();
/**
 * Handles changes to the configuration, updating settings and refreshing diagnostics as necessary.
 * @param change - The configuration change event.
 */
connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    }
    else {
        globalSettings = ((change.settings.languageServerExample || defaultSettings));
    }
    connection.languages.diagnostics.refresh();
});
/**
 * Retrieves the settings for a specific document.
 * @param resource - The URI of the document.
 * @returns A promise resolving to the document's settings.
 */
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
/**
 * Removes settings for a document when it is closed.
 * @param e - The document close event.
 */
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});
const LMC_INSTRUCTIONS = [
    'INP', 'OUT', 'ADD', 'SUB', 'STA',
    'LDA', 'BRA', 'BRZ', 'BRP', 'DAT', 'HLT'
];
/**
 * Defines template constants for multiplication routines and input loops.
 */
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
/**
 * Validates the content of a text document and generates diagnostics.
 * @param textDocument - The text document to validate.
 * @returns A promise resolving to an array of diagnostics.
 */
documents.onDidChangeContent(change => {
    validateTextDocument(change.document).then(diagnostics => {
        connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
    });
});
/**
 * Validates the syntax and semantics of an LMC text document.
 * @param textDocument - The text document to validate.
 * @returns An array of diagnostics representing issues found.
 */
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
        const codePart = line.split(';')[0];
        const lineMatch = codePart.match(/^(?:([A-Za-z]\w*))?\s*([A-Z]{3})(?:\s+([^;\s]+))?/);
        if (lineMatch) {
            const [, label, instruction, operand] = lineMatch;
            let startChar = codePart.indexOf(instruction);
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
        if (operand) {
            if (instruction === 'DAT') {
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
/**
 * Handles file change events monitored by VSCode.
 * @param _change - The file change event.
 */
connection.onDidChangeWatchedFiles(_change => {
    connection.console.log('We received a file change event');
});
/**
 * Provides the initial list of completion items.
 * @param _textDocumentPosition - The text document position parameters.
 * @returns An array of completion items.
 */
connection.onCompletion((_textDocumentPosition) => {
    return LMC_INSTRUCTIONS.map(instruction => ({
        label: instruction,
        kind: node_1.CompletionItemKind.Keyword,
        data: instruction
    }));
});
/**
 * Resolves additional information for a selected completion item.
 * @param item - The completion item to resolve.
 * @returns The resolved completion item with additional details.
 */
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
const BRANCH_INSTRUCTIONS = ['BRA', 'BRP', 'BRZ'];
/**
 * Provides code actions based on diagnostics, offering quick fixes and template insertions.
 * @param params - Parameters containing text document information and diagnostics.
 * @returns An array of code actions.
 */
connection.onCodeAction((params) => {
    const textDocument = documents.get(params.textDocument.uri);
    if (!textDocument)
        return [];
    const codeActions = [];
    for (const diagnostic of params.context.diagnostics) {
        if (diagnostic.source !== 'LMC')
            continue;
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
        if (diagnostic.message.includes('DAT with missing operand')) {
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
        }
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
        if (diagnostic.message.includes('Undefined label:')) {
            const range = diagnostic.range;
            const labelName = textDocument.getText(range);
            const lineText = textDocument.getText({
                start: { line: range.start.line, character: 0 },
                end: { line: range.start.line, character: 100 }
            });
            const instructionMatch = lineText.match(/^\s*(?:[A-Za-z]\w*)?\s*([A-Z]{3})/);
            const instruction = instructionMatch ? instructionMatch[1] : '';
            if (BRANCH_INSTRUCTIONS.includes(instruction)) {
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
/**
 * Finds the line number for the DAT section in a text document.
 * @param textDocument - The text document to search.
 * @returns The line number where the DAT section starts.
 */
function findDATSectionLine(textDocument) {
    const text = textDocument.getText();
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && !line.startsWith(';')) {
            const match = line.match(/^\s*(?:[A-Za-z]\w*)?\s*DAT/);
            if (match) {
                return i;
            }
        }
    }
    return textDocument.lineCount;
}
/**
 * Calculates the Levenshtein distance between two strings.
 * @param a - The first string.
 * @param b - The second string.
 * @returns The Levenshtein distance as a number.
 */
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
/**
 * Initiates listening for changes in open text documents.
 */
documents.listen(connection);
/**
 * Starts listening for connection events.
 */
connection.listen();
//# sourceMappingURL=server.js.map