"""Build an offline, single-file dashboard. Never modify source CSV files."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def build():
    parser = argparse.ArgumentParser()
    parser.add_argument('--empty', action='store_true', help='Build a file-picker-only site without embedded data')
    parser.add_argument('--master', type=Path, default=ROOT.parent / 'Random Year.csv')
    parser.add_argument('--price-source', default='ราคาอ้างอิงจาก Random Year.csv (ชุดสุ่มคลังใหญ่)')
    args = parser.parse_args()
    data = {'counts': {}, 'master': None, 'priceSource': args.price_source}
    hashes = {}
    codes = set()
    if not args.empty:
        for dept in ('PHA01', 'PHA02', 'PHA04'):
            path = ROOT / f'count_{dept}.csv'
            raw = path.read_bytes()
            hashes[path.name] = hashlib.sha256(raw).hexdigest()
            data['counts'][dept] = raw.decode('utf-8-sig')
            codes.update(row['CODE'].strip() for row in csv.DictReader(io.StringIO(data['counts'][dept])))
        if args.master.exists():
            # Publish only relevant codes and the four fields needed for valuation.
            fields = ['WORKING_CODE', 'VEN', 'ราคา/บรรจุ(STD_PRICE3)', 'PACK_RATIO']
            source = csv.DictReader(io.StringIO(args.master.read_text(encoding='utf-8-sig')))
            output = io.StringIO(newline='')
            writer = csv.DictWriter(output, fieldnames=fields, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(row for row in source if row['WORKING_CODE'].strip() in codes)
            data['master'] = output.getvalue()
            hashes[args.master.name] = hashlib.sha256(args.master.read_bytes()).hexdigest()
    html = (ROOT / 'src/template.html').read_text(encoding='utf-8')
    for placeholder, filename in [('/* STYLES */', 'styles.css'), ('/* CORE */', 'core.js'), ('/* APP */', 'app.js')]:
        html = html.replace(placeholder, (ROOT / 'src' / filename).read_text(encoding='utf-8'))
    # Prevent CSV contents from terminating the inert JSON script element.
    payload = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    html = html.replace('{"counts":{},"master":null}', payload)
    (ROOT / 'index.html').write_text(html, encoding='utf-8')
    (ROOT / 'build-manifest.local.json').write_text(json.dumps(hashes, indent=2), encoding='utf-8')
    print(f'Built index.html ({len(html.encode("utf-8")):,} bytes), {len(data["counts"])} departments')

if __name__ == '__main__':
    build()
