// Live evidence only. Creates TWO NEW disposable accounts; existing accounts abort.
// Never pass passwords on the command line or store raw requests/headers.
import {createInterface} from 'node:readline/promises';import {stdin,stdout} from 'node:process';import {mkdir,writeFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
const base=process.argv[2];if(!base||!/^https?:\/\//.test(base))throw new Error('Usage: node scripts/auth-evidence.mjs https://YOUR-T07.vercel.app');
const origin=new URL(base).origin,rl=createInterface({input:stdin,output:stdout});
console.log('새 테스트 계정 2개를 만들고 테스트 자료를 넣습니다. 이메일 인증을 꺼 둔 과제용 프로젝트에서 실행하세요. 기존 공부 계정은 사용하지 마세요. 비밀번호와 쿠키는 증빙 파일에 저장하지 않습니다.');
const emailA=(await rl.question('새 테스트 A 이메일: ')).trim(),emailB=(await rl.question('새 테스트 B 이메일: ')).trim();rl.close();
if(emailA.toLowerCase()===emailB.toLowerCase())throw new Error('Use different emails.');
async function hiddenPassword(){if(!stdin.isTTY)throw new Error('Run in an interactive terminal; do not redirect a password file.');stdout.write('두 테스트 계정에 쓸 동일 비밀번호 (영문+숫자 10자 이상, 입력 숨김): ');stdin.setRawMode(true);stdin.resume();return new Promise((resolve,reject)=>{let value='';const done=()=>{stdin.off('data',onData);stdin.setRawMode(false);stdin.pause();stdout.write('\n');};function onData(chunk){for(const c of chunk.toString()){if(c==='\u0003'){done();reject(new Error('Cancelled'));return;}if(c==='\r'||c==='\n'){done();resolve(value);return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' ')value+=c;}}stdin.on('data',onData);});}
const password=await hiddenPassword(),entries=[],sessionAliases=new Map();
function alias(value){if(!sessionAliases.has(value))sessionAliases.set(value,'세션'+(sessionAliases.size+1));return '[가림:'+sessionAliases.get(value)+']';}
function redact(o){if(Array.isArray(o))return o.map(redact);if(o&&typeof o==='object')return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,/cookie/i.test(k)?alias(v):/password|token|secret|authorization|apikey/i.test(k)?'[가림]':redact(v)]));return o;}
async function send(label,method,path,body,cookie='',extra={}){
 const headers={...extra,...(body?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})};
 const response=await fetch(origin+path,{method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual'});const text=await response.text();let result;try{result=JSON.parse(text);}catch{result={message:'JSON 응답이 아닙니다.'};}
 entries.push({label,time:new Date().toISOString(),request:{method,path,headers:redact(headers),...(body?{body:redact(body)}:{})},response:{status:response.status,body:redact(result)}});
 const sessionCookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).find(v=>v.startsWith('pds_session='))||'';
 return {status:response.status,data:result,cookie:sessionCookie};
}
function expected(r,n){if(r.status!==n)throw new Error('Expected '+n+', got '+r.status+'. See masked evidence file.');return r;}
const save=(label,action,data,c)=>send(label,'POST','/api/diary',{action,data,request_id:randomUUID()},c);
const signup=email=>send('새 테스트 계정 가입','POST','/api/auth',{action:'signup',email,password});
const login=(email,p=password)=>send('로그인 성공','POST','/api/auth',{action:'login',email,password:p});
function same(a,b){const normalize=x=>{const y=structuredClone(x);delete y.exported_at;return JSON.stringify(y);};if(normalize(a)!==normalize(b))throw new Error('Other account data changed.');}
async function write(){await mkdir('local-data',{recursive:true});await writeFile('local-data/t07-auth-evidence.json',JSON.stringify(entries,null,2),{mode:0o600});const md=entries.map(e=>`### ${e.label}\n\n시각: ${e.time}\n\n요청과 응답:\n\n\`\`\`json\n${JSON.stringify({request:e.request,response:e.response},null,2)}\n\`\`\`\n`).join('\n');await writeFile('local-data/t07-auth-evidence.md',md,{mode:0o600});}
try{
 expected(await signup(emailA),201);expected(await signup(emailB),201);
 expected(await send('동일 이메일 중복 가입 거절','POST','/api/auth',{action:'signup',email:emailA,password}),409);
 const wrong=expected(await send('기존 이메일·틀린 비밀번호','POST','/api/auth',{action:'login',email:emailA,password:'incorrect-'+randomUUID()}),401);
 const missing=expected(await send('없는 이메일·비밀번호','POST','/api/auth',{action:'login',email:'absent-'+randomUUID()+'@example.com',password}),401);
 if(wrong.data.error!==missing.data.error)throw new Error('Login error messages differ.');
 let ca=expected(await login(emailA),200).cookie,cb=expected(await login(emailB),200).cookie;
 if(!ca||!cb)throw new Error('Session cookie missing.');
 const ua=expected(await send('A 본인 계정 확인','GET','/api/auth',null,ca),200).data.user,ub=expected(await send('B 본인 계정 확인','GET','/api/auth',null,cb),200).data.user;
 console.log('같은 비밀번호를 사용하는 bcrypt 비교용 계정 ID: A='+ua.id+' B='+ub.id);
 await write();const pause=createInterface({input:stdin,output:stdout});await pause.question('아직 두 계정의 비밀번호가 같을 때 Supabase SQL Editor에서 encrypted_password가 서로 다른지 기록하세요. 확인 후 Enter를 누르면 나머지 검사를 진행합니다: ');pause.close();
 const now=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
 async function seed(name,c){const p=expected(await save(name+' 본인 계획 생성','plan.save',{title:'[테스트] '+name+' 전용',start_date:now,end_date:now,priority:1,success_criteria:'계정 분리 검사',estimated_minutes:10},c),200).data.id;const t=expected(await save(name+' 본인 할 일 생성','task.save',{plan_id:p,title:'[테스트] '+name+' 전용 할 일',due_date:now,priority:1,tags:['테스트'],estimated_minutes:10},c),200).data.id;return {p,t};}
 const a=await seed('A',ca),b=await seed('B',cb);
 for(const [name,c,other,otherCookie] of [['A→B',ca,b,cb],['B→A',cb,a,ca]]){
 const before=expected(await send(name+' 상대 자료 검사 전','GET','/api/diary',null,otherCookie),200).data;
 expected(await send(name+' 읽기 거절','GET','/api/diary?kind=task&id='+other.t,null,c),404);
 expected(await save(name+' 수정 거절','task.save',{id:other.t,revision:1,title:'침범',due_date:now,priority:1,tags:[],estimated_minutes:1},c),404);
 expected(await save(name+' 삭제 거절','task.delete',{id:other.t},c),404);
 expected(await save(name+' 상대 계획에 생성 거절','task.save',{plan_id:other.p,title:'침범',due_date:now,priority:1,tags:[],estimated_minutes:1},c),404);
 const after=expected(await send(name+' 상대 자료 검사 후','GET','/api/diary',null,otherCookie),200).data;same(before,after);
 const list=expected(await send(name+' 본인 목록만 반환','GET','/api/diary',null,c),200).data;
 if(list.tasks.some(t=>t.id===other.t)||list.plans.some(p=>p.id===other.p))throw new Error('Other account in list.');
 }
 expected(await send('본인 한 건 조회 성공','GET','/api/diary?kind=task&id='+a.t,null,ca),200);
 expected(await save('본인 할 일 수정 성공','task.save',{id:a.t,revision:1,title:'[테스트] A 수정 성공',due_date:now,priority:1,tags:[],estimated_minutes:10},ca),200);
 const removable=expected(await save('본인 삭제 검사 자료 생성','task.save',{plan_id:a.p,title:'[테스트] 본인 삭제 검사',due_date:now,priority:1,tags:[],estimated_minutes:1},ca),200).data.id;
 expected(await save('본인 할 일 삭제 성공','task.delete',{id:removable},ca),200);
 const clean=expected(await send('계정 위조 전 A 목록','GET','/api/diary',null,ca),200).data;
 const query=expected(await send('URL에 B 계정 위조','GET','/api/diary?owner_id='+ub.id,null,ca),200).data;same(clean,query);
 const header=expected(await send('헤더에 B 계정 위조','GET','/api/diary',null,ca,{'X-Owner-Id':ub.id}),200).data;same(clean,header);
 const bBefore=expected(await send('본문 위조 전 B 목록','GET','/api/diary',null,cb),200).data;
 expected(await save('본문에 B 계정 위조·본인에만 생성','task.save',{owner_id:ub.id,workspace_id:bBefore.workspaces[0].id,plan_id:a.p,title:'[테스트] 본문 위조 확인',due_date:now,priority:1,tags:[],estimated_minutes:10},ca),200);
 const bAfter=expected(await send('본문 위조 후 B 자료 동일','GET','/api/diary',null,cb),200).data;same(bBefore,bAfter);
 expected(await send('비로그인 직접 자료 요청 거절','GET','/api/diary'),401);
 const oldA=ca;expected(await send('로그아웃 직전 동일 요청 성공','GET','/api/diary',null,oldA),200);
 expected(await send('A 로그아웃','POST','/api/auth',{action:'logout'},oldA),200);
 expected(await send('로그아웃 후 같은 주소·방식·쿠키 재요청 거절','GET','/api/diary',null,oldA),401);
 ca=expected(await login(emailA),200).cookie;
 const oldPasswordCookie=ca,newPassword='T07-'+randomUUID();
 expected(await send('비밀번호 변경 전 동일 요청 성공','GET','/api/diary',null,oldPasswordCookie),200);
 expected(await send('비밀번호 변경','POST','/api/auth',{action:'password',current_password:password,new_password:newPassword},ca),200);
 expected(await send('비밀번호 변경 후 이전 쿠키 거절','GET','/api/diary',null,oldPasswordCookie),401);
 ca=expected(await login(emailA,newPassword),200).cookie;
 expected(await send('계정 삭제 전 본인 자료 성공','GET','/api/diary',null,cb),200);
 expected(await send('새 테스트 B 계정과 자료 삭제','POST','/api/auth',{action:'delete-account',current_password:password,confirmation:'계정 삭제'},cb),200);
 expected(await send('삭제한 계정의 이전 쿠키 거절','GET','/api/diary',null,cb),401);
 expected(await send('테스트 A 원래 비밀번호 복원','POST','/api/auth',{action:'password',current_password:newPassword,new_password:password},ca),200);
 console.log('배포 검사 통과. A는 남겨 두었고 B는 삭제했습니다. bcrypt 비교를 빠뜨렸다면 별도 테스트 계정 두 개로 확인하세요. 만료 검사는 1시간 뒤 같은 쿠키 재요청을 별도로 기록하세요.');
}finally{await write();console.log('가린 기록: local-data/t07-auth-evidence.md / .json');}
