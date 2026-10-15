import fs from 'node:fs';
import assert from 'node:assert/strict';
import {articles,data,type Community,type Mod} from '../src/lib/content';
let checked=0;
for(const kind of ['guides','news'] as const){const seen=new Set<string>();for(const a of articles(kind)){assert.ok(!seen.has(a.slug),`Duplicate slug ${a.slug}`);seen.add(a.slug);assert.ok(a.title&&a.body.trim(),`Empty article ${a.slug}`);assert.ok(!a.body.includes('{%')&&!a.body.includes('{{'),`Unconverted Liquid in ${a.slug}`);if(a.image.startsWith('/assets/'))assert.ok(fs.existsSync(a.image.slice(1)),`Missing image ${a.image}`);checked++;}}
for(const g of data<Community[]>('guilds'))assert.ok(fs.existsSync(g.logo.slice(1)),`Missing logo ${g.id}`);
for(const mod of data<Mod[]>('my_mods'))assert.ok(mod.link.startsWith('https://www.curseforge.com/'),`Invalid mod link ${mod.name}`);
for(const file of ['index.md','guild.md','guild-apply.md','guild-applications.md','guides.md','news.md','mods.md','donate.md'])assert.ok(fs.existsSync(`legacy/jekyll/${file}`),`Missing original source ${file}`);
console.log(`Content parity OK: ${checked} articles, ${data<Mod[]>('my_mods').length} addons, 2 communities. Original page sources retained.`);
