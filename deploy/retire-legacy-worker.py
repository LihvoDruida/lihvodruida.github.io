#!/usr/bin/env python3
"""Remove only exact public-domain /api* Worker routes after the new site is ready."""
import argparse,getpass,json,os,re,urllib.request,datetime
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--zone-id',required=True);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
if not re.fullmatch(r'[a-fA-F0-9]{32}',args.zone_id):raise SystemExit('Invalid zone ID')
token=os.getenv('CLOUDFLARE_API_TOKEN') or getpass.getpass('Cloudflare API token (hidden): ')
def call(url,method='GET',authenticated=True):
 headers={'Accept':'application/json'}
 if authenticated:headers['Authorization']='Bearer '+token
 with urllib.request.urlopen(urllib.request.Request(url,method=method,headers=headers),timeout=20) as response:
  if response.headers.get('X-Guild-Worker-Request-Id'):raise RuntimeError('The public status is still intercepted by the retired Worker')
  return json.load(response)
base=f'https://api.cloudflare.com/client/v4/zones/{args.zone_id}/workers/routes'
result=call(base)
if not result.get('success'):raise SystemExit('Cloudflare did not confirm the route list')
allowed={f'{scheme}{host}/{suffix}' for scheme in ['','http://','https://'] for host in ['lihvodruida.pp.ua','www.lihvodruida.pp.ua'] for suffix in ['api/*','api*']}
routes=[r for r in result.get('result',[]) if r.get('pattern') in allowed and r.get('script')]
for route in routes:print(json.dumps({'id':route['id'],'pattern':route['pattern'],'script':route['script']}))
if not args.apply:print('Preview only. To remove these exact routes, repeat with --apply.');raise SystemExit(0)
status=call('https://lihvodruida.pp.ua/site-api/v1/status',authenticated=False)
if status.get('service')!='lihvodruida-site' or status.get('integration')!='ready' or status.get('api_base')!='/site-api/v1':raise SystemExit('The new public route is not ready; no routes were removed')
backup=Path(__file__).resolve().parent/('worker-routes-before-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')+'.json')
backup.write_text(json.dumps(routes,indent=2));backup.chmod(0o600)
for route in routes:
 response=call(base+'/'+route['id'],method='DELETE')
 if not response.get('success'):raise SystemExit('Cloudflare did not confirm a deletion; inspect the route list before retrying')
 print('Removed route: '+route['pattern'])
print('Exact retired public API routes removed. Worker scripts, other domains and routes were not changed.')
