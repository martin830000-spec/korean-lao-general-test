'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const {test}=require('node:test');
const doc=fs.readFileSync('index.html','utf8');
const decode=s=>s.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|lt|gt|amp|quot|apos);/gi,(v,h,d)=>h?String.fromCodePoint(parseInt(h,16)):d?String.fromCodePoint(Number(d)):({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'"})[v.toLowerCase()]||v);
const ids=doc.includes('id="payload-general"')?['general']:['husband','wife'];
const baseline={husband:'35a5d0a6110bba62988c1b26b1f800ebe93cb51af070fee3f4063293a1ad20b0',wife:'3a75245234dde87df9e8fec45dd51adbf18f0138115097bf1152ca8f6778b076',general:'04e86b4989bb9471bbb0464eae6a2849c55c8d0404ce0c31eca4ca02a86ac09c'};
function read(id){
 const re=new RegExp('<textarea id="payload-'+id+'"[^>]*data-sha256="([a-f0-9]{64})"[^>]*>');
 const match=doc.match(re);assert.ok(match,id+' marker');const start=match.index+match[0].length,end=doc.indexOf('</textarea>',start);
 assert.ok(end>start);const text=decode(doc.slice(start,end));
 assert.equal(crypto.createHash('sha256').update(text).digest('hex'),match[1]);return text;
}
function scriptOf(payload){const m=payload.match(/<script id="android-ime-return-r3">([\s\S]*?)<\/script>/);
 assert.ok(m,'R3 script exists');return m[1];}
function makeHarness(source,android){
 let button=null,blurCount=0,focusCount=0,hideCount=0,dispatched=0;
 const listeners={},btnListeners={};
 const editor={value:'시작',selectionStart:2,selectionEnd:2,
   addEventListener(n,cb){(listeners[n]??=[]).push(cb)},
   blur(){blurCount++;env.document.activeElement=null},
   focus(){focusCount++;env.document.activeElement=editor},
   setSelectionRange(a,b){editor.selectionStart=a;editor.selectionEnd=b}};
 const head={querySelector(){return{tagName:'BUTTON'}},insertBefore(btn){button=btn},appendChild(btn){button=btn}};
 const env={window:{},navigator:{userAgent:android?'Mozilla/5.0 Android Chrome':'Mozilla/5.0 iPhone Safari',virtualKeyboard:{hide(){hideCount++}}},
   document:{head:{appendChild(){}},getElementById(){return editor},querySelector(){return head},activeElement:editor,createElement(tag){return tag==='style'?{id:'',textContent:''}:{id:'',textContent:'',className:'',type:'',title:'',setAttribute(){},addEventListener(n,cb){(btnListeners[n]??=[]).push(cb)}}}},
   Date,console,uiLang:()=> 'ko'};
 vm.runInNewContext(scriptOf(source),env,{timeout:2000});
 function fire(n,data={}){for(const cb of listeners[n]||[])cb(data)}
 function clickButton(){for(const cb of btnListeners.click||[])cb({preventDefault(){}})}
 return{env,editor,fire,clickButton,button,counts:()=>({blur:blurCount,focus:focusCount,hide:hideCount}),listenerNames:Object.keys(listeners)};
}
test('R3 embedded SHA and source JS syntax valid with no change to R2 translation runtime',()=>{
 for(const id of ids){const source=read(id);const scripts=[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
 for(const [i,m] of scripts.entries())if(!/\btype\s*=\s*['"](?:application\/json|text\/plain)['"]/i.test(m[1]))new vm.Script(m[2],{filename:id+'-'+i});
 let without=source.replace(/<script id="android-ime-return-r3">[\s\S]*?<\/script>\n/,'');
 if(id==='general')without=without.replace("const BUILD_ID='20261014-V3.61.202-TEST-VOICE-IME-R3';","const BUILD_ID='20261014-V3.61.202-TEST-VOICE-UI-R2';");
 assert.equal(crypto.createHash('sha256').update(without).digest('hex'),baseline[id],id+' R2 parity');}
});
test('R3 Android installs keyboard-return affordance; ordinary typed tap does not interfere',()=>{
 for(const id of ids){const h=makeHarness(read(id),true);assert.ok(h.button,id+' keyboard button');
 assert.equal(h.env.document.activeElement,h.editor);const prior=h.editor.value;
 h.editor.value='시작가';h.fire('input',{isTrusted:true,data:'가',inputType:'insertText',isComposing:false});
 h.fire('pointerdown',{pointerType:'touch',isPrimary:true});h.fire('click');
 assert.deepEqual(h.counts(),{blur:0,focus:0,hide:0},id+' normal typing');assert.equal(h.editor.value,'시작가');
 assert.ok(h.listenerNames.includes('compositionstart'));
 assert.equal(prior,'시작');}
});
test('R3 trusted voice-like bulk input then touch triggers one best-effort focus cycle, value unchanged',()=>{
 for(const id of ids){const h=makeHarness(read(id),true);h.editor.value='오늘 음성으로 입력하는 문장';
 h.fire('input',{isTrusted:true,data:'오늘 음성으로 입력하는 문장',inputType:'insertText',isComposing:false});
 h.fire('pointerdown',{pointerType:'touch',isPrimary:true});h.fire('click');
 assert.deepEqual(h.counts(),{blur:1,focus:1,hide:1},id+' one switch');
 assert.equal(h.editor.value,'오늘 음성으로 입력하는 문장');
 assert.equal(h.editor.selectionStart,2);
 h.fire('pointerdown',{pointerType:'touch',isPrimary:true});h.fire('click');
 assert.deepEqual(h.counts(),{blur:1,focus:1,hide:1},id+' consumed arm state');
 }
});
test('R3 paste, synthetic events and composing never trigger implicit keyboard switch',()=>{
 for(const id of ids){for(const mode of ['paste','synthetic','composition']){const h=makeHarness(read(id),true);
 h.editor.value='이것은 일반 사용자 텍스트입니다';
 if(mode==='paste')h.fire('input',{isTrusted:true,data:'이것은 일반 사용자 텍스트입니다',inputType:'insertFromPaste'});
 else if(mode==='synthetic')h.fire('input',{isTrusted:false,data:'이것은 일반 사용자 텍스트입니다',inputType:'insertText'});
 else {h.fire('compositionstart');h.fire('input',{isTrusted:true,data:'이것은 일반 사용자 텍스트입니다',inputType:'insertCompositionText',isComposing:true});h.fire('compositionend');}
 h.fire('pointerdown',{pointerType:'touch',isPrimary:true});h.fire('click');
 assert.equal(h.counts().blur,0,id+' '+mode);}
 }
});
test('R3 explicit keyboard button works without voice signature, and non-Android not installed',()=>{
 for(const id of ids){const h=makeHarness(read(id),true);h.clickButton();
 assert.deepEqual(h.counts(),{blur:1,focus:1,hide:1},id);
 const ios=makeHarness(read(id),false);assert.equal(ios.button,null,id);assert.deepEqual(ios.counts(),{blur:0,focus:0,hide:0});}
});
test('R3 build channel and user-visible app version preserved',()=>{
 const obj=JSON.parse(fs.readFileSync('version.json','utf8'));assert.equal(obj.build,obj.buildId);
 assert.match(obj.build,/TEST-VOICE-IME-R3$/);
 assert.equal(obj.version,ids.includes('general')?'V3.61.202':'V3.61.209');
 if(ids.includes('general')){const p=read('general');assert.match(p,/20261014-V3\.61\.202-TEST-VOICE-IME-R3/);assert.match(doc,/const GENERAL_BUILD="20261014-V3\.61\.202-TEST-VOICE-IME-R3"/);}
});
