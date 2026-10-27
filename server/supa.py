# -*- coding: utf-8 -*-
"""Supabase — 아이디·비밀번호 로그인 · 관리자 · 접속 이력

계정은 public.accounts 한 표에 있다 (server/sql/001_accounts.sql).
  username · password_hash(scrypt) · name · email · role('user'|'admin') · active

예전에는 로그인 한 번에 관리 API(sbp_… 액세스 토큰)로 SQL 을 몇 번씩 보냈다.
그 토큰이 만료되자(401) 로그인이 통째로 막혔다. 이제는 secret key 로
REST(PostgREST)만 쓴다 — 빠르고, 관리용 토큰 없이도 돈다.

accounts · login_history 는 RLS 가 켜져 있고 정책이 없다.
브라우저가 가진 publishable key 로는 손도 못 댄다. 읽고 쓰는 길은 여기 한 곳뿐이다.
"""

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from . import session
from .common import _get_json, _req_json
from .config import env


# ── 설정 ────────────────────────────────────────────────
#
#   project_url       공개. 브라우저가 부를 주소.
#   publishable_key   공개해도 되는 키. 예전 계정의 첫 로그인 확인에만 쓴다.
#   secret_key        **비밀**. 계정 표를 읽고 쓰는 열쇠. 서버 밖으로 나가지 않는다.
#   access_token      (선택) 관리 API. 연결 확인 화면에서 표 목록을 볼 때만 쓴다.

SUPA_ENV = {
    'project_url': 'SUPABASE_URL',
    'publishable_key': 'SUPABASE_PUBLISHABLE_KEY',
    'access_token': 'SUPABASE_ACCESS_TOKEN',
    'secret_key': 'SUPABASE_SECRET_KEY',
}


def supa_creds():
    return {k: env(name) for k, name in SUPA_ENV.items()}


def supa_ref(url):
    """프로젝트 ref. 대시보드 주소를 그대로 붙여 넣어도 받아 준다."""
    s = str(url or '').strip()
    m = re.search(r'https?://([a-z0-9]{16,})\.supabase\.(co|in)\b', s, re.I)
    if m:
        return m.group(1)
    m = re.search(r'supabase\.com/dashboard/project/([a-z0-9]{16,})', s, re.I)
    if m:
        return m.group(1)
    m = re.fullmatch(r'[a-z0-9]{16,}', s, re.I)
    return m.group(0) if m else ''


def supa_api_url(url):
    ref = supa_ref(url)
    return 'https://%s.supabase.co' % ref if ref else str(url or '').strip().rstrip('/')


def supa_sql(token, ref, sql):
    """관리 API 로 SQL 한 줄 (연결 확인 화면에서만)."""
    return _req_json('https://api.supabase.com/v1/projects/%s/database/query' % ref,
                     {'Authorization': 'Bearer ' + token}, payload={'query': sql})


def ready():
    c = supa_creds()
    return bool(c['project_url'] and c['secret_key'])


# ── REST ───────────────────────────────────────────────

class SetupNeeded(Exception):
    pass


def rest(method, path, params=None, body=None, prefer=None, timeout=20):
    """PostgREST 한 번. (상태, 본문)"""
    c = supa_creds()
    if not ready():
        raise SetupNeeded('환경변수 SUPABASE_URL · SUPABASE_SECRET_KEY 를 넣어 주세요.')
    url = supa_api_url(c['project_url']) + '/rest/v1/' + path
    if params:
        url += '?' + urllib.parse.urlencode(params, safe='(),.*:')
    h = {'apikey': c['secret_key'], 'Authorization': 'Bearer ' + c['secret_key'],
         'Accept': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        h['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode('utf-8', 'replace')
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'replace')
        try:
            out = json.loads(raw)
        except ValueError:
            out = raw
        # 표가 아직 없다 — SQL 을 한 번 돌려야 한다
        if e.code in (404, 400) and isinstance(out, dict) and (
                out.get('code') in ('PGRST205', '42P01') or 'does not exist' in str(out.get('message'))
                or 'Could not find the table' in str(out.get('message'))):
            raise SetupNeeded('Supabase 에 accounts 표가 없습니다. server/sql/001_accounts.sql 을 '
                              'SQL Editor 에서 한 번 실행해 주세요.')
        return e.code, out
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


def _setup_err(e):
    return 503, {'error': 'setup_needed', 'message': str(e)}


def _now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


# ── 계정 찾기 ──────────────────────────────────────────

_FIELDS = ('id,username,password_hash,name,email,role,active,legacy_email,'
           'created_at,last_login_at')


def find_account(key):
    """아이디 또는 이메일로(대소문자 무시). 없으면 None."""
    k = str(key or '').strip().lower()
    if not k:
        return None
    qv = '"%s"' % k.replace('"', '')
    code, rows = rest('GET', 'accounts', {
        'select': _FIELDS, 'or': '(username_key.eq.%s,email_key.eq.%s)' % (qv, qv), 'limit': '1'})
    if code == 200 and isinstance(rows, list) and rows:
        return rows[0]
    return None


def get_account(aid):
    if not aid:
        return None
    code, rows = rest('GET', 'accounts', {'select': _FIELDS, 'id': 'eq.' + str(aid), 'limit': '1'})
    if code == 200 and isinstance(rows, list) and rows:
        return rows[0]
    return None


def user_count():
    try:
        code, rows = rest('GET', 'accounts', {'select': 'id', 'limit': '1'})
    except SetupNeeded:
        return -1
    return len(rows) if code == 200 and isinstance(rows, list) else -1


def admin_count():
    code, rows = rest('GET', 'accounts', {'select': 'id', 'role': 'eq.admin', 'active': 'eq.true'})
    return len(rows) if code == 200 and isinstance(rows, list) else 0


def _public(acc):
    return {'username': acc.get('username'), 'name': acc.get('name'),
            'email': acc.get('email'), 'role': acc.get('role')}


# ── 접속 이력 ──────────────────────────────────────────

def log_event(job, ip):
    """접속 이력 한 줄. 실패한 로그인도 여기로 온다(실패한 쪽엔 세션이 없다)."""
    event = str(job.get('event') or '')
    if event not in ('signup', 'login', 'logout', 'login_failed'):
        return 400, {'error': 'bad_event'}
    row = {'event': event, 'ok': bool(job.get('ok', event != 'login_failed')),
           'email': job.get('email') or None, 'username': job.get('username') or None,
           'reason': job.get('reason') or None, 'user_agent': (job.get('user_agent') or '')[:300],
           'ip': ip or None}
    aid = job.get('account_id') or job.get('user_id')
    if aid and re.fullmatch(r'[0-9a-fA-F-]{36}', str(aid)):
        row['account_id'] = aid
    try:
        code, out = rest('POST', 'login_history', body=row, prefer='return=minimal')
    except SetupNeeded as e:
        return _setup_err(e)
    if code in (200, 201, 204):
        return 200, {'ok': True}
    return 502, {'error': 'history', 'message': out}


# ── 로그인 ────────────────────────────────────────────

def _legacy_ok(email, password):
    """옮겨 온 예전 계정 — Supabase Auth 로 비밀번호를 한 번 확인한다."""
    c = supa_creds()
    if not email or not c['publishable_key']:
        return False
    code, body = _req_json(
        supa_api_url(c['project_url']) + '/auth/v1/token?grant_type=password',
        {'apikey': c['publishable_key']}, payload={'email': email, 'password': password})
    return code == 200 and isinstance(body, dict) and bool(body.get('access_token'))


def auth_login(job, ip):
    username = str(job.get('username') or '').strip()
    password = str(job.get('password') or '')
    ua = (job.get('user_agent') or '')[:300]
    if not username or not password:
        return 400, {'error': 'missing', 'message': '아이디와 비밀번호를 입력해 주세요.'}
    try:
        acc = find_account(username)
    except SetupNeeded as e:
        return _setup_err(e)

    def fail(msg, email=None):
        log_event({'event': 'login_failed', 'email': email, 'username': username,
                   'reason': msg, 'user_agent': ua}, ip)
        return 401, {'error': 'bad_login', 'message': msg}

    # 없는 아이디인지 비밀번호가 틀린 건지 구분해 알려 주지 않는다
    if not acc:
        return fail('아이디 또는 비밀번호가 맞지 않습니다.')
    if not acc.get('active', True):
        return fail('사용이 중지된 계정입니다. 관리자에게 문의해 주세요.', acc.get('email'))

    h = acc.get('password_hash') or ''
    if h == 'supabase-auth':
        ok = _legacy_ok(acc.get('legacy_email') or acc.get('email'), password)
        if ok:
            # 확인됐으니 이제부터는 이 표의 해시로
            acc['password_hash'] = session.hash_pw(password)
            rest('PATCH', 'accounts', {'id': 'eq.' + acc['id']},
                 {'password_hash': acc['password_hash'], 'updated_at': _now()},
                 prefer='return=minimal')
    else:
        ok = session.check_pw(password, h)
    if not ok:
        return fail('아이디 또는 비밀번호가 맞지 않습니다.', acc.get('email'))

    rest('PATCH', 'accounts', {'id': 'eq.' + acc['id']}, {'last_login_at': _now()},
         prefer='return=minimal')
    log_event({'event': 'login', 'email': acc.get('email'), 'username': acc.get('username'),
               'account_id': acc['id'], 'user_agent': ua}, ip)
    return 200, {
        'access_token': session.issue(acc), 'token_type': 'bearer', 'expires_in': session.TTL,
        'user': {'id': acc['id'], 'email': acc.get('email')},
        'profile': _public(acc),
    }


# ── 누구인가 · 관리자인가 ──────────────────────────────

def who(token):
    """표가 맞고 계정이 살아 있으면 계정 dict, 아니면 None"""
    body = session.verify(token)
    if not body:
        return None
    acc = get_account(body.get('sub'))
    if not acc or not acc.get('active', True):
        return None
    # 비밀번호가 바뀐 뒤의 예전 표는 받지 않는다
    if body.get('pv') and body.get('pv') != session.pw_stamp(acc.get('password_hash')):
        return None
    return acc


def _need_admin(token):
    try:
        acc = who(token)
    except SetupNeeded as e:
        return None, _setup_err(e)
    if not acc:
        return None, (401, {'error': 'bad_token', 'message': '로그인이 필요합니다.'})
    if acc.get('role') != 'admin':
        return None, (403, {'error': 'not_admin', 'message': '관리자 계정만 볼 수 있습니다.'})
    return acc, None


def admin_me(token):
    try:
        acc = who(token)
    except SetupNeeded as e:
        return _setup_err(e)
    if not acc:
        return 401, {'error': 'bad_token', 'message': '로그인이 필요합니다.'}
    return 200, {'ok': True,
                 'user': {'id': acc['id'], 'email': acc.get('email'),
                          'created_at': acc.get('created_at'),
                          'last_sign_in_at': acc.get('last_login_at')},
                 'username': acc.get('username'), 'name': acc.get('name'),
                 'role': acc.get('role'),
                 'is_admin': acc.get('role') == 'admin', 'admin_count': admin_count()}


# ── 관리자 일 ──────────────────────────────────────────

_USERNAME_OK = re.compile(r'^[A-Za-z0-9._-]{3,32}$')


def admin_create_user(token, job, ip):
    """관리자가 계정을 발급한다. 계정이 하나도 없을 때만 토큰 없이 첫 관리자를 세울 수 있다."""
    try:
        first = user_count() == 0
        me, err = (None, None) if first else _need_admin(token)
    except SetupNeeded as e:
        return _setup_err(e)
    if err:
        return err
    username = str(job.get('username') or '').strip()
    password = str(job.get('password') or '')
    email = str(job.get('email') or '').strip()
    name = str(job.get('name') or '').strip()
    role = 'admin' if (first or job.get('admin') or job.get('role') == 'admin') else 'user'

    if not _USERNAME_OK.match(username):
        return 400, {'error': 'bad_username', 'message': '아이디는 영문·숫자·. _ - 로 3~32자입니다.'}
    if len(password) < 6:
        return 400, {'error': 'bad_password', 'message': '비밀번호는 6자 이상이어야 합니다.'}
    if not name:
        return 400, {'error': 'no_name', 'message': '이름을 입력해 주세요.'}
    if email and not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
        return 400, {'error': 'bad_email', 'message': '이메일 주소 모양이 올바르지 않습니다.'}
    if find_account(username) or (email and find_account(email)):
        return 409, {'error': 'dup_username', 'message': '이미 쓰고 있는 아이디나 이메일입니다.'}

    row = {'username': username, 'password_hash': session.hash_pw(password), 'name': name,
           'email': email or None, 'role': role, 'created_by': (me or {}).get('id')}
    code, out = rest('POST', 'accounts', body=row, prefer='return=representation')
    if code not in (200, 201) or not isinstance(out, list) or not out:
        msg = out.get('message') if isinstance(out, dict) else str(out)
        if 'duplicate' in str(msg):
            return 409, {'error': 'dup_username', 'message': '이미 쓰고 있는 아이디나 이메일입니다.'}
        return 502, {'error': 'create_failed', 'message': msg}
    acc = out[0]
    log_event({'event': 'signup', 'email': email, 'username': username, 'account_id': acc['id'],
               'reason': '%s 가 발급' % ((me or {}).get('username') or '첫 관리자')}, ip)
    return 200, {'ok': True, 'user_id': acc['id'], 'username': username, 'role': role}


def admin_reset_pw(token, job):
    me, err = _need_admin(token)
    if err:
        return err
    target = str(job.get('user_id') or '')
    password = str(job.get('password') or '')
    if not target:
        return 400, {'error': 'no_user'}
    if len(password) < 6:
        return 400, {'error': 'bad_password', 'message': '비밀번호는 6자 이상이어야 합니다.'}
    code, out = rest('PATCH', 'accounts', {'id': 'eq.' + target},
                     {'password_hash': session.hash_pw(password), 'updated_at': _now()},
                     prefer='return=representation')
    if code in (200, 204) and out:
        return 200, {'ok': True}
    return 404, {'error': 'no_user', 'message': '그 계정이 없습니다.'}


def admin_delete_user(token, job):
    me, err = _need_admin(token)
    if err:
        return err
    target = str(job.get('user_id') or '')
    if not target:
        return 400, {'error': 'no_user'}
    if target == me['id']:
        return 400, {'error': 'self', 'message': '자기 계정은 지울 수 없습니다.'}
    code, out = rest('DELETE', 'accounts', {'id': 'eq.' + target}, prefer='return=representation')
    if code in (200, 204):
        return 200, {'ok': True}
    return 502, {'error': 'delete_failed', 'message': str(out)}


def admin_set(token, job):
    """권한 바꾸기 — 일반 ↔ 관리자"""
    me, err = _need_admin(token)
    if err:
        return err
    target = str(job.get('user_id') or '')
    make = bool(job.get('admin')) if 'admin' in job else job.get('role') == 'admin'
    if not target:
        return 400, {'error': 'no_user'}
    if not make and target == me['id']:
        return 400, {'error': 'self', 'message': '자기 자신의 관리자 권한은 뺄 수 없습니다.'}
    code, out = rest('PATCH', 'accounts', {'id': 'eq.' + target},
                     {'role': 'admin' if make else 'user', 'updated_at': _now()},
                     prefer='return=representation')
    if code in (200, 204) and out:
        return 200, {'ok': True}
    return 404, {'error': 'no_user', 'message': '그 계정이 없습니다.'}


def admin_users(token):
    me, err = _need_admin(token)
    if err:
        return err
    code, rows = rest('GET', 'accounts', {
        'select': 'id,username,name,email,role,active,created_at,last_login_at',
        'order': 'created_at.asc'})
    if code != 200:
        return 502, {'error': 'list', 'message': rows}
    return 200, {'ok': True, 'rows': [{
        'id': r['id'], 'username': r.get('username'), 'name': r.get('name'),
        'email': r.get('email'), 'role': r.get('role'), 'active': r.get('active', True),
        'is_admin': r.get('role') == 'admin',
        'created_at': r.get('created_at'), 'last_sign_in_at': r.get('last_login_at'),
    } for r in rows or []]}


def admin_history(token, limit=100):
    me, err = _need_admin(token)
    if err:
        return err
    code, rows = rest('GET', 'login_history', {
        'select': 'id,email,username,event,ok,reason,ip,at,account_id',
        'order': 'at.desc', 'limit': str(max(1, min(500, int(limit))))})
    if code != 200:
        return 502, {'error': 'history', 'message': rows}
    code2, accs = rest('GET', 'accounts', {'select': 'id,username,name'})
    names = {}
    for a in accs if isinstance(accs, list) else []:
        names[a['id']] = a.get('name')
        names[(a.get('username') or '').lower()] = a.get('name')
    for r in rows or []:
        r['name'] = names.get(r.get('account_id')) or names.get((r.get('username') or '').lower()) or ''
    return 200, {'ok': True, 'rows': rows or []}


# ── 연결 확인 (관리자 화면) ─────────────────────────────

def supa_status():
    c = supa_creds()
    missing = [k for k in ('project_url', 'secret_key') if not c[k]]
    if missing:
        return {'ok': False, 'reason': 'missing', 'missing': missing,
                'message': '환경변수 %s 값이 비어 있습니다.' % ', '.join(SUPA_ENV[k] for k in missing)}
    api = supa_api_url(c['project_url'])
    out = {'ok': False, 'ref': supa_ref(c['project_url']), 'url': api}
    try:
        code, rows = rest('GET', 'accounts', {'select': 'id,role'})
        out['accounts'] = {'ok': code == 200, 'status': code,
                           'count': len(rows) if isinstance(rows, list) else 0,
                           'admins': len([r for r in rows or [] if r.get('role') == 'admin'])
                           if isinstance(rows, list) else 0}
    except SetupNeeded as e:
        out['accounts'] = {'ok': False, 'setup_needed': True, 'message': str(e)}
    if c['access_token']:
        code, body = _get_json('https://api.supabase.com/v1/projects',
                               {'Authorization': 'Bearer ' + c['access_token']})
        out['mgmt'] = {'ok': code == 200, 'status': code}
        if code in (401, 403):
            out['mgmt']['message'] = ('SUPABASE_ACCESS_TOKEN(관리 API)이 만료됐습니다. '
                                      '로그인에는 쓰지 않으므로 급하지는 않습니다.')
    out['ok'] = bool(out.get('accounts', {}).get('ok'))
    return out
