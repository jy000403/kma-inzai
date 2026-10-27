# -*- coding: utf-8 -*-
"""강사 프로필 · 강사 목록 (studio.kma.or.kr 읽기 전용)"""

import base64
import datetime
import json
import re
import time

from .config import cache_read_path, cache_write_path


# ── 강사 프로필 (KMA 강사플랫폼) ────────────────────────────────────
#
# studio.kma.or.kr 의 강사 페이지를 읽어 제안서의 '추천 교수' 칸을 채운다.
# 읽기만 한다 — 로그인도, 글 남기기도 하지 않는다.
#
# 페이지는 <section><h2>소개</h2>…</section> 꼴로 규칙적이라
# 그 머리글을 기준으로 잘라 낸다.

TEACHER_HOST = 'https://studio.kma.or.kr'
_TAG = re.compile(r'<[^>]+>')
_SEC = re.compile(r'<section[^>]*>(.*?)</section>', re.S | re.I)
_H2 = re.compile(r'<h2[^>]*>(.*?)</h2>', re.S | re.I)
_LI = re.compile(r'<li[^>]*>(.*?)</li>', re.S | re.I)


def _plain(html):
    s = re.sub(r'<br\s*/?>', '\n', html or '', flags=re.I)
    s = _TAG.sub(' ', s)
    s = (s.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
          .replace('&quot;', '"').replace('&#39;', "'").replace('&nbsp;', ' '))
    return re.sub(r'[ \t]+', ' ', s).strip()


def teacher_fetch(job):
    """강사 한 명의 프로필을 읽어 온다."""
    raw = str(job.get('url') or job.get('id') or '').strip()
    m = re.search(r'ai-teacher/(\d+)', raw) or re.fullmatch(r'\d+', raw)
    if not m:
        return 400, {'error': 'bad_id',
                     'message': '강사 주소나 번호를 넣어 주세요 (예: .../ai-teacher/1809).'}
    tid = m.group(1) if m.lastindex else m.group(0)
    url = '%s/member/ai-teacher/%s' % (TEACHER_HOST, tid)

    import urllib.request
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; KMA-internal-tool)',
        'Accept': 'text/html'})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            html = r.read().decode('utf-8', 'replace')
    except Exception as e:  # noqa: BLE001
        return 502, {'error': 'fetch', 'message': str(e)}

    out = {'id': tid, 'url': url, 'name': '', 'title': '', 'field': '',
           'intro': '', 'career': [], 'edu': [], 'topics': [], 'books': []}

    t = re.search(r'<title>(.*?)</title>', html, re.S | re.I)
    if t:
        # "안광복 교사, 작가 | 특강 | 기업강연 | KMA 한국능률협회"
        head = _plain(t.group(1)).split('|')[0].strip()
        parts = head.split(' ', 1)
        out['name'] = parts[0]
        out['title'] = parts[1].strip() if len(parts) > 1 else ''

    # 머리글별로 구역을 나눈다
    WANT = {'소개': 'intro', '경력': 'career', '학력': 'edu',
            '주제': 'topics', '저서': 'books', '강의분야': 'field'}
    for body in _SEC.findall(html):
        h = _H2.search(body)
        if not h:
            continue
        key = WANT.get(_plain(h.group(1)))
        if not key:
            continue
        rest = _H2.sub('', body, count=1)
        items = [_plain(x) for x in _LI.findall(rest)]
        items = [x for x in items if x]
        if key == 'intro':
            out['intro'] = _plain(rest)
        elif items:
            out[key] = items
        else:
            # 목록이 아니라 문단으로 적힌 경우 — 줄로 쪼갠다
            lines = [x.strip() for x in _plain(rest).split('\n') if x.strip()]
            out[key] = lines

    if not out['field']:
        # 머리글에 '오건영 신한은행 패스파인더 단장 [리더십 & 조직문화] 섭외 문의하기'
        # 꼴로 붙어 있다. 이름·직함을 떼어 내고 '섭외 문의하기' 앞의 토막만 남긴다.
        head = out['intro'][:300]
        f = re.search(r'(.{2,40}?)\s*섭외\s*문의', head)
        if f:
            fld = f.group(1).strip()
            for drop in (out['name'], out['title']):
                if drop and fld.startswith(drop):
                    fld = fld[len(drop):].strip()
            out['field'] = fld

    # 얼굴 사진 — 제안서의 교수 소개 장에 동그란 자리가 비어 있다.
    # 프로필 쪽 <img alt="○○○ 강사 사진"> 의 src 는 Next.js 가 감싼 주소라
    # (/_next/image?url=…) 안쪽의 진짜 주소를 꺼내 쓴다.
    out['photo'] = _teacher_photo(html)

    if not out['name']:
        return 502, {'error': 'parse', 'message': '프로필을 읽지 못했습니다.'}
    return 200, {'ok': True, 'teacher': out}


_PHOTO_IMG = re.compile(r'<img[^>]*alt="[^"]*강사\s*사진"[^>]*>', re.I)
_PHOTO_SRC = re.compile(r'\ssrc="([^"]+)"', re.I)


def _teacher_photo(html):
    tag = _PHOTO_IMG.search(html or '')
    src = _PHOTO_SRC.search(tag.group(0)) if tag else None
    url = html_unescape(src.group(1)) if src else ''
    if not url:
        # 감싼 태그를 못 찾으면 저장소 주소라도 집어 본다
        m = re.search(r'https?://[^\s"\']*?/papi/storage/imgDownload/\d+', html or '')
        url = m.group(0) if m else ''
    if '/_next/image' in url:
        import urllib.parse
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        url = (q.get('url') or [''])[0]
    if url.startswith('/'):
        url = TEACHER_HOST + url
    return url if url.startswith('http') else ''


def html_unescape(s):
    return (str(s or '').replace('&amp;', '&').replace('&lt;', '<')
            .replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'"))


def teacher_photo(job):
    """강사 얼굴 사진을 내려받아 base64 로 돌려준다.

    브라우저에서 바로 받으면 다른 도메인이라 막힌다(CORS). 여기서 받아 넘긴다.
    """
    url = str(job.get('url') or '').strip()
    if not url:
        tid = str(job.get('id') or '').strip()
        if not tid.isdigit():
            return 400, {'error': 'bad_id', 'message': '강사 번호나 사진 주소가 필요합니다.'}
        code, out = teacher_fetch({'id': tid})
        if code != 200:
            return code, out
        url = out['teacher'].get('photo') or ''
    if not url.startswith(TEACHER_HOST):
        return 400, {'error': 'bad_url', 'message': '스튜디오 주소만 받습니다.'}

    import urllib.request
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; KMA-internal-tool)'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            kind = (r.headers.get('Content-Type') or '').split(';')[0].strip()
            data = r.read()
    except Exception as e:  # noqa: BLE001
        return 502, {'error': 'fetch', 'message': str(e)}
    if not data or not kind.startswith('image/'):
        return 502, {'error': 'not_image', 'message': '사진을 받지 못했습니다.'}
    if len(data) > 8 * 1024 * 1024:
        return 502, {'error': 'too_big', 'message': '사진이 너무 큽니다.'}
    return 200, {'ok': True, 'type': kind, 'b64': base64.b64encode(data).decode('ascii')}


# ── 강사 목록 ──────────────────────────────────────────
# /member/ai-teacher 한 페이지에 480명이 <nav class="sr-only"> 안에
# id·이름·직함으로 다 들어 있다. 목록은 이 한 번의 요청으로 끝난다.
#
# 다만 '어떤 주제를 강의하나' 는 목록에 없고 프로필마다 들어 있어서,
# 추천을 하려면 한 번은 480장을 다 읽어 색인을 만들어 둬야 한다(약 3분).
# 만든 색인은 teachers.json 에 두고 다음부터는 그 파일만 읽는다.

TEACHER_CACHE = 'teachers.json'
_TEACHER_NAV = re.compile(
    r'<nav[^>]*aria-label="전체 강사 목록"[^>]*>(.*?)</nav>', re.S)
_TEACHER_A = re.compile(r'<a href="/member/ai-teacher/(\d+)">(.*?)</a>', re.S)


def _fetch_html(url, timeout=25):
    import urllib.request
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; KMA-internal-tool)',
        'Accept': 'text/html'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


def teacher_roster():
    """강사 480명의 id·이름·직함. 한 요청으로 끝난다."""
    html = _fetch_html('%s/member/ai-teacher' % TEACHER_HOST)
    nav = _TEACHER_NAV.search(html)
    if not nav:
        return []
    out = []
    for tid, inner in _TEACHER_A.findall(nav.group(1)):
        txt = _plain(re.sub(r'<!--.*?-->', '', inner, flags=re.S))
        if not txt:
            continue
        # '오건영 신한은행 패스파인더 단장' — 첫 낱말이 이름
        parts = txt.split(' ', 1)
        out.append({'id': tid, 'name': parts[0],
                    'title': parts[1].strip() if len(parts) > 1 else '',
                    'topics': [], 'field': '', 'deep': False})
    return out


def teacher_cache_read():
    try:
        with open(cache_read_path(TEACHER_CACHE), 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {'items': [], 'at': '', 'deep': 0}


def teacher_cache_write(d):
    with open(cache_write_path(TEACHER_CACHE), 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)


def teacher_list(job):
    """목록을 준다. 캐시가 있으면 캐시, 없거나 refresh 면 다시 읽는다."""
    cached = teacher_cache_read()
    if cached.get('items') and not job.get('refresh'):
        return 200, {'ok': True, 'items': cached['items'],
                     'at': cached.get('at', ''), 'deep': cached.get('deep', 0),
                     'from': 'cache'}
    try:
        roster = teacher_roster()
    except Exception as e:  # noqa: BLE001
        if cached.get('items'):
            return 200, {'ok': True, 'items': cached['items'],
                         'at': cached.get('at', ''), 'deep': cached.get('deep', 0),
                         'from': 'cache', 'warn': str(e)}
        return 502, {'error': 'fetch', 'message': str(e)}

    # 이미 읽어 둔 주제는 살린다 — 목록만 새로 받았다고 색인을 버릴 이유가 없다
    old = {x['id']: x for x in cached.get('items', [])}
    for t in roster:
        prev = old.get(t['id'])
        if prev and prev.get('deep'):
            t['topics'] = prev.get('topics') or []
            t['field'] = prev.get('field') or ''
            t['deep'] = True
    d = {'items': roster, 'at': datetime.datetime.now().isoformat(timespec='seconds'),
         'deep': sum(1 for x in roster if x.get('deep'))}
    teacher_cache_write(d)
    return 200, {'ok': True, 'items': d['items'], 'at': d['at'],
                 'deep': d['deep'], 'from': 'site'}


def teacher_index(job):
    """프로필을 읽어 주제 색인을 채운다. 한 번에 limit 명씩 — 끊어서 돈다."""
    cached = teacher_cache_read()
    items = cached.get('items') or []
    if not items:
        code, out = teacher_list({})
        if code != 200:
            return code, out
        cached = teacher_cache_read()
        items = cached.get('items') or []

    limit = int(job.get('limit') or 40)
    todo = [x for x in items if not x.get('deep')]
    done = fail = 0
    for t in todo[:limit]:
        code, out = teacher_fetch({'id': t['id']})
        if code == 200:
            p = out['teacher']
            t['topics'] = p.get('topics') or []
            t['field'] = p.get('field') or ''
            t['deep'] = True
            done += 1
        else:
            # 실패는 대개 너무 빨리 두드려서 생긴다. 성공으로 치고 넘기면
            # 그 사람은 영영 주제 없이 남는다. 세 번까지는 다시 온다.
            t['fail'] = int(t.get('fail') or 0) + 1
            if t['fail'] >= 3:
                t['deep'] = True
            fail += 1
        # 0.05초로 몰아쳤더니 480명 중 49명만 읽히고 나머지는 막혔다.
        time.sleep(0.3)
    cached['items'] = items
    cached['deep'] = sum(1 for x in items if x.get('deep'))
    teacher_cache_write(cached)
    return 200, {'ok': True, 'done': done, 'fail': fail,
                 'deep': cached['deep'], 'total': len(items),
                 'left': max(0, len(items) - cached['deep'])}
