const assert=require('node:assert/strict');
const {chromium}=require(process.env.SITE_QA_PLAYWRIGHT||require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
module.exports=async function run({base,changeGuild,accept,changeContent,unpublish,posts}){
 const browser=await chromium.launch({executablePath:process.env.SITE_QA_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 let page;
 async function auditArticleLifecycle(){
  await page.goto('https://lihvodruida.pp.ua/guides/runtime-guide');await page.getByText('Article from the dashboard CMS.',{exact:true}).waitFor();await page.evaluate(()=>{window.__contentMarker='preserved';});changeContent();await page.getByText('Updated article from the dashboard CMS.',{exact:true}).waitFor({timeout:25000});assert.equal(await page.evaluate(()=>window.__contentMarker),'preserved');console.log('PASS dashboard CMS edits refresh an open article without a full page reload');
  unpublish();await page.getByRole('heading',{name:'У цьому лісі інша дорога'}).waitFor({timeout:25000});assert.equal(await page.evaluate(()=>window.__contentMarker),'preserved');for(const path of ['/feed.xml','/sitemap.xml']){const response=await fetch(base+path);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(!(await response.text()).includes('runtime-guide'));}console.log('PASS unpublish removes the open article, RSS item and sitemap URL');
 }
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([{name:'cf_clearance',value:'fixture',domain:'lihvodruida.pp.ua',path:'/',secure:true,httpOnly:true}]);
  page=await context.newPage();const errors=[],apiRequests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!=='https://lihvodruida.pp.ua')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>'});
   if(url.pathname.startsWith('/site-api/'))apiRequests.push(url.pathname);
   const headers=await request.allHeaders();delete headers.host;
   const response=await fetch(base+url.pathname+url.search,{method:request.method(),headers,body:['GET','HEAD'].includes(request.method())?undefined:request.postDataBuffer(),redirect:'manual'});
   const outgoing=Object.fromEntries(response.headers);delete outgoing['content-length'];delete outgoing['content-encoding'];
   return route.fulfill({status:response.status,headers:outgoing,body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto('https://lihvodruida.pp.ua/guild');
  await page.getByRole('heading',{name:'Runtime Test Guild'}).waitFor();
  assert.equal(await page.locator('h1').count(),1);assert.ok((await page.title()).includes('українська гільдія WoW'));
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://lihvodruida.pp.ua/guild');
  await page.getByRole('heading',{name:'Українська гільдія для рейдів та Mythic+'}).waitFor();
  const schemas=await page.locator('script[type="application/ld+json"]').allTextContents();assert.ok(schemas.map(JSON.parse).flatMap(schema=>schema['@graph']||[schema]).some(node=>node['@type']==='AboutPage'));
  await page.getByText('Синхронізовано з гільдією',{exact:true}).waitFor();
  assert.ok(apiRequests.includes('/site-api/v1/guild'));console.log('PASS mobile browser hydration and background guild refresh through the real route');
  const season=page.getByLabel('Сезон',{exact:true});
  await season.selectOption('mn-1');await page.locator('[data-raid="tier-mn-1"] .mythic strong').getByText('2/9',{exact:true}).waitFor();
  await season.selectOption('tww-1');assert.equal(await page.locator('[data-raid="nerubar-palace"] .mythic strong').innerText(),'—/8');
  await page.evaluate(()=>{window.__guildMarker='preserved'});changeGuild();
  await page.locator('[data-raid="nerubar-palace"] .mythic strong').getByText('0/8',{exact:true}).waitFor({timeout:25000});
  assert.equal(await season.inputValue(),'tww-1');assert.equal(await page.evaluate(()=>window.__guildMarker),'preserved');
  assert.equal(await page.locator('[data-raid="not-available"] .mythic strong').innerText(),'—/9');
  await season.selectOption('mn-1');assert.equal(await page.locator('[data-raid="tier-mn-1"] .mythic strong').innerText(),'3/9');
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`guild overflow at ${width}px`);if(process.env.SITE_QA_SCREENSHOT_DIR&&width!==320)await page.screenshot({path:require('node:path').join(process.env.SITE_QA_SCREENSHOT_DIR,`guild-${width}.png`)});}
  await page.setViewportSize({width:390,height:844});
  console.log('PASS historical raid seasons, unknown → verified zero, revised progress and preserved selection without page reload; 320/390/1440px');
  if(process.env.SITE_QA_SEO_ONLY==='1'){await auditArticleLifecycle();assert.equal(errors.length,0,errors.join('\n'));console.log('[check-browser] OK — SEO, mobile layout and CMS publication lifecycle');return;}
  await page.goto('https://lihvodruida.pp.ua/guild/apply');
  await page.locator('[name=characterName]').fill('Sebas');await page.locator('[name=realm]').fill('Terokkar');await page.locator('[name=faction]').selectOption('Alliance');await page.locator('[name=className]').selectOption('Druid');await page.locator('[name=discord]').fill('sebas');await page.locator('[name=availability]').fill('Увечері після 19:00, рейди та ключі.');await page.locator('[name=sourceCreator]').selectOption('Інше');await page.locator('[name=sourceOther]').fill('Від друзів');await page.locator('[name=consent]').check();
  await page.getByRole('button',{name:'Надіслати заявку'}).click();await page.locator('.receipt').waitFor();assert.equal(posts(),1);assert.ok(await page.getByText('PRIVATE-42',{exact:true}).isVisible());console.log('PASS real form, same-origin Cloudflare cookie, server validation and private receipt');
  await page.getByRole('link',{name:'Перевірити статус'}).click();await page.locator('.application-row').waitFor();
  await page.evaluate(()=>{window.__syncMarker='preserved'});accept();
  await page.locator('.status-badge.accepted').waitFor({timeout:45000});
  assert.equal(await page.evaluate(()=>window.__syncMarker),'preserved');console.log('PASS decision propagates to application list without a page reload');
  for(const pause of ['offline','hidden']){
   await page.waitForFunction(()=>document.querySelector('.application-list')?.getAttribute('aria-busy')==='false');
   await page.evaluate(pause=>{
    const original=window.fetch.bind(window),object=pause==='offline'?navigator:document,key=pause==='offline'?'onLine':'hidden',prior=Object.getOwnPropertyDescriptor(object,key);let paused=false;
    Object.defineProperty(object,key,{configurable:true,get:()=>pause==='offline'?!paused:paused});
    window.__recovery={reads:0,complete:false};
    window.__restoreRecovery=()=>{window.fetch=original;if(prior)Object.defineProperty(object,key,prior);else delete object[key];};
    window.fetch=async(input,init)=>{
     const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
     if(url.pathname==='/site-api/v1/applications'){
      window.__recovery.reads++;
      if(window.__recovery.reads===1)return new Promise((resolve,reject)=>{
       init.signal.addEventListener('abort',()=>reject(new DOMException('Paused','AbortError')),{once:true});
       // Resume in the same task, before the aborted request reaches finally.
       // A subscription must queue this wakeup instead of waiting its backoff.
       paused=true;pause==='offline'?window.dispatchEvent(new Event('offline')):document.dispatchEvent(new Event('visibilitychange'));
       paused=false;pause==='offline'?window.dispatchEvent(new Event('online')):document.dispatchEvent(new Event('visibilitychange'));
      });
      const response=await original(input,init);window.__recovery.complete=true;return response;
     }
     return original(input,init);
    };
    window.dispatchEvent(new CustomEvent('lihvo:site-sync',{detail:['applications']}));
   },pause);
   try{
    await page.waitForFunction(()=>window.__recovery?.complete,{timeout:5000});
    assert.equal(await page.evaluate(()=>window.__recovery.reads),2);assert.equal(await page.evaluate(()=>window.__syncMarker),'preserved');
    assert.ok(!(await page.locator('.section').innerText()).includes('Запит тривав надто довго'));
    console.log(`PASS immediate ${pause} recovery during an aborted in-flight request without navigation or false timeout`);
   }finally{await page.evaluate(()=>window.__restoreRecovery());}
  }
  await auditArticleLifecycle();
  await page.setViewportSize({width:1440,height:900});await page.goto('https://lihvodruida.pp.ua/mods');await page.locator('.mod-card').first().waitFor();
  await page.getByRole('button',{name:'Оновити'}).click();await page.waitForFunction(()=>!document.querySelector('.notice button')?.disabled);assert.ok(apiRequests.includes('/site-api/v1/mods'));console.log('PASS desktop CurseForge catalogue refresh uses the same live route system');
  assert.equal(errors.length,0,errors.join('\n'));assert.ok(apiRequests.every(p=>p.startsWith('/site-api/v1/')));console.log('[check-browser] OK — 9/9 full browser scenarios; no live writes or Discord messages');
 }catch(error){
  if(page)console.error('BROWSER_DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({title:document.title,text:document.body.innerText.slice(0,800),headings:[...document.querySelectorAll('h1')].map(node=>({html:node.outerHTML,parents:[...function*(n){while(n){yield {tag:n.tagName,hidden:n.hidden,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,box:n.getBoundingClientRect().toJSON()};n=n.parentElement}}(node)]}))}))));throw error;
 }finally{await browser.close();}
};
