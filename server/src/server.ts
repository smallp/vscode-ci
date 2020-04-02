/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	ProposedFeatures,
	createConnection, TextDocumentSyncKind,
	TextDocuments, InitializeResult, TextDocumentPositionParams,
	CompletionItem,
	DocumentSymbolParams,SymbolInformation,SignatureHelp,Location,Hover,
	ExecuteCommandParams
} from 'vscode-languageserver';
import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import * as jsuri from 'jsuri'
import * as loader from './control';
import { parse } from './parse';
import { isNumber } from 'util';
let mLoader=new loader.loader();
// Create a connection for the server. The connection uses Node's IPC as a transport
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
connection.onInitialize((params): InitializeResult => {
	loader.loader.root = (new jsuri(params.rootUri)).path();
	console.log(`start small-ci on ${process.pid}`);
	mLoader.logger=connection.console
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
				resolveProvider: false,
				triggerCharacters:['>',':']
			},
			executeCommandProvider:{
				commands:['extension.refreshModel']
			}
		}
	}
});

connection.onDidChangeConfiguration((change) => {
	mLoader.settings = (<loader.Settings>change.settings).CI;
	var path:string,
		index: string;
	connection.sendNotification('showStatus')
	for (index in mLoader.settings.library){
		path=mLoader.settings.library[index]
		mLoader.parseFile(path,'library');
		if (!isNumber(index)){//alise by user
			mLoader.alias.set(index,path)
			mLoader.display.set(index,'library')
		}else if (path.indexOf('/')>0){
			//in sub folder, we need add alisa
			var filename=path.split('/').pop()
			filename=parse.modFirst(filename,false)
			mLoader.alias.set(filename,path)
			mLoader.display.set(filename,'library')
		}else{
			mLoader.display.set(parse.modFirst(path,false),'library')
		}
	}
	for (path of mLoader.settings.other) {
		mLoader.loadOther(path);
	}
	mLoader.initModels();
	connection.sendNotification('hideStatus')
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
connection.onExecuteCommand((_: ExecuteCommandParams) => {
	mLoader.initModels();
	connection.window.showInformationMessage('refresh success!');
})
// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	if (textDocumentPosition.textDocument.uri.indexOf(loader.loader.root)<0) return [];
	else return mLoader.complete(
		textDocumentPosition,
		documents.get(textDocumentPosition.textDocument.uri).getText());
});

connection.onDocumentSymbol((param:DocumentSymbolParams):SymbolInformation[]=> {
	if (param.textDocument.uri.indexOf(loader.loader.root)<0 || mLoader.settings.ignoreSymbols) return [];
	else return mLoader.allFun(documents.get(param.textDocument.uri));
});

connection.onSignatureHelp((position:TextDocumentPositionParams):SignatureHelp=>{
	if (position.textDocument.uri.indexOf(loader.loader.root)<0) return null;
	else return mLoader.signature(
		position,
		documents.get(position.textDocument.uri).getText());
});

connection.onDefinition((position:TextDocumentPositionParams):Location=>{
	if (position.textDocument.uri.indexOf(loader.loader.root)<0) return null;
	else return mLoader.definition(
		position,
		documents.get(position.textDocument.uri).getText());
});

connection.onHover((position:TextDocumentPositionParams):Hover=>{
	if (position.textDocument.uri.indexOf(loader.loader.root)<0) return null;
	else return mLoader.hover(
		position,
		documents.get(position.textDocument.uri).getText());
})

// Listen on the connection
connection.listen();