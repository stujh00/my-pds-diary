const $=s=>document.querySelector(s);let action='login',busy=false;
function mode(next){action=next;$('#login-tab').classList.toggle('primary',next==='login');$('#signup-tab').classList.toggle('primary',next==='signup');$('#auth-submit').textContent=next==='login'?'로그인':'회원가입';$('#signup-help').hidden=next!=='signup';const p=$('[name=password]');p.value='';p.autocomplete=next==='login'?'current-password':'new-password';p.minLength=next==='signup'?10:1;$('#auth-error').textContent='';}
$('#login-tab').onclick=()=>{if(!busy)mode('login');};$('#signup-tab').onclick=()=>{if(!busy)mode('signup');};
$('#auth-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('#auth-submit').disabled=true;try{
 const c=Object.fromEntries(new FormData(e.target));const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...c})});
 const result=await response.json();if(!response.ok)throw new Error(result.error);
 $('[name=password]').value='';if(action==='login'){location.replace('/diary');return;}mode('login');$('#auth-error').textContent=result.message;
 }catch(e){$('#auth-error').textContent=e.message||'연결을 확인하고 다시 시도하세요.';}finally{busy=false;$('#auth-submit').disabled=false;}};
fetch('/api/auth',{cache:'no-store'}).then(r=>{if(r.ok)location.replace('/diary');}).catch(()=>{});
