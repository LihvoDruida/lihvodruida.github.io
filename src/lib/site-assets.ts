import assets from './site-assets.json';

export {assets};
type Variant={width:number;src:string};
export const imageSet=(variants:Variant[])=>variants.map(v=>`${v.src} ${v.width}w`).join(', ');

// Known community artwork has immutable, correctly sized derivatives. Unknown CMS
// images retain their original URL and the existing publication/cache semantics.
export function communityLogo(src:string,size:number){
 const variants=assets.logos[src as keyof typeof assets.logos];
 if(!variants)return {src};
 return {src:(variants.find(v=>v.width>=size*2)||variants.at(-1)!).src,srcSet:imageSet(variants),sizes:`${size}px`};
}
