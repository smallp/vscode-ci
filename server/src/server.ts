/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind,
	DocumentSymbolParams,SymbolInformation,SignatureHelp,Location
} from 'vscode-languageserver';
import * as loader from './loader';
let mLoader=new loader.loader();
// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
connection.onInitialize((params): InitializeResult => {
	mLoader.initModels(params.rootPath);
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync:TextDocumentSyncKind.Full,
			documentSymbolProvider:true,
			definitionProvider :true,
			signatureHelpProvider : {
				triggerCharacters: [ '(' ]
			},
			completionProvider: {
				resolveProvider: true,
				triggerCharacters:['>',':']
			}
		}
	}
});

interface Settings {
	CI: CI;
}

interface CI {
	model: Array<string>;
	other: Array<string>;
}

connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	var str:string;
	for (str of settings.CI.model){
		mLoader.parseFile(str,'model');
	}
	for (str of settings.CI.other) {
		mLoader.loadOther(str);
	}
});

documents.onDidOpen((e)=>{
	if (e.document.languageId!='php') return ;
	mLoader.parseLoader(e.document.getText());
});

documents.onDidSave((e)=>{
	if (e.document.languageId!='php') return ;
	let uri=e.document.uri;
	mLoader.parseLoader(e.document.getText());
	if (mLoader.cached_info.has(uri)){
		let info=mLoader.cached_info.get(uri);
		mLoader.parseFile(info.name,info.kind);
	}
});

// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	return mLoader.complete(
		textDocumentPosition,
		documents.get(textDocumentPosition.textDocument.uri).getText());
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	if (item.kind==CompletionItemKind.Class)
		item.insertText=item.label+'-';
	else if (item.kind==CompletionItemKind.Method)
		item.insertText=item.label+'()';
	return item;
});

connection.onDocumentSymbol((pram:DocumentSymbolParams):SymbolInformation[]=> {
	return mLoader.allFun(documents.get(pram.textDocument.uri));
});

connection.onSignatureHelp((position:TextDocumentPositionParams):SignatureHelp=>{
	return mLoader.signature(
		position,
		documents.get(position.textDocument.uri).getText());
});

connection.onDefinition((position:TextDocumentPositionParams):Location=>{
	return mLoader.definition(
		position,
		documents.get(position.textDocument.uri).getText());
});

// Listen on the connection
connection.listen();