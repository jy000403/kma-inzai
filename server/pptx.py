# -*- coding: utf-8 -*-
"""파워포인트 없이 .pptx 를 읽고 채운다.

예전에는 PowerShell 로 파워포인트를 띄워(COM) 이 일을 했다. 그래서 윈도우 PC 에서
실행하기.bat 으로 켠 서버에서만 됐고, 배포한 웹(리눅스)에서는 아예 안 됐다.
이제는 파일 속 XML 을 직접 고친다. 같은 결과를 내도록 옛 COM 코드의 규칙을
하나하나 옮겨 왔다 (글꼴 지키기 · 넘치면 줄이기 · 표 늘리고 줄이기 · 사진 자르기).

  scan(data)          장마다 제목 · 글상자 · 표 · 그림 자리를 읽는다   (옛 PPT_SCAN)
  fill(data, job)     계획대로 채운 새 파일과 검수 결과를 돌려준다      (옛 PPT_FILL)
  audit(data, was)    글이 넘치거나 비었는지 잰다                      (옛 PPT_AUDIT)

단위: 파일 속은 EMU(1pt = 12700), 밖으로 내보내는 값은 pt 다(COM 과 같게).
"""

import collections
import re
import xml.etree.ElementTree as ET

from . import ooxml as ox
from .ooxml import q, local

EMU = 12700.0          # 1pt
SLIDE_CT = ox.CT_SLIDE


def pt(v):
    return float(v or 0) / EMU


# ── 글자 폭 · 줄 높이 어림 ──────────────────────────────────
#
# 파워포인트가 없으니 '글이 상자에 들어가는가' 를 직접 재야 한다.
# 페이퍼로지 한글은 한 글자가 글자 크기만큼 넓다. 영문·숫자는 절반 남짓.
# 값은 실제 파워포인트에서 잰 BoundHeight 에 맞춰 두었다(시험 도구로 맞춤).

# 파워포인트로 연 566개 글상자의 실측(줄 수·BoundHeight)에 맞춘 값이다.
#   줄 수가 그대로 맞는 비율 97% · 덜 세는 경우(=넘침을 놓치는 경우)는
#   페이퍼로지가 아닌 글꼴(이사만루체 등)로 된 손대지 않은 상자뿐이었다.
K_CJK = 0.92           # 한글·한자 한 글자 폭 (글자 크기 대비)
K_LINE = 1.20          # 한 줄 높이 (줄 간격 100% 일 때, 글자 크기 대비)

_NARROW = set("iljtfrI.,:;|!'`()[]{}\"")
_WIDE = set('mwMW@%&')


def is_cjk(o):
    return (0xAC00 <= o <= 0xD7A3 or 0x1100 <= o <= 0x11FF or 0x3130 <= o <= 0x318F
            or 0x4E00 <= o <= 0x9FFF or 0x3000 <= o <= 0x303F or 0xFF00 <= o <= 0xFFEF
            or 0x2460 <= o <= 0x27BF or 0x25A0 <= o <= 0x25FF or 0x2190 <= o <= 0x21FF
            or o in (0x203B,))


def char_w(ch, sz):
    o = ord(ch)
    if is_cjk(o):
        return sz * K_CJK
    if ch == ' ':
        return sz * 0.28
    if ch == '\t':
        return sz * 1.2
    if ch in _NARROW:
        return sz * 0.30
    if ch in _WIDE:
        return sz * 0.85
    if ch == '·' or ch == '•':
        return sz * 0.36
    if ch.isupper():
        return sz * 0.64
    if ch.isdigit():
        return sz * 0.56
    if ch.isalpha():
        return sz * 0.53
    return sz * 0.45


def text_w(s, sz, spc=0.0):
    return sum(char_w(c, sz) + spc for c in s)


def wrap_lines(s, sz, width, anywhere=True, spc=0.0):
    """한 문단을 폭에 맞춰 몇 줄로 접히는지. anywhere=True 면 글자 어디서든 끊긴다
    (양식이 '한글 단어 잘림 허용'·latinLnBrk=1 인 경우), 아니면 띄어쓰기에서 끊는다."""
    if width <= 1:
        return 1
    if not s:
        return 1
    if anywhere:
        lines, cur = 1, 0.0
        for c in s:
            w = char_w(c, sz) + spc
            if cur + w > width and cur > 0 and c != ' ':
                lines += 1
                cur = w
            else:
                cur += w
        return lines
    words = re.findall(r'\S+|\s+', s)
    lines, cur = 1, 0.0
    for wd in words:
        w = text_w(wd, sz, spc)
        if wd.isspace():
            cur += w
            continue
        if cur + w <= width or cur == 0:
            if w > width:          # 한 낱말이 한 줄보다 길면 글자 단위로 접힌다
                extra = wrap_lines(wd, sz, width, True, spc) - 1
                lines += extra
                cur = w - extra * width
            else:
                cur += w
        else:
            lines += 1
            cur = w
    return lines


# ── 도형 ────────────────────────────────────────────────

# ── 도형 이름 ────────────────────────────────────────────
#
# 파일에는 '직사각형 27', '표 13' 처럼 한글 기본 이름이 적혀 있는데,
# 파워포인트(COM)는 같은 도형을 'Rectangle 27', 'Table 13' 이라고 부른다.
# 브라우저에 저장된 양식 정보는 전부 COM 이 읽은 이름이라, 파일 이름 그대로 쓰면
# 채울 자리를 하나도 못 찾는다. COM 이 부르던 이름으로 맞춘다.
# 사람이 직접 붙인 이름('학습 1' 같은)은 건드리지 않는다 — 기본 이름 꼴일 때만.

_KO_DEFAULT = re.compile(
    r'^(직사각형|사각형|모서리가 둥근|타원|표|그룹|그림|텍스트 상자|개체 틀|'
    r'제목|부제목|내용 개체|텍스트 개체|날짜 개체|바닥글 개체|슬라이드 번호|'
    r'연결선|직선|화살표|자유형|순서도|삼각형|이등변|직각 삼각형|오각형|육각형|팔각형|'
    r'다이아몬드|평행 사변형|사다리꼴|도넛|십자형|별|원형|갈매기형|설명선|선|개체|'
    r'그래픽|차트|다이어그램|SmartArt)')

_PRST_EN = {
    'rect': 'Rectangle', 'roundRect': 'Rounded Rectangle', 'ellipse': 'Oval',
    'round1Rect': 'Round Single Corner Rectangle',
    'round2SameRect': 'Round Same Side Corner Rectangle',
    'round2DiagRect': 'Round Diagonal Corner Rectangle',
    'snip1Rect': 'Snip Single Corner Rectangle', 'snip2SameRect': 'Snip Same Side Corner Rectangle',
    'snip2DiagRect': 'Snip Diagonal Corner Rectangle', 'snipRoundRect': 'Snip and Round Single Corner Rectangle',
    'triangle': 'Isosceles Triangle', 'rtTriangle': 'Right Triangle',
    'parallelogram': 'Parallelogram', 'trapezoid': 'Trapezoid', 'diamond': 'Diamond',
    'homePlate': 'Pentagon', 'pentagon': 'Regular Pentagon', 'chevron': 'Chevron',
    'hexagon': 'Hexagon', 'octagon': 'Octagon', 'plus': 'Cross', 'donut': 'Donut',
    'rightArrow': 'Right Arrow', 'leftArrow': 'Left Arrow', 'upArrow': 'Up Arrow',
    'downArrow': 'Down Arrow', 'star5': '5-Point Star', 'line': 'Straight Connector',
    'flowChartProcess': 'Flowchart: Process', 'wedgeRectCallout': 'Rectangular Callout',
    'wedgeRoundRectCallout': 'Rounded Rectangular Callout', 'pie': 'Pie', 'arc': 'Arc',
    'blockArc': 'Block Arc', 'frame': 'Frame', 'can': 'Can', 'cube': 'Cube',
}

_PH_EN = {
    'title': 'Title', 'ctrTitle': 'Title', 'subTitle': 'Subtitle', 'body': 'Text Placeholder',
    'obj': 'Content Placeholder', 'dt': 'Date Placeholder', 'ftr': 'Footer Placeholder',
    'sldNum': 'Slide Number Placeholder', 'pic': 'Picture Placeholder',
    'tbl': 'Table Placeholder', 'chart': 'Chart Placeholder',
}


def com_name(el, raw):
    m = re.match(r'^(.*?)\s*(\d+)$', raw or '')
    if not m or not re.search('[가-힣]', m.group(1)) or not _KO_DEFAULT.match(m.group(1)):
        return raw
    n = m.group(2)
    # 파워포인트는 '번호 = 도형 id - 1' 일 때만 제가 붙인 기본 이름으로 본다.
    # (양식 16장의 '사각형: 둥근 모서리 70' 은 id 가 25 라 COM 도 한글 그대로 불렀다)
    nv = nv_of(el)
    c = nv.find(q('p:cNvPr')) if nv is not None else None
    try:
        if c is None or int(c.get('id', -1)) - 1 != int(n):
            return raw
    except ValueError:
        return raw
    t = local(el.tag)
    ph = ph_of(el)
    if ph is not None:
        return '%s %s' % (_PH_EN.get(ph[0], 'Content Placeholder'), n)
    if t == 'grpSp':
        return 'Group %s' % n
    if t == 'pic':
        return 'Picture %s' % n
    if t == 'graphicFrame':
        if el.find('.//' + q('a:tbl')) is not None:
            return 'Table %s' % n
        return 'Object %s' % n
    if t == 'cxnSp':
        return 'Straight Connector %s' % n
    nv = el.find(q('p:nvSpPr'))
    c = nv.find(q('p:cNvSpPr')) if nv is not None else None
    if c is not None and c.get('txBox') == '1':
        return 'TextBox %s' % n
    sp = el.find(q('p:spPr'))
    if sp is not None:
        g = sp.find(q('a:prstGeom'))
        if g is not None:
            return '%s %s' % (_PRST_EN.get(g.get('prst'), 'Rectangle'), n)
        if sp.find(q('a:custGeom')) is not None:
            return 'Freeform %s' % n
    return raw


def is_photo(el):
    """COM 의 '그림'(msoPicture)만. SVG 아이콘(msoGraphic)·동영상은 사진 자리가 아니다.
    이걸 가리지 않으면 교육사진이 양식의 아이콘 자리에 들어간다."""
    if local(el.tag) != 'pic' or ph_of(el) is not None:
        return False
    nv = el.find(q('p:nvPicPr'))
    if nv is not None:
        nvpr = nv.find(q('p:nvPr'))
        if nvpr is not None:
            for c in nvpr:
                if local(c.tag) in ('videoFile', 'audioFile', 'quickTimeFile'):
                    return False
            if nvpr.find('.//' + q('p14:media')) is not None:
                return False
    bf = el.find(q('p:blipFill'))
    blip = bf.find(q('a:blip')) if bf is not None else None
    if blip is not None:
        for e in blip.iter():
            if local(e.tag) == 'svgBlip':
                return False
    return True


class Shape(object):
    """슬라이드 위 도형 하나. x·y·w·h 는 슬라이드 좌표(EMU).
    name 은 파워포인트(COM)가 부르던 이름, raw 는 파일에 적힌 이름."""

    __slots__ = ('el', 'kind', 'name', 'raw', 'x', 'y', 'w', 'h', 'grouped', 'top_level', 'ph')

    def __init__(self, el, kind, x, y, w, h, grouped=False):
        self.el = el
        self.kind = kind
        nv = nv_of(el)
        c = nv.find(q('p:cNvPr')) if nv is not None else None
        self.raw = c.get('name', '') if c is not None else ''
        self.name = com_name(el, self.raw)
        self.x, self.y, self.w, self.h = x, y, w, h
        self.grouped = grouped
        self.top_level = not grouped
        self.ph = ph_of(el)

    def txbody(self):
        return self.el.find(q('p:txBody'))

    def text(self):
        return body_text(self.txbody())


def nv_of(el):
    for tag in ('p:nvSpPr', 'p:nvGrpSpPr', 'p:nvGraphicFramePr', 'p:nvPicPr', 'p:nvCxnSpPr'):
        n = el.find(q(tag))
        if n is not None:
            return n
    return None


def ph_of(el):
    nv = nv_of(el)
    if nv is None:
        return None
    nvpr = nv.find(q('p:nvPr'))
    if nvpr is None:
        return None
    ph = nvpr.find(q('p:ph'))
    if ph is None:
        return None
    return (ph.get('type') or 'body', ph.get('idx') or '0')


def xfrm_of(el):
    """(x, y, w, h) 또는 None"""
    if local(el.tag) == 'graphicFrame':
        x = el.find(q('p:xfrm'))
    elif local(el.tag) == 'grpSp':
        g = el.find(q('p:grpSpPr'))
        x = g.find(q('a:xfrm')) if g is not None else None
    else:
        sp = el.find(q('p:spPr'))
        x = sp.find(q('a:xfrm')) if sp is not None else None
    if x is None:
        return None
    off, ext = x.find(q('a:off')), x.find(q('a:ext'))
    if off is None or ext is None:
        return None
    return (int(off.get('x', 0)), int(off.get('y', 0)),
            int(ext.get('cx', 0)), int(ext.get('cy', 0)))


def body_text(tb, br='\n'):
    if tb is None:
        return ''
    paras = []
    for p in tb.findall(q('a:p')):
        s = []
        for c in p:
            t = local(c.tag)
            if t in ('r', 'fld'):
                tt = c.find(q('a:t'))
                s.append(tt.text or '' if tt is not None else '')
            elif t == 'br':
                s.append(br)
        paras.append(''.join(s))
    return '\n'.join(paras)


# ── 프레젠테이션 ─────────────────────────────────────────

class Deck(object):

    def __init__(self, data):
        self.pkg = ox.Package(data)
        self.pres = 'ppt/presentation.xml'
        root = self.pkg.xml(self.pres)
        sz = root.find(q('p:sldSz'))
        self.cx = int(sz.get('cx', 9144000)) if sz is not None else 9144000
        self.cy = int(sz.get('cy', 6858000)) if sz is not None else 6858000
        self._layout_cache = {}
        self.fam = ''          # 이 양식의 글꼴 집안(예: 페이퍼로지)
        self.body_font = ''
        self.bold_font = ''

    # 장 목록
    def slide_parts(self):
        root = self.pkg.xml(self.pres)
        lst = root.find(q('p:sldIdLst'))
        out = []
        if lst is None:
            return out
        for s in lst.findall(q('p:sldId')):
            rid = s.get(q('r:id'))
            tgt = self.pkg.target(self.pres, rid)
            if tgt:
                out.append(tgt)
        return out

    def slide_count(self):
        return len(self.slide_parts())

    def slide(self, no):
        """1부터 세는 번호 → 부품 이름"""
        parts = self.slide_parts()
        if no < 1 or no > len(parts):
            raise IndexError('%d번 장이 없습니다 (전체 %d장)' % (no, len(parts)))
        return parts[no - 1]

    def tree(self, part):
        return self.pkg.xml(part).find(q('p:cSld')).find(q('p:spTree'))

    # 도형 훑기
    def shapes(self, part, deep=True):
        """슬라이드의 도형을 차례대로. deep 이면 그룹 안쪽도 (grouped=True 로)."""
        out = []
        self._walk(self.tree(part), out, None, deep, False, part)
        return out

    def _walk(self, parent, out, tf, deep, grouped, part):
        for el in parent:
            t = local(el.tag)
            if t not in ('sp', 'grpSp', 'graphicFrame', 'pic', 'cxnSp'):
                if t == 'AlternateContent':
                    ch = el.find(q('mc:Choice'))
                    if ch is None:
                        ch = el.find(q('mc:Fallback'))
                    if ch is not None:
                        self._walk(ch, out, tf, deep, grouped, part)
                continue
            box = xfrm_of(el)
            if box is None and t == 'sp':
                box = self.ph_box(part, ph_of(el))
            box = box or (0, 0, 0, 0)
            x, y, w, h = self._apply(tf, box)
            kind = {'sp': 'sp', 'grpSp': 'grp', 'pic': 'pic', 'cxnSp': 'cxn'}.get(t, 'frame')
            if t == 'graphicFrame' and el.find('.//' + q('a:tbl')) is not None:
                kind = 'tbl'
            s = Shape(el, kind, x, y, w, h, grouped)
            out.append(s)
            if t == 'grpSp' and deep:
                self._walk(el, out, self._group_tf(el, tf), deep, True, part)

    @staticmethod
    def _apply(tf, box):
        x, y, w, h = box
        if not tf:
            return x, y, w, h
        ox_, oy, sx, sy, cx0, cy0 = tf
        return (ox_ + (x - cx0) * sx, oy + (y - cy0) * sy, w * sx, h * sy)

    def _group_tf(self, grp, parent_tf):
        g = grp.find(q('p:grpSpPr'))
        x = g.find(q('a:xfrm')) if g is not None else None
        if x is None:
            return parent_tf
        off, ext = x.find(q('a:off')), x.find(q('a:ext'))
        choff, chext = x.find(q('a:chOff')), x.find(q('a:chExt'))
        if None in (off, ext, choff, chext):
            return parent_tf
        gx, gy = int(off.get('x')), int(off.get('y'))
        gw, gh = int(ext.get('cx')), int(ext.get('cy'))
        cx0, cy0 = int(choff.get('x')), int(choff.get('y'))
        cw, ch = int(chext.get('cx')) or 1, int(chext.get('cy')) or 1
        # 부모 그룹 좌표계로 먼저 옮긴다
        gx, gy, gw, gh = self._apply(parent_tf, (gx, gy, gw, gh))
        return (gx, gy, gw / float(cw), gh / float(ch), cx0, cy0)

    # 자리표시자 — 위치·글꼴을 레이아웃·마스터에서 물려받는다
    def layout_of(self, part):
        for rid, t, tgt, ext in self.pkg.rels(part):
            if t == ox.RT['layout']:
                return tgt
        return None

    def master_of(self, layout):
        for rid, t, tgt, ext in self.pkg.rels(layout):
            if t == ox.RT['master']:
                return tgt
        return None

    def _find_ph(self, part, ph):
        if not part or ph is None:
            return None
        typ, idx = ph
        title = typ in ('title', 'ctrTitle')
        best = None
        for el in self.tree(part).iter():
            if local(el.tag) != 'sp':
                continue
            p2 = ph_of(el)
            if p2 is None:
                continue
            t2, i2 = p2
            if idx != '0' and i2 == idx:
                return el
            if title and t2 in ('title', 'ctrTitle'):
                best = best or el
            elif t2 == typ and best is None:
                best = el
        return best

    def ph_chain(self, part, ph):
        """[레이아웃 자리표시자, 마스터 자리표시자] (있는 것만)"""
        out = []
        lay = self.layout_of(part)
        if lay:
            e = self._find_ph(lay, ph)
            if e is not None:
                out.append(e)
            mas = self.master_of(lay)
            if mas:
                e2 = self._find_ph(mas, ph if ph[0] not in ('obj', 'tbl', 'pic') else ('body', '0'))
                if e2 is not None:
                    out.append(e2)
        return out

    def ph_box(self, part, ph):
        if ph is None:
            return None
        for e in self.ph_chain(part, ph):
            b = xfrm_of(e)
            if b:
                return b
        return None

    def layout_name(self, part):
        lay = self.layout_of(part)
        if not lay:
            return ''
        c = self.pkg.xml(lay).find(q('p:cSld'))
        return c.get('name', '') if c is not None else ''

    # 글꼴 크기 — 첫 글자의 실제 크기 (hundredths → pt)
    def first_size(self, part, shape_el, tb=None):
        tb = tb if tb is not None else shape_el.find(q('p:txBody'))
        if tb is not None:
            # 글자가 있는 조각을 먼저 본다 — 빈 문단 끝 표시(endParaRPr)의 크기는
            # 화면에 안 보이는 크기라 COM 이 알려 주던 값과 달랐다.
            for tag in ('rPr', 'endParaRPr'):
                for r in tb.iter(q('a:' + tag)):
                    if r.get('sz'):
                        return int(r.get('sz')) / 100.0
            ls = tb.find(q('a:lstStyle'))
            v = _lst_sz(ls)
            if v:
                return v
        ph = ph_of(shape_el) if shape_el is not None else None
        if ph is not None and part:
            for e in self.ph_chain(part, ph):
                v = _lst_sz(e.find(q('p:txBody')).find(q('a:lstStyle'))
                            if e.find(q('p:txBody')) is not None else None)
                if v:
                    return v
            lay = self.layout_of(part)
            mas = self.master_of(lay) if lay else None
            if mas:
                ts = self.pkg.xml(mas).find(q('p:txStyles'))
                if ts is not None:
                    key = 'p:titleStyle' if ph[0] in ('title', 'ctrTitle') else (
                        'p:bodyStyle' if ph[0] in ('body', 'obj', 'subTitle') else 'p:otherStyle')
                    v = _lst_sz(ts.find(q(key)))
                    if v:
                        return v
        dts = self.pkg.xml(self.pres).find(q('p:defaultTextStyle'))
        return _lst_sz(dts) or 18.0


def _lst_sz(ls):
    if ls is None:
        return 0
    l1 = ls.find(q('a:lvl1pPr'))
    if l1 is None:
        return 0
    d = l1.find(q('a:defRPr'))
    if d is not None and d.get('sz'):
        return int(d.get('sz')) / 100.0
    return 0


# ── 읽기 (scan) ─────────────────────────────────────────

def _is_titleish(flat):
    return len(flat) >= 3 and not re.fullmatch(r'[\d.\s]+', flat)


def _title_box(d, part, boxes):
    """자리표시자 제목이 없는 장에서 제목 상자를 고른다 — 위쪽 절반에서 **글씨가 가장 큰** 것.
    예전에는 가장 위(y 최소)나 가장 넓은 것을 골랐다. 결과보고서 '정성 피드백 종합' 장에서
    가장 위는 '03' 번호 딱지, 가장 넓은 것은 '② 개선이 필요한 부분' 띠여서,
    제목이 번호 딱지에 흰 글씨로 들어가 장 밖으로 삐져나갔다."""
    best, key = None, None
    for s in boxes:
        if not s.top_level or s.y >= d.cy / 2.0:
            continue
        flat = re.sub(r'\s+', ' ', body_text(s.txbody())).strip()
        if not _is_titleish(flat) or len(flat) > 40 or re.fullmatch(r'(?i)sample', flat):
            continue
        k = (round(d.first_size(part, s.el)), s.w)
        if key is None or k > key:
            best, key = s, k
    return best


def scan(data):
    """옛 PPT_SCAN 과 같은 모양의 dict 를 돌려준다."""
    d = Deck(data)
    out = []
    half = d.cy / 2.0
    for no, part in enumerate(d.slide_parts(), 1):
        slots, tables, texts = [], [], []
        pics = 0
        title = ''
        top, top_y, wide, wide_w = None, 1e18, None, 0
        for s in d.shapes(part, deep=True):
            if s.kind == 'pic' and s.top_level and is_photo(s.el):
                pics += 1
            if s.kind == 'tbl' and s.top_level:
                tables.append(_scan_table(s))
                continue
            if s.kind == 'grp':
                continue
            if s.kind not in ('sp',):
                continue
            tb = s.txbody()
            txt = body_text(tb)
            if not txt.strip():
                continue
            if s.ph is not None and s.ph[0] in ('title', 'ctrTitle') and s.top_level and not title:
                title = txt.replace('\n', ' ').strip()
            texts.append(re.sub(r'\n+', ' / ', txt))
            paras = len(tb.findall(q('a:p'))) if tb is not None else 0
            size = d.first_size(part, s.el)
            keep = txt[:600]
            slot = {
                'name': s.name, 'text': keep, 'chars': len(txt),
                'lines': paras,
                'perLine': int(len(txt) / paras) if paras else len(txt),
                'font': int(round(size)),
                'width': int(round(pt(s.w))), 'height': int(round(pt(s.h))),
                'top': int(round(pt(s.y))), 'left': int(round(pt(s.x))),
            }
            if s.grouped:
                slot['grouped'] = True
            slots.append(slot)
            if s.top_level:
                flat = re.sub(r'\s+', ' ', txt).strip()
                if _is_titleish(flat):
                    if s.y < top_y:
                        top_y, top = s.y, flat
                    if s.y < half and s.w > wide_w:
                        wide_w, wide = s.w, flat
        if not title and wide:
            title = wide
        if not title and top:
            title = top
        out.append({'no': no, 'title': title, 'layout': d.layout_name(part),
                    'texts': texts, 'slots': slots, 'tables': tables, 'pics': pics})
    return {'ok': True, 'count': len(out),
            'width': int(round(pt(d.cx))), 'height': int(round(pt(d.cy))),
            'slides': out}


def _scan_table(s):
    tbl = Table(s.el)
    heads = [re.sub(r'[\r\n]+', ' ', tbl.text(1, c)).strip() for c in range(1, tbl.cols + 1)]
    cell_len = []
    for c in range(1, tbl.cols + 1):
        tot = cnt = 0
        for r in range(2, tbl.rows + 1):
            tot += len(tbl.text(r, c).replace('\n', '\r'))
            cnt += 1
        cell_len.append(int(tot / cnt) if cnt else 0)
    grid = []
    for r in range(1, min(20, tbl.rows) + 1):
        row = []
        for c in range(1, min(10, tbl.cols) + 1):
            v = re.sub(r'\s+', ' ', tbl.text(r, c)).strip()[:60]
            row.append(v)
        grid.append(row)
    return {'name': s.name, 'cells': grid, 'headers': heads,
            'rows': tbl.rows, 'cols': tbl.cols, 'cellLen': cell_len,
            'width': int(round(pt(s.w))), 'height': int(round(pt(s.h))),
            'top': int(round(pt(s.y))), 'left': int(round(pt(s.x)))}


# ── 표 ────────────────────────────────────────────────

class Table(object):
    """DrawingML 표. 파워포인트 COM 처럼 (행, 열) 을 1부터 센다.
    병합된 칸의 이어진 자리(hMerge/vMerge)를 짚으면 병합의 첫 칸으로 간다."""

    def __init__(self, frame):
        self.frame = frame
        self.tbl = frame.find('.//' + q('a:tbl'))
        self.grid = self.tbl.find(q('a:tblGrid'))

    @property
    def trs(self):
        return self.tbl.findall(q('a:tr'))

    @property
    def rows(self):
        return len(self.trs)

    @property
    def cols(self):
        return len(self.grid.findall(q('a:gridCol')))

    def col_w(self):
        return [int(g.get('w', 0)) for g in self.grid.findall(q('a:gridCol'))]

    def raw(self, r, c):
        trs = self.trs
        if r < 1 or r > len(trs):
            return None
        tcs = trs[r - 1].findall(q('a:tc'))
        if c < 1 or c > len(tcs):
            return None
        return tcs[c - 1]

    def origin(self, r, c):
        """병합의 첫 칸 (행, 열)"""
        tc = self.raw(r, c)
        while tc is not None and tc.get('hMerge') == '1' and c > 1:
            c -= 1
            tc = self.raw(r, c)
        while tc is not None and tc.get('vMerge') == '1' and r > 1:
            r -= 1
            tc = self.raw(r, c)
            while tc is not None and tc.get('hMerge') == '1' and c > 1:
                c -= 1
                tc = self.raw(r, c)
        return r, c

    def cell(self, r, c):
        rr, cc = self.origin(r, c)
        return self.raw(rr, cc)

    def text(self, r, c):
        tc = self.cell(r, c)
        if tc is None:
            return ''
        return body_text(tc.find(q('a:txBody')))

    def frame_box(self):
        return xfrm_of(self.frame)

    def set_frame(self, x=None, y=None, w=None, h=None):
        xf = self.frame.find(q('p:xfrm'))
        off, ext = xf.find(q('a:off')), xf.find(q('a:ext'))
        if x is not None:
            off.set('x', str(int(x)))
        if y is not None:
            off.set('y', str(int(y)))
        if w is not None:
            ext.set('cx', str(int(w)))
        if h is not None:
            ext.set('cy', str(int(h)))

    def sync_frame(self):
        """행 높이·열 너비 합으로 틀 크기를 맞춘다"""
        self.set_frame(w=sum(self.col_w()),
                       h=sum(int(tr.get('h', 0)) for tr in self.trs))

    # 병합 다시 세기
    def respan(self):
        trs = self.trs
        n = self.cols
        # 세로
        for c in range(n):
            r = 0
            while r < len(trs):
                tcs = trs[r].findall(q('a:tc'))
                if c >= len(tcs):
                    r += 1
                    continue
                tc = tcs[c]
                if tc.get('vMerge') == '1':
                    r += 1
                    continue
                span = 1
                while r + span < len(trs):
                    nx = trs[r + span].findall(q('a:tc'))
                    if c < len(nx) and nx[c].get('vMerge') == '1':
                        span += 1
                    else:
                        break
                if span > 1:
                    tc.set('rowSpan', str(span))
                elif 'rowSpan' in tc.attrib:
                    del tc.attrib['rowSpan']
                r += span
        # 가로
        for tr in trs:
            tcs = tr.findall(q('a:tc'))
            c = 0
            while c < len(tcs):
                tc = tcs[c]
                if tc.get('hMerge') == '1':
                    c += 1
                    continue
                span = 1
                while c + span < len(tcs) and tcs[c + span].get('hMerge') == '1':
                    span += 1
                if span > 1:
                    tc.set('gridSpan', str(span))
                elif 'gridSpan' in tc.attrib:
                    del tc.attrib['gridSpan']
                c += span

    # 행 넣기 · 빼기
    def add_rows(self, n, before=-1):
        trs = self.trs
        if not trs or n <= 0:
            return
        at = len(trs) if before is None or before < 1 or before > len(trs) else before - 1
        model = trs[at - 1] if at >= 1 else trs[0]
        idx = list(self.tbl).index(trs[at]) if at < len(trs) else len(list(self.tbl))
        for i in range(n):
            tr = ox.clone(model)
            for tc in tr.findall(q('a:tc')):
                _clear_cell(tc)
                if tc.get('rowSpan') and int(tc.get('rowSpan')) > 1:
                    del tc.attrib['rowSpan']
                    tc.set('vMerge', '1')
            self.tbl.insert(idx + i, tr)
        self.respan()

    def drop_rows(self, rows):
        for r in sorted({int(x) for x in rows}, reverse=True):
            trs = self.trs
            if r < 1 or r > len(trs):
                continue
            tr = trs[r - 1]
            nxt = trs[r] if r < len(trs) else None
            if nxt is not None:
                a, b = tr.findall(q('a:tc')), nxt.findall(q('a:tc'))
                for c, tc in enumerate(a):
                    if c < len(b) and tc.get('vMerge') != '1' and b[c].get('vMerge') == '1':
                        # 병합의 첫 칸을 지우면 그 아래 칸이 첫 칸이 된다 — 글도 옮긴다
                        _move_body(tc, b[c])
                        del b[c].attrib['vMerge']
            self.tbl.remove(tr)
        self.respan()

    def add_cols(self, n, before=-1):
        cols = self.grid.findall(q('a:gridCol'))
        if not cols or n <= 0:
            return
        at = len(cols) if before is None or before < 1 or before > len(cols) else before - 1
        src = at - 1 if at >= 1 else 0
        for i in range(n):
            g = ox.clone(cols[src])
            _strip_ext(g)
            self.grid.insert(at + i, g)
            for tr in self.trs:
                tcs = tr.findall(q('a:tc'))
                if not tcs:
                    continue
                base = tcs[min(src, len(tcs) - 1)]
                tc = ox.clone(base)
                _clear_cell(tc)
                for k in ('gridSpan', 'hMerge'):
                    tc.attrib.pop(k, None)
                pos = list(tr).index(tcs[at]) if at < len(tcs) else list(tr).index(tcs[-1]) + 1
                tr.insert(pos + i, tc)
        self.respan()

    def drop_cols(self, cols):
        for c in sorted({int(x) for x in cols}, reverse=True):
            gcs = self.grid.findall(q('a:gridCol'))
            if c < 1 or c > len(gcs):
                continue
            for tr in self.trs:
                tcs = tr.findall(q('a:tc'))
                if c > len(tcs):
                    continue
                tc = tcs[c - 1]
                nx = tcs[c] if c < len(tcs) else None
                if nx is not None and tc.get('hMerge') != '1' and nx.get('hMerge') == '1':
                    _move_body(tc, nx)
                    del nx.attrib['hMerge']
                tr.remove(tc)
            self.grid.remove(gcs[c - 1])
        self.respan()

    def set_widths(self, widths):
        for g, w in zip(self.grid.findall(q('a:gridCol')), widths):
            g.set('w', str(int(round(w))))

    def set_heights(self, heights):
        for tr, h in zip(self.trs, heights):
            tr.set('h', str(int(round(h))))


def _strip_ext(el):
    for e in list(el):
        if local(e.tag) == 'extLst':
            el.remove(e)


def _clear_cell(tc):
    tb = tc.find(q('a:txBody'))
    if tb is None:
        return
    ps = tb.findall(q('a:p'))
    keep_rpr = None
    for p in ps:
        for r in p:
            if local(r.tag) == 'r' and r.find(q('a:rPr')) is not None:
                keep_rpr = r.find(q('a:rPr'))
                break
        if keep_rpr is not None:
            break
    first = ps[0] if ps else None
    for p in ps[1:]:
        tb.remove(p)
    if first is None:
        first = ox.sub(tb, 'a:p')
    for ch in list(first):
        if local(ch.tag) in ('r', 'br', 'fld'):
            first.remove(ch)
    end = first.find(q('a:endParaRPr'))
    if end is None and keep_rpr is not None:
        end = ET.Element(q('a:endParaRPr'), dict(keep_rpr.attrib))
        for k in list(keep_rpr):
            end.append(ox.clone(k))
        first.append(end)


def _move_body(src_tc, dst_tc):
    a = src_tc.find(q('a:txBody'))
    b = dst_tc.find(q('a:txBody'))
    if a is None:
        return
    if b is not None:
        dst_tc.remove(b)
    dst_tc.insert(0, ox.clone(a))


# ── 글 넣기 ────────────────────────────────────────────
#
# 옛 Set-BoxText 의 규칙을 그대로 옮겼다.
#   · 첫 글자의 서식으로 새 글을 입힌다(파워포인트가 Text 를 넣을 때 그렇게 한다)
#   · 한글 글꼴(ea)까지 챙긴다 — 이걸 빠뜨리면 한글만 다른 글씨체로 떨어진다
#   · 양식 자리표시자에 섞여 있던 엉뚱한 글꼴(궁서·HY엽서L·맑은 고딕…)은
#     이 제안서의 글꼴 집안(페이퍼로지)으로 바꾼다
#   · 넘치면 글자를 0.5pt 씩 줄인다. 상자 크기는 건드리지 않는다
# 하나 나아진 점 — 양식의 문단 모양을 줄 모양에 맞춰 골라 입힌다.
# '1) 소주제' 줄과 '· 내용' 줄의 서식이 다른 양식이 있는데, 첫 줄 서식으로
# 통째로 칠하면 소주제와 내용이 똑같이 보였다.

_KINDS = (
    ('head', re.compile(r'^\s*[▶▷►]')),
    ('num', re.compile(r'^\s*(\d+[).]|[①-⑳]|[A-Z]\d*[.)])\s*')),
    ('bullet', re.compile(r'^\s*[·•\-■◼▪※○●◆◇]')),
)


def line_kind(s):
    for k, rx in _KINDS:
        if rx.match(s or ''):
            return k
    return 'plain'


def _first_rpr(p):
    for c in p:
        if local(c.tag) in ('r', 'fld'):
            r = c.find(q('a:rPr'))
            if r is not None:
                return r
    e = p.find(q('a:endParaRPr'))
    return e


def _as_rpr(el):
    if el is None:
        return ET.Element(q('a:rPr'), {'lang': 'ko-KR', 'altLang': 'en-US'})
    r = ET.Element(q('a:rPr'), dict(el.attrib))
    for k in el:
        r.append(ox.clone(k))
    for k in ('dirty', 'err', 'smtClean'):
        r.attrib.pop(k, None)
    return r


def _rpr_font(rpr, tag):
    e = rpr.find(q('a:' + tag))
    return e.get('typeface', '') if e is not None else ''


_RPR_ORDER = ['ln', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill',
              'effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn', 'uFillTx', 'uFill',
              'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst']


def _set_rpr_font(rpr, tag, face):
    e = rpr.find(q('a:' + tag))
    if e is None:
        e = ET.Element(q('a:' + tag))
        # 순서를 지켜 끼운다 — 순서가 틀리면 파워포인트가 파일을 고치자고 한다
        want = _RPR_ORDER.index(tag)
        pos = len(list(rpr))
        for i, c in enumerate(list(rpr)):
            n = local(c.tag)
            if n in _RPR_ORDER and _RPR_ORDER.index(n) > want:
                pos = i
                break
        rpr.insert(pos, e)
    e.set('typeface', face)
    for k in ('panose', 'pitchFamily', 'charset'):
        e.attrib.pop(k, None)


class Writer(object):
    """한 덱에 글을 넣는 일꾼. 글꼴 집안은 처음에 한 번 센다."""

    def __init__(self, deck):
        self.d = deck
        # 우리가 글을 넣거나 바꾼 도형. 검수는 이것만 본다 —
        # 손대지 않은 양식 글(협회 소개 등)은 디자이너가 맞춰 둔 것이라,
        # 어림이 조금 크게 나왔다고 '넘친다' 며 잘라 내면 안 된다.
        self.touched = set()
        # 글자를 더 줄일 수 없어 뒷줄을 덜어 낸 곳 — 검수에 적어 사람이 알게 한다
        self.trimmed = []
        self._census()

    def _census(self):
        """이 양식의 글꼴 — 제일 많이 쓰인 한글 글꼴의 집안 이름."""
        plain, bold = {}, {}
        for part in self.d.slide_parts():
            for s in self.d.shapes(part, deep=True):
                if s.kind != 'sp':
                    continue
                tb = s.txbody()
                if tb is None or not body_text(tb).strip():
                    continue
                rpr = None
                for p in tb.findall(q('a:p')):
                    rpr = _first_rpr(p)
                    if rpr is not None:
                        break
                if rpr is None:
                    continue
                fe = _rpr_font(rpr, 'ea')
                if not fe or fe.startswith('+'):
                    continue
                bag = bold if rpr.get('b') == '1' else plain
                bag[fe] = bag.get(fe, 0) + 1
        fam = {}
        for bag in (plain, bold):
            for k, v in bag.items():
                f0 = k.split()[0]
                fam[f0] = fam.get(f0, 0) + v
        if not fam:
            return
        best = max(fam, key=lambda k: fam[k])
        if fam[best] < 4:
            return
        self.d.fam = best
        body = [k for k in plain if k.startswith(best)]
        bd = [k for k in bold if k.startswith(best)]
        self.d.body_font = max(body, key=lambda k: plain[k]) if body else ''
        self.d.bold_font = max(bd, key=lambda k: bold[k]) if bd else ''
        # 굵은 글꼴 표본이 없으면 이름에 Bold 가 든 것을 찾는다
        if not self.d.bold_font:
            cand = [k for k in list(plain) + list(bold)
                    if k.startswith(best) and re.search(r'Bold|Black|SemiBold|굵', k)]
            self.d.bold_font = cand[0] if cand else self.d.body_font
        self.d.body_font = self.d.body_font or self.d.bold_font

    def pick_font(self, rpr):
        """집안이 다른 글꼴이면 이 제안서의 글꼴로 바꾼다. 굵기·크기는 그대로."""
        fam = self.d.fam
        if not fam:
            return
        ea = _rpr_font(rpr, 'ea')
        if ea and not ea.startswith('+') and ea.startswith(fam):
            return
        if not ea:
            # 글꼴이 안 적혀 있으면 물려받은 글꼴로 나온다 — 대개 맑은 고딕이다.
            want = self.d.bold_font if rpr.get('b') == '1' else self.d.body_font
        else:
            want = self.d.bold_font if rpr.get('b') == '1' else self.d.body_font
        if not want:
            return
        _set_rpr_font(rpr, 'ea', want)
        la = _rpr_font(rpr, 'latin')
        if not la or la.startswith('+') or not la.startswith(fam):
            _set_rpr_font(rpr, 'latin', want)

    # 글상자 / 표 칸 하나에 글 넣기
    def set_text(self, part, shape_el, text, fit=True, box=None, tb=None, cell=False):
        tb = tb if tb is not None else shape_el.find(q('p:txBody'))
        if tb is None:
            return False
        self.touched.add(id(shape_el))
        text = str(text if text is not None else '')
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        ps = tb.findall(q('a:p'))

        # 양식의 문단 모양을 줄 종류별로 모은다
        styles = {}
        for p in ps:
            ptxt = ''.join((c.find(q('a:t')).text or '') for c in p
                           if local(c.tag) in ('r', 'fld') and c.find(q('a:t')) is not None)
            k = line_kind(ptxt) if ptxt.strip() else None
            ppr = p.find(q('a:pPr'))
            rpr = _first_rpr(p)
            if k and k not in styles and (rpr is not None and local(rpr.tag) == 'rPr'):
                styles[k] = (ppr, rpr)
        first_p = ps[0] if ps else None
        base_ppr = first_p.find(q('a:pPr')) if first_p is not None else None
        base_rpr = None
        for p in ps:
            base_rpr = _first_rpr(p)
            if base_rpr is not None and local(base_rpr.tag) == 'rPr':
                break
        if base_rpr is None and first_p is not None:
            base_rpr = first_p.find(q('a:endParaRPr'))
        # 첫 줄의 서식을 기본으로 (파워포인트와 같게), 줄 종류가 양식에 따로 있으면 그것
        base = (base_ppr, base_rpr)

        for p in ps:
            tb.remove(p)
        lines = text.split('\n') if text else ['']
        # 양식에 같은 종류의 줄이 있으면 그 줄의 서식을, 없으면 첫 줄 서식을 쓴다
        mixed = len(styles) > 1
        for i, ln in enumerate(lines):
            k = line_kind(ln)
            ppr, rpr = styles[k] if (mixed and k in styles) else base
            p = ox.sub(tb, 'a:p')
            if ppr is not None:
                p.append(ox.clone(ppr))
            _word_wrap(p)
            r_model = _as_rpr(rpr)
            self.pick_font(r_model)
            segs = ln.split('\v')
            for j, seg in enumerate(segs):
                if j:
                    br = ox.sub(p, 'a:br')
                    br.append(ox.clone(r_model))
                if seg:
                    r = ox.sub(p, 'a:r')
                    r.append(ox.clone(r_model))
                    t = ox.sub(r, 'a:t')
                    t.text = seg
            end = ET.Element(q('a:endParaRPr'), dict(r_model.attrib))
            for kk in r_model:
                end.append(ox.clone(kk))
            p.append(end)

        # 저장된 자동 맞춤 비율은 예전 글에 맞춘 값이다 — 지운다
        bp = tb.find(q('a:bodyPr'))
        if bp is not None:
            na = bp.find(q('a:normAutofit'))
            if na is not None:
                na.attrib.pop('fontScale', None)
                na.attrib.pop('lnSpcReduction', None)

        if not text or not fit or box is None:
            return True
        self.fit(part, shape_el, tb, box, cell=cell)
        return True

    # 넘침 재기
    def need_h(self, tb, width, cell=False, margins=None, dflt=18.0):
        """글이 차지할 높이(EMU)와 줄 수. dflt 는 크기가 안 적힌 글자의 물려받은 크기."""
        bp = tb.find(q('a:bodyPr'))
        if margins:
            l_, r_, t_, b_ = margins
        else:
            l_ = int(bp.get('lIns', 91440)) if bp is not None else 91440
            r_ = int(bp.get('rIns', 91440)) if bp is not None else 91440
            t_ = int(bp.get('tIns', 45720)) if bp is not None else 45720
            b_ = int(bp.get('bIns', 45720)) if bp is not None else 45720
        wrap = (bp.get('wrap') if bp is not None else None) != 'none'
        inner = pt(width - l_ - r_)
        total = 0.0
        nlines = 0
        paras = tb.findall(q('a:p'))
        for pi, p in enumerate(paras):
            ppr = p.find(q('a:pPr'))
            sz = dflt or 18.0
            spc = 0.0
            rpr = _first_rpr(p)
            if rpr is not None and rpr.get('sz'):
                sz = int(rpr.get('sz')) / 100.0
            if rpr is not None and rpr.get('spc'):
                spc = int(rpr.get('spc')) / 100.0
            anywhere = True
            if ppr is not None and ppr.get('latinLnBrk') == '0':
                anywhere = False
            # 들여쓰기
            ind = 0.0
            if ppr is not None:
                ind = pt(int(ppr.get('marL', 0)) + max(0, int(ppr.get('indent', 0))))
            txt = ''.join((c.find(q('a:t')).text or '') if local(c.tag) in ('r', 'fld') and
                          c.find(q('a:t')) is not None else ('\v' if local(c.tag) == 'br' else '')
                          for c in p)
            n = 0
            for seg in txt.split('\v'):
                if wrap:
                    n += wrap_lines(seg, sz, inner - ind, anywhere, spc)
                else:
                    n += 1
            line = sz * K_LINE
            if ppr is not None:
                ls = ppr.find(q('a:lnSpc'))
                if ls is not None:
                    pct = ls.find(q('a:spcPct'))
                    pts = ls.find(q('a:spcPts'))
                    if pct is not None:
                        line *= int(pct.get('val', 100000)) / 100000.0
                    elif pts is not None:
                        line = int(pts.get('val', 0)) / 100.0
                for tag in ('a:spcBef', 'a:spcAft'):
                    # 첫 문단의 앞 간격 · 마지막 문단의 뒤 간격은 글 높이에 안 들어간다
                    # (파워포인트 실측 BoundHeight 가 그렇다)
                    if (tag == 'a:spcBef' and pi == 0) or (tag == 'a:spcAft' and pi == len(paras) - 1):
                        continue
                    e = ppr.find(q(tag))
                    if e is not None:
                        pp = e.find(q('a:spcPts'))
                        pc = e.find(q('a:spcPct'))
                        if pp is not None:
                            total += int(pp.get('val', 0)) / 100.0
                        elif pc is not None:
                            total += sz * K_LINE * int(pc.get('val', 0)) / 100000.0
            total += n * line
            nlines += n
        return total * EMU + t_ + b_, nlines

    def fit(self, part, shape_el, tb, box, cell=False):
        x, y, w, h = box
        bp = tb.find(q('a:bodyPr'))
        auto = None
        if bp is not None:
            for c in bp:
                if local(c.tag) in ('spAutoFit', 'normAutofit', 'noAutofit'):
                    auto = local(c.tag)
        dflt = self.d.first_size(part, shape_el, tb)
        need, _ = self.need_h(tb, w, dflt=dflt)
        wrap = (bp.get('wrap') if bp is not None else None) != 'none'

        # 옆에 얹힌 아이콘을 피한다 — 환경 분석 장의 'Political' 아이콘이 상자 오른쪽 끝에
        # 얹혀 있어 첫 줄 끝 글자들이 그 밑에 숨었다. 상자 폭을 아이콘 앞까지로 줄인다.
        # 채움·테두리가 있는 도형(머리띠·카드)은 폭을 건드리지 않는다 — 모양이 달라진다
        if part is not None and not cell and wrap and not _has_look(shape_el):
            nx, nw = self._dodge_sides(part, shape_el, x, y, w, max(h, need))
            if (nx, nw) != (x, w):
                _set_x_w(shape_el, nx, nw)
                x, w = nx, nw
                need, _ = self.need_h(tb, w, dflt=dflt)

        # 크기가 저절로 맞춰지는 상자 — 파워포인트가 하던 대로 상자 높이를 글에 맞춘다
        if auto == 'spAutoFit' and not cell:
            # 양식이 한 줄로 잡아 둔 상자(머리말 『2026 고객사 과정명』, 장 제목)는 한 줄로 지킨다.
            # 과정명이 길어 두 줄로 접히자 머리말이 장 제목 위로, 장 제목이 KMA 로고 위로 덮였다.
            if part is not None and self._keep_one_line(part, shape_el, tb, bp, x, y, w, h, dflt):
                return
            if wrap and part is not None:
                # 아래로 한없이 자라면 다음 칸을 덮는다 — Program Details 에서 M1 설명이
                # M2 머리띠와 설명 위로 쏟아졌다. 아래에 놓인 것(또는 담고 있는 카드의 끝)
                # 앞에서 멈추고, 그래도 길면 글자를 줄인다.
                floor = self._floor_below(part, shape_el, x, y, w, h)
                if floor is not None:
                    # 양식이 처음 잡아 둔 크기까지는 늘 괜찮다 — 제목 상자가 바로 밑 설명 상자와
                    # 살짝 겹치게 놓인 양식이 많다. 거기서 막으면 제목이 쪼그라든다.
                    room = max(floor - y, h)
                    if need > room and room > h * 0.5:
                        top_sz = max([int(r.get('sz')) / 100.0 for r in tb.iter(q('a:rPr')) if r.get('sz')] or [dflt])
                        min_sz = max(6.5, top_sz * 0.6)
                        guard = 0
                        while need > room and guard < 40:
                            if not _shrink(tb, 0.5, floor=min_sz, dflt=dflt):
                                break
                            need, _ = self.need_h(tb, w, dflt=dflt)
                            guard += 1
                        if need > room:
                            # 더 줄이면 못 읽는다 — 끝의 줄을 통째로 덜어 낸다(문장 중간은 자르지 않는다).
                            # 결과보고서에는 화면의 '고쳐 다시 만들기' 가 없어 여기서 끝내야 한다.
                            self._trim_tail(part, shape_el, tb, room, w, dflt)
                            _resize(shape_el, h=room, anchor='t')
                            return
            if not wrap:
                ins = int(bp.get('lIns', 91440)) + int(bp.get('rIns', 91440))
                wid = self._widest(tb) * EMU + ins
                # '줄 안 바꿈' 상자를 글 길이만큼 늘리면 긴 인용문이 장 밖으로 나갔다
                # (코스콤 인용문). 장 안에 들어갈 폭까지만 늘리고, 넘으면 줄을 바꾸게 한다.
                room_w = self._room_w(x, w, _algn(tb))
                if wid > room_w:
                    bp.set('wrap', 'square')
                    wid = room_w
                _resize(shape_el, w=wid, algn=_algn(tb))
                need, _ = self.need_h(tb, wid, dflt=dflt)
            _resize(shape_el, h=need, anchor=bp.get('anchor') or 't')
            return
        guard = 0
        room = h + 2 * EMU     # 옛 COM 처럼 테두리 안쪽 여백까지는 봐준다
        # 상자 아래쪽을 덮는 그림(아이콘 등)이 있으면 그 위에서 글이 끝나야 한다 —
        # 환경 분석 장의 'Political' 아이콘 밑으로 둘째 줄이 숨어 들어갔다.
        if part is not None and not cell:
            cover = self._covered_from(part, shape_el, x, y, w, h)
            # 덮개가 상자 대부분을 가리면 글꼴을 한없이 줄이게 된다 — 그때는 보지 않는다
            if cover is not None and cover >= h * 0.35:
                room = min(room, cover)
        while need > room and guard < 30:
            if not _shrink(tb, 0.5, floor=6.5, dflt=dflt):
                break
            need, _ = self.need_h(tb, w, dflt=dflt)
            guard += 1
        if need > room + 3 * EMU and not cell:
            self._trim_tail(part, shape_el, tb, room, w, dflt)
        # 크기가 고정된 '줄 안 바꿈' 상자 — 높이는 맞아도 옆으로 장 밖까지 나갈 수 있다.
        # 장 안에 들어올 때까지 글자를 줄인다.
        if bp is not None and bp.get('wrap') == 'none' and not cell:
            ins = int(bp.get('lIns', 91440)) + int(bp.get('rIns', 91440))
            room_w = max(w, self._room_w(x, w, _algn(tb)))
            guard = 0
            while self._widest(tb) * EMU + ins > room_w and guard < 40:
                if not _shrink(tb, 0.5, floor=6.5, dflt=dflt):
                    break
                guard += 1

    def _trim_tail(self, part, shape_el, tb, room, w, dflt):
        """글자를 더 줄일 수 없을 때 끝 문단부터 통째로 덜어 낸다.
        '3) 소주제' 처럼 밑에 아무것도 없이 남는 머리줄도 같이 뺀다. 덜어 낸 줄 수를 적어 둔다."""
        def ptext(p):
            return ''.join((c.find(q('a:t')).text or '') for c in p
                           if local(c.tag) in ('r', 'fld') and c.find(q('a:t')) is not None).strip()
        ps = tb.findall(q('a:p'))
        need, _ = self.need_h(tb, w, dflt=dflt)
        removed = []
        while need > room + 2 * EMU and len(ps) > 1:
            last = ps.pop()
            tb.remove(last)
            if ptext(last):
                removed.append(ptext(last))
            need, _ = self.need_h(tb, w, dflt=dflt)
        while removed and len(ps) > 1 and (not ptext(ps[-1]) or
                                           re.match(r'^\s*(\d+\)|\d+\.|[①-⑳]|■|▶)', ptext(ps[-1]))):
            last = ps.pop()
            tb.remove(last)
            if ptext(last):
                removed.append(ptext(last))
        if removed:
            nv = shape_el.find('.//' + q('p:cNvPr'))
            self.trimmed.append({'part': part, 'name': nv.get('name') if nv is not None else '',
                                 'lines': len(removed), 'last': removed[-1][:40]})

    def _keep_one_line(self, part, shape_el, tb, bp, x, y, w, h, dflt):
        """한 줄짜리 상자면: 옆으로 넓혀서 → 그래도 길면 글자를 70% 까지 줄여서 한 줄에 담는다.
        담았으면 True (높이·폭까지 맞춰 둠). 한 줄 상자가 아니거나 못 담으면 False."""
        ps = [p for p in tb.findall(q('a:p'))
              if ''.join((c.find(q('a:t')).text or '') for c in p
                         if local(c.tag) in ('r', 'fld') and c.find(q('a:t')) is not None).strip()]
        if len(ps) != 1:
            return False
        algn = _algn(tb)
        if algn not in ('l', 'ctr'):
            return False
        top = max([int(r.get('sz')) / 100.0 for r in tb.iter(q('a:rPr')) if r.get('sz')] or [dflt])
        ins_v = int(bp.get('tIns', 45720)) + int(bp.get('bIns', 45720)) if bp is not None else 91440
        if h - ins_v > top * EMU * 1.7:
            return False          # 양식이 여러 줄 자리로 잡아 둔 상자
        ins = int(bp.get('lIns', 91440)) + int(bp.get('rIns', 91440)) if bp is not None else 182880
        need_w = self._widest(tb) * EMU + ins
        if need_w <= w:
            return False          # 원래 폭에 들어간다 — 평소대로
        right = self._free_right(part, shape_el, x, y, w, h)
        if algn == 'ctr':
            c = x + w / 2.0
            avail = int(2 * min(c - int(0.3 * 914400), right - c))
        else:
            avail = right - x
        if avail < w:
            avail = w
        floor = top * 0.7
        guard = 0
        while need_w > avail and guard < 40:
            cur = max([int(r.get('sz')) / 100.0 for r in tb.iter(q('a:rPr')) if r.get('sz')] or [dflt])
            if cur - 0.5 < floor or not _shrink(tb, 0.5, floor=floor, dflt=dflt):
                break
            need_w = self._widest(tb) * EMU + ins
            guard += 1
        if need_w > avail:
            return False          # 줄여도 안 들어간다 — 줄을 바꾸게 둔다(아래 흐름)
        if bp is not None:
            bp.set('wrap', 'none')
        _resize(shape_el, w=need_w, algn=algn)
        need, _ = self.need_h(tb, need_w, dflt=dflt)
        _resize(shape_el, h=need, anchor=(bp.get('anchor') if bp is not None else None) or 't')
        return True

    def _free_right(self, part, shape_el, x, y, w, h):
        """이 상자 오른쪽으로 넓혀도 되는 끝 — 같은 높이에 놓인 다른 것(로고 등)의 왼변, 없으면 장 오른쪽 여백"""
        gap = int(0.08 * 914400)
        right = self.d.cx - int(0.3 * 914400)
        tol = int(0.05 * 914400)
        try:
            tops = list(self.d.shapes(part, deep=False))
        except Exception:  # noqa: BLE001
            return right
        # KMA 로고처럼 레이아웃에 박힌 것도 본다 — 장에는 없어서 장 제목이 로고 밑으로 들어갔다
        try:
            lay = self.d.layout_of(part)
            if lay:
                tops += [o for o in self.d.shapes(lay, deep=False)
                         if o.kind in ('pic', 'grp') or (o.kind == 'sp' and o.ph is None and self._opaque(o))]
        except Exception:  # noqa: BLE001
            pass
        for o in tops:
            if o.el is shape_el:
                continue
            # 이 상자를 품은 것(묶음·배경 카드)은 가로막는 것이 아니다
            if o.x <= x + tol and o.x + o.w >= x + w - tol and o.y <= y + tol and o.y + o.h >= y + h - tol:
                continue
            if o.y >= y + h or o.y + o.h <= y:
                continue
            if o.x < x + w * 0.5:
                continue
            if o.kind == 'sp' and not self._opaque(o):
                tb2 = o.txbody()
                if tb2 is None or not body_text(tb2).strip():
                    continue
            right = min(right, o.x - gap)
        return right

    def _others(self, part, shape_el):
        """같은 장의 겉 도형들과, 그중 이 상자보다 위(z 순서 뒤)에 놓인 것인지"""
        try:
            tops = self.d.shapes(part, deep=False)
        except Exception:  # noqa: BLE001
            return []
        out, seen = [], False
        for o in tops:
            if o.el is shape_el:
                seen = True
                continue
            out.append((o, seen))
        return out if seen else []

    @staticmethod
    def _opaque(o):
        if o.kind in ('pic', 'grp', 'tbl'):
            return True
        if o.kind != 'sp':
            return False
        sppr = o.el.find(q('p:spPr'))
        return sppr is not None and (sppr.find(q('a:solidFill')) is not None or
                                     sppr.find(q('a:blipFill')) is not None or
                                     sppr.find(q('a:gradFill')) is not None)

    def _dodge_sides(self, part, shape_el, x, y, w, h):
        """상자 오른쪽(또는 왼쪽) 끝에 얹힌 작은 그림·도형을 피한 (x, w)"""
        nx, nr = x, x + w
        gap = int(0.04 * 914400)
        for o, above in self._others(part, shape_el):
            if not above or not self._opaque(o):
                continue
            if o.w * o.h > w * h * 1.5 or o.w > w * 0.45:
                continue          # 상자보다 큰 것은 아이콘이 아니라 배경·카드다
            if o.y >= y + h or o.y + o.h <= y + int(0.02 * 914400):
                continue
            if o.x >= nr or o.x + o.w <= nx:
                continue
            if o.x > x + w * 0.5:
                nr = min(nr, o.x - gap)
            elif o.x + o.w < x + w * 0.5:
                nx = max(nx, o.x + o.w + gap)
        if (nx, nr) == (x, x + w) or nr - nx < w * 0.5:
            return x, w
        return nx, nr - nx

    def _floor_below(self, part, shape_el, x, y, w, h):
        """이 상자가 아래로 자랄 수 있는 끝 — 바로 밑에 놓인 것의 윗변, 담고 있는 카드의
        아랫변, 장의 아랫변 가운데 가장 가까운 것."""
        gap = int(0.04 * 914400)
        floor = self.d.cy - int(0.15 * 914400)
        for o, above in self._others(part, shape_el):
            if o.kind not in ('sp', 'pic', 'grp', 'tbl', 'cxn'):
                continue
            ox0, oy0, ox1, oy1 = o.x, o.y, o.x + o.w, o.y + o.h
            tol = int(0.05 * 914400)
            encloses = ox0 <= x + tol and ox1 >= x + w - tol and oy0 <= y + tol and oy1 >= y + h - tol
            if encloses:
                if self._opaque(o) and oy1 > y + h * 0.5:
                    floor = min(floor, oy1 - gap)
                continue
            if oy0 < y + max(h * 0.5, int(0.1 * 914400)):
                continue          # 위에서 시작한 것(옆 칸·배경)은 바닥이 아니다
            if min(ox1, x + w) - max(ox0, x) < w * 0.2:
                continue
            if o.kind == 'sp' and not self._opaque(o):
                # 채움도 글도 없는 빈 틀은 가로막는 것이 아니다
                tb2 = o.txbody()
                if tb2 is None or not body_text(tb2).strip():
                    continue
            floor = min(floor, oy0 - gap)
        return floor

    def _covered_from(self, part, shape_el, x, y, w, h):
        """이 상자 위에 겹쳐 놓인(z 순서가 뒤인) 그림·도형이 상자 아래쪽을 덮으면,
        상자 위에서 그것이 시작하는 곳까지의 높이. 없으면 None.
        상자 윗부분(첫 줄 자리)에 놓인 것은 글머리 아이콘일 수 있어 보지 않는다."""
        try:
            tops = self.d.shapes(part, deep=False)
        except Exception:  # noqa: BLE001
            return None
        seen = False
        best = None
        for o in tops:
            if o.el is shape_el:
                seen = True
                continue
            if not seen or o.kind not in ('pic', 'grp', 'sp'):
                continue
            if o.kind == 'sp':
                # 글상자·선은 덮개가 아니다 — 채워진 도형만
                sppr = o.el.find(q('p:spPr'))
                if sppr is None or sppr.find(q('a:solidFill')) is None and sppr.find(q('a:blipFill')) is None:
                    continue
            ox0, oy0, ox1, oy1 = o.x, o.y, o.x + o.w, o.y + o.h
            if ox1 <= x or ox0 >= x + w or oy1 <= y or oy0 >= y + h:
                continue
            if oy0 < y + h * 0.3:
                continue
            if (min(ox1, x + w) - max(ox0, x)) < w * 0.05:
                continue
            room = oy0 - y
            best = room if best is None else min(best, room)
        return best

    def keep_clear(self, part, s):
        """오른쪽에 걸친 다른 글상자를 덮지 않게 한다.
        표지 제목 상자는 장 폭만큼 넓고, 그 오른쪽 끝에 'Connect Values Navigate Growth'
        가 얹혀 있다. 과정명이 길면 제목이 그 밑으로 기어들어 간다.
        먼저 글자를 조금(원래의 70% 까지) 줄여 보고, 그래도 넘으면 그 앞에서 줄을 바꾼다."""
        tb = s.txbody()
        if tb is None:
            return
        bp = tb.find(q('a:bodyPr'))
        sp = s.el.find(q('p:spPr'))
        xf = sp.find(q('a:xfrm')) if sp is not None else None
        if xf is None or _algn(tb) != 'l':
            return
        # 양식에 있던 원래 자리·크기 (s 는 채우기 전에 읽어 둔 것) — 앞의 fit 이
        # 이미 높이를 늘려 놓았을 수 있어 지금 xfrm 이 아니라 이것을 기준으로 삼는다
        x, y, w_, h = s.x, s.y, s.w, s.h
        limit = None
        for o in self.d.shapes(part, deep=False):
            if o.el is s.el or o.kind != 'sp' or o.txbody() is None:
                continue
            if not body_text(o.txbody()).strip():
                continue
            if o.x <= x + EMU * 20 or o.x >= x + w_:
                continue          # 이 상자 안쪽 오른편에서 시작하는 것만
            if o.y + o.h <= y or o.y >= y + h:
                continue          # 높이가 겹치는 것만
            limit = o.x if limit is None else min(limit, o.x)
        if limit is None:
            return
        ins = int(bp.get('lIns', 91440)) + int(bp.get('rIns', 91440)) if bp is not None else 182880
        room = limit - x - ins - int(0.1 * 914400)
        if self._widest(tb) * EMU <= room:
            return
        dflt = self.d.first_size(part, s.el, tb)

        def para_w(p):
            rpr = _first_rpr(p)
            sz = int(rpr.get('sz')) / 100.0 if rpr is not None and rpr.get('sz') else dflt
            txt = ''.join((c.find(q('a:t')).text or '') for c in p
                          if local(c.tag) in ('r', 'fld') and c.find(q('a:t')) is not None)
            return (text_w(txt, sz) + 2) * EMU

        # 넘치는 줄만 줄인다 — 짧은 '2026 고객사' 줄까지 같이 작아지면 모양이 무너진다
        for p in tb.findall(q('a:p')):
            if para_w(p) <= room:
                continue
            rprs = [r.find(q('a:rPr')) for r in p if local(r.tag) in ('r', 'fld')]
            rprs = [r for r in rprs if r is not None]
            if not rprs:
                continue
            for r in rprs:
                if not r.get('sz'):
                    r.set('sz', str(int(dflt * 100)))
            start = max(int(r.get('sz')) for r in rprs)
            floor = start * 0.6
            while para_w(p) > room and max(int(r.get('sz')) for r in rprs) - 50 >= floor:
                for r in rprs:
                    r.set('sz', str(int(r.get('sz')) - 50))
            end = p.find(q('a:endParaRPr'))
            if end is not None and rprs:
                end.set('sz', rprs[-1].get('sz'))
        wrapped = self._widest(tb) * EMU > room
        if wrapped:
            # 줄여도 길다 — 상자 폭을 옆 상자 앞까지로 좁혀 거기서 줄을 바꾸게 한다
            if bp is not None:
                bp.set('wrap', 'square')
            _resize(s.el, w=room + ins)
        self.fit(part, s.el, tb, (x, y, room + ins if wrapped else w_, h))

        # 제목이 두 줄이 되어 길어졌으면, 바로 밑의 글(날짜 줄 등)을 그만큼 내린다
        nh = int(xf.find(q('a:ext')).get('cy'))
        grow = nh - h
        if grow <= 0:
            return
        bottom = y + h
        for o in self.d.shapes(part, deep=False):
            if o.el is s.el or o.kind not in ('sp', 'pic', 'grp', 'cxn'):
                continue
            if o.x >= x + w_ or o.x + o.w <= x:
                continue                      # 옆으로 안 겹치면 그대로
            if not (bottom - int(0.15 * 914400) <= o.y < bottom + int(1.0 * 914400)):
                continue                      # 바로 밑에 붙은 것만
            osp = o.el.find(q('p:spPr')) if o.kind != 'grp' else o.el.find(q('p:grpSpPr'))
            oxf = osp.find(q('a:xfrm')) if osp is not None else None
            if oxf is None or oxf.find(q('a:off')) is None:
                continue
            off = oxf.find(q('a:off'))
            ny = int(off.get('y')) + grow
            if ny + o.h > self.d.cy:
                continue                      # 장 밖으로 밀어내지는 않는다
            off.set('y', str(ny))     # 묶음은 겉 위치만 옮기면 안의 것이 같이 간다

    def _room_w(self, x, w, algn, margin=int(0.3 * 914400)):
        """이 상자가 장 밖으로 나가지 않고 쓸 수 있는 가장 큰 폭 (정렬한 쪽을 붙박고)"""
        cx = self.d.cx
        if algn == 'ctr':
            c = x + w / 2.0
            return int(max(w, 2 * min(c, cx - c) - 2 * margin))
        if algn == 'r':
            return int(max(w, x + w - margin))
        return int(max(w, cx - x - margin))

    def _widest(self, tb):
        best = 0.0
        for p in tb.findall(q('a:p')):
            rpr = _first_rpr(p)
            sz = int(rpr.get('sz')) / 100.0 if rpr is not None and rpr.get('sz') else 18.0
            txt = ''.join((c.find(q('a:t')).text or '') for c in p
                          if local(c.tag) in ('r', 'fld') and c.find(q('a:t')) is not None)
            best = max(best, text_w(txt, sz))
        return best + 2


def _has_look(el):
    """채움이나 테두리가 보이는 도형인가 (그냥 글상자가 아닌가)"""
    sp = el.find(q('p:spPr'))
    if sp is None:
        return False
    if any(sp.find(q('a:' + t)) is not None for t in ('solidFill', 'gradFill', 'blipFill', 'pattFill')):
        return True
    ln = sp.find(q('a:ln'))
    if ln is not None and ln.find(q('a:noFill')) is None and len(ln):
        return True
    # 도형 서식(style)의 채움을 물려받는 도형도 있다
    st = el.find(q('p:style'))
    if st is not None and sp.find(q('a:noFill')) is None:
        fr = st.find(q('a:fillRef'))
        if fr is not None and fr.get('idx') not in (None, '0'):
            return True
    return False


def _set_x_w(el, x, w):
    sp = el.find(q('p:spPr'))
    xf = sp.find(q('a:xfrm')) if sp is not None else None
    if xf is None:
        return
    xf.find(q('a:off')).set('x', str(int(x)))
    xf.find(q('a:ext')).set('cx', str(int(w)))


def _algn(tb):
    p = tb.find(q('a:p'))
    ppr = p.find(q('a:pPr')) if p is not None else None
    return (ppr.get('algn') if ppr is not None else None) or 'l'


def _resize(el, w=None, h=None, algn='l', anchor='t'):
    """파워포인트의 '도형을 텍스트 크기에 맞춤' 처럼. 가로는 정렬 쪽을,
    세로는 글 위치(위·가운데·아래) 쪽을 붙박고 늘린다."""
    sp = el.find(q('p:spPr'))
    xf = sp.find(q('a:xfrm')) if sp is not None else None
    if xf is None:
        return
    off, ext = xf.find(q('a:off')), xf.find(q('a:ext'))
    if w is not None:
        old = int(ext.get('cx'))
        nw = int(w)
        if algn == 'ctr':
            off.set('x', str(int(off.get('x')) + (old - nw) // 2))
        elif algn == 'r':
            off.set('x', str(int(off.get('x')) + (old - nw)))
        ext.set('cx', str(nw))
    if h is not None:
        old = int(ext.get('cy'))
        nh = int(h)
        if anchor == 'ctr':
            off.set('y', str(int(off.get('y')) + (old - nh) // 2))
        elif anchor == 'b':
            off.set('y', str(int(off.get('y')) + (old - nh)))
        ext.set('cy', str(nh))


def _shrink(tb, step, floor=6.5, dflt=18.0):
    """모든 글자를 step pt 줄인다. 더 못 줄이면 False.
    크기가 안 적힌 글자는 물려받은 크기(dflt)에서 줄인다."""
    moved = False
    base = int(round((dflt or 18.0) * 100))
    for e in tb.iter():
        if local(e.tag) in ('rPr', 'endParaRPr'):
            sz = int(e.get('sz', base)) / 100.0
            if sz - step >= floor:
                e.set('sz', str(int(round((sz - step) * 100))))
                moved = True
    return moved


# ── 채우기 (fill) ───────────────────────────────────────

def fill(data, job, photo_bytes=None, pic_bytes=None):
    """옛 PPT_FILL 과 같은 계획(job)을 받아 새 파일(bytes)을 만든다.

    photo_bytes: {장 번호: 교수 사진 bytes}
    pic_bytes:   {장 번호: [교육 사진 bytes, …]}
    """
    d = Deck(data)
    w = Writer(d)

    # 장 늘리기 — 뒤쪽부터 (앞 장 번호가 밀리지 않게)
    reps = sorted(job.get('repeat') or [], key=lambda r: -int(r.get('no') or 0))
    for r in reps:
        at, times = int(r.get('no') or 0), int(r.get('times') or 1)
        for k in range(2, times + 1):
            duplicate(d, at + k - 2)

    for item in job.get('fill') or []:
        try:
            no = int(item.get('no') or 0)
            part = d.slide(no)
        except (IndexError, ValueError):
            continue
        if pic_bytes and pic_bytes.get(no):
            put_pics(d, part, pic_bytes[no])
        if photo_bytes and photo_bytes.get(no):
            put_face(d, part, photo_bytes[no])
        fill_slide(d, w, part, item)

    for t in job.get('tables') or []:
        if not t:
            continue
        try:
            fill_table(d, w, t)
        except (IndexError, ValueError):
            continue

    for rep in job.get('replace') or []:
        if rep and rep.get('from') and rep.get('from') != rep.get('to'):
            replace_all(d, str(rep['from']), str(rep.get('to') or ''), w)

    if job.get('header'):
        set_header(d, str(job['header']).strip())

    for no in sorted({int(x) for x in (job.get('drop') or [])}, reverse=True):
        try:
            delete_slide(d, no)
        except (IndexError, ValueError):
            pass

    drop_chart_links(d)
    d.pkg.gc()
    unify_fonts(d)
    trim_fonts(d)
    d.touched = w.touched
    d.trimmed = getattr(d, 'trimmed', []) + w.trimmed
    return d.pkg.save(), d


def fill_slide(d, w, part, item):
    shapes = d.shapes(part, deep=True)
    boxes = [s for s in shapes if s.kind == 'sp' and s.top_level and s.txbody() is not None
             and body_text(s.txbody()).strip()]
    holders = [s for s in shapes if s.kind == 'sp' and s.top_level and s.ph is not None]

    title_shape = None
    for s in shapes:
        if s.top_level and s.ph is not None and s.ph[0] in ('title', 'ctrTitle'):
            title_shape = s
            break
    want = re.sub(r'\s+', ' ', str(item.get('title') or '')).strip()
    if title_shape is None and want:
        # 그 글이 이미 장 어딘가에 그대로 있으면(양식의 제목을 그대로 넘긴 것) 쓸 일이 없다
        same = [s for s in boxes if re.sub(r'\s+', ' ', body_text(s.txbody())).strip() == want]
        if same:
            title_shape, want = same[0], ''     # 본문이 그 상자로 가지 않게 기억만 한다
        else:
            title_shape = _title_box(d, part, boxes)
    if want and title_shape is not None:
        w.set_text(part, title_shape.el, item['title'],
                   box=(title_shape.x, title_shape.y, title_shape.w, title_shape.h))

    if item.get('slots'):
        # 이름으로 찾는다. 그룹 밖의 것이 먼저다(옛 COM 도 겉을 먼저 찾고
        # 없을 때만 그룹 안을 뒤졌다). 같은 이름이 여럿이면 앞의 것.
        by_name = {}
        for top in (True, False):
            for s in shapes:
                if s.kind == 'sp' and s.top_level == top:
                    for key in (s.name, s.raw):
                        if key not in by_name:
                            by_name[key] = s
        written = []       # (도형, 양식이 쓰던 글씨 크기) — 끝에서 같은 모양 상자끼리 크기를 맞춘다
        for sl in item['slots']:
            if not sl:
                continue
            s = by_name.get(str(sl.get('name') or ''))
            if s is None or s.txbody() is None:
                continue
            if not sl.get('swap'):
                tb0 = s.txbody()
                written.append((s, _main_sz(tb0, d.first_size(part, s.el, tb0))))
            if sl.get('swap'):
                # 상자를 통째로 갈지 않고 낱말만 바꾼다 — 표지의 '2026 고객사 이름'
                # (작은 글씨) / '제안 과정명 제안서'(큰 글씨)처럼 줄마다 모양이 다른 것을 지킨다.
                tb = s.txbody()
                hit = False
                for pair in sl['swap']:
                    frm, to = (pair or [None, None])[:2]
                    if not frm or frm == to:
                        continue
                    for p in tb.findall(q('a:p')):
                        hit = _replace_para(p, str(frm), str(to or ''), w) or hit
                if hit:
                    w.touched.add(id(s.el))
                    w.fit(part, s.el, tb, (s.x, s.y, s.w, s.h))
                    w.keep_clear(part, s)
                continue
            w.set_text(part, s.el, sl.get('text'), box=(s.x, s.y, s.w, s.h))
        _even_peers(d, w, part, written)
        return

    if item.get('body'):
        body = item['body']
        text = '\n'.join(body) if isinstance(body, list) else str(body)
        best, area = None, -1
        for s in boxes:
            if title_shape is not None and s.name == title_shape.name:
                continue
            a = s.w * s.h
            if a > area:
                best, area = s, a
        if best is None:
            for s in holders:
                if title_shape is not None and s.name == title_shape.name:
                    continue
                a = s.w * s.h
                if a > area:
                    best, area = s, a
        if best is not None:
            if best.txbody() is None:
                _ensure_txbody(best.el)
            w.set_text(part, best.el, text, box=(best.x, best.y, best.w, best.h))


# ── 같은 모양 본문 상자끼리 글씨 맞추기 ──────────────────────
#
# 상자마다 따로 맞추면 위 상자만 작아진다. Program Details 에서 M1 설명은 바로 밑
# M2 머리띠까지만 자랄 수 있어 7pt 로 줄었고, 카드 끝까지 자랄 수 있는 M2 설명은 8pt 로
# 남았다. 한 장에서 같은 역할의 글이 크기가 다르면 한눈에 어색하다.
# 그래서 채운 뒤에 같은 폭·같은 자리로 위아래 놓인 본문 상자를 묶어, 모두 들어가는
# 가장 큰 크기 하나로 맞춘다. 고르는 차례:
#   ① 양식 크기 그대로 — 모자라면 아래 칸(머리띠·시간·설명)을 통째로 내려 자리를 만든다
#   ② 줄 간격을 조금 좁힌다(150% → 120% 까지) — 모양은 그대로, 글씨 크기를 지키는 편이 읽기 쉽다
#   ③ 그래도 안 되면 0.5pt 씩 줄인다 — 이때도 모두 같은 크기로
# 카드(흰 판) 밖으로는 내리지 않는다.

def _main_sz(tb, dflt):
    """본문 글씨 크기 — 사이 띄우는 3pt 짜리 빈 문단 같은 것은 뺀다"""
    szs = [int(e.get('sz')) / 100.0 for e in tb.iter()
           if local(e.tag) in ('rPr', 'endParaRPr') and e.get('sz') and int(e.get('sz')) >= 500]
    return max(szs) if szs else float(dflt or 18.0)


def _set_sz(tb, size):
    val = str(int(round(size * 100)))
    for e in tb.iter():
        if local(e.tag) in ('rPr', 'endParaRPr'):
            sz = e.get('sz')
            if sz is None or int(sz) >= 500:
                e.set('sz', val)


def _scale_lnspc(tb, sc):
    """줄 간격(%)을 sc 배로 — 100% 밑으로는 내리지 않는다"""
    if sc >= 0.999:
        return
    for e in tb.iter(q('a:spcPct')):
        v = int(e.get('val', 100000))
        if v > 100000:
            e.set('val', str(max(100000, int(v * sc))))


def _move_y(o, dy):
    """겉 도형 하나를 dy(EMU) 만큼 내린다. 묶음·표는 겉 자리만 옮기면 안의 것이 같이 간다."""
    if o.kind == 'grp':
        sp = o.el.find(q('p:grpSpPr'))
        xf = sp.find(q('a:xfrm')) if sp is not None else None
    elif o.kind == 'tbl':
        xf = o.el.find(q('p:xfrm'))
    else:
        sp = o.el.find(q('p:spPr'))
        xf = sp.find(q('a:xfrm')) if sp is not None else None
    off = xf.find(q('a:off')) if xf is not None else None
    if off is not None:
        off.set('y', str(int(off.get('y')) + int(dy)))


def _even_peers(d, w, part, written):
    import copy

    def body_like(s):
        tb = s.txbody()
        if tb is None or not s.top_level:
            return False
        bp = tb.find(q('a:bodyPr'))
        if bp is None or bp.find(q('a:spAutoFit')) is None or bp.get('wrap') == 'none':
            return False
        lines = [p for p in tb.findall(q('a:p')) if body_text_p(p).strip()]
        return len(lines) >= 3

    tol_x = int(0.15 * 914400)
    groups = []
    for s, t in sorted([x for x in written if body_like(x[0])], key=lambda x: x[0].y):
        for g in groups:
            h0, last = g[0][0], g[-1][0]
            if abs(s.w - h0.w) <= h0.w * 0.03 and abs(s.x - h0.x) <= tol_x and s.y >= last.y + last.h * 0.5:
                g.append((s, t))
                break
        else:
            groups.append([(s, t)])

    for g in groups:
        if len(g) < 2:
            continue
        peers = [s for s, _ in g]
        dflts = [d.first_size(part, s.el, s.txbody()) for s in peers]
        cur = [_main_sz(s.txbody(), df) for s, df in zip(peers, dflts)]
        target = max([t for _, t in g])
        lo = min(cur)
        if max(cur) - lo < 0.05 and lo >= target - 0.05:
            continue                       # 이미 모두 양식 크기
        # 바닥은 채우기 전 자리로 잰다 — 앞 상자의 바닥은 다음 칸(머리띠)의 윗변, 마지막은 카드 끝
        floors = [w._floor_below(part, s.el, s.x, s.y, s.w, s.h) for s in peers]
        gap = int(0.04 * 914400)
        ok_order = all(floors[i] <= peers[i + 1].y for i in range(len(peers) - 1))

        def needs(size, sc):
            out = []
            for s in peers:
                tb = copy.deepcopy(s.txbody())
                _set_sz(tb, size)
                _scale_lnspc(tb, sc)
                out.append(w.need_h(tb, s.w, dflt=size)[0])
            return out

        def plan(ns):
            shifts = [0]
            for i in range(1, len(peers)):
                end = peers[i - 1].y + shifts[i - 1] + ns[i - 1]
                shifts.append(max(0, end - floors[i - 1]))
            if not ok_order and any(shifts):
                return None
            if peers[-1].y + shifts[-1] + ns[-1] > floors[-1] + 2 * EMU:
                return None
            return shifts

        best = None
        size = target
        while size >= lo - 0.01 and best is None:
            for sc in (1.0, 0.9, 0.8):
                ns = needs(size, sc)
                sh = plan(ns)
                if sh is not None:
                    best = (size, sc, ns, sh)
                    break
            size -= 0.5
        if best is None:
            # 어떻게 해도 안 들어가면 지금 가장 작은 크기로 모두 맞춘다 (각자 제자리에서는 들어간다)
            ns = needs(lo, 1.0)
            best = (lo, 1.0, ns, [0] * len(peers))
        size, sc, ns, shifts = best

        # 아래 칸 옮기기 — 칸 i 는 앞 상자의 바닥(=그 칸의 윗변)부터 다음 칸 윗변 앞까지
        col0 = min(s.x for s in peers) - tol_x
        col1 = max(s.x + s.w for s in peers) + tol_x
        tops = d.shapes(part, deep=False)
        # 아래 칸부터 옮긴다 — 위 칸을 먼저 내리면 그게 아래 칸 범위에 들어가 두 번 내려간다
        for i in range(len(peers) - 1, 0, -1):
            dy = shifts[i]
            if dy <= 0:
                continue
            y0 = floors[i - 1] - int(0.05 * 914400)
            y1 = (floors[i] + gap - int(0.02 * 914400)) if i < len(peers) - 1 else floors[-1]
            for o in tops:
                if o.x < col0 or o.x + o.w > col1:
                    continue
                if y0 <= o.y < y1:
                    _move_y(o, dy)
        for s, n in zip(peers, ns):
            tb = s.txbody()
            _set_sz(tb, size)
            _scale_lnspc(tb, sc)
            _resize(s.el, h=n, anchor='t')


def body_text_p(p):
    return ''.join((c.find(q('a:t')).text or '') for c in p
                   if local(c.tag) in ('r', 'fld') and c.find(q('a:t')) is not None)


def _ensure_txbody(el):
    tb = ox.sub(el, 'p:txBody')
    ox.sub(tb, 'a:bodyPr')
    ox.sub(tb, 'a:lstStyle')
    ox.sub(tb, 'a:p')
    return tb


# ── 표 채우기 ──────────────────────────────────────────

def _frame_by(d, part, name=None, want=None):
    for s in d.shapes(part, deep=False):
        if s.kind != 'tbl':
            continue
        if name and name not in (s.name, s.raw):
            continue
        if want:
            t = Table(s.el)
            heads = [re.sub(r'\s', '', t.text(1, c)) for c in range(1, t.cols + 1)]
            if t.cols < len(want) or any(h and h not in heads for h in want):
                continue
        return s
    return None


def _xf(o):
    if o.kind in ('tbl', 'frame'):
        return o.el.find(q('p:xfrm'))
    if o.kind == 'grp':
        sp = o.el.find(q('p:grpSpPr'))
    else:
        sp = o.el.find(q('p:spPr'))
    return sp.find(q('a:xfrm')) if sp is not None else None


def _set_y(o, y=None, h=None):
    xf = _xf(o)
    if xf is None:
        return
    if y is not None and xf.find(q('a:off')) is not None:
        xf.find(q('a:off')).set('y', str(int(y)))
    if h is not None and xf.find(q('a:ext')) is not None:
        xf.find(q('a:ext')).set('cy', str(int(h)))


def _block_head(shapes, gone):
    """빼는 표·그래프 바로 위의 작은 이름표('▪ 교육 콘텐츠 영역 결과').
    같은 모양의 이름표가 한 칸 안에 또 있을 때만 — 칸 전체의 제목을 빼지 않게."""
    pt = 12700
    x0 = min(s.x for s in gone)
    x1 = max(s.x + s.w for s in gone)
    y0 = min(s.y for s in gone)
    best = None
    for s in shapes:
        if s in gone or s.kind != 'sp' or s.h > 40 * pt:
            continue
        txt = (s.text() or '').strip() if s.txbody() is not None else ''
        if not txt or '\n' in txt or len(txt) > 30:
            continue
        bottom = s.y + s.h
        if bottom > y0 + 4 * pt or y0 - bottom > 60 * pt:
            continue
        if s.x > x1 or s.x + s.w < x0:
            continue
        twin = any(o is not s and o.kind == 'sp' and abs(o.x - s.x) < 4 * pt and abs(o.w - s.w) < 4 * pt
                   and abs(o.h - s.h) < 4 * pt and abs(o.y - s.y) > 20 * pt for o in shapes)
        if twin and (best is None or bottom > best.y + best.h):
            best = s
    return [best] if best else []


def _reflow(d, part, before, gone):
    """만족도 표를 하나 뺀 뒤 그 칸에 빈자리가 남지 않게 한다.
    아래 묶음(이름표·그래프·표)을 빈자리로 올리고, 남은 그래프를 늘려 칸을 채운다."""
    pt = 12700
    gx0 = min(s.x for s in gone)
    gx1 = max(s.x + s.w for s in gone)
    gy0 = min(s.y for s in gone)
    gy1 = max(s.y + s.h for s in gone)
    rest = [s for s in before if s not in gone]

    # 묶음을 감싼 바탕 칸(글 없는 큰 상자)
    card = None
    for s in rest:
        if s.kind != 'sp' or (s.txbody() is not None and (s.text() or '').strip()):
            continue
        if s.x <= gx0 + pt and s.y <= gy0 + pt and s.x + s.w >= gx1 - pt and s.y + s.h >= (gy0 + gy1) / 2:
            if card is None or s.w * s.h < card.w * card.h:
                card = s
    if card is None:
        return

    def real_chart(s):
        rid = _chart_rid(s.el) if s.kind == 'frame' else None
        cp = d.pkg.target(part, rid) if rid else None
        return bool(cp and d.pkg.has(cp) and _chart_cats(d.pkg.read(cp).decode('utf8')))

    members = [s for s in rest if s is not card and card.x <= s.x + s.w / 2 <= card.x + card.w
               and card.y <= s.y < card.y + card.h]
    mid = (gy0 + gy1) / 2
    below = [s for s in members if s.y >= mid]
    if below:
        delta = min(s.y for s in below) - gy0
        for s in below:
            _set_y(s, y=s.y - delta)
            s.y -= delta
        last = below
        free = delta
    else:
        last = [s for s in members if s.y < gy0]
        boxes = [s for s in last if s.kind == 'tbl' or real_chart(s)]
        if not boxes:
            return
        free = gy1 - max(s.y + s.h for s in boxes)
    if free <= 0:
        return

    charts = [s for s in last if real_chart(s)]
    if not charts:
        return
    low = max(s.y + s.h for s in charts)
    for c in charts:
        if abs(c.y + c.h - low) > 2 * pt:
            continue
        c.h += free
        _set_y(c, h=c.h)
        # 그래프 옆 표는 늘어난 그래프의 가운데로
        for t in last:
            if t.kind == 'tbl' and t.y < c.y + c.h and t.y + t.h > c.y:
                _set_y(t, y=c.y + (c.h - t.h) / 2)


def _cell_margins(tc):
    pr = tc.find(q('a:tcPr'))
    g = (lambda k, dflt: int(pr.get(k, dflt)) if pr is not None else dflt)
    return g('marL', 91440), g('marR', 91440), g('marT', 45720), g('marB', 45720)


def table_heights(w, t):
    """행마다 글이 요구하는 최소 높이(EMU)"""
    widths = t.col_w()
    need = []
    trs = t.trs
    for ri, tr in enumerate(trs):
        best = 0
        for ci, tc in enumerate(tr.findall(q('a:tc'))):
            if tc.get('hMerge') == '1' or tc.get('vMerge') == '1':
                continue
            if int(tc.get('rowSpan', 1)) > 1:
                continue
            span = int(tc.get('gridSpan', 1))
            cw = sum(widths[ci:ci + span])
            tb = tc.find(q('a:txBody'))
            if tb is None:
                continue
            m = _cell_margins(tc)
            h, _ = w.need_h(tb, cw, cell=True, margins=m, dflt=w.d.first_size(None, None, tb))
            best = max(best, h)
        need.append(best)
    return need


def _slide_room(d, y0):
    """표가 장 아래로 자랄 수 있는 높이. 파워포인트가 실제로 그리는 표는 어림보다 조금 크다
    (신한라이프 황금원 표: 어림 518pt → 실제 563pt) — 8% 여유를 둔다."""
    return int((d.cy - y0 - int(0.3 * 914400)) * 0.92)


def _fit_words(w, t, floor_ratio=0.7):
    """칸 폭보다 긴 낱말 하나('교육콘텐츠', '운영·시설')는 낱말 단위 줄 바꿈으로도
    못 넣어 파워포인트가 가운데서 쪼갠다('교육콘 / 텐츠'). 그런 칸만 글자를 조금 줄인다
    (원래의 70% 까지 — 더 작아지면 읽기 어렵다)."""
    widths = t.col_w()
    shrunk = {}          # 열 번호 → 그 열에서 줄인 가장 작은 크기
    cells = {}           # 열 번호 → 그 열의 rPr 들 (한 열은 한 크기로 맞춘다)
    for tr in t.trs[1:]:     # 머리글 줄은 양식 그대로 둔다
        c = 0
        for tc in tr.findall(q('a:tc')):
            span = int(tc.get('gridSpan', 1))
            cw = sum(widths[c:c + span])
            col = c
            c += span
            if tc.get('hMerge') == '1' or tc.get('vMerge') == '1':
                continue
            tb = tc.find(q('a:txBody'))
            if tb is None:
                continue
            tcpr = tc.find(q('a:tcPr'))
            mar = (int(tcpr.get('marL', 91440)) + int(tcpr.get('marR', 91440))) if tcpr is not None else 182880
            inner = cw - mar
            if inner <= 0:
                continue
            dflt = w.d.first_size(None, None, tb)
            for p in tb.findall(q('a:p')):
                runs = [r for r in p if local(r.tag) in ('r', 'fld') and r.find(q('a:t')) is not None]
                rprs = [r.find(q('a:rPr')) for r in runs]
                rprs = [x for x in rprs if x is not None]
                words = [x for x in re.split(r'\s+', ''.join(r.find(q('a:t')).text or '' for r in runs)) if x]
                if not words or not rprs:
                    continue
                for x in rprs:
                    if not x.get('sz'):
                        x.set('sz', str(int(dflt * 100)))
                start = max(int(x.get('sz')) for x in rprs)

                def widest():
                    sz = max(int(x.get('sz')) for x in rprs) / 100.0
                    return (max(text_w(wd, sz) for wd in words) + 1) * EMU

                if span == 1:
                    cells.setdefault(col, []).extend(rprs)
                while widest() > inner and max(int(x.get('sz')) for x in rprs) - 50 >= start * floor_ratio:
                    for x in rprs:
                        x.set('sz', str(int(x.get('sz')) - 50))
                now = max(int(x.get('sz')) for x in rprs)
                if now < start and span == 1:
                    shrunk[col] = min(shrunk.get(col, now), now)
    # 같은 열에서 한 칸만 작아지면 들쭉날쭉해 보인다 — 그 열을 같은 크기로
    for col, sz in shrunk.items():
        for x in cells.get(col, []):
            if int(x.get('sz')) > sz:
                x.set('sz', str(sz))


def _grow_table(w, t, cap_pt=12.0, ratio=1.5, step=0.5):
    """줄·열을 지워 칸이 넓어진 표는 양식의 작은 글자(8pt)가 휑하게 남는다
    (시간표: 3일 × 12줄 양식에 1일 · 5줄만 남으면 한 칸이 커지는데 글자는 그대로).
    지금 행 높이 안에서, 낱말이 쪼개지지 않는 데까지 글자를 조금씩 키운다.
    원래의 1.5배, 최대 cap_pt 까지."""
    widths = t.col_w()
    cells = []           # (txBody, 안쪽 폭)
    for tr in t.trs:
        c = 0
        for tc in tr.findall(q('a:tc')):
            span = int(tc.get('gridSpan', 1))
            cw = sum(widths[c:c + span])
            c += span
            if tc.get('hMerge') == '1' or tc.get('vMerge') == '1':
                continue
            tb = tc.find(q('a:txBody'))
            if tb is None or not body_text(tb).strip():
                continue
            m = _cell_margins(tc)
            inner = cw - (m[0] + m[1])
            cells.append((tb, inner))
    if not cells:
        return
    rprs = []
    for tb, _ in cells:
        dflt = w.d.first_size(None, None, tb)
        for e in list(tb.iter(q('a:rPr'))) + list(tb.iter(q('a:endParaRPr'))):
            if not e.get('sz'):
                e.set('sz', str(int(dflt * 100)))
            rprs.append(e)
    if not rprs:
        return
    start = {id(e): int(e.get('sz')) for e in rprs}
    top = max(start.values()) / 100.0
    limit = min(cap_pt, top * ratio)
    heights = [int(tr.get('h', 0)) for tr in t.trs]

    def fits():
        for tb, inner in cells:
            for p in tb.findall(q('a:p')):
                rs = [r for r in p if local(r.tag) in ('r', 'fld') and r.find(q('a:t')) is not None]
                if not rs:
                    continue
                sz = max(int((r.find(q('a:rPr')).get('sz') if r.find(q('a:rPr')) is not None else 0) or 0) for r in rs) / 100.0
                words = [x for x in re.split(r'\s+', ''.join(r.find(q('a:t')).text or '' for r in rs)) if x]
                if sz and words and (max(text_w(wd, sz) for wd in words) + 1) * EMU > inner:
                    return False
        need = table_heights(w, t)
        return all(n <= h + EMU for n, h in zip(need, heights))

    grown = 0.0
    while top + grown + step <= limit + 1e-6:
        before = [(e, e.get('sz')) for e in rprs]
        for e in rprs:
            e.set('sz', str(int(round(int(e.get('sz')) + step * 100))))
        if not fits():
            for e, v in before:
                e.set('sz', v)
            break
        grown += step


def _fit_table(w, t, max_h, body_from=2, floor=7.0):
    """표가 max_h 안에 들어오게. 행은 글만큼 자라고, 그래도 넘치면 본문 글자를 줄인다."""
    _fit_words(w, t)
    guard = 0
    while guard < 16:
        need = table_heights(w, t)
        rows = [max(int(tr.get('h', 0)), n) for tr, n in zip(t.trs, need)]
        if sum(rows) <= max_h + EMU:
            t.set_heights(rows)
            return rows
        moved = False
        for tr in t.trs[body_from - 1:]:
            for tc in tr.findall(q('a:tc')):
                tb = tc.find(q('a:txBody'))
                if tb is not None and body_text(tb).strip():
                    moved = _shrink(tb, 0.5, floor, dflt=w.d.first_size(None, None, tb)) or moved
        if not moved:
            t.set_heights(rows)
            return rows
        guard += 1
    need = table_heights(w, t)
    rows = [max(int(tr.get('h', 0)), n) for tr, n in zip(t.trs, need)]
    t.set_heights(rows)
    return rows


def fill_table(d, w, job):
    no = int(job.get('slide') or 0)

    # 채울 것이 없어 통째로 빼는 표(와 그 이름표) — 자리표시자째 나가는 것보다 낫다
    if job.get('remove'):
        part = d.slide(no)
        want = {str(x) for x in job['remove']}
        tree = d.tree(part)
        # 빼는 표와 같은 문항을 그린 막대그래프도 같이 뺀다 — 남기면 예전 숫자가 그대로 보인다
        for s in d.shapes(part, deep=False):
            if s.kind == 'tbl' and (s.name in want or s.raw in want):
                t = Table(s.el)
                old = {_SP.sub('', t.text(r, 1)) for r in range(2, t.rows + 1)} - {'', '평균', '합계', '전체'}
                for gf in d.shapes(part, deep=False):
                    rid = _chart_rid(gf.el)
                    if not rid:
                        continue
                    cp = d.pkg.target(part, rid)
                    if not cp or not d.pkg.has(cp):
                        continue
                    cats = {_SP.sub('', c) for c in _chart_cats(d.pkg.read(cp).decode('utf8'))}
                    hit = len(old & cats)
                    if cats and hit and hit * 2 >= len(cats):
                        want.add(gf.name)
        before = d.shapes(part, deep=False)
        gone = [s for s in before if s.name in want or s.raw in want]
        if job.get('reflow') and gone:
            want |= {s.name for s in _block_head(before, gone)}
            gone = [s for s in before if s.name in want or s.raw in want]
        for s in gone:
            parent = next((p for p in tree.iter() if s.el in list(p)), None)
            if parent is not None:
                parent.remove(s.el)
        if job.get('reflow') and gone:
            _reflow(d, part, before, gone)
        return

    if job.get('cells'):
        part = d.slide(no)
        s = _frame_by(d, part, name=job.get('name'))
        if s is None:
            return
        t = Table(s.el)
        x0, y0, w0, h0 = t.frame_box()
        widths0 = t.col_w()

        # 모자라면 늘린다 — 채우기 전에 (칸 번호가 맞게)
        if job.get('addCols'):
            t.add_cols(int(job['addCols']), int(job.get('addColsAt') or -1))
            n = t.cols
            c1 = widths0[0] if widths0 else 0
            if n > 1 and c1:
                each = (w0 - c1) / float(n - 1)
                t.set_widths([c1] + [each] * (n - 1))
        if job.get('addRows'):
            t.add_rows(int(job['addRows']), int(job.get('addRowsAt') or -1))
            each = h0 / float(t.rows)
            t.set_heights([each] * t.rows)

        for cl in job['cells']:
            if not cl:
                continue
            tc = t.cell(int(cl.get('r') or 0), int(cl.get('c') or 0))
            if tc is None:
                continue
            tb = tc.find(q('a:txBody'))
            if tb is None:
                continue
            w.set_text(part, tc, cl.get('text'), fit=False, tb=tb, cell=True)

        # 남는 열·줄은 지운다
        if job.get('dropCols'):
            before = sum(t.col_w())
            t.drop_cols(job['dropCols'])
            after = sum(t.col_w())
            if after and before > after:
                k = before / float(after)
                t.set_widths([cw * k for cw in t.col_w()])
        if job.get('dropRows'):
            t.drop_rows(job['dropRows'])
            left = t.rows
            cur = sum(int(tr.get('h', 0)) for tr in t.trs)
            if left and cur < h0:
                add = (h0 - cur) / float(left)
                # 줄을 많이 지웠을 때 남은 줄을 표 높이만큼 늘이면 한 줄이 한 뼘이 된다 — 반 배까지만
                add = min(add, 0.5 * cur / float(left))
                t.set_heights([int(tr.get('h', 0)) + add for tr in t.trs])

        # 줄·열을 지워 칸이 넓어졌으면 작은 양식 글자를 칸에 맞게 키운다
        if job.get('dropCols') or job.get('dropRows'):
            _grow_table(w, t)
        # 글만큼 행이 자란다. 슬라이드 밖으로 나가면 글자를 줄인다.
        room = max(h0, _slide_room(d, y0))
        _fit_table(w, t, room)
        t.sync_frame()
        t.set_frame(x=x0, y=y0)
        return

    if job.get('vertical'):
        part = d.slide(no)
        for s in d.shapes(part, deep=False):
            if s.kind != 'tbl':
                continue
            t = Table(s.el)
            widths = t.col_w()
            for pair in job.get('pairs') or []:
                label = re.sub(r'\s', '', str(pair.get('label') or ''))
                done = False
                for r in range(1, t.rows + 1):
                    hit = -1
                    for c in range(1, t.cols + 1):
                        if re.sub(r'\s', '', t.text(r, c)) == label:
                            hit = c
                            break
                    if hit < 0:
                        continue
                    for c in range(hit + 1, t.cols + 1):
                        tc = t.raw(r, c)
                        if tc is None or tc.get('hMerge') == '1':
                            continue
                        if widths[c - 1] < 20 * EMU:     # 칸 사이 여백 열
                            continue
                        tb = tc.find(q('a:txBody'))
                        if tb is None:
                            continue
                        w.set_text(part, tc, pair.get('value'), fit=False, tb=tb, cell=True)
                        done = True
                        break
                    break
                if done:
                    continue
            x0, y0, w0, h0 = t.frame_box()
            _fit_table(w, t, max(h0, _slide_room(d, y0)), body_from=1)
            t.sync_frame()
        return

    # 머리글로 표 찾기 (행 수를 데이터에 맞춘다)
    want = [re.sub(r'\s', '', str(h or '')) for h in (job.get('headers') or [])]
    target = None
    tpart = None
    parts = d.slide_parts()
    for i, part in enumerate(parts, 1):
        if no and i != no:
            continue
        # 한 장에 머리글이 같은 표가 여럿이면 이름으로 고른다 — 아니면 첫 표만 거듭 채워진다
        s = _frame_by(d, part, name=job.get('name'), want=want) if job.get('name') else None
        if s is None:
            s = _frame_by(d, part, want=want)
        if s is not None:
            target, tpart = s, part
            break
    if target is None:
        return
    t = Table(target.el)
    x0, y0, w0, h0 = t.frame_box()
    skip = int(job.get('skip') or 1)
    rows = job.get('rows') or []
    # 채우기 전에 예전 문항 이름을 적어 둔다 — 같은 문항을 그린 막대그래프를 찾는 데 쓴다
    old_labels = [t.text(r, 1) for r in range(skip + 1, t.rows + 1)]
    need = len(rows) + skip
    if t.rows > skip + 1:
        t.drop_rows(range(skip + 2, t.rows + 1))
    if t.rows < need:
        t.add_rows(need - t.rows, -1)
    if t.rows > need:
        t.drop_rows(range(need + 1, t.rows + 1))
    for r, row in enumerate(rows):
        for c, v in enumerate(row or []):
            if v is None:
                continue
            tc = t.raw(r + skip + 1, c + 1)
            if tc is None:
                continue
            tb = tc.find(q('a:txBody'))
            if tb is None:
                continue
            w.set_text(tpart, tc, v, fit=False, tb=tb, cell=True)

    mc = int(job.get('mergeCol') or 0)
    if mc:
        r = skip + 1
        while r <= t.rows:
            v = t.text(r, mc)
            e = r
            while e + 1 <= t.rows and t.text(e + 1, mc) == v:
                e += 1
            if e > r and v.strip():
                for rr in range(r + 1, e + 1):
                    tc = t.raw(rr, mc)
                    _clear_cell(tc)
                    tc.set('vMerge', '1')
            r = e + 1
        t.respan()

    # 원래 표가 쓰던 높이 안에 다시 넣는다
    for tr in t.trs[skip:]:
        tr.set('h', '0')
    rows_h = _fit_table(w, t, h0, body_from=skip + 1)
    n = t.rows - skip
    if n > 0 and sum(rows_h) < h0:
        extra = (h0 - sum(rows_h)) / float(n)
        t.set_heights(rows_h[:skip] + [hh + extra for hh in rows_h[skip:]])
    t.sync_frame()
    t.set_frame(x=x0, y=y0)

    try:
        _sync_chart(d, tpart, old_labels, job)
    except Exception:
        pass     # 그래프를 못 고쳐도 표는 이미 맞게 채웠다


# ── 막대그래프 ─────────────────────────────────────────
# 만족도 표 옆의 막대그래프는 표와 같은 문항을 그린다. 표만 바꾸면 그래프에는
# 예전 보고서 숫자(4.80 · 4.90 …)가 그대로 남는다. 표에 있던 예전 문항 이름과
# 그래프 가로축 이름이 겹치는 그래프를 찾아 이번 문항 · 점수로 바꾼다.

_SP = re.compile(r'\s')


def _chart_parts(d, part):
    out = []
    xml = d.pkg.read(part).decode('utf8', 'ignore')
    for rid in re.findall(r'<c:chart\b[^>]*r:id="([^"]+)"', xml):
        tgt = d.pkg.target(part, rid)
        if tgt and d.pkg.has(tgt):
            out.append(tgt)
    return out


_C_CHART = '{http://schemas.openxmlformats.org/drawingml/2006/chart}chart'


def _chart_rid(el):
    for c in el.iter(_C_CHART):
        return c.get(q('r:id'))
    return None


def _chart_cats(x):
    m = re.search(r'<c:cat>.*?</c:cat>', x, re.S)
    if not m:
        return []
    return [re.sub(r'<[^>]+>', '', v) for v in re.findall(r'<c:v>(.*?)</c:v>', m.group(0), re.S)]


def _xesc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def _sync_chart(d, part, old_labels, job):
    heads = [_SP.sub('', str(h or '')) for h in (job.get('headers') or [])]
    li = next((i for i, h in enumerate(heads) if re.search(r'문항|평가내용|내용|항목', h)), 0)
    vi = next((i for i, h in enumerate(heads) if re.search(r'만족도|평균', h)), -1)
    if vi < 0:
        return
    cats, vals = [], []
    for row in job.get('rows') or []:
        if not row or len(row) <= max(li, vi):
            continue
        name = str(row[li] or '').strip()
        if not name or re.match(r'^\s*(평균|합계|전체)\s*$', name):
            continue
        try:
            v = float(str(row[vi]).replace('%', ''))
        except ValueError:
            continue
        cats.append(name)
        vals.append(v)
    if not cats:
        return

    old = {_SP.sub('', s) for s in old_labels if s and not re.match(r'^\s*(평균|합계|전체)', s)}
    used = getattr(d, '_charts_done', set())
    best, score = None, 0
    for cp in _chart_parts(d, part):
        if cp in used:
            continue
        x = d.pkg.read(cp).decode('utf8')
        if x.count('<c:ser>') != 1:
            continue
        hit = len(old & {_SP.sub('', c) for c in _chart_cats(x)})
        if hit > score:
            best, score = cp, hit
    if not best:
        return
    used.add(best)
    d._charts_done = used

    x = d.pkg.read(best).decode('utf8')
    x, oldvals = _chart_series(x, cats, vals)
    d.pkg.write(best, x.encode('utf8'))
    _chart_book(d, best, x, cats, vals, len(oldvals))


def drop_chart_links(d):
    """그래프가 다른 PC 의 엑셀 파일(C:\\Users\\…\\2026 예다함 …xlsx)을 가리키는 연결을 끊는다.
    받는 쪽에서 '연결 업데이트' 창이 뜨고, 경로에 예전 고객사 이름이 그대로 보인다.
    그래프 모양과 숫자는 그래프 안에 따로 들어 있어 그대로 보인다."""
    for name in d.pkg.names():
        if not re.match(r'ppt/charts/chart\d+\.xml$', name):
            continue
        ext = [rid for rid, typ, tgt, mode in d.pkg.rels(name) if mode and (typ or '').endswith('/oleObject')]
        if not ext:
            continue
        x = d.pkg.read(name).decode('utf8')
        for rid in ext:
            x = re.sub(r'<c:externalData\b[^>]*r:id="%s"[^>]*?(/>|>.*?</c:externalData>)' % re.escape(rid),
                       '', x, flags=re.S)
            d.pkg.drop_rel(name, rid)
        d.pkg.write(name, x.encode('utf8'))


def _range_to(f, n):
    """'Sheet1!$A$2:$A$5' → 'Sheet1!$A$2:$A$<n+1>'"""
    m = re.match(r'^(.*!\$?)([A-Z]+)(\$?)(\d+)(:\$?[A-Z]+\$?)(\d+)$', f)
    if not m:
        return f
    start = int(m.group(4))
    return '%s%s%s%d%s%d' % (m.group(1), m.group(2), m.group(3), start, m.group(5), start + n - 1)


def _chart_series(x, cats, vals):
    n = len(cats)
    oldvals = []

    def cat_block(m):
        blk = m.group(0)
        f = re.search(r'<c:f>(.*?)</c:f>', blk)
        fx = '<c:f>%s</c:f>' % _xesc(_range_to(f.group(1), n)) if f else ''
        pts = ''.join('<c:pt idx="%d"><c:v>%s</c:v></c:pt>' % (i, _xesc(c)) for i, c in enumerate(cats))
        return '<c:cat><c:strRef>%s<c:strCache><c:ptCount val="%d"/>%s</c:strCache></c:strRef></c:cat>' % (fx, n, pts)

    def val_block(m):
        blk = m.group(0)
        for v in re.findall(r'<c:pt idx="\d+"[^>]*><c:v>([^<]*)</c:v>', blk):
            try:
                oldvals.append(float(v))
            except ValueError:
                oldvals.append(0.0)
        f = re.search(r'<c:f>(.*?)</c:f>', blk)
        fx = '<c:f>%s</c:f>' % _xesc(_range_to(f.group(1), n)) if f else ''
        fc = re.search(r'<c:formatCode>.*?</c:formatCode>', blk)
        pts = ''.join('<c:pt idx="%d"><c:v>%s</c:v></c:pt>' % (i, repr(round(v, 2))) for i, v in enumerate(vals))
        return '<c:val><c:numRef>%s<c:numCache>%s<c:ptCount val="%d"/>%s</c:numCache></c:numRef></c:val>' % (
            fx, fc.group(0) if fc else '', n, pts)

    x = re.sub(r'<c:cat>.*?</c:cat>', cat_block, x, count=1, flags=re.S)
    x = re.sub(r'<c:val>.*?</c:val>', val_block, x, count=1, flags=re.S)

    # 점마다 칠한 색 — 양식은 가장 높은 막대만 파랗게, 나머지는 회색으로 칠해 두었다.
    # 예전 값에서 '가장 높은 막대' 칠과 '나머지' 칠을 배워 새 점수에 다시 칠한다.
    dpts = re.findall(r'<c:dPt>.*?</c:dPt>', x, re.S)
    if dpts and oldvals:
        by_idx = {}
        for dp in dpts:
            m = re.search(r'<c:idx val="(\d+)"', dp)
            if m:
                by_idx[int(m.group(1))] = re.sub(r'<c:extLst>.*?</c:extLst>', '', dp, flags=re.S)
        top = max(oldvals)
        hi = next((by_idx[i] for i, v in enumerate(oldvals) if v == top and i in by_idx), None)
        lo = next((by_idx[i] for i, v in enumerate(oldvals) if v != top and i in by_idx), None)
        new_top = max(vals)
        out = []
        for i, v in enumerate(vals):
            if hi and lo:
                src = hi if v == new_top else lo
            else:
                src = by_idx.get(i) or by_idx[max(by_idx)]
            out.append(re.sub(r'<c:idx val="\d+"', '<c:idx val="%d"' % i, src, count=1))
        first = x.find(dpts[0])
        for dp in dpts:
            x = x.replace(dp, '', 1)
        x = x[:first] + ''.join(out) + x[first:]
    return x, oldvals


def _chart_book(d, chart, x, cats, vals, old_n):
    """그래프 속 엑셀도 같은 값으로 — '데이터 편집' 을 누르면 예전 숫자로 돌아가지 않게"""
    import io
    import zipfile
    ext = re.search(r'<c:externalData\b[^>]*r:id="([^"]+)"', x)
    if not ext:
        return
    book = d.pkg.target(chart, ext.group(1))
    if not book or not d.pkg.has(book) or not book.lower().endswith('.xlsx'):
        return
    fc = re.search(r'<c:cat>.*?<c:f>(.*?)</c:f>', x, re.S)
    fv = re.search(r'<c:val>.*?<c:f>(.*?)</c:f>', x, re.S)
    if not fc or not fv:
        return
    rc = re.match(r"^'?(.*?)'?!\$?([A-Z]+)\$?(\d+)", fc.group(1))
    rv = re.match(r"^'?(.*?)'?!\$?([A-Z]+)\$?(\d+)", fv.group(1))
    if not rc or not rv or rc.group(1) != rv.group(1):
        return
    sheet_name = rc.group(1)

    src = zipfile.ZipFile(io.BytesIO(d.pkg.read(book)))
    names = src.namelist()
    wb = src.read('xl/workbook.xml').decode('utf8')
    sm = re.search(r'<sheet\b[^>]*name="%s"[^>]*r:id="([^"]+)"' % re.escape(_xesc(sheet_name)), wb)
    if not sm:
        return
    wrels = src.read('xl/_rels/workbook.xml.rels').decode('utf8')
    tm = re.search(r'<Relationship\b[^>]*Id="%s"[^>]*Target="([^"]+)"' % re.escape(sm.group(1)), wrels) or \
        re.search(r'<Relationship\b[^>]*Target="([^"]+)"[^>]*Id="%s"' % re.escape(sm.group(1)), wrels)
    if not tm:
        return
    sheet = tm.group(1).lstrip('/')
    sheet = sheet if sheet.startswith('xl/') else 'xl/' + sheet
    if sheet not in names:
        return

    root, decls = ox.parse(src.read(sheet))
    X = '{%s}' % ox.NS['x']
    data = root.find(X + 'sheetData')
    if data is None:
        return

    def row_el(n):
        for r in data.findall(X + 'row'):
            rn = int(r.get('r') or 0)
            if rn == n:
                return r
            if rn > n:
                el = ET.Element(X + 'row', {'r': str(n)})
                data.insert(list(data).index(r), el)
                return el
        el = ET.SubElement(data, X + 'row', {'r': str(n)})
        return el

    def col_no(letters):
        k = 0
        for ch in letters:
            k = k * 26 + (ord(ch) - 64)
        return k

    def cell(col, n):
        r = row_el(n)
        ref = '%s%d' % (col, n)
        for c in r.findall(X + 'c'):
            if c.get('r') == ref:
                return c
        el = ET.Element(X + 'c', {'r': ref})
        at = len(list(r))
        for i, c in enumerate(list(r)):
            m = re.match(r'([A-Z]+)', c.get('r') or '')
            if m and col_no(m.group(1)) > col_no(col):
                at = i
                break
        r.insert(at, el)
        return el

    def put(col, n, v):
        c = cell(col, n)
        for ch in list(c):
            c.remove(ch)
        c.attrib.pop('t', None)
        if isinstance(v, float):
            ET.SubElement(c, X + 'v').text = repr(round(v, 2))
        else:
            c.set('t', 'inlineStr')
            ET.SubElement(ET.SubElement(c, X + 'is'), X + 't').text = str(v)

    c_col, v_col, start = rc.group(2), rv.group(2), int(rc.group(3))
    for i, (cname, v) in enumerate(zip(cats, vals)):
        put(c_col, start + i, cname)
        put(v_col, start + i, float(v))
    # 예전 문항이 더 많았으면 예전 범위 안의 남는 두 칸만 비운다 (그 아래 다른 표는 손대지 않는다)
    for n in range(start + len(cats), start + old_n):
        for r in data.findall(X + 'row'):
            if int(r.get('r') or 0) != n:
                continue
            for c in list(r.findall(X + 'c')):
                m = re.match(r'([A-Z]+)', c.get('r') or '')
                if m and m.group(1) in (c_col, v_col):
                    r.remove(c)

    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        for n in names:
            if n == sheet:
                zf.writestr(n, ox.dump(root, decls))
            else:
                zf.writestr(src.getinfo(n), src.read(n))
    d.pkg.write(book, out.getvalue())


# ── 그림 ──────────────────────────────────────────────

def _blip_of(pic):
    bf = pic.find(q('p:blipFill'))
    return bf, (bf.find(q('a:blip')) if bf is not None else None)


def _crop_rect(img_wh, box_wh):
    """자리를 덮도록 가운데를 남기고 잘라 낼 비율 (l, t, r, b) — 1/1000 % 단위"""
    iw, ih = img_wh
    bw, bh = box_wh
    if not iw or not ih or not bw or not bh:
        return 0, 0, 0, 0
    ia, ba = iw / float(ih), bw / float(bh)
    if ia > ba:
        keep = ba / ia
        cut = int(round((1 - keep) / 2 * 100000))
        return cut, 0, cut, 0
    keep = ia / ba
    cut = int(round((1 - keep) / 2 * 100000))
    return 0, cut, 0, cut


def _set_blip(pkg, part, blip_fill, data, box_wh):
    blip = blip_fill.find(q('a:blip'))
    rid = pkg.add_media(part, data)
    if blip is None:
        blip = ET.Element(q('a:blip'))
        blip_fill.insert(0, blip)
    blip.set(q('r:embed'), rid)
    blip.attrib.pop(q('r:link'), None)
    for c in list(blip):
        blip.remove(c)            # 옛 그림에 걸어 둔 효과·SVG 는 떼어 낸다
    for c in list(blip_fill):
        if local(c.tag) in ('srcRect', 'stretch', 'tile'):
            blip_fill.remove(c)
    l, t, r, b = _crop_rect(ox.image_size(data), box_wh)
    pos = list(blip_fill).index(blip) + 1
    if l or t or r or b:
        blip_fill.insert(pos, ET.Element(q('a:srcRect'), {
            k: str(v) for k, v in (('l', l), ('t', t), ('r', r), ('b', b)) if v}))
        pos += 1
    st = ET.Element(q('a:stretch'))
    ox.sub(st, 'a:fillRect')
    blip_fill.insert(pos, st)


def put_pics(d, part, datas):
    """교육사진 — 양식의 그림 자리에 차례로(위→아래, 왼→오른) 갈아 끼운다.
    남는 자리는 지운다(양식에 들어 있던 남의 교육 사진이 나가지 않게)."""
    slots = [s for s in d.shapes(part, deep=False) if s.kind == 'pic' and is_photo(s.el)]
    slots.sort(key=lambda s: (int(pt(s.y)), int(pt(s.x))))
    tree = d.tree(part)
    n = min(len(slots), len(datas))
    for i in range(n):
        s = slots[i]
        bf, blip = _blip_of(s.el)
        if bf is None:
            continue
        _set_blip(d.pkg, part, bf, datas[i], (s.w, s.h))
    for s in slots[n:]:
        _remove(tree, s.el)


def _remove(tree, el):
    for parent in tree.iter():
        if el in list(parent):
            parent.remove(el)
            return


def put_face(d, part, data):
    """교수 얼굴 — 가장 큰 동그라미의 '칠' 을 사진으로. 테두리·위치는 그대로."""
    best, area = None, 0
    for s in d.shapes(part, deep=False):
        if s.kind != 'sp':
            continue
        sp = s.el.find(q('p:spPr'))
        geo = sp.find(q('a:prstGeom')) if sp is not None else None
        if geo is None or geo.get('prst') != 'ellipse':
            continue
        if s.w * s.h > area:
            best, area = s, s.w * s.h
    if best is None:
        return
    sp = best.el.find(q('p:spPr'))
    fills = ('noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill')
    pos = None
    for i, c in enumerate(list(sp)):
        if local(c.tag) in fills:
            pos = i if pos is None else pos
            sp.remove(c)
    if pos is None:
        pos = 0
        for i, c in enumerate(list(sp)):
            if local(c.tag) in ('xfrm', 'custGeom', 'prstGeom'):
                pos = i + 1
    bf = ET.Element(q('a:blipFill'), {'dpi': '0', 'rotWithShape': '1'})
    sp.insert(pos, bf)
    _set_blip(d.pkg, part, bf, data, (best.w, best.h))
    ln = sp.find(q('a:ln'))
    if ln is None:
        ln = ET.Element(q('a:ln'))
        sp.insert(pos + 1, ln)
    for c in list(ln):
        if local(c.tag) in fills:
            ln.remove(c)
    ln.insert(0, ET.Element(q('a:noFill')))


# ── 이름 바꿔치기 ──────────────────────────────────────

def replace_all(d, frm, to, w=None):
    """양식에 남아 있는 예전 고객사 이름을 이번 건으로. 글자가 여러 조각(run)에
    나뉘어 있어도 잡는다 — 'KT커' + '머스' 처럼 쪼개져 있는 일이 흔하다.

    바꾼 글은 우리가 쓴 글이다. 그래서 두 가지를 같이 한다.
      · 바뀐 조각의 글꼴을 이 제안서의 글꼴로 (Golden Circle 의 'Why' 설명이
        이사만루체로 남아 있던 것이 이것 때문이었다)
      · 글이 길어졌으면 상자를 다시 맞춘다 — 파워포인트는 글을 바꾸면 자동 맞춤
        상자를 늘려 주지만, 파일을 직접 고치면 아무도 안 늘려 준다.
    """
    for part in d.slide_parts():
        for s in d.shapes(part, deep=True):
            if s.kind == 'sp':
                tb = s.txbody()
                if tb is None:
                    continue
                hit = False
                for p in tb.findall(q('a:p')):
                    hit = _replace_para(p, frm, to, w) or hit
                if hit and w is not None:
                    w.touched.add(id(s.el))
                    w.fit(part, s.el, tb, (s.x, s.y, s.w, s.h))
            elif s.kind == 'tbl' and s.top_level:
                hit = False
                for p in s.el.iter(q('a:p')):
                    hit = _replace_para(p, frm, to, w) or hit
                if hit and w is not None:
                    t = Table(s.el)
                    x0, y0, w0, h0 = t.frame_box()
                    _fit_table(w, t, max(h0, _slide_room(d, y0)))
                    t.sync_frame()


def _para_texts(root):
    for p in root.iter(q('a:p')):
        t = ''.join((c.find(q('a:t')).text or '') for c in p
                    if local(c.tag) in ('r', 'fld') and c.find(q('a:t')) is not None).strip()
        if len(t) >= 2:
            yield p, t


def review_texts(d):
    """AI 검수에 보낼 글 — 장마다 문단 글, 그리고 쓰인 레이아웃(머리말)의 글"""
    slides, lays, seen = [], [], set()
    for no, part in enumerate(d.slide_parts(), 1):
        ts = []
        for _p, t in _para_texts(d.pkg.xml(part)):
            if t not in ts:
                ts.append(t)
        slides.append({'no': no, 'texts': ts})
        lay = d.layout_of(part)
        if lay and lay not in seen:
            seen.add(lay)
            for _p, t in _para_texts(d.pkg.xml(lay)):
                if t not in lays:
                    lays.append(t)
    return slides, lays


def _name_swap_only(frm, to, allowed):
    """frm → to 가 '예전 이름 자리에 이번 고객사·과정명을 넣은 것' 뿐인가.
    AI 가 빈 연락처 칸에 'Tel: 02-3274-0000 (담당자 실제…)' 을 지어 넣으려 한 일이 있다 —
    이름 바꾸기가 아닌 고침은 문서에 넣지 않고 사람에게 알리기만 한다."""
    a = 0
    while a < min(len(frm), len(to)) and frm[a] == to[a]:
        a += 1
    b = 0
    while b < min(len(frm), len(to)) - a and frm[len(frm) - 1 - b] == to[len(to) - 1 - b]:
        b += 1
    removed, inserted = frm[a:len(frm) - b].strip(), to[a:len(to) - b].strip()
    if not removed or not inserted:
        return False
    names = [str(n).strip() for n in allowed or [] if n and len(str(n).strip()) >= 2]
    if any(n in removed for n in names):
        return False          # 이미 이번 이름인 것을 바꾸려는 것
    core = re.sub(r'(이|가|을|를|은|는|과|와|의)$', '', inserted).strip()
    return any(core == n or core in names for n in names) or any(
        n in inserted and len(inserted) <= len(n) + 2 for n in names)


def apply_review(d, items, allowed=None):
    """AI 검수가 준 고치기 가운데 **그 장에 글자 그대로 있고, 이름만 바꾸는 것**만 바꾼다.
    바꾼 수를 돌려준다."""
    done = 0
    parts = d.slide_parts()
    for it in items or []:
        if str(it.get('kind') or '') != 'leftover':
            continue
        cands = it.get('pairs') or [[it.get('text'), it.get('fix')]]
        cands = [(str(f or ''), str(t or '')) for f, t in cands]
        cands = [(f, t) for f, t in cands if f and t and f != t and len(f) >= 2 and _name_swap_only(f, t, allowed)]
        if not cands:
            continue
        no = int(it.get('slide') or 0)
        if no == 0:
            targets = [n for n in d.pkg.names()
                       if re.match(r'ppt/(slideLayouts/slideLayout|slideMasters/slideMaster)\d+\.xml$', n)]
        elif 1 <= no <= len(parts):
            targets = [parts[no - 1]]
        else:
            continue
        hit = False
        for frm, to in cands:
            for part in targets:
                for p, _t in list(_para_texts(d.pkg.xml(part))):
                    if _replace_para(p, frm, to):
                        _word_wrap(p)
                        hit = True
            if hit:
                it['text'], it['fix'] = frm, to
                break
        if hit:
            it['applied'] = True
            done += 1
    return done


HEADER_RE = re.compile(r'^\s*20\d\d\s.*(결과\s*보고서|제안서)\s*$')
HEADER_PH = re.compile(r'고객사\s*(이름|명)|과정\s*명|\[')
# 『2025 HMM Learning Curation 영업과정(영업입문, 영업기본)』 — 겹낫표로 감싼 '연도 고객사 과정' 한 줄.
# '결과 보고서' 로 끝나지 않아 위 규칙에 안 걸려, 레이아웃에 예전 고객사가 그대로 남았다.
HEADER_BRACKET_RE = re.compile(r'^\s*『\s*20\d\d\s[^』]+』\s*$')
HEADER_KIND_RE = re.compile(r'\s*(결과\s*보고서|제안서)\s*$')


def set_header(d, header):
    """장마다 머리에 찍히는 '2026 HMM Learning Curation 영업 기본 과정 결과 보고서'.
    이 줄은 장이 아니라 **레이아웃**에 들어 있어서 장을 채워도 바뀌지 않았다 —
    HMM 과정이 아닌데 모든 장 머리에 HMM 이 찍혀 나갔다.
    '20xx … 결과 보고서/제안서' 꼴의 한 줄을 이번 건의 이름으로 바꾼다."""
    parts = [n for n in d.pkg.names()
             if re.match(r'ppt/(slideLayouts/slideLayout|slideMasters/slideMaster)\d+\.xml$', n)]
    parts += d.slide_parts()
    n = 0
    for part in parts:
        root = d.pkg.xml(part)
        for p in root.iter(q('a:p')):
            runs = [c for c in p if local(c.tag) in ('r', 'fld') and c.find(q('a:t')) is not None]
            if not runs:
                continue
            txt = ''.join(r.find(q('a:t')).text or '' for r in runs)
            if len(txt) > 90 or HEADER_PH.search(txt):
                continue
            if HEADER_RE.match(txt):
                new = header
            elif HEADER_BRACKET_RE.match(txt):
                # 겹낫표 줄은 '연도 고객사 과정' 만 — 끝의 '결과 보고서'·'제안서' 는 떼고 겹낫표로 감싼다
                new = '『' + HEADER_KIND_RE.sub('', header).strip() + '』'
            else:
                continue
            if txt.strip() == new:
                continue
            runs[0].find(q('a:t')).text = new
            for r in runs[1:]:
                r.find(q('a:t')).text = ''
            _word_wrap(p)
            n += 1
    return n


def _word_wrap(p):
    """한글을 낱말 단위로 줄 바꿈하게 한다.
    양식(마스터·표)에 latinLnBrk="1"('단어 중간에서 줄 바꿈 허용')이 걸려 있으면
    파워포인트가 '생각하십니 / 까?', '본 과 / 정의' 처럼 낱말을 쪼갠다 (파워포인트로 확인함).
    우리가 쓴 문단에만 0 을 적는다 — 적지 않으면 마스터의 1 을 물려받는다."""
    ppr = p.find(q('a:pPr'))
    if ppr is None:
        ppr = ET.Element(q('a:pPr'))
        p.insert(0, ppr)
    ppr.set('latinLnBrk', '0')


_JOSA = {'이': ('이', '가'), '가': ('이', '가'), '을': ('을', '를'), '를': ('을', '를'),
         '은': ('은', '는'), '는': ('은', '는'), '과': ('과', '와'), '와': ('과', '와')}


def _josa_for(word, josa):
    """word 뒤에 올 조사를 받침에 맞춰 고른다 (josa 는 짝 가운데 아무거나)"""
    pair = _JOSA.get(josa)
    if not pair:
        return josa
    s = re.sub(r'[\s)\]」』"\'”’.]+$', '', str(word or ''))
    if not s:
        return josa
    c = ord(s[-1])
    if 0xAC00 <= c <= 0xD7A3:
        return pair[0] if (c - 0xAC00) % 28 else pair[1]
    if s[-1].isdigit():
        return pair[0] if s[-1] in '013678' else pair[1]
    return pair[1] if s[-1].lower() in 'aeiouy' else pair[0]


def _replace_para(p, frm, to, w=None):
    runs = [c for c in p if local(c.tag) in ('r', 'fld') and c.find(q('a:t')) is not None]
    if not runs:
        return False
    ts = [r.find(q('a:t')) for r in runs]
    texts = [t.text or '' for t in ts]
    joined = ''.join(texts)
    if frm not in joined:
        return False
    before = list(texts)
    starts = []
    acc = 0
    for s in texts:
        starts.append(acc)
        acc += len(s)
    hits = [m.start() for m in re.finditer(re.escape(frm), joined)]
    # 바꾼 말 바로 뒤의 조사를 새 말의 받침에 맞춘다 — 양식의 '왜 [프로그램명]이 필요한가?' 가
    # '… 것인가이 필요한가?' 가 되었다. '[과정명]' 은 받침이 있어 양식이 '이' 를 박아 두었다.
    to_fixed = {}
    for s in hits:
        e = s + len(frm)
        after = joined[e:e + 2]
        m = re.match(r'(이|가|을|를|은|는|과|와)(?![가-힣])', after)
        if m and to:
            to_fixed[s] = _josa_for(to, m.group(1))
    for s in reversed(hits):
        e = s + len(frm)
        if s in to_fixed:
            # 조사 한 글자까지 바꿀 말에 넣어 한꺼번에 갈아 끼운다
            frm_len = len(frm) + 1
            new = to + to_fixed[s]
            i = max(k for k in range(len(texts)) if starts[k] <= s)
            j = max(k for k in range(len(texts)) if starts[k] <= s + frm_len - 1)
            a = texts[i][:s - starts[i]]
            if i == j:
                texts[i] = a + new + texts[i][s + frm_len - starts[i]:]
            else:
                texts[i] = a + new
                for k in range(i + 1, j):
                    texts[k] = ''
                texts[j] = texts[j][s + frm_len - starts[j]:]
            starts = []
            acc = 0
            for s2 in texts:
                starts.append(acc)
                acc += len(s2)
            continue
        i = max(k for k in range(len(texts)) if starts[k] <= s)
        j = max(k for k in range(len(texts)) if starts[k] <= e - 1)
        a = texts[i][:s - starts[i]]
        if i == j:
            texts[i] = a + to + texts[i][e - starts[i]:]
        else:
            texts[i] = a + to
            for k in range(i + 1, j):
                texts[k] = ''
            texts[j] = texts[j][e - starts[j]:]
        starts = []
        acc = 0
        for s2 in texts:
            starts.append(acc)
            acc += len(s2)
    for t, s in zip(ts, texts):
        t.text = s
    if texts != before:
        _word_wrap(p)
    # 한 줄 안에서 바뀐 조각만 글꼴을 바꾸면 한 문장이 두 글씨체로 섞인다.
    # 바뀐 문단은 통째로 이 제안서의 글꼴로.
    if w is not None and texts != before:
        for r in runs:
            rpr = r.find(q('a:rPr'))
            if rpr is not None:
                w.pick_font(rpr)
        end = p.find(q('a:endParaRPr'))
        if end is not None:
            w.pick_font(end)
    return True


# ── 장 복제 · 삭제 ─────────────────────────────────────

def _sections(d):
    root = d.pkg.xml(d.pres)
    out = []
    for el in root.iter():
        if local(el.tag) == 'section':
            lst = None
            for c in el:
                if local(c.tag) == 'sldIdLst':
                    lst = c
            if lst is not None:
                out.append(lst)
    return out


def duplicate(d, no):
    """no 번 장을 복제해 바로 뒤에 넣는다(파워포인트의 '슬라이드 복제' 와 같다)."""
    pkg = d.pkg
    src = d.slide(no)
    new = pkg.free_name('ppt/slides/slide%d.xml')
    pkg.set_xml(new, ox.clone(pkg.xml(src)), like=src)
    for rid, t, tgt, ext in pkg.rels(src):
        if t == ox.RT['notes']:
            continue          # 발표자 노트는 원래 장 것이라 따라가지 않는다
        root = pkg.rels_root(new)
        attrs = {'Id': rid, 'Type': t}
        if ext:
            attrs['Target'] = tgt
            attrs['TargetMode'] = 'External'
        else:
            if t.endswith('/chart') or t.endswith('/oleObject') or t.endswith('/package') \
                    or '/diagram' in t:
                tgt = _copy_part(pkg, tgt)
            attrs['Target'] = pkg.relpath(new, tgt)
        ET.SubElement(root, q('rel:Relationship'), attrs)
    pkg.add_override(new, SLIDE_CT)

    root = pkg.xml(d.pres)
    lst = root.find(q('p:sldIdLst'))
    ids = [int(s.get('id')) for s in lst.findall(q('p:sldId'))]
    nid = max(ids) + 1
    if nid > 2147483647:
        nid = 256
        while nid in ids:
            nid += 1
    rid = pkg.add_rel(d.pres, ox.RT['slide'], new)
    items = lst.findall(q('p:sldId'))
    old = items[no - 1]
    el = ET.Element(q('p:sldId'), {'id': str(nid), q('r:id'): rid})
    lst.insert(list(lst).index(old) + 1, el)
    old_id = old.get('id')
    for sec in _sections(d):
        for i, c in enumerate(list(sec)):
            if c.get('id') == old_id:
                sec.insert(i + 1, ET.Element(c.tag, {'id': str(nid)}))
                break
    return new


def _copy_part(pkg, part):
    base, ext = part.rsplit('.', 1)
    stem = re.sub(r'\d+$', '', base)
    new = pkg.free_name(stem + '%d.' + ext)
    pkg.write(new, pkg.read(part))
    ct = pkg.override_of(part)
    if ct:
        pkg.add_override(new, ct)
    rn = pkg.rels_name(part)
    if pkg.has(rn):
        pkg.write(pkg.rels_name(new), pkg.read(rn))
    return new


# ── 박아 둔 글꼴 덜어 내기 ─────────────────────────────────
#
# 'KMA_인재개발센터 템플릿' 은 45.6MB 인데 그중 34MB 가 파일 안에 박아 둔 글꼴이었다
# (파워포인트 '파일의 글꼴 포함'). 맑은 고딕 두 벌만 12MB, 샘플 장에만 쓰던 나눔바른고딕·
# KoPub·Pretendard 가 18MB. 제안서가 45MB 로 나가 메일 파일이 62MB 가 됐다.
# 처음에는 남은 장이 쓰는 글꼴만 남겼는데(31.7MB), 그래도 메일로 보내기엔 컸다.
# 글꼴을 모두 뺐더니(10.7MB) 이사만루체로 적힌 장(교육 만족도 조사 설계 방향)이
# 그 글꼴이 없는 PC 에서 다른 글꼴로 나왔다. 사용자가 원한 것은 '전부 페이퍼로지'.
# 그래서 unify_fonts 가 먼저 한글 글꼴을 페이퍼로지로 모으고, 여기서는 쓰는 글꼴만 남긴다 —
# 남는 것은 페이퍼로지 몇 벌(한 벌 0.2MB)뿐이라 가볍다.
EMBED_USED = True
SYSTEM_FONTS = {
    '맑은 고딕', 'Malgun Gothic', '굴림', 'Gulim', '굴림체', '돋움', 'Dotum', '돋움체', '바탕', 'Batang',
    'Arial', 'Arial Black', 'Times New Roman', 'Calibri', 'Calibri Light', 'Cambria', 'Segoe UI',
    'Tahoma', 'Verdana', 'Georgia', 'Wingdings', 'Symbol',
}


# ── 글꼴 하나로 모으기 ─────────────────────────────────────
#
# KMA 양식의 본문 글꼴은 페이퍼로지인데, 몇몇 칸은 이사만루체·나눔바른고딕·Pretendard·
# 프리젠테이션·KoPub 으로 적혀 있다. 그 글꼴이 없는 PC 에서는 맑은 고딕 따위로 바뀌어
# 한 장만 글씨가 달라 보인다. 양식이 페이퍼로지를 주 글꼴로 쓰면, 나머지 한글 글꼴을
# 굵기에 맞춰 페이퍼로지로 바꾼다. 시스템 글꼴(맑은 고딕·Arial …)과 기호 글꼴은 두고,
# 페이퍼로지를 쓰지 않는 양식은 건드리지 않는다.
_PAPER = {4: '페이퍼로지 4 Regular', 5: '페이퍼로지 5 Medium', 6: '페이퍼로지 6 SemiBold',
          7: '페이퍼로지 7 Bold', 9: '페이퍼로지 9 Black'}


def _paper_for(face):
    f = face.lower()
    if re.search(r'black|heavy|extrabold|extra bold', f):
        w = 9
    elif re.search(r'semibold|semi bold|demibold', f):
        w = 6
    elif re.search(r'bold', f):
        w = 7
    elif re.search(r'medium', f) or re.search(r'\b5\b', face):
        w = 5
    else:
        w = 4
    return _PAPER[w]


def unify_fonts(d):
    """한글 글꼴을 페이퍼로지로 모은다. 바꾼 글꼴 이름 목록을 돌려준다."""
    pkg = d.pkg
    # 장·레이아웃·마스터·테마에 노트·표 서식까지 — 한 곳이라도 남으면 그 글꼴이 파일에 남는다
    parts = [n for n in pkg.names() if n.endswith('.xml') and n.startswith('ppt/') and n != d.pres]
    count = collections.Counter()
    for n in parts:
        count.update(re.findall(r'typeface="([^"]+)"', pkg.read(n).decode('utf-8', 'ignore')))
    paper = sum(v for k, v in count.items() if k.startswith('페이퍼로지'))
    if not paper:
        return []
    swap = {}
    for face in count:
        if face.startswith('페이퍼로지') or face.startswith('+') or face in SYSTEM_FONTS:
            continue
        if not re.search(r'[가-힣]', face) and face not in ('Pretendard Variable', 'Pretendard',
                                                           'NanumBarunGothic', 'KoPubDotum'):
            continue          # 영문 전용 글꼴(Times New Roman 등)은 두고 한글 글꼴만
        swap[face] = _paper_for(face)
    if not swap:
        return []
    for n in parts:
        root = pkg.xml(n)
        for el in root.iter():
            tf = el.get('typeface')
            if tf in swap:
                el.set('typeface', swap[tf])
                # 글꼴 계열 정보(panose 등)는 원래 글꼴 것이라 떼어 낸다
                for a in ('panose', 'pitchFamily', 'charset'):
                    if a in el.attrib:
                        del el.attrib[a]
    return sorted(swap)


def trim_fonts(d):
    """박아 둔 글꼴을 파일에서 뺀다(EMBED_USED 면 남은 장이 쓰는 것은 남긴다). 줄인 바이트 수를 돌려준다."""
    pkg = d.pkg
    root = pkg.xml(d.pres)
    lst = root.find(q('p:embeddedFontLst'))
    if lst is None:
        return 0
    used = set()
    for n in pkg.names():
        if not n.endswith('.xml') or not n.startswith('ppt/') or n == d.pres:
            continue
        try:
            txt = pkg.read(n).decode('utf-8', 'ignore')
        except KeyError:
            continue
        used.update(re.findall(r'typeface="([^"]+)"', txt))
    before = sum(len(pkg.read(t)) for i, _, t, ext in pkg.rels(d.pres)
                 if not ext and t.startswith('ppt/fonts/') and pkg.has(t))
    for ef in list(lst):
        font = ef.find(q('p:font'))
        face = font.get('typeface') if font is not None else ''
        if EMBED_USED and face in used and face not in SYSTEM_FONTS:
            continue
        for style in ef:
            rid = style.get(q('r:id'))
            if rid:
                pkg.drop_rel(d.pres, rid)
        lst.remove(ef)
    if not len(lst):
        root.remove(lst)
        # 다시 저장할 때 파워포인트가 글꼴을 도로 박아 넣지 않게 표시도 지운다
        for attr in ('embedTrueTypeFonts', 'saveSubsetFonts'):
            if attr in root.attrib:
                del root.attrib[attr]
    pkg.gc()
    after = sum(len(pkg.read(t)) for i, _, t, ext in pkg.rels(d.pres)
                if not ext and t.startswith('ppt/fonts/') and pkg.has(t))
    return before - after


def delete_slide(d, no):
    pkg = d.pkg
    part = d.slide(no)
    root = pkg.xml(d.pres)
    lst = root.find(q('p:sldIdLst'))
    items = lst.findall(q('p:sldId'))
    el = items[no - 1]
    rid = el.get(q('r:id'))
    sid = el.get('id')
    lst.remove(el)
    pkg.drop_rel(d.pres, rid)
    for sec in _sections(d):
        for c in list(sec):
            if c.get('id') == sid:
                sec.remove(c)
    # 사용자 지정 쇼가 가리키던 것도
    cs = root.find(q('p:custShowLst'))
    if cs is not None:
        for show in cs:
            for sl in show.iter():
                if local(sl.tag) == 'sld' and sl.get(q('r:id')) == rid:
                    for par in show.iter():
                        if sl in list(par):
                            par.remove(sl)
    # 나머지(노트·그림)는 gc 가 치운다
    pkg.delete(part)
    pkg.drop_override(part)


# ── 검수 (audit) ───────────────────────────────────────

def audit(deck, was=None, touched=None):
    """글이 상자를 넘쳤는가, 우리가 쓴 자리가 비었는가.

    넘침은 **우리가 쓴 자리만** 본다(touched: 방금 채운 도형, was: 부르는 쪽이 쓴 자리).
    손대지 않은 양식 글은 디자이너가 맞춰 둔 것이다. 어림이 조금 크게 나왔다고
    '넘친다' 고 알리면, 브라우저의 자동 고치기가 협회 소개 글을 잘라 버린다."""
    was = was or {}
    touched = touched if touched is not None else getattr(deck, 'touched', set())
    w = Writer.__new__(Writer)
    w.d = deck
    items = []
    for no, part in enumerate(deck.slide_parts(), 1):
        for s in deck.shapes(part, deep=True):
            mine = id(s.el) in touched or ('%d|%s' % (no, s.name)) in was
            if s.kind == 'tbl' and s.top_level:
                t = Table(s.el)
                rows = table_heights(w, t)
                real = sum(max(int(tr.get('h', 0)), n) for tr, n in zip(t.trs, rows))
                bottom = s.y + real
                if bottom > deck.cy + EMU:
                    items.append({'slide': no, 'name': s.name, 'kind': 'over',
                                  'over': int(pt(bottom - deck.cy)), 'h': int(pt(s.h)),
                                  'text': ''})
                continue
            if s.kind != 'sp':
                continue
            tb = s.txbody()
            txt = body_text(tb) if tb is not None else ''
            flat = re.sub(r'\s+', ' ', txt).strip()
            key = '%d|%s' % (no, s.name)
            if flat:
                if not mine:
                    continue
                # 저절로 커지는 상자도 본다 — 아래 칸을 덮지 않게 높이를 묶어 둔 상자는
                # 글이 그보다 길면 넘친 것이다 (fit 이 높이를 글에 맞췄으면 여기서 같게 나온다)
                need, _ = w.need_h(tb, s.w, dflt=deck.first_size(part, s.el, tb))
                if need > s.h + 3 * EMU:
                    items.append({'slide': no, 'name': s.name, 'kind': 'over',
                                  'over': int(pt(need - s.h)), 'h': int(pt(s.h)),
                                  'text': flat[:120]})
            elif key in was:
                items.append({'slide': no, 'name': s.name, 'kind': 'empty',
                              'over': 0, 'h': int(pt(s.h)), 'text': str(was[key])})
    # 칸이 모자라 끝 줄을 덜어 낸 곳 — 넘친 것은 아니지만 사람이 알아야 한다
    parts = deck.slide_parts()
    for t in getattr(deck, 'trimmed', []) or []:
        no = parts.index(t['part']) + 1 if t.get('part') in parts else 0
        if no:
            items.append({'slide': no, 'name': t.get('name') or '', 'kind': 'trim',
                          'over': 0, 'h': 0, 'lines': t.get('lines', 0), 'text': t.get('last') or ''})
    return {'ok': True, 'count': deck.slide_count(), 'items': items}
