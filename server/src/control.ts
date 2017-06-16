import {
    SymbolInformation,SymbolKind,Location,CompletionItemKind,
    TextDocumentPositionParams,CompletionItem,SignatureHelp,
    ParameterInformation,Range,Hover
} from 'vscode-languageserver';
import * as fs from 'fs';
import * as parse from './parse';
export interface fun{
    param:ParameterInformation[];
    location:Location;
    ret:string;
    document:string;
}
export interface api_fun{
    name:string;
    Range:Range;
}
// interface variable{
//     location:Location;
//     document:string;
// }
export interface class_cache{
    kind:string;
    data:cache;
}
export interface class_data{
    location:Location,
    name:string
}
export interface const_data{
    location: Location,
    value:string,
    document:string
}
export interface cache_info{
    name?:string;
    kind:string;
    claName?:string;
}
export interface cache{
    funs:Map<string,fun>;
    classData:class_data;
}
export interface api_parse{
    funs:Map<string,fun>;
    classData:class_data;
    consts:Map<string, Map<string, const_data>>;
}
export class loader{
    //root of the workspace
    static root:string='';
    static re={
        loader:/\$this->load->(.+?)\((.+?)\);/g,
        isStatic:/([a-zA-Z0-9_]*)::([a-zA-Z0-9_\$]*)$/
    };
    cache={
        system:new Map<string,cache>(),
        model:new Map<string,cache>(),
        // helper:new Map<string,Map<string,fun>>(),
        library:new Map<string,cache>()
    };
    //include const and static
    const = new Map<string, Map<string, const_data>>();
    //use for class alias
    alias=new Map<string,string>();
    //use for refresh cache when file changed
    cached_info=new Map<string,cache_info>();
    constructor(){
        this.cache.system.set('input',null);
        this.cache.system.set('db',null);
        this.cache.system.set('load',null);
    }
    allFun(document):SymbolInformation[]{
        let uri=document.uri;
        let content=document.getText();
        let res:SymbolInformation[]=[];
        var data=parse.parse.functions(content);
        for (var i of data){
            res.push({
                name:i.name,kind:SymbolKind.Method,
                location:{uri:uri,
                    range:i.Range
                }
            })
        }
        return res;
    }

    complete(textDocumentPosition: TextDocumentPositionParams,text:string): CompletionItem[]{
        let words = parse.parse.getWords(text, textDocumentPosition.position);
        let res = [];
        let isStatic=loader.re.isStatic.exec(words);
        if (isStatic){
            var claName=isStatic[1];
            if (claName.toLowerCase()=='self'){
                var claInfo=this.cached_info.get(textDocumentPosition.textDocument.uri);
                if (!claInfo){
                    this.parseConst(text,textDocumentPosition.textDocument.uri);
                    claInfo=this.cached_info.get(textDocumentPosition.textDocument.uri);
                    if (!claInfo) return res;
                }
                claName=claInfo.claName;
            }
            let constData=this.getConstByClaname(claName);
            for (var [key,val] of constData){
                res.push({ label: key, kind: CompletionItemKind.Field, detail: val.value, documentation: val.document });
            }
            return res;
        }
        let chain=words.split('->');
        if (chain.length==1) return res;
        let token:string=chain[chain.length-2];
        if (token.indexOf(')')>=0){
            if (chain[1]=='db'){
                token=token.slice(0,-2);
                if (!this.cache.system.get('db')) this.parseFile('db','system');
                var fun=this.cache.system.get('db').funs.get(token);
                if (fun){
                    token=(fun.ret=='DB_query_builder')?'db':fun.ret;
                }else return res;//no chain in DB_result
            }else return res;//now we only search db for method chaining
        }
        if (token.endsWith('$this')){
            let l;
            let t:string;
            l=this.cache.system.keys();
            for(t of l){
                if (t!='CI_DB_result')
                res.push({label:t,kind:CompletionItemKind.Class,detail:'system class',data:textDocumentPosition});
            }
            l=this.cache.model.keys();
            for(t of l){
                if (t.indexOf('/')<0)
                    res.push({
                        label: t, kind: CompletionItemKind.Class, data: textDocumentPosition,
                        detail:'model '+(this.alias.has(t)?this.alias.get(t):t)});
            }
            l=this.cache.library.keys();
            for(t of l){
                if (t.indexOf('/')<0)
                    res.push({
                        label: t, kind: CompletionItemKind.Class, data: textDocumentPosition,
                        detail:'library '+(this.alias.has(t)?this.alias.get(t):t)});
            }
            l=parse.parse.functions(text);
            var item:api_fun;
            for(item of l){
                if (!item.name.startsWith('__'))
                res.push({
                    label: item.name, kind: CompletionItemKind.Method, data: textDocumentPosition,
                    detail:'method '+item.name});
            }
        }else{
            token=this.alias.has(token)?this.alias.get(token):token;
            var funs,kind;
            for(kind in this.cache){
                if (this.cache[kind].has(token)){
                    funs=this.cache[kind].get(token);
                    if (funs===null){
                        try {
                            funs=this.parseFile(token,kind);
                        } catch (error) {
                            return res;
                        }
                    } else funs = funs.funs.keys();
                    break;
                }
            }
            if (typeof funs=='undefined') return res;
            else{
                let t:string;
                for(t of funs){
                    res.push({label:t,kind:CompletionItemKind.Method,detail:`${kind} ${token}`});
                }
            }
        }
        return res;
    }

    signature(textDocumentPosition: TextDocumentPositionParams,text:string): SignatureHelp{
        let words=parse.parse.getWords(text,textDocumentPosition.position,parse.wordsType.signature);
        var arr=words.split(parse.parse.paramDeli);
        words=arr.shift();
        let params=arr.join('');
        var t=parse.parse.cleanParam(params);
        if (t.complete==parse.completeType.over) return null;
        else params=t.param;
        arr=words.split('->');
        let claName=arr[1];
        claName=this.alias.has(claName)?this.alias.get(claName):claName;
        let method=arr.pop();
        let toRet:SignatureHelp={
            signatures:[],
            activeSignature:0,
            activeParameter:params.split(',').length-1
        };
        method=method.substring(0,method.indexOf('('));
        let data:fun;
        let cla=this.getClassInfo(claName);
        data=cla&&cla.data.funs.get(method);
        if (!data) return null;
        var lable=method+'(';
        arr=[];
        for(var item of data.param){
            arr.push(item.label);
        }
        lable+=arr.join(',')+')';
        let signature={label:lable,parameters:data.param};
        toRet.signatures=[signature];
        return toRet;
    }

    definition(textDocumentPosition: TextDocumentPositionParams,text:string):Location{
        let words=parse.parse.getWords(text,textDocumentPosition.position,parse.wordsType.half);
        let isStatic = loader.re.isStatic.exec(words);
        if (isStatic) {
            let constData = this.getConstByClaname(isStatic[1]);
            if (constData.has(isStatic[2])){
                var data=constData.get(isStatic[2]);
                return data.location;
            }
        }
        let arr=words.split('->');
        if (arr.length==1||arr[0]!='$this')
            return null;
        else if (arr.length==2){
            let data=this.getClassInfo(arr[1]);
            if (data&&data.data.classData){
                return data.data.classData.location;
            }else{
                if (!arr[1].endsWith('()')) return null;
                let fun=arr[1].slice(0,-2);
                let funs=parse.parse.functions(text);
                for (var x of funs){
                    if (x.name==fun){
                        return {uri:textDocumentPosition.textDocument.uri,range:x.Range};
                    }
                }
            }
        }else if (arr.length==3){
            let data=this.getClassInfo(arr[1]);
            if (!data) return null;
            let token=arr[2];
            if (!token.endsWith('()')) return null;
            token=token.slice(0,-2);
            let info:fun=data.data.funs.get(token);
            return info?info.location:null;
        }else{
            if (arr[1]!='db') return null;
            let method=arr.pop();
            if (!method.endsWith('()')) return null;
            method=method.slice(0,-2);
            let data=this.getClassInfo('db');
            let info:fun=data.data.funs.get(method)||this.cache.system.get('CI_DB_result').funs.get(method);
            return info?info.location:null;
        }
    }

    hover(textDocumentPosition: TextDocumentPositionParams,text:string):Hover{
        let words=parse.parse.getWords(text,textDocumentPosition.position,parse.wordsType.half);
        words=words.split(parse.parse.paramDeli)[0];
        let arr=words.split('->');
        if (arr.length<3) return null;
        let claName=arr[1];
        claName=this.alias.has(claName)?this.alias.get(claName):claName;
        let method=arr.pop();
        method=method.substring(0,method.indexOf('('));
        let data:fun;
        let cla=this.getClassInfo(claName);
        data=cla&&cla.data.funs.get(method);
        if (!data) return null;
        return {contents:data.document};
    }

    initModels(root:string):void{
        loader.root=root;
        let path=root+'/application/models/';
        this._initModels(path,'');
    }

    _initModels(root:string,dir:string){
        let that=this;
        let path=root+dir;
        fs.readdir(path,function(err,files){
            if (err) return ;
            for(let file of files){
                if (file.endsWith('.php')){
                    file = (dir + file.slice(0, -4)).toLowerCase();
                    that.cache.model.set(file, null);
                    file = that._setAlise(file);
                    that.cache.model.set(file, null);
                }else if (!file.endsWith('html')){
                    that._initModels(root,dir+file+'/');
                }
            }
        });
    }

    //deal with $this->load
    parseLoader(content:string){
        let match=null;
        while ((match = loader.re.loader.exec(content)) != null){
            if (match[1]=='model'||match[1]=='library'){
                var a:Array<string>=match[2].split(',');
                let name:string=a[0].trim().slice(1,-1);
                if (a.length==1&&this.cache[match[1]].has(name)) continue;//no alias, has loaded
                if (match[1]=='model'){
                    if (a.length>1){
                        //has alias
                        var alias = a[1].trim().slice(1, -1).toLowerCase();
                        name = name.toLowerCase();
                        this.alias.set(alias,name);
                        this.cache[match[1]].set(alias,null);
                    }else{
                        name=this._setAlise(name);
                    }
                }else{
                    if (a.length>=3){
                        var alias=a.pop().trim();
                        if (alias.match(/^['"](.+?)['"]$/)){
                            //has alias
                            alias=alias.slice(1,-1).toLowerCase();
                            this.alias.set(alias,name);
                            this.cache[match[1]].set(alias,null);
                        }else{
                            name=this._setAlise(name);
                        }
                    }else{
                        name=this._setAlise(name);
                    }
                }
                if (!this.cache[match[1]].get(name)){
                    this.parseFile(name, match[1]);
                }
            }
        }
    }

    _setAlise(name:string):string{
        let _name=name;
        if (name.indexOf('/')>=0){
            //model is in a directory. alias the name
            _name=name.split('/').pop().toLowerCase();
            this.alias.set(_name,name);
        }else _name=name.toLowerCase();
        return _name;
    }

    //load file in setting-other
    loadOther(str:string){
        let path=loader.root+'/'+str;
        let content=fs.readFileSync(path,{encoding:'utf-8'});
        this.parseConst(content,parse.parse.path2uri(path));
    }

    parseConst(content:string,path:string){
        var data=parse.parse.parseConst(content,path);
        data.forEach((v,k)=>{
            this.const.set(k,v);
        });
        if (data.size>0){
            if (this.cached_info.has(path)){
                var ori=this.cached_info.get(path);
                ori.claName=data.keys().next().value;
                this.cached_info.set(path,ori);
            }else this.cached_info.set(path,{kind:null,claName:data.keys().next().value});
        }
    }

    //parse file to collect info
    parseFile(name:string,kind:string):string[] {
        let path=loader.root;
        if (this.alias.has(name)) name = this.alias.get(name);
        let dir=name.split('/');
        let fileName=dir.pop();
        fileName=fileName[0].toUpperCase()+fileName.substring(1);
        dir.push(fileName);
        let filePath=dir.join('/')+'.php';
        switch (kind) {
            case 'system':
                if (name=='db'){
                    //load DB_result
                    let retData=parse.parse.parseFile(path+'/system/database/DB_result.php');
                    let qb_db=parse.parse.parseFile(path+'/system/database/drivers/mysql/mysql_result.php').funs;
                    let db=retData.funs;
                    let classData=retData.classData;
                    qb_db.forEach((v,k)=>{
                        db.set(k,v);
                    });
                    this.cache[kind].set('CI_DB_result',{
                        funs:db,
                        classData: classData
                    });
                    //load DB_query_builder + DB_driver, with mysql_driver
                    db=parse.parse.parseFile(path+'/system/database/DB_driver.php').funs;
                    retData=parse.parse.parseFile(path+'/system/database/DB_query_builder.php');
                    qb_db=retData.funs;
                    classData=retData.classData;
                    qb_db.forEach((v,k)=>{
                        db.set(k,v);
                    });
                    qb_db=parse.parse.parseFile(path+'/system/database/drivers/mysql/mysql_driver.php').funs;
                    qb_db.forEach((v,k)=>{
                        db.set(k,v);
                    });
                    this.cache[kind].set(name,{
                        funs:db,
                        classData: classData
                    });
                    //for method chaining
                    this.alias.set('CI_DB_query_builder','db');
                    return Array.from(db.keys());
                }else if (name=='load'){
                    path+='/system/core/Loader.php';
                }else path+='/system/core/'+filePath;
                break;
            case 'model':
                path+='/application/models/'+filePath;
                break;
            case 'library':
                try {
                    fs.accessSync(path+'/system/libraries/'+filePath);
                    path+='/system/libraries/'+filePath;
                } catch (error) {
                    path+='/application/libraries/'+filePath;
                }
                break;
            default:
                return [];
        }
        let data=parse.parse.parseFile(path);
        this.cache[kind].set(name,data);
        path=parse.parse.path2uri(path);
        if (this.cached_info.has(path)){
            var ori=this.cached_info.get(path);
            ori.kind=kind;ori.name=name;
            this.cached_info.set(path,ori);
        }else this.cached_info.set(path,{kind:kind,name:name});
        return Array.from(data.funs.keys());
    }

    getClassInfo(claName:string):class_cache{
        if (this.alias.has(claName)) claName = this.alias.get(claName);
        for (var kind in this.cache){
            if (this.cache[kind].has(claName)){
                var claData=this.cache[kind].get(claName);
                if (!claData) this.parseFile(claName,kind);
                claData=this.cache[kind].get(claName);
                return claData?{
                    data:claData,
                    kind:kind
                }:null;
            }
        }
        return null;
    }

    getConstByClaname(className: string): Map<string, const_data>{
        return this.const.has(className) ? this.const.get(className) : new Map();
    }
}