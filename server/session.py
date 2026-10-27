# -*- coding: utf-8 -*-
"""로그인 표(세션 토큰) · 비밀번호 해시 — 표준 라이브러리만.

비밀번호
  원문은 어디에도 두지 않는다. scrypt 로 해시해 accounts.password_hash 에 둔다.
  (scrypt 가 없는 파이썬이면 pbkdf2-sha256 으로)

세션 토큰
  로그인에 성공하면 서버가 서명한 표를 준다. 브라우저는 그것을 들고 다니고,
  서버는 서명만 확인하면 된다 — 서버에 따로 적어 둘 것이 없어서 Vercel 처럼
  요청마다 새로 뜨는 곳에서도 그대로 돈다.
  서명 열쇠는 KMA_SESSION_SECRET, 없으면 SUPABASE_SECRET_KEY 에서 뽑는다.
"""

import base64
import hashlib
import hmac
import json
import os
import time

from .config import env

TTL = 12 * 3600        # 12시간이 지나면 다시 로그인


def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode('ascii')


def _unb64(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


# ── 비밀번호 ───────────────────────────────────────────

def hash_pw(pw):
    salt = os.urandom(16)
    raw = str(pw).encode('utf-8')
    try:
        dk = hashlib.scrypt(raw, salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
        return 'scrypt$16384$8$1$%s$%s' % (_b64(salt), _b64(dk))
    except (AttributeError, ValueError):
        it = 390000
        dk = hashlib.pbkdf2_hmac('sha256', raw, salt, it)
        return 'pbkdf2_sha256$%d$%s$%s' % (it, _b64(salt), _b64(dk))


def check_pw(pw, stored):
    try:
        parts = str(stored or '').split('$')
        raw = str(pw).encode('utf-8')
        if parts[0] == 'scrypt' and len(parts) == 6:
            n, r, p = int(parts[1]), int(parts[2]), int(parts[3])
            salt, want = _unb64(parts[4]), _unb64(parts[5])
            got = hashlib.scrypt(raw, salt=salt, n=n, r=r, p=p, dklen=len(want))
            return hmac.compare_digest(got, want)
        if parts[0] == 'pbkdf2_sha256' and len(parts) == 4:
            it, salt, want = int(parts[1]), _unb64(parts[2]), _unb64(parts[3])
            got = hashlib.pbkdf2_hmac('sha256', raw, salt, it)
            return hmac.compare_digest(got, want)
    except Exception:  # noqa: BLE001
        return False
    return False


# ── 세션 토큰 ──────────────────────────────────────────

def _key():
    s = env('KMA_SESSION_SECRET') or env('SUPABASE_SECRET_KEY')
    if not s:
        return None
    return hmac.new(s.encode('utf-8'), b'kma-session-v1', hashlib.sha256).digest()


def ready():
    return _key() is not None


def pw_stamp(password_hash):
    """비밀번호가 바뀌면 예전 표가 못 쓰이게 — 해시의 지문을 표에 넣어 둔다."""
    return hashlib.sha256(str(password_hash or '').encode('utf-8')).hexdigest()[:10]


def issue(acc):
    key = _key()
    if not key:
        raise RuntimeError('세션 서명 열쇠가 없습니다 (SUPABASE_SECRET_KEY).')
    body = {'sub': acc.get('id'), 'u': acc.get('username'), 'r': acc.get('role') or 'user',
            'pv': pw_stamp(acc.get('password_hash')),
            'iat': int(time.time()), 'exp': int(time.time()) + TTL}
    head = _b64(json.dumps(body, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    sig = _b64(hmac.new(key, ('kma1.' + head).encode('ascii'), hashlib.sha256).digest())
    return 'kma1.%s.%s' % (head, sig)


def verify(token):
    """맞는 표면 안의 내용(dict), 아니면 None"""
    key = _key()
    if not key or not token or not str(token).startswith('kma1.'):
        return None
    try:
        _, head, sig = str(token).split('.')
        want = _b64(hmac.new(key, ('kma1.' + head).encode('ascii'), hashlib.sha256).digest())
        if not hmac.compare_digest(want, sig):
            return None
        body = json.loads(_unb64(head).decode('utf-8'))
        if int(body.get('exp') or 0) < time.time():
            return None
        return body
    except Exception:  # noqa: BLE001
        return None
