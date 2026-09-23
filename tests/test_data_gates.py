"""Regression checks for publication gates, using deliberately damaged workbooks."""
import importlib.util
import json
import re
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('np_build_data',ROOT/'scripts/build_data.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


class DataGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = ROOT/'data/source/national-power.xlsx'
        self.config = ROOT/'config/workbook.json'

    def tearDown(self):
        self.temp.cleanup()

    def mutate(self,part,change):
        path = self.root/'changed.xlsx'
        with zipfile.ZipFile(self.source) as source, zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as target:
            for item in source.infolist():
                content = source.read(item.filename)
                if item.filename==part:
                    content = change(content.decode()).encode()
                target.writestr(item,content)
        return path

    def cell(self,text,address,change):
        pattern = r'<c\b[^>]*\br="'+address+r'"[^>]*>.*?</c>'
        text,count = re.subn(pattern,lambda m:change(m[0]),text,flags=re.S)
        self.assertEqual(count,1)
        return text

    def assert_blocked(self,path,code,config=None):
        output = self.root/'output'
        with self.assertRaises(ValueError):
            pipeline.build(path,output,config or self.config)
        report = json.loads((output/'validation.json').read_text(encoding='utf-8'))
        self.assertIn(code,{issue['code'] for issue in report['issues']})
        self.assertFalse((output/'data/dataset.json').exists())

    def test_missing_formula_cache_blocks(self):
        path = self.mutate('xl/worksheets/sheet1.xml',lambda t:self.cell(t,'O2',lambda c:re.sub(r'<v>.*?</v>','',c)))
        self.assert_blocked(path,'missing-cache')

    def test_stale_formula_cache_blocks(self):
        path = self.mutate('xl/worksheets/sheet1.xml',lambda t:self.cell(t,'O2',lambda c:re.sub(r'<v>.*?</v>','<v>999</v>',c)))
        self.assert_blocked(path,'stale-formula-cache')

    def test_hidden_row_blocks(self):
        path = self.mutate('xl/worksheets/sheet1.xml',lambda t:re.sub(r'(<row\b[^>]*\br="2")',r'\1 hidden="1"',t,count=1))
        self.assert_blocked(path,'hidden-content')

    def test_unexpected_error_blocks(self):
        path = self.mutate('xl/worksheets/sheet1.xml',lambda t:self.cell(t,'E2',lambda c:re.sub(r'<c\b[^>]*>', '<c r="E2" t="e">',re.sub(r'<v>.*?</v>','<v>#N/A</v>',c))))
        self.assert_blocked(path,'source-excel-error')

    def test_changed_weight_blocks(self):
        path = self.mutate('xl/worksheets/sheet1.xml',lambda t:self.cell(t,'O2',lambda c:c.replace('0.15*','0.16*')))
        self.assert_blocked(path,'weight-config-mismatch')

    def test_stale_weight_documentation_blocks(self):
        config = json.loads(self.config.read_text(encoding='utf-8'))
        config['domains'][0]['weight'] = 0.99
        path = self.root/'workbook.json'
        path.write_text(json.dumps(config,ensure_ascii=False),encoding='utf-8')
        self.assert_blocked(self.source,'weight-config-mismatch',path)

    def test_duplicate_entity_blocks(self):
        with zipfile.ZipFile(self.source) as z:
            text = z.read('xl/worksheets/sheet1.xml').decode()
        first = re.search(r'<c\b[^>]*\br="C2"[^>]*>.*?<v>(.*?)</v>.*?</c>',text,re.S)[1]
        path = self.mutate('xl/worksheets/sheet1.xml',lambda t:self.cell(t,'C3',lambda c:re.sub(r'<v>.*?</v>','<v>'+first+'</v>',c)))
        self.assert_blocked(path,'duplicate-entity')

    def test_formula_like_text_is_escaped_only_in_csv(self):
        for text in ['=1+1','+SUM(A1:A2)','-HYPERLINK("x")','@A1','  =1']:
            self.assertEqual(pipeline.safe_csv_text(text),"'"+text)
        self.assertEqual(pipeline.safe_csv_text(-1.5),-1.5)
        self.assertEqual(pipeline.safe_csv_text('普通文本'),'普通文本')

    def test_metadata_sanitization_is_idempotent(self):
        output = self.root/'public.xlsx'
        proof = pipeline.sanitize_workbook(self.source,output)
        self.assertTrue(proof['cellContentVerifiedUnchanged'])
        # ZIP parts legitimately change when a new upload contains printer data.
        # Compare all parsed research semantics, then verify a second pass is inert.
        before,after = pipeline.read_workbook(self.source),pipeline.read_workbook(output)
        self.assertEqual({k:v for k,v in before.items() if k!='packageParts'},
                         {k:v for k,v in after.items() if k!='packageParts'})
        repeated = self.root/'public-again.xlsx'
        pipeline.sanitize_workbook(output,repeated)
        self.assertEqual(output.read_bytes(),repeated.read_bytes())
        with zipfile.ZipFile(output) as z:
            self.assertFalse(any('printerSettings' in n for n in z.namelist()))
            text = z.read('docProps/core.xml').decode()
            self.assertNotIn('lastModifiedBy',text)
            self.assertNotIn('creator',text)

    def test_new_upload_with_actual_printer_parts_is_sanitized(self):
        """Model a normal Excel save that reintroduces printer metadata."""
        source = self.root/'with-printer.xlsx'
        rel_namespace = 'http://schemas.openxmlformats.org/package/2006/relationships'
        content_namespace = 'http://schemas.openxmlformats.org/package/2006/content-types'
        relationship_type = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings'
        rel_path = 'xl/worksheets/_rels/sheet1.xml.rels'
        with zipfile.ZipFile(self.source) as z:
            parts = {name:z.read(name) for name in z.namelist()}
        relations = ET.fromstring(parts[rel_path]) if rel_path in parts else ET.Element('{'+rel_namespace+'}Relationships')
        ET.SubElement(relations,'{'+rel_namespace+'}Relationship',{'Id':'testPrinter','Type':relationship_type,'Target':'../printerSettings/test.bin'})
        parts[rel_path] = ET.tostring(relations,encoding='utf-8',xml_declaration=True)
        types = ET.fromstring(parts['[Content_Types].xml'])
        ET.SubElement(types,'{'+content_namespace+'}Override',{'PartName':'/xl/printerSettings/test.bin','ContentType':'application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings'})
        parts['[Content_Types].xml'] = ET.tostring(types,encoding='utf-8',xml_declaration=True)
        worksheet = parts['xl/worksheets/sheet1.xml'].decode()
        worksheet,count = re.subn(r'<pageSetup\b',r'<pageSetup r:id="testPrinter"',worksheet,count=1)
        self.assertEqual(count,1)
        parts['xl/worksheets/sheet1.xml'] = worksheet.encode()
        parts['xl/printerSettings/test.bin'] = b'test printer metadata with local device name'
        with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED) as z:
            for name,content in parts.items(): z.writestr(name,content)
        output = self.root/'cleaned.xlsx'
        pipeline.sanitize_workbook(source,output)
        before,after = pipeline.read_workbook(source),pipeline.read_workbook(output)
        self.assertEqual({k:v for k,v in before.items() if k!='packageParts'},
                         {k:v for k,v in after.items() if k!='packageParts'})
        repeated = self.root/'cleaned-again.xlsx'
        pipeline.sanitize_workbook(output,repeated)
        self.assertEqual(output.read_bytes(),repeated.read_bytes())
        with zipfile.ZipFile(output) as z:
            self.assertNotIn('xl/printerSettings/test.bin',z.namelist())
            self.assertNotIn(b'testPrinter',z.read('xl/worksheets/sheet1.xml'))
            self.assertNotIn(b'printerSettings',z.read(rel_path))
            self.assertNotIn(b'printerSettings',z.read('[Content_Types].xml'))


class CompositeReadingTests(unittest.TestCase):
    PARTS = [{'id':'primary','label':'第一项','unit':None},
             {'id':'secondary','label':'第二项','unit':None}]

    def read(self,raw,text=False):
        cell = {'raw':raw,'value':raw if text else pipeline.numeric(raw),
                'kind':'text' if text else 'number','error':None}
        return pipeline.parse_composite(cell,self.PARTS)

    def test_twenty_four_numeric_tail_fixtures(self):
        # Fixed input examples are independent of the next workbook update.
        # Four decimal places in the first case rule out a fixed-3-place parser.
        fixtures = [
            ('20.126200000000001','20.1262'),('600.70000000000005','600.7'),
            ('8.1709999999999994','8.171'),('157.93299999999999','157.933'),
            ('3309.2890000000002','3309.289'),('290.39999999999998','290.4'),
            ('8.1590000000000007','8.159'),('5307.4179999999997','5307.418'),
            ('4292.4560000000001','4292.456'),('8.1069999999999993','8.107'),
            ('2229.2710000000002','2229.271'),('290.39999999999998','290.4'),
            ('976.11900000000003','976.119'),('6.6589999999999998','6.659'),
            ('2.2090000000000001','2.209'),('4.3099999999999996','4.31'),
            ('513.10900000000004','513.109'),('1083.8399999999999','1083.84'),
            ('4.5199999999999996','4.52'),('1.1399999999999999','1.14'),
            ('4.0999999999999996','4.1'),('2.3199999999999998','2.32'),
            ('1093.6099999999999','1093.61'),('4.0999999999999996','4.1')]
        for raw,expected in fixtures:
            with self.subTest(raw=raw):
                result = self.read(raw)
                self.assertEqual(result['display'],expected)
                self.assertEqual(result['parts'][1]['digits'],expected.split('.')[1])
                self.assertEqual(result['parts'][1]['status'],'encoded')
                self.assertEqual(float(result['display']),float(raw))
                self.assertTrue(result['normalization']['changed'])

    def test_missing_separator_and_literal_zero_do_not_invent_second_item(self):
        for raw in ['247','0','13']:
            result = self.read(raw)
            self.assertEqual(result['parts'][0]['value'],int(raw))
            self.assertEqual(result['parts'][0]['status'],'recorded')
            self.assertIsNone(result['parts'][1]['value'])
            self.assertIsNone(result['parts'][1]['digits'])
            self.assertEqual(result['parts'][1]['status'],'not-recorded')

    def test_text_preserves_leading_and_trailing_digit_zeros(self):
        for raw,digits in [('8.0170','0170'),('12.100','100'),('0.0','0'),('002.00300','00300')]:
            result = self.read(raw,text=True)
            self.assertEqual(result['display'],raw)
            self.assertEqual(result['parts'][1]['digits'],digits)
            self.assertEqual(result['parts'][1]['value'],int(digits))
            self.assertEqual(result['parts'][1]['status'],'encoded')
            self.assertEqual(result['normalization']['method'],'text-preserved')

    def test_unsupported_codes_are_not_guessed(self):
        for raw in ['-2.1','1.2.3','ten.5','12.','1e3']:
            result = self.read(raw,text=True)
            self.assertEqual(result['display'],raw)
            self.assertEqual(result['status'],'unparsed')
            self.assertTrue(all(p['value'] is None for p in result['parts']))
        self.assertEqual(self.read('-2.1')['status'],'unparsed')

    def test_precision_change_that_fails_round_trip_is_rejected(self):
        raw = '123456789012345.6'
        result = self.read(raw)
        self.assertEqual(result['status'],'unparsed')
        self.assertEqual(result['display'],raw)
        self.assertEqual(result['normalization']['method'],'numeric-normalization-rejected')
        self.assertTrue(all(p['value'] is None for p in result['parts']))

    def test_blank_has_no_recorded_parts(self):
        result = pipeline.parse_composite(pipeline.blank('军事排名',None),self.PARTS)
        self.assertIsNone(result['display'])
        self.assertEqual(result['status'],'not-recorded')
        self.assertTrue(all(p['status']=='not-recorded' for p in result['parts']))


if __name__=='__main__':
    unittest.main()
