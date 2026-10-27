/* store.js — 외부용 견적서
 *
 * 내부 예산서에는 원가와 사업이익이 들어 있다. 그건 밖으로 나가면 안 된다.
 * 견적서는 고객이 볼 것만 남긴다 — 항목 · 단가 · 수량 · 차수 · 견적가 · 합계.
 *
 * 양식은 전달받은 「(견적서)클라우드네트웍스 대리과장 승진자과정_KMA.xlsx」 를 그대로 따랐다.
 */
(function (g) {
  'use strict';

  var SUP_KEY = g.Scope.key('kma-quote-supplier:v1');

  /* 한국능률협회 고정 정보. 바뀌면 견적서 화면에서 한 번만 고치면 계속 쓰인다. */
  var SUPPLIER_DEFAULT = {
    bizNo: '105-82-01810',
    company: '(사)한국능률협회',
    ceo: '최  권  석',
    address: '서울 영등포구 여의도동 17-13 이룸센터 8층, 9층, 10층',
    industry: '제조업, 부동산 서비스',
    item: '학술연구용역, 교육',
    tel: '02-3274-9380',
    fax: '02-3274-9288'
  };

  /* 회사 견적 양식의 '구분'은 교육비 / 운영비 두 가지다. 예산서와 같은 이름을 쓴다. */
  var TEACHING = ['원)비상임강사료', '원)컨설턴트급여(용역비)'];
  var GROUPS = ['교육비', '운영비'];

  function supplier() {
    try {
      var raw = localStorage.getItem(SUP_KEY);
      if (raw) return Object.assign({}, SUPPLIER_DEFAULT, JSON.parse(raw));
    } catch (e) {}
    return Object.assign({}, SUPPLIER_DEFAULT);
  }
  function saveSupplier(s) {
    try { localStorage.setItem(SUP_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function uid() { return 'ql' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5); }

  function today() {
    var d = new Date();
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  /* ── 예산 항목 → 견적 줄 ──────────────────────────── */

  /* 수량 기준을 '단가 × 수량 × 수량 × 차수' 네 칸으로 편다 */
  function lineFrom(item, ops, course) {
    var head = Number(ops.headcount) || 0, days = Number(ops.days) || 0, sess = Number(ops.sessions) || 1;
    var hrs = Number(ops.hours) || 0;
    var q1 = 1, u1 = '식', q2 = 1, u2 = '';
    switch (item.basis) {
      /* 교육은 시간 단위가 기본이다. 이 줄이 없어서 강사료가 늘 '1 식' 으로 나갔고,
         350,000 × 14H 가 350,000 으로 찍혔다. 고객에게 나가는 금액이라 치명적이었다. */
      case 'hours': q1 = hrs || 1; u1 = item.unit || 'H'; break;
      case 'days': q1 = days || 1; u1 = '일'; break;
      case 'head': q1 = head || 1; u1 = '명'; break;
      case 'headday': q1 = head || 1; u1 = '명'; q2 = days || 1; u2 = '일'; break;
      default: q1 = Number(item.qty) || 1; u1 = item.unit || '식';
    }
    /* 원가 표에서 수량을 손으로 적었으면 그 값이 견적서에도 그대로 간다 */
    if (item.qtyFixed !== null && item.qtyFixed !== undefined && item.qtyFixed !== '') {
      q1 = Number(item.qtyFixed) || 0;
      u1 = item.unit || u1;
      q2 = 1; u2 = '';
    }
    var group = item.group || (TEACHING.indexOf(item.account) !== -1 ? '교육비' : '운영비');
    return {
      id: uid(),
      group: group,
      name: item.name || '',
      /* 교육비 줄의 '내용' 은 무슨 교육에 대한 돈인지 — 과정명을 적는다
         (예: 하나은행 부점장 리더십 교육). 시간은 수량 칸에 이미 있다. */
      detail: (group === '교육비' && course) ? course : detailFor(item, ops),
      unit: Number(item.price) || 0,
      q1: q1, u1: u1, q2: q2, u2: u2,
      sessions: sess, su: '차수',
      memo: ''
    };
  }

  /* 견적서에 적을 과정명 — 문의 제목에 붙은 '견적 · 프로그램 · 문의' 같은 말을 떼고
     '… 교육' 으로 끝나게 다듬는다. 예) '(주)OO 전 직원 대상 리더십 교육 견적 및 프로그램'
     → '(주)OO 전 직원 대상 리더십 교육' */
  function courseLabel(p) {
    var t = String((p.quote && p.quote.courseName) || p.title || '').trim();
    var tail = /\s*(견적\s*및\s*프로그램|프로그램\s*및\s*견적|견적|프로그램|제안|기획|문의|요청|진행|드립니다|합니다|관련)\s*$/;
    for (var k = 0; k < 6 && tail.test(t); k++) t = t.replace(tail, '').trim();
    t = t.replace(/교육\s*프로그램$/, '교육');
    if (!t) return '';
    if (!/(교육|과정|특강|강의|워크숍|연수|세미나|코칭)$/.test(t)) t += ' 교육';
    return t;
  }

  /* 견적서 항목 옆의 넓은 칸 — '무엇에 대한 돈인가' 를 적는 자리다.
     아무것도 안 채우면 고객이 받는 종이에 빈 칸이 덩그러니 남는다.
     원가 표에 적어 둔 메모가 있으면 그걸 쓰고, 없으면 산출 근거를 적어 준다
     (숫자 칸은 '4  H  1' 처럼 쪼개져 있어 읽으려면 눈으로 다시 붙여야 한다). */
  function detailFor(item, ops) {
    if (item.note) return String(item.note);
    var head = Number(ops.headcount) || 0, days = Number(ops.days) || 0;
    var hrs = Number(ops.hours) || 0, sess = Number(ops.sessions) || 1;
    var per = sess > 1 ? ' × ' + sess + '차수' : '';
    switch (item.basis) {
      case 'hours': return hrs ? hrs + '시간' + per : '';
      case 'days': return days ? days + '일' + per : '';
      case 'head': return head ? head + '명' + per : '';
      case 'headday':
        return (head && days) ? head + '명 × ' + days + '일' + per : '';
      default: return '';
    }
  }

  function amount(l) {
    return (Number(l.unit) || 0) * (Number(l.q1) || 0) * (Number(l.q2) || 0) * (Number(l.sessions) || 0);
  }

  /* 같은 묶음끼리 모으고 소계를 붙인다.
     교육비가 늘 먼저 온다 — 고객이 그 차례로 읽고 양식도 그렇게 돼 있다. */
  function groups(q) {
    var order = [], byName = {};
    (q.lines || []).forEach(function (l) {
      var k = l.group || '기타';
      if (!byName[k]) { byName[k] = []; order.push(k); }
      byName[k].push(l);
    });
    order.sort(function (a, b) {
      var ia = GROUPS.indexOf(a), ib = GROUPS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return order.map(function (k) {
      var lines = byName[k];
      return { name: k, lines: lines, sub: lines.reduce(function (a, l) { return a + amount(l); }, 0) };
    });
  }

  function total(q) {
    var raw = (q.lines || []).reduce(function (a, l) { return a + amount(l); }, 0);
    var grand = q.roundDown ? Math.floor(raw / 1000) * 1000 : raw;
    var vat = q.taxFree ? 0 : Math.round(grand * 0.1);
    return { raw: raw, grand: grand, vat: vat, sum: grand + vat, cut: raw - grand };
  }

  /* ── 견적서 만들기 ────────────────────────────────── */

  /* ── 원가 → 판매가 ──────────────────────────────────
     예산서의 단가는 원가다(강사료 시간당 20만원). 고객에게 나가는 견적서는
     제안가(시간당 40만원 꼴)로 나가야 한다. 전에는 원가가 그대로 실려
     200,000 × 5H = 1,000,000 이 찍히고 합계만 제안가 2,000,000 이라고 나갔다.
     줄마다 같은 비율로 올려 합계가 제안가와 딱 맞게 한다.
     단가는 천 원 단위로 반올림하고, 남는 몇 천 원은 금액이 큰 줄이 떠안는다. */
  function mult(l) {
    return (Number(l.q1) || 0) * (Number(l.q2) || 0) * (Number(l.sessions) || 0);
  }
  function sum(lines) { return lines.reduce(function (a, l) { return a + amount(l); }, 0); }

  function fitLines(lines, target, roundDown) {
    target = Number(target) || 0;
    var live = (lines || []).filter(function (l) { return amount(l) > 0; });
    var raw = sum(live);
    if (!target || !raw || raw === target) return lines;
    var r = target / raw;
    live.forEach(function (l) {
      var u = (Number(l.unit) || 0) * r;
      var st = u >= 10000 ? 1000 : u >= 1000 ? 100 : 10;
      l.unit = Math.round(u / st) * st;
    });
    var diff = target - sum(live);
    if (!diff) return lines;

    /* 남은 차액을 한 줄이 떠안는다. 고객이 291,506 같은 단가를 보지 않게
       되도록 둥근 단위(천 원 → 백 원 → 십 원 → 원)로 올리고,
       합계 천단위 절사가 켜져 있으면 1,000원 미만 넘침은 절사로 없어지니 허용한다. */
    /* 먼저 해 보는 순서: [단위, 딱 맞아야 하나] */
    var TRIES = [[1000, 1], [100, 1], [1000, 0], [100, 0], [10, 1], [10, 0], [1, 1]];
    var big = live.slice().sort(function (a, b) { return amount(b) - amount(a); });
    for (var i = 0; i < TRIES.length; i++) {
      var st = TRIES[i][0], exact = TRIES[i][1];
      if (!exact && !roundDown) continue;
      for (var j = 0; j < big.length; j++) {
        var l = big[j], m = mult(l);
        if (!m) continue;
        var step = Math.ceil(diff / (m * st)) * st;
        var over = step * m - diff;
        if (exact ? over : over >= 1000) continue;
        if (Number(l.unit) + step <= 0) continue;
        l.unit = Number(l.unit) + step;
        return lines;
      }
    }
    return lines;
  }

  /* 견적서 줄을 제안가에 맞춘다. 이후 제안가가 바뀌면 견적서도 따라간다
     (단가·수량을 손으로 고치면 그때부터는 따라가지 않는다 — views.js). */
  function fit(p) {
    fitLines(p.quote.lines, p.budget && p.budget.price, p.quote.roundDown);
    p.quote.follow = true;
    return p.quote;
  }

  /* 견적서를 아직 안 만든 건 — PPT 견적표에 실을 줄을 저장하지 않고 만들어 본다 */
  function preview(p) {
    var lines = ((p.budget && p.budget.items) || []).filter(function (it) { return Number(it.price); })
      .map(function (it) { return lineFrom(it, p.ops || {}, courseLabel(p)); });
    /* 새 견적서는 절사를 켠 채 시작한다 (ensure) */
    var cut = p.quote && p.quote.lines ? p.quote.roundDown : true;
    return fitLines(lines, p.budget && p.budget.price, cut);
  }

  /* 교육비 줄의 '내용' 은 과정명이다. 비어 있거나 '5시간' 처럼 시간만 적힌 줄은 과정명으로 채운다.
     (손으로 적은 다른 내용은 그대로 둔다) 예전에 만든 견적서도 열 때 이렇게 맞춰진다. */
  function fixDetails(p) {
    var q = p.quote;
    if (!q || !q.lines) return;
    var course = String(q.courseName || '').trim() || courseLabel(p);
    if (!course) return;
    q.lines.forEach(function (l) {
      if (l.group !== '교육비') return;
      var d = String(l.detail || '').trim();
      if (!d || /^\d+(\.\d+)?\s*(시간|H)(\s*×\s*\d+\s*차수)?$/i.test(d)) l.detail = course;
    });
  }

  function ensure(p) {
    if (p.quote && p.quote.lines) {
      /* 제안가를 따라가기로 한 견적서는 제안가가 바뀌었으면 다시 맞춘다 */
      if (p.quote.follow && !gap(p).same) fit(p);
      fixDetails(p);
      return p.quote;
    }
    p.quote = {
      to: (p.client && p.client.company) || '',
      courseName: courseLabel({ title: p.title }) || p.title || '',
      issueDate: today(),
      taxFree: true,
      roundDown: true,
      notes: '',
      lines: []
    };
    seed(p);
    fixDetails(p);
    return p.quote;
  }

  /* 예산 항목에서 견적 줄을 다시 만든다. 직접 고친 줄은 사라진다.
     제안가가 있으면 단가를 판매가로 올려 둔다. */
  function seed(p) {
    var q = p.quote;
    q.lines = preview(p);
    q.follow = true;
    return q.lines;
  }

  /* 견적 합계와 제안가가 어긋나 있는지 — 어긋나면 화면에 알린다 */
  function gap(p) {
    var t = total(p.quote);
    var price = Number(p.budget.price) || 0;
    return { quote: t.grand, price: price, diff: t.grand - price, same: !price || t.grand === price };
  }

  /* ── 한글 금액 (금○○○원정) ───────────────────────── */

  var DIGIT = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  var SMALL = ['', '십', '백', '천'];
  var BIG = ['', '만', '억', '조', '경'];

  function korean(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (!n) return '영';
    var out = '', unit = 0;
    while (n > 0) {
      var chunk = n % 10000;
      n = Math.floor(n / 10000);
      if (chunk) {
        var s = '', i = 0;
        while (chunk > 0) {
          var d = chunk % 10;
          if (d) s = DIGIT[d] + SMALL[i] + s;
          chunk = Math.floor(chunk / 10);
          i++;
        }
        out = s + BIG[unit] + out;
      }
      unit++;
    }
    return out;
  }
  function koreanMoney(n) { return '금' + korean(n) + '원정'; }

  g.QuoteStore = {
    SUPPLIER_DEFAULT: SUPPLIER_DEFAULT, GROUPS: GROUPS,
    supplier: supplier, saveSupplier: saveSupplier,
    ensure: ensure, seed: seed, lineFrom: lineFrom, fit: fit, preview: preview,
    courseLabel: courseLabel, fixDetails: fixDetails,
    amount: amount, groups: groups, total: total, gap: gap,
    korean: korean, koreanMoney: koreanMoney, uid: uid, today: today
  };
})(window);
