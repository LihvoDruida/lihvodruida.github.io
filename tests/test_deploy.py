"""Deployment orchestration tests with a fake Docker CLI; no live daemon used."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
FAKE_DOCKER = r'''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
args=sys.argv[1:]
state=Path(os.environ['FAKE_STATE'])
with open(state/'calls','a') as f:f.write(json.dumps({'args':args,'image':os.getenv('SITE_IMAGE')})+'\n')
scenario=os.environ.get('SCENARIO','ok')
if args[:2]==['compose','version'] or args==['info']:sys.exit(0)
if args[:2]==['network','inspect']:sys.exit(1 if scenario=='missing_network' else 0)
if args[:2]==['image','tag']:sys.exit(0)
if args[0]=='inspect':
    fmt=args[args.index('--format')+1]
    cid=args[-1]
    if fmt=='{{.Image}}':print('sha256:old-image')
    elif '.State.Status' in fmt:print('running|'+('unhealthy' if scenario=='bad_health' and cid=='new' else 'healthy'))
    else:print('healthy')
    sys.exit(0)
if args[0]!='compose':sys.exit(99)
# Everything after the second compose file (or final VPS file).
command=args[args.index('-f')+2:]
while command and command[0]=='-f':command=command[2:]
action=command[0]
if action=='config':
    env={}
    for line in Path('.env').read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            k,v=line.split('=',1);env[k]=v
    cfg={'name':'lihvodruida-site','services':{'site':{'read_only':True,'environment':env,'ports':[{'host_ip':'127.0.0.1','target':3000}],'networks':{'dashboard_edge':{}}}},'networks':{'dashboard_edge':{'external':True,'name':'mistblossom_edge'}}}
    if scenario=='extra_service':cfg['services']['dashboard']={}
    if scenario=='public_port':cfg['services']['site']['ports'][0]['host_ip']='0.0.0.0'
    print(json.dumps(cfg));sys.exit(0)
if action=='build':sys.exit(1 if scenario=='bad_build' else 0)
if action=='ps':
    if '--quiet' in command:
        current=state/'current'
        if current.exists():print(current.read_text())
        elif scenario not in ['first','missing_network','extra_service','public_port']:print('old')
    sys.exit(0)
if action=='up':
    rollback=bool(os.getenv('SITE_IMAGE','').startswith('lihvodruida-site:rollback-'))
    (state/'current').write_text('restored' if rollback else 'new')
    if scenario=='bad_up' and not rollback:sys.exit(1)
    sys.exit(0)
if action=='exec':sys.exit(1 if scenario=='bad_bridge' and (state/'current').read_text()=='new' else 0)
if action in ['stop','restart','logs']:sys.exit(0)
sys.exit(98)
'''

class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='site-deploy-')
        self.root = Path(self.temp.name)
        for name in ['deploy/deploy.sh','deploy/compose.vps.yml','compose.yml','.env.example']:
            dest=self.root/name
            dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(SOURCE/name,dest)
        self.bin=self.root/'bin'
        self.bin.mkdir()
        (self.bin/'docker').write_text(FAKE_DOCKER)
        (self.bin/'docker').chmod(0o755)
        self.env={**os.environ,'PATH':str(self.bin)+os.pathsep+os.environ['PATH'],'FAKE_STATE':str(self.root),'SITE_HEALTH_TIMEOUT':'1'}
        self.env.pop('SITE_IMAGE',None)
        (self.root/'.env.example').write_text((self.root/'.env.example').read_text().replace('PUBLIC_SITE_BRIDGE_TOKEN=','PUBLIC_SITE_BRIDGE_TOKEN='+'a'*64))
    def tearDown(self): self.temp.cleanup()
    def run_script(self,scenario='ok',action='deploy'):
        result=subprocess.run(['bash',str(self.root/'deploy/deploy.sh'),action],cwd='/',env={**self.env,'SCENARIO':scenario},capture_output=True,text=True,timeout=15)
        self.calls=[json.loads(line) for line in (self.root/'calls').read_text().splitlines()]
        return result
    def actions(self,name):
        return [c for c in self.calls if c['args'][0]=='compose' and name in c['args']]
    def test_first_run_creates_env_and_deploys_only_site(self):
        r=self.run_script('first')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertTrue((self.root/'.env').exists())
        self.assertEqual((self.root/'.env').stat().st_mode & 0o777,0o600)
        self.assertEqual(len(self.actions('build')),1)
        self.assertEqual(len(self.actions('up')),1)
        for call in self.calls:
            if call['args'][:2]!=['compose','version'] and call['args'][0]=='compose':
                self.assertIn('lihvodruida-site',call['args'])
                self.assertNotIn('/srv/mistblossom',call['args'])
        self.assertFalse(any(c['args'][:2]==['network','create'] for c in self.calls))
    def test_existing_env_and_override_are_preserved(self):
        content='SITE_URL=https://lihvodruida.pp.ua\nDASHBOARD_URL=https://guild.lihvodruida.pp.ua\nCUSTOM=value\nDASHBOARD_INTERNAL_URL=http://dashboard:3000\nPUBLIC_SITE_BRIDGE_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'
        (self.root/'.env').write_text(content)
        (self.root/'compose.override.yml').write_text('services: {}\n')
        r=self.run_script()
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual((self.root/'.env').read_text(),content)
        args=self.actions('config')[0]['args']
        self.assertLess(args.index(str(self.root/'compose.override.yml')),args.index(str(self.root/'deploy/compose.vps.yml')))
    def test_check_does_not_build_or_start(self):
        self.assertEqual(self.run_script(action='check').returncode,0)
        self.assertFalse(self.actions('build'));self.assertFalse(self.actions('up'))
    def test_missing_network_aborts_before_build(self):
        self.assertNotEqual(self.run_script('missing_network').returncode,0)
        self.assertFalse(self.actions('build'));self.assertFalse(self.actions('up'))
    def test_extra_service_is_rejected_before_mutation(self):
        self.assertNotEqual(self.run_script('extra_service').returncode,0)
        self.assertFalse(self.actions('build'));self.assertFalse(self.actions('up'))
    def test_public_bind_is_rejected(self):
        self.assertNotEqual(self.run_script('public_port').returncode,0)
        self.assertFalse(self.actions('up'))
    def test_invalid_origin_rejected_without_executing_env(self):
        (self.root/'.env').write_text('SITE_URL=http://example.org\nDASHBOARD_URL=https://guild.lihvodruida.pp.ua\nEVIL=$(touch SHOULD_NOT_EXIST)\n')
        self.assertNotEqual(self.run_script().returncode,0)
        self.assertFalse((self.root/'SHOULD_NOT_EXIST').exists())
        self.assertFalse(self.actions('up'))
    def test_failed_build_does_not_replace_container(self):
        self.assertNotEqual(self.run_script('bad_build').returncode,0)
        self.assertFalse(self.actions('up'))
    def test_unhealthy_release_restores_previous_image_and_reports_failure(self):
        r=self.run_script('bad_health')
        self.assertNotEqual(r.returncode,0)
        self.assertEqual(len(self.actions('up')),2)
        self.assertTrue(self.actions('up')[1]['image'].startswith('lihvodruida-site:rollback-'))
        self.assertEqual((self.root/'current').read_text(),'restored')
    def test_incompatible_bridge_rolls_back(self):
        self.assertNotEqual(self.run_script('bad_bridge').returncode,0)
        self.assertEqual((self.root/'current').read_text(),'restored')
    def test_missing_token_stops_before_build(self):
        env=(self.root/'.env.example').read_text().replace('PUBLIC_SITE_BRIDGE_TOKEN='+'a'*64,'PUBLIC_SITE_BRIDGE_TOKEN=')
        (self.root/'.env').write_text(env)
        self.assertNotEqual(self.run_script().returncode,0)
        self.assertFalse(self.actions('build'))
    def test_failed_start_rolls_back(self):
        self.assertNotEqual(self.run_script('bad_up').returncode,0)
        self.assertEqual((self.root/'current').read_text(),'restored')
    def test_first_run_unhealthy_does_not_invent_rollback(self):
        # No currently running service available.
        (self.root/'current').write_text('')
        self.assertNotEqual(self.run_script('bad_health').returncode,0)
        self.assertEqual(len(self.actions('up')),1)
    def test_stop_does_not_remove_networks_or_volumes(self):
        shutil.copyfile(self.root/'.env.example',self.root/'.env')
        self.assertEqual(self.run_script(action='stop').returncode,0)
        self.assertEqual(len(self.actions('stop')),1)
        self.assertFalse(self.actions('down'))
    def test_lock_prevents_concurrent_deploys(self):
        import fcntl
        with open(self.root/'.deploy.lock','w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            r=self.run_script()
        self.assertNotEqual(r.returncode,0)
        self.assertFalse(self.actions('up'))

if __name__=='__main__': unittest.main()
