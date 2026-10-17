const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.SITE_QA_PLAYWRIGHT||require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
module.exports=async({base})=>{
 const browser=await chromium.launch({executablePath:process.env.SITE_QA_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=9227']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true});
  const session=await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
  await session.send('Emulation.setCPUThrottlingRate',{rate:4});
  const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>requests.push({url:r.url(),status:r.status(),headers:r.headers()}));
  await page.addInitScript(()=>{window.__perf={};new PerformanceObserver(l=>{for(const e of l.getEntries())window.__perf.lcp={time:e.startTime,url:e.url,element:e.element?.outerHTML.slice(0,200)}}).observe({type:'largest-contentful-paint',buffered:true});});
  await page.addInitScript(()=>{
   window.__starfieldFrames=0;const clear=CanvasRenderingContext2D.prototype.clearRect;
   CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.id==='site-starfield')window.__starfieldFrames++;return clear.apply(this,args);};
  });
  await page.goto(base+'/',{waitUntil:'networkidle',timeout:90000});await page.waitForTimeout(1500);
  const metrics=await page.evaluate(()=>({paint:performance.getEntriesByType('paint').map(e=>({name:e.name,time:e.startTime})),...window.__perf,resources:performance.getEntriesByType('resource').map(e=>({name:e.name,bytes:e.transferSize,decoded:e.decodedBodySize,duration:e.duration})),fonts:document.fonts.status,overflow:document.documentElement.scrollWidth>innerWidth,hero:{src:document.querySelector('.hero-art').currentSrc,priority:document.querySelector('.hero-art').fetchPriority}}));
  if(process.env.SITE_QA_PERFORMANCE_OUTPUT)await fs.writeFile(process.env.SITE_QA_PERFORMANCE_OUTPUT,JSON.stringify({metrics,requests,errors},null,2));
  assert.equal(errors.length,0,errors.join('\n'));assert.equal(metrics.overflow,false);assert.equal(metrics.hero.priority,'high');
  assert.ok(!requests.some(r=>/fonts\.(googleapis|gstatic)\.com/.test(r.url)),'Fonts must be served locally');
  assert.ok(!requests.some(r=>/profile-hero-bg\.png|\/img\/(guild|varta)-logo\.webp/.test(r.url)),'Use sized derivatives');
  assert.ok(metrics.resources.reduce((s,r)=>s+r.bytes,0)<700000,'Mobile cold resource budget: 700KB');
  for(const r of requests.filter(r=>r.url.includes('/assets/img/optimized/')))assert.match(r.headers['cache-control'],/max-age=31536000, immutable/);
  const firstImage=await page.locator('.hero-art').screenshot({path:process.env.SITE_QA_PERFORMANCE_SCREENSHOT||undefined});
  assert.ok(firstImage.length>1000,'Hero artwork must render');
  await page.waitForFunction(()=>window.__starfieldFrames>0);
  const frames=await page.evaluate(()=>window.__starfieldFrames);await page.waitForTimeout(500);
  const rendered=await page.evaluate(()=>window.__starfieldFrames)-frames;
  assert.ok(rendered>0&&rendered<=18,`Mobile animation frame budget: ${rendered} frames per 500ms`);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
  const stopped=await page.evaluate(()=>window.__starfieldFrames);await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.__starfieldFrames),stopped,'Reduced motion stops canvas rendering');
  console.log('PERFORMANCE',JSON.stringify({paint:metrics.paint,lcp:metrics.lcp,transfer:metrics.resources.reduce((s,r)=>s+r.bytes,0),errors}));
  if(process.env.SITE_QA_LIGHTHOUSE_MODULE){const {default:lighthouse}=await import(process.env.SITE_QA_LIGHTHOUSE_MODULE);
   const result=await lighthouse(base+'/',{port:9227,onlyCategories:['performance','accessibility','best-practices','seo'],formFactor:'mobile',screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:2,disabled:false},logLevel:'error',output:'json',maxWaitForLoad:60000});
   if(process.env.SITE_QA_PERFORMANCE_OUTPUT)await fs.writeFile(process.env.SITE_QA_PERFORMANCE_OUTPUT+'.lighthouse.json',JSON.stringify(result.lhr,null,2));
   console.log('LIGHTHOUSE',JSON.stringify({scores:Object.fromEntries(Object.entries(result.lhr.categories).map(([k,v])=>[k,v.score])),metrics:Object.fromEntries(['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','total-byte-weight'].map(k=>[k,result.lhr.audits[k].numericValue]))}));
  }
 }finally{await browser.close();}
};
