"""Pure JavaScript helper checks, with no DOM or browser emulation."""
from pathlib import Path
import os
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node") or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")


class FrontendLogic(unittest.TestCase):
    @unittest.skipUnless(NODE, "Node.js is not available for JavaScript syntax/helper checks")
    def test_syntax_and_data_helpers(self):
        subprocess.run([NODE, "--check", "web/app.js"], cwd=ROOT, check=True, capture_output=True, text=True, encoding="utf-8")
        script = r'''
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.NP_SITE_DIST || 'dist','data/dataset.json'), 'utf8'));
const source = fs.readFileSync('web/app.js', 'utf8');
// Evaluate only pure helper declarations. No document/window objects or DOM stubs.
const end = source.indexOf('function navActive(');
assert.ok(end > 0, 'Pure helper boundary must exist');
const prefix = source.slice(0,end).replace(/^const app = .*;\r?\n/m,'');
const context = vm.createContext({fixture, URLSearchParams});
vm.runInContext(prefix + `
db = fixture;
byId = new Map(db.entities.map(e => [e.id, e]));
byIndicator = new Map(db.indicators.map(i => [i.id, i]));
bySheet = new Map(db.sheets.map(s => [s.id, s]));
globalThis.helpers = {esc, numeric, format, sortValues, rankedEntities,
  indicatorCells, numIndicatorCells, entityURL, indicatorURL, inspectCell,
  displayCellValue, compositePart, compositeDefinitions, compositeValues,
  tableColumns, readerExplanation, reportCitation};
`, context);
const h = context.helpers;
assert.equal(h.esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
assert.equal(h.esc("'&"), '&#39;&amp;');
assert.equal(h.numeric('3700.14'), false, 'Composite strings must not be numerical');
assert.equal(h.numeric(0), true);
assert.equal(h.numeric(Infinity), false);
for (const direction of ['asc','desc']) {
  assert.ok(h.sortValues(null,0,direction) > 0, 'Null stays after zero in both orders');
  assert.ok(h.sortValues('',2.5,direction) > 0, 'Blank stays after fractional rank');
  assert.equal(h.sortValues(null,undefined,direction), 0);
}
assert.deepEqual([2.5,10,0,2,null].sort((a,b)=>h.sortValues(a,b,'asc')), [0,2,2.5,10,null]);
assert.deepEqual([2.5,10,0,2,null].sort((a,b)=>h.sortValues(a,b,'desc')), [10,2.5,2,0,null]);
assert.notEqual(h.format(0.000013333333333333333), '0', 'A nonzero navigation ratio must not appear as zero');
assert.equal(h.format(0), '0');
assert.equal(h.format(null), '—');
const expectedRanks = fixture.entities.filter(e=>e.ranked).map(e=>e.rank).sort((a,b)=>a-b);
assert.deepEqual(Array.from(h.rankedEntities(),e=>e.rank), expectedRanks);
for (const indicator of fixture.indicators) {
  const rows = h.indicatorCells(indicator);
  assert.equal(rows.length, fixture.entities.length);
  const sourceSheet = fixture.sheets.find(s=>s.id===indicator.sheetId);
  const orderedIds = sourceSheet.rows.filter(r=>r.entityId).map(r=>r.entityId);
  assert.deepEqual(Array.from(rows.slice(0,orderedIds.length),r=>r.entity.id), orderedIds,
    indicator.id+' must use its own sheet source order');
  if (indicator.type === 'composite') assert.equal(h.numIndicatorCells(indicator).length,0);
}
for (const entity of fixture.entities) {
  assert.ok(h.entityURL(entity).startsWith('#/entity/'));
  assert.equal(decodeURIComponent(h.entityURL(entity).split('/').pop()),entity.id);
}
const danger = h.inspectCell({value:'<script>alert(1)</script>', kind:'text'}, '');
assert.ok(!danger.includes('<script>'));
assert.ok(danger.includes('&lt;script&gt;'));
const error = h.inspectCell({value:null,error:'#DIV/0!',kind:'error'}, '');
assert.ok(error.includes('#DIV/0!'));
for (const field of fixture.indicators.filter(f=>f.type==='composite')) {
  const columns = h.tableColumns([field]);
  assert.equal(columns.length,2);
  assert.deepEqual(Array.from(columns,c=>c.partId),['primary','secondary']);
  assert.equal(new Set(Array.from(columns,c=>c.displayId)).size,2);
  for (const entity of fixture.entities) {
    const cell = entity.metrics[field.id];
    assert.equal(h.displayCellValue(cell),cell.value==null?'—':cell.composite.display);
    const html = h.inspectCell(cell,'')+h.compositeValues(cell,field,'');
    for (const part of cell.composite.parts) {
      const expected = cell.value==null?'—':part.digits==null?'未单列':String(part.digits);
      assert.equal(h.displayCellValue(cell,part.id),expected);
      if (part.value===0) assert.equal(h.displayCellValue(cell,part.id),'0');
      if (part.value==null) assert.notEqual(h.displayCellValue(cell,part.id),'0');
    }
    if (cell.raw && cell.composite.display!==cell.raw) {
      assert.ok(!html.includes(cell.raw),entity.name+' '+field.id+' must not expose storage tails in normal cell rendering');
    }
  }
}
const explanation = h.readerExplanation({title:'<script>bad</script>',text:'<img src=x onerror="bad()"> & text',pages:[2]});
assert.ok(!explanation.includes('<script>'));
assert.ok(!explanation.includes('<img'));
assert.ok(explanation.includes('&lt;img'));
assert.ok(explanation.includes('PDF 第2页'));
console.log('JavaScript pure helpers passed: sorting, null/zero, HTML escaping, source ordering, all routes, composite display/parts, report citations.');
'''
        result = subprocess.run([NODE, "-e", script], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
