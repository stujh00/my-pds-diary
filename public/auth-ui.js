const $=s=>document.querySelector(s);let action='login',busy=false;
// A fragment is never sent in a page request. Remove one-time email values
// immediately; do not persist them, log them, or accept a provider JWT as login.
function confirmation(){
 const fragment=new URLSearchParams(location.hash.slice(1));
 const emailToken=fragment.get('token_hash');
 const linkError=fragment.has('error')||fragment.has('error_code')||(fragment.has('token_hash')&&!emailToken);
 const legacyLink=fragment.has('access_token')||fragment.has('refresh_token');
 if(location.hash||location.search)history.replaceState(null,'',location.pathname);
 return {emailToken,linkError,legacyLink};
}
function notice(message,error=false){$('#auth-notice').hidden=false;$('#auth-notice').textContent=message;$('#auth-notice').classList.toggle('is-error',error);}
function lock(next){busy=next;for(const id of ['auth-submit','resend-confirmation','login-tab','signup-tab'])$('#'+id).disabled=next;}
function mode(next){action=next;$('#login-tab').classList.toggle('primary',next==='login');$('#signup-tab').classList.toggle('primary',next==='signup');$('#auth-submit').textContent=next==='login'?'로그인':'회원가입';$('#signup-help').hidden=next!=='signup';const p=$('[name=password]');p.value='';p.autocomplete=next==='login'?'current-password':'new-password';p.minLength=next==='signup'?10:1;$('#auth-error').textContent='';}
async function request(body){const response=await fetch('/api/auth',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||'요청을 처리하지 못했습니다. 다시 시도하세요.');return result;}
$('#login-tab').onclick=()=>{if(!busy)mode('login');};$('#signup-tab').onclick=()=>{if(!busy)mode('signup');};
$('#auth-form').onsubmit=async e=>{e.preventDefault();if(busy)return;lock(true);$('#auth-error').textContent='';try{
 const c=Object.fromEntries(new FormData(e.target));const result=await request({action,...c});
 $('[name=password]').value='';if(action==='login'){location.replace('/diary');return;}mode('login');notice(result.message);
 }catch(e){$('#auth-error').textContent=e.message||'연결을 확인하고 다시 시도하세요.';}finally{lock(false);}};
$('#resend-confirmation').onclick=async()=>{if(busy)return;const email=$('[name=email]');if(!email.reportValidity())return;lock(true);$('#auth-error').textContent='';try{const result=await request({action:'resend-confirmation',email:email.value});notice(result.message);}catch(e){$('#auth-error').textContent=e.message||'연결을 확인하고 다시 시도하세요.';}finally{lock(false);}};
async function initialize(){
 let {emailToken,linkError,legacyLink}=confirmation();if(busy)return;
 if(emailToken){lock(true);notice('이메일 인증을 확인하고 있습니다. 잠시만 기다려 주세요.');try{const result=await request({action:'confirm-email',token_hash:emailToken});notice(result.message);}catch(e){notice(e.message||'인증 결과를 확인하지 못했습니다. 메일의 링크를 다시 열어 주세요.',true);}finally{emailToken=null;lock(false);}return;}
 if(linkError){notice('인증 링크가 만료되었거나 이미 사용되었습니다. 먼저 로그인을 시도하고, 안 되면 인증 메일을 다시 받아 주세요.',true);return;}
 if(legacyLink){notice('가입 인증 링크에서 돌아왔습니다. 가입한 이메일과 비밀번호로 로그인해 주세요. 로그인이 안 되면 인증 메일을 다시 받아 주세요.');return;}
 fetch('/api/auth',{cache:'no-store'}).then(r=>{if(r.ok)location.replace('/diary');}).catch(()=>{});
}
addEventListener('hashchange',initialize);
initialize();
