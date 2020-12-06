import * as fs from 'fs';
import * as c from './control';
export enum wordsType{
    full,half,signature
}
export enum completeType{
    complete,less,over
}
export interface paramInfo{
    complete:completeType;
    param:string;
}
export class parse{
    static paramDeli='@@';
    static pair={'"':'"','\'':'\'','(':')',"[":"]"};
    static re={
        fun:/function (.+?)\((.*?)\)/g,
        method:/->[a-zA-Z0-9_]*$/,
        endOfWords:/\)\s*[=|!|\|\||&&|<|>]/,
        completeWord:/^[a-zA-Z0-9_]*(\()?/,
        const: /const ([a-zA-Z0-9_ ]*)=(.*);/ig,
        static: /static \$([a-zA-Z0-9_ ]*)=(.*);/ig,
        variable: /[public|protected|private] \$([a-zA-Z0-9_ ]*)/ig,
        class: /class (.*?)\s*{/ig,
        view: /->view\(\s*(["'])(.*?)\1/g,
    };

    static parseFile(path:string):c.api_parse{
        let content='';
        try {
            content=fs.readFileSync(path,{encoding:'utf-8'});
        } catch (e) {
            return null;
        }
        let funs=new Map();
        let match=null;
        let uri = this.path2uri(path);
        let variable = null;
        //get funs info
        while ((match = this.re.fun.exec(content)) != null) {
            if (!variable) {
                variable=parse.parseVar(content.substr(0,match.index),uri)
            }
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
                        data.document='';
                    }else{
                        if (str.length>0){
                            data.document=''+str+'  \n'+data.document;
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
            break;
        }
        let consts=this.parseConst(content,uri);
        //get class name
        return { funs: funs, classData: classData,consts:consts,variable:variable?variable:new Map()};
    }

    static parseVar(content: string,uri:string): Map<string, c.const_data>
    {
        let con = new Map<string, c.const_data>();
        let match = null;
        var arr = content.split('\n');
        while ((match = this.re.variable.exec(content)) != null) {
            var lines = content.substr(0, match.index).split('\n');
            var line = lines.length - 1;
            var suffLength = lines.pop().length;
            var str=arr[line].trim()
            var lineContent = str.split('//');
            let item: c.const_data = {
                location: {
                    uri: uri,
                    range: {
                        start: { line: line, character: suffLength },
                        end: { line: line, character: suffLength + str.length }
                    }
                },
                value: '',
                document: lineContent.length>1?lineContent.slice(1).join('//'):''
            }
            con.set(match[1].trim(), item);
        }
        return con;
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
                name: match[1].trim().split(' ').shift(),
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
                //there is already a class. parse data of this class.
                var data=this._parseConst(content.substring(class_begin,match.index),preClassD);
                resConst.set(preClassD.name, data);
                preClassD=classData;
            }
            class_begin=match.index;
            preClassD=classData;
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
                value: match[2].trim(),
                document: str == match[0] ? null : str.substr(match[0].length + 2)
            }
            con.set(match[1].trim(), item);
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
                value: match[2].trim(),
                document: str == match[0] ? null : str.substr(match[0].length + 2)
            }
            con.set('$' + match[1].trim(), item);
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

    static getWords(text:string,position,type:wordsType=wordsType.full):string{
        let lines=text.split('\n');
        let line=lines[position.line];
        let cha:string;
        var addition:string;
        if (type==wordsType.half){
            addition=line.substr(position.character).match(this.re.completeWord)[0];
            cha=line.substr(0,position.character)+addition;
        }else{
            cha=line.substr(0,position.character);
        }
        let strConst=c.loader.re.isStatic.exec(cha);
        if (strConst!=null) return strConst[0];
        cha=cha.trim();//.replace(/^[\)\}\]]*/,'');
        var lineNum=position.line;
        while (!cha.match(/^[a-zA-Z\(\$]/)&&lineNum>0) {
            var l=lines[--lineNum].trim();
            var hasComment=l.indexOf('//');
            if (hasComment>=0) l=l.substr(0,hasComment).trim();
            cha=l+cha;
        }
        let total=this.cleanBracket(cha,type);
        let arr=total.split('->');
        for (var index = arr.length-1; index >=0; index--) {
            if (arr[index].endsWith('$this')){
                arr=arr.slice(index);
                arr[0]=arr[0].substr(arr[0].indexOf('$this'));
                return arr.join('->');
            }else if (arr[index].endsWith('$CI')){
                arr=arr.slice(index);
                arr[0]=arr[0].substr(arr[0].indexOf('$CI'));
                return arr.join('->');
            }
        }
        return '';
    }

    static cleanBracket(words: string, type: wordsType = wordsType.full): string{
        words=words.replace(/\s/g,'')
        var $this=words.indexOf('$this');
        if ($this < 0) {
            $this = words.indexOf('$CI');
            if ($this < 0) return '';
        }
        words=words.substr($this);
        var total='';
        for (var index = 0,j=words.length; index < j; index++) {
            if (words[index]!='(') total+=words[index];
            else{
                //loop for find ')->' in incorrect place. Just for wordsType.full
                var tindex=index;
                do {
                    var end=words.indexOf(')->',tindex);
                    if (end<0){
                        //endwith '(', it is a method
                        if (index==j-1&&type==wordsType.half){
                            return total+'()';
                        }else if (type==wordsType.signature){
                            var p=this.cleanParam(words.substr(tindex+1));
                            if (p.complete==completeType.complete){
                                return total+'()'+this.paramDeli+p.param;
                            }
                        }
                        //the real sentense is in the bracket
                        var realWords=words.substr(index+1);
                        var $this=realWords.indexOf('$this');
                        if ($this<0){
                            if (type==wordsType.signature){
                                return total+'()'+this.paramDeli+realWords;
                            }else return '';
                        } else{
                            var t=this.cleanBracket(realWords.substr($this),type);
                            if (t==''){
                                t=total+'()';
                                if (type==wordsType.signature){
                                    t+=this.paramDeli+realWords;
                                }
                            }
                            return t;
                        }
                    }else{
                        var param=words.slice(index+1,end);
                        var p=this.cleanParam(param);
                        if (p.complete==completeType.less){// there is ')->' in param of one method
                            tindex=end+1;
                            continue;
                        }else if (p.complete==completeType.over){//this is not the real sentence
                            return this.cleanBracket(words.substr(index+p.param.length+2),type);
                        }else {
                            index=end;
                            total+='()';
                            break;
                        }
                    }
                } while (true);
            }
        }
        return total;
    }

    static cleanParam(words:string):paramInfo{
        var hardPair=['"',"'"];
        var total='',ignore='',stack=[];
        for (var index = 0,lim=words.length; index <lim; index++) {
            var c=words[index];
            if (c=='\\'){
                index++;
                continue;
            }else if (ignore==''){
                if (c in this.pair){
                    ignore=this.pair[c];
                    stack.push(ignore);
                    continue;
                }else if (c==')') return {param:total,complete:completeType.over};
                else total+=c;
            }else{
                if (c==ignore){//get the end
                    stack.pop();
                    ignore=stack.length>0?stack[stack.length-1]:'';
                }else if (hardPair.indexOf(c) >=0 && hardPair.indexOf(ignore)==-1){//' " level is higher
                    stack.push(c);
                    ignore=c;
                }
            }
        }
        return {param:total,complete:stack.length==0?completeType.complete:completeType.less};
    }

    /**
     * change the firse letter
     * @param s The string
     * @param up toUpperCase or toLowerCase
     */
    static modFirst(s: string, up = true): string{
        if (s == '') return '';
        return (up?s[0].toUpperCase():s[0].toLowerCase())+s.substr(1);
    }

    static path2uri(path:string):string{
        if (path[0] !== '/') path = '/' + encodeURI(path.replace(/\\/g, '/')).replace(':', '%3A');
        else path=encodeURI(path);
        return `file://${path}`;
    }

    static realPath(path:string):string{
        let arr=path.split('/')
        let name=arr.pop()
        name=parse.modFirst(name)
        return arr.length==0? name: arr.join('/')+'/'+name;
    }

    static parseView(content: string) {
        let res = [];
        let match = null;
        while (match = this.re.view.exec(content)) {
            let end = match.index + match[0].length - 1;
            let start = end - match[2].length;
            res.push({
                uri: match[2],
                range: { start, end }
            });
        }
        return res;
    }
}