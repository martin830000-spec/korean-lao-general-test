'use strict';
const fs=require('node:fs'), vm=require('node:vm'), crypto=require('node:crypto'),assert=require('node:assert/strict');
const {test}=require('node:test');
const raw=fs.readFileSync('index.html','utf8');
const decode=str=>str.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|lt|gt|amp|quot|apos);/gi,(ent,h,d)=>
  h?String.fromCodePoint(parseInt(h,16)):d?String.fromCodePoint(Number(d)):
  ({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'"})[ent.toLowerCase()]||ent);
const tag=raw.match(/<textarea id="payload-general"[^>]*>/);
assert.ok(tag,'general app payload');
const start=tag.index+tag[0].length,end=raw.indexOf('</textarea>',start);
assert.ok(end>start);
const payload=decode(raw.slice(start,end));
const fragment=(from,to)=>{const a=payload.indexOf(from),b=payload.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,from);return payload.slice(a,b)};
test('general embedded payload SHA256 matches, and TEST channel metadata is correct',()=>{
  const sha=tag[0].match(/data-sha256="([a-f0-9]{64})"/)?.[1];
  assert.equal(crypto.createHash('sha256').update(payload).digest('hex'),sha);
  assert.match(payload,/20261014-V3\.61\.202-TEST-TEXT-DIRECT-UI-R2/);
  assert.match(raw,/const GENERAL_BUILD="20261014-V3\.61\.202-TEST-TEXT-DIRECT-UI-R2"/);
});
test('all general embedded and shell scripts pass Node JS parser',()=>{
  for(const s of [payload,raw]){
    let n=0;
    for(const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
      if(/\btype\s*=\s*["'](?:application\/json|text\/plain)["']/i.test(m[1]))continue;
      new vm.Script(m[2]);n++;
    }
    assert.ok(n>0);
  }
});
test('forward and independent back issue one direct Gemini API request, never auto-relay',async()=>{
  const js=fragment('async function geminiRequest(systemPrompt,userText,timeoutMs,controller,purpose)','// V3.61.202: deterministic');
  assert.doesNotMatch(js,/relayGemini\(/);
  let n=0;
  const ctx=vm.createContext({directGemini:async()=>{n++;return{text:'TEST',route:'direct'}},relayGemini:async()=>{throw Error('forbidden relay')}});
  vm.runInContext(js,ctx);
  for(const purpose of ['translate','backtranslate']){
    const got=await vm.runInContext('geminiRequest("prompt","source",1000,{signal:{}},'+JSON.stringify(purpose)+')',ctx);
    assert.equal(got.route,'direct');
  }
  assert.equal(n,2);
  ctx.directGemini=async()=>{n++;throw new TypeError('offline simulation')};
  await assert.rejects(vm.runInContext('geminiRequest("prompt","source",1000,{signal:{}},"translate")',ctx),TypeError);
  assert.equal(n,3,'failed call must not be replayed');
});
test('STT and TTS route primary is Cloud Run for husband, Cloudflare for wife',()=>{
  const code=fragment("function networkPreferred(feature='relay')",'function networkRecord(');
  for(const [userMode,expected] of [['husband','direct'],['wife','cloudflare']]){
    const ctx=vm.createContext({state:{userMode},networkRouteMode:()=>userMode==='husband'?'cloudflare':'direct'});
    vm.runInContext(code,ctx);
    for(const feature of ['stt','tts'])assert.equal(vm.runInContext('networkPreferred('+JSON.stringify(feature)+')',ctx),expected);
  }
});
test('AI audio-transcribe is classified as STT, and direct Gemini retains LOW',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(fragment("function networkFeature(path='')","function networkPreferred("),ctx);
  assert.equal(vm.runInContext('networkFeature("/gemini/audio-transcribe")',ctx),'stt');
  assert.equal(vm.runInContext('networkFeature("/azure/tts")',ctx),'tts');
  const direct=fragment('function payloadForGemini(systemPrompt,userText)','async function directGemini(');
  assert.match(direct,/thinkingLevel:'low',includeThoughts:false/);
});

test('network mode chooser hidden and informative bilingual route status still rendered',()=>{
  assert.match(payload,/function updateNetworkRouteUi\(\)/);
  const fn=fragment('function updateNetworkRouteUi()','function setNetworkRouteMode(');
  assert.match(fn,/chooser\.style\.display='none'/);
  assert.match(fn,/Cloud Run/);
  assert.match(fn,/Cloudflare/);
  assert.match(fn,/Gemini/);
  assert.match(fn,/자동 서버 재요청 없음/);
});
