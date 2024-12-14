/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			}
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
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<ExampleSettings>>();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = (
			(change.settings.languageServerExample || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
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

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document).then(diagnostics => {
		connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
	});
});

interface LMCLine {
	label?: string;
	instruction?: string;
	operand?: string;
	lineNumber: number;
	startChar: number;
	operandStartChar: number;  // Add this to track operand position more accurately
}

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	const text = textDocument.getText();
	const lines = text.split(/\r?\n/);
	const diagnostics: Diagnostic[] = [];
	const labels = new Set<string>();
	const parsedLines: LMCLine[] = [];

	// First pass: collect labels and parse lines
	lines.forEach((line, lineNumber) => {
		const trimmedLine = line.trim();
		if (trimmedLine === '' || trimmedLine.startsWith(';')) return;

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
						severity: DiagnosticSeverity.Error,
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

		if (!instruction) return;

		// Validate instruction
		if (!LMC_INSTRUCTIONS.includes(instruction)) {
			diagnostics.push({
				severity: DiagnosticSeverity.Error,
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
					let num: bigint;
					try {
						num = BigInt(operand.slice(1));
						if (num < 0n || num > 18446744073709551615n) {
							throw new Error();
						}
					} catch {
						diagnostics.push({
							severity: DiagnosticSeverity.Error,
							range: {
								start: { line: lineNumber, character: operandStartChar },
								end: { line: lineNumber, character: operandStartChar + operand.length }
							},
							message: 'Immediate value must be between 0 and 18446744073709551615',
							source: 'LMC'
						});
					}
				} else if (!labels.has(operand) && !operand.match(/^\d+$/)) {
					diagnostics.push({
						severity: DiagnosticSeverity.Error,
						range: {
							start: { line: lineNumber, character: operandStartChar },
							end: { line: lineNumber, character: operandStartChar + operand.length }
						},
						message: `DAT operand must be a number, a label, or an immediate value prefixed with '#'`,
						source: 'LMC'
					});
				} else if (operand.match(/^\d+$/)) {
					let num: bigint;
					try {
						num = BigInt(operand);
						if (num < 0n || num > 18446744073709551615n) {
							throw new Error();
						}
					} catch {
						diagnostics.push({
							severity: DiagnosticSeverity.Error,
							range: {
								start: { line: lineNumber, character: operandStartChar },
								end: { line: lineNumber, character: operandStartChar + operand.length }
							},
							message: 'Numeric value must be between 0 and 18446744073709551615',
							source: 'LMC'
						});
					}
				}
			} else {
				const needsOperand = !['INP', 'OUT', 'HLT'].includes(instruction);
				
				if (needsOperand) {
					if (operand.match(/^\d+$/)) {
						let num: bigint;
						try {
							num = BigInt(operand);
							if (num < 0n || num > 18446744073709551615n) {
								throw new Error();
							}
							// Numeric value without # prefix is an error
							diagnostics.push({
								severity: DiagnosticSeverity.Error,
								range: {
									start: { line: lineNumber, character: operandStartChar },
									end: { line: lineNumber, character: operandStartChar + operand.length }
								},
								message: `Numeric value ${operand} must be prefixed with '#' for immediate addressing`,
								source: 'LMC'
							});
						} catch {
							diagnostics.push({
								severity: DiagnosticSeverity.Error,
								range: {
									start: { line: lineNumber, character: operandStartChar },
									end: { line: lineNumber, character: operandStartChar + operand.length }
								},
								message: `Numeric value must be between 0 and 18446744073709551615`,
								source: 'LMC'
							});
						}
					} else if (operand.startsWith('#')) {
							// Added check for operand length after '#'
							if (operand.length <= 1) {
								diagnostics.push({
									severity: DiagnosticSeverity.Error,
									range: {
										start: { line: lineNumber, character: operandStartChar },
										end: { line: lineNumber, character: operandStartChar + operand.length }
									},
									message: `'${instruction}' operand '${operand}' is incomplete. A value must follow '#'`,
									source: 'LMC'
								});
							} else {
								let num: bigint;
								try {
									num = BigInt(operand.slice(1));
									if (num < 0n || num > 18446744073709551615n) {
										throw new Error();
									}
								} catch {
									diagnostics.push({
										severity: DiagnosticSeverity.Error,
										range: {
											start: { line: lineNumber, character: operandStartChar },
											end: { line: lineNumber, character: operandStartChar + operand.length }
										},
										message: 'Immediate value must be between 0 and 18446744073709551615',
										source: 'LMC'
									});
								}
							}
					} else if (operand.startsWith('@')) {
						// Validate indirect reference
						const label = operand.slice(1);
						if (!labels.has(label)) {
							diagnostics.push({
								severity: DiagnosticSeverity.Error,
								range: {
									start: { line: lineNumber, character: operandStartChar },
									end: { line: lineNumber, character: operandStartChar + operand.length }
								},
								message: `Undefined label reference: ${label}`,
								source: 'LMC'
							});
						}
					} else if (!labels.has(operand)) {
						// Direct label reference
						diagnostics.push({
							severity: DiagnosticSeverity.Error,
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
		} else if (!['INP', 'OUT', 'HLT', 'DAT'].includes(instruction)) {
			// Missing required operand (excluding DAT from requiring operand)
			diagnostics.push({
				severity: DiagnosticSeverity.Error,
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
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		return LMC_INSTRUCTIONS.map(instruction => ({
			label: instruction,
			kind: CompletionItemKind.Keyword,
			data: instruction
		}));
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'TypeScript details';
			item.documentation = 'TypeScript documentation';
		} else if (item.data === 2) {
			item.detail = 'JavaScript details';
			item.documentation = 'JavaScript documentation';
		}
		return item;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();