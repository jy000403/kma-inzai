# -*- coding: utf-8 -*-
"""메일 초안 — 아웃룩 새 메일 창을 띄우거나, 메일 파일(.eml)을 만든다.

두 길이 있다.
  ① 이 PC(윈도우 + 아웃룩)에서 켠 서버 — 아웃룩 새 메일 창을 바로 띄운다(COM).
     예전과 같은 동작이다. 실행하기.bat 이 없어도 python relay.py 면 된다.
  ② 그 밖(배포한 웹 · 아웃룩이 없는 PC) — 첨부까지 담긴 메일 파일(.eml)을 내려 준다.
     'X-Unsent: 1' 머리가 붙어 있어 열면 아웃룩이 **보내지 않은 새 메일**로 연다.

①을 뺐더니, 누르면 창이 닫히고 파일만 조용히 내려받아져서 '창이 꺼진다' 고 느꼈다.
그래서 되는 곳에서는 ①, 안 되는 곳에서만 ②.

어느 길이든 **저절로 보내지 않는다.** 창만 띄운다 — 사람이 한 번 보고 보낸다.
"""

import base64
import email.policy
import mimetypes
import os
import re
import subprocess
import tempfile
import time
from email.header import Header
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from .common import safe_name

# 20MB 가 넘는다고 아예 안 만들어 주니, 양식이 무거운 제안서(회사 소개 장에 큰 그림이 든 양식이
# 10MB 남짓)는 메일 파일을 만들 길이 없었다. 받는 쪽 한도는 회사마다 다르고, 아웃룩은 큰 첨부를
# OneDrive 링크로 바꿔 보내는 길도 있다. 그래서 20MB 는 '알림' 기준으로만 쓰고 파일은 만든다.
# 35MB 는 넘지 않는다 — 메일 파일은 첨부보다 1.33배 커지고, 배포한 웹의 파일 보관 한도(50MB)에 걸린다.
# 첨부가 30MB 를 넘으면 화면이 서버를 거치지 않고 브라우저에서 바로 묶는다(mail/store.js).
# 여기까지 오는 큰 첨부는 이 PC 아웃룩 창을 띄우는 길뿐이라, 로컬에서는 넉넉히 받는다.
WARN_TOTAL = 20 * 1024 * 1024
MAX_TOTAL = (35 if os.environ.get('VERCEL') else 90) * 1024 * 1024
MAX_FILES = 12


def _addrs(s):
    """'a@x.com; b@y.com' · 줄바꿈 · 쉼표 섞인 것을 정리"""
    parts = re.split(r'[;,\n]+', str(s or ''))
    return ', '.join(p.strip() for p in parts if p.strip())


def build(job, files):
    """files: [(이름, bytes)] → (파일 이름, eml bytes)"""
    msg = EmailMessage(policy=email.policy.SMTP)
    to, cc, bcc = _addrs(job.get('to')), _addrs(job.get('cc')), _addrs(job.get('bcc'))
    if to:
        msg['To'] = to
    if cc:
        msg['Cc'] = cc
    if bcc:
        msg['Bcc'] = bcc
    subject = str(job.get('subject') or '')
    msg['Subject'] = subject
    msg['Date'] = formatdate(localtime=True)
    msg['Message-ID'] = make_msgid(domain='kma.local')
    # 아웃룩이 '보내지 않은 새 메일' 로 열게 하는 머리
    msg['X-Unsent'] = '1'
    msg.set_content(str(job.get('body') or ''), charset='utf-8')

    for name, data in files:
        ctype = mimetypes.guess_type(name)[0] or 'application/octet-stream'
        maintype, subtype = ctype.split('/', 1)
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=name)
        # 한글 파일명 — 표준(RFC 2231)과 아웃룩이 잘 읽는 모양(RFC 2047)을 같이 적는다.
        # 예전 아웃룩은 표준 쪽만 있으면 'ATT00001' 같은 이름으로 보여 준다.
        part = msg.get_payload()[-1]
        # 이름이 길면 Header 가 여러 줄로 접어 주는데, 그 줄바꿈이 머리 안에 들어가면
        # 파이썬이 거부한다('Header values may not contain linefeed…').
        # 조각들을 한 줄에 공백으로 잇는다 — 붙어 있는 인코딩 조각은 읽는 쪽이 한 이름으로 합친다.
        enc = name if name.isascii() else ' '.join(Header(name, 'utf-8').encode().split())
        # part['Content-Type'] = … 로 넣으면 파이썬이 인코딩 조각을 풀어 name*= 로 다시 써 버린다.
        # 읽어 들인 메일의 머리처럼 날것으로 넣어 쓴 그대로 나가게 한다.
        del part['Content-Type']
        part._headers.append(('Content-Type', '%s; name="%s"' % (ctype, enc)))

    stem = safe_name(subject or '메일')[:80] or '메일'
    # 머리를 접지 않고 한 줄로 쓴다. 긴 한글 파일명이 붙은 Content-Type 을 파이썬이 접다가
    # 'application/vnd…presentation' 자체를 =?utf-8?q?…?= 로 뭉개 버렸다 — 아웃룩이
    # 첨부 종류를 못 알아본다. 한 줄은 길어도 998자 안이면 표준에 맞다.
    return stem + '.eml', msg.as_bytes(policy=email.policy.SMTP.clone(max_line_length=None))


def _ps(s):
    return "'" + str(s if s is not None else '').replace("'", "''") + "'"


def outlook_here():
    """아웃룩 창을 직접 띄울 것인가 — 윈도우에서 켠 로컬 서버이고 KMA_OUTLOOK=1 일 때만.
    이 길은 클래식 아웃룩만 된다(새 Outlook 은 COM 으로 부를 수 없다). 새 Outlook 을 쓰는
    PC 에서는 클래식이 '시작할 수 없습니다 … 권한이 없습니다' 로 막혀, 기본은 메일 파일(.eml)로 한다.
    배포한 웹(Vercel)에서는 늘 아니다."""
    from .config import IS_VERCEL, env
    return os.name == 'nt' and not IS_VERCEL and env('KMA_OUTLOOK') == '1'


def open_in_outlook(job, files):
    """아웃룩 새 메일 창을 띄운다(보내지 않는다). 됐으면 True."""
    folder = os.path.join(tempfile.gettempdir(), 'kma-mail',
                          time.strftime('%Y%m%d-%H%M%S') + '-' + str(int(time.time() * 1000) % 100000))
    os.makedirs(folder, exist_ok=True)
    paths = []
    for name, data in files:
        p = os.path.join(folder, name)
        with open(p, 'wb') as f:
            f.write(data)
        paths.append(p)
    lines = ["$ErrorActionPreference = 'Stop'", "try {",
             "  $ol = New-Object -ComObject Outlook.Application",
             "  $m = $ol.CreateItem(0)",
             "  $m.To = " + _ps(_addrs(job.get('to')).replace(', ', '; '))]
    if job.get('cc'):
        lines.append("  $m.CC = " + _ps(_addrs(job.get('cc')).replace(', ', '; ')))
    lines.append("  $m.Subject = " + _ps(job.get('subject') or ''))
    lines.append("  $m.Body = " + _ps(job.get('body') or ''))
    for p in paths:
        lines.append("  $m.Attachments.Add(" + _ps(p) + ") | Out-Null")
    # 창만 띄운다. 브라우저 뒤에 숨지 않게 앞으로 끌어올린다.
    lines += ["  $m.Display($false)",
              "  try { $m.GetInspector.Activate() } catch {}",
              "  Write-Output 'SHOWN'",
              "} catch { Write-Output ('FAIL|' + $_.Exception.Message) }"]
    enc = base64.b64encode('\n'.join(lines).encode('utf-16-le')).decode('ascii')
    try:
        r = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', enc],
                           capture_output=True, timeout=60)
    except Exception:  # noqa: BLE001
        return False
    return b'SHOWN' in r.stdout


def make(job, take):
    """job 은 예전과 같은 모양. take(값) → bytes 는 파일 통로(files.take)."""
    atts = job.get('attachments') or []
    if len(atts) > MAX_FILES:
        return 400, {'error': 'too_many', 'message': '첨부는 %d개까지입니다.' % MAX_FILES}
    files = []
    total = 0
    for a in atts:
        data = take(a.get('file') or a.get('b64'))
        if not data:
            continue
        total += len(data)
        if total > MAX_TOTAL:
            return 400, {'error': 'too_big',
                         'message': '첨부 합계가 %dMB를 넘어 메일 파일로 묶을 수 없습니다. '
                                    '사진 zip 처럼 큰 파일은 빼고 따로 보내 주세요.' % (MAX_TOTAL // (1024 * 1024))}
        files.append((safe_name(a.get('name') or 'file'), data))
    mb = round(total / (1024.0 * 1024.0), 1)
    big = total > WARN_TOTAL
    # ① 이 PC 에 아웃룩이 있으면 새 메일 창을 바로 띄운다
    if outlook_here() and open_in_outlook(job, files):
        return 200, {'ok': True, 'mode': 'draft', 'attached': len(files), 'mb': mb, 'big': big}
    # ② 안 되면 메일 파일로
    name, data = build(job, files)
    return 200, {'ok': True, 'mode': 'eml', 'attached': len(files), 'name': name, 'data': data,
                 'mb': mb, 'big': big, 'at': time.strftime('%Y-%m-%d %H:%M')}
