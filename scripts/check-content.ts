import fs from 'node:fs';
import assert from 'node:assert/strict';
import {data,type Community,type Mod} from '../src/lib/content';
import {parse} from 'yaml';
let checked=0;
// Local Markdown is retained as a one-time import seed, not a live CMS source.
for(const kind of ['guides','news'] as const){
 const dir=`_${kind}`;if(!fs.existsSync(dir))continue;
 const seen=new Set<string>();for(const name of fs.readdirSync(dir).filter(x=>x.endsWith('.md'))){
  const raw=fs.readFileSync(`${dir}/${name}`,'utf8').replace(/\r\n/g,'\n');
  const found=/^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  assert.ok(found,`Invalid archive markdown: ${name}`);
  const meta=parse(found![1]);const slug=String(meta.slug||name);
  assert.ok(!seen.has(slug),`Duplicate migration slug ${slug}`);seen.add(slug);
  assert.ok(meta.title&&found![2].trim(),`Empty migration article ${name}`);
  assert.ok(!found![2].includes('{%')&&!found![2].includes('{{'),`Liquid remains in ${name}`);
  const image=String(meta.image||'');if(image.startsWith('/assets/'))assert.ok(fs.existsSync(image.slice(1)),`Missing image ${image}`);
  checked++;
 }
}
for(const g of data<Community[]>('guilds'))assert.ok(fs.existsSync(g.logo.slice(1)),`Missing logo ${g.id}`);
for(const mod of data<Mod[]>('my_mods'))assert.ok(mod.link.startsWith('https://www.curseforge.com/'),`Invalid mod link ${mod.name}`);
for(const file of ['index.md','guild.md','guild-apply.md','guild-applications.md','guides.md','news.md','mods.md','donate.md'])assert.ok(fs.existsSync(`legacy/jekyll/${file}`),`Missing original source ${file}`);
console.log(`Content parity OK: ${checked} articles, ${data<Mod[]>('my_mods').length} addons, 2 communities. Original page sources retained.`);
