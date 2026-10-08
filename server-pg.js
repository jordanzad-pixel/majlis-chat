import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required for PostgreSQL mode');
const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000,options:'-c search_path=majlis_app,pg_catalog',ssl:process.env.PGSSL==='require'?{rejectUnauthorized:true}:undefined});
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const id=()=>crypto.randomUUID();
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const passwordHash=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');
const json=async req=>{let chunks=[],n=0;for await(const c of req){n+=c.length;if(n>20000){const e=new Error('too large');e.status=413;throw e}chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{const e=new Error('invalid JSON');e.status=400;throw e}};
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
const authToken=req=>(req.headers.authorization||'').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
async function auth(req){const token=authToken(req);if(!token)return null;const {rows}=await pool.query('SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hash(token)]);return rows[0]||null}
const attempts=new Map();
function rateLimit(req){const ip=req.socket.remoteAddress||'unknown',t=Date.now();for(const [k,v] of attempts)if(t-v.at>900000)attempts.delete(k);const v=attempts.get(ip)||{at:t,n:0};v.n++;attempts.set(ip,v);return v.n>30}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
const p=new URL(req.url,'http://localhost').pathname;
try{
if(p==='/healthz'){await pool.query('SELECT 1');return send(res,200,{ok:true,storage:'postgresql'})}
if(req.method==='POST'&&(p==='/api/login'||p==='/api/register')&&rateLimit(req))return send(res,429,{error:'محاولات كثيرة، حاول لاحقًا'});
if(p==='/api/register'&&req.method==='POST'){const b=await json(req),name=String(b.name||'').trim().slice(0,40),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');if(!name||!/^\S+@\S+\.\S+$/.test(email)||password.length<10)return send(res,400,{error:'تحقق من الاسم والبريد وكلمة المرور'});const salt=crypto.randomBytes(16).toString('hex');try{await pool.query('INSERT INTO users(id,name,email,salt,password_hash) VALUES($1,$2,$3,$4,$5)',[id(),name,email,salt,passwordHash(password,salt)])}catch(e){if(e.code==='23505')return send(res,409,{error:'البريد مسجل'});throw e}return send(res,201,{ok:true})}
if(p==='/api/login'&&req.method==='POST'){const b=await json(req);const {rows}=await pool.query('SELECT * FROM users WHERE email=$1',[String(b.email||'').toLowerCase()]);const user=rows[0];const derived=passwordHash(String(b.password||''),user?.salt||'00000000000000000000000000000000');if(!user||!crypto.timingSafeEqual(Buffer.from(derived,'hex'),Buffer.from(user.password_hash,'hex')))return send(res,401,{error:'بيانات الدخول غير صحيحة'});const token=crypto.randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hash(token),user.id]);return send(res,200,{token,user:{id:user.id,name:user.name}})}
if(p.startsWith('/api/')){const user=await auth(req);if(!user)return send(res,401,{error:'يجب تسجيل الدخول'});
if(p==='/api/me'&&req.method==='GET')return send(res,200,user);
if(p==='/api/logout'&&req.method==='POST'){await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(authToken(req))]);return send(res,200,{ok:true})}
if(p==='/api/rooms'&&req.method==='GET'){const {rows}=await pool.query('SELECT r.id,r.name FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE m.user_id=$1 ORDER BY r.created_at DESC',[user.id]);return send(res,200,rows)}
if(p==='/api/rooms'&&req.method==='POST'){const b=await json(req),name=String(b.name||'').trim().slice(0,60);if(!name)return send(res,400,{error:'اسم المجموعة مطلوب'});const roomId=id(),client=await pool.connect();try{await client.query('BEGIN');await client.query('INSERT INTO rooms(id,name,owner_id) VALUES($1,$2,$3)',[roomId,name,user.id]);await client.query('INSERT INTO room_members(room_id,user_id) VALUES($1,$2)',[roomId,user.id]);await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}return send(res,201,{id:roomId,name})}
const match=p.match(/^\/api\/rooms\/([a-f0-9-]+)\/(messages|members)$/);if(match){const roomId=match[1];const {rows}=await pool.query('SELECT r.owner_id FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2',[roomId,user.id]);if(!rows.length)return send(res,404,{error:'المجموعة غير متاحة'});
if(match[2]==='members'&&req.method==='POST'){if(rows[0].owner_id!==user.id)return send(res,403,{error:'للمالك فقط'});const b=await json(req);const q=await pool.query('SELECT id FROM users WHERE email=$1',[String(b.email||'').trim().toLowerCase()]);if(!q.rows.length)return send(res,404,{error:'المستخدم غير موجود'});await pool.query('INSERT INTO room_members(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[roomId,q.rows[0].id]);return send(res,200,{ok:true})}
if(match[2]==='messages'&&req.method==='GET'){const q=await pool.query('SELECT m.id,m.room_id AS "roomId",m.user_id AS "userId",m.body AS text,m.created_at AS "createdAt",u.name AS author FROM messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 100',[roomId]);return send(res,200,q.rows.reverse())}
if(match[2]==='messages'&&req.method==='POST'){const b=await json(req),message=String(b.text||'').trim().slice(0,3000);if(!message)return send(res,400,{error:'الرسالة فارغة'});const q=await pool.query('INSERT INTO messages(id,room_id,user_id,body) VALUES($1,$2,$3,$4) RETURNING id,room_id AS "roomId",user_id AS "userId",body AS text,created_at AS "createdAt"',[id(),roomId,user.id,message]);return send(res,201,{...q.rows[0],author:user.name})}}
return send(res,404,{error:'غير موجود'})}
if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'غير مسموح'});
const base=path.join(root,'public'),file=path.resolve(base,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,{error:'غير موجود'});res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",'cache-control':'no-cache'});fs.createReadStream(file).pipe(res)
}catch(e){console.error('Request error',e.code||e.message);send(res,e.status||500,{error:e.status?'طلب غير صالح':'خطأ في الخادم'})}});
await pool.query('SELECT 1');
server.listen(port,'0.0.0.0',()=>console.log('Majlis PostgreSQL server listening on '+port));
