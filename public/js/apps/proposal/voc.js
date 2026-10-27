/* voc.js — 홈페이지로 들어온 교육 문의를 그대로 붙여넣으면 제안서 칸을 채워 준다.
 *
 * 문의는 늘 같은 틀로 온다:
 *   교육대상: 직원
 *   교육영역: 공통부분 (조직문화 / 커뮤니케이션 / 리더십 등), 직무관련 (식품, CS)
 *   교육방식: 오프라인 특강형식
 *   예상인원: 약 30명
 *   예상기간: 분기별로 계획하여 진행(변동 가능성 있음)
 *   예상장소: 본사 사무실
 *   예산규모: 미정
 *   기타사항: (여러 줄짜리 긴 글)
 *
 * 그래서 사람이 같은 내용을 옮겨 적을 일이 없다. 붙여넣으면 끝이다.
 * 읽지 못한 칸은 비워 두고 무엇을 못 읽었는지 알려 준다 — 지어내지 않는다.
 */
(function (g) {
  'use strict';

  /* 문의 양식의 이름표. 표기가 조금씩 달라지는 것까지 받아 준다. */
  var KEYS = [
    { id: 'target', label: '교육대상', re: /^교육\s*대상$/ },
    { id: 'area', label: '교육영역', re: /^교육\s*(영역|분야|주제)$/ },
    { id: 'mode', label: '교육방식', re: /^교육\s*(방식|형태)$/ },
    { id: 'headcount', label: '예상인원', re: /^(예상\s*)?인원(\s*수)?$/ },
    { id: 'period', label: '예상기간', re: /^(예상\s*)?(기간|일정|시기)$/ },
    { id: 'place', label: '예상장소', re: /^(예상\s*)?(장소|위치)$/ },
    { id: 'budget', label: '예산규모', re: /^(예상\s*)?예산(\s*규모)?$/ },
    { id: 'note', label: '기타사항', re: /^(기타\s*사항|문의\s*내용|비고|요청\s*사항)$/ }
  ];

  function keyOf(name) {
    var n = String(name || '').replace(/\s+/g, '');
    for (var i = 0; i < KEYS.length; i++) {
      if (KEYS[i].re.test(n)) return KEYS[i];
    }
    return null;
  }

  /* 붙여넣은 글을 '이름표: 값' 덩어리로 가른다.
     값이 여러 줄이면(기타사항이 대개 그렇다) 다음 이름표가 나올 때까지 이어 붙인다. */
  function parse(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var got = {}, order = [], cur = null;

    lines.forEach(function (raw) {
      var line = raw.trim();
      var m = /^([^:：]{1,14})\s*[:：]\s*(.*)$/.exec(line);
      var k = m ? keyOf(m[1]) : null;
      if (k) {
        cur = k.id;
        if (order.indexOf(cur) === -1) order.push(cur);
        got[cur] = (got[cur] ? got[cur] + '\n' : '') + m[2].trim();
        return;
      }
      /* 이름표가 없는 줄은 바로 앞 항목에 이어 붙는다 */
      if (cur && line) got[cur] = (got[cur] ? got[cur] + '\n' : '') + line;
    });

    /* 양식을 안 지키고 줄글로 오는 문의도 많다.
       이름표를 두 개도 못 찾으면 문장에서 직접 집어낸다. 못 찾은 칸은 비워 두고,
       화면에서 사람이 고쳐 넣게 한다 — 그럴듯하게 지어내지 않는다. */
    if (order.length < 2) return fromProse(text);

    var found = order.length;
    return {
      ok: found >= 2,
      found: found,
      prose: false,
      fields: got,
      missing: KEYS.filter(function (k) { return !got[k.id]; }).map(function (k) { return k.label; }),
      headcount: num(got.headcount),
      place: oneLine(got.place),
      period: oneLine(got.period),
      budgetNote: oneLine(got.budget),
      topics: topics(got.area),
      method: [oneLine(got.mode), oneLine(got.target) ? '대상 ' + oneLine(got.target) : '']
                .filter(Boolean).join(' · '),
      note: (got.note || '').trim(),
      raw: String(text || '').trim()
    };
  }

  /* ── 줄글 문의 ─────────────────────────────────────
     "참여 인원은 20~30명 예정입니다" 처럼 문장 안에 섞여 오는 것을 집어낸다.
     확실한 것만 집는다. 애매하면 빈칸으로 두고 사람이 채우는 편이 낫다. */
  function fromProse(text) {
    var s = String(text || '').replace(/\s+/g, ' ');

    function grab(re, i) { var m = re.exec(s); return m ? String(m[i || 1]).trim() : ''; }

    /* 인원 — "20~30명", "약 30명", "30명 예정" */
    var headM = /(\d+)\s*[~\-–]\s*(\d+)\s*명/.exec(s) || /(?:약\s*)?(\d+)\s*명/.exec(s);
    var head = headM ? Number(headM[1]) : null;
    var headText = headM ? headM[0].trim() : '';

    /* 시간·일수 — "6시간 내외", "2일 과정", "4~5시간 내외"
       범위로 오면 뒤쪽(넉넉한 쪽)을 잡는다. 제안은 넉넉히 잡고 줄이는 쪽이 낫다. */
    var hourM = /(\d+(?:\.\d+)?)\s*[~\-–]\s*(\d+(?:\.\d+)?)\s*시간/.exec(s);
    var hours = hourM ? hourM[2] : grab(/(\d+(?:\.\d+)?)\s*시간/);
    var days = grab(/(\d+)\s*일(?!\s*까지)/);

    /* 차수 — "3회차", "2개 차수", "총 4회" 처럼 몇 번 도는지.
       이걸 못 읽으면 견적 수량이 1차수로 굳어 금액이 통째로 어긋난다. */
    var sessions = grab(/(\d+)\s*(?:회차|차수)/) ||
                   grab(/총\s*(\d+)\s*회/) ||
                   grab(/(\d+)\s*개\s*(?:반|분반)/);

    /* 장소 — "교육 장소는 사내 회의실," */
    var place = grab(/(?:교육\s*)?장소[는은이가]?\s*[:：]?\s*([^,.\n]{2,24})/);

    /* 대상 — "교육 대상은 팀장급 관리자입니다", "대상: 팀장급"
       '대상' 뒤를 무조건 24자까지 긁으면 '팀장급 대상 리더십 · 변화관리 교육을
       검토하고 있어 문' 처럼 문장 한복판이 통째로 잡힌다. 조사나 쌍점이 붙어
       진짜 '대상은 …' 인 자리를 먼저 찾고, 없을 때만 직급 낱말로 떨어진다. */
    var target = grab(/대상\s*[은는이가]\s*[:：]?\s*([^,.\n]{2,20}?)(?:입니다|이다|이며|으로|로|\s*$)/) ||
                 grab(/대상\s*[:：]\s*([^,.\n]{2,20})/) ||
                 grab(/((?:임원|팀장|부서장|본부장|과장|차장|대리|사원|신입|관리자|실무자)[가-힣]{0,6})/);
    target = String(target || '').replace(/(입니다|이다|이며)$/, '').trim();

    /* 형태 — 강사 초빙 / 오프라인 / 온라인 / 특강 / 워크숍 */
    var mode = grab(/(강사\s*초빙|오프라인|온라인|비대면|집합|특강|워크숍|워크샵)[^,.\n]{0,8}/, 0);

    /* 시기 — "이번 주 내", "3월 중", "분기별" */
    var period = grab(/(이번\s*주[^,.\n]{0,6}|다음\s*주[^,.\n]{0,6}|\d+월\s*\d*일?[^,.\n]{0,8}|\d+\s*분기[^,.\n]{0,8}|상반기|하반기|분기별[^,.\n]{0,10})/);

    /* 예산 — "예산은 …", "강의료" 가 언급되면 미정으로 둔다 */
    var budget = grab(/예산[^,.\n]{0,4}[은는이가]?\s*[:：]?\s*([^,.\n]{1,18})/);

    /* 주제 — 역량/과정/교육이 들어간 구절에서 뽑는다 */
    var topic = grab(/([^,.\n]{4,40}?)\s*역량\s*강화/) ||
                grab(/교육은[^,.\n]*?,\s*([^,.\n]{4,40})/) ||
                grab(/([가-힣A-Za-z\/·\s]{3,30})\s*과정/);
    var tops = [];
    if (topic) {
      topic.split(/\s*(?:및|와|과|\/|,)\s*/).forEach(function (t) {
        var x = t.replace(/^(의|는|은|을|를)\s*/, '').trim();
        if (x && x.length >= 2 && x.length <= 20) tops.push(x);
      });
    }

    var method = [mode, target ? '대상 ' + target : '', hours ? hours + '시간' : ''].filter(Boolean).join(' · ');
    var hit = [head, place, period, tops.length ? 1 : 0, mode].filter(Boolean).length;

    return {
      ok: hit >= 2,
      found: hit,
      prose: true,            /* 줄글에서 뽑았다는 표시 — 화면에서 '확인해 달라'고 말한다 */
      fields: {},
      missing: [],
      headcount: head,
      headText: headText,
      place: place,
      period: period,
      days: days ? Number(days) : null,
      hours: hours ? Number(hours) : null,
      sessions: sessions ? Number(sessions) : null,
      budgetNote: budget && !/미정|없음/.test(budget) ? budget : '',
      topics: tops.slice(0, 6),
      method: method,
      note: String(text || '').trim(),
      raw: String(text || '').trim()
    };
  }

  /* "약 30명", "30~50명", "30명 내외" → 30 (작은 쪽을 잡는다. 늘리기는 쉬워도 줄이기는 어렵다) */
  function num(v) {
    if (!v) return null;
    var m = /(\d[\d,]*)/.exec(String(v).replace(/,/g, ''));
    return m ? Number(m[1]) : null;
  }

  function oneLine(v) { return String(v || '').replace(/\s*\n\s*/g, ' ').trim(); }

  /* 교육영역을 과정 후보로 쪼갠다.
     "공통부분 (조직문화 / 커뮤니케이션 / 리더십 등), 직무관련 (식품, CS)"
       → 조직문화 · 커뮤니케이션 · 리더십 · 식품 · CS */
  function topics(v) {
    if (!v) return [];
    var s = String(v), out = [];

    function push(t) {
      var x = String(t).replace(/\s*등$/, '').replace(/\s*관련$/, '').trim();
      if (x && x.length <= 20 && !/^(공통부분|공통|직무|기타|부분)$/.test(x)) out.push(x);
    }

    /* 괄호 안이 진짜 주제다 — "공통부분 (조직문화 / 커뮤니케이션 / 리더십 등)".
       바깥 쉼표로 먼저 자르면 "직무관련 (식품, CS)" 가 괄호 안에서 잘려 버린다.
       그래서 괄호부터 걷어 낸다. */
    var re = /\(([^)]*)\)/g, m;
    while ((m = re.exec(s)) !== null) m[1].split(/[\/·,、]/).forEach(push);

    /* 괄호가 없는 문의도 있다. 그때는 전체를 쪼갠다. */
    if (!out.length) s.split(/[\/·,、\n]/).forEach(push);

    return out.filter(function (x, i) { return out.indexOf(x) === i; }).slice(0, 8);
  }

  /* 파싱 결과를 제안서 칸으로 옮긴다. 읽지 못한 것은 건드리지 않는다. */
  function applyTo(p, v) {
    p.context.inquiry = v.raw;
    if (v.note) p.context.problem = v.note;
    if (v.headcount) p.ops.headcount = v.headcount;
    if (v.place) p.ops.place = v.place;
    if (v.period) p.ops.period = v.period;
    if (v.days) p.ops.days = v.days;
    /* 교육시간·차수를 안 옮기고 있었다. 문의 글에서 읽어 놓고도 버려서
       예산 수량이 0 으로 남았고 ('교육시간이 비어 있어 수량이 0 입니다'),
       견적서 강사료가 통째로 0원으로 나갔다. 견적은 이 두 칸에서 나온다. */
    if (v.hours) p.ops.hours = v.hours;
    if (v.sessions) p.ops.sessions = v.sessions;
    if (v.method) p.approach.method = v.method;
    if (v.budgetNote && !/미정|없음/.test(v.budgetNote)) p.budget.note = '문의 시 예산: ' + v.budgetNote;
    /* 파서가 넣은 값이라는 표시 — 사람이 쓴 글이 아니므로 AI 가 새로 쓴 글로 바꿔도 된다.
       표시가 없으면 AI 가 '이미 쓰신 글' 로 여겨 덮지 않아, 문의 메일 원문
       ('[문의분류] 6인 이상 단체 교육… 안녕하세요, …')이 제안서 'Why' 칸에 그대로 실렸다. */
    p.autoFilled = { problem: p.context.problem || '', method: p.approach.method || '',
                     situation: p.context.situation || '' };
    if (v.topics && v.topics.length) {
      p.approach.modules = v.topics.map(function (t) {
        return { title: t, hours: v.hours || null, detail: '문의에서 뽑은 주제 — 커리큘럼을 올리면 바뀝니다' };
      });
    }
    return p;
  }

  /* 화면에서 고칠 수 있게 칸 목록으로 내준다.
     줄글 문의는 잘못 읽을 수밖에 없어서, 보여 주기만 하면 소용이 없다. 고칠 수 있어야 한다. */
  function rows(v) {
    return [
      { key: 'headcount', label: '인원(명)', value: v.headcount || '', hint: '예) 30' },
      { key: 'period', label: '희망 일정', value: v.period || '', hint: '예) 3월 중' },
      { key: 'place', label: '장소', value: v.place || '', hint: '예) 사내 회의실' },
      /* 견적 금액이 이 두 칸에서 나온다 — 화면에서 고칠 수 있어야 한다 */
      { key: 'hours', label: '교육시간(H)', value: v.hours || '', hint: '예) 4' },
      { key: 'sessions', label: '차수', value: v.sessions || '', hint: '예) 2' },
      { key: 'days', label: '차수당 일수', value: v.days || '', hint: '예) 1' },
      { key: 'method', label: '운영 방식', value: v.method || '', hint: '예) 오프라인 특강 · 대상 팀장급' },
      { key: 'budgetNote', label: '예산', value: v.budgetNote || '', hint: '적혀 있으면' },
      { key: 'topics', label: '과정 주제 (쉼표로 구분)', value: (v.topics || []).join(', '), hint: '예) 리더십, 오너십' }
    ];
  }

  /* 화면에서 고친 값을 되돌려 받는다 */
  function applyEdits(v, edits) {
    var n = Number(String(edits.headcount || '').replace(/[^\d]/g, ''));
    v.headcount = n || null;
    var d = Number(String(edits.days || '').replace(/[^\d]/g, ''));
    v.days = d || null;
    var h = Number(String(edits.hours || '').replace(/[^\d.]/g, ''));
    v.hours = h || null;
    var ss = Number(String(edits.sessions || '').replace(/[^\d]/g, ''));
    v.sessions = ss || null;
    v.period = (edits.period || '').trim();
    v.place = (edits.place || '').trim();
    v.method = (edits.method || '').trim();
    v.budgetNote = (edits.budgetNote || '').trim();
    v.topics = String(edits.topics || '').split(/[,·]/)
      .map(function (s) { return s.trim(); }).filter(Boolean);
    return v;
  }

  g.Voc = { parse: parse, applyTo: applyTo, rows: rows, KEYS: KEYS };
})(window);
