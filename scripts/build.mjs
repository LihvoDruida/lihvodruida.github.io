import { spawnSync } from 'node:child_process';
import { rmSync, cpSync, existsSync } from 'node:fs';
rmSync('.next/standalone',{recursive:true,force:true});
const result=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'],{stdio:'inherit',env:process.env});
if(result.status!==0) process.exit(result.status||1);
// Standalone output is independently runnable and contains the current public assets.
for(const name of ['public','_data','_guides','_news']) if(existsSync(name)) cpSync(name,`.next/standalone/${name}`,{recursive:true});
cpSync('.next/static','.next/standalone/.next/static',{recursive:true});
