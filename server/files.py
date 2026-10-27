# -*- coding: utf-8 -*-
"""파일 통로 · 양식 보관 — 로컬에서도, 배포한 웹(Vercel)에서도 같은 길.

왜 필요한가
  Vercel 함수는 요청·응답 본문이 4.5MB 를 넘으면 받지 않는다.
  회사 양식 PPT 는 11MB, 교육사진 열 장이면 그보다 크다. base64 로 JSON 에 실으면
  배포한 웹에서는 PPT 만들기·결과보고서·메일이 전부 막힌다.
  그래서 큰 파일은 JSON 에 싣지 않고 '파일 통로' 로 따로 보낸다.

    브라우저 ──(1) /api/blob/new ──▶ 서버: 올릴 자리(주소) 발급
    브라우저 ──(2) PUT 파일 ────────▶ 그 주소 (로컬: 이 서버 / 웹: Supabase Storage)
    브라우저 ──(3) {"$blob": ref} ──▶ 서버가 ref 로 파일을 꺼내 쓴다

  만든 파일도 같다. 작으면(2.5MB 이하) base64 로 바로 주고, 크면 내려받을 주소를 준다.

어디에 두는가
  로컬(relay.py)   임시 폴더(kma-blobs) · 양식은 public/templates/<id>/
  웹(Vercel)       Supabase Storage 의 비공개 통(kma-files). 서버만 secret key 로 연다.
                   웹의 디스크는 요청이 끝나면 사라지므로 양식도 여기에 둔다.

Storage 의 파일 이름은 영문·숫자만 쓴다(한글 이름을 거부한다). 한글 파일명은 따로 들고 다닌다.
"""

import base64
import json
import os
import re
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from .common import safe_name
from .config import READ_ONLY, TPL_DIR, QUOTE_FORM, env

INLINE_MAX = 2500000           # base64 로 JSON 에 실어도 되는 크기 (4.5MB 한도 안)
LOCAL = os.path.join(tempfile.gettempdir(), 'kma-blobs')
BUCKET = 'kma-files'
_REF_OK = re.compile(r'^work/[0-9A-Za-z-]+/[0-9A-Za-z._-]+$')
_TID_OK = re.compile(r'^[0-9A-Za-z_-]{3,64}$')
_NAME_OK = re.compile(r'^[0-9A-Za-z._-]{1,80}$')


# ── 어디에 두나 ─────────────────────────────────────────

def cloud():
    """배포한 웹이면 Supabase Storage. 로컬에서도 KMA_STORAGE=supabase 면 그쪽으로(시험용)."""
    if env('KMA_STORAGE') == 'local':
        return False
    return READ_ONLY or env('KMA_STORAGE') == 'supabase'


def _sb():
    from .supa import supa_api_url
    url = supa_api_url(env('SUPABASE_URL'))
    key = env('SUPABASE_SECRET_KEY')
    if not url or not key:
        raise RuntimeError('파일 보관소(Supabase)가 설정되지 않았습니다 — '
                           'SUPABASE_URL · SUPABASE_SECRET_KEY 를 넣어 주세요.')
    return url.rstrip('/'), key


def _call(method, path, body=None, ctype=None, raw=False, timeout=60, extra=None):
    url, key = _sb()
    h = {'apikey': key, 'Authorization': 'Bearer ' + key}
    if extra:
        h.update(extra)
    data = None
    if body is not None:
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
            h['Content-Type'] = ctype or 'application/octet-stream'
        else:
            data = json.dumps(body).encode('utf-8')
            h['Content-Type'] = 'application/json'
    req = urllib.request.Request(url + '/storage/v1' + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            out = r.read()
            if raw:
                return r.status, out
            try:
                return r.status, json.loads(out.decode('utf-8') or 'null')
            except ValueError:
                return r.status, out
    except urllib.error.HTTPError as e:
        out = e.read()
        try:
            return e.code, json.loads(out.decode('utf-8') or 'null')
        except ValueError:
            return e.code, out


def _q(path):
    return urllib.parse.quote(path, safe='/')


_bucket_ok = {'done': False}
_lock = threading.Lock()


def _ensure_bucket():
    if _bucket_ok['done']:
        return
    with _lock:
        if _bucket_ok['done']:
            return
        code, body = _call('POST', '/bucket', {'id': BUCKET, 'name': BUCKET, 'public': False})
        # 이미 있으면 400/409 — 괜찮다
        if code in (200, 201) or code in (400, 409):
            _bucket_ok['done'] = True
        else:
            raise RuntimeError('파일 보관소를 열지 못했습니다 (%s): %s' % (code, body))


def _cloud_put(path, data, mime):
    _ensure_bucket()
    code, body = _call('POST', '/object/%s/%s' % (BUCKET, _q(path)), data, mime,
                       extra={'x-upsert': 'true'})
    if code not in (200, 201):
        raise RuntimeError('파일을 올리지 못했습니다 (%s): %s' % (code, body))


def _cloud_get(path):
    code, data = _call('GET', '/object/authenticated/%s/%s' % (BUCKET, _q(path)), raw=True, timeout=120)
    if code == 200:
        return data
    code, data = _call('GET', '/object/%s/%s' % (BUCKET, _q(path)), raw=True, timeout=120)
    return data if code == 200 else None


def _cloud_signed(path, name=None, expires=3600):
    code, body = _call('POST', '/object/sign/%s/%s' % (BUCKET, _q(path)), {'expiresIn': expires})
    if code != 200 or not isinstance(body, dict):
        raise RuntimeError('내려받을 주소를 만들지 못했습니다 (%s)' % code)
    s = body.get('signedURL') or body.get('signedUrl') or ''
    url, _ = _sb()
    full = url + '/storage/v1' + s if s.startswith('/') else s
    if name:
        full += ('&' if '?' in full else '?') + 'download=' + urllib.parse.quote(name)
    return full


def _cloud_list(prefix):
    _ensure_bucket()
    code, body = _call('POST', '/object/list/%s' % BUCKET,
                       {'prefix': prefix, 'limit': 1000, 'offset': 0,
                        'sortBy': {'column': 'name', 'order': 'asc'}})
    return body if code == 200 and isinstance(body, list) else []


def _cloud_delete(paths):
    if paths:
        _call('DELETE', '/object/%s' % BUCKET, {'prefixes': list(paths)})


# ── 오가는 파일 (ref) ───────────────────────────────────

def _ext(name):
    m = re.search(r'\.([0-9A-Za-z]{1,8})$', str(name or ''))
    return m.group(1).lower() if m else 'bin'


def new_ref(name):
    return 'work/%s-%s/f.%s' % (time.strftime('%Y%m%d'), uuid.uuid4().hex[:16], _ext(name))


def _local_path(ref):
    if not _REF_OK.match(ref or ''):
        raise ValueError('잘못된 파일 표시입니다.')
    return os.path.join(LOCAL, *ref.split('/'))


def put(data, name='file.bin', mime='application/octet-stream'):
    ref = new_ref(name)
    if cloud():
        _cloud_put(ref, data, mime)
    else:
        p = _local_path(ref)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'wb') as f:
            f.write(data)
    return ref


def get(ref):
    if not _REF_OK.match(ref or ''):
        return None
    if cloud():
        return _cloud_get(ref)
    try:
        with open(_local_path(ref), 'rb') as f:
            return f.read()
    except OSError:
        return None


def url_of(ref, name):
    if cloud():
        return _cloud_signed(ref, name)
    return '/api/blob/get?ref=%s&name=%s' % (urllib.parse.quote(ref), urllib.parse.quote(name or 'file'))


def upload_slot(name, mime=None):
    """브라우저가 파일을 올릴 자리. {ref, url, method, headers}"""
    ref = new_ref(name)
    if cloud():
        _ensure_bucket()
        code, body = _call('POST', '/object/upload/sign/%s/%s' % (BUCKET, _q(ref)), {})
        if code != 200 or not isinstance(body, dict) or not body.get('url'):
            raise RuntimeError('올릴 자리를 만들지 못했습니다 (%s): %s' % (code, body))
        url, _ = _sb()
        full = url + '/storage/v1' + body['url'] if body['url'].startswith('/') else body['url']
        h = {'Content-Type': mime or 'application/octet-stream', 'x-upsert': 'true'}
        # 공개 키(publishable)는 붙여도 된다 — 권한은 주소의 서명(token)이 준다
        if env('SUPABASE_PUBLISHABLE_KEY'):
            h['apikey'] = env('SUPABASE_PUBLISHABLE_KEY')
        return {'ref': ref, 'url': full, 'method': 'PUT', 'headers': h}
    return {'ref': ref, 'url': '/api/blob/put?ref=' + urllib.parse.quote(ref), 'method': 'PUT',
            'headers': {'Content-Type': mime or 'application/octet-stream'}}


def local_put(ref, data):
    p = _local_path(ref)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'wb') as f:
        f.write(data)


def take(v):
    """요청에 실려 온 파일 — base64 글자 또는 {"$blob": ref} → bytes (없으면 b'')"""
    if not v:
        return b''
    if isinstance(v, dict):
        ref = v.get('$blob') or v.get('ref')
        data = get(ref) if ref else None
        if data is None and ref:
            raise ValueError('올린 파일을 찾지 못했습니다. 다시 시도해 주세요.')
        return data or b''
    s = str(v)
    if s.startswith('data:'):
        s = s.split(',', 1)[-1]
    return base64.b64decode(s)


def give(data, name, mime='application/octet-stream', inline=True):
    """만든 파일을 돌려줄 모양. 작으면 b64 도 같이, 크면 주소만."""
    ref = put(data, name, mime)
    out = {'name': name, 'size': len(data), 'type': mime, 'ref': ref, 'url': url_of(ref, name)}
    if inline and len(data) <= INLINE_MAX:
        out['b64'] = base64.b64encode(data).decode('ascii')
    return out


_last_sweep = {'at': 0}


def sweep(hours=24):
    """하루 지난 오가는 파일을 치운다. 한 시간에 한 번만."""
    now = time.time()
    if now - _last_sweep['at'] < 3600:
        return
    _last_sweep['at'] = now
    cut = time.strftime('%Y%m%d', time.localtime(now - hours * 3600))
    try:
        if cloud():
            old = []
            for e in _cloud_list('work/'):
                nm = e.get('name') or ''
                if nm[:8].isdigit() and nm[:8] < cut:
                    for f in _cloud_list('work/%s/' % nm):
                        old.append('work/%s/%s' % (nm, f.get('name')))
            _cloud_delete(old)
        else:
            base = os.path.join(LOCAL, 'work')
            for nm in os.listdir(base) if os.path.isdir(base) else []:
                if nm[:8].isdigit() and nm[:8] < cut:
                    import shutil
                    shutil.rmtree(os.path.join(base, nm), ignore_errors=True)
    except Exception:  # noqa: BLE001
        pass


# ── 양식 보관 ───────────────────────────────────────────
#
# 양식 하나 = 폴더 하나.  source.pptx(원본) · meta.json · slideN.svg(썸네일)
# 로컬은 예전 자리(public/templates/<id>/, 원본 이름은 '원본.pptx')를 그대로 쓴다 —
# 이미 올려 둔 양식이 그대로 보인다.

_LOCAL_NAME = {'source.pptx': '원본.pptx'}


def _tid(tid):
    tid = safe_name(tid or '')
    if not _TID_OK.match(tid):
        raise ValueError('잘못된 양식 번호입니다.')
    return tid


def tpl_put(tid, name, data, mime='application/octet-stream'):
    tid = _tid(tid)
    if not _NAME_OK.match(name):
        raise ValueError('잘못된 파일 이름입니다.')
    if cloud():
        _cloud_put('templates/%s/%s' % (tid, name), data, mime)
        return
    folder = os.path.join(TPL_DIR, tid)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, _LOCAL_NAME.get(name, name)), 'wb') as f:
        f.write(data)


def tpl_get(tid, name):
    tid = _tid(tid)
    if not _NAME_OK.match(name):
        return None
    # 로컬 폴더에 있으면 그것 (배포에 실려 간 예전 양식 포함)
    p = os.path.join(TPL_DIR, tid, _LOCAL_NAME.get(name, name))
    if os.path.exists(p):
        with open(p, 'rb') as f:
            return f.read()
    if cloud():
        return _cloud_get('templates/%s/%s' % (tid, name))
    return None


def tpl_has(tid, name):
    try:
        tid = _tid(tid)
    except ValueError:
        return False
    if os.path.exists(os.path.join(TPL_DIR, tid, _LOCAL_NAME.get(name, name))):
        return True
    if cloud():
        return any(e.get('name') == name for e in _cloud_list('templates/%s/' % tid))
    return False


def tpl_ids():
    out = []
    if os.path.isdir(TPL_DIR):
        out += [t for t in sorted(os.listdir(TPL_DIR))
                if os.path.isdir(os.path.join(TPL_DIR, t)) and _TID_OK.match(t)]
    if cloud():
        for e in _cloud_list('templates/'):
            nm = e.get('name') or ''
            if _TID_OK.match(nm) and nm not in out:
                out.append(nm)
    return out


def tpl_files(tid):
    tid = _tid(tid)
    names = set()
    folder = os.path.join(TPL_DIR, tid)
    if os.path.isdir(folder):
        for f in os.listdir(folder):
            names.add('source.pptx' if f == '원본.pptx' else f)
    if cloud():
        names |= {e.get('name') for e in _cloud_list('templates/%s/' % tid) if e.get('name')}
    return sorted(names)


def tpl_delete(tid):
    tid = _tid(tid)
    if cloud():
        _cloud_delete(['templates/%s/%s' % (tid, n) for n in tpl_files(tid)])
    folder = os.path.join(TPL_DIR, tid)
    if os.path.isdir(folder) and not READ_ONLY:
        import shutil
        shutil.rmtree(folder, ignore_errors=True)


def tpl_url(tid, name):
    """브라우저가 썸네일을 부를 주소. 로컬은 정적 파일, 웹은 서버를 거친다."""
    tid = _tid(tid)
    local = os.path.join(TPL_DIR, tid, name)
    if not cloud() or os.path.exists(local):
        return 'templates/%s/%s' % (tid, name)
    return 'api/tpl/file?tid=%s&name=%s' % (tid, name)


# ── 견적서 엑셀 양식 ────────────────────────────────────

def form_get():
    if cloud():
        data = _cloud_get('forms/quote.xlsx')
        if data:
            return data
    try:
        with open(QUOTE_FORM, 'rb') as f:
            return f.read()
    except OSError:
        return None


def form_put(data):
    if cloud():
        _cloud_put('forms/quote.xlsx', data,
                   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        return
    os.makedirs(os.path.dirname(QUOTE_FORM), exist_ok=True)
    with open(QUOTE_FORM, 'wb') as f:
        f.write(data)
