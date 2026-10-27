# -*- coding: utf-8 -*-
"""오피스 파일(.pptx · .xlsx) 속을 직접 여닫는 도구 — 표준 라이브러리만.

오피스 파일은 zip 안에 XML 이 든 꾸러미다. 파워포인트·엑셀을 띄우지 않고
그 XML 을 고쳐 다시 묶으면, 윈도우도 오피스도 없는 곳(Vercel)에서도 돈다.

까다로운 곳이 하나 있다 — **이름공간(namespace)**.
ElementTree 는 저장할 때 '실제로 쓰인' 이름공간만 적는다. 그런데 오피스 XML 은
mc:Ignorable="p14 a14" 처럼 **글자로만** 이름공간을 가리키는 곳이 있어서,
그 선언을 빠뜨리면 파워포인트가 '파일이 손상되었습니다' 를 띄운다.
그래서 읽을 때 본 선언을 다 기억해 두었다가, 저장할 때 빠진 것을 되붙인다.
"""

import copy
import io
import posixpath
import re
import struct
import xml.etree.ElementTree as ET
import zipfile

NS = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
    'ct': 'http://schemas.openxmlformats.org/package/2006/content-types',
    'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'xdr': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'p14': 'http://schemas.microsoft.com/office/powerpoint/2010/main',
    'ep': 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
    'vt': 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes',
    'xml': 'http://www.w3.org/XML/1998/namespace',
}

RT = {
    'slide': NS['r'] + '/slide',
    'layout': NS['r'] + '/slideLayout',
    'master': NS['r'] + '/slideMaster',
    'notes': NS['r'] + '/notesSlide',
    'image': NS['r'] + '/image',
    'theme': NS['r'] + '/theme',
    'sheet': NS['r'] + '/worksheet',
    'calc': NS['r'] + '/calcChain',
}

CT_SLIDE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'

IMAGE_CT = {
    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif',
    'webp': 'image/webp', 'bmp': 'image/bmp', 'svg': 'image/svg+xml',
    'emf': 'image/x-emf', 'wmf': 'image/x-wmf', 'tif': 'image/tiff', 'tiff': 'image/tiff',
}

XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

_RESERVED = re.compile(r'ns\d+$')


def q(tag):
    """'a:t' → '{http://…/main}t'"""
    if ':' not in tag:
        return tag
    p, local = tag.split(':', 1)
    return '{%s}%s' % (NS[p], local)


def local(tag):
    return tag.rsplit('}', 1)[-1]


# ── XML 읽기·쓰기 ───────────────────────────────────────

def parse(data):
    """(root, 선언 목록). 한 번만 훑는다."""
    decls = []
    root = None
    for ev, obj in ET.iterparse(io.BytesIO(data), events=('start-ns', 'start')):
        if ev == 'start-ns':
            decls.append(obj)
        elif root is None:
            root = obj
    # 이 문서가 쓰던 접두사를 그대로 쓰게 한다 — 그래야 mc:Ignorable 글자와 맞는다
    for pfx, uri in decls:
        if pfx and not _RESERVED.match(pfx):
            try:
                ET.register_namespace(pfx, uri)
            except ValueError:
                pass
    return root, decls


def dump(root, decls):
    default = None
    for pfx, uri in decls:
        if pfx == '':
            default = uri
            break
    body = ET.tostring(root, encoding='unicode')

    # 기본 이름공간 되돌리기.
    # ElementTree 의 default_namespace 는 속성에 접두사가 없으면(오피스 XML 은 늘 그렇다)
    # 거부한다. 그래서 그냥 저장하면 <ns0:Types xmlns:ns0="…"> 처럼 나온다.
    # 파워포인트·엑셀은 읽어 주지만, 오피스가 쓰는 모양이 아니고 까다로운 뷰어는 못 연다.
    # 그 접두사를 찾아 꼬리표에서 떼고 xmlns="…" 로 선언한다.
    if default:
        m0 = re.match(r'<[^>]*?>', body)
        start = m0.group(0) if m0 else ''
        pm = re.search(r'xmlns:([\w.-]+)="%s"' % re.escape(default), start)
        if pm:
            pfx = pm.group(1)
            body = re.sub(r'<(/?)%s:' % re.escape(pfx), r'<\1', body)
            # 접두사 붙은 속성이 있을 수 있어 그 선언은 남긴다 (없으면 곧 지운다)
            if re.search(r'\s%s:[\w.-]+=' % re.escape(pfx), body):
                body = body.replace('xmlns:%s="%s"' % (pfx, default),
                                    'xmlns="%s" xmlns:%s="%s"' % (default, pfx, default), 1)
            else:
                body = body.replace('xmlns:%s="%s"' % (pfx, default), 'xmlns="%s"' % default, 1)

    # 여는 꼬리표에 빠진 선언을 되붙인다
    m = re.match(r'<[^>]*?(/?)>', body)
    if m:
        start = m.group(0)
        seen = set(re.findall(r'xmlns:([\w.-]+)=', start))
        add = []
        for pfx, uri in decls:
            if not pfx or pfx in seen or _RESERVED.match(pfx):
                continue
            seen.add(pfx)
            add.append(' xmlns:%s="%s"' % (pfx, uri))
        if add:
            cut = len(start) - (2 if m.group(1) else 1)
            body = start[:cut] + ''.join(add) + start[cut:] + body[len(start):]
    return (XML_HEAD + body).encode('utf-8')


def sub(parent, tag, attrib=None, index=None):
    el = ET.Element(q(tag), attrib or {})
    if index is None:
        parent.append(el)
    else:
        parent.insert(index, el)
    return el


def clone(el):
    return copy.deepcopy(el)


# ── 꾸러미 ─────────────────────────────────────────────

class Package:
    """zip 한 벌. 부품 이름은 'ppt/slides/slide1.xml' 처럼 앞 / 없이 쓴다."""

    def __init__(self, data):
        zf = zipfile.ZipFile(io.BytesIO(data))
        self.order = [i.filename for i in zf.infolist() if not i.filename.endswith('/')]
        self.raw = {n: zf.read(n) for n in self.order}
        self._xml = {}

    # 부품
    def has(self, name):
        return name in self.raw or name in self._xml

    def names(self):
        return list(self.order)

    def read(self, name):
        if name in self._xml:
            root, decls = self._xml[name]
            return dump(root, decls)
        return self.raw[name]

    def write(self, name, data):
        self._xml.pop(name, None)
        self.raw[name] = data
        if name not in self.order:
            self.order.append(name)

    def delete(self, name):
        self._xml.pop(name, None)
        self.raw.pop(name, None)
        if name in self.order:
            self.order.remove(name)

    def xml(self, name):
        if name not in self._xml:
            self._xml[name] = parse(self.raw[name])
        return self._xml[name][0]

    def set_xml(self, name, root, like=None):
        """새 XML 부품. like 를 주면 그 부품의 선언을 물려받는다."""
        decls = list(self._xml[like][1]) if like and like in self._xml else []
        if like and not decls and like in self.raw:
            decls = parse(self.raw[like])[1]
        self._xml[name] = (root, decls)
        self.raw.setdefault(name, b'')
        if name not in self.order:
            self.order.append(name)

    def decls(self, name):
        self.xml(name)
        return self._xml[name][1]

    def save(self):
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
            # 관례대로 [Content_Types].xml 을 맨 앞에
            names = sorted(self.order, key=lambda n: 0 if n == '[Content_Types].xml' else 1)
            for n in names:
                data = self.read(n)
                zi = zipfile.ZipInfo(n, date_time=(2026, 1, 1, 0, 0, 0))
                zi.compress_type = zipfile.ZIP_DEFLATED
                zf.writestr(zi, data)
        return out.getvalue()

    # 관계(rels)
    @staticmethod
    def rels_name(part):
        d, f = posixpath.split(part)
        return posixpath.join(d, '_rels', f + '.rels')

    @staticmethod
    def resolve(part, target):
        if target.startswith('/'):
            return target.lstrip('/')
        return posixpath.normpath(posixpath.join(posixpath.dirname(part), target))

    @staticmethod
    def relpath(from_part, to_part):
        return posixpath.relpath(to_part, posixpath.dirname(from_part) or '.')

    def rels(self, part):
        """관계 목록 [(rId, type, 절대경로|외부주소, 외부여부)]"""
        rn = self.rels_name(part)
        if not self.has(rn):
            return []
        out = []
        for r in self.xml(rn):
            mode = r.get('TargetMode') == 'External'
            tgt = r.get('Target') or ''
            out.append((r.get('Id'), r.get('Type'), tgt if mode else self.resolve(part, tgt), mode))
        return out

    def rels_root(self, part):
        rn = self.rels_name(part)
        if not self.has(rn):
            root = ET.Element(q('rel:Relationships'))
            self._xml[rn] = (root, [('', NS['rel'])])
            self.raw[rn] = b''
            self.order.append(rn)
        return self.xml(rn)

    def add_rel(self, part, rtype, target_abs):
        root = self.rels_root(part)
        used = {r.get('Id') for r in root}
        n = 1
        while 'rId%d' % n in used:
            n += 1
        rid = 'rId%d' % n
        ET.SubElement(root, q('rel:Relationship'), {
            'Id': rid, 'Type': rtype, 'Target': self.relpath(part, target_abs)})
        return rid

    def drop_rel(self, part, rid):
        root = self.rels_root(part)
        for r in list(root):
            if r.get('Id') == rid:
                root.remove(r)

    def target(self, part, rid):
        for i, t, tgt, ext in self.rels(part):
            if i == rid:
                return tgt
        return None

    # 내용 형식
    def ctypes(self):
        return self.xml('[Content_Types].xml')

    def ensure_default(self, ext, ctype):
        root = self.ctypes()
        for d in root.findall(q('ct:Default')):
            if (d.get('Extension') or '').lower() == ext.lower():
                return
        el = ET.Element(q('ct:Default'), {'Extension': ext, 'ContentType': ctype})
        # Default 는 Override 보다 앞에 둔다
        idx = 0
        for i, c in enumerate(list(root)):
            if local(c.tag) == 'Default':
                idx = i + 1
        root.insert(idx, el)

    def add_override(self, part, ctype):
        root = self.ctypes()
        pn = '/' + part
        for o in root.findall(q('ct:Override')):
            if o.get('PartName') == pn:
                o.set('ContentType', ctype)
                return
        ET.SubElement(root, q('ct:Override'), {'PartName': pn, 'ContentType': ctype})

    def drop_override(self, part):
        root = self.ctypes()
        pn = '/' + part
        for o in list(root.findall(q('ct:Override'))):
            if o.get('PartName') == pn:
                root.remove(o)

    def override_of(self, part):
        pn = '/' + part
        for o in self.ctypes().findall(q('ct:Override')):
            if o.get('PartName') == pn:
                return o.get('ContentType')
        return None

    def free_name(self, pattern, start=1):
        """'ppt/media/image%d.png' → 안 쓰는 번호"""
        n = start
        while self.has(pattern % n):
            n += 1
        return pattern % n

    def add_media(self, owner, data, ext=None):
        """그림 부품을 넣고 owner 에서 가리키는 rId 를 돌려준다."""
        ext = (ext or sniff_ext(data) or 'png').lower()
        if ext == 'jpeg':
            ext = 'jpg'
        name = self.free_name('ppt/media/image%d.' + ext)
        self.write(name, data)
        self.ensure_default(ext, IMAGE_CT.get(ext, 'application/octet-stream'))
        return self.add_rel(owner, RT['image'], name)

    def gc(self):
        """어디서도 가리키지 않는 부품을 지운다 — 뺀 장의 그림이 파일에 남지 않게.

        27장짜리 양식에서 샘플 장을 빼면 그 장에만 쓰던 그림이 수십 MB 남는다.
        그대로 두면 메일에 붙일 수 없을 만큼 무거워진다.
        """
        seen = set()
        # 루트 관계는 '_rels/.rels'
        todo = []
        if self.has('_rels/.rels'):
            for r in self.xml('_rels/.rels'):
                if r.get('TargetMode') != 'External':
                    todo.append(self.resolve('', r.get('Target') or ''))
        while todo:
            p = todo.pop()
            if p in seen or not self.has(p):
                continue
            seen.add(p)
            for rid, t, tgt, ext in self.rels(p):
                if not ext and tgt not in seen:
                    todo.append(tgt)
        keep = set(seen) | {'[Content_Types].xml', '_rels/.rels'}
        for p in list(seen):
            keep.add(self.rels_name(p))
        for n in list(self.order):
            if n not in keep:
                self.delete(n)
                self.drop_override(n)
        # 가리키는 부품이 사라진 관계 파일도 치운다
        for n in list(self.order):
            if n.endswith('.rels') and n != '_rels/.rels':
                owner = posixpath.join(posixpath.dirname(posixpath.dirname(n)),
                                       posixpath.basename(n)[:-5])
                if not self.has(owner):
                    self.delete(n)


# ── 그림 크기 ───────────────────────────────────────────

def sniff_ext(data):
    h = data[:16]
    if h.startswith(b'\x89PNG'):
        return 'png'
    if h.startswith(b'\xff\xd8'):
        return 'jpg'
    if h[:6] in (b'GIF87a', b'GIF89a'):
        return 'gif'
    if h[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'webp'
    if h[:2] == b'BM':
        return 'bmp'
    if b'<svg' in data[:512]:
        return 'svg'
    return None


def image_size(data):
    """(가로, 세로) 픽셀. 모르면 None."""
    try:
        kind = sniff_ext(data)
        if kind == 'png':
            return struct.unpack('>II', data[16:24])
        if kind == 'gif':
            return struct.unpack('<HH', data[6:10])
        if kind == 'bmp':
            w, h = struct.unpack('<ii', data[18:26])
            return abs(w), abs(h)
        if kind == 'webp':
            chunk = data[12:16]
            if chunk == b'VP8 ':
                w, h = struct.unpack('<HH', data[26:30])
                return w & 0x3fff, h & 0x3fff
            if chunk == b'VP8L':
                b = data[21:25]
                w = 1 + (((b[1] & 0x3f) << 8) | b[0])
                h = 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6))
                return w, h
            if chunk == b'VP8X':
                w = 1 + int.from_bytes(data[24:27], 'little')
                h = 1 + int.from_bytes(data[27:30], 'little')
                return w, h
        if kind == 'jpg':
            i = 2
            n = len(data)
            while i < n - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                seg = struct.unpack('>H', data[i + 2:i + 4])[0]
                if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                    h, w = struct.unpack('>HH', data[i + 5:i + 9])
                    return w, h
                i += 2 + seg
    except Exception:  # noqa: BLE001
        return None
    return None
