import assert from 'node:assert/strict';
const decode=value=>value.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const attributes=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match=>[match[1],decode(match[2])]));
export function auditPageSeo(html,path,{index=true,article=false}={}){
 const tags=[...html.matchAll(/<meta\b[^>]*>/g)].map(match=>attributes(match[0]));
 const get=name=>tags.find(tag=>tag.name===name||tag.property===name)?.content;
 const links=[...html.matchAll(/<link\b[^>]*>/g)].map(match=>attributes(match[0]));
 const canonical=links.find(link=>link.rel==='canonical')?.href;
 const title=decode(/<title>([^<]*)<\/title>/.exec(html)?.[1]||'');
 assert.ok(title.length>12,`${path}: title`);assert.ok((get('description')||'').length>30,`${path}: description`);
 assert.ok(canonical,`${path}: canonical exists`);assert.equal(new URL(canonical).href,`https://lihvodruida.pp.ua${path==='/'?'/':path}`,`${path}: canonical`);
 assert.equal(new URL(get('og:url')).href,new URL(canonical).href,`${path}: OG URL`);assert.equal(get('og:title'),title,`${path}: OG title`);assert.equal(get('og:description'),get('description'));
 assert.equal(get('twitter:card'),'summary_large_image');assert.equal(get('twitter:title'),title);assert.ok(get('og:image')?.startsWith('https://lihvodruida.pp.ua/'));
 assert.ok(html.includes('<html lang="uk"'));assert.equal([...html.matchAll(/<h1(?:\s|>)/g)].length,1,`${path}: one H1`);
 if(index)assert.ok(!/noindex/.test(get('robots')||''),`${path}: crawlable`);else assert.ok(/noindex/.test(get('robots')||''),`${path}: noindex`);
 const schemas=[...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(match=>JSON.parse(match[1]));
 const graph=schemas.flatMap(schema=>schema['@graph']||[schema]);
 assert.ok(graph.some(node=>node['@type']==='WebSite'),`${path}: WebSite schema`);
 if(index){
  assert.ok(graph.some(node=>['WebPage','AboutPage','CollectionPage'].includes(node['@type'])),`${path}: page schema`);
  if(path!=='/')assert.ok(graph.some(node=>node['@type']==='BreadcrumbList'),`${path}: breadcrumbs`);
 }
 if(article){assert.equal(get('og:type'),'article');const item=graph.find(node=>['Article','BlogPosting'].includes(node['@type']));assert.ok(item?.headline&&item.datePublished&&item.dateModified,`${path}: article schema`);}
 return {title,description:get('description'),graph};
}
