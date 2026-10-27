/* app.js — 제안서 자동화 (KMA 교육운영지원 모듈) */
(function (g) {
  'use strict';

  var P = g.PropStore, V = g.PropViews, U = g.UI, esc = U.esc;

  /* 탭이 곧 일하는 차례다 — 양식을 고르고, 내용을 채우고, 보낸다.
     전에는 '제안서 · 작성 · 템플릿' 이라 양식이 맨 끝에 있었는데,
     실제로는 양식을 먼저 정해야 무엇을 채울지가 정해진다. */
  var TABS = [
    { id: 'templates', label: '① 템플릿' },
    { id: 'write', label: '② 내용' },
    { id: 'make', label: '③ 보내기' }
  ];
  /* 목록은 탭에서 뺐다 — 위 프로젝트 띠에서 고른다.
     걸음 이전의 자리라 어느 탭에도 불을 켜지 않는다. 전에 ② 내용으로
     이어 두었더니 목록에 서 있는데도 2번으로 들어간 것처럼 보였다. */
  var UNDER = {};

  var MARKUP =
    /* 설명 문구는 각 화면 제목 아래에 이미 있다. 위에 띠를 하나 더 두지 않는다. */
    '<div class="app-proposal">' +
      '<nav id="pr-tabs" class="steps"></nav>' +
      '<div id="pr-main" class="pr-main"></div>' +
    '</div>';

  var current = 'list';
  var mounted = false, loaded = false, pending = null;

  function render() {
    if (!mounted || pending) return;
    /* 입력 중에 다시 그려도 커서와 스크롤을 잃지 않게 */
    pending = setTimeout(function () { pending = null; U.keepFocus(draw); }, 0);
  }

  /* 방금 그린 탭이 무엇이었는지. 탭이 '바뀔 때'만 넘김 효과를 건다 —
     입력할 때마다 다시 그리는 구조라, 매번 걸면 타이핑 중에 화면이 흔들린다. */
  var drawn = null;

  function draw() {
    if (!mounted) return;
    var main = document.getElementById('pr-main');
    if (!main) return;

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
      /* 제안서를 안 골랐어도 탭은 그대로 둔다 — 작성 화면이 길을 알려 준다 */
      (V[current] || V.list)(host);
    } catch (e) {
      host.innerHTML = '<pre class="err-dump">' + esc(e && e.stack ? e.stack : String(e)) + '</pre>';
    }

    U.$$('#pr-tabs .step').forEach(function (el) {
      el.classList.toggle('on', el.dataset.tab === here);
    });
    U.glideTabs(document.getElementById('pr-tabs'));
    main.scrollTop = 0;
  }

  function go(tab) { current = tab; render(); }

  g.Proposal = {
    id: 'proposal',
    name: '제안서',
    short: '제안서',
    desc: '받은 커리큘럼을 회사 PPT 양식에 채워 제안서와 견적서를 만들고 메일로 보냅니다.',
    go: go,
    render: render,
    mount: function (host) {
      host.innerHTML = MARKUP;
      mounted = true;
      if (!loaded) { P.load(); P.onChange(render); loaded = true; }

      /* 들어오면 ① 양식부터다. 일하는 차례가 양식 → 내용 → 보내기이므로
         문도 첫 걸음에서 열린다. 전에는 마지막에 보던 건의 ② 내용이 바로
         열려서, '제안서' 를 눌렀는데 남의 건 한가운데가 펼쳐진 것처럼 보였다.
         고른 건이 아직 없으면 ① 양식에서 무엇을 고를지 알 수 없으니 목록을 준다. */
      current = P.active() ? 'templates' : 'list';

      document.getElementById('pr-tabs').innerHTML = TABS.map(function (t) {
        return '<button class="step" data-tab="' + t.id + '" type="button">' + esc(t.label) + '</button>';
      }).join('');
      document.getElementById('pr-tabs').addEventListener('click', function (e) {
        var b = e.target.closest('.step');
        if (b) go(b.dataset.tab);
      });
      draw();
    },
    unmount: function () { mounted = false; },

    stat: function () {
      if (!loaded) { P.load(); P.onChange(render); loaded = true; }
      var st = P.state();
      if (!st.proposals.length) return [{ label: '제안서', value: '아직 없음' }];
      var writing = st.proposals.filter(function (p) { return p.status === '작성중'; }).length;
      var sent = st.proposals.filter(function (p) { return p.status === '발송' || p.status === '브리핑'; }).length;
      var out = [{ label: '제안서', value: st.proposals.length + '건' }];
      if (writing) out.push({ label: '작성 중', value: writing + '건', tone: 'warn' });
      if (sent) out.push({ label: '회신 대기', value: sent + '건' });
      return out;
    },
    metrics: function () {
      if (!loaded) { P.load(); P.onChange(render); loaded = true; }
      var st = P.state();
      var writing = st.proposals.filter(function (p) { return p.status === '작성중'; });
      if (!writing.length) return [];
      var gaps = writing.reduce(function (a, p) { return a + P.gaps(p).length; }, 0);
      return [{
        rank: 2, label: '작성 중 제안서', value: writing.length + '건',
        sub: gaps ? '빈칸 ' + gaps + '군데' : '개요서 완성됨',
        tone: gaps ? 'warn' : 'ok', view: 'list'
      }];
    },
    exportData: function () {
      if (!loaded) { P.load(); P.onChange(render); loaded = true; }
      return P.state();
    },
    importData: function (d) {
      if (!d) return;
      if (!loaded) { P.load(); P.onChange(render); loaded = true; }
      var st = P.state();
      if (Array.isArray(d.proposals)) st.proposals = d.proposals;
      st.activeId = d.activeId || null;
      P.save();
      render();
    }
  };
})(window);
