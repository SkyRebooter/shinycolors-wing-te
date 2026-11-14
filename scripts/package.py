#!/usr/bin/env python3
"""Build deterministic, account-independent release archives with the stdlib."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)
SCRIPT = ROOT / 'ShinyColorsWing.user.js'
def archive(path, members):
    with ZipFile(path, 'w', compression=ZIP_DEFLATED) as z:
        for name, data in sorted(members):
            item = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            item.compress_type = ZIP_DEFLATED
            item.external_attr = 0o100644 << 16
            z.writestr(item, data)
    with ZipFile(path) as z:
        assert z.testzip() is None
installer = OUT / f'WING_TE_Tampermonkey_v{VERSION}.zip'
archive(installer, [('ShinyColorsWing.user.js', SCRIPT.read_bytes())])
files = ['ShinyColorsWing.user.js', 'wing.test.cjs', 'README.md', 'package.json',
         'validation.json', 'docs/HANDOFF.md', 'docs/SOURCE_ADAPTERS.md',
         'scripts/package.py', f'verification/tests-v{VERSION}.txt',
         '.github/workflows/tests.yml', '.gitignore']
full = OUT / f'WING_TE_full_v{VERSION}.zip'
archive(full, [(f'WING_TE_browser/{f}', (ROOT / f).read_bytes()) for f in files] +
        [(f'WING_TE_browser/{installer.name}', installer.read_bytes())])
with ZipFile(installer) as z:
    assert z.read('ShinyColorsWing.user.js') == SCRIPT.read_bytes()
with ZipFile(full) as z:
    assert z.read('WING_TE_browser/ShinyColorsWing.user.js') == SCRIPT.read_bytes()
    assert z.read(f'WING_TE_browser/{installer.name}') == installer.read_bytes()
manifest = ''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in [installer, full])
(OUT / 'SHA256SUMS').write_text(manifest)
print(manifest, end='')
