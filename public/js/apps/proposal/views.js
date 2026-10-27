/* views.js — 제안서 화면 (목록 / 작성 / 템플릿) */
(function (g) {
  'use strict';

  var P = g.PropStore, U = g.UI, esc = U.esc;
  var V = g.PropViews = {};
  /* 교육문의에서 제안서를 만들 때 셸이 직접 부른다 (shell.seedFromPast) */
  V.usePast = function (p, item, items, auto) { return usePast(p, item, items, auto); };
  V.takeAi = function (p, c, refs) { return takeAi(p, c, refs); };
  V.deepen = function (p, opt) { return deepen(p, opt); };
  /* 양식 전체를 넘겨 보는 창 — 결과보고서 템플릿 화면도 같이 쓴다 */
  V.seeTemplate = function (t, onPick) { return seeTemplate(t, onPick); };
  V.spread = function (list, n) { return spread(list, n); };
  /* 내려받은 뒤의 초안 안내 — 다른 곳(메일 등)에서도 같은 목록을 쓸 수 있게 */
  V.draftNotice = function (p, fileName) { return draftNotice(p, fileName); };
  /* 화면에서 [파일로 내려받기] 가 부르는 것과 같은 길 (AI 다듬기 → 채우기 → 검수·고치기) */
  V.makePptx = function (p) { return makePptx(p); };
  /* 커리큘럼을 쓴 뒤 그 커리큘럼에 맞는 강사까지 넣는다 (shell.seedCurriculum) */
  V.seedTeachers = function (p, refs) { return seedTeachers(p, refs); };

  var STATUS_TONE = { '작성중': '', '발송': 'type', '브리핑': 'warn', '수주': 'ok', '실패': 'err', '보류': 'off' };
  function money(n) { return Number(n || 0).toLocaleString('ko-KR'); }

  /* 글자 칸에서 읽은 숫자. 비어 있으면 null, '1,200' 같은 쉼표도 받아 준다.
     (숫자 칸 type=number 는 커서 자리를 되돌릴 수 없어 글자 칸으로 바꿨다) */
  function toNum(v) {
    var s = String(v == null ? '' : v).replace(/[^\d.-]/g, '').trim();
    if (s === '' || s === '-' || s === '.') return null;
    var n = Number(s);
    return isNaN(n) ? null : n;
  }
  function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }

  /* 업로드한 이미지 미리보기는 새로고침하면 사라진다 (파일 자체를 저장하지 않음) */
  var previews = {};

  /* ── 목록 (첫 화면) ───────────────────────────────── */

  var filter = '';

  /* 제안서를 안 골랐을 때 — 아무 말 없이 목록으로 튕기지 않고 여기서 길을 알려 준다 */
  function needProposal() {
    var n = P.state().proposals.length;
    var projects = g.Projects ? g.Projects.list() : [];
    return '<div class="need-report">' +
      '<b>작성할 제안서를 먼저 열어야 합니다</b>' +
      '<p>' + (n
        ? '목록에서 작업할 제안서를 고르세요. ' + n + '건 있습니다.'
        : '아직 만든 제안서가 없습니다. 프로젝트에서 시작하면 고객사·인원·차수가 채워진 채로 열립니다.') + '</p>' +
      '<div class="btn-row">' +
        (n ? '<button class="btn" data-to-list type="button">제안서 고르기</button>' : '') +
        (projects.length ? '<button class="btn" data-to-project type="button">프로젝트에서 시작</button>' : '') +
        '<button class="btn primary" data-new type="button">+ 새 제안서</button>' +
      '</div></div>';
  }

  function bindNeed(host) {
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-to-list]')) { g.Proposal.go('list'); return; }
      if (e.target.closest('[data-to-project]')) { g.Shell.go('project'); return; }
      if (e.target.closest('[data-new]')) newProposal();
    });
  }

  function newProposal() {
    U.form({ title: '새 제안서', wide: true, fields: clientFields(), values: {} }).then(function (d) {
      if (!d) return;
      P.create({ title: d.title || (d.company + ' 제안서'), templateId: d.templateId || 't_default',
        client: { company: d.company, person: d.person, rank: d.rank, dept: d.dept, industry: d.industry, size: d.size } });
      g.Proposal.go('write');
    });
  }

  function pipeline(st) {
    var counts = {};
    st.proposals.forEach(function (p) { counts[p.status] = (counts[p.status] || 0) + 1; });
    return '<div class="pipe">' +
      '<button class="pipe-cell' + (filter === '' ? ' on' : '') + '" data-filter="" type="button">' +
        '<b>' + st.proposals.length + '</b><span>전체</span></button>' +
      P.STATUSES.map(function (s) {
        var n = counts[s] || 0;
        return '<button class="pipe-cell' + (filter === s ? ' on' : '') + (n ? '' : ' zero') + '" data-filter="' + esc(s) + '" type="button">' +
          '<b>' + n + '</b><span>' + esc(s) + '</span></button>';
      }).join('') + '</div>';
  }

  V.list = function (host) {
    var st = P.state();
    var rows = filter ? st.proposals.filter(function (p) { return p.status === filter; }) : st.proposals;

    host.innerHTML =
      '<div class="view-head">' +
        '<span class="tr-icon proposal ph-ic">' + U.icon('proposal', 22) + '</span>' +
        '<div class="ph-text"><h1>어느 건을 쓸까요</h1>' +
        /* 설명은 한 줄로 끝낸다. 여기만 두 줄이면 아래 내용이 다른 화면보다 내려앉는다. */
        '<p class="sub">프로젝트를 고르면 양식 → 내용 → 보내기 차례로 이어집니다.</p></div>' +
        '<div class="head-actions">' +
          '<button class="btn" data-new type="button">빈 제안서</button>' +
          '<button class="btn primary" data-voc type="button">문의 붙여넣기</button>' +
        '</div></div>' +
      (st.proposals.length ? pipeline(st) : '') +
      (rows.length
        ? '<div class="pr-list">' + rows.map(function (p) {
            var b = P.budget(p);
            var gp = P.gaps(p).length;
            /* 목록에서 바로 지울 수 있어야 한다.
               전에는 제안서를 연 다음에야 삭제 버튼이 나와서, 지우려고 여는 일이 생겼다. */
            /* 어느 건인지는 '프로젝트' 가 말해 준다. 제안서 제목만 굵게 두면
               같은 이름이 여럿일 때 무엇이 무엇인지 알 수 없다. */
            var pj = g.Projects ? g.Projects.byProposal(p.id) : null;
            return '<div class="pr-item">' +
              '<button class="pr-open" data-open="' + p.id + '" type="button">' +
                '<span class="pr-body"><b>' + esc(pj ? g.Projects.name(pj) : (p.title || '(제목 없음)')) + '</b>' +
                  '<span class="pr-meta">' + (pj ? esc(p.title || '제안서') + ' · ' : '') +
                    esc(p.client.company || '고객사 미입력') +
                    (p.client.industry ? ' · ' + esc(p.client.industry) : '') +
                    (p.ops.headcount ? ' · ' + p.ops.headcount + '명' : '') +
                    (b.price ? ' · 제안가 ' + money(b.price) + '원' : '') +
                    (b.price && b.cost ? ' · 이익률 ' + pct(b.margin) : '') + '</span></span>' +
                U.badge(p.status, STATUS_TONE[p.status] || '') +
                (gp ? '<span class="pr-gap">빈칸 ' + gp + '</span>' : '<span class="pr-ok">완성</span>') +
                '<span class="pr-at">' + esc(p.updatedAt.slice(0, 10)) + '</span>' +
              '</button>' +
              '<button class="icon-btn pr-del" data-del="' + p.id + '" type="button" ' +
                'title="이 제안서 삭제" aria-label="' + esc(p.title || '제안서') + ' 삭제">' +
                U.icon('trash', 17) + '</button>' +
            '</div>';
          }).join('') + '</div>'
        : st.proposals.length
          ? U.empty(filter + ' 상태인 제안서가 없습니다', '위에서 다른 상태를 골라 보세요')
          : U.empty('아직 제안서가 없습니다', '프로젝트를 열어 제안서 카드를 누르면 고객사·인원이 채워진 채로 시작됩니다'));

    host.addEventListener('click', function (e) {
      var fl = e.target.closest('[data-filter]');
      if (fl) { filter = fl.dataset.filter; g.Proposal.render(); return; }
      var dl = e.target.closest('[data-del]');
      if (dl) {
        var victim = P.get(dl.dataset.del);
        if (!victim) return;
        U.confirm('"' + (victim.title || '제목 없음') + '" 제안서를 지웁니다. 되돌릴 수 없습니다.',
          { title: '제안서를 지울까요', ok: '지우기', danger: true }
        ).then(function (yes) {
          if (!yes) return;
          P.remove(victim.id);
          g.Proposal.render();
          U.toast('제안서를 지웠습니다', 'ok');
        });
        return;
      }
      if (e.target.closest('[data-voc]')) {
        V.pasteVoc(function () { g.Proposal.go('templates'); });
        return;
      }
      var op = e.target.closest('[data-open]');
      if (op) {
        P.setActive(op.dataset.open);
        var picked = P.get(op.dataset.open);
        g.Proposal.go(picked && picked.templatePicked ? 'write' : 'templates');
        return;
      }
      if (e.target.closest('[data-new]')) { newProposal(); return; }
    });
  };

  function clientFields() {
    return [
      { key: 'company', label: '고객사', type: 'text', required: true },
      { key: 'title', label: '제안서 제목', type: 'text', placeholder: '비우면 "○○ 제안서"' },
      { key: 'person', label: '담당자', type: 'text' },
      { key: 'rank', label: '직급', type: 'text' },
      { key: 'dept', label: '부서', type: 'text' },
      { key: 'industry', label: '업종', type: 'select', options: P.INDUSTRIES },
      { key: 'size', label: '규모', type: 'select', options: P.SIZES },
      { key: 'templateId', label: '템플릿', type: 'select',
        options: P.templates().map(function (t) { return { value: t.id, label: t.name }; }) }
    ];
  }

  /* ── 작성 ─────────────────────────────────────────── */

  V.write = function (host) {
    var p = P.active();
    if (!p) { host.innerHTML = needProposal(); bindNeed(host); return; }
    var gaps = P.gaps(p);
    var b = P.budget(p);

    host.innerHTML =
      projBar(p) +
      '<div class="view-head">' +
        '<div><h1>' + esc(p.title) + '</h1>' +
          '<p class="sub">' + esc(p.client.company || '고객사 미입력') +
            (p.client.industry ? ' · ' + esc(p.client.industry) : '') +
            (p.client.size ? ' · ' + esc(p.client.size) : '') + '</p></div>' +
        '<div class="head-actions">' +
          '<div class="sel-wrap small"><select data-status aria-label="상태">' + P.STATUSES.map(function (s) {
            return '<option' + (s === p.status ? ' selected' : '') + '>' + s + '</option>';
          }).join('') + '</select></div>' +
          '<button class="btn" data-edit-client type="button">고객사</button>' +
          '<button class="btn ghost-danger" data-del type="button">삭제</button>' +
        '</div></div>' +

      writeStep(p, gaps, b);

    bindWrite(host, p);

    /* ③ 보내기에서 '채우러 가기' 로 넘어온 경우 — 그 칸을 짚어 준다 */
    if (pendingGoto) {
      var want = pendingGoto;
      pendingGoto = '';
      setTimeout(function () { spotCard(host, want); }, 60);
    }
  };

  var pendingGoto = '';

  /* data-holds 에 그 항목을 담고 있는 카드로 스크롤하고 한 번 반짝인다 */
  function spotCard(host, want) {
    if (!want) return;
    var card = null;
    U.$$('[data-holds]', host).forEach(function (el) {
      if (card) return;
      if ((el.dataset.holds || '').split(/\s+/).indexOf(want) !== -1) card = el;
    });
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
    var field = card.querySelector('textarea, input:not([type=checkbox]), select');
    if (field) setTimeout(function () { try { field.focus({ preventScroll: true }); } catch (x) {} }, 320);
  }

  /* ③ 보내기 — 만들어서 내려받거나 메일로 부친다 */
  V.make = function (host) {
    var p = P.active();
    if (!p) { host.innerHTML = needProposal(); bindNeed(host); return; }
    host.innerHTML = projBar(p) + makeStep(p);
    bindWrite(host, p);
  };

  /* ── 지금 어느 건을 만지고 있는지 ──────────────────
     탭만 '제안서' 라고 떠 있으면 어느 고객사의 어떤 건인지 알 수 없다.
     화면마다 위에 프로젝트를 세워 두고, 거기서 다른 건으로 옮겨 간다. */
  /* 프로젝트 띠의 단추들. 띠는 ①템플릿·②내용·③보내기 세 화면에 다 뜨는데
     처리는 ② 내용에만 달려 있어서, 템플릿 화면에서 '다른 건' 을 눌러도
     아무 일도 안 일어났다. 한 곳에 모아 두고 세 화면이 같이 쓴다.
     처리했으면 true 를 돌려 준다 — 부르는 쪽이 거기서 멈추게. */
  function hitProjBar(e, p) {
    if (e.target.closest('[data-switch]')) { g.Proposal.go('list'); return true; }
    if (e.target.closest('[data-to-project]')) {
      var pj = (g.Projects && p) ? g.Projects.byProposal(p.id) : null;
      if (pj) { g.Projects.setActive(pj.id); g.Shell.go('project'); }
      else U.toast('아직 이어 둔 프로젝트가 없습니다', '');
      return true;
    }
    if (e.target.closest('[data-to-report]')) {
      var pr = (g.Projects && p) ? g.Projects.byProposal(p.id) : null;
      if (pr && pr.reportId && g.RepStore) {
        g.RepStore.setActive(pr.reportId);
        g.Shell.go('report', { view: 'write' });
      } else U.toast('아직 결과보고서가 없습니다', '');
      return true;
    }
    return false;
  }

  function projBar(p) {
    var pj = g.Projects ? g.Projects.byProposal(p.id) : null;
    var name = pj ? g.Projects.name(pj) : (p.client.company ? '[' + p.client.company + '] ' + (p.title || '제안서') : (p.title || '제목 없는 제안서'));
    var rep = pj && pj.reportId && g.RepStore ? g.RepStore.get(pj.reportId) : null;
    return '<div class="projbar">' +
      '<span class="pb-icon">' + U.icon('project', 17) + '</span>' +
      '<div class="pb-text"><b>' + esc(name) + '</b>' +
        '<span>' + esc(p.title || '제안서') + ' · ' + esc(p.status) +
          (pj && pj.ops.headcount ? ' · ' + pj.ops.headcount + '명' : '') + '</span></div>' +
      '<div class="pb-act">' +
        '<button class="btn tiny" data-switch type="button">다른 건</button>' +
        (rep ? '<button class="btn tiny" data-to-report type="button">결과보고서</button>' : '') +
        (pj ? '<button class="btn tiny" data-to-project type="button">프로젝트</button>' : '') +
      '</div></div>';
  }

  /* ── ① 양식 고르기 ────────────────────────────────
     이름만 늘어놓으면 무엇을 고르는지 알 수 없다. 표지를 크게 보여 주고,
     안쪽 장은 띠로 살짝 흘려 둔 다음 '디자인 보기' 로 전부 넘겨 볼 수 있게 한다. */
  function pickTemplateStep(p) {
    /* 수주로 이어진 템플릿을 위로 올린다. 기록이 아직 없으면 순서를 건드리지 않는다 —
       근거 없이 '추천' 을 붙이면 고르는 사람을 속이는 셈이다. */
    var r = P.rankedTemplates();
    var list = r.list, stats = r.stats;
    return '<section class="pr-card wstage">' +
      '<h3>어떤 템플릿으로 만들까요</h3>' +
      '<p class="pr-hint">표지만 보고 고르기 어려우면 <b>디자인 보기</b>로 안쪽 장까지 넘겨 보세요. ' +
        '회사 PPT 템플릿을 올려 두면 그 디자인 그대로 나옵니다. ' +
        '고르면 <b>② 내용</b>으로 넘어갑니다.' +
        (r.ranked
          ? ' <b>수주로 이어진 템플릿이 위에 섭니다.</b>'
          : ' 수주 기록이 쌓이면 잘 되는 템플릿을 위로 올려 드립니다.') + '</p>' +
      '<div class="tpl-grid">' + list.map(function (t, idx) {
        var st = stats[t.id];
        var slides = t.slides || [];
        var cover = slides[0];
        var shots = slides.filter(function (s) { return s.thumb; });
        var strip = spread(shots.slice(1), 4);
        var on = (t.id === p.templateId && p.templatePicked);
        return '<div class="tpl-tile' + (on ? ' on' : '') + '">' +
          '<button class="tt-pick" data-pick-tpl="' + esc(t.id) + '" type="button">' +
            /* 그림이 없는 기본 구성은 빈 회색 판 대신 장 제목을 늘어놓는다.
               표지 자리를 아이콘 하나로 때우면 만들다 만 것처럼 보이고, 무엇이 들어 있는지도 알 수 없다. */
            '<span class="tt-thumb' + (cover && cover.thumb ? '' : ' tt-outline') + '">' +
              (cover && cover.thumb
                ? '<img src="' + esc(cover.thumb) + '" alt="양식 그림 없음 — 다시 올려 주세요" loading="lazy">'
                : '<span class="tt-toc">' + slides.slice(0, 7).map(function (s, i) {
                    return '<span><em>' + (i + 1) + '</em>' + esc(s.title || '') + '</span>';
                  }).join('') + (slides.length > 7 ? '<span class="tt-toc-more">+' + (slides.length - 7) + '장</span>' : '') +
                  '</span>') +
              (on ? '<span class="tt-on">' + U.icon('check', 14) + '</span>' : '') +
            '</span>' +
            '<span class="tt-body"><b>' + esc(t.name) + '</b>' +
              '<span>' + slides.length + '장' +
                (t.kind === 'pptx' ? '' : ' · 회사 디자인 없이 기본 모양으로') + '</span>' +
              /* 숫자는 본 것만 적는다. 아직 결판난 건이 없으면 '몇 건 써 봤는지' 까지만. */
              (st && st.used
                ? '<span class="tt-win' + (st.rate !== null && st.rate >= 0.5 ? ' good' : '') + '">' +
                    (st.rate !== null
                      ? '수주 ' + st.won + '/' + (st.won + st.lost) +
                        ' · ' + Math.round(st.rate * 100) + '%'
                      : '쓴 건 ' + st.used + '건 · 아직 결과 없음') +
                    (st.waiting ? ' · 진행 ' + st.waiting : '') +
                  '</span>'
                : '') +
            '</span>' +
          '</button>' +
          (r.ranked && idx === 0 && st && st.won ? '<span class="tt-top">추천</span>' : '') +
          (strip.length
            ? '<div class="tt-strip">' + strip.map(function (s) {
                return '<img src="' + esc(s.thumb) + '" alt="양식 그림 없음 — 다시 올려 주세요" loading="lazy">';
              }).join('') +
              (slides.length > 5 ? '<span class="tt-more">+' + (slides.length - 5) + '</span>' : '') +
            '</div>'
            : '') +
          /* 단추는 한 줄에 모은다.
             '디자인 보기' 만 따로 한 줄을 차지하고 있었는데, 맛보기 띠와
             아래 줄 사이에 끼어 어느 쪽에 붙은 단추인지 알기 어려웠다. */
          (shots.length || t.kind === 'pptx'
            ? '<div class="tt-foot">' +
                (shots.length
                  ? '<button class="btn tiny tt-see" data-see-tpl="' + esc(t.id) + '" type="button">디자인 보기</button>' +
                    '<button class="btn tiny primary tt-fix" data-fix-tpl="' + esc(t.id) + '" type="button">그림 다시 올리기</button>'
                  : '') +
                (t.kind === 'pptx'
                  ? '<button class="btn tiny" data-open-tpl="' + esc(t.id) + '" type="button">' +
                      '장마다 채울 내용 정하기</button>' +
                    /* 지우는 길은 템플릿 자리에 있어야 한다.
                       전에는 펼친 상세 안에만 있어서, 지우려고 먼저 펼쳐야 했다. */
                    /* 모든 PC 기본 양식은 여기서 지우지 않는다 — 펼쳐서 '해제' 한 뒤에 */
                    (t.pinned ? '' :
                    '<button class="icon-btn tiny tt-del" data-del-tpl="' + esc(t.id) + '" ' +
                      'title="이 템플릿 지우기" aria-label="' + esc(t.name) + ' 지우기" type="button">' +
                      U.icon('trash', 16) + '</button>')
                  : '') +
              '</div>'
            : '') +
          (t.pinned ? U.badge('모든 PC 기본', 'ok') :
            t.kind === 'pptx' ? U.badge('PPT 템플릿', 'type') : U.badge('템플릿 없이', 'off')) +
        '</div>';
      }).join('') + '</div></section>';
  }

  /* 목록에서 고르게 n 장을 집는다.
     앞에서 몇 장 자르면 목차·간지만 걸려 흰 칸처럼 보인다. 양식 전체에 퍼뜨린다. */
  function spread(list, n) {
    if (list.length <= n) return list;
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(list[Math.round(i * (list.length - 1) / (n - 1))]);
    }
    return out;
  }

  /* 양식 전체를 넘겨 보는 창 — 좌우 화살표·키보드·아래 썸네일 줄 모두 된다 */
  /* id 대신 양식 한 벌을 통째로 받아도 된다 — 결과보고서 템플릿 화면도 이 창을 쓴다 */
  function seeTemplate(id, onPick) {
    var t = (id && typeof id === 'object') ? id : P.template(id);
    var slides = (t && t.slides) || [];
    if (!slides.length) { U.toast('미리 볼 장이 없습니다', 'err'); return; }
    var at = 0;

    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.innerHTML =
      '<div class="sheet wide tpl-see">' +
        '<div class="sheet-head"><h2 class="sheet-title">' + esc(t.name) + '</h2>' +
          '<span class="tsee-count"></span>' +
          '<button class="icon-btn" data-no type="button">✕</button></div>' +
        '<div class="sheet-body">' +
          '<div class="tsee-stage">' +
            '<button class="tsee-nav prev" data-prev type="button" aria-label="이전 장">' + U.icon('chevron', 20) + '</button>' +
            '<img class="tsee-img" alt="이 장의 그림을 찾을 수 없습니다. 양식을 다시 올려 주세요.">' +
            '<button class="tsee-nav next" data-next type="button" aria-label="다음 장">' + U.icon('chevron', 20) + '</button>' +
          '</div>' +
          '<p class="tsee-cap"></p>' +
          '<div class="tsee-rail">' + slides.map(function (s, i) {
            return '<button class="tsee-th" data-at="' + i + '" type="button">' +
              (s.thumb ? '<img src="' + esc(s.thumb) + '" alt="양식 그림 없음 — 다시 올려 주세요" loading="lazy">' : '<span class="tsee-blank"></span>') +
              '<em>' + (i + 1) + '</em></button>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="sheet-foot"><button class="btn big ghost" data-no type="button">닫기</button>' +
          '<button class="btn big primary" data-use type="button">이 양식으로 쓰기</button></div>' +
      '</div>';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });

    var img = host.querySelector('.tsee-img');
    var cap = host.querySelector('.tsee-cap');
    var cnt = host.querySelector('.tsee-count');
    var ths = U.$$('.tsee-th', host);

    /* 큰 그림은 올릴 때 안 만든다 — 장마다 두 번씩 뽑느라 몇 분씩 걸렸다.
       여기서 그 장만 만들어 달라고 한다. 만드는 동안은 작은 그림으로 버틴다. */
    var asked = {};
    function needFull(no) {
      if (!t.fileId || !no || asked[no]) return;
      asked[no] = true;
      fetch('/api/ppt/full', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: t.fileId, slides: [no] })
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) return;
          /* 지금 보고 있는 장이면 큰 그림으로 갈아 끼운다 */
          var s = slides[at];
          if (s && s.no === no && s.full) img.src = s.full + '?v=' + Date.now();
        })
        .catch(function () {});
    }

    function show(i) {
      at = Math.max(0, Math.min(slides.length - 1, i));
      var s = slides[at];
      /* 큰 것이 아직 없으면 작은 것으로 먼저 띄우고, 뒤에서 만들어 갈아 끼운다. */
      img.src = s.full || s.thumb || '';
      img.style.visibility = (s.full || s.thumb) ? '' : 'hidden';
      img.onerror = function () {
        img.onerror = null;
        if (s.thumb) img.src = s.thumb;
        needFull(s.no);
      };
      needFull(s.no);
      cap.textContent = (at + 1) + '. ' + (s.title || '');
      cnt.textContent = (at + 1) + ' / ' + slides.length;
      ths.forEach(function (b, k) { b.classList.toggle('on', k === at); });
      if (ths[at]) ths[at].scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    show(0);

    function close() {
      host.classList.remove('in');
      document.removeEventListener('keydown', key);
      setTimeout(function () { host.remove(); }, 180);
    }
    function key(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') show(at + 1);
      else if (e.key === 'ArrowLeft') show(at - 1);
    }
    document.addEventListener('keydown', key);

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-no]') || e.target === host) return close();
      if (e.target.closest('[data-prev]')) return show(at - 1);
      if (e.target.closest('[data-next]')) return show(at + 1);
      var th = e.target.closest('[data-at]');
      if (th) return show(Number(th.dataset.at));
      if (e.target.closest('[data-use]')) { close(); if (onPick) onPick(t.id); }
    });
  }

  /* 문의한 것과 제안한 것이 어긋나는 데를 짚는다.
     빈칸 경고만으로는 안 잡힌다 — 칸은 다 찼는데 내용이 딴 과정인 경우가 있다.
     지난 제안서를 통째로 가져오면 특히 그렇다. */
  /* 어긋난 곳은 알려 주는 데서 끝내지 않는다.
     '이런 문제가 있습니다' 만 띄우면 받는 쪽에서는 '그래서 어쩌라고' 가 된다.
     고칠 수 있는 것에는 고치는 단추를 붙인다 — 누르면 AI 가 그 자리를 고친다. */
  var FIXLABEL = { topic: '빠진 주제 넣기', hours: '시간 맞추기',
                   room: '양식에 맞게 줄이기', price: '제안가를 견적에 맞추기' };

  function fitBox(p) {
    var bad = P.misfits(p);
    if (!bad.length) return '';
    var heavy = bad.some(function (x) { return x.bad; });
    var can = bad.filter(function (x) { return x.fix; });
    return '<div class="fit-box' + (heavy ? ' heavy' : '') + '">' +
      '<div class="fit-head"><b>' + (heavy ? '문의한 내용과 어긋납니다' : '한 번 확인해 주세요') + '</b>' +
        (can.length > 1
          ? '<button class="btn tiny primary" data-fix="all" type="button">' +
            can.length + '곳 한 번에 고치기</button>'
          : '') +
      '</div>' +
      '<ul>' + bad.map(function (x, i) {
        return '<li class="fit-li">' +
          '<button class="fit-row" data-goto="' + esc(x.at) + '" type="button">' +
            '<span class="fit-what">' + esc(x.text) + '</span>' +
            '<span class="fit-why">' + esc(x.why) + '</span>' +
            U.icon('chevron', 13) + '</button>' +
          (x.fix
            ? '<button class="btn tiny fit-fix" data-fix="' + i + '" type="button">' +
              esc(FIXLABEL[x.fix] || '고치기') + '</button>'
            : '') +
        '</li>';
      }).join('') + '</ul>' +
      (can.length
        ? '<p class="fit-hint">고치기를 누르면 AI 가 그 자리만 다시 씁니다. ' +
          '고친 뒤에는 바뀐 내용을 한 번 읽어 봐 주세요.</p>'
        : '') +
      '</div>';
  }

  /* ── 어긋난 곳 고치기 ────────────────────────────────
     경고마다 고치는 방법이 다르다.
       topic·hours — 커리큘럼을 다시 짠다 (모듈 제목·시간·내용이 바뀐다)
       room        — 긴 글을 양식 칸에 맞게 줄인다 (뜻은 그대로)
       price       — 숫자를 맞춘다. 이건 AI 를 부를 일이 아니다. */
  function runFix(p, which) {
    var bad = P.misfits(p);
    var list = which === 'all'
      ? bad.filter(function (x) { return x.fix; })
      : [bad[Number(which)]].filter(function (x) { return x && x.fix; });
    if (!list.length) return;

    /* 숫자만 맞추면 되는 것은 여기서 끝낸다 */
    var rest = [];
    var done = 0;
    list.forEach(function (x) {
      if (x.fix !== 'price') { rest.push(x); return; }
      /* 제안가를 원가 합계로 깎지 않는다 — 견적 단가를 제안가에 맞춘다 */
      if (g.QuoteStore) { g.QuoteStore.ensure(p); g.QuoteStore.fit(p); }
      done++;
    });
    if (done && !rest.length) {
      P.update(p.id, {});
      g.Proposal.render();
      U.toast('견적 단가를 제안가에 맞췄습니다', 'ok');
      return;
    }
    if (done) P.update(p.id, {});

    /* 커리큘럼을 건드리는 것(topic·hours)은 한 번만 부른다 — 두 번 부르면
       앞에서 고친 것을 뒤에서 되돌린다. */
    var order = [];
    var curr = rest.filter(function (x) { return x.fix === 'topic' || x.fix === 'hours'; });
    if (curr.length) order.push(curr[0]);
    rest.forEach(function (x) { if (x.fix === 'room') order.push(x); });
    if (!order.length) { g.Proposal.render(); return; }

    var at = 0;
    function step() {
      if (at >= order.length) {
        P.update(p.id, {});
        g.Proposal.render();
        U.busy(false);
        var left = P.misfits(p).filter(function (x) { return x.fix; }).length;
        U.toast(left ? '고쳤습니다 — 아직 ' + left + '곳 남았습니다' : '어긋난 곳을 모두 고쳤습니다', 'ok');
        return;
      }
      var x = order[at++];
      /* 예상 시간을 달아 진행 막대가 차게 한다 — 커리큘럼을 다시 짜는 일(주제·시간)은 1분 남짓 */
      var BUSY = { topic: ['빠진 주제를 넣는 중…', 75], hours: ['시간을 맞추는 중…', 75],
                   room: ['양식에 맞게 줄이는 중…', 40] };
      var bz = BUSY[x.fix] || ['고치는 중…', 45];
      U.busy(true, U.withEta(bz[0], bz[1]), null, 'ai');
      fetch('/api/ai/fix', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
          kind: x.fix,
          inquiry: p.context.inquiry, title: p.title,
          hours: Number(p.ops.hours) || 0,
          sessions: Number(p.ops.sessions) || 1,
          headcount: Number(p.ops.headcount) || 0,
          names: [p.client.company, p.client.person].filter(Boolean),
          caps: P.caps(p),
          modules: (p.approach.modules || []).map(function (m) {
            return { title: m.title, hours: m.hours, detail: m.detail || '' };
          })
        }, {
          missing: x.missing, want: x.want, now: x.now,
          fields: x.fields, longMods: x.longMods, modRoom: x.modRoom
        }))
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || d.error) throw new Error((d && d.message) || '고치지 못했습니다');
        takeFix(p, d);
        step();
      }).catch(function (e) {
        U.busy(false);
        U.toast(e instanceof TypeError ? '서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요'
                                       : (e.message || '고치지 못했습니다'), 'err');
        g.Proposal.render();
      });
    }
    step();
  }

  /* 고쳐 온 것을 제안서에 넣는다 */
  function takeFix(p, d) {
    if ((d.modules || []).length) {
      p.approach.modules = d.modules.map(function (m) {
        return {
          title: restoreName(p, m.title), hours: Number(m.hours) || null,
          detail: restoreName(p, m.detail || ''),
          keywords: (m.keywords || []).map(function (x) { return restoreName(p, x); }),
          goals: (m.goals || []).map(function (x) { return restoreName(p, x); }),
          group: restoreName(p, m.group || '')
        };
      });
      /* 커리큘럼 원문도 같이 갈아 둬야 어긋남 검사가 옛 글을 보지 않는다 */
      P.setCurriculum(p, {
        fileName: (p.title || '제안서') + ' (어긋난 곳을 고침)', kind: 'ai',
        covered: (p.curriculum && p.curriculum.covered) || [],
        lines: d.modules.map(function (m) {
          return m.title + (m.hours ? ' (' + m.hours + '시간)' : '') +
                 (m.detail ? ' — ' + m.detail : '');
        }),
        tables: [[['모듈', '시간', '내용']].concat(d.modules.map(function (m) {
          return [m.title, (m.hours ? m.hours + 'H' : '-'), m.detail || ''];
        }))],
        attachmentId: null
      });
      var h = P.courseHours(p);
      if (h) p.ops.hours = p.ops.hours || h;
    }
    (d.fields || []).forEach(function (f) {
      var t = restoreName(p, String(f.text || '').trim());
      if (!t) return;
      if (f.key === 'situation') p.context.situation = t;
      else if (f.key === 'problem') p.context.problem = t;
      else if (f.key === 'direction') p.approach.direction = t;
      else if (f.key === 'ops') p.approach.method = t;
      else if (f.key === 'outcome') p.outcome.changes = t;
    });
    (d.details || []).forEach(function (x) {
      var i = Number(x.at);
      var m = (p.approach.modules || [])[i];
      if (m && x.text) m.detail = restoreName(p, x.text);
    });
  }

  /* ── 문의 글로 커리큘럼을 새로 쓴다 ────────────────────
     지난 제안서 가져오기는 초안을 빨리 세우지만 이 문의에 맞지는 않는다.
     여기서는 비슷한 제안서 몇 건을 참고자료로만 주고, 요청한 시간·차수·대상에
     맞는 커리큘럼을 새로 받는다.
     회사명·사람 이름·이메일은 relay 가 지우고 보낸다. */
  function askAi(p, opt) {
    var refs = [];
    if (past && past.items) {
      var tagText = (p.tags || []).join(' ');
      refs = P.matchPast([tagText, p.title, p.context.inquiry].filter(Boolean).join(' '),
                         past.items, 3).map(function (h) { return h.item; });
    }
    U.busy(true, U.withEta('커리큘럼을 쓰는 중…', 75), null, 'ai');
    fetch('/api/ai/curriculum', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inquiry: p.context.inquiry,
        title: p.title,
        hours: Number(p.ops.hours) || 0,
        sessions: Number(p.ops.sessions) || 1,
        headcount: Number(p.ops.headcount) || 0,
        /* 지울 이름을 relay 에 알려 준다 — 우리 쪽이 누군지 가장 잘 안다 */
        names: [p.client.company, p.client.person, p.client.email].filter(Boolean),
        /* 고른 양식이 받아 주는 글자 수 — 칸보다 길게 쓰면 잘려 나간다 */
        caps: P.caps(p),
        refs: refs
      })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        U.busy(false);
        if (!res.ok || !res.d.curriculum) {
          U.toast((res.d && res.d.message) || '커리큘럼을 쓰지 못했습니다', 'err');
          return;
        }
        res.d.refs = refs;          /* 무엇을 참고했는지 담을 때 같이 남긴다 */
        aiSheet(p, res.d, opt);
      })
      .catch(function () {
        U.busy(false);
        U.toast('relay 에 닿지 못했습니다', 'err');
      });
  }

  /* 받은 커리큘럼을 먼저 보여 준다 — 확인하고 담는다.
     바로 덮어쓰면 뭘 받았는지 모른 채 제안서가 바뀐다. */
  function aiSheet(p, res, opt) {
    var c = res.curriculum;
    U.$$('.sheet-wrap[data-ai]').forEach(function (el) { el.remove(); });
    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.setAttribute('data-ai', '1');
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });

    var fits = !res.hoursAsked || Math.abs(res.hoursGot - res.hoursAsked) < 0.5;
    host.innerHTML = '<div class="sheet wide">' +
      '<div class="sheet-head"><h2 class="sheet-title">새로 쓴 커리큘럼</h2>' +
        '<button class="icon-btn" data-no type="button">✕</button></div>' +
      '<div class="sheet-body">' +
        '<p class="pr-hint">' + esc(c.course || '') + ' · 모듈 ' + (c.modules || []).length + '개 · ' +
          '합계 ' + res.hoursGot + '시간' +
          (res.hoursAsked ? ' (요청 ' + res.hoursAsked + '시간' +
            (fits ? '' : ' — 맞지 않습니다') + ')' : '') + '</p>' +
        '<div class="ai-mods">' + (c.modules || []).map(function (m) {
          return '<div class="ai-mod"><b>' + esc(m.title) + '</b>' +
            '<em>' + esc(String(m.hours)) + '시간</em>' +
            '<span>' + esc(m.detail || '') + '</span>' +
            /* 이 모듈이 문의 어디에 근거하는지 — 잘못 끌려온 모듈을 바로 알아챌 수 있다 */
            (m.why ? '<span class="ai-why">근거 ' + esc(m.why) + '</span>' : '') +
          '</div>';
        }).join('') + '</div>' +
        /* 제안서 글도 미리 보여 준다 — 담기 전에 말투와 분량을 볼 수 있게 */
        [['귀사의 상황', c.situation], ['지금 풀어야 할 문제', c.problem],
         ['제안 방향', c.direction], ['운영 방식', c.method],
         ['이렇게 달라집니다', c.outcome]].map(function (r) {
          if (!r[1]) return '';
          return '<div class="ai-text"><b>' + r[0] + '</b>' +
            String(r[1]).split('\n').filter(Boolean).map(function (s) {
              return '<span>' + esc(s) + '</span>';
            }).join('') + '</div>';
        }).join('') +
        (c.teacher ? '<p class="sheet-note">필요한 강사상 — ' + esc(c.teacher) + '</p>' : '') +
        ((c.covered || []).length
          ? '<p class="ai-cov">다루는 주제 ' + c.covered.map(function (t) {
              return '<em>' + esc(t) + '</em>';
            }).join('') + '</p>'
          : '') +
        (c.note ? '<p class="sheet-note">' + esc(c.note) + '</p>' : '') +
      '</div>' +
      '<div class="sheet-foot">' +
        '<button class="btn big ghost" data-no type="button">닫기</button>' +
        '<button class="btn big primary" data-take type="button">이 커리큘럼으로 채우기</button>' +
      '</div></div>';

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-no]') || e.target === host) { host.remove(); return; }
      if (!e.target.closest('[data-take]')) return;
      takeAi(p, c, res.refs);
      host.remove();
      g.Proposal.render();
      /* 모듈 구성을 새로 담았으면 세부 내용까지 이어 쓴다 — 따로 한 번 더 누르게 하지 않는다 */
      if (opt && opt.deepen) deepen(p);
      else U.toast('커리큘럼을 채웠습니다', 'ok');
    });
  }

  /* 새로 쓴 커리큘럼을 제안서에 담는다.
     사람이 확인하고 누를 때도, 교육문의에서 저절로 채울 때도 여기를 지난다. */
  /* ── 지웠던 고객사 이름을 되돌린다 ────────────────────
     개인정보를 지키려고 회사명·사람 이름을 지우고 AI 에 보낸다. 그래서 AI 는
     고객사를 모르고 '○○사' 라고 쓴다 — 그게 맞는 동작이다.
     그런데 받아서 되돌려 놓지 않아, '○○사 팀장의 코칭 이슈' 가 그대로
     고객에게 나갔다. 받은 글의 자리표시자를 진짜 이름으로 바꿔 둔다. */
  var NICK = /○{2,}사|○{2,}|◯{2,}사|◯{2,}|XX사|OO사|□{2,}/g;

  function restoreName(p, s) {
    var co = String((p.client && p.client.company) || '').trim();
    if (!s) return s;
    if (!co) return String(s).replace(NICK, '귀사');
    /* '○○사의' → '한라시멘트의' — 회사 이름에 '사' 가 붙어 있으면 겹치지 않게 */
    return String(s).replace(NICK, co);
  }

  function takeAi(p, c, refs) {
    p.approach = p.approach || {};
    p.context = p.context || {};
    p.outcome = p.outcome || { changes: '' };
    /* 키워드·학습목표는 양식의 Program Details 장 왼쪽 세로 칸에 들어간다.
       안 받아 두면 그 칸이 빈 채로 나간다. */
    p.approach.modules = (c.modules || []).map(function (m) {
      return {
        title: restoreName(p, m.title),
        hours: Number(m.hours) || null,
        detail: restoreName(p, m.detail || ''),
        keywords: (m.keywords || []).map(function (x) { return restoreName(p, x); }),
        goals: (m.goals || []).map(function (x) { return restoreName(p, x); }),
        /* 같은 묶음끼리 한 장에 실린다 — Program Details 머리 띠에 이 이름이 들어간다 */
        group: restoreName(p, m.group || '')
      };
    });
    /* 역량 체계 표(양식 4장) — 없으면 그 표가 모듈 이름으로 채워진다 */
    if ((c.values || []).length) {
      p.values = c.values.map(function (v) {
        return { value: restoreName(p, v.value), competency: restoreName(p, v.competency),
                 behavior: restoreName(p, v.behavior) };
      });
    }
    P.setCurriculum(p, {
      fileName: (c.course || p.title) + ' (문의 글로 새로 씀)',
      kind: 'ai',
      /* 모델이 '이 주제를 다룬다' 고 짚어 준 목록. 낱말이 모듈 제목에 안 보여도
         실제로는 다루는 경우가 있어(리더십 과정인데 제목마다 '리더십' 이 없듯),
         어긋남 검사가 이걸 같이 본다. */
      covered: c.covered || [],
      lines: (c.modules || []).map(function (m) {
        return m.title + (m.hours ? ' (' + m.hours + '시간)' : '') +
          (m.detail ? ' — ' + m.detail : '');
      }),
      /* 칸은 양식과 같은 세 개로 둔다. 늘릴 것은 칸이 아니라 안에 쓰는 내용이다. */
      tables: [[['모듈', '시간', '내용']].concat(
        (c.modules || []).map(function (m) {
          return [m.title, (m.hours ? m.hours + 'H' : '-'), m.detail || ''];
        }))],
      attachmentId: null
    });
    /* 줄 하나가 불렛 하나로 들어간다. 빈 줄이 섞여 있으면 양식에 빈 칸이 생긴다. */
    function tidy(s) {
      return restoreName(p, String(s || '').split('\n')
        .map(function (x) { return x.trim(); })
        .filter(Boolean).join('\n'));
    }

    /* 과정명 — 문의 제목('…교육 관련 문의', '…섭외 가능여부')을 그대로 쓰면 표지에
       문장 조각이 찍힌다. AI 가 지어 준 과정 이름을 표지·머리말에 쓴다.
       지금 제목을 함께 적어 두어, 나중에 사람이 제목을 고치면 그쪽을 따르게 한다. */
    if (c.course) p.course = { name: P.tidyCourse(restoreName(p, c.course)), forTitle: p.title };

    /* 이미 쓰신 글은 덮지 않는다. 문의 파서가 넣어 둔 값(그대로면)은 사람이 쓴 글이 아니다. */
    var auto = p.autoFilled || {};
    function mine(key, cur) {
      var s = String(cur || '').trim();
      return s && s !== String(auto[key] || '').trim();
    }
    if (!mine('situation', p.context.situation)) p.context.situation = tidy(c.situation);
    if (!mine('problem', p.context.problem)) p.context.problem = tidy(c.problem);
    if (!String(p.approach.direction || '').trim()) p.approach.direction = tidy(c.direction);
    if (!mine('method', p.approach.method)) p.approach.method = tidy(c.method);
    if (!String(p.outcome.changes || '').trim()) p.outcome.changes = tidy(c.outcome);

    /* 환경 분석 — 양식 2장(정책·시장·사회·기술)에 그대로 들어간다.
       이 값이 없으면 그 장이 통째로 빠지므로 덮어쓰기 전에 있는 것을 지킨다. */
    if (c.env && !p.env) {
      var e = c.env;
      p.env = {
        headline: restoreName(p, e.headline),
        summary: restoreName(p, e.summary),
        /* 인용은 양식이 '“[기업명]의 ⏎ …”' 로 감싸 준다.
           AI 가 '"○○사의 성과는 …"' 으로 통째로 써 오면 따옴표와 회사 이름이
           두 번씩 들어가 '“KT커머스의 / "KT커머스의 성과는 …"”' 가 된다.
           앞머리와 따옴표를 떼고 속만 남긴다. */
        quote: restoreName(p, String(e.quote || '')
          .replace(/^\s*["“”']+|["“”']+\s*$/g, '')
          .replace(/^\s*(○{2,}사|◯{2,}사|XX사|OO사)?의?\s*/, '')
          .trim()),
        identity: (e.identity || []).map(function (x) { return restoreName(p, x); }),
        factors: (e.factors || []).map(function (f) {
          return {
            axis: restoreName(p, f.axis),
            points: (f.points || []).map(function (x) {
              return { title: restoreName(p, x.title), detail: restoreName(p, x.detail) };
            })
          };
        })
      };
    }

    /* 무엇을 참고했는지 남긴다 — 나중에 '이거 어디서 나온 거지' 를 되짚을 수 있게 */
    if ((refs || []).length) {
      p.refs = refs.slice(0, 5).map(function (x) {
        return { id: x.id, name: x.name, url: x.url };
      });
    }
    /* 기획 메모와 강사상은 고객에게 나갈 글이 아니라 우리가 보고 쓰는 것이다.
       예산 메모 칸에 적어 두면 ② 내용에서 같이 보인다. */
    var memo = [];
    if (c.teacher) memo.push('필요한 강사상 — ' + c.teacher);
    if (c.note) memo.push('기획 메모 — ' + c.note);
    if (memo.length) {
      p.budget.note = (p.budget.note ? p.budget.note + '\n' : '') + memo.join('\n');
    }
    P.update(p.id, {});
  }

  /* ② 내용 — 커리큘럼부터 견적까지 한 화면에서 */
  /* ── 1차 · 2차 ───────────────────────────────────────
     문의로 제안서를 쓰면 실제로는 두 걸음이다.
       1차 — 무슨 모듈을 몇 시간씩 할지 골격을 잡는다
       2차 — 그 모듈 안을 소주제와 (이론)/(실습)/(토론) 줄로 채운다
     그런데 화면에는 긴 폼 하나뿐이라, 무엇이 이미 쓰였고 지금 뭘 해야 하는지가
     드러나지 않았다. 두 걸음을 세워 두고 지금 어디인지 짚어 준다. */
  function stageBox(p) {
    var ms = (p.approach && p.approach.modules) || [];
    var caps = P.caps(p) || {};
    var want = Number(caps.moduleDetail) || 0;
    var avg = ms.length
      ? Math.round(ms.reduce(function (a, m) {
          return a + String(m.detail || '').length;
        }, 0) / ms.length)
      : 0;
    /* 2차를 한 번 돌렸으면(지금 모듈 그대로) 끝난 것으로 본다. 글자 수만 보았더니
       양식 자리(416자)의 3/4 에 못 미친다며 AI 가 쓴 뒤에도 '세부 커리큘럼 쓰기' 가
       계속 켜져 있었다. 길이는 절반만 넘으면 된다 — 칸에 맞추는 일은 PPT 만들 때 한다. */
    var ran = !!p.detailFor && p.detailFor === moduleSig(ms);
    var thin = !ran && (want ? avg < want * 0.5 : avg < 200);
    var one = ms.length > 0;
    var two = one && !thin;

    function row(no, name, what, state, tone, act) {
      return '<div class="stg ' + tone + '">' +
        '<span class="stg-no">' + no + '</span>' +
        '<span class="stg-body"><b>' + esc(name) + '</b><span>' + esc(what) + '</span></span>' +
        '<span class="stg-state">' + esc(state) + '</span>' +
        (act || '') + '</div>';
    }

    var WHAT1 = '어떤 모듈을 몇 시간씩 할지 정합니다';
    var WHAT2 = '모듈마다 소주제와 이론·실습·토론을 적습니다';

    /* 커리큘럼을 쓰는 곳은 여기 한 곳이다. 아래 커리큘럼 카드에도 '문의 글로 다시 쓰기' 가
       있었는데, 2차 '다시 쓰기' 와 무엇이 다른지 헷갈렸다.
         커리큘럼 짜기 / 처음부터 다시 짜기 — 모듈 구성부터 쓰고 세부 내용까지 이어 쓴다
         세부 내용 쓰기 / 다시 쓰기       — 모듈은 그대로, 속만 쓴다 */
    var first = one
      ? row('1', '커리큘럼 짜기', WHAT1,
            '모듈 ' + ms.length + '개 · ' + (P.courseHours(p) || 0) + '시간', 'done',
            '<button class="btn tiny" data-redo type="button">처음부터 다시 짜기</button>')
      : row('1', '커리큘럼 짜기', WHAT1, '아직',
            'now', '<button class="btn tiny primary" data-seed type="button">커리큘럼 짜기</button>');

    var second;
    if (!one) {
      second = row('2', '세부 내용', WHAT2, '1 먼저', 'off', '');
    } else if (thin) {
      second = row('2', '세부 내용', WHAT2,
        '모듈당 ' + avg + '자', 'now',
        '<button class="btn tiny primary" data-detail type="button">세부 내용 쓰기</button>');
    } else {
      second = row('2', '세부 내용', WHAT2,
        '모듈당 ' + avg + '자', 'done',
        '<button class="btn tiny" data-detail type="button">세부 내용 다시 쓰기</button>');
    }

    return '<div class="stage-box">' + first + second +
      '<p class="stg-hint">' + (!one
        ? '<b>커리큘럼 짜기</b>를 누르면 문의 내용을 읽고 모듈 구성부터 세부 내용까지 한 번에 씁니다.'
        : thin
          ? '모듈 구성이 잡혔습니다. <b>세부 내용 쓰기</b>로 모듈마다 소주제와 실습을 채워 주세요.'
          : '모듈 구성이 문의와 맞지 않으면 <b>처음부터 다시 짜기</b>, ' +
            '구성은 괜찮고 내용만 아쉬우면 <b>세부 내용 다시 쓰기</b>를 누르세요.') +
      '</p></div>';
  }

  /* 지금 모듈 구성(제목·시간)의 표지 — 2차를 이 구성으로 돌렸는지 알아보는 데 쓴다 */
  function moduleSig(ms) {
    return (ms || []).map(function (m) { return String(m.title || '') + '/' + (m.hours || ''); }).join('|');
  }

  /* 2차 — 모듈 제목·시간·차례는 그대로 두고 속만 다시 쓴다.
     골격은 사람이 손봤을 수 있으니 두 번째 호출이 뒤집으면 안 된다. */
  /* opt.refs — 커리큘럼을 쓸 때 참고한 제안서 원문(교육문의에서 바로 이어 쓸 때는 화면 목록이 아직 없다)
     opt.done — 다 쓰면 부른다. 넘기면 성공 알림은 부른 쪽이 띄운다 */
  function deepen(p, opt) {
    opt = opt || {};
    var ms = (p.approach && p.approach.modules) || [];
    if (!ms.length) { U.toast('먼저 커리큘럼 짜기로 모듈을 만들어 주세요', 'err'); return; }

    /* 모듈마다 따로 쓰되 서버가 여섯 개씩 동시에 부른다 — 모듈 하나에 40초쯤 걸리므로
       여섯 개까지는 1분 안팎이다. 얼마나 걸릴지 미리 말해 주지 않으면
       멈춘 줄 알고 새로고침하게 된다. */
    U.busy(true, U.withEta((opt.step || '') + '세부 내용을 쓰는 중 · 모듈 ' + ms.length + '개',
                           Math.ceil(ms.length / 6) * 60), null, 'ai');

    /* 참고 자료를 2차에도 넘긴다 — 활동을 짜는 방식과 프레임워크 이름이 여기서 쓰인다 */
    var refs = opt.refs || [];
    if (!refs.length && past && past.items && (p.refs || []).length) {
      var want = {};
      p.refs.forEach(function (r) { want[r.id] = 1; });
      refs = past.items.filter(function (x) { return want[x.id]; });
    }

    fetch('/api/ai/detail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inquiry: p.context.inquiry, title: p.title,
        hours: Number(p.ops.hours) || 0,
        sessions: Number(p.ops.sessions) || 1,
        headcount: Number(p.ops.headcount) || 0,
        names: [p.client.company, p.client.person].filter(Boolean),
        caps: P.caps(p),
        refs: refs,
        modules: ms.map(function (m) {
          return { title: m.title, hours: m.hours, detail: m.detail || '',
                   keywords: m.keywords || [], goals: m.goals || [] };
        })
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      U.busy(false);
      if (!d || d.error || !(d.modules || []).length) {
        U.toast((d && d.message) || '세부 내용을 쓰지 못했습니다', 'err');
        return;
      }
      /* 제목·시간은 그대로, 속만 갈아 끼운다.
         AI 는 고객사를 모르므로 '○○사' 라고 쓴다 — 진짜 이름으로 되돌린다. */
      d.modules.forEach(function (x, i) {
        if (!ms[i]) return;
        if (x.detail) ms[i].detail = restoreName(p, x.detail);
        if ((x.keywords || []).length) {
          ms[i].keywords = x.keywords.map(function (k) { return restoreName(p, k); });
        }
        if ((x.goals || []).length) {
          ms[i].goals = x.goals.map(function (k) { return restoreName(p, k); });
        }
      });
      /* 이 모듈 구성으로 2차를 마쳤다고 적어 둔다 — 실패한 모듈이 없을 때만 */
      if (!d.failed) p.detailFor = moduleSig(ms);
      P.update(p.id, {});
      g.Proposal.render();
      if (opt.done && !d.failed) { opt.done(d); return; }
      U.toast(d.failed
        ? '모듈 ' + (d.modules.length - d.failed) + '개를 채웠습니다 — ' +
          d.failed + '개는 실패해 그대로 뒀습니다'
        : '모듈 상세를 평균 ' + d.avg + '자로 채웠습니다', d.failed ? 'warn' : 'ok');
    }).catch(function (e) {
      U.busy(false);
      U.toast(e instanceof TypeError ? '서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요'
                                     : (e.message || '쓰지 못했습니다'), 'err');
    });
  }

  function writeStep(p, gaps, b) {
    var pv = P.planView(p);
    return stageBox(p) + (gaps.length
        ? '<div class="todo-box"><b>아직 빈 곳이 ' + gaps.length + '군데 있습니다</b>' +
          '<div class="gap-chips">' + gaps.map(function (x) {
            return '<button class="gap-chip" data-goto="' + esc(x.src || '') + '" type="button">' +
              esc(x.label) + U.icon('chevron', 13) + '</button>';
          }).join('') + '</div>' +
          '<span class="gap-hint">누르면 그 칸으로 갑니다. ' +
            '안 채운 장은 <b>만들 때 빠집니다</b> — 그대로 두면 양식에 있던 예전 고객사 내용이 나가기 때문입니다.</span></div>'
        /* 다 채웠다는 알림 — 확인 표시와 몇 장이 준비됐는지만.
           ③ 보내기로 건너뛰는 단추는 두지 않는다: 아래 커리큘럼·강사·예산을 보기 전에
           다음 단계로 넘어가 버리게 된다. */
        : '<div class="ok-card">' +
            '<span class="ok-ic">' + U.icon('check', 16) + '</span>' +
            '<span class="ok-body"><b>빈칸 없이 모두 채웠어요</b>' +
              '<span>개요서 ' + (pv.made || 0) + '장에 들어갈 내용이 준비됐습니다. 아래 내용을 차례로 확인해 주세요.</span></span>' +
          '</div>') +

      /* 빈칸이 없다고 맞는 제안서가 아니다. 문의한 것과 제안한 것을 맞대 본다. */
      fitBox(p) +

      '<div class="pr-cols"><div class="pr-form">' +
        /* 실제로 나간 제안서가 먼저다 — 커리큘럼·강사·견적이 통째로 들어 있다.
           21건짜리 프로그램 목록은 그 아래에서 거든다. */
        pastCard(p) +
        /* 노션의 '제안 프로그램 21건' 카드는 걷었다.
           바로 위 '비슷한 문의에 나갔던 제안서' 가 실제로 나간 425건을 다루고,
           커리큘럼은 문의 글로 새로 쓴다. 21건짜리 이름 목록은 같은 자리에서
           같은 일을 한 번 더 묻는 꼴이라 고를 것만 늘렸다. */
        curriculumCard(p) +
        card('교육 문의 내용', '받은 문의 원문이 그대로 들어 있습니다. 통화로 더 들은 것이 있으면 이어서 적으세요.',
          ta('inquiry', '문의 원문', p.context.inquiry, '고객이 보낸 글 또는 한 말을 그대로') +
          taIf(p, 'situation', 'situation', '귀사의 상황', p.context.situation, '줄바꿈 하나가 불렛 하나입니다') +
          taIf(p, 'problem', 'problem', '지금 풀어야 할 문제', p.context.problem, ''),
          'situation problem') +
        /* 무엇을 · 어떻게 · 누가 · 얼마에 */
        moduleCard(p) + opsCard(p) + teacherCard(p) + budgetCard(p, b) +
      '</div>' +

      /* 옆에 세우는 미리보기는 '고른 양식의 장' 그대로다 —
         지금 치는 글이 몇 번째 장으로 가는지 보이게. */
      '<div class="pr-preview">' +
        '<div class="pv-head"><b>' + esc(pv.name) + '</b>' +
          (pv.warn ? U.badge('빈칸 ' + pv.warn, 'warn') : U.badge('빈칸 없음', 'ok')) +
          '<button class="btn tiny" data-step="1" type="button">템플릿 바꾸기</button></div>' +
        '<div class="pv-body">' + pv.slides.filter(function (s) { return !s.drop; }).map(function (s) {
          return '<div class="slide' + (s.warn ? ' warn' : '') + '">' +
            '<div class="sl-head"><span class="sl-no">' + s.no + '</span><b>' + esc(s.title) + '</b></div>' +
            (s.keep ? '<ul><li>양식 그대로 둡니다</li></ul>'
              : '<ul>' + (s.bullets.length
                  ? s.bullets.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('')
                  : '<li class="sl-need">' + esc(s.need || '') + '</li>') +
                (s.table ? '<li class="sl-tbl">표 ' + esc(s.table) + ' 채움</li>' : '') + '</ul>') +
          '</div>';
        }).join('') + '</div>' +
        '<div class="pv-foot">' +
          '<button class="btn primary block" data-step="4" type="button">다 채웠습니다 — 만들기</button>' +
        '</div>' +
      '</div></div>';
  }

  /* ③ 보내기 — 만드는 데서 끝내지 않는다.
     제안서는 담당자에게 가야 일이 끝난다. 아웃룩 발송이 주된 행동이고,
     파일 내려받기는 그 옆에 둔다. 보내고 나면 프로젝트에 발송 기록이 남고
     다음 연락 날짜까지 물어본다. */
  function makeStep(p) {
    var pv = P.planView(p);
    var b = P.budget(p);
    var pj = g.Projects ? g.Projects.byProposal(p.id) : null;
    var to = (pj && pj.client && pj.client.email) || '';
    var who = pj && pj.client ? [pj.client.person, pj.client.rank].filter(Boolean).join(' ') : '';
    var sent = pj && g.Projects.sentOf ? g.Projects.sentOf(pj, 'proposal') : null;

    /* 양식이 하나도 없으면 만들 것이 없다. 전에는 '0장 · 빈칸 없음' 으로
       보내기 단추가 그대로 열려서, 빈 파일이 고객에게 나갈 수 있었다. */
    if (!pv.made) {
      return '<section class="pr-card wstage">' +
        '<h3>먼저 양식을 올려 주세요</h3>' +
        '<p class="pr-hint">쓰시던 제안서 PPT 를 올리면 그 디자인 그대로 만들어 드립니다. ' +
          '양식이 없으면 만들 장이 없어 보낼 수 없습니다.</p>' +
        '<div class="btn-row"><button class="btn big primary" data-step="1" type="button">' +
          '① 템플릿으로 가기</button></div>' +
      '</section>';
    }

    /* 여기까지 온 사람에게 필요한 말은 '이 템플릿으로 이렇게 나옵니다' 가 아니라
       '다 됐으니 확인하고 보내세요' 다. 지금 어느 걸음인지부터 못 박는다.
       빈칸이 남아 있으면 '완성' 이라고 하면 안 된다 — 그건 거짓말이다. */
    var ready = !pv.warn;
    return '<section class="pr-card wstage">' +
      '<div class="mk-done' + (ready ? '' : ' hold') + '">' +
        '<b>' + (ready
          ? '제안서 초안이 완성되었습니다'
          : '제안서 초안이 거의 다 됐습니다') + '</b>' +
        '<span>' + (ready
          ? '발송 전에 내용을 한 번 확인해 주세요. 아래에서 장마다 무엇이 들어갔는지 볼 수 있습니다.'
          : '빈칸 ' + pv.warn + '군데를 채우면 완성입니다. 이대로 보내면 그 장은 빠집니다.') +
        '</span>' +
      '</div>' +
      '<div class="mk-top">' +
        '<div class="mk-sum"><b>' + esc(pv.name) + '</b>' +
          '<span>' + pv.made + '장' + (pv.dropped ? ' · 안 쓰는 장 ' + pv.dropped : '') +
            (b.price ? ' · 제안가 ' + money(b.price) + '원' : '') + '</span>' +
          (pv.warn ? U.badge('빈칸 ' + pv.warn, 'warn') : U.badge('빈칸 없음', 'ok')) + '</div>' +
        '<div class="mk-go">' +
          '<button class="btn primary big" data-mail type="button">아웃룩으로 발송</button>' +
          '<button class="btn big" data-make type="button">파일로 내려받기 (.pptx)</button>' +
        '</div>' +
        '<p class="mk-draft">자동으로 채운 <b>초안</b>입니다. 받은 뒤 파워포인트에서 확인·수정해 주세요.</p>' +
      '</div>' +

      '<p class="pr-hint">' +
        (to ? '받는 사람 <b>' + esc(who ? who + ' ' + to : to) + '</b> · ' : '<b>받는 사람이 비어 있습니다</b> — 프로젝트에서 담당자 메일을 적어 주세요. ') +
        '제안서 PPT 와 외부용 견적서가 첨부됩니다. 보내기 전에 제목·본문·첨부를 고칠 수 있습니다.' +
      '</p>' +
      (sent ? '<div class="ok-box">이미 ' + esc(sent.to || '') + ' 로 보냈습니다 — 다시 보내면 발송 기록이 갱신됩니다.</div>' : '') +

      (pv.dropped
        ? '<p class="pr-hint">내용이 없는 장은 빼고 만듭니다 — 그대로 두면 양식에 있던 예전 고객사 내용이 나가기 때문입니다.</p>'
        : '') +
      (pv.warn ? '<p class="pr-hint warn-hint">빈칸이 ' + pv.warn + '군데 있습니다. ' +
        '<button class="btn tiny" data-step="3" type="button">채우러 가기</button></p>' : '') +
      '<div class="mk-slides">' + pv.slides.map(mkSlide).join('') + '</div>' +
      '<div class="mk-more">' +
        '<button class="btn" data-export type="button">다른 파일로 저장</button>' +
        '<button class="btn" data-copy-outline type="button">개요 복사</button>' +
      '</div>' +
      '<p class="pr-hint">외부용 견적서(.xlsx) · 예산서(.csv) 는 <b>다른 파일로 저장</b>에 있습니다.</p>' +
    '</section>';
  }

  /* 빈 장은 '빨간 글씨' 로만 두지 않는다 — 무엇이 없는지, 어디서 채우는지,
     누르면 ② 내용의 그 칸으로 데려간다. */
  function mkSlide(s) {
    var body = s.drop || s.keep
      ? '<span class="ms-off">' + esc(s.label || '') + '</span>'
      : (s.bullets.length
          ? '<ul>' + s.bullets.slice(0, 5).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
            (s.bullets.length > 5 ? '<li class="ms-more">외 ' + (s.bullets.length - 5) + '줄</li>' : '') + '</ul>'
          : '<span class="ms-need">' + U.icon('alert', 13) + esc(s.need || '') +
            '<button class="btn tiny" data-need="' + esc(s.needAt || '') + '" type="button">' +
              esc(s.needHow || '채우러 가기') + '</button></span>') +
        (s.table ? '<span class="ms-tbl">표 ' + esc(s.table) + ' 채움</span>' : '');
    return '<div class="mslide' + (s.drop ? ' off' : '') + (s.warn ? ' warn' : '') + '">' +
      '<div class="ms-thumb' + (s.thumb ? '' : ' tt-outline') + '">' +
        (s.thumb ? '<img src="' + esc(s.thumb) + '" alt="" loading="lazy">' : '') +
        '<span class="ms-no">' + s.no + '</span></div>' +
      '<div class="ms-body"><b>' + esc(s.title) + '</b>' +
        (s.label && !s.drop && !s.keep ? '<span class="ms-src">' + esc(s.label) + '</span>' : '') +
        body + '</div>' +
    '</div>';
  }

  function card(title, hint, body, holds) {
    return '<section class="pr-card"' + (holds ? ' data-holds="' + esc(holds) + '"' : '') + '>' +
      '<h3>' + esc(title) + '</h3>' +
      (hint ? '<p class="pr-hint">' + esc(hint) + '</p>' : '') + body + '</section>';
  }
  function ta(key, label, val, hint) {
    return '<div class="pr-field"><label>' + esc(label) + '</label>' +
      '<textarea data-f="' + key + '" rows="3" placeholder="' + esc(hint || '') + '">' + esc(val) + '</textarea></div>';
  }

  /* 고른 양식이 실제로 쓰는 칸만 보여 준다.
     양식에 없는 장을 채우게 하면 어디에 들어가는지 알 수 없는 입력칸이 된다.
     이미 써 둔 글이 있으면 숨기지 않는다 — 양식을 바꿨다고 글이 사라지면 안 된다. */
  function taIf(p, src, key, label, val, hint) {
    var t = P.template(p.templateId);
    var used = (t && t.slides || []).some(function (s) { return s.src === src; });
    return (used || String(val || '').trim()) ? ta(key, label, val, hint) : '';
  }

  /* ── 커리큘럼 업로드 ──────────────────────────────── */

  function curriculumCard(p) {
    var canAi = String(p.context.inquiry || '').trim().length >= 20;
    /* '문의 글로 새로 쓰기' 는 제목줄 오른쪽 끝에 두지 않는다 — 거기 두니 정작 다루는
       커리큘럼 줄(모듈 다시 만들기·제거)과 멀리 떨어져 어디에 붙은 단추인지 애매했다.
       커리큘럼이 있으면 그 줄의 단추들 옆에, 없으면 파일 올리는 칸 바로 아래에 둔다. */
    return '<section class="pr-card" data-holds="curriculum"><h3>커리큘럼</h3>' +
      /* '비슷한 걸 가져와 고쳐 주는 건가?' 라는 물음이 자주 나온다. 아니다 —
         **새로 쓴다.** 비슷한 제안서는 틀이 아니라 재료로만 넘긴다.
         그 차이를 여기서 분명히 적어 둔다. */
      '<p class="pr-hint">' + (canAi
        ? '커리큘럼은 위의 <b>커리큘럼 짜기</b>로 문의 내용에 맞춰 새로 쓰거나, 쓰시던 커리큘럼 파일을 여기에 올리면 됩니다. ' +
          '비슷한 지난 제안서는 모듈을 나누는 방식만 참고합니다.'
        : '올린 커리큘럼은 개요서의 <b>커리큘럼</b> 슬라이드에 그대로 들어가고, 모듈 후보로도 뽑힙니다.') +
      '</p>' +
      /* 무엇을 재료로 썼는지 — 나중에 '이거 어디서 나온 거지' 를 되짚을 수 있게 */
      ((p.refs || []).length
        ? '<p class="cur-refs">재료로 넘긴 제안서 ' + p.refs.map(function (r) {
            return r.url
              ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' +
                esc(r.name.slice(0, 22)) + '</a>'
              : '<em>' + esc(r.name.slice(0, 22)) + '</em>';
          }).join(' · ') + '<span class="cur-refs-why">(구성만 참고)</span></p>'
        : '') +
      curriculumBody(p) + '</section>';
  }

  function curriculumBody(p) {
    var c = p.curriculum;
    var body;
    var canAi = String(p.context.inquiry || '').trim().length >= 20;

    if (!c) {
      body = '<div class="cur-drop" id="cur-drop">' +
        '<input type="file" id="cur-file" hidden accept=".pptx,.docx,.xlsx,.pdf,.txt,.md,.csv,image/*">' +
        '<p><b>커리큘럼 파일을 올리세요</b></p>' +
        '<p class="sub">끌어다 놓거나 <button class="link" id="cur-pick" type="button">클릭해서 선택</button></p>' +
        '<p class="cur-note">PPTX · DOCX · XLSX · PDF 는 글자를 뽑아 모듈로 만들어 줍니다. ' +
          'PNG·JPG 는 글자를 읽을 수 없어 옆에 띄워 두고 보면서 입력하는 용도입니다.</p>' +
      '</div>';
    } else {
      var prev = previews[p.id];
      /* AI 가 쓴 것과 사람이 올린 파일은 다른 물건이다.
         'AI · 4줄 추출' 이라고만 적혀 있으면 무엇에서 뽑았다는 건지,
         '모듈 다시 뽑기' 가 무엇을 다시 한다는 건지 알 수 없다. */
      var mine = c.kind === 'ai';
      var made = (p.approach.modules || []).length;
      body =
        '<div class="cur-file">' +
          '<span class="cur-kind">' + esc(mine ? 'AI' : (c.kind || '').toUpperCase()) + '</span>' +
          '<b>' + esc(c.fileName) + '</b>' +
          '<span class="sub">' + (c.imageOnly
            ? '이미지 — 글자 추출 불가'
            : mine
              ? '문의 내용으로 씀 · 모듈 ' + made + '개'
              : (c.lines || []).length + '줄 읽음 · 모듈 ' + made + '개') + '</span>' +
          '<span class="spacer"></span>' +
          '<button class="btn tiny" data-cur-remodule type="button" ' +
            'title="이 글을 다시 읽어 모듈 목록(제목·시간·내용)을 새로 만듭니다">' +
            (mine ? '모듈 다시 만들기' : '모듈 다시 뽑기') + '</button>' +
          '<button class="btn tiny ghost-danger" data-cur-clear type="button">제거</button>' +
        '</div>' +
        (c.lowConfidence ? '<p class="acct-why">글자가 제대로 안 읽혔을 수 있습니다. 스캔한 PDF 라면 PPTX·DOCX 로 다시 받아 보세요.</p>' : '') +
        (c.imageOnly
          ? (prev
              ? '<div class="cur-img"><img src="' + esc(prev) + '" alt="커리큘럼"></div>'
              : '<p class="pr-empty">이미지 미리보기는 새로고침하면 사라집니다. 파일을 다시 올려 주세요.</p>')
          : '<details class="cur-raw"><summary>원문 ' + (c.lines || []).length + '줄 보기</summary>' +
            '<pre>' + esc((c.lines || []).join('\n')) + '</pre></details>');
    }
    return body;
  }

  function handleCurriculumFile(p, file) {
    U.busy(true, '파일에서 글자를 뽑는 중…');
    g.Office.read(file).then(function (res) {
      U.busy(false);
      var cur = {
        fileName: file.name, kind: res.kind, lines: res.lines || [],
        /* 표를 읽어 놓고 여기서 빠뜨리면 아래에서 '표가 없다'고 판단해
           74줄을 늘어놓고 고르라는 옛 화면으로 가 버린다. */
        tables: res.tables || [],
        slides: res.slides || [], imageOnly: !!res.imageOnly, lowConfidence: !!res.lowConfidence
      };
      if (res.imageOnly) {
        if (previews[p.id]) URL.revokeObjectURL(previews[p.id]);
        previews[p.id] = URL.createObjectURL(file);
      }
      P.setCurriculum(p, cur);
      g.Proposal.render();

      if (res.imageOnly) {
        U.toast('이미지는 글자를 읽을 수 없습니다. 옆에 띄워 두고 입력하세요', 'err');
        return;
      }
      if (!cur.lines.length) { U.toast('글자를 찾지 못했습니다', 'err'); return; }

      /* 커리큘럼이 이미 표로 왔으면 사람이 줄을 고를 이유가 없다.
         양식의 표가 어떤 열을 원하는지 알고, 커리큘럼 표가 무엇을 담고 있는지도 아니까
         그대로 이어 붙이면 된다. 읽은 결과만 보여 주고 끝낸다. */
      var n = P.modulesFromCurriculum(p);
      if (n) {
        P.update(p.id, {});
        g.Proposal.render();
        showCurriculumRead(p, n);
        return;
      }

      /* 표가 아니면 그때는 줄에서 골라야 한다 */
      offerModules(p, cur.lines);
    }).catch(function (err) {
      U.busy(false);
      U.toast(err.message || '파일을 읽지 못했습니다', 'err');
    });
  }

  /* 표로 들어온 커리큘럼을 어떻게 읽었는지 보여 준다.
     고르라고 묻지 않는다 — 표는 이미 무엇이 무엇인지 말하고 있다.
     사람이 할 일은 '맞게 읽었는지' 확인하는 것뿐이다. */
  function showCurriculumRead(p, n) {
    var g2 = P.curriculumGrid(p);
    if (!g2) { U.toast(n + '개 과목을 읽었습니다', 'ok'); return; }

    var tplTable = curriculumTargetHeaders(p);
    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.innerHTML =
      '<div class="sheet wide">' +
        '<div class="sheet-head"><h2 class="sheet-title">커리큘럼을 이렇게 읽었습니다</h2>' +
          '<button class="icon-btn" data-no type="button">✕</button></div>' +
        '<div class="sheet-body">' +
          '<p class="sheet-note ok">표로 된 커리큘럼이라 <b>' + n + '개 과목</b>을 그대로 옮겼습니다.' +
            (tplTable ? ' 양식의 <b>' + esc(tplTable.join(' · ')) + '</b> 표에 들어갑니다.' : '') + '</p>' +
          '<div class="cur-map"><table class="grid"><thead><tr>' +
            g2.heads.map(function (h, i) {
              var m = g2.meanings[i];
              return '<th>' + esc(h) + (m ? '' : '<em>안 씀</em>') + '</th>';
            }).join('') + '</tr></thead><tbody>' +
            g2.body.slice(0, 8).map(function (r) {
              return '<tr>' + g2.heads.map(function (_, i) {
                return '<td>' + esc(String(r[i] || '').slice(0, 60)) + '</td>';
              }).join('') + '</tr>';
            }).join('') + '</tbody></table>' +
            (g2.body.length > 8 ? '<p class="voc-miss">아래로 ' + (g2.body.length - 8) + '줄 더 있습니다.</p>' : '') +
          '</div>' +
        '</div>' +
        '<div class="sheet-foot">' +
          '<button class="btn big ghost" data-pick type="button">직접 고를래요</button>' +
          '<button class="btn big primary" data-no type="button">좋습니다</button></div>' +
      '</div>';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });

    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-pick]')) {
        close();
        setTimeout(function () { offerModules(p, (p.curriculum && p.curriculum.lines) || []); }, 200);
        return;
      }
      if (e.target.closest('[data-no]') || e.target === host) close();
    });
  }

  /* 지금 고른 양식에서 커리큘럼이 들어갈 표의 머리글 */
  function curriculumTargetHeaders(p) {
    var t = P.template(p.templateId);
    var found = null;
    ((t && t.slides) || []).forEach(function (s) {
      (s.tables || []).forEach(function (tb) {
        if (found) return;
        var h = (tb.headers || []).map(function (x) { return String(x).replace(/\s/g, ''); });
        if (h.some(function (x) { return /모듈명|과목명|교과목/.test(x); })) found = tb.headers;
      });
    });
    return found;
  }

  /* 커리큘럼 파일에서 모듈을 뽑아 보여 준다. ('모듈'은 회사 제안서 양식의 표 머리글이 쓰는 말)
     예전에는 시간 표시가 없는 문서에서도 모든 줄을 모듈이라 우기며
     40개를 전부 체크해 띄우고 '기존 모듈은 교체됩니다' 라고만 적었다.
     무엇을 어떻게 읽었는지, 지금 있는 것이 어떻게 되는지를 그대로 말한다. */
  function offerModules(p, lines) {
    var cands = g.Office.toModules(lines);
    if (!cands.length) { U.toast('커리큘럼에서 모듈을 찾지 못했습니다. 원문을 보고 직접 넣어 주세요', 'err'); return; }

    /* 시간표에서 제대로 잘렸는지, 아니면 그냥 문서의 줄을 늘어놓은 것인지 */
    var timed = cands.some(function (m) { return m.strong; });
    var have = (p.approach.modules || []).length;

    var note = timed
      ? '시간표에서 모듈 <b>' + cands.length + '개</b>를 찾았습니다. 뺄 것만 체크를 푸세요.'
      : '이 파일에는 <b>09:00–10:30</b> 이나 <b>2시간</b> 같은 시간 표시가 없어서 ' +
        '모듈을 자동으로 나누지 못했습니다. 아래는 커리큘럼 <b>' + cands.length + '줄</b>을 ' +
        '그대로 늘어놓은 것입니다. 모듈에 해당하는 줄만 골라 주세요.';

    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.innerHTML =
      '<div class="sheet wide"><div class="sheet-head">' +
        '<h2 class="sheet-title">커리큘럼에서 찾은 모듈</h2>' +
        '<button class="icon-btn" data-no type="button">✕</button></div>' +
      '<div class="sheet-body">' +
        '<p class="sheet-note' + (timed ? '' : ' warn') + '">' + note + '</p>' +
        '<div class="cand-tools">' +
          '<button class="btn tiny" data-all type="button">전체 선택</button>' +
          '<button class="btn tiny" data-none type="button">전체 해제</button>' +
          '<span class="cand-count"></span>' +
        '</div>' +
        '<div class="cand-list">' + cands.map(function (m, i) {
          return '<label class="cand"><input type="checkbox" data-c="' + i + '"' + (m.strong ? ' checked' : '') + '>' +
            '<span class="cd-title">' + esc(m.title) + '</span>' +
            (m.hours ? '<span class="cd-h">' + m.hours + '시간</span>' : '') +
            (m.detail ? '<span class="cd-d">' + esc(m.detail) + '</span>' : '') + '</label>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="sheet-foot">' +
        '<button class="btn big ghost" data-no type="button">안 넣기</button>' +
        (have
          ? '<button class="btn big" data-add type="button">지금 ' + have + '개 뒤에 붙이기</button>' +
            '<button class="btn big primary" data-replace type="button">지금 ' + have + '개를 지우고 넣기</button>'
          : '<button class="btn big primary" data-replace type="button">과정 설계에 넣기</button>') +
      '</div></div>';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });

    var boxes = U.$$('[data-c]', host);
    var countEl = host.querySelector('.cand-count');
    function picked() {
      return boxes.filter(function (c) { return c.checked; })
        .map(function (c) { return cands[Number(c.dataset.c)]; })
        .map(function (m) { return { title: m.title, hours: m.hours, detail: m.detail || '' }; });
    }
    function refresh() {
      var n = boxes.filter(function (c) { return c.checked; }).length;
      countEl.textContent = n + ' / ' + boxes.length + '개 선택';
      U.$$('[data-add],[data-replace]', host).forEach(function (b) { b.disabled = !n; });
    }
    refresh();
    host.addEventListener('change', function (e) { if (e.target.closest('[data-c]')) refresh(); });

    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-no]') || e.target === host) return close();
      if (e.target.closest('[data-all]')) { boxes.forEach(function (c) { c.checked = true; }); return refresh(); }
      if (e.target.closest('[data-none]')) { boxes.forEach(function (c) { c.checked = false; }); return refresh(); }

      var add = e.target.closest('[data-add]');
      if (!add && !e.target.closest('[data-replace]')) return;

      var got = picked();
      if (!got.length) return;
      p.approach.modules = add ? (p.approach.modules || []).concat(got) : got;
      P.update(p.id, {});
      close();
      g.Proposal.render();
      U.toast(got.length + '개 모듈을 ' + (add ? '붙였습니다' : '넣었습니다'), 'ok');
    });
  }

  function moduleCard(p) {
    var ms = p.approach.modules || [];
    var total = ms.reduce(function (a, m) { return a + (Number(m.hours) || 0); }, 0);
    return '<section class="pr-card" data-holds="modules direction outcome"><h3>과정 설계' +
      (total ? ' <span class="pr-total">' + total + '시간</span>' : '') +
      ' <button class="btn tiny" data-add-module type="button">+ 모듈</button></h3>' +
      /* 예전에는 '제안 골격' 이라는 별도 칸에 있었다.
         어떻게 가르쳐서 무엇이 달라지는지는 과정 설계와 같이 봐야 해서 여기로 옮겼다. */
      taIf(p, 'direction', 'direction', '이 과정을 어떻게 풀어 가는지', p.approach.direction,
         '예) 사례 중심 토의로 진행하고 마지막 날 팀별 실행계획을 발표합니다') +
      (ms.length
        ? '<ul class="mod-list">' + ms.map(function (m, i) {
            return '<li><span class="mod-n">' + (i + 1) + '</span>' +
              '<span class="mod-b"><b>' + esc(m.title) + '</b>' + (m.detail ? '<em>' + esc(m.detail) + '</em>' : '') + '</span>' +
              (m.hours ? '<span class="mod-h">' + esc(m.hours) + '시간</span>' : '') +
              '<button class="btn tiny" data-edit-module="' + i + '" type="button">수정</button>' +
              '<button class="btn tiny ghost-danger" data-del-module="' + i + '" type="button">삭제</button></li>';
          }).join('') + '</ul>'
        : '<p class="pr-empty">커리큘럼 파일을 올리거나 직접 추가하세요.</p>') +
      taIf(p, 'outcome', 'changes', '교육이 끝나면 이렇게 달라집니다', p.outcome.changes,
         '줄바꿈 하나가 불렛 하나입니다') + '</section>';
  }

  function opsCard(p) {
    return '<section class="pr-card" data-holds="ops"><h3>운영 조건</h3>' +
      '<p class="pr-hint">여기 숫자로 예산 수량이 자동 계산됩니다.</p>' +
      '<div class="pr-grid">' +
        num('headcount', '인원(명)', p.ops.headcount) + num('sessions', '차수', p.ops.sessions) +
        /* 교육은 시간 단위로 값을 매긴다. 강사료가 이 값으로 계산된다. */
        num('hours', '교육시간(H)', p.ops.hours) +
        num('days', '차수당 일수', p.ops.days) + txt('place', '장소', p.ops.place) +
        txt('period', '희망 일정', p.ops.period) + '</div>' +
      (P.courseHours(p) && Number(p.ops.hours) !== P.courseHours(p)
        ? '<p class="pr-hint warn-line">커리큘럼 모듈을 더하면 <b>' + P.courseHours(p) + '시간</b>입니다. ' +
          '<button class="link small" data-use-hours type="button">이 값으로 맞추기</button></p>'
        : '') +
      taIf(p, 'ops', 'method', '운영 방식 메모', p.approach.method,
         '예) 오전 이론 · 오후 실습, 조별 5~6명') + '</section>';
  }
  function num(key, label, val) {
    return '<div class="pr-field"><label>' + esc(label) + '</label>' +
      '<input data-o="' + key + '" type="text" inputmode="numeric" value="' + (val === null || val === undefined ? '' : val) + '"></div>';
  }
  function txt(key, label, val) {
    return '<div class="pr-field"><label>' + esc(label) + '</label>' +
      '<input data-o="' + key + '" value="' + esc(val || '') + '"></div>';
  }

  /* 추천 교수 — 고른 사람만 양식의 교수 장에 들어간다.
     한 장에 한 명이고, 고른 수보다 장이 많으면 남는 장은 만들 때 빠진다. */
  function teacherCard(p) {
    var all = P.teachers();
    var picked = p.teacherIds || [];
    var slots = teacherSlots(p);
    return '<section class="pr-card" data-holds="teachers"><h3>추천 교수' +
      (picked.length ? ' <span class="pr-total">' + picked.length + '명</span>' : '') +
      /* 손으로 한 명씩 등록만 되던 자리다. KMA 스튜디오에 480명이 이미 올라와 있으니
         거기서 이 문의에 맞는 사람을 골라 오는 길을 먼저 둔다. */
      ' <button class="btn tiny primary" data-find-teacher type="button">추천 교수진</button>' +
      ' <button class="btn tiny" data-add-teacher type="button">+ 직접 등록</button></h3>' +
      '<p class="pr-hint">' +
        (slots
          ? '이 양식에 교수 장이 <b>' + slots + '장</b> 있습니다. 고른 수만큼만 나가고 남는 장은 빠집니다.'
          : '지금 고른 양식에는 교수 장이 없습니다. 등록해 두면 다른 양식에서 쓸 수 있습니다.') +
      '</p>' +
      (all.length
        ? '<div class="tc-list">' + all.map(function (t) {
            var on = picked.indexOf(t.id) !== -1;
            return '<label class="tc' + (on ? ' on' : '') + '">' +
              '<input type="checkbox" data-pick-teacher="' + esc(t.id) + '"' + (on ? ' checked' : '') + '>' +
              '<span class="tc-body"><b>' + esc(t.name || '(이름 없음)') + '</b>' +
                '<span>' + esc([t.field, t.career].filter(Boolean).join(' · ').slice(0, 70)) + '</span></span>' +
              '<button class="btn tiny" data-edit-teacher="' + esc(t.id) + '" type="button">수정</button>' +
              '<button class="icon-btn" data-del-teacher="' + esc(t.id) + '" type="button" title="삭제">' +
                U.icon('trash', 16) + '</button>' +
            '</label>';
          }).join('') + '</div>'
        : '<p class="pr-empty">등록된 교수가 없습니다. 한 번 등록해 두면 다음 제안서에서도 골라 쓸 수 있습니다.</p>') +
    '</section>';
  }

  /* 지금 양식에 교수 장이 몇 장인지 */
  function teacherSlots(p) {
    var t = P.template(p.templateId);
    return ((t && t.slides) || []).filter(function (s) { return s.src === 'teachers'; }).length;
  }

  function editTeacher(p, id) {
    var t = id ? P.teacherById(id) : null;
    U.form({
      title: t ? '교수 수정' : '교수 등록', wide: true,
      fields: P.TEACHER_FIELDS.map(function (f) {
        return {
          key: f.key, label: f.label,
          type: (f.key === 'name') ? 'text' : 'textarea',
          required: f.key === 'name',
          span: (f.key === 'name') ? 1 : 2,
          value: t ? t[f.key] : ''
        };
      }),
      ok: t ? '저장' : '등록'
    }).then(function (v) {
      if (!v) return;
      if (t) P.updateTeacher(t.id, v);
      else {
        var made = P.addTeacher(v);
        p.teacherIds = (p.teacherIds || []).concat([made.id]);
        P.update(p.id, {});
      }
      g.Proposal.render();
    });
  }

  /* ── 추천 교수진 ──────────────────────────────────────
     KMA 스튜디오(studio.kma.or.kr)에 강사 480명이 올라와 있다. 이름·직함은
     목록 한 장에 다 있고, '무엇을 강의하나' 는 프로필마다 들어 있어서
     relay 가 한 번 읽어 teachers.json 에 모아 둔다.

     여기서는 그 주제를 문의 글과 맞대 보고 가까운 순으로 세운다.
     담으면 프로필을 한 번 더 읽어 학력·경력·저서까지 채워 넣는다 —
     제안서의 교수 장에 그대로 들어가야 하기 때문이다. */
  var roster = null;      /* null 아직 · 'asking' 읽는 중 · [] */

  function teacherSheet(p) {
    U.$$('.sheet-wrap[data-teach]').forEach(function (el) { el.remove(); });
    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.setAttribute('data-teach', '1');
    document.body.appendChild(host);
    /* '.in' 이 붙어야 덮개가 보인다 — 안 붙이면 DOM 에는 있는데 화면에 안 뜬다 */
    requestAnimationFrame(function () { host.classList.add('in'); });

    var q = '';
    var basis = [p.context.inquiry, p.title, p.approach && p.approach.direction,
      (p.approach && p.approach.modules || []).map(function (m) { return m.title; }).join(' ')]
      .filter(Boolean).join(' ');

    /* 찾는 칸은 한 번만 만들고 다시는 건드리지 않는다.
       글자 하나 칠 때마다 시트 전체를 다시 그렸더니, 한글을 조합하는 도중에
       입력칸이 통째로 새로 만들어져 'ㄱ ㅣ ㅁ' 처럼 자모가 흩어졌다.
       바뀌는 것은 결과 목록뿐이니 그 칸만 갈아 끼운다. */
    function listHtml() {
      var body;
      if (roster === 'asking') {
        return '<p class="pr-empty">스튜디오에서 강사 명단을 읽고 있습니다…</p>';
      }
      if (!roster || !roster.length) {
        return '<p class="pr-empty">강사 명단을 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>';
      }
      {
        /* 검색어를 치면 이름으로 찾고, 안 치면 문의 글에 맞는 순으로 권한다 */
        var rows;
        if (q.trim()) {
          var k = q.trim();
          rows = roster.filter(function (t) {
            return (t.name + ' ' + t.title + ' ' + (t.topics || []).join(' ')).indexOf(k) !== -1;
          }).slice(0, 30).map(function (t) { return { item: t, hits: [] }; });
        } else {
          rows = P.matchTeachers(basis, roster, 15);
        }
        body = rows.length
          ? '<div class="tc-list">' + rows.map(function (r) {
              var t = r.item;
              return '<div class="tc tc-find">' +
                '<span class="tc-body"><b>' + esc(t.name) + '</b>' +
                  '<span>' + esc([t.title, t.field].filter(Boolean).join(' · ')) + '</span>' +
                  ((t.topics || []).length
                    ? '<span class="tc-topics">' + t.topics.slice(0, 5).map(function (x) {
                        return '<em' + (r.hits && r.hits.length ? ' class="hit"' : '') + '>' + esc(x) + '</em>';
                      }).join('') + '</span>'
                    : '') +
                '</span>' +
                '<a class="btn tiny" href="https://studio.kma.or.kr/member/ai-teacher/' + esc(t.id) +
                  '" target="_blank" rel="noopener">프로필</a>' +
                '<button class="btn tiny primary" data-take="' + esc(t.id) + '" type="button">담기</button>' +
              '</div>';
            }).join('') + '</div>'
          : '<p class="pr-empty">' + (q.trim()
              ? '찾는 이름이 없습니다.'
              : '문의 글과 겹치는 주제를 가진 강사를 못 찾았습니다. 이름으로 찾아보세요.') + '</p>';
      }
      return body;
    }

    host.innerHTML = '<div class="sheet wide">' +
      '<div class="sheet-head"><h2 class="sheet-title">추천 교수진</h2>' +
        '<button class="icon-btn" data-no type="button">✕</button></div>' +
      '<div class="sheet-body">' +
        '<p class="pr-hint" data-count></p>' +
        '<div class="pr-field span2"><label>이름·주제로 찾기</label>' +
          '<input data-q placeholder="예: 리더십, 오건영"></div>' +
        '<div data-rows></div>' +
      '</div></div>';

    var rowsBox = host.querySelector('[data-rows]');
    var countBox = host.querySelector('[data-count]');

    function draw() {
      countBox.textContent = 'KMA 스튜디오에 올라온 강사 ' +
        (roster && roster.length ? roster.length + '명' : '명단') +
        ' 중에서 이 문의 글과 주제가 겹치는 순으로 세웠습니다.';
      rowsBox.innerHTML = listHtml();
    }

    draw();

    if (roster === null) {
      roster = 'asking';
      fetch('/api/teacher/list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(function (r) { return r.json(); })
        .then(function (d) { roster = (d && d.items) || []; draw(); })
        .catch(function () { roster = []; draw(); });
    }

    /* 한글은 자모를 조합하는 동안에도 input 이 계속 온다 ('ㄱ' → '기' → '김').
       그 중간 글자로 목록을 갈면 '찾는 이름이 없습니다' 가 번쩍이니,
       조합이 끝나기를 기다렸다가 고친다. */
    var box = host.querySelector('[data-q]');
    var composing = false;

    function apply() {
      if (composing) return;
      if (box.value === q) return;
      q = box.value;
      rowsBox.innerHTML = listHtml();
    }

    box.addEventListener('compositionstart', function () { composing = true; });
    box.addEventListener('compositionend', function () { composing = false; apply(); });
    box.addEventListener('input', apply);

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-no]')) { host.remove(); return; }
      var take = e.target.closest('[data-take]');
      if (!take) return;
      var id = take.dataset.take;
      take.disabled = true;
      take.textContent = '읽는 중…';
      /* 목록에는 이름·직함뿐이라 그대로 담으면 교수 장이 반쯤 빈다.
         프로필을 한 번 더 읽어 학력·경력·저서까지 채워 넣는다. */
      fetch('/api/teacher/one', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          var t = (d && d.teacher) || {};
          var made = P.addTeacher({
            name: t.name || '',
            edu: (t.edu || []).join('\n'),
            career: (t.career || []).join('\n'),
            field: t.field || t.title || '',
            books: (t.books || []).join('\n'),
            record: (t.topics || []).join(', ')
          });
          p.teacherIds = (p.teacherIds || []).concat([made.id]);
          P.update(p.id, {});
          U.toast((t.name || '교수') + ' 담았습니다');
          take.textContent = '담음';
          g.Proposal.render();
        })
        .catch(function () {
          take.disabled = false;
          take.textContent = '담기';
          U.toast('프로필을 읽지 못했습니다', 'err');
        });
    });
  }


  /* ── 예산서 ───────────────────────────────────────── */

  /* 수량이 0 으로 나오는 줄이 있으면, 무엇이 비어서 그런지 이름을 대 준다 */
  function needBasis(p, items) {
    var miss = {};
    (items || []).forEach(function (it) {
      if (it.basis === 'fixed') return;
      if (P.qty(it, p.ops)) return;
      if (it.basis === 'hours' && !Number(p.ops.hours)) miss['교육시간'] = 1;
      if ((it.basis === 'days' || it.basis === 'headday') && !Number(p.ops.days)) miss['일수'] = 1;
      if ((it.basis === 'head' || it.basis === 'headday') && !Number(p.ops.headcount)) miss['인원'] = 1;
      if (!Number(p.ops.sessions)) miss['차수'] = 1;
    });
    var names = Object.keys(miss);
    return names.length ? names.join(' · ') : '';
  }

  /* 시간당 제안가의 분모 — 교육시간 × 차수. 교육시간이 비면 0 */
  function unitHours(p) {
    var h = Number(p.ops.hours) || 0;
    return h ? h * (Number(p.ops.sessions) || 1) : 0;
  }

  function budgetCard(p, b) {
    var items = p.budget.items || [];
    var marginTone = b.price ? (b.margin < 0 ? 'bad' : b.margin < 0.15 ? 'warn' : 'ok') : '';

    /* 위쪽 버튼은 '다 쓴 뒤에 꺼내는 것'(견적서·PMS 복사)만 둔다.
       항목을 더하는 버튼은 표 바로 아래에 있어야 손이 간다. */
    return '<section class="pr-card" data-holds="budget"><h3>예산서 ' +
        '<button class="btn tiny" data-quote type="button">외부용 견적서</button>' +
        '<button class="btn tiny" data-copy-budget type="button">PMS용 복사</button></h3>' +
      '<p class="pr-hint">제안가와 원가를 넣으면 사업이익률이 계산됩니다. 계정은 증빙 도구와 같은 원가 구분 표를 씁니다. ' +
        '<b>고객에게 나갈 견적서</b>는 원가·이익률을 뺀 채 따로 뽑습니다.</p>' +

      /* 제안가와 원가를 나란히 둔다.
         전에는 원가가 카드 맨 아래에만 있어서, 제안가를 적는 동안 얼마가 남는지 알 수 없었다. */
      '<div class="bg-face">' +
        '<div class="bg-cell edit"><span>제안가 (공급가)</span>' +
          '<input data-b="price" type="text" inputmode="numeric" placeholder="0" value="' +
            (p.budget.price === null || p.budget.price === undefined ? '' : p.budget.price) + '">' +
          (unitHours(p) && b.price ? '<em>시간당 ' + money(Math.round(b.price / unitHours(p))) + '원</em>' : '') + '</div>' +
        '<div class="bg-op">−</div>' +
        '<div class="bg-cell"><span>원가 합계</span><b>' + money(b.cost) + '</b></div>' +
        '<div class="bg-op">=</div>' +
        '<div class="bg-cell ' + (marginTone || 'flat') + '"><span>사업이익</span>' +
          '<b>' + money(b.profit) + '</b>' +
          (b.price ? '<em>' + pct(b.margin) + '</em>' : '') + '</div>' +
      '</div>' +

      /* 교육 조건 — 원가 수량과 시간당 제안가가 모두 이 숫자에서 나오므로 두 구역보다 위에 둔다. */
      '<h4 class="bg-zone">교육 조건 <small>원가 수량 · 시간당 제안가 계산 기준</small></h4>' +
      /* 수량은 이 세 숫자에서 나온다.
         전에는 운영 조건 카드에만 있어서, 원가 표에 '0H · 금액 0' 이 떠 있어도
         어디를 고쳐야 0 이 풀리는지 알 수 없었다. 표 바로 위에 같이 둔다. */
      '<div class="bg-basis' + (needBasis(p, items) ? ' warn' : '') + '">' +
        '<div class="pr-field"><label>교육시간(H)</label>' +
          '<input data-o="hours" type="text" inputmode="numeric" placeholder="0" value="' +
            (p.ops.hours === null || p.ops.hours === undefined ? '' : p.ops.hours) + '"></div>' +
        '<div class="pr-field"><label>차수</label>' +
          '<input data-o="sessions" type="text" inputmode="numeric" placeholder="1" value="' +
            (p.ops.sessions === null || p.ops.sessions === undefined ? '' : p.ops.sessions) + '"></div>' +
        '<div class="pr-field"><label>인원(명)</label>' +
          '<input data-o="headcount" type="text" inputmode="numeric" placeholder="0" value="' +
            (p.ops.headcount === null || p.ops.headcount === undefined ? '' : p.ops.headcount) + '"></div>' +
        '<div class="pr-field"><label>차수당 일수</label>' +
          '<input data-o="days" type="text" inputmode="numeric" placeholder="1" value="' +
            (p.ops.days === null || p.ops.days === undefined ? '' : p.ops.days) + '"></div>' +
        (P.courseHours(p) && Number(p.ops.hours) !== P.courseHours(p)
          ? '<p class="bg-basis-hint">커리큘럼 모듈을 더하면 <b>' + P.courseHours(p) + '시간</b>입니다. ' +
            '<button class="link small" data-use-hours type="button">이 값으로 맞추기</button></p>'
          /* 칸 이름을 그대로 이어 붙이면 '교육시간 가 비어 있어' 가 된다.
             받침을 보고 이/가를 고르고, 띄어쓰기도 붙여 쓴다. */
          : needBasis(p, items)
            ? '<p class="bg-basis-hint warn-line">' + esc(needBasis(p, items)) +
              U.josa(needBasis(p, items), '이', '가') + ' 비어 있어 수량이 0 입니다.</p>'
            : '') +
      '</div>' +

      /* 제안가 구역 — 고객에게 받는 금액. 원가 표와 같은 모양(항목·단가·수량·금액)으로 두고,
         이 줄이 그대로 외부용 견적서에 나간다. 전에는 시간당 제안가 한 칸뿐이라
         원가는 항목별로 적는데 제안가는 뭉뚱그려져 두 표가 서로 맞지 않았다.
         부가세 칸은 없앴다 — KMA 는 교육비 면세기관이다. */
      priceZone(p, b, items) +
      /* 원가 구역 — 우리가 쓰는 돈. 내부용이라 고객 견적서에는 나가지 않는다. */
      '<div class="bg-zone-box cost">' +
      '<h4 class="bg-zone">원가 <small>우리가 쓰는 돈 · 내부용, 고객 견적서에는 나가지 않습니다</small></h4>' +

      (items.length
        ? '<div class="table-wrap bg-costs"><table class="grid"><thead><tr>' +
            /* 단가가 먼저, 수량이 뒤. 회사 견적서 양식이 그 차례라 읽는 눈이 그쪽에 익어 있다. */
            '<th style="width:26%">원가 항목</th><th style="width:18%">계정</th><th style="width:18%">단가</th>' +
            '<th style="width:14%">수량</th><th style="width:16%">원가 금액</th><th style="width:8%"></th></tr></thead><tbody>' +
          items.map(function (it, i) {
            /* '교육시간 × 차수' 라고만 적혀 있으면 왜 0 인지 모른다.
               지금 값을 넣어 식을 그대로 보여 준다 — 400,000 × 14H × 1차수 */
            var fixedQty = it.qtyFixed !== null && it.qtyFixed !== undefined && it.qtyFixed !== '';
            var how = it.basis === 'fixed' ? ''
              : fixedQty ? '수량을 직접 적었습니다'
              : [money(it.price || 0) + '원',
                 it.basis === 'hours' ? (Number(p.ops.hours) || 0) + 'H'
                   : it.basis === 'head' ? (Number(p.ops.headcount) || 0) + '명'
                   : it.basis === 'days' ? (Number(p.ops.days) || 0) + '일'
                   : (Number(p.ops.headcount) || 0) + '명 × ' + (Number(p.ops.days) || 0) + '일',
                 (Number(p.ops.sessions) || 0) + '차수'].join(' × ');
            return '<tr><td><b>' + esc(it.name) + '</b><div class="sub">' +
                esc(how || P.BASIS_LABEL[it.basis] || '') + '</div></td>' +
              '<td class="sub">' + esc((it.account || '').replace(/^원가?\)/, '')) + '</td>' +
              '<td><input class="q-in" data-q="' + i + ':price" type="text" inputmode="numeric" value="' + (it.price || 0) + '"></td>' +
              /* 수량은 늘 고칠 수 있다. 손으로 적으면 그 값이 이기고,
                 '자동' 을 누르면 다시 식으로 돌아간다. */
              '<td class="q-cell">' + (it.basis === 'fixed'
                ? '<input class="q-in" data-q="' + i + ':qty" type="text" inputmode="numeric" value="' + (it.qty || 1) + '">'
                : '<input class="q-in' + (fixedQty ? ' hand' : (P.qty(it, p.ops) ? '' : ' zero')) +
                    '" data-q="' + i + ':qtyFixed" type="text" inputmode="numeric" ' +
                    'value="' + (fixedQty ? it.qtyFixed : P.qty(it, p.ops)) + '">' +
                  '<span class="q-unit">' + esc(it.unit || '') + '</span>' +
                  (fixedQty
                    ? '<button class="link tiny" data-auto-qty="' + i + '" type="button">자동</button>'
                    : '')) + '</td>' +
              '<td class="q-total">' + money(P.lineTotal(it, p.ops)) + '</td>' +
              '<td class="act"><button class="btn tiny ghost-danger" data-del-cost="' + i + '" type="button">삭제</button></td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<p class="pr-empty">원가 항목을 추가하면 이익률이 계산됩니다.</p>') +

      '<div class="bg-add"><button class="btn" data-add-cost type="button">+ 원가 항목 추가</button></div>' +
      '</div>' +

      (b.price || b.cost
        ? '<div class="bg-sum">' +
            row('제안가 (공급가)', money(b.price) + '원') +
            row('원가 합계', money(b.cost) + '원', b.price ? pct(b.cost / b.price) : '') +
            row('사업이익', money(b.profit) + '원', '', marginTone) +
            row('사업이익률', pct(b.margin), '', marginTone) +
            (unitHours(p) && b.price ? row('시간당 제안가', money(Math.round(b.price / unitHours(p))) + '원', '원가 ' + money(Math.round(b.cost / unitHours(p))) + '원') : '') +
            (b.perHead ? row('1인당 제안가', money(b.perHead) + '원', '원가 ' + money(b.costPerHead) + '원') : '') +
          '</div>'
        : '') +

      (b.accounts.length
        ? '<div class="bg-acct"><b>계정별 (PMS 등록 단위)</b>' +
            b.accounts.map(function (a) {
              return '<div class="bg-arow"><span>' + esc(a.account) + '</span>' +
                '<i style="width:' + Math.round(a.ratio * 100) + '%"></i>' +
                '<b>' + money(a.amount) + '</b><em>' + pct(a.ratio) + '</em></div>';
            }).join('') + '</div>'
        : '') +

      '<div class="pr-field"><label>비고</label>' +
        '<textarea data-b="note" rows="2" placeholder="정산 조건, 별도 협의 사항 등">' + esc(p.budget.note || '') + '</textarea></div>' +
      '</section>';
  }
  /* ── 제안가 항목 ─────────────────────────────────────
     제안가 줄 = 외부용 견적서 줄(p.quote.lines). 한 곳에만 두어야 예산서와 견적서가 어긋나지 않는다.
     · 손대기 전(follow): 원가 항목을 그대로 따라가고, 단가만 제안가에 맞춰 같은 비율로 올린다.
       원가 항목을 더하거나 교육시간을 바꾸면 제안가 줄도 따라 바뀐다.
     · 제안가를 아직 안 정했으면: 원가 항목을 단가 0 으로 깔아 둔다 — 단가만 적으면 된다.
     · 한 줄이라도 손으로 고치면(hand): 그때부터 적은 그대로 두고, 제안가 = 줄 합계. */
  function handPrice(p) {
    var q = p.quote;
    return !!(q && q.lines && q.lines.length && !q.follow);
  }
  function priceRows(p) {
    var Q = g.QuoteStore;
    if (!Q) return [];
    if (handPrice(p)) return p.quote.lines;
    var costed = (p.budget.items || []).some(function (it) { return Number(it.price); });
    if (Number(p.budget.price) && costed) { Q.ensure(p); Q.seed(p); Q.fixDetails(p); return p.quote.lines; }
    var course = (p.quote && String(p.quote.courseName || '').trim()) || Q.courseLabel(p);
    return (p.budget.items || []).map(function (it) {
      var l = Q.lineFrom(it, p.ops || {}, course);
      l.unit = 0;
      return l;
    });
  }
  /* 줄을 고치기 직전에 부른다 — 지금 보이는 줄을 견적서에 박아 두고 손댄 상태로 바꾼다 */
  function holdPrice(p) {
    var Q = g.QuoteStore;
    var rows = priceRows(p);
    Q.ensure(p);
    p.quote.lines = rows;
    p.quote.follow = false;
    return rows;
  }
  /* 손으로 세운 줄의 합계가 곧 제안가 */
  function priceFromRows(p) {
    var grand = g.QuoteStore.total(p.quote).grand;
    p.budget.price = grand || null;
  }

  function priceZone(p, b, items) {
    var Q = g.QuoteStore;
    var rows = priceRows(p);
    var hand = handPrice(p);
    var target = Number(p.budget.targetMargin) || 0;
    return '<div class="bg-zone-box price">' +
      '<h4 class="bg-zone">제안가 <small>고객에게 받는 금액 · 이 항목 그대로 외부용 견적서에 나갑니다</small>' +
        '<span class="bg-free">교육비 부가세 면세</span></h4>' +
      (rows.length && Q
        ? '<div class="table-wrap bg-costs"><table class="grid"><thead><tr>' +
            '<th style="width:26%">제안 항목</th><th style="width:18%">구분</th><th style="width:18%">단가</th>' +
            '<th style="width:14%">수량</th><th style="width:16%">제안 금액</th><th style="width:8%"></th></tr></thead><tbody>' +
          rows.map(function (l, i) {
            var how = [money(l.unit || 0) + '원', (Number(l.q1) || 0) + (l.u1 || '')]
              .concat(Number(l.q2) > 1 ? [(Number(l.q2) || 0) + (l.u2 || '')] : [])
              .concat([(Number(l.sessions) || 0) + '차수']).join(' × ');
            return '<tr><td><b>' + esc(l.name || '(이름 없음)') + '</b><div class="sub">' + esc(how) + '</div></td>' +
              '<td class="sub">' + esc(l.group || '') + '</td>' +
              '<td><input class="q-in" data-pl="' + i + ':unit" type="text" inputmode="numeric" value="' + (Number(l.unit) || 0) + '"></td>' +
              '<td class="q-cell"><input class="q-in" data-pl="' + i + ':q1" type="text" inputmode="numeric" value="' + (Number(l.q1) || 0) + '">' +
                '<span class="q-unit">' + esc(l.u1 || '') + '</span></td>' +
              '<td class="q-total">' + money(Q.amount(l)) + '</td>' +
              '<td class="act"><button class="btn tiny ghost-danger" data-del-pl="' + i + '" type="button">삭제</button></td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<p class="pr-empty">원가 항목을 넣으면 같은 항목이 여기에 깔립니다. 단가만 적으면 제안가가 됩니다.</p>') +
      (!hand && b.price && rows.length && !Q.total({ lines: rows }).grand
        ? '<p class="bg-basis-hint warn-line">원가 단가가 비어 있어 제안가 ' + money(b.price) +
          '원을 항목에 나누지 못했습니다. 항목마다 제안 단가를 적어 주세요.</p>'
        : '') +
      (hand && !Q.gap(p).same
        ? '<p class="bg-basis-hint warn-line">항목 합계 ' + money(Q.total(p.quote).grand) + '원이 제안가 ' +
          money(b.price) + '원과 다릅니다. ' +
          '<button class="link small" data-sum-pl type="button">항목 합계를 제안가로</button></p>'
        : '') +
      (hand && items.length
        ? '<p class="bg-rate-hint">직접 고친 제안 항목입니다. 원가 항목이 바뀌어도 여기는 그대로 둡니다. ' +
          '<button class="link small" data-reseed-pl type="button">원가 항목대로 다시 깔기</button></p>'
        : '') +
      '<div class="bg-add"><button class="btn" data-add-pl type="button">+ 제안 항목 추가</button></div>' +
      /* 목표 이익률은 표 아래에 둔다 — 항목을 먼저 세우고, 이익률은 맞춰 보는 도구다 */
      (b.cost
        ? '<div class="bg-target">' +
            '<label>목표 이익률</label>' +
            '<input data-b="targetMargin" type="text" inputmode="numeric" value="' + target + '"><span>%</span>' +
            '<button class="btn tiny" data-apply-target type="button">이 이익률로 맞추기 · ' +
              money(b.suggested(target)) + '원</button>' +
          '</div>'
        : '') +
    '</div>';
  }

  function row(label, val, sub, tone) {
    return '<div class="bg-row' + (tone ? ' ' + tone : '') + '"><span>' + esc(label) + '</span>' +
      '<b>' + esc(val) + '</b>' + (sub ? '<em>' + esc(sub) + '</em>' : '') + '</div>';
  }

  /* ── 이벤트 ───────────────────────────────────────── */

  function bindWrite(host, p) {
    var t;

    /* 걸음 사이 이동 — 이제 걸음이 곧 상단 탭이다 */
    host.addEventListener('click', function (e) {
      var s = e.target.closest('[data-step]');
      if (s) {
        var want = Number(s.dataset.step);
        g.Proposal.go(want <= 1 ? 'templates' : want >= 4 ? 'make' : 'write');
        return;
      }
      /* 1 — 커리큘럼 짜기: 모듈 구성을 쓰고, 이어서 세부 내용까지 한 번에 */
      if (e.target.closest('[data-seed]')) {
        if (!g.Shell || !g.Shell.seedCurriculum) {
          U.toast('서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요', 'err');
          return;
        }
        g.Shell.seedCurriculum(p, function (how, from, refs) {
          g.Proposal.render();
          /* 기다림 창을 닫지 않고 세부 내용으로 이어 간다 */
          if (how === 'ai' && (p.approach.modules || []).length) deepen(p, { refs: refs || [], step: '2/2 ' });
          else U.busy(false);
        }, { chain: true });
        return;
      }
      /* 처음부터 다시 짜기 — 모듈 구성부터 새로. 결과를 먼저 보여 주고, 담으면 세부 내용까지 이어 쓴다 */
      if (e.target.closest('[data-redo]')) {
        U.confirm('문의 내용을 다시 읽고 모듈 구성부터 새로 짭니다.\n' +
          '지금 모듈과 세부 내용은 새것으로 바뀝니다. 직접 쓰신 상황·문제 글은 그대로 둡니다.',
          { title: '처음부터 다시 짤까요?', ok: '다시 짜기' }).then(function (yes) {
          if (yes) askAi(p, { deepen: true });
        });
        return;
      }
      /* 2차 — 세부 커리큘럼 */
      if (e.target.closest('[data-detail]')) { deepen(p); return; }
      /* 어긋난 곳 고치기 */
      var fx = e.target.closest('[data-fix]');
      if (fx) { runFix(p, fx.dataset.fix); return; }

      /* 프로젝트 띠 — 세 화면이 함께 쓴다 */
      if (hitProjBar(e, p)) return;
      /* 만들기 — 고른 양식 그대로 파일을 뽑는다 */
      if (e.target.closest('[data-make]')) {
        var base = fileBase(p);
        U.busy(true, U.withEta('파워포인트를 만드는 중…', 20), null, 'ppt');
        pptxBlob(p).then(function (blob) {
          U.busy(false);
          saveBlob(blob, base + '_제안서.pptx');
          draftNotice(p, base + '_제안서.pptx');
        }).catch(function (err) {
          U.busy(false);
          U.toast(err.message || 'PPT 를 만들지 못했습니다', 'err');
        });
        return;
      }
      if (e.target.closest('[data-ai-cur]')) { askAi(p); return; }
      var pst = e.target.closest('[data-past]');
      if (pst) { usePast(p, pst.dataset.past); return; }

      /* ③ 보내기의 빈 장 → ② 내용의 그 칸으로. 화면을 먼저 옮기고 나서 짚어 준다. */
      var nd = e.target.closest('[data-need]');
      if (nd) {
        pendingGoto = nd.dataset.need || '';
        g.Proposal.go('write');
        return;
      }

      /* 빈 곳 칩 → 그 칸으로 데려간다. 어디를 채워야 하는지 말만 하고 끝내지 않는다. */
      var go = e.target.closest('[data-goto]');
      if (go) {
        var want = go.dataset.goto;
        var card = null;
        U.$$('[data-holds]', host).forEach(function (el) {
          if (card) return;
          if ((el.dataset.holds || '').split(/\s+/).indexOf(want) !== -1) card = el;
        });
        if (!card) { U.toast('이 장은 양식에 있는 글을 그대로 씁니다', 'err'); return; }
        card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        card.classList.remove('flash');
        void card.offsetWidth;          /* 같은 칸을 또 눌러도 다시 반짝이게 */
        card.classList.add('flash');
        var field = card.querySelector('textarea, input:not([type=checkbox]), select');
        if (field) setTimeout(function () { try { field.focus({ preventScroll: true }); } catch (x) {} }, 320);
        return;
      }
      if (e.target.closest('[data-find-teacher]')) { teacherSheet(p); return; }
      if (e.target.closest('[data-add-teacher]')) { editTeacher(p, null); return; }
      var et = e.target.closest('[data-edit-teacher]');
      if (et) { editTeacher(p, et.dataset.editTeacher); return; }
      var dt = e.target.closest('[data-del-teacher]');
      if (dt) {
        var who = P.teacherById(dt.dataset.delTeacher);
        U.confirm('"' + ((who && who.name) || '이 교수') + '" 을 명단에서 지웁니다. 다른 제안서에서도 빠집니다.',
          { title: '교수를 지울까요', ok: '지우기', danger: true }
        ).then(function (yes) {
          if (!yes) return;
          P.removeTeacher(dt.dataset.delTeacher);
          g.Proposal.render();
        });
        return;
      }
      if (e.target.closest('[data-use-hours]')) {
        p.ops.hours = P.courseHours(p);
        P.update(p.id, {});
        g.Proposal.render();
        return;
      }
      if (e.target.closest('[data-go-templates]')) { g.Proposal.go('templates'); }
    });
    host.addEventListener('input', function (e) {
      var f = e.target.closest('[data-f]'), o = e.target.closest('[data-o]'),
          q = e.target.closest('[data-q]'), bf = e.target.closest('[data-b]'),
          pl = e.target.closest('[data-pl]');
      if (!f && !o && !q && !bf && !pl) return;
      clearTimeout(t);
      t = setTimeout(function () {
        if (f) {
          var k = f.dataset.f;
          if (k === 'inquiry' || k === 'situation' || k === 'problem') p.context[k] = f.value;
          else if (k === 'changes') p.outcome.changes = f.value;
          else p.approach[k] = f.value;
        }
        /* 숫자 칸을 글자 칸으로 바꿨다(커서가 튀지 않게). 그래서 읽을 때 숫자로 되돌린다.
           '1,200' 처럼 쉼표를 찍어도 받아 준다. */
        if (o) {
          var isNum = o.getAttribute('inputmode') === 'numeric';
          p.ops[o.dataset.o] = isNum ? toNum(o.value) : o.value;
        }
        if (q) {
          var parts = q.dataset.q.split(':');
          var it = p.budget.items[Number(parts[0])];
          if (it) {
            /* 수량 칸을 비우면 다시 자동 계산으로 돌아간다 */
            if (parts[1] === 'qtyFixed' && String(q.value).trim() === '') it.qtyFixed = null;
            else it[parts[1]] = toNum(q.value) || 0;
          }
        }
        if (bf) {
          var bk = bf.dataset.b;
          p.budget[bk] = (bf.getAttribute('inputmode') === 'numeric') ? toNum(bf.value) : bf.value;
          /* 위에서 제안가 합계를 적으면 손으로 세운 제안 항목도 같은 비율로 맞춘다
             (손대기 전이면 원가 항목을 따라 다시 깔리니 할 일이 없다) */
          if (bk === 'price' && handPrice(p) && g.QuoteStore) {
            g.QuoteStore.fit(p);
            p.quote.follow = false;
          }
        }
        /* 제안 항목의 단가·수량 — 고치는 순간 손댄 상태가 되고 제안가 = 줄 합계 */
        if (pl && g.QuoteStore) {
          var pp = pl.dataset.pl.split(':');
          var rows = holdPrice(p), ln = rows[Number(pp[0])];
          if (ln) ln[pp[1]] = toNum(pl.value) || 0;
          priceFromRows(p);
        }
        P.update(p.id, {});
        g.Proposal.render();
      }, 350);
    });

    host.addEventListener('change', function (e) {
      var pt = e.target.closest('[data-pick-teacher]');
      if (pt) {
        var id = pt.dataset.pickTeacher;
        var list = (p.teacherIds || []).filter(function (x) { return x !== id; });
        if (pt.checked) list.push(id);
        p.teacherIds = list;
        P.update(p.id, {});
        g.Proposal.render();
        return;
      }
      if (e.target.closest('[data-status]')) { P.update(p.id, { status: e.target.value }); g.Proposal.render(); return; }
      if (e.target.closest('[data-template]')) { P.update(p.id, { templateId: e.target.value }); g.Proposal.render(); return; }
      var cf = e.target.closest('#cur-file');
      if (cf && cf.files[0]) { handleCurriculumFile(p, cf.files[0]); cf.value = ''; }
    });

    /* 커리큘럼 드롭 */
    var drop = host.querySelector('#cur-drop');
    if (drop) {
      var pick = host.querySelector('#cur-pick'), input = host.querySelector('#cur-file');
      pick.addEventListener('click', function () { input.click(); });
      drop.addEventListener('click', function (e) { if (e.target === drop) input.click(); });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault(); drop.classList.remove('drag');
        if (e.dataTransfer && e.dataTransfer.files[0]) handleCurriculumFile(p, e.dataTransfer.files[0]);
      });
    }

    host.addEventListener('click', function (e) {
      var el;
      if (e.target.closest('[data-edit-client]')) {
        U.form({ title: '고객사 정보', wide: true, fields: clientFields(),
          values: Object.assign({ title: p.title, templateId: p.templateId }, p.client) }).then(function (d) {
          if (!d) return;
          P.update(p.id, { title: d.title || p.title, templateId: d.templateId || p.templateId, client: d });
          g.Proposal.render();
        });
        return;
      }
      if (e.target.closest('[data-del]')) {
        U.confirm('이 제안서를 지울까요?', { danger: true, ok: '삭제' })
          .then(function (ok) { if (ok) { P.remove(p.id); g.Proposal.go('list'); } });
        return;
      }
      if (e.target.closest('[data-copy-outline]')) return copy(P.outlineText(p), '개요서를 복사했습니다. PPT에 붙여넣으세요');
      if (e.target.closest('[data-copy-budget]')) return copy(P.budgetText(p), '예산서를 복사했습니다. PMS에 붙여넣으세요');
      if (e.target.closest('[data-export]')) return exportSheet(p);
      if (e.target.closest('[data-mail]')) return mailSheet(p);
      if (e.target.closest('[data-quote]')) {
        return g.QuoteViews.open(p, function () { P.update(p.id, {}); g.Proposal.render(); });
      }

      if (e.target.closest('[data-cur-clear]')) {
        if (previews[p.id]) { URL.revokeObjectURL(previews[p.id]); delete previews[p.id]; }
        P.clearCurriculum(p); g.Proposal.render(); return;
      }
      if (e.target.closest('[data-cur-remodule]')) {
        if (p.curriculum && (p.curriculum.lines || []).length) offerModules(p, p.curriculum.lines);
        else U.toast('뽑을 글자가 없습니다', 'err');
        return;
      }

      if (e.target.closest('[data-add-module]')) return editModule(p, -1);
      el = e.target.closest('[data-edit-module]'); if (el) return editModule(p, Number(el.dataset.editModule));
      el = e.target.closest('[data-del-module]');
      if (el) { p.approach.modules.splice(Number(el.dataset.delModule), 1); P.update(p.id, {}); g.Proposal.render(); return; }


      if (e.target.closest('[data-add-cost]')) return addCost(p);
      el = e.target.closest('[data-auto-qty]');
      if (el) {
        var ai = Number(el.dataset.autoQty);
        if (p.budget.items[ai]) p.budget.items[ai].qtyFixed = null;
        P.update(p.id, {});
        g.Proposal.render();
        return;
      }
      el = e.target.closest('[data-del-cost]');
      if (el) { p.budget.items.splice(Number(el.dataset.delCost), 1); P.update(p.id, {}); g.Proposal.render(); return; }
      if (e.target.closest('[data-apply-target]')) {
        var b = P.budget(p);
        p.budget.price = b.suggested(p.budget.targetMargin);
        /* 손으로 세운 제안 항목은 항목을 지킨 채 같은 비율로 맞춘다 */
        if (handPrice(p) && g.QuoteStore) { g.QuoteStore.fit(p); p.quote.follow = false; }
        P.update(p.id, {});
        g.Proposal.render();
        U.toast('목표 이익률에 맞춰 제안가를 넣었습니다', 'ok');
        return;
      }
      if (e.target.closest('[data-add-pl]')) return addPriceLine(p);
      el = e.target.closest('[data-del-pl]');
      if (el && g.QuoteStore) {
        var rows = holdPrice(p);
        rows.splice(Number(el.dataset.delPl), 1);
        priceFromRows(p);
        P.update(p.id, {});
        g.Proposal.render();
        return;
      }
      if (e.target.closest('[data-sum-pl]')) {
        priceFromRows(p);
        P.update(p.id, {});
        g.Proposal.render();
        return;
      }
      if (e.target.closest('[data-reseed-pl]')) {
        U.confirm('직접 고친 제안 항목을 지우고 원가 항목대로 다시 깝니다.\n단가는 지금 제안가에 맞춰 같은 비율로 올립니다.',
          { title: '제안 항목을 다시 깔까요?', ok: '다시 깔기' }).then(function (yes) {
          if (!yes) return;
          p.quote.follow = true;
          if (Number(p.budget.price)) g.QuoteStore.seed(p);
          else p.quote.lines = [];
          P.update(p.id, {});
          g.Proposal.render();
        });
        return;
      }
    });
  }

  function copy(text, msg) {
    navigator.clipboard.writeText(text)
      .then(function () { U.toast(msg, 'ok'); })
      .catch(function () { U.toast('복사에 실패했습니다', 'err'); });
  }

  /* ── 내보내기 ─────────────────────────────────────── */

  function download(text, name, mime) {
    /* 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인다 */
    var blob = new Blob(['﻿' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  function budgetCsv(p) {
    var b = P.budget(p);
    var rows = [['구분', '계정', '항목', '수량', '단가', '금액']];
    (p.budget.items || []).forEach(function (it) {
      rows.push(['원가', it.account || '', it.name, P.qty(it, p.ops), it.price || 0, P.lineTotal(it, p.ops)]);
    });
    rows.push([]);
    rows.push(['계정별 합계 (PMS 등록 단위)']);
    b.accounts.forEach(function (a) { rows.push(['원가', a.account, '', '', '', a.amount]); });
    rows.push([]);
    rows.push(['제안가(공급가)', '', '', '', '', b.price]);
    rows.push(['부가세', '', '', '', '', '면세']);
    rows.push(['원가 합계', '', '', '', '', b.cost]);
    rows.push(['사업이익', '', '', '', '', b.profit]);
    rows.push(['사업이익률', '', '', '', '', (Math.round(b.margin * 1000) / 10) + '%']);
    return rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c === undefined || c === null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }

  function exportSheet(p) {
    var base = fileBase(p);
    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.innerHTML =
      '<div class="sheet"><div class="sheet-head"><h2 class="sheet-title">파일로 저장</h2>' +
        '<button class="icon-btn" data-no type="button">✕</button></div>' +
      '<div class="sheet-body">' +
        '<p class="sheet-note">PPT 는 바로 열리는 파일로 만듭니다. 자동으로 채운 <b>초안</b>이니 받은 뒤 확인·수정해 주세요. ' +
          '회사 디자인 양식은 파워포인트에서 [디자인] → [테마]로 입히세요.</p>' +
        '<div class="menu-list">' +
          '<button class="menu-row" data-x="pptx" type="button"><span class="mr-icon">' + U.icon('proposal', 19) + '</span>' +
            '<span class="mr-body"><b>제안서 (.pptx)</b><span>' + P.outline(p).length + '장 · ' +
              (P.template(p.templateId).kind === 'pptx'
                ? esc(P.template(p.templateId).name) + ' 양식으로'
                : '기본 디자인으로') + '</span></span>' +
            '<span class="mr-arrow">' + U.icon('chevron', 17) + '</span></button>' +
          '<button class="menu-row" data-x="patch" type="button"><span class="mr-icon">' + U.icon('upload', 19) + '</span>' +
            '<span class="mr-body"><b>고친 PPT 에 바뀐 내용만 넣기</b><span>' +
              (p.lastExport
                ? '지난번 내보낸 뒤 달라진 곳 ' + P.changedSince(p).length + '군데'
                : '파워포인트에서 손본 파일을 올리면 손댄 곳은 그대로 둡니다') + '</span></span>' +
            '<span class="mr-arrow">' + U.icon('chevron', 17) + '</span></button>' +
          '<button class="menu-row" data-x="outline" type="button"><span class="mr-icon">' + U.icon('inbox', 19) + '</span>' +
            '<span class="mr-body"><b>제안서 개요 (.md)</b><span>쓰시던 양식에 붙여넣을 때</span></span>' +
            '<span class="mr-arrow">' + U.icon('chevron', 17) + '</span></button>' +
          '<button class="menu-row" data-x="budget" type="button"><span class="mr-icon">' + U.icon('receipt', 19) + '</span>' +
            '<span class="mr-body"><b>예산서 (.txt)</b><span>제안가·원가·사업이익률 — PMS에 붙여넣기</span></span>' +
            '<span class="mr-arrow">' + U.icon('chevron', 17) + '</span></button>' +
          '<button class="menu-row" data-x="csv" type="button"><span class="mr-icon">' + U.icon('download', 19) + '</span>' +
            '<span class="mr-body"><b>예산서 (.csv)</b><span>엑셀에서 열어 계정별로 정리</span></span>' +
            '<span class="mr-arrow">' + U.icon('chevron', 17) + '</span></button>' +
          (p.curriculum && (p.curriculum.lines || []).length
            ? '<button class="menu-row" data-x="cur" type="button"><span class="mr-icon">' + U.icon('inbox', 19) + '</span>' +
              '<span class="mr-body"><b>커리큘럼 원문 (.txt)</b><span>' + esc(p.curriculum.fileName) + ' 에서 뽑은 ' + p.curriculum.lines.length + '줄</span></span>' +
              '<span class="mr-arrow">' + U.icon('chevron', 17) + '</span></button>'
            : '') +
        '</div></div></div>';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });
    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-no]') || e.target === host) return close();
      var x = e.target.closest('[data-x]');
      if (!x) return;
      var k = x.dataset.x;
      if (k === 'pptx') {
        close();
        U.busy(true, U.withEta('파워포인트를 만드는 중…', 20), null, 'ppt');
        pptxBlob(p).then(function (blob) {
          U.busy(false);
          saveBlob(blob, base + '_제안서.pptx');
          draftNotice(p, base + '_제안서.pptx');
        }).catch(function (err) {
          U.busy(false);
          U.toast(err.message || 'PPT 를 만들지 못했습니다', 'err');
        });
        return;
      }
      if (k === 'patch') { close(); patchSheet(p, base); return; }
      if (k === 'outline') download(P.outlineText(p), base + '_개요.md', 'text/markdown');
      if (k === 'budget') download(P.budgetText(p), base + '_예산서.txt');
      if (k === 'csv') download(budgetCsv(p), base + '_예산서.csv', 'text/csv');
      if (k === 'cur') download(p.curriculum.lines.join('\n'), base + '_커리큘럼.txt');
      close();
      U.toast('저장했습니다', 'ok');
    });
  }

  /* 올린 PPT 양식이 있으면 그 파일에 글자를 채워서 만든다.
     양식이 없으면(기본 구성) 우리가 직접 그린 기본 디자인으로 만든다. */
  /* 내려받은 뒤 — 초안이라는 것과, 이 제안서에서 실제로 모자란 곳을 알려 준다 */
  function draftNotice(p, fileName) {
    var issues = [];
    P.gaps(p).forEach(function (x) { issues.push(x.label + ' — 내용이 비어 있습니다'); });

    /* 강사 이력 — 고른 강사의 칸이 비어 있으면 그 장이 허술하게 나간다 */
    var need = P.TEACHER_FIELDS.filter(function (f) { return f.key !== 'books' && f.key !== 'name'; });
    P.pickedTeachers(p).forEach(function (t) {
      var miss = need.filter(function (f) { return !String(t[f.key] || '').trim(); })
        .map(function (f) { return f.label; });
      if (miss.length) issues.push('강사 ' + (t.name || '(이름 없음)') + ' — ' + miss.join('·') + ' 비어 있음');
    });

    P.misfits(p).forEach(function (x) { if (x.bad) issues.push(x.text); });

    /* 마지막 장의 담당자 연락처 — '내 정보' 가 비어 있으면 'Tel: 02-3274-' 처럼 반쯤 빈 채로 나간다 */
    var me = P.me() || {};
    var noMe = [['name', '이름'], ['tel', '전화 뒷번호'], ['email', '메일']]
      .filter(function (f) { return !String(me[f[0]] || '').trim(); }).map(function (f) { return f[1]; });
    if (noMe.length) issues.push('마지막 장 담당자 연락처 — ' + noMe.join('·') + ' 이(가) 비어 있습니다 (내 정보에서 넣어 주세요)');

    auditLeft.forEach(function (x) {
      issues.push((x.slide ? x.slide + '번째 장' : 'PPT') + ' — ' +
        (x.kind === 'over' ? '글이 칸 밖으로 넘칩니다' : '넣은 칸이 비어 보입니다'));
    });
    auditTrim.forEach(function (x) {
      issues.push(x.slide + '번째 장 — 칸이 모자라 끝의 ' + (x.lines || 1) + '줄을 뺐습니다' +
        (x.text ? ' (「' + String(x.text).slice(0, 30) + '」 등)' : '') + ' — 필요하면 파워포인트에서 줄여 넣어 주세요');
    });
    reviewLeft.forEach(function (x) {
      issues.push((x.slide ? x.slide + '번째 장' : '모든 장 머리말') + ' — ' + (x.problem || x.kind) +
        (x.text ? ' (「' + String(x.text).slice(0, 40) + '」)' : ''));
    });

    U.draftNote({
      title: '제안서 초안을 저장했습니다',
      file: fileName,
      issues: issues,
      checks: [
        reviewFixed.length ? 'AI 검수가 예전 이름 ' + reviewFixed.length + '곳을 이번 건으로 바꿨습니다 — ' +
          reviewFixed.slice(0, 3).map(function (x) { return (x.slide ? x.slide + '장 ' : '머리말 ') + '「' + String(x.fix).slice(0, 24) + '」'; }).join(', ') : '',
        '고객사명·과정명·일정·인원이 맞는지',
        '제안가와 견적표 숫자 (원가가 아닌 제안가로 나가는지)',
        '강사 이력·사진이 최신인지',
        'AI 가 쓴 커리큘럼·문장이 고객 요청과 맞고 사실과 다르지 않은지',
        '양식에 남아 있던 예전 고객사 이름·사진이 없는지'
      ]
    });
  }

  function pptxBlob(p) {
    return makePptx(p).then(function (blob) {
      /* 이 순간의 내용을 기억해 둔다 — 나중에 '무엇이 달라졌는지' 를 알려면 필요하다 */
      P.markExported(p, '');
      return blob;
    });
  }

  var PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  /* 칸보다 긴 글을 AI 가 칸에 맞게 다시 쓴다 — '…' 으로 잘려 나가지 않게.
     한 번 줄인 글은 제안서에 담아 두어(p.shortCache) 다음에는 다시 묻지 않는다.
     AI 를 못 쓰면 그냥 넘어간다(말이 끝나는 자리에서 자른다). */
  function condense(p) {
    var needs = P.shortNeeds();
    if (!needs.length) return Promise.resolve(false);
    var co = String(p.client.company || '').trim();
    var bareCo = co.replace(/^\s*(\(주\)|㈜|주식회사)\s*|\s*(\(주\)|㈜|주식회사)\s*$/g, '').trim();
    U.busy(true, U.withEta('칸에 맞게 문장을 다듬는 중… (' + needs.length + '곳)', 30), null, 'ai');
    return fetch('/api/ai/condense', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: needs, kind: '제안서',
        names: [co, bareCo !== co ? bareCo : '', p.client.person].filter(Boolean) })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok || !(d.items || []).length) return false;
      P.setShort(p, d.items);
      P.update(p.id, {});
      return true;
    }).catch(function () { return false; });
  }

  function makePptx(p) {
    var plan = P.fillPlan(p);
    if (plan) {
      return condense(p).then(function (changed) {
        if (changed) plan = P.fillPlan(p);
        U.busy(true, U.withEta('파워포인트를 만들고 마지막 검수 중…', 45), null, 'ppt');
        return sendFill(p, plan);
      });
    }
    if (!g.Pptx) return Promise.reject(new Error('PPT 모듈을 찾지 못했습니다'));
    return g.Pptx.fromOutline(P.outline(p), {
      title: fileBase(p),
      company: (g.PropStore ? g.PropStore.myTeam() : 'KMA 인재개발센터')
    });
  }

  function sendFill(p, plan) {
    {
      var was = wasOf(plan);
      var co = String(p.client.company || '').trim();
      var bareCo = co.replace(/^\s*(\(주\)|㈜|주식회사)\s*|\s*(\(주\)|㈜|주식회사)\s*$/g, '').trim();
      /* 마지막 검수 — 서버가 다 만든 문서를 AI 에게 읽혀 다른 회사 흔적·빈칸 표시·
         표지에 고객사·과정명이 빠졌는지 본다 (AI 를 못 쓰면 서버가 건너뛴다) */
      var review = { kind: '제안서', course: P.courseTitle(p),
                     /* 문의 원문 — 거기 나오는 장소·약칭(청평CC, 신한라이프)은 이번 고객사 쪽이라고
                        검수에게 알려 준다. 모르면 '다른 회사 이름이 남았다' 고 잘못 짚는다. */
                     inquiry: String(p.context.inquiry || '').slice(0, 1500),
                     names: [co, bareCo !== co ? bareCo : '', p.client.person].filter(Boolean) };
      reviewLeft = []; reviewFixed = [];
      return fetch('/api/ppt/fill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign(plan, { fileName: '제안서.pptx', was: was, review: review }))
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || d.error) throw new Error(d.message || '양식으로 만들지 못했습니다');
          var rv = d.audit && d.audit.review;
          if (rv) { reviewLeft = rv.left || []; reviewFixed = rv.fixed || []; }
          /* 만들고 끝내지 않는다 — 재 보고, 잘못된 곳이 있으면 고쳐 다시 만든다.
             '잘 됐겠거니' 하고 내보냈다가 빈칸과 삐져나간 글이 고객에게 갔다. */
          return auditAndFix(p, plan, d).then(function (fin) {
            return g.Files.unpack(fin, PPTX_MIME);
          });
        });
      }).catch(function (err) {
        if (!(err instanceof TypeError)) throw err;
        /* fetch 가 TypeError 로 떨어지는 경우는 둘인데 뜻이 정반대다 —
             ① 서버가 아예 안 떠 있다       → 켜야 한다
             ② 만드는 도중에 연결이 끊겼다 → 다시 누르면 된다
           서버가 살아 있는지 직접 물어보고 맞는 쪽을 말한다. */
        return fetch('/api/status').then(function () {
          throw new Error('PPT 를 만드는 도중에 연결이 끊겼습니다. 한 번 더 눌러 주세요.');
        }, function () {
          throw new Error('서버에 닿지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
        });
      });
    }
  }

  /* ── 만든 PPT 를 다시 열어 재 보고 고친다 ────────────
   *
   * 채우기는 '양식이 이렇게 생겼을 것이다' 라는 짐작 위에서 돈다.
   * 짐작이 빗나가면 글이 상자 밖으로 나가거나 칸이 빈 채로 나간다 —
   * 그걸 고객에게 보내고 나서야 알게 되는 것이 제일 나쁘다.
   *
   * 서버가 채우는 김에 같이 잰다(글 폭·줄 수를 계산해 상자 높이와 견준다).
   *   · 글이 상자보다 높으면 → 줄여서 다시 넣는다
   *   · 우리가 글을 넣은 자리가 비었으면 → 알린다
   * 고칠 것이 있으면 그 자리만 다시 채워 파일을 한 번 더 만든다.
   * 이미 서버에 있는 파일에 이어서 고치므로(ref) 파일을 다시 올리지 않는다.
   */

  /* '지금 비었다' 를 견줄 기준은 **우리가 실제로 써 넣은 것**이다.
     도형 이름은 장마다 겹치므로(Rectangle 11 이 여러 장에 있다) 장 번호를 붙여 적는다. */
  function wasOf(plan) {
    var was = {};
    (plan.fill || []).forEach(function (f) {
      (f.slots || []).forEach(function (s) {
        var txt = String((s && s.text) || '').trim();
        if (s && s.name && txt) was[f.no + '|' + s.name] = txt.slice(0, 80);
      });
    });
    return was;
  }

  /* 마지막으로 만든 PPT 에서 끝내 못 고친 곳 — 내려받은 뒤 초안 안내에 적는다 */
  var auditLeft = [], auditTrim = [];
  /* AI 마지막 검수가 찾은 것 — 고친 것과 사람이 봐야 할 것 */
  var reviewLeft = [], reviewFixed = [];

  function auditAndFix(p, plan, d) {
    var all = (d && d.audit && d.audit.items) || [];
    /* 'trim' 은 서버가 칸에 맞춰 끝 줄을 이미 덜어 낸 것 — 고칠 거리가 아니라 알릴 거리다 */
    auditTrim = all.filter(function (x) { return x.kind === 'trim'; });
    var bad = all.filter(function (x) { return x.kind !== 'trim'; });
    auditLeft = bad;
    if (!bad.length) return Promise.resolve(d);

    var fix = fixSlots(p, plan, bad);
    if (!fix.length) {
      /* 못 고치는 것은 숨기지 않고 알린다 — 모르고 내보내는 것보다 낫다 */
      U.toast(bad.length + '곳을 손보지 못했습니다 (' + reason(bad) + ')', 'warn');
      return Promise.resolve(d);
    }
    U.busy(true, '확인한 곳을 고쳐 다시 만드는 중…', null, 'ppt');
    var src = g.Files.ref(d) || d.b64;
    return fetch('/api/ppt/fill', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ src: src, fill: fix, drop: [], fileName: '제안서.pptx' })
    }).then(function (r2) { return r2.json(); }).then(function (d2) {
      U.busy(false);
      if (!d2 || d2.error || !(d2.file || d2.b64)) return d;
      var all2 = (d2.audit && d2.audit.items) || [];
      auditLeft = all2.filter(function (x) { return x.kind !== 'trim'; });
      auditTrim = auditTrim.concat(all2.filter(function (x) { return x.kind === 'trim'; }));
      return d2;
    }).catch(function () { U.busy(false); return d; });
  }

  function reason(bad) {
    var o = bad.filter(function (x) { return x.kind === 'over'; }).length;
    var e = bad.length - o;
    return [o ? '삐져나감 ' + o : '', e ? '빈칸 ' + e : ''].filter(Boolean).join(' · ');
  }

  /* 검수에서 걸린 자리를 어떻게 고칠지 정한다 */
  function fixSlots(p, plan, bad) {
    /* 그 도형에 우리가 무엇을 넣었는지 계획에서 되찾는다 */
    var sent = {};
    (plan.fill || []).forEach(function (f) {
      (f.slots || []).forEach(function (s) { sent[f.no + '|' + s.name] = s; });
    });

    var byNo = {};
    bad.forEach(function (x) {
      var mine = sent[x.slide + '|' + x.name];
      var text = null;

      if (x.kind === 'over') {
        /* 삐져나간 만큼 뒤쪽 줄을 덜어 낸다. 줄 가운데를 자르면 문장이 끊긴다. */
        var body = String((mine && mine.text) || x.text || '');
        var ls = body.split('\n').filter(Boolean);
        if (ls.length > 1) {
          var keep = Math.max(1, ls.length - Math.ceil(x.over / Math.max(10, x.h / ls.length)));
          text = ls.slice(0, keep).join('\n');
        } else {
          /* 한 줄짜리는 넘친 비율만큼 글자를 줄인다 */
          var cut = Math.max(12, Math.floor(body.length * (x.h / (x.h + x.over))) - 1);
          text = body.length > cut ? body.slice(0, cut).replace(/[\s,·\/]+$/, '') + '…' : body;
        }
        if (text === body) text = null;
      }

      if (text === null || text === undefined) return;
      (byNo[x.slide] = byNo[x.slide] || []).push({ name: x.name, text: text });
    });

    return Object.keys(byNo).map(function (no) {
      return { no: Number(no), slots: byNo[no] };
    });
  }

  /* ── 고친 PPT 에 바뀐 내용만 넣기 ──────────────────
   *
   * 한 번 내보낸 PPT 를 파워포인트에서 손본 뒤, 제안 내용이 바뀌었을 때 쓴다.
   * 양식에서 새로 만들면 손댄 것이 다 날아간다. 그래서 그 파일을 열어
   * 고른 장의 글자만 바꾼다. 장은 번호가 아니라 **제목으로 찾는다** —
   * 파워포인트에서 장을 더하거나 순서를 바꿔도 따라간다.
   */
  function norm(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }

  function patchSheet(p, base) {
    var changed = P.changedSince(p);
    var items = P.outline(p).filter(function (s) { return !s.keep; });
    var scanned = null, file = null, picked = {}, matched = [];

    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });
    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }

    function match() {
      matched = items.map(function (it) {
        /* 표지는 제목이 '표지' 가 아니라 고객사·과정명이다. 그 글로 찾고,
           못 찾으면 첫 장으로 본다. */
        var keys = it.src === 'cover' ? [it.bullets[0], it.title] : [it.title];
        var hit = null;
        keys.forEach(function (key) {
          if (hit || !norm(key)) return;
          (scanned || []).forEach(function (s) {
            if (hit) return;
            if (norm(s.title) === norm(key)) hit = s;
          });
          if (hit) return;
          (scanned || []).forEach(function (s) {
            if (hit) return;
            if (norm(s.title) && norm(s.title).indexOf(norm(key)) === 0) hit = s;
          });
        });
        if (!hit && it.src === 'cover' && (scanned || []).length) hit = scanned[0];
        var isChanged = changed.indexOf(it.title) !== -1;
        return { item: it, no: hit ? hit.no : null, found: !!hit, changed: isChanged };
      });
      matched.forEach(function (m, i) {
        picked[i] = m.found && (m.changed || !p.lastExport);
      });
    }

    function draw() {
      host.innerHTML =
        '<div class="sheet wide patch-sheet">' +
          '<div class="sheet-head"><h2 class="sheet-title">고친 PPT 에 바뀐 내용만 넣기</h2>' +
            '<button class="icon-btn" data-close type="button">✕</button></div>' +
          '<div class="sheet-body">' +
            '<p class="sheet-note">파워포인트에서 손본 파일을 올리세요. <b>고른 장의 글자만 바꾸고</b> ' +
              '나머지는 그대로 둡니다 — 옮긴 도형, 바꾼 색, 새로 넣은 장, 직접 고친 문장 모두 남습니다.</p>' +

            '<input type="file" id="patch-file" hidden accept=".pptx">' +
            (file
              ? '<div class="cur-file"><span class="cur-kind">PPTX</span><b>' + esc(file.name) + '</b>' +
                '<span class="sub">' + (scanned ? scanned.length + '장' : '읽는 중…') + '</span>' +
                '<span class="spacer"></span>' +
                '<button class="btn tiny" data-pick type="button">다른 파일</button></div>'
              : '<div class="cur-drop" id="patch-drop"><p><b>고친 제안서 PPT 를 올리세요</b></p>' +
                '<p class="sub">끌어다 놓거나 <button class="link" data-pick type="button">클릭해서 선택</button></p></div>') +

            (scanned ? matchTable() : '') +
          '</div>' +
          '<div class="sheet-foot">' +
            '<button class="btn big ghost" data-close type="button">닫기</button>' +
            '<button class="btn big primary" data-go type="button"' + (scanned ? '' : ' disabled') + '>바뀐 내용 넣기</button>' +
          '</div>' +
        '</div>';

      var input = host.querySelector('#patch-file');
      var drop = host.querySelector('#patch-drop');
      if (drop) {
        drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
        drop.addEventListener('drop', function (e) {
          e.preventDefault(); drop.classList.remove('drag');
          if (e.dataTransfer && e.dataTransfer.files[0]) take(e.dataTransfer.files[0]);
        });
      }
      input.addEventListener('change', function () {
        if (input.files[0]) take(input.files[0]);
        input.value = '';
      });
    }

    function matchTable() {
      var miss = matched.filter(function (m) { return !m.found; }).length;
      return '<div class="ml-files"><b>어느 장을 바꿀까요</b>' +
        matched.map(function (m, i) {
          return '<label class="ml-file' + (m.found ? '' : ' internal') + '">' +
            '<input type="checkbox" data-pk="' + i + '"' + (picked[i] ? ' checked' : '') + (m.found ? '' : ' disabled') + '>' +
            '<span class="mf-body"><b>' + esc(m.item.title) + '</b>' +
              '<span>' + (m.found
                ? '올린 파일의 ' + m.no + '번 장' + (m.changed ? ' · 내용이 달라졌습니다' : ' · 그대로입니다')
                : '올린 파일에서 같은 제목의 장을 못 찾았습니다') + '</span></span>' +
            (m.changed && m.found ? '<span class="mf-tag chg">바뀜</span>' : '') +
          '</label>';
        }).join('') +
        (miss ? '<p class="pr-hint">제목을 바꾼 장은 못 찾습니다. 그 장은 파워포인트에서 직접 고쳐 주세요.</p>' : '') +
        '</div>';
    }

    function take(f) {
      file = f; scanned = null; draw();
      U.busy(true, '올린 PPT 를 읽는 중…');
      /* 한 번 올려 두고(큰 파일은 파일 통로) 읽기·채우기 두 번 다 그 표시로 쓴다 */
      g.Files.pack(f, f.name, true).then(function (v) {
        file.packed = v;
        return fetch('/api/ppt/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: v }) });
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || d.error) throw new Error(d.message || 'PPT 를 읽지 못했습니다');
          scanned = d.slides || [];
          match();
          U.busy(false); draw();
        });
      }).catch(function (err) {
        U.busy(false);
        file = null; draw();
        U.toast(err instanceof TypeError ? '서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요' : (err.message || '읽지 못했습니다'), 'err');
      });
    }

    host.addEventListener('change', function (e) {
      var c = e.target.closest('[data-pk]');
      if (c) picked[Number(c.dataset.pk)] = c.checked;
    });

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target === host) return close();
      if (e.target.closest('[data-pick]')) { host.querySelector('#patch-file').click(); return; }
      if (!e.target.closest('[data-go]')) return;

      var fill = matched.filter(function (m, i) { return m.found && picked[i]; }).map(function (m) {
        var b = m.item.bullets;
        if (m.item.src === 'cover' && b.length) return { no: m.no, title: b[0], body: b.slice(1) };
        return { no: m.no, title: m.item.title, body: b };
      });
      if (!fill.length) { U.toast('바꿀 장을 하나 이상 고르세요', 'err'); return; }

      U.busy(true, U.withEta('고친 PPT 에 내용을 넣는 중…', 20));
      fetch('/api/ppt/fill', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: file.packed, fill: fill, drop: [], fileName: base + '_제안서.pptx' })
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || d.error) throw new Error(d.message || '넣지 못했습니다');
          return g.Files.unpack(d, PPTX_MIME);
        });
      }).then(function (blob) {
        U.busy(false);
        saveBlob(blob, base + '_제안서.pptx');
        P.markExported(p, base + '_제안서.pptx');
        close();
        g.Proposal.render();
        U.toast(fill.length + '개 장을 바꿔 저장했습니다', 'ok');
      }).catch(function (err) {
        U.busy(false);
        U.toast(err.message || '넣지 못했습니다', 'err');
      });
    });

    draw();
  }

  /* 파일 이름 — [KMA]고객사명_교육과정이름_제안서 (결과보고서와 같은 꼴)
     제목이 이미 고객사 이름으로 시작하면 한 번만 쓴다.
     예전: [씨제이대한통운(CJ대한통운)]씨제이대한통운(CJ대한통운) 데이터분석 … _제안서 */
  function stripCompany(title, company) {
    var t = String(title || '').trim(), c = String(company || '').trim();
    if (!c || !t) return t;
    var bare = c.replace(/\(주\)|㈜|주식회사/g, '').trim();
    var names = [c, bare, bare.replace(/\s*\([^)]*\)\s*/g, '').trim()];
    (bare.match(/\(([^)]+)\)/g) || []).forEach(function (m) { names.push(m.slice(1, -1).trim()); });
    names = names.filter(Boolean).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < names.length; i++) {
      var tt = t.replace(/^(\(주\)|㈜|주식회사)\s*/, '');
      if (tt.indexOf(names[i]) === 0) {
        var rest = tt.slice(names[i].length).replace(/^[\s_\-·:]+/, '');
        return rest || t;
      }
    }
    return t;
  }
  function fileBase(p) {
    var safe = function (x) { return String(x || '').replace(/[\\/:*?"<>|]/g, '').trim(); };
    var co = safe(p.client && p.client.company);
    var course = safe(stripCompany(p.title, co));
    return '[KMA]' + [co, course].filter(Boolean).join('_');
  }

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
  }

  /* ── 아웃룩으로 보내기 ────────────────────────────── */

  function textBlob(text, mime) {
    return new Blob(['﻿' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  }

  function mailSheet(p) {
    if (!g.MailViews) { U.toast('메일 모듈을 찾지 못했습니다', 'err'); return; }
    var base = fileBase(p);
    var project = g.Projects ? g.Projects.byProposal(p.id) : null;
    var draft = g.MailStore.proposalMail(p, project);
    var hasCur = !!(p.curriculum && (p.curriculum.lines || []).length);

    var files = [
      { id: 'pptx', name: '제안서', fileName: base + '_제안서.pptx', on: true,
        desc: P.outline(p).length + '장 · ' + (P.template(p.templateId).kind === 'pptx'
          ? P.template(p.templateId).name + ' 양식으로' : '기본 디자인으로'),
        make: function () { return pptxBlob(p); } }
    ];
    if (g.QuoteExcel) {
      files.push({ id: 'quote', name: '견적서', fileName: g.QuoteExcel.fileName(p), on: true,
        desc: '원가·이익률을 뺀 고객 제출용 (.xlsx)',
        make: function () { return g.QuoteExcel.build(p); } });
    }
    files.push({ id: 'outline', name: '제안서 개요', fileName: base + '_개요.md', on: false,
      desc: '쓰시던 양식에 붙여넣을 때 (.md)',
      make: function () { return textBlob(P.outlineText(p), 'text/markdown'); } });
    if (hasCur) {
      files.push({ id: 'cur', name: '커리큘럼 원문', fileName: base + '_커리큘럼.txt', on: false,
        desc: esc(p.curriculum.fileName) + ' 에서 뽑은 ' + p.curriculum.lines.length + '줄',
        make: function () { return textBlob(p.curriculum.lines.join('\n')); } });
    }
    files.push({ id: 'budget', name: '예산서', fileName: base + '_예산서.csv', on: false, internal: true,
      desc: '원가·사업이익률이 들어 있습니다 (.csv)',
      make: function () { return textBlob(budgetCsv(p), 'text/csv'); } });

    g.MailViews.open({
      title: '제안서 메일 보내기',
      to: (project && project.client && project.client.email) || '',
      subject: draft.subject, body: draft.body,
      files: files,
      onSent: function (mode, to) {
        if (!project || !g.Projects) return;
        g.Projects.markSent(project.id, 'proposal', to, mode);
        if (p.status === '작성중') P.update(p.id, { status: '발송' });
        g.Proposal.render();
        /* 보내 놓고 잊지 않게 바로 다음 연락 날짜를 묻는다 */
        if (!g.Projects.followUpOf(project) && g.ProjectViews && g.ProjectViews.askFollowUp) {
          setTimeout(function () { g.ProjectViews.askFollowUp(project); }, 400);
        }
      }
    });
  }

  function editModule(p, idx) {
    var m = idx >= 0 ? p.approach.modules[idx] : { title: '', hours: null, detail: '' };
    U.form({ title: idx >= 0 ? '모듈 수정' : '모듈 추가', wide: true,
      fields: [{ key: 'title', label: '모듈명', type: 'text', required: true, span: 2 },
               { key: 'hours', label: '시간', type: 'number' }, { key: 'detail', label: '설명', type: 'text' }],
      values: m
    }).then(function (d) {
      if (!d) return;
      if (idx >= 0) p.approach.modules[idx] = d; else p.approach.modules.push(d);
      P.update(p.id, {}); g.Proposal.render();
    });
  }

  function addCost(p) {
    U.form({
      title: '원가 항목 추가', wide: true,
      note: '수량 기준을 고르면 운영 조건(인원·차수·일수)으로 자동 계산됩니다.',
      fields: [
        { key: 'preset', label: '자주 쓰는 항목', type: 'select', span: 2,
          options: P.COST_PRESET.map(function (x, i) { return { value: String(i), label: x.name + ' · ' + x.account }; }) },
        { key: 'name', label: '직접 입력할 때 항목명', type: 'text' },
        { key: 'account', label: '계정', type: 'select',
          options: (g.Accounts ? g.Accounts.ACCOUNTS.map(function (a) { return a.code; }) : []) },
        { key: 'basis', label: '수량 기준', type: 'select',
          options: Object.keys(P.BASIS_LABEL).map(function (k) { return { value: k, label: P.BASIS_LABEL[k] }; }) },
        { key: 'price', label: '단가(원)', type: 'number' }
      ], values: { basis: 'fixed', price: 0 }
    }).then(function (d) {
      if (!d) return;
      var base = (d.preset !== '' && d.preset !== null && d.preset !== undefined)
        ? Object.assign({}, P.COST_PRESET[Number(d.preset)]) : {};
      if (d.name) base.name = d.name;
      if (d.account) base.account = d.account;
      if (d.basis) base.basis = d.basis;
      base.price = d.price || 0;
      if (!base.name) { U.toast('항목명을 입력하거나 자주 쓰는 항목을 고르세요', 'err'); return; }
      P.addCostItem(p, base);
      g.Proposal.render();
    });
  }

  /* 제안 항목 추가 — 원가에 없는 항목(예: 과정 설계비)을 고객 견적에만 넣을 때 */
  function addPriceLine(p) {
    var Q = g.QuoteStore;
    if (!Q) return;
    U.form({
      title: '제안 항목 추가', wide: true,
      note: '여기 적은 항목이 그대로 외부용 견적서에 나갑니다.',
      fields: [
        { key: 'name', label: '항목명', type: 'text', span: 2 },
        { key: 'group', label: '구분', type: 'select', options: Q.GROUPS },
        { key: 'unit', label: '단가(원)', type: 'number' },
        { key: 'q1', label: '수량', type: 'number' },
        { key: 'u1', label: '수량 단위', type: 'text' }
      ],
      values: { group: '교육비', unit: 0, q1: Number(p.ops.hours) || 1, u1: Number(p.ops.hours) ? 'H' : '식' }
    }).then(function (d) {
      if (!d) return;
      if (!String(d.name || '').trim()) { U.toast('항목명을 적어 주세요', 'err'); return; }
      var rows = holdPrice(p);
      rows.push({
        id: Q.uid(), group: d.group || '교육비', name: String(d.name).trim(),
        /* 교육비 줄의 내용은 과정명 */
        detail: (d.group || '교육비') === '교육비'
          ? ((p.quote && String(p.quote.courseName || '').trim()) || Q.courseLabel(p)) : '',
        unit: Number(d.unit) || 0, q1: Number(d.q1) || 1, u1: d.u1 || '식', q2: 1, u2: '',
        sessions: Number(p.ops.sessions) || 1, su: '차수', memo: ''
      });
      priceFromRows(p);
      P.update(p.id, {});
      g.Proposal.render();
    });
  }


  /* ── 템플릿 ───────────────────────────────────────── */

  /* 슬라이드마다 고르는 내용 — 그대로 두기 · 빼기 · 채우기 */
  function srcOptions(cur) {
    var opts = [{ id: 'keep', label: '그대로 두기' }]
      .concat(P.SOURCES)
      .concat([{ id: 'skip', label: '이 장 빼기' }]);
    return opts.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === cur ? ' selected' : '') + '>' + esc(x.label) + '</option>';
    }).join('');
  }

  var openTpl = null;   /* 펼쳐 놓은 양식 */

  /* ── 노션의 제안 프로그램 카탈로그 ─────────────────────
     사내 노션의 'KMA 주요 제안서 통합' 을 **읽기만** 해서 옆에 세워 둔다.
     노션을 고치는 길은 relay 에 아예 없다.

     고르면 그 프로그램의 영역·키워드·요약이 제안서의 과정명과 방향으로 들어간다.
     매번 빈 화면에서 시작하지 않게 하는 것이 목적이다. */
  /* ── 예전에 나간 제안서에서 가져오기 ──────────────────
     노션 '인재개발센터 제안서 데이터베이스' 에 실제로 보낸 제안서가
     400건 넘게 쌓여 있고, 건마다 커리큘럼 표·추천 강사·제안 금액이 붙어 있다.
     21건짜리 프로그램 목록보다 이쪽이 훨씬 쓸모 있다 — 이미 나간 문장이라
     말이 다듬어져 있고, 커리큘럼이 표 그대로 들어 있다. */
  var past = null;          /* null 아직 · 'asking' 읽는 중 · {items:[]} */

  function loadPast() {
    if (past !== null) return;
    past = 'asking';
    fetch('/api/notion/proposals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(function (r) { return r.json(); })
      .then(function (d) { past = d && d.items ? d : { items: [] }; g.Proposal.render(); })
      .catch(function () { past = { items: [], failed: true }; });
  }

  function pastCard(p) {
    var tagText = (p.tags || []).join(' ');
    var text = [tagText, tagText, tagText,
                p.title, p.context.inquiry, p.context.situation, p.context.problem]
      .filter(Boolean).join(' ');
    if (!text.trim()) return '';
    if (past === null || past === 'asking') { loadPast(); return ''; }
    var items = (past && past.items) || [];
    if (!items.length) return '';

    var hits = P.matchPast(text, items, 4);
    if (!hits.length) return '';
    var picked = p.past && p.past.id;

    return '<section class="pr-card sg-card">' +
      '<h3>비슷한 문의에 나갔던 제안서' +
        '<span class="cat-src">노션 ' + items.length + '건에서 골랐습니다</span></h3>' +
      '<p class="pr-hint">' + items.length + '건 전체에서 문의 글과 겹치는 말이 많은 순입니다. ' +
        '실제로 수주까지 간 고객사의 건은 <b>수주</b> 표를 달고 위로 옵니다. 누르면 그 제안서의 ' +
        '<b>커리큘럼·강사·견적</b>을 이 제안서로 가져옵니다. 이미 쓰신 칸은 그대로 둡니다.</p>' +
      '<div class="sg-list">' + hits.map(function (h) {
        var x = h.item, on = picked === x.id;
        var cur = (x.curriculum || []).length;
        return '<button class="sg-item' + (on ? ' on' : '') + '" data-past="' + esc(x.id) + '" type="button">' +
          '<span class="sg-head"><b>' + esc(x.name) + '</b>' +
            /* 왜 위에 섰는지 보이게 — 이 고객사는 실제로 수주까지 갔다 */
            (h.won ? U.badge('수주', 'ok') : '') +
            (on ? U.badge('가져옴', 'ok') : '') + '</span>' +
          '<span class="sg-meta">' +
            [cur > 1 ? '커리큘럼 ' + (cur - 1) + '모듈' : '',
             x.hours ? x.hours + '시간' : '',
             x.days || '',
             x.price ? Math.round(x.price / 10000).toLocaleString('ko-KR') + '만원' : '',
             (x.teachers || []).length ? '강사 ' + x.teachers.join('·') : ''
            ].filter(Boolean).map(function (s) {
              return '<em>' + esc(s) + '</em>';
            }).join('') +
          '</span>' +
          (x.concept ? '<span class="sg-sum">' + esc(x.concept.slice(0, 120)) + '</span>' : '') +
          '<span class="sg-why">겹친 말 ' + h.hits.slice(0, 6).map(function (w) {
            return '<em>' + esc(w) + '</em>';
          }).join('') + '</span>' +
        '</button>';
      }).join('') + '</div>' +
    '</section>';
  }

  function usePast(p, id, items, auto) {
    var pool = items || (past && past.items) || [];
    if (items) past = { items: items };       /* 화면에도 같은 목록을 쓰게 둔다 */
    var x = (id && typeof id === 'object') ? id
      : pool.filter(function (i) { return i.id === id; })[0];
    if (!x) return;
    var filled = [];

    p.approach = p.approach || {};
    p.context = p.context || {};

    /* 가져온 글에는 그 제안서를 받았던 고객사 이름이 박혀 있다.
       그대로 두면 '㈜메가인포에셋 신임 과/차장 대상…' 이 우리 고객에게 나간다.
       남의 회사 이름을 지우고 이번 고객사로 바꾼다. */
    var mine = (p.client && p.client.company) || '귀사';
    function clean(s) {
      if (!s) return '';
      var t = String(s);
      var src = String(x.client || '').trim();
      if (src) {
        /* ㈜·(주) 가 붙은 꼴까지 함께 지운다 */
        var esc2 = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        t = t.replace(new RegExp('(?:㈜|\\(주\\)\\s*)?' + esc2 + '(?:㈜|\\(주\\))?', 'g'), mine);
      }
      /* 제안서명에 들어 있던 회사 이름도 한 번 더 훑는다 */
      var head = String(x.name || '').split(/\s+/)[0].replace(/^㈜|\(주\)/, '');
      if (head && head.length >= 2 && head !== mine) {
        t = t.split('㈜' + head).join(mine).split('(주)' + head).join(mine).split(head).join(mine);
      }
      return t;
    }

    /* 기대 변화는 p.outcome.changes 에 있다 — 다른 둘과 자리가 달라 따로 받는다 */
    function put(box, key, val, label) {
      if (!val || !box) return;
      if (String(box[key] || '').trim()) return;
      box[key] = String(val);
      filled.push(label);
    }

    put(p.context, 'situation', clean(x.voc), '귀사의 상황');
    put(p.approach, 'direction',
        clean([x.concept, x.signature].filter(Boolean).join('\n\n')), '제안 방향');
    p.outcome = p.outcome || { changes: '' };
    put(p.outcome, 'changes', clean(x.output), '기대 변화');

    /* 커리큘럼 표. 첫 줄은 머리글(모듈/시간/내용)이라 떼어 낸다.
       열 차례가 건마다 다르다 — 2열(모듈/내용)짜리도 있고 시간이 3열인 것도 있다.
       머리글을 보고 어느 열이 시간이고 어느 열이 내용인지 정한다. */
    var rows = (x.curriculum || []).slice();
    var cols = { time: -1, detail: -1 };
    if (rows.length) {
      rows[0].forEach(function (h, i) {
        if (/시간|시수|H$/i.test(h)) cols.time = i;
        else if (/내용|세부|주요|설명/.test(h)) cols.detail = i;
      });
      if (/모듈|시간|내용|차시|구분/.test(rows[0].join(' '))) rows = rows.slice(1);
    }
    if (cols.detail < 0) cols.detail = cols.time === 1 ? 2 : 1;
    rows = rows.filter(function (r) { return (r[0] || '').trim(); });

    if (rows.length) {
      var lines = rows.map(function (r) {
        return clean(r.filter(Boolean).join(' · '));
      });
      /* 세부 커리큘럼 장이 이 줄들을 그대로 쓴다 */
      if (!p.curriculum || !(p.curriculum.lines || []).length) {
        /* 파일 이름에 원본 제안서 이름을 그대로 쓰면 남의 고객사 이름이
           첨부 목록에 뜬다. 우리 과정 이름으로 적고 출처는 갈래만 남긴다. */
        P.setCurriculum(p, {
          fileName: (p.title || '커리큘럼') + ' (지난 제안서에서 가져옴)',
          kind: 'notion', lines: lines, tables: [rows], attachmentId: null
        });
        filled.push('세부 커리큘럼 ' + rows.length + '모듈');
      }
      if (!(p.approach.modules || []).length) {
        p.approach.modules = rows.map(function (r) {
          /* 시간 열이 없으면 줄 전체에서 '2H' 같은 표기를 찾아본다 */
          var src = cols.time >= 0 ? (r[cols.time] || '') : r.join(' ');
          var h = /(\d+(?:\.\d+)?)\s*(?:H|h|시간)/.exec(src);
          return {
            title: clean((r[0] || '').trim()),
            hours: h ? Number(h[1]) : null,
            detail: clean((r[cols.detail] || '').trim())
          };
        });
        filled.push('과정 설계');
      }
    }

    /* 운영 조건 — 문의에서 읽은 값이 있으면 그쪽이 이긴다.
       고객이 '4시간' 이라고 적어 보낸 것을 예전 제안서 값으로 덮으면 안 된다. */
    if (!Number(p.ops.hours) && x.hours) { p.ops.hours = x.hours; filled.push('교육시간'); }
    if (!Number(p.ops.headcount) && x.headcount) { p.ops.headcount = x.headcount; filled.push('인원'); }
    if (!Number(p.ops.days) && x.days) {
      var dm = /(\d+)/.exec(x.days);
      if (dm) { p.ops.days = Number(dm[1]); filled.push('일수'); }
    }
    /* 금액은 저절로 옮기지 않는다.
       300명짜리 9,750만원 건이 규모도 모르는 새 문의에 그대로 들어앉는 일이 있었다.
       금액은 규모·시간·차수에 따라 통째로 달라지므로, 직접 고르셨을 때만 옮기고
       자동으로 담을 때는 '이런 건은 얼마였다' 고 메모로만 남긴다. */
    if (!auto && !Number(p.budget.price) && x.price) {
      p.budget.price = x.price;
      filled.push('제안가 ' + Math.round(x.price / 10000).toLocaleString('ko-KR') + '만원');
    }
    if (!String(p.budget.note || '').trim()) {
      var memo = (x.budget || []).slice();
      if (auto && x.price) {
        memo.unshift('참고 — 비슷한 건(' + (x.headcount ? x.headcount + '명 · ' : '') +
          (x.hours ? x.hours + '시간 · ' : '') +
          Math.round(x.price / 10000).toLocaleString('ko-KR') + '만원) 기준입니다. ' +
          '이번 규모에 맞게 다시 잡으세요.');
      }
      if (memo.length) p.budget.note = memo.join('\n');
    }

    p.past = { id: x.id, name: x.name, url: x.url };
    P.update(p.id, {});

    /* 강사는 이름만 넘어온다. 스튜디오에서 읽어 둔 480명과 이름을 맞춰
       학력·경력·주제까지 채운다 — 못 찾으면 이름만이라도 남긴다. */
    takeTeachers(p, x.teachers || [], x.name).then(function (n) {
      if (n) filled.push('교수 ' + n + '명');
      g.Proposal.render();
      U.toast(filled.length
        ? x.name.slice(0, 20) + '… 에서 ' + filled.join(' · ') + ' 가져왔습니다'
        : '이미 쓰신 내용이 있어 그대로 뒀습니다', 'ok');
    });
  }

  /* 이름으로 스튜디오 강사를 찾아 담는다 */
  function takeTeachers(p, names, fromName) {
    p.pastName = fromName || (p.past && p.past.name) || '예전 제안서';
    if (!names.length) return Promise.resolve(0);

    /* 이미 명단에 있는 사람은 다시 만들지 않고 그 기록을 이 제안서에 붙인다.
       전에는 '있으면 건너뛰기' 로 두어, 두 번째 제안서부터는 강사가 아예 안 붙었다. */
    var have = {};
    P.teachers().forEach(function (t) { have[t.name] = t.id; });
    var reused = 0;
    names.forEach(function (n) {
      if (!n || !have[n]) return;
      if ((p.teacherIds || []).indexOf(have[n]) === -1) {
        p.teacherIds = (p.teacherIds || []).concat([have[n]]);
        reused++;
      }
    });
    if (reused) P.update(p.id, {});

    var want = names.filter(function (n) { return n && !have[n]; });
    if (!want.length) return Promise.resolve(reused);

    return fetch('/api/teacher/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(function (r) { return r.json(); }).then(function (d) {
      var by = {};
      ((d && d.items) || []).forEach(function (t) { by[t.name] = t; });
      var jobs = want.map(function (n) {
        var hit = by[n];
        if (!hit) {
          /* 스튜디오 480명은 외부 명사·강사 쪽이다. 제안서의 추천 강사는
             사내 교수·컨설턴트가 많아 거기 없는 게 정상이다.
             '명단에 없음' 이라고 적으면 잘못된 사람처럼 보이니, 출처만 남긴다. */
          var made = P.addTeacher({ name: n, record: fromName === '문의에서 요청한 강사'
            ? '문의에서 요청한 강사' : '「' + p.pastName + '」 추천 강사' });
          p.teacherIds = (p.teacherIds || []).concat([made.id]);
          return Promise.resolve();
        }
        return fetch('/api/teacher/one', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: hit.id })
        }).then(function (r2) { return r2.json(); }).then(function (d2) {
          var t = (d2 && d2.teacher) || {};
          var made = P.addTeacher({
            name: t.name || n,
            /* 직함은 교수 소개 장의 '[성명] [직함]' 에 들어간다.
               field 에 밀어 넣어 두면 그 자리가 '주임교수' 없이 나간다. */
            rank: t.title || '',
            edu: (t.edu || []).join('\n'),
            career: (t.career || []).join('\n'),
            field: t.field || t.title || '',
            books: (t.books || []).join('\n'),
            record: (t.topics || []).join(', '),
            /* 얼굴 사진은 주소만 들고 다닌다 — 사진을 통째로 브라우저 저장소에
               쌓으면 교수 몇 명만 담아도 한도를 넘는다. 만들 때 relay 가 받아 넣는다. */
            photo: t.photo || ''
          });
          p.teacherIds = (p.teacherIds || []).concat([made.id]);
        }).catch(function () {});
      });
      return Promise.all(jobs).then(function () {
        P.update(p.id, {});
        return want.length + reused;
      });
    }).catch(function () { return reused; });
  }

  /* ── 커리큘럼에 맞는 강사를 같이 넣는다 ───────────────
     커리큘럼만 넣는 것은 반쪽이다. 참고한 제안서에는 그 커리큘럼을 실제로 진행한
     추천 강사가 함께 적혀 있으니(제안서 DB 425건 중 347건) 같이 가져온다.
     수주된 건만 보지 않는다 — 비슷한 커리큘럼이면 참고할 값이 있다.

     참고 건의 강사로 모자라면 스튜디오 명단에서 **우리가 쓴 커리큘럼**에 맞는
     사람을 더 찾는다. 문의 글이 아니라 커리큘럼을 기준으로 찾아야
     '이 모듈을 이 사람이 한다' 가 맞아떨어진다. */
  function seedTeachers(p, refs, all) {
    var want = teacherSeats(p);
    /* 교수가 그동안 어떤 건을 했는지 적어 둔다 — 제안서의 '유사 프로젝트' 표가 이걸 쓴다.
       교수를 새로 고르지 않는 경우에도 이 기록은 갱신해야 표가 채워진다. */
    var note = function () { rememberWork(p, all, refs); };
    /* 문의에서 이름을 대 놓은 강사가 먼저다 — 고객이 원한 사람이 빠진 제안서는 다시 써야 한다.
       자리가 이미 찼어도 넣는다. */
    return askedFirst(p, all).then(function () {
      /* 이미 고른 교수가 있으면 사람 뜻을 앞세운다 */
      if ((p.teacherIds || []).length >= want) { orderTeachers(p); note(); return (p.teacherIds || []).length; }
      return refPicks(p, refs, want, note);
    });
  }

  /* ── 문의가 이름을 댄 강사 ──────────────────────────
     '○○○ 교수님 강의를 듣고 싶습니다', '작년에 모셨던 ○○○ 강사님으로' 처럼
     문의 글에 강사 이름이 있으면 추천 강사에 반드시 넣는다.
     ① 아는 이름(스튜디오 명단 · 예전 제안서의 추천 강사 · 담아 둔 교수)이 글에 그대로 있거나
     ② 직함(교수·강사·박사·대표 …)이 붙은 세 글자 이름이면 요청으로 본다.
     두 글자는 흔한 낱말과 겹쳐('전문 강사') 아는 이름일 때만 받는다. */
  var SURNAME = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉';
  var NOT_NAME = { '전문가': 1, '명강사': 1, '외국인': 1, '원어민': 1, '강사님': 1, '교수님': 1, '대표님': 1,
                   '선생님': 1, '담당자': 1, '실무자': 1, '관리자': 1, '경험자': 1, '연구원': 1, '전문의': 1,
                   '사장님': 1, '부사장': 1, '이사님': 1, '코치님': 1, '강연자': 1, '진행자': 1, '사회자': 1 };
  var TITLE_RE = /(^|[^가-힣])([가-힣]{2,4})\s*(교수|강사|박사|대표|작가|소장|원장|코치|위원|컨설턴트|선생)/g;

  function askedTeachers(text, known, skip) {
    text = String(text || '');
    var out = [], seen = {}, knownSet = {};
    (known || []).forEach(function (n) { n = String(n || '').trim(); if (n) knownSet[n] = 1; });
    function add(n) {
      if (!n || seen[n] || NOT_NAME[n] || (skip || []).indexOf(n) !== -1) return;
      seen[n] = 1;
      out.push(n);
    }
    /* 이름이 낱말 한가운데 끼어 있으면 아니다 — '크리스' 강사가 '크리스마스' 에 걸렸다.
       이름 뒤에는 띄어쓰기·직함·조사만 온다. */
    var AFTER = '(?=$|[^가-힣]|님|씨|께|교수|강사|박사|대표|작가|소장|원장|코치|위원|선생|을|를|이|가|의|과|와|은|는|으로|로|에게)';
    Object.keys(knownSet).forEach(function (n) {
      if (n.length < 3 || n.length > 4 || !/^[가-힣]+$/.test(n) || text.indexOf(n) === -1) return;
      if (new RegExp('(^|[^가-힣])' + n + AFTER).test(text)) add(n);
    });
    var m;
    TITLE_RE.lastIndex = 0;
    while ((m = TITLE_RE.exec(text))) {
      var n = m[2];
      if (knownSet[n]) { add(n); continue; }
      if (n.length === 3 && SURNAME.indexOf(n[0]) !== -1) add(n);
    }
    return out;
  }

  function askedFirst(p, all) {
    var text = [p.context && p.context.inquiry, p.title].filter(Boolean).join(' ');
    if (!text.trim()) return Promise.resolve();
    return fetch('/api/teacher/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (d) {
      var known = ((d && d.items) || []).map(function (t) { return t.name; });
      (all || []).forEach(function (x) { refTeachers([x]).forEach(function (t) { known.push(t.name); }); });
      P.teachers().forEach(function (t) { known.push(t.name); });
      var skip = [p.client && p.client.person, p.client && p.client.company].filter(Boolean);
      var asked = askedTeachers(text, known, skip);
      p.teacherAsked = asked;
      if (!asked.length) return;
      return takeTeachers(p, asked, '문의에서 요청한 강사');
    });
  }

  function refPicks(p, refs, want, note) {
    var picks = refTeachers(refs);
    var names = picks.map(function (x) { return x.name; });
    /* 누가 어느 모듈을 맡았는지 적혀 있으면 기억해 둔다 — 아래에서 장 순서를 맞출 때 쓴다 */
    p.teacherDuty = {};
    picks.forEach(function (x) { if (x.duty) p.teacherDuty[x.name] = x.duty; });

    return takeTeachers(p, names.slice(0, want + 2), (refs || [])[0] && refs[0].name)
      .then(function () { return fillTeacherGap(p, want); })
      .then(function () { orderTeachers(p); note(); return (p.teacherIds || []).length; })
      .catch(function () { note(); return 0; });
  }

  /* ── 교수가 해 온 일 ─────────────────────────────────
     양식의 교수 소개 장에는 '[유사 프로젝트]' 표가 있다
     (연번 · 고객사 · 진행 시기 및 차수 · 대상자 · 핵심 주제).
     비워 내보내면 '이 교수가 뭘 해 봤는지' 가 통째로 빠진다.

     제안서 DB 425건에 건마다 추천 강사가 적혀 있으니, 고른 교수의 이름으로
     되짚어 그 교수가 들어간 건을 모은다. 우리가 지어내는 것이 아니라
     노션에 남아 있는 기록을 옮겨 적는 것이다.
     교수 이력이 없으면 이번 건과 비슷한 제안 건으로 채운다. */
  function rememberWork(p, all, refs) {
    var items = all || [];
    if (!items.length && !(refs || []).length) return;
    var mine = P.pickedTeachers(p);
    if (!mine.length) return;

    function row(x) {
      return {
        client: String(x.client || '').trim(),
        when: whenOf(x),
        target: (x.targets || []).join(' · '),
        topic: (x.keywords || []).slice(0, 3).join(' · ') || cleanCourse(x.name)
      };
    }

    var work = {};
    mine.forEach(function (t) {
      var got = items.filter(function (x) {
        var names = (x.teachers || []).join(' ') + ' ' + String(x.outside || '');
        return t.name && names.indexOf(t.name) !== -1;
      });
      /* 최근 것부터 — 실적은 최근 것이 설득력이 있다 */
      got.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
      work[t.name] = got.slice(0, 5).map(row).filter(function (r) { return r.client; });
    });

    /* 교수 이력이 없으면 비슷한 건으로 채운다 — 빈 표보다는 낫다 */
    var near = (refs || []).map(row).filter(function (r) { return r.client; });
    mine.forEach(function (t) {
      if (!(work[t.name] || []).length) work[t.name] = near.slice(0, 5);
    });

    p.teacherWork = work;
    P.update(p.id, {});
  }

  /* '2026-05-27T…' → '2026.05' */
  function whenOf(x) {
    var s = String(x.at || '');
    var m = /^(\d{4})-(\d{2})/.exec(s);
    var when = m ? m[1] + '.' + m[2] : '';
    var n = Number(x.sessions) || 0;
    if (n > 1) when += (when ? ' · ' : '') + n + '차수';
    else if (x.days) when += (when ? ' · ' : '') + String(x.days);
    return when;
  }
  function cleanCourse(name) {
    return String(name || '').replace(/^\s*\d{4}년?\s*/, '').trim();
  }

  /* 참고한 제안서에서 강사를 뽑는다.
     '추천 강사' 칸은 이름만 있고, '외부 강사/명사' 칸에는 누가 무엇을 맡았는지까지 적혀 있다 —
       "김혜인(과장 1일차 SHIFT), 김민경(과장 2일차 ACT), 강경옥(차장 1일차 전환)"
     그 괄호 안이 곧 '이 사람이 이 모듈을 한다' 는 말이라, 커리큘럼과 강사를
     짝지을 수 있는 유일한 단서다. 버리지 않고 같이 읽는다. */
  function refTeachers(refs) {
    var out = [], seen = {};
    function add(name, duty) {
      name = String(name || '').replace(/\s+/g, ' ').trim();
      /* '김혜인 교수', '김혜인 책임' 처럼 직함이 붙어 오기도 한다 */
      name = name.replace(/\s*(교수|강사|책임|대표|소장|원장|박사|위원)$/, '').trim();
      if (!name || name.length < 2 || name.length > 10) return;
      if (!/^[가-힣A-Za-z][가-힣A-Za-z.\s]*$/.test(name)) return;
      if (seen[name]) {
        if (duty && !seen[name].duty) seen[name].duty = duty;
        return;
      }
      seen[name] = { name: name, duty: duty || '' };
      out.push(seen[name]);
    }

    (refs || []).forEach(function (r) {
      /* 이름만 있는 칸 */
      (r.teachers || []).forEach(function (n) {
        String(n || '').split(/[,·\/]/).forEach(function (one) { add(one, ''); });
      });
      /* '이름(맡은 대목)' 으로 적힌 칸 — 괄호 안을 담당으로 읽는다 */
      String(r.outside || '').split(/,(?![^()]*\))/).forEach(function (chunk) {
        var m = /^\s*([^(]+?)\s*\(([^)]*)\)\s*$/.exec(chunk);
        if (m) add(m[1], m[2]);
        else add(chunk, '');
      });
    });
    return out;
  }

  /* Program Details 장이 몇 장 나오는지 = 교수 이름이 들어갈 자리 수.
     한 장에 모듈 둘이 들어가므로 모듈 6개면 3장이고 교수 자리도 3개다. */
  function teacherSeats(p) {
    var c = P.caps(p) || {};
    var room = Number(c.detailRoom) || 2;
    var n = (p.approach && p.approach.modules || []).length;
    return Math.max(1, Math.ceil(n / room));
  }

  /* 참고 건의 강사로 자리가 안 차면 스튜디오 명단에서 커리큘럼에 맞는 사람을 더 찾는다 */
  function fillTeacherGap(p, want) {
    var have = (p.teacherIds || []).length;
    if (have >= want) return Promise.resolve();
    /* 명단은 /api/teacher/list 가 준다 (/api/teacher/index 는 주제를 채우는 일꾼이라
       개수만 돌려준다 — 거기서 items 를 기대하면 늘 빈손이다). */
    return fetch('/api/teacher/list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(function (r) { return r.json(); }).then(function (d) {
      var list = (d && d.items) || [];
      if (!list.length) return;
      var rows = P.matchTeachers(curriculumText(p), list, want - have + 4);
      var mine = {};
      P.teachers().forEach(function (t) { if ((p.teacherIds || []).indexOf(t.id) >= 0) mine[t.name] = 1; });
      var add = rows.map(function (r) { return r.item.name; })
        .filter(function (n) { return n && !mine[n]; })
        .slice(0, want - have);
      if (!add.length) return;
      return takeTeachers(p, add, '커리큘럼에 맞는 강사');
    }).catch(function () {});
  }

  /* 강사를 찾는 기준은 우리가 쓴 커리큘럼이다 — 모듈 제목과 그 안의 소주제. */
  function curriculumText(p) {
    var ms = (p.approach && p.approach.modules) || [];
    return ms.map(function (m) {
      /* 상세에서는 소주제 줄('1) …')만 쓴다 — (이론)/(실습) 줄까지 넣으면
         '이론' '실습' 같은 흔한 말이 점수를 흐린다. */
      var sub = String(m.detail || '').split('\n')
        .filter(function (x) { return /^\s*\d\)/.test(x); })
        .join(' ').replace(/\d\)/g, ' ');
      return [m.title, sub, m.method].filter(Boolean).join(' ');
    }).join(' ') + ' ' + (p.title || '');
  }

  /* 장마다 그 장의 모듈에 가장 맞는 교수가 오도록 순서를 고친다.
     Program Details 는 k 번째 장에 k 번째 교수를 싣는다(store 의 detailSlots).
     그러니 순서를 맞춰 두면 '이 모듈을 이 사람이 한다' 가 장마다 맞는다. */
  function orderTeachers(p) {
    var ids = (p.teacherIds || []).slice();
    if (ids.length < 2) return;
    var room = Number((P.caps(p) || {}).detailRoom) || 2;
    var ms = (p.approach && p.approach.modules) || [];
    var pool = ids.map(function (id) { return P.teacherById(id); }).filter(Boolean);
    var duty = p.teacherDuty || {};
    var out = [];
    for (var page = 0; pool.length && page * room < ms.length; page++) {
      var mine = ms.slice(page * room, page * room + room);
      var text = mine.map(function (m) { return m.title + ' ' + (m.method || ''); }).join(' ');
      var best = 0, bestScore = -1;
      pool.forEach(function (t, i) {
        /* 문의가 이름을 댄 강사는 앞 장에 먼저 앉힌다 — 뒤로 밀리면 장이 모자라 빠진다 */
        var s = teacherFit(t, text, duty) + ((p.teacherAsked || []).indexOf(t.name) !== -1 ? 1000 : 0);
        if (s > bestScore) { bestScore = s; best = i; }
      });
      out.push(pool.splice(best, 1)[0]);
    }
    p.teacherIds = out.concat(pool).map(function (t) { return t.id; });
    P.update(p.id, {});
  }

  /* 이 교수가 이 모듈들에 얼마나 맞는지 — 겹치는 낱말 수로 센다.
     참고 제안서에 '김혜인(과장 2일차 ACT)' 처럼 맡은 대목이 적혀 있었으면
     그쪽을 훨씬 세게 본다. 그게 사람이 직접 적어 둔 짝이기 때문이다. */
  function teacherFit(t, text, duty) {
    var n = 0;
    var d = duty && duty[t.name];
    if (d) n += overlap(d, text) * 5;
    var hay = [t.field, t.record, t.career].filter(Boolean).join(' ');
    if (hay) n += overlap(hay, text);
    return n;
  }
  function overlap(hay, text) {
    var n = 0;
    String(text).split(/[\s·,()]+/).forEach(function (w) {
      if (w.length >= 2 && String(hay).indexOf(w) !== -1) n++;
    });
    return n;
  }

  /* ── 디스크에 남은 양식 되살리기 ──────────────────────
     양식 목록은 브라우저 안에만 있다. 그쪽이 비워지면 화면에서 양식이
     사라지지만, 올린 PPT 와 그림은 templates 폴더에 그대로 있다.
     그걸 세어 보고 한 번에 되돌릴 수 있게 한다. */
  var orphans = null;     /* null = 아직 안 물어봄 */

  function orphanNote() {
    if (orphans === null) {
      orphans = 'asking';
      fetch('/api/ppt/stored?kind=proposal').then(function (r) { return r.json(); })
        .then(function (d) {
          var have = {};
          P.templates().forEach(function (t) { if (t.fileId) have[t.fileId] = true; });
          orphans = (d.templates || []).filter(function (x) { return !have[x.id]; });
          if (orphans.length) g.Proposal.render();
        })
        .catch(function () { orphans = []; });
      return '';
    }
    if (orphans === 'asking' || !orphans.length) return '';
    return '<div class="warn-box orphan-box">' +
      /* 배포한 웹에서는 파일이 이 PC 가 아니라 웹 보관소에 있다 — '이 PC' 라고 하면 틀린 말이다.
         빠진 것은 이 브라우저에 적어 둔 양식 목록(장마다 무엇을 채울지)뿐이다. */
      '<b>보관소에 올려 둔 양식이 ' + orphans.length + '개 있습니다 — 이 브라우저의 목록에는 없습니다</b>' +
      '<div>올린 PPT 와 장별 그림은 보관소에 그대로 있습니다. 양식 목록은 브라우저마다 따로 적혀 있어서, ' +
        '다른 PC·브라우저에서 올렸거나 브라우저 기록을 지웠으면 여기에 보이지 않습니다. ' +
        '되살리면 장마다 무엇을 채울지는 다시 골라 주셔야 합니다.' +
        '<ul class="orphan-list">' + orphans.map(function (x) {
          return '<li><b>' + esc(x.id) + '</b> · ' + x.count + '장 · ' +
            (Math.round(x.size / 1024 / 1024 * 10) / 10) + 'MB · ' + esc(x.at) + '</li>';
        }).join('') + '</ul>' +
      '</div>' +
      '<button class="btn primary" data-restore-all type="button">' +
        orphans.length + '개 모두 되살리기</button>' +
    '</div>';
  }

  function restoreOrphans() {
    var list = (orphans && orphans.length) ? orphans.slice() : [];
    if (!list.length) return;
    var done = 0, failed = [];
    function step(i) {
      if (i >= list.length) {
        U.busy(false);
        orphans = null;                       /* 다시 세어 본다 */
        g.Proposal.render();
        if (done) U.toast(done + '개 양식을 되살렸습니다. 장마다 채울 내용을 골라 주세요', 'ok');
        if (failed.length) U.toast(failed[0], 'err');
        return;
      }
      U.busy(true, '양식을 다시 읽는 중… (' + (i + 1) + '/' + list.length + ')');
      /* 보관소에 장별 설정까지 있으면 그대로 가져온다 — 장마다 다시 고르지 않아도 된다 */
      if (list[i].hasSettings) {
        fetch('/api/ppt/settings?tid=' + encodeURIComponent(list[i].id))
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d || !d.ok || !d.settings) throw new Error('설정 없음');
            P.restoreFromSettings(d.settings);
            done++;
            step(i + 1);
          })
          .catch(function () { rescan(i); });
        return;
      }
      rescan(i);
    }
    function rescan(i) {
      /* 폴더에 적혀 있던 이름을 그대로 쓴다.
         이름을 안 넘기면 '되살린 양식 9993' 처럼 번호만 남아, 양식이 둘 이상일 때
         어느 것이 무엇인지 알 수 없다. */
      fetch('/api/ppt/rescan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: list[i].id, kind: list[i].kind || 'proposal',
          name: list[i].name || ''
        })
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || d.error) throw new Error(d.message || '읽지 못했습니다');
          P.templateFromPptx(d);
          done++;
        });
      }).catch(function (e) {
        failed.push(list[i].id + ' — ' + (e.message || '읽지 못했습니다'));
      }).then(function () { step(i + 1); });
    }
    step(0);
  }

  /* 제안서를 아직 안 골랐을 때의 양식 목록 — 올려 두고 정리만 한다 */
  function plainTplGrid() {
    return '<div class="tpl-grid">' + P.templates().map(function (t) {
      var cover = (t.slides || [])[0];
      var used = (t.slides || []).filter(function (s) { return s.src && s.src !== 'keep' && s.src !== 'skip'; }).length;
      var tocs = (t.slides || []);
      return '<button class="tpl-tile' + (openTpl === t.id ? ' on' : '') + '" data-open-tpl="' + esc(t.id) + '" type="button">' +
        '<span class="tt-thumb' + (cover && cover.thumb ? '' : ' tt-outline') + '">' +
          (cover && cover.thumb
            ? '<img src="' + esc(cover.thumb) + '" alt="양식 그림 없음" loading="lazy">'
            : '<span class="tt-toc">' + tocs.slice(0, 7).map(function (s, i) {
                return '<span><em>' + (i + 1) + '</em>' + esc(s.title || '') + '</span>';
              }).join('') + (tocs.length > 7 ? '<span class="tt-toc-more">+' + (tocs.length - 7) + '장</span>' : '') +
              '</span>') +
        '</span>' +
        '<span class="tt-body"><b>' + esc(t.name) + '</b>' +
          '<span>' + (t.slides || []).length + '장' +
            (t.kind === 'pptx' ? ' · 채울 장 ' + used + '개' : ' · 양식 없음') + '</span></span>' +
        (t.pinned ? U.badge('모든 PC 기본', 'ok') :
          t.builtin ? U.badge('기본', 'off') : (t.kind === 'pptx' ? U.badge('PPT 양식', 'type') : U.badge('목록만', 'off'))) +
      '</button>';
    }).join('') + '</div>';
  }

  /* 제안서 맨 뒤 연락처 장에 들어갈 내 정보.
     양식은 그 자리를 '인재개발센터 [성명] [직함] / Tel: 02-3274-[연락처 뒷번호] /
     E-mail : [이메일 주소]' 로 비워 두었다. 여기 한 번 적어 두면 제안서마다 채워진다.
     안 적으면 그 자리는 비어서 나간다 — 대괄호가 그대로 나가는 것보다는 낫지만
     연락처 없는 제안서가 되므로 한 번은 적어야 한다. */
  var ME_FIELDS = [
    /* 소속은 표지·맺음말·메일 서명에 그대로 박힌다.
       여기서 고칠 수 있어야 다른 부서도 이 도구를 그대로 쓴다. */
    /* 보기 글은 '예)' 를 붙인다. 실제 값처럼 적어 두었더니 빈칸이 이미 채워진 것으로 보였다. */
    { k: 'team', label: '소속', ph: '예) 인재개발센터' },
    { k: 'name', label: '성명', ph: '예) 홍길동' },
    { k: 'rank', label: '직함', ph: '예) 책임' },
    { k: 'tel', label: 'Tel 뒷번호', ph: '예) 02-3274- 뒤 네 자리', hint: '02-3274- 뒤 네 자리' },
    { k: 'email', label: 'E-mail', ph: '예) name@kma.or.kr' }
  ];

  function meCard() {
    var me = P.me();
    var missing = ME_FIELDS.filter(function (f) { return !String(me[f.k] || '').trim(); });
    return '<div class="tpl-me' + (missing.length ? ' warn' : '') + '">' +
      '<div class="tpl-me-head"><b>내 정보</b>' +
        '<span class="sub">제안서 맨 뒤 연락처 장에 들어갑니다' +
          (missing.length ? ' · <b>아직 ' + missing.length + '칸을 적지 않았습니다</b>' : '') +
        '</span></div>' +
      '<div class="tpl-me-row">' +
      ME_FIELDS.map(function (f) {
        return '<label>' + UI.esc(f.label) +
          '<input data-me="' + f.k + '" value="' + UI.esc(me[f.k] || '') + '" ' +
          'placeholder="' + UI.esc(f.ph) + '"></label>';
      }).join('') +
      '</div></div>';
  }

  /* 양식을 골랐다. 교육문의에서 막 만든 제안서면(pendingSeed) 이 양식 칸에 맞춰
     커리큘럼과 세부 내용을 곧바로 쓴다. */
  function pickedTpl(act, id) {
    act.templatePicked = true;
    P.update(act.id, { templateId: id });
    g.Proposal.go('write');
    if (act.pendingSeed && g.Shell && g.Shell.writeAll) {
      g.Shell.writeAll(act);
      return;
    }
    U.toast(P.template(id).name + ' 양식으로 만듭니다', 'ok');
  }

  /* ① 양식 — 고르는 곳이자 관리하는 곳.
     전에는 '템플릿' 이 맨 끝 탭이라, 내용을 다 쓰고 나서야 양식을 만났다.
     양식이 정해져야 무엇을 채울지가 정해지므로 맨 앞으로 옮겼다. */
  V.templates = function (host) {
    var p = P.active();
    if (openTpl && !P.templates().some(function (t) { return t.id === openTpl; })) openTpl = null;

    host.innerHTML =
      (p ? projBar(p) : '') +
      '<div class="view-head"><div><h1>템플릿</h1>' +
        '<p class="sub">쓰시는 <b>제안서 PPT 양식을 그대로 올리세요.</b> 양식 파일에 ' +
          '글자만 바꿔 넣으므로 회사 디자인이 그대로 남습니다.</p>' +
        (p && p.pendingSeed
          ? '<p class="tpl-first"><b>' + esc((p.client && p.client.company) || '이 문의') + ' 제안서에 쓸 양식을 골라 주세요.</b> ' +
            '고르면 그 양식 칸에 맞춰 커리큘럼과 세부 내용을 바로 씁니다.</p>'
          : '') + '</div>' +
        '<div class="head-actions">' +
          '<input type="file" id="tpl-file" hidden accept=".pptx" multiple>' +
          '<button class="btn primary" id="tpl-import" type="button">+ 템플릿 올리기</button>' +
        '</div></div>' +

      (relayNote()) +
      (orphanNote()) +
      (meCard()) +

      (p ? pickTemplateStep(p)
         : '<p class="pr-empty">제안서를 먼저 고르면 여기서 양식을 정할 수 있습니다. ' +
           '아래에서 양식을 올려 두는 것은 지금도 됩니다.</p>' + plainTplGrid()) +

      (openTpl ? tplDetail(P.template(openTpl)) : '');

    var fileInput = host.querySelector('#tpl-file');
    host.querySelector('#tpl-import').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(fileInput.files);
      fileInput.value = '';
      if (files.length) importTemplates(files);
    });

    host.addEventListener('change', function (e) {
      var ts = e.target.closest('[data-ts]');
      if (!ts) return;
      var parts = ts.dataset.ts.split(':');
      var t = P.template(parts[0]);
      if (!t) return;
      var sl = t.slides[Number(parts[1])];
      sl[parts[2]] = ts.value;
      /* 사람이 고른 것은 판정 규칙을 고쳐도 다시 덮어쓰지 않는다 */
      if (parts[2] === 'src') sl.picked = true;
      P.save(); g.Proposal.render();
    });

    host.addEventListener('input', function (e) {
      var mi = e.target.closest('[data-me]');
      if (mi) {
        var patch = {};
        patch[mi.dataset.me] = mi.value;
        /* 글자마다 다시 그리면 커서가 튄다 — 저장만 하고 화면은 그대로 둔다 */
        P.setMe(patch);
        return;
      }
      var ti = e.target.closest('[data-ts-text]');
      if (!ti) return;
      var parts = ti.dataset.tsText.split(':');
      var t = P.template(parts[0]);
      if (!t) return;
      t.slides[Number(parts[1])][parts[2]] = ti.value;
      P.save();
    });

    host.addEventListener('click', function (e) {
      /* 맨 위 프로젝트 띠 — '다른 건' · '프로젝트' · '결과보고서'.
         이 화면에만 처리가 빠져 있어서 눌러도 아무 일도 안 일어났다. */
      if (hitProjBar(e, P.active())) return;
      if (e.target.closest('[data-restore-all]')) { restoreOrphans(); return; }
      /* 고르면 곧바로 ② 내용으로 — 고르고 나서 어디로 가야 하는지 헤매지 않게 */
      var pk = e.target.closest('[data-pick-tpl]');
      if (pk) {
        var act = P.active();
        if (!act) { U.toast('먼저 제안서를 고르세요', 'err'); return; }
        pickedTpl(act, pk.dataset.pickTpl);
        return;
      }
      var sx = e.target.closest('[data-fix-tpl]');
      if (sx) { refreshTemplate(sx.dataset.fixTpl); return; }
      var sv = e.target.closest('[data-see-tpl]');
      if (sv) {
        seeTemplate(sv.dataset.seeTpl, function (id) {
          var a2 = P.active();
          if (!a2) { U.toast('먼저 제안서를 고르세요', 'err'); return; }
          pickedTpl(a2, id);
        });
        return;
      }
      var rg = e.target.closest('[data-reguess]');
      if (rg) {
        var force = rg.dataset.force === '1';
        var n = P.reguess(rg.dataset.reguess, force);
        g.Proposal.render();
        U.toast(n ? n + '장을 다시 알아봤습니다' : '바뀐 장이 없습니다', n ? 'ok' : '');
        return;
      }
      var el = e.target.closest('[data-open-tpl]');
      if (el) { openTpl = (openTpl === el.dataset.openTpl) ? null : el.dataset.openTpl; g.Proposal.render(); return; }
      el = e.target.closest('[data-pin-tpl]');
      if (el) {
        var ptpl = P.templates().filter(function (x) { return x.id === el.dataset.pinTpl; })[0];
        if (ptpl && P.setPinned(ptpl.id, !ptpl.pinned)) {
          g.Proposal.render();
          U.toast(ptpl.pinned ? '모든 PC 에서 이 양식을 씁니다' : '기본 양식에서 뺐습니다', 'ok');
        }
        return;
      }
      el = e.target.closest('[data-del-tpl]');
      if (el) {
        var t = P.template(el.dataset.delTpl);
        U.confirm((t ? t.name : '이 양식') + ' 을(를) 지울까요? 올린 PPT 파일과 그림도 함께 지워집니다.',
          { danger: true, ok: '삭제' }).then(function (ok) {
          if (!ok) return;
          if (t && t.fileId) {
            fetch('/api/ppt/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ templateId: t.fileId }) }).catch(function () {});
          }
          P.removeTemplate(el.dataset.delTpl);
          openTpl = null;
          g.Proposal.render();
        });
        return;
      }
      el = e.target.closest('[data-use-tpl]');
      if (el) {
        var act = P.active();
        if (!act) { U.toast('먼저 제안서를 고르세요', 'err'); return; }
        P.update(act.id, { templateId: el.dataset.useTpl });
        g.Proposal.go('write');
        U.toast('이 템플릿으로 바꿨습니다', 'ok');
      }
    });
  };

  /* 연결 상태를 아직 모르는 동안 경고부터 띄우면 거짓말이 된다.
     한 번 물어보고, 정말 안 될 때만 말한다.
     양식을 읽고 채우는 일은 이제 서버가 파일로 직접 한다(파워포인트·실행하기.bat 불필요).
     필요한 것은 서버에 닿는 것 하나뿐이다. */
  var noteRetry = 0;
  function relayNote() {
    var st = g.MailStore && g.MailStore.known();
    if (g.MailStore && (!st || st.reason === 'no_server')) {
      var now = Date.now();
      if (now - noteRetry > 3000) {
        noteRetry = now;
        g.MailStore.status(true).then(function (d) {
          if (!st || !d || d.reason !== st.reason) g.Proposal.render();
        });
      }
      if (!st) return '';
    }
    if (!st || st.reason !== 'no_server') return '';
    return '<div class="warn-box"><b>서버에 닿지 않아 양식을 올릴 수 없습니다</b>' +
      '<div>잠시 뒤 다시 시도해 주세요. 이 PC 에서 켠 서버라면 서버 창이 켜져 있는지 확인해 주세요.</div></div>';
  }

  function tplDetail(t) {
    if (!t) return '';
    if (t.kind !== 'pptx') {
      return '<section class="pr-card"><h3>' + esc(t.name) +
        (t.builtin ? '' : ' <button class="btn tiny ghost-danger" data-del-tpl="' + esc(t.id) + '" type="button">삭제</button>') +
        ' <button class="btn tiny" data-use-tpl="' + esc(t.id) + '" type="button">이 양식으로 쓰기</button></h3>' +
        '<p class="pr-hint">PPT 파일 없이 제목만 정해 둔 구성입니다. 이걸로 만들면 기본 디자인으로 나옵니다.</p>' +
        '<ol class="tpl-slides">' + (t.slides || []).map(function (s, i) {
          return '<li><span class="ts-no">' + (i + 1) + '</span>' +
            '<input class="ts-title" data-ts-text="' + esc(t.id) + ':' + i + ':title" value="' + esc(s.title) + '">' +
            '<select class="ts-src" data-ts="' + esc(t.id) + ':' + i + ':src">' + srcOptions(s.src) + '</select></li>';
        }).join('') + '</ol></section>';
    }

    return '<section class="pr-card tpl-detail">' +
      '<h3>' + esc(t.name) +
        ' <button class="btn tiny" data-use-tpl="' + esc(t.id) + '" type="button">이 양식으로 쓰기</button>' +
        /* 모든 PC 기본 양식 — 어느 PC·브라우저에서 로그인해도 설정째 들어간다 */
        (t.fileId ? ' <button class="btn tiny' + (t.pinned ? ' primary' : '') + '" data-pin-tpl="' + esc(t.id) + '" type="button">' +
          (t.pinned ? '✓ 모든 PC 기본 양식 (해제)' : '모든 PC 기본 양식으로') + '</button>' : '') +
        (t.pinned ? '' : '<button class="btn tiny ghost-danger" data-del-tpl="' + esc(t.id) + '" type="button">삭제</button>') + '</h3>' +
      (t.pinned ? '<p class="pr-hint">어느 PC·브라우저에서 로그인해도 이 양식이 목록에 들어갑니다. 여기서 바꾼 설정도 모두에게 반영됩니다.</p>' : '') +
      /* '이 양식에 남아 있는 예전 이름' 칸은 뺐다(사용자 요청 2026-10-09) — 파일을 만들기 전에
         AI 검수가 예전 고객사 이름을 찾아 이번 건으로 바꾼다. 예전에 적어 둔 값(t.swap)은 계속 쓴다. */
      '<p class="pr-hint">장마다 <b>무엇을 채울지</b> 고르세요. <b>그대로 두기</b>로 두면 양식에 있는 글이 그대로 나갑니다 ' +
        '(회사 소개·인사말처럼 안 바뀌는 장). <b>이 장 빼기</b>는 만들 때 지웁니다. ' +
        /* 판정 규칙을 고쳤을 때 42MB 를 다시 올리게 하지 않는다 */
        '<button class="link small" data-reguess="' + esc(t.id) + '" type="button">다시 알아보기</button>' +
        ' — 직접 고르신 장은 그대로 둡니다.' +
        /* 실수로 '그대로 두기' 를 눌러 둔 장은 규칙을 고쳐도 영영 안 바뀐다.
           왜 반영이 안 되는지 알 길이 없으므로 되돌릴 단추를 옆에 둔다. */
        ((t.slides || []).some(function (s) { return s.picked; })
          ? ' 직접 고른 장이 ' +
            (t.slides || []).filter(function (s) { return s.picked; }).length + '개 있습니다 — ' +
            '<button class="link small" data-reguess="' + esc(t.id) + '" data-force="1" ' +
            'type="button">그것까지 처음 판정으로 되돌리기</button>'
          : '') +
      '</p>' +
      '<div class="tpl-slidegrid">' + (t.slides || []).map(function (s, i) {
        return '<div class="tsl' + (s.src === 'skip' ? ' off' : '') + (s.src && s.src !== 'keep' && s.src !== 'skip' ? ' fill' : '') + '">' +
          '<div class="tsl-thumb"><img src="' + esc(s.thumb || '') + '" alt="그림 없음" loading="lazy">' +
            '<span class="tsl-no">' + s.no + '</span></div>' +
          '<div class="sel-wrap small"><select data-ts="' + esc(t.id) + ':' + i + ':src">' + srcOptions(s.src) + '</select></div>' +
          (s.src === 'free'
            ? '<input class="ts-free" data-ts-text="' + esc(t.id) + ':' + i + ':bullets" ' +
              'placeholder="고정 문구 (| 로 줄 나눔)" value="' + esc(s.bullets || '') + '">'
            : '') +
        '</div>';
      }).join('') + '</div></section>';
  }

  /* 양식 파일을 relay 로 보내 파워포인트가 읽게 한다 */
  function importTemplates(files) {
    var done = 0, failed = [];
    function step(i) {
      if (i >= files.length) {
        U.busy(false);
        g.Proposal.render();
        if (done) U.toast(done + '개 양식을 올렸습니다. 장마다 채울 내용을 골라 주세요', 'ok');
        if (failed.length) U.toast(failed[0], 'err');
        return;
      }
      var f = files[i];
      U.busy(true, U.withEta('양식을 읽는 중… (' + (i + 1) + '/' + files.length + ')', 15));
      g.Files.pack(f, f.name).then(function (v) {
        return fetch('/api/ppt/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: f.name.replace(/\.pptx$/i, ''), file: v, kind: 'proposal' })
        });
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || d.error) throw new Error(d.message || '양식을 읽지 못했습니다');
          P.templateFromPptx(d);
          done++;
        });
      }).catch(function (err) {
        failed.push(f.name + ' — ' + (err.message || '읽지 못했습니다'));
      }).then(function () { step(i + 1); });
    }
    step(0);
  }

  /* ── 문의 붙여넣기 ─────────────────────────────────
     홈페이지로 들어온 문의는 늘 같은 틀이라 사람이 옮겨 적을 이유가 없다.
     통째로 붙여넣으면 인원·기간·장소·주제를 뽑아 제안서를 만들어 둔다.
     무엇을 읽었는지 먼저 보여 주고, 확인한 다음에 만든다. */
  g.PropViews.pasteVoc = function (onDone) {
    /* 이미 열려 있으면 하나 더 띄우지 않는다.
       창이 겹쳐 쌓이면 뒤엣것을 일일이 닫아야 한다. */
    if (document.querySelector('.sheet-wrap[data-voc-sheet]')) return;

    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.setAttribute('data-voc-sheet', '1');
    host.innerHTML =
      '<div class="sheet wide">' +
        '<div class="sheet-head"><h2 class="sheet-title">문의 붙여넣기</h2>' +
          '<button class="icon-btn" data-no type="button">✕</button></div>' +
        '<div class="sheet-body">' +
          '<p class="sheet-note">받은 문의를 통째로 붙여넣으세요. ' +
            '인원·기간·장소·주제를 알아서 뽑아 제안서에 채웁니다.</p>' +
          '<div class="ff"><label>고객사 <i>필요</i></label>' +
            '<input id="voc-co" placeholder="회사 이름 — 문의 글에는 없어서 직접 넣어야 합니다"></div>' +
          '<div class="ff"><label>문의 원문</label>' +
            '<textarea id="voc-text" rows="9" placeholder="교육대상: 직원&#10;교육영역: ...&#10;예상인원: 약 30명&#10;..."></textarea></div>' +
          '<div id="voc-read"></div>' +
        '</div>' +
        '<div class="sheet-foot"><button class="btn big ghost" data-no type="button">취소</button>' +
          '<button class="btn big primary" data-ok type="button" disabled>이 문의로 제안서 만들기</button></div>' +
      '</div>';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });

    var ta = host.querySelector('#voc-text');
    var co = host.querySelector('#voc-co');
    var out = host.querySelector('#voc-read');
    var okBtn = host.querySelector('[data-ok]');
    var got = null;

    function read() {
      var text = ta.value.trim();
      got = text ? g.Voc.parse(text) : null;
      okBtn.disabled = !(got && got.ok && co.value.trim());

      if (!text) { out.innerHTML = ''; return; }
      if (!got.ok) {
        out.innerHTML = '<div class="warn-box"><b>문의 양식으로 보이지 않습니다</b>' +
          '<div>“교육대상: …” 처럼 <b>이름표: 값</b> 형태로 된 글이어야 읽을 수 있습니다. ' +
          '그래도 원문은 제안서의 문의 메모에 그대로 들어갑니다.</div></div>';
        okBtn.disabled = !co.value.trim();
        return;
      }
      var rows = g.Voc.rows(got).filter(function (r) { return r.value; });
      out.innerHTML =
        '<div class="voc-read"><h4>이렇게 읽었습니다</h4>' +
          '<div class="voc-grid">' + rows.map(function (r) {
            return '<div class="voc-cell"><span>' + esc(r.label) + '</span><b>' + esc(r.value) + '</b></div>';
          }).join('') + '</div>' +
          (got.missing.length
            ? '<p class="voc-miss">못 읽은 칸: ' + esc(got.missing.join(' · ')) + ' — 작성 화면에서 채우시면 됩니다.</p>'
            : '') +
        '</div>';
    }

    ta.addEventListener('input', read);
    co.addEventListener('input', read);
    setTimeout(function () { co.focus(); }, 80);

    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-no]') || e.target === host) return close();
      if (!e.target.closest('[data-ok]')) return;

      var company = co.value.trim();
      if (!company) { co.focus(); return; }
      var v = got || g.Voc.parse(ta.value);

      /* 붙여넣은 문의로 프로젝트와 제안서를 같이 만든다 — 여기까지 온 문의는
         쓰겠다고 정한 것이니, 프로젝트를 따로 만들게 하지 않고 바로 세운다. */
      var course = (v.topics[0] || '역량강화') + ' 과정';
      var p = P.create({ client: { company: company }, title: company + ' ' + course });
      g.Voc.applyTo(p, v);
      P.update(p.id, {});

      if (g.Projects) {
        var pj = g.Projects.create({
          client: { company: company }, course: course,
          stage: '제안준비', proposalId: p.id,
          ops: { headcount: v.headcount, period: v.period, place: v.place }
        });
        g.Projects.setActive(pj.id);
      }
      P.setActive(p.id);
      close();
      if (onDone) onDone(p);
      U.toast('문의를 옮겨 담았습니다. 양식을 고르면 바로 보낼 수 있습니다', 'ok');
    });
  };

  /* 그림 파일이 사라진 양식을 제자리에서 되살린다.
     templates/ 폴더는 작업 폴더 안의 실제 파일이라, 폴더를 옮기거나 지우면
     목록에는 양식이 남은 채 그림만 빈칸이 된다. 그때 새로 올리면
     장마다 골라 둔 '무엇을 채울지' 설정이 통째로 날아간다.
     같은 pptx 를 다시 읽어 그림 경로만 갈아 끼우고 설정은 그대로 둔다. */
  function refreshTemplate(id) {
    var t = P.template(id);
    if (!t) return;
    var pick = document.createElement('input');
    pick.type = 'file';
    pick.accept = '.pptx';
    pick.addEventListener('change', function () {
      var f = pick.files[0];
      if (!f) return;
      U.busy(true, '양식을 다시 읽는 중…');
      g.Files.pack(f, f.name).then(function (v) {
        return fetch('/api/ppt/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: t.name, file: v })
        });
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok || d.error) throw new Error(d.message || '양식을 읽지 못했습니다');

          /* 장 번호로 짝을 맞춘다. 장 수가 달라졌으면 없는 장은 그냥 둔다. */
          var byNo = {};
          (d.slides || []).forEach(function (s) { byNo[s.no] = s; });
          var kept = 0;
          var slides = (t.slides || []).map(function (s) {
            var fresh = byNo[s.no];
            if (!fresh) return s;
            kept++;
            s.thumb = fresh.thumb;
            s.full = fresh.full || fresh.thumb;
            return s;
          });
          P.updateTemplate(id, { fileId: d.id, dir: d.dir, slides: slides });
          U.busy(false);
          g.Proposal.render();
          U.toast('양식 그림을 되살렸습니다 (' + kept + '장). 골라 두신 설정은 그대로입니다', 'ok');
        });
      }).catch(function (err) {
        U.busy(false);
        U.toast(err.message || '양식을 읽지 못했습니다', 'err');
      });
    });
    pick.click();
  }
})(window);
