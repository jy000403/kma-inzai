/* survey.js — 만족도 조사 결과 붙여넣기 → 문항별 통계
 *
 * 구글폼 응답 시트나 엑셀 집계표를 그대로 복사해서 붙여넣으면
 * 어떤 열이 점수이고 어떤 열이 서술형인지 스스로 가른다.
 * 읽지 못한 열은 감추지 않고 "건너뛴 열"로 그대로 보여 준다.
 */
(function (g) {
  'use strict';

  /* 점수 척도로 인정하는 상한. 4점·5점·7점·10점 척도를 본다.
     구글폼은 "④ 매우 그렇다" 처럼 동그라미 숫자와 말이 함께 오는 일이 많다. */
  var SCALES = [4, 5, 7, 10];

  /* "④ 매우 그렇다" → 4 / "① 해당사항 없음" → 없음(평균에서 뺀다) */
  var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
  /* 점수로 세면 안 되는 보기. 해당 없는 사람이 고르는 칸이라 1점으로 치면 평균이 무너진다. */
  var NOT_SCORED = /해당\s*(사항)?\s*없|무응답|미응답|해당없음|N\/?A/i;

  /* 말로만 온 보기도 읽는다 */
  var WORD_SCORE = [
    { re: /매우\s*(만족|그렇|좋)/, v: 'top' },
    { re: /^\s*만족|다소\s*그렇|그렇다/, v: 'hi' },
    { re: /보통|그저/, v: 'mid' },
    { re: /다소\s*아니|불만|아니다/, v: 'lo' },
    { re: /전혀|매우\s*불만/, v: 'bot' }
  ];

  /* 응답 시트에 늘 섞여 들어오지만 문항은 아닌 열 */
  var META = /^(타임스탬프|timestamp|제출\s*시간|응답\s*(시간|일시|일자|날짜)|작성\s*(일시|일자)|일시|날짜|이메일|email|이름|성명|소속|부서|직급|번호|no\.?|순번|id|성함|부서명|교육일자|참여.*일자)/i;
  /* 머리글이 무엇이든 칸이 모두 날짜·시각이면 응답자 정보다. 의견으로 실리면 안 된다 */
  var DATE_CELL = /^\d{2,4}[.\-\/년]\s*\d{1,2}[.\-\/월]\s*\d{1,2}\.?일?(\s*\(?[월화수목금토일]\)?)?(\s*(오전|오후|AM|PM)?\s*\d{1,2}:\d{2}(:\d{2})?)?$/i;
  var NPS_HINT = /추천|nps|recommend/i;

  function splitCells(line) {
    if (line.indexOf('\t') !== -1) return line.split('\t');
    /* 쉼표는 서술형 답변 안에도 흔해서, 탭이 없을 때만 쓴다 */
    if (line.indexOf(',') !== -1) return splitCsv(line);
    return line.split(/\s{2,}/);
  }

  /* 따옴표로 묶인 쉼표는 자르지 않는다 */
  function splitCsv(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '"') {
        if (q && line.charAt(i + 1) === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function clean(s) { return String(s === undefined || s === null ? '' : s).replace(/^"|"$/g, '').trim(); }

  function toNum(s) {
    var t = clean(s).replace(/[점%]/g, '').replace(/,/g, '');
    if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
    return Number(t);
  }

  /* 보기 한 칸을 점수로 바꾼다.
     반환 null 은 '못 읽음', 'skip' 은 '해당 없음 — 평균에서 뺀다'. */
  function toScore(s, scale) {
    var t = clean(s);
    if (!t) return null;
    if (NOT_SCORED.test(t)) return 'skip';

    /* "④ 매우 그렇다" — 동그라미 숫자가 곧 점수다 */
    var ci = CIRCLED.indexOf(t.charAt(0));
    if (ci !== -1) return ci + 1;

    var n = toNum(t);
    if (n !== null) return n;

    /* 말로만 온 보기 — 척도 폭을 알아야 몇 점인지 정해진다 */
    for (var i = 0; i < WORD_SCORE.length; i++) {
      if (!WORD_SCORE[i].re.test(t)) continue;
      var k = WORD_SCORE[i].v;
      var top = scale || 5;
      if (k === 'top') return top;
      if (k === 'hi') return top - 1;
      if (k === 'mid') return top === 4 ? 2 : 3;
      if (k === 'lo') return top === 4 ? 2 : 2;
      if (k === 'bot') return 1;
    }
    return null;
  }

  /* 이 열이 몇 점 척도인지 — 보기에 나온 가장 큰 숫자로 본다 */
  function scaleOf(cells) {
    var max = 0, hits = 0;
    cells.forEach(function (c) {
      var t = clean(c);
      if (!t || NOT_SCORED.test(t)) return;
      var ci = CIRCLED.indexOf(t.charAt(0));
      var v = ci !== -1 ? ci + 1 : toNum(t);
      if (v === null) return;
      hits++;
      if (v > max) max = v;
    });
    if (!hits) return null;
    for (var i = 0; i < SCALES.length; i++) if (max <= SCALES[i]) return SCALES[i];
    return null;
  }

  function grid(text) {
    var rows = String(text || '').replace(/\r/g, '').split('\n')
      .filter(function (l) { return l.trim() !== ''; })
      .map(function (l) { return splitCells(l).map(clean); });
    if (!rows.length) return [];
    /* 열 수를 헤더에 맞춰 고른다 */
    var w = rows[0].length;
    return rows.map(function (r) {
      var c = r.slice(0, w);
      while (c.length < w) c.push('');
      return c;
    });
  }

  /* ── 열 판정 ──────────────────────────────────────── */

  function classify(header, cells) {
    var vals = cells.filter(function (c) { return c !== ''; });
    if (!vals.length) return { type: 'empty' };
    if (META.test(header)) return { type: 'meta' };
    if (vals.every(function (c) { return DATE_CELL.test(c); })) return { type: 'meta' };

    /* 먼저 보기 형태(④ 매우 그렇다 / 매우 만족)로 읽어 본다 */
    var scale = scaleOf(vals);
    if (scale) {
      var nums = [], skipped = 0;
      vals.forEach(function (c) {
        var v = toScore(c, scale);
        if (v === 'skip') { skipped++; return; }
        if (v !== null) nums.push(v);
      });
      /* 대부분이 보기로 읽혀야 척도 문항으로 본다 */
      if ((nums.length + skipped) / vals.length >= 0.8 && nums.length) {
        return { type: 'scale', scale: scale, nums: nums, na: skipped };
      }
    }

    var plain = vals.map(toNum).filter(function (n) { return n !== null; });
    if (plain.length / vals.length < 0.8) return { type: 'text' };

    var max = Math.max.apply(null, plain), min = Math.min.apply(null, plain);
    /* 날짜·금액·인원이 점수로 둔갑하지 않게 상한을 본다 */
    var sc = null;
    for (var i = 0; i < SCALES.length; i++) if (max <= SCALES[i] && min >= 0) { sc = SCALES[i]; break; }
    if (sc === null) return { type: 'number', min: min, max: max };
    return { type: 'scale', scale: sc, nums: plain, na: 0 };
  }

  function stat(nums, scale) {
    var n = nums.length;
    var sum = nums.reduce(function (a, b) { return a + b; }, 0);
    var avg = n ? sum / n : 0;
    var dist = {};
    for (var v = (scale === 10 ? 0 : 1); v <= scale; v++) dist[v] = 0;
    nums.forEach(function (x) {
      var k = Math.round(x);
      if (dist[k] === undefined) dist[k] = 0;
      dist[k]++;
    });
    var top = nums.filter(function (x) { return x >= scale - 1; }).length;
    var low = nums.filter(function (x) { return x <= (scale === 10 ? 3 : 2); }).length;
    return {
      n: n, avg: Math.round(avg * 100) / 100, scale: scale, dist: dist,
      topRate: n ? top / n : 0,      /* 상위 2개 구간 비율 (긍정응답률) */
      lowRate: n ? low / n : 0,
      to5: Math.round((avg / scale) * 5 * 100) / 100
    };
  }

  /* 0~10 추천의향이면 NPS 도 같이 낸다 */
  function nps(nums) {
    var n = nums.length;
    if (!n) return null;
    var pro = nums.filter(function (x) { return x >= 9; }).length;
    var det = nums.filter(function (x) { return x <= 6; }).length;
    return { score: Math.round(((pro - det) / n) * 100), promoters: pro, detractors: det, n: n };
  }

  /* ── 집계표(문항 / 점수 두 열) 읽기 ───────────────── */

  function readAggregate(rows) {
    var qs = [], skipped = [];
    rows.forEach(function (r, i) {
      var label = clean(r[0]);
      if (!label) return;
      var v = null;
      for (var c = 1; c < r.length; c++) { v = toNum(r[c]); if (v !== null) break; }
      if (v === null) { if (i > 0) skipped.push(label); return; }
      var scale = v <= 5 ? 5 : (v <= 7 ? 7 : 10);
      qs.push({ label: label, type: 'scale', n: 0, avg: Math.round(v * 100) / 100,
                scale: scale, dist: null, topRate: null, lowRate: null,
                to5: Math.round((v / scale) * 5 * 100) / 100 });
    });
    return { mode: 'agg', n: 0, questions: qs, texts: [], skipped: skipped, nps: null };
  }

  /* ── 진입점 ───────────────────────────────────────── */

  function parse(text) {
    return parseGrid(grid(text));
  }

  /* 엑셀 파일을 바로 올릴 때 쓴다. 표를 글자로 바꿨다 다시 나누는 과정을 건너뛴다 —
     서술형 답변에 줄바꿈이나 탭이 들어 있으면 그 과정에서 표가 어긋난다. */
  function parseGrid(rows) {
    rows = (rows || []).map(function (r) {
      return (r || []).map(function (c) { return clean(String(c === undefined || c === null ? '' : c)); });
    }).filter(function (r) {
      return r.some(function (c) { return c !== ''; });
    });
    if (rows.length < 2) return { error: '표를 찾지 못했습니다. 머리글 한 줄과 응답이 함께 있어야 합니다.' };

    /* 구글폼 내보내기에는 "※ 본 데이터는 …" 같은 안내 문구가 한 줄 끼어 있는 일이 있다.
       칸이 하나만 찬 줄은 응답일 수 없다. 그냥 두면 응답 인원이 한 명 늘어난다. */
    while (rows.length > 2 && rows[0].filter(function (c) { return c !== ''; }).length < 2) rows.shift();

    var header = rows[0];
    var body = rows.slice(1).filter(function (r) {
      return r.filter(function (c) { return c !== ''; }).length >= 2;
    });
    if (!body.length) return { error: '응답이 없습니다.' };

    /* 두 열짜리이고 두 번째 열이 전부 숫자면 이미 집계된 표로 본다 */
    if (header.length <= 3) {
      var allNum = body.every(function (r) {
        for (var c = 1; c < r.length; c++) if (toNum(r[c]) !== null) return true;
        return false;
      });
      if (allNum) return readAggregate(rows);
    }

    var questions = [], texts = [], skipped = [], npsOut = null;

    header.forEach(function (h, c) {
      var cells = body.map(function (r) { return r[c]; });
      var kind = classify(h || ('열 ' + (c + 1)), cells);
      var label = h || ('열 ' + (c + 1));

      if (kind.type === 'scale') {
        var st = stat(kind.nums, kind.scale);
        /* 추천의향(0~10)은 만족도 문항이 아니라 NPS 다. 평균에 섞지 않는다. */
        var isNps = kind.scale === 10 && NPS_HINT.test(label);
        questions.push({ label: label, type: 'scale', n: st.n, avg: st.avg, scale: st.scale,
                         dist: st.dist, topRate: st.topRate, lowRate: st.lowRate, to5: st.to5, isNps: isNps,
                         /* '해당사항 없음'을 고른 사람 수. 평균에서 뺐다는 근거를 같이 남긴다. */
                         na: kind.na || 0 });
        if (isNps && !npsOut) npsOut = nps(kind.nums);
      } else if (kind.type === 'text') {
        var answers = cells.map(clean).filter(function (s) { return s.length >= 2; });
        if (answers.length) texts.push({ label: label, answers: answers });
      } else if (kind.type === 'number') {
        skipped.push(label + ' (숫자지만 척도가 아님 · 최대 ' + kind.max + ')');
      } else if (kind.type === 'meta') {
        skipped.push(label + ' (응답자 정보)');
      }
    });

    return {
      mode: 'raw', n: body.length,
      questions: questions, texts: texts, skipped: skipped, nps: npsOut
    };
  }

  /* 문항 평균의 평균 — 결과보고서 표지에 올리는 '종합 만족도' */
  function overall(parsed) {
    if (!parsed || !parsed.questions || !parsed.questions.length) return null;
    /* NPS 문항은 따로 보고하므로 종합 만족도에서 뺀다
       (isNps 가 없던 시절에 저장된 결과도 라벨로 걸러 준다) */
    var qs = parsed.questions.filter(function (q) {
      return !(q.isNps || (q.scale === 10 && NPS_HINT.test(q.label)));
    });
    if (!qs.length) qs = parsed.questions;
    var sum = qs.reduce(function (a, q) { return a + q.to5; }, 0);
    var avg = sum / qs.length;
    var weighted = null;
    var withN = qs.filter(function (q) { return q.n; });
    if (withN.length) {
      var tot = withN.reduce(function (a, q) { return a + q.n; }, 0);
      weighted = withN.reduce(function (a, q) { return a + q.to5 * q.n; }, 0) / tot;
    }
    return {
      to5: Math.round(avg * 100) / 100,
      weighted: weighted === null ? null : Math.round(weighted * 100) / 100,
      count: qs.length,
      best: qs.slice().sort(function (a, b) { return b.to5 - a.to5; })[0],
      worst: qs.slice().sort(function (a, b) { return a.to5 - b.to5; })[0]
    };
  }

  g.Survey = { parse: parse, parseGrid: parseGrid, overall: overall, stat: stat, nps: nps, grid: grid };
})(window);
