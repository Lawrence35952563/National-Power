#!/usr/bin/env python3
"""Validate and import a new Excel version without publishing private metadata."""
import argparse
from pathlib import Path
import shutil
import tempfile

from build_data import ROOT, build, sanitize_workbook


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='national-power-import-') as temporary:
        temporary = Path(temporary)
        clean = temporary / 'national-power.xlsx'
        sanitize_workbook(args.workbook, clean)
        dataset = build(clean, temporary / 'validation', ROOT / 'config/workbook.json')
        target = ROOT / 'data/source/national-power.xlsx'
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(clean, target)
    print(f'Validated workbook imported: {target}')
    print(f"Entities: {dataset['meta']['counts']['entities']}; status: {dataset['quality']['status']}")
    print('Commit the updated workbook to trigger the website build.')


if __name__ == '__main__':
    main()
