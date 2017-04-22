import {
    SymbolInformation,SymbolKind,Location,CompletionItemKind,
    TextDocumentPositionParams,CompletionItem,SignatureHelp,
    ParameterInformation
} from 'vscode-languageserver';
import * as fs from 'fs';
import * as c from './control';
export class parse{
    static re={
        fun:/function (.+?)\((.*?)\)/g,
        method:/->[a-zA-Z0-9_]*$/,
        endOfWords:/\)\s*[=|!|\|\||&&|<|>]/,
        completeWord:/^[a-zA-Z0-9_]*(\()?/,
        const: /const ([a-zA-Z0-9_]*)=(.*);/ig,
        static: /static \$([a-zA-Z0-9_]*)=(.*);/ig,
        class: /class (.*?)[ {]/ig
    };

    static parseFile(path:string):c.api_parse{
        let content=fs.readFileSync(path,{encoding:'utf-8'});
        let funs=new Map();
        let match=null;
        let uri = this.path2uri(path);
        //get funs info
        while ((match = this.re.fun.exec(content)) != null){
            //ignore private method
            if (match[1].startsWith('_')) continue;
            let data:c.fun={param:null,
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
        let classData: c.class_data = null;
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
        }
        let consts=this.parseConst(content,path);
        //get class name
        return { funs: funs, classData: classData,consts:consts};
    }

    //get const and static
    static parseConst(content:string,uri:string){
        let classData: c.class_data = null,preClassD: c.class_data=null;
        let resConst=new Map<string, Map<string, c.const_data>>();
        this.re.class.lastIndex=0;
        let match=null;
        let class_begin=0;
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
            if (class_begin>0){
                var data=this._parseConst(content.substring(class_begin,match.index),preClassD);
                resConst.set(preClassD.name, data);
                preClassD=classData;
            }
            class_begin=match.index;
        }
        //muti-class support
        if (classData!=null){
            var data=this._parseConst(content.substr(class_begin),classData);
            resConst.set(classData.name, data);
        }
        return resConst;
    }

    static _parseConst(content:string,classData: c.class_data){
        let con = new Map<string, c.const_data>();
        let match = null;
        var arr = content.split('\n');
        let suffLine=classData.location.range.start.line;
        while ((match = this.re.const.exec(content)) != null) {
            var lines = content.substr(0, match.index).split('\n');
            var line = lines.length - 1;
            var suffLength = lines.pop().length;
            var str = arr[line].trim();
            let item: c.const_data = {
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
            let item: c.const_data = {
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
        return con;
    }

    static functions(content:string):c.api_fun[] {
        let res:c.api_fun[]=[];
        let match=null;
        while ((match = this.re.fun.exec(content)) != null){
            var lines=content.substr(0,match.index).split('\n');
            var line=lines.length-1;
            var startC=lines.pop().length-1;
            res.push({
                name:match[1],
                Range:{
                        start:{line:line,character:startC},
                        end:{line:line,character:startC+match[0].length-1},
                    }
            });
        }
        return res;
    }

    static getWords(text:string,position,completeToken=true):string{
        let lines=text.split('\n');
        let line=lines[position.line];
        let cha:string;
        if (completeToken){
            cha=line.substr(0,position.character);
        }else{
            var addition=line.substr(position.character).match(this.re.completeWord)[0];
            cha=line.substr(0,position.character)+addition;
        }
        let strConst=c.loader.re.isStatic.exec(cha);
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

    static path2uri(path:string):string{
        if (path[0] !== '/') path = '/' + encodeURI(path.replace(/\\/g, '/')).replace(':', '%3A');
        else path=encodeURI(path);
        return `file://${path}`;
    }
}