import {supabase} from '../lib/db.js';
import {cookie,credentials,strongPassword,issueSession,user,revoke} from '../lib/auth.js';
import {prepare,readJSON,fail,errorResponse} from '../lib/http.js';
export default async function handler(req,res){
 prepare(res);try{
 if(req.method==='GET'){
 const u=await user(req),client=supabase();const {data,error}=await client.auth.admin.getUserById(u.id);
 if(error||!data.user)throw fail(401,'로그인이 필요합니다.');
 const {data:session,error:sessionError}=await client.from('pds_auth_sessions').select('expires_at').eq('token_hash',u.hash).single();
 if(sessionError)throw fail(503,'로그인 상태를 확인하지 못했습니다.');
 return res.status(200).json({user:{id:u.id,email:data.user.email},expires_at:session.expires_at});
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw fail(405,'지원하지 않는 요청입니다.');}
 const body=readJSON(req,4000),client=supabase();
 if(body.action==='confirm-email'){
 if(typeof body.token_hash!=='string'||!/^[A-Za-z0-9_-]{20,256}$/.test(body.token_hash))throw fail(400,'인증 링크가 올바르지 않습니다. 받은 메일의 링크를 다시 열어 주세요.');
 const {data,error}=await client.auth.verifyOtp({token_hash:body.token_hash,type:'email'});
 if(error&&(error.status>=500||!error.status))throw fail(503,'인증 결과를 확인하지 못했습니다. 잠시 후 메일의 링크를 다시 열어 주세요.');
 if(error||!data.user?.email_confirmed_at)throw fail(error?.status===429?429:400,error?.status===429?'요청이 많습니다. 잠시 후 메일의 링크를 다시 열어 주세요.':'인증 링크가 만료되었거나 이미 사용되었습니다. 먼저 로그인을 시도하고, 안 되면 인증 메일을 다시 받아 주세요.');
 // Confirm email only. Provider JWTs stay on the server; app login is separate.
 await client.auth.signOut({scope:'local'}).catch(()=>{});
 return res.status(200).json({ok:true,message:'이메일 인증이 완료되었습니다. 가입한 이메일과 비밀번호로 로그인해 주세요.'});
 }
 if(body.action==='resend-confirmation'){
 const {email}=credentials({email:body.email,password:'unused'});
 const {error}=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:new URL('/login',req.headers.origin).href}});
 if(error?.status===429)throw fail(429,'요청이 많습니다. 잠시 후 다시 시도하세요.');
 if(error&&(error.status>=500||!error.status))throw fail(503,'메일 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.');
 return res.status(200).json({ok:true,message:'인증이 필요한 계정이면 메일이 발송됩니다. 받은편지함과 스팸함을 확인하세요. 이미 인증했다면 바로 로그인할 수 있습니다.'});
 }
 if(body.action==='signup'){
 const c=credentials(body);strongPassword(c.password);
 const {data,error}=await client.auth.signUp({...c,options:{emailRedirectTo:new URL('/login',req.headers.origin).href}});
 if(error||!data.user||data.user.identities?.length===0)throw fail(error?.status===429?429:409,error?.status===429?'요청이 많습니다. 잠시 후 다시 시도하세요.':'가입하지 못했습니다. 이미 가입한 이메일이거나 가입 조건에 맞지 않습니다.');
 return res.status(201).json({ok:true,message:data.session?'가입했습니다. 로그인해 주세요.':'가입했습니다. 이메일 인증을 마친 뒤 로그인해 주세요.'});
 }
 if(body.action==='login'){
 const c=credentials(body);const {data,error}=await client.auth.signInWithPassword(c);
 if(error||!data.user)throw fail(401,'이메일 또는 비밀번호를 확인하세요.');
 // Provider JWTs stay on this server; only a separate opaque app session enters the cookie.
 const expires=await issueSession(data.user.id,res,supabase());
 await client.auth.signOut().catch(()=>{});
 return res.status(200).json({ok:true,expires_at:expires});
 }
 const u=await user(req);
 if(body.action==='logout'){
 await revoke(u.id,client);res.setHeader('Set-Cookie',cookie('',0));return res.status(200).json({ok:true});
 }
 if(body.action==='password'||body.action==='delete-account'){
 const {data:account,error}=await client.auth.admin.getUserById(u.id);
 if(error||!account.user)throw fail(401,'로그인이 필요합니다.');
 if(typeof body.current_password!=='string')throw fail(400,'현재 비밀번호를 입력하세요.');
 const verifier=supabase();const {data:verified,error:wrong}=await verifier.auth.signInWithPassword({email:account.user.email,password:body.current_password});
 if(wrong||verified.user?.id!==u.id)throw fail(401,'현재 비밀번호를 확인하세요.');
 await verifier.auth.signOut().catch(()=>{});
 if(body.action==='password'){if(typeof body.new_password!=='string')throw fail(400,'새 비밀번호를 입력하세요.');strongPassword(body.new_password);}
 if(body.action==='delete-account'&&body.confirmation!=='계정 삭제')throw fail(400,'확인 문구를 정확히 입력하세요.');
 // Revoke BEFORE changing provider state; failure cannot leave old app cookies usable.
 await revoke(u.id,client);
 if(body.action==='password'){
 if(typeof body.new_password!=='string')throw fail(400,'새 비밀번호를 입력하세요.');strongPassword(body.new_password);
 const {error:updateError}=await client.auth.admin.updateUserById(u.id,{password:body.new_password});
 if(updateError)throw fail(400,'비밀번호를 바꾸지 못했습니다. 다시 로그인한 뒤 시도하세요.');
 }else{
 if(body.confirmation!=='계정 삭제')throw fail(400,'확인 문구를 정확히 입력하세요.');
 const {error:deleteError}=await client.auth.admin.deleteUser(u.id);
 if(deleteError)throw fail(503,'계정을 삭제하지 못했습니다. 다시 로그인한 뒤 시도하세요.');
 }
 res.setHeader('Set-Cookie',cookie('',0));return res.status(200).json({ok:true});
 }
 throw fail(400,'지원하지 않는 요청입니다.');
 }catch(e){return errorResponse(res,e);}
}
