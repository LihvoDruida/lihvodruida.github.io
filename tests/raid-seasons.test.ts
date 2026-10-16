import './fixtures';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {guild} from './fixtures';
import {isGuild,type Guild} from '../src/lib/contracts';
import {raidSeasonView} from '../src/lib/raid-season-view';
const example:Guild={...guild,raid_seasons:{current_season_id:'new',seasons:[{id:'new',label:'Current',expansion:'Midnight',current:true,raids:['unknown']},{id:'old',label:'Previous',expansion:'The War Within',raids:['zero','zero','unknown']}],catalog:{unknown:{name:'Unverified',bosses:9},zero:{name:'Verified zero',bosses:8}}},raid_progression:{zero:{total_bosses:8,normal_bosses_killed:0,heroic_bosses_killed:0,mythic_bosses_killed:0}}};
test('season view distinguishes verified zero from unknown, deduplicates raids and preserves valid selection',()=>{
 assert.ok(isGuild(example));const view=raidSeasonView(example,'old');assert.equal(view.selected?.id,'old');assert.equal(view.cards.length,2);assert.equal(view.cards[0].progress?.mythic_bosses_killed,0);assert.equal(view.cards[1].progress,undefined);assert.equal(view.cards[1].total,9);assert.equal(view.pending,1);assert.equal(view.groups.length,2);
 assert.equal(raidSeasonView(example,'removed').selected?.id,'new');assert.equal(raidSeasonView({...example,raid_seasons:{...example.raid_seasons!,current_season_id:'missing'}},'').selected?.id,'new');
});
test('malformed season, history and counter payloads are rejected before React receives them',()=>{
 for(const change of [
  {raid_seasons:{...example.raid_seasons,seasons:[{id:'x',label:'Bad',raids:['r'],expansion:{bad:true}}]}},
  {raid_seasons:{...example.raid_seasons,seasons:[{id:'x',label:'A',raids:[]},{id:'x',label:'B',raids:[]}]}},
  {raid_progression:{r:{total_bosses:8,normal_bosses_killed:0,heroic_bosses_killed:0,mythic_bosses_killed:9}}},
  {raid_progression:{r:{total_bosses:8,normal_bosses_killed:0,heroic_bosses_killed:0,mythic_bosses_killed:1.5}}},
  {raid_progression:{r:{...example.raid_progression.zero,stale:'false'}}},
  {metadata:{updated_at:'now',raid_history:{state:'ready',known:-1,pending:0,failed:0}}},
 ])assert.equal(isGuild({...example,...change}),false);
});
const root=process.env.PAIRED_DASHBOARD_ROOT;
test('actual dashboard resolver, stored progress and public serializer round-trip into site history',{skip:!root},async()=>{
 const require=createRequire(import.meta.url),load=require(path.join(root!,'scripts/lib/load-server-ts.cjs')),fixture=require(path.join(root!,'scripts/lib/raid-season-fixture.cjs'));
 const f=fixture(),snapshot=await f.resolver.resolveRaidSeasonSnapshot();
 const store=load('src/lib/guildRaidHistoryStore.ts',{'@/lib/documentDb':{}},f.globals).exports;
 const roster=f.roster(store),stats=roster.context.buildStats({guildSummary:{},raiderGuild:f.read('guild'),members:[],updatedAt:new Date(f.now()).toISOString(),configuredGuildName:'Mistblossom Vanguard',configuredRealmSlug:'terokkar',raidSeasonSnapshot:snapshot});
 const base=store.applyGuildRaidHistory({members:[],source:'postgres-records',stats});
 const bridge=load('src/lib/publicSiteBridge.ts',{'@/lib/guildRoster':{loadStoredGuildRosterData:async()=>base},'@/lib/raids':{listRaids:async()=>[]},'@/lib/security':{}},f.globals).exports;
 const result=await bridge.buildPublicGuildSnapshot();assert.ok(isGuild(result));
 const view=raidSeasonView(result,'mn-1'),tier=view.cards.find(card=>card.slug==='tier-mn-1');assert.equal(tier?.progress?.mythic_bosses_killed,2);assert.equal(tier?.total,9);
 const historic=raidSeasonView(result,'tww-1');assert.ok(historic.cards.some(card=>card.slug==='nerubar-palace'));assert.equal(historic.cards.find(card=>card.slug==='nerubar-palace')?.progress,undefined);
 assert.equal(result.metadata.raid_history?.state,'partial');
});
