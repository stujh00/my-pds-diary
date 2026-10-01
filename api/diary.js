import {rpc} from '../lib/db.js';
import {user} from '../lib/auth.js';
import {prepare,readJSON,fail,errorResponse} from '../lib/http.js';
const actions=new Set(['plan.save','task.save','task.delete','task.complete','task.reopen','session.add','review.save','observation.start','observation.day','observation.rule']);
export default async function handler(req,res){
 prepare(res);try{
 // Also checked again inside every RPC, under a DB lock, to avoid logout/write races.
 const u=await user(req);
 if(req.method==='GET'){
 const url=new URL(req.url,'http://localhost');
 if(url.searchParams.has('id')){
 const id=url.searchParams.get('id'),kind=url.searchParams.get('kind');
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||!['task','plan'].includes(kind))throw fail(400,'조회 형식을 확인하세요.');
 return res.status(200).json(await rpc('pds_read',{p_kind:kind,p_id:id,p_session_hash:u.hash}));
 }
 // owner/user parameters and headers have no influence over the trusted session owner.
 return res.status(200).json(await rpc('pds_snapshot',{p_session_hash:u.hash}));
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw fail(405,'지원하지 않는 요청입니다.');}
 const body=readJSON(req);
 if(!actions.has(body.action)||!body.data||typeof body.data!=='object'||Array.isArray(body.data)||! /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.request_id))throw fail(400,'요청 형식이 올바르지 않습니다.');
 const name=body.action.startsWith('observation.')?'pds_observe':'pds_mutate';
 return res.status(200).json(await rpc(name,{p_action:body.action,p_data:body.data,p_request_id:body.request_id,p_session_hash:u.hash}));
 }catch(e){return errorResponse(res,e);}
}
