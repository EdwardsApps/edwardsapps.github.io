const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(initial={}) {
 const storage={...initial}, scripts=[], elements={}, events={}; let reloads=0;
 function el(){return {checked:false,addEventListener(n,fn){this[n]=fn},focus(){},remove(){},setAttribute(){},querySelector(s){return elements[s] ||= el()}};}
 const doc={readyState:'complete',head:{appendChild:s=>scripts.push(s.src)},body:{appendChild(){}},createElement:el,getElementById:()=>null,getElementsByTagName:()=>[{parentNode:{insertBefore:s=>scripts.push(s.src)}}],addEventListener:(n,fn)=>events[n]=fn};
 const ctx={document:doc,localStorage:{getItem:k=>storage[k]??null,setItem:(k,v)=>storage[k]=v},location:{reload(){reloads++}}};ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync('js/consent.js','utf8'),ctx);
 return {ctx,scripts,storage,elements,reloads:()=>reloads,click:s=>elements[s].click()};
}
test('new visitors and legacy analytics consent do not load Meta',()=>{for(const initial of [{},{'ea-consent':'granted'},{'ea-consent':'denied'}]){const x=setup(initial);assert(!x.scripts.some(s=>s.includes('facebook')));assert.equal(x.ctx.fbq,undefined);assert.equal(x.elements['#ea-marketing-choice'].checked,false);}});
test('reject all loads no trackers',()=>{const x=setup();x.click('.consent-decline');assert.deepEqual(x.scripts,[]);assert.equal(x.storage['ea-marketing-consent'],'denied');});
test('marketing-only sends correct init and one PageView, never loads GA',()=>{const x=setup();x.elements['#ea-marketing-choice'].checked=true;x.click('.consent-save');assert.equal(x.scripts.length,1);assert(x.scripts[0].includes('connect.facebook.net'));const q=x.ctx.fbq.queue.map(a=>Array.from(a));assert.deepEqual(Array.from(q, a=>Array.from(a)),[['consent','grant'],['init','3441716076000928'],['track','PageView']]);x.ctx.EAConsent.open();x.click('.consent-save');assert.equal(x.ctx.fbq.queue.length,3);});
test('analytics-only never loads Meta',()=>{const x=setup();x.elements['#ea-analytics-choice'].checked=true;x.click('.consent-save');assert.equal(x.scripts.length,1);assert(x.scripts[0].includes('googletagmanager'));assert.equal(x.ctx.fbq,undefined);});
test('saved marketing loads once, withdrawal revokes and reloads',()=>{const x=setup({'ea-consent':'denied','ea-marketing-consent':'granted'});assert.equal(x.ctx.fbq.queue.length,3);x.ctx.EAConsent.open();x.click('.consent-decline');assert.equal(x.ctx.fbq.queue.at(-1)[1],'revoke');assert.equal(x.reloads(),1);assert.equal(x.storage['ea-marketing-consent'],'denied');});
