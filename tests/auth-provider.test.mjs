import test from 'node:test';import assert from 'node:assert/strict';import auth from '../api/auth.js';import diary from '../api/diary.js';import {digest} from '../lib/auth.js';
const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(x){this.body=x;return x;}};}
const req=(action,body={},cookie='')=>({method:'POST',url:'/api/auth',headers:{origin:'https://app.test',host:'app.test','content-type':'application/json',cookie},body:{action,...body}});
test('Server SDK integration: provider tokens never leave auth response; same app cookie denied after logout',async()=>{
 const oldFetch=globalThis.fetch,oldURL=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://provider.test';process.env.SUPABASE_SECRET_KEY='server-test-key';let row=null;
 globalThis.fetch=async(url,options={})=>{
 const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;
 if(path==='/auth/v1/token'){
 if(body.email!=='a@example.com'||body.password!=='ValidPassword123')return new Response(JSON.stringify({msg:body.email==='a@example.com'?'wrong password':'no user',error_code:'invalid_credentials'}),{status:400,headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify({access_token:'provider-access-secret',refresh_token:'provider-refresh-secret',expires_in:3600,token_type:'bearer',user:{id:ID,email:'a@example.com',identities:[{id:ID}]}}),{headers:{'Content-Type':'application/json'}});
 }
 if(path==='/auth/v1/logout')return new Response(null,{status:204});
 if(path==='/rest/v1/rpc/pds_account_workspace')return Response.json(ID);
 if(path==='/rest/v1/pds_auth_sessions'&&options.method==='POST'){row=body;return new Response(null,{status:201});}
 if(path==='/rest/v1/pds_auth_sessions'&&options.method==='PATCH'){row.revoked_at=body.revoked_at;return new Response(null,{status:204});}
 if(path==='/rest/v1/rpc/pds_auth_owner'){
 if(!row||row.revoked_at||row.token_hash!==body.p_session_hash)return Response.json({code:'PT401',message:'로그인이 필요합니다.'},{status:401});return Response.json(ID);
 }
 if(path==='/rest/v1/rpc/pds_snapshot')return Response.json({plans:[{id:ID}],tasks:[],sessions:[]});
 throw new Error('Unexpected mock request: '+path);
 };
 try{
 const r=response();await auth(req('login',{email:'a@example.com',password:'ValidPassword123'}),r);assert.equal(r.code,200);assert.ok(r.body.expires_at);assert.ok(!JSON.stringify(r.body).includes('secret'));assert.ok(!JSON.stringify(r.body).includes('ValidPassword'));
 const cookie=r.headers['Set-Cookie'].split(';')[0],token=cookie.split('=')[1];assert.equal(token.length,43);assert.equal(row.token_hash,digest(token));assert.ok(!JSON.stringify(row).includes(token));
 const success=response();await diary({method:'GET',url:'/api/diary',headers:{cookie}},success);assert.equal(success.code,200);
 const out=response();await auth(req('logout',{},cookie),out);assert.equal(out.code,200);assert.ok(row.revoked_at);
 const denied=response();await diary({method:'GET',url:'/api/diary',headers:{cookie}},denied);assert.equal(denied.code,401);
 const wrong=response();await auth(req('login',{email:'a@example.com',password:'wrong'}),wrong);const missing=response();await auth(req('login',{email:'absent@example.com',password:'wrong'}),missing);assert.equal(wrong.code,401);assert.deepEqual(wrong.body,missing.body);
 }finally{globalThis.fetch=oldFetch;if(oldURL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldURL;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});
test('Email confirmation: production redirect, server verification, replay rejection, no session disclosure',async()=>{
 const oldFetch=globalThis.fetch,oldURL=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://provider.test';process.env.SUPABASE_SECRET_KEY='server-test-key';const calls=[];let used=false;
 const token='a'.repeat(64),providerUser={id:ID,email:'a@example.com',email_confirmed_at:new Date().toISOString(),identities:[{id:ID}]};
 globalThis.fetch=async(url,options={})=>{
 const u=new URL(url),body=options.body?JSON.parse(options.body):null;calls.push({url:u,body});
 if(u.pathname==='/auth/v1/signup')return Response.json({user:{...providerUser,email_confirmed_at:null}});
 if(u.pathname==='/auth/v1/resend')return body.email==='absent@example.com'?Response.json({msg:'no such account',error_code:'user_not_found'},{status:404}):Response.json({});
 if(u.pathname==='/auth/v1/verify'){
 assert.equal(body.type,'email');
 if(body.token_hash!==token||used)return Response.json({msg:'sensitive provider detail '+token,error_code:'otp_expired'},{status:403});
 used=true;return Response.json({user:providerUser,access_token:'provider-access-secret',refresh_token:'provider-refresh-secret',expires_in:3600,token_type:'bearer'});
 }
 if(u.pathname==='/auth/v1/logout')return new Response(null,{status:204});
 throw new Error('Unexpected mock request: '+u.pathname);
 };
 try{
 const signup=response();await auth(req('signup',{email:'a@example.com',password:'ValidPassword123'}),signup);assert.equal(signup.code,201);assert.match(signup.body.message,/이메일 인증/);assert.equal(calls[0].url.searchParams.get('redirect_to'),'https://app.test/login');
 const confirm=response();await auth(req('confirm-email',{token_hash:token,type:'recovery'}),confirm);assert.equal(confirm.code,200);assert.match(confirm.body.message,/인증이 완료/);assert.equal(confirm.headers['Set-Cookie'],undefined);assert.ok(!JSON.stringify(confirm.body).includes(token));assert.ok(!JSON.stringify(confirm.body).includes('secret'));assert.ok(!calls.some(c=>c.url.pathname.startsWith('/rest/')));
 const again=response();await auth(req('confirm-email',{token_hash:token}),again);assert.equal(again.code,400);assert.match(again.body.error,/만료되었거나 이미 사용/);assert.ok(!JSON.stringify(again.body).includes(token));
 const bad=response();await auth(req('confirm-email',{token_hash:'<script>bad</script>'}),bad);assert.equal(bad.code,400);assert.ok(!JSON.stringify(bad.body).includes('<script>'));
 const found=response();await auth(req('resend-confirmation',{email:'a@example.com'}),found);const missing=response();await auth(req('resend-confirmation',{email:'absent@example.com'}),missing);assert.equal(found.code,200);assert.equal(missing.code,200);assert.deepEqual(found.body,missing.body);assert.equal(calls.find(c=>c.url.pathname==='/auth/v1/resend').url.searchParams.get('redirect_to'),'https://app.test/login');
 const foreign=response();const cross=req('confirm-email',{token_hash:token});cross.headers.origin='https://attacker.test';const before=calls.length;await auth(cross,foreign);assert.equal(foreign.code,403);assert.equal(calls.length,before);
 }finally{globalThis.fetch=oldFetch;if(oldURL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldURL;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});
