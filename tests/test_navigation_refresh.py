"""Homepage and primary-navigation contracts, with a narrow form event harness.

Pure decisions are checked separately from the homepage's actual render/input/
submit handlers. The small DOM double does not claim to test browser history,
focus or responsive layout; those need the separate browser acceptance pass.
"""
from html.parser import HTMLParser
from pathlib import Path
import os
import re
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.environ.get("NP_SITE_DIST", ROOT / "dist"))
NODE = shutil.which("node") or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")


class PrimaryNavigation(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_primary = False
        self.links = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "nav" and attributes.get("id") == "navigation":
            self.in_primary = True
        elif tag == "a" and self.in_primary:
            self.current = [attributes.get("href"), ""]
            self.links.append(self.current)

    def handle_data(self, data):
        if self.current is not None:
            self.current[1] += data

    def handle_endtag(self, tag):
        if tag == "a":
            self.current = None
        elif tag == "nav":
            self.in_primary = False


class NavigationMarkup(unittest.TestCase):
    def test_source_and_hosted_page_expose_the_five_primary_destinations(self):
        expected = [
            ["#/", "首页"],
            ["#/rankings", "综合排名"],
            ["#/compare", "实体比较"],
            ["#/data", "完整数据"],
            ["#/framework", "研究说明"],
        ]
        for path in [ROOT / "web/index.html", DIST / "index.html"]:
            with self.subTest(path=path):
                parser = PrimaryNavigation()
                parser.feed(path.read_text(encoding="utf-8"))
                actual = [[href, " ".join(label.split())] for href, label in parser.links]
                self.assertEqual(actual, expected)

    def test_score_state_rules_are_active_and_css_comments_are_closed(self):
        css = (ROOT / "web/styles.css").read_text(encoding="utf-8")
        active = []
        index = 0
        quote = None
        # Read CSS comments as the browser does: a later */ can close a broken
        # earlier comment and silently swallow otherwise valid style rules.
        while index < len(css):
            if quote:
                active.append(css[index])
                if css[index] == "\\" and index + 1 < len(css):
                    index += 1
                    active.append(css[index])
                elif css[index] == quote:
                    quote = None
                index += 1
            elif css.startswith("/*", index):
                end = css.find("*/", index + 2)
                self.assertNotEqual(end, -1, f"Unclosed CSS comment at character {index}")
                active.append(" ")
                index = end + 2
            else:
                if css[index] in {"'", '"'}:
                    quote = css[index]
                active.append(css[index])
                index += 1
        active_css = "".join(active)
        for selector in [r"\.score-scale", r"\.score-scale\s+i\.selected"]:
            self.assertRegex(active_css, re.compile(selector + r"\s*\{[^}]+\}"),
                             "The fixed score scale and its selected state must not be commented out")


@unittest.skipUnless(NODE, "Node.js is required for navigation-decision checks")
class NavigationDecisions(unittest.TestCase):
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
assert.ok(boundary > 0, 'Navigation decisions must be callable without creating a document');
const prefix = source.slice(0, boundary).replace(/^const app = .*;\r?\n/m, '');
vm.runInContext(prefix + `
db = fixture;
byId = new Map(db.entities.map(entity => [entity.id, entity]));
byIndicator = new Map(db.indicators.map(indicator => [indicator.id, indicator]));
bySheet = new Map(db.sheets.map(sheet => [sheet.id, sheet]));
globalThis.navigationHelpers = {homeSearchURL, navigationKey, parseRouteLocation,
  entityLink, domainLinks, breadcrumb, readerNotesDirectory};
`, context);
const h = context.navigationHelpers;
'''
        result = subprocess.run(
            [NODE, "-e", setup + assertions], cwd=ROOT,
            capture_output=True, text=True, encoding="utf-8",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_home_search_reaches_supplementary_entities_and_preserves_the_query(self):
        self.run_js(r'''
const original = JSON.stringify(fixture.entities);
const supplementary = fixture.entities.find(entity => !entity.ranked && entity.englishName);
assert.ok(supplementary, 'Include a real supplementary entity in the search regression');
for (const value of ['', '   ', '\n\t']) {
  const route = h.parseRouteLocation(h.homeSearchURL(value));
  assert.equal(route.path, 'rankings');
  assert.equal(route.params.get('q'), null, 'An empty search must not restore a previous query');
  assert.ok(!route.params.has('scope') || route.params.get('scope') === 'ranked',
    'An empty search opens the formal ranking');
}
for (const value of [supplementary.name, supplementary.englishName, ' 日本 ', 'Japan',
  '日本 / Japan & ? + #', '<img src=x onerror="bad()">']) {
  const route = h.parseRouteLocation(h.homeSearchURL(value));
  assert.equal(route.path, 'rankings', 'User text is a search term, never a route');
  assert.equal(route.params.get('q'), value.trim(), 'Chinese, English and URL punctuation survive encoding');
  assert.equal(route.params.get('scope'), 'all', 'A named supplementary entity must not be hidden by the default scope');
  assert.equal(route.params.get('category'), null, 'Home search cannot inherit a previous category restriction');
}
assert.equal(JSON.stringify(fixture.entities), original, 'Searching must never alter research records');
''')

    def test_home_route_refills_query_and_real_form_handlers_keep_it_in_the_url(self):
        self.run_js(r'''
// Execute production route/render/input/submit code. Only the two form elements
// and History's replaceState boundary are doubles; no search logic is copied.
const decodeAttribute = text => text.replace(/&(amp|quot|lt|gt|#39);/g,
  (_, name) => ({amp:'&', quot:'"', lt:'<', gt:'>', '#39':"'"})[name]);
const element = () => ({value:'', listeners:new Map(),
  addEventListener(name, callback) { this.listeners.set(name, callback); }});
let input, form, markup = '';
const main = {
  set innerHTML(value) {
    markup = value;
    const inputTag = value.match(/<input\b[^>]*\bid="home-country-search"[^>]*>/);
    assert.ok(inputTag, 'The real homepage must render the search input');
    input = element();
    input.value = decodeAttribute(inputTag[0].match(/\bvalue="([^"]*)"/)?.[1] || '');
    form = element();
    assert.match(value, /<form\b[^>]*\bid="home-search-form"[^>]*>[\s\S]*?<button\b[^>]*\btype="submit"/,
      'The visible search button must submit the form');
  },
  get innerHTML() { return markup; },
};
const title = {textContent:'国家长期能力综合排名'};
context.document = {title:'', querySelector(selector) {
  return ({'#main':main, '#home-country-search':input, '#home-search-form':form, '#main h1':title})[selector] || null;
}};
context.location = {hash:'#/', href:'https://example.test/National-Power/#/'};
const setHash = hash => {context.location.hash = hash; context.location.href = 'https://example.test/National-Power/' + hash;};
context.history = {state:{npEntry:'existing-home-entry'}, replaceState(state, unused, href) {
  this.state = state; setHash(href.startsWith('#') ? href : new URL(href).hash);
}};
const navigations = [];
context.navigateTo = href => navigations.push(href);
const updater = source.slice(source.indexOf('function updateRouteState('), source.indexOf('function getCompareSelection('));
const router = source.slice(source.indexOf('function route()'), source.indexOf('function locationChanged('));
const renderer = source.slice(source.indexOf('function renderHome('), source.indexOf('function renderFramework('));
vm.runInContext(`
const app = document.querySelector('#main');
let activeEntryId = null, renderedURL = '';
const viewHistory = {read() { return undefined; }};
function saveViewState() {}
function restoreView() {}
function navActive() {}
function newEntryId() { return 'new-home-entry'; }
` + updater + router + renderer + '\nglobalThis.renderHomeRoute = route;', context);
const initial = '日本 & "Japan" <entity>';
setHash('#/?' + new URLSearchParams({q:initial}));
context.renderHomeRoute();
assert.equal(input.value, initial, 'Direct/shared/restored homepage URLs refill the input');
assert.ok(!markup.includes('<entity>'), 'Query text must remain an escaped input value');
const typed = '  Canada / 日本 & ? #  ';
input.value = typed;
assert.ok(input.listeners.has('input'), 'The input must wire its state handler');
input.listeners.get('input')({target:input});
const savedHomeHash = context.location.hash;
assert.equal(h.parseRouteLocation(savedHomeHash).path, '');
assert.equal(h.parseRouteLocation(savedHomeHash).params.get('q'), typed,
  'Typing updates the current homepage entry without trimming away the input');
let prevented = false;
assert.ok(form.listeners.has('submit'), 'Both Enter and the submit button need the form handler');
form.listeners.get('submit')({preventDefault() { prevented = true; }});
assert.equal(prevented, true, 'The form must not trigger an HTTP page navigation');
assert.equal(navigations.length, 1);
const submitted = h.parseRouteLocation(navigations[0]);
assert.equal(submitted.path, 'rankings');
assert.equal(submitted.params.get('q'), typed.trim());
assert.equal(submitted.params.get('scope'), 'all');
const oldInput = input;
setHash(savedHomeHash);
context.renderHomeRoute();
assert.notEqual(input, oldInput, 'Restoration must work after the input DOM is recreated');
assert.equal(input.value, typed, 'Returning to the saved homepage route retains the text');
input.value = '';
input.listeners.get('input')({target:input});
assert.equal(h.parseRouteLocation(context.location.hash).params.has('q'), false);
context.renderHomeRoute();
assert.equal(input.value, '', 'Clearing and refreshing cannot resurrect an old query');
form.listeners.get('submit')({preventDefault() {}});
const cleared = h.parseRouteLocation(navigations.at(-1));
assert.equal(cleared.path, 'rankings');
assert.equal(cleared.params.has('q'), false);
assert.equal(cleared.params.has('scope'), false, 'Empty submission returns to the default formal ranking');
''')

    def test_details_and_legacy_routes_highlight_their_current_parent_section(self):
        self.run_js(r'''
const expected = new Map([
  ['', ''], ['rankings', 'rankings'], ['compare', 'compare'],
  ['data', 'data'], ['framework', 'framework'], ['methodology', 'framework'],
  ['indicators', 'data'], ['downloads', 'data'], ['library', 'data'],
]);
for (const [route, section] of expected) assert.equal(h.navigationKey(route), section, route || 'homepage');
for (const entity of fixture.entities) {
  assert.equal(h.navigationKey('entity/' + encodeURIComponent(entity.id)), 'rankings', entity.id);
}
for (const domain of fixture.domains) {
  assert.equal(h.navigationKey('domain/' + domain.id), 'framework', domain.id);
}
for (const field of fixture.indicators) {
  assert.equal(h.navigationKey('indicator/' + encodeURIComponent(field.id)), 'data', field.id);
}
assert.ok(!['', 'rankings', 'compare', 'data', 'framework'].includes(h.navigationKey('missing-page')),
  'An unknown route must not falsely select a valid primary page');
''')

    def test_shared_page_fragments_keep_resolvable_links_and_complete_labels(self):
        self.run_js(r'''
const fragments = [
  ...fixture.entities.map(entity => h.entityLink(entity)),
  h.domainLinks(fixture.domains.map(domain => domain.id)),
  h.breadcrumb(['综合排名', '#/rankings'], ['当前实体']),
  h.readerNotesDirectory(),
];
const validPages = new Set(['', 'rankings', 'compare', 'data', 'framework', 'methodology', 'downloads', 'library', 'indicators']);
const entityIds = new Set(fixture.entities.map(entity => entity.id));
const domainIds = new Set(fixture.domains.map(domain => domain.id));
const fieldIds = new Set(fixture.indicators.map(field => field.id));
let auditedLinks = 0;
for (const html of fragments) {
  assert.doesNotMatch(html, /\bundefined\b|\bNaN\b|\[object Object\]/, 'Visible fragments need resolved values');
  for (const match of html.matchAll(/href="([^"]*)"/g)) {
    assert.ok(match[1].startsWith('#/'), 'Internal fragment links remain compatible with repository subpaths');
    const route = h.parseRouteLocation(match[1]).path;
    const [type, ...parts] = route.split('/');
    const id = decodeURIComponent(parts.join('/'));
    if (type === 'entity') assert.ok(entityIds.has(id), match[1]);
    else if (type === 'domain') assert.ok(domainIds.has(id), match[1]);
    else if (type === 'indicator') assert.ok(fieldIds.has(id), match[1]);
    else assert.ok(validPages.has(route), match[1]);
    auditedLinks++;
  }
}
assert.ok(auditedLinks >= fixture.entities.length + fixture.domains.length,
  'The audit must include all entity and domain entry points');
''')


if __name__ == "__main__":
    unittest.main()
