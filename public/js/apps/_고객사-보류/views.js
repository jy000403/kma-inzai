/* views.js — 고객사 관리 화면 (재접촉 대상 / 고객사 / 설정) */
(function (g) {
  'use strict';

  var C = g.CustStore, U = g.UI, esc = U.esc;
  var V = g.CustViews = {};

  var STATUS_TONE = {
    '수주성공': 'ok', '컨택완료': 'type', '잠재고객': 'warn',
    '수주실패': 'err', '진행철회': 'off', '진행없음': 'off', '일반문의': ''
  };

  function statusBadge(s) { return s ? U.badge(s, STATUS_TONE[s] || '') : ''; }

  /* ── 연결 안내 ────────────────────────────────────── */

  V.setupGuide = function (reason, tokenFile) {
    var noRelay = reason === 'no_relay';
    return '<div class="setup">' +
      '<div class="setup-head">' +
        '<span class="setup-ic">' + U.icon('backup', 22) + '</span>' +
        '<div><b>' + (noRelay ? '노션에 연결하려면 “실행하기.bat” 으로 열어 주세요' : '노션 토큰을 넣어 주세요') + '</b>' +
        '<span>' + (noRelay
          ? '브라우저는 보안 정책(CORS) 때문에 노션을 직접 부를 수 없습니다. 이 PC 안에서만 도는 작은 중계 서버가 대신 불러 줍니다.'
          : '토큰은 이 PC 파일에만 저장됩니다. 브라우저 코드나 서버로는 절대 올라가지 않습니다.') + '</span></div>' +
      '</div>' +
      '<ol class="setup-steps">' +
        (noRelay
          ? '<li><b>폴더에서 <code>실행하기.bat</code> 을 더블클릭</b><span>브라우저가 자동으로 열립니다. 이후 단계는 그 화면에서 이어서 하세요.</span></li>'
          : '') +
        '<li><b>노션 Integration 만들기</b><span><a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener">notion.so/my-integrations</a> → New integration → 이름 아무거나 → 저장 후 <b>Internal Integration Token</b> 복사</span></li>' +
        '<li><b>DB에 연결 추가</b><span>노션에서 <b>📋 2팀 VOC - AI 리더십 영업 트래킹</b> 열기 → 우측 상단 <b>…</b> → <b>연결(Connections)</b> → 방금 만든 integration 추가</span></li>' +
        '<li><b>토큰 붙여넣기</b><span>폴더의 <code>notion-token.txt</code> 를 메모장으로 열어 맨 아래에 토큰을 붙여넣고 저장' +
          (tokenFile ? '<br><code class="path">' + esc(tokenFile) + '</code>' : '') + '</span></li>' +
        '<li><b>다시 실행 후 동기화</b><span>창을 닫았다가 <code>실행하기.bat</code> 을 다시 실행하고, 이 화면에서 <b>동기화</b>를 누르세요.</span></li>' +
      '</ol>' +
      '<p class="setup-note">연결 전에도 나머지 도구(증빙·과정·사진)는 그대로 쓸 수 있습니다.</p>' +
    '</div>';
  };

  /* ── 재접촉 대상 ──────────────────────────────────── */

  V.followups = function (host) {
    var st = C.state();
    var now = new Date();
    var list = C.followUps(now);
    var groups = {};
    list.forEach(function (r) { (groups[r.bucket] = groups[r.bucket] || []).push(r); });

    var order = ['now', 'soon', 'past', 'later', 'unknown'];
    var shown = order.filter(function (k) { return groups[k] && groups[k].length; });

    host.innerHTML =
      '<div class="view-head">' +
        '<div><h1>재접촉 대상</h1>' +
        '<p class="sub">작년 이맘때 문의가 있었는데 올해는 아직 연락이 없는 곳입니다. ' +
          '문의월보다 <b>' + (st.settings.leadMonths || 0) + '개월</b> 앞서 연락하는 기준으로 정렬했습니다.</p></div>' +
      '</div>' +

      (!st.rows.length
        ? U.empty('아직 동기화한 자료가 없습니다', '위의 동기화 버튼을 눌러 노션에서 불러오세요')
        : !list.length
          ? U.empty('지금 재접촉할 곳이 없습니다', '올해 이미 문의가 들어왔거나, 대상 상태에 해당하는 건이 없습니다')
          : shown.map(function (k) {
              var meta = C.BUCKETS[k];
              return '<section class="fu-group">' +
                '<h3>' + esc(meta.label) + ' <em>' + groups[k].length + '</em></h3>' +
                '<div class="fu-list">' + groups[k].map(card).join('') + '</div>' +
              '</section>';
            }).join(''));

    bindCards(host);
  };

  function card(r) {
    var n = C.note(r.id);
    var when = (r.year || '') + ' ' + (r.month || '');
    var timing = r.bucket === 'now' ? '지금' :
                 r.bucket === 'soon' ? (r.monthsAway + '개월 뒤') :
                 r.bucket === 'past' ? '시기 지남' : '';

    return '<article class="fu-card' + (n && n.action === '연락함' ? ' done' : '') + (n && n.action === '보류' ? ' hold' : '') + '" data-row="' + esc(r.id) + '">' +
      '<div class="fu-top">' +
        '<b class="fu-co">' + esc(r.company || '(회사명 없음)') + '</b>' +
        statusBadge(r.status) +
        (timing ? '<span class="fu-timing ' + r.bucket + '">' + esc(timing) + '</span>' : '') +
        (n && n.action ? '<span class="fu-note-tag">' + esc(n.action) + '</span>' : '') +
        '<span class="spacer"></span>' +
        (r.url ? '<a class="btn tiny" href="' + esc(r.url) + '" target="_blank" rel="noopener">노션</a>' : '') +
      '</div>' +

      '<div class="fu-when">' + esc(when) + ' 문의' +
        (r.channel ? ' · ' + esc(r.channel) : '') +
        (r.courses && r.courses.length ? ' · ' + esc(r.courses.join(', ')) : '') + '</div>' +

      (r.subject ? '<div class="fu-subject">' + esc(r.subject) + '</div>' : '') +
      (r.detail ? '<p class="fu-detail">' + esc(r.detail.length > 220 ? r.detail.slice(0, 220) + '…' : r.detail) + '</p>' : '') +

      '<div class="fu-contact">' +
        (r.person ? '<span>' + esc(r.person) + (r.rank ? ' ' + esc(r.rank) : '') + (r.dept ? ' · ' + esc(r.dept) : '') + '</span>' : '') +
        (r.email ? '<button class="chip-btn" data-copy="' + esc(r.email) + '">' + esc(r.email) + '</button>' : '') +
        (r.phone ? '<button class="chip-btn" data-copy="' + esc(r.phone) + '">' + esc(r.phone) + '</button>' : '') +
      '</div>' +

      (n && n.memo ? '<div class="fu-memo">' + esc(n.memo) + '</div>' : '') +

      '<div class="fu-actions">' +
        '<button class="btn tiny" data-act="연락함" type="button">연락함</button>' +
        '<button class="btn tiny" data-act="보류" type="button">보류</button>' +
        '<button class="btn tiny ghost-danger" data-act="올해 안 함" type="button">올해 안 함</button>' +
        '<button class="btn tiny" data-memo type="button">메모</button>' +
        (n && n.action ? '<button class="btn tiny" data-act="" type="button">되돌리기</button>' : '') +
      '</div>' +
    '</article>';
  }

  function bindCards(host) {
    host.addEventListener('click', function (e) {
      var copy = e.target.closest('[data-copy]');
      if (copy) {
        navigator.clipboard.writeText(copy.dataset.copy)
          .then(function () { U.toast('복사했습니다 · ' + copy.dataset.copy, 'ok'); })
          .catch(function () { U.toast('복사에 실패했습니다', 'err'); });
        return;
      }
      var card = e.target.closest('[data-row]');
      if (!card) return;
      var id = card.dataset.row;

      var act = e.target.closest('[data-act]');
      if (act) {
        C.setNote(id, { action: act.dataset.act });
        g.Customers.render();
        if (act.dataset.act) U.toast(act.dataset.act + '으로 표시했습니다', 'ok');
        return;
      }
      if (e.target.closest('[data-memo]')) {
        var cur = C.note(id) || {};
        U.form({
          title: '메모',
          fields: [{ key: 'memo', label: '통화·메일 내용', type: 'textarea', rows: 4, span: 2,
            placeholder: '예) 9/16 통화 — 올해는 11월경 팀빌딩 검토 중, 10월 말 제안서 요청' }],
          values: { memo: cur.memo || '' }
        }).then(function (d) {
          if (!d) return;
          C.setNote(id, { memo: d.memo });
          g.Customers.render();
        });
      }
    });
  }

  /* ── 고객사 목록 ──────────────────────────────────── */

  var q = '';

  V.companies = function (host) {
    var st = C.state();
    var all = C.companies();
    var key = q.trim().toLowerCase();
    var list = !key ? all : all.filter(function (c) {
      if (c.name.toLowerCase().indexOf(key) !== -1) return true;
      return c.rows.some(function (r) {
        return (r.subject + ' ' + r.detail + ' ' + r.person + ' ' + r.tag).toLowerCase().indexOf(key) !== -1;
      });
    });

    host.innerHTML =
      '<div class="view-head">' +
        '<div><h1>고객사</h1><p class="sub">회사별 문의 이력입니다. 문의 내용·담당자 이름으로도 찾을 수 있습니다.</p></div>' +
        '<div class="head-actions"><input data-q value="' + esc(q) + '" placeholder="회사 · 문의내용 · 담당자 검색"></div>' +
      '</div>' +
      '<div class="count-bar"><b>' + list.length + '곳</b>' +
        '<span class="sub">문의 ' + st.rows.length + '건' + (key ? ' 중 검색 결과' : '') + '</span></div>' +
      (list.length ? '<div class="co-list">' + list.slice(0, 200).map(coRow).join('') + '</div>'
                   : U.empty('찾는 고객사가 없습니다', '다른 검색어로 시도해 보세요'));

    var input = host.querySelector('[data-q]');
    if (input) {
      input.addEventListener('input', function (e) {
        q = e.target.value;
        var pos = e.target.selectionStart;
        g.Customers.render();
        var el = document.querySelector('[data-q]');
        if (el) { el.focus(); el.setSelectionRange(pos, pos); }
      });
    }
    host.addEventListener('click', function (e) {
      var t = e.target.closest('.co-head');
      if (t) t.parentElement.classList.toggle('open');
    });
  };

  function coRow(c) {
    return '<div class="co-item">' +
      '<button class="co-head" type="button">' +
        '<b>' + esc(c.name) + '</b>' +
        (c.won ? U.badge('수주 이력', 'ok') : '') +
        '<span class="co-years">' + esc(c.years.join(' · ')) + '</span>' +
        '<span class="co-count">문의 ' + c.rows.length + '건</span>' +
        '<span class="spacer"></span>' +
        '<span class="co-arrow">' + U.icon('chevron', 16) + '</span>' +
      '</button>' +
      '<div class="co-body">' + c.rows.map(function (r) {
        return '<div class="co-row">' +
          '<span class="cr-when">' + esc((r.year || '') + ' ' + (r.month || '')) + '</span>' +
          statusBadge(r.status) +
          '<span class="cr-subject">' + esc(r.subject || r.detail.slice(0, 60) || '(제목 없음)') + '</span>' +
          '<span class="cr-person">' + esc(r.person || '') + '</span>' +
          (r.url ? '<a class="btn tiny" href="' + esc(r.url) + '" target="_blank" rel="noopener">노션</a>' : '') +
        '</div>';
      }).join('') + '</div>' +
    '</div>';
  }

  /* ── 설정 ─────────────────────────────────────────── */

  V.settings = function (host, relayState) {
    var st = C.state();
    host.innerHTML =
      '<div class="view-head"><div><h1>설정</h1>' +
        '<p class="sub">재접촉 대상을 고르는 기준과 노션 연결을 설정합니다.</p></div></div>' +

      '<section class="panel"><div class="panel-head"><h2>연결</h2></div><div class="panel-body">' +
        '<div class="calc-row"><span>중계 서버</span>' +
          (relayState && relayState.relay ? '<span class="ok-txt">연결됨</span>' : '<span class="err-txt">없음 · 실행하기.bat 으로 열어 주세요</span>') + '</div>' +
        '<div class="calc-row"><span>노션 토큰</span>' +
          (relayState && relayState.hasToken ? '<span class="ok-txt">설정됨</span>' : '<span class="err-txt">없음</span>') + '</div>' +
        '<div class="calc-row"><span>마지막 동기화</span><code>' +
          (st.syncedAt ? esc(U.dateTime(new Date(st.syncedAt).getTime())) : '없음') + '</code></div>' +
        '<div class="calc-row"><span>데이터베이스 ID</span><code>' + esc(st.settings.databaseId) + '</code>' +
          '<button class="btn tiny" data-edit-db type="button">변경</button></div>' +
      '</div></section>' +

      '<section class="panel"><div class="panel-head"><h2>재접촉 기준</h2></div><div class="panel-body">' +
        '<div class="calc-row"><span>연락 시점</span><code>작년 문의월보다 ' + (st.settings.leadMonths || 0) + '개월 앞서</code>' +
          '<button class="btn tiny" data-edit-lead type="button">변경</button></div>' +
        '<div class="calc-row"><span>포함 상태</span><code>' + esc((st.settings.statuses || []).join(' · ')) + '</code>' +
          '<button class="btn tiny" data-edit-status type="button">변경</button></div>' +
        '<div class="calc-row"><span>수주성공 건</span>' +
          '<code>' + (st.settings.includeWon ? '재구매 제안으로 함께 표시' : '제외') + '</code>' +
          '<button class="btn tiny" data-toggle-won type="button">' + (st.settings.includeWon ? '제외하기' : '포함하기') + '</button></div>' +
        '<p class="hint">올해 이미 문의가 들어온 회사는 자동으로 빠집니다.</p>' +
      '</div></section>' +

      (relayState && relayState.hasToken ? '' : V.setupGuide(relayState && relayState.relay ? 'no_token' : 'no_relay', relayState && relayState.tokenFile));

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-edit-db]')) {
        U.form({ title: '데이터베이스 ID', fields: [{ key: 'databaseId', label: '노션 DB ID', type: 'text', required: true, span: 2,
          hint: '노션 DB 주소의 32자리 부분입니다.' }], values: { databaseId: st.settings.databaseId } })
          .then(function (d) { if (d) { C.set({ databaseId: d.databaseId.trim() }); g.Customers.render(); } });
        return;
      }
      if (e.target.closest('[data-edit-lead]')) {
        U.form({ title: '연락 시점', fields: [{ key: 'leadMonths', label: '문의월보다 몇 달 앞서 연락할까요', type: 'number', required: true,
          hint: '예) 1 → 작년 11월 문의 건은 올해 10월에 연락' }], values: { leadMonths: st.settings.leadMonths } })
          .then(function (d) { if (d) { C.set({ leadMonths: Math.max(0, Math.min(6, d.leadMonths || 0)) }); g.Customers.render(); } });
        return;
      }
      if (e.target.closest('[data-edit-status]')) {
        U.form({ title: '포함할 진행상태', wide: true,
          fields: [{ key: 'statuses', label: '재접촉 대상에 넣을 상태', type: 'multiselect', span: 2,
            options: C.ALL_STATUSES.filter(function (s) { return s !== '수주성공'; }) }],
          values: { statuses: st.settings.statuses } })
          .then(function (d) { if (d) { C.set({ statuses: d.statuses }); g.Customers.render(); } });
        return;
      }
      if (e.target.closest('[data-toggle-won]')) {
        C.set({ includeWon: !st.settings.includeWon });
        g.Customers.render();
      }
    });
  };
})(window);
