const assert=require('node:assert/strict');
const {chromium}=require(process.env.SITE_QA_PLAYWRIGHT||require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
module.exports=async function({base,lastSubmission,posts}){
 const browser=await chromium.launch({executablePath:process.env.SITE_QA_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([{name:'cf_clearance',value:'fixture',domain:'lihvodruida.pp.ua',path:'/',secure:true,httpOnly:true}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!=='https://lihvodruida.pp.ua')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});
   const headers=await req.allHeaders();delete headers.host;
   const res=await fetch(base+u.pathname+u.search,{method:req.method(),headers,body:['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer(),redirect:'manual'});
   const outgoing=Object.fromEntries(res.headers);delete outgoing['content-encoding'];delete outgoing['content-length'];
   await route.fulfill({status:res.status,headers:outgoing,body:Buffer.from(await res.arrayBuffer())});
  });
  await page.goto('https://lihvodruida.pp.ua/guild/apply');
  const source=page.locator('[name=sourceCreator]'),platform=page.locator('select[name=sourcePlatform]');
  const sources=await source.locator('optgroup option').allTextContents();assert.equal(sources.length,12);
  await source.selectOption('Лігво Друїда');await platform.selectOption('Twitch');
  await source.selectOption('Друзі / знайомі');assert.equal(await platform.count(),0);assert.equal(await page.locator('[name=sourcePlatform]').inputValue(),'Рекомендація');
  await page.locator('[name=sourceOther]').fill('Попереднє значення');await source.selectOption('Інше');assert.equal(await page.locator('[name=sourceOther]').inputValue(),'');
  await source.selectOption('Лігво Друїда');assert.equal(await platform.inputValue(),'');assert.equal(await page.locator('[name=sourceOther]').count(),0);
  await source.selectOption('Інший стрімер / автор');
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewportSize({width:390,height:844});
  const choose={'Лігво Друїда':'Telegram','MrFortune':'Twitch','Інший стрімер / автор':'Інша платформа','Соціальні мережі':'Instagram','Пошук в інтернеті':'Bing','Сайти та форуми WoW':'Raider.IO'};
  const before=posts();
  for(const name of sources){
   await page.goto('https://lihvodruida.pp.ua/guild/apply');
   await page.locator('[name=characterName]').fill('Sebas');await page.locator('[name=realm]').fill('Terokkar');await page.locator('[name=faction]').selectOption('Alliance');await page.locator('[name=className]').selectOption('Druid');await page.locator('[name=discord]').fill('sebas');await page.locator('[name=availability]').fill('Увечері після 19:00, рейди та ключі.');await source.selectOption(name);
   if(choose[name])await platform.selectOption(choose[name]);
   const detail=page.locator('[name=sourceOther]');if(await detail.count())await detail.fill('QA джерело');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name);
   const expected=await page.locator('form').evaluate(form=>{const d=new FormData(form);return {creator:d.get('sourceCreator'),platform:d.get('sourcePlatform')||'',other:d.get('sourceOther')||''};});
   await page.locator('[name=consent]').check();await page.getByRole('button',{name:'Надіслати заявку'}).click();await page.locator('.receipt').waitFor();
   const stored=lastSubmission();assert.equal(stored.sourceCreator,expected.creator);assert.equal(stored.sourcePlatform||'',expected.platform);assert.equal(stored.sourceOther||'',expected.other);assert.equal(stored.source,[expected.creator,expected.platform,expected.other].filter(Boolean).join(' · '));
  }
  assert.equal(posts()-before,sources.length);assert.deepEqual(errors,[]);
  console.log('PASS 12 application sources reach the dashboard bridge with correct platform/detail; source switching clears stale fields; 320/390/1440px; no browser errors');
 }finally{await browser.close();}
};
