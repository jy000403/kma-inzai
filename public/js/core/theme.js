/* theme.js — 주간 모드 · 야간 모드
 *
 * <head> 에서 가장 먼저 읽는다. 화면을 그리기 전에 <html class="dark"> 를 붙여야
 * 어두운 화면으로 열 때 흰 화면이 한 번 번쩍이지 않는다.
 * 고른 값은 이 브라우저에만 남긴다(계정과 상관없는 보기 설정이다).
 * 처음에는 야간 모드로 연다. 버튼을 한 번 누르면 그 뒤로는 고른 쪽을 기억한다.
 */
(function (g) {
  'use strict';

  var KEY = 'kma-theme:v1';
  /* '시스템 따라가기' 는 뺐다 — 무엇을 따라간다는 건지 헷갈리고, 켜고 끄는 두 가지면 충분하다.
     예전에 'system' 을 골라 둔 브라우저는 그대로 따라간다(get 이 그 값을 돌려준다). */
  var MODES = ['light', 'dark', 'system'];
  var LABEL = { light: '주간 모드', dark: '야간 모드', system: '야간 모드' };
  var mq = g.matchMedia ? g.matchMedia('(prefers-color-scheme: dark)') : null;

  /* 처음 여는 사람은 야간 모드로 연다 (2026-09-30 사용자 결정). 버튼으로 주간 모드로 바꿀 수 있다. */
  var DEFAULT = 'dark';
  function get() {
    try {
      var v = localStorage.getItem(KEY);
      return MODES.indexOf(v) !== -1 ? v : DEFAULT;
    } catch (e) { return DEFAULT; }
  }
  function isDark(mode) {
    return mode === 'dark' || (mode === 'system' && !!(mq && mq.matches));
  }
  function apply() {
    var mode = get(), dark = isDark(mode);
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1115' : '#ffffff');
    paint();
  }
  function set(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    apply();
  }

  /* 상단바 단추 — 누르면 주간 ↔ 야간. 단추에는 '누르면 바뀔 쪽' 을 적는다
     (주간일 때 '야간 모드', 야간일 때 '주간 모드') — 켜는 스위치처럼 읽힌다. */
  var SUN = '<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
  var MOON = '<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 14.6A8.3 8.3 0 0 1 9.4 3.8a8.3 8.3 0 1 0 10.8 10.8z"/></svg>';

  function paint() {
    var b = document.getElementById('top-theme');
    if (!b) return;
    var dark = isDark(get());
    b.innerHTML = (dark ? SUN : MOON) + '<span>' + (dark ? '주간 모드' : '야간 모드') + '</span>';
    b.title = dark ? '밝은 화면으로 바꿉니다' : '어두운 화면으로 바꿉니다';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', dark ? 'true' : 'false');
  }
  function bind() {
    var b = document.getElementById('top-theme');
    if (!b || b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', function () {
      var next = isDark(get()) ? 'light' : 'dark';
      set(next);
      if (g.UI && g.UI.toast) g.UI.toast(LABEL[next] + '로 바꿨습니다', 'ok');
    });
    paint();
  }

  apply();
  if (mq) {
    var onChange = function () { if (get() === 'system') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  g.Theme = { get: get, set: set, isDark: function () { return isDark(get()); } };
})(window);
