"""Independent reader semantics and single-workbook update acceptance checks.

Workbook changes below are confined to disposable test copies. The repository
source and its saved caches are never rewritten by these tests.
"""
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED
import csv
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

from test_site import NS, REL, col_number, read_source

ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.environ.get("NP_SITE_DIST", ROOT / "dist"))
SOURCE = ROOT / "data/source/national-power.xlsx"
NODE = shutil.which("node") or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")


class InlineScripts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.scripts = []
        self.external = []
        self.stylesheets = []
        self.current = None

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == "script":
            if attributes.get("src"):
                self.external.append(attributes["src"])
            else:
                self.current = {"type": attributes.get("type"), "text": ""}
        if tag == "link" and attributes.get("rel") == "stylesheet":
            self.stylesheets.append(attributes.get("href"))

    def handle_data(self, data):
        if self.current is not None:
            self.current["text"] += data

    def handle_endtag(self, tag):
        if tag == "script" and self.current is not None:
            self.scripts.append(self.current)
            self.current = None


def canonical_number(raw):
    # Separate oracle: binary float formatting rather than the production
    # Decimal-context implementation. Expand exponent notation for splitting.
    result = format(Decimal(format(float(raw), ".15g")), "f")
    return result.rstrip("0").rstrip(".") if "." in result else result


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ReaderSemantics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((DIST / "data/dataset.json").read_text(encoding="utf-8"))
        cls.source = read_source(SOURCE)
        cls.entities = {e["name"]: e for e in cls.data["entities"]}
        cls.fields = {f["id"]: f for f in cls.data["indicators"]}
        cls.composites = [f for f in cls.data["indicators"] if f["type"] == "composite"]
        cls.military = cls.source["军事排名"]
        cls.row_names = {
            int(address[1:]): cell["value"]
            for address, cell in cls.military.items()
            if re.fullmatch(r"B\d+", address) and cell["value"] in cls.entities
        }

    def test_every_source_composite_has_independently_verified_parts(self):
        checked = 0
        for row, name in self.row_names.items():
            for field in self.composites:
                address = field["column"] + str(row)
                source = self.military.get(address)
                if not source or source["raw"] is None:
                    continue
                cell = self.entities[name]["metrics"][field["id"]]
                composite = cell["composite"]
                with self.subTest(entity=name, address=address):
                    self.assertEqual(cell["raw"], source["raw"])
                    self.assertEqual(cell["value"], source["raw"], "Display cleanup must not replace stored source strings")
                    checked += 1
                    expected = source["raw"] if source["xmlType"] in ("s", "str", "inlineStr") else canonical_number(source["raw"])
                    if source["xmlType"] not in ("s", "str", "inlineStr"):
                        if float(expected) != float(source["raw"]):
                            self.assertEqual(composite["status"], "unparsed")
                            continue
                        self.assertEqual(float(composite["display"]), float(source["raw"]))
                    self.assertEqual(composite["display"], expected)
                    match = re.fullmatch(r"(\d+)(?:\.(\d+))?", expected.strip())
                    if not match:
                        self.assertEqual(composite["status"], "unparsed")
                        continue
                    primary, secondary = match.groups()
                    parts = {p["id"]: p for p in composite["parts"]}
                    self.assertEqual(set(parts), {"primary", "secondary"})
                    for part_id, digits in (("primary", primary), ("secondary", secondary)):
                        part = parts[part_id]
                        definition = next(p for p in field["compositeParts"] if p["id"] == part_id)
                        self.assertEqual(part["label"], definition["label"])
                        self.assertEqual(part["digits"], digits)
                        self.assertEqual(part["value"], int(digits) if digits is not None else None)
                        self.assertEqual(part["status"], "not-recorded" if digits is None else "recorded" if part_id == "primary" else "encoded")
                        self.assertIsNone(part["unit"], "The component explanation must not invent a unit")
                    self.assertEqual(composite["normalization"]["changed"], expected != source["raw"])
        # Counts are source-derived so normal future Excel updates remain valid.
        source_count = sum(
            self.military.get(f["column"] + str(row), {}).get("raw") is not None
            for row in self.row_names for f in self.composites
        )
        self.assertEqual(checked, source_count)
        self.assertGreater(checked, 0)

    def test_integer_missing_and_zero_components_remain_distinct(self):
        for entity in self.data["entities"]:
            for field in self.composites:
                cell = entity["metrics"][field["id"]]
                parts = {p["id"]: p for p in cell["composite"]["parts"]}
                with self.subTest(entity=entity["name"], field=field["id"]):
                    if cell["value"] is None:
                        self.assertIsNone(cell["composite"]["display"])
                        for part in parts.values():
                            self.assertIsNone(part["value"])
                            self.assertIsNone(part["digits"])
                            self.assertEqual(part["status"], "not-recorded")
                    elif "." not in cell["composite"]["display"]:
                        self.assertIsNone(parts["secondary"]["value"])
                        self.assertIsNone(parts["secondary"]["digits"])
                        if cell["composite"]["display"] == "0":
                            self.assertEqual(parts["primary"]["value"], 0)
                            self.assertEqual(parts["primary"]["digits"], "0")

    def test_component_csv_matches_json_without_filling_unknowns(self):
        with (DIST / "downloads/military-components.csv").open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), len(self.entities) * len(self.composites))
        for row in rows:
            cell = self.entities[row["实体"]]["metrics"][row["字段ID"]]
            composite = cell["composite"]
            self.assertEqual(row["原XML码"], cell["raw"] or "")
            self.assertEqual(row["可读组合码"], composite["display"] or "")
            for prefix, part in zip(("第一项", "第二项"), composite["parts"]):
                self.assertEqual(row[prefix + "记录码"], part["digits"] if part["digits"] is not None else "")
                self.assertEqual(row[prefix + "数值"], str(part["value"]) if part["value"] is not None else "")
                self.assertEqual(row[prefix + "状态"], part["status"])

    def test_reader_explanations_cite_pages_without_inventing_field_metadata(self):
        notes = self.data["readerNotes"]
        self.assertIsInstance(notes, dict)
        self.assertTrue(notes.get("document", {}).get("title"))
        for domain in self.data["domains"]:
            explanation = domain["explanation"]
            self.assertTrue(explanation and explanation.get("text"), domain["id"])
            self.assertTrue(explanation.get("pages"), domain["id"])
        for field in self.data["indicators"]:
            explanation = field.get("explanation")
            if explanation:
                self.assertTrue(explanation.get("text"), field["id"])
                self.assertTrue(explanation.get("pages"), field["id"])
                self.assertTrue(all(isinstance(p, int) and p > 0 for p in explanation["pages"]))
            for key in ("unit", "year", "source"):
                if not field["metadataEvidence"].get(key):
                    self.assertIsNone(field[key], f'{field["id"]}: report explanations cannot fill unknown {key}')
            if field["metadataEvidence"].get("unit") == "原始表头":
                self.assertIn(field["unit"], str(field["originalHeader"]))
            if field["metadataEvidence"].get("year") == "原始表头":
                self.assertIn(str(field["year"]), str(field["originalHeader"]))
        self.assertTrue(self.fields["military-P"].get("explanation"))

    def test_changing_only_the_workbook_updates_every_data_surface(self):
        before_hash = sha256(SOURCE)
        china_row = next(row for row, name in self.row_names.items() if name == "中国")
        korea_row = next(row for row, name in self.row_names.items() if name == "朝鲜")
        replacement = "3310.291"
        addresses = {f"P{china_row}": replacement, f"H{korea_row}": "1"}
        for address in addresses:
            self.assertIsNone(self.military[address]["formula"], "Integration mutations must not invalidate formula caches")
        with tempfile.TemporaryDirectory(prefix="national-power-reader-update-") as temporary:
            temporary = Path(temporary)
            changed, output = temporary / "changed.xlsx", temporary / "built"
            with ZipFile(SOURCE) as original:
                rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(original.read("xl/_rels/workbook.xml.rels"))}
                workbook = ET.fromstring(original.read("xl/workbook.xml"))
                military_sheet = next(s for s in workbook.findall("s:sheets/s:sheet", NS) if s.get("name") == "军事排名")
                part = rels[military_sheet.get(f"{{{REL}}}id")]
                part = part.lstrip("/") if part.startswith("/") else "xl/" + part
                with ZipFile(changed, "w", ZIP_DEFLATED) as archive:
                    for item in original.infolist():
                        content = original.read(item.filename)
                        if item.filename == part:
                            text = content.decode()
                            for address, raw in addresses.items():
                                pattern = r'<c\b[^>]*\br="' + address + r'"[^>]*>.*?</c>'
                                text, count = re.subn(pattern, lambda m, value=raw: re.sub(r"<v>.*?</v>", "<v>" + value + "</v>", m[0]), text, flags=re.S)
                                self.assertEqual(count, 1)
                            content = text.encode()
                        archive.writestr(item, content)
            result = subprocess.run([sys.executable, str(ROOT / "scripts/build_data.py"), "--source", str(changed), "--output", str(output)], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            updated = json.loads((output / "data/dataset.json").read_text(encoding="utf-8"))
            entity = next(e for e in updated["entities"] if e["name"] == "中国")
            cell = entity["metrics"]["military-P"]
            self.assertEqual(cell["value"], replacement)
            self.assertEqual(cell["composite"]["display"], replacement)
            self.assertEqual([p["digits"] for p in cell["composite"]["parts"]], ["3310", "291"])
            sheet = next(s for s in updated["sheets"] if s["id"] == "military")
            row = next(r for r in sheet["rows"] if r["entityId"] == entity["id"])
            self.assertEqual(row["cells"]["P"], cell)
            with (output / "downloads/military.csv").open(encoding="utf-8-sig", newline="") as handle:
                csv_rows = list(csv.reader(handle))
            self.assertEqual(csv_rows[china_row - 1][col_number("P") - 1], replacement)
            with (output / "downloads/all-fields.csv").open(encoding="utf-8-sig", newline="") as handle:
                csv_rows = list(csv.DictReader(handle))
            csv_row = next(r for r in csv_rows if r["实体"] == "中国")
            self.assertEqual(csv_row["军事排名 / 军机.运输机 [P]"], replacement)
            with (output / "downloads/military-components.csv").open(encoding="utf-8-sig", newline="") as handle:
                csv_rows = list(csv.DictReader(handle))
            component_row = next(r for r in csv_rows if r["实体"] == "中国" and r["字段ID"] == "military-P")
            self.assertEqual(component_row["原XML码"], replacement)
            self.assertEqual(component_row["第一项记录码"], "3310")
            self.assertEqual(component_row["第二项记录码"], "291")
            self.assertEqual(read_source(output / "downloads/national-power.xlsx")["军事排名"][f"P{china_row}"]["raw"], replacement)
            self.assertEqual(updated["meta"]["sourceSha256"], sha256(changed))
            self.assertNotEqual(updated["meta"]["dataVersion"], self.data["meta"]["dataVersion"])
            # H was changed from a recorded 0 to 1. Explanatory content may discuss
            # zero placeholders in general, but must not claim this current value is zero.
            korea = next(e for e in updated["entities"] if e["name"] == "朝鲜")
            self.assertEqual(korea["metrics"]["military-H"]["value"], 1)
            metadata_text = json.dumps({"readerNotes": updated["readerNotes"], "fields": updated["indicators"], "methodology": updated["methodology"]}, ensure_ascii=False)
            self.assertNotRegex(metadata_text, r"朝鲜在最新表中的军费值为\s*0")
            self.assertNotRegex(metadata_text, r"朝鲜.{0,20}(?:当前|最新).{0,15}军费.{0,10}(?:为|是)\s*0")
            # Unrelated research results remain authoritative source values.
            self.assertEqual(entity["rank"], self.entities["中国"]["rank"])
            self.assertEqual(entity["domains"], self.entities["中国"]["domains"])
        self.assertEqual(sha256(SOURCE), before_hash, "A test must never change the production workbook")

    def test_single_file_preview_embeds_exact_download_bytes(self):
        html = (DIST / "offline.html").read_text(encoding="utf-8")
        parser = InlineScripts()
        parser.feed(html)
        self.assertFalse(parser.external, "The standalone preview must not need another JS file")
        self.assertFalse(parser.stylesheets, "The standalone preview must not need another CSS file")
        self.assertIn('href="data:image/svg+xml;base64,', html)
        prefix = "window.NATIONAL_POWER_DATA="
        map_prefix = "window.NATIONAL_POWER_DOWNLOADS="
        self.assertEqual(html.count(prefix), 1, "Embed the main dataset once only")
        self.assertEqual(html.count(map_prefix), 1)
        data, _ = json.JSONDecoder().raw_decode(html.split(prefix, 1)[1])
        downloads, _ = json.JSONDecoder().raw_decode(html.split(map_prefix, 1)[1])
        self.assertEqual(data, self.data)
        expected = {d["href"] for d in self.data["downloads"] if d["href"] != "data/dataset.json"}
        self.assertEqual(set(downloads), expected)
        self.assertNotIn("data/dataset.json", downloads, "JSON download reuses the main embedded dataset")
        for href, embedded in downloads.items():
            with self.subTest(download=href):
                decoded = base64.b64decode(embedded["base64"], validate=True)
                self.assertEqual(decoded, (DIST / href).read_bytes())
                self.assertEqual(embedded["name"], Path(href).name)
                self.assertTrue(embedded["type"])

    @unittest.skipUnless(NODE, "Node.js is required for inline JavaScript syntax checks")
    def test_single_file_inline_scripts_have_valid_syntax(self):
        parser = InlineScripts()
        parser.feed((DIST / "offline.html").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(parser.scripts), 2)
        for index, script in enumerate(parser.scripts):
            with self.subTest(script=index):
                command = [NODE, "--check"]
                if script["type"] == "module":
                    command.append("--input-type=module")
                result = subprocess.run(command, input=script["text"], capture_output=True, text=True, encoding="utf-8")
                self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
