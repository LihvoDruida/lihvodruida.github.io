import fs from 'node:fs';
import assert from 'node:assert/strict';
import {data,type Community,type Mod} from '../src/lib/content';
for(const g of data<Community[]>('guilds'))assert.ok(fs.existsSync(g.logo.slice(1)),`Missing logo ${g.id}`);
for(const mod of data<Mod[]>('my_mods'))assert.ok(mod.link.startsWith('https://www.curseforge.com/'),`Invalid mod link ${mod.name}`);
assert.ok(!fs.existsSync('legacy'),'Retired runtime must not ship');
console.log(`Content OK: ${data<Mod[]>('my_mods').length} addons, 2 communities; articles are owned by dashboard CMS.`);
