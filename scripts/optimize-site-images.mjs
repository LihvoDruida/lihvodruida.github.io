// Rebuild bundled derivatives after changing the original artwork. Uses the
// project's pinned sharp version; commit both images and manifest together.
import sharp from 'sharp';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const manifest={};
fs.mkdirSync('assets/img/optimized',{recursive:true});
async function asset(name,source,width,format,quality){
 const bytes=await sharp(source).resize({width,withoutEnlargement:true}).toFormat(format,{quality,effort:6}).toBuffer();
 const hash=createHash('sha256').update(bytes).digest('hex').slice(0,12);
 const url=`/assets/img/optimized/${name}-${width}.${hash}.${format}`;
 fs.writeFileSync('.'+url,bytes);
 return url;
}
manifest.banner={desktop:await asset('guild-banner','assets/img/profile/profile-hero-bg.png',1600,'webp',66),mobile:await asset('guild-banner','assets/img/profile/profile-hero-bg.png',800,'webp',64)};
manifest.hero={};
for(const format of ['avif','webp']){
 manifest.hero[format]=[];
 for(const width of [640,960,1200])manifest.hero[format].push({width,src:await asset('home-hero','assets/img/og-image-default.webp',width,format,format==='avif'?48:66)});
}
manifest.logos={};
for(const name of ['guild','varta']){
 const source=`/assets/img/${name}-logo.webp`;
 manifest.logos[source]=[];
 for(const width of [96,160,240])manifest.logos[source].push({width,src:await asset(name+'-logo','.'+source,width,'webp',78)});
}
fs.writeFileSync('src/lib/site-assets.json',JSON.stringify(manifest,null,2)+'\n');
// CSS backgrounds cannot import a TypeScript manifest.
const cssPath='src/app/guild-banner.css';let css=fs.readFileSync(cssPath,'utf8');
for(const [kind,width] of [['desktop',1600],['mobile',800]])css=css.replace(new RegExp(`/assets/img/optimized/guild-banner-${width}\\.[a-f0-9]+\\.webp`,'g'),manifest.banner[kind]);
fs.writeFileSync(cssPath,css);
console.log('Updated responsive artwork and fingerprint manifest.');
