import fs from 'node:fs';
import path from 'node:path';
const empty=()=>({users:[],groups:[],messages:[],blocks:[],reports:[],devices:[],notificationPrefs:[],notifications:[]});
export function jsonStorage(file){return {
  load(){if(!fs.existsSync(file))return empty();return JSON.parse(fs.readFileSync(file,'utf8'))},
  save(data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(tmp,file)}
}}
