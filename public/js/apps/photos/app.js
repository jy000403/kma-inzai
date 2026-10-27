/* app.js — 행사사진 정리 (KMA 교육운영지원 모듈) */
(function (g) {
  'use strict';

  var P = g.PhotoProject, U = g.UI, esc = U.esc;

  var STEPS = [
    { id: 'upload', label: '1. 사진 올리기' },
    { id: 'dedupe', label: '2. 중복 검토' },
    { id: 'export', label: '3. 내보내기' }
  ];

  var MARKUP =
    '<div class="app-photos">' +
      '<div class="app-bar">' +
        '<div class="app-bar-title"><span class="sub">사진을 올리면 방향을 바로잡고 중복을 걸러 냅니다. 결과보고서 사진 장에 그대로 들어갑니다</span></div>' +
        /* '과정 설정' 단추는 뺐다 — 사진만 올리면 되는데 고객사명·파일명 규칙을 묻는 창이 먼저 떠서
           막히는 것처럼 보였다. 고객사·과정명은 결과보고서가 채워 주고(report/views seedPhotos),
           파일명 규칙은 기본값 그대로 쓴다. */
        '<div class="app-bar-actions">' +
          '<button id="ph-load" class="btn" type="button">작업 불러오기</button>' +
          '<button id="ph-save" class="btn" type="button">작업 저장</button>' +
        '</div>' +
      '</div>' +
      '<div id="ph-proj" class="proj-bar"><b id="ph-title"></b><span id="ph-meta"></span></div>' +
      '<nav id="ph-steps" class="steps"></nav>' +
      '<div id="ph-main" class="ph-main"></div>' +
      '<div class="app-actionbar"><div id="ph-foot" class="sub"></div></div>' +
    '</div>';

  var current = 'upload';
  var mounted = false, loaded = false, pending = null;

  function render() {
    if (!mounted || pending) return;
    pending = setTimeout(function () { pending = null; draw(); }, 0);
  }

  function draw() {
    if (!mounted) return;
    var st = P.state();
    var main = document.getElementById('ph-main');
    if (!main) return;

    var host = document.createElement('div');
    host.className = 'view';
    main.innerHTML = '';
    main.appendChild(host);

    try {
      (g.PhotoViews[current] || g.PhotoViews.upload)(host);
    } catch (e) {
      host.innerHTML = '<div class="view-head"><h1>화면을 표시할 수 없습니다</h1></div>' +
        '<pre class="err-dump">' + esc(e && e.stack ? e.stack : String(e)) + '</pre>';
    }

    U.$$('#ph-steps .step').forEach(function (el) {
      el.classList.toggle('on', el.dataset.step === current);
    });

    var keep = st.photos.filter(function (p) { return p.status === 'keep'; }).length;
    document.getElementById('ph-title').textContent =
      (st.clientName || st.eventName)
        ? (st.clientName ? '[' + st.clientName + ']' : '') + (st.eventName || '')
        : '교육사진';
    document.getElementById('ph-meta').textContent =
      (st.sections.length ? '행사위치 ' + st.sections.length + '개 · ' : '') + '사진 ' + st.photos.length + '장 (남김 ' + keep + '장)';
    document.getElementById('ph-foot').textContent =
      '사진은 이 PC 안에서만 처리됩니다 · 다른 앱으로 갔다 와도 유지되지만, 새로고침하면 사진 목록이 비워지므로 "작업 저장"을 눌러 두세요';
  }

  function go(step) {
    current = step;
    if (step === 'dedupe' && !P.groupsNow().length) P.detectDuplicates();
    render();
  }

  /* ── 작업 저장 · 불러오기 (FR-15) ────────────────── */

  function saveState() {
    var st = P.state();
    var blob = new Blob([P.exportState()], { type: 'application/json' });
    var base = (st.clientName ? '[' + st.clientName + ']' : '') + (st.eventName || '사진정리');
    g.Zip.download(blob, base + '_작업상태.json');
    U.toast('작업 상태를 저장했습니다. 같은 원본을 다시 올리면 그대로 복원됩니다.', 'ok');
  }

  function loadState() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = function () {
      var f = input.files[0];
      if (!f) return;
      f.text().then(function (txt) {
        try {
          var r = P.importState(txt);
          g.PhotoViews._clearSel();
          render();
          var missing = P.missingFromState();
          U.toast('불러왔습니다. 행사위치 ' + r.sections + '개 · 사진 상태 ' + r.photos + '건' +
            (missing.length ? ' · 사진 ' + missing.length + '장을 다시 올리면 복원됩니다' : ''), 'ok');
        } catch (e) {
          U.toast('JSON 을 읽을 수 없습니다.', 'err');
        }
      });
    };
    input.click();
  }

  g.Photos = {
    id: 'photos',
    name: '교육사진 정리',
    short: '교육사진',
    desc: '교육 사진의 방향을 바로잡고 중복을 걸러 [고객사]과정명_사진 N 이름으로 zip 을 만듭니다.',
    go: go,
    render: render,
    mount: function (host) {
      host.innerHTML = MARKUP;
      mounted = true;
      if (!loaded) { P.init(); P.onChange(render); loaded = true; }

      document.getElementById('ph-steps').innerHTML = STEPS.map(function (s) {
        return '<button class="step" data-step="' + s.id + '" type="button">' + esc(s.label) + '</button>';
      }).join('');
      document.getElementById('ph-steps').addEventListener('click', function (e) {
        var b = e.target.closest('.step');
        if (b) go(b.dataset.step);
      });
      document.getElementById('ph-save').addEventListener('click', saveState);
      document.getElementById('ph-load').addEventListener('click', loadState);

      draw();

      /* 설정 창 없이 바로 사진 올리기로 간다 — 고객사·과정명은 결과보고서가 채워 준다. */
      if (!g.Zip.supportsFilePicker()) {
        setTimeout(function () {
          U.toast('이 브라우저는 저장 위치 선택을 지원하지 않아 큰 zip 은 한 번에 내려받습니다. Chrome 또는 Edge 사용을 권장합니다.', 'err');
        }, 800);
      }
    },
    unmount: function () { mounted = false; },
    stat: function () {
      if (!loaded) { P.init(); P.onChange(render); loaded = true; }
      var st = P.state();
      var keep = st.photos.filter(function (p) { return p.status === 'keep'; }).length;
      var out = [];
      if (st.eventName) out.push({ label: '진행 중', value: st.eventName });
      out.push({ label: '사진', value: !st.photos.length ? '0장'
        : (keep === st.photos.length ? keep + '장' : keep + '장 (제외 ' + (st.photos.length - keep) + ')') });
      if (st.sections.length) out.push({ label: '행사위치', value: st.sections.length + '개' });
      return out;
    },
    metrics: function () {
      if (!loaded) { P.init(); P.onChange(render); loaded = true; }
      var st = P.state();
      if (!st.photos.length) return [];
      var keep = st.photos.filter(function (p) { return p.status === 'keep'; }).length;
      return [{ rank: 4, label: '정리 중인 사진', value: keep + '장',
                sub: (st.eventName || '과정 미지정') + ' · 원본 ' + st.photos.length + '장' }];
    },
    exportData: function () {
      if (!loaded) { P.init(); P.onChange(render); loaded = true; }
      return JSON.parse(P.exportState()).project;
    },
    importData: function (d) {
      if (!d) return;
      if (!loaded) { P.init(); P.onChange(render); loaded = true; }
      P.importState(JSON.stringify({ project: d }));
      render();
    }
  };
})(window);
