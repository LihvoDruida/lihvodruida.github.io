import type { NextConfig } from 'next';
const config: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: {root: process.cwd()},
  experimental: {cpus: Math.max(1, Math.min(8, Number(process.env.NEXT_BUILD_CPUS) || 2))},
  output: 'standalone', poweredByHeader: false, reactStrictMode: true,
  outputFileTracingIncludes: { '/*': ['./_data/**/*'] },
  async redirects() { return [
    ...['guild','guides','news','mods','donate'].map(p=>({source:`/${p}.html`,destination:`/${p}`,permanent:true})),
    {source:'/guild-apply.html',destination:'/guild/apply',permanent:true},
    {source:'/guild-applications.html',destination:'/guild/applications',permanent:true},
    {source:'/index.html',destination:'/',permanent:true},
    {source:'/callback.html',destination:'/guild/apply',permanent:false},
  ]; },
  async headers() { return [{ source:'/:path*', headers:[
    {key:'X-Content-Type-Options',value:'nosniff'}, {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'X-Frame-Options',value:'DENY'}, {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  ]},
  {source:'/guild/applications',headers:[{key:'X-Robots-Tag',value:'noindex, follow'}]},
  // Only content-fingerprinted, bundled images are immutable. Live CMS media,
  // pages and sync/application endpoints keep their existing cache contracts.
  {source:'/assets/img/optimized/:path*',headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]},
  {source:'/api/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]},
  {source:'/site-api/v1/:resource(guild|applications|status|sync|mods|streamers)',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]},
  ]; },
};
export default config;
