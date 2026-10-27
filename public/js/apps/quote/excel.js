/* excel.js — 견적서를 엑셀(.xlsx) 파일로 만든다
 *
 * 칸 배치·열 너비·테두리는 전달받은 KMA 견적서 양식을 그대로 옮겼다.
 * 항목 수에 따라 표 높이만 늘어난다.
 */
(function (g) {
  'use strict';

  var Q = g.QuoteStore;

  var MONEY = '_-* #,##0_-;\\-* #,##0_-;_-* "-"_-;_-@_-';
  var HANGUL = '[DBNum4]"금"[$-412]General"원정"';
  var PAREN = '"("#,##0")"';
  var HEAD_FILL = 'FFF2F2F2';

  var COLS = [
    [1, 2], [2, 5], [3, 2.9], [4, 6.4], [5, 35], [6, 4.2], [7, 4.5], [8, 8.4], [9, 4.3], [10, 4.2],
    [11, 4.7], [12, 3.4], [13, 4.4], [14, 4.7], [15, 3.4], [16, 4.4], [17, 6], [18, 9.6], [19, 3.4], [20, 20.5]
  ];

  function colName(n) { return g.Xlsx.colName(n); }
  function ref(c, r) { return colName(c) + r; }

  /* ── 스타일 등록기 ────────────────────────────────── */

  function Styles() {
    this.defs = [];
    this.key = {};
  }
  Styles.prototype.of = function (d) {
    var k = JSON.stringify(d);
    if (this.key[k] !== undefined) return this.key[k];
    this.defs.push(d);
    return (this.key[k] = this.defs.length - 1);
  };

  /* ── 테두리 모으기 ────────────────────────────────── */
  /* 셀마다 좌·우·상·하 네 글자. '.' 없음, 't' 가는 선, 'M' 굵은 선 */

  function Borders() { this.map = {}; }
  Borders.prototype.set = function (r, c, code) {
    var key = ref(c, r);
    var cur = (this.map[key] || '....').split('');
    code.split('').forEach(function (ch, i) { if (ch !== '.') cur[i] = ch; });
    this.map[key] = cur.join('');
  };
  /* 사각형 테두리 — 바깥쪽만 그린다 */
  Borders.prototype.box = function (r1, c1, r2, c2, code) {
    for (var r = r1; r <= r2; r++) {
      for (var c = c1; c <= c2; c++) {
        this.set(r, c,
          (c === c1 ? code.charAt(0) : '.') +
          (c === c2 ? code.charAt(1) : '.') +
          (r === r1 ? code.charAt(2) : '.') +
          (r === r2 ? code.charAt(3) : '.'));
      }
    }
  };
  Borders.prototype.get = function (r, c) { return this.map[ref(c, r)] || '....'; };

  /* ── 본체 ─────────────────────────────────────────── */

  function layout(p) {
    var q = Q.ensure(p);
    var sup = Q.supplier();
    var gs = Q.groups(q);
    var t = Q.total(q);

    var S = new Styles(), B = new Borders();
    var cells = [], merges = [], rows = {}, touched = {};

    function put(r, c, v, style, formula) {
      var key = ref(c, r);
      touched[key] = true;
      cells.push({ ref: key, v: v, f: formula, _s: style, _r: r, _c: c });
    }
    function span(r, c1, c2, v, style, formula) {
      if (c2 > c1) merges.push(ref(c1, r) + ':' + ref(c2, r));
      put(r, c1, v, style, formula);
      for (var c = c1 + 1; c <= c2; c++) { touched[ref(c, r)] = true; cells.push({ ref: ref(c, r), _s: style, _r: r, _c: c }); }
    }
    function vspan(r1, r2, c1, c2, v, style) {
      merges.push(ref(c1, r1) + ':' + ref(c2, r2));
      for (var r = r1; r <= r2; r++) {
        for (var c = c1; c <= c2; c++) {
          touched[ref(c, r)] = true;
          cells.push({ ref: ref(c, r), v: (r === r1 && c === c1) ? v : undefined, _s: style, _r: r, _c: c });
        }
      }
    }

    var title = { font: { size: 26, bold: true }, align: { h: 'center', v: 'center' } };
    var to = { font: { size: 15, bold: true }, align: { h: 'left', v: 'center' } };
    var plain = { font: { size: 12 }, align: { h: 'left', v: 'center' } };
    var bold12 = { font: { size: 12, bold: true }, align: { h: 'left', v: 'center' } };
    var hangul = { font: { size: 14, bold: true }, align: { h: 'left', v: 'center' }, fmt: HANGUL };
    var paren = { font: { size: 12, bold: true }, align: { h: 'left', v: 'center' }, fmt: PAREN };
    var supLabel = { font: { size: 10, bold: true }, align: { h: 'center', v: 'center', wrap: true } };
    var supVal = { font: { size: 11 }, align: { h: 'left', v: 'center', wrap: true } };
    var supBig = { font: { size: 14, bold: true }, align: { h: 'left', v: 'center' } };
    var vert = { font: { size: 11, bold: true }, align: { h: 'center', v: 'center', wrap: true } };
    var th = { font: { size: 11, bold: true }, align: { h: 'center', v: 'center' }, fill: HEAD_FILL };
    var tdC = { font: { size: 11 }, align: { h: 'center', v: 'center', wrap: true } };
    var tdN = { font: { size: 11 }, align: { h: 'center', v: 'center' }, fmt: MONEY };
    var tdQ = { font: { size: 11 }, align: { h: 'right', v: 'center' } };
    var tdU = { font: { size: 11 }, align: { h: 'left', v: 'center' } };
    var grp = { font: { size: 9.5, bold: true }, align: { h: 'center', v: 'center', wrap: true } };
    var subC = { font: { size: 11 }, align: { h: 'center', v: 'center' }, fill: HEAD_FILL };
    var subN = { font: { size: 11 }, align: { h: 'center', v: 'center' }, fmt: MONEY, fill: HEAD_FILL };
    var sumL = { font: { size: 12, bold: true }, align: { h: 'center', v: 'center' }, fill: HEAD_FILL };
    var sumN = { font: { size: 12, bold: true }, align: { h: 'center', v: 'center' }, fmt: MONEY, fill: HEAD_FILL };
    var memo = { font: { size: 11 }, align: { h: 'center', v: 'center', wrap: true } };
    var note = { font: { size: 10 }, align: { h: 'left', v: 'center' } };
    var noteB = { font: { size: 10, bold: true }, align: { h: 'left', v: 'center' } };

    /* ── 머리 ── */
    rows[2] = 53.4; rows[3] = 9.75; rows[4] = 34.8; rows[5] = 32.4;
    for (var rr = 6; rr <= 11; rr++) rows[rr] = 39.6;
    rows[12] = 34.2;

    span(2, 2, 20, '견적서', title);
    span(5, 2, 7, (q.to || '') + ' 귀중', to);
    span(6, 2, 6, '아래와 같이 견적서를 제출합니다.', plain);
    span(7, 2, 8, '◼ 교육명 : ' + (q.courseName || ''), bold12);
    span(8, 2, 6, '◼ 제출일 : ' + (q.issueDate || ''), bold12);
    put(9, 2, '◼ 금액 :', bold12);

    /* ── 공급자 ── */
    vspan(5, 10, 9, 9, '공\n\n급\n\n자', vert);
    var SUP = [
      ['등록번호', sup.bizNo, null, null, supBig],
      ['법인명\n(단체명)', sup.company, '대표', sup.ceo, supVal],
      ['사업장\n소재지', sup.address, null, null, supVal],
      ['업 태', sup.industry, '종목', sup.item, supVal],
      ['전화번호', sup.tel, null, null, supVal],
      ['FAX', sup.fax, null, null, supVal]
    ];
    SUP.forEach(function (row, i) {
      var r = 5 + i;
      span(r, 10, 15, row[0], supLabel);
      if (row[2]) {
        span(r, 16, 18, row[1], row[4]);
        put(r, 19, row[2], supLabel);
        put(r, 20, row[3], row[4]);
        B.box(r, r, 19, 19, 'tt..');
      } else {
        span(r, 16, 20, row[1], row[4]);
      }
      if (i) B.box(r, r, 10, 20, '..t.');   /* 줄 사이 가는 선 */
      B.box(r, r, 9, 9, '.t..');            /* '공급자' 칸 오른쪽 선 */
      B.box(r, r, 15, 15, '.t..');          /* 항목명과 값 사이 선 */
    });
    B.box(5, 10, 9, 20, 'MMMM');

    /* ── 표 머리 ── */
    var HEAD = [[2, 5, '항 목'], [6, 8, '단 가'], [9, 11, '수량(단위)'], [12, 14, '수량(단위)'],
                [15, 17, '차수'], [18, 19, '견적가'], [20, 20, '비 고']];
    HEAD.forEach(function (h) {
      span(12, h[0], h[1], h[2], th);
      B.box(12, 12, h[0], h[1], 'ttMt');
    });
    B.box(12, 12, 2, 20, 'MMMt');

    /* ── 본문 ── */
    var r = 13;
    var subRefs = [];
    gs.forEach(function (gr) {
      var first = r;
      gr.lines.forEach(function (l) {
        rows[r] = 43.8;
        span(r, 4, 5, l.name, tdC);
        span(r, 6, 8, Number(l.unit) || 0, tdN);
        span(r, 9, 10, Number(l.q1) || 0, tdQ);
        put(r, 11, l.u1 || '', tdU);
        span(r, 12, 13, Number(l.q2) || 0, tdQ);
        put(r, 14, l.u2 || '', tdU);
        span(r, 15, 16, Number(l.sessions) || 0, tdQ);
        put(r, 17, l.su || '차수', tdU);
        span(r, 18, 19, Q.amount(l), tdN,
          ref(6, r) + '*' + ref(9, r) + '*' + ref(12, r) + '*' + ref(15, r));
        put(r, 20, l.memo || '', memo);
        [[4, 5], [6, 8], [9, 11], [12, 14], [15, 17], [18, 19], [20, 20]].forEach(function (b) {
          B.box(r, r, b[0], b[1], 'tttt');
        });
        r++;
      });
      /* 소계 */
      rows[r] = 43.8;
      span(r, 4, 17, '소계', subC);
      span(r, 18, 19, gr.sub, subN, 'SUM(' + ref(18, first) + ':' + ref(18, r - 1) + ')');
      put(r, 20, q.taxFree ? 'vat 면세' : '', memo);
      B.box(r, r, 4, 17, 'tttt');
      B.box(r, r, 18, 19, 'tttt');
      B.box(r, r, 20, 20, 'tMtt');
      subRefs.push(ref(18, r));
      /* 묶음 이름은 세로로 합친다 */
      vspan(first, r, 2, 3, gr.name, grp);
      B.box(first, r, 2, 3, 'Mttt');
      r++;
    });

    /* ── 합계 ── */
    var totalRow = r;
    rows[totalRow] = 47.4;
    span(totalRow, 2, 14, '합계(' + (q.taxFree ? 'vat 면세' : 'vat 별도') + ')', sumL);
    span(totalRow, 15, 19, t.grand, sumN,
      subRefs.length ? (q.roundDown ? 'ROUNDDOWN(' + subRefs.join('+') + ',-3)' : subRefs.join('+')) : null);
    put(totalRow, 20, q.roundDown ? '천단위 절사' : '', memo);
    B.box(totalRow, totalRow, 2, 20, 'MMtM');
    B.box(totalRow, totalRow, 15, 15, 't...');

    /* 금액 칸은 합계를 가리킨다 */
    span(9, 4, 6, t.grand, hangul, ref(15, totalRow));
    span(10, 4, 6, t.grand, paren, ref(15, totalRow));

    /* ── 꼬리말 ── */
    var nr = totalRow + 1;
    rows[nr] = 22.8;
    span(nr, 2, 14, q.taxFree
      ? '* 본 교육과정은 부가가치세 면세로 진행됩니다.'
      : '* 본 견적은 부가가치세 별도입니다. (부가세 ' + Number(t.vat).toLocaleString('ko-KR') + '원 / 총 ' +
        Number(t.sum).toLocaleString('ko-KR') + '원)', note);
    nr += 3;
    (q.notes || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (line, i) {
      rows[nr + i] = 15.6;
      span(nr + i, 2, 11, line, i === 0 ? noteB : note);
    });

    /* 테두리를 셀에 입힌다 — 값이 없어도 칸이 있어야 선이 보인다 */
    var out = cells.map(function (c) {
      var d = Object.assign({}, c._s, { border: B.get(c._r, c._c) });
      return { ref: c.ref, v: c.v, f: c.f, s: S.of(d) };
    });
    Object.keys(B.map).forEach(function (key) {
      if (touched[key]) return;
      var pr = g.Xlsx.parseRef(key);
      out.push({ ref: key, s: S.of({ font: { size: 11 }, border: B.map[key] }) });
    });

    return {
      sheet: '견적서',
      gridlines: false,
      styles: S.defs,
      cols: COLS.map(function (c) { return { from: c[0], to: c[0], width: c[1] }; }),
      rows: rows,
      merges: merges,
      cells: out
    };
  }

  /* 회사 엑셀 양식에 값만 갈아 끼운다.
     예전에는 여기서 양식을 코드로 다시 그렸는데, 셀 배치가 원본과 조금씩 달라
     '깨진' 것처럼 보였다. 이제 서버가 원본 파일을 열어 값만 바꾼다 —
     서식·병합·로고·인쇄설정은 그대로다(엑셀을 띄우지 않고 파일을 직접 고친다).
     서버에 닿지 않거나 양식 파일이 없으면 예전 방식으로 떨어진다. */
  function build(p) {
    return fetch('/api/quote/fill', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fillJob(p))
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok || d.error) throw new Error((d && d.message) || '견적서를 만들지 못했습니다');
        return g.Files.unpack(d, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      });
    }).catch(function (e) {
      if (g.UI) {
        g.UI.toast('회사 양식을 쓰지 못해 기본 모양으로 만듭니다 — ' +
          (e.message || ''), 'err');
      }
      return g.Xlsx.build(layout(p));
    });
  }

  /* relay 에 넘길 값 — 양식의 어느 칸에 무엇이 들어갈지는 relay 가 안다 */
  function fillJob(p) {
    var q = Q.ensure(p);
    var t = Q.total(q);
    return {
      to: q.to || (p.client && p.client.company) || '',
      courseName: q.courseName || p.title || '',
      issueDate: q.issueDate || '',
      taxFree: q.taxFree !== false,
      total: t.grand,
      hangul: hangulWon(t.grand),
      groups: Q.groups(q).map(function (gr) {
        return {
          name: gr.name,
          sub: gr.sub,
          lines: gr.lines.map(function (l) {
            return {
              name: l.name || '', detail: l.detail || '',
              unit: Number(l.unit) || 0,
              q1: Number(l.q1) || 0, u1: l.u1 || '',
              q2: Number(l.q2) || 0, u2: l.u2 || '',
              sessions: Number(l.sessions) || 0, su: l.su || '차수',
              amount: Q.amount(l), memo: l.memo || ''
            };
          })
        };
      })
    };
  }

  /* '금팔백팔만오천칠백사십사원정' — 양식의 금액 칸에 그대로 들어간다 */
  var HAN_NUM = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  var HAN_SMALL = ['', '십', '백', '천'];
  var HAN_BIG = ['', '만', '억', '조'];

  function hangulWon(n) {
    n = Math.floor(Number(n) || 0);
    if (!n) return '금영원정';
    var out = '', unit = 0;
    while (n > 0) {
      var part = n % 10000, chunk = '', i = 0;
      while (part > 0) {
        var digit = part % 10;
        if (digit) chunk = HAN_NUM[digit] + HAN_SMALL[i] + chunk;
        part = Math.floor(part / 10);
        i++;
      }
      if (chunk) out = chunk + HAN_BIG[unit] + out;
      n = Math.floor(n / 10000);
      unit++;
    }
    return '금' + out + '원정';
  }

  function fileName(p) {
    var q = Q.ensure(p);
    /* 과정명이 이미 고객사로 시작하면 고객사를 한 번만 쓴다 */
    var qTo = String(q.to || (p.client && p.client.company) || '').trim();
    var qCourse = String(q.courseName || p.title || '').trim();
    var qBare = qTo.replace(/\(주\)|㈜|주식회사/g, '').trim();
    var dup = qTo && [qTo, qBare, qBare.replace(/\s*\([^)]*\)\s*/g, '').trim()].some(function (n) {
      return n && qCourse.replace(/^(\(주\)|㈜|주식회사)\s*/, '').indexOf(n) === 0;
    });
    var base = '(견적서)' + (dup ? qCourse : [qTo, qCourse].filter(Boolean).join(' ')) + '_KMA';
    return base.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() + '.xlsx';
  }

  g.QuoteExcel = { build: build, layout: layout, fileName: fileName };
})(window);
