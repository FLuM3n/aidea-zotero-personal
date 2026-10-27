"""Repack the current plugin files; no npm or Zotero installation required."""
from pathlib import Path
import hashlib,json,zipfile

root=Path(__file__).resolve().parents[1]
source=root/'plugin'
manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
target=root/'build'/f"AIdea-{manifest['version']}-fulltext.xpi"
target.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for file in sorted(source.rglob('*')):
        if not file.is_file():continue
        entry=zipfile.ZipInfo(file.relative_to(source).as_posix(),date_time=(2026,10,27,0,0,0))
        entry.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(entry,file.read_bytes(),compresslevel=9)
print(target)
print('SHA256:',hashlib.sha256(target.read_bytes()).hexdigest())
