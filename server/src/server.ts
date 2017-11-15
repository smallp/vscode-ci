/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind, InsertTextFormat,
	DocumentSymbolParams,SymbolInformation,SignatureHelp,Location,Hover,
	ExecuteCommandParams,
	CompletionList
} from 'vscode-languageserver';
import * as loader from './control';
import * as URI from 'vscode-uri';
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
	loader.loader.root=URI.default.parse(params.rootUri);
	console.log('start small-ci');
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync:TextDocumentSyncKind.Full,
			documentSymbolProvider:true,
			definitionProvider :true,
			hoverProvider : true,
			signatureHelpProvider : {
				triggerCharacters: [ '(' ]
			},
			completionProvider: {
				resolveProvider: true,
				triggerCharacters:['>',':']
			},
			executeCommandProvider:{
				commands:['extension.refreshModel']
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
	system:string;
	app:string;
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
	loader.loader.system=settings.CI.system;
	loader.loader.app=settings.CI.app;
	mLoader.initModels();
});

documents.onDidOpen((e)=>{
	if (e.document.languageId!='php') return ;
	mLoader.parseLoader(e.document.getText());
});

documents.onDidSave((e)=>{
	if (e.document.languageId!='php') return ;
	let uri=e.document.uri;
	let content=e.document.getText();
	mLoader.parseLoader(content);
	if (mLoader.cached_info.has(uri)){
		let info=mLoader.cached_info.get(uri);
		if (info.kind==null){
			mLoader.parseConst(content,uri);
		}else mLoader.parseFile(info.name,info.kind);
	}
});
connection.onExecuteCommand((param:ExecuteCommandParams)=>{
	mLoader.initModels();
})
// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	if (textDocumentPosition.textDocument.uri.indexOf(loader.loader.root.path)<0) return [];
	else return mLoader.complete(
		textDocumentPosition,
		documents.get(textDocumentPosition.textDocument.uri).getText());
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	if (item.kind==CompletionItemKind.Class){
		item.insertText=item.label+'-';
	}else if (item.kind==CompletionItemKind.Method){
		item.insertText = item.label + '($1)$0';
		item.insertTextFormat = InsertTextFormat.Snippet;
	}
	return item;
});

connection.onDocumentSymbol((param:DocumentSymbolParams):SymbolInformation[]=> {
	if (param.textDocument.uri.indexOf(loader.loader.root.path)<0) return [];
	else return mLoader.allFun(documents.get(param.textDocument.uri));
});

connection.onSignatureHelp((position:TextDocumentPositionParams):SignatureHelp=>{
	if (position.textDocument.uri.indexOf(loader.loader.root.path)<0) return null;
	else return mLoader.signature(
		position,
		documents.get(position.textDocument.uri).getText());
});

connection.onDefinition((position:TextDocumentPositionParams):Location=>{
	if (position.textDocument.uri.indexOf(loader.loader.root.path)<0) return null;
	else return mLoader.definition(
		position,
		documents.get(position.textDocument.uri).getText());
});

connection.onHover((position:TextDocumentPositionParams):Hover=>{
	if (position.textDocument.uri.indexOf(loader.loader.root.path)<0) return null;
	else return mLoader.hover(
		position,
		documents.get(position.textDocument.uri).getText());
})

// Listen on the connection
connection.listen();