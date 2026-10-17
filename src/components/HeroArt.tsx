import {assets,imageSet} from '@/lib/site-assets';

export function HeroArt(){return <picture>
 <source type="image/avif" srcSet={imageSet(assets.hero.avif)} sizes="100vw"/>
 <img className="hero-art" src={assets.hero.webp.at(-1)!.src} srcSet={imageSet(assets.hero.webp)} sizes="100vw" width="1200" height="630" alt="Друїд і його супутники у чарівному лісі" loading="eager" fetchPriority="high" decoding="async" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>
</picture>;}
