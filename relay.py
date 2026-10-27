# -*- coding: utf-8 -*-
"""
KMA 프로젝트 — 로컬 서버

이 PC 안에서 도는 작은 서버다. 두 가지 일을 한다.

  1. public/ 의 index.html 과 js/ css/ 를 브라우저에 준다.
  2. /api/* 를 server/ 로 넘긴다.

배포(Vercel)에서는 이 파일을 쓰지 않는다. 같은 server/ 를 api/index.py 가 부른다.
두 곳의 동작은 똑같다 — PPT·엑셀·메일도 이제 오피스를 부르지 않고 파일을 직접
다루므로(server/pptx.py · xlsx.py · mail.py), 윈도우가 아니어도 되고
실행하기.bat 이 없어도 된다.

  켜기:  python relay.py        (또는 py relay.py)
비밀 값은 .env 에서 읽는다 (server/config.py).
AI 커리큘럼을 쓰려면 한 번만:  py -m pip install -r requirements.txt
"""

import http.server
import os
import sys
import threading
import webbrowser

from server.config import PUBLIC_DIR, TPL_DIR
from server.router import ApiMixin, login_required

PORT = int(os.environ.get('KMA_PORT') or 8765)


class Handler(ApiMixin, http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        # 정적 파일도 늘 새로 받게 한다 — 고친 js 가 바로 보이도록 (API 는 ApiMixin 이 붙인다)
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if not self.api_get():
            super().do_GET()

    def do_POST(self):
        if not self.api_post():
            self.send_error(404)

    def do_PUT(self):
        if not self.api_put():
            self.send_error(404)


def main(open_browser=True):
    os.makedirs(TPL_DIR, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    url = 'http://127.0.0.1:%d/index.html' % PORT
    print('KMA 프로젝트')
    print('  주소   : %s' % url)
    print('  PPT·엑셀·메일 : 파일로 직접 만듭니다 (오피스를 띄우지 않습니다)')
    print('  로그인 : %s' % ('필요' if login_required() else '이 PC 에서는 선택'))
    print('  종료   : 이 창을 닫거나 Ctrl+C')
    print()
    if open_browser and not os.environ.get('KMA_NO_BROWSER'):
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    try:
        main()
    except OSError as e:
        print('서버를 띄우지 못했습니다: %s' % e)
        print('이미 실행 중인 창이 있는지 확인해 주세요.')
        if sys.stdin and sys.stdin.isatty():
            input('엔터를 누르면 닫힙니다.')
        sys.exit(1)
