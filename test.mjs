import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'majlis-ci-'));
const port=23000+Math.floor(Math.random()*20000);
const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),MAJLIS_DATA_FILE:path.join(dir,'db.json')},stdio:'ignore'});
const request=async(p,method='GET',body,token)=>{const r=await fetch(base+p,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return [r.status,await r.json()]};
try{
let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(base+'/healthz');if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}
test('health endpoint',()=>assert.ok(ready));
test('register, login, private room and messages',async()=>{assert.ok(ready);const email='tester-'+Date.now()+'@example.test';let [status]=await request('/api/register','POST',{name:'Tester',email,password:'a-safe-password-123'});assert.equal(status,201);const [loginStatus,login]=await request('/api/login','POST',{email,password:'a-safe-password-123'});assert.equal(loginStatus,200);assert.ok(login.token);const [unauth]=await request('/api/rooms');assert.equal(unauth,401);const [created,room]=await request('/api/rooms','POST',{name:'Test room'},login.token);assert.equal(created,201);const [sent]=await request('/api/rooms/'+room.id+'/messages','POST',{text:'Hello'},login.token);assert.equal(sent,201);const [got,messages]=await request('/api/rooms/'+room.id+'/messages','GET',undefined,login.token);assert.equal(got,200);assert.equal(messages[0].text,'Hello')});
test('private rooms reject other users and logged-out sessions',async()=>{
 const stamp=Date.now();
 const first='first-'+stamp+'@example.test',second='second-'+stamp+'@example.test';
 for(const email of [first,second]){const [code]=await request('/api/register','POST',{name:'Tester',email,password:'a-safe-password-123'});assert.equal(code,201)}
 const [,a]=await request('/api/login','POST',{email:first,password:'a-safe-password-123'});
 const [,b]=await request('/api/login','POST',{email:second,password:'a-safe-password-123'});
 const [,room]=await request('/api/rooms','POST',{name:'Private'},a.token);
 const [forbidden]=await request('/api/rooms/'+room.id+'/messages','GET',undefined,b.token);
 assert.equal(forbidden,404);
 const [inviteDenied]=await request('/api/rooms/'+room.id+'/members','POST',{email:first},b.token);
 assert.equal(inviteDenied,404);
 const [invite]=await request('/api/rooms/'+room.id+'/members','POST',{email:second},a.token);
 assert.equal(invite,200);
 const [allowed]=await request('/api/rooms/'+room.id+'/messages','GET',undefined,b.token);
 assert.equal(allowed,200);
 const [logout]=await request('/api/logout','POST',undefined,b.token);
 assert.equal(logout,200);
 const [afterLogout]=await request('/api/rooms/'+room.id+'/messages','GET',undefined,b.token);
 assert.equal(afterLogout,401);
});
test('rate limits repeated login attempts',async()=>{let status=0;for(let i=0;i<35;i++){[status]=await request('/api/login','POST',{email:'nobody@example.test',password:'wrong-password'})}assert.equal(status,429)});
}finally{after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true})});}
