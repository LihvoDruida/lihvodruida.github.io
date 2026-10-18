const assert=require('node:assert/strict');
const {chromium}=require(process.env.SITE_QA_PLAYWRIGHT||require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
module.exports=async function({base,changeContent,holdContent}){
 const browser=await chromium.launch({executablePath:process.env.SITE_QA_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const width of [320,390,1440]){
   const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://render.worldofwarcraft.com/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"/>'}));
   async function menu(){if(width<=800)await page.getByRole('button',{name:'Меню'}).click();}
   async function home(selector='#primary-navigation a[href="/"]'){
    if(selector.startsWith('#'))await menu();
    await page.locator(selector).click();await page.waitForURL(base+'/');
    await page.waitForFunction(()=>window.scrollY<=1);await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>Math.round(window.scrollY)),0,'Home must remain at the top');
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   for(const route of ['/news','/guides','/guild','/donate','/guild/apply']){
    await page.goto(base+route,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{window.__homeScrollMarker='preserved';window.scrollTo({top:700,behavior:'instant'});});
    await home();assert.equal(await page.evaluate(()=>window.__homeScrollMarker),'preserved','Navigation must remain client-side');
   }
   await page.evaluate(()=>window.scrollTo({top:900,behavior:'instant'}));await home();
   await page.evaluate(()=>window.scrollTo({top:900,behavior:'instant'}));await home('.brand');
   // A reader already on the homepage must keep their position when CMS updates.
   await page.getByText('Runtime Community News',{exact:true}).waitFor();
   await page.evaluate(()=>window.scrollTo({top:900,behavior:'instant'}));
   await page.waitForTimeout(150);const at=await page.evaluate(()=>window.scrollY);
   const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname==='/'&&r.request().headers().rsc==='1');
   changeContent();await refreshed;await page.waitForTimeout(400);
   assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-at)<2,'CMS refresh preserves reading position');
   // Native history restoration and hash navigation must retain their own intent.
   await menu();await page.locator('#primary-navigation a[href="/news"]').click();await page.waitForURL(base+'/news');
   await page.goBack();await page.waitForURL(base+'/');await page.waitForTimeout(500);
   assert.ok(Math.abs(await page.evaluate(()=>window.scrollY)-at)<2,'Back restores reading position');
   await page.goto(base+'/donate#donate-terms',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.scrollY>100);
   assert.equal(await page.evaluate(()=>location.hash),'#donate-terms');assert.ok(await page.locator('#donate-terms').isVisible());
   assert.deepEqual(errors,[]);
   console.log(`PASS home navigation at ${width}px: 5 routes, repeated Home, logo, CMS refresh, Back and explicit hash`);
   await page.close();
  }
  // A delayed CMS stream must never move the viewport into the article section.
  if(holdContent){
   const page=await browser.newPage({viewport:{width:390,height:844}});
   await page.route(base+'/**',r=>r.request().headers()['next-router-prefetch']==='1'?r.abort():r.continue());
   await page.goto(base+'/donate',{waitUntil:'domcontentloaded'});await page.evaluate(()=>window.scrollTo({top:700,behavior:'instant'}));
   const release=holdContent();
   try{
    await page.waitForTimeout(3200);await fetch(base+'/site-api/v1/sync');
    await page.getByRole('button',{name:'Меню'}).click();await page.locator('#primary-navigation a[href="/"]').click();
    await page.locator('.hero h1').waitFor();await page.waitForFunction(()=>window.scrollY<=1);assert.equal(await page.getByText('Runtime Community News',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.scrollY),0);
    release();await page.getByText('Runtime Community News',{exact:true}).waitFor();await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>window.scrollY),0);
   }finally{release();await page.close();}
   console.log('PASS delayed homepage CMS stream keeps the hero at the top before and after articles arrive');
  }
 }finally{await browser.close();}
};
