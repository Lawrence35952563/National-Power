#!/usr/bin/env python3
"""Build a faithful static data layer from OOXML using only Python's standard library.

Cached values are the published data. Formula evaluation is a validation gate only.
"""
from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import io
import json
import math
import operator
import posixpath
import re
import shutil
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, localcontext
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PACKAGE = 'http://schemas.openxmlformats.org/package/2006/relationships'
NS = {'m': MAIN, 'r': REL}
CELL_RE = re.compile(r'^([A-Z]+)([0-9]+)$')
BUILTIN_FORMATS = {0:'General',1:'0',2:'0.00',3:'#,##0',4:'#,##0.00',9:'0%',10:'0.00%',11:'0.00E+00',14:'mm-dd-yy'}


def col_index(col):
    result = 0
    for c in col:
        result = result * 26 + ord(c) - 64
    return result


def col_name(index):
    result = ''
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def numeric(text):
    if text is None or text == '':
        return None
    number = float(text)
    return int(number) if number.is_integer() else number


def parse_composite(cell, definitions):
    """Add a readable view of a compound code, never changing its source value.

    Numeric OOXML values may carry binary-conversion tails beyond Excel's 15
    significant digits. Decimal normalization is a display operation only;
    it cannot restore a secondary component's trailing zeros already lost in
    numeric storage. Text codes keep all recorded digits exactly.
    """
    parts = [{**d, 'digits':None, 'value':None, 'status':'not-recorded',
              'note':'原单元格未记录可读取的该项编码。'} for d in definitions]
    raw = cell.get('raw')
    result = {'display':raw, 'parts':parts, 'status':'not-recorded',
              'note':'原单元格为空；未记录不等于0。',
              'normalization':{'method':'none','significantDigits':None,'changed':False}}
    if raw is None or cell.get('value') is None:
        if cell.get('error'):
            result['status'] = 'unparsed'
            result['note'] = '原单元格为Excel错误；未尝试拆分。'
        return result
    display = str(raw)
    if cell.get('kind') == 'number':
        try:
            with localcontext() as context:
                context.prec = 15
                number = +Decimal(display)
            if not number.is_finite():
                raise InvalidOperation
            display = format(number,'f')
            if '.' in display:
                display = display.rstrip('0').rstrip('.')
            if float(display) != cell.get('value'):
                result['status'] = 'unparsed'
                result['note'] = '15位有效数字显示不能回到原数值；保留原码，不推测分项。'
                result['normalization'] = {'method':'numeric-normalization-rejected','significantDigits':15,'changed':False}
                return result
        except InvalidOperation:
            result['status'] = 'unparsed'
            result['note'] = '无法安全读取原数值编码；保留原文，不猜测分项。'
            return result
        result['normalization'] = {'method':'excel-15-significant-digits','significantDigits':15,'changed':display!=str(raw)}
    else:
        result['normalization'] = {'method':'text-preserved','significantDigits':None,'changed':False}
    result['display'] = display
    match = re.fullmatch(r'(\d+)(?:\.(\d+))?',display.strip())
    if not match or len(parts)!=2:
        result['status'] = 'unparsed'
        result['note'] = '编码格式不符合两个非负整数字段的约定；保留原文，不猜测分项。'
        return result
    primary, secondary = match.groups()
    parts[0].update(digits=primary,value=int(primary),status='recorded',note='点前记录的第一项。')
    if secondary is None:
        parts[1]['note'] = '原可读码没有点后部分；第二项未记录，不自动补0。'
        result['status'] = 'recorded'
        result['note'] = '只记录第一项；没有分隔点不代表第二项为0。'
    else:
        parts[1].update(digits=secondary,value=int(secondary),status='encoded',
                        note='当前可读码中点后的数字串；不补前后零，不宣称恢复数值存储已丢失的尾零。')
        result['status'] = 'encoded'
        result['note'] = '两部分按复合编码读取，不作小数运算；点后码保留其记录状态，不能据此确认丢失的尾零。'
    return result


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def blank(sheet, address):
    return {'value':None,'raw':None,'formula':None,'error':None,'address':address,'sheet':sheet,'kind':'blank','numberFormat':None}


def translate_shared_formula(formula, origin, target):
    ca, ra = CELL_RE.match(origin).groups()
    cb, rb = CELL_RE.match(target).groups()
    dc, dr = col_index(cb)-col_index(ca), int(rb)-int(ra)
    def replace(match):
        locked_c, column, locked_r, row = match.groups()
        new_column = column if locked_c else col_name(col_index(column)+dc)
        new_row = int(row) if locked_r else int(row)+dr
        if not new_column or new_row < 1:
            raise ValueError('Shared formula reference moved out of range')
        return locked_c+new_column+locked_r+str(new_row)
    return re.sub(r'(?<![A-Za-z_])([\$]?)([A-Z]+)([\$]?)([0-9]+)\b', replace, formula)


def read_workbook(path):
    """Retain the cached value, lexical value, formula, error and every stored cell."""
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        paths = {r.get('Id'):posixpath.normpath(posixpath.join('xl',r.get('Target'))) for r in rels}
        strings = []
        if 'xl/sharedStrings.xml' in names:
            strings = [''.join(item.itertext()) for item in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        styles = ET.fromstring(z.read('xl/styles.xml')) if 'xl/styles.xml' in names else None
        formats = dict(BUILTIN_FORMATS)
        if styles is not None:
            for element in styles.findall('m:numFmts/m:numFmt', NS):
                formats[int(element.get('numFmtId'))] = element.get('formatCode')
        style_ids = [int(e.get('numFmtId','0')) for e in styles.findall('m:cellXfs/m:xf', NS)] if styles is not None else [0]
        sheets = []
        for item in wb.findall('m:sheets/m:sheet',NS):
            name = item.get('name')
            target = paths[item.get('{'+REL+'}id')].lstrip('/')
            xml = ET.fromstring(z.read(target))
            cells = {}
            shared = {}
            for element in xml.findall('m:sheetData/m:row/m:c', NS):
                form = element.find('m:f', NS)
                if form is not None and form.get('t')=='shared' and form.text:
                    shared[form.get('si')] = (element.get('r'),form.text)
            for element in xml.findall('m:sheetData/m:row/m:c', NS):
                address = element.get('r')
                raw = element.findtext('m:v', None, NS)
                form = element.find('m:f', NS)
                celltype = element.get('t','n')
                formula = '=' + (form.text or '') if form is not None else None
                if form is not None and form.get('t')=='shared':
                    if form.get('si') not in shared:
                        raise ValueError(f'Shared formula master missing: {name}!{address}')
                    origin, master = shared[form.get('si')]
                    formula = '=' + translate_shared_formula(master,origin,address)
                elif form is not None and form.get('t') in ('array','dataTable'):
                    raise ValueError(f'Unsupported formula representation: {name}!{address}')
                value = raw
                kind = 'text'
                error = None
                if celltype == 's':
                    value = strings[int(raw)] if raw is not None else None
                    raw = value
                elif celltype == 'inlineStr':
                    node = element.find('m:is', NS)
                    value = ''.join(node.itertext()) if node is not None else None
                    raw = value
                elif celltype == 'e':
                    error = raw
                    value = None
                    kind = 'error'
                elif celltype == 'b':
                    value = raw == '1'
                    kind = 'boolean'
                elif celltype not in ('str','d'):
                    value = numeric(raw)
                    kind = 'number' if value is not None else 'blank'
                if value is None and error is None:
                    kind = 'blank'
                style = int(element.get('s','0'))
                cells[address] = {'value':value,'raw':raw,'formula':formula,'error':error,'address':address,'sheet':name,'kind':kind,'numberFormat':formats.get(style_ids[style],None) if style < len(style_ids) else None,'formulaAttributes':dict(form.attrib) if form is not None else None,'formulaRaw':form.text if form is not None else None}
            dimensions = xml.find('m:dimension', NS)
            row_attrs = {e.get('r'):dict(e.attrib) for e in xml.findall('m:sheetData/m:row', NS)}
            col_attrs = [dict(e.attrib) for e in xml.findall('m:cols/m:col', NS)]
            sheets.append({'name':name,'state':item.get('state','visible'),'dimensions':dimensions.get('ref') if dimensions is not None else None,'cells':cells,'hiddenRows':[int(r) for r,a in row_attrs.items() if a.get('hidden')=='1'],'hiddenColumns':[a for a in col_attrs if a.get('hidden')=='1'],'rowAttributes':row_attrs,'columnAttributes':col_attrs,'merges':[e.get('ref') for e in xml.findall('m:mergeCells/m:mergeCell',NS)],'sheetViews':ET.tostring(xml.find('m:sheetViews',NS),encoding='unicode') if xml.find('m:sheetViews',NS) is not None else None})
        core = ET.fromstring(z.read('docProps/core.xml')) if 'docProps/core.xml' in names else None
        modified = core.findtext('{http://purl.org/dc/terms/}modified') if core is not None else None
        calc = wb.find('m:calcPr',NS)
        return {'sheets':sheets,'unreviewedParts':[n for n in names if any(token in n.lower() for token in ('comments','threadedcomments','person','vba','embeddings','drawings','externalLink'.lower()))],'modified':modified,'calcProperties':dict(calc.attrib) if calc is not None else {},'definedNames':[{'name':e.get('name'),'localSheetId':e.get('localSheetId'),'text':e.text,'hidden':e.get('hidden')=='1'} for e in wb.findall('m:definedNames/m:definedName',NS)],'packageParts':names,'externalLinks':[n for n in names if 'externalLink' in n]}


def sanitize_workbook(source, target):
    """Remove personal/printer metadata without round-tripping any worksheet cells."""
    source, target = Path(source), Path(target)
    source_hash = sha256(source)
    before = read_workbook(source)
    target.parent.mkdir(parents=True,exist_ok=True)
    changes = []
    out = io.BytesIO()
    with zipfile.ZipFile(source) as zin, zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            name = item.filename
            data = zin.read(name)
            if name.startswith('xl/printerSettings/'):
                changes.append('printer-setting-part-removed')
                continue
            if name == 'docProps/core.xml':
                # Preserve original XML namespace declarations and all dates.
                text = data.decode('utf-8')
                text = re.sub(r'<(?:dc:creator|cp:lastModifiedBy)(?:\s[^>]*)?>.*?</(?:dc:creator|cp:lastModifiedBy)>','',text,flags=re.S)
                data = text.encode('utf-8')
                # Alternate namespace prefixes in later Excel saves must also be scrubbed.
                core = ET.fromstring(data)
                remaining = [e for e in core if e.tag.rsplit('}',1)[-1] in ('creator','lastModifiedBy')]
                if remaining:
                    for e in remaining: core.remove(e)
                    data = ET.tostring(core,encoding='utf-8',xml_declaration=True)
                changes.append('creator-and-last-editor-removed')
            elif name.endswith('.rels'):
                root = ET.fromstring(data)
                removed = [r for r in root if 'printerSettings' in (r.get('Type','') + r.get('Target',''))]
                if removed:
                    for r in removed:
                        root.remove(r)
                    data = ET.tostring(root,encoding='utf-8',xml_declaration=True)
            elif name == '[Content_Types].xml':
                root = ET.fromstring(data)
                removed = [r for r in root if 'printerSettings' in r.get('ContentType','') or '/printerSettings/' in r.get('PartName','')]
                if removed:
                    for r in removed:
                        root.remove(r)
                    data = ET.tostring(root,encoding='utf-8',xml_declaration=True)
            elif name.startswith('xl/worksheets/') and name.endswith('.xml'):
                # Only remove the relationship attribute on pageSetup; bytes of cells remain identical.
                text = data.decode('utf-8')
                text = re.sub(r'(<(?:\w+:)?pageSetup\b[^>]*?)\s+(?:[A-Za-z_][\w.-]*:)?id="[^"]*"',r'\1',text)
                data = text.encode('utf-8')
            zout.writestr(item,data)
    target.write_bytes(out.getvalue())
    after = read_workbook(target)
    assert before == after | {'packageParts':before['packageParts']}, 'Metadata cleanup changed workbook content'
    return {'originalSha256':source_hash,'publicSha256':sha256(target),'removed':sorted(set(changes)),'cellContentVerifiedUnchanged':True}


class ExcelError(Exception):
    pass


class FormulaEvaluator:
    """Small explicitly supported evaluator, used only to check cached values."""
    def __init__(self, sheet):
        self.sheet, self.memo, self.active = sheet, {}, set()

    def cell(self, address):
        address = address.replace('$','')
        if address in self.memo:
            return self.memo[address]
        if address in self.active:
            raise ExcelError('#CIRC!')
        self.active.add(address)
        try:
            cell = self.sheet['cells'].get(address,blank(self.sheet['name'],address))
            if cell['formula']:
                formula = cell['formula'][1:].replace('$','')
                ranges = []
                def range_token(match):
                    ranges.append(match[0])
                    return f'range_token_{len(ranges)-1}'
                formula = re.sub(r'[A-Z]+\d+:[A-Z]+\d+',range_token,formula)
                formula = re.sub(r'(?<![A-Za-z_])([A-Z]+\d+)\b',r'CELL("\1")',formula).replace('^','**')
                for index, reference in enumerate(ranges):
                    formula = formula.replace(f'range_token_{index}',f'RANGE("{reference}")')
                result = self.node(ast.parse(formula,mode='eval').body)
            elif cell['error']:
                raise ExcelError(cell['error'])
            else:
                result = cell['value']
            self.memo[address] = result
            return result
        finally:
            self.active.discard(address)

    def node(self, node):
        if isinstance(node, ast.Constant) and isinstance(node.value,(str,int,float)):
            return node.value
        if isinstance(node,ast.BinOp):
            a,b = self.node(node.left),self.node(node.right)
            a,b = (0 if a is None else a),(0 if b is None else b)
            operation = {ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Pow:operator.pow}.get(type(node.op))
            if operation is None:
                raise ValueError('unsupported operator')
            try:
                return operation(a,b)
            except ZeroDivisionError:
                raise ExcelError('#DIV/0!')
        if isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.USub,ast.UAdd)):
            result = self.node(node.operand)
            return -result if isinstance(node.op,ast.USub) else result
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Name):
            args = [self.node(a) for a in node.args]
            name = node.func.id
            if name == 'CELL':
                return self.cell(args[0])
            if name == 'RANGE':
                start,end = args[0].split(':')
                ca,ra = CELL_RE.match(start).groups()
                cb,rb = CELL_RE.match(end).groups()
                return [self.cell(f'{col_name(c)}{r}') for r in range(int(ra),int(rb)+1) for c in range(col_index(ca),col_index(cb)+1)]
            values = []
            for a in args:
                values.extend(a if isinstance(a,list) else [a])
            if name == 'COUNTBLANK':
                return sum(v is None or v == '' for v in values)
            values = [v for v in values if isinstance(v,(int,float)) and not isinstance(v,bool)]
            if name == 'SUM': return sum(values)
            if name == 'MIN': return min(values) if values else 0
            if name == 'MAX': return max(values) if values else 0
            if name == 'AVERAGE':
                if not values: raise ExcelError('#DIV/0!')
                return sum(values)/len(values)
        raise ValueError('Unsupported formula AST: '+ast.dump(node))


def issue(issues, severity, code, message, locations=None):
    issues.append({'severity':severity,'code':code,'message':message,'locations':locations or []})


def create_indicator(spec, column, samples):
    header = spec['headers'][column]
    override = spec.get('fieldOverrides',{}).get(column,{})
    role = override.get('role','indicator')
    cell_types = {v['kind'] for v in samples if v['kind'] not in ('blank','error')}
    typ = override.get('type','number' if cell_types <= {'number'} else 'text')
    name = override.get('name',str(header) if header is not None else f'未命名辅助字段（{column}列）')
    # Metadata is extracted only when the workbook header explicitly says it.
    year = header if isinstance(header,int) and 1900 <= header <= 2100 else None
    year_match = re.search(r'(?:19|20)\d{2}',str(header))
    if year_match: year = int(year_match[0])
    unit = next((u for u in ['十亿美元','亿美元','万亿','百万','平方公里','吨'] if u in str(header)),None)
    metadata_evidence = {'unit':'原始表头' if unit else None,'year':'原始表头' if year else None,'source':None}
    direction = 'asc' if role == 'rank' or '排名' in str(header) else None
    note = override.get('note')
    definition = {'id':spec['id']+'-'+column,'name':name,'originalHeader':header,'sheetId':spec['id'],'sheetName':spec['name'],'column':column,'group':spec['name'],'role':role,'type':typ,'direction':direction,'unit':unit,'year':year,'source':None,'estimate':None,'metadataEvidence':metadata_evidence,'chartable':typ=='number' and role not in ('auxiliary','identity','classification'),'rankingAllowed':typ=='number' and role not in ('auxiliary','identity','classification'),'note':note}
    if typ=='composite':
        definition['compositeParts'] = override.get('compositeParts',[])
    return definition


def build(source, output, config_path):
    config = json.loads(config_path.read_text(encoding='utf-8'))
    context_path = config_path.parent/'public-context.json'
    context = json.loads(context_path.read_text(encoding='utf-8')) if context_path.exists() else {}
    reader_path = config_path.parent/'reader-notes.json'
    reader_notes = json.loads(reader_path.read_text(encoding='utf-8')) if reader_path.exists() else {}
    workbook = read_workbook(source)
    issues, rechecks = [], []
    specs = {s['name']:s for s in config['sheets']}
    actual_names = [s['name'] for s in workbook['sheets']]
    if actual_names != list(specs):
        issue(issues,'error','sheet-structure','工作表名称或顺序改变，需要检查配置。',actual_names)
    if workbook['unreviewedParts']:
        issue(issues,'error','unreviewed-workbook-content','出现批注、嵌入对象、宏或外部内容，需补充映射与公开审查。',workbook['unreviewedParts'])
    if workbook['externalLinks']:
        issue(issues,'error','external-links','工作簿存在外部链接，需要审查。')
    if any(d['hidden'] and d not in config.get('reviewedDefinedNames',[]) for d in workbook['definedNames']):
        issue(issues,'error','hidden-defined-name','存在隐藏名称，需要审查。')
    all_cells = [c for s in workbook['sheets'] for c in s['cells'].values()]
    for sheet in workbook['sheets']:
        spec = specs.get(sheet['name'])
        if not spec:
            continue
        if sheet['state'] != 'visible' or sheet['hiddenRows'] or sheet['hiddenColumns']:
            issue(issues,'error','hidden-content','发现隐藏工作表、行或列，需要审查后才能发布。',[sheet['name']])
        actual_headers = {CELL_RE.match(a)[1]:c['value'] for a,c in sheet['cells'].items() if CELL_RE.match(a)[2]=='1' and c['value'] is not None}
        expected_headers = {k:v for k,v in spec['headers'].items() if v is not None}
        if actual_headers != expected_headers:
            issue(issues,'error','header-structure','表头结构改变，需要核对字段配置。',[sheet['name']])
        used_cols = {CELL_RE.match(a)[1] for a,c in sheet['cells'].items() if c['value'] is not None or c['formula'] or c['error']}
        if used_cols - set(spec['headers']):
            issue(issues,'error','new-columns','出现尚未映射的数据列。',[sheet['name']+':'+','.join(sorted(used_cols - set(spec['headers'])))])
        evaluator = FormulaEvaluator(sheet)
        for address,cell in sheet['cells'].items():
            col,row = CELL_RE.match(address).groups()
            if cell['error']:
                ename = sheet['cells'].get(spec['entityColumn']+row,{}).get('value')
                known = {'sheet':sheet['name'],'column':col,'entity':ename,'error':cell['error']} in config['knownErrors']
                issue(issues,'warning' if known else 'error','source-excel-error','源工作簿包含 '+cell['error']+'，原样保留；不替换为0。',[sheet['name']+'!'+address])
            if not cell['formula']:
                continue
            if spec['id']==config['summarySheet'] and col==config['referenceColumn'] and config.get('referenceFormula'):
                ename = sheet['cells'].get(spec['entityColumn']+row,{}).get('value')
                exception = config.get('referenceFormulaExceptions',{}).get(ename)
                origin = exception['origin'] if exception else config['referenceFormulaOrigin']
                formula = exception['formula'] if exception else config['referenceFormula']
                expected_formula = '=' + translate_shared_formula(formula[1:],origin,address)
                coefficients = {col:float(weight) for weight,col in re.findall(r'([0-9.]+)\*\(51-([EFG])\d+\)/50',cell['formula'])}
                coefficients.update({col:float(weight) for weight,col in re.findall(r'([0-9.]+)\*([H-L])\d+/5',cell['formula'])})
                configured_weights = {d['summaryColumn']:d['weight'] for d in config['domains']}
                if coefficients != configured_weights:
                    issue(issues,'error','weight-config-mismatch','公式系数与页面权重配置不一致；需核对配置，禁止发布旧权重说明。',[sheet['name']+'!'+address])
                if cell['formula'] != expected_formula:
                    issue(issues,'error','reference-formula-changed','综合参考公式发生改变，需要同步核对方法说明与权重配置。',[sheet['name']+'!'+address])
            if cell['raw'] is None:
                issue(issues,'error','missing-cache','公式缺少缓存值；请在Excel或兼容软件中重算并保存。',[sheet['name']+'!'+address])
                continue
            try:
                recomputed = evaluator.cell(address)
            except ExcelError as exc:
                recomputed = str(exc)
            except (ValueError,TypeError,KeyError,OverflowError) as exc:
                issue(issues,'error','unverified-formula','公式超出自动核验范围，发布前需扩充验证器。',[sheet['name']+'!'+address])
                rechecks.append({'sheet':sheet['name'],'address':address,'status':'unsupported','detail':str(exc)})
                continue
            cached = cell['error'] or cell['value']
            matched = math.isclose(recomputed,cached,rel_tol=1e-11,abs_tol=1e-10) if isinstance(recomputed,(float,int)) and isinstance(cached,(float,int)) else recomputed==cached
            rechecks.append({'sheet':sheet['name'],'address':address,'status':'matched' if matched else 'mismatch'})
            if not matched:
                issue(issues,'error','stale-formula-cache','公式缓存与可复算结果不一致。请先重算保存，网站不会自行替换缓存。',[sheet['name']+'!'+address])
    if any(i['severity']=='error' for i in issues):
        output.mkdir(parents=True,exist_ok=True)
        quality = {'status':'failed','issues':issues,'formulaChecks':rechecks}
        (output/'validation.json').write_text(json.dumps(quality,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        raise ValueError('Validation failed; see '+str(output/'validation.json'))

    summary = next(s for s in workbook['sheets'] if specs[s['name']]['id']==config['summarySheet'])
    summary_spec = specs[summary['name']]
    summary_rows = sorted({int(CELL_RE.match(a)[2]) for a,c in summary['cells'].items() if a.startswith(summary_spec['entityColumn']) and CELL_RE.match(a)[1]==summary_spec['entityColumn'] and c['value'] is not None and int(CELL_RE.match(a)[2])>1})
    entities, by_name, by_id = [], {}, {}
    for row in summary_rows:
        def value(col): return summary['cells'].get(col+str(row),{}).get('value')
        name, english = value(summary_spec['entityColumn']),value(config['englishColumn'])
        eid = re.sub(r'[^a-z0-9]+','-',str(english or '').lower()).strip('-') or hashlib.sha256(name.encode()).hexdigest()[:12]
        if name in by_name or eid in by_id:
            issue(issues,'error','duplicate-entity','实体名称或英文URL标识重复。',[name])
            continue
        rank = value(config['rankColumn'])
        if rank is not None and not isinstance(rank,(float,int)):
            issue(issues,'error','invalid-rank','既定排名必须是数字或空值。',[summary['name']+'!'+config['rankColumn']+str(row)])
        entity = {'id':eid,'name':name,'englishName':english,'category':value(config['categoryColumn']),'rank':rank,'ranked':rank is not None,'referenceValue':value(config['referenceColumn']),'sourceRow':row,'domains':{d['id']:value(d['summaryColumn']) for d in config['domains']},'metrics':{}}
        entity['domainChartable'] = {d['id']:isinstance(entity['domains'][d['id']],(int,float)) and (0 < entity['domains'][d['id']] <= len(summary_rows) if d['kind']=='rank' else 0 <= entity['domains'][d['id']] <= 5) for d in config['domains']}
        entities.append(entity)
        by_name[name] = entity
        by_id[eid] = entity
    ranked = [e for e in entities if e['ranked']]
    for entity in entities:
        for d in config['domains']:
            value = entity['domains'][d['id']]
            entity['domainChartable'][d['id']] = isinstance(value,(int,float)) and (0 < value <= len(ranked) if d['kind']=='rank' else 0 <= value <= 5)
            if value is not None and not entity['domainChartable'][d['id']]:
                issue(issues,'warning','domain-outside-display-range','领域值超出常规展示范围，原值保留但不纳入相对位置图。',[entity['name']+':'+d['name']+'='+str(value)])
    ranks = Counter(e['rank'] for e in ranked)
    if any(n>1 for n in ranks.values()):
        issue(issues,'warning','tied-ranks','既定排名含并列；原样保留，不自动重新编号。')
    sorted_ranked = sorted(ranked,key=lambda e:e['rank'])
    inversions = [{'earlier':a['name'],'earlierRank':a['rank'],'earlierValue':a['referenceValue'],'later':b['name'],'laterRank':b['rank'],'laterValue':b['referenceValue']} for a,b in zip(sorted_ranked,sorted_ranked[1:]) if a['referenceValue'] is not None and b['referenceValue'] is not None and a['referenceValue'] < b['referenceValue']]
    if inversions:
        issue(issues,'warning','rank-reference-difference',f'既定排名与公式参考值降序存在 {len(inversions)} 处相邻逆序；展示既定排名，不自动重排。')
    if any(e['referenceValue'] is not None and e['referenceValue']>100 for e in entities):
        issue(issues,'warning','reference-above-100','原表未命名公式参考值存在大于100的值，不能称作百分制。')

    indicators, sheets = [], []
    for sheet in workbook['sheets']:
        spec = specs[sheet['name']]
        columns = sorted(spec['headers'],key=col_index)
        definitions = []
        for col in columns:
            samples = [c for a,c in sheet['cells'].items() if CELL_RE.match(a)[1]==col and int(CELL_RE.match(a)[2])>1]
            definition = create_indicator(spec,col,samples)
            if spec['id']=='summary':
                domain = next((d for d in config['domains'] if d['summaryColumn']==col),None)
                if domain:
                    definition['direction'] = domain['direction']
                    definition['type'] = 'number'
            field_note = context.get('fieldNotes',{}).get(definition['id'])
            if definition['id']=='military-H':
                # This legacy annotation describes a particular source value.
                # Do not leave a stale claim after the workbook is updated.
                nk_row = next((CELL_RE.match(a)[2] for a,c in sheet['cells'].items()
                               if CELL_RE.match(a)[1]==spec['entityColumn'] and c['value']=='朝鲜'),None)
                nk_value = sheet['cells'].get('H'+str(nk_row),{}).get('value') if nk_row else None
                if nk_value != 0:
                    field_note = None
            if field_note:
                definition['note'] = (definition['note']+' ' if definition['note'] else '')+field_note
            definition['explanation'] = reader_notes.get('fields',{}).get(definition['id'])
            definitions.append(definition)
        indicators.extend(definitions)
        rows = []
        used_rows = sorted({int(CELL_RE.match(a)[2]) for a in sheet['cells']})
        entity_names = []
        for row in used_rows:
            ename = sheet['cells'].get(spec['entityColumn']+str(row),{}).get('value') if row>1 else None
            entity = by_name.get(ename)
            if ename is not None and entity is None:
                issue(issues,'error','unknown-entity','领域表出现综排不存在的实体。',[sheet['name']+'!'+spec['entityColumn']+str(row)])
            if entity:
                entity_names.append(ename)
            row_cells = {}
            # Retain explicit styled blanks beyond the named field range too.
            row_columns = sorted(set(columns)|{CELL_RE.match(a)[1] for a in sheet['cells'] if int(CELL_RE.match(a)[2])==row},key=col_index)
            for col in row_columns:
                cell = dict(sheet['cells'].get(col+str(row),blank(sheet['name'],col+str(row))))
                definition = next((d for d in definitions if d['column']==col),None)
                if row>1 and definition and definition['type']=='composite':
                    cell['composite'] = parse_composite(cell,definition['compositeParts'])
                    if cell['composite']['status']=='unparsed':
                        issue(issues,'warning','unparsed-composite','复合编码不能安全拆分，保留原文并提示作者核对。',[sheet['name']+'!'+cell['address']])
                    if cell['value'] is not None:
                        cell['value'] = cell['raw']
                        cell['kind'] = 'composite'
                row_cells[col] = cell
                if entity and definition:
                    entity['metrics'][definition['id']] = dict(cell)
            kind = 'header' if row==1 else 'entity' if entity else 'auxiliary' if any(c['value'] is not None or c['error'] for c in row_cells.values()) else 'blank'
            rows.append({'row':row,'entityId':entity['id'] if entity else None,'kind':kind,'cells':row_cells})
        if len(entity_names)!=len(set(entity_names)):
            issue(issues,'error','duplicate-detail-entity','领域表中实体重复。',[sheet['name']])
        if spec['id']!='summary':
            missing = set(e['name'] for e in ranked)-set(entity_names)
            if missing:
                issue(issues,'warning','detail-coverage','领域表缺少部分有既定排名的实体。',[sheet['name']+':'+','.join(sorted(missing))])
            for entity in entities:
                own = entity['metrics'].get(spec['id']+'-A',{}).get('value')
                top = entity['domains'].get(spec['id'])
                if own is not None and top is not None and own!=top:
                    issue(issues,'warning','domain-summary-difference','综排领域值与领域表结论不同，分别保留。',[entity['name']+':'+sheet['name']])
        duplicates = [h for h,n in Counter(h for h in spec['headers'].values() if h is not None).items() if n>1]
        if duplicates:
            issue(issues,'warning','duplicate-header','同名字段保留为不同列，不合并。',[sheet['name']+':'+','.join(map(str,duplicates))])
        sheets.append({'id':spec['id'],'name':sheet['name'],'role':spec['role'],'state':sheet['state'],'dimensions':sheet['dimensions'],'columns':[{'id':d['id'],'indicatorId':d['id'],'name':d['name'],'originalHeader':d['originalHeader'],'column':d['column']} for d in definitions],'rows':rows,'hiddenRows':sheet['hiddenRows'],'hiddenColumns':sheet['hiddenColumns'],'merges':sheet['merges'],'rowAttributes':sheet['rowAttributes'],'columnAttributes':sheet['columnAttributes'],'definedNames':workbook['definedNames']})
    for entity in entities:
        for indicator in indicators:
            if indicator['id'] not in entity['metrics']:
                c = blank(indicator['sheetName'],None)
                c['kind'] = 'blank'
                if indicator['type']=='composite':
                    c['composite'] = parse_composite(c,indicator['compositeParts'])
                entity['metrics'][indicator['id']] = c
    details = [d for d in indicators if d['sheetId']!='summary' and d['role'] not in ('identity','rank','score')]
    named = [d for d in details if d['originalHeader'] is not None]
    unnamed = [d for d in details if d['originalHeader'] is None]
    issue(issues,'warning','missing-field-metadata','多数字段没有逐项来源、完整单位与年份；未标注的信息保持空值。')
    issue(issues,'warning','auxiliary-fields',f'{len(unnamed)} 个领域辅助字段没有原表头；另保留矿产表无实体辅助行。')
    issue(issues,'warning','blank-not-zero','缺失值没有统一说明；网站保留空白，不将空值推定为0或自动估算。')
    issue(issues,'warning','military-composite','五个军事字段为带点复合编码。原码保留，附15位有效数字的可读展示与点前/点后记录；不补丢失尾零，不将整体作连续数值排名或绘图。')
    oil_formulas = {re.sub(r'(?<=[A-Z])\d+','#',e['metrics']['energy-J']['formula']) for e in entities if e['metrics']['energy-J']['formula']}
    if len(oil_formulas)>1:
        issue(issues,'warning','energy-formula-variants','能源“石油综合”存在不同公式写法，均按原式与原缓存展示；修改需由作者判断。',sorted(oil_formulas))
    water_formulas = [e['metrics']['agriculture-V'] for e in entities if e['metrics']['agriculture-V']['formula']]
    if any(re.fullmatch(r'=U\d+/S\d+',c['formula']) for c in water_formulas):
        issue(issues,'warning','water-name-formula','农业“水源自给率”当前按年用水量/循环水计算；名称与计算含义应由作者核对。',['农业!V'])
    if any(re.search(r'\)\*10/O',e['metrics']['stability-K']['formula'] or '') for e in entities):
        issue(issues,'warning','population-growth-unit','稳定“人口增长”公式包含乘10，时间与百分比口径未标注，不补推单位。',['稳定!K'])
    north_korea = by_name.get('朝鲜')
    if north_korea and north_korea['metrics']['military-H']['value']==0:
        issue(issues,'warning','military-zero-placeholder','朝鲜军费原值为0；历史说明将其视作缺失占位，保留0且不解读为实际零军费。',['军事排名!'+str(north_korea['metrics']['military-H']['address'])])
    errors = sum(c['error'] is not None for c in all_cells)
    counts = {'entities':len(entities),'rankedEntities':len(ranked),'supplementaryEntities':len(entities)-len(ranked),'domains':len(config['domains']),'indicators':len(named),'fields':len(details),'auxiliaryFields':len(unnamed),'allFields':len(indicators),'sheets':len(sheets),'formulas':sum(c['formula'] is not None for c in all_cells),'errors':errors}
    quality = {'status':'failed' if any(i['severity']=='error' for i in issues) else 'passed-with-warnings','summary':{'errors':sum(i['severity']=='error' for i in issues),'warnings':sum(i['severity']=='warning' for i in issues),'formulasChecked':len(rechecks),'formulasMatched':sum(r['status']=='matched' for r in rechecks),'excelErrors':errors},'issues':issues,'rankReferenceInversions':inversions,'formulaChecks':rechecks,'workbookCalculationProperties':workbook['calcProperties']}
    if quality['status']=='failed':
        output.mkdir(parents=True,exist_ok=True)
        (output/'validation.json').write_text(json.dumps(quality,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        raise ValueError('Validation failed; see '+str(output/'validation.json'))
    now = datetime.now(timezone.utc).isoformat(timespec='seconds')
    original_formula = next((c['formula'] for a,c in summary['cells'].items() if CELL_RE.match(a)[1]==config['referenceColumn'] and c['formula']),None)
    dataset = {'schemaVersion':1,'meta':{'title':config['title'],'version':config['version'],'builtAt':now,'workbookModifiedAt':workbook['modified'],'sourceSha256':sha256(source),'counts':counts,'referenceValueLabel':'公式参考值（非百分制）','rankPolicy':'保留综排中的作者既定排名；不以公式参考值重排。','metadataPolicy':config['metadataPolicy'],'indicatorCountLabel':'有名称的领域数据字段（包含派生字段、名次和年序列，非独立指标数量）','fieldCountLabel':'领域数据字段（含未命名辅助项，不含实体名与领域结论）'},'domains':config['domains'],'indicators':indicators,'entities':entities,'sheets':sheets,'quality':quality,'methodology':{'notes':['最新版工作簿是所有实体值、排名及公式缓存的唯一权威来源。','综排包含有既定排名的实体与尚未列入既定排名的补充实体；保留原名称与分类。','政治、经济、军事在综排中为名次，数值越小名次越靠前；其余五领域为分级得分，数值越高得分越高。','八领域结论和若干分项名次是工作簿录入值，并非都可由现有分项公式完整重建。','原表未命名的公式结果作为参考值展示；其结果可超过100，且不等同作者既定排名。','仅为展示而排序的指标顺序不构成新增研究结论。'],'formula':original_formula,'weights':[{'domainId':d['id'],'name':d['name'],'weight':d['weight']} for d in config['domains']],'sources':[{'label':'最新版 Excel 工作簿','url':None,'note':'数值、现有排名和公式的权威来源；未含独立来源表。'}],'limitations':['不同指标可能使用不同年份；文档修改时间不等于观测年份。','多数逐项来源、单位、年份及估算标记缺失；不从旧报告数字反向填补。','空值与0分开保留，Excel错误显式呈现。','同名矿产字段和未命名辅助数据不擅自合并或改名为确定含义。','军事复合编码未作小数数值解释。']},'downloads':[]}
    dataset['methodology']['formulaVariants'] = [{'entity':name,**detail} for name,detail in config.get('referenceFormulaExceptions',{}).items()]
    dataset['readerNotes'] = reader_notes
    dataset['meta']['researchVersion'] = config['version']
    dataset['meta']['versionLabel'] = '研究版本'
    dataset['meta']['dataVersion'] = (workbook['modified'] or '保存日期未注明')+' · '+dataset['meta']['sourceSha256'][:12]
    dataset['meta']['description'] = context.get('projectDescription')
    dataset['methodology']['notes'].extend(context.get('notes',[]))
    dataset['methodology']['sources'].extend(context.get('sources',[]))
    dataset['methodology']['limitations'].extend(context.get('limitations',[]))
    for domain in dataset['domains']:
        domain['description'] = context.get('domainDescriptions',{}).get(domain['id'])
        domain['explanation'] = reader_notes.get('domains',{}).get(domain['id'])
    for sheet in dataset['sheets']:
        sheet['explanation'] = reader_notes.get('sheets',{}).get(sheet['id'],reader_notes.get('domains',{}).get(sheet['id']))
    data_dir, download_dir = output/'data', output/'downloads'
    data_dir.mkdir(parents=True,exist_ok=True)
    download_dir.mkdir(parents=True,exist_ok=True)
    public_book = download_dir/'national-power.xlsx'
    sanitization = sanitize_workbook(source,public_book)
    dataset['meta']['downloadSha256'] = sanitization['publicSha256']
    dataset['meta']['downloadMetadataSanitized'] = True
    (download_dir/'national-power-2.0.xlsx').unlink(missing_ok=True)
    dataset['downloads'].append({'label':'Excel 工作簿','href':'downloads/national-power.xlsx','format':'xlsx','description':'保留全部单元格、公式和缓存；仅清除作者及打印机元数据。'})
    for sheet in sheets:
        max_col = max(col_index(c) for r in sheet['rows'] for c in r['cells'])
        path = download_dir/(sheet['id']+'.csv')
        with path.open('w',encoding='utf-8-sig',newline='') as out:
            writer = csv.writer(out)
            for row in sheet['rows']:
                writer.writerow([csv_value(row['cells'].get(col_name(c))) for c in range(1,max_col+1)])
        dataset['downloads'].append({'label':sheet['name']+' · CSV','href':'downloads/'+path.name,'format':'csv','description':'原表顺序与全部辅助行；单元格值为原工作簿缓存，公式见JSON。'})
    with (download_dir/'all-fields.csv').open('w',encoding='utf-8-sig',newline='') as out:
        writer = csv.writer(out)
        writer.writerow([safe_csv_text(x) for x in ['实体','英文名称','既定排名']+[d['sheetName']+' / '+d['name']+' ['+d['column']+']' for d in indicators]])
        for entity in entities:
            writer.writerow([safe_csv_text(entity['name']),safe_csv_text(entity['englishName']),entity['rank']]+[csv_value(entity['metrics'][d['id']]) for d in indicators])
    dataset['downloads'].insert(1,{'label':'全部实体与字段 · CSV','href':'downloads/all-fields.csv','format':'csv','description':'按实体联结全部领域字段；空值、错误、复合码分开保留。'})
    dataset['downloads'].insert(2,{'label':'完整数据层 · JSON','href':'data/dataset.json','format':'json','description':'含字段定义、全部单元格、公式、缓存、原始文本及溯源坐标。'})
    with (download_dir/'military-components.csv').open('w',encoding='utf-8-sig',newline='') as out:
        writer = csv.writer(out)
        writer.writerow(['实体','字段ID','原字段','原XML码','可读组合码','第一项','第一项记录码','第一项数值','第一项状态','第二项','第二项记录码','第二项数值','第二项状态','组合状态','说明'])
        for entity in entities:
            for definition in indicators:
                if definition['type']!='composite': continue
                cell = entity['metrics'][definition['id']]
                composite = cell['composite']
                a,b = composite['parts']
                writer.writerow([safe_csv_text(v) for v in [entity['name'],definition['id'],definition['originalHeader'],cell['raw'],composite['display'],a['label'],a['digits'],a['value'],a['status'],b['label'],b['digits'],b['value'],b['status'],composite['status'],composite['note']]])
    dataset['downloads'].append({'label':'军事复合字段分项 · CSV','href':'downloads/military-components.csv','format':'csv','description':'原码、可读码和两个分项的记录码与状态；不补未记录值或丢失尾零，不能作为完整军备清单。'})
    (data_dir/'dataset.json').write_text(json.dumps(dataset,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n',encoding='utf-8')
    (data_dir/'quality.json').write_text(json.dumps(quality,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    (output/'validation.json').write_text(json.dumps(quality,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    (output/'validation.md').write_text(quality_markdown(dataset),encoding='utf-8')
    return dataset


def safe_csv_text(value):
    # CSV consumers may execute formula-like strings. Numeric values remain numeric.
    if isinstance(value,str) and value.lstrip().startswith(('=','+','-','@','\t','\r','\n')):
        return "'"+value
    return value


def csv_value(cell):
    if not cell: return ''
    if cell['error']: return cell['error']
    if cell['value'] is None: return ''
    if cell['kind']=='composite':
        # Original numeric codes stay exact; newly supported text codes retain
        # the existing CSV formula-injection escape policy.
        is_text = cell.get('composite',{}).get('normalization',{}).get('method')=='text-preserved'
        return safe_csv_text(cell['raw']) if is_text else cell['raw']
    return safe_csv_text(cell['value'])


def quality_markdown(dataset):
    c = dataset['meta']['counts']
    q = dataset['quality']
    text = ['# Workbook validation report','',f"Status: **{q['status']}**",'',f"Source SHA-256: `{dataset['meta']['sourceSha256']}`",'',f"{c['entities']} entities; {c['rankedEntities']} with author-assigned ranks; {c['supplementaryEntities']} supplementary entities; {c['domains']} domains; {c['fields']} detail fields ({c['indicators']} named, {c['auxiliaryFields']} unnamed).",'',f"Formula caches independently checked: {q['summary']['formulasMatched']} / {q['summary']['formulasChecked']}. Known Excel errors retained: {c['errors']}.",'','No data, weight, formula, rank or conclusion was changed.','', '## Findings','']
    for item in q['issues']:
        text.append(f"- **{item['severity']} / {item['code']}**: {item['message']}"+(' ('+'; '.join(item['locations'])+')' if item['locations'] else ''))
    text += ['', '## Source fidelity', '', 'Each exported value retains its source sheet and cell address. Blanks remain null; Excel errors remain explicit errors; compound military codes retain their original XML numeric text. Published Excel strips author/last-editor and printer metadata only. It is structurally checked against the source before publication.', '', '## Interpretation limits', '']
    text += ['- '+x for x in dataset['methodology']['limitations']]
    return '\n'.join(text)+'\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=ROOT/'data/source/national-power.xlsx')
    parser.add_argument('--config',type=Path,default=ROOT/'config/workbook.json')
    parser.add_argument('--output',type=Path,default=ROOT/'dist')
    parser.add_argument('--sanitize-to',type=Path,help='Create a metadata-sanitized source copy and exit.')
    args = parser.parse_args()
    try:
        if args.sanitize_to:
            result = sanitize_workbook(args.source,args.sanitize_to)
            print(json.dumps(result,ensure_ascii=False,indent=2))
        else:
            dataset = build(args.source,args.output,args.config)
            print(json.dumps({'status':dataset['quality']['status'],'counts':dataset['meta']['counts'],'formulaChecks':dataset['quality']['summary']['formulasMatched'],'output':str(args.output)},ensure_ascii=False))
    except (ValueError,AssertionError,KeyError,zipfile.BadZipFile) as exc:
        print('ERROR: '+str(exc),file=sys.stderr)
        return 1
    return 0


if __name__=='__main__':
    raise SystemExit(main())
