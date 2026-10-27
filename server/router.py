# -*- coding: utf-8 -*-
"""/api/* 길잡이 — 로컬(relay.py)과 Vercel(api/index.py)이 같이 쓴다.

주소 → 함수 표 하나로 두고, 요청을 읽고 JSON 으로 답하는 일은 ApiMixin 이 맡는다.

배포한 웹에서는 로그인해야 쓸 수 있다
  로컬 서버는 이 PC(127.0.0.1)에서만 열리지만, 배포한 주소는 누구나 부를 수 있다.
  로그인 없이 열어 두면 노션의 교육문의(고객 정보)를 아무나 읽고, Claude API 를
  아무나 써서 비용이 나간다. 그래서 웹에서는 로그인 표(세션 토큰)가 있어야 한다.
  로컬에서도 켜려면 환경변수 KMA_REQUIRE_LOGIN=1.
"""

import json
import mimetypes
import re
import urllib.parse

from . import ai, files, notion, office, session, supa, teachers
from .config import IS_VERCEL, env


def _owner(token):
    """이 요청을 보낸 계정 — 양식이 '누구의 것' 인지 적어 두는 데 쓴다. 로그인 없이 쓰는 로컬은 ''."""
    body = session.verify(token) or {}
    return str(body.get('sub') or body.get('u') or '')


def _stored(q, token=None):
    kind = (q.get('kind') or [''])[0]
    rows = office.ppt_stored(_owner(token))
    if kind:
        rows = [r for r in rows if not r['kind'] or r['kind'] == kind]
    return 200, {'templates': rows}


def _auth_state():
    n = supa.user_count()
    return 200, {'users': n, 'bootstrap': n == 0, 'setup_needed': n < 0}


def _supa_config():
    # 브라우저에는 공개 가능한 것만. secret key 는 여기서 끊는다.
    c = supa.supa_creds()
    return 200, {
        'url': supa.supa_api_url(c['project_url']),
        'key': c['publishable_key'],
        'ready': supa.ready(),
        'loginRequired': login_required(),
    }


def _mail(job):
    if not (job.get('to') or '').strip():
        return 400, {'error': 'no_to', 'message': '받는 사람이 비어 있습니다.'}
    return office.make_mail(job)


def _status():
    return 200, {'relay': True, 'web': IS_VERCEL, 'office': 'files',
                 'outlook': office.outlook_status(), 'storage': 'supabase' if files.cloud() else 'local'}


# GET: fn(query, token) → (code, obj)
GET = {
    '/api/status':          lambda q, t: _status(),
    '/api/outlook/status':  lambda q, t: (200, office.outlook_status()),
    '/api/supabase/status': lambda q, t: (200, supa.supa_status()),
    '/api/supabase/config': lambda q, t: _supa_config(),
    '/api/auth/state':      lambda q, t: _auth_state(),
    '/api/admin/me':        lambda q, t: supa.admin_me(t),
    '/api/admin/users':     lambda q, t: supa.admin_users(t),
    '/api/admin/history':   lambda q, t: supa.admin_history(t),
    '/api/ai/status':       lambda q, t: ai.ai_status(),
    '/api/ppt/stored':      lambda q, t: _stored(q, t),
    '/api/ppt/settings':    lambda q, t: office.ppt_settings_get((q.get('tid') or [''])[0]),
}

# POST: fn(job, token, ip) → (code, obj)
POST = {
    '/api/teacher/list':        lambda j, t, ip: teachers.teacher_list(j),
    '/api/teacher/one':         lambda j, t, ip: teachers.teacher_fetch(j),
    '/api/teacher/photo':       lambda j, t, ip: teachers.teacher_photo(j),
    '/api/teacher/index':       lambda j, t, ip: teachers.teacher_index(j),
    '/api/quote/fill':          lambda j, t, ip: office.quote_fill(j),
    '/api/quote/form':          lambda j, t, ip: office.quote_form_save(j),
    '/api/notion/probe':        lambda j, t, ip: notion.notion_probe(j),
    '/api/notion/voc':          lambda j, t, ip: notion.notion_voc(j),
    '/api/notion/proposals':    lambda j, t, ip: notion.notion_proposals(j),
    '/api/ai/fix':              lambda j, t, ip: ai.ai_fix(j),
    '/api/ai/condense':         lambda j, t, ip: ai.ai_condense(j),
    '/api/ai/detail':           lambda j, t, ip: ai.ai_detail(j),
    '/api/ai/curriculum':       lambda j, t, ip: ai.ai_curriculum(j),
    '/api/auth/login':          lambda j, t, ip: supa.auth_login(j, ip),
    '/api/admin/event':         lambda j, t, ip: supa.log_event(j, ip),
    '/api/admin/set':           lambda j, t, ip: supa.admin_set(t, j),
    '/api/admin/create-user':   lambda j, t, ip: supa.admin_create_user(t, j, ip),
    '/api/admin/reset-pw':      lambda j, t, ip: supa.admin_reset_pw(t, j),
    '/api/admin/delete-user':   lambda j, t, ip: supa.admin_delete_user(t, j),
    '/api/ppt/import':          lambda j, t, ip: office.ppt_import(j, _owner(t)),
    '/api/ppt/scan':            lambda j, t, ip: office.ppt_scan(j),
    '/api/ppt/rescan':          lambda j, t, ip: office.ppt_rescan(j),
    '/api/ppt/full':            lambda j, t, ip: office.ppt_full(j),
    '/api/ppt/audit':           lambda j, t, ip: office.ppt_audit(j),
    '/api/ppt/fill':            lambda j, t, ip: office.ppt_fill(j),
    '/api/ppt/remove':          lambda j, t, ip: office.ppt_remove(j.get('templateId') or ''),
    '/api/ppt/settings':        lambda j, t, ip: office.ppt_settings_put(j, _owner(t)),
    '/api/outlook/mail':        lambda j, t, ip: _mail(j),
    '/api/blob/new':            lambda j, t, ip: office.blob_new(j),
}


# 파일을 그대로 돌려주는 GET: fn(query, token) → (code, bytes, mime, 내려받을 이름|None)
def _blob_get(q):
    """로컬 파일 통로에서 내려받기 (웹은 Supabase 서명 주소로 바로 받는다)."""
    ref = (q.get('ref') or [''])[0]
    name = (q.get('name') or ['file'])[0]
    data = files.get(ref)
    if data is None:
        return 404, b'', 'text/plain', None
    mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    return 200, data, mime, name


_TPL_FILE = re.compile(r'^slide\d{1,3}(-full)?\.(svg|png)$')


def _tpl_file(q):
    """양식 미리보기 그림 (웹에서는 보관소에 있어 서버를 거친다). 원본 pptx 는 내주지 않는다."""
    tid = (q.get('tid') or [''])[0]
    name = (q.get('name') or [''])[0]
    if not _TPL_FILE.match(name):
        return 404, b'', 'text/plain', None
    try:
        data = files.tpl_get(tid, name)
    except ValueError:
        data = None
    if not data:
        return 404, b'', 'text/plain', None
    return 200, data, 'image/svg+xml' if name.endswith('.svg') else 'image/png', None


RAW = {
    '/api/blob/get': lambda q, t: _blob_get(q),
    '/api/tpl/file': lambda q, t: _tpl_file(q),
}

# 로그인 없이 열어 두는 길 — 로그인 그 자체와, 로그인 화면이 필요로 하는 것
OPEN = {'/api/status', '/api/supabase/config', '/api/auth/state', '/api/auth/login',
        '/api/admin/event', '/api/admin/me', '/api/admin/create-user'}

MAX_BODY = 96 * 1024 * 1024


def login_required():
    """웹이면 늘, 로컬이면 KMA_REQUIRE_LOGIN=1 일 때. 계정 표가 준비돼 있어야 한다."""
    want = IS_VERCEL or env('KMA_REQUIRE_LOGIN') == '1'
    return bool(want and supa.ready() and session.ready())


class ApiMixin:
    """BaseHTTPRequestHandler 에 섞어 쓴다. /api/* 를 처리했으면 True."""

    def _route(self):
        """(경로, 쿼리). Vercel 에서 /api/index 로 돌려 받은 경우 __route 로 원래 주소를 되찾는다."""
        parts = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(parts.query)
        route = (q.pop('__route', None) or [''])[0]
        path = '/api/' + route.lstrip('/') if route else parts.path
        return path.rstrip('/') or '/', q

    def _token(self):
        return (self.headers.get('Authorization') or '').replace('Bearer ', '').strip()

    def _ip(self):
        # Vercel · 프록시 뒤에서는 client_address 가 프록시다. 앞단이 적어 준 값을 먼저 본다.
        fwd = (self.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
        if fwd:
            return fwd
        real = (self.headers.get('X-Real-IP') or '').strip()
        if real:
            return real
        return self.client_address[0] if self.client_address else ''

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _raw(self, code, data, mime, name):
        self.send_response(code)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        if name:
            self.send_header('Content-Disposition',
                             "attachment; filename*=UTF-8''" + urllib.parse.quote(name))
            self.send_header('Cache-Control', 'no-store')
        else:
            self.send_header('Cache-Control', 'private, max-age=86400')
        self.end_headers()
        self.wfile.write(data)

    def _guard(self, path):
        """로그인이 필요한데 표가 없으면 막는다. 막았으면 True."""
        if path in OPEN:
            return False
        # 배포한 웹인데 계정 설정이 비어 있으면 열어 두지 않고 닫는다.
        # (설정이 빠진 채 배포되면 누구나 노션·AI 를 부를 수 있게 되는 것을 막는다)
        if IS_VERCEL and not (supa.ready() and session.ready()):
            self._json(503, {'error': 'not_configured',
                             'message': '서버에 계정 설정(SUPABASE_URL · SUPABASE_SECRET_KEY)이 없습니다.'})
            return True
        if not login_required():
            return False
        if session.verify(self._token()):
            return False
        self._json(401, {'error': 'login_required', 'message': '로그인이 필요합니다.'})
        return True

    def api_get(self):
        path, q = self._route()
        fn = GET.get(path)
        raw = RAW.get(path)
        if not fn and not raw:
            return False
        # 미리보기 그림은 <img> 로 불려서 머리글(토큰)을 못 싣는다 — 그림만은 열어 둔다
        if path != '/api/tpl/file' and self._guard(path):
            return True
        try:
            if raw:
                if path == '/api/blob/get' and files.cloud():
                    self._json(404, {'error': 'not_here'})
                    return True
                self._raw(*raw(q, self._token()))
                return True
            code, out = fn(q, self._token())
        except Exception as e:  # noqa: BLE001
            code, out = 500, {'error': 'server', 'message': str(e)[:300]}
        self._json(code, out)
        return True

    def api_post(self):
        path, _ = self._route()
        fn = POST.get(path)
        if not fn:
            return False
        if self._guard(path):
            return True
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY:
            self._json(400, {'error': 'too_big', 'message': '요청이 너무 큽니다.'})
            return True
        try:
            job = json.loads(self.rfile.read(length).decode('utf-8') or '{}')
        except Exception:  # noqa: BLE001
            self._json(400, {'error': 'bad_json'})
            return True
        try:
            code, out = fn(job, self._token(), self._ip())
        except Exception as e:  # noqa: BLE001
            code, out = 500, {'error': 'server', 'message': str(e)[:300]}
        self._json(code, out)
        return True

    def api_put(self):
        """로컬 파일 통로에 올리기. 웹에서는 브라우저가 Supabase 에 바로 올리므로 쓰지 않는다."""
        path, q = self._route()
        if path != '/api/blob/put':
            return False
        if files.cloud():
            self._json(404, {'error': 'not_here'})
            return True
        if self._guard(path):
            return True
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY:
            self._json(400, {'error': 'too_big', 'message': '파일이 너무 큽니다.'})
            return True
        try:
            files.local_put((q.get('ref') or [''])[0], self.rfile.read(length))
        except ValueError as e:
            self._json(400, {'error': 'bad_ref', 'message': str(e)})
            return True
        self._json(200, {'ok': True})
        return True
