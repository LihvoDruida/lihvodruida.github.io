#!/usr/bin/env python3
"""Store the key literally, including dollar signs; never print the credential."""
import getpass,re,datetime,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1];env=root/'.env'
key=getpass.getpass('CurseForge API key (hidden): ').strip()
if not re.fullmatch(r'[A-Za-z0-9$./_+=-]{16,256}',key):raise SystemExit('Invalid key format. Paste the complete key without wrapping quotes.')
text=env.read_text() if env.exists() else (root/'.env.example').read_text()
text=re.sub(r'^CURSEFORGE_API_KEY=.*(?:\n|$)','',text,flags=re.M)
if env.exists():
 backup=env.with_name('.env.before-curseforge-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));shutil.copyfile(env,backup);backup.chmod(0o600)
temp=env.with_name('.env.curseforge-tmp');temp.write_text(text.rstrip()+"\nCURSEFORGE_API_KEY='"+key+"'\n");temp.chmod(0o600);temp.replace(env)
print('Key saved literally. Recreate the site container to load the updated environment.')
