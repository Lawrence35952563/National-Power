"""Presentation-only English support: state, records, search and offline assets.

The JavaScript core is exercised in a VM without window or document. These
checks do not emulate browser navigation, layout or the DOM translation pass;
those remain part of the separate browser acceptance checks.
"""
from html.parser import HTMLParser
from pathlib import Path
import json
import os
import re
import shutil
import subprocess
import unittest
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.environ.get("NP_SITE_DIST", ROOT / "dist"))
NODE = shutil.which("node") or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")


class ScriptAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.stylesheets = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "script":
            self.current = {"attrs": attributes, "text": ""}
            self.scripts.append(self.current)
        elif tag == "link" and "stylesheet" in attributes.get("rel", "").split():
            self.stylesheets.append(attributes.get("href", ""))

    def handle_data(self, data):
        if self.current is not None:
            self.current["text"] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self.current = None


def load_catalogs():
    catalogs = sorted((ROOT / "web/locales").glob("en-*.json"))
    if not catalogs:
        raise AssertionError("The build needs reviewed English display catalogs")
    entries = {}
    for path in catalogs:
        catalog = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(catalog, dict):
            raise AssertionError(f"A display catalog must be an object: {path.name}")
        for key, value in catalog.items():
            if not isinstance(key, str) or not isinstance(value, str) or not value.strip():
                raise AssertionError(f"A display entry must map text to text: {path.name}: {key}")
        entries.update(catalog)
    return entries


@unittest.skipUnless(NODE, "Node.js is required for localization behavior checks")
class LocalizationCore(unittest.TestCase):
    def run_js(self, assertions):
        setup = r'''
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({URL, URLSearchParams});
const source = fs.readFileSync('web/i18n.js', 'utf8');
vm.runInContext(source + '\nglobalThis.core = NP_I18N_CORE;', context);
assert.equal(vm.runInContext('typeof window', context), 'undefined');
assert.equal(vm.runInContext('typeof document', context), 'undefined');
const h = context.core;
const catalogFiles = fs.readdirSync('web/locales').filter(name => /^en-.*\.json$/.test(name)).sort();
assert.ok(catalogFiles.length, 'Load the actual reviewed dictionaries');
const entries = Object.assign({}, ...catalogFiles.map(name =>
  JSON.parse(fs.readFileSync(path.join('web/locales', name), 'utf8'))));
const translate = h.createTranslator(entries);
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.NP_SITE_DIST || 'dist', 'data/dataset.json'), 'utf8'));
const cjk = /[\u3400-\u9fff]/;
const english = (text, label) => {
  const result = translate(text);
  assert.ok(result.trim(), label + ': translation must not erase the label');
  assert.doesNotMatch(result, cjk, label + ': untranslated visible text: ' + result);
  return result;
};
'''
        result = subprocess.run(
            [NODE, "-e", setup + assertions], cwd=ROOT,
            capture_output=True, text=True, encoding="utf-8",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_explicit_language_overrides_preference_and_invalid_values_fall_back(self):
        self.run_js(r'''
for (const preference of [undefined, null, '', 'zh', 'en', 'fr', 'EN']) {
  assert.equal(h.selectLanguage('?lang=zh', preference), 'zh', 'An explicit Chinese link overrides English preference');
  assert.equal(h.selectLanguage('?lang=en', preference), 'en');
  for (const search of ['', '?q=Japan', '?lang=', '?lang=fr', '?lang=EN', '?lang=%3Cscript%3E']) {
    assert.equal(h.selectLanguage(search, preference), preference === 'en' ? 'en' : 'zh',
      'Without a supported explicit language, use a supported preference or the Chinese default');
  }
}
assert.equal(h.selectLanguage('?q=lang%3Den&lang=zh', 'en'), 'zh',
  'A language-like string inside another query value is not a language setting');
''')

    def test_language_links_preserve_subpaths_hash_filters_ids_and_other_queries(self):
        self.run_js(r'''
const outer = '?source=shared%20link&empty=&tag=a%2Fb&tag=c%2Bd&note=%26%3F%23%25&lang=zh';
const state = new URLSearchParams({
  q:'日本 / Japan & ? + # %', scope:'supplementary', category:'测试分类',
  sort:'name', dir:'desc', view:'domains', reference:'0',
  entities:fixture.entities.slice(0, 3).map(entity => entity.id).join(','),
  metrics:fixture.indicators.slice(0, 3).map(field => field.id).join(','),
  sheet:fixture.sheets[0].id, theme:'0', columns:'', columnq:'GDP + population', raw:'1',
});
const urls = [
  'https://example.test/National-Power/' + outer + '#/compare?' + state,
  'https://example.test/National-Power/nested%20path/index.html' + outer + '#/data?' + state,
  'https://example.test/National-Power/' + outer + '#/entity/' + encodeURIComponent(fixture.entities[0].id),
  'file:///C:/Research/National%20Power/offline.html' + outer + '#/rankings?' + state,
];
for (const href of urls) {
  const before = new URL(href);
  const unchangedQueries = [...before.searchParams].filter(([key]) => key !== 'lang');
  for (const requested of ['en', 'zh', 'unsupported']) {
    const after = new URL(h.languageURL(href, requested));
    assert.equal(after.protocol, before.protocol);
    assert.equal(after.host, before.host);
    assert.equal(after.pathname, before.pathname, 'Keep the repository and any nested/file path');
    assert.equal(after.hash, before.hash, 'All route state and IDs remain byte-for-byte unchanged');
    assert.deepEqual([...after.searchParams].filter(([key]) => key !== 'lang'), unchangedQueries,
      'Preserve repeated, empty and specially encoded outer query values');
    assert.deepEqual(after.searchParams.getAll('lang'), [requested === 'en' ? 'en' : 'zh']);
    assert.equal([...after.searchParams].length, unchangedQueries.length + 1,
      'Changing language adds only the language flag, never dataset values');
  }
  const back = new URL(h.languageURL(h.languageURL(href, 'en'), 'zh'));
  assert.equal(back.hash, before.hash, 'Switching twice must not clear any filter');
}
''')

    def test_translation_preserves_numeric_codes_precision_formulas_and_excel_errors(self):
        self.run_js(r'''
const originals = JSON.stringify(entries);
const records = ['20.1262', '3309.289', '3309.2890000000002', '0', '-1', '-0', '0.1', '21.1',
  '0007', '1.00', '1e+21', '-2.30E-07', '6.02214076e23', '2/3', '50%',
  '#DIV/0!', '#N/A', '#VALUE!', '#REF!', '#NUM!', '#NAME?', '#NULL!',
  '=SUM(A1:A9)', '=IF(A1=0,"#DIV/0!",A2/A1)', '—', ' 20.1262 '];
for (const raw of records) assert.equal(translate(raw), raw, 'Display translation is not a numeric formatter: ' + raw);
for (const raw of [0, -1, 20.1262, 3309.289, 1e21, 2.3e-7]) {
  assert.equal(translate(raw), String(raw), 'Numeric inputs are stringified without an alternative scale');
}
const annotated = h.createTranslator({'原码':'Source code', '点后记录':'Record after the dot'});
assert.equal(annotated('原码 20.1262 · 点后记录 1262'), 'Source code 20.1262 · Record after the dot 1262');
assert.equal(annotated('原码 3309.289 · 点后记录 289'), 'Source code 3309.289 · Record after the dot 289');
assert.equal(JSON.stringify(entries), originals, 'Creating and using the translator must not mutate the catalogs');
''')

    def test_known_capability_markers_translate_as_meanings_without_inventing_counts(self):
        self.run_js(r'''
const meanings = new Map();
for (const entity of fixture.entities) {
  for (const cell of Object.values(entity.metrics)) {
    for (const record of [cell, ...(cell.composite?.parts || [])]) {
      if (record.meaning) meanings.set(record.meaning, record.meaningCode);
    }
  }
}
assert.ok(meanings.has('高级非核潜艇') && meanings.has('曾有航空母舰'),
  'Exercise the already-confirmed submarine and historical carrier encodings');
for (const [meaning, code] of meanings) {
  english(meaning, 'Known record meaning');
  assert.equal(translate(code), String(code), 'The label never changes the saved code');
}
const submarine = english('高级非核潜艇', 'Submarine capability marker');
assert.match(submarine, /non[- ]nuclear/i, 'Keep the confirmed non-nuclear capability meaning');
assert.doesNotMatch(submarine, /\b(?:one|1)\b/i, 'The suffix .1 is not a count of one vessel');
assert.match(english('曾有航空母舰', 'Historical carrier marker'), /previous|former|histor|once|used to/i,
  'The carrier marker describes past ownership, not a present vessel count');
''')

    def test_translator_returns_plain_text_without_generating_or_interpreting_markup(self):
        self.run_js(r'''
const plain = h.createTranslator({'原码':'Source code', '待核对':'Needs review', '组合记录':'Composite record'});
assert.equal(plain('原码 < 0 & 1 > -1'), 'Source code < 0 & 1 > -1',
  'A text translation must not convert comparison signs into markup or HTML entities');
const untrusted = '<img src=x onerror="bad()">原码 20.1262 & 待核对';
assert.equal(plain(untrusted), '<img src=x onerror="bad()">Source code 20.1262 & Needs review',
  'The pure helper returns a string; assigning it safely remains the text-node renderer\'s responsibility');
assert.equal(typeof plain('组合记录'), 'string');
assert.doesNotMatch(plain('组合记录'), /<\/?[a-z][^>]*>/i);
for (const [key, value] of Object.entries(entries)) {
  assert.doesNotMatch(value, /<\/?[a-z][^>]*>/i, 'A reviewed display translation must not inject HTML: ' + key);
}
''')

    def test_entity_and_field_search_support_both_languages_without_changing_queries(self):
        self.run_js(r'''
const before = JSON.stringify(fixture);
for (const entity of fixture.entities) {
  const searchable = h.searchText(entity.name, translate);
  assert.ok(searchable.includes(entity.name.toLocaleLowerCase()), entity.id + ': retain Chinese search');
  assert.ok(searchable.includes(english(entity.name, entity.id).toLocaleLowerCase()), entity.id + ': add English search');
}
for (const field of fixture.indicators) {
  const searchable = h.searchText(field.name, translate);
  assert.ok(searchable.includes(field.name.toLocaleLowerCase()), field.id + ': retain original field search');
  assert.ok(searchable.includes(english(field.name, field.id).toLocaleLowerCase()), field.id + ': add English field search');
}
const research = fixture.indicators.find(field => field.name === '科研投入');
const japan = fixture.entities.find(entity => entity.name === '日本');
assert.ok(research && japan, 'Use real labels to check partial matching');
assert.ok(h.searchText(research.name, translate).includes('research'));
assert.ok(h.searchText(research.name, translate).includes('科研'));
assert.ok(h.searchText(japan.name, translate).includes('japan'));
assert.ok(h.searchText(japan.name, translate).includes('日本'));
assert.equal(h.searchText('GDP + R&D / 20.1262', translate), 'gdp + r&d / 20.1262 gdp + r&d / 20.1262');
assert.equal(JSON.stringify(fixture), before, 'Building a search index must not change research records');
''')

    def test_dynamic_field_suffixes_citations_and_aria_names_read_as_english(self):
        self.run_js(r'''
for (const source of ['铝（E 列）', '铁 ↗', '选择军事排名的潜艇.核潜艇',
  '移除比较字段军事排名的航空母舰.舰载机', '日本的领域结构', '能源完整数据表',
  '背景报告《综合国力2.0》 PDF 第3、4页；解释口径，数值以当前 Excel 为准。']) {
  english(source, source);
}
assert.match(translate('铝（E 列）'), /column E/);
assert.match(translate('能源完整数据表'), /Energy — full data table/);
assert.match(translate('背景报告《综合国力2.0》 PDF 第3、4页；解释口径，数值以当前 Excel 为准。'), /PDF pp\. 3, 4/);
assert.equal(translate('1 个实体'), '1 entity');
assert.equal(translate('1 行 · 9 个显示列'), '1 row · 9 displayed columns');
assert.equal(translate('这是未收入词典的词'), '这是未收入词典的词', 'Single-character yes/no translations cannot alter an unknown sentence');
''')

    def test_all_guide_copy_translates_without_localizing_domain_or_field_ids(self):
        self.run_js(r'''
vm.runInContext(fs.readFileSync('web/reading-guide.js', 'utf8') + '\nglobalThis.guide = READING_GUIDE;', context);
const guide = context.guide;
const before = JSON.stringify(guide);
for (const group of guide.groups) {
  english(group.title, group.id + ': group title');
  english(group.intro, group.id + ': group reading');
  for (const id of group.domains) assert.equal(translate(id), id, 'Domain IDs are stable across languages');
}
for (const [id, domain] of Object.entries(guide.domains)) {
  for (const property of ['question', 'intro', 'connections']) english(domain[property], id + ': ' + property);
  for (const facet of domain.facets) {
    english(facet.title, id + ': theme title');
    english(facet.text, id + ': theme explanation');
    for (const fieldId of facet.fields) assert.equal(translate(fieldId), fieldId, 'Theme links use original field IDs');
  }
}
assert.equal(JSON.stringify(guide), before, 'Translation cannot change the reading structure or field mappings');
''')

    def test_all_current_field_names_units_entities_and_domains_have_english_labels(self):
        self.run_js(r'''
// Raw headers, source-cell values and provenance are deliberately outside this
// label contract: English presentation must not rewrite workbook evidence.
for (const field of fixture.indicators) {
  english(field.name, field.id + ': field name');
  if (field.unit !== null && field.unit !== undefined && field.unit !== '') {
    english(field.unit, field.id + ': known unit');
  }
  for (const part of field.compositeParts || []) english(part.label, field.id + ': composite part label');
}
for (const entity of fixture.entities) english(entity.name, entity.id + ': entity name');
for (const domain of fixture.domains) english(domain.name, domain.id + ': domain name');
''')


class LocalizationBuild(unittest.TestCase):
    def test_generated_catalog_is_only_the_reviewed_text_dictionary(self):
        expected = load_catalogs()
        script = (DIST / "translations.js").read_text(encoding="utf-8")
        assignment = re.fullmatch(r"window\.NP_EN=(\{.*\});\s*", script, re.DOTALL)
        self.assertIsNotNone(assignment, "The generated catalog must be one JSON assignment, not executable data transformations")
        actual = json.loads(assignment.group(1))
        missing, extra = sorted(set(expected) - set(actual)), sorted(set(actual) - set(expected))
        self.assertFalse(missing or extra,
                         f"Rebuild the display catalog: missing keys {missing[:5]}, extra keys {extra[:5]}")
        changed = [key for key in expected if actual[key] != expected[key]]
        self.assertFalse(changed, f"Generated translations differ from the reviewed catalogs: {changed[:5]}")
        numeric_record = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")
        for key, value in actual.items():
            with self.subTest(key=key):
                self.assertIsInstance(value, str, "Do not package entity records, numeric arrays or a second dataset as translations")
                self.assertIsNone(numeric_record.fullmatch(key.strip()), "Research numeric records are not translation keys")

    def test_hosted_and_offline_pages_load_localization_before_the_app_without_remote_dependencies(self):
        hosted = ScriptAssets()
        hosted.feed((DIST / "index.html").read_text(encoding="utf-8"))
        resources = [script["attrs"].get("src", "") for script in hosted.scripts]
        paths = [urlsplit(resource).path for resource in resources]
        for name in ["translations.js", "i18n.js", "app.js"]:
            self.assertEqual(paths.count("./" + name), 1, "Host each required local script exactly once")
        self.assertLess(paths.index("./translations.js"), paths.index("./i18n.js"))
        self.assertLess(paths.index("./i18n.js"), paths.index("./app.js"))
        for resource in resources + hosted.stylesheets:
            self.assertFalse(urlsplit(resource).scheme or resource.startswith("//"), "The hosted app needs no remote runtime")

        offline = ScriptAssets()
        offline.feed((DIST / "offline.html").read_text(encoding="utf-8"))
        self.assertFalse([script for script in offline.scripts if script["attrs"].get("src")],
                         "The offline page must embed all scripts")
        self.assertFalse(offline.stylesheets, "The offline page must embed its styles")
        positions = {}
        for name in ["translations.js", "i18n.js", "reading-guide.js", "app.js"]:
            content = (DIST / name).read_text(encoding="utf-8").replace("</script", "<\\/script")
            matches = [index for index, script in enumerate(offline.scripts) if script["text"] == content]
            self.assertEqual(len(matches), 1, f"Embed the current {name} once, without a separate offline implementation")
            positions[name] = matches[0]
        self.assertLess(positions["translations.js"], positions["i18n.js"])
        self.assertLess(positions["i18n.js"], positions["app.js"])
        self.assertLess(positions["reading-guide.js"], positions["app.js"])
        self.assertEqual((DIST / "i18n.js").read_bytes(), (ROOT / "web/i18n.js").read_bytes())


if __name__ == "__main__":
    unittest.main()
