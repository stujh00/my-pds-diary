import {rpc} from '../lib/db.js';
const actions=new Set(['plan.save','task.save','task.delete','task.complete','task.reopen','session.add','review.save']);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try {
 if(req.method==='GET')return res.status(200).json(await rpc('pds_snapshot'));
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'지원하지 않는 요청입니다.'});}
 const origin=req.headers.origin;const host=req.headers.host;
 if(origin&&new URL(origin).host!==host)return res.status(403).json({error:'다른 사이트에서 보낸 요청은 허용하지 않습니다.'});
 if(!req.headers['content-type']?.includes('application/json'))return res.status(415).json({error:'JSON 요청이 필요합니다.'});
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
 if(!body||JSON.stringify(body).length>24000||!actions.has(body.action)||!/^[0-9a-f-]{36}$/i.test(body.request_id))return res.status(400).json({error:'요청 형식이 올바르지 않습니다.'});
 const result=await rpc('pds_mutate',{p_action:body.action,p_data:body.data,p_request_id:body.request_id});
 return res.status(200).json(result);
 }catch(e){return res.status(e.status||400).json({error:e.status?e.message:'요청 처리에 실패했습니다. 입력값을 확인하세요.'});}
}
