import type {Guild} from '../src/lib/contracts';
export const guild:Guild={schema:'mistblossom.public-guild.v1',metadata:{updated_at:'2026-10-15T12:00:00Z'},guild:{name:'Test Guild',realm:{name:'Terokkar',slug:'terokkar'},member_count:1},members:[{rank:0,character:{name:'Sebas',realm:{slug:'terokkar'}}}],raid_progression:{}};
process.env.DASHBOARD_INTERNAL_URL='http://dashboard:3000';
process.env.PUBLIC_SITE_BRIDGE_TOKEN='a'.repeat(64);
export function syncFixtureResponse(input:string|URL|Request){
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.pathname!=='/api/site/sync')return null;
 return Response.json({schema:'mistblossom.public-sync.v1',resources:{content:'1'.repeat(32),guild:'2'.repeat(32),applications:'3'.repeat(32)},checked_at:new Date().toISOString()});
}
