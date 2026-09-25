# Public data contract (v1)

`python scripts/build_data.py --output dist` reads `data/source/national-power.xlsx` and writes `dist/data/dataset.json`. The frontend consumes this semantic contract, never workbook coordinates directly.

```text
schemaVersion: 1
meta: { title, version, builtAt, workbookModifiedAt, sourceSha256, counts,
        referenceValueLabel, rankPolicy, metadataPolicy }
domains: [{ id, name, metricId, direction: "asc"|"desc", kind: "rank"|"score", weight }]
indicators: [{ id, name, originalHeader, sheetId, sheetName, column, group,
              role, type, direction, unit, year, source, metadataEvidence,
              chartable, rankingAllowed, note }]
entities: [{ id, name, englishName, category, rank, ranked, referenceValue,
             sourceRow, domains: { [domainId]: number|null },
             metrics: { [indicatorId]: Cell } }]
sheets: [{ id, name, role, state, dimensions, columns,
           rows: [{ row, entityId, kind, cells: { [column]: Cell } }],
           hiddenRows, hiddenColumns, merges, definedNames }]
quality: { status, summary, issues: [{ severity, code, message, locations }] }
downloads: [{ label, href, format, description }]
methodology: { notes, formula, weights, sources, limitations }
```

`Cell = { value, raw, formula, error, address, sheet, kind, numberFormat }`.
`value` is the workbook's cached value, not a recomputed replacement. `raw` preserves the XML numeric lexical value or decoded text. Blank values are `null`, Excel errors have `value: null` and retain `error: "#DIV/0!"`. `kind` is `number`, `text`, `composite`, `boolean`, `error`, or `blank`. Formula text starts with `=`. For compound military fields `value` and `raw` are strings, `chartable` and `rankingAllowed` are false. A metric missing for an entity is represented by a blank Cell rather than zero. `address` is an audit reference only.

All entity rows are keyed by the exact workbook name. Stable URL IDs use the summary's English name (a hashed fallback prevents collisions). The existing `综排` rank is authoritative; a blank rank remains unranked. Fractional ranks are preserved. The unnamed formula result is labeled **公式参考值（非百分制）** and is never used to regenerate the published rank.

## Reader-facing composite records and explanations

Military `G/J/M/O/P` are two-part records, not decimal measurements. Their original `Cell.value` and `raw` remain unchanged for audit compatibility. **Do not render those raw strings as quantities.** The reader-facing representation is `Cell.composite`:

```text
composite: {
  display, status, note, normalization,
  parts: [{ id: "primary"|"secondary", label, digits, value, status, note }]
}
```

`indicator.compositeParts` supplies the corresponding display column labels. `parts[].digits` is the authoritative display string; do not round it with a number formatter. `value` is an optional numeric convenience, not an independently verified quantity. The secondary part has status `encoded`; it records the digits after the separator, without claiming that lost terminal zeros or special markers have been recovered. An integer-only source has a missing secondary part (`null`, `not-recorded`), never an inferred zero. Malformed or unsafe records are marked `unparsed` rather than guessed.

Author-confirmed codes additionally carry `meaning`, `meaningCode` and `meaningSource` on the cell or composite part. A marked composite part also has `countable: false`: its `digits` and `value` still represent the original record, not an equipment count. The shared UI shows the meaning with the original code; the ordinary source CSVs remain unchanged, and the component CSV adds author-meaning columns. M's exact secondary `1` means advanced non-nuclear submarines; J's `0.x` with a nonzero secondary code means former aircraft-carrier operation. These rules run after normalization and never apply to G's nuclear/strategic-submarine codes. Ordinary codes describe score adjustments, alliances and the separate fifth-generation-aircraft marker without changing stored values or calculating new scores.

Numeric Excel cells may contain binary floating-point tails in XML. The readable representation uses 15 significant decimal digits only when it round-trips to the same stored floating-point value. Text records retain their exact digits, including leading or terminal zeros. This is presentation normalization only: the source workbook, cached values, original formulas and `raw` strings do not change. It cannot recover terminal zeros that Excel already discarded. Microsoft documents Excel's numerical precision and floating-point limitations in [calculation precision](https://support.microsoft.com/en-us/excel/change-formula-recalculation-iteration-or-precision-in-excel) and [floating-point arithmetic](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/floating-point-arithmetic-inaccurate-result).

Splitting five compound fields into ten display columns does not add research indicators or change `meta.counts`. All views consume the same parsed parts. `downloads/military-components.csv` offers the readable split records, while the original worksheet CSV and JSON audit fields retain the source representation.

`config/reader-notes.json` provides page-referenced paraphrases of the background PDF: `document`, `overview`, `domains` and `fields`. It is copied to `dataset.readerNotes`; matching indicators, domains and sheets receive an `explanation`. Explanations are visible beside the affected data. They never overwrite Excel values or automatically fill unknown `unit`, `year`, `source` or `estimate` metadata.

`meta.researchVersion` is the research edition label; `meta.dataVersion` identifies the current workbook by saved date and data fingerprint. Ordinary value updates change the fingerprint automatically, without requiring a configuration version edit.

The 8 summary domain values are independent from each detail sheet's own score/rank. Political, economic and military domain values are ranks (`asc`); transport, agriculture, energy, minerals and stability are scores (`desc`). No comparable 0–100 scale is implied. Indicator ordering may show numeric order but is not an authoritative research ranking unless the field itself is a rank.

Every populated or explicitly stored cell in every worksheet is retained in `sheets`. Sheet CSVs also retain anonymous auxiliary rows and columns. Blank headers receive visibly provisional labels; duplicate labels retain separate IDs. `counts.indicators` means **named detail fields excluding identity, summary rank/score and unnamed auxiliaries**, and is not a claim about independent research indicators. Counts for all fields and auxiliary fields are provided separately.

Unknown source, unit, year or estimate status is `null`; spreadsheet timestamps are not observation years. `metadataEvidence` distinguishes literal header information from reviewed unit analysis. Field overrides may supply `unit` with mandatory `unitEvidence` (`basis`, `detail`, `sourceUrls`). Analysis uses workbook formulas, scale and external unit definitions; it does not establish a record's original source or observation year. Ratios stored as fractions remain ratios rather than being relabeled as percentages. The schema contains no old numeric values from reports.

Publishing removes document creator/last-editor and printer metadata only. Workbook cells, formulas, cached values, styles, sheet order and data content must remain equivalent. Original private metadata is never exported into the public dataset.

Checks fail on unknown sheet/header structure, duplicate entities, missing formula caches, unexpected Excel errors, stale reproducible formula caches, or hidden content. The baseline's ten known energy `#DIV/0!` cells remain warnings. Checks report source anomalies without repairing research values. Changes to workbook structure require review of `config/workbook.json` before publication.

## Concrete field details

- `sheets.columns` contains `{id, indicatorId, name, originalHeader, column}` objects. `rows` includes the header row (`kind: "header"`), entity rows, anonymous auxiliary rows, and explicitly stored blank rows.
- `entities.domainChartable` marks domain values safe for the normal display scale. Out-of-range supplementary markers such as `100` and `10` remain in `domains` but are excluded from charts.
- `meta.counts` has `entities`, `rankedEntities`, `supplementaryEntities`, `domains`, `indicators`, `fields`, `auxiliaryFields`, `allFields`, `sheets`, `formulas`, `errors`. For the initial workbook these are 65, 51, 14, 8, 209, 221, 12, 252, 9, 1891, 10 respectively. The homepage should call the 221 items **data fields**, since several fields are derived values, sub-ranks or annual series.
- Stored cells also include `formulaRaw` (the actual OOXML formula text, possibly blank for shared followers) and `formulaAttributes`. `formula` is the equivalent expanded formula for the cell. No cached result is replaced by the validation evaluator.
- `methodology.weights` contains `{domainId,name,weight}`. Every reference formula's actual coefficients are compared against these weights at build time. Changed reference formulas or mismatching published weights block the build. `methodology.formulaVariants` records the original special EU denominator.
- `source`, `unit`, `year` and `estimate` are nullable. Literal metadata from a header is identified in `metadataEvidence`. `note` may contain carefully marked background explanations and does not assert source-level provenance.

## Rebuilding and updating

```bash
python scripts/build_data.py --output dist
python -m unittest discover -s tests -v
```

Replace the workbook using the same sheet names and column structure. Save it in Excel or a compatible spreadsheet editor after recalculation; writers that discard formula caches intentionally fail validation. Updating values and extending entity rows does not require editing pages. New sheet structures, hidden content, comments/embedded objects, unsupported formulas, changed reference formulas or additional Excel errors require reviewing the data mapping before publishing.

Before putting a new workbook into a public repository, strip document author/editor and printer metadata using:

```bash
python scripts/build_data.py --source /path/to/updated.xlsx --sanitize-to data/source/national-power.xlsx
```

The sanitization script checks parsed workbook content before and after metadata cleanup. It never rewrites data using a spreadsheet library, so original stored cells, formulas, cached values and styles remain untouched. The published download is sanitized again automatically during every build. `config/source-provenance.json` records only the initial attachment import; the current source and download hashes are calculated on every build in `dataset.meta`.

`config/public-context.json` contains short editorial explanations from the background report and project history, never older numerical data. Source organizations are shown as the report's general reference list, without assigning unsupported sources to individual fields.

## Outputs and CSV safety

- `dist/data/dataset.json`: the complete canonical public data layer.
- `dist/data/quality.json` and `dist/validation.json`: full machine-readable checks, including formula-cache verification.
- `dist/validation.md`: a human-readable build report.
- `dist/downloads/national-power.xlsx`: public workbook with identity/printer metadata removed.
- `dist/downloads/<sheet-id>.csv`: every worksheet in its original order, including anonymous auxiliary rows.
- `dist/downloads/all-fields.csv`: all entities joined across all 252 worksheet fields.

CSV files use UTF-8 with BOM. Formula-like **text** is prefixed with a single quote to prevent spreadsheet consumers from executing it. Numerical negative values remain numbers. The JSON layer and Excel cell contents are not altered by CSV escaping. CSV consumers may coerce composite military codes into decimals when opening directly, so their exact original lexical form remains available in JSON (`raw`) and the public workbook.
