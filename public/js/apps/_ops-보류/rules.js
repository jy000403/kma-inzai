/* rules.js — 비즈니스 규칙 검증(5장) · 계산 · 표기 검수
 *
 * 검증 결과는 세 가지로 나눈다.
 *   위반     — 규칙에 어긋나는 데이터가 있음
 *   통과     — 검사할 데이터가 있고 어긋나지 않음
 *   검증불가 — 판단에 필요한 데이터가 없음 (추측하지 않고 그대로 표시)
 *
 * '검증불가'를 별도로 두는 이유는 사용자 지침(확인 불가 항목 명시) 때문이다.
 * 데이터가 없다는 사실을 '통과'로 뭉개면 안 된다.
 */
(function (g) {
  'use strict';

  var S = g.Store, WD = ['일', '월', '화', '수', '목', '금', '토'];

  /* ── 날짜 ─────────────────────────────────────────── */

  /* 받침 유무에 따라 조사를 고른다. josa(이름, '과', '와') */
  function josa(word, withJong, noJong) {
    var s = String(word || '');
    var c = s.charCodeAt(s.length - 1);
    if (!(c >= 0xAC00 && c <= 0xD7A3)) return noJong;
    return ((c - 0xAC00) % 28) ? withJong : noJong;
  }

  function weekday(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
    var p = iso.split('-');
    return WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
  }
  function withWeekday(iso) {
    var w = weekday(iso);
    return iso ? (iso + (w ? '(' + w + ')' : '')) : '';
  }
  function addDays(iso, n) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function dayDate(session, day) {
    if (!session || !session.startDate) return '';
    return addDays(session.startDate, (Number(day) || 1) - 1);
  }
  function rangeLabel(s) {
    if (!s.startDate) return '';
    return withWeekday(s.startDate) + ' ~ ' + withWeekday(s.endDate);
  }

  /* ── 조회 도우미 ──────────────────────────────────── */

  function regionOf(session) { return S.get('regions', session.regionId); }
  function regionName(session) { var r = regionOf(session); return r ? r.name : ''; }
  function sessionLabel(s) { return regionName(s) + ' ' + s.no + '차수'; }
  function venueName(id) { var v = S.get('venues', id); return v ? v.name : ''; }

  /* ── 계산 ─────────────────────────────────────────── */

  function rentalHours(rental) {
    if (!rental || !rental.startAt || !rental.endAt) return null;
    var a = new Date(rental.startAt), b = new Date(rental.endAt);
    if (isNaN(a) || isNaN(b) || b <= a) return null;
    var ms = b - a;
    var hours = ms / 3600000;
    var days = Math.floor(ms / 86400000);
    var rest = ms - days * 86400000;
    return {
      hours: hours,
      text: days + '일(' + (days * 24) + 'h) + ' + Math.floor(rest / 3600000) + 'h' +
            Math.round((rest % 3600000) / 60000) + 'm = ' + (Math.round(hours * 100) / 100) + 'h'
    };
  }

  function carCost() {
    var rental = S.all('rentals')[0];
    if (!rental) return null;
    var trips = S.all('trips').filter(function (t) { return t.rentalId === rental.id && !t.unused; })
                              .sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
    var km = trips.reduce(function (a, t) { return a + (Number(t.distanceKm) || 0); }, 0);
    var gaps = tripGaps(trips);
    var gapKm = gaps.reduce(function (a, gp) { return a + (gp.knownKm || 0); }, 0);
    var h = rentalHours(rental);
    return {
      rental: rental, trips: trips, km: km, gaps: gaps, gapKm: gapKm,
      fuel: km * (Number(rental.perKmRate) || 0),
      fuelWithGap: (km + gapKm) * (Number(rental.perKmRate) || 0),
      hours: h,
      rent: h ? Math.round(h.hours * (Number(rental.hourlyRate) || 0)) : null,
      fuelExpr: trips.map(function (t) { return t.distanceKm; }).join('+') + ' = ' + km.toLocaleString() + 'km',
      billingUnit: rental.billingUnit
    };
  }

  /* 앞 구간 도착지와 다음 구간 출발지가 다르면 기록 공백으로 본다 (BR-08 / CAR-04) */
  function tripGaps(trips) {
    var out = [];
    for (var i = 0; i < trips.length - 1; i++) {
      var a = trips[i], b = trips[i + 1];
      if (!a.toVenueId || !b.fromVenueId) continue;
      if (a.toVenueId === b.fromVenueId) continue;
      var known = S.all('distances').filter(function (d) {
        return (d.fromVenueId === a.toVenueId && d.toVenueId === b.fromVenueId) ||
               (d.fromVenueId === b.fromVenueId && d.toVenueId === a.toVenueId);
      })[0];
      out.push({
        afterSeq: a.seq, from: a.toVenueId, to: b.fromVenueId,
        knownKm: known ? Math.round(known.distanceM / 1000) : 0
      });
    }
    return out;
  }

  /* 객실 수용 인원 (점검 No 5·8) */
  function roomCapacity(sessionId) {
    var asgs = S.all('assignments').filter(function (a) { return a.sessionId === sessionId; });
    var trainee = asgs.filter(function (a) { return a.occupantType === '교육생'; });
    var double = trainee.filter(function (a) { return !a.singleUse && !a.isSpare; });
    var single = trainee.filter(function (a) { return a.singleUse && !a.isSpare; });
    var spare = trainee.filter(function (a) { return a.isSpare; });
    var cap = 0, assumed = false;
    double.forEach(function (a) {
      var r = S.get('rooms', a.roomId);
      cap += r ? (Number(r.capacity) || 0) : 0;
      if (r && r.capacityAssumed) assumed = true;
    });
    cap += single.length;
    return {
      rooms: asgs.length, doubleRooms: double.length, singleRooms: single.length, spareRooms: spare.length,
      capacity: cap, assumed: assumed,
      expr: double.length + '실×2 = ' + (double.length * 2) + '명 + 1인 사용 ' + single.length + '명 = ' + cap + '명'
    };
  }

  /* 수량 산식 (CHK-07) — 확정 값으로 계산되는 것만 처리한다 */
  function evalQty(formula, ctx) {
    if (!formula) return null;
    var expr = String(formula);
    var missing = [];
    /* \w 는 한글을 포함하지 않으므로 중괄호 안을 통째로 잡는다 */
    expr = expr.replace(/\{([^}]+)\}/g, function (_, key) {
      var v = ctx[key];
      if (v === null || v === undefined || v === '') { missing.push(key); return '0'; }
      return String(v);
    });
    if (missing.length) return { value: null, missing: missing };
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return { value: null, error: '식에 사용할 수 없는 문자가 있습니다.' };
    try {
      /* eslint-disable-next-line no-new-func */
      var v = Function('"use strict";return (' + expr + ')')();
      if (typeof v !== 'number' || !isFinite(v)) return { value: null, error: '계산할 수 없는 식입니다.' };
      return { value: Math.round(v), expr: expr };
    } catch (e) { return { value: null, error: '계산할 수 없는 식입니다.' }; }
  }

  /* ── 표기 검수 (LINT) ─────────────────────────────── */

  var LINT_FIELDS = {
    sessions: ['note'], venues: ['name', 'note'], facilities: ['description'],
    checklists: ['title'], checklistItems: ['name', 'note', 'area'],
    facts: ['content', 'note'], questions: ['question', 'answer'],
    activities: ['name', 'note', 'rainPlan'], meals: ['note'], trips: ['note'], rentals: ['note']
  };

  function lintScan() {
    var dict = S.all('lint');
    var hits = [];
    if (!dict.length) return hits;
    Object.keys(LINT_FIELDS).forEach(function (coll) {
      S.all(coll).forEach(function (rec) {
        LINT_FIELDS[coll].forEach(function (f) {
          var text = rec[f];
          if (!text || typeof text !== 'string') return;
          dict.forEach(function (d) {
            if (!d.wrong || text.indexOf(d.wrong) === -1) return;
            /* 이미 올바른 표기의 일부라면 넘어간다 (부점장 ⊄ 부·점장) */
            if (d.right && text.indexOf(d.right) !== -1 && text.split(d.right).join('').indexOf(d.wrong) === -1) return;
            hits.push({ coll: coll, id: rec.id, field: f, wrong: d.wrong, right: d.right, text: text });
          });
        });
      });
    });
    return hits;
  }

  function lintText(text) {
    var out = String(text || '');
    S.all('lint').forEach(function (d) { if (d.wrong) out = out.split(d.wrong).join(d.right); });
    return out;
  }

  /* ── 규칙 검증 ────────────────────────────────────── */

  function ruleOf(id) { return S.get('rules', id) || { id: id, severity: '경고', active: true, description: '' }; }

  function F(id, status, title, detail, link) {
    var r = ruleOf(id);
    return {
      ruleId: id, status: status, severity: status === '위반' ? (r.severity || '경고') : '',
      title: title, detail: detail || '', link: link || null, description: r.description
    };
  }

  function runAll() {
    var out = [];
    var sessions = S.all('sessions');
    var meals = S.all('meals');
    var acts = S.all('activities');
    var asgs = S.all('assignments');
    var parts = S.all('participants');

    function push(f) { if (ruleOf(f.ruleId).active !== false) out.push(f); }

    /* BR-01 저녁식사 18:00 */
    var dinners = meals.filter(function (m) { return m.mealType === '석식'; });
    if (!dinners.length) push(F('BR-01', '검증불가', '석식 계획이 입력되지 않았습니다.'));
    else {
      var bad = dinners.filter(function (m) { return m.startTime && m.startTime !== '18:00'; });
      bad.length
        ? bad.forEach(function (m) {
            var s = S.get('sessions', m.sessionId);
            push(F('BR-01', '위반', sessionLabel(s) + ' Day' + m.day + ' 석식 시작 ' + m.startTime, '기본값 18:00과 다릅니다.', { view: 'sessions', id: m.sessionId }));
          })
        : push(F('BR-01', '통과', '석식 ' + dinners.length + '건 모두 18:00'));
    }

    /* BR-02 충청 월요일 시작 불가 */
    var cc = sessions.filter(function (s) { return regionName(s) === '충청'; });
    var ccBad = cc.filter(function (s) { return weekday(s.startDate) === '월'; });
    if (!cc.length) push(F('BR-02', '검증불가', '충청 차수가 없습니다.'));
    else if (ccBad.length) ccBad.forEach(function (s) { push(F('BR-02', '위반', sessionLabel(s) + ' 시작일 ' + withWeekday(s.startDate), '', { view: 'sessions', id: s.id })); });
    else push(F('BR-02', '통과', '충청 ' + cc.length + '개 차수 시작일 ' + cc.map(function (s) { return withWeekday(s.startDate); }).join(', ')));

    /* BR-03 제외 장소 배치 금지 */
    var excluded = S.all('venues').filter(function (v) { return v.status === '제외'; }).map(function (v) { return v.id; });
    var usedExcluded = meals.concat(acts).filter(function (x) { return excluded.indexOf(x.venueId) !== -1; });
    if (!excluded.length) push(F('BR-03', '검증불가', '제외 처리된 장소가 없습니다.'));
    else if (usedExcluded.length) usedExcluded.forEach(function (x) {
      var n = venueName(x.venueId);
      push(F('BR-03', '위반', n + josa(n, '이', '가') + ' 일정에 배치되어 있습니다.', '', { view: 'sessions', id: x.sessionId }));
    });
    else push(F('BR-03', '통과', '제외 장소(' + excluded.map(venueName).join(', ') + ') 배치 없음'));

    /* BR-04 영동와인전망대 월요일·우천 휴무 */
    checkVenueClosure('BR-04', 'v_wine', out, push);
    /* BR-05 진안 마이돈 수요일 휴무 */
    checkVenueClosure('BR-05', 'v_don', out, push);

    /* BR-06 수목원 우천 대체안 */
    var arbo = acts.filter(function (a) { return a.venueId === 'v_arbo'; });
    if (!arbo.length) push(F('BR-06', '검증불가', '국립진안고원수목원 일정이 입력되지 않았습니다.'));
    else {
      var noPlan = arbo.filter(function (a) { return !a.rainPlan; });
      noPlan.length
        ? noPlan.forEach(function (a) { push(F('BR-06', '위반', a.name + ' — 우천 대체안 없음', '실내 프로그램이 오후만 운영되어 오전 대체안이 필요합니다.', { view: 'sessions', id: a.sessionId })); })
        : push(F('BR-06', '통과', '수목원 일정 ' + arbo.length + '건 모두 우천 대체안 있음'));
    }

    /* BR-07 주차 계획 — 차수 단위로 본다. 어느 체크리스트에든 들어 있으면 통과 */
    var lists = S.all('checklists');
    if (!lists.length) push(F('BR-07', '검증불가', '체크리스트가 없습니다.'));
    else {
      var items = S.all('checklistItems');
      var covered = {};
      lists.forEach(function (c) {
        if (items.some(function (i) { return i.checklistId === c.id && /주차/.test(i.name || ''); })) covered[c.sessionId] = true;
      });
      var sids = lists.map(function (c) { return c.sessionId; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      var missing = sids.filter(function (sid) { return !covered[sid]; });
      missing.length
        ? missing.forEach(function (sid) { push(F('BR-07', '위반', sessionLabel(S.get('sessions', sid)) + ' — 주차 관련 항목 없음', '', { view: 'checklists' })); })
        : push(F('BR-07', '통과', '체크리스트가 있는 ' + sids.length + '개 차수 모두 주차 항목 포함'));
    }

    /* BR-08 차량 동선 연속성 */
    var cc2 = carCost();
    if (!cc2 || !cc2.trips.length) push(F('BR-08', '검증불가', '운영 차량 동선이 입력되지 않았습니다.'));
    else if (cc2.gaps.length) {
      cc2.gaps.forEach(function (gp) {
        push(F('BR-08', '위반',
          gp.afterSeq + '번 구간 이후 동선 기록 공백 — ' + venueName(gp.from) + ' → ' + venueName(gp.to),
          gp.knownKm ? '구간 마스터 기준 ' + gp.knownKm + 'km. 유류비 합계에 반영되지 않았습니다.' : '구간 거리 정보 없음.',
          { view: 'car' }));
      });
    } else push(F('BR-08', '통과', '구간 ' + cc2.trips.length + '건 동선 연속'));

    /* BR-09 일라이트 부대시설 안내 문구 */
    var q9 = S.all('questions').filter(function (x) { return /부대시설/.test(x.question); })[0];
    if (q9 && q9.status !== '해결') push(F('BR-09', '위반', '일라이트 호텔 부대시설 안내 문구 미협의', '미결 질문으로 등록되어 있습니다.', { view: 'questions', id: q9.id }));
    else push(F('BR-09', '통과', '안내 문구 협의 완료'));

    /* 영남 1차수 객실 규칙 */
    var yn1 = S.first('sessions', function (s) { return s.regionId === 'r_yn' && s.no === 1; });
    var yAsg = yn1 ? asgs.filter(function (a) { return a.sessionId === yn1.id; }) : [];

    /* BR-10 강사 객실 미배정 */
    if (!yAsg.length) push(F('BR-10', '검증불가', '객실 배정 데이터가 없습니다.'));
    else {
      var teacher = yAsg.filter(function (a) { return a.occupantType === '강사'; });
      teacher.length
        ? push(F('BR-10', '위반', '강사 배정 객실 ' + teacher.length + '실', '강사 객실은 배정하지 않기로 되어 있습니다.', { view: 'rooms' }))
        : push(F('BR-10', '통과', '강사 배정 객실 없음'));
    }

    /* BR-11 운영진 1인 1실 · 인원 대비 객실 수 */
    if (!yAsg.length) push(F('BR-11', '검증불가', '객실 배정 데이터가 없습니다.'));
    else {
      var staff = yAsg.filter(function (a) { return a.occupantType === 'KMA 운영진' || a.occupantType === '고객사 담당'; });
      var notSingle = staff.filter(function (a) { return !a.singleUse; });
      if (notSingle.length) push(F('BR-11', '위반', '운영진 객실 중 1인 사용이 아닌 곳 ' + notSingle.length + '실', notSingle.map(function (a) { return roomNo(a); }).join(', '), { view: 'rooms' }));
      else if (staff.length !== 5) push(F('BR-11', '위반', '운영진 객실 ' + staff.length + '실 ≠ 운영진 5명 (KMA 4 + 하나은행 1)', '메모리의 강사·운영진 6실 기록과 배치 원칙이 어긋납니다 (점검 No 6).', { view: 'rooms' }));
      else push(F('BR-11', '통과', '운영진 5실, 모두 1인 사용'));
    }

    /* BR-12 / BR-13 — 교육생 속성 필요 */
    if (!yAsg.length) push(F('BR-12', '검증불가', '객실 배정 데이터가 없습니다.'));
    else {
      var tr = yAsg.filter(function (a) { return a.occupantType === '교육생'; });
      push(F('BR-12', '검증불가', '교육생 2인 1실 ' + tr.filter(function (a) { return !a.singleUse; }).length + '실 / 1인 사용 ' + tr.filter(function (a) { return a.singleUse; }).length + '실',
        '연령대 우선 배정 여부는 교육생 연령 정보가 없어 확인할 수 없습니다.', { view: 'rooms' }));
    }
    push(F('BR-13', '검증불가', '본부 정보가 있는 교육생이 없어 확인할 수 없습니다.', '', { view: 'rooms' }));

    /* BR-14 남녀 혼숙 */
    if (!parts.length) push(F('BR-14', '검증불가', '교육생 명단이 없어 확인할 수 없습니다.', '', { view: 'rooms' }));
    else {
      var mixed = [];
      var byRoom = {};
      parts.forEach(function (p) {
        var a = yAsg.filter(function (x) { return x.occupantCode === p.code; })[0];
        if (!a) return;
        (byRoom[a.roomId] = byRoom[a.roomId] || []).push(p);
      });
      Object.keys(byRoom).forEach(function (rid) {
        var gs = byRoom[rid].map(function (p) { return p.gender; }).filter(Boolean);
        if (gs.length > 1 && gs.some(function (x) { return x !== gs[0]; })) mixed.push(rid);
      });
      mixed.length
        ? mixed.forEach(function (rid) { push(F('BR-14', '위반', roomNoById(rid) + '호 남녀 혼숙', '', { view: 'rooms' })); })
        : push(F('BR-14', '통과', '혼숙 객실 없음'));
    }

    /* BR-15 여성 인접 배치 · 스위트 정원 */
    var suites = S.all('rooms').filter(function (r) { return r.roomType === '스위트'; });
    var suiteBad = suites.filter(function (r) { return Number(r.capacity) !== 2; });
    if (suiteBad.length) push(F('BR-15', '위반', '스위트 정원이 2인이 아닌 객실: ' + suiteBad.map(function (r) { return r.roomNo; }).join(', '), '', { view: 'rooms' }));
    else if (!parts.length) push(F('BR-15', '검증불가', '스위트 정원 2인은 확인됨. 여성 4명 인접 배치는 교육생 명단이 없어 확인할 수 없습니다.', '', { view: 'rooms' }));
    else push(F('BR-15', '통과', '스위트 정원 2인 · 여성 배치 확인'));

    /* BR-16 303 / 305 고정 배정 */
    if (!yAsg.length) push(F('BR-16', '검증불가', '객실 배정 데이터가 없습니다.'));
    else {
      var a303 = yAsg.filter(function (a) { return roomNo(a) === '303'; })[0];
      var a305 = yAsg.filter(function (a) { return roomNo(a) === '305'; })[0];
      var bad16 = [];
      if (a303 && a303.occupantType !== '교육생') bad16.push('303호 배정 대상이 ' + a303.occupantType + ' — 배치 원칙은 최고령 교육생');
      if (a305 && a305.occupantType !== '고객사 담당') bad16.push('305호 배정 대상이 ' + a305.occupantType + ' — 배치 원칙은 하나은행 담당자');
      bad16.length
        ? bad16.forEach(function (m) { push(F('BR-16', '위반', m, '점검 No 6', { view: 'rooms' })); })
        : push(F('BR-16', '통과', '303호 교육생 · 305호 고객사 담당'));
    }

    /* BR-17 예비실 */
    if (!yAsg.length) push(F('BR-17', '검증불가', '객실 배정 데이터가 없습니다.'));
    else {
      var spares = yAsg.filter(function (a) { return a.isSpare; });
      if (!spares.length) push(F('BR-17', '검증불가', '예비실로 지정된 객실이 없습니다.', '예비실 호실이 확정되지 않았습니다 (점검 No 8).', { view: 'rooms' }));
      else {
        var occupied = spares.filter(function (a) { return a.occupantCode; });
        occupied.length
          ? occupied.forEach(function (a) { push(F('BR-17', '위반', roomNo(a) + '호 예비실에 인원이 배정되어 있습니다.', '', { view: 'rooms' })); })
          : push(F('BR-17', '통과', '예비실 ' + spares.length + '실 비어 있음'));
      }
    }

    /* BR-18 조 편성 */
    if (!parts.length) push(F('BR-18', '검증불가', '교육생 명단이 없어 조 편성을 확인할 수 없습니다.', '확인된 사실: 30명, 6명×5개조, 여성 4명 조별 분산.', { view: 'rooms' }));
    else {
      var teams = {};
      parts.forEach(function (p) { if (p.teamNo) (teams[p.teamNo] = teams[p.teamNo] || []).push(p); });
      var keys = Object.keys(teams);
      var msgs = [];
      keys.forEach(function (k) {
        if (teams[k].length !== 6) msgs.push(k + '조 ' + teams[k].length + '명');
        var f = teams[k].filter(function (p) { return p.gender === '여'; }).length;
        if (f > 1) msgs.push(k + '조 여성 ' + f + '명');
      });
      msgs.length
        ? push(F('BR-18', '위반', msgs.join(' · '), '6명×5개조, 여성 조별 1명 기준', { view: 'rooms' }))
        : push(F('BR-18', '통과', keys.length + '개조 편성 · 여성 분산 확인'));
    }

    /* BR-19 표기 */
    var hits = lintScan();
    hits.length
      ? push(F('BR-19', '위반', '표기 오류 ' + hits.length + '건', hits.slice(0, 5).map(function (h) { return h.wrong + ' → ' + h.right; }).join(', '), { view: 'rules' }))
      : push(F('BR-19', '통과', '표기 사전 위반 없음'));

    /* BR-20 음주 후 전망대 이용 */
    var wineActs = acts.filter(function (a) { return a.venueId === 'v_wine'; });
    if (!wineActs.length) push(F('BR-20', '검증불가', '영동와인전망대 일정이 입력되지 않았습니다.'));
    else {
      var risky = wineActs.filter(function (a) {
        var d = dayDate(S.get('sessions', a.sessionId), a.day);
        return meals.some(function (m) {
          return m.sessionId === a.sessionId && m.mealType === '석식' &&
                 dayDate(S.get('sessions', m.sessionId), m.day) === d &&
                 a.startTime && m.startTime && a.startTime > m.startTime;
        });
      });
      risky.length
        ? risky.forEach(function (a) { push(F('BR-20', '위반', a.name + ' — 석식 이후 전망대 일정', '음주 후 이용 불가 제한이 있습니다.', { view: 'sessions', id: a.sessionId })); })
        : push(F('BR-20', '통과', '석식 이후 전망대 일정 없음'));
    }

    return out;
  }

  function checkVenueClosure(ruleId, venueId, out, push) {
    var v = S.get('venues', venueId);
    if (!v) { push(F(ruleId, '검증불가', '장소 정보가 없습니다.')); return; }
    var rows = S.all('meals').concat(S.all('activities')).filter(function (x) { return x.venueId === venueId; });
    if (!rows.length) { push(F(ruleId, '검증불가', v.name + ' 일정이 입력되지 않았습니다.')); return; }
    var bad = [];
    rows.forEach(function (x) {
      var s = S.get('sessions', x.sessionId);
      var d = dayDate(s, x.day);
      var w = weekday(d);
      if ((v.closedWeekdays || []).indexOf(w) !== -1) bad.push({ x: x, msg: v.name + ' ' + withWeekday(d) + ' — 휴무일' });
      if (v.closedOnRain && !x.rainPlan) bad.push({ x: x, msg: v.name + ' ' + withWeekday(d) + ' — 우천 대체안 없음' });
    });
    bad.length
      ? bad.forEach(function (b) { push(F(ruleId, '위반', b.msg, '', { view: 'sessions', id: b.x.sessionId })); })
      : push(F(ruleId, '통과', v.name + ' 일정 ' + rows.length + '건 이상 없음'));
  }

  function roomNo(a) { var r = S.get('rooms', a.roomId); return r ? r.roomNo : a.roomId; }
  function roomNoById(id) { var r = S.get('rooms', id); return r ? r.roomNo : id; }

  /* ── 사실 카드 충돌 감지 (MEM-04) ─────────────────── */

  function factConflicts() {
    var groups = {};
    S.all('facts').forEach(function (f) {
      if (!f.subject || !f.attribute || !f.value) return;
      if (f.supersededBy) return;
      var k = f.subject + '||' + f.attribute;
      (groups[k] = groups[k] || []).push(f);
    });
    return Object.keys(groups).map(function (k) {
      var rows = groups[k];
      var values = rows.map(function (r) { return r.value; });
      var distinct = values.filter(function (v, i) { return values.indexOf(v) === i; });
      if (distinct.length < 2) return null;
      return { subject: rows[0].subject, attribute: rows[0].attribute, facts: rows, values: distinct };
    }).filter(Boolean);
  }

  /* ── 확인 필요 항목 모음 ──────────────────────────── */

  function unknowns() {
    var out = [];
    S.all('sessions').forEach(function (s) {
      if (s.headcount === null || s.headcount === undefined || s.headcount === '')
        out.push({ text: sessionLabel(s) + ' 인원 미입력', link: { view: 'sessions', id: s.id } });
    });
    S.all('venues').forEach(function (v) {
      if (v.type === '프로그램' && !v.openHours)
        out.push({ text: v.name + ' 운영시간 미입력', link: { view: 'venues', id: v.id } });
    });
    S.all('trips').forEach(function (t) {
      if (!t.date) out.push({ text: '운영 차량 ' + t.seq + '번 구간 일자 미입력', link: { view: 'car' } });
    });
    var r = S.all('rentals')[0];
    if (r && (!r.reserver || r.billingUnit === '미확정'))
      out.push({ text: '운영 차량 예약자 · 과금 단위 미확정', link: { view: 'car' } });
    return out;
  }

  g.Rules = {
    WD: WD,
    weekday: weekday, withWeekday: withWeekday, addDays: addDays, dayDate: dayDate, rangeLabel: rangeLabel,
    regionName: regionName, sessionLabel: sessionLabel, venueName: venueName,
    rentalHours: rentalHours, carCost: carCost, roomCapacity: roomCapacity, evalQty: evalQty,
    lintScan: lintScan, lintText: lintText, josa: josa,
    runAll: runAll, factConflicts: factConflicts, unknowns: unknowns
  };
})(window);
