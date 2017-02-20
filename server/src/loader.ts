import {
    SymbolInformation,SymbolKind,Location,CompletionItemKind,
    TextDocumentPositionParams,CompletionItem,SignatureHelp,
    ParameterInformation
} from 'vscode-languageserver';
import * as fs from 'fs';
interface fun{
    param:ParameterInformation[];
    location:Location;
    ret:string;
    document:string;
}
// interface variable{
//     location:Location;
//     document:string;
// }
interface class_cache{
    kind:string;
    data:cache;
}
interface class_data{
    location:Location,
    name:string
}
interface const_data{
    location: Location,
    value:string,
    document:string
}
interface cache_info{
    name:string;
    kind:string;
}
interface cache{
    funs:Map<string,fun>;
    classData:class_data;
}
export class loader{
    //root of the workspace
    root:string='';
    re={
        fun:/function (.+?)\((.*?)\)/g,
        loader:/\$this->load->(.+?)\((.+?)\);/g,
        method:/->[a-zA-Z0-9_]*$/,
        endOfWords:/\)\s*[=|!|\|\||&&|<|>]/,
        completeWord:/^[a-zA-Z0-9_]*(\()?/,
        const: /const ([a-zA-Z0-9_]*)=(.*);/ig,
        static: /static \$([a-zA-Z0-9_]*)=(.*);/ig,
        isStatic:/([a-zA-Z0-9_]*)::([a-zA-Z0-9_\$]*)$/,
        class: /class (.*?)[ {]/ig
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
        let match=null;
        while ((match = this.re.fun.exec(content)) != null){
            var lines=content.substr(0,match.index).split('\n');
            var line=lines.length-1;
            var startC=lines.pop().length-1;
            res.push({name:match[1],kind:SymbolKind.Method,
                location:{uri:uri,
                    range:{
                        start:{line:line,character:startC},
                        end:{line:line,character:startC+match[0].length-1},
                    }
                }
            });
        }
        return res;
    }

    complete(textDocumentPosition: TextDocumentPositionParams,text:string): CompletionItem[]{
        let words = this._allWords(text, textDocumentPosition.position);
        let res = [];
        let isStatic=this.re.isStatic.exec(words);
        if (isStatic){
            let constData=this.getConstByClaname(isStatic[1]);
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
                    res.push({label:t,kind:CompletionItemKind.Method,detail:`${kind} ${token} ${t}`});
                }
            }
        }
        return res;
    }

    signature(textDocumentPosition: TextDocumentPositionParams,text:string): SignatureHelp{
        let words=this._allWords(text,textDocumentPosition.position);
        let arr=words.split('->');
        let claName=arr[1];
        claName=this.alias.has(claName)?this.alias.get(claName):claName;
        let method=arr.pop();
        let toRet:SignatureHelp={
            signatures:[],
            activeSignature:0,
            activeParameter:0
        };
        var indexParam=method.indexOf('(');
        if (indexParam>=0){
            var param=method.substr(indexParam);
            method=method.substring(0,indexParam);
            let activeParam=0,lTokenNum=0;
            for (var index = 0,size=param.length; index < size; index++) {
                var c=param[index];
                if (c==','&&lTokenNum==0){
                    activeParam++;
                }else if (c=='['){
                    lTokenNum++;
                }else if (c==']'){
                    lTokenNum--;
                }
            }
            toRet.activeParameter=activeParam;
        }else return null;
        let data:fun;
        let cla=this.getClassInfo(claName);
        data=cla&&cla.data.funs.get(method);
        if (!data) return null;
        var lable=method+'(';
        var params=[];
        for(var item of data.param){
            params.push(item.label);
        }
        lable+=params.join(',')+')';
        let signature={label:lable,parameters:data.param};
        toRet.signatures=[signature];
        return toRet;
    }

    definition(textDocumentPosition: TextDocumentPositionParams,text:string):Location{
        let words=this._allWords(text,textDocumentPosition.position,false);
        let isStatic = this.re.isStatic.exec(words);
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
            }else return null;
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

    initModels(root:string):void{
        this.root=root;
        let path=root+'/application/models/';
        this._initModels(path,'');
    }

    _initModels(root:string,dir:string){
        let that=this;
        let path=root+dir;
        fs.readdir(path,function(err,files){
            if (err) return ;
            let file:string;
            for(file of files){
                if (file.endsWith('.php')){
                    file=file.slice(0,-4);
                    that.cache.model.set((dir+file).toLowerCase(),null);
                }else if (!file.endsWith('html')){
                    that._initModels(root,dir+file+'/');
                }
            }
        });
    }

    //deal with $this->load
    parseLoader(content:string){
        let match=null;
        while ((match = this.re.loader.exec(content)) != null){
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
        let path=this.root+'/'+str;
        this._parseFile(path);
    }

    //parse file to collect info
    parseFile(name:string,kind:string):string[] {
        let path=this.root;
        let dir=name.split('/');
        let fileName=dir.pop();
        fileName=fileName[0].toUpperCase()+fileName.substring(1);
        dir.push(fileName);
        let filePath=dir.join('/')+'.php';
        switch (kind) {
            case 'system':
                if (name=='db'){
                    //load DB_result
                    let retData=this._parseFile(path+'/system/database/DB_result.php');
                    let qb_db=this._parseFile(path+'/system/database/drivers/mysql/mysql_result.php').funs;
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
                    db=this._parseFile(path+'/system/database/DB_driver.php').funs;
                    retData=this._parseFile(path+'/system/database/DB_query_builder.php');
                    qb_db=retData.funs;
                    classData=retData.classData;
                    qb_db.forEach((v,k)=>{
                        db.set(k,v);
                    });
                    qb_db=this._parseFile(path+'/system/database/drivers/mysql/mysql_driver.php').funs;
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
        let data=this._parseFile(path);
        this.cache[kind].set(name,data);
        this.cached_info.set(this._path2uri(path),{kind:kind,name:name});
        return Array.from(data.funs.keys());
    }

    _parseFile(path:string):cache{
        let content=fs.readFileSync(path,{encoding:'utf-8'});
        let funs=new Map();
        let match=null;
        let uri = this._path2uri(path);
        //get funs info
        while ((match = this.re.fun.exec(content)) != null){
            //ignore private method
            if (match[1].startsWith('_')) continue;
            let data:fun={param:null,
                ret:'',
                document:'',
                location:{
                    uri: uri,
                    range:null
                }
            };
            //set location
            var lines=content.substr(0,match.index).split('\n');
            var line=lines.length-1;
            var startC=lines.pop().length-1;
            data.location.range={
                start:{line:line,character:startC+10},
                end:{line:line,character:startC+match[0].length-1},
            }
            //set params
            match[2]=match[2].trim();
            data.param=match[2]==''?[]:match[2].split(',').map((v)=>{
                return {label:v,document:''};
            });
            var str=lines[line-1];
            if (str.indexOf('*/')>=0){//has JavaDoc
                var lineNum=line-2;
                var params=[];
                while (!(str=lines[lineNum--].trim()).startsWith('/*')&&str.startsWith('*')&&lineNum>0) {
                    str=str.substring(1).trim();
                    if (str.startsWith('@')){
                        if (str.startsWith('@return')){
                            var ret=str.substr(7);
                            if (ret.indexOf('|')>=0) ret=ret.split('|').shift().trim();
                            else ret=ret.trim();
                            data.ret=ret;
                        }else if (str.startsWith('@param')){
                            params.unshift(str.substr(6).trim());
                        }
                    }else{
                        if (str.length>0){
                            data.document=str+'\n'+data.document;
                        }
                    }
                }
                //set param document
                for (var index =0,limit= Math.min(params.length,data.param.length); index < limit; index++) {
                    data.param[index].documentation=params[index];
                }
            }
            funs.set(match[1],data);
        }
        //get class name
        let classData: class_data = null;
        this.re.class.lastIndex=0;
        while (match = this.re.class.exec(content)) {
            let str = content.substr(0, match.index);
            let arr = str.split('\n');
            var suff = arr.pop();
            if (suff.length>0&&!suff.endsWith(' ')) continue;//such as $class
            else suff=suff.trim();
            if (suff.startsWith('*') || suff.startsWith('/'))
                continue;
            let line = arr.length;//has poped
            let character = arr.pop().length;
            classData = {
                name: match[1],
                location: {
                    uri: uri,
                    range: {
                        start: {
                            line: line, character: character
                        },
                        end: {
                            line: line, character: character + match[0].length
                        }
                    }
                }
            }
            this._parseConst(content.substr(match.index),classData);
            break;
        }
        return { funs: funs, classData: classData};
    }

    //get const and static
    _parseConst(content:string,classData:class_data){
        let con = new Map<string, const_data>();
        let match = null;
        var arr = content.split('\n');
        let suffLine=classData.location.range.start.line;
        while ((match = this.re.const.exec(content)) != null) {
            var lines = content.substr(0, match.index).split('\n');
            var line = lines.length - 1;
            var suffLength = lines.pop().length;
            var str = arr[line].trim();
            let item: const_data = {
                location: {
                    uri: classData.location.uri,
                    range: {
                        start: { line: suffLine+line, character: suffLength },
                        end: { line: suffLine +line, character: suffLength + str.length }
                    }
                },
                value: match[2],
                document: str == match[0] ? null : str.substr(match[0].length + 2)
            }
            con.set(match[1], item);
        }
        while ((match = this.re.static.exec(content)) != null) {
            var lines = content.substr(0, match.index).split('\n');
            var line = lines.length - 1;
            var suffLength = lines.pop().length;
            var str = arr[line].trim();
            let item: const_data = {
                location: {
                    uri: classData.location.uri,
                    range: {
                        start: { line: suffLine + line, character: suffLength },
                        end: { line: suffLine + line, character: suffLength + str.length }
                    }
                },
                value: match[2],
                document: str == match[0] ? null : str.substr(match[0].length + 2)
            }
            con.set('$' + match[1], item);
        }
        this.const.set(classData.name, con);
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

    _path2uri(path:string):string{
        if (path[0] !== '/') path = '/' + encodeURI(path.replace(/\\/g, '/')).replace(':', '%3A');
        else path=encodeURI(path);
        return `file://${path}`;
    }

    _allWords(text:string,position,completeToken=true):string{
        let lines=text.split('\n');
        let line=lines[position.line];
        let cha:string;
        if (completeToken){
            cha=line.substr(0,position.character);
        }else{
            var addition=line.substr(position.character).match(this.re.completeWord)[0];
            cha=line.substr(0,position.character)+addition;
        }
        let strConst=this.re.isStatic.exec(cha);
        if (strConst!=null) return strConst[0];
        cha=cha.trim();//.replace(/^[\)\}\]]*/,'');
        var lineNum=position.line;
        while (!cha.match(/^[a-zA-Z\$]/)&&lineNum>0) {
            cha=lines[--lineNum].trim()+cha;
        }
        var $this=cha.indexOf('$this');
        if ($this<0) return '';
        else cha=cha.substr($this);
        let total='';
        for (var index = 0,j=cha.length; index < j; index++) {
            if (cha[index]!='('||!total.match(this.re.method)) total+=cha[index];
            else{
                var end=cha.indexOf(')->',index);
                if (end<0){
                    var separator=cha.substr(index).match(this.re.endOfWords);
                    if (separator){
                        //the real sentense is in the next
                        total='';
                        cha=cha.substr(end+separator.length);
                        continue;
                    }else{
                        //it end with ');'
                        total+='()';
                        break;
                    }
                }else{
                    index=end;
                    total+='()';
                }
            }
        }
        let arr=total.split('->');
        for (index = arr.length-1; index >=0; index--) {
            if (arr[index].endsWith('$this')){
                arr=arr.slice(index);
                arr[0]=arr[0].substr(arr[0].indexOf('$this'));
                return arr.join('->');
            }
        }
        return '';
    }
}