/* views-ops.js — 체크리스트 / 객실·조편성 / 운영 차량 / 운영 지식 / 미결 질문 / 규칙·표기 / 이력·백업 */
(function (g) {
  'use strict';

  var S = g.Store, R = g.Rules, U = g.UI, esc = U.esc, SEED = g.OpsSeed;
  var V = g.OpsViews;

  function sessionOptions() { return V._sessionOptions(); }

  /* ════════ 체크리스트 ══════════════════════════════ */

  var openList = null;

  V.createChecklist = function (sessionId, d) {
    var cl = S.insert('checklists', { sessionId: sessionId, templateType: d.templateType, title: d.title });
    if (d.copyFrom) {
      S.all('checklistItems').filter(function (i) { return i.checklistId === d.copyFrom; }).forEach(function (i) {
        if (!d.copyExcluded && (i.status === '불필요(제외)' || i.status === '논의 필요')) return;
        S.insert('checklistItems', Object.assign({}, i, {
          id: S.uid('ci'), checklistId: cl.id, checked: false,
          status: i.status === '완료' ? '미착수' : i.status
        }));
      });
    }
    /* BR-07 — 주차 항목이 없으면 자동으로 넣는다 (CHK-09) */
    var has = S.all('checklistItems').some(function (i) { return i.checklistId === cl.id && /주차/.test(i.name || ''); });
    if (!has) {
      S.insert('checklistItems', {
        checklistId: cl.id, name: '주차 안내 계획', category: '기타·비상', classification: '검토',
        status: '미착수', checked: false, note: 'BR-07 — 버스 미운행, 참가자 개별 차량 이동', area: '', owner: '', role: '', dueDate: '', qty: null, qtyFormula: ''
      });
    }
    openList = cl.id;
    return cl;
  };

  V.checklists = function (host, params) {
    if (params && params.id) openList = params.id;
    var lists = S.all('checklists');
    /* 데이터 되돌리기·가져오기로 id 가 사라졌을 수 있으므로 매번 확인한다 */
    if (!S.get('checklists', openList)) openList = lists.length ? lists[0].id : null;
    var cl = S.get('checklists', openList);

    host.innerHTML =
      '<div class="view-head"><h1>체크리스트</h1>' +
        '<div class="head-actions">' +
          (cl ? '<button class="btn" data-copy type="button">다른 차수로 복제</button>' : '') +
          (cl ? '<button class="btn" data-export-md type="button">Markdown 복사</button>' : '') +
        '</div></div>' +
      '<div class="split">' +
        '<aside class="side-list">' +
          lists.map(function (c) {
            var s = S.get('sessions', c.sessionId);
            return '<button class="side-item' + (c.id === openList ? ' on' : '') + '" data-open="' + c.id + '" type="button">' +
              '<b>' + esc(c.title) + '</b><span>' + esc(s ? R.sessionLabel(s) : '차수 없음') + ' · 템플릿 ' + esc(c.templateType) + '</span></button>';
          }).join('') +
          (lists.length ? '' : '<p class="empty small">체크리스트가 없습니다. 차수 화면에서 만들 수 있습니다.</p>') +
        '</aside>' +
        '<div class="side-body">' + (cl ? listBody(cl) : '') + '</div>' +
      '</div>';

    bindChecklists(host);
  };

  function listBody(cl) {
    var items = S.all('checklistItems').filter(function (i) { return i.checklistId === cl.id; });
    var session = S.get('sessions', cl.sessionId);
    var live = items.filter(function (i) { return i.status !== '불필요(제외)'; });
    var done = live.filter(function (i) { return i.checked || i.status === '완료'; });
    var pct = live.length ? Math.round(done.length / live.length * 100) : 0;

    var groups = {};
    var groupKey = cl.templateType === 'B' ? 'category' : 'area';
    items.forEach(function (i) { (groups[i[groupKey] || '미분류'] = groups[i[groupKey] || '미분류'] || []).push(i); });
    var order = (cl.templateType === 'B' ? SEED.CHECKLIST_CATEGORIES : Object.keys(groups)).concat(['미분류']);
    var keys = Object.keys(groups).sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    return '<div class="list-head">' +
        '<h2>' + esc(cl.title) + '</h2>' +
        '<div class="progress"><div class="bar"><span style="width:' + pct + '%"></span></div>' +
          '<span class="sub">' + done.length + ' / ' + live.length + ' (' + pct + '%)' +
          (items.length - live.length ? ' · 제외 ' + (items.length - live.length) + '건' : '') + '</span></div>' +
        '<button class="btn primary" data-add-item type="button">+ 항목 추가</button>' +
      '</div>' +
      (session && session.status === '완료' ? '<p class="warn-box">이 차수는 이미 종료되었습니다(' + esc(R.rangeLabel(session)) + '). 항목을 추가하면 대상 차수를 다시 확인하세요. (PRG-06)</p>' : '') +
      keys.map(function (k) {
        return '<div class="cl-group"><h4>' + esc(k) + ' <span class="sub">' + groups[k].length + '</span></h4>' +
          '<ul class="cl-items">' + groups[k].map(function (i) { return itemRow(i, cl, session); }).join('') + '</ul></div>';
      }).join('');
  }

  function itemRow(i, cl, session) {
    var off = i.status === '불필요(제외)';
    var hold = i.status === '논의 필요';
    var qty = '';
    if (i.qtyFormula) {
      var res = R.evalQty(i.qtyFormula, { 인원: session ? session.headcount : null });
      if (res && res.value !== null) qty = U.num(res.value) + ' <span class="sub">(' + esc(i.qtyFormula) + ')</span>';
      else qty = U.unknown('수량 확인 필요') + ' <span class="sub">' + esc(i.qtyFormula) + '</span>';
    } else if (i.qty || i.qty === 0) qty = U.num(i.qty);

    return '<li class="cl-item' + (off ? ' off' : '') + (hold ? ' hold' : '') + '" data-item="' + i.id + '">' +
      '<input type="checkbox" data-check="' + i.id + '"' + (i.checked ? ' checked' : '') + (off ? ' disabled' : '') + '>' +
      '<span class="ci-name">' + esc(i.name) + '</span>' +
      '<span class="ci-tag">' + (i.classification ? U.badge(i.classification, i.classification === '검토' ? 'warn' : '') : '') + '</span>' +
      '<span class="ci-qty">' + qty + '</span>' +
      (cl.templateType === 'A' ? '<span class="ci-owner">' + esc(i.owner || '') + '</span><span class="ci-due">' + esc(i.dueDate || '') + '</span>' : '<span class="ci-owner">' + esc(i.owner || '') + '</span>') +
      '<span class="ci-status">' + U.badge(i.status, off ? 'off' : hold ? 'warn' : i.status === '완료' ? 'ok' : '') + '</span>' +
      '<span class="ci-note">' + esc(i.note || '') + '</span>' +
      '<button class="btn tiny" data-edit-item="' + i.id + '" type="button">편집</button>' +
      '<button class="btn tiny ghost-danger" data-del-item="' + i.id + '" type="button">삭제</button>' +
    '</li>';
  }

  function itemFields(cl) {
    var base = [
      { key: 'name', label: cl.templateType === 'B' ? '준비물' : '항목', type: 'text', required: true, span: 2 },
      { key: 'classification', label: '구분', type: 'select', required: true, options: SEED.CLASSIFICATIONS,
        hint: '요청 = 직접 지정 / 세부 = 요청 항목의 하위 구성 / 검토 = 필요 여부 판단 필요' },
      { key: 'status', label: '상태', type: 'select', required: true, options: SEED.ITEM_STATUS }
    ];
    if (cl.templateType === 'B') {
      base.push({ key: 'category', label: '분류', type: 'select', required: true, options: SEED.CHECKLIST_CATEGORIES });
      base.push({ key: 'qty', label: '수량', type: 'number' });
      base.push({ key: 'qtyFormula', label: '수량 산식', type: 'text', span: 2, hint: '확정 값으로만 계산합니다. 사용 가능: {인원}. 예) {인원}+5' });
    } else {
      base.push({ key: 'area', label: '영역', type: 'text' });
      base.push({ key: 'role', label: 'R&R', type: 'text' });
      base.push({ key: 'dueDate', label: '마감일', type: 'date' });
    }
    base.push({ key: 'owner', label: '담당자', type: 'text' });
    base.push({ key: 'note', label: '비고', type: 'textarea', span: 2 });
    return base;
  }

  function bindChecklists(host) {
    host.addEventListener('click', function (e) {
      var t = e.target;
      var op = t.closest('[data-open]');
      if (op) { openList = op.dataset.open; g.Ops.render(); return; }

      var cl = S.get('checklists', openList);
      if (!cl) return;
      var session = S.get('sessions', cl.sessionId);

      if (t.closest('[data-add-item]')) {
        var go = function () {
          U.form({ title: '항목 추가', fields: itemFields(cl), values: { status: '미착수', classification: '요청', category: '기타·비상' }, wide: true })
            .then(function (d) {
              if (!d) return;
              S.insert('checklistItems', Object.assign({ checklistId: cl.id, checked: false }, d));
              g.Ops.render();
            });
        };
        if (session && session.status === '완료') {
          U.confirm(R.sessionLabel(session) + '는 ' + R.rangeLabel(session) + '에 종료된 차수입니다. 이 차수에 항목을 추가할까요?', { title: '대상 차수 확인' })
            .then(function (ok) { if (ok) go(); });
        } else go();
        return;
      }
      var ei = t.closest('[data-edit-item]');
      if (ei) {
        var rec = S.get('checklistItems', ei.dataset.editItem);
        U.form({ title: '항목 편집', fields: itemFields(cl), values: rec, wide: true })
          .then(function (d) { if (d) { S.update('checklistItems', rec.id, d, '체크리스트 편집'); g.Ops.render(); } });
        return;
      }
      var di = t.closest('[data-del-item]');
      if (di) {
        U.confirm('삭제 대신 상태를 "불필요(제외)"로 바꾸면 결정 이력이 남습니다. 그래도 숨길까요?', { danger: true, ok: '숨기기' })
          .then(function (ok) { if (ok) { S.remove('checklistItems', di.dataset.delItem, '체크리스트에서 삭제'); g.Ops.render(); } });
        return;
      }
      if (t.closest('[data-copy]')) {
        U.form({
          title: '다른 차수로 복제',
          fields: [
            { key: 'sessionId', label: '대상 차수', type: 'select', required: true, options: sessionOptions() },
            { key: 'title', label: '제목', type: 'text', required: true, span: 2 },
            { key: 'copyExcluded', label: '제외·논의 항목', type: 'checkbox', checkLabel: '이전 차수의 제외·논의 결정도 함께 복제' }
          ],
          values: { title: cl.title + ' (복제)', copyExcluded: true }
        }).then(function (d) {
          if (!d) return;
          V.createChecklist(d.sessionId, { templateType: cl.templateType, title: d.title, copyFrom: cl.id, copyExcluded: d.copyExcluded });
          g.Ops.render();
          U.toast('복제했습니다.', 'ok');
        });
        return;
      }
      if (t.closest('[data-export-md]')) {
        var md = toMarkdown(cl);
        navigator.clipboard.writeText(md)
          .then(function () { U.toast('Markdown을 클립보드에 복사했습니다. 노션에 붙여넣으세요.', 'ok'); })
          .catch(function () { U.toast('복사에 실패했습니다.', 'err'); });
      }
    });

    host.addEventListener('change', function (e) {
      var c = e.target.closest('[data-check]');
      if (!c) return;
      S.update('checklistItems', c.dataset.check, { checked: c.checked, status: c.checked ? '완료' : '미착수' }, '현장 체크');
      g.Ops.render();
    });
  }

  function toMarkdown(cl) {
    var items = S.all('checklistItems').filter(function (i) { return i.checklistId === cl.id; });
    var session = S.get('sessions', cl.sessionId);
    var head = cl.templateType === 'B'
      ? ['준비물', '챙김', '분류', '수량', '담당자', '구분', '비고']
      : ['항목', '영역', 'R&R', '담당자', '마감일', '상태', '완료', '비고'];
    var lines = ['# ' + R.lintText(cl.title), '', session ? '- 차수: ' + R.sessionLabel(session) + ' ' + R.rangeLabel(session) : '', '',
      '| ' + head.join(' | ') + ' |', '|' + head.map(function () { return '---'; }).join('|') + '|'];
    items.forEach(function (i) {
      var qty = i.qtyFormula ? (R.evalQty(i.qtyFormula, { 인원: session ? session.headcount : null }) || {}).value : i.qty;
      var row = cl.templateType === 'B'
        ? [i.name, i.checked ? '✅' : '', i.category, qty === null || qty === undefined ? '' : qty, i.owner, i.classification, i.status === '미착수' ? i.note : (i.status + (i.note ? ' · ' + i.note : ''))]
        : [i.name, i.area, i.role, i.owner, i.dueDate, i.status, i.checked ? '✅' : '', i.note];
      lines.push('| ' + row.map(function (c) { return R.lintText(c === null || c === undefined ? '' : c); }).join(' | ') + ' |');
    });
    return lines.join('\n');
  }

  /* ════════ 객실 · 조편성 ═══════════════════════════ */

  var roomSession = null;

  V.rooms = function (host) {
    var sessions = S.all('sessions');
    if (!S.get('sessions', roomSession)) {
      var withAsg = sessions.filter(function (s) { return S.all('assignments').some(function (a) { return a.sessionId === s.id; }); })[0];
      roomSession = (withAsg || sessions[0] || {}).id;
    }
    var s = S.get('sessions', roomSession);
    var asgs = s ? S.all('assignments').filter(function (a) { return a.sessionId === s.id; }) : [];
    var cap = s ? R.roomCapacity(s.id) : null;
    var parts = s ? S.all('participants').filter(function (p) { return p.sessionId === s.id; }) : [];

    host.innerHTML =
      '<div class="view-head"><h1>객실 · 조편성</h1>' +
        '<div class="head-actions">' +
          '<select data-pick-session>' + sessions.map(function (x) {
            return '<option value="' + x.id + '"' + (x.id === roomSession ? ' selected' : '') + '>' + esc(R.sessionLabel(x)) + '</option>';
          }).join('') + '</select>' +
          '<button class="btn" data-add-asg type="button">+ 배정 추가</button>' +
          '<button class="btn" data-add-part type="button">+ 교육생</button>' +
        '</div></div>' +

      (cap ? '<div class="calc-box"><b>수용 인원 점검</b>' +
        '<div class="calc-row"><span>배정 객실</span><code>' + cap.rooms + '실 (2인 사용 ' + cap.doubleRooms + ' · 1인 사용 ' + cap.singleRooms + ' · 예비 ' + cap.spareRooms + ')</code></div>' +
        '<div class="calc-row"><span>교육생 수용</span><code>' + esc(cap.expr) + '</code></div>' +
        '<div class="calc-row"><span>차수 인원</span><code>' + (s.headcount ? s.headcount + '명' : '확인 필요') + '</code>' +
          (s.headcount ? (cap.capacity >= s.headcount
            ? '<span class="ok-txt">수용 가능</span>'
            : '<span class="err-txt">부족 ' + (s.headcount - cap.capacity) + '명</span>') : '') + '</div>' +
        (cap.assumed ? '<p class="assume">스위트 외 객실 정원 2인은 <b>가정값</b>입니다. 확정 전까지 이 계산은 참고용입니다 (점검 No 8).</p>' : '') +
      '</div>' : '') +

      U.table([
        { key: 'roomNo', label: '호실', width: '80px', render: function (a) { var r = S.get('rooms', a.roomId); return '<b>' + esc(r ? r.roomNo : '?') + '</b>'; } },
        { key: 'roomType', label: '타입', width: '130px', render: function (a) { var r = S.get('rooms', a.roomId); return esc(r ? r.roomType : ''); } },
        { key: 'capacity', label: '정원', width: '70px', render: function (a) {
            var r = S.get('rooms', a.roomId);
            return r ? (r.capacity + '인' + (r.capacityAssumed ? '<span class="assume-mark" title="가정값">*</span>' : '')) : '';
          } },
        { key: 'occupantType', label: '배정 대상', width: '110px', render: function (a) { return U.badge(a.occupantType, a.occupantType === '미배정' ? 'off' : ''); } },
        { key: 'occupantCode', label: '대상 코드', width: '90px', render: function (a) { return a.occupantCode ? esc(a.occupantCode) : ''; } },
        { key: 'singleUse', label: '1인 사용', width: '80px', render: function (a) { return a.singleUse ? '✔' : ''; } },
        { key: 'isSpare', label: '예비실', width: '70px', render: function (a) { return a.isSpare ? '✔' : ''; } },
        { key: 'note', label: '비고' }
      ], asgs, { actions: true, empty: '배정 데이터가 없습니다.' }) +

      '<section class="panel">' +
        '<div class="panel-head"><h2>교육생 · 조 편성</h2>' +
          '<span class="sub">실명·연락처는 저장하지 않습니다. 코드와 속성만 입력합니다 (ROOM-07).</span></div>' +
        '<div class="panel-body">' +
          (parts.length ? teamSummary(parts) : '') +
          U.table([
            { key: 'code', label: '코드', width: '80px' },
            { key: 'gender', label: '성별', width: '70px' },
            { key: 'ageBand', label: '연령대', width: '90px' },
            { key: 'division', label: '본부', width: '140px' },
            { key: 'teamNo', label: '조', width: '70px', render: function (p) { return p.teamNo ? p.teamNo + '조' : ''; } }
          ], parts, { actions: true, empty: '등록된 교육생이 없습니다. 명단이 없으면 남녀 혼숙·조 편성 규칙은 검증불가로 표시됩니다.' }) +
        '</div>' +
      '</section>';

    host.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-pick-session')) { roomSession = e.target.value; g.Ops.render(); }
    });
    host.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-add-asg]')) {
        U.form({ title: '객실 배정 추가', fields: asgFields(), values: { occupantType: '교육생' }, wide: true })
          .then(function (d) { if (d) { S.insert('assignments', Object.assign({ sessionId: roomSession }, d)); g.Ops.render(); } });
        return;
      }
      if (t.closest('[data-add-part]')) {
        U.form({ title: '교육생 추가', fields: partFields(), values: {} })
          .then(function (d) { if (d) { S.insert('participants', Object.assign({ sessionId: roomSession }, d)); g.Ops.render(); } });
        return;
      }
      var ed = t.closest('[data-edit]');
      if (ed) {
        var id = ed.dataset.edit;
        var coll = S.get('assignments', id) ? 'assignments' : 'participants';
        U.form({ title: coll === 'assignments' ? '배정 편집' : '교육생 편집',
          fields: coll === 'assignments' ? asgFields() : partFields(), values: S.get(coll, id), wide: coll === 'assignments' })
          .then(function (d) { if (d) { S.update(coll, id, d, '객실 화면에서 수정'); g.Ops.render(); } });
        return;
      }
      var del = t.closest('[data-del]');
      if (del) {
        var did = del.dataset.del;
        var dcoll = S.get('assignments', did) ? 'assignments' : 'participants';
        U.confirm('이 항목을 숨길까요?', { danger: true, ok: '숨기기' })
          .then(function (ok) { if (ok) { S.remove(dcoll, did, '객실 화면에서 삭제'); g.Ops.render(); } });
      }
    });
  };

  function teamSummary(parts) {
    var teams = {};
    parts.forEach(function (p) { if (p.teamNo) (teams[p.teamNo] = teams[p.teamNo] || []).push(p); });
    var keys = Object.keys(teams).sort();
    if (!keys.length) return '';
    return '<div class="calc-box"><b>조 편성</b>' + keys.map(function (k) {
      var f = teams[k].filter(function (p) { return p.gender === '여'; }).length;
      return '<div class="calc-row"><span>' + esc(k) + '조</span><code>' + teams[k].length + '명 (여성 ' + f + ')</code>' +
        (teams[k].length !== 6 ? '<span class="err-txt">6명 기준과 다름</span>' : f > 1 ? '<span class="err-txt">여성 분산 기준 초과</span>' : '<span class="ok-txt">기준 충족</span>') + '</div>';
    }).join('') + '</div>';
  }

  function asgFields() {
    return [
      { key: 'roomId', label: '호실', type: 'select', required: true,
        options: S.all('rooms').map(function (r) { return { value: r.id, label: r.roomNo + ' · ' + r.roomType + ' (' + R.venueName(r.venueId) + ')' }; }),
        hint: '객실 마스터에 있는 호실만 선택할 수 있습니다 (ROOM-03).' },
      { key: 'occupantType', label: '배정 대상', type: 'select', required: true, options: SEED.OCCUPANT_TYPES },
      { key: 'occupantCode', label: '대상 코드', type: 'text', hint: '교육생 코드(예: A01). 실명은 입력하지 않습니다.' },
      { key: 'singleUse', label: '1인 사용', type: 'checkbox', checkLabel: '1인 사용' },
      { key: 'isSpare', label: '예비실', type: 'checkbox', checkLabel: '예비실 (사전 배정 금지)' },
      { key: 'note', label: '비고', type: 'text', span: 2 }
    ];
  }
  function partFields() {
    return [
      { key: 'code', label: '코드', type: 'text', required: true, placeholder: 'A01' },
      { key: 'gender', label: '성별', type: 'select', options: ['남', '여'] },
      { key: 'ageBand', label: '연령대', type: 'select', options: ['30대', '40대', '50대', '60대 이상'] },
      { key: 'division', label: '본부', type: 'text' },
      { key: 'teamNo', label: '조', type: 'number' }
    ];
  }

  /* ════════ 운영 차량 ═══════════════════════════════ */

  V.car = function (host) {
    var c = R.carCost();
    var rental = c && c.rental;

    host.innerHTML =
      '<div class="view-head"><h1>운영 차량</h1>' +
        '<div class="head-actions">' +
          (rental ? '<button class="btn" data-edit-rental type="button">대여 정보 편집</button>' : '<button class="btn primary" data-add-rental type="button">+ 대여 등록</button>') +
          (rental ? '<button class="btn primary" data-add-trip type="button">+ 구간 추가</button>' : '') +
        '</div></div>' +
      (!rental ? '<p class="empty">등록된 대여 정보가 없습니다.</p>' :
      '<div class="calc-box"><b>대여 정보</b>' +
        '<div class="calc-row"><span>기간</span><code>' + esc(rental.startAt.replace('T', ' ')) + ' ~ ' + esc(rental.endAt.replace('T', ' ')) + '</code></div>' +
        '<div class="calc-row"><span>예약자</span>' + (rental.reserver ? '<code>' + esc(rental.reserver) + '</code>' : U.unknown()) + '</div>' +
        '<div class="calc-row"><span>출발지</span><code>' + esc(R.venueName(rental.originVenueId)) + '</code></div>' +
        '<div class="calc-row"><span>요금</span><code>시간당 ' + U.num(rental.hourlyRate) + '원 · km당 ' + U.num(rental.perKmRate) + '원</code></div>' +
      '</div>' +

      '<div class="calc-box"><b>비용 계산</b>' +
        (c.hours ? '<div class="calc-row"><span>대여 시간</span><code>' + esc(c.hours.text) + '</code></div>' +
          '<div class="calc-row"><span>대여료</span><code>' + (Math.round(c.hours.hours * 100) / 100) + 'h × ' + U.num(rental.hourlyRate) + '원 = ' + U.num(c.rent) + '원</code></div>' : '') +
        '<div class="calc-row"><span>주행 거리</span><code>' + esc(c.fuelExpr) + '</code></div>' +
        '<div class="calc-row"><span>유류비</span><code>' + U.num(c.km) + 'km × ' + U.num(rental.perKmRate) + '원 = ' + U.num(c.fuel) + '원</code></div>' +
        (c.gapKm ? '<div class="calc-row"><span>기록 공백 반영 시</span><code>' + U.num(c.km + c.gapKm) + 'km → ' + U.num(c.fuelWithGap) + '원</code><span class="err-txt">구간 누락</span></div>' : '') +
        '<p class="assume">과금 단위(분 단위 / 시간 올림)가 <b>' + esc(rental.billingUnit || '미확정') + '</b>입니다. 확정 전까지 대여료는 참고용입니다 (점검 No 11).<br>' +
          '현지 운행 거리는 기록이 없어 유류비에 포함되지 않았습니다.</p>' +
      '</div>' +

      U.table([
        { key: 'seq', label: '순서', width: '60px' },
        { key: 'date', label: '일자', width: '140px', render: function (t) { return t.date ? esc(R.withWeekday(t.date)) : U.unknown('미기재'); } },
        { key: 'route', label: '구간', render: function (t) {
            return esc(R.venueName(t.fromVenueId)) + ' → ' + esc(R.venueName(t.toVenueId));
          } },
        { key: 'distanceKm', label: '거리', width: '90px', render: function (t) { return U.num(t.distanceKm) + 'km'; } },
        { key: 'unused', label: '미사용', width: '70px', render: function (t) { return t.unused ? '✔' : ''; } },
        { key: 'note', label: '비고' }
      ], c.trips, { actions: true }) +

      (c.gaps.length ? '<div class="warn-box"><b>동선 기록 공백</b>' + c.gaps.map(function (gp) {
        var a = R.venueName(gp.from), b = R.venueName(gp.to);
        return '<div>' + gp.afterSeq + '번 구간 도착지 <code>' + esc(a) + '</code>' + R.josa(a, '과', '와') +
          ' 다음 구간 출발지 <code>' + esc(b) + '</code>' + R.josa(b, '이', '가') + ' 다릅니다.' +
          (gp.knownKm ? ' 구간 마스터 기준 ' + gp.knownKm + 'km.' : '') + '</div>';
      }).join('') + '</div>' : ''));

    host.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-edit-rental]') || t.closest('[data-add-rental]')) {
        U.form({ title: '대여 정보', fields: rentalFields(), values: rental || {}, wide: true }).then(function (d) {
          if (!d) return;
          if (rental) S.update('rentals', rental.id, d, '차량 화면에서 수정');
          else S.insert('rentals', d);
          g.Ops.render();
        });
        return;
      }
      if (t.closest('[data-add-trip]')) {
        var next = (S.all('trips').reduce(function (m, x) { return Math.max(m, x.seq || 0); }, 0)) + 1;
        U.form({ title: '구간 추가', fields: tripFields(), values: { seq: next } }).then(function (d) {
          if (!d) return;
          S.insert('trips', Object.assign({ rentalId: rental.id }, d));
          g.Ops.render();
        });
        return;
      }
      var ed = t.closest('[data-edit]');
      if (ed) {
        U.form({ title: '구간 편집', fields: tripFields(), values: S.get('trips', ed.dataset.edit) })
          .then(function (d) { if (d) { S.update('trips', ed.dataset.edit, d, '차량 화면에서 수정'); g.Ops.render(); } });
        return;
      }
      var del = t.closest('[data-del]');
      if (del) {
        U.confirm('이 구간을 숨길까요?', { danger: true, ok: '숨기기' })
          .then(function (ok) { if (ok) { S.remove('trips', del.dataset.del, '차량 화면에서 삭제'); g.Ops.render(); } });
      }
    });
  };

  function rentalFields() {
    return [
      { key: 'startAt', label: '대여 시작', type: 'datetime-local', required: true },
      { key: 'endAt', label: '대여 종료', type: 'datetime-local', required: true },
      { key: 'reserver', label: '예약자', type: 'text' },
      { key: 'originVenueId', label: '출발지', type: 'select', options: V._venueOptions() },
      { key: 'hourlyRate', label: '시간당 요금(원)', type: 'number', required: true },
      { key: 'perKmRate', label: 'km당 유류비(원)', type: 'number', required: true },
      { key: 'billingUnit', label: '과금 단위', type: 'select', options: ['미확정', '분 단위', '시간 올림'], hint: '점검 No 11' },
      { key: 'note', label: '비고', type: 'text', span: 2 }
    ];
  }
  function tripFields() {
    return [
      { key: 'seq', label: '순서', type: 'number', required: true },
      { key: 'date', label: '일자', type: 'date' },
      { key: 'fromVenueId', label: '출발', type: 'select', required: true, options: V._venueOptions() },
      { key: 'toVenueId', label: '도착', type: 'select', required: true, options: V._venueOptions() },
      { key: 'distanceKm', label: '거리(km)', type: 'number', required: true,
        hint: '구간 마스터에 값이 있으면 그 값을 쓰세요.' },
      { key: 'unused', label: '미사용일', type: 'checkbox', checkLabel: '차량 미사용' },
      { key: 'note', label: '비고', type: 'text', span: 2 }
    ];
  }

  /* ════════ 운영 지식 ═══════════════════════════════ */

  var factQuery = '', factTag = '';

  V.facts = function (host) {
    var conflicts = R.factConflicts();
    var rows = S.all('facts').filter(function (f) {
      if (factTag && f.tag !== factTag) return false;
      if (!factQuery) return true;
      var q = factQuery.toLowerCase();
      if ((f.content || '').toLowerCase().indexOf(q) !== -1) return true;
      if ((f.subject || '').toLowerCase().indexOf(q) !== -1) return true;
      /* 별칭 검색 (MEM-05) */
      return S.all('venues').some(function (v) {
        return (v.aliases || []).concat([v.name]).some(function (a) { return a.toLowerCase().indexOf(q) !== -1; }) &&
               (f.content || '').indexOf(v.name) !== -1;
      });
    });

    host.innerHTML =
      '<div class="view-head"><h1>운영 지식</h1>' +
        '<div class="head-actions">' +
          '<input data-fq placeholder="내용 · 대상 · 별칭 검색" value="' + esc(factQuery) + '">' +
          '<select data-ftag><option value="">전체 태그</option>' + SEED.FACT_TAGS.map(function (t) {
            return '<option value="' + t + '"' + (t === factTag ? ' selected' : '') + '>' + t + '</option>';
          }).join('') + '</select>' +
          '<button class="btn primary" data-add-fact type="button">+ 사실 추가</button>' +
        '</div></div>' +

      (conflicts.length ? '<div class="warn-box"><b>기록 충돌 ' + conflicts.length + '건 (MEM-04)</b>' +
        conflicts.map(function (c) {
          return '<div class="conflict"><span class="k">' + esc(c.subject) + ' · ' + esc(c.attribute) + '</span>' +
            c.facts.map(function (f) { return '<code title="' + esc(f.content) + '">' + esc(f.value) + '</code>'; }).join(' vs ') +
            ' <span class="sub">어느 쪽이 최신인지 지정하면 충돌이 해소됩니다.</span></div>';
        }).join('') + '</div>' : '') +

      U.table([
        { key: 'tag', label: '태그', width: '80px', render: function (f) {
            return U.badge(f.tag, f.tag === '사실' ? 'ok' : f.tag === '확인불가' ? 'warn' : ''); } },
        { key: 'content', label: '내용', render: function (f) {
            return esc(f.content) +
              (f.supersededBy ? '<span class="sub"> · 대체됨</span>' : '') +
              (f.note ? '<div class="sub">' + esc(f.note) + '</div>' : '');
          } },
        { key: 'subject', label: '대상', width: '130px', render: function (f) { return esc(f.subject || ''); } },
        { key: 'attribute', label: '속성', width: '100px' },
        { key: 'sourceType', label: '출처', width: '80px' }
      ], rows, { actions: true, rowClass: function (f) { return f.supersededBy ? 'is-off' : ''; } });

    host.addEventListener('input', function (e) {
      if (e.target.hasAttribute('data-fq')) {
        factQuery = e.target.value;
        var pos = e.target.selectionStart;
        g.Ops.render();
        var el = document.querySelector('[data-fq]');
        if (el) { el.focus(); el.setSelectionRange(pos, pos); }
      }
    });
    host.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-ftag')) { factTag = e.target.value; g.Ops.render(); }
    });
    host.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-add-fact]')) {
        U.form({ title: '사실 추가', fields: factFields(), values: { tag: '사실', sourceType: '대화' }, wide: true })
          .then(function (d) { if (d) { S.insert('facts', d); g.Ops.render(); } });
        return;
      }
      var ed = t.closest('[data-edit]');
      if (ed) {
        U.form({ title: '사실 편집', fields: factFields(ed.dataset.edit), values: S.get('facts', ed.dataset.edit), wide: true })
          .then(function (d) { if (d) { S.update('facts', ed.dataset.edit, d, '운영 지식 화면에서 수정'); g.Ops.render(); } });
        return;
      }
      var del = t.closest('[data-del]');
      if (del) {
        U.confirm('이 사실 카드를 숨길까요? 완전 삭제는 변경 이력에서 할 수 있습니다.', { danger: true, ok: '숨기기' })
          .then(function (ok) { if (ok) { S.remove('facts', del.dataset.del, '운영 지식 화면에서 삭제'); g.Ops.render(); } });
      }
    });
  };

  function factFields(selfId) {
    return [
      { key: 'content', label: '내용', type: 'textarea', required: true, span: 2, rows: 3 },
      { key: 'tag', label: '태그', type: 'select', required: true, options: SEED.FACT_TAGS,
        hint: '사실 = 자료에서 직접 확인 / 해석 = 추론 / 제안 = 새 제안 / 확인불가 = 판단 불가' },
      { key: 'sourceType', label: '출처 유형', type: 'select', options: SEED.SOURCE_TYPES },
      { key: 'subject', label: '대상', type: 'text', hint: '충돌 감지에 사용합니다. 예) 충청 3차수' },
      { key: 'attribute', label: '속성', type: 'text', hint: '예) 일정' },
      { key: 'value', label: '값', type: 'text', span: 2, hint: '같은 대상·속성에 다른 값이 있으면 충돌로 표시됩니다.' },
      { key: 'recordedAt', label: '기록일', type: 'date' },
      { key: 'supersededBy', label: '대체한 사실', type: 'select',
        options: S.all('facts').filter(function (f) { return f.id !== selfId; })
          .map(function (f) { return { value: f.id, label: (f.value || f.content).slice(0, 40) }; }),
        hint: '이 카드를 대신하는 최신 기록을 지정하면 충돌 목록에서 빠집니다.' },
      { key: 'note', label: '비고', type: 'text', span: 2 }
    ];
  }

  /* ════════ 미결 질문 ═══════════════════════════════ */

  V.questions = function (host) {
    var rows = S.all('questions');
    var open = rows.filter(function (q) { return q.status !== '해결'; });

    host.innerHTML =
      '<div class="view-head"><h1>미결 질문</h1>' +
        '<p class="sub">고객사 미팅·답사 전에 이 목록을 확인하세요. 미해결 ' + open.length + '건.</p>' +
        '<div class="head-actions">' +
          '<button class="btn" data-copy-q type="button">미해결 목록 복사</button>' +
          '<button class="btn primary" data-add-q type="button">+ 질문 추가</button>' +
        '</div></div>' +
      U.table([
        { key: 'status', label: '상태', width: '80px', render: function (q) { return U.badge(q.status, q.status === '해결' ? 'ok' : 'warn'); } },
        { key: 'question', label: '질문', render: function (q) {
            return esc(q.question) + (q.answer ? '<div class="sub">→ ' + esc(q.answer) + '</div>' : '');
          } },
        { key: 'subjectLink', label: '관련', width: '160px', render: function (q) { return esc(linkLabel(q.subjectLink)); } },
        { key: 'owner', label: '담당', width: '90px' }
      ], rows, { actions: true, rowClass: function (q) { return q.status === '해결' ? 'is-off' : ''; } });

    host.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-add-q]')) {
        U.form({ title: '질문 추가', fields: qFields(), values: { status: '미해결' }, wide: true })
          .then(function (d) { if (d) { S.insert('questions', d); g.Ops.render(); } });
        return;
      }
      var ed = t.closest('[data-edit]');
      if (ed) {
        U.form({ title: '질문 편집', fields: qFields(), values: S.get('questions', ed.dataset.edit), wide: true })
          .then(function (d) { if (d) { S.update('questions', ed.dataset.edit, d, '미결 질문 화면에서 수정'); g.Ops.render(); } });
        return;
      }
      var del = t.closest('[data-del]');
      if (del) {
        U.confirm('이 질문을 숨길까요?', { danger: true, ok: '숨기기' })
          .then(function (ok) { if (ok) { S.remove('questions', del.dataset.del, '미결 질문 화면에서 삭제'); g.Ops.render(); } });
        return;
      }
      if (t.closest('[data-copy-q]')) {
        var text = open.map(function (q, i) { return (i + 1) + '. ' + R.lintText(q.question); }).join('\n');
        navigator.clipboard.writeText(text)
          .then(function () { U.toast('미해결 질문 ' + open.length + '건을 복사했습니다.', 'ok'); })
          .catch(function () { U.toast('복사에 실패했습니다.', 'err'); });
      }
    });
  };

  function qFields() {
    return [
      { key: 'question', label: '질문', type: 'textarea', required: true, span: 2 },
      { key: 'subjectLink', label: '관련 항목', type: 'select', options: linkOptions() },
      { key: 'owner', label: '담당', type: 'text' },
      { key: 'answer', label: '답변', type: 'textarea', span: 2 },
      { key: 'status', label: '상태', type: 'select', required: true, options: ['미해결', '확인중', '해결'] }
    ];
  }
  function linkOptions() {
    return [].concat(
      S.all('sessions').map(function (s) { return { value: 'session:' + s.id, label: '차수 · ' + R.sessionLabel(s) }; }),
      S.all('venues').map(function (v) { return { value: 'venue:' + v.id, label: '장소 · ' + v.name }; }),
      S.all('regions').map(function (r) { return { value: 'region:' + r.id, label: '지역 · ' + r.name }; }),
      S.all('rentals').map(function (r) { return { value: 'rental:' + r.id, label: '운영 차량' }; })
    );
  }
  function linkLabel(link) {
    if (!link) return '';
    var p = link.split(':');
    if (p[0] === 'session') { var s = S.get('sessions', p[1]); return s ? R.sessionLabel(s) : ''; }
    if (p[0] === 'venue') return R.venueName(p[1]);
    if (p[0] === 'region') { var r = S.get('regions', p[1]); return r ? r.name : ''; }
    if (p[0] === 'rental') return '운영 차량';
    return link;
  }

  /* ════════ 규칙 · 표기 ═════════════════════════════ */

  V.rules = function (host) {
    var findings = R.runAll();
    var byRule = {};
    findings.forEach(function (f) { (byRule[f.ruleId] = byRule[f.ruleId] || []).push(f); });
    var hits = R.lintScan();

    host.innerHTML =
      '<div class="view-head"><h1>규칙 · 표기</h1>' +
        '<p class="sub">규칙 강도(차단/경고/권장)는 확정 전 <b>제안값</b>입니다. 여기서 바꿀 수 있습니다 (11장 No 10).</p></div>' +

      '<div class="table-wrap"><table class="grid rules-table"><thead><tr>' +
        '<th style="width:70px">ID</th><th>규칙</th><th style="width:90px">적용 범위</th>' +
        '<th style="width:90px">강도</th><th style="width:60px">사용</th><th style="width:44%">점검 결과</th>' +
      '</tr></thead><tbody>' +
      S.all('rules').map(function (r) {
        var fs = byRule[r.id] || [];
        return '<tr data-rule="' + r.id + '">' +
          '<td><b>' + esc(r.id) + '</b></td>' +
          '<td>' + esc(r.description) + '</td>' +
          '<td>' + esc(r.scope) + '</td>' +
          '<td><select data-sev="' + r.id + '">' + ['차단', '경고', '권장'].map(function (s) {
            return '<option' + (s === r.severity ? ' selected' : '') + '>' + s + '</option>';
          }).join('') + '</select></td>' +
          '<td class="ctr"><input type="checkbox" data-active="' + r.id + '"' + (r.active !== false ? ' checked' : '') + '></td>' +
          '<td>' + (fs.length ? fs.map(function (f) {
            var cls = f.status === '위반' ? 'bad' : f.status === '통과' ? 'good' : 'unk';
            return '<div class="rr ' + cls + '"><span class="rr-s">' + esc(f.status) + '</span>' + esc(f.title) +
              (f.detail ? '<em>' + esc(f.detail) + '</em>' : '') + '</div>';
          }).join('') : '<span class="sub">비활성</span>') + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>' +

      '<section class="panel">' +
        '<div class="panel-head"><h2>표기 사전</h2>' +
          '<div class="head-actions">' +
            (hits.length ? '<button class="btn" data-fix-all type="button">' + hits.length + '건 일괄 수정</button>' : '') +
            '<button class="btn primary" data-add-lint type="button">+ 규칙 추가</button>' +
          '</div></div>' +
        '<div class="panel-body">' +
          U.table([
            { key: 'wrong', label: '잘못된 표기', width: '160px' },
            { key: 'right', label: '올바른 표기', width: '160px' },
            { key: 'note', label: '비고' }
          ], S.all('lint'), { actions: true }) +
          (hits.length ? '<div class="warn-box"><b>검수 결과 ' + hits.length + '건</b>' + hits.map(function (h) {
            return '<div>' + esc(h.coll) + ' · ' + esc(h.field) + ' — <code>' + esc(h.wrong) + '</code> → <code>' + esc(h.right) + '</code><span class="sub"> ' + esc(h.text.slice(0, 60)) + '</span></div>';
          }).join('') + '</div>' : '<p class="ok-txt" style="margin-top:10px">표기 사전 위반이 없습니다.</p>') +
        '</div>' +
      '</section>';

    host.addEventListener('change', function (e) {
      var sev = e.target.closest('[data-sev]');
      if (sev) { S.update('rules', sev.dataset.sev, { severity: sev.value }, '규칙 강도 변경'); g.Ops.render(); return; }
      var act = e.target.closest('[data-active]');
      if (act) { S.update('rules', act.dataset.active, { active: act.checked }, '규칙 사용 여부 변경'); g.Ops.render(); }
    });
    host.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-add-lint]')) {
        U.form({ title: '표기 규칙 추가', fields: lintFields(), values: {} })
          .then(function (d) { if (d) { S.insert('lint', d); g.Ops.render(); } });
        return;
      }
      var ed = t.closest('[data-edit]');
      if (ed) {
        U.form({ title: '표기 규칙 편집', fields: lintFields(), values: S.get('lint', ed.dataset.edit) })
          .then(function (d) { if (d) { S.update('lint', ed.dataset.edit, d, '표기 사전 수정'); g.Ops.render(); } });
        return;
      }
      var del = t.closest('[data-del]');
      if (del) { S.remove('lint', del.dataset.del, '표기 사전에서 삭제'); g.Ops.render(); return; }
      if (t.closest('[data-fix-all]')) {
        U.confirm(hits.length + '건의 표기를 한 번에 바꿉니다. 변경 이력에 모두 기록됩니다. 진행할까요?', { ok: '수정' }).then(function (ok) {
          if (!ok) return;
          hits.forEach(function (h) {
            var rec = S.get(h.coll, h.id);
            if (!rec) return;
            var patch = {};
            patch[h.field] = String(rec[h.field]).split(h.wrong).join(h.right);
            S.update(h.coll, h.id, patch, '표기 일괄 수정');
          });
          g.Ops.render();
          U.toast('표기를 수정했습니다.', 'ok');
        });
      }
    });
  };

  function lintFields() {
    return [
      { key: 'wrong', label: '잘못된 표기', type: 'text', required: true },
      { key: 'right', label: '올바른 표기', type: 'text', required: true },
      { key: 'note', label: '비고', type: 'text', span: 2 }
    ];
  }

  /* ════════ 이력 · 백업 ═════════════════════════════ */

  V.log = function (host) {
    var logs = S.all('changeLog', true).slice(0, 300);
    var hidden = [];
    S.COLLECTIONS.forEach(function (coll) {
      S.all(coll, true).filter(function (r) { return r.deleted; }).forEach(function (r) {
        hidden.push({ coll: coll, rec: r });
      });
    });

    host.innerHTML =
      '<div class="view-head"><h1>이력 · 백업</h1></div>' +

      '<section class="panel">' +
        '<div class="panel-head"><h2>백업</h2></div>' +
        '<div class="panel-body">' +
          '<p class="sub">데이터는 이 브라우저에만 저장됩니다. 다른 PC로 옮기거나 서버 버전으로 이전할 때 이 JSON을 사용하세요.</p>' +
          '<div class="btn-row">' +
            '<button class="btn" data-export type="button">JSON 내보내기</button>' +
            '<button class="btn" data-import type="button">JSON 가져오기</button>' +
            '<input type="file" accept="application/json,.json" data-import-file hidden>' +
            '<button class="btn danger-solid" data-reset type="button">초기 데이터로 되돌리기</button>' +
          '</div>' +
          '<div class="notion-box"><b>노션 참고값</b>' +
            S.all('notionLinks').map(function (n) {
              return '<div class="calc-row"><span>' + esc(n.label) + '</span><code>' + esc(n.value) + '</code></div>';
            }).join('') +
            '<p class="assume">대화 요약 기록 기준입니다. 노션 연동은 API 토큰이 필요해 이번 범위에서 제외했습니다.</p>' +
          '</div>' +
        '</div>' +
      '</section>' +

      (hidden.length ? '<section class="panel">' +
        '<div class="panel-head"><h2>숨긴 항목 ' + hidden.length + '건</h2></div>' +
        '<div class="panel-body"><ul class="plain-list">' + hidden.map(function (h) {
          return '<li>' + esc(h.coll) + ' · ' + esc(h.rec.name || h.rec.title || h.rec.question || h.rec.content || h.rec.id) +
            '<button class="btn tiny" data-restore="' + h.coll + ':' + h.rec.id + '" type="button">복원</button></li>';
        }).join('') + '</ul></div></section>' : '') +

      '<section class="panel">' +
        '<div class="panel-head"><h2>변경 이력</h2><span class="sub">최근 300건</span></div>' +
        '<div class="panel-body">' +
          U.table([
            { key: 'at', label: '일시', width: '150px', render: function (l) { return esc(l.at.replace('T', ' ').slice(0, 16)); } },
            { key: 'entity', label: '대상', width: '120px' },
            { key: 'field', label: '항목', width: '120px' },
            { key: 'change', label: '변경', render: function (l) {
                return '<code>' + esc(l.oldValue || '-') + '</code> → <code>' + esc(l.newValue || '-') + '</code>';
              } },
            { key: 'reason', label: '사유', width: '160px' }
          ], logs, { empty: '변경 이력이 없습니다.' }) +
        '</div>' +
      '</section>';

    host.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-export]')) {
        var blob = new Blob([S.exportJson()], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '과정운영_백업_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
        return;
      }
      if (t.closest('[data-import]')) { host.querySelector('[data-import-file]').click(); return; }
      if (t.closest('[data-reset]')) {
        U.confirm('입력한 내용이 모두 사라지고 초기 데이터로 돌아갑니다. 계속할까요?', { danger: true, ok: '되돌리기' })
          .then(function (ok) { if (ok) { S.reset(); g.Ops.render(); U.toast('초기 데이터로 되돌렸습니다.', 'ok'); } });
        return;
      }
      var rs = t.closest('[data-restore]');
      if (rs) {
        var p = rs.dataset.restore.split(':');
        S.restore(p[0], p.slice(1).join(':'));
        g.Ops.render();
      }
    });
    host.addEventListener('change', function (e) {
      if (!e.target.hasAttribute('data-import-file')) return;
      var f = e.target.files[0];
      if (!f) return;
      f.text().then(function (txt) {
        try { S.importJson(txt); g.Ops.render(); U.toast('데이터를 가져왔습니다.', 'ok'); }
        catch (err) { U.toast('JSON을 읽을 수 없습니다.', 'err'); }
      });
      e.target.value = '';
    });
  };
})(window);
