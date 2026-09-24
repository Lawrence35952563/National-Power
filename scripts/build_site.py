#!/usr/bin/env python3
"""Build the complete static website using Python's standard library."""
from pathlib import Path
import argparse
import base64
import json
import mimetypes
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='dist')
    args = parser.parse_args()
    output = Path(args.output).resolve()
    if output == ROOT or ROOT in output.parents and output.name in {'web', 'scripts', 'data', 'config', 'docs'}:
        raise SystemExit('Choose a separate build output directory.')
    output.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/build_data.py'), '--output', str(output)], cwd=ROOT, check=True)
    for source in (ROOT / 'web').iterdir():
        if source.is_dir():
            shutil.copytree(source, output / source.name, dirs_exist_ok=True)
        else:
            shutil.copy2(source, output / source.name)
    # A single-file preview uses the hosted app's code/data and embeds downloads.
    html = (output / 'index.html').read_text(encoding='utf-8')
    if 'window.NATIONAL_POWER_DATA' in (output / 'app.js').read_text(encoding='utf-8'):
        css = (output / 'styles.css').read_text(encoding='utf-8')
        js = (output / 'app.js').read_text(encoding='utf-8')
        data = json.loads((output / 'data/dataset.json').read_text(encoding='utf-8'))
        embedded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
        download_files = {}
        for item in data.get('downloads', []):
            href = item['href']
            if href == 'data/dataset.json':
                continue  # Reuse the already embedded dataset instead of doubling it.
            target = (output / href).resolve()
            if output not in target.parents:
                raise ValueError('Offline download path escaped the build output')
            download_files[href] = {
                'name': target.name,
                'type': mimetypes.guess_type(target.name)[0] or 'application/octet-stream',
                'base64': base64.b64encode(target.read_bytes()).decode('ascii'),
            }
        embedded_downloads = json.dumps(download_files, separators=(',', ':'))
        download_script = r'''
document.addEventListener('click', function(event) {
  const link = event.target.closest('a[download]');
  if (!link) return;
  const href = link.getAttribute('href').replace(/^\.\//, '');
  let blob, name;
  if (href === 'data/dataset.json') {
    blob = new Blob([JSON.stringify(window.NATIONAL_POWER_DATA)], {type:'application/json;charset=utf-8'});
    name = 'dataset.json';
  } else {
    const file = window.NATIONAL_POWER_DOWNLOADS[href];
    if (!file) return;
    blob = new Blob([Uint8Array.from(atob(file.base64), c => c.charCodeAt(0))], {type:file.type});
    name = file.name;
  }
  event.preventDefault();
  const url = URL.createObjectURL(blob), save = document.createElement('a');
  save.href = url; save.download = name; save.hidden = true;
  document.body.append(save); save.click(); save.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}, true);
'''
        html = html.replace('<link rel="stylesheet" href="./styles.css">', '<style>' + css.replace('</style', '<\\/style') + '</style>')
        guide_tag = '<script src="./reading-guide.js"></script>'
        if guide_tag in html:
            guide = (output / 'reading-guide.js').read_text(encoding='utf-8')
            html = html.replace(guide_tag, '<script>' + guide.replace('</script', '<\\/script') + '</script>')
        icon = base64.b64encode((output / 'favicon.svg').read_bytes()).decode('ascii')
        html = html.replace('href="./favicon.svg"', 'href="data:image/svg+xml;base64,' + icon + '"')
        html = re.sub(r'<script type="module" src="\./app\.js"></script>', lambda _: '<script>window.NATIONAL_POWER_DATA=' + embedded + ';window.NATIONAL_POWER_DOWNLOADS=' + embedded_downloads + ';' + download_script + '</script><script type="module">' + js.replace('</script', '<\\/script') + '</script>', html)
        (output / 'offline.html').write_text(html, encoding='utf-8')
    (output / '.nojekyll').write_text('', encoding='utf-8')
    print(f'Static site built: {output}')

if __name__ == '__main__':
    main()
