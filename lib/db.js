export async function rpc(name,args={}) {
 const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key) throw Object.assign(new Error('서버 DB 설정이 필요합니다. Vercel 환경변수를 확인하세요.'),{status:503});
 const headers={'Content-Type':'application/json',apikey:key};
 if(!key.startsWith('sb_secret_')) headers.Authorization=`Bearer ${key}`;
 let res;try {res=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});}catch {throw Object.assign(new Error('DB에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'),{status:503});}
 if(!res.ok){const err=await res.json().catch(()=>({}));const conflict=['40001','23505'].includes(err.code);throw Object.assign(new Error(conflict?'다른 변경이 있습니다. 새로고침 후 다시 시도하세요.':res.status<500&&res.status!==401&&res.status!==403?'저장하지 못했습니다. 입력값 또는 DB 설치 상태를 확인하세요.':'DB 요청에 실패했습니다. 서버 설정을 확인하세요.'),{status:conflict?409:400});}
 return res.json();
}
