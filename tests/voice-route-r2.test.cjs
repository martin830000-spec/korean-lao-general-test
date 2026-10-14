'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {test}=require('node:test');
const shell=fs.readFileSync('index.html','utf8'),decode=s=>s.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|lt|gt|amp|quot|apos);/gi,(ent,h,d)=>h?String.fromCodePoint(parseInt(h,16)):d?String.fromCodePoint(Number(d)):({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'"})[ent.toLowerCase()]||ent);
const match=shell.match(/<textarea id="payload-general"[^>]*data-sha256="([a-f0-9]{64})"[^>]*>/);assert.ok(match);const start=match.index+match[0].length,end=shell.indexOf('</textarea>',start),src=decode(shell.slice(start,end));
const slice=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j)};
test('R2 general app embedded SHA, JavaScript syntax, and version match',()=>{
assert.equal(crypto.createHash('sha256').update(src).digest('hex'),match[1]);
for(const m of [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)])if(!/\btype\s*=\s*['"](?:application\/json|text\/plain)['"]/i.test(m[1]))new vm.Script(m[2]);
assert.match(src,/const BUILD_ID='20261014-V3\.61\.202-TEST-VOICE-UI-R2'/);
assert.match(shell,/const GENERAL_BUILD="20261014-V3\.61\.202-TEST-VOICE-UI-R2"/);
});
test('R2 general network controls are informational and preserve direct Gemini single-pass',()=>{
assert.match(src,/class="route-mode" style="display:none"/);
assert.match(src,/function updateNetworkRouteUi\(/);
assert.match(src,/async function directGemini\(/);
assert.match(src,/function directAudioTranscribe\(/);
});
test('R2 general wife audio routes ignore custom Relay and unreachable direct Cloud Run',()=>{
const mock={state:{userMode:'wife',relayUrl:'https://custom.example'},SEOUL_RELAY:'https://seoul.example',BANGKOK_RELAY:'https://bkk.example',CLOUDFLARE_RELAY:'https://cf.example',networkFeature:()=> 'stt',networkPreferred:()=> 'cloudflare',timezoneCloudflareFirst:()=>true};
const ctx=vm.createContext(mock);vm.runInContext(slice('function relayRoutes(path=','function relayUrl('),ctx);
const routes=vm.runInContext('relayRoutes("/transcribe")',ctx);assert.equal(routes.length,1);assert.equal(routes[0].base,'https://cf.example');assert.equal(routes[0].via,'cloudflare');
});
test('R2 general husband audio routes retain Cloud Run first while custom does not override',()=>{
const ctx=vm.createContext({state:{userMode:'husband',relayUrl:'https://custom.example'},SEOUL_RELAY:'https://seoul.example',BANGKOK_RELAY:'https://bkk.example',CLOUDFLARE_RELAY:'https://cf.example',networkFeature:()=> 'stt',networkPreferred:()=> 'direct',timezoneCloudflareFirst:()=>false});
vm.runInContext(slice('function relayRoutes(path=','function relayUrl('),ctx);
const routes=vm.runInContext('relayRoutes("/stream")',ctx);assert.equal(routes[0].base,'https://seoul.example');assert.ok(routes.every(x=>x.base!=='https://custom.example'));
});
test('R2 general capability health aligns with speech relay path and nonnative STT fallback stays',()=>{
const ctx=vm.createContext({});vm.runInContext(slice('function networkFeature(path=','function networkPreferred('),ctx);
assert.equal(vm.runInContext('networkFeature("/health")',ctx),'stt');
assert.equal(vm.runInContext('networkFeature("/gemini/audio-transcribe")',ctx),'stt');
assert.match(src,/if\(!generalRelayNativeStt\(lang\)\)/);assert.match(src,/directAudioTranscribe\(pcm,lang,v\)/);
});
