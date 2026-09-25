"""Author-confirmed codes remain explanations, never replacement source values.

The existing fidelity tests cover raw workbook records and composite parsing.
These checks focus on the additional meanings and their shared UI rendering.
"""
from pathlib import Path
import copy
import json
import os
import runpy
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.environ.get("NP_SITE_DIST", ROOT / "dist"))
NODE = shutil.which("node") or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")

NORMAL_CODES = {
    "stability-P": {1: "扣分项", -1: "加分项"},
    "stability-Q": {1: "扣分项", -1: "加分项"},
    "stability-R": {1: "扣分项", -1: "加分项"},
    "military-T": {1: "北约成员", 0: "其他美国盟友"},
    "military-N": {0: "有五代机"},
}


class AnnotationBoundaries(unittest.TestCase):
    def test_normalized_and_literal_component_boundaries_keep_distinct_meanings(self):
        pipeline = runpy.run_path(str(ROOT / "scripts/build_data.py"))
        config = json.loads((ROOT / "config/workbook.json").read_text(encoding="utf-8"))
        military = next(sheet for sheet in config["sheets"] if sheet["id"] == "military")
        # These fixed examples remain useful after the author's next Excel update.
        fixtures = [
            ("M", "4.0999999999999996", False, "4.1", "高级非核潜艇"),
            ("M", "21.1", False, "21.1", "高级非核潜艇"),
            ("M", "67.11", False, "67.11", None),
            ("M", "12.100", True, "12.100", None),
            ("M", "6.01", True, "6.01", None),
            ("M", "21", False, "21", None),
            ("M", "1.2.3", True, "1.2.3", None),
            ("G", "0.1", False, "0.1", None),
            ("J", "0.3", False, "0.3", "曾有航空母舰"),
            ("J", "0.1", False, "0.1", "曾有航空母舰"),
            ("J", "0.0", True, "0.0", None),
            ("J", "0", False, "0", None),
            ("J", "20.126200000000001", False, "20.1262", None),
        ]
        for column, raw, is_text, readable, meaning in fixtures:
            with self.subTest(column=column, raw=raw, is_text=is_text):
                cell = {"raw": raw, "value": raw if is_text else pipeline["numeric"](raw),
                        "kind": "text" if is_text else "number", "error": None}
                definition = pipeline["create_indicator"](military, column, [cell])
                cell["composite"] = pipeline["parse_composite"](cell, definition["compositeParts"])
                before = copy.deepcopy(cell)
                pipeline["annotate_cell"](cell, definition)
                self.assertEqual(cell["composite"]["display"], readable)
                secondary = cell["composite"]["parts"][1]
                self.assertEqual(secondary.get("meaning"), meaning)
                if meaning:
                    self.assertEqual(secondary.get("meaningCode"), readable)
                    self.assertIn("作者确认", secondary.get("meaningSource", ""))
                    self.assertIs(secondary.get("countable"), False)
                for key in ("raw", "value", "kind", "error"):
                    self.assertEqual(cell[key], before[key], "Annotation cannot rewrite a source value")
                for original, annotated in zip(before["composite"]["parts"], cell["composite"]["parts"]):
                    for key in ("digits", "value", "status"):
                        self.assertEqual(annotated[key], original[key],
                                         "A meaning must not replace the independently verified code")


class BuiltAuthorInterpretations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((DIST / "data/dataset.json").read_text(encoding="utf-8"))

    def assert_author_meaning(self, record, expected, code):
        self.assertEqual(record.get("meaning"), expected)
        self.assertEqual(record.get("meaningCode"), code)
        self.assertIn("作者确认", record.get("meaningSource", ""))

    def test_scalar_codes_are_field_specific_and_zero_is_not_missing(self):
        checked = 0
        for entity in self.data["entities"]:
            for metric, meanings in NORMAL_CODES.items():
                cell = entity["metrics"][metric]
                expected = None if cell.get("error") else meanings.get(cell.get("value"))
                with self.subTest(entity=entity["id"], metric=metric):
                    if expected is None:
                        self.assertFalse(cell.get("meaning"), "Blank and unconfirmed codes stay uninterpreted")
                    else:
                        self.assert_author_meaning(cell, expected, str(cell["value"]))
                        checked += 1
        self.assertGreater(checked, 0, "Exercise author meanings against the actual built workbook")

    def test_submarine_marker_uses_the_exact_secondary_record_only_in_m(self):
        for entity in self.data["entities"]:
            for metric in ("military-M", "military-G"):
                cell = entity["metrics"][metric]
                composite = cell["composite"]
                primary, secondary = composite["parts"]
                expected = (metric == "military-M" and cell["value"] is not None
                            and not cell.get("error") and composite["status"] != "unparsed"
                            and secondary["digits"] == "1")
                with self.subTest(entity=entity["id"], metric=metric):
                    self.assertFalse(primary.get("meaning"))
                    if expected:
                        self.assert_author_meaning(secondary, "高级非核潜艇", composite["display"])
                        self.assertIs(secondary.get("countable"), False)
                    else:
                        self.assertFalse(secondary.get("meaning"),
                                         "G, missing secondary records, and multi-digit codes are not M's marker")
                    if metric == "military-G":
                        self.assertFalse(cell.get("meaning"), "Nuclear/strategic-submarine .1 remains unconfirmed")

    def test_carrier_history_is_a_marker_not_an_aircraft_count(self):
        for entity in self.data["entities"]:
            cell = entity["metrics"]["military-J"]
            composite = cell["composite"]
            primary, secondary = composite["parts"]
            expected = (cell["value"] is not None and not cell.get("error")
                        and composite["status"] != "unparsed" and primary["digits"] == "0"
                        and secondary["digits"] is not None and int(secondary["digits"]) != 0)
            with self.subTest(entity=entity["id"]):
                self.assertFalse(primary.get("meaning"))
                if expected:
                    self.assert_author_meaning(secondary, "曾有航空母舰", composite["display"])
                    self.assertIs(secondary.get("countable"), False)
                else:
                    self.assertFalse(secondary.get("meaning"),
                                     "A current carrier record, blank, or literal zero is not a history marker")

    def test_blank_and_error_records_never_gain_a_meaning(self):
        checked = 0
        for entity in self.data["entities"]:
            for metric, cell in entity["metrics"].items():
                if cell.get("value") is not None and not cell.get("error"):
                    continue
                with self.subTest(entity=entity["id"], metric=metric):
                    self.assertFalse(cell.get("meaning"))
                    for part in cell.get("composite", {}).get("parts", []):
                        self.assertFalse(part.get("meaning"))
                    checked += 1
        self.assertGreater(checked, 0)


@unittest.skipUnless(NODE, "Node.js is required for author-code UI checks")
class AuthorInterpretationRendering(unittest.TestCase):
    def run_js(self, assertions):
        setup = r'''
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.NP_SITE_DIST || 'dist', 'data/dataset.json'), 'utf8'));
const source = fs.readFileSync('web/app.js', 'utf8');
const boundary = source.indexOf('function navActive(');
assert.ok(boundary > 0, 'Rendering helpers must be usable without a DOM');
const prefix = source.slice(0, boundary).replace(/^const app = .*;\r?\n/m, '');
const context = vm.createContext({fixture, URLSearchParams});
vm.runInContext(prefix + `
db = fixture;
byId = new Map(db.entities.map(entity => [entity.id, entity]));
byIndicator = new Map(db.indicators.map(indicator => [indicator.id, indicator]));
bySheet = new Map(db.sheets.map(sheet => [sheet.id, sheet]));
globalThis.helpers = {displayCellValue, recordValueHTML, inspectCell};
`, context);
const h = context.helpers;
'''
        result = subprocess.run([NODE, "-e", setup + assertions], cwd=ROOT,
                                capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_shared_renderer_shows_meaning_and_original_code_without_replacing_records(self):
        self.run_js(r'''
const before = JSON.stringify(fixture);
let interpreted = 0;
for (const entity of fixture.entities) {
  for (const [metric, cell] of Object.entries(entity.metrics)) {
    const records = [[null, cell], ...(cell.composite?.parts || []).map(part => [part.id, part])];
    for (const [partId, record] of records) {
      if (!record.meaning) continue;
      const html = h.recordValueHTML(cell, partId);
      const inspected = h.inspectCell(cell, '', '', partId);
      for (const output of [html, inspected]) {
        assert.ok(output.includes(record.meaning), entity.name + ' ' + metric + ' needs its confirmed meaning');
        assert.ok(output.includes('原码'), 'A confirmed label must retain visible access to the original code');
        assert.ok(output.includes(String(record.meaningCode)), 'Preserve the complete normalized composite code');
      }
      assert.equal(h.displayCellValue(cell, partId), partId ? record.digits : String(cell.value),
        'The primitive reader continues to expose the unchanged stored record');
      interpreted++;
    }
  }
  const nuclear = entity.metrics['military-G'];
  assert.ok(!h.recordValueHTML(nuclear, 'secondary').includes('高级非核潜艇'), 'M meaning must never leak into G');
}
assert.ok(interpreted > 0);
assert.equal(JSON.stringify(fixture), before, 'Rendering may not mutate the data layer');
''')

    def test_renderer_escapes_author_text_and_preserves_uninterpreted_values(self):
        self.run_js(r'''
const fake = {value:1, raw:'1', kind:'number', meaning:'<img src=x onerror="bad()">',
  meaningCode:'<svg/onload=bad()>', meaningSource:'作者确认'};
const html = h.recordValueHTML(fake);
assert.ok(!html.includes('<img') && !html.includes('<svg'), 'Meaning and code are text, never executable markup');
assert.ok(html.includes('&lt;img') && html.includes('&lt;svg'), 'Escaping must not silently discard the source text');
assert.ok(h.recordValueHTML({value:null, raw:null, kind:'blank'}).includes('—'));
assert.ok(h.recordValueHTML({value:null, raw:null, kind:'error', error:'#DIV/0!'}).includes('#DIV/0!'));
assert.equal(h.displayCellValue({value:0, raw:'0', kind:'number'}), '0');
assert.ok(!h.recordValueHTML({value:0, raw:'0', kind:'number'}).includes('有五代机'),
  'A zero without field-specific interpretation is just a recorded zero');
''')


if __name__ == "__main__":
    unittest.main()
