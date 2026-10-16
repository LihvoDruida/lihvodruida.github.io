import {readdirSync} from 'node:fs';
// Purge retired sources even when this release was unpacked over an old checkout.
for(const old of ['src/app/sitemap.ts','src/app/api/bridge','src/app/api/media','legacy','_guides','_news','CNAME','requirements.txt','.github/workflows/update-data.yml','_data/guild.yml','_data/raids.yml'])rmSync(old,{recursive:true,force:true});
for(const name of readdirSync('scripts'))if(name.endsWith('.py'))rmSync(`scripts/${name}`);
import { cpSync, mkdirSync, rmSync } from 'node:fs';
mkdirSync('public',{recursive:true}); rmSync('public/assets',{recursive:true,force:true});
cpSync('assets','public/assets',{recursive:true,filter:p=>!p.endsWith('.bak')});
cpSync('favicon.ico','public/favicon.ico');
