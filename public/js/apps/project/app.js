/* app.js — 프로젝트 (KMA 교육운영지원 모듈) */
(function (g) {
  'use strict';

  var P = g.Projects, V = g.ProjectViews, U = g.UI, esc = U.esc;

  /* 위 탭은 큰 묶음만 맡는다. 단계별 세부는 화면 안의 칩이 맡는다. */
  var TABS = [
    { id: '진행중', label: '진행 중' },
    { id: '전체', label: '전체' },
    { id: '완료', label: '완료' }
  ];

  var MARKUP =
    '<div class="app-project">' +
      '<nav id="pj-tabs" class="steps"></nav>' +
      '<div id="pj-main" class="pr-main"></div>' +
    '</div>';

  var current = 'list';
  var mounted = false, loaded = false, pending = null;

  function render() {
    if (!mounted || pending) return;
    /* 입력 중에 다시 그려도 커서와 스크롤을 잃지 않게 */
    pending = setTimeout(function () { pending = null; U.keepFocus(draw); }, 0);
  }

  /* 목록에서 한 건을 열면 오른쪽에서 들어오고, 목록으로 나오면 왼쪽으로 물러난다 */
  var drawn = null;

  function draw() {
    if (!mounted) return;
    var main = document.getElementById('pj-main');
    if (!main) return;
    var dir = drawn === null ? 0 : U.dirOf(['list', 'detail'], drawn, current);
    drawn = current;
    var host = document.createElement('div');
    host.className = 'view';
    U.slideIn(host, dir);
    main.innerHTML = '';
    main.appendChild(host);
    try {
      if (current === 'detail' && !P.active()) current = 'list';
      (V[current] || V.list)(host);
    } catch (e) {
      host.innerHTML = '<pre class="err-dump">' + esc(e && e.stack ? e.stack : String(e)) + '</pre>';
    }

    /* 한 건을 열어 보는 중에는 목록 거르개가 할 일이 없다 */
    var tabs = document.getElementById('pj-tabs');
    if (tabs) {
      tabs.hidden = (current === 'detail');
      var f = V.filterId ? V.filterId() : '';
      U.$$('#pj-tabs .step').forEach(function (el) {
        el.classList.toggle('on', el.dataset.tab === f);
      });
      U.glideTabs(tabs);
    }
    main.scrollTop = 0;
  }

  function go(view) { current = view; render(); }

  function ensureLoaded() {
    if (loaded) return;
    P.load();
    P.onChange(render);
    /* 진행 막대가 제안서·결과보고서 상태를 읽으므로 둘 다 올려 둔다 */
    if (g.PropStore) { g.PropStore.load(); g.PropStore.onChange(render); }
    if (g.RepStore) { g.RepStore.load(); g.RepStore.onChange(render); }
    loaded = true;
  }

  g.Project = {
    id: 'project',
    name: '프로젝트',
    short: '프로젝트',
    desc: '수주 한 건이 제안서 → 발송 → 수주 → 운영 → 결과보고서까지 어디까지 왔는지 봅니다.',
    go: go,
    render: render,
    mount: function (host) {
      host.innerHTML = MARKUP;
      mounted = true;
      ensureLoaded();

      var tabs = document.getElementById('pj-tabs');
      tabs.innerHTML = TABS.map(function (t) {
        return '<button class="step" data-tab="' + t.id + '" type="button">' + esc(t.label) + '</button>';
      }).join('');
      tabs.addEventListener('click', function (e) {
        var b = e.target.closest('.step');
        if (!b) return;
        if (V.setFilter) V.setFilter(b.dataset.tab);
        current = 'list';
        render();
      });
      draw();
    },
    unmount: function () { mounted = false; },

    stat: function () {
      ensureLoaded();
      var c = P.counts();
      if (!c['전체']) return [{ label: '프로젝트', value: '아직 없음' }];
      var out = [{ label: '진행 중', value: c['진행중'] + '건' }];
      if (c['결과보고']) out.push({ label: '결과보고', value: c['결과보고'] + '건', tone: 'warn' });
      return out;
    },
    metrics: function () {
      ensureLoaded();
      var out = [];
      /* 연락할 날이 된 것이 가장 급하다 */
      var due = P.dueFollowUps();
      if (due.length) {
        out.push({
          rank: 0, label: '오늘 연락할 곳', value: due.length + '건',
          sub: due.slice(0, 2).map(function (p) { return p.company + ' ' + P.dateLabel(p.followUp.date); }).join(' · '),
          tone: 'bad', view: 'list'
        });
      }
      var soon = P.soonFollowUps(7);
      if (soon.length) {
        out.push({
          rank: 2, label: '이번 주 연락', value: soon.length + '건',
          sub: soon.slice(0, 2).map(function (p) { return p.company + ' ' + P.dateLabel(p.followUp.date); }).join(' · '),
          view: 'list'
        });
      }
      var live = P.list().filter(function (p) { return p.stage === '결과보고'; });
      if (live.length) {
        out.push({
          rank: 1, label: '결과보고 대기', value: live.length + '건',
          sub: live.map(function (p) { return P.name(p); }).slice(0, 2).join(' · '),
          tone: 'warn', view: 'list'
        });
      }
      return out;
    },
    exportData: function () { ensureLoaded(); return P.state(); },
    importData: function (d) {
      if (!d) return;
      ensureLoaded();
      var st = P.state();
      if (Array.isArray(d.projects)) st.projects = d.projects;
      st.activeId = d.activeId || null;
      P.save();
      render();
    }
  };
})(window);
