export function fail(status,message){return Object.assign(new Error(message),{status});}
export function prepare(res){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');}
export function readJSON(req,max=24000){
 if(!req.headers['content-type']?.includes('application/json'))throw fail(415,'JSON 요청이 필요합니다.');
 const origin=req.headers.origin,host=req.headers.host;
 if(!origin)throw fail(403,'같은 사이트에서 요청해 주세요.');
 let u;try{u=new URL(origin);}catch{throw fail(403,'요청 출처를 확인하지 못했습니다.');}
 if(u.host!==host||!['https:','http:'].includes(u.protocol))throw fail(403,'다른 사이트에서 보낸 요청은 허용하지 않습니다.');
 if(req.headers['sec-fetch-site']==='cross-site')throw fail(403,'다른 사이트에서 보낸 요청은 허용하지 않습니다.');
 try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
 if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>max)throw new Error();return body;
 }catch{throw fail(400,'요청 형식이 올바르지 않습니다.');}
}
export function errorResponse(res,e){return res.status(e.status||500).json({error:e.status?e.message:'요청 처리에 실패했습니다. 잠시 후 다시 시도하세요.'});}
