# -*- coding: utf-8 -*-
"""아웃룩 · 파워포인트 · 엑셀 — 오피스 없이, 어디서나.

예전에는 PowerShell 로 오피스를 띄워(COM) 이 일들을 했다. 그래서
윈도우 PC 에서 실행하기.bat 으로 켠 서버에서만 됐고, 배포한 웹에서는 전부 막혀 있었다.

이제는 파일을 직접 다룬다 — 로컬이든 Vercel 이든 같은 코드가 같은 결과를 낸다.
  PPT      server/pptx.py    (양식 읽기 · 채우기 · 검수)   + render.py (미리보기 SVG)
  엑셀     server/xlsx.py    (견적서 양식 채우기)
  메일     server/mail.py    (.eml 초안 — 열면 아웃룩 새 메일 창)
  파일     server/files.py   (큰 파일 통로 · 양식 보관)
"""

import json
import time
import uuid

from . import ai, files, mail, pptx, render, xlsx
from .common import safe_name
from .teachers import teacher_photo

PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
EML = 'message/rfc822'


def _fail(code, err, msg):
    return code, {'error': err, 'message': msg}


# ── 메일 ──────────────────────────────────────────────

def outlook_status():
    """무엇을 할지만 알려 준다 (아웃룩을 미리 깨우지는 않는다)."""
    if mail.outlook_here():
        return {'ok': True, 'mode': 'outlook',
                'message': '아웃룩 새 메일 창을 띄웁니다. 아웃룩이 없으면 메일 파일(.eml)로 내려받습니다.'}
    return {'ok': True, 'mode': 'eml',
            'message': '메일 파일(.eml)을 만듭니다. 열면 아웃룩 새 메일 창이 첨부까지 채워진 채 뜹니다.'}


def make_mail(job):
    try:
        code, out = mail.make(job, files.take)
    except ValueError as e:
        return _fail(400, 'bad_file', str(e))
    if code != 200 or out.get('mode') == 'draft':
        return code, out
    data = out.pop('data')
    out['file'] = files.give(data, out['name'], EML)
    files.sweep()
    return 200, out


# ── PPT 양식 올리기 · 읽기 ─────────────────────────────

def _thumbs(tid, data, count=None):
    """장마다 SVG 미리보기를 만들어 양식 폴더에 둔다."""
    svgs = render.slides_svg(data)
    for i, s in enumerate(svgs, 1):
        files.tpl_put(tid, 'slide%d.svg' % i, s.encode('utf-8'), 'image/svg+xml')
    return len(svgs)


def _thumb_urls(tid, slides):
    have = set(files.tpl_files(tid))
    for s in slides:
        no = s['no']
        png, svg = 'slide%d.png' % no, 'slide%d.svg' % no
        # 예전 파워포인트로 뽑아 둔 PNG 가 있으면 그것(더 정확하다), 없으면 SVG
        name = png if png in have else svg
        s['thumb'] = files.tpl_url(tid, name)
        full = 'slide%d-full.png' % no
        s['full'] = files.tpl_url(tid, full) if full in have else s['thumb']


def _read_meta(tid):
    try:
        raw = files.tpl_get(tid, 'meta.json')
        return json.loads(raw.decode('utf-8-sig')) if raw else {}
    except Exception:  # noqa: BLE001
        return {}


def _meta(tid, name, kind, **extra):
    # 이미 적어 둔 것(모든 PC 기본 양식 표시 등)은 지우지 않고 덧쓴다 — 되살리기가 그 표시를 날렸다
    meta = _read_meta(tid)
    meta.update({'kind': kind, 'name': name})
    meta.setdefault('at', time.strftime('%Y-%m-%d %H:%M'))
    meta.update(extra)
    files.tpl_put(tid, 'meta.json', json.dumps(meta, ensure_ascii=False).encode('utf-8'), 'application/json')


# ── 양식 설정 보관 ────────────────────────────────────
# 양식의 PPT 와 그림은 보관소에 있는데, '장마다 무엇을 채울지' 는 그 브라우저에만 있었다.
# 다른 PC 에서는 양식을 되살린 뒤 장마다 다시 골라야 했다. 설정도 보관소에 같이 둔다.
# pinned — '모든 PC 기본 양식'. 어느 브라우저에서 열어도 저절로 목록에 들어간다.

def ppt_settings_put(job, owner=''):
    tid = job.get('templateId') or ''
    try:
        if not files.tpl_has(tid, 'source.pptx'):
            return _fail(404, 'no_template', '보관소에 그 양식 파일이 없습니다.')
    except ValueError as e:
        return _fail(400, 'bad_id', str(e))
    settings = job.get('settings')
    if not isinstance(settings, dict):
        return _fail(400, 'bad_settings', '양식 설정이 비어 있습니다.')
    raw = json.dumps(settings, ensure_ascii=False).encode('utf-8')
    if len(raw) > 3 * 1024 * 1024:
        return _fail(413, 'too_big', '양식 설정이 너무 큽니다.')
    # 남의 양식(기본 양식이 아닌 것)은 그 사람 설정을 덮지 않는다 — 고친 것은 그 브라우저에만 남는다
    meta = _read_meta(tid)
    if owner and meta.get('owner') and meta.get('owner') != owner and not meta.get('pinned'):
        return 200, {'ok': True, 'skipped': 'not_owner', 'settingsAt': meta.get('settingsAt') or ''}
    at = time.strftime('%Y-%m-%d %H:%M:%S')
    files.tpl_put(tid, 'settings.json', raw, 'application/json')
    extra = {'pinned': bool(job.get('pinned')), 'settingsAt': at}
    # 이 기능 전에 올린 양식에는 주인이 없다 — 처음 설정을 올리는 계정(목록에 그 양식이 있는 사람)을 주인으로
    if owner and not _read_meta(tid).get('owner'):
        extra['owner'] = owner
    _meta(tid, str(job.get('name') or settings.get('name') or '양식'),
          str(job.get('kind') or 'proposal'), **extra)
    return 200, {'ok': True, 'settingsAt': at}


def _settings(tid):
    try:
        raw = files.tpl_get(tid, 'settings.json')
        st = json.loads(raw.decode('utf-8-sig')) if raw else None
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(st, dict):
        return None
    # 썸네일 주소는 로컬(정적 파일)과 웹(서버 경유)이 다르다 — 지금 자리에 맞게 다시 적는다
    try:
        _thumb_urls(tid, [s for s in (st.get('slides') or []) if isinstance(s, dict) and s.get('no')])
    except Exception:  # noqa: BLE001
        pass
    st['fileId'] = tid
    return st


def ppt_settings_get(tid):
    try:
        st = _settings(tid)
    except ValueError as e:
        return _fail(400, 'bad_id', str(e))
    if not st:
        return _fail(404, 'no_settings', '보관된 양식 설정이 없습니다.')
    return 200, {'ok': True, 'settings': st, 'meta': _read_meta(tid)}


def ppt_import(job, owner=''):
    """양식 pptx 를 받아 보관하고, 장마다 미리보기를 만든다. owner — 올린 계정(다른 PC 에서 같은 계정으로
    들어오면 이 양식이 저절로 목록에 들어간다)."""
    try:
        data = files.take(job.get('file') or job.get('b64'))
    except ValueError as e:
        return _fail(400, 'bad_file', str(e))
    if not data:
        return _fail(400, 'bad_file', '파일이 비어 있습니다.')
    try:
        scan = pptx.scan(data)
    except Exception as e:  # noqa: BLE001
        return _fail(400, 'bad_pptx', 'PPT 파일을 읽지 못했습니다: %s' % str(e)[:200])
    tid = 'tpl' + time.strftime('%Y%m%d%H%M%S') + uuid.uuid4().hex[:4]
    try:
        files.tpl_put(tid, 'source.pptx', data, PPTX)
        _thumbs(tid, data)
        name = job.get('name') or '양식'
        kind = job.get('kind') or 'proposal'
        _meta(tid, name, kind, owner=owner or '')
    except Exception as e:  # noqa: BLE001
        try:
            files.tpl_delete(tid)
        except Exception:  # noqa: BLE001
            pass
        return _fail(502, 'store', '양식을 보관하지 못했습니다: %s' % str(e)[:200])
    scan.update({'id': tid, 'dir': 'templates/' + tid, 'name': name, 'kind': kind})
    _thumb_urls(tid, scan['slides'])
    return 200, scan


def ppt_full(job):
    """큰 미리보기. SVG 는 크기와 상관없이 선명하므로 새로 만들 것이 없다."""
    return 200, {'ok': True, 'made': 0}


def ppt_rescan(job):
    """보관된 양식을 다시 읽어 목록 항목을 통째로 만들어 준다."""
    tid = job.get('templateId') or ''
    try:
        data = files.tpl_get(tid, 'source.pptx')
    except ValueError as e:
        return _fail(400, 'bad_id', str(e))
    if not data:
        return _fail(404, 'no_file', '그 양식 파일이 없습니다.')
    scan = pptx.scan(data)
    have = set(files.tpl_files(tid))
    if not any(n.startswith('slide') and (n.endswith('.png') or n.endswith('.svg')) for n in have):
        _thumbs(tid, data)
    name = job.get('name') or ('되살린 양식 ' + tid[-4:])
    kind = job.get('kind') or 'proposal'
    try:
        _meta(tid, name, kind)
    except Exception:  # noqa: BLE001
        pass
    scan.update({'id': tid, 'dir': 'templates/' + tid, 'name': name, 'kind': kind})
    _thumb_urls(tid, scan['slides'])
    return 200, scan


def ppt_scan(job):
    """올린 pptx 를 훑어본다 (고친 파일에 다시 채워 넣을 때)."""
    try:
        data = files.take(job.get('file') or job.get('b64'))
        return 200, pptx.scan(data)
    except Exception as e:  # noqa: BLE001
        return _fail(400, 'bad_pptx', 'PPT 파일을 읽지 못했습니다: %s' % str(e)[:200])


def ppt_stored(owner=''):
    """보관된 양식 목록 — 브라우저 목록이 비었을 때 되살리는 데 쓴다.
    mine — 이 계정이 올린 양식(다른 PC 에서 같은 계정으로 들어와도 저절로 목록에 넣는다)."""
    out = []
    for tid in files.tpl_ids():
        names = files.tpl_files(tid)
        if 'source.pptx' not in names:
            continue
        meta = {}
        if 'meta.json' in names:
            try:
                meta = json.loads((files.tpl_get(tid, 'meta.json') or b'{}').decode('utf-8-sig'))
            except Exception:  # noqa: BLE001
                meta = {}
        shots = [n for n in names if n.startswith('slide') and '-full' not in n
                 and (n.endswith('.png') or n.endswith('.svg'))]
        count = len({n.rsplit('.', 1)[0] for n in shots})
        row = {'id': tid, 'dir': 'templates/' + tid, 'count': count, 'size': 0,
               'kind': meta.get('kind') or '', 'name': meta.get('name') or '',
               'at': meta.get('at') or '', 'pinned': bool(meta.get('pinned')),
               'hasSettings': 'settings.json' in names, 'settingsAt': meta.get('settingsAt') or ''}
        # 로그인한 계정이 올린 것 — 로그인 없이 쓰는 로컬('')에서는 주인 없는 양식을 내 것으로 본다
        row['mine'] = bool(owner) and meta.get('owner') == owner or (not owner and not meta.get('owner'))
        # 모든 PC 기본 양식과 내 양식은 설정까지 실어 보낸다 — 브라우저가 받자마자 목록에 넣는다
        if (row['pinned'] or row['mine']) and row['hasSettings']:
            row['settings'] = _settings(tid)
        out.append(row)
    return out


def ppt_remove(tid):
    try:
        files.tpl_delete(tid)
        return 200, {'ok': True}
    except ValueError:
        return _fail(404, 'no_template', '그 양식이 없습니다.')


# ── PPT 채우기 · 검수 ─────────────────────────────────

def _faces(job):
    """교수 얼굴 — 주소만 넘어온다. 서버가 받아 온다(브라우저는 다른 도메인이라 막힌다)."""
    out = {}
    for item in job.get('fill') or []:
        url = str(item.get('photo') or '')
        if not url.startswith('http'):
            continue
        try:
            code, got = teacher_photo({'url': url})
        except Exception:  # noqa: BLE001
            continue
        if code == 200 and got.get('b64'):
            out[int(item.get('no') or 0)] = files.take(got['b64'])
    return out


def _pics(job):
    """교육사진 — base64 나 파일 통로로 온다. 장 하나에 24장까지."""
    out = {}
    for item in job.get('fill') or []:
        got = []
        for raw in (item.get('pics') or [])[:24]:
            try:
                data = files.take(raw)
            except Exception:  # noqa: BLE001
                continue
            if data:
                got.append(data)
        if got:
            out[int(item.get('no') or 0)] = got
    return out


def ppt_fill(job):
    """글자를 채워 새 pptx 를 만든다. 만든 김에 검수까지 해서 같이 돌려준다.

    templateId → 보관된 양식에서 처음부터
    b64 / src  → 이미 만들어 손본 파일에 이어서 (그 파일의 디자인·손댄 장은 그대로)
    """
    try:
        if job.get('src') or job.get('b64'):
            src = files.take(job.get('src') or job.get('b64'))
        else:
            src = files.tpl_get(job.get('templateId') or '', 'source.pptx')
    except ValueError as e:
        return _fail(400, 'bad_file', str(e))
    if not src:
        return _fail(404, 'no_template', '올려 둔 양식 파일을 찾지 못했습니다. 양식을 다시 올려 주세요.')

    plan = {k: job.get(k) or [] for k in ('fill', 'drop', 'repeat', 'tables', 'replace')}
    plan['header'] = str(job.get('header') or '')
    try:
        data, deck = pptx.fill(src, plan, photo_bytes=_faces(job), pic_bytes=_pics(job))
    except Exception as e:  # noqa: BLE001
        return _fail(500, 'fill', 'PPT 를 만들지 못했습니다: %s' % str(e)[:300])

    name = safe_name(job.get('fileName') or '제안서.pptx')
    if not name.lower().endswith('.pptx'):
        name += '.pptx'

    # 마지막 검수 — 다 만든 문서를 AI 가 읽고 다른 회사 흔적·빈칸 표시·표지 누락을 찾는다.
    # 이름만 바꾸면 되는 것은 여기서 바꾸고, 나머지는 화면의 '초안 확인' 에 띄운다.
    review = None
    rv = job.get('review') or None
    if rv and ai.ai_key():
        try:
            slides, lays = pptx.review_texts(deck)
            code, got = ai.ai_review({'kind': rv.get('kind'), 'course': rv.get('course'),
                                      'inquiry': rv.get('inquiry') or '',
                                      'names': rv.get('names') or [], 'slides': slides, 'layouts': lays})
            if code == 200:
                items = got.get('items') or []
                if pptx.apply_review(deck, items, got.get('allowed') or []):
                    data = deck.pkg.save()
                for x in items:
                    x.pop('pairs', None)
                review = [x for x in items if not x.get('applied')]
                fixed = [x for x in items if x.get('applied')]
                review = {'left': review, 'fixed': fixed}
        except Exception as e:  # noqa: BLE001
            review = {'left': [], 'fixed': [], 'error': str(e)[:200]}

    report = pptx.audit(deck, job.get('was') or {})
    if review is not None:
        report['review'] = review
    f = files.give(data, name, PPTX)
    files.sweep()
    out = {'ok': True, 'name': name, 'file': f, 'audit': report}
    if f.get('b64'):
        out['b64'] = f['b64']        # 예전 화면 코드가 그대로 읽는다
    return 200, out


def ppt_audit(job):
    """만든 pptx 를 다시 읽어 넘침·빈칸을 잰다. was = 부르는 쪽이 글을 넣은 자리."""
    try:
        data = files.take(job.get('src') or job.get('b64'))
        deck = pptx.Deck(data)
    except Exception as e:  # noqa: BLE001
        return _fail(400, 'audit', str(e)[:200])
    return 200, pptx.audit(deck, job.get('was') or {}, touched=set())


# ── 견적서 엑셀 ────────────────────────────────────────

def quote_fill(job):
    form = files.form_get()
    if not form:
        return _fail(404, 'no_form', '견적서 엑셀 양식이 없습니다. 양식을 올려 주세요.')
    try:
        data = xlsx.fill(form, job)
    except Exception as e:  # noqa: BLE001
        return _fail(500, 'excel', '견적서를 만들지 못했습니다: %s' % str(e)[:300])
    name = safe_name('견적서_%s.xlsx' % (job.get('courseName') or ''))
    f = files.give(data, name, XLSX)
    out = {'ok': True, 'file': f}
    if f.get('b64'):
        out['b64'] = f['b64']
    return 200, out


def quote_form_save(job):
    try:
        data = files.take(job.get('file') or job.get('b64'))
        if not data.startswith(b'PK'):
            return _fail(400, 'bad_file', '엑셀(.xlsx) 파일이 아닙니다.')
        files.form_put(data)
        return 200, {'ok': True, 'size': len(data)}
    except Exception as e:  # noqa: BLE001
        return _fail(500, 'save', str(e)[:200])


# ── 파일 통로 ─────────────────────────────────────────

def blob_new(job):
    try:
        return 200, files.upload_slot(str(job.get('name') or 'file'), job.get('type'))
    except Exception as e:  # noqa: BLE001
        return _fail(502, 'store', str(e)[:200])
