import {randomBytes,createHash} from 'node:crypto';
import {rpc,supabase} from './db.js';
import {fail} from './http.js';
export const COOKIE='pds_session',LIFETIME=3600;
export const digest=token=>createHash('sha256').update(token).digest('hex');
export function sessionHash(req){
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))throw fail(401,'로그인이 필요합니다.');return digest(token);
}
export function cookie(token,seconds=LIFETIME){return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${process.env.LOCAL_HTTP==='1'?'':'; Secure'}`;}
export async function user(req){const hash=sessionHash(req);const id=await rpc('pds_auth_owner',{p_session_hash:hash});return {id,hash};}
export async function issueSession(userId,res,client=supabase()){
 await rpc('pds_account_workspace',{p_user:userId},client);
 const token=randomBytes(32).toString('base64url'),expires=new Date(Date.now()+LIFETIME*1000).toISOString();
 const {error}=await client.from('pds_auth_sessions').insert({token_hash:digest(token),user_id:userId,expires_at:expires});
 if(error)throw fail(503,'로그인 상태를 저장하지 못했습니다. 서버 설정을 확인하세요.');
 res.setHeader('Set-Cookie',cookie(token));return expires;
}
export async function revoke(userId,client=supabase()){
 const {error}=await client.from('pds_auth_sessions').update({revoked_at:new Date().toISOString()}).eq('user_id',userId).is('revoked_at',null);
 if(error)throw fail(503,'로그인 상태를 끊지 못했습니다. 다시 시도하세요.');
}
export function credentials(body){
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 const password=typeof body.password==='string'?body.password:'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<1||password.length>256)throw fail(400,'이메일과 비밀번호 형식을 확인하세요.');
 return {email,password};
}
export function strongPassword(password){if(password.length<10||!/\d/.test(password)||!/[A-Za-z]/.test(password))throw fail(400,'비밀번호는 영문과 숫자를 포함해 10자 이상 입력하세요.');}
