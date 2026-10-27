# -*- coding: utf-8 -*-
"""설정 · 경로 · 실행 환경

비밀 값은 전부 환경변수에서 읽는다.
  · 로컬(relay.py)   — 프로젝트 맨 위의 .env 를 읽어 환경변수로 올린다.
  · Vercel           — 대시보드(Settings → Environment Variables)에 넣은 값이 그대로 들어온다.
이미 환경변수에 있는 값은 .env 가 덮어쓰지 않는다.

쓰는 이름은 .env.example 에 모두 적어 두었다.
"""

import os
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Vercel 은 함수 안에 VERCEL=1 을 넣어 준다.
IS_VERCEL = bool(os.environ.get('VERCEL'))
IS_WINDOWS = os.name == 'nt'

# Vercel 함수의 파일 시스템은 /tmp 말고는 읽기 전용이다.
READ_ONLY = IS_VERCEL


def _load_dotenv(path):
    """표준 라이브러리만으로 .env 를 읽는다 (KEY=VALUE, # 주석, 따옴표 허용)."""
    try:
        with open(path, encoding='utf-8-sig') as f:
            lines = f.read().splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, val = line.split('=', 1)
        key = key.strip()
        if key.startswith('export '):
            key = key[7:].strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in '"\'':
            val = val[1:-1]
        os.environ.setdefault(key, val)


_load_dotenv(os.path.join(ROOT, '.env'))


def env(name, default=''):
    return str(os.environ.get(name) or default).strip()


# ── 경로 ─────────────────────────────────────────────

# 브라우저에 그대로 나가는 파일 (Vercel 이 정적 파일로 서빙한다)
PUBLIC_DIR = os.path.join(ROOT, 'public')

# 올린 PPT 양식. 브라우저가 썸네일을 templates/<id>/slideN.png 로 부른다.
TPL_DIR = os.path.join(PUBLIC_DIR, 'templates')

# 회사 견적서 엑셀 양식 (로컬 전용 — 엑셀이 있어야 채울 수 있다)
QUOTE_FORM = os.path.join(ROOT, 'forms', '견적서양식.xlsx')

# 메일 첨부를 잠깐 풀어 두는 곳 (로컬 전용)
OUT_DIR = os.path.join(tempfile.gettempdir(), 'kma-mail')

# 서버만 읽는 캐시 (강사 색인 · 지난 제안서). 브라우저로는 나가지 않는다.
DATA_DIR = os.path.join(ROOT, 'server', 'data')

# 캐시를 새로 쓸 곳. Vercel 은 /tmp 만 쓸 수 있고, 함수가 식으면 사라진다.
# 그래서 읽을 때는 /tmp 에 새것이 있으면 그것을, 없으면 배포에 실려 간 파일을 본다.
CACHE_DIR = os.path.join(tempfile.gettempdir(), 'kma-cache') if READ_ONLY else DATA_DIR


def cache_write_path(name):
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, name)


def cache_read_path(name):
    fresh = os.path.join(CACHE_DIR, name)
    if os.path.exists(fresh):
        return fresh
    return os.path.join(DATA_DIR, name)
