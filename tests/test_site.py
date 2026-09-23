"""Independent acceptance checks: parse OOXML without the production parser.

These checks compare the current source to generated public data, so an ordinary
Excel update does not require editing an expected-results snapshot.
"""
from html.parser import HTMLParser
from pathlib import Path
import csv
import json
import math
import os
import posixpath
import re
import unittest
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.environ.get("NP_SITE_DIST", ROOT / "dist"))
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def col_number(column):
    result = 0
    for letter in column:
        result = result * 26 + ord(letter) - ord("A") + 1
    return result


def col_name(index):
    result = ""
    while index:
        index, rest = divmod(index - 1, 26)
        result = chr(65 + rest) + result
    return result


def shift_formula(formula, origin, target):
    oc, orow = re.fullmatch(r"([A-Z]+)(\d+)", origin).groups()
    tc, trow = re.fullmatch(r"([A-Z]+)(\d+)", target).groups()
    dc, dr = col_number(tc) - col_number(oc), int(trow) - int(orow)

    def replace(match):
        ac, column, ar, row = match.groups()
        return (ac + (column if ac else col_name(col_number(column) + dc))
                + ar + (row if ar else str(int(row) + dr)))

    # Ignore references inside Excel string literals.
    parts = re.split(r'("(?:[^"]|"")*")', formula)
    for index in range(0, len(parts), 2):
        parts[index] = re.sub(r"(?<![A-Za-z0-9_])(\$?)([A-Z]{1,3})(\$?)([1-9]\d*)(?![A-Za-z0-9_(])", replace, parts[index])
    return "".join(parts)


def read_source(path):
    """Small, separate OOXML reader used only as an acceptance oracle."""
    result = {}
    with ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = [
                "".join(t.text or "" for t in item.findall(".//s:t", NS))
                for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))
            ]
        rels = {
            r.attrib["Id"]: r.attrib["Target"]
            for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        for sheet in workbook.findall("s:sheets/s:sheet", NS):
            target = rels[sheet.attrib[f"{{{REL}}}id"]]
            target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            cells = {}
            shared = {}
            for cell in ET.fromstring(archive.read(target)).findall("s:sheetData/s:row/s:c", NS):
                value = cell.find("s:v", NS)
                raw = value.text if value is not None else None
                kind = cell.get("t")
                if kind == "s" and raw is not None:
                    raw = strings[int(raw)]
                elif kind == "inlineStr":
                    raw = "".join(t.text or "" for t in cell.findall(".//s:t", NS))
                formula = cell.find("s:f", NS)
                cells[cell.attrib["r"]] = {
                    "raw": raw,
                    "value": None if kind == "e" else raw,
                    "error": raw if kind == "e" else None,
                    "formula": "=" + (formula.text or "") if formula is not None else None,
                    "formulaRaw": formula.text if formula is not None else None,
                    "formulaAttributes": dict(formula.attrib) if formula is not None else None,
                    "xmlType": kind,
                }
                if formula is not None and formula.get("t") == "shared" and formula.text:
                    shared[formula.attrib["si"]] = (cell.attrib["r"], "=" + formula.text)
            for address, cell in cells.items():
                attributes = cell["formulaAttributes"] or {}
                if attributes.get("t") == "shared" and cell["formulaRaw"] is None:
                    origin, formula = shared[attributes["si"]]
                    cell["formula"] = shift_formula(formula, origin, address)
            result[sheet.attrib["name"]] = cells
    return result


def number(cell):
    raw = cell["value"] if cell else None
    return float(raw) if raw is not None else None


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        self.links.extend(v for k, v in attrs if k in {"href", "src"} and v)


class PublicSiteAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((DIST / "data/dataset.json").read_text(encoding="utf-8"))
        cls.source = read_source(ROOT / "data/source/national-power.xlsx")
        cls.config = json.loads((ROOT / "config/workbook.json").read_text(encoding="utf-8"))
        cls.entities = {e["name"]: e for e in cls.data["entities"]}
        cls.indicators = {m["id"]: m for m in cls.data["indicators"]}
        cls.sheets = {s["name"]: s for s in cls.data["sheets"]}

    def test_every_entity_rank_reference_and_domain_matches_excel(self):
        summary_config = next(s for s in self.config["sheets"] if s["id"] == self.config["summarySheet"])
        summary = self.source[summary_config["name"]]
        name_column = summary_config["entityColumn"]
        rows = {
            int(address[len(name_column):]): cell["value"]
            for address, cell in summary.items()
            if re.fullmatch(name_column + r"[2-9]\d*|" + name_column + r"1\d+", address)
            and cell["value"] is not None
        }
        self.assertEqual(set(rows.values()), set(self.entities), "No entity may disappear or be invented")
        ids = [e["id"] for e in self.data["entities"]]
        self.assertEqual(len(ids), len(set(ids)), "Entity URLs must be unique")
        ranked = 0
        for row, name in rows.items():
            with self.subTest(entity=name):
                entity = self.entities[name]
                expected_rank = number(summary.get(f'{self.config["rankColumn"]}{row}'))
                self.assertEqual(entity["rank"], expected_rank)
                self.assertEqual(entity["ranked"], expected_rank is not None)
                ranked += expected_rank is not None
                self.assertEqual(entity["referenceValue"], number(summary.get(f'{self.config["referenceColumn"]}{row}')))
                for domain in self.config["domains"]:
                    self.assertEqual(entity["domains"][domain["id"]], number(summary.get(f'{domain["summaryColumn"]}{row}')))
        self.assertEqual(sum(e["ranked"] for e in self.entities.values()), ranked)

    def test_all_stored_cells_and_formula_caches_preserved(self):
        self.assertEqual(set(self.source), set(self.sheets))
        compared = 0
        for name, source_cells in self.source.items():
            exported = {
                cell["address"]: cell
                for row in self.sheets[name]["rows"]
                for cell in row["cells"].values()
                if cell.get("address")
            }
            for address, expected in source_cells.items():
                with self.subTest(sheet=name, address=address):
                    self.assertIn(address, exported, "Stored cells, including unnamed auxiliary cells, must remain accessible")
                    actual = exported[address]
                    self.assertEqual(actual["raw"], expected["raw"])
                    self.assertEqual(actual.get("formula"), expected["formula"])
                    self.assertEqual(actual.get("formulaRaw"), expected["formulaRaw"])
                    self.assertEqual(actual.get("formulaAttributes"), expected["formulaAttributes"])
                    self.assertEqual(actual.get("error"), expected["error"])
                    if expected["error"]:
                        self.assertIsNone(actual["value"])
                    elif actual["kind"] == "number":
                        self.assertEqual(actual["value"], number(expected))
                    elif actual["kind"] != "boolean":
                        self.assertEqual(actual["value"], expected["value"])
                    compared += 1
        self.assertGreater(compared, 0)

    def test_entity_metric_values_match_its_actual_sheet_row(self):
        for sheet_config in self.config["sheets"]:
            sheet = self.source[sheet_config["name"]]
            entity_column = sheet_config["entityColumn"]
            row_names = {
                int(re.search(r"\d+$", address).group()): cell["value"]
                for address, cell in sheet.items()
                if re.fullmatch(entity_column + r"\d+", address)
                and cell["value"] in self.entities
            }
            metrics = [m for m in self.data["indicators"] if m["sheetId"] == sheet_config["id"]]
            for row, name in row_names.items():
                for metric in metrics:
                    address = metric["column"] + str(row)
                    expected = sheet.get(address)
                    actual = self.entities[name]["metrics"][metric["id"]]
                    with self.subTest(entity=name, metric=metric["id"]):
                        self.assertEqual(actual["raw"], expected["raw"] if expected else None)
                        self.assertEqual(actual.get("error"), expected["error"] if expected else None)

    def test_composite_values_cannot_become_numerical_rankings(self):
        composites = [m for m in self.data["indicators"] if m["type"] == "composite"]
        configured = sum(o.get("type") == "composite" for s in self.config["sheets"] for o in s.get("fieldOverrides", {}).values())
        self.assertEqual(len(composites), configured)
        for metric in composites:
            self.assertFalse(metric["chartable"])
            self.assertFalse(metric["rankingAllowed"])
            for entity in self.entities.values():
                cell = entity["metrics"][metric["id"]]
                if cell["value"] is not None:
                    self.assertIsInstance(cell["value"], str)

    def test_errors_and_missing_values_are_distinct_from_zero(self):
        source_errors = {(sheet, address, c["error"]) for sheet, cells in self.source.items() for address, c in cells.items() if c["error"]}
        actual_errors = set()
        for sheet in self.data["sheets"]:
            for row in sheet["rows"]:
                for cell in row["cells"].values():
                    if cell.get("error"):
                        actual_errors.add((sheet["name"], cell["address"], cell["error"]))
                        self.assertIsNone(cell["value"])
                        self.assertEqual(cell["kind"], "error")
                    elif cell["kind"] == "blank":
                        self.assertIsNone(cell["value"])
        self.assertEqual(source_errors, actual_errors)
        # Missing detail rows for supplemental entities must not acquire zeroes.
        for entity in self.entities.values():
            if not entity["ranked"]:
                self.assertIsNone(entity["rank"])

    def test_csv_preserves_sheet_rows_including_unnamed_auxiliaries(self):
        for sheet in self.data["sheets"]:
            with (DIST / "downloads" / (sheet["id"] + ".csv")).open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.reader(handle))
            self.assertEqual(len(rows), len(sheet["rows"]))
            for exported, row in zip(rows, sheet["rows"]):
                for column, cell in row["cells"].items():
                    actual = exported[col_number(column) - 1]
                    value = cell["error"] or cell["value"]
                    expected = "" if value is None else str(value)
                    # A leading apostrophe is an intentional CSV-only formula guard.
                    if cell["kind"] == "text" and expected.lstrip().startswith(("=", "+", "-", "@")):
                        expected = "'" + expected
                    with self.subTest(sheet=sheet["name"], address=cell["address"]):
                        self.assertEqual(actual, expected)

    def test_download_workbook_preserves_all_source_cells(self):
        download = next(d for d in self.data["downloads"] if d["format"] == "xlsx")
        self.assertEqual(read_source(DIST / download["href"]), self.source)

    def test_field_metadata_requires_evidence(self):
        for field in self.data["indicators"]:
            for key in ("source", "unit", "year"):
                with self.subTest(field=field["id"], metadata=key):
                    if field[key] is not None:
                        self.assertTrue(field["metadataEvidence"].get(key), "Do not invent missing field metadata")

    def test_downloads_and_local_assets_resolve_on_pages_subpath(self):
        parser = Links()
        parser.feed((DIST / "index.html").read_text(encoding="utf-8"))
        links = parser.links + [d["href"] for d in self.data["downloads"]]
        checked = 0
        for href in links:
            parsed = urlsplit(href)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            with self.subTest(href=href):
                self.assertFalse(parsed.path.startswith("/"), "Root-relative assets break repository Pages URLs")
                target = (DIST / unquote(parsed.path)).resolve()
                self.assertTrue(target.is_relative_to(DIST.resolve()))
                self.assertTrue(target.is_file(), "Local link points to a missing output file")
                checked += 1
        self.assertGreater(checked, 3)

    def test_public_json_contains_only_finite_numbers(self):
        def visit(value):
            if isinstance(value, float):
                self.assertTrue(math.isfinite(value))
            elif isinstance(value, dict):
                for item in value.values():
                    visit(item)
            elif isinstance(value, list):
                for item in value:
                    visit(item)
        visit(self.data)


if __name__ == "__main__":
    unittest.main()
