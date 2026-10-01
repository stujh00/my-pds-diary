import {createClient} from '@supabase/supabase-js';
import {fail} from './http.js';
export function supabase(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw fail(503,'서버 DB 설정이 필요합니다. Vercel 환경변수를 확인하세요.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})}});
}
export async function rpc(name,args={},client=supabase()){
 const {data,error}=await client.rpc(name,args);
 if(error){const status=/^PT(400|401|403|404|409)$/.test(error.code)?Number(error.code.slice(2)):['40001','23505'].includes(error.code)?409:error.code==='23514'||error.code==='22P02'||error.code==='23502'?400:503;
 const message=status===401?'로그인이 필요합니다.':status===404?'자료를 찾을 수 없습니다.':status===409?'이미 처리됐거나 다른 변경이 있습니다. 새로고침 후 확인하세요.':/^PT/.test(error.code)?error.message:status===400?'입력값을 확인하세요.':'DB 요청에 실패했습니다. SQL 설치와 서버 설정을 확인하세요.';
 throw fail(status,message);
 }return data;
}
