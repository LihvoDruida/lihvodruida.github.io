import { cpSync, mkdirSync, rmSync } from 'node:fs';
mkdirSync('public',{recursive:true}); rmSync('public/assets',{recursive:true,force:true});
cpSync('assets','public/assets',{recursive:true,filter:p=>!p.endsWith('.bak')});
cpSync('favicon.ico','public/favicon.ico');
