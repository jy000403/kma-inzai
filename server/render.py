# -*- coding: utf-8 -*-
"""슬라이드 미리보기(SVG) — 파워포인트 없이 그린다.

예전에는 파워포인트에게 장마다 PNG 를 뽑아 달라고 했다. 이제는 파일 속 도형을
직접 읽어 SVG 로 그린다. 똑같지는 않다 — 목록에서 '어느 장인지' 알아볼 만큼이면 된다.
  · 도형(사각형·둥근 사각형·타원·선·자유형), 칠·테두리, 회전
  · 글(줄 바꿈·정렬·크기·색·굵기), 표(칸 칠·글), 그림(PNG·JPG·GIF·SVG)
  · 마스터·레이아웃의 배경과 장식 도형
EMF·WMF 그림은 브라우저가 못 그리므로 옅은 상자로 자리만 표시한다.

SVG 를 <img> 로 띄우면 바깥 그림을 불러오지 못한다. 그래서 그림은 data: 로 속에 넣는다.
너무 큰 그림(600KB 넘는 것)은 자리만 그린다 — 목록이 무거워지지 않게.
"""

import base64
import colorsys
import html
import math
import re

from . import ooxml as ox
from .ooxml import q, local
from . import pptx as P

EMU = P.EMU
IMG_MAX = 600 * 1024
SLIDE_IMG_MAX = 3 * 1024 * 1024

_PRST = {'black': '000000', 'white': 'FFFFFF', 'red': 'FF0000', 'green': '008000',
         'blue': '0000FF', 'yellow': 'FFFF00', 'gray': '808080', 'darkGray': 'A9A9A9',
         'lightGray': 'D3D3D3', 'orange': 'FFA500', 'navy': '000080'}
_SYS = {'windowText': '000000', 'window': 'FFFFFF'}
_MAP_DEFAULT = {'bg1': 'lt1', 'tx1': 'dk1', 'bg2': 'lt2', 'tx2': 'dk2'}


def esc(s):
    return html.escape(str(s), quote=True)


class Painter(object):

    def __init__(self, deck):
        self.d = deck
        self.pkg = deck.pkg
        self._theme_cache = {}

    # ── 색 ─────────────────────────────────────────
    def theme(self, master):
        if master in self._theme_cache:
            return self._theme_cache[master]
        colors = {}
        for rid, t, tgt, ext in self.pkg.rels(master):
            if t == ox.RT['theme'] and self.pkg.has(tgt):
                cs = self.pkg.xml(tgt).find('.//' + q('a:clrScheme'))
                if cs is not None:
                    for c in cs:
                        v = None
                        for k in c:
                            if local(k.tag) == 'srgbClr':
                                v = k.get('val')
                            elif local(k.tag) == 'sysClr':
                                v = k.get('lastClr') or _SYS.get(k.get('val'), '000000')
                        if v:
                            colors[local(c.tag)] = v
        cmap = dict(_MAP_DEFAULT)
        cm = self.pkg.xml(master).find(q('p:clrMap'))
        if cm is not None:
            cmap.update(cm.attrib)
        self._theme_cache[master] = (colors, cmap)
        return colors, cmap

    def color(self, el, master, phclr=None):
        """a:srgbClr/schemeClr/… 를 품은 요소 → ('RRGGBB', 불투명도)"""
        if el is None:
            return None
        c = None
        for k in el:
            if local(k.tag) in ('srgbClr', 'schemeClr', 'prstClr', 'sysClr', 'scrgbClr', 'hslClr'):
                c = k
                break
        if c is None:
            return None
        t = local(c.tag)
        if t == 'srgbClr':
            hexv = c.get('val', '000000')
        elif t == 'prstClr':
            hexv = _PRST.get(c.get('val'), '000000')
        elif t == 'sysClr':
            hexv = c.get('lastClr') or _SYS.get(c.get('val'), '000000')
        elif t == 'schemeClr':
            v = c.get('val')
            if v == 'phClr' and phclr:
                hexv = phclr
            else:
                colors, cmap = self.theme(master) if master else ({}, _MAP_DEFAULT)
                v = cmap.get(v, v)
                hexv = colors.get(v, '000000')
        else:
            hexv = '000000'
        alpha = 1.0
        r, g, b = (int(hexv[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        for m in c:
            n, val = local(m.tag), int(m.get('val', 0)) / 100000.0
            if n == 'lumMod':
                l *= val
            elif n == 'lumOff':
                l += val
            elif n == 'tint':
                l = l + (1 - l) * (1 - val)
            elif n == 'shade':
                l *= val
            elif n == 'satMod':
                s *= val
            elif n == 'alpha':
                alpha = val
        l = max(0, min(1, l))
        s = max(0, min(1, s))
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        return '%02X%02X%02X' % (int(r * 255 + .5), int(g * 255 + .5), int(b * 255 + .5)), alpha

    # ── 칠 ─────────────────────────────────────────
    def fill_of(self, sppr, style, master, owner):
        """(svg fill 속성 문자열, defs 조각)"""
        if sppr is not None:
            for k in sppr:
                n = local(k.tag)
                if n == 'noFill':
                    return 'fill="none"', ''
                if n == 'solidFill':
                    c = self.color(k, master)
                    if c:
                        return 'fill="#%s" fill-opacity="%.2f"' % c, ''
                if n == 'gradFill':
                    stops = k.find(q('a:gsLst'))
                    if stops is not None:
                        gid = 'g%d' % id(k)
                        parts = []
                        for gs in stops:
                            c = self.color(gs, master) or ('FFFFFF', 1)
                            parts.append('<stop offset="%.0f%%" stop-color="#%s" stop-opacity="%.2f"/>' % (
                                int(gs.get('pos', 0)) / 1000.0, c[0], c[1]))
                        lin = k.find(q('a:lin'))
                        ang = int(lin.get('ang', 0)) / 60000.0 if lin is not None else 90
                        x2 = 50 + 50 * math.cos(math.radians(ang))
                        y2 = 50 + 50 * math.sin(math.radians(ang))
                        defs = ('<linearGradient id="%s" x1="%.0f%%" y1="%.0f%%" x2="%.0f%%" y2="%.0f%%">%s'
                                '</linearGradient>' % (gid, 100 - x2, 100 - y2, x2, y2, ''.join(parts)))
                        return 'fill="url(#%s)"' % gid, defs
                if n == 'blipFill':
                    return 'fill="#E8E8E8"', ''
                if n == 'grpFill':
                    return 'fill="none"', ''
        if style is not None:
            fr = style.find(q('a:fillRef'))
            if fr is not None and fr.get('idx') not in (None, '0'):
                c = self.color(fr, master)
                if c:
                    return 'fill="#%s" fill-opacity="%.2f"' % c, ''
        return 'fill="none"', ''

    def line_of(self, sppr, style, master):
        ln = sppr.find(q('a:ln')) if sppr is not None else None
        if ln is not None:
            if ln.find(q('a:noFill')) is not None:
                return 'stroke="none"'
            sf = ln.find(q('a:solidFill'))
            w = max(0.5, int(ln.get('w', 9525)) / EMU)
            if sf is not None:
                c = self.color(sf, master) or ('000000', 1)
                return 'stroke="#%s" stroke-opacity="%.2f" stroke-width="%.2f"' % (c[0], c[1], w)
        if style is not None:
            lr = style.find(q('a:lnRef'))
            if lr is not None and lr.get('idx') not in (None, '0'):
                c = self.color(lr, master)
                if c:
                    return 'stroke="#%s" stroke-opacity="%.2f" stroke-width="0.75"' % c
        return 'stroke="none"'

    # ── 그림 ───────────────────────────────────────
    def image(self, owner, rid, budget):
        tgt = self.pkg.target(owner, rid)
        if not tgt or not self.pkg.has(tgt):
            return None
        ext = tgt.rsplit('.', 1)[-1].lower()
        mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                'gif': 'image/gif', 'svg': 'image/svg+xml'}.get(ext)
        if not mime:
            return None
        data = self.pkg.read(tgt)
        if len(data) > IMG_MAX or budget[0] + len(data) > SLIDE_IMG_MAX:
            return None
        budget[0] += len(data)
        size = ox.image_size(data) if ext != 'svg' else None
        return 'data:%s;base64,%s' % (mime, base64.b64encode(data).decode('ascii')), size

    # ── 한 장 ──────────────────────────────────────
    def slide(self, part):
        d = self.d
        W, H = d.cx / EMU, d.cy / EMU
        lay = d.layout_of(part)
        mas = d.master_of(lay) if lay else None
        out, defs = [], []
        budget = [0]

        bg = '#FFFFFF'
        for p in (part, lay, mas):
            if not p:
                continue
            b = d.pkg.xml(p).find(q('p:cSld')).find(q('p:bg'))
            if b is None:
                continue
            pr = b.find(q('p:bgPr'))
            if pr is not None:
                sf = pr.find(q('a:solidFill'))
                if sf is not None:
                    c = self.color(sf, mas)
                    bg = '#' + c[0] if c else bg
                bf = pr.find(q('a:blipFill'))
                if bf is not None:
                    blip = bf.find(q('a:blip'))
                    img = self.image(p, blip.get(q('r:embed')), budget) if blip is not None else None
                    if img:
                        out.append('<image href="%s" x="0" y="0" width="%.1f" height="%.1f" '
                                   'preserveAspectRatio="none"/>' % (img[0], W, H))
            ref = b.find(q('p:bgRef'))
            if ref is not None:
                c = self.color(ref, mas)
                bg = '#' + c[0] if c else bg
            break
        head = ['<rect width="%.1f" height="%.1f" fill="%s"/>' % (W, H, bg)]

        def show_master(p):
            c = d.pkg.xml(p).find(q('p:cSld')) if p else None
            root = d.pkg.xml(p) if p else None
            return root is None or root.get('showMasterSp') != '0'

        layers = []
        if mas and show_master(part) and show_master(lay):
            layers.append(mas)
        if lay and show_master(part):
            layers.append(lay)
        for p in layers:
            for s in d.shapes(p, deep=True):
                if s.ph is not None or s.kind == 'grp':
                    continue
                self.shape(p, s, mas, out, defs, budget)
        for s in d.shapes(part, deep=True):
            if s.kind == 'grp':
                continue
            self.shape(part, s, mas, out, defs, budget)
        return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.1f %.1f" '
                'width="%.0f" height="%.0f" font-family="Paperlogy, \'페이퍼로지 4 Regular\', '
                '\'Pretendard\', \'Noto Sans KR\', \'Malgun Gothic\', sans-serif">'
                '<defs>%s</defs>%s%s</svg>') % (W, H, W, H, ''.join(defs), ''.join(head), ''.join(out))

    def shape(self, owner, s, master, out, defs, budget):
        x, y, w, h = s.x / EMU, s.y / EMU, s.w / EMU, s.h / EMU
        if w <= 0 and h <= 0:
            return
        el = s.el
        sppr = el.find(q('p:spPr'))
        style = el.find(q('p:style'))
        tr = ''
        xf = sppr.find(q('a:xfrm')) if sppr is not None else None
        if xf is not None:
            rot = int(xf.get('rot', 0)) / 60000.0
            if rot:
                tr = ' transform="rotate(%.1f %.1f %.1f)"' % (rot, x + w / 2, y + h / 2)

        if s.kind == 'pic':
            bf = el.find(q('p:blipFill'))
            blip = bf.find(q('a:blip')) if bf is not None else None
            img = self.image(owner, blip.get(q('r:embed')), budget) if blip is not None else None
            if not img:
                out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#EEF1F5" '
                           'stroke="#D5DAE1" stroke-width="0.5"%s/>' % (x, y, w, h, tr))
                return
            href, size = img
            src = bf.find(q('a:srcRect'))
            if src is not None and size:
                iw, ih = size
                l, t_ = int(src.get('l', 0)) / 1e5, int(src.get('t', 0)) / 1e5
                r_, b_ = int(src.get('r', 0)) / 1e5, int(src.get('b', 0)) / 1e5
                vx, vy = iw * l, ih * t_
                vw, vh = iw * (1 - l - r_), ih * (1 - t_ - b_)
                out.append('<svg x="%.1f" y="%.1f" width="%.1f" height="%.1f" viewBox="%.1f %.1f %.1f %.1f" '
                           'preserveAspectRatio="none"%s><image href="%s" width="%d" height="%d"/></svg>'
                           % (x, y, w, h, vx, vy, max(vw, 1), max(vh, 1), tr, href, iw, ih))
            else:
                out.append('<image href="%s" x="%.1f" y="%.1f" width="%.1f" height="%.1f" '
                           'preserveAspectRatio="none"%s/>' % (href, x, y, w, h, tr))
            return

        if s.kind == 'tbl':
            self.table(owner, s, master, out)
            return

        if s.kind in ('sp', 'cxn'):
            fill, gdef = self.fill_of(sppr, style, master, owner)
            if gdef:
                defs.append(gdef)
            line = self.line_of(sppr, style, master)
            geo = sppr.find(q('a:prstGeom')) if sppr is not None else None
            prst = geo.get('prst') if geo is not None else ('custom' if sppr is not None and
                                                            sppr.find(q('a:custGeom')) is not None else 'rect')
            # 얼굴 자리처럼 도형 칠이 그림인 경우
            if sppr is not None and sppr.find(q('a:blipFill')) is not None:
                blip = sppr.find(q('a:blipFill')).find(q('a:blip'))
                img = self.image(owner, blip.get(q('r:embed')), budget) if blip is not None else None
                if img:
                    cid = 'c%d' % id(el)
                    shape_el = self.geom(prst, x, y, w, h, sppr, 'fill="#000"', '')
                    defs.append('<clipPath id="%s">%s</clipPath>' % (cid, shape_el))
                    out.append('<image href="%s" x="%.1f" y="%.1f" width="%.1f" height="%.1f" '
                               'preserveAspectRatio="xMidYMid slice" clip-path="url(#%s)"/>'
                               % (img[0], x, y, w, h, cid))
                    fill = 'fill="none"'
            if s.kind == 'cxn' or prst in ('line', 'straightConnector1'):
                x1, y1, x2, y2 = x, y, x + w, y + h
                if xf is not None and xf.get('flipH') == '1':
                    x1, x2 = x2, x1
                if xf is not None and xf.get('flipV') == '1':
                    y1, y2 = y2, y1
                if 'stroke="none"' in line:
                    line = 'stroke="#000" stroke-width="0.75"'
                out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" %s/>' % (x1, y1, x2, y2, line))
                return
            if not ('fill="none"' in fill and 'stroke="none"' in line):
                out.append(self.geom(prst, x, y, w, h, sppr, fill + ' ' + line, tr))
            tb = s.txbody()
            if tb is not None and P.body_text(tb).strip():
                self.text(owner, s, tb, (x, y, w, h), master, out, style, tr)

    def geom(self, prst, x, y, w, h, sppr, attrs, tr):
        if prst == 'ellipse':
            return '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" %s%s/>' % (
                x + w / 2, y + h / 2, w / 2, h / 2, attrs, tr)
        if prst in ('roundRect', 'round2SameRect', 'round1Rect', 'round2DiagRect', 'snipRoundRect'):
            adj = 16667
            geo = sppr.find(q('a:prstGeom'))
            av = geo.find(q('a:avLst')) if geo is not None else None
            if av is not None:
                for gd in av:
                    m = re.search(r'val (\d+)', gd.get('fmla', ''))
                    if m:
                        adj = int(m.group(1))
                        break
            r = min(w, h) * adj / 100000.0
            return '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" %s%s/>' % (
                x, y, w, h, r, attrs, tr)
        if prst in ('triangle',):
            return '<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f" %s%s/>' % (
                x + w / 2, y, x + w, y + h, x, y + h, attrs, tr)
        if prst in ('homePlate', 'chevron', 'rightArrow'):
            k = min(w, h) * 0.5
            if prst == 'chevron':
                pts = [(x, y), (x + w - k, y), (x + w, y + h / 2), (x + w - k, y + h), (x, y + h), (x + k, y + h / 2)]
            else:
                pts = [(x, y), (x + w - k, y), (x + w, y + h / 2), (x + w - k, y + h), (x, y + h)]
            return '<polygon points="%s" %s%s/>' % (' '.join('%.1f,%.1f' % p for p in pts), attrs, tr)
        if prst == 'custom':
            path = self.cust(sppr, x, y, w, h)
            if path:
                return '<path d="%s" %s%s/>' % (path, attrs, tr)
        return '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" %s%s/>' % (x, y, w, h, attrs, tr)

    def cust(self, sppr, x, y, w, h):
        cg = sppr.find(q('a:custGeom'))
        pl = cg.find(q('a:pathLst')) if cg is not None else None
        if pl is None:
            return ''
        out = []
        for path in pl:
            pw = int(path.get('w', 0)) or 1
            ph = int(path.get('h', 0)) or 1
            sx, sy = w / pw, h / ph

            def pt_(e):
                return '%.1f,%.1f' % (x + int(e.get('x', 0)) * sx, y + int(e.get('y', 0)) * sy)
            for c in path:
                n = local(c.tag)
                pts = c.findall(q('a:pt'))
                if n == 'moveTo' and pts:
                    out.append('M' + pt_(pts[0]))
                elif n == 'lnTo' and pts:
                    out.append('L' + pt_(pts[0]))
                elif n == 'cubicBezTo' and len(pts) == 3:
                    out.append('C' + ' '.join(pt_(p) for p in pts))
                elif n == 'quadBezTo' and len(pts) == 2:
                    out.append('Q' + ' '.join(pt_(p) for p in pts))
                elif n == 'close':
                    out.append('Z')
        return ' '.join(out)

    # ── 글 ─────────────────────────────────────────
    def text(self, owner, s, tb, box, master, out, style, tr):
        x, y, w, h = box
        bp = tb.find(q('a:bodyPr'))
        g = (lambda k, dflt: int(bp.get(k, dflt)) / EMU if bp is not None else dflt / EMU)
        li, ri, ti, bi = g('lIns', 91440), g('rIns', 91440), g('tIns', 45720), g('bIns', 45720)
        wrap = (bp.get('wrap') if bp is not None else None) != 'none'
        anchor = (bp.get('anchor') if bp is not None else None) or 't'
        dflt = self.d.first_size(owner, s.el, tb)
        base_color = None
        if style is not None:
            fr = style.find(q('a:fontRef'))
            if fr is not None:
                c = self.color(fr, master)
                base_color = c[0] if c else None
        lines = []
        for p in tb.findall(q('a:p')):
            ppr = p.find(q('a:pPr'))
            algn = (ppr.get('algn') if ppr is not None else None) or 'l'
            rpr = P._first_rpr(p)
            sz = int(rpr.get('sz')) / 100.0 if rpr is not None and rpr.get('sz') else dflt
            bold = rpr is not None and rpr.get('b') == '1'
            col = None
            if rpr is not None:
                c = self.color(rpr.find(q('a:solidFill')), master) if rpr.find(q('a:solidFill')) is not None else None
                col = c[0] if c else None
            face = ''
            if rpr is not None:
                ea = rpr.find(q('a:ea'))
                face = ea.get('typeface', '') if ea is not None else ''
            if not bold and re.search(r'Bold|Black|SemiBold|ExtraBold|굵', face):
                bold = True
            col = col or base_color or '222222'
            bullet = ''
            if ppr is not None and ppr.find(q('a:buChar')) is not None:
                bullet = ppr.find(q('a:buChar')).get('char', '•') + ' '
            ls = 1.0
            if ppr is not None and ppr.find(q('a:lnSpc')) is not None:
                pct = ppr.find(q('a:lnSpc')).find(q('a:spcPct'))
                if pct is not None:
                    ls = int(pct.get('val', 100000)) / 100000.0
            txt = ''.join((c.find(q('a:t')).text or '') if local(c.tag) in ('r', 'fld') and
                          c.find(q('a:t')) is not None else ('\n' if local(c.tag) == 'br' else '')
                          for c in p)
            anywhere = not (ppr is not None and ppr.get('latinLnBrk') == '0')
            width = w - li - ri
            segs = []
            for seg in (bullet + txt).split('\n'):
                segs += split_lines(seg, sz, width, anywhere) if wrap else [seg]
            for sg in segs:
                lines.append((sg, sz, bold, col, algn, sz * P.K_LINE * ls))
        total = sum(l[5] for l in lines)
        if anchor == 'ctr':
            cy = y + ti + (h - ti - bi - total) / 2
        elif anchor == 'b':
            cy = y + h - bi - total
        else:
            cy = y + ti
        parts = []
        for sg, sz, bold, col, algn, lh in lines:
            cy += lh
            if not sg.strip():
                continue
            if algn == 'ctr':
                tx, anc = x + w / 2, 'middle'
            elif algn == 'r':
                tx, anc = x + w - ri, 'end'
            else:
                tx, anc = x + li, 'start'
            parts.append('<text x="%.1f" y="%.1f" font-size="%.1f" fill="#%s" text-anchor="%s"%s>%s</text>' % (
                tx, cy - lh * 0.22, sz, col, anc, ' font-weight="700"' if bold else '', esc(sg)))
        if parts:
            out.append('<g%s>%s</g>' % (tr, ''.join(parts)))

    def table(self, owner, s, master, out):
        t = P.Table(s.el)
        widths = [cw / EMU for cw in t.col_w()]
        x0, y = s.x / EMU, s.y / EMU
        for r, tr_ in enumerate(t.trs, 1):
            rh = int(tr_.get('h', 0)) / EMU
            x = x0
            for c, tc in enumerate(tr_.findall(q('a:tc')), 1):
                cw = widths[c - 1] if c - 1 < len(widths) else 0
                if tc.get('hMerge') == '1' or tc.get('vMerge') == '1':
                    x += cw
                    continue
                span = int(tc.get('gridSpan', 1))
                rspan = int(tc.get('rowSpan', 1))
                ww = sum(widths[c - 1:c - 1 + span])
                hh = sum(int(t.trs[k].get('h', 0)) / EMU for k in range(r - 1, min(r - 1 + rspan, t.rows)))
                pr = tc.find(q('a:tcPr'))
                fill = '#FFFFFF' if r > 1 else '#EEF1F5'
                if pr is not None:
                    sf = pr.find(q('a:solidFill'))
                    if sf is not None:
                        cc = self.color(sf, master)
                        fill = '#' + cc[0] if cc else fill
                    elif pr.find(q('a:noFill')) is not None:
                        fill = 'none'
                out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s" '
                           'stroke="#C9CED6" stroke-width="0.4"/>' % (x, y, ww, hh, fill))
                tb = tc.find(q('a:txBody'))
                if tb is not None and P.body_text(tb).strip():
                    fake = type('S', (), {})()
                    fake.el = tc
                    self.text(owner, fake, tb, (x, y, ww, hh), master, out, None, '')
                x += cw
            y += rh


def split_lines(s, sz, width, anywhere=True):
    """wrap_lines 와 같은 규칙으로 실제 줄을 나눈다."""
    if width <= 1 or not s:
        return [s]
    out, cur, cw = [], '', 0.0
    if anywhere:
        for ch in s:
            w = P.char_w(ch, sz)
            if cw + w > width and cur and ch != ' ':
                out.append(cur)
                cur, cw = ch, w
            else:
                cur += ch
                cw += w
        out.append(cur)
        return out
    for wd in re.findall(r'\S+|\s+', s):
        w = P.text_w(wd, sz)
        if cw + w <= width or not cur:
            cur += wd
            cw += w
        else:
            out.append(cur.rstrip())
            cur, cw = wd.lstrip(), P.text_w(wd.lstrip(), sz)
    out.append(cur)
    return out


def slides_svg(data):
    """[svg 글자, …] — 장 순서대로"""
    d = P.Deck(data)
    p = Painter(d)
    out = []
    for part in d.slide_parts():
        try:
            out.append(p.slide(part))
        except Exception:  # noqa: BLE001
            W, H = d.cx / EMU, d.cy / EMU
            out.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.1f %.1f">'
                       '<rect width="100%%" height="100%%" fill="#F3F4F6"/></svg>' % (W, H))
    return out
