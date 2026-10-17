const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.SITE_QA_PLAYWRIGHT||require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
module.exports=async function run({base}){
 const browser=await chromium.launch({executablePath:process.env.SITE_QA_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!=='https://lihvodruida.pp.ua')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>'});
   const headers=await request.allHeaders();delete headers.host;
   const response=await fetch(base+url.pathname+url.search,{headers,redirect:'manual'}),outgoing=Object.fromEntries(response.headers);delete outgoing['content-length'];delete outgoing['content-encoding'];
   return route.fulfill({status:response.status,headers:outgoing,body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto('https://lihvodruida.pp.ua/guild');
  await page.getByRole('heading',{name:'Runtime Test Guild',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const banner=page.locator('.guild-status-banner'),link=banner.getByRole('link',{name:'Mistblossom Vanguard',exact:true});
  assert.equal(await link.getAttribute('href'),'/guild');assert.equal(await banner.locator('.guild-status-banner__side').count(),2);
  for(const text of await banner.locator('.guild-status-banner__side').allTextContents())assert.equal(text,'');
  assert.equal(await banner.locator('[role="timer"],time').count(),0);assert.equal(await page.locator('h1').count(),1);
  for(const width of [320,390,1000,1440]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
   await page.waitForFunction(()=>!document.documentElement.classList.contains('guild-banner-collapsed'));
   const height=width<=1000?74:90;
   await page.waitForFunction(expected=>Math.abs(document.querySelector('.site-header').getBoundingClientRect().top-expected)<.1&&Math.abs(document.querySelector('.guild-status-banner').getBoundingClientRect().top)<.1,height);
   const geometry=await page.evaluate(()=>({banner:document.querySelector('.guild-status-banner').getBoundingClientRect().toJSON(),nav:document.querySelector('.site-header').getBoundingClientRect().toJSON(),main:document.querySelector('main').getBoundingClientRect().toJSON(),scrollHeight:document.body.scrollHeight,overflow:document.documentElement.scrollWidth>window.innerWidth}));
   assert.ok(Math.abs(geometry.banner.y)<.1);assert.equal(geometry.banner.height,height);assert.equal(geometry.overflow,false);assert.ok(geometry.main.top>=geometry.nav.bottom-1);
   if(process.env.SITE_QA_SCREENSHOT_DIR&&[390,1440].includes(width))await page.screenshot({path:path.join(process.env.SITE_QA_SCREENSHOT_DIR,`banner-${width}.png`)});
   await page.evaluate(()=>window.scrollTo({top:600,behavior:'instant'}));
   await page.waitForFunction(()=>document.documentElement.classList.contains('guild-banner-collapsed')&&Math.abs(document.querySelector('.site-header').getBoundingClientRect().top)<1);
   assert.equal(await banner.getAttribute('inert'),'');assert.equal(await banner.getAttribute('aria-hidden'),'true');assert.equal(await page.evaluate(()=>document.body.scrollHeight),geometry.scrollHeight);
   await page.evaluate(()=>window.scrollTo({top:400,behavior:'instant'}));
   await page.waitForFunction(expected=>!document.documentElement.classList.contains('guild-banner-collapsed')&&Math.abs(document.querySelector('.site-header').getBoundingClientRect().top-expected)<1,height);
   assert.equal(await banner.getAttribute('inert'),null);
  }
  console.log('PASS dashboard-style masthead: empty sides, local guild link, one H1, 320/390/1000/1440px, down/up scroll and stable document geometry');
  await page.setViewportSize({width:390,height:844});await page.goto('https://lihvodruida.pp.ua/donate');
  await page.getByRole('button',{name:'Меню'}).click();assert.equal(await page.locator('#primary-navigation').isVisible(),true);
  await page.locator('.guild-status-banner').getByRole('link',{name:'Mistblossom Vanguard',exact:true}).click();
  await page.waitForURL('https://lihvodruida.pp.ua/guild');await page.getByRole('heading',{name:'Runtime Test Guild',exact:true}).waitFor();
  assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.deepEqual(await page.evaluate(()=>[getComputedStyle(document.querySelector('.guild-status-banner')).transitionDuration,getComputedStyle(document.querySelector('.site-header')).transitionDuration]),['0s','0s']);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForFunction(()=>!document.documentElement.classList.contains('guild-banner-collapsed'));
  await link.focus();assert.equal(await link.evaluate(node=>node===document.activeElement),true);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS banner opens the public guild page, closes mobile menu, remains keyboard-accessible and respects reduced motion');
 }finally{await browser.close();}
};
