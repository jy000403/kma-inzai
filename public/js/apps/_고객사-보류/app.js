/* app.js — 고객사 관리 (KMA 교육운영지원 모듈) */
(function (g) {
  'use strict';

  var C = g.CustStore, V = g.CustViews, U = g.UI, esc = U.esc;

  var TABS = [
    { id: 'followups', label: '재접촉 대상' },
    { id: 'companies', label: '고객사' },
    { id: 'settings', label: '설정' }
  ];

  var MARKUP =
    '<div class="app-customers">' +
      '<div class="app-bar">' +
        '<div class="app-bar-title"><span class="sub" id="cu-status">노션 연결 확인 중…</span></div>' +
        '<div class="app-bar-actions">' +
          '<button id="cu-sync" class="btn primary" type="button">동기화</button>' +
        '</div>' +
      '</div>' +
      '<nav id="cu-tabs" class="steps"></nav>' +
      '<div id="cu-main" class="cu-main"></div>' +
    '</div>';

  var current = 'followups';
  var mounted = false, loaded = false, pending = null;
  var relayState = null;

  function render() {
    if (!mounted || pending) return;
    pending = setTimeout(function () { pending = null; draw(); }, 0);
  }

  function draw() {
    if (!mounted) return;
    var main = document.getElementById('cu-main');
    if (!main) return;

    var host = document.createElement('div');
    host.className = 'view';
    main.innerHTML = '';
    main.appendChild(host);

    var st = C.state();
    try {
      if (current === 'settings') V.settings(host, relayState);
      else if (!st.rows.length && (!relayState || !relayState.hasToken)) {
        host.innerHTML = '<div class="view-head"><div><h1>고객사 관리</h1>' +
          '<p class="sub">노션의 <b>2팀 VOC - AI 리더십 영업 트래킹</b> 을 읽어, 작년 이맘때 문의했지만 올해는 아직 연락이 없는 곳을 찾아 줍니다.</p></div></div>' +
          V.setupGuide(relayState && relayState.relay ? 'no_token' : 'no_relay', relayState && relayState.tokenFile);
      }
      else if (current === 'companies') V.companies(host);
      else V.followups(host);
    } catch (e) {
      host.innerHTML = '<pre class="err-dump">' + esc(e && e.stack ? e.stack : String(e)) + '</pre>';
    }

    U.$$('#cu-tabs .step').forEach(function (el) {
      el.classList.toggle('on', el.dataset.tab === current);
    });
    updateBar();
    main.scrollTop = 0;
  }

  function updateBar() {
    var el = document.getElementById('cu-status');
    if (!el) return;
    var st = C.state();
    if (!relayState) { el.textContent = '노션 연결 확인 중…'; return; }
    if (!relayState.relay) {
      el.innerHTML = '<span class="err-txt">중계 서버 없음</span> · 폴더의 <code>실행하기.bat</code> 으로 열면 노션과 연결됩니다';
      return;
    }
    if (!relayState.hasToken) {
      el.innerHTML = '<span class="err-txt">노션 토큰 없음</span> · 설정 탭의 안내를 따라 한 번만 설정하면 됩니다';
      return;
    }
    el.innerHTML = '<span class="ok-txt">노션 연결됨</span> · 문의 <b>' + st.rows.length + '건</b>' +
      (st.syncedAt ? ' · 마지막 동기화 ' + esc(U.dateTime(new Date(st.syncedAt).getTime())) : ' · 아직 동기화 전');
  }

  function go(tab) { current = tab; render(); }

  function checkRelay() {
    return C.status().then(function (s) { relayState = s; updateBar(); render(); return s; });
  }

  function doSync() {
    U.busy(true, '노션에서 불러오는 중…');
    C.sync(function (n) { U.busy(true, '노션에서 불러오는 중… ' + n + '건'); })
      .then(function (n) {
        U.busy(false);
        relayState = Object.assign({}, relayState, { relay: true, hasToken: true });
        render();
        U.toast('문의 ' + n + '건을 불러왔습니다', 'ok');
      })
      .catch(function (err) {
        U.busy(false);
        if (err.code === 'no_relay') {
          relayState = { relay: false };
          current = 'settings';
          render();
          U.toast('폴더의 실행하기.bat 으로 열어 주세요', 'err');
        } else if (err.code === 'no_token') {
          relayState = { relay: true, hasToken: false, tokenFile: err.tokenFile };
          current = 'settings';
          render();
          U.toast('노션 토큰을 먼저 설정해 주세요', 'err');
        } else if (err.code === 'object_not_found' || err.code === 'unauthorized') {
          U.toast('노션에서 이 DB를 볼 수 없습니다. DB의 연결(Connections)에 integration 을 추가했는지 확인해 주세요', 'err');
        } else {
          U.toast(err.message || '동기화에 실패했습니다', 'err');
        }
      });
  }

  g.Customers = {
    id: 'customers',
    name: '고객사 관리',
    short: '고객사',
    desc: '작년 이맘때 문의했지만 올해는 아직 연락이 없는 고객사를 찾아 줍니다.',
    go: go,
    render: render,
    mount: function (host) {
      host.innerHTML = MARKUP;
      mounted = true;
      if (!loaded) { C.load(); C.onChange(render); loaded = true; }

      document.getElementById('cu-tabs').innerHTML = TABS.map(function (t) {
        return '<button class="step" data-tab="' + t.id + '" type="button">' + esc(t.label) + '</button>';
      }).join('');
      document.getElementById('cu-tabs').addEventListener('click', function (e) {
        var b = e.target.closest('.step');
        if (b) go(b.dataset.tab);
      });
      document.getElementById('cu-sync').addEventListener('click', doSync);

      draw();
      checkRelay();
    },
    unmount: function () { mounted = false; },

    stat: function () {
      if (!loaded) { C.load(); C.onChange(render); loaded = true; }
      var st = C.state();
      if (!st.rows.length) return [{ label: '노션', value: '연결 전' }];
      var fu = C.followUps();
      var soon = fu.filter(function (r) { return r.bucket === 'now' || r.bucket === 'soon'; }).length;
      return [
        { label: '문의', value: st.rows.length + '건' },
        { label: '재접촉', value: soon + '곳', tone: soon ? 'bad' : '' }
      ];
    },
    metrics: function () {
      if (!loaded) { C.load(); C.onChange(render); loaded = true; }
      var st = C.state();
      if (!st.rows.length) return [];
      var fu = C.followUps();
      var now = fu.filter(function (r) { return r.bucket === 'now'; }).length;
      var soon = fu.filter(function (r) { return r.bucket === 'soon'; }).length;
      return [{
        rank: 0, label: '재접촉 대상', value: now + '곳',
        sub: soon ? '곧 연락할 곳 ' + soon + '곳 더' : (now ? '작년 이맘때 문의한 곳' : '지금은 없습니다'),
        tone: now ? 'bad' : 'ok', view: 'followups'
      }];
    },
    exportData: function () {
      if (!loaded) { C.load(); C.onChange(render); loaded = true; }
      var st = C.state();
      /* 문의 원본은 노션이 원본이므로 백업에는 설정과 내 기록만 담는다 */
      return { settings: st.settings, notes: st.notes, syncedAt: st.syncedAt };
    },
    importData: function (d) {
      if (!d) return;
      if (!loaded) { C.load(); C.onChange(render); loaded = true; }
      var st = C.state();
      if (d.settings) Object.assign(st.settings, d.settings);
      if (d.notes) st.notes = d.notes;
      C.save();
      render();
    }
  };
})(window);
