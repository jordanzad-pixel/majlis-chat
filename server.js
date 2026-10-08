import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const dataFile=process.env.MAJLIS_DATA_FILE||path.join(root,'data','db.json');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const id=()=>crypto.randomUUID();
const empty=()=>({users:[],rooms:[],messages:[],sessions:[]});
let db;
try{db=JSON.parse(fs.readFileSync(dataFile,'utf8'))}catch{db=empty()}
const save=()=>{fs.mkdirSync(path.dirname(dataFile),{recursive:true});const tmp=dataFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db),{mode:0o600});fs.renameSync(tmp,dataFile)};
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
const json=async req=>{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)throw Error('too large')}try{return JSON.parse(raw||'{}')}catch{throw Error('invalid JSON')}};
const passHash=(password,salt)=>crypto.scryptSync(password,salt,64).toString('hex');
const tokenFor=req=>{const h=(req.headers.authorization||'').match(/^Bearer (.+)$/);return h?.[1]};
const userFor=req=>{const t=tokenFor(req);const session=db.sessions.find(s=>s.hash===hash(t||'')&&s.until>Date.now());return db.users.find(u=>u.id===session?.userId)};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');const p=u.pathname;
try{
if(p==='/healthz')return send(res,200,{ok:true});
if(p==='/api/register'&&req.method==='POST'){const b=await json(req);const name=String(b.name||'').trim().slice(0,40),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');if(!name||!/^\S+@\S+\.\S+$/.test(email)||password.length<10)return send(res,400,{error:'تحقق من البيانات وكلمة المرور (10 أحرف على الأقل)'});if(db.users.some(x=>x.email===email))return send(res,409,{error:'البريد مسجل'});const salt=crypto.randomBytes(16).toString('hex');db.users.push({id:id(),name,email,salt,passwordHash:passHash(password,salt)});save();return send(res,201,{ok:true})}
if(p==='/api/login'&&req.method==='POST'){const b=await json(req);const user=db.users.find(x=>x.email===String(b.email||'').toLowerCase());if(!user||!crypto.timingSafeEqual(Buffer.from(user.passwordHash,'hex'),Buffer.from(passHash(String(b.password||''),user.salt),'hex')))return send(res,401,{error:'بيانات الدخول غير صحيحة'});const token=crypto.randomBytes(32).toString('hex');db.sessions.push({hash:hash(token),userId:user.id,until:Date.now()+7*86400000});save();return send(res,200,{token,user:{id:user.id,name:user.name}})}
const user=userFor(req);
if(p.startsWith('/api/')){if(!user)return send(res,401,{error:'يجب تسجيل الدخول'});
if(p==='/api/me')return send(res,200,{id:user.id,name:user.name});
if(p==='/api/logout'&&req.method==='POST'){db.sessions=db.sessions.filter(s=>s.hash!==hash(tokenFor(req)));save();return send(res,200,{ok:true})}
if(p==='/api/rooms'&&req.method==='GET')return send(res,200,db.rooms.filter(r=>r.members.includes(user.id)).map(r=>({id:r.id,name:r.name})));
if(p==='/api/rooms'&&req.method==='POST'){const b=await json(req);const name=String(b.name||'').trim().slice(0,60);if(!name)return send(res,400,{error:'اسم المجموعة مطلوب'});const room={id:id(),name,members:[user.id],owner:user.id};db.rooms.push(room);save();return send(res,201,{id:room.id,name})}
const match=p.match(/^\/api\/rooms\/([^/]+)\/(messages|members)$/);if(match){const room=db.rooms.find(r=>r.id===match[1]&&r.members.includes(user.id));if(!room)return send(res,404,{error:'المجموعة غير متاحة'});if(match[2]==='members'&&req.method==='POST'){if(room.owner!==user.id)return send(res,403,{error:'للمالك فقط'});const b=await json(req);const invited=db.users.find(x=>x.email===String(b.email||'').toLowerCase());if(!invited)return send(res,404,{error:'المستخدم غير موجود'});if(!room.members.includes(invited.id))room.members.push(invited.id);save();return send(res,200,{ok:true})}
if(match[2]==='messages'&&req.method==='GET')return send(res,200,db.messages.filter(m=>m.roomId===room.id).slice(-100).map(m=>({...m,author:db.users.find(x=>x.id===m.userId)?.name||'مستخدم'})));
if(match[2]==='messages'&&req.method==='POST'){const b=await json(req);const text=String(b.text||'').trim().slice(0,3000);if(!text)return send(res,400,{error:'الرسالة فارغة'});const m={id:id(),roomId:room.id,userId:user.id,text,createdAt:new Date().toISOString()};db.messages.push(m);save();return send(res,201,{...m,author:user.name})}}
return send(res,404,{error:'غير موجود'})}
if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'غير مسموح'});
const pathname=p==='/'?'/index.html':p;const base=path.join(root,'public');const file=path.resolve(base,'.'+pathname);if(!file.startsWith(base+path.sep))return send(res,403,{error:'مرفوض'});if(!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,{error:'غير موجود'});res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",'cache-control':'no-cache'});fs.createReadStream(file).pipe(res)
}catch(e){send(res,e.message==='too large'?413:400,{error:e.message==='too large'?'الطلب كبير جدًا':'طلب غير صالح'})}});
server.listen(port,'0.0.0.0',()=>console.log('Majlis listening on '+port));
