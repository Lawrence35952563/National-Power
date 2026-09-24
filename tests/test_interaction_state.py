"""Navigation-state contracts without browser emulation or research-value fixtures.

These checks cover the serializable state shared by controls, direct links and
history restoration. Actual focus, scrolling and Back/Forward interaction are
verified separately in a real browser.
"""
from pathlib import Path
import os
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node") or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")


@unittest.skipUnless(NODE, "Node.js is required for interaction-state checks")
class InteractionState(unittest.TestCase):
    def run_js(self, assertions):
        setup = r'''
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.NP_SITE_DIST || 'dist', 'data/dataset.json'), 'utf8'));
const context = vm.createContext({fixture, URLSearchParams});
vm.runInContext(fs.readFileSync('web/reading-guide.js', 'utf8'), context);
const source = fs.readFileSync('web/app.js', 'utf8');
const boundary = source.indexOf('function navActive(');
assert.ok(boundary > 0, 'State helpers must be callable independently of DOM routing');
const prefix = source.slice(0, boundary).replace(/^const app = .*;\r?\n/m, '');
vm.runInContext(prefix + `
db = fixture;
byId = new Map(db.entities.map(entity => [entity.id, entity]));
byIndicator = new Map(db.indicators.map(indicator => [indicator.id, indicator]));
bySheet = new Map(db.sheets.map(sheet => [sheet.id, sheet]));
globalThis.stateHelpers = {normalizeSelection, resolveColumns, columnThemeIds,
  existingThemeGroups, serializeViewState, parseRouteLocation, createViewHistory};
globalThis.guide = READING_GUIDE;
`, context);
const h = context.stateHelpers;
const plain = value => JSON.parse(JSON.stringify(value));
const fields = [
  {id:'test-A', column:'A', role:'identity'},
  {id:'test-B', column:'B', role:'indicator'},
  {id:'test-C', column:'C', role:'auxiliary'},
  {id:'test-D', column:'D', role:'indicator'},
];
'''
        result = subprocess.run(
            [NODE, "-e", setup + assertions], cwd=ROOT,
            capture_output=True, text=True, encoding="utf-8",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_selection_keeps_user_order_and_enforces_the_allowed_set_and_limit(self):
        self.run_js(r'''
const allowed = ['a','b','c','d','e','f'];
const original = ['c','unknown','a','c','f','b','d','e'];
assert.deepEqual(plain(h.normalizeSelection(original, allowed, 5)), ['c','a','f','b','d']);
assert.deepEqual(original, ['c','unknown','a','c','f','b','d','e'], 'Parsing cannot mutate a control selection');
assert.deepEqual(plain(h.normalizeSelection('f,b,f,unknown,a', allowed)), ['f','b','a']);
assert.deepEqual(plain(h.normalizeSelection('', allowed, 5)), [], 'Explicit empty selection stays empty');
assert.deepEqual(plain(h.normalizeSelection(null, allowed, 5)), []);
assert.deepEqual(plain(h.normalizeSelection('unknown', allowed, 5)), []);
''')

    def test_share_links_round_trip_filters_and_multiple_selections(self):
        self.run_js(r'''
const values = {
  q:'日本 / Japan & ? +', category:'示例分类', scope:'supplementary',
  sort:'name', dir:'desc', view:'domains', reference:false,
  entities:['second','first'], metrics:['field-B','field-A'],
  theme:'0', columns:['test-D','test-A'], raw:0,
};
const parsed = h.parseRouteLocation(h.serializeViewState('rankings', values));
assert.equal(parsed.path, 'rankings');
for (const [key,value] of Object.entries(values)) {
  assert.equal(parsed.params.get(key), Array.isArray(value) ? value.join(',') : String(value), key);
}
const again = h.parseRouteLocation(h.serializeViewState(parsed.path, Object.fromEntries(parsed.params)));
assert.equal(again.path, parsed.path);
assert.equal(again.params.toString(), parsed.params.toString(), 'A refreshed/shared URL has stable state');
''')

    def test_query_distinguishes_absent_settings_from_deliberately_empty_ones(self):
        self.run_js(r'''
const parsed = h.parseRouteLocation(h.serializeViewState('data', {
  sheet:'example', q:'', columns:[], theme:null, sort:undefined,
  raw:false, offset:0,
}));
assert.equal(parsed.path, 'data');
assert.equal(parsed.params.get('sheet'), 'example');
for (const key of ['q','columns']) {
  assert.equal(parsed.params.has(key), true, key + ': an explicit reset must survive a link');
  assert.equal(parsed.params.get(key), '');
}
assert.equal(parsed.params.has('theme'), false);
assert.equal(parsed.params.has('sort'), false);
assert.equal(parsed.params.get('raw'), 'false');
assert.equal(parsed.params.get('offset'), '0');
assert.equal(h.parseRouteLocation('#/').path, '');
assert.equal(h.parseRouteLocation('#/indicator/example-A').path, 'indicator/example-A');
assert.equal(h.parseRouteLocation('#/rankings').params.toString(), '');
''')

    def test_column_defaults_and_explicit_empty_selection_preserve_identity(self):
        self.run_js(r'''
assert.deepEqual(plain(h.resolveColumns(null, fields, 'test-A')), ['test-A','test-B','test-D']);
assert.deepEqual(plain(h.resolveColumns('', fields, 'test-A')), ['test-A']);
assert.deepEqual(plain(h.resolveColumns('unknown', fields, 'test-A')), ['test-A']);
assert.deepEqual(plain(h.resolveColumns('test-D,C,test-D,B,unknown', fields, 'test-A')),
  ['test-A','test-B','test-C','test-D'], 'Selected fields retain workbook column order, including auxiliaries');
assert.deepEqual(plain(h.resolveColumns('test-D', fields, 'test-A')), ['test-A','test-D']);
assert.deepEqual(fields.map(field => field.id), ['test-A','test-B','test-C','test-D']);
''')

    def test_theme_switching_only_selects_existing_fields_and_keeps_full_table_available(self):
        self.run_js(r'''
const guide = context.guide;
for (const sheet of fixture.sheets) {
  const actualFields = sheet.columns.map(column => fixture.indicators.find(field => field.id === (column.indicatorId || column.id)) || column);
  const identity = actualFields.find(field => field.role === 'identity');
  assert.ok(identity, sheet.id + ': fixture needs an identity field');
  const allIds = actualFields.map(field => field.id);
  const groups = h.existingThemeGroups(sheet.id);
  for (const group of groups) {
    const facet = guide.domains[sheet.id].facets[Number(group.key)];
    assert.equal(group.title, facet.title, 'Display themes reuse the existing research explanation');
    assert.equal(group.text, facet.text);
    assert.deepEqual(plain(group.fields), plain(facet.fields.filter(id => allIds.includes(id))));
    const selected = plain(h.columnThemeIds(sheet.id, group.key, actualFields, identity.id));
    assert.ok(selected.includes(identity.id), sheet.id + ': entity column is always accessible');
    assert.ok(selected.every(id => allIds.includes(id)), sheet.id + ': a theme cannot introduce a new field');
    for (const id of group.fields) assert.ok(selected.includes(id), id + ': theme fields must remain available');
  }
  assert.deepEqual(plain(h.columnThemeIds(sheet.id, 'all', actualFields, identity.id)), allIds,
    sheet.id + ': full original columns remain recoverable after choosing a theme');
  assert.deepEqual(plain(h.columnThemeIds(sheet.id, 'named', actualFields, identity.id)),
    actualFields.filter(field => field.role !== 'auxiliary' || field.id === identity.id).map(field => field.id));
}
''')

    def test_individual_history_entries_do_not_overwrite_each_other(self):
        self.run_js(r'''
const history = h.createViewHistory();
const first = {hash:'#/rankings?q=first', scrollY:420, scrollX:0, tables:[{key:'ranking',left:180}]};
const second = {hash:'#/rankings?q=second', scrollY:900, scrollX:0, tables:[{key:'ranking',left:0}]};
history.save('entry-1', first);
history.save('entry-2', second);
assert.deepEqual(plain(history.read('entry-1')), first);
assert.deepEqual(plain(history.read('entry-2')), second);
assert.ok(history.read('unknown-entry') == null, 'A new direct link has no unrelated scroll snapshot');
history.save('entry-1', {...first, scrollY:530});
assert.equal(history.read('entry-1').scrollY, 530);
assert.equal(history.read('entry-2').scrollY, 900);
assert.equal(Array.from(history.entries()).length, 2, 'Saving an existing entry updates it instead of duplicating it');
''')

    def test_history_retains_recently_updated_entries_with_a_bounded_size(self):
        self.run_js(r'''
const history = h.createViewHistory(3);
history.save('one', {scrollY:1});
history.save('two', {scrollY:2});
history.save('three', {scrollY:3});
history.save('one', {scrollY:10});
history.save('four', {scrollY:4});
assert.equal(Array.from(history.entries()).length, 3);
assert.equal(history.read('one').scrollY, 10, 'Updating an old entry makes it recent');
assert.equal(history.read('three').scrollY, 3);
assert.equal(history.read('four').scrollY, 4);
assert.ok(history.read('two') == null, 'Only the least recently saved entry is evicted');
''')

    def test_history_can_restore_non_numeric_view_state_without_dataset_storage(self):
        self.run_js(r'''
const history = h.createViewHistory();
const snapshot = {
  hash:'#/data?sheet=example&q=Japan&theme=0&cols=A%2CD',
  scrollY:720, scrollX:0,
  tables:[{key:'sheet-table',left:360,top:80}],
  openDetails:['column-picker','entity-domain-example'],
  fields:{'column-search':'water','compare-search':''},
};
history.save('data-entry', snapshot);
const recovered = JSON.parse(JSON.stringify(history.read('data-entry')));
assert.deepEqual(recovered, snapshot, 'The complete UI snapshot remains serializable for refresh restoration');
assert.equal(h.parseRouteLocation(recovered.hash).params.get('q'), 'Japan');
assert.equal(h.parseRouteLocation(recovered.hash).params.get('theme'), '0');
assert.equal(Object.hasOwn(recovered, 'dataset'), false);
assert.equal(Object.hasOwn(recovered, 'entities'), false);
''')


if __name__ == '__main__':
    unittest.main()
