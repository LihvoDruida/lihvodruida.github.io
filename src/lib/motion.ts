// Scroll reveal for the public site, the same approach as the Accord Niche storefront.
// Progressive enhancement only: without IntersectionObserver, without JavaScript, or with
// «reduce motion» in the system, nothing is hidden and the page renders as before.

export const prefersReducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;

// Blocks that rise into view while scrolling. Anything already on screen when it is
// first seen is left alone, so nothing above the fold blinks.
export const REVEAL_TARGETS=[
 '.section-heading','.community-card','.article-card','.raid-card','.schedule-list > article',
 '.stat-grid > div','.member-card','.mod-card','.donate-card','.character-list > a',
 '.panel','.terms-section','.related-articles','.article-toc','.empty-state',
].join(',');
const STAGGER_MS=70,STAGGER_MAX=5;

/** Starts the reveal under `root` and returns a cleanup function. */
export function startReveal(root:HTMLElement|null):()=>void{
 if(!root||typeof IntersectionObserver!=='function'||prefersReducedMotion())return ()=>{};
 const seen=new WeakSet<Element>();
 const settle=(element:HTMLElement)=>{element.classList.remove('reveal-pending','revealed');element.style.removeProperty('--reveal-delay');};
 const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   const element=entry.target as HTMLElement;observer.unobserve(element);element.classList.add('revealed');
   const delay=parseFloat(element.style.getPropertyValue('--reveal-delay'))||0;
   // transitionend can be skipped (hidden tab, display change); the timer always restores the plain state,
   // so hover transitions keep their own timing afterwards.
   const done=()=>settle(element);element.addEventListener('transitionend',done,{once:true});setTimeout(done,delay+900);
  }
 },{
  // The huge top margin makes «already scrolled past» count as seen: an IntersectionObserver
  // only reports state changes, so a block skipped by a fast fling, an anchor jump or scroll
  // restoration would otherwise never intersect and stay hidden.
  rootMargin:'100000px 0px -6% 0px',threshold:0});
 const scan=()=>{
  const viewport=window.innerHeight||0;
  for(const element of root.querySelectorAll<HTMLElement>(REVEAL_TARGETS)){
   if(seen.has(element))continue;seen.add(element);
   if(element.getBoundingClientRect().top<viewport)continue;
   const siblings=element.parentElement?[...element.parentElement.children].filter(node=>node.matches(REVEAL_TARGETS)):[];
   const index=Math.min(Math.max(siblings.indexOf(element),0),STAGGER_MAX);
   element.style.setProperty('--reveal-delay',`${index*STAGGER_MS}ms`);
   element.classList.add('reveal-pending');observer.observe(element);
  }
 };
 let frame=0;
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;scan();});};
 // Live snapshots, pagination and filters insert new cards; they reveal like the rest.
 const mutations=typeof MutationObserver==='function'?new MutationObserver(schedule):null;
 mutations?.observe(root,{childList:true,subtree:true});
 scan();
 return ()=>{observer.disconnect();mutations?.disconnect();if(frame)cancelAnimationFrame(frame);for(const element of root.querySelectorAll<HTMLElement>('.reveal-pending'))settle(element);};
}
