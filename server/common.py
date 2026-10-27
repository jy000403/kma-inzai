# -*- coding: utf-8 -*-
"""여러 모듈이 같이 쓰는 작은 도구 — 파일명 다듬기 · JSON 주고받기."""

import json
import re

_BAD = re.compile(r'[\\/:*?"<>|\r\n\t]')


def safe_name(name):
    """파일명에서 폴더를 타고 올라가는 글자를 지운다."""
    name = _BAD.sub('_', str(name or 'file'))
    name = name.strip().strip('.') or 'file'
    return name[:120]


def _req_json(url, headers, timeout=20, payload=None):
    """표준 라이브러리만으로 GET/POST. (상태코드, 본문) 을 돌려준다."""
    import urllib.error
    import urllib.request
    data = None
    headers = dict(headers)
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers,
                                 method='POST' if data else 'GET')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode('utf-8', 'replace')
            try:
                return r.status, json.loads(raw)
            except ValueError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


def _get_json(url, headers, timeout=20):
    return _req_json(url, headers, timeout)
