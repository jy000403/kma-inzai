/* app.js — 과정 운영 관리 (KMA 교육운영지원 모듈) */
(function (g) {
  'use strict';

  var S = g.Store, U = g.UI;

  var NAV = [
    { id: 'dashboard', label: '대시보드', icon: '▦' },
    { id: 'sessions', label: '차수 · 일정', icon: '▤' },
    { id: 'venues', label: '장소 · 시설', icon: '◎' },
    { id: 'checklists', label: '체크리스트', icon: '☑' },
    { id: 'rooms', label: '객실 · 조편성', icon: '▣' },
    { id: 'car', label: '운영 차량', icon: '⛟' },
    { id: 'facts', label: '운영 지식', icon: '✎' },
    { id: 'questions', label: '미결 질문', icon: '?' },
    { id: 'rules', label: '규칙 · 표기', icon: '⚖' },
    { id: 'log', label: '이력 · 백업', icon: '⟲' }
  ];

  var MARKUP =
    '<div class="app-ops">' +
      '<div class="app-bar">' +
        '<div class="app-bar-title"><b id="ops-prog-name">과정을 선택하세요</b>' +
          '<span class="sub" id="ops-prog-meta"></span></div>' +
      '</div>' +
      '<div class="ops-shell">' +
        '<nav id="ops-nav" class="nav"></nav>' +
        '<div id="ops-main" class="ops-main"></div>' +
      '</div>' +
      '<div class="app-actionbar"><div id="ops-foot" class="sub"></div></div>' +
    '</div>';

  var state = { view: 'dashboard', params: null };
  var mounted = false, loaded = false, pending = null;

  function go(view, params) {
    if (!g.OpsViews[view]) view = 'dashboard';
    state.view = view;
    state.params = params || null;
    render();
  }

  function render() {
    if (!mounted || pending) return;
    pending = setTimeout(function () { pending = null; draw(); }, 0);
  }

  function draw() {
    if (!mounted) return;
    var main = document.getElementById('ops-main');
    if (!main) return;

    var host = document.createElement('div');
    host.className = 'view';
    main.innerHTML = '';
    main.appendChild(host);

    try {
      (g.OpsViews[state.view] || g.OpsViews.dashboard)(host, state.params);
    } catch (e) {
      host.innerHTML = '<div class="view-head"><h1>화면을 표시할 수 없습니다</h1></div>' +
        '<pre class="err-dump">' + U.esc(e && e.stack ? e.stack : String(e)) + '</pre>';
    }
    state.params = null;

    U.$$('#ops-nav .nav-item').forEach(function (el) {
      el.classList.toggle('on', el.dataset.view === state.view);
    });
    updateBadges();
    main.scrollTop = 0;
  }

  function updateBadges() {
    var findings = g.Rules.runAll();
    var bad = findings.filter(function (f) { return f.status === '위반'; }).length;
    var openQ = S.all('questions').filter(function (q) { return q.status !== '해결'; }).length;
    setBadge('rules', bad);
    setBadge('questions', openQ);

    var p = S.all('programs')[0];
    var nameEl = document.getElementById('ops-prog-name');
    var metaEl = document.getElementById('ops-prog-meta');
    if (p && nameEl) nameEl.textContent = p.name;
    if (p && metaEl) metaEl.textContent = p.format + ' · PM ' + p.pm + ' · 기획 ' + p.planner;

    var foot = document.getElementById('ops-foot');
    if (foot) {
      foot.innerHTML = '규칙 위반 <b class="' + (bad ? 'err-txt' : 'ok-txt') + '">' + bad + '</b>건 · ' +
        '미결 질문 <b>' + openQ + '</b>건 · 데이터는 이 브라우저에만 저장됩니다';
    }
  }

  function setBadge(view, n) {
    var el = document.querySelector('#ops-nav .nav-item[data-view="' + view + '"] .nav-badge');
    if (!el) return;
    el.textContent = n || '';
    el.hidden = !n;
  }

  g.Ops = {
    id: 'ops',
    name: '과정 운영 관리',
    short: '과정',
    desc: '차수·장소·체크리스트·객실·차량을 한곳에서 관리하고 운영 규칙을 자동으로 점검합니다.',
    go: go,
    render: render,
    mount: function (host) {
      host.innerHTML = MARKUP;
      mounted = true;
      if (!loaded) { S.load(); S.onChange(render); loaded = true; }

      document.getElementById('ops-nav').innerHTML = NAV.map(function (n) {
        return '<button class="nav-item" data-view="' + n.id + '" type="button">' +
          '<span class="nav-icon">' + n.icon + '</span><span class="nav-label">' + U.esc(n.label) + '</span>' +
          '<span class="nav-badge" hidden></span></button>';
      }).join('');
      document.getElementById('ops-nav').addEventListener('click', function (e) {
        var it = e.target.closest('.nav-item');
        if (it) go(it.dataset.view);
      });

      draw();
    },
    unmount: function () { mounted = false; },
    stat: function () {
      if (!loaded) { S.load(); S.onChange(render); loaded = true; }
      var bad = g.Rules.runAll().filter(function (f) { return f.status === '위반'; }).length;
      var openQ = S.all('questions').filter(function (q) { return q.status !== '해결'; }).length;
      return [
        { label: '차수', value: S.all('sessions').length + '개' },
        { label: '규칙 위반', value: bad + '건', tone: bad ? 'bad' : '' },
        { label: '미결 질문', value: openQ + '건', tone: openQ ? 'warn' : '' }
      ];
    },
    /* 현황판에 올라가는 숫자 */
    metrics: function () {
      if (!loaded) { S.load(); S.onChange(render); loaded = true; }
      var R = g.Rules;
      var bad = R.runAll().filter(function (f) { return f.status === '위반'; }).length;
      var openQ = S.all('questions').filter(function (q) { return q.status !== '해결'; }).length;

      var t = new Date();
      var today = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
      var next = S.all('sessions')
        .filter(function (s) { return s.startDate && s.startDate >= today; })
        .sort(function (a, b) { return a.startDate < b.startDate ? -1 : 1; })[0];

      var out = [];
      out.push(next
        ? { rank: 1, label: '다음 차수', value: R.sessionLabel(next),
            sub: 'D-' + Math.round((new Date(next.startDate) - new Date(today)) / 86400000) + ' · ' + R.withWeekday(next.startDate),
            view: 'sessions' }
        : { rank: 1, label: '다음 차수', value: '없음', sub: '예정된 차수가 없습니다', view: 'sessions' });
      out.push({ rank: 2, label: '규칙 위반', value: bad + '건', sub: bad ? '확인이 필요합니다' : '이상 없습니다',
                 tone: bad ? 'bad' : 'ok', view: 'rules' });
      out.push({ rank: 3, label: '미결 질문', value: openQ + '건', sub: openQ ? '확정 대기 중' : '모두 확정됨',
                 tone: openQ ? 'warn' : 'ok', view: 'questions' });
      return out;
    },
    exportData: function () {
      if (!loaded) { S.load(); S.onChange(render); loaded = true; }
      return S.raw();
    },
    importData: function (d) {
      if (!d) return;
      if (!loaded) { S.load(); S.onChange(render); loaded = true; }
      S.importJson(JSON.stringify({ data: d }));
    }
  };
})(window);
