// Optional: record deployed Supabase Auth build version without printing any keys.
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Set server-only environment variables first.');
const r=await fetch(url.replace(/\/$/,'')+'/auth/v1/health',{headers:{apikey:key},signal:AbortSignal.timeout(10000)});
if(!r.ok)throw new Error('Auth build version was not exposed. Record the exact SDK version from package-lock.json and note managed service build unavailable.');
const x=await r.json();console.log(JSON.stringify({name:typeof x.name==='string'?x.name:'Supabase Auth',version:typeof x.version==='string'?x.version:'not exposed'},null,2));
