/* views-core.js — 대시보드 / 차수·일정 / 장소·시설 */
(function (g) {
  'use strict';

  var S = g.Store, R = g.Rules, U = g.UI, esc = U.esc;
  var V = g.OpsViews = g.OpsViews || {};

  function venueOptions(type) {
    return S.all('venues')
      .filter(function (v) { return !type || v.type === type; })
      .map(function (v) { return { value: v.id, label: v.name + (v.status === '제외' ? ' (제외)' : '') }; });
  }
  function sessionOptions() {
    return S.all('sessions').map(function (s) { return { value: s.id, label: R.sessionLabel(s) }; });
  }

  /* ════════ 대시보드 ════════════════════════════════ */

  var calMonth = null;

  V.dashboard = function (host) {
    var findings = R.runAll();
    var violations = findings.filter(function (f) { return f.status === '위반'; });
    var unknownRules = findings.filter(function (f) { return f.status === '검증불가'; });
    var conflicts = R.factConflicts();
    var unknowns = R.unknowns();
    var openQ = S.all('questions').filter(function (q) { return q.status !== '해결'; });

    var upcoming = S.all('sessions')
      .filter(function (s) { return s.startDate && s.startDate >= today(); })
      .sort(function (a, b) { return a.startDate < b.startDate ? -1 : 1; })[0];

    if (!calMonth) calMonth = upcoming ? upcoming.startDate.slice(0, 7) : today().slice(0, 7);

    host.innerHTML =
      '<div class="view-head"><h1>대시보드</h1>' +
        '<p class="sub">확인된 사실만 표시합니다. 판단에 필요한 데이터가 없으면 <span class="unknown">확인 필요</span>로 남겨 둡니다.</p></div>' +

      '<div class="cards">' +
        card('다음 차수', upcoming ? R.sessionLabel(upcoming) : '없음',
             upcoming ? R.rangeLabel(upcoming) + ' · D-' + dday(upcoming.startDate) : '', 'sessions') +
        card('규칙 위반', violations.length + '건', violations.length ? '해결 필요' : '이상 없음', 'rules', violations.length ? 'bad' : 'ok') +
        card('검증불가', unknownRules.length + '건', '데이터 부족', 'rules', unknownRules.length ? 'warn' : '') +
        card('미결 질문', openQ.length + '건', '확정 대기', 'questions', openQ.length ? 'warn' : 'ok') +
      '</div>' +

      '<section class="panel">' +
        '<div class="panel-head"><h2>운영 캘린더</h2>' +
          '<div class="cal-nav"><button class="btn tiny" data-cal="-1" type="button">‹</button>' +
          '<b>' + calMonth.replace('-', '년 ') + '월</b>' +
          '<button class="btn tiny" data-cal="1" type="button">›</button></div></div>' +
        '<div class="panel-body">' + calendarHtml(calMonth) + '</div>' +
      '</section>' +

      '<div class="col2">' +
        '<section class="panel">' +
          '<div class="panel-head"><h2>규칙 점검</h2><span class="sub">' +
            findings.filter(function (f) { return f.status === '통과'; }).length + ' 통과 · ' +
            violations.length + ' 위반 · ' + unknownRules.length + ' 검증불가</span></div>' +
          '<div class="panel-body">' + findingList(violations.concat(unknownRules).slice(0, 12)) + '</div>' +
        '</section>' +

        '<section class="panel">' +
          '<div class="panel-head"><h2>확인 필요</h2></div>' +
          '<div class="panel-body">' +
            (conflicts.length ? '<div class="conflict-box"><b>기록 충돌 ' + conflicts.length + '건</b>' +
              conflicts.map(function (c) {
                return '<div class="conflict"><span class="k">' + esc(c.subject) + ' · ' + esc(c.attribute) + '</span>' +
                  c.values.map(function (v) { return '<code>' + esc(v) + '</code>'; }).join(' vs ') + '</div>';
              }).join('') + '</div>' : '') +
            (unknowns.length
              ? '<ul class="plain-list">' + unknowns.map(function (u) {
                  return '<li><a href="#" data-go="' + u.link.view + '">' + esc(u.text) + '</a></li>';
                }).join('') + '</ul>'
              : '<p class="empty small">미입력 항목이 없습니다.</p>') +
          '</div>' +
        '</section>' +
      '</div>';

    host.addEventListener('click', function (e) {
      var cal = e.target.closest('[data-cal]');
      if (cal) { calMonth = shiftMonth(calMonth, Number(cal.dataset.cal)); g.Ops.render(); return; }
      var go = e.target.closest('[data-go]');
      if (go) { e.preventDefault(); g.Ops.go(go.dataset.go); }
    });
  };

  function card(label, value, sub, view, tone) {
    return '<button class="card ' + (tone || '') + '" data-go="' + view + '" type="button">' +
      '<span class="card-label">' + esc(label) + '</span>' +
      '<span class="card-value">' + esc(value) + '</span>' +
      '<span class="card-sub">' + esc(sub) + '</span></button>';
  }

  function findingList(rows) {
    if (!rows.length) return '<p class="empty small">표시할 항목이 없습니다.</p>';
    return '<ul class="finding-list">' + rows.map(function (f) {
      var cls = f.status === '위반' ? (f.severity === '차단' ? 'block' : f.severity === '권장' ? 'advice' : 'warn') : 'unknown';
      return '<li class="finding ' + cls + '">' +
        '<span class="f-rule">' + esc(f.ruleId) + '</span>' +
        '<span class="f-body"><b>' + esc(f.title) + '</b>' + (f.detail ? '<em>' + esc(f.detail) + '</em>' : '') + '</span>' +
        '<span class="f-tag">' + esc(f.status === '위반' ? f.severity : '검증불가') + '</span></li>';
    }).join('') + '</ul>';
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function dday(iso) {
    var a = new Date(today()), b = new Date(iso);
    return Math.round((b - a) / 86400000);
  }
  function shiftMonth(ym, delta) {
    var p = ym.split('-'), d = new Date(+p[0], +p[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  var REGION_CLS = { 영남: 'rg1', 충청: 'rg2', 호남: 'rg3' };

  function calendarHtml(ym) {
    var p = ym.split('-'), y = +p[0], m = +p[1];
    var firstDow = new Date(y, m - 1, 1).getDay();
    var days = new Date(y, m, 0).getDate();
    var sessions = S.all('sessions');

    var cells = [];
    for (var i = 0; i < firstDow; i++) cells.push('<div class="cal-cell out"></div>');
    for (var d = 1; d <= days; d++) {
      var iso = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
      var hits = sessions.filter(function (s) { return s.startDate && iso >= s.startDate && iso <= (s.endDate || s.startDate); });
      cells.push('<div class="cal-cell' + (hits.length ? ' has' : '') + '">' +
        '<span class="cal-d">' + d + '</span>' +
        hits.map(function (s) {
          var rn = R.regionName(s);
          return '<span class="cal-tag ' + (REGION_CLS[rn] || '') + '" title="' + esc(R.sessionLabel(s) + ' · ' + R.rangeLabel(s)) + '">' +
            esc(rn + ' ' + s.no + '차') + '</span>';
        }).join('') + '</div>');
    }
    while (cells.length % 7) cells.push('<div class="cal-cell out"></div>');

    return '<div class="cal">' + R.WD.map(function (w, i) {
      return '<div class="cal-h' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</div>';
    }).join('') + cells.join('') + '</div>' +
    '<p class="cal-legend">' + Object.keys(REGION_CLS).map(function (k) {
      return '<span class="cal-tag ' + REGION_CLS[k] + '">' + k + '</span>';
    }).join(' ') + ' · 이 달 차수 ' + sessions.filter(function (s) {
      return s.startDate && s.startDate.slice(0, 7) === ym;
    }).length + '개</p>';
  }

  /* ════════ 차수 · 일정 ═════════════════════════════ */

  var openSession = null;

  V.sessions = function (host, params) {
    if (params && params.id) openSession = params.id;
    if (!S.get('sessions', openSession)) openSession = null;
    var rows = S.all('sessions').sort(function (a, b) {
      return (a.startDate || '') < (b.startDate || '') ? -1 : 1;
    });

    host.innerHTML =
      '<div class="view-head"><h1>차수 · 일정</h1>' +
        '<div class="head-actions"><button class="btn primary" data-add-session type="button">+ 차수 추가</button></div></div>' +
      U.table([
        { key: 'region', label: '지역', width: '80px', render: function (r) { return U.badge(R.regionName(r), REGION_CLS[R.regionName(r)]); } },
        { key: 'no', label: '차수', width: '60px', render: function (r) { return r.no + '차수'; } },
        { key: 'date', label: '일정', width: '230px', render: function (r) { return esc(R.rangeLabel(r)) || U.unknown(); } },
        { key: 'headcount', label: '인원', width: '80px', render: function (r) { return (r.headcount || r.headcount === 0) ? U.num(r.headcount) + '명' : U.unknown(); } },
        { key: 'lodging', label: '숙소', render: function (r) { return esc(R.venueName(r.lodgingVenueId)) || U.unknown(); } },
        { key: 'status', label: '상태', width: '80px', render: function (r) { return U.badge(r.status, r.status === '완료' ? 'done' : ''); } },
        { key: 'note', label: '비고', render: function (r) {
            var ch = (r.changes || []).length ? '<span class="chg">변경 ' + r.changes.length + '건</span> ' : '';
            return ch + esc(r.note || '');
          } }
      ], rows, { actions: true, empty: '등록된 차수가 없습니다.' }) +
      (openSession ? sessionDetail(openSession) : '');

    bindSessions(host);
  };

  function sessionDetail(id) {
    var s = S.get('sessions', id);
    if (!s) return '';
    var meals = S.all('meals').filter(function (m) { return m.sessionId === id; });
    var acts = S.all('activities').filter(function (a) { return a.sessionId === id; });
    var lists = S.all('checklists').filter(function (c) { return c.sessionId === id; });

    function dayBlock(day) {
      var rows = meals.map(function (m) { return { t: m.startTime || '', kind: '식사', label: m.mealType, venueId: m.venueId, rec: m, coll: 'meals', day: m.day }; })
        .concat(acts.map(function (a) { return { t: a.startTime || '', kind: '일정', label: a.name, venueId: a.venueId, rec: a, coll: 'activities', day: a.day }; }))
        .filter(function (r) { return String(r.day) === String(day); })
        .sort(function (a, b) { return (a.t || '99') < (b.t || '99') ? -1 : 1; });

      return '<div class="day-block"><h4>Day ' + day + ' <span class="sub">' + esc(R.withWeekday(R.dayDate(s, day))) + '</span></h4>' +
        (rows.length ? '<ul class="timeline">' + rows.map(function (r) {
          var v = S.get('venues', r.venueId);
          var warn = [];
          if (v && (v.closedWeekdays || []).indexOf(R.weekday(R.dayDate(s, day))) !== -1) warn.push('휴무일');
          if (v && v.closedOnRain && !r.rec.rainPlan) warn.push('우천 대체안 없음');
          if (v && v.status === '제외') warn.push('제외 장소');
          return '<li>' +
            '<span class="tl-time">' + esc(r.t || '--:--') + '</span>' +
            '<span class="tl-kind ' + (r.kind === '식사' ? 'meal' : '') + '">' + esc(r.kind) + '</span>' +
            '<span class="tl-name">' + esc(r.label) + '</span>' +
            '<span class="tl-venue">' + esc(v ? v.name : '') + '</span>' +
            (warn.length ? '<span class="tl-warn">' + esc(warn.join(' · ')) + '</span>' : '') +
            '<button class="btn tiny" data-edit-tl="' + r.coll + ':' + r.rec.id + '" type="button">편집</button>' +
            '<button class="btn tiny ghost-danger" data-del-tl="' + r.coll + ':' + r.rec.id + '" type="button">삭제</button>' +
          '</li>';
        }).join('') + '</ul>' : '<p class="empty small">입력된 일정이 없습니다.</p>') +
      '</div>';
    }

    return '<section class="panel detail">' +
      '<div class="panel-head"><h2>' + esc(R.sessionLabel(s)) + ' 상세</h2>' +
        '<div class="head-actions">' +
          '<button class="btn tiny" data-add-meal type="button">+ 식사</button>' +
          '<button class="btn tiny" data-add-act type="button">+ 일정</button>' +
          '<button class="btn tiny" data-close-detail type="button">닫기</button>' +
        '</div></div>' +
      '<div class="panel-body">' +
        '<div class="col2">' + dayBlock(1) + dayBlock(2) + '</div>' +
        ((s.changes || []).length ? '<div class="change-box"><b>일정 변경 이력</b>' +
          s.changes.map(function (c) {
            return '<div class="chg-row">' + esc(fieldLabel(c.field)) + ': 당초 <code>' + esc(c.from || '-') + '</code> → 변경 <code>' + esc(c.to || '-') + '</code>' +
              (c.at ? ' <span class="sub">(' + esc(c.at) + ')</span>' : '') +
              (c.reason ? ' <span class="sub">' + esc(c.reason) + '</span>' : '') + '</div>';
          }).join('') + '</div>' : '') +
        '<div class="link-row">' +
          (lists.length ? lists.map(function (c) {
            return '<button class="btn tiny" data-go-list="' + c.id + '" type="button">' + esc(c.title) + ' 열기</button>';
          }).join('') : '<span class="sub">연결된 체크리스트 없음</span>') +
          '<button class="btn tiny" data-new-list type="button">+ 체크리스트 만들기</button>' +
        '</div>' +
      '</div></section>';
  }

  function fieldLabel(k) {
    return { startDate: '시작일', endDate: '종료일', headcount: '인원', lodgingVenueId: '숙소', status: '상태' }[k] || k;
  }

  function sessionFields() {
    return [
      { key: 'regionId', label: '지역', type: 'select', required: true, options: S.all('regions').map(function (r) { return { value: r.id, label: r.name }; }) },
      { key: 'no', label: '차수', type: 'number', required: true },
      { key: 'startDate', label: '시작일', type: 'date', required: true, hint: '요일은 날짜로 자동 계산됩니다.' },
      { key: 'endDate', label: '종료일', type: 'date', required: true },
      { key: 'headcount', label: '인원', type: 'number', hint: '확정 전이면 비워 두세요.' },
      { key: 'lodgingVenueId', label: '숙소', type: 'select', options: venueOptions('숙소') },
      { key: 'status', label: '상태', type: 'select', options: ['예정', '진행', '완료'] },
      { key: 'note', label: '비고', type: 'textarea', span: 2 }
    ];
  }

  function mealFields(s) {
    return [
      { key: 'day', label: 'Day', type: 'select', required: true, options: [{ value: 1, label: 'Day 1 · ' + R.withWeekday(R.dayDate(s, 1)) }, { value: 2, label: 'Day 2 · ' + R.withWeekday(R.dayDate(s, 2)) }] },
      { key: 'mealType', label: '끼니', type: 'select', required: true, options: ['조식', '중식', '석식', '다과'] },
      { key: 'venueId', label: '장소', type: 'select', required: true, options: venueOptions() },
      { key: 'startTime', label: '시작 시각', type: 'time', hint: '석식 기본값 18:00 (BR-01)' },
      { key: 'note', label: '비고', type: 'text', span: 2 }
    ];
  }
  function actFields(s) {
    return [
      { key: 'name', label: '일정명', type: 'text', required: true, span: 2 },
      { key: 'day', label: 'Day', type: 'select', required: true, options: [{ value: 1, label: 'Day 1 · ' + R.withWeekday(R.dayDate(s, 1)) }, { value: 2, label: 'Day 2 · ' + R.withWeekday(R.dayDate(s, 2)) }] },
      { key: 'venueId', label: '장소', type: 'select', required: true, options: venueOptions() },
      { key: 'startTime', label: '시작', type: 'time' },
      { key: 'endTime', label: '종료', type: 'time' },
      { key: 'outdoor', label: '야외 일정', type: 'checkbox', checkLabel: '야외' },
      { key: 'rainPlan', label: '우천 대체안', type: 'text', span: 2, hint: '야외·우천 휴무 장소는 대체안이 없으면 경고가 표시됩니다 (VEN-07).' },
      { key: 'note', label: '비고', type: 'text', span: 2 }
    ];
  }

  function bindSessions(host) {
    host.addEventListener('click', function (e) {
      var t = e.target;

      if (t.closest('[data-add-session]')) {
        U.form({ title: '차수 추가', fields: sessionFields(), values: { status: '예정' }, wide: true }).then(function (d) {
          if (!d) return;
          S.insert('sessions', Object.assign({ id: S.uid('s_'), changes: [] }, d));
          g.Ops.render();
        });
        return;
      }
      var ed = t.closest('[data-edit]');
      if (ed) {
        var s = S.get('sessions', ed.dataset.edit);
        U.form({ title: R.sessionLabel(s) + ' 편집', fields: sessionFields(), values: s, wide: true }).then(function (d) {
          if (!d) return;
          S.updateSession(s.id, d, '차수 화면에서 수정');
          g.Ops.render();
        });
        return;
      }
      var del = t.closest('[data-del]');
      if (del) {
        U.confirm('이 차수를 목록에서 숨길까요? 변경 이력에서 되돌릴 수 있습니다.', { danger: true, ok: '숨기기' }).then(function (ok) {
          if (!ok) return;
          S.remove('sessions', del.dataset.del, '차수 화면에서 삭제');
          if (openSession === del.dataset.del) openSession = null;
          g.Ops.render();
        });
        return;
      }
      if (t.closest('[data-close-detail]')) { openSession = null; g.Ops.render(); return; }

      var tr = t.closest('tbody tr');
      if (tr && !t.closest('button')) { openSession = tr.dataset.id; g.Ops.render(); return; }

      var s2 = S.get('sessions', openSession);
      if (t.closest('[data-add-meal]') && s2) {
        U.form({ title: '식사 추가', fields: mealFields(s2), values: { day: 1, startTime: '18:00', mealType: '석식' } }).then(function (d) {
          if (!d) return;
          S.insert('meals', Object.assign({ sessionId: s2.id }, d));
          g.Ops.render();
        });
        return;
      }
      if (t.closest('[data-add-act]') && s2) {
        U.form({ title: '일정 추가', fields: actFields(s2), values: { day: 1 }, wide: true }).then(function (d) {
          if (!d) return;
          S.insert('activities', Object.assign({ sessionId: s2.id }, d));
          g.Ops.render();
        });
        return;
      }
      var etl = t.closest('[data-edit-tl]');
      if (etl && s2) {
        var parts = etl.dataset.editTl.split(':');
        var rec = S.get(parts[0], parts[1]);
        U.form({
          title: parts[0] === 'meals' ? '식사 편집' : '일정 편집',
          fields: parts[0] === 'meals' ? mealFields(s2) : actFields(s2),
          values: rec, wide: parts[0] !== 'meals'
        }).then(function (d) { if (!d) return; S.update(parts[0], parts[1], d, '일정 화면에서 수정'); g.Ops.render(); });
        return;
      }
      var dtl = t.closest('[data-del-tl]');
      if (dtl) {
        var p2 = dtl.dataset.delTl.split(':');
        S.remove(p2[0], p2[1], '일정 화면에서 삭제');
        g.Ops.render();
        return;
      }
      var gl = t.closest('[data-go-list]');
      if (gl) { g.Ops.go('checklists', { id: gl.dataset.goList }); return; }
      if (t.closest('[data-new-list]') && s2) {
        U.form({
          title: '체크리스트 만들기',
          fields: [
            { key: 'templateType', label: '템플릿', type: 'select', required: true, options: [{ value: 'B', label: 'B · 준비물 체크리스트' }, { value: 'A', label: 'A · 운영 체크리스트' }] },
            { key: 'title', label: '제목', type: 'text', required: true, span: 2 },
            { key: 'copyFrom', label: '복제할 기존 체크리스트', type: 'select', options: S.all('checklists').map(function (c) { return { value: c.id, label: c.title }; }), span: 2 },
            { key: 'copyExcluded', label: '제외·논의 항목 포함', type: 'checkbox', checkLabel: '포함해서 복제' }
          ],
          values: { templateType: 'B', title: R.sessionLabel(s2) + ' 준비물 체크리스트', copyExcluded: true }
        }).then(function (d) {
          if (!d) return;
          g.OpsViews.createChecklist(s2.id, d);
          g.Ops.go('checklists');
        });
      }
    });
  }

  /* ════════ 장소 · 시설 ═════════════════════════════ */

  var openVenue = null;

  V.venues = function (host, params) {
    if (params && params.id) openVenue = params.id;
    if (!S.get('venues', openVenue)) openVenue = null;
    var rows = S.all('venues');

    host.innerHTML =
      '<div class="view-head"><h1>장소 · 시설</h1>' +
        '<div class="head-actions">' +
          '<button class="btn" data-add-dist type="button">+ 구간 거리</button>' +
          '<button class="btn primary" data-add-venue type="button">+ 장소 추가</button>' +
        '</div></div>' +

      U.table([
        { key: 'type', label: '유형', width: '90px', render: function (r) { return U.badge(r.type); } },
        { key: 'name', label: '명칭', render: function (r) {
            return '<b>' + esc(r.name) + '</b>' + ((r.aliases || []).length ? '<span class="sub"> · ' + esc(r.aliases.join(', ')) + '</span>' : '');
          } },
        { key: 'region', label: '지역', width: '70px', render: function (r) { return r.region ? esc(r.region) : U.unknown('-'); } },
        { key: 'closed', label: '휴무', width: '140px', render: function (r) {
            var out = [];
            if ((r.closedWeekdays || []).length) out.push(r.closedWeekdays.join('·') + '요일');
            if (r.closedOnRain) out.push('우천');
            return out.length ? '<span class="warn-txt">' + esc(out.join(' / ')) + '</span>' : '';
          } },
        { key: 'openHours', label: '운영시간', width: '120px', render: function (r) { return r.openHours ? esc(r.openHours) : U.unknown(); } },
        { key: 'status', label: '상태', width: '70px', render: function (r) { return U.badge(r.status, r.status === '제외' ? 'off' : 'ok'); } }
      ], rows, { actions: true, rowClass: function (r) { return r.status === '제외' ? 'is-off' : ''; } }) +

      (openVenue ? venueDetail(openVenue) : '') +

      '<section class="panel">' +
        '<div class="panel-head"><h2>구간 거리</h2><span class="sub">출처가 기록된 실측값만 보관합니다.</span></div>' +
        '<div class="panel-body">' +
        U.table([
          { key: 'route', label: '구간', render: function (r) { return esc(R.venueName(r.fromVenueId) + ' → ' + R.venueName(r.toVenueId)); } },
          { key: 'mode', label: '이동', width: '70px' },
          { key: 'distanceM', label: '거리', width: '100px', render: function (r) {
              return r.distanceM >= 1000 ? U.num(Math.round(r.distanceM / 1000)) + 'km' : U.num(r.distanceM) + 'm';
            } },
          { key: 'minutes', label: '소요', width: '70px', render: function (r) { return r.minutes ? r.minutes + '분' : ''; } },
          { key: 'steps', label: '걸음', width: '80px', render: function (r) { return r.steps ? U.num(r.steps) : ''; } },
          { key: 'crosswalks', label: '횡단보도', width: '80px', render: function (r) { return r.crosswalks ? r.crosswalks + '회' : ''; } },
          { key: 'source', label: '출처', width: '110px' }
        ], S.all('distances'), { actions: true }) +
        '</div></section>';

    bindVenues(host);
  };

  function venueDetail(id) {
    var v = S.get('venues', id);
    if (!v) return '';
    var fac = S.all('facilities').filter(function (f) { return f.venueId === id; });
    var atts = S.all('attachments').filter(function (a) { return a.subjectLink === 'venue:' + id; });

    return '<section class="panel detail">' +
      '<div class="panel-head"><h2>' + esc(v.name) + '</h2>' +
        '<div class="head-actions">' +
          '<button class="btn tiny" data-add-fac type="button">+ 시설 항목</button>' +
          '<button class="btn tiny" data-add-photo type="button">+ 사진</button>' +
          '<button class="btn tiny" data-close-venue type="button">닫기</button>' +
        '</div></div>' +
      '<div class="panel-body">' +
        ((v.restrictions || []).length ? '<div class="restrict-box"><b>이용 제한</b><ul>' +
          v.restrictions.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>' : '') +
        (v.note ? '<p class="note-box">' + esc(v.note) + '</p>' : '') +
        '<h4>시설 정보</h4>' +
        U.table([
          { key: 'category', label: '구분', width: '120px' },
          { key: 'floor', label: '층', width: '70px', render: function (r) { return r.floor ? esc(r.floor) : ''; } },
          { key: 'description', label: '내용', render: function (r) { return r.description ? esc(r.description) : U.unknown('원본 답사 기록 확인 필요'); } }
        ], fac, { actions: true, empty: '등록된 시설 정보가 없습니다.' }) +
        '<h4>사진</h4>' +
        (atts.length ? '<div class="photo-grid">' + atts.map(function (a) {
          return '<figure class="photo" data-att="' + a.id + '"><div class="ph-img" data-ph="' + a.id + '"></div>' +
            '<figcaption>' + esc(a.caption || a.name) + '<button class="btn tiny ghost-danger" data-del-att="' + a.id + '" type="button">삭제</button></figcaption></figure>';
        }).join('') + '</div>' : '<p class="empty small">등록된 사진이 없습니다.</p>') +
      '</div></section>';
  }

  function venueFields() {
    return [
      { key: 'type', label: '유형', type: 'select', required: true, options: ['숙소', '프로그램', '식당', '기타'] },
      { key: 'name', label: '명칭', type: 'text', required: true },
      { key: 'aliases', label: '별칭', type: 'tags', span: 2, hint: '검색에 함께 걸립니다 (MEM-05).' },
      { key: 'region', label: '지역', type: 'select', options: ['영남', '충청', '호남'] },
      { key: 'phone', label: '연락처', type: 'text' },
      { key: 'openHours', label: '운영시간', type: 'text', hint: '확인 전이면 비워 두세요.' },
      { key: 'closedWeekdays', label: '휴무 요일', type: 'multiselect', options: R.WD },
      { key: 'closedOnRain', label: '우천 휴무', type: 'checkbox', checkLabel: '우천 시 휴무' },
      { key: 'status', label: '상태', type: 'select', options: ['사용', '제외'] },
      { key: 'restrictions', label: '이용 제한', type: 'tags', span: 2 },
      { key: 'note', label: '비고', type: 'textarea', span: 2 }
    ];
  }
  function distFields() {
    return [
      { key: 'fromVenueId', label: '출발', type: 'select', required: true, options: venueOptions() },
      { key: 'toVenueId', label: '도착', type: 'select', required: true, options: venueOptions() },
      { key: 'mode', label: '이동 수단', type: 'select', required: true, options: ['차량', '도보'] },
      { key: 'distanceM', label: '거리(m)', type: 'number', required: true },
      { key: 'minutes', label: '소요(분)', type: 'number' },
      { key: 'steps', label: '걸음 수', type: 'number' },
      { key: 'crosswalks', label: '횡단보도(회)', type: 'number' },
      { key: 'source', label: '측정 출처', type: 'text', hint: '예) 네이버 지도' }
    ];
  }

  function bindVenues(host) {
    host.addEventListener('click', function (e) {
      var t = e.target;

      if (t.closest('[data-add-venue]')) {
        U.form({ title: '장소 추가', fields: venueFields(), values: { status: '사용', type: '프로그램' }, wide: true })
          .then(function (d) { if (d) { S.insert('venues', d); g.Ops.render(); } });
        return;
      }
      if (t.closest('[data-add-dist]')) {
        U.form({ title: '구간 거리 추가', fields: distFields(), values: { mode: '차량', source: '네이버 지도' } })
          .then(function (d) { if (d) { S.insert('distances', d); g.Ops.render(); } });
        return;
      }
      if (t.closest('[data-close-venue]')) { openVenue = null; g.Ops.render(); return; }

      var ed = t.closest('[data-edit]');
      if (ed) {
        var id = ed.dataset.edit;
        var coll = collOf(id);
        var rec = S.get(coll, id);
        if (!rec) return;
        var fields = coll === 'venues' ? venueFields() : coll === 'distances' ? distFields() : facFields();
        U.form({ title: '편집', fields: fields, values: rec, wide: coll === 'venues' })
          .then(function (d) { if (d) { S.update(coll, id, d, '장소 화면에서 수정'); g.Ops.render(); } });
        return;
      }
      var del = t.closest('[data-del]');
      if (del) {
        var did = del.dataset.del;
        var dcoll = collOf(did);
        U.confirm('이 항목을 숨길까요?', { danger: true, ok: '숨기기' }).then(function (ok) {
          if (!ok) return;
          S.remove(dcoll, did, '장소 화면에서 삭제');
          if (openVenue === did) openVenue = null;
          g.Ops.render();
        });
        return;
      }
      if (t.closest('[data-add-fac]') && openVenue) {
        U.form({ title: '시설 항목 추가', fields: facFields(), values: {} })
          .then(function (d) { if (d) { S.insert('facilities', Object.assign({ venueId: openVenue }, d)); g.Ops.render(); } });
        return;
      }
      if (t.closest('[data-add-photo]') && openVenue) { pickPhoto('venue:' + openVenue); return; }
      var da = t.closest('[data-del-att]');
      if (da) {
        S.delFile(da.dataset.delAtt).catch(function () {});
        S.remove('attachments', da.dataset.delAtt, '사진 삭제');
        g.Ops.render();
        return;
      }

      var tr = t.closest('tbody tr');
      if (tr && !t.closest('button') && S.get('venues', tr.dataset.id)) { openVenue = tr.dataset.id; g.Ops.render(); }
    });

    /* 사진 썸네일 지연 로드 */
    U.$$('[data-ph]', host).forEach(function (el) {
      S.getFile(el.dataset.ph).then(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        el.style.backgroundImage = 'url("' + url + '")';
        el.addEventListener('click', function () { window.open(url, '_blank'); });
      }).catch(function () { el.textContent = '사진을 불러올 수 없습니다'; });
    });
  }

  /* 장소 화면의 세 표는 id 로 소속을 구분한다 */
  function collOf(id) {
    if (S.get('venues', id)) return 'venues';
    if (S.get('distances', id)) return 'distances';
    return 'facilities';
  }

  function facFields() {
    return [
      { key: 'category', label: '구분', type: 'select', required: true, options: ['층별 안내', '주차장', '편의점', '흡연 장소', '식당 위치', '기타'] },
      { key: 'floor', label: '층', type: 'text' },
      { key: 'description', label: '내용', type: 'textarea', span: 2 }
    ];
  }

  function pickPhoto(subjectLink) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function () {
      var f = input.files[0];
      if (!f) return;
      var id = S.uid('at');
      S.putFile(id, f).then(function () {
        U.form({
          title: '사진 설명',
          fields: [{ key: 'caption', label: '설명', type: 'text', span: 2 }, { key: 'takenAt', label: '촬영일', type: 'date' }],
          values: {}
        }).then(function (d) {
          S.insert('attachments', {
            id: id, subjectLink: subjectLink, name: f.name, caption: (d && d.caption) || '',
            takenAt: (d && d.takenAt) || '', mime: f.type, size: f.size
          });
          g.Ops.render();
        });
      }).catch(function () {
        U.toast('이 브라우저에서는 사진 저장을 쓸 수 없습니다. "로컬서버로 열기.bat"으로 실행해 보세요.', 'err');
      });
    };
    input.click();
  }

  V._venueOptions = venueOptions;
  V._sessionOptions = sessionOptions;
  V._REGION_CLS = REGION_CLS;
})(window);
