# -*- coding: utf-8 -*-
"""노션 (읽기 전용) — 교육 문의(VOC) · 지난 제안서"""

import json
import re
import time

from .common import _req_json
from .config import cache_read_path, cache_write_path, env


# ── 노션 (읽기 전용) ────────────────────────────────────────────────
#
# 사내 노션에는 고객 자료가 들어 있다. **고치면 안 된다.**
# 그래서 '고치지 않겠다' 는 약속에 기대지 않고, 고칠 길을 만들지 않았다.
#
#   · 나가는 요청은 아래 흰 목록에 **정확히** 맞는 주소만 통과한다.
#   · PATCH · PUT · DELETE 는 함수 자체가 거부한다. 노션에서 무언가를
#     바꾸는 일은 전부 이 셋이다.
#   · POST 는 두 군데만 연다 — 데이터베이스 조회와 검색. 둘 다 이름만
#     POST 지 읽기다. 페이지를 만드는 POST /v1/pages 는 목록에 없다.
#
# 목록에 없는 주소는 relay 가 네트워크에 내보내기 전에 막는다.


NOTION_API = 'https://api.notion.com'
NOTION_VER = '2022-06-28'

_NOTION_ID = r'[0-9a-fA-F]{32}|[0-9a-fA-F\-]{36}'

# (정규식, 허용 메서드) — 여기 없는 것은 전부 막힌다
_NOTION_ALLOW = [
    (re.compile(r'^/v1/users/me$'), ('GET',)),
    (re.compile(r'^/v1/users$'), ('GET',)),
    (re.compile(r'^/v1/databases/(%s)$' % _NOTION_ID), ('GET',)),
    (re.compile(r'^/v1/databases/(%s)/query$' % _NOTION_ID), ('POST',)),   # 조회
    (re.compile(r'^/v1/data_sources/(%s)$' % _NOTION_ID), ('GET',)),
    (re.compile(r'^/v1/data_sources/(%s)/query$' % _NOTION_ID), ('POST',)),
    (re.compile(r'^/v1/pages/(%s)$' % _NOTION_ID), ('GET',)),
    (re.compile(r'^/v1/pages/(%s)/properties/' % _NOTION_ID), ('GET',)),
    (re.compile(r'^/v1/blocks/(%s)/children$' % _NOTION_ID), ('GET',)),
    (re.compile(r'^/v1/search$'), ('POST',)),                              # 검색
]


def notion_token(which=''):
    """통합이 둘이다.

      token      — 'kma'.       제안 프로그램 카탈로그가 연결돼 있다.
      voc_token  — 'KMA 자동화'. 사업문의 VOC 용으로 새로 만든 것.

    노션 통합은 '연결된 페이지'만 본다. 그래서 무엇을 읽느냐에 따라
    키가 갈린다. 없으면 기본 키로 떨어진다.

    환경변수: NOTION_TOKEN (token) · NOTION_VOC_TOKEN (voc_token)
    """
    if which == 'voc_token':
        t = env('NOTION_VOC_TOKEN')
        if t:
            return t
    return env('NOTION_TOKEN')


def notion_read(path, payload=None, which=''):
    """노션에서 **읽기만** 한다. 쓰기는 여기로 들어올 수 없다."""
    token = notion_token(which)
    if not token:
        return 400, {'error': 'no_token', 'message': '환경변수 NOTION_TOKEN 이 없습니다.'}

    method = 'POST' if payload is not None else 'GET'
    if method not in ('GET', 'POST'):
        return 403, {'error': 'blocked', 'message': '읽기 외의 요청은 막혀 있습니다.'}

    ok = False
    for rx, methods in _NOTION_ALLOW:
        if rx.match(path) and method in methods:
            ok = True
            break
    if not ok:
        return 403, {'error': 'blocked',
                     'message': '읽기 목록에 없는 주소입니다: %s %s' % (method, path)}

    return _req_json(NOTION_API + path,
                     {'Authorization': 'Bearer ' + token,
                      'Notion-Version': NOTION_VER,
                      'Accept': 'application/json'},
                     payload=payload)


# ── 실제로 나간 제안서 96건 ────────────────────────────
#
# '인재개발센터 제안서 데이터베이스'. HD현대중공업·LG전자·포스코처럼
# 실제로 보낸 제안서가 한 건씩 들어 있고, 칸에 이미 정리돼 있다:
#
#   모듈 구성 · 프로그램 컨셉 · VOC/핵심 문제 · 산출물/Output · 시그니처 표현
#   교육 시간(H) · 교육 일수 · 제안 금액(원) · 추천 강사 · 키워드 · 교육 영역
#
# 본문에는 '📑 커리큘럼' 표가 모듈·시간·내용 세 칸으로 들어 있다. 그 표가
# 우리가 찾던 커리큘럼 원천이다 — PDF 를 뜯을 필요가 없다.
#
# 읽기만 한다. 첨부된 제안서 PDF 는 내려받지 않는다.

PROPOSAL_CACHE = 'notion-proposals.json'


def _rt(props, key):
    v = (props.get(key) or {}).get('rich_text') or []
    return ''.join(x.get('plain_text', '') for x in v).strip()


def _ms(props, key):
    return [x.get('name') for x in ((props.get(key) or {}).get('multi_select') or [])
            if x.get('name')]


def _sel(props, key):
    return ((props.get(key) or {}).get('select') or {}).get('name') or ''


def _num(props, key):
    return (props.get(key) or {}).get('number')


def proposal_body(page_id):
    """제안서 한 건의 본문에서 커리큘럼 표와 예산 줄을 꺼낸다."""
    out = {'curriculum': [], 'budget': [], 'intro': ''}
    code, d = notion_read('/v1/blocks/%s/children' % page_id, which='voc_token')
    if code != 200:
        return out

    blocks = d.get('results') or []
    heading = ''
    for b in blocks:
        t = b.get('type')
        node = b.get(t) or {}
        txt = ''.join(x.get('plain_text', '') for x in (node.get('rich_text') or [])).strip()

        if t == 'heading_2':
            heading = txt
            continue

        if t == 'paragraph' and not out['intro'] and len(txt) >= 30:
            out['intro'] = txt
            continue

        if t == 'bulleted_list_item' and '예산' in heading and txt:
            out['budget'].append(txt)
            continue

        if t == 'table':
            c2, rows = notion_read('/v1/blocks/%s/children' % b['id'], which='voc_token')
            if c2 != 200:
                continue
            grid = []
            for r in (rows.get('results') or []):
                cells = (r.get('table_row') or {}).get('cells') or []
                grid.append([''.join(y.get('plain_text', '') for y in c).strip()
                             for c in cells])
            if not grid:
                continue
            # 머리글에 '모듈'·'시간'·'내용' 이 있으면 커리큘럼 표다.
            head = ' '.join(grid[0])
            if '모듈' in head or '시간' in head or '차시' in head:
                out['curriculum'] = grid
            elif not out['curriculum'] and len(grid) > 1:
                out['curriculum'] = grid      # 머리글이 달라도 첫 표는 대개 커리큘럼
    return out


def notion_proposals(job):
    """제안서 96건을 읽어 온다. 본문까지 읽으므로 한 번 읽고 캐시에 둔다."""
    cached = {}
    try:
        with open(cache_read_path(PROPOSAL_CACHE), encoding='utf-8') as f:
            cached = json.load(f)
    except Exception:  # noqa: BLE001
        cached = {}
    if cached.get('items') and not job.get('refresh'):
        return 200, {'ok': True, 'count': len(cached['items']),
                     'items': cached['items'], 'at': cached.get('at', ''),
                     'from': 'cache'}

    dbid = str(job.get('db') or '').strip() or env('NOTION_PROPOSAL_DB')
    if not dbid:
        return 400, {'error': 'no_db',
                     'message': '환경변수 NOTION_PROPOSAL_DB 를 넣어 주세요.'}

    rows, cursor, guard = [], None, 0
    while guard < 20:
        guard += 1
        payload = {'page_size': 100}
        if cursor:
            payload['start_cursor'] = cursor
        code, d = notion_read('/v1/databases/%s/query' % dbid.replace('-', ''),
                              payload=payload, which='voc_token')
        if code != 200:
            if cached.get('items'):
                return 200, {'ok': True, 'items': cached['items'], 'stale': True,
                             'count': len(cached['items']),
                             'message': str((d or {}).get('message') or '')[:200]}
            return code, d if isinstance(d, dict) else {'error': 'notion'}
        rows += d.get('results') or []
        if not d.get('has_more'):
            break
        cursor = d.get('next_cursor')

    deep = int(job.get('deep') or 0)      # 본문까지 읽을 건수 (0 이면 전부)
    items = []
    for i, r in enumerate(rows):
        p = r.get('properties') or {}
        name = ''
        for k, v in p.items():
            if v.get('type') == 'title':
                name = ''.join(x.get('plain_text', '') for x in (v.get('title') or []))
                break
        if not name:
            continue
        it = {
            'id': r.get('id'),
            'name': name,
            'client': _rt(p, '고객사명'),
            'areas': _ms(p, '교육 영역'),
            'keywords': _ms(p, '키워드'),
            'targets': _ms(p, '대상자'),
            'segment': _ms(p, '제안 고객사'),
            'teachers': _ms(p, '추천 강사'),
            'outside': _rt(p, '외부 강사/명사'),
            'concept': _rt(p, '프로그램 컨셉'),
            'voc': _rt(p, 'VOC/핵심 문제'),
            'output': _rt(p, '산출물/Output'),
            'signature': _rt(p, '시그니처 표현'),
            'modules': _rt(p, '모듈 구성'),
            'hours': _num(p, '교육 시간(H)'),
            'headcount': _num(p, '규모(명)'),
            'price': _num(p, '제안 금액(원)'),
            'moduleCount': _num(p, '모듈 수'),
            'days': _sel(p, '교육 일수'),
            'joinWay': _sel(p, '참여 방식'),
            'runWay': _sel(p, '운영 방식'),
            # 최근 것을 위로 올리는 데 쓴다 — 이 DB 에는 수주 여부 칸이 없어서
            # '요즘 나가는 제안' 을 가늠할 수 있는 건 만든 날짜뿐이다.
            'at': (p.get('생성 일시') or {}).get('created_time') or '',
            'url': r.get('url') or '',
            'curriculum': [], 'budget': [], 'intro': '', 'deep': False,
        }
        if not deep or i < deep:
            b = proposal_body(it['id'])
            it['curriculum'] = b['curriculum']
            it['budget'] = b['budget']
            it['intro'] = b['intro']
            it['deep'] = True
            time.sleep(0.05)
        items.append(it)

    out = {'ok': True, 'count': len(items), 'items': items,
           'at': time.strftime('%Y-%m-%d %H:%M'), 'from': 'notion'}
    try:
        with open(cache_write_path(PROPOSAL_CACHE), 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False)
    except Exception:  # noqa: BLE001
        pass
    return 200, out


def notion_voc(job):
    """교육 문의를 읽어 온다. **고객 개인정보는 가져오지 않는다.**

    이 DB 에는 성명·연락처·이메일이 들어 있다. 제안서를 만드는 데는 필요 없으므로
    아예 읽어서 내보내지 않는다. 여기서 거르면 브라우저도, 화면도, 파일도
    그 값을 볼 일이 없다. 캐시도 두지 않는다 — 고객 연락처가 파일로 쌓이면 안 된다.
    """
    dbid = str(job.get('db') or '').strip() or env('NOTION_VOC_DB')
    if not dbid:
        return 400, {'error': 'no_db', 'message': '문의 데이터베이스를 알려 주세요.'}

    payload = {'page_size': int(job.get('limit') or 30)}
    code, d = notion_read('/v1/databases/%s/query' % dbid, payload=payload,
                          which='voc_token')
    if code != 200:
        return code, d if isinstance(d, dict) else {'error': 'notion'}

    def txt(rt):
        return ''.join(x.get('plain_text', '') for x in (rt or []))

    def title(pr):
        return ''.join(x.get('plain_text', '') for x in ((pr or {}).get('title') or []))

    def pick(pr):
        """select · status 는 이름만 꺼낸다"""
        if not pr:
            return ''
        v = pr.get(pr.get('type') or '') or {}
        return (v or {}).get('name') or ''

    def num(pr):
        if not pr:
            return None
        t = pr.get('type')
        if t == 'number':
            return pr.get('number')
        if t == 'formula':
            f = pr.get('formula') or {}
            return f.get('number')
        return None

    # 내보낼 칸을 흰 목록으로 못박는다. 여기 없는 칸은 읽어도 버린다.
    #
    # 이름·이메일은 처음에 뺐다가 다시 넣었다. 제안서를 결국 **그 사람에게**
    # 보내야 하는데, 그때마다 노션을 다시 열어 주소를 옮겨 적어야 했다.
    # 대신 목록에는 띄우지 않는다 — 화면을 남이 볼 때 연락처가 깔리면 안 된다.
    # 전화번호는 메일 보내는 데 쓰이지 않으므로 계속 버린다.
    KEEP = ('회사', '문의제목', '문의내용', '부서', '직급', '이름', '이메일',
            '팀 분배', '진행상태', '등급', '유입경로', '태그',
            '문의연도', '문의 시기', '제출 일시', '매출', '매출이익')
    DROP = ('전화번호', '응답자')

    out = []
    for r in (d.get('results') or []):
        p = r.get('properties') or {}
        company = title(p.get('회사'))
        subject = txt((p.get('문의제목') or {}).get('rich_text'))
        ask = txt((p.get('문의내용') or {}).get('rich_text'))
        if not (company or ask or subject):
            continue
        out.append({
            'id': r.get('id'),
            'company': company,
            'subject': subject,
            'ask': ask,
            'dept': txt((p.get('부서') or {}).get('rich_text')),
            'rank': txt((p.get('직급') or {}).get('rich_text')),
            # 아래 둘은 제안서를 보낼 때만 쓴다 — 목록에는 그리지 않는다
            'person': txt((p.get('이름') or {}).get('rich_text')),
            'email': (p.get('이메일') or {}).get('email') or '',
            'team': pick(p.get('팀 분배')),
            'stage': pick(p.get('진행상태')),
            'grade': pick(p.get('등급')),
            'source': pick(p.get('유입경로')),
            'tags': [t.get('name') for t in ((p.get('태그') or {}).get('multi_select') or [])],
            'year': pick(p.get('문의연도')),
            'month': pick(p.get('문의 시기')),
            'at': ((p.get('제출 일시') or {}).get('created_time')
                   or r.get('created_time') or ''),
            'sales': num(p.get('매출')),
            'profit': num(p.get('매출이익')),
            'url': r.get('url') or '',
        })
    out.sort(key=lambda x: x['at'], reverse=True)
    return 200, {'ok': True, 'count': len(out), 'items': out,
                 'stats': voc_stats(out),
                 'kept': list(KEEP), 'dropped': list(DROP), 'stored': False}


WON = ('수주성공',)
LOST = ('수주실패', '진행철회')


def voc_stats(items):
    """무엇이 실제로 수주로 이어졌나 — 태그 단위로 센다.

    태그는 문의의 '주제' 에 가장 가깝다. 어떤 주제가 잘 팔렸는지 알면
    템플릿을 고를 때 근거가 생긴다. 개별 건을 들추지 않고 수만 센다.
    """
    by = {}
    for x in items:
        for t in (x.get('tags') or []):
            s = by.setdefault(t, {'tag': t, 'n': 0, 'won': 0, 'lost': 0, 'sales': 0})
            s['n'] += 1
            if x.get('stage') in WON:
                s['won'] += 1
                s['sales'] += (x.get('sales') or 0)
            elif x.get('stage') in LOST:
                s['lost'] += 1
    out = []
    for s in by.values():
        decided = s['won'] + s['lost']
        s['rate'] = (s['won'] / decided) if decided else None
        out.append(s)
    out.sort(key=lambda s: (-s['won'], -s['n']))
    return {
        'tags': out[:20],
        'total': len(items),
        'won': sum(1 for x in items if x.get('stage') in WON),
        'lost': sum(1 for x in items if x.get('stage') in LOST),
        'sales': sum((x.get('sales') or 0) for x in items if x.get('stage') in WON),
    }


def notion_probe(job):
    """연결과 접근 권한을 확인한다. 아무것도 바꾸지 않는다."""
    out = {'ok': False, 'read_only': True}

    code, me = notion_read('/v1/users/me')
    out['auth'] = {'status': code}
    if code == 200 and isinstance(me, dict):
        bot = me.get('bot') or {}
        ws = bot.get('workspace_name') or (bot.get('owner') or {}).get('workspace')
        out['auth']['ok'] = True
        out['auth']['name'] = me.get('name')
        out['auth']['workspace'] = ws if isinstance(ws, str) else None
    else:
        out['auth']['ok'] = False
        out['auth']['message'] = str((me or {}).get('message') or me)[:200]
        return 200, out

    raw = str(job.get('db') or '').strip()
    m = re.search(_NOTION_ID, raw)
    if not m:
        out['db'] = {'ok': False, 'message': '데이터베이스 주소에서 id 를 못 찾았습니다.'}
        return 200, out
    dbid = m.group(0)

    code, db = notion_read('/v1/databases/' + dbid)
    out['db'] = {'status': code, 'id': dbid}
    if code == 200 and isinstance(db, dict):
        title = ''.join([t.get('plain_text', '') for t in (db.get('title') or [])])
        props = db.get('properties') or {}
        out['db']['ok'] = True
        out['db']['title'] = title
        out['db']['columns'] = [
            {'name': k, 'type': v.get('type')} for k, v in props.items()
        ]
    else:
        out['db']['ok'] = False
        out['db']['message'] = str((db or {}).get('message') or db)[:300]

    out['ok'] = bool(out['auth'].get('ok') and out['db'].get('ok'))
    return 200, out
