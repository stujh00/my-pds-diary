import {execFileSync} from 'node:child_process';import {readFile,readdir} from 'node:fs/promises';
const suspicious=/sb_secret_[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const values=['SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'].map(k=>process.env[k]).filter(v=>v&&v.length>15&&!v.includes('YOUR_'));
const issues=[];function inspect(text,label){if(suspicious.test(text)||values.some(v=>text.includes(v)))issues.push(label);suspicious.lastIndex=0;}
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
for(const p of paths)inspect(await readFile(p,'utf8'),'source:'+p);
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const p=dir+'/'+entry.name;if(entry.isDirectory())await walk(p);else inspect(await readFile(p,'utf8'),'build:'+p);}}await walk('dist');
for(const rev of execFileSync('git',['rev-list','--all'],{encoding:'utf8'}).trim().split('\n').filter(Boolean)){
 const files=execFileSync('git',['ls-tree','-r','--name-only',rev],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 for(const p of files)inspect(execFileSync('git',['show',rev+':'+p],{encoding:'utf8',maxBuffer:8*1024*1024}),'history:'+rev.slice(0,8)+':'+p);
}
if(issues.length){console.error('Potential secret matches (values hidden):\n'+[...new Set(issues)].join('\n'));process.exitCode=1;}else console.log('No known server key values or secret-key/JWT patterns found in source, dist or all local Git commits. This does not replace live response/console/deployment inspection.');
