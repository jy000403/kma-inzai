# -*- coding: utf-8 -*-
"""Vercel 서버리스 함수 — /api/* 전부가 여기로 온다 (vercel.json 의 rewrites).

정적 파일(public/)은 Vercel 이 직접 서빙하고, 이 함수는 API 만 답한다.
PPT·엑셀·메일도 여기서 로컬과 똑같이 돈다 — 오피스를 부르지 않고 파일을 직접 다룬다.
큰 파일은 Supabase Storage 를 거친다(server/files.py). 로그인해야 쓸 수 있다.
"""

import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.router import ApiMixin  # noqa: E402


class handler(ApiMixin, BaseHTTPRequestHandler):

    def log_message(self, *args):
        pass

    def do_GET(self):
        if not self.api_get():
            self._json(404, {'error': 'not_found'})

    def do_POST(self):
        if not self.api_post():
            self._json(404, {'error': 'not_found'})

    def do_PUT(self):
        if not self.api_put():
            self._json(404, {'error': 'not_found'})
