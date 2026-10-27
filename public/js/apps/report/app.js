/* app.js — 결과보고서 (KMA 교육운영지원 모듈) */
(function (g) {
  'use strict';

  var R = g.RepStore, V = g.RepViews, PJ = g.Projects, U = g.UI, esc = U.esc;

  /* 탭이 곧 일하는 차례다 — 양식을 고르고, 내용을 채우고, 보낸다.
     만족도·정산·사진·영수증은 '내용' 안에서 드나드는 화면이라 탭에서 뺐다.
     일곱 개가 나란히 있으면 어디부터 손대야 하는지가 안 보였다. */
  var TABS = [
    { id: 'templates', label: '① 템플릿' },
    { id: 'write', label: '② 내용' },
    { id: 'make', label: '③ 보내기' }
  ];
  /* 아래 화면들은 ② 내용 안에서 드나드는 곳이라 그 탭에 불이 켜진 채로 둔다.
     목록은 여기 넣지 않는다 — 걸음 이전의 자리라 어느 탭도 켜지 않는 것이 맞다.
     전에 넣어 두었더니 '어느 건을 쓸까요' 화면에서 ② 내용에 불이 들어와,
     들어갈 때마다 2번으로 들어가는 것처럼 보였다. */
  var UNDER = { survey: 'write', settle: 'write', photos: 'write', receipts: 'write' };

  var MARKUP =
    /* 설명 문구는 각 화면 제목 아래에 이미 있다. 위에 띠를 하나 더 두지 않는다. */
    '<div class="app-report">' +
      '<nav id="rp-tabs" class="steps"></nav>' +
      '<div id="rp-main" class="pr-main"></div>' +
    '</div>';

  var current = 'list';
  var mounted = false, loaded = false, pending = null;

  function render() {
    if (!mounted || pending) return;
    /* 입력 중에 다시 그려도 커서와 스크롤을 잃지 않게 */
    pending = setTimeout(function () { pending = null; U.keepFocus(draw); }, 0);
  }

  /* 탭이 '바뀔 때'만 넘김 효과. 같은 탭을 다시 그릴 때는 걸지 않는다. */
  var drawn = null;

  function draw() {
    if (!mounted) return;
    var main = document.getElementById('rp-main');
    if (!main) return;

    V.unmountSub();

    var order = TABS.map(function (t) { return t.id; });
    var here = UNDER[current] || current;
    var dir = drawn === null ? 0 : U.dirOf(order, UNDER[drawn] || drawn, here);
    drawn = current;

    var host = document.createElement('div');
    host.className = 'view';
    U.slideIn(host, dir);
    main.innerHTML = '';
    main.appendChild(host);

    try {
      /* 결과보고서를 안 골랐어도 탭은 그대로 둔다.
         각 화면이 '먼저 열어야 합니다' 안내를 대신 보여 준다. */
      (V[current] || V.list)(host);
    } catch (e) {
      host.innerHTML = '<pre class="err-dump">' + esc(e && e.stack ? e.stack : String(e)) + '</pre>';
    }

    U.$$('#rp-tabs .step').forEach(function (el) {
      el.classList.toggle('on', el.dataset.tab === here);
    });
    U.glideTabs(document.getElementById('rp-tabs'));
    main.scrollTop = 0;
  }

  function go(tab) {
    /* 사진·영수증 도구가 띄운 시트가 탭을 옮겨도 화면에 남는 일을 막는다 */
    if (tab !== current) U.$$('.sheet-wrap').forEach(function (el) { el.remove(); });
    current = tab;
    render();
  }

  function ensureLoaded() {
    if (loaded) return;
    /* 정산은 제안서 예산을, 개요는 프로젝트 정보를 읽는다. 둘 다 있어야 계산이 선다. */
    R.load();
    if (PJ) PJ.load();
    if (g.PropStore) g.PropStore.load();
    R.onChange(render);
    loaded = true;
  }

  g.Report = {
    id: 'report',
    name: '결과보고서',
    short: '결과보고서',
    desc: '만족도·사진·영수증·정산을 모아 결과보고서 PPT 를 만들고 메일로 보냅니다.',
    go: go,
    render: render,
    mount: function (host) {
      host.innerHTML = MARKUP;
      mounted = true;
      ensureLoaded();

      /* 들어오면 ① 양식부터. 고른 건이 없으면 목록에서 고르고 들어간다. */
      current = R.active() ? 'templates' : 'list';

      document.getElementById('rp-tabs').innerHTML = TABS.map(function (t) {
        return '<button class="step" data-tab="' + t.id + '" type="button">' + esc(t.label) + '</button>';
      }).join('');
      document.getElementById('rp-tabs').addEventListener('click', function (e) {
        var b = e.target.closest('.step');
        if (b) go(b.dataset.tab);
      });
      draw();
    },
    unmount: function () { V.unmountSub(); mounted = false; },

    stat: function () {
      ensureLoaded();
      var reps = R.state().reports;
      if (!reps.length) return [{ label: '결과보고서', value: '아직 없음' }];
      var done = reps.filter(function (r) { return !R.gaps(r, r.projectId ? PJ.get(r.projectId) : null).length; }).length;
      var out = [{ label: '결과보고서', value: reps.length + '건' }];
      if (reps.length - done) out.push({ label: '작성 중', value: (reps.length - done) + '건', tone: 'warn' });
      return out;
    },
    metrics: function () {
      ensureLoaded();
      var open = R.state().reports.filter(function (r) {
        return R.gaps(r, r.projectId ? PJ.get(r.projectId) : null).length;
      });
      if (!open.length) return [];
      var noSurvey = open.filter(function (r) { return !r.survey.parsed; }).length;
      return [{
        rank: 3, label: '작성 중 결과보고서', value: open.length + '건',
        sub: noSurvey ? '만족도 미입력 ' + noSurvey + '건' : '빈칸을 채우면 끝납니다',
        tone: 'warn', view: 'list'
      }];
    },
    exportData: function () { ensureLoaded(); return R.state(); },
    importData: function (d) {
      if (!d) return;
      ensureLoaded();
      var st = R.state();
      if (Array.isArray(d.reports)) st.reports = d.reports;
      if (Array.isArray(d.templates)) st.templates = d.templates;
      st.activeId = d.activeId || null;
      R.save();
      render();
    }
  };
})(window);
