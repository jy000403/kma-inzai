/* views.js — 프로젝트 목록 · 프로젝트 한 건 */
(function (g) {
  'use strict';

  var P = g.Projects, U = g.UI, esc = U.esc;

  function n(v) { return Number(v || 0).toLocaleString('ko-KR'); }

  /* ── 목록 ─────────────────────────────────────────── */

  var filter = '진행중';

  /* 위 탭(진행 중·전체·완료)과 아래 칩(단계별)이 같은 값을 쓴다.
     탭은 큰 묶음, 칩은 그 안의 단계 — 둘 중 무엇을 눌렀든 지금 고른 것이 표시된다. */
  function filterId() { return filter; }
  function setFilter(id) { filter = id; }

  function list(host) {
    var items = P.list();
    var c = P.counts();

    /* 진행 중·전체는 위 탭이 맡는다. 칩에는 단계만 남긴다 — 같은 버튼이 두 줄에 있으면 헷갈린다. */
    var chips = P.STAGES.map(function (s) { return { id: s.id, label: s.label }; });

    var shown = items.filter(function (p) {
      if (filter === '전체') return true;
      if (filter === '진행중') return P.LIVE.indexOf(p.stage) !== -1;
      return p.stage === filter;
    });
    /* 연락할 날이 된 것부터 위로 올린다 */
    shown = shown.slice().sort(function (a, b) {
      var fa = P.followUpOf(a), fb = P.followUpOf(b);
      var da = fa && P.daysTo(fa.date) <= 0 ? P.daysTo(fa.date) : 9999;
      var db = fb && P.daysTo(fb.date) <= 0 ? P.daysTo(fb.date) : 9999;
      return da - db;
    });

    var due = P.dueFollowUps();

    host.innerHTML =
      '<header class="pj-head">' +
        '<span class="tr-icon project ph-ic">' + U.icon('project', 22) + '</span>' +
        '<div class="ph-text"><h2>프로젝트</h2>' +
        '<p class="pj-sub">고객사 × 과정 한 건이 프로젝트 하나입니다. 제안서부터 결과보고서까지 이 안에서 이어집니다.</p></div>' +
        '<div class="head-actions"><button class="btn primary" data-new type="button">+ 새 프로젝트</button></div>' +
      '</header>' +

      /* 아직 아무것도 없을 때 0 이 아홉 칸 늘어서 있으면 화면만 복잡해진다 */
      (items.length ? '<div class="pipe">' + chips.map(function (x) {
        var n = c[x.id] || 0;
        return '<button class="pipe-cell' + (filter === x.id ? ' on' : '') + (n ? '' : ' zero') +
          '" data-filter="' + esc(x.id) + '" type="button">' +
          '<b>' + n + '</b><span>' + esc(x.label) + '</span></button>';
      }).join('') + '</div>' : '') +

      (due.length
        ? '<div class="fu-strip"><b>오늘 연락할 곳 ' + due.length + '</b>' +
          due.slice(0, 4).map(function (x) {
            return '<span class="fu-chip">' + esc(x.company) + ' · ' + esc(x.followUp.kind) +
              ' <em>' + esc(P.dateLabel(x.followUp.date)) + '</em></span>';
          }).join('') + '</div>'
        : '') +

      (shown.length
        ? byCompany(shown)
        : '<div class="panel flat">' + U.empty(
            items.length ? '이 단계에 있는 프로젝트가 없습니다' : '아직 프로젝트가 없습니다',
            items.length ? '위에서 다른 단계를 눌러 보세요' : '새 프로젝트를 만들면 제안서·결과보고서가 여기에 묶입니다') + '</div>');

    host.addEventListener('click', function (e) {
      var f = e.target.closest('[data-filter]');
      if (f) { filter = f.dataset.filter; g.Project.render(); return; }
      if (e.target.closest('[data-new]')) { newProject(); return; }
      var dp = e.target.closest('[data-del-pj]');
      if (dp) {
        var victim = P.get(dp.dataset.delPj);
        if (victim) askDelete(victim, function () { g.Project.render(); });
        return;
      }
      var card = e.target.closest('[data-open]');
      if (card) { P.setActive(card.dataset.open); g.Project.go('detail'); }
    });
  }

  /* 고객사로 묶어 세운다.
     한 고객사에 과정이 여럿 걸리는 일이 흔한데, 한 줄 목록이면
     '이 회사 건이 몇 개였더라' 를 눈으로 훑어 세야 했다. */
  function byCompany(rows) {
    var byCo = {};
    rows.forEach(function (p) {
      var k = p.company || '고객사 미입력';
      (byCo[k] = byCo[k] || []).push(p);
    });
    /* 줄 차례는 위에서 이미 잡았다 — 그 차례가 가장 앞선 고객사부터 */
    var order = [];
    rows.forEach(function (p) {
      var k = p.company || '고객사 미입력';
      if (order.indexOf(k) === -1) order.push(k);
    });
    return '<div class="pj-cos">' + order.map(function (co) {
      return '<section class="pj-co">' +
        '<h4 class="bd-coh"><span>' + esc(co) + '</span><em>' + byCo[co].length + '건</em></h4>' +
        '<div class="pj-list">' + byCo[co].map(function (p) { return card(p, true); }).join('') + '</div>' +
      '</section>';
    }).join('') + '</div>';
  }

  function card(p, inGroup) {
    var st = P.stageOf(p.stage);
    var steps = P.progress(p);
    var done = steps.filter(function (s) { return s.done; }).length;
    var fu = P.followUpOf(p);
    var d = fu ? P.daysTo(fu.date) : null;
    /* 카드 자체가 버튼이라 그 안에 또 버튼을 넣을 수 없다.
       감싸는 칸을 하나 두고 삭제는 그 옆에 세운다 — 목록에서 바로 지울 수 있게. */
    return '<div class="pj-row">' +
      '<button class="pj-card' + (d !== null && d <= 0 ? ' due' : '') + '" data-open="' + esc(p.id) + '" type="button">' +
      /* 고객사로 묶어 놓은 자리에서는 머리에 한 번 적혔다 — 줄마다 되풀이하지 않는다 */
      (inGroup === true ? '' : '<span class="pj-eyebrow">' + esc(p.company || '고객사 미입력') + '</span>') +
      '<span class="pj-top">' +
        '<b>' + esc(p.course || '이름 없는 프로젝트') + '</b>' +
        U.badge(st.label, st.tone) +
        (fu ? U.badge(fu.kind + ' ' + P.dateLabel(fu.date), d <= 0 ? 'err' : d <= 2 ? 'warn' : 'off') : '') +
        '<span class="pj-count">' + done + '/' + steps.length + '</span>' +
      '</span>' +
      '<span class="pj-meta">' +
        [p.year ? p.year + '년' : '', p.ops.headcount ? p.ops.headcount + '명' : '',
         p.ops.sessions > 1 ? p.ops.sessions + '차수' : '', p.ops.period || '']
          .filter(Boolean).map(esc).join(' · ') +
      '</span>' +
      '<span class="pj-steps">' + steps.map(function (s) {
        return '<em class="' + (s.done ? 'on' : '') + (s.now ? ' now' : '') +
          '" title="' + esc(s.label + ' — ' + s.sub) + '">' + esc(s.label) + '</em>';
      }).join('') + '</span>' +
      '</button>' +
      '<button class="icon-btn pj-del" data-del-pj="' + esc(p.id) + '" type="button" ' +
        'title="이 프로젝트 지우기" aria-label="' + esc(P.name(p)) + ' 지우기">' +
        U.icon('trash', 17) + '</button>' +
    '</div>';
  }

  function fields() {
    return [
      { key: 'company', label: '고객사', required: true, span: 2, placeholder: '포스코인재창조원' },
      { key: 'course', label: '과정명', required: true, span: 2, placeholder: '신임팀장 팀빌딩 워크숍' },
      { key: 'year', label: '연도', type: 'number' },
      { key: 'stage', label: '단계', type: 'select', required: true,
        options: P.STAGES.map(function (s) { return { value: s.id, label: s.label }; }) },
      { key: 'headcount', label: '인원', type: 'number' },
      { key: 'days', label: '차수당 일수', type: 'number' },
      { key: 'sessions', label: '차수', type: 'number' },
      { key: 'period', label: '교육 기간', placeholder: '2026-10-15 ~ 10-16' },
      { key: 'place', label: '장소', span: 2, placeholder: '마이산 홍삼빌' },
      { key: 'person', label: '고객 담당자' },
      { key: 'rank', label: '직급' },
      { key: 'dept', label: '부서' },
      { key: 'email', label: '담당자 메일', span: 2, placeholder: 'name@company.co.kr',
        hint: '제안서·결과보고서를 아웃룩으로 보낼 때 받는 사람으로 먼저 채워집니다.' },
      { key: 'manager', label: 'KMA 담당', placeholder: '박주열' },
      { key: 'memo', label: '메모', type: 'textarea', span: 2, rows: 2 }
    ];
  }
  function flatten(p) {
    return Object.assign({}, {
      company: p.company, course: p.course, year: p.year, stage: p.stage, manager: p.manager, memo: p.memo
    }, p.ops, { person: p.client.person, rank: p.client.rank, dept: p.client.dept, email: p.client.email });
  }
  function unflatten(d) {
    return {
      company: d.company, course: d.course, year: d.year, stage: d.stage, manager: d.manager, memo: d.memo,
      ops: { headcount: d.headcount, days: d.days, sessions: d.sessions || 1, period: d.period, place: d.place },
      client: { person: d.person, rank: d.rank, dept: d.dept, email: d.email }
    };
  }

  function newProject() {
    U.form({ title: '새 프로젝트', wide: true, fields: fields(),
      values: { year: new Date().getFullYear(), stage: '제안준비', sessions: 1 } }).then(function (d) {
      if (!d) return;
      var p = P.create(unflatten(d));
      g.Project.go('detail');
      U.toast(P.name(p) + ' 프로젝트를 만들었습니다', 'ok');
    });
  }

  /* ── 한 건 ────────────────────────────────────────── */

  function detail(host) {
    var p = P.active();
    if (!p) { list(host); return; }

    var st = P.stageOf(p.stage);
    var steps = P.progress(p);
    var prop = p.proposalId && g.PropStore ? g.PropStore.get(p.proposalId) : null;
    var rep = p.reportId && g.RepStore ? g.RepStore.get(p.reportId) : null;

    host.innerHTML =
      '<div class="pj-detail">' +
        '<button class="back-link" data-back type="button">' + U.icon('chevron', 16) + ' 프로젝트 목록</button>' +

        '<header class="pj-dhead">' +
          '<div>' +
            '<span class="page-eyebrow">' + esc(p.company || '고객사 미입력') + '</span>' +
            '<h2>' + esc(p.course || '이름 없는 프로젝트') + '</h2>' +
            '<p class="pj-sub">' + esc([p.year ? p.year + '년' : '', p.ops.headcount ? p.ops.headcount + '명' : '',
              p.ops.sessions > 1 ? p.ops.sessions + '차수' : '',
              p.ops.days ? '차수당 ' + p.ops.days + '일' : '',
              p.ops.period, p.ops.place].filter(Boolean).join(' · ')) + '</p>' +
          '</div>' +
          '<div class="pj-dact">' +
            '<div class="sel-wrap small"><select data-stage aria-label="단계">' + P.STAGES.map(function (s) {
              return '<option value="' + esc(s.id) + '"' + (s.id === p.stage ? ' selected' : '') + '>' + esc(s.label) + '</option>';
            }).join('') + '</select></div>' +
            '<button class="btn" data-edit type="button">정보 수정</button>' +
            '<button class="btn ghost-danger" data-del type="button">삭제</button>' +
          '</div>' +
        '</header>' +

        nextCard(p) +

        '<div class="pj-flow">' + steps.map(function (s) {
          return '<div class="pf' + (s.done ? ' on' : '') + (s.now ? ' now' : '') + '"' +
            (s.go ? ' data-doc="' + s.go + '" role="button" tabindex="0"' : '') + '>' +
            '<span class="pf-dot">' + (s.done ? U.icon('check', 11) : '') + '</span>' +
            '<b>' + esc(s.label) + '</b><span>' + esc(s.sub) + '</span></div>';
        }).join('') + '</div>' +

        '<div class="pj-cards">' +
          docCard('proposal', '제안서', prop
            ? '작성 중 · ' + (g.PropStore.gaps(prop).length ? '빈칸 ' + g.PropStore.gaps(prop).length + '군데' : '빈칸 없음')
            : '커리큘럼을 올려 제안서를 만듭니다',
            prop ? '열기' : '만들기') +
          docCard('report', '결과보고서', rep
            ? (rep.survey.parsed ? '만족도 ' + rep.survey.parsed.n + '명 응답' : '만족도 결과가 아직 없습니다')
            : '만족도·사진·정산을 모아 보고서를 만듭니다',
            rep ? '열기' : '만들기') +
        '</div>' +

        followCard(p) +
        (prop ? budgetStrip(prop) : '') +
        (rep ? settleStrip(rep, p) : '') +

        (p.memo ? '<section class="pr-card"><h3>메모</h3><p class="pj-memo">' + esc(p.memo) + '</p></section>' : '') +
      '</div>';

    host.addEventListener('change', function (e) {
      if (e.target.closest('[data-stage]')) {
        P.update(p.id, { stage: e.target.value });
        U.toast('단계를 ' + P.stageOf(e.target.value).label + '(으)로 바꿨습니다', 'ok');
        g.Project.render();
      }
    });

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-back]')) { g.Project.go('list'); return; }
      if (e.target.closest('[data-edit]')) {
        U.form({ title: '프로젝트 정보', wide: true, fields: fields(), values: flatten(p) }).then(function (d) {
          if (!d) return;
          P.update(p.id, unflatten(d));
          g.Project.render();
        });
        return;
      }
      if (e.target.closest('[data-set-follow]')) { askFollowUp(p, function () { g.Project.render(); }); return; }
      if (e.target.closest('[data-done-follow]')) {
        P.doneFollowUp(p.id);
        g.Project.render();
        U.toast('연락한 것으로 표시했습니다', 'ok');
        return;
      }
      if (e.target.closest('[data-del]')) {
        askDelete(p, function () { g.Project.go('list'); });
        return;
      }
      var go = e.target.closest('[data-doc]');
      if (go) openDoc(p, go.dataset.doc);
    });
  }

  /* 프로젝트를 지운다.
     제안서·결과보고서가 달려 있으면 같이 사라진다는 것을 먼저 말해 준다 —
     되돌릴 수 없는 일이라, 무엇이 없어지는지 모른 채 누르게 두면 안 된다. */
  function askDelete(p, done) {
    var d = P.docsOf ? P.docsOf(p.id) : { proposal: false, report: false };
    var also = [];
    if (d.proposal) also.push('제안서');
    if (d.report) also.push('결과보고서');
    var msg = P.name(p) + ' 을(를) 지웁니다.';
    if (also.length) msg += '\n달려 있는 ' + also.join('·') + '도 함께 지워집니다.';
    msg += '\n되돌릴 수 없습니다.';

    U.confirm(msg, { title: '프로젝트를 지울까요', ok: '지우기', danger: true }).then(function (yes) {
      if (!yes) return;
      P.remove(p.id);
      if (done) done();
      U.toast('프로젝트를 지웠습니다', 'ok');
    });
  }

  /* ── 팔로우업 ─────────────────────────────────────── */

  /* 제안을 보낸 직후 부르는 창. 보내 놓고 잊는 것을 막는다. */
  function askFollowUp(p, after) {
    U.form({
      title: '다음 연락을 잡아 둘까요',
      note: '제안을 보내 놓고 잊는 일이 가장 많습니다. 날짜를 적어 두면 그날 프로젝트 목록 맨 위로 올라옵니다.',
      wide: true,
      fields: [
        { key: 'kind', label: '무엇을', type: 'select', required: true,
          options: [{ value: '연락', label: '연락 (회신 확인)' }, { value: '브리핑', label: '브리핑 미팅' }] },
        { key: 'date', label: '언제', type: 'date', required: true },
        { key: 'note', label: '메모', span: 2, placeholder: '예: 팀장님께 직접 설명 요청하심' }
      ],
      values: { kind: '연락', date: P.plusDays(7) }
    }).then(function (d) {
      if (d) {
        P.setFollowUp(p.id, d);
        U.toast(P.dateLabel(d.date) + ' 에 ' + d.kind + ' 하기로 적어 뒀습니다', 'ok');
      }
      if (after) after();
    });
  }

  function followCard(p) {
    var f = P.followUpOf(p);
    if (!f) {
      if (!P.sentOf(p, 'proposal')) return '';
      return '<section class="pr-card"><h3>다음 연락' +
        '<button class="btn tiny" data-set-follow type="button">날짜 잡기</button></h3>' +
        '<p class="pr-empty">다시 연락할 날이 정해져 있지 않습니다. 제안을 보내 놓고 잊기 쉽습니다.</p></section>';
    }
    var d = P.daysTo(f.date);
    var tone = d <= 0 ? 'bad' : d <= 2 ? 'warn' : '';
    return '<section class="pr-card"><h3>다음 연락' +
      '<button class="btn tiny" data-set-follow type="button">바꾸기</button>' +
      '<button class="btn tiny primary" data-done-follow type="button">했습니다</button></h3>' +
      '<div class="fu-row ' + tone + '">' +
        '<b>' + esc(f.kind) + '</b>' +
        '<span class="fu-date">' + esc(f.date) + '</span>' +
        '<em>' + esc(P.dateLabel(f.date)) + '</em>' +
      '</div>' +
      (f.note ? '<p class="pr-hint">' + esc(f.note) + '</p>' : '') +
    '</section>';
  }

  /* 지금 할 일 한 가지만 크게 */
  function nextCard(p) {
    var st = P.stageOf(p.stage);
    if (p.stage === '무산') {
      return '<div class="pj-next done"><b>무산된 프로젝트입니다</b>' +
        '<span>단계를 바꾸면 다시 이어서 진행할 수 있습니다.</span></div>';
    }
    var fu = P.followUpOf(p);
    var n = P.nextStep(p);
    /* 연락할 날이 됐으면 그것이 가장 급하다 */
    if (fu && P.daysTo(fu.date) <= 0) {
      var overdue = P.daysTo(fu.date) < 0;
      return '<div class="pj-next' + (overdue ? ' late' : '') + '">' +
        '<span class="pn-label">' + (overdue ? '지난 연락' : '오늘 할 일') + '</span>' +
        '<b>' + esc(fu.kind) + ' — ' + esc(P.dateLabel(fu.date)) +
          (p.client.person ? ' · ' + esc(p.client.person) : '') +
          (p.client.email ? ' (' + esc(p.client.email) + ')' : '') + '</b>' +
        '<button class="btn primary" data-done-follow type="button">했습니다</button>' +
      '</div>';
    }
    if (!n) {
      return '<div class="pj-next done"><b>이 프로젝트에서 할 일이 없습니다</b>' +
        '<span>' + esc(st.label) + ' · 제안서와 결과보고서를 모두 보냈습니다.</span></div>';
    }
    return '<div class="pj-next">' +
      '<span class="pn-label">다음 할 일</span>' +
      '<b>' + esc(n.todo) + '</b>' +
      (n.go ? '<button class="btn primary" data-doc="' + esc(n.go) + '" type="button">' +
        (n.go === 'proposal' ? '제안서 열기' : '결과보고서 열기') + '</button>' : '') +
    '</div>';
  }

  function docCard(kind, label, sub, action) {
    return '<button class="pj-doc" data-doc="' + kind + '" type="button">' +
      '<span class="pd-icon ' + kind + '">' + U.icon(kind, 20) + '</span>' +
      '<span class="pd-body"><b>' + esc(label) + '</b><span>' + esc(sub) + '</span></span>' +
      '<span class="pd-act">' + esc(action) + U.icon('chevron', 16) + '</span>' +
    '</button>';
  }

  function budgetStrip(prop) {
    var b = g.PropStore.budget(prop);
    if (!b.price && !b.cost) return '';
    return '<section class="pr-card"><h3>제안 예산 (계획)</h3>' +
      '<div class="bg-row"><span>제안가(공급가)</span><b>' + n(b.price) + '원</b></div>' +
      '<div class="bg-row"><span>원가 합계</span><b>' + n(b.cost) + '원</b></div>' +
      '<div class="bg-row ' + (b.margin >= 0.25 ? 'ok' : b.margin >= 0.15 ? 'warn' : 'bad') + '">' +
        '<span>사업이익률</span><b>' + (Math.round(b.margin * 1000) / 10) + '%</b></div>' +
    '</section>';
  }

  function settleStrip(rep, p) {
    var s = g.RepStore.settle(rep, p);
    if (!s.actualCost && !s.receiptCount) return '';
    return '<section class="pr-card"><h3>정산 (실제)</h3>' +
      '<div class="bg-row"><span>실제 원가</span><b>' + n(s.actualCost) + '원</b>' +
        '<em>계획 ' + n(s.planCost) + '</em></div>' +
      (s.price ? '<div class="bg-row ' + (s.actualMargin >= 0.25 ? 'ok' : s.actualMargin >= 0.15 ? 'warn' : 'bad') + '">' +
        '<span>실제 사업이익률</span><b>' + (Math.round(s.actualMargin * 1000) / 10) + '%</b></div>' : '') +
      (s.receiptCount ? '<p class="pr-hint">영수증 ' + s.receiptCount + '건 · ' + n(s.receiptTotal) + '원 처리</p>' : '') +
    '</section>';
  }

  /* 제안서·결과보고서로 건너뛰기 — 없으면 만들어서 연결한다 */
  function openDoc(p, kind) {
    if (kind === 'proposal') {
      var prop = p.proposalId && g.PropStore ? g.PropStore.get(p.proposalId) : null;
      if (!prop) {
        prop = g.PropStore.create({
          title: p.course || '제안서',
          client: { company: p.company, person: p.client.person, rank: p.client.rank, dept: p.client.dept, industry: '', size: '' },
          ops: { headcount: p.ops.headcount, days: p.ops.days, sessions: p.ops.sessions, place: p.ops.place, period: p.ops.period }
        });
        P.update(p.id, { proposalId: prop.id });
      } else g.PropStore.setActive(prop.id);
      /* 프로젝트에서 넘어올 때도 ① 양식부터 — 흐름의 첫 걸음에서 연다 */
      g.Shell.go('proposal', { view: 'templates' });
      return;
    }
    var rep = p.reportId && g.RepStore ? g.RepStore.get(p.reportId) : null;
    if (!rep) rep = g.RepStore.create(p.id);
    else g.RepStore.setActive(rep.id);
    g.Shell.go('report', { view: 'templates' });
  }

  g.ProjectViews = {
    list: list, detail: detail, newProject: newProject, askFollowUp: askFollowUp,
    filterId: filterId, setFilter: setFilter, askDelete: askDelete
  };
})(window);
