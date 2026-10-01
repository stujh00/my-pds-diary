import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../public/auth-ui.js',import.meta.url),'utf8');
function start(hash,reply){
 const nodes=new Map(),calls=[],events=[],listeners=new Map();
 const document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{textContent:'',value:'',disabled:false,hidden:true,classList:{toggle(){}},reportValidity:()=>true});return nodes.get(selector);}};
 const location={hash,search:'',pathname:'/login',replace:url=>events.push(['redirect',url])};
 const history={replaceState:(_,__,path)=>{events.push(['clear',path]);location.hash='';location.search='';}};
 const promise=runInNewContext(source,{document,location,history,URLSearchParams,addEventListener:(event,fn)=>listeners.set(event,fn),fetch:async(url,options={})=>{events.push(['request',url]);calls.push({url,options,body:options.body?JSON.parse(options.body):null});return reply();}});
 return {nodes,calls,events,promise,location,listeners};
}
test('Email UI removes confirmation value before POST; success appears only after server verification',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);const token='b'.repeat(64);const ui=start('#token_hash='+token+'&type=email',()=>pending);
 assert.deepEqual(ui.events[0],['clear','/login']);assert.equal(ui.location.hash,'');assert.equal(ui.calls[0].url,'/api/auth');assert.equal(ui.calls[0].options.method,'POST');assert.equal(ui.calls[0].body.token_hash,token);assert.match(ui.nodes.get('#auth-notice').textContent,/확인하고 있습니다/);assert.equal(ui.nodes.get('#auth-submit').disabled,true);
 release({ok:true,json:async()=>({message:'이메일 인증이 완료되었습니다. 가입한 이메일과 비밀번호로 로그인해 주세요.'})});await ui.promise;
 assert.match(ui.nodes.get('#auth-notice').textContent,/인증이 완료/);assert.equal(ui.nodes.get('#auth-submit').disabled,false);assert.ok(!ui.events.some(e=>e[0]==='redirect'));
 ui.location.hash='#token_hash='+token;await ui.listeners.get('hashchange')();assert.equal(ui.calls.length,2);assert.equal(ui.location.hash,'');
});
test('Expired or reused email link shows a failure and a recovery path',async()=>{
 const ui=start('#token_hash='+'c'.repeat(64),()=>({ok:false,json:async()=>({error:'인증 링크가 만료되었거나 이미 사용되었습니다. 먼저 로그인을 시도하고, 안 되면 인증 메일을 다시 받아 주세요.'})}));await ui.promise;
 assert.match(ui.nodes.get('#auth-notice').textContent,/만료되었거나 이미 사용/);assert.ok(!ui.nodes.get('#auth-notice').textContent.includes('인증이 완료'));assert.equal(ui.nodes.get('#resend-confirmation').disabled,false);
});
test('Legacy provider fragments are cleared without treating them as an app login',async()=>{
 const ui=start('#access_token=legacy-private-value&refresh_token=other-private-value',()=>{throw new Error('Should not request a provider session');});await ui.promise;assert.equal(ui.location.hash,'');assert.equal(ui.calls.length,0);assert.match(ui.nodes.get('#auth-notice').textContent,/로그인해 주세요/);assert.ok(!ui.nodes.get('#auth-notice').textContent.includes('private-value'));assert.ok(!ui.nodes.get('#auth-notice').textContent.includes('인증이 완료'));
});
