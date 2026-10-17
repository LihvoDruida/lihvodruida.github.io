import {cache} from 'react';
import {data,type Community} from './content';
import {guildSnapshot} from './bridge';
import {absoluteUrl,pageMetadata,pageSchema} from './seo';

export const guildLanding=cache(async()=>{
 const community=data<Community[]>('guilds').find(g=>g.id==='mistblossom');
 if(!community)throw new Error('Guild community is not configured');
 const snapshot=await guildSnapshot().catch(()=>undefined);
 const name=snapshot?.data.guild.name||community.name;
 const realm=snapshot?.data.guild.realm.name||community.details.find(d=>d.label==='Реалм')?.value.replace(/^EU\s*·\s*/,'')||'';
 const description=`${name} — українська гільдія World of Warcraft${realm?` на EU · ${realm}`:''}. Рейди, Mythic+, склад, прогрес і заявка на вступ до спільноти.`;
 return {community,snapshot,name,realm,description};
});
export async function guildMetadata(){const g=await guildLanding();return pageMetadata('/guild',`${g.name} — українська гільдія WoW`,g.description);}
export function guildSchema(g:Awaited<ReturnType<typeof guildLanding>>){
 const schema=pageSchema('/guild','AboutPage');
 const guildId=`${absoluteUrl('/guild')}#organization`;
 return {...schema,'@graph':[
  {...schema['@graph'][0],name:`${g.name} — українська гільдія WoW`,description:g.description,about:{'@id':guildId}},
  ...schema['@graph'].slice(1),
  {'@type':'Organization','@id':guildId,name:g.name,description:g.description,url:absoluteUrl('/guild'),logo:absoluteUrl(g.community.logo),knowsAbout:['World of Warcraft','Mythic+','Рейди WoW'],sameAs:[g.community.discord,g.snapshot?.data.guild.profile_url].filter((value):value is string=>typeof value==='string'&&/^https:\/\//.test(value))},
 ]};
}
