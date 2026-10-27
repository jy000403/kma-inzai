/* views.js — 결과보고서 화면
 * 보고서 · 작성 · 만족도 · 정산 · 교육사진 · 영수증
 */
(function (g) {
  'use strict';

  var R = g.RepStore, PJ = g.Projects, U = g.UI, esc = U.esc;

  function n(v) { return Number(v || 0).toLocaleString('ko-KR'); }
  function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }
  function projectOf(r) { return r && r.projectId ? PJ.get(r.projectId) : null; }

  /* 결과보고서를 아직 안 골랐을 때.
     전에는 아무 말 없이 목록으로 되돌아가서 '탭이 안 눌린다'고 보였다.
     이제 그 탭 안에서 왜 못 쓰는지 말하고 바로 만들 수 있게 한다. */
  /* ── 템플릿 ───────────────────────────────────────────
     회사가 쓰던 결과보고서 파일을 올려 두면 그 파일에 글자만 갈아 끼워 만든다.
     제안서 쪽과 같은 방식이고, PowerPoint 가 있는 PC 에서만 된다(relay). */
  function templates(host) {
    var r = R.active();
    host.innerHTML =
      (r ? repBar(r) : '') +
      '<header class="pj-head">' +
        '<span class="tr-icon report ph-ic">' + U.icon('report', 22) + '</span>' +
        '<div class="ph-text"><h2>템플릿</h2>' +
        '<p class="pj-sub">쓰시던 결과보고서 PPT 를 올리면 그 디자인 그대로 만들어 드립니다. ' +
          '표지만 보고 고르기 어려우면 <b>디자인 보기</b>로 안쪽 장까지 넘겨 보세요. ' +
          '고르면 <b>② 내용</b>으로 넘어갑니다.</p></div>' +
        '<div class="head-actions">' +
          '<input type="file" id="rt-file" hidden accept=".pptx" multiple>' +
          '<button class="btn primary" id="rt-import" type="button">+ 템플릿 올리기</button>' +
        '</div></header>' +

      '<div class="tpl-grid">' + R.templates().map(function (t) {
        var cover = (t.slides || [])[0];
        var slides = t.slides || [];
        var on = r && t.id === r.templateId && r.templatePicked;
        /* 제안서 템플릿처럼 안쪽 장을 띠로 살짝 보여 주고, '디자인 보기' 로 전부 넘겨 보게 한다 */
        var shots = slides.filter(function (s) { return s.thumb; });
        var strip = g.PropViews && g.PropViews.spread ? g.PropViews.spread(shots.slice(1), 4) : shots.slice(1, 5);
        return '<div class="tpl-tile' + (on ? ' on' : '') + (openTpl === t.id ? ' open' : '') + '">' +
          '<button class="tt-pick" data-pick-rt="' + esc(t.id) + '" type="button">' +
            '<span class="tt-thumb' + (cover && cover.thumb ? '' : ' tt-outline') + '">' +
              (cover && cover.thumb
                ? '<img src="' + esc(cover.thumb) + '" alt="양식 그림 없음" loading="lazy">'
                : '<span class="tt-toc">' + slides.slice(0, 7).map(function (s, i) {
                    return '<span><em>' + (i + 1) + '</em>' + esc(s.title || '') + '</span>';
                  }).join('') + '</span>') +
              (on ? '<span class="tt-on">' + U.icon('check', 14) + '</span>' : '') +
            '</span>' +
            '<span class="tt-body"><b>' + esc(t.name) + '</b>' +
              '<span>' + slides.length + '장' + (t.kind === 'pptx' ? '' : ' · 회사 디자인 없이 기본 모양으로') + '</span></span>' +
          '</button>' +
          (strip.length
            ? '<div class="tt-strip">' + strip.map(function (s) {
                return '<img src="' + esc(s.thumb) + '" alt="양식 그림 없음" loading="lazy">';
              }).join('') +
              (slides.length > 5 ? '<span class="tt-more">+' + (slides.length - 5) + '</span>' : '') +
            '</div>'
            : '') +
          (t.kind === 'pptx'
            ? '<div class="tt-foot">' +
                (shots.length
                  ? '<button class="btn tiny tt-see" data-see-rt="' + esc(t.id) + '" type="button">디자인 보기</button>'
                  : '') +
                '<button class="btn tiny" data-open-rt="' + esc(t.id) + '" type="button">' +
                  '장마다 채울 내용 정하기</button>' +
                /* 지우는 길은 템플릿 자리에 있어야 한다 — 제안서 쪽과 같게 맞춘다 */
                '<button class="icon-btn tiny tt-del" data-del-rt="' + esc(t.id) + '" ' +
                  'title="이 템플릿 지우기" aria-label="' + esc(t.name) + ' 지우기" type="button">' +
                  U.icon('trash', 16) + '</button>' +
              '</div>'
            : '') +
          (t.kind === 'pptx' ? U.badge('PPT 양식', 'type') : U.badge('기본', 'off')) +
        '</div>';
      }).join('') + '</div>' +

      (openTpl ? rtDetail(R.template(openTpl)) : '');

    /* 양식을 고른 것 자체가 '이걸 쓰겠다' 는 뜻이다. 없으면 여기서 만든다.
       전에는 '먼저 결과보고서를 고르세요' 만 띄우고 아무 일도 안 일어나서,
       무엇을 어디서 고르라는 말인지 알 수 없었다.
       프로젝트는 나중에 이어도 된다 — 없이도 쓸 수 있다. */
    function pickRt(id) {
      var act = R.active() || R.create(null);
      R.update(act.id, { templateId: id, templatePicked: true });
      g.Report.go('write');
      U.toast(R.template(id).name + ' 양식으로 만듭니다', 'ok');
    }

    var fi = host.querySelector('#rt-file');
    host.querySelector('#rt-import').addEventListener('click', function () { fi.click(); });
    fi.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fi.files);
      fi.value = '';
      if (files.length) importReportTemplates(files);
    });

    host.addEventListener('click', function (e) {
      /* 맨 위 프로젝트 띠 — 이 화면에만 처리가 빠져 있었다 */
      if (hitRepBar(e, r, null)) return;
      var pk = e.target.closest('[data-pick-rt]');
      if (pk) { pickRt(pk.dataset.pickRt); return; }
      /* 디자인 보기 — 제안서 템플릿과 같은 창. 거기서 '이 양식으로 쓰기' 를 누르면 고른 것과 같다 */
      var see = e.target.closest('[data-see-rt]');
      if (see) {
        var st = R.template(see.dataset.seeRt);
        if (st && g.PropViews && g.PropViews.seeTemplate) g.PropViews.seeTemplate(st, pickRt);
        return;
      }
      var o = e.target.closest('[data-open-rt]');
      if (o) { openTpl = (openTpl === o.dataset.openRt) ? null : o.dataset.openRt; g.Report.render(); return; }
      var pin = e.target.closest('[data-pin-rt]');
      if (pin) {
        var pt = R.templates().filter(function (x) { return x.id === pin.dataset.pinRt; })[0];
        if (pt && R.setPinned(pt.id, !pt.pinned)) {
          g.Report.render();
          U.toast(pt.pinned ? '모든 PC 에서 이 양식을 씁니다' : '기본 양식에서 뺐습니다', 'ok');
        }
        return;
      }
      var d = e.target.closest('[data-del-rt]');
      if (d) {
        var dt = R.template(d.dataset.delRt);
        U.confirm((dt ? dt.name : '이 템플릿') + ' 을(를) 지웁니다. 올린 PPT 파일과 그림도 함께 지워집니다.',
          { ok: '지우기', danger: true }).then(function (yes) {
          if (!yes) return;
          /* 목록에서만 빼면 파일은 폴더에 남아 94MB 가 계속 쌓인다 */
          if (dt && dt.fileId) {
            fetch('/api/ppt/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ templateId: dt.fileId }) }).catch(function () {});
          }
          R.removeTemplate(d.dataset.delRt); openTpl = null; g.Report.render();
          U.toast('템플릿을 지웠습니다', 'ok');
        });
      }
    });
    host.addEventListener('change', function (e) {
      var ts = e.target.closest('[data-rts]');
      if (!ts) return;
      var sp = ts.dataset.rts.split(':');
      var t = R.template(sp[0]);
      /* 직접 고른 장은 표시해 둔다 — 자동 바로잡기(upgradeSlides)가 건드리지 않게 */
      if (t) { var sl = t.slides[Number(sp[1])]; sl.src = ts.value; sl.userSet = true; R.save(); g.Report.render(); }
    });
  }

  var openTpl = null;

  function rtDetail(t) {
    if (!t || t.kind !== 'pptx') {
      return '<section class="pr-card"><h3>' + esc((t && t.name) || '') + '</h3>' +
        '<p class="pr-hint">PPT 파일 없이 제목만 정해 둔 기본 구성입니다.</p></section>';
    }
    return '<section class="pr-card tpl-detail">' +
      '<h3>' + esc(t.name) +
        (t.fileId ? ' <button class="btn tiny' + (t.pinned ? ' primary' : '') + '" data-pin-rt="' + esc(t.id) + '" type="button">' +
          (t.pinned ? '✓ 모든 PC 기본 양식 (해제)' : '모든 PC 기본 양식으로') + '</button>' : '') +
        (t.pinned ? '' : '<button class="btn tiny ghost-danger" data-del-rt="' + esc(t.id) + '" type="button">삭제</button>') + '</h3>' +
      (t.pinned ? '<p class="pr-hint">어느 PC·브라우저에서 로그인해도 이 양식이 목록에 들어갑니다. 여기서 바꾼 설정도 모두에게 반영됩니다.</p>' : '') +
      /* '예전 이름' 칸은 뺐다 — 파일을 만들기 전에 AI 검수가 찾아 바꾼다(제안서 쪽과 같게) */
      '<p class="pr-hint">장마다 <b>무엇을 채울지</b> 고르세요. 못 알아본 장은 <b>이 장 빼기</b>가 기본입니다 — ' +
        '그대로 두면 예전 고객사 내용이 그대로 나갑니다.</p>' +
      '<div class="tpl-slidegrid">' + (t.slides || []).map(function (s, i) {
        return '<div class="tsl' + (s.src === 'skip' ? ' off' : '') +
          (s.src && s.src !== 'keep' && s.src !== 'skip' ? ' fill' : '') + '">' +
          '<div class="tsl-thumb"><img src="' + esc(s.thumb || '') + '" alt="그림 없음" loading="lazy">' +
            '<span class="tsl-no">' + s.no + '</span></div>' +
          '<div class="sel-wrap small"><select data-rts="' + esc(t.id) + ':' + i + '">' +
            rtSrcOptions(s.src) + '</select></div>' +
        '</div>';
      }).join('') + '</div></section>';
  }

  function rtSrcOptions(cur) {
    var opts = [{ id: 'keep', label: '그대로 두기' }, { id: 'skip', label: '이 장 빼기' }]
      .concat(R.SOURCES || []);
    return opts.map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (o.id === cur ? ' selected' : '') + '>' +
        esc(o.label) + '</option>';
    }).join('');
  }

  function importReportTemplates(files) {
    var done = 0, failed = [];
    function step(i) {
      if (i >= files.length) {
        U.busy(false);
        g.Report.render();
        if (done) U.toast(done + '개 양식을 올렸습니다. 장마다 채울 내용을 골라 주세요', 'ok');
        if (failed.length) U.toast(failed[0], 'err');
        return;
      }
      var f = files[i];
      U.busy(true, U.withEta('양식을 읽는 중… (' + (i + 1) + '/' + files.length + ')', 15));
      g.Files.pack(f, f.name).then(function (v) {
        return fetch('/api/ppt/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: f.name.replace(/\.pptx$/i, ''), file: v, kind: 'report' })
        });
      }).then(function (res) {
        return res.json().then(function (d) {
          if (!res.ok || d.error) throw new Error(d.message || '양식을 읽지 못했습니다');
          R.templateFromPptx(d);
          done++;
        });
      }).catch(function (err) {
        failed.push(f.name + ' — ' + (err.message || '읽지 못했습니다'));
      }).then(function () { step(i + 1); });
    }
    step(0);
  }

  /* 문장은 탭마다 다르게 받는다.
     '쓰다' 하나로 돌려 막으니 '교육사진을 쓰려면' 같은 어색한 말이 나왔다. */
  function needReport(head) {
    var reps = R.state().reports;
    return '<div class="need-report">' +
      '<b>' + esc(head) + '</b>' +
      '<p>' + (reps.length
        ? '아래에서 작업할 결과보고서를 고르세요. ' + reps.length + '건 있습니다.'
        /* 제안서도 프로젝트도 전제가 아니다 — 다른 데서 수주한 건도 결과보고서는 쓴다.
           있으면 얹어 준다는 뜻으로만 적는다. */
        : '아직 만든 결과보고서가 없습니다. 바로 만들어 쓰시면 되고, 프로젝트에 붙이면 제안서의 커리큘럼·예산을 이어받습니다.') + '</p>' +
      '<div class="btn-row">' +
        (reps.length ? '<button class="btn" data-to-list type="button">결과보고서 고르기</button>' : '') +
        '<button class="btn primary" data-new type="button">+ 새 결과보고서</button>' +
      '</div></div>';
  }

  function bindNeed(host) {
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-to-list]')) { g.Report.go('list'); return; }
      if (e.target.closest('[data-new]')) pickProject();
    });
  }

  /* ── 목록 ─────────────────────────────────────────── */

  function list(host) {
    var reps = R.state().reports;

    host.innerHTML =
      '<header class="pj-head">' +
        '<span class="tr-icon report ph-ic">' + U.icon('report', 22) + '</span>' +
        '<div class="ph-text"><h2>어느 건을 쓸까요</h2>' +
        '<p class="pj-sub">양식 → 내용 → 보내기 차례로 이어집니다. 프로젝트 없이도 쓸 수 있습니다.</p></div>' +
        '<div class="head-actions"><button class="btn primary" data-new type="button">+ 새 결과보고서</button></div>' +
      '</header>' +

      (reps.length
        ? '<div class="pj-list">' + reps.map(row).join('') + '</div>'
        : '<div class="panel flat">' + U.empty('아직 결과보고서가 없습니다',
            '제안서나 프로젝트 없이도 바로 쓸 수 있습니다. 프로젝트에 붙이면 제안서의 커리큘럼·예산을 이어받습니다') + '</div>');

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-new]')) { pickProject(); return; }
      var open = e.target.closest('[data-open]');
      if (open) {
        R.setActive(open.dataset.open);
        var picked = R.get(open.dataset.open);
        g.Report.go(picked && picked.templatePicked ? 'write' : 'templates');
      }
    });
  }

  function row(r) {
    var p = projectOf(r);
    var sv = r.survey.parsed;
    var o = sv ? g.Survey.overall(sv) : null;
    var gapN = R.gaps(r, p).length;
    return '<button class="pj-card" data-open="' + esc(r.id) + '" type="button">' +
      '<span class="pj-top"><b>' + esc(p ? PJ.name(p) : '프로젝트 미연결') + '</b>' +
        (gapN ? U.badge('빈칸 ' + gapN, 'warn') : U.badge('작성됨', 'ok')) + '</span>' +
      '<span class="pj-meta">' + esc([r.overview.period, r.overview.place,
          r.overview.attended ? '참석 ' + r.overview.attended + '명' : ''].filter(Boolean).join(' · ') || '개요 미입력') + '</span>' +
      '<span class="pj-steps">' +
        '<em class="' + (sv ? 'on' : '') + '">만족도' + (o ? ' ' + o.to5 : '') + '</em>' +
        '<em class="' + (r.photos.count ? 'on' : '') + '">사진' + (r.photos.count ? ' ' + r.photos.count + '장' : '') + '</em>' +
        '<em class="' + (r.receipts.count ? 'on' : '') + '">영수증' + (r.receipts.count ? ' ' + r.receipts.count + '건' : '') + '</em>' +
      '</span></button>';
  }

  function pickProject() {
    var ps = PJ.list();
    /* 프로젝트가 하나도 없으면 프로젝트 화면으로 쫓아냈다. 하지만 제안서 없이
       다른 데서 수주한 건도 결과보고서는 써야 한다. 프로젝트 없이 바로 시작하고,
       나중에 프로젝트에 이어 붙일 수 있게 둔다. */
    if (!ps.length) {
      R.create(null);
      g.Report.go('templates');
      U.toast('결과보고서를 만들었습니다. 양식부터 고르세요', 'ok');
      return;
    }
    U.form({ title: '어느 프로젝트의 결과보고서인가요', fields: [
      { key: 'projectId', label: '프로젝트', type: 'select', required: true, span: 2,
        /* 프로젝트에 안 묶고도 쓸 수 있다 — 정산·개요를 손으로 넣으면 된다 */
        options: [{ value: '', label: '프로젝트 없이 쓰기' }].concat(
          ps.map(function (p) { return { value: p.id, label: PJ.name(p) }; })) }
    ], values: { projectId: PJ.activeId() || ps[0].id } }).then(function (d) {
      if (!d) return;
      if (!d.projectId) { R.create(null); g.Report.go('templates'); return; }
      var exist = R.byProject(d.projectId);
      if (exist) { R.setActive(exist.id); U.toast('이미 있는 보고서를 엽니다'); }
      else R.create(d.projectId);
      /* 양식을 안 골랐으면 ① 템플릿부터.
         여기서만 ② 내용으로 건너뛰고 있었다 — 프로젝트 화면에서 들어오면
         ① 템플릿으로 가는데 혼자 다른 데로 떨어지니, 방금 만든 보고서가
         '템플릿 미정' 인 채로 내용부터 쓰게 됐다. */
      var now = R.active();
      g.Report.go(now && now.templatePicked ? 'write' : 'templates');
    });
  }

  /* ── 작성 ─────────────────────────────────────────── */

  /* '2026-09-26 ~ 09-27' 처럼 오늘 날짜로 보기글을 만든다 */
  function periodHint() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    var one = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    var t = new Date(d.getTime() + 864e5);
    return one + ' ~ ' + p(t.getMonth() + 1) + '-' + p(t.getDate());
  }

  function field(label, key, val, hint, type) {
    return '<div class="pr-field"><label>' + esc(label) + '</label>' +
      (type === 'textarea'
        ? '<textarea data-f="' + key + '" rows="3" placeholder="' + esc(hint || '') + '">' + esc(val || '') + '</textarea>'
        : '<input data-f="' + key + '" type="' + (type || 'text') + '"' + (type === 'number' ? ' inputmode="numeric"' : '') +
          ' value="' + esc(val === null || val === undefined ? '' : val) + '" placeholder="' + esc(hint || '') + '">') +
      '</div>';
  }

  /* ── 지금 어느 건을 만지고 있는지 ──────────────────
     탭만 '결과보고서' 라고 떠 있으면 어느 고객사의 어떤 건인지 알 수 없다.
     화면마다 위에 프로젝트를 세워 두고, 거기서 다른 건으로 옮겨 간다. */
  /* 프로젝트 띠의 단추들. 띠는 템플릿·내용·보내기 화면에 다 뜨는데
     처리는 한 화면에만 달려 있어서, 템플릿 화면에서 '다른 건' 을 눌러도
     아무 일도 안 일어났다. 한 곳에 모아 두고 같이 쓴다. */
  function hitRepBar(e, r, p) {
    if (e.target.closest('[data-switch]')) { g.Report.go('list'); return true; }
    if (e.target.closest('[data-to-project]')) {
      var pj = p || (r ? projectOf(r) : null);
      if (pj) { PJ.setActive(pj.id); g.Shell.go('project'); }
      else U.toast('아직 이어 둔 프로젝트가 없습니다', '');
      return true;
    }
    return false;
  }

  function repBar(r) {
    var p = projectOf(r);
    /* 프로젝트 없이 쓰는 건 모자란 상태가 아니다 — 그냥 이 결과보고서 하나만
       쓰는 경우다. '연결되지 않은' 이라고 적으면 고장난 것처럼 읽힌다.
       대신 나중에 붙일 수 있는 길만 옆에 둔다. */
    var name = p ? PJ.name(p) : (r.overview.course || '새 결과보고서');
    var prop = p && p.proposalId && g.PropStore ? g.PropStore.get(p.proposalId) : null;
    var t = R.template(r.templateId);
    return '<div class="projbar">' +
      '<span class="pb-icon">' + U.icon('project', 17) + '</span>' +
      '<div class="pb-text"><b>' + esc(name) + '</b>' +
        '<span>결과보고서 · ' + esc(r.templatePicked ? t.name : '템플릿 미정') +
          (p && p.ops.period ? ' · ' + esc(p.ops.period) : '') + '</span></div>' +
      '<div class="pb-act">' +
        '<button class="btn tiny" data-switch type="button">다른 건</button>' +
        (prop ? '<button class="btn tiny" data-to-proposal type="button">제안서</button>' : '') +
        (p ? '<button class="btn tiny" data-to-project type="button">프로젝트</button>'
           : (PJ.list().length
               ? '<button class="btn tiny" data-link-pj type="button">프로젝트에 붙이기</button>'
               : '')) +
      '</div></div>';
  }

  /* ③ 보내기 */
  function make(host) {
    var r = R.active();
    if (!r) { host.innerHTML = needReport('어떤 결과보고서를 만들지 먼저 골라 주세요'); bindNeed(host); return; }
    var p = projectOf(r);
    host.innerHTML = '<div class="pr-write">' + repBar(r) + rMakeStep(r, p) + '</div>';
    bindWrite(host, r, p);
  }

  /* ③ 보내기 — 만드는 데서 끝내지 않는다. 결과보고서는 고객사에 가야 일이 끝난다. */
  function rMakeStep(r, p) {
    var pv = R.planView(r, p);
    var sv = r.survey.parsed;
    var to = (p && p.client && p.client.email) || '';
    var who = p && p.client ? [p.client.person, p.client.rank].filter(Boolean).join(' ') : '';
    var sent = p && PJ.sentOf ? PJ.sentOf(p, 'report') : null;

    /* 양식이 없으면 만들 장이 없다 — 빈 파일이 나가지 않게 여기서 막는다 */
    if (!pv.made) {
      return '<section class="pr-card wstage">' +
        '<h3>먼저 양식을 올려 주세요</h3>' +
        '<p class="pr-hint">쓰시던 결과보고서 PPT 를 올리면 그 디자인 그대로 만들어 드립니다. ' +
          '양식이 없으면 만들 장이 없어 보낼 수 없습니다.</p>' +
        '<div class="btn-row"><button class="btn big primary" data-rstep="1" type="button">' +
          '① 템플릿으로 가기</button></div>' +
      '</section>';
    }

    return '<section class="pr-card wstage">' +
      '<h3>이 템플릿으로 이렇게 나옵니다</h3>' +
      '<div class="mk-top">' +
        '<div class="mk-sum"><b>' + esc(pv.name) + '</b>' +
          '<span>' + pv.made + '장' + (pv.dropped ? ' · 안 쓰는 장 ' + pv.dropped : '') + '</span>' +
          (pv.warn ? U.badge('빈칸 ' + pv.warn, 'warn') : U.badge('빈칸 없음', 'ok')) + '</div>' +
        '<div class="mk-go">' +
          '<button class="btn primary big" data-mail type="button">아웃룩으로 발송</button>' +
          '<button class="btn big" data-make type="button">파일로 내려받기 (.pptx)</button>' +
        '</div>' +
        '<p class="mk-draft">자동으로 채운 <b>초안</b>입니다. 받은 뒤 파워포인트에서 확인·수정해 주세요.</p>' +
      '</div>' +

      '<p class="pr-hint">' +
        (to ? '받는 사람 <b>' + esc(who ? who + ' ' + to : to) + '</b> · ' : '<b>받는 사람이 비어 있습니다</b> — 프로젝트에서 담당자 메일을 적어 주세요. ') +
        '결과보고서 PPT 가 첨부됩니다. 만족도 집계·교육사진 zip 도 함께 붙일 수 있고, ' +
        '<b>정산표는 원가가 들어 있어 기본으로 빠집니다.</b>' +
      '</p>' +
      (sent ? '<div class="ok-box">이미 ' + esc(sent.to || '') + ' 로 보냈습니다 — 다시 보내면 발송 기록이 갱신됩니다.</div>' : '') +

      (pv.warn ? '<p class="pr-hint warn-hint">빈칸이 있어도 만들 수 있습니다. 그 장은 안내 문구 없이 비어 나옵니다 — ' +
        '<button class="btn tiny" data-rstep="2" type="button">내용 채우러 가기</button></p>' : '') +
      '<div class="mk-slides">' + pv.slides.map(rSlideCard).join('') + '</div>' +
      '<div class="mk-more">' +
        '<button class="btn" data-export type="button">다른 파일로 저장</button>' +
        '<button class="btn" data-copy type="button">개요 복사</button>' +
      '</div>' +
      '<p class="pr-hint">정산표(.csv) · 만족도 집계(.csv) · 사진까지 담은 zip 은 <b>다른 파일로 저장</b>에 있습니다' +
        (sv ? '' : ' — 만족도 결과는 아직 없습니다') + '.</p>' +
    '</section>';
  }

  /* 빈 장은 '빨간 글씨' 로만 두지 않는다 — 무엇이 없는지, 어디서 채우는지,
     누르면 그 화면으로 간다. 괄호 문구만 있으면 경고인지 예시인지 알 수 없다. */
  function rSlideCard(s) {
    var body = s.drop
      ? '<span class="ms-off">빼고 만듭니다</span>'
      : s.keep
        ? '<span class="ms-off">양식 그대로 둡니다</span>'
        : (s.bullets.length
            ? '<ul>' + s.bullets.slice(0, 5).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') +
              (s.bullets.length > 5 ? '<li class="ms-more">외 ' + (s.bullets.length - 5) + '줄</li>' : '') + '</ul>'
            : '<span class="ms-need">' + U.icon('alert', 13) + esc(s.need || '') +
              (s.needAt ? '<button class="btn tiny" data-need="' + esc(s.needAt) + '" type="button">' +
                esc(s.needHow || '채우러 가기') + '</button>' : '') + '</span>') +
          (s.table ? '<span class="ms-tbl">표 ' + esc(s.table) + ' 채움</span>' : '');
    return '<div class="mslide' + (s.drop ? ' off' : '') + (s.warn ? ' warn' : '') + '">' +
      (s.thumb ? '<div class="ms-thumb"><img src="' + esc(s.thumb) + '" alt="" loading="lazy">' +
        '<span class="ms-no">' + s.no + '</span></div>' : '<div class="ms-thumb tt-outline"><span class="ms-no">' + s.no + '</span></div>') +
      '<div class="ms-body"><b>' + esc(s.title) + '</b>' +
        (s.label ? '<span class="ms-src">' + esc(s.label) + '</span>' : '') +
        body + '</div>' +
    '</div>';
  }

  function write(host) {
    var r = R.active();
    if (!r) { host.innerHTML = needReport('어떤 결과보고서를 쓸지 먼저 골라 주세요'); bindNeed(host); return; }
    var p = projectOf(r);
    var ov = r.overview;
    var sv = r.survey.parsed;
    /* 프로젝트가 없어도 정산은 연다 — 계획(제안 견적) 칸만 비고,
       실제로 쓴 돈은 직접 넣을 수 있다. */
    var st = R.settle(r, p);

    host.innerHTML =
      '<div class="pr-write">' +
        repBar(r) +

        '<header class="pr-whead">' +
          '<div><h2>내용 채우기</h2>' +
            '<p class="pj-sub">개요·만족도·사진·정산을 채우면 오른쪽 양식에 그대로 들어갑니다' +
              (p ? '' : ' · 프로젝트에 붙이면 제안서 견적이 정산에 들어옵니다') + '</p></div>' +
          '<div class="pr-wact">' +
            '<button class="btn ghost-danger" data-del type="button">삭제</button>' +
          '</div>' +
        '</header>' +

        ('' +
        '<div class="pr-cols">' +
          '<div class="pr-form">' +

            /* 고객사·과정 이름은 표지에 박히고 파일 이름에도 쓰인다.
               제안서 없이 결과보고서만 쓰는 일이 있어, 프로젝트에서만 읽어 오면
               그때는 표지가 통째로 비어 나간다. 여기서 직접 적을 수 있게 한다. */
            '<section class="pr-card"><h3>표지</h3>' +
              '<p class="pr-hint">여기 적은 이름이 <b>표지</b>와 <b>파일 이름</b>에 그대로 들어갑니다 — ' +
                '<code>' + esc(fileBase(p, r)) + '.pptx</code></p>' +
              '<div class="rp-grid">' +
                field('고객사명', 'client.company', (r.client || {}).company, '한라시멘트') +
                field('교육과정 이름', 'client.course', (r.client || {}).course, '팀장 리더십 과정') +
              '</div>' +
            '</section>' +

            '<section class="pr-card"><h3>과정 개요</h3>' +
              '<p class="pr-hint">프로젝트에 적어 둔 값이 먼저 들어옵니다. 실제와 다르면 여기서 고치세요.</p>' +
              '<div class="rp-grid">' +
                /* 보기글도 오늘 기준으로 — 지난 연도가 박혀 있으면 그대로 따라 적게 된다 */
                field('교육 기간', 'overview.period', ov.period, periodHint()) +
                field('장소', 'overview.place', ov.place, '마이산 홍삼빌') +
                field('신청 인원', 'overview.headcount', ov.headcount, '', 'number') +
                field('참석 인원', 'overview.attended', ov.attended, '', 'number') +
                field('수료 인원', 'overview.completed', ov.completed, '', 'number') +
                field('교수', 'overview.instructors', ov.instructors, '홍길동 외 1명') +
              '</div>' +
              field('고객 담당', 'overview.partner', ov.partner, '김과장 인재개발팀') +
              field('한 줄 요약', 'overview.summary', ov.summary, '어떤 과정을 어떻게 운영했는지 한두 줄', 'textarea') +
            '</section>' +

            '<section class="pr-card"><h3>결과 요약' + quickLink('survey', '만족도 넣기') + '</h3>' +
              (sv ? surveyDigest(r, sv) : '<p class="pr-empty">설문 결과 파일을 올리면 여기에 요약이 뜹니다. ' +
                '오른쪽 위 <b>만족도 넣기</b>를 누르세요.</p>') +
            '</section>' +

            '<section class="pr-card"><h3>사진 · 영수증</h3>' +
              '<div class="rp-linkrow">' +
                linkCard('photos', '교육사진', r.photos.count ? r.photos.count + '장' : '아직 기록 없음') +
                linkCard('receipts', '영수증', r.receipts.count ? r.receipts.count + '건 · ' + n(r.receipts.total) + '원' : '아직 기록 없음') +
              '</div>' +
            '</section>' +

            (st ? '<section class="pr-card"><h3>정산' + quickLink('settle', '자세히') + '</h3>' +
              '<div class="bg-row"><span>원가 계획</span><b>' + n(st.planCost) + '원</b></div>' +
              '<div class="bg-row"><span>원가 실제</span><b>' + n(st.actualCost) + '원</b>' +
                (st.saved ? '<em>' + (st.saved > 0 ? '절감 ' : '초과 ') + n(Math.abs(st.saved)) + '</em>' : '') + '</div>' +
              (st.price ? '<div class="bg-row ' + marginTone(st.actualMargin) + '"><span>실제 사업이익률</span><b>' +
                pct(st.actualMargin) + '</b><em>계획 ' + pct(st.planMargin) + '</em></div>' : '') +
            '</section>' : '') +

            '<section class="pr-card"><h3>정리</h3>' +
              field('잘된 점', 'good', r.good, '고객 반응, 운영에서 통한 것 — 줄바꿈하면 불렛이 나뉩니다', 'textarea') +
              field('아쉬운 점 · 개선', 'issue', r.issue, '다음에 고칠 것', 'textarea') +
              field('다음 제안', 'next', r.next, '이어서 제안할 과정·차수', 'textarea') +
            '</section>' +

          '</div>' +
          '<aside class="pr-side">' + preview(r, p) + '</aside>' +
        '</div>') +
      '</div>';

    bindWrite(host, r, p);
  }

  function marginTone(m) { return m >= 0.25 ? 'ok' : m >= 0.15 ? 'warn' : 'bad'; }
  function quickLink(tab, label) {
    return ' <button class="btn tiny" data-tab="' + tab + '" type="button">' + esc(label) + '</button>';
  }
  function linkCard(tab, label, sub) {
    return '<button class="rp-link" data-tab="' + tab + '" type="button">' +
      '<span class="rl-icon">' + U.icon(tab === 'photos' ? 'photos' : 'receipt', 19) + '</span>' +
      '<span class="rl-body"><b>' + esc(label) + '</b><span>' + esc(sub) + '</span></span>' +
      U.icon('chevron', 16) + '</button>';
  }

  function surveyDigest(r, sv) {
    var o = g.Survey.overall(sv);
    if (!o) return '<p class="pr-empty">점수 문항을 찾지 못했습니다.</p>';
    return '<div class="sv-hero">' +
        '<div class="sv-big"><b>' + o.to5 + '</b><span>/ 5.0</span></div>' +
        '<div class="sv-hero-sub">' +
          '<span>응답 ' + sv.n + '명 · 문항 ' + o.count + '개</span>' +
          (sv.nps ? '<span>추천의향 NPS ' + sv.nps.score + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="bg-row ok"><span>가장 높은 문항</span><b>' + esc(o.best.label) + '</b><em>' + o.best.to5 + '</em></div>' +
      (o.worst.label !== o.best.label
        ? '<div class="bg-row warn"><span>가장 낮은 문항</span><b>' + esc(o.worst.label) + '</b><em>' + o.worst.to5 + '</em></div>' : '') +
      (sv.texts.length ? '<p class="pr-hint">서술형 ' + sv.texts.reduce(function (a, t) { return a + t.answers.length; }, 0) + '건이 수강생 의견 슬라이드로 들어갑니다.</p>' : '');
  }

  /* 내용을 채우는 동안 옆에 세워 두는 미리보기.
     고른 양식의 장 그대로 세운다 — 채우는 글이 어느 장으로 가는지 보이게. */
  function preview(r, p) {
    var pv = R.planView(r, p);
    return '<div class="pr-preview">' +
      '<div class="pv-head"><b>' + esc(pv.name) + '</b>' +
        (pv.warn ? U.badge('빈칸 ' + pv.warn, 'warn') : U.badge('빈칸 없음', 'ok')) +
        '<button class="btn tiny" data-rstep="1" type="button">양식 바꾸기</button>' +
      '</div>' +
      '<div class="pv-body">' + pv.slides.filter(function (s) { return !s.drop; }).map(function (s) {
        return '<div class="slide' + (s.warn ? ' warn' : '') + '">' +
          '<div class="sl-head"><span class="sl-no">' + s.no + '</span><b>' + esc(s.title) + '</b></div>' +
          (s.keep ? '<ul><li>양식 그대로 둡니다</li></ul>'
            : '<ul>' + (s.bullets.length
                ? s.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('')
                : '<li class="sl-need">' + esc(s.need || '') + '</li>') +
              (s.table ? '<li class="sl-tbl">표 ' + esc(s.table) + ' 채움</li>' : '') + '</ul>') +
        '</div>';
      }).join('') + '</div>' +
      /* 빈칸이 아홉 군데 남았는데 단추에는 '다 채웠습니다' 라고 적혀 있었다.
         빈칸이 있어도 만들 수는 있지만, 만들기 전에 몇 군데가 빈 채로 나가는지는
         알려 줘야 한다. 말은 남은 상태에 맞춘다. */
      '<div class="pv-foot">' +
        '<button class="btn primary block" data-rstep="3" type="button">' +
          (pv.warn ? '빈칸 ' + pv.warn + '군데 그대로 만들기' : '다 채웠습니다 — 만들기') +
        '</button>' +
        (pv.warn ? '<p class="pv-note">빈 장은 안내 문구가 들어간 채로 나갑니다</p>' : '') +
      '</div></div>';
  }

  function bindWrite(host, r, p) {
    var timer = null;
    host.addEventListener('input', function (e) {
      var f = e.target.closest('[data-f]');
      if (!f) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        var key = f.dataset.f, val = f.type === 'number' ? (f.value === '' ? null : Number(f.value)) : f.value;
        if (key.indexOf('.') !== -1) {
          var parts = key.split('.');
          /* 예전에 만든 보고서에는 없는 묶음이 있다(client 는 나중에 생겼다).
             없는 채로 쓰면 여기서 터지고 화면이 통째로 멈춘다. */
          if (!r[parts[0]] || typeof r[parts[0]] !== 'object') r[parts[0]] = {};
          r[parts[0]][parts[1]] = val;
        } else r[key] = val;
        R.update(r.id, {});
        g.Report.render();
      }, 350);
    });

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-back]')) { g.Report.go('list'); return; }

      /* 걸음이 곧 상단 탭이다 */
      var stp = e.target.closest('[data-rstep]');
      if (stp) {
        var w = Number(stp.dataset.rstep);
        g.Report.go(w <= 1 ? 'templates' : w >= 3 ? 'make' : 'write');
        return;
      }

      /* 빈 장의 '채우러 가기' — 그 내용을 넣는 화면으로 바로 데려간다 */
      var nd = e.target.closest('[data-need]');
      if (nd) {
        var at = nd.dataset.need;
        if (at === 'proposal') {
          if (p && p.proposalId && g.PropStore) {
            g.PropStore.setActive(p.proposalId);
            g.Shell.go('proposal', { view: 'write' });
          } else U.toast('이 프로젝트에 연결된 제안서가 없습니다', 'err');
        } else g.Report.go(at);
        return;
      }

      /* 프로젝트 띠 — 템플릿 화면도 같이 쓴다 */
      if (hitRepBar(e, r, p)) return;
      /* 프로젝트 없이 시작했어도 나중에 붙일 수 있다 — 붙이면 그때부터
         제안서의 견적이 정산의 '계획' 칸으로 들어온다. */
      if (e.target.closest('[data-link-pj]')) {
        var ps = PJ.list();
        U.form({ title: '어느 프로젝트에 붙일까요', fields: [
          { key: 'projectId', label: '프로젝트', type: 'select', required: true, span: 2,
            options: ps.map(function (x) { return { value: x.id, label: PJ.name(x) }; }) }
        ], values: { projectId: PJ.activeId() || ps[0].id } }).then(function (v) {
          if (!v || !v.projectId) return;
          R.update(r.id, { projectId: v.projectId });
          PJ.update(v.projectId, { reportId: r.id });
          U.toast('프로젝트에 붙였습니다', 'ok');
          g.Report.render();
        });
        return;
      }
      if (e.target.closest('[data-to-proposal]')) {
        if (p && p.proposalId && g.PropStore) {
          g.PropStore.setActive(p.proposalId);
          g.Shell.go('proposal', { view: 'write' });
        }
        return;
      }

      if (e.target.closest('[data-make]')) {
        U.busy(true, U.withEta('파워포인트를 만드는 중…', 20), null, 'ppt');
        pptxBlob(r, p).then(function (blob) {
          U.busy(false);
          g.Zip.download(blob, fileBase(p, r) + '.pptx');
          draftNotice(r, p, fileBase(p, r) + '.pptx');
        }).catch(function (err) {
          U.busy(false);
          U.toast(err.message || 'PPT 를 만들지 못했습니다', 'err');
        });
        return;
      }

      var tab = e.target.closest('[data-tab]');
      if (tab) { g.Report.go(tab.dataset.tab); return; }
      if (e.target.closest('[data-del]')) {
        U.confirm('이 결과보고서를 지울까요?', { danger: true, ok: '삭제' }).then(function (yes) {
          if (!yes) return;
          R.remove(r.id); g.Report.go('list'); U.toast('결과보고서를 지웠습니다', 'ok');
        });
        return;
      }
      if (e.target.closest('[data-copy]')) {
        navigator.clipboard.writeText(R.outlineText(r, p))
          .then(function () { U.toast('개요서를 복사했습니다', 'ok'); })
          .catch(function () { U.toast('복사하지 못했습니다', 'err'); });
        return;
      }
      if (e.target.closest('[data-export]')) exportSheet(r, p);
      if (e.target.closest('[data-mail]')) mailSheet(r, p);
    });
  }

  /* 결과보고서를 아웃룩으로 */
  function mailSheet(r, p) {
    if (!g.MailViews) { U.toast('메일 모듈을 찾지 못했습니다', 'err'); return; }
    var base = fileBase(p, r);
    var sv = r.survey.parsed;
    var draft = g.MailStore.reportMail(r, p);

    g.MailViews.open({
      title: '결과보고서 메일 보내기',
      to: (p && p.client && p.client.email) || '',
      subject: draft.subject, body: draft.body,
      files: [
        { id: 'pptx', name: '결과보고서', fileName: base + '.pptx', on: true,
          desc: R.outline(r, p).length + '장짜리 파워포인트',
          make: function () { return pptxBlob(r, p); } },
        { id: 'md', name: '결과보고서 개요', fileName: base + '_개요.md', on: false,
          desc: '쓰시던 양식에 붙여넣을 때 (.md)',
          make: function () { return textBlob(R.outlineText(r, p), 'text/markdown'); } },
        { id: 'survey', name: '만족도 집계', fileName: base + '_만족도.csv', on: !!sv,
          desc: sv ? '문항별 평균 + 서술형 (.csv)' : '만족도 결과가 없습니다',
          make: function () { return textBlob(surveyCsv(sv), 'text/csv'); } },
        { id: 'zip', name: '교육사진 + 보고서 zip', fileName: base + '.zip', on: false,
          desc: '사진이 많으면 20MB를 넘을 수 있습니다 — 정산표는 빠집니다',
          make: function () {
            return zipBlob(r, p, base, { client: true }).then(function (res) { return res.blob; });
          } },
        { id: 'settle', name: '정산표', fileName: base + '_정산.csv', on: false, internal: true,
          desc: '원가·사업이익률이 들어 있습니다 (.csv)',
          make: function () { return textBlob(settleCsv(r, p), 'text/csv'); } }
      ].filter(function (f) { return f.id !== 'survey' || sv; }),
      onSent: function (mode, to) {
        if (!p) return;
        PJ.markSent(p.id, 'report', to, mode);
        g.Report.render();
      }
    });
  }

  function textBlob(text, mime) {
    return new Blob(['﻿' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  }

  /* 회사 양식을 골랐으면 그 파일에 글자를 갈아 끼워 만든다.
     양식이 없을 때만 맨바닥에서 기본 장표를 그린다 —
     전에는 양식이 있어도 늘 맨바닥에서 그려서, 준 양식대로 나오지 않았다. */
  /* 내려받은 뒤 — 초안이라는 것과, 이 보고서에서 실제로 비어 있는 장을 알려 준다 */
  function draftNotice(r, p, fileName) {
    var issues = R.gaps(r, p).map(function (t) { return t + ' — 내용이 비어 있습니다'; });
    reviewLeft.forEach(function (x) {
      issues.push((x.slide ? x.slide + '번째 장' : '모든 장 머리말') + ' — ' + (x.problem || x.kind) +
        (x.text ? ' (「' + String(x.text).slice(0, 40) + '」)' : ''));
    });
    U.draftNote({
      title: '결과보고서 초안을 저장했습니다',
      file: fileName,
      issues: issues,
      checks: [
        reviewFixed.length ? 'AI 검수가 예전 이름 ' + reviewFixed.length + '곳을 이번 건으로 바꿨습니다' : '',
        '고객사명·과정명·교육 일정이 맞는지',
        '참석·수료 인원과 만족도 숫자',
        '교육 사진이 이 과정의 것인지, 들어가면 안 되는 사진은 없는지',
        'AI 가 쓴 총평·개선 의견이 실제와 맞는지'
      ]
    });
  }

  function pptxBlob(r, p) {
    var t = R.template(r.templateId);
    if (t && t.kind === 'pptx') return fillFromTemplate(r, p);
    if (!g.Pptx) return Promise.reject(new Error('PPT 모듈을 찾지 못했습니다'));
    return g.Pptx.fromOutline(R.outline(r, p), {
      title: (p ? PJ.name(p) + ' ' : '') + '결과보고서',
      company: (g.PropStore ? g.PropStore.myTeam() : 'KMA 인재개발센터')
    });
  }

  function fillFromTemplate(r, p) {
    var plan = R.fillPlan(r, p);
    if (!plan) return Promise.reject(new Error('양식을 읽지 못했습니다'));
    U.busy(true, U.withEta('회사 양식에 채우는 중…', 20), null, 'ppt');
    return loadPics(plan).then(function () {
      return sendFill(r, p, plan);
    });
  }

  /* 사진 장에 실제 사진을 실어 준다.
     전에는 '교육 사진 24장' 이라는 글만 넣고 사진은 한 장도 안 들어갔다.
     사진은 '사진 정리' 화면이 메모리에 들고 있으므로 거기서 가져온다.
     원본은 한 장 5~10MB 라 슬라이드에 맞는 크기로 줄여 보낸다. */
  function loadPics(plan) {
    var want = (plan.fill || []).filter(function (f) { return f.picSlots; });
    if (!want.length) return Promise.resolve();

    var PP = g.PhotoProject;
    var all = PP && PP.sortedPhotos ? PP.sortedPhotos() : [];
    var keep = all.filter(function (x) { return x && x.file && x.status === 'keep'; });
    if (!keep.length) {
      /* 사진이 없으면 자리 표시만 지우고 넘어간다 — 있지도 않은 것을 기다리지 않는다 */
      want.forEach(function (f) { delete f.picSlots; });
      return Promise.resolve();
    }

    /* 어느 장이 몇 번째 사진부터 맡는지는 계획이 이미 정해 두었다(picFrom).
       장이 늘어난 뒤의 번호로 잡혀 있으므로 여기서는 그대로 따른다. */
    var jobs = [];
    want.forEach(function (f) {
      f.pics = [];
      var from = Number(f.picFrom) || 0;
      for (var i = 0; i < f.picSlots && (from + i) < keep.length; i++) {
        jobs.push({ into: f, photo: keep[from + i] });
      }
      delete f.picSlots;
      delete f.picFrom;
    });
    if (!jobs.length) return Promise.resolve();

    var done = 0;
    U.busy(true, '사진을 넣는 중… 0 / ' + jobs.length, 0, 'photo');
    /* 사진은 한 장씩 파일 통로로 올리고 표시만 계획에 싣는다.
       열세 장을 base64 로 한 요청에 담으면 5MB 가 넘어, 배포한 웹이 받지 않는다.
       순서가 섞이지 않게 자리(순번)를 잡아 두고 채운다. */
    jobs.forEach(function (j) { j.at = j.into.pics.length; j.into.pics.push(null); });
    return g.Imaging.queue(jobs, function (j) {
      var deg = ((j.photo.manualRotation || 0) + degOf(j.photo.exifOrientation)) % 360;
      return g.Imaging.fitBlob(j.photo.file, deg, 1600, 82)
        .then(function (blob) { return blob ? g.Files.pack(blob, 'photo.jpg', true) : null; })
        .then(function (v) { if (v) j.into.pics[j.at] = v; })
        .catch(function () {})
        .then(function () {
          done++;
          U.busy(true, '사진을 넣는 중… ' + done + ' / ' + jobs.length,
                 Math.round(done / jobs.length * 100), 'photo');
        });
    }, 2).then(function () {
      /* 못 올린 사진 자리는 빼고 보낸다 */
      want.forEach(function (f) { f.pics = (f.pics || []).filter(Boolean); });
    });
  }

  /* EXIF 방향값을 각도로. 세워 찍은 사진이 누워 들어가는 것을 막는다. */
  function degOf(o) {
    if (o === 6) return 90;
    if (o === 3) return 180;
    if (o === 8) return 270;
    return 0;
  }

  /* AI 마지막 검수가 찾은 것 — 내려받은 뒤 초안 안내에 적는다 */
  var reviewLeft = [], reviewFixed = [];

  function sendFill(r, p, plan) {
    U.busy(true, U.withEta('회사 양식에 채우고 마지막 검수 중…', 45), null, 'ppt');
    var co = String((r.client && r.client.company) || (p && p.company) || '').trim();
    var bareCo = co.replace(/^\s*(\(주\)|㈜|주식회사)\s*|\s*(\(주\)|㈜|주식회사)\s*$/g, '').trim();
    var course = String((r.client && r.client.course) || (p && p.course) || '');
    var review = { kind: '결과보고서', course: g.PropStore ? g.PropStore.tidyCourse(course) : course,
                   names: [co, bareCo !== co ? bareCo : '', p && p.client && p.client.person].filter(Boolean) };
    reviewLeft = []; reviewFixed = [];
    return fetch('/api/ppt/fill', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign(plan, { fileName: fileBase(p, r) + '.pptx', review: review }))
    }).then(function (res) {
      return res.json().then(function (d) {
        if (!res.ok || d.error) throw new Error(d.message || '양식에 채우지 못했습니다');
        var rv = d.audit && d.audit.review;
        if (rv) { reviewLeft = rv.left || []; reviewFixed = rv.fixed || []; }
        /* 칸이 모자라 서버가 끝 줄을 덜어 낸 곳도 알린다 */
        ((d.audit && d.audit.items) || []).forEach(function (x) {
          if (x.kind === 'trim') {
            reviewLeft.push({ slide: x.slide, problem: '칸이 모자라 끝의 ' + (x.lines || 1) + '줄을 뺐습니다', text: x.text });
          } else if (x.kind === 'over') {
            reviewLeft.push({ slide: x.slide, problem: '글이 칸보다 깁니다 — 파워포인트에서 확인해 주세요', text: x.text });
          }
        });
        return g.Files.unpack(d,
          'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      });
    }).then(function (blob) {
      U.busy(false);
      return blob;
    }).catch(function (e) {
      U.busy(false);
      if (e instanceof TypeError) {
        throw new Error('서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
      }
      throw e;
    });
  }

  /* ── 만족도 ───────────────────────────────────────── */

  function survey(host) {
    var r = R.active();
    if (!r) { host.innerHTML = needReport('만족도 결과는 결과보고서 안에 들어갑니다'); bindNeed(host); return; }
    var sv = r.survey.parsed;

    host.innerHTML =
      '<div class="pr-write">' +
        '<button class="back-link" data-back type="button">' + U.icon('chevron', 16) + ' 작성 화면</button>' +
        '<h2>만족도 조사</h2>' +
        '<p class="pj-sub">구글폼에서 내려받은 응답 파일을 그대로 올리세요. ' +
          '4점·5점 척도를 알아서 가려 읽고, “해당사항 없음”은 평균에서 뺍니다.</p>' +

        /* 붙여넣기보다 파일을 올리는 쪽이 먼저다.
           서술형 답변에 줄바꿈이 섞이면 붙여넣기는 표가 어긋난다. 파일은 그럴 일이 없다. */
        '<section class="pr-card">' +
          '<h3>설문 파일 올리기</h3>' +
          '<div class="cur-drop" id="sv-drop">' +
            '<input type="file" id="sv-file" hidden accept=".xlsx,.xlsm,.csv">' +
            '<p><b>구글폼 응답 엑셀(.xlsx) 이나 .csv 를 올리세요</b></p>' +
            '<p class="sub">끌어다 놓거나 <button class="link" id="sv-pick" type="button">클릭해서 선택</button></p>' +
            (r.survey.fileName
              ? '<p class="cur-note">지금 올린 파일 — <b>' + esc(r.survey.fileName) + '</b></p>'
              : '<p class="cur-note">구글폼 → 응답 → 스프레드시트 → 파일 → 다운로드 → .xlsx</p>') +
          '</div>' +
        '</section>' +

        '<section class="pr-card">' +
          '<h3>또는 표째로 붙여넣기</h3>' +
          '<textarea class="sv-paste" id="sv-paste" rows="7" placeholder="타임스탬프	교수 만족도	내용 만족도	운영 만족도	가장 좋았던 점&#10;2026-10-16 17:02	5	4	5	실습이 많아서 좋았습니다">' + esc(r.survey.raw) + '</textarea>' +
          '<div class="sv-act">' +
            '<button class="btn primary" data-parse type="button">읽어 들이기</button>' +
            (sv ? '<button class="btn ghost-danger" data-clear type="button">지우기</button>' : '') +
            '<span class="pr-hint">붙여넣은 원문은 이 PC 에만 남습니다.</span>' +
          '</div>' +
        '</section>' +

        (sv ? result(r, sv) : '') +
      '</div>';

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-back]')) { g.Report.go('write'); return; }
      if (e.target.closest('[data-parse]')) {
        var text = host.querySelector('#sv-paste').value;
        if (!text.trim()) { U.toast('붙여넣은 내용이 없습니다', 'err'); return; }
        var res = R.setSurvey(r, text);
        if (res.error) { U.toast(res.error, 'err'); return; }
        g.Report.render();
        U.toast(res.mode === 'agg'
          ? '집계표에서 문항 ' + res.questions.length + '개를 읽었습니다'
          : '응답 ' + res.n + '명 · 문항 ' + res.questions.length + '개를 읽었습니다', 'ok');
        return;
      }
      if (e.target.closest('#sv-pick')) { host.querySelector('#sv-file').click(); return; }
      if (e.target.closest('[data-clear]')) {
        R.clearSurvey(r); g.Report.render(); U.toast('만족도 결과를 지웠습니다');
      }
    });

    host.addEventListener('input', function (e) {
      var f = e.target.closest('[data-note]');
      if (f) { r.survey.note = f.value; R.update(r.id, {}); }
    });

    /* ── 설문 파일 올리기 ── */
    var fileInput = host.querySelector('#sv-file');
    var drop = host.querySelector('#sv-drop');

    function takeSurveyFile(file) {
      if (!file) return;
      if (!g.Office) { U.toast('파일 읽기 모듈을 찾지 못했습니다', 'err'); return; }
      U.busy(true, U.withEta('설문 파일을 읽는 중…', 10));
      g.Office.read(file).then(function (res) {
        U.busy(false);
        var rows = (res.tables && res.tables[0]) || null;
        /* 표로 못 읽히면 줄 목록이라도 나눠 본다 */
        if (!rows || rows.length < 2) {
          var out = R.setSurvey(r, (res.lines || []).join('\n'));
          if (out.error) { U.toast(out.error, 'err'); return; }
          r.survey.fileName = file.name; R.update(r.id, {});
          g.Report.render();
          U.toast('응답 ' + out.n + '명 · 문항 ' + out.questions.length + '개를 읽었습니다', 'ok');
          return;
        }
        var got = R.setSurveyGrid(r, rows, file.name);
        if (got.error) { U.toast(got.error, 'err'); return; }
        g.Report.render();
        U.toast(file.name + ' — 응답 ' + got.n + '명 · 문항 ' + got.questions.length + '개를 읽었습니다', 'ok');
      }).catch(function (err) {
        U.busy(false);
        U.toast(err.message || '파일을 읽지 못했습니다', 'err');
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var f = fileInput.files[0];
        fileInput.value = '';
        takeSurveyFile(f);
      });
    }
    if (drop) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
      });
      drop.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files[0]) takeSurveyFile(e.dataTransfer.files[0]);
      });
    }
  }

  function result(r, sv) {
    var o = g.Survey.overall(sv);
    var maxQ = sv.questions.reduce(function (a, q) { return Math.max(a, q.to5); }, 5);

    return '<section class="pr-card"><h3>종합</h3>' +
        (o ? '<div class="sv-hero">' +
          '<div class="sv-big"><b>' + o.to5 + '</b><span>/ 5.0</span></div>' +
          '<div class="sv-hero-sub">' +
            '<span>' + (sv.mode === 'agg' ? '집계표 ' + o.count + '개 문항' : '응답 ' + sv.n + '명 · 문항 ' + o.count + '개') + '</span>' +
            (o.weighted !== null && o.weighted !== o.to5 ? '<span>응답수 가중 ' + o.weighted + '</span>' : '') +
            (sv.nps ? '<span>NPS ' + sv.nps.score + ' (추천 ' + sv.nps.promoters + ' · 비추천 ' + sv.nps.detractors + ')</span>' : '') +
          '</div>' +
        '</div>' : '') +
        '<div class="pr-field"><label>보고서에 덧붙일 한마디</label>' +
          '<textarea data-note rows="2" placeholder="예: 실습 비중을 늘린 것이 점수로 나타났습니다">' + esc(r.survey.note || '') + '</textarea></div>' +
      '</section>' +

      '<section class="pr-card"><h3>문항별</h3>' +
        '<div class="sv-qs">' + sv.questions.map(function (q) {
          var isNps = q.isNps || (q.scale === 10 && /추천|nps/i.test(q.label));
          return '<div class="sv-q' + (isNps ? ' nps' : '') + '">' +
            '<span class="sq-label">' + esc(q.label) +
              (isNps ? ' <span class="sq-tag">NPS</span>' : '') + '</span>' +
            '<span class="sq-bar"><i style="width:' + Math.round(q.to5 / maxQ * 100) + '%"></i></span>' +
            '<b class="sq-avg">' + q.avg + (q.scale !== 5 ? '<em>/' + q.scale + '</em>' : '') + '</b>' +
            (q.topRate !== null ? '<span class="sq-top">긍정 ' + Math.round(q.topRate * 100) + '%</span>' : '') +
            (q.dist ? '<span class="sq-dist">' + distBar(q) + '</span>' : '') +
          '</div>';
        }).join('') + '</div>' +
      '</section>' +

      (sv.texts.length ? '<section class="pr-card"><h3>서술형 응답</h3>' +
        sv.texts.map(function (t) {
          return '<div class="sv-text"><b>' + esc(t.label) + ' <em>' + t.answers.length + '건</em></b>' +
            '<ul>' + t.answers.slice(0, 20).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' +
            (t.answers.length > 20 ? '<p class="pr-hint">앞 20건만 보여 줍니다. 보고서에는 8건이 들어갑니다.</p>' : '') +
          '</div>';
        }).join('') + '</section>' : '') +

      (sv.skipped && sv.skipped.length ? '<section class="pr-card"><h3>건너뛴 열</h3>' +
        '<p class="pr-hint">점수로도 서술형으로도 보기 어려워 통계에서 뺐습니다. 문항이 맞다면 값을 확인해 주세요.</p>' +
        '<ul class="sv-skip">' + sv.skipped.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
      '</section>' : '');
  }

  function distBar(q) {
    var keys = Object.keys(q.dist).sort(function (a, b) { return Number(b) - Number(a); });
    var max = Math.max.apply(null, keys.map(function (k) { return q.dist[k]; })) || 1;
    return keys.map(function (k) {
      var v = q.dist[k];
      return '<i title="' + k + '점 ' + v + '명" style="height:' + Math.max(3, Math.round(v / max * 100)) + '%"></i>';
    }).join('');
  }

  /* ── 정산 · 견적서 ────────────────────────────────── */

  function settle(host) {
    var r = R.active();
    if (!r) { host.innerHTML = needReport('정산·견적서는 결과보고서 안에 들어갑니다'); bindNeed(host); return; }
    /* 프로젝트가 없으면 여기서 막아 세웠다. 하지만 제안서 없이 수주한 건도
       쓴 돈은 정리해야 한다. 계획(제안 견적) 칸만 비고 실제는 직접 넣으면 된다. */
    var p = projectOf(r);
    var s = R.settle(r, p);

    host.innerHTML =
      '<div class="pr-write">' +
        '<button class="back-link" data-back type="button">' + U.icon('chevron', 16) + ' 작성 화면</button>' +
        '<header class="pj-head"><div><h2>정산 · 견적서</h2>' +
        '<p class="pj-sub">제안서에 쓴 <b>견적이 그대로 넘어옵니다.</b> 실제 집행액은 계획과 같은 값으로 시작하니 ' +
          '<b>달라진 줄만</b> 고치세요. 여기서 나온 실제 사업이익률이 결과보고서 정산 장에 들어갑니다.</p></div>' +
        '<button class="btn primary" data-quote type="button">외부용 견적서</button></header>' +

        (!s.hasPlan
          ? '<p class="pr-empty">이 프로젝트에 연결된 제안서 견적이 없습니다. 아래에서 직접 넣을 수 있습니다.</p>'
          : '') +

        '<section class="pr-card"><h3>견적 항목' +
          (s.edited ? ' ' + U.badge('고친 줄 ' + s.edited, 'warn') : '') +
          (s.edited ? '<button class="btn tiny" data-reset type="button">계획값으로 되돌리기</button>' : '') + '</h3>' +

          (s.groups.length
            ? s.groups.map(function (gr) {
                return '<table class="stl stl-item"><thead><tr>' +
                  '<th class="gh" colspan="2">' + esc(gr.name) + '</th>' +
                  '<th>계획</th><th>실제</th><th>차액</th></tr></thead><tbody>' +
                  gr.rows.map(function (x) {
                    return '<tr' + (x.edited && x.from === '제안' ? ' class="edited"' : '') + '>' +
                      '<td class="it-name"><b>' + esc(x.name) + '</b>' +
                        (x.detail ? '<span>' + esc(x.detail) + '</span>' : '') +
                        (x.from === '직접' ? '<span class="it-tag">직접 넣음</span>' : '') + '</td>' +
                      '<td class="it-acct">' + esc(x.account) + '</td>' +
                      '<td class="num">' + n(x.plan) + '</td>' +
                      '<td class="num it-in"><input type="text" inputmode="numeric" data-actual="' + esc(x.id) + '" ' +
                        'value="' + n(x.actual) + '" aria-label="실제 집행액"></td>' +
                      '<td class="num ' + (x.diff > 0 ? 'over' : x.diff < 0 ? 'under' : '') + '">' +
                        (x.diff ? (x.diff > 0 ? '+' : '') + n(x.diff) : '—') + '</td>' +
                      (x.from === '직접'
                        ? '<td class="it-rm"><button class="icon-btn tiny" data-rm="' + x.manual + '" type="button">✕</button></td>'
                        : '<td class="it-rm"></td>') +
                    '</tr>';
                  }).join('') +
                  '<tr class="sub"><td colspan="2">' + esc(gr.name) + ' 소계</td>' +
                    '<td class="num">' + n(gr.plan) + '</td><td class="num">' + n(gr.actual) + '</td>' +
                    '<td class="num ' + (gr.actual > gr.plan ? 'over' : gr.actual < gr.plan ? 'under' : '') + '">' +
                      (gr.actual - gr.plan ? (gr.actual > gr.plan ? '+' : '') + n(gr.actual - gr.plan) : '—') + '</td>' +
                    '<td></td></tr>' +
                  '</tbody></table>';
              }).join('') +
              '<table class="stl stl-total"><tbody><tr class="sum"><td>원가 합계</td>' +
                '<td class="num">' + n(s.planCost) + '</td>' +
                '<td class="num">' + n(s.actualCost) + '</td>' +
                '<td class="num ' + (s.actualCost > s.planCost ? 'over' : 'under') + '">' +
                  (s.actualCost - s.planCost > 0 ? '+' : '') + n(s.actualCost - s.planCost) + '</td>' +
                '<td class="num">' + (s.planCost ? pct(s.actualCost / s.planCost) : '—') + '</td>' +
              '</tr></tbody></table>'
            : '<p class="pr-empty">계획도 실제도 아직 없습니다.</p>') +
          '<button class="btn" data-add type="button">+ 제안서에 없던 항목</button>' +
        '</section>' +

        '<section class="pr-card"><h3>영수증</h3>' +
          '<label class="bg-vat"><input type="checkbox" data-use-receipts' + (r.settle.useReceipts ? ' checked' : '') +
            '> 이 프로젝트로 처리한 영수증을 함께 본다' +
            (s.receiptCount ? ' <b>(' + s.receiptCount + '건 · ' + n(s.receiptTotal) + '원)</b>' : ' (아직 0건)') + '</label>' +
          (s.receipts.length
            ? '<p class="pr-hint">영수증은 계정까지만 압니다. 어느 항목의 실제 금액으로 넣을지는 직접 고르세요.</p>' +
              '<ul class="stl-rec">' + s.receipts.map(function (rc, i) {
                return '<li><b>' + esc(rc.account) + '</b>' +
                  '<span>영수증 ' + n(rc.amount) + '원' + (rc.plan ? ' · 계획 ' + n(rc.plan) + '원' : ' · 계획에 없던 계정') + '</span>' +
                  (rc.targets.length
                    ? '<button class="btn tiny" data-apply-rec="' + i + '" type="button">실제에 넣기</button>'
                    : '<button class="btn tiny" data-add-rec="' + i + '" type="button">항목으로 추가</button>') +
                '</li>';
              }).join('') + '</ul>'
            : (r.settle.useReceipts ? '<p class="pr-empty">아직 이 프로젝트로 처리한 영수증이 없습니다.</p>' : '')) +
        '</section>' +

        '<section class="pr-card"><h3>손익</h3>' +
          '<div class="bg-row"><span>제안가 (공급가)</span><b>' + n(s.price) + '원</b></div>' +
          '<div class="bg-row"><span>사업이익 (계획)</span><b>' + n(s.planProfit) + '원</b><em>' + pct(s.planMargin) + '</em></div>' +
          '<div class="bg-row ' + marginTone(s.actualMargin) + '"><span>사업이익 (실제)</span><b>' +
            n(s.actualProfit) + '원</b><em>' + pct(s.actualMargin) + '</em></div>' +
          (s.saved ? '<div class="bg-row"><span>원가 ' + (s.saved > 0 ? '절감' : '초과') + '</span><b>' + n(Math.abs(s.saved)) + '원</b></div>' : '') +
          '<div class="pr-field"><label>정산 메모</label>' +
            '<textarea data-settle-note rows="2" placeholder="예: 버스 대절이 예상보다 저렴했습니다">' + esc(r.settle.note || '') + '</textarea></div>' +
          '<div class="sv-act"><button class="btn" data-copy-settle type="button">정산표 복사</button>' +
            '<button class="btn" data-csv type="button">정산표 CSV</button></div>' +
        '</section>' +
      '</div>';

    host.addEventListener('change', function (e) {
      if (e.target.closest('[data-use-receipts]')) {
        r.settle.useReceipts = e.target.checked;
        R.update(r.id, {});
        g.Report.render();
      }
    });
    host.addEventListener('input', function (e) {
      if (e.target.closest('[data-settle-note]')) { r.settle.note = e.target.value; R.update(r.id, {}); }
    });

    /* 실제 집행액은 다 치고 칸을 떠날 때 반영한다 —
       한 글자마다 다시 그리면 '1,2' 처럼 치는 도중 값이 튄다. */
    host.addEventListener('change', function (e) {
      var inp = e.target.closest('[data-actual]');
      if (!inp) return;
      var id = inp.dataset.actual;
      var raw = String(inp.value).replace(/[^\d.-]/g, '');
      if (id.charAt(0) === 'm' && /^m\d+$/.test(id)) {
        var mi = Number(id.slice(1));
        if (r.settle.items[mi]) { r.settle.items[mi].amount = Number(raw) || 0; R.update(r.id, {}); }
      } else {
        R.setActual(r, id, raw === '' ? null : raw);
      }
      g.Report.render();
    });

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-back]')) { g.Report.go('write'); return; }
      if (e.target.closest('[data-reset]')) {
        R.resetActuals(r); g.Report.render();
        U.toast('실제 집행액을 계획값으로 되돌렸습니다', 'ok');
        return;
      }
      var ap = e.target.closest('[data-apply-rec]');
      if (ap) { applyReceipt(r, s.receipts[Number(ap.dataset.applyRec)]); return; }
      var ar = e.target.closest('[data-add-rec]');
      if (ar) {
        var rc = s.receipts[Number(ar.dataset.addRec)];
        r.settle.items.push({ account: rc.account, name: '영수증 처리분', amount: rc.amount, group: '운영비' });
        R.update(r.id, {}); g.Report.render();
        U.toast('항목으로 넣었습니다', 'ok');
        return;
      }
      if (e.target.closest('[data-quote]')) {
        var prop = p && p.proposalId && g.PropStore ? g.PropStore.get(p.proposalId) : null;
        if (!prop) { U.toast('연결된 제안서가 없어 견적 항목을 가져올 수 없습니다', 'err'); return; }
        g.QuoteViews.open(prop, function () { g.PropStore.update(prop.id, {}); g.Report.render(); });
        return;
      }
      var rm = e.target.closest('[data-rm]');
      if (rm) { r.settle.items.splice(Number(rm.dataset.rm), 1); R.update(r.id, {}); g.Report.render(); return; }
      if (e.target.closest('[data-add]')) {
        var accts = (g.Accounts && g.Accounts.ACCOUNTS ? g.Accounts.ACCOUNTS : [])
          .map(function (a) { return a.account || a.name || a; })
          .filter(function (x) { return typeof x === 'string' && x; });
        if (!accts.length) accts = (g.PropStore.COST_PRESET || []).map(function (c) { return c.account; });
        U.form({ title: '제안서에 없던 항목 넣기', fields: [
          { key: 'group', label: '구분', type: 'select', required: true, options: ['운영비', '교육비'] },
          { key: 'account', label: '계정', type: 'select', required: true, options: accts },
          { key: 'name', label: '내용', span: 2, placeholder: '현장 추가 다과' },
          { key: 'amount', label: '실제 금액', type: 'number', required: true }
        ], values: { group: '운영비' } }).then(function (d) {
          if (!d) return;
          r.settle.items.push({
            group: d.group || '운영비', account: d.account,
            name: d.name || '', amount: Number(d.amount) || 0
          });
          R.update(r.id, {});
          g.Report.render();
        });
        return;
      }
      if (e.target.closest('[data-copy-settle]')) {
        navigator.clipboard.writeText(R.settleText(r, p))
          .then(function () { U.toast('정산표를 복사했습니다', 'ok'); })
          .catch(function () { U.toast('복사하지 못했습니다', 'err'); });
        return;
      }
      if (e.target.closest('[data-csv]')) {
        download(settleCsv(r, p), fileBase(p, r) + '_정산.csv', 'text/csv;charset=utf-8');
        U.toast('정산표를 저장했습니다', 'ok');
      }
    });
  }

  /* 영수증은 계정까지만 안다. 그 계정에 견적 줄이 하나면 그대로 넣고,
     여럿이면 어느 줄인지 물어본다 — 비율로 나눠 넣으면 없는 숫자를 지어내는 셈이다. */
  function applyReceipt(r, rc) {
    if (!rc || !rc.targets.length) return;
    function put(id) {
      if (/^m\d+$/.test(id)) {
        var mi = Number(id.slice(1));
        if (r.settle.items[mi]) r.settle.items[mi].amount = rc.amount;
        R.update(r.id, {});
      } else R.setActual(r, id, rc.amount);
      g.Report.render();
      U.toast('영수증 금액을 실제에 넣었습니다', 'ok');
    }
    if (rc.targets.length === 1) { put(rc.targets[0].id); return; }
    U.form({ title: rc.account + ' ' + n(rc.amount) + '원', fields: [
      { key: 'id', label: '어느 항목의 실제 금액인가요', type: 'select', required: true, span: 2,
        options: rc.targets.map(function (t) { return t.name; }) }
    ], values: {} }).then(function (d) {
      if (!d) return;
      var hit = rc.targets.filter(function (t) { return t.name === d.id; })[0];
      if (hit) put(hit.id);
    });
  }

  /* ── 사진 · 영수증 (도구를 이 안에 띄운다) ─────────── */

  var sub = null;

  function unmountSub() {
    if (sub && sub.unmount) { try { sub.unmount(); } catch (e) {} }
    sub = null;
  }

  function embed(host, mod, note, onSync) {
    var r = R.active();
    host.innerHTML =
      '<div class="rp-embed">' +
        '<div class="rp-ebar">' +
          '<button class="back-link" data-back type="button">' + U.icon('chevron', 16) + ' 작성 화면</button>' +
          '<span class="rp-enote">' + note + '</span>' +
          '<button class="btn tiny primary" data-sync type="button">결과보고서에 기록</button>' +
        '</div>' +
        '<div class="rp-ehost"></div>' +
      '</div>';

    var slot = host.querySelector('.rp-ehost');
    try { mod.mount(slot); sub = mod; }
    catch (e) { slot.innerHTML = '<pre class="err-dump">' + esc(e.stack || String(e)) + '</pre>'; }

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-back]')) { g.Report.go('write'); return; }
      if (e.target.closest('[data-sync]')) { onSync(r); g.Report.render(); }
    });
  }

  function photos(host) {
    var r = R.active();
    if (!r) { host.innerHTML = needReport('교육사진은 결과보고서 안에 들어갑니다'); bindNeed(host); return; }
    var p = projectOf(r);

    /* 사진 도구의 고객사·행사명이 비어 있으면 프로젝트 값으로 채워 둔다 */
    seedPhotos(p);

    embed(host, g.Photos,
      '여기서 정리한 사진 장수와 zip 이름을 결과보고서에 남깁니다. 사진 도구는 한 번에 한 건만 작업합니다.',
      function (rep) {
        var s = readPhotoState();
        rep.photos = { zipName: s.zipName, count: s.count, sections: s.sections, at: Date.now() };
        R.update(rep.id, {});
        U.toast(s.count ? '사진 ' + s.count + '장을 기록했습니다' : '기록할 사진이 없습니다', s.count ? 'ok' : 'err');
      });
  }

  /* 사진 도구의 현재 작업 상태를 읽는다 */
  function readPhotoState() {
    var out = { zipName: '', count: 0, sections: 0 };
    if (!g.PhotoProject || !g.PhotoProject.state) return out;
    try {
      var st = g.PhotoProject.state();
      if (!st) return out;
      out.count = (st.photos || []).filter(function (x) { return x.status === 'keep'; }).length;
      out.sections = (st.sections || []).length;
      out.zipName = g.PhotoProject.zipName ? g.PhotoProject.zipName() : '';
    } catch (e) {}
    return out;
  }

  function seedPhotos(p) {
    if (!p || !g.PhotoProject || !g.PhotoProject.state) return;
    try {
      var st = g.PhotoProject.state();
      if (!st) return;
      /* 아직 사진을 안 올렸으면 이 결과보고서의 고객사 · 과정명으로 맞춘다
         (이전 건 이름이 남아 있으면 파일명이 엉뚱하게 나간다). 올린 뒤에는 건드리지 않는다. */
      var fresh = !(st.photos || []).length;
      var patch = {};
      if (p.company && (fresh || !st.clientName)) patch.clientName = p.company;
      if (p.course && (fresh || !st.eventName)) patch.eventName = p.course;
      if (Object.keys(patch).length) g.PhotoProject.set(patch);
    } catch (e) {}
  }

  function receipts(host) {
    var r = R.active();
    if (!r) { host.innerHTML = needReport('영수증은 결과보고서 안에 들어갑니다'); bindNeed(host); return; }
    var p = projectOf(r);
    if (p) PJ.setActive(p.id);

    embed(host, g.Receipt,
      p ? '여기서 처리하는 증빙은 <b>' + esc(PJ.name(p)) + '</b> 로 기록되어 정산에 자동으로 잡힙니다.'
        : '프로젝트가 연결되지 않아 정산에 자동으로 잡히지 않습니다.',
      function (rep) {
        var rec = R.receiptsOf(rep.projectId);
        rep.receipts = { count: rec.count, total: rec.total, at: Date.now() };
        R.update(rep.id, {});
        U.toast(rec.count ? '영수증 ' + rec.count + '건 · ' + n(rec.total) + '원을 기록했습니다' : '이 프로젝트로 처리한 영수증이 없습니다',
          rec.count ? 'ok' : 'err');
      });
  }

  /* ── 내보내기 ─────────────────────────────────────── */

  /* 파일 이름 — [KMA]고객사명_교육과정이름_결과보고서
     받는 쪽 메일함에서 이 이름만 보고도 무슨 건인지 알아야 한다.
     이어 둔 프로젝트가 없어도 보고서에 적어 둔 이름으로 만들어진다. */
  function fileBase(p, r) {
    r = r || R.active();
    var safe = function (s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '').trim(); };
    var co = safe(R.companyOf(r, p));
    var course = safe(R.courseNameOf(r, p));
    /* 둘 다 비면 예전처럼 프로젝트 이름이라도 쓴다 */
    if (!co && !course && p) co = safe(PJ.name(p));
    var head = '[KMA]' + (co || '');
    return [head, course, '결과보고서'].filter(Boolean).join('_');
  }
  function download(text, name, mime) {
    var blob = new Blob(['﻿' + text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 6000);
  }

  function settleCsv(r, p) {
    var s = R.settle(r, p);
    var rows = [['구분', '항목', '산출', '계정', '계획', '실제', '차액']];
    s.groups.forEach(function (gr) {
      gr.rows.forEach(function (x) {
        rows.push([gr.name, x.name, x.detail, x.account, x.plan, x.actual, x.diff]);
      });
      rows.push([gr.name + ' 소계', '', '', '', gr.plan, gr.actual, gr.actual - gr.plan]);
    });
    rows.push([]);
    rows.push(['원가 합계', '', '', '', s.planCost, s.actualCost, s.actualCost - s.planCost]);
    rows.push(['제안가(공급가)', '', '', '', '', s.price, '']);
    rows.push(['사업이익', '', '', '', s.planProfit, s.actualProfit, '']);
    rows.push(['사업이익률', '', '', '', pct(s.planMargin), pct(s.actualMargin), '']);
    return rows.map(function (r2) {
      return r2.map(function (c) {
        var v = String(c === undefined || c === null ? '' : c);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');
  }

  function surveyCsv(sv) {
    var rows = [['문항', '평균', '척도', '5점환산', '응답수', '긍정응답률']];
    sv.questions.forEach(function (q) {
      rows.push([q.label, q.avg, q.scale, q.to5, q.n || '', q.topRate === null ? '' : pct(q.topRate)]);
    });
    if (sv.texts.length) {
      rows.push([]);
      sv.texts.forEach(function (t) {
        rows.push([t.label]);
        t.answers.forEach(function (a) { rows.push(['', a]); });
      });
    }
    return rows.map(function (r2) {
      return r2.map(function (c) {
        var v = String(c === undefined || c === null ? '' : c);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n');
  }

  function exportSheet(r, p) {
    var sv = r.survey.parsed;
    var base = fileBase(p, r);

    var rows = [
      { id: 'pptx', title: '결과보고서 (.pptx)', sub: R.outline(r, p).length + '장짜리 파워포인트 — 바로 열립니다' },
      { id: 'md', title: '결과보고서 개요 (.md)', sub: '쓰시던 양식에 붙여넣을 때' },
      { id: 'settle', title: '정산표 (.csv)', sub: '견적 항목별 계획·실제·차액' },
      { id: 'survey', title: '만족도 집계 (.csv)', sub: sv ? '문항별 평균 + 서술형 전체' : '만족도 결과가 아직 없습니다', off: !sv },
      { id: 'zip', title: '전달용 zip', sub: '보고서 + 교육사진 + 정산표를 한 폴더로' }
    ];

    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.innerHTML =
      '<div class="sheet"><div class="sheet-head"><h2 class="sheet-title">파일로 저장</h2>' +
        '<button class="icon-btn" data-close type="button">✕</button></div>' +
      '<div class="sheet-body"><div class="menu-list">' +
        rows.map(function (x) {
          return '<button class="menu-row" data-x="' + x.id + '" type="button"' + (x.off ? ' disabled' : '') + '>' +
            '<span class="mr-icon">' + U.icon('download', 19) + '</span>' +
            '<span class="mr-body"><b>' + esc(x.title) + '</b><span>' + esc(x.sub) + '</span></span>' +
            '<span class="mr-arrow">' + U.icon('chevron', 17) + '</span></button>';
        }).join('') +
      '</div></div></div>';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });
    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target === host) return close();
      var b = e.target.closest('[data-x]');
      if (!b) return;
      var k = b.dataset.x;
      if (k === 'pptx') {
        close();
        U.busy(true, U.withEta('파워포인트를 만드는 중…', 20), null, 'ppt');
        pptxBlob(r, p).then(function (blob) {
          U.busy(false);
          g.Zip.download(blob, base + '.pptx');
          draftNotice(r, p, base + '.pptx');
        }).catch(function (err) {
          U.busy(false);
          U.toast(err.message || 'PPT 를 만들지 못했습니다', 'err');
        });
        return;
      }
      if (k === 'md') download(R.outlineText(r, p), base + '_개요.md', 'text/markdown;charset=utf-8');
      else if (k === 'settle') download(settleCsv(r, p), base + '_정산.csv', 'text/csv;charset=utf-8');
      else if (k === 'survey') download(surveyCsv(sv), base + '_만족도.csv', 'text/csv;charset=utf-8');
      else if (k === 'zip') { close(); buildZip(r, p, base); return; }
      close();
      U.toast('저장했습니다', 'ok');
    });
  }

  /* 보고서 + 사진 (+ 정산표) 를 zip 하나로.
     opts.client 면 정산표를 빼고 담는다 — 사업이익률은 고객에게 나가면 안 된다. */
  function zipBlob(r, p, base, opts) {
    opts = opts || {};
    if (!g.Zip) return Promise.reject(new Error('zip 모듈을 찾지 못했습니다'));

    var entries = [
      { name: base + '/' + base + '_개요.md', blob: new Blob(['﻿' + R.outlineText(r, p)], { type: 'text/markdown' }) }
    ];
    if (!opts.client) {
      entries.push({ name: base + '/' + base + '_정산.csv', blob: new Blob(['﻿' + settleCsv(r, p)], { type: 'text/csv' }) });
    }
    if (r.survey.parsed) {
      entries.push({ name: base + '/' + base + '_만족도.csv', blob: new Blob(['﻿' + surveyCsv(r.survey.parsed)], { type: 'text/csv' }) });
      if (!opts.client) {
        entries.push({ name: base + '/만족도_원본.txt', blob: new Blob(['﻿' + r.survey.raw], { type: 'text/plain' }) });
      }
    }

    return photoEntries(base).then(function (extra) {
      return g.Zip.write(entries.concat(extra), {
        onProgress: function (done, total) { U.busy(true, 'zip 을 만드는 중…', total ? done / total : null); }
      }).then(function (res) {
        return { blob: res.blob, photos: extra.length };
      });
    });
  }

  function buildZip(r, p, base) {
    U.busy(true, 'zip 을 만드는 중…', 0);
    zipBlob(r, p, base).then(function (res) {
      U.busy(false);
      g.Zip.download(res.blob, base + '.zip');
      U.toast('zip 을 저장했습니다' + (res.photos ? ' (사진 ' + res.photos + '장 포함)' : ''), 'ok');
    }).catch(function (err) {
      U.busy(false);
      U.toast(err && err.message ? err.message : 'zip 을 만들지 못했습니다', 'err');
    });
  }

  /* 사진 도구에 지금 올라와 있는 사진을 그대로 담는다 */
  function photoEntries(base) {
    if (!g.PhotoProject || !g.PhotoProject.state) return Promise.resolve([]);
    var st;
    try { st = g.PhotoProject.state(); } catch (e) { return Promise.resolve([]); }
    if (!st) return Promise.resolve([]);   /* 사진 도구를 아직 한 번도 열지 않은 상태 */
    var keep = (st.photos || []).filter(function (x) { return x.status === 'keep' && x.file; });
    if (!keep.length) return Promise.resolve([]);
    return Promise.resolve(keep.map(function (x, i) {
      var ext = (x.originalName || '').split('.').pop() || 'jpg';
      return { name: base + '/교육사진/' + ('00' + (i + 1)).slice(-3) + '_' + (x.originalName || ('사진.' + ext)), blob: x.file };
    }));
  }

  g.RepViews = {
    list: list, write: write, make: make, survey: survey, settle: settle,
    photos: photos, receipts: receipts,
    templates: templates, unmountSub: unmountSub
  };
})(window);
