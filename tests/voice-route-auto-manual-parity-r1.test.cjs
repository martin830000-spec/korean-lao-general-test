'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const html=fs.readFileSync('index.html','utf8');
const m=html.match(/<textarea id="payload-general"[^>]*>/);
assert.ok(m);
const src=html.slice(m.index+m[0].length,html.indexOf('</textarea>',m.index)).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
const one=prefix=>{const lines=src.split('\n').filter(x=>x.startsWith(prefix));assert.equal(lines.length,1,prefix);return lines[0]};
test('existing auto/manual buttons visible with saved selector handlers',()=>{
 assert.match(src,/<div class="route-mode"><button/);
 for(const n of ['networkModeAuto','networkModeDirect','networkModeCloudflare'])assert.match(src,new RegExp("id=\""+n+"\""));
 assert.match(one('function updateNetworkRouteUi(){'),/classList.toggle\('active'/);
 assert.match(one('function setNetworkRouteMode('),/lsSet\(NETWORK_ROUTE_MODE_KEY/);
});
test('auto follows spouse voice policy; explicit manual preferences override',()=>{
 let mode='auto',who='husband';
 const ctx=vm.createContext({state:{},networkRouteMode:()=>mode,networkStatsRead:()=>({}),timezoneCloudflareFirst:()=>false,Date});
 Object.defineProperty(ctx.state,'userMode',{get:()=>who});
 vm.runInContext(one('function networkPreferred('),ctx);
 for(const feat of ['stt','tts']){
   mode='auto';who='husband';assert.equal(vm.runInContext("networkPreferred('"+feat+"')",ctx),'direct');
   who='wife';assert.equal(vm.runInContext("networkPreferred('"+feat+"')",ctx),'cloudflare');
   mode='direct';assert.equal(vm.runInContext("networkPreferred('"+feat+"')",ctx),'direct');
   mode='cloudflare';assert.equal(vm.runInContext("networkPreferred('"+feat+"')",ctx),'cloudflare');
 }
});
test('manual route choice affects speech endpoints, not direct text translation',()=>{
 let mode='auto',who='wife';
 const obj={state:{relayUrl:'https://custom.example'},SEOUL_RELAY:'https://seoul.example',BANGKOK_RELAY:'https://bangkok.example',CLOUDFLARE_RELAY:'https://cf.example',networkRouteMode:()=>mode,networkFeature:p=>p.includes('/tts')?'tts':'stt',networkPreferred:()=>mode==='auto'?(who==='wife'?'cloudflare':'direct'):mode,timezoneCloudflareFirst:()=>false};
 Object.defineProperty(obj.state,'userMode',{get:()=>who});
 const ctx=vm.createContext(obj);vm.runInContext(one('function relayRoutes('),ctx);
 for(const path of ['/stream','/transcribe','/gemini/audio-transcribe','/azure/tts','/health']){
   who='wife';mode='auto';let r=vm.runInContext("relayRoutes('"+path+"')",ctx);assert.ok(r.every(x=>x.via==='cloudflare'));
   who='husband';r=vm.runInContext("relayRoutes('"+path+"')",ctx);assert.equal(r[0].via,'direct');
   who='wife';mode='direct';r=vm.runInContext("relayRoutes('"+path+"')",ctx);assert.equal(r[0].via,'direct');
   who='husband';mode='cloudflare';r=vm.runInContext("relayRoutes('"+path+"')",ctx);assert.equal(r[0].via,'cloudflare');
   assert.ok(r.every(x=>x.base!=='https://custom.example'));
 }
 assert.match(one('async function geminiRequest('),/return directGemini\(/);
 assert.doesNotMatch(one('async function geminiRequest('),/relayGemini\(/);
 assert.doesNotMatch(src,/android-ime-return-r3/);
});
