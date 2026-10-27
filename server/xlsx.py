# -*- coding: utf-8 -*-
"""회사 견적서 엑셀 양식에 값만 갈아 끼운다 — 엑셀 없이.

예전에는 PowerShell 로 엑셀을 띄워(COM) 채웠다. 이제는 파일 속 XML 을 고친다.
양식의 서식·테두리·로고·인쇄 설정은 그대로 두고, 항목 줄만 필요한 수만큼 다시 세운다.

양식의 자리 (forms/견적서양식.xlsx, 첫 시트)
  B5  고객사 귀중        B7  ◼ 교육명:        B8  ◼ 제출일 :
  D9  한글 금액          D10 (₩숫자)
  12행 표 머리 / 13~17행 보기 항목 / 18행 제안금액(합계)
  항목 줄: B구분 D항목 E세부 G단가 J수량 L단위 M수량2 O단위2 P차수 R'차수' S금액 U비고
  묶음 합계 줄: D'○○ 합계'(D:R 병합)  S금액

옛 COM 방식에서 고친 것
  · 두 번째 시트('대리 승진자 과정' — 다른 고객사의 예전 견적)가 그대로 붙어 나갔다.
    고객에게 남의 견적이 가면 안 되므로 채운 시트 하나만 남긴다.
  · 합계 줄이 항목 줄 모양으로 찍히던 것을, 양식의 합계 줄 서식으로 세운다.
"""

import re
import xml.etree.ElementTree as ET

from . import ooxml as ox
from .ooxml import q, local

X = ox.NS['x']
FIRST = 13          # 보기 항목이 시작하는 줄
HAVE = 5            # 양식의 보기 항목 줄 수 (13~17)
TPL_ITEM = 16       # 항목 한 줄의 본보기 (한 줄짜리 항목)
TPL_ITEM_FIRST = 13  # 묶음 첫 줄 (왼쪽 구분 칸의 윗 테두리)
TPL_ITEM_NEXT = 14   # 묶음 둘째 줄부터
TPL_SUB = 15        # 묶음 합계 줄

_REF = re.compile(r'^([A-Z]+)(\d+)$')


def xq(tag):
    return '{%s}%s' % (X, tag)


def col_num(s):
    n = 0
    for ch in s:
        n = n * 26 + (ord(ch) - 64)
    return n


def split_ref(ref):
    m = _REF.match(ref)
    return m.group(1), int(m.group(2))


def _clean_sheet_name(name):
    for ch in '\\/?*[]:':
        name = name.replace(ch, ' ')
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:31].strip()


def _shift_refs(text, at, delta):
    """A1 참조 중 at 줄 이상을 delta 만큼 민다. $ 가 붙은 것도."""
    def rep(m):
        col, dol, row = m.group(1), m.group(2), int(m.group(3))
        if row >= at:
            row += delta
        return '%s%s%d' % (col, dol, row)
    return re.sub(r"(\$?[A-Z]{1,3})(\$?)(\d+)(?![\d(])", rep, text)


class Sheet(object):

    def __init__(self, root):
        self.root = root
        self.data = root.find(xq('sheetData'))

    def rows(self):
        return {int(r.get('r')): r for r in self.data.findall(xq('row'))}

    def cell(self, ref, create=True):
        col, rn = split_ref(ref)
        rows = self.rows()
        row = rows.get(rn)
        if row is None:
            if not create:
                return None
            row = ET.Element(xq('row'), {'r': str(rn)})
            # 줄 순서를 지켜 끼운다
            after = [r for r in rows if r < rn]
            idx = 0
            if after:
                idx = list(self.data).index(rows[max(after)]) + 1
            self.data.insert(idx, row)
        for c in row.findall(xq('c')):
            if c.get('r') == ref:
                return c
        if not create:
            return None
        c = ET.Element(xq('c'), {'r': ref})
        cn = col_num(col)
        pos = len(list(row))
        for i, e in enumerate(list(row)):
            if local(e.tag) == 'c' and col_num(split_ref(e.get('r'))[0]) > cn:
                pos = i
                break
        row.insert(pos, c)
        return c


def _set(c, v):
    """칸 하나에 값. 글자는 inline 문자열로, 숫자는 숫자로. 수식은 지운다."""
    for e in list(c):
        c.remove(e)
    c.attrib.pop('t', None)
    if v is None or v == '':
        return
    if isinstance(v, bool):
        v = str(v)
    if isinstance(v, (int, float)):
        c.append(ET.Element(xq('v')))
        c.find(xq('v')).text = str(int(v)) if float(v).is_integer() else repr(float(v))
        return
    c.set('t', 'inlineStr')
    is_ = ET.SubElement(c, xq('is'))
    t = ET.SubElement(is_, xq('t'))
    t.text = str(v)
    if t.text != t.text.strip() or '\n' in t.text:
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def _num(v):
    try:
        f = float(v or 0)
    except (TypeError, ValueError):
        return 0
    return int(f) if f.is_integer() else f


def fill(data, job):
    """견적 값(job)을 받아 채운 xlsx(bytes)를 돌려준다. job 은 옛 relay 와 같은 모양."""
    pkg = ox.Package(data)
    wb_name = 'xl/workbook.xml'
    wb = pkg.xml(wb_name)
    sheets_el = wb.find(xq('sheets'))
    sheet_els = sheets_el.findall(xq('sheet'))
    first = sheet_els[0]
    first_rid = first.get(q('r:id'))
    part = pkg.target(wb_name, first_rid)
    old_name = first.get('name')

    # ── 다른 시트는 떼어 낸다 (예전 고객의 견적이 붙어 나가지 않게) ──
    for s in sheet_els[1:]:
        pkg.drop_rel(wb_name, s.get(q('r:id')))
        sheets_el.remove(s)
    dn = wb.find(xq('definedNames'))
    if dn is not None:
        for d in list(dn):
            lid = d.get('localSheetId')
            if lid is not None and lid != '0':
                dn.remove(d)
        if not len(dn):
            wb.remove(dn)
    bv = wb.find(xq('bookViews'))
    if bv is not None:
        for v in bv:
            v.attrib.pop('activeTab', None)
            v.attrib.pop('firstSheet', None)

    # 계산 사슬은 지우고, 열 때 다시 계산하게 한다 (수식을 값으로 바꾸므로)
    for rid, t, tgt, ext in pkg.rels(wb_name):
        if t == ox.RT['calc']:
            pkg.drop_rel(wb_name, rid)
    cp = wb.find(xq('calcPr'))
    if cp is None:
        cp = ET.Element(xq('calcPr'))
        wb.append(cp)
    cp.set('fullCalcOnLoad', '1')

    sh = Sheet(pkg.xml(part))

    # ── 시트 이름 ──
    new_name = _clean_sheet_name(str(job.get('courseName') or ''))
    if new_name and new_name != old_name:
        first.set('name', new_name)
        if dn is not None and dn in list(wb):
            for d in dn:
                d.text = (d.text or '').replace("'%s'!" % old_name, "'%s'!" % new_name) \
                                       .replace('%s!' % old_name, "'%s'!" % new_name)

    # ── 머리 ──
    _set(sh.cell('B5'), '%s 귀중' % (job.get('to') or ''))
    _set(sh.cell('B7'), '◼ 교육명: %s' % (job.get('courseName') or ''))
    _set(sh.cell('B8'), '◼ 제출일 : %s' % (job.get('issueDate') or ''))
    total = _num(job.get('total'))
    _set(sh.cell('D9'), job.get('hangul') or '')
    _set(sh.cell('D10'), '(\\%s)' % format(int(total), ','))

    # ── 항목 줄 ──
    groups = job.get('groups') or []
    need = sum(len(g.get('lines') or []) + 1 for g in groups) or 1
    delta = need - HAVE
    rows = sh.rows()
    tpl = {k: rows.get(k) for k in (TPL_ITEM, TPL_ITEM_FIRST, TPL_ITEM_NEXT, TPL_SUB)}
    if any(v is None for v in tpl.values()):
        raise ValueError('견적서 양식의 13~17행 모양이 예상과 다릅니다.')
    tpl = {k: ox.clone(v) for k, v in tpl.items()}

    for r in range(FIRST, FIRST + HAVE):
        if r in rows:
            sh.data.remove(rows[r])

    # 아래 줄을 민다
    last_old = FIRST + HAVE          # 18 — 합계 줄
    if delta:
        for row in sh.data.findall(xq('row')):
            rn = int(row.get('r'))
            if rn >= last_old:
                row.set('r', str(rn + delta))
                row.attrib.pop('spans', None)
                for c in row.findall(xq('c')):
                    col, crn = split_ref(c.get('r'))
                    c.set('r', '%s%d' % (col, crn + delta))
                    f = c.find(xq('f'))
                    if f is not None:
                        if f.text:
                            f.text = _shift_refs(f.text, last_old, delta)
                        if f.get('ref'):
                            f.set('ref', _shift_refs(f.get('ref'), last_old, delta))

    # 병합 — 항목 칸의 것은 버리고, 아래 것은 민다
    mcs = sh.root.find(xq('mergeCells'))
    keep = []
    if mcs is not None:
        for m in list(mcs):
            a, b = m.get('ref').split(':')
            ra, rb = split_ref(a)[1], split_ref(b)[1]
            if rb >= FIRST and ra < last_old:
                mcs.remove(m)
                continue
            if ra >= last_old and delta:
                m.set('ref', _shift_refs(m.get('ref'), last_old, delta))
            keep.append(m)
    else:
        mcs = ET.Element(xq('mergeCells'))
        sd = list(sh.root).index(sh.data)
        sh.root.insert(sd + 2, mcs)

    def merge(ref):
        ET.SubElement(mcs, xq('mergeCell'), {'ref': ref})

    # 새 줄을 세운다
    at = list(sh.data).index(sh.rows()[last_old + delta]) if (last_old + delta) in sh.rows() \
        else len(list(sh.data))

    def make_row(rn, model, bc_from=None):
        row = ox.clone(model)
        row.set('r', str(rn))
        row.attrib.pop('spans', None)
        for c in row.findall(xq('c')):
            col, _ = split_ref(c.get('r'))
            c.set('r', '%s%d' % (col, rn))
            for e in list(c):
                c.remove(e)
            c.attrib.pop('t', None)
            if bc_from is not None and col in ('B', 'C'):
                src = [x for x in bc_from.findall(xq('c')) if split_ref(x.get('r'))[0] == col]
                if src and src[0].get('s'):
                    c.set('s', src[0].get('s'))
        sh.data.insert(at + (rn - FIRST), row)
        return row

    r = FIRST
    for g in groups:
        g_start = r
        for i, ln in enumerate(g.get('lines') or []):
            make_row(r, tpl[TPL_ITEM], tpl[TPL_ITEM_FIRST] if r == g_start else tpl[TPL_ITEM_NEXT])
            _set(sh.cell('D%d' % r), ln.get('name') or '')
            _set(sh.cell('E%d' % r), ln.get('detail') or '')
            _set(sh.cell('G%d' % r), _num(ln.get('unit')))
            _set(sh.cell('J%d' % r), _num(ln.get('q1')))
            _set(sh.cell('L%d' % r), ln.get('u1') or '')
            # 안 쓰는 칸은 0 을 찍지 않고 비워 둔다
            if _num(ln.get('q2')) > 0:
                _set(sh.cell('M%d' % r), _num(ln.get('q2')))
                _set(sh.cell('O%d' % r), ln.get('u2') or '')
            if _num(ln.get('sessions')) > 0:
                _set(sh.cell('P%d' % r), _num(ln.get('sessions')))
                _set(sh.cell('R%d' % r), ln.get('su') or '')
            _set(sh.cell('S%d' % r), _num(ln.get('amount')))
            _set(sh.cell('U%d' % r), ln.get('memo') or '')
            for a, b in (('E', 'F'), ('G', 'I'), ('J', 'K'), ('M', 'N'), ('P', 'Q'), ('S', 'T')):
                merge('%s%d:%s%d' % (a, r, b, r))
            r += 1
        make_row(r, tpl[TPL_SUB], tpl[TPL_ITEM_FIRST] if r == g_start else tpl[TPL_ITEM_NEXT])
        _set(sh.cell('D%d' % r), '%s 합계' % (g.get('name') or ''))
        _set(sh.cell('S%d' % r), _num(g.get('sub')))
        merge('D%d:R%d' % (r, r))
        merge('S%d:T%d' % (r, r))
        r += 1
        merge('B%d:C%d' % (g_start, r - 1))
        _set(sh.cell('B%d' % g_start), g.get('name') or '')

    if not groups:
        make_row(r, tpl[TPL_SUB], tpl[TPL_ITEM_FIRST])
        r += 1

    # 합계 줄
    last = r
    _set(sh.cell('P%d' % last), total)
    _set(sh.cell('U%d' % last), 'VAT 면세' if job.get('taxFree', True) else 'VAT 별도')
    mcs.set('count', str(len(list(mcs))))

    # 인쇄 영역 · 차지하는 범위 · 그림 자리도 민다
    if delta:
        if dn is not None and dn in list(wb):
            for d in dn:
                if d.text:
                    d.text = _shift_refs(d.text, last_old, delta)
        dim = sh.root.find(xq('dimension'))
        if dim is not None and dim.get('ref'):
            dim.set('ref', _shift_refs(dim.get('ref'), last_old, delta))
        for tag in ('conditionalFormatting', 'dataValidations', 'hyperlinks', 'rowBreaks'):
            for el in sh.root.iter(xq(tag)):
                for e in el.iter():
                    for k in ('sqref', 'ref'):
                        if e.get(k):
                            e.set(k, _shift_refs(e.get(k), last_old, delta))
        _shift_anchors(sh.root, last_old - 1, delta)
        for rid, t, tgt, ext in pkg.rels(part):
            if t.endswith('/drawing') and not ext and pkg.has(tgt):
                _shift_anchors(pkg.xml(tgt), last_old - 1, delta)

    _fix_app(pkg, new_name or old_name)
    pkg.gc()
    return pkg.save()


def _shift_anchors(root, row0, delta):
    """도형 자리(0부터 세는 줄 번호)를 민다."""
    xdr = ox.NS['xdr']
    for e in root.iter('{%s}row' % xdr):
        try:
            v = int(e.text)
        except (TypeError, ValueError):
            continue
        if v >= row0:
            e.text = str(v + delta)


def _fix_app(pkg, sheet_name):
    """docProps/app.xml 의 시트 목록 — 없앤 시트 이름이 남지 않게."""
    name = 'docProps/app.xml'
    if not pkg.has(name):
        return
    root = pkg.xml(name)
    ep, vt = ox.NS['ep'], ox.NS['vt']
    hp = root.find('{%s}HeadingPairs' % ep)
    tp = root.find('{%s}TitlesOfParts' % ep)
    if hp is not None:
        root.remove(hp)
    if tp is not None:
        root.remove(tp)
    hp = ET.Element('{%s}HeadingPairs' % ep)
    vec = ET.SubElement(hp, '{%s}vector' % vt, {'size': '2', 'baseType': 'variant'})
    v1 = ET.SubElement(vec, '{%s}variant' % vt)
    ET.SubElement(v1, '{%s}lpstr' % vt).text = '워크시트'
    v2 = ET.SubElement(vec, '{%s}variant' % vt)
    ET.SubElement(v2, '{%s}i4' % vt).text = '1'
    tp = ET.Element('{%s}TitlesOfParts' % ep)
    vec2 = ET.SubElement(tp, '{%s}vector' % vt, {'size': '1', 'baseType': 'lpstr'})
    ET.SubElement(vec2, '{%s}lpstr' % vt).text = sheet_name
    # 순서: DocSecurity · ScaleCrop 다음
    idx = 0
    for i, c in enumerate(list(root)):
        if local(c.tag) in ('Application', 'DocSecurity', 'ScaleCrop'):
            idx = i + 1
    root.insert(idx, hp)
    root.insert(idx + 1, tp)
