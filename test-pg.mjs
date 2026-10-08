import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import pg from 'pg';
const port=25000+Math.floor(Math.random()*15000);
const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['bootstrap.js'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let logs='';child.stderr.on('data',d=>logs+=d.toString());
after(()=>child.kill());
async function request(p,method='GET',body,token){const r=await fetch(base+p,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return [r.status,await r.json()]}
test('Majlis schema is isolated from public schema',async()=>{
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try{
 const q=await pool.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_name IN ('users','rooms','messages','room_members','sessions') AND table_schema='majlis_app'");
 assert.deepEqual(q.rows.map(x=>x.table_name).sort(),['messages','room_members','rooms','sessions','users']);
 }finally{await pool.end()}
});
test('PostgreSQL health, registration, membership, messages and logout',async()=>{
let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)break;try{const r=await fetch(base+'/healthz');if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
assert.ok(ready,'PostgreSQL server failed to start: '+logs);
const suffix=Date.now();
const a='alice-'+suffix+'@example.test',b='bob-'+suffix+'@example.test';
for(const email of [a,b]){const [status]=await request('/api/register','POST',{name:email===a?'Alice':'Bob',email,password:'safe-password-123'});assert.equal(status,201)}
const [aStatus,alice]=await request('/api/login','POST',{email:a,password:'safe-password-123'});assert.equal(aStatus,200);
const [bStatus,bob]=await request('/api/login','POST',{email:b,password:'safe-password-123'});assert.equal(bStatus,200);
const [roomStatus,room]=await request('/api/rooms','POST',{name:'Test room'},alice.token);assert.equal(roomStatus,201);
const [privateStatus]=await request('/api/rooms/'+room.id+'/messages','GET',undefined,bob.token);assert.equal(privateStatus,404);
const [invited]=await request('/api/rooms/'+room.id+'/members','POST',{email:b},alice.token);assert.equal(invited,200);
const [posted]=await request('/api/rooms/'+room.id+'/messages','POST',{text:'Hello PostgreSQL'},bob.token);assert.equal(posted,201);
const [listed,messages]=await request('/api/rooms/'+room.id+'/messages','GET',undefined,alice.token);assert.equal(listed,200);assert.equal(messages.length,1);assert.equal(messages[0].text,'Hello PostgreSQL');
const [loggedOut]=await request('/api/logout','POST',undefined,bob.token);assert.equal(loggedOut,200);
const [rejected]=await request('/api/rooms','GET',undefined,bob.token);assert.equal(rejected,401);
});
