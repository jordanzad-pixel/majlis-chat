import fs from 'node:fs';
import pg from 'pg';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{await pool.query(fs.readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));console.log('Schema applied')}finally{await pool.end()}
