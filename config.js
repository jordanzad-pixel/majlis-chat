import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
export const config={
  port:Number(process.env.PORT||3000),
  dataFile:path.resolve(root,process.env.MAJLIS_DATA_FILE||'./data/db.json'),
  publicUrl:process.env.MAJLIS_PUBLIC_URL||`http://localhost:${process.env.PORT||3000}`,
  env:process.env.NODE_ENV||'development'
};
