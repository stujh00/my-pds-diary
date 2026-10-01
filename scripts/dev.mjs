import http from 'node:http';import {readFile} from 'node:fs/promises';
import diary from '../api/diary.js';import auth from '../api/auth.js';
const types={html:'text/html; charset=utf-8',js:'text/javascript',css:'text/css',svg:'image/svg+xml'};
http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 const handler={'/api/diary':diary,'/api/auth':auth}[path];
 if(handler){let body='';for await(const chunk of req){body+=chunk;if(body.length>25000){res.writeHead(413);res.end();return;}}
 req.body=body;res.status=n=>{res.statusCode=n;return res;};res.json=x=>res.end(JSON.stringify(x));return handler(req,res);}
 const names=['/index.html','/app.js','/domain.js','/style.css','/favicon.svg','/login.html','/auth-ui.js'];
 const file=['/','/login'].includes(path)?'/login.html':path==='/diary'?'/index.html':path;
 if(!names.includes(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',types[file.split('.').pop()]);res.setHeader('Cache-Control','no-store');
 res.end(await readFile(new URL('../public'+file,import.meta.url)));
 }catch{res.writeHead(500);res.end('Server error');}
}).listen(3000,'0.0.0.0',()=>console.log('http://localhost:3000'));
