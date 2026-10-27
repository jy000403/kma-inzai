# -*- coding: utf-8 -*-
"""로컬에 올려 둔 양식을 웹 보관소(Supabase Storage)로 옮긴다 — 한 번만 돌리면 된다.

  python -m server.storage_sync            무엇을 올릴지 보여 주기만
  python -m server.storage_sync --go       실제로 올리기

배포한 웹은 로컬 디스크를 못 본다. 로컬에서 올려 둔 양식(public/templates/)과
견적서 엑셀 양식(forms/)을 웹에서도 쓰려면 보관소에 한 벌 있어야 한다.
원본 pptx 는 정적 파일로 배포하지 않는다(회사 양식이 새어 나가지 않게) — 그래서 보관소다.
"""

import os
import sys

from . import files
from .config import QUOTE_FORM, TPL_DIR


def plan():
    out = []
    if os.path.isdir(TPL_DIR):
        for tid in sorted(os.listdir(TPL_DIR)):
            folder = os.path.join(TPL_DIR, tid)
            if not os.path.isdir(folder) or not files._TID_OK.match(tid):
                continue
            for f in sorted(os.listdir(folder)):
                name = 'source.pptx' if f == '원본.pptx' else f
                if name == 'source.pptx' or name == 'meta.json' or \
                        (name.startswith('slide') and (name.endswith('.png') or name.endswith('.svg'))):
                    out.append(('templates/%s/%s' % (tid, name), os.path.join(folder, f)))
    if os.path.exists(QUOTE_FORM):
        out.append(('forms/quote.xlsx', QUOTE_FORM))
    return out


def main(go=False):
    items = plan()
    total = sum(os.path.getsize(p) for _, p in items)
    print('올릴 파일 %d개 · %.1fMB' % (len(items), total / 1e6))
    for key, p in items:
        if key.endswith('.pptx') or key.endswith('.xlsx') or key.endswith('meta.json'):
            print('  %s' % key)
    if not go:
        print('\n실제로 올리려면:  python -m server.storage_sync --go')
        return
    mime = {'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'json': 'application/json', 'png': 'image/png', 'svg': 'image/svg+xml'}
    for i, (key, p) in enumerate(items, 1):
        with open(p, 'rb') as f:
            files._cloud_put(key, f.read(), mime.get(key.rsplit('.', 1)[-1], 'application/octet-stream'))
        if i % 20 == 0 or i == len(items):
            print('  %d/%d' % (i, len(items)))
    print('끝났습니다.')


if __name__ == '__main__':
    main('--go' in sys.argv)
