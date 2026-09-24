"""Reading semantics and standalone-guide regression checks, without a DOM stub."""
from html.parser import HTMLParser
from pathlib import Path
import os
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.environ.get("NP_SITE_DIST", ROOT / "dist"))
NODE = shutil.which("node") or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")


class ScriptContents(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.scripts = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.current = {"attrs": dict(attrs), "text": ""}
            self.scripts.append(self.current)

    def handle_data(self, data):
        if self.current is not None:
            self.current["text"] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.current = None


@unittest.skipUnless(NODE, "Node.js is required for reading-semantics checks")
class ReadingDesign(unittest.TestCase):
    def run_js(self, assertions, *, with_app=True):
        setup = r'''
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.NP_SITE_DIST || 'dist', 'data/dataset.json'), 'utf8'));
const guideSource = fs.readFileSync('web/reading-guide.js', 'utf8');
const context = vm.createContext({fixture, URLSearchParams});
vm.runInContext(guideSource + '\nglobalThis.guide = READING_GUIDE;', context);
const guide = context.guide;
const fields = new Map(fixture.indicators.map(field => [field.id, field]));
'''
        if with_app:
            setup += r'''
const source = fs.readFileSync('web/app.js', 'utf8');
const end = source.indexOf('function navActive(');
assert.ok(end > 0, 'Pure helper declarations must precede DOM routing');
const prefix = source.slice(0, end).replace(/^const app = .*;\r?\n/m, '');
vm.runInContext(prefix + `
db = fixture;
byId = new Map(db.entities.map(entity => [entity.id, entity]));
byIndicator = new Map(db.indicators.map(indicator => [indicator.id, indicator]));
bySheet = new Map(db.sheets.map(sheet => [sheet.id, sheet]));
globalThis.readingHelpers = {readingMode, knownMetadata, scoreReading, comparisonReading};
`, context);
const h = context.readingHelpers;
const noCapacityBar = html => assert.doesNotMatch(html, /bar-track|bar-fill/, 'This reading must not become a capacity-length bar');
const rowFor = (entity, metricId, value = entity.metrics[metricId].value, chartable = true) => ({
  entity, metricId, value, chartable,
  cell: {...entity.metrics[metricId], value},
});
'''
        result = subprocess.run(
            [NODE, "-e", setup + assertions], cwd=ROOT,
            capture_output=True, text=True, encoding="utf-8",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_every_published_rank_uses_rank_reading_without_capacity_bars(self):
        self.run_js(r'''
const rankIds = [
  'summary-B', 'summary-E', 'summary-F', 'summary-G',
  'politics-A', 'economy-A', 'military-A',
  'energy-I', 'energy-K', 'energy-O',
  'transport-E', 'transport-H', 'transport-K', 'transport-N', 'transport-Q', 'transport-S',
  'economy-D', 'economy-F', 'economy-H', 'economy-J', 'economy-L', 'economy-N',
  'economy-P', 'economy-S', 'economy-U',
];
for (const id of rankIds) {
  const indicator = fields.get(id);
  assert.ok(indicator, id + ' must remain an actual workbook field');
  assert.equal(h.readingMode(indicator), 'rank', id);
  const rows = fixture.entities.slice(0, 3).map(entity => rowFor(entity, id));
  noCapacityBar(h.comparisonReading('rank', rows, indicator));
}
const fractional = fixture.entities[0], originalRank = fractional.rank;
const html = h.comparisonReading('rank', [rowFor(fractional, 'summary-B', 2.5)], fields.get('summary-B'));
assert.match(html, /2\.5/, 'The source fractional rank must be retained');
assert.equal(fractional.rank, originalRank, 'A presentation fixture must not change a research result');
''')

    def test_only_confirmed_foundation_fields_use_the_five_level_score(self):
        self.run_js(r'''
const scoreIds = ['summary-H', 'summary-I', 'summary-J', 'summary-K', 'summary-L',
  'transport-A', 'agriculture-A', 'energy-A', 'minerals-A', 'stability-A'];
for (const id of scoreIds) assert.equal(h.readingMode(fields.get(id)), 'score', id);
assert.equal(h.readingMode(fields.get('politics-B')), 'value', 'Political assessment is not a 1–5 foundation score');
assert.equal(h.readingMode({...fields.get('politics-B'), role:'score'}), 'value', 'A generic score label cannot invent a five-level scale');
for (const id of ['military-C', 'military-D', 'military-E', 'military-F']) {
  const indicator = fields.get(id);
  assert.equal(h.readingMode(indicator), 'value', id + ': do not invent unconfirmed semantics');
  noCapacityBar(h.comparisonReading('value', fixture.entities.slice(0, 3).map(entity => rowFor(entity, id)), indicator));
}
for (const indicator of fixture.indicators.filter(field => field.type === 'composite')) {
  assert.equal(h.readingMode(indicator), 'composite', indicator.id);
}
for (const indicator of fixture.indicators.filter(field => field.role === 'reference')) {
  assert.equal(h.readingMode(indicator), 'reference', indicator.id);
}
''')

    def test_score_scale_does_not_change_when_other_entities_change(self):
        self.run_js(r'''
const indicator = fields.get('summary-H');
const entities = fixture.entities.slice(0, 3);
for (const value of [1, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
  const reading = h.scoreReading(value);
  assert.match(reading, new RegExp(String(value).replace('.', '\\.')), 'Exact score is retained');
  const ticks = [...reading.matchAll(/<i\b[^>]*>([1-5])<\/i>/g)].map(match => match[1]);
  assert.deepEqual(ticks, ['1','2','3','4','5'], 'The visible foundation scale has five fixed levels');
  if (!Number.isInteger(value)) {
    assert.doesNotMatch(reading, /明显短缺|依赖外部条件|够用|基本完整且单项突出|充足且有余量/,
      'A fractional source score must not acquire a guessed integer descriptor');
  }
  const lowPeers = h.comparisonReading('score', [rowFor(entities[0], indicator.id, value), rowFor(entities[1], indicator.id, 1)], indicator);
  const highPeers = h.comparisonReading('score', [rowFor(entities[0], indicator.id, value), rowFor(entities[2], indicator.id, 5)], indicator);
  assert.ok(lowPeers.includes(reading), 'A low peer must not stretch the target score');
  assert.ok(highPeers.includes(reading), 'A high peer must not shrink the target score');
  noCapacityBar(lowPeers);
  noCapacityBar(highPeers);
}
''')

    def test_supplementary_markers_never_use_the_normal_score_scale(self):
        self.run_js(r'''
const indicator = fields.get('summary-H');
const entity = {...fixture.entities[0], ranked:false};
for (const value of [10, 100]) {
  const reading = h.scoreReading(value, false);
  assert.match(reading, new RegExp(String(value)));
  assert.match(reading, /补充记录|原始记录/);
  assert.doesNotMatch(reading, /score-scale/, 'A supplementary marker has no foundation scale');
  const comparison = h.comparisonReading('score', [rowFor(entity, indicator.id, value, false)], indicator);
  assert.ok(comparison.includes(reading), 'Supplementary eligibility must survive comparison rendering');
  noCapacityBar(comparison);
}
assert.notEqual(h.scoreReading(3, false), h.scoreReading(3, true), 'A supplementary marker within the normal numeric range is still not a foundation rating');
assert.doesNotMatch(h.scoreReading(3, false), /score-scale/, 'Eligibility governs presentation even for a marker between 1 and 5');
assert.match(h.scoreReading(100), /补充记录|原始记录/, 'Out-of-range values cannot enter a normal five-level scale');
assert.doesNotMatch(h.scoreReading(100), /score-scale/);
''')

    def test_metadata_omits_unknowns_without_losing_known_zero_values(self):
        self.run_js(r'''
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(h.knownMetadata({unit:null, year:undefined, source:'', sheetName:'能源'})), [['工作表','能源']]);
assert.deepEqual(plain(h.knownMetadata({unit:0, year:0, source:'原表', sheetName:'能源'})),
  [['单位',0], ['观测年份',0], ['数据来源','原表'], ['工作表','能源']]);
for (const indicator of fixture.indicators) {
  const metadata = plain(h.knownMetadata(indicator));
  assert.ok(metadata.every(([,value]) => value !== null && value !== undefined && value !== ''), indicator.id);
  for (const [label,key] of [['单位','unit'], ['观测年份','year'], ['数据来源','source'], ['工作表','sheetName']]) {
    if (indicator[key] !== null && indicator[key] !== undefined && indicator[key] !== '') {
      assert.ok(metadata.some(([actualLabel,value]) => actualLabel === label && value === indicator[key]), indicator.id + ': known metadata must remain');
    }
  }
}
''')

    def test_guide_links_only_to_actual_domains_and_workbook_fields(self):
        self.run_js(r'''
const domainIds = new Set(fixture.domains.map(domain => domain.id));
assert.deepEqual(Object.keys(guide.domains).sort(), [...domainIds].sort(), 'Every current domain needs a reading guide');
assert.ok(Array.isArray(guide.groups) && guide.groups.length > 0);
const grouped = new Set();
for (const group of guide.groups) {
  assert.ok(group.id && group.title && group.intro);
  assert.ok(Array.isArray(group.domains) && group.domains.length > 0);
  for (const id of group.domains) {
    assert.ok(domainIds.has(id), group.id + ': unknown domain ' + id);
    grouped.add(id);
  }
}
assert.deepEqual([...grouped].sort(), [...domainIds].sort(), 'Domain navigation must reach every current domain');
for (const [id, domain] of Object.entries(guide.domains)) {
  assert.ok(domain.question && domain.intro && domain.connections, id);
  assert.ok(Array.isArray(domain.facets) && domain.facets.length > 0, id);
  for (const facet of domain.facets) {
    assert.ok(facet.title && facet.text, id + ': reading facet needs context');
    assert.ok(Array.isArray(facet.fields) && facet.fields.length > 0, id);
    for (const fieldId of facet.fields) assert.ok(fields.has(fieldId), id + ': unknown workbook field ' + fieldId);
  }
}
''', with_app=False)

    def test_standalone_preview_embeds_the_same_guide_before_the_app(self):
        parser = ScriptContents()
        parser.feed((DIST / "offline.html").read_text(encoding="utf-8"))
        self.assertFalse(
            [script for script in parser.scripts if script["attrs"].get("src")],
            "The standalone preview must not load the reading guide or any app script externally",
        )
        guide = (ROOT / "web/reading-guide.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
        embedded = [index for index, script in enumerate(parser.scripts) if script["text"] == guide]
        self.assertEqual(len(embedded), 1, "Embed the exact current guide once")
        modules = [index for index, script in enumerate(parser.scripts) if script["attrs"].get("type") == "module"]
        self.assertTrue(modules, "The hosted app must remain present in the standalone preview")
        self.assertLess(embedded[0], min(modules), "The guide must be defined before the app reads it")


if __name__ == "__main__":
    unittest.main()
