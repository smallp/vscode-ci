import {
    SymbolInformation, SymbolKind, Location, CompletionItemKind,
    TextDocumentPositionParams, CompletionItem, SignatureHelp,
    ParameterInformation, Range, Hover, TextDocument, InsertTextFormat, DocumentLink
} from 'vscode-languageserver';
import * as fs from 'fs';
import * as parse from './parse';
import { isNumber } from 'util';
import { URI } from 'vscode-uri'
export interface fun {
    param: ParameterInformation[];
    location: Location;
    ret: string;
    document: string;
}
export interface api_fun {
    name: string;
    Range: Range;
}
export interface class_cache {
    kind: string;
    data: cache;
}
export interface class_data {
    location: Location,
    name: string
}
//also variable data
export interface const_data {
    location: Location,
    value: string,
    document: string
}
export interface cache_info {
    //filename
    name?: string;
    kind: string;
    //class name
    claName?: string;
}
export interface cache {
    funs: Map<string, fun>;
    classData: class_data;
    variable: Map<string, const_data>;
}
export interface api_parse extends cache {
    consts: Map<string, Map<string, const_data>>;
}
export interface Settings {
	CI: CI;
}

export interface CI {
	library: Array<string> | object;
	model: Array<string> | object;
	other: Array<string>;
	system:string;
	app: string;
	ignoreSymbols: boolean;
	viewFilesFormat: string;
}
export class loader {
    //root of the workspace
    static root: URI = null;
    static re = {
        loader: /\$this->load->(.+?)\((.+?)\);/g,
        isStatic: /([a-zA-Z0-9_]*)::([a-zA-Z0-9_\$]*)$/
    };
    logger = null;
    settings: CI = null;
    cache = {
        //include functions and class data
        system: new Map<string, cache>(),
        model: new Map<string, cache>(),
        // helper:new Map<string,Map<string,fun>>(),
        library: new Map<string, cache>()
    };
    //include const and static
    const = new Map<string, Map<string, const_data>>();
    //key is display name. value is relate file's path.
    alias = new Map<string, string>();
    //use for quick search and display
    display = new Map<string, string>();
    //use for refresh cache when file changed
    cached_info = new Map<string, cache_info>();
    constructor() {
        this.cache.system.set('input', null);
        this.cache.system.set('db', null);
        this.cache.system.set('load', null);
        this.cache.system.set('config', null);
    }
    allFun(document: TextDocument): SymbolInformation[] {
        let uri = document.uri;
        let content = document.getText();
        let res: SymbolInformation[] = [];
        var data = parse.parse.functions(content);
        for (var i of data) {
            res.push({
                name: i.name, kind: SymbolKind.Method,
                location: {
                    uri: uri,
                    range: i.Range
                }
            })
        }
        return res;
    }

    complete(textDocumentPosition: TextDocumentPositionParams, text: string): CompletionItem[] {
        let words = parse.parse.getWords(text, textDocumentPosition.position);
        let res: CompletionItem[] = [];
        let isStatic = loader.re.isStatic.exec(words);
        if (isStatic) {
            var claName = isStatic[1];
            if (claName.toLowerCase() == 'self') {
                var claInfo = this.cached_info.get(textDocumentPosition.textDocument.uri);
                if (!claInfo) {
                    this.parseConst(text, textDocumentPosition.textDocument.uri);
                    claInfo = this.cached_info.get(textDocumentPosition.textDocument.uri);
                    if (!claInfo) return res;
                }
                claName = claInfo.claName;
            }
            let constData = this.getConstByClaname(claName);
            for (var [key, val] of constData) {
                res.push({ label: key, kind: CompletionItemKind.Field, detail: val.value, documentation: val.document });
            }
            return res;
        }
        let chain = words.split('->');
        //find the class
        if (chain.length == 1) return res;
        let token: string = chain[chain.length - 2];
        if (token.indexOf(')') >= 0) {
            if (chain[1] == 'db') {
                token = token.slice(0, -2);
                if (!this.cache.system.get('db')) this.parseFile('db', 'system');
                var fun = this.cache.system.get('db').funs.get(token);
                if (fun) {
                    token = (fun.ret == 'DB_query_builder') ? 'db' : fun.ret;
                } else return res;//no chain in DB_result
            } else return res;//now we only search db for method chaining
        }
        if (token.endsWith('$this')||token=='CI'||token=='$CI') {
            let l: any;
            let t: string;
            l = this.cache.system.keys();
            for (t of l) {
                if (t != 'CI_DB_result')
                    res.push({ label: t, kind: CompletionItemKind.Class, detail: 'system class', insertText: t + '-' });
            }
            for (var [name, type] of this.display) {
                res.push({
                    label: name, kind: CompletionItemKind.Class,
                    insertText: name + '-',
                    detail: type + ' ' + (this.alias.has(name) ? this.alias.get(name) : name)
                });
            }
            if (!this.settings.ignoreSymbols && token.endsWith('$this')) {
                l = parse.parse.functions(text);
                var item: api_fun;
                for (item of l) {
                    if (!item.name.startsWith('__'))
                        res.push({
                            label: item.name, kind: CompletionItemKind.Method,
                            insertText: item.name + '($1)$0',
                            insertTextFormat : InsertTextFormat.Snippet,
                            detail: 'method ' + item.name
                        });
                }
            }
        } else {
            if (this.alias.has(token)){
                token=this.alias.get(token)
            }else{
                token=this.cache.system.has(token)?token: parse.parse.modFirst(token)
            }
            var info:cache=null, kind:string;
            for (kind in this.cache) {
                if (this.cache[kind].has(token)) {
                    var t = this.cache[kind].get(token);
                    if (t === null) {
                        try {
                            this.parseFile(token, kind);
                        } catch (error) {
                            return res;
                        }
                    }
                    info = this.cache[kind].get(token);
                    break;
                }
            }
            if (info === null) return res;
            try {
                info.funs.forEach((v,k)=>{
                    res.push({
                        label: k, kind: CompletionItemKind.Method, detail: `${kind} ${token}`,documentation:v.document,
                        insertText: k + '($1)$0',
                        insertTextFormat : InsertTextFormat.Snippet,
                    });
                })
                info.variable.forEach((v,k)=>{
                    res.push({
                        label: k, kind: CompletionItemKind.Variable, detail: `${kind} ${token}`,documentation:v.document
                    });
                })
            } catch (error) {
                this.logger.log('Hello! You have found a BUG in complete! It would be very helpful if you can add a issue in github!')
                this.logger.log('Add issue here: https://github.com/smallp/vscode-ci/issues/new')
                this.logger.log('Here is the main content. You can just keep the main content when you submit.')
                this.logger.log(words)
                this.logger.log(JSON.stringify([...this.cache[kind]]))
                return []
            }
        }
        return res;
    }

    signature(textDocumentPosition: TextDocumentPositionParams, text: string): SignatureHelp {
        let words = parse.parse.getWords(text, textDocumentPosition.position, parse.wordsType.signature);
        var arr = words.split(parse.parse.paramDeli);
        words = arr.shift();
        let params = arr.join('');
        var t = parse.parse.cleanParam(params);
        if (t.complete == parse.completeType.over) return null;
        else params = t.param;
        arr = words.split('->');
        if (arr.length<3) return null;
        let claName = arr[1];
        if (claName == 'CI') {
            if (arr.length==3) return null;
            claName = arr[2]
        }
        let method = arr.pop();
        let toRet: SignatureHelp = {
            signatures: [],
            activeSignature: 0,
            activeParameter: params.split(',').length - 1
        };
        method = method.substring(0, method.indexOf('('));
        let data: fun;
        let cla = this.getClassInfo(claName);
        try {
            data = cla && cla.data.funs.get(method);
            if (!data) return null;
        } catch (error) {
            this.logger.log('Hello! You have found a BUG in signature! It would be very helpful if you can add a issue in github!')
            this.logger.log('Add issue here: https://github.com/smallp/vscode-ci/issues/new')
            this.logger.log('Here is the main content. You can just keep the main content when you submit.')
            this.logger.log(words)
            this.logger.log(JSON.stringify(cla))
            return toRet
        }
        var lable = method + '(';
        arr = [];
        for (var item of data.param) {
            arr.push(item.label as string);
        }
        lable += arr.join(',') + ')';
        let signature = { label: lable, parameters: data.param };
        toRet.signatures = [signature];
        return toRet;
    }

    definition(textDocumentPosition: TextDocumentPositionParams, text: string): Location {
        let words = parse.parse.getWords(text, textDocumentPosition.position, parse.wordsType.half);
        let isStatic = loader.re.isStatic.exec(words);
        if (isStatic) {
            var claName = isStatic[1];
            if (claName.toLowerCase() == 'self') {
                var claInfo = this.cached_info.get(textDocumentPosition.textDocument.uri);
                if (!claInfo) {
                    this.parseConst(text, textDocumentPosition.textDocument.uri);
                    claInfo = this.cached_info.get(textDocumentPosition.textDocument.uri);
                    if (!claInfo) return null;
                }
                claName = claInfo.claName;
            }
            let constData = this.getConstByClaname(claName);
            if (constData.has(isStatic[2])) {
                var data = constData.get(isStatic[2]);
                return data.location;
            }
            return null;
        }
        let arr = words.split('->');
        if (arr.length == 1 || (arr[0] != '$this' && arr[0] != '$CI'))
            return null;
        if (arr[1] == 'CI') arr.splice(1, 1)
        var claName = arr[1];
        if (arr.length == 2) {
            let data = this.getClassInfo(claName);
            try {
                if (data && data.data.classData) {
                    return data.data.classData.location;
                } else {
                    //not a function or use third extension
                    if (!claName.endsWith('()') || this.settings.ignoreSymbols) return null;
                    let fun = claName.slice(0, -2);
                    let funs = parse.parse.functions(text);
                    for (var x of funs) {
                        if (x.name == fun) {
                            return { uri: textDocumentPosition.textDocument.uri, range: x.Range };
                        }
                    }
                }
            } catch (error) {
                this.logger.log('Hello! You have found a BUG in definition! It would be very helpful if you can add a issue in github!')
                this.logger.log('Add issue here: https://github.com/smallp/vscode-ci/issues/new')
                this.logger.log('Here is the main content. You can just keep the main content when you submit.')
                this.logger.log(words)
                this.logger.log(JSON.stringify(data))
                return null
            }
        } else if (arr.length == 3) {
            let data = this.getClassInfo(claName);
            if (!data) return null;
            let token = arr[2];
            if (token.endsWith('()'))
                token = token.slice(0, -2);
            try {
                let info = data.data.funs.get(token) || data.data.variable.get(token)
                return info ? info.location : null;
            } catch (error) {
                this.logger.log('Hello! You have found a BUG in definition! It would be very helpful if you can add a issue in github!')
                this.logger.log('Add issue here: https://github.com/smallp/vscode-ci/issues/new')
                this.logger.log('Here is the main content. You can just keep the main content when you submit.')
                this.logger.log(words)
                this.logger.log(JSON.stringify(data))
                return null
            }
        } else {
            if (claName != 'db') return null;
            let method = arr.pop();
            if (!method.endsWith('()')) return null;
            method = method.slice(0, -2);
            let data = this.getClassInfo('db');
            let info: fun = data.data.funs.get(method) || this.cache.system.get('CI_DB_result').funs.get(method);
            return info ? info.location : null;
        }
        return null;
    }

    hover(textDocumentPosition: TextDocumentPositionParams, text: string): Hover {
        let words = parse.parse.getWords(text, textDocumentPosition.position, parse.wordsType.half);
        words = words.split(parse.parse.paramDeli)[0];
        let arr = words.split('->');
        if (arr[1]=='CI') arr.splice(1, 1)
        if (arr.length < 3) return null;
        let claName = arr[1];
        let method = arr.pop();
        method = method.substring(0, method.indexOf('('));
        let data: fun;
        let cla = this.getClassInfo(claName);
        try {
            data = cla && cla.data.funs.get(method);
            if (!data) return null;
        } catch (error) {
            this.logger.log('Hello! You have found a BUG in hover! It would be very helpful if you can add a issue in github!')
            this.logger.log('Add issue here: https://github.com/smallp/vscode-ci/issues/new')
            this.logger.log('Here is the main content. You can just keep the main content when you submit.')
            this.logger.log(words)
            this.logger.log(JSON.stringify(cla))
            return null
        }
        return { contents: data.document };
    }

    initModels(): void {
        //for alise or autoload
        let setting:object| string[] = [];
        if (this.settings!=null) setting=this.settings.model
        let path = `${loader.root.fsPath}/${this.settings.app}/models/`;
        this.cache.model = new Map<string, cache>();
        this._initModels(path, '');
        let index:string;
        for (index in setting){
            path=setting[index]
            this.parseFile(path,'model');
            if (!isNumber(index)){//alise by user
                this.alias.set(index,path)
                this.display.set(index,'model')
            }else if (path.indexOf('/')>0){
                //in sub folder, we need add alisa
                var filename=path.split('/').pop()
                this.alias.set(filename,path)
                this.display.set(filename,'model')
            }//in root folder, _initModels will do it
        }
    }

    _initModels(root: string, dir: string) {
        let path = root + dir;
        fs.readdir(path, (err, files)=>{
            if (err){
                console.log('read dir fail:'+path);
                return;
            }
            for (let file of files) {
                if (file.endsWith('.php')) {
                    file = dir + file.slice(0, -4);
                    this.cache.model.set(file, null);
                    if (dir == '') {
                        //add to display if it is in root folder
                        var name = parse.parse.modFirst(file, false);
                        this.display.set(name, 'model');
                    }
                } else if (!file.endsWith('html')) {
                    let info = fs.lstatSync(root + dir + file)
                    if (info.isDirectory())
                        this._initModels(root, dir + file + '/');
                }
            }
        });
    }

    //deal with $this->load
    parseLoader(content: string) {
        let match = null;
        while ((match = loader.re.loader.exec(content)) != null) {
            if (match[1] == 'model' || match[1] == 'library') {
                var a: Array<string> = match[2].split(',');
                let oriname: string = a[0].trim().slice(1, -1);
                let name:string = parse.parse.realPath(oriname);
                let alias: string;
                if (a.length == 1 && this.cache[match[1]].has(name)) continue;//no alias, has loaded
                if (match[1] == 'model') {
                    if (a.length > 1) {
                        //has alias
                        alias = a[1].trim().slice(1, -1);
                    } else {
                        alias = oriname.split('/').pop()
                    }
                } else {
                    if (a.length >= 3) {
                        alias = a.pop().trim();
                        if (alias.match(/^['"](.+?)['"]$/)) {
                            //has alias
                            alias = alias.slice(1, -1);
                        } else {
                            alias = oriname.split('/').pop()
                        }
                    } else {
                        alias = oriname.split('/').pop()
                    }
                }
                alias != name && this.alias.set(alias, name);
                this.display.set(alias, match[1]);
                if (!this.cache[match[1]].get(name)) {
                    this.parseFile(name, match[1]);
                }
            }
        }
    }

    //load file in setting-other
    loadOther(str: string) {
        let path = loader.root.fsPath + '/' + str;
        let content = ""
        try {
            content=fs.readFileSync(path,{encoding:'utf-8'});
        } catch (e) {
            return;
        }
        this.parseConst(content, parse.parse.path2uri(path));
    }

    parseConst(content: string, path: string) {
        var data = parse.parse.parseConst(content, path);
        data.forEach((v, k) => {
            this.const.set(k, v);
        });
        if (data.size > 0) {
            if (this.cached_info.has(path)) {
                var ori = this.cached_info.get(path);
                ori.claName = data.keys().next().value;
                this.cached_info.set(path, ori);
            } else this.cached_info.set(path, { kind: null, claName: data.keys().next().value });
        }
    }

    //parse file to collect info
    parseFile(name: string, kind: string): Map<string,fun> {
        let path = loader.root.fsPath;
        if (this.alias.has(name)) name = this.alias.get(name);
        let filePath =parse.parse.realPath(name) + '.php';
        switch (kind) {
            case 'system':
                if (name == 'db') {
                    //load DB_result
                    let retData = parse.parse.parseFile(`${path}/${this.settings.system}/database/DB_result.php`);
                    let qb_db = parse.parse.parseFile(`${path}/${this.settings.system}/database/drivers/mysql/mysql_result.php`).funs;
                    let db = retData.funs;
                    let classData = retData.classData;
                    qb_db.forEach((v, k) => {
                        db.set(k, v);
                    });
                    this.cache[kind].set('CI_DB_result', {
                        funs: db,
                        classData: classData,
                        variable:new Map()
                    });
                    //load DB_query_builder + DB_driver, with mysql_driver
                    db = parse.parse.parseFile(`${path}/${this.settings.system}/database/DB_driver.php`).funs;
                    retData = parse.parse.parseFile(`${path}/${this.settings.system}/database/DB_query_builder.php`);
                    qb_db = retData.funs;
                    classData = retData.classData;
                    qb_db.forEach((v, k) => {
                        db.set(k, v);
                    });
                    qb_db = parse.parse.parseFile(`${path}/${this.settings.system}/database/drivers/mysql/mysql_driver.php`).funs;
                    qb_db.forEach((v, k) => {
                        db.set(k, v);
                    });
                    this.cache[kind].set(name, {
                        funs: db,
                        classData: classData,
                        variable:new Map()
                    });
                    //for method chaining
                    this.alias.set('CI_DB_query_builder', 'db');
                    return db;
                } else if (name == 'load') {
                    path += `/${this.settings.system}/core/Loader.php`;
                } else path += `/${this.settings.system}/core/${filePath}`;
                break;
            case 'model':
                path += `/${this.settings.app}/models/${filePath}`;
                break;
            case 'library':
                try {
                    fs.accessSync(`${path}/${this.settings.system}/libraries/${filePath}`);
                    path += `/${this.settings.system}/libraries/${filePath}`;
                } catch (error) {
                    path += `/${this.settings.app}/libraries/${filePath}`;
                }
                break;
            default:
                return new Map;
        }
        let data = parse.parse.parseFile(path);
        if (!data) {
            //文件未找到，不缓存，直接返回
            return new Map()
        }
        data.consts.forEach((v, k) => {
            this.const.set(k, v);
        });
        delete data.consts;
        this.cache[kind].set(name, data);
        path = parse.parse.path2uri(path);
        if (this.cached_info.has(path)) {
            var ori = this.cached_info.get(path);
            ori.kind = kind; ori.name = name;
            this.cached_info.set(path, ori);
        } else this.cached_info.set(path, { kind: kind, claName: data.classData.name,name:name });
        return data.funs;
    }

    getClassInfo(claName: string): class_cache {
        if (this.alias.has(claName)) claName = this.alias.get(claName);
        else if (!this.cache.system.has(claName)){
            claName=parse.parse.modFirst(claName)
        }
        for (var kind in this.cache) {
            if (this.cache[kind].has(claName)) {
                var claData = this.cache[kind].get(claName);
                if (!claData) this.parseFile(claName, kind);
                claData = this.cache[kind].get(claName);
                return claData ? {
                    data: claData,
                    kind: kind
                } : null;
            }
        }
        return null;
    }

    getConstByClaname(className: string): Map<string, const_data> {
        if (this.const.has(className)) return this.const.get(className);
        else {
            //maybe the class is model. It has not been parsed yet
            for (var kind in this.cache) {
                if (this.cache[kind].has(className)) {
                    var claData: cache = this.cache[kind].get(className);
                    if (!claData) this.parseFile(className, kind);
                    return this.const.has(className) ? this.const.get(className) : new Map();
                }
            }
            return new Map();
        }
    }

    documentLinks(document: TextDocument) {
        let content = document.getText();
        let res: DocumentLink[] = [];
        let links = parse.parse.parseView(content);

        let ext = this.settings.viewFilesFormat.trim().split('.').pop();
        if (ext) ext = `.${ext}`;

        for (let link of links) {
            let target = URI.parse(`${loader.root}/${this.settings.app}/views/${link.uri}${ext}`);
            let range = Range.create(
                document.positionAt(link.range.start),
                document.positionAt(link.range.end)
            );
            res.push(DocumentLink.create(range, target.path))
        }
        return res;
    }
}