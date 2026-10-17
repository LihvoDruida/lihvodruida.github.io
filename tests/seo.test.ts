import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Article} from '../src/lib/content';
import {SEO_PAGES,staticMetadata,articleMetadata,articleDescription,articleDates,articleSchema,serializeSchema,pageMetadata,absoluteUrl} from '../src/lib/seo';
import {sitemapXml} from '../src/lib/sitemap';
import robots from '../src/app/robots';
const article:Article={kind:'guides',slug:'guide-for-wow',title:'Міфічні ключі українською',description:'Поради для Mythic+.',image:'/assets/img/og-image-default.webp',date:'2026-10-16',updatedAt:'2026-10-17T07:00:00Z',author:'Sebas',tags:['WoW','Mythic+'],body:'# Початок\nПрактичні поради для українських гравців.'};
test('every public landing has its own description, canonical and complete social preview',()=>{
 const titles=new Set(),descriptions=new Set();
 for(const path of Object.keys(SEO_PAGES) as (keyof typeof SEO_PAGES)[]){
  const meta=staticMetadata(path);titles.add(JSON.stringify(meta.title));descriptions.add(meta.description);
  assert.ok(meta.description&&meta.description.length>75);assert.equal(meta.alternates?.canonical,absoluteUrl(path));
  assert.equal((meta.robots as {index:boolean}).index,true);assert.equal(meta.openGraph?.url,absoluteUrl(path));assert.equal(meta.openGraph?.description,meta.description);assert.equal(meta.twitter?.description,meta.description);
 }
 assert.equal(titles.size,7);assert.equal(descriptions.size,7);
});
test('article preview and schema share actual content, authors and publication/update dates',()=>{
 const meta=articleMetadata(article),schema=articleSchema(article),item=schema['@graph'][1];assert.ok('headline' in item);
 assert.equal(meta.description,article.description);assert.equal(item.headline,article.title);assert.equal(item.datePublished,'2026-10-16T00:00:00.000Z');assert.equal(item.dateModified,'2026-10-17T07:00:00.000Z');
 assert.deepEqual(item.author,{'@type':'Person',name:'Sebas'});assert.ok(meta.openGraph&&'type' in meta.openGraph);assert.equal(meta.openGraph.type,'article');
 assert.equal(schema['@graph'].at(-1)?.['@type'],'BreadcrumbList');assert.equal(articleSchema({...article,kind:'news'})['@graph'][1]['@type'],'BlogPosting');
});
test('empty CMS descriptions become readable excerpts and invalid modification dates do not produce fake freshness',()=>{
 const empty={...article,description:'',body:'# Корисний гайд\n**Mythic+** з [друзями](/guild) ![image](/image.png)'};
 assert.equal(articleDescription(empty),'Корисний гайд Mythic+ з друзями');
 assert.ok(articleDescription({...empty,body:'Слово '.repeat(100)}).length<=175);
 for(const date of ['broken','2001-01-01'])assert.equal(articleDates({...article,updatedAt:date}).modified,'2026-10-16T00:00:00.000Z');
});
test('CMS script delimiters and HTML characters cannot escape structured data',()=>{
 const dangerous={...article,title:'</script><script>alert(1)</script> & <tag>'},serialized=serializeSchema(articleSchema(dangerous));
 assert.equal(serialized.includes('<'),false);assert.equal(serialized.includes('&'),false);assert.equal(JSON.parse(serialized)['@graph'][1].headline,dangerous.title);
});
test('sitemap contains canonical public pages, real article dates and crawlable covers, excluding application status',()=>{
 const xml=sitemapXml([article]);assert.ok(xml.includes(absoluteUrl('/guild')));assert.ok(xml.includes(absoluteUrl('/guides/guide-for-wow')));assert.ok(xml.includes('<lastmod>2026-10-17T07:00:00.000Z</lastmod>'));assert.ok(xml.includes('<image:loc>'));
 assert.equal(xml.includes('/guild/applications'),false);assert.equal(xml.includes('<priority>'),false);
});
test('noindex pages remain crawlable so search engines can read the exclusion; media is not blocked',()=>{
 const rules=robots().rules as {disallow:string[]};assert.equal(rules.disallow.includes('/guild/applications'),false);assert.equal(rules.disallow.some(path=>'/site-api/v1/media/abc'.startsWith(path)),false);
 const meta=pageMetadata('/guild/applications','Статуси заявок','Перевірка статусу заявки.',undefined,true);
 assert.equal((meta.robots as {index:boolean}).index,false);assert.equal((meta.robots as {googleBot:{index:boolean}}).googleBot.index,false);
});
test('SEO canonical URLs cannot point to a different host or a tracking query',()=>{
 for(const path of ['https://evil.example/path','//evil.example/path','/guild?tracking=1'])assert.throws(()=>absoluteUrl(path));
});
