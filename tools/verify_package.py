"""Verify an XPI matches every checked-in plugin file."""
from pathlib import Path
import hashlib,json,sys,zipfile

root=Path(__file__).resolve().parents[1]
default=root/'downloads/AIdea-3.6.1.11-gemini-web.xpi'
package=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else default
expected='ef152ef07f3dff99bacf961e5d2f139a08c4c2e515b2767b05d2b73ad520d3c4'
files={file.relative_to(root/'plugin').as_posix():file for file in (root/'plugin').rglob('*') if file.is_file()}
with zipfile.ZipFile(package) as archive:
    assert archive.testzip() is None,'Archive integrity failure'
    names={entry.filename for entry in archive.infolist() if not entry.is_dir()}
    assert names==set(files),'File list mismatch'
    for name,file in files.items():assert archive.read(name)==file.read_bytes(),f'File mismatch: {name}'
    manifest=json.loads(archive.read('manifest.json'))
    assert manifest['version']=='3.6.1.11'
    assert manifest['applications']['zotero']['id']=='aidea@visterainer'
digest=hashlib.sha256(package.read_bytes()).hexdigest()
if package==default:assert digest==expected,'Published package hash mismatch'
print(json.dumps({'passed':True,'version':manifest['version'],'files':len(files),'sha256':digest},indent=2))
