# -*- coding: utf-8 -*-
"""KMA 워크스페이스 서버 로직.

  config    환경변수(.env) · 경로 · 실행 환경(로컬/Vercel)
  common    파일명 다듬기 · JSON 주고받기
  router    /api/* 주소 → 함수 표 (relay.py 와 api/index.py 가 같이 쓴다)
  supa      Supabase 로그인 · 관리자 · 접속 이력
  notion    노션 읽기 전용 (VOC · 지난 제안서)
  ai        Claude API 커리큘럼
  teachers  KMA 강사 플랫폼 읽기
  office    PPT · 엑셀 · 메일 — 오피스 없이 파일로 (어디서나 돈다)
    pptx      .pptx 읽기 · 채우기 · 검수       render   슬라이드 미리보기(SVG)
    xlsx      견적서 엑셀 채우기               mail     메일 초안(.eml)
    ooxml     오피스 파일 속 XML 다루기
  files     큰 파일 통로 · 양식 보관 (로컬 폴더 / Supabase Storage)
  session   로그인 표(세션 토큰) · 비밀번호 해시
"""
