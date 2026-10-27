/* store.js — 결과보고서
 *
 * 프로젝트가 끝난 뒤 쓰는 문서. 제안서에서 계획을 가져오고,
 * 만족도·사진·영수증에서 실제를 가져와 한 장으로 합친다.
 */
(function (g) {
  'use strict';

  var KEY = g.Scope.key('kma-reports:v1');

  /* 정산도 견적과 같은 구분으로 적는다 */
  var GROUPS = ['교육비', '운영비'];

  var SOURCES = [
    { id: 'cover', label: '표지 (고객사·과정·기간)' },
    { id: 'overview', label: '과정 개요 (인원·일정·장소)' },
    { id: 'run', label: '운영 결과 (수료·출석)' },
    { id: 'curriculum', label: '진행한 커리큘럼' },
    { id: 'satisfaction', label: '만족도 종합' },
    { id: 'questions', label: '문항별 만족도' },
    { id: 'voices', label: '수강생 의견 (서술형)' },
    { id: 'photos', label: '교육 사진' },
    { id: 'settle', label: '정산 (계획 대비 실제)' },
    { id: 'good', label: '잘된 점' },
    { id: 'issue', label: '아쉬운 점 · 개선' },
    { id: 'next', label: '다음 제안' },
    { id: 'free', label: '고정 문구 (직접 입력)' }
  ];

  var DEFAULT_TEMPLATE = {
    id: 'rt_default', name: '기본 결과보고서 (12장)', builtin: true,
    desc: '개요 → 운영 결과 → 만족도 → 의견 → 사진 → 정산 → 다음 제안',
    slides: [
      { title: '표지', src: 'cover' },
      { title: '과정 개요', src: 'overview' },
      { title: '운영 결과', src: 'run' },
      { title: '진행한 커리큘럼', src: 'curriculum' },
      { title: '만족도 종합', src: 'satisfaction' },
      { title: '문항별 만족도', src: 'questions' },
      { title: '수강생 의견', src: 'voices' },
      { title: '교육 사진', src: 'photos' },
      { title: '정산', src: 'settle' },
      { title: '잘된 점', src: 'good' },
      { title: '아쉬운 점 · 개선', src: 'issue' },
      { title: '다음 제안', src: 'next' }
    ]
  };

  var S = { reports: [], templates: [], activeId: null };
  var listeners = [];

  function uid() { return 'rp' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6); }
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  var didLoad = false;
  function load() {
    /* 프로젝트 화면도 이 저장소를 읽는다. 두 번 읽어 덮어쓰지 않게 막는다. */
    if (didLoad) return S;
    didLoad = true;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (Array.isArray(d.reports)) S.reports = d.reports;
        if (Array.isArray(d.templates)) S.templates = d.templates;
        S.activeId = d.activeId || null;
      }
    } catch (e) {}
    /* 기본 골격('기본 결과보고서 (12장)')은 더 이상 깔지 않는다 —
       회사가 쓰던 결과보고서 PPT 를 올려 쓰는 것이 실제 방식이다.
       예전에 깔린 것이 남아 있으면 치운다. */
    var had = S.templates.length;
    S.templates = S.templates.filter(function (t) { return t.id !== 'rt_default'; });
    if (S.templates.length !== had) save();
    /* 전에 만든 보고서에도 실제 집행액 칸을 달아 준다 */
    S.reports.forEach(function (r) {
      r.settle = r.settle || { items: [], note: '', useReceipts: true };
      if (!r.settle.actual || typeof r.settle.actual !== 'object') r.settle.actual = {};
      /* 고객사·과정 이름 칸은 나중에 생겼다. 예전 보고서에도 달아 준다 —
         없으면 표지 입력칸에서 터진다. */
      if (!r.client || typeof r.client !== 'object') r.client = { company: '', course: '' };
      /* 전에 쓰던 보고서는 이미 양식을 고른 것으로 본다 — 1 걸음으로 되돌리지 않는다 */
      if (r.templatePicked === undefined) r.templatePicked = true;
    });
    return S;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { if (g.UI) g.UI.toast('저장 공간이 부족합니다. 백업 후 정리해 주세요', 'err'); }
    syncTemplates();
  }
  function state() { return S; }

  /* ── 양식 설정을 보관소에도 (제안서 store.js 와 같은 방식) ──
     '장마다 무엇을 채울지' 를 보관소에 같이 두고, 모든 PC 기본 양식(pinned)은
     어느 브라우저에서 열어도 저절로 목록에 넣는다. 받아 온 뒤에만 올린다. */
  var synced = {}, syncTimer = null, sharedReady = false;
  function tplPayload(t) {
    var c = {};
    Object.keys(t).forEach(function (k) { if (k.charAt(0) !== '_') c[k] = t[k]; });
    return c;
  }
  function syncTemplates(now) {
    if (!sharedReady || typeof fetch !== 'function') return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      S.templates.forEach(function (t) {
        if (t.kind !== 'pptx' || !t.fileId) return;
        var body = JSON.stringify(tplPayload(t));
        if (synced[t.fileId] === body) return;
        synced[t.fileId] = body;
        fetch('/api/ppt/settings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: t.fileId, kind: 'report', name: t.name,
                                 pinned: !!t.pinned, settings: tplPayload(t) })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (!d || !d.ok) { delete synced[t.fileId]; return; }
          t._syncedAt = d.settingsAt;
          try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
        }).catch(function () { delete synced[t.fileId]; });
      });
    }, now ? 0 : 1500);
  }
  function pullShared() {
    if (typeof fetch !== 'function') return Promise.resolve(0);
    return fetch('/api/ppt/stored?kind=report').then(function (r) { return r.json(); }).then(function (d) {
      var n = 0;
      (d.templates || []).forEach(function (row) {
        if (row.kind && row.kind !== 'report') return;
        var local = S.templates.filter(function (t) { return t.fileId === row.id; })[0];
        if (local && !row.pinned && local.pinned && (local._syncedAt || '') < (row.settingsAt || '')) local.pinned = false;
        /* 모든 PC 기본 양식이거나 이 계정이 올린 양식이면 설정째 목록에 넣는다 */
        if (!(row.pinned || row.mine) || !row.settings) return;
        var remote = row.settings;
        if (!local) {
          local = Object.assign({}, remote, { fileId: row.id, pinned: !!row.pinned, kind: 'pptx' });
          if (!local.id || S.templates.some(function (t) { return t.id === local.id; })) local.id = 'rt' + uid();
          S.templates.push(local);
          n++;
        } else if ((row.settingsAt || '') > (local._syncedAt || '')) {
          var keep = local.id;
          Object.keys(local).forEach(function (k) { delete local[k]; });
          Object.assign(local, remote, { id: keep, fileId: row.id, pinned: !!row.pinned, kind: 'pptx' });
          n++;
        }
        local._syncedAt = row.settingsAt || local._syncedAt;
        synced[row.id] = JSON.stringify(tplPayload(local));
      });
      sharedReady = true;
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
      if (n) emit();
      syncTemplates();
      return n;
    }).catch(function () { sharedReady = true; return 0; });
  }
  function setPinned(id, on) {
    var t = S.templates.filter(function (x) { return x.id === id; })[0];
    if (!t || !t.fileId) return false;
    t.pinned = !!on;
    save(); emit();
    syncTemplates(true);
    return true;
  }

  function templates() { return S.templates; }
  /* 기본 골격을 없앴으므로 양식이 하나도 없는 때가 생긴다 */
  var NO_TEMPLATE = { id: '', name: '양식을 올려 주세요', slides: [] };
  function template(id) {
    var t = S.templates.filter(function (x) { return x.id === id; })[0] ||
            S.templates[0] || NO_TEMPLATE;
    upgradeSlides(t);
    return t;
  }

  /* 예전에 올린 양식의 잘못 잡힌 장을 한 번 바로잡는다 — 사람이 직접 고른 장(userSet)은 두고.
     · '정성 피드백 종합' 처럼 서술형 장이 '아쉬운 점'·'빼기'·'그대로' 로 잡혀 있으면 → 수강생 의견
     · 만족도 표가 있는 장이 '그대로'·'빼기' 로 잡혀 있으면 → 문항별 만족도
       ('그대로' 로 두면 예전 고객사의 만족도 숫자가 그대로 나간다) */
  function upgradeSlides(t) {
    if (!t || t.kind !== 'pptx' || t.slidesV2) return;
    var changed = false;
    (t.slides || []).forEach(function (s, i) {
      if (i === 0 || s.userSet) return;
      var g2 = guessFromTexts(s.texts, s.tables);
      if (g2 === 'voices' && /^(issue|free|skip|keep)$/.test(s.src)) { s.src = 'voices'; changed = true; }
      else if (g2 === 'questions' && /^(free|skip|keep)$/.test(s.src)) { s.src = 'questions'; changed = true; }
    });
    t.slidesV2 = true;
    if (changed) { try { save(); } catch (e) {} }
  }
  function addTemplate(t) { t.id = 'rt' + uid(); t.slides = t.slides || []; S.templates.push(t); save(); emit(); return t; }
  function updateTemplate(id, patch) { var t = template(id); if (t) { Object.assign(t, patch); save(); emit(); } }
  function removeTemplate(id) {
    S.templates = S.templates.filter(function (t) { return t.id !== id || t.builtin || t.pinned; });
    save(); emit();
  }

  /* ── PPT 양식 ─────────────────────────────────────────
     제안서와 같은 방식이다. 회사가 쓰던 결과보고서 파일을 올리면
     장마다 무엇을 채울지 알아보고, 만들 때 그 파일에 글자만 갈아 끼운다.
     맨바닥에서 새 장표를 그리지 않으므로 회사 디자인이 그대로 남는다. */

  /* 장 안의 글 전체로 먼저 알아보는 것 — 제목을 잘못 집는 장이 있다.
     '정성 피드백 종합' 장은 제목 대신 '② 개선이 필요한 부분' 이 집혀 '아쉬운 점' 장으로 잡혔고,
     설문 서술형 답이 안 들어가고 예전 고객사(HMM) 의견이 그대로 나갔다. */
  var VOICE_RE = /정성\s*(피드백|의견)|서술형|주관식|인상\s*깊|도움이\s*된\s*(점|부분)/;
  function guessFromTexts(texts, tables) {
    var all = (texts || []).join(' ');
    if (VOICE_RE.test(all)) return 'voices';
    /* 만족도 표(문항 · 만족도 · 매우 만족 …)가 있는 장은 문항별 만족도 */
    var heads = [];
    (tables || []).forEach(function (tb) { heads = heads.concat(tb.headers || []); });
    if (heads.some(function (h) { return /만족도|평균/.test(String(h)); }) &&
        heads.some(function (h) { return /문항|항목|구분/.test(String(h)); })) return 'questions';
    return '';
  }

  function guessSource(title, texts, tables) {
    var byText = guessFromTexts(texts, tables);
    if (byText) return byText;
    var t = String(title || '').trim();
    /* 협회 소개는 제안 건마다 바뀌지 않는다 — 그대로 두고 내보낸다.
       제목이 '1962년 설립 이후…' 같은 긴 문장이라 이름만 보고는 못 알아본다.
       제안서 쪽에서 이 장들이 통째로 빠지는 일이 있었다(guessSource 주석 참고). */
    if (/별첨|부록|appendix/i.test(t)) return 'keep';
    if (/(KMA|회사|기관|협회|능률협회)\s*소개/i.test(t)) return 'keep';
    if (/한국능률협회|능률협회/.test(t)) return 'keep';
    if (/\d{4}년\s*설립|설립\s*이후|연혁/.test(t)) return 'keep';
    if (/\d+\s*년\s*간\s|\d+\s*년간\s/.test(t)) return 'keep';
    if (/수상|인증|사업영역|조직\s*편재|계열사|주요\s*고객/.test(t)) return 'keep';
    if (/(민간기업|공공부문|지식서비스|경영혁신|컨설팅\s*프로젝트)/.test(t)) return 'keep';
    if (/Tel\s*[:：]|연락처|담당자\s*[:：]/i.test(t)) return 'keep';
    if (/^INDEX$|^목차$|^CONTENTS$/i.test(t)) return 'keep';
    if (/^PART\s*\d+\s*\.?$/i.test(t)) return 'keep';
    if (/감사합니다|thank\s*you/i.test(t)) return 'keep';
    if (/표지|결과\s*보고서$/.test(t)) return 'cover';
    if (/만족도\s*(결과|종합|개요)|설문\s*결과/.test(t)) return 'satisfaction';
    if (/문항|영역별|세부\s*결과|정량/.test(t)) return 'questions';
    if (/의견|정성|피드백|보이스|voc/i.test(t)) return 'voices';
    if (/사진|스케치|현장|산출물/.test(t)) return 'photos';
    if (/정산|비용|집행/.test(t)) return 'settle';
    if (/커리큘럼|교과|시간표/.test(t)) return 'curriculum';
    if (/운영\s*결과|출석|수료/.test(t)) return 'run';
    if (/과정\s*개요|개요/.test(t)) return 'overview';
    if (/잘된|성과|좋았/.test(t)) return 'good';
    if (/아쉬|개선|이슈/.test(t)) return 'issue';
    if (/다음|향후|제안/.test(t)) return 'next';
    return 'free';
  }

  function guessOldClient(res) {
    var first = ((res.slides || [])[0] || {});
    var text = [first.title].concat(first.texts || []).join(' ');
    var m = /([가-힣A-Za-z0-9]{2,20}(?:전자|산업|물산|화학|제약|식품|은행|카드|증권|건설|통신|시스템|테크|랩스|네트웍스|네트웍|솔루션|코리아|그룹|공사|공단|재단|협회|케미칼|바이오|물류))/.exec(text);
    if (m) return m[1];
    m = /\(주\)\s*([가-힣A-Za-z0-9]{2,20})/.exec(text);
    if (m) return m[1];
    m = /\[([가-힣A-Za-z0-9]{2,20})\]/.exec(text);
    return m ? m[1] : '';
  }

  function templateFromPptx(res) {
    return addTemplate({
      name: res.name || '양식', kind: 'pptx', fileId: res.id, dir: res.dir,
      swap: { company: guessOldClient(res), course: '', extra: [] },
      desc: res.count + '장 양식',
      slides: (res.slides || []).map(function (s, i) {
        var guess = i === 0 ? 'cover' : guessSource(s.title, s.texts, s.tables);
        return {
          no: s.no, thumb: s.thumb, full: s.full || s.thumb,
          title: s.title || ('슬라이드 ' + s.no),
          slots: s.slots || [], tables: s.tables || [], picSlots: s.pics || 0,
          texts: (s.texts || []).slice(0, 4),
          /* 못 알아본 장은 빼는 것이 기본 — 남기면 예전 고객사 내용이 그대로 나간다 */
          src: (i === 0 || guess !== 'free') ? guess : 'skip',
          bullets: ''
        };
      })
    });
  }

  /* ── 보고서 ───────────────────────────────────────── */

  function blank() {
    return {
      /* 올려 둔 양식이 곧 기본값이다. 하나뿐이면 고르는 걸음을 건너뛴다 —
         고를 것이 하나인데 고르라고 세우는 화면은 일만 늘린다. */
      id: uid(), projectId: null,
      /* 모든 PC 기본 양식이 있으면 그것부터 */
      templateId: ((S.templates.filter(function (t) { return t.pinned; })[0]) || S.templates[0] || {}).id || '',
      templatePicked: S.templates.length === 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      /* 고객사·과정 이름. 예전에는 이어 둔 프로젝트에서만 읽어 왔는데,
         제안서 없이 결과보고서만 쓰는 일이 있어 그때는 표지가 통째로 비었다.
         여기 적어 두면 표지·양식 바꿔치기·파일 이름이 다 이 값을 쓴다. */
      client: { company: '', course: '' },
      overview: { period: '', place: '', headcount: null, attended: null, completed: null,
                  instructors: '', partner: '', summary: '' },
      survey: { raw: '', parsed: null, at: null, note: '' },
      /* actual — 제안서 견적에서 넘어온 줄 가운데 실제가 달랐던 것만 { 항목id: 금액 } */
      settle: { items: [], actual: {}, note: '', useReceipts: true },
      photos: { zipName: '', count: 0, sections: 0, at: null },
      receipts: { count: 0, total: 0, at: null },
      good: '', issue: '', next: ''
    };
  }

  /* 오늘 날짜를 '2026-09-26' 꼴로. 기기 시계 기준이라 toISOString 을 쓰면
     새벽에 하루 전으로 적힌다(UTC 로 밀린다). 그래서 손으로 조립한다. */
  function todayISO() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function create(projectId) {
    var r = blank();
    r.projectId = projectId || null;
    var pj = projectId && g.Projects ? g.Projects.get(projectId) : null;
    if (pj) {
      r.overview.period = pj.ops.period || '';
      r.overview.place = pj.ops.place || '';
      r.overview.headcount = pj.ops.headcount;
      r.overview.partner = [pj.client.person, pj.client.rank].filter(Boolean).join(' ');
      /* 이어 둔 프로젝트가 있으면 고객사·과정 이름을 받아 둔다. 없으면 직접 적는다. */
      r.client.company = (pj.client && pj.client.company) || '';
      r.client.course = courseOf(pj);
    }
    /* 결과보고서는 대개 교육이 끝난 그날이나 그 다음 날 쓴다.
       비워 두면 '기간이 비어 있습니다' 가 뜨고 표지에도 날짜가 안 박히는데,
       열에 아홉은 오늘이 맞다. 넣어 두고 다르면 고치게 한다. */
    if (!r.overview.period) r.overview.period = todayISO();
    S.reports.unshift(r);
    S.activeId = r.id;
    if (pj && g.Projects) g.Projects.update(pj.id, { reportId: r.id });
    save(); emit();
    return r;
  }
  function get(id) {
    for (var i = 0; i < S.reports.length; i++) if (S.reports[i].id === id) return S.reports[i];
    return null;
  }
  function active() { return get(S.activeId); }
  function setActive(id) { S.activeId = id; save(); emit(); }
  function update(id, patch) {
    var r = get(id);
    if (!r) return null;
    Object.keys(patch).forEach(function (k) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && r[k] && typeof r[k] === 'object' && !Array.isArray(r[k])) {
        Object.assign(r[k], patch[k]);
      } else r[k] = patch[k];
    });
    r.updatedAt = new Date().toISOString();
    save(); emit();
    return r;
  }
  function remove(id) {
    var r = get(id);
    if (r && r.projectId && g.Projects) {
      var pj = g.Projects.get(r.projectId);
      if (pj && pj.reportId === id) g.Projects.update(pj.id, { reportId: null });
    }
    S.reports = S.reports.filter(function (x) { return x.id !== id; });
    if (S.activeId === id) S.activeId = S.reports.length ? S.reports[0].id : null;
    save(); emit();
  }
  function byProject(pid) { return S.reports.filter(function (r) { return r.projectId === pid; })[0] || null; }

  /* ── 만족도 ───────────────────────────────────────── */

  function setSurvey(r, text) {
    var res = g.Survey.parse(text);
    if (res.error) return res;
    r.survey.raw = text;
    r.survey.parsed = res;
    r.survey.at = Date.now();
    r.survey.fileName = '';
    update(r.id, {});
    return res;
  }

  /* 엑셀 파일을 바로 올렸을 때 — 표를 그대로 받는다 */
  function setSurveyGrid(r, rows, fileName) {
    var res = g.Survey.parseGrid(rows);
    if (res.error) return res;
    r.survey.raw = '';
    r.survey.parsed = res;
    r.survey.at = Date.now();
    r.survey.fileName = fileName || '';
    update(r.id, {});
    return res;
  }
  function clearSurvey(r) {
    r.survey = { raw: '', parsed: null, at: null, note: r.survey.note || '' };
    update(r.id, {});
  }

  /* ── 정산 (견적서 → 실제) ─────────────────────────── */

  /* 이 프로젝트로 처리한 영수증을 계정별로 모은다 */
  function receiptsOf(projectId) {
    var out = { byAccount: {}, count: 0, total: 0 };
    if (!projectId || !g.Receipt || !g.Receipt.exportData) return out;
    var d;
    try { d = g.Receipt.exportData(); } catch (e) { return out; }
    (d && d.history ? d.history : []).forEach(function (h) {
      if (h.projectId !== projectId) return;
      var amt = Number(h.amount) || 0;
      var acct = h.account || '(계정 미지정)';
      out.byAccount[acct] = (out.byAccount[acct] || 0) + amt;
      out.count++; out.total += amt;
    });
    return out;
  }

  function proposalOf(project) {
    return project && project.proposalId && g.PropStore ? g.PropStore.get(project.proposalId) : null;
  }

  /* 제안서에 쓴 견적 항목을 그대로 정산 줄로 옮긴다.
     계정 합계만 넘기면 '강사료를 얼마에 몇 시간으로 잡았는지'가 사라져서,
     끝나고 실제와 견줄 때 결국 제안서를 다시 열어 봐야 했다. */
  function planRows(prop) {
    var P = g.PropStore;
    if (!prop || !P) return [];
    return (prop.budget.items || []).map(function (it) {
      var q = P.qty(it, prop.ops);
      var price = Number(it.price) || 0;
      return {
        id: it.id,
        group: P.groupOf(it),
        account: it.account || '(계정 미지정)',
        name: it.name || it.account || '항목',
        detail: price ? (price.toLocaleString('ko-KR') + '원 × ' + q + (it.unit || '')) : '',
        plan: P.lineTotal(it, prop.ops)
      };
    });
  }

  /* 계획(제안서 견적) vs 실제.
     실제는 계획과 같은 값으로 시작한다 — 대개 쓴 대로 집행되고,
     달라진 줄만 고치면 되기 때문이다. 고친 줄은 r.settle.actual 에만 남는다. */
  function settle(r, project) {
    var prop = proposalOf(project);
    var quote = prop && g.PropStore ? g.PropStore.budget(prop) : null;
    var rec = r.settle.useReceipts ? receiptsOf(r.projectId) : { byAccount: {}, count: 0, total: 0 };
    var ov = r.settle.actual || {};

    var rows = planRows(prop).map(function (x) {
      var has = Object.prototype.hasOwnProperty.call(ov, x.id) && ov[x.id] !== null && ov[x.id] !== '';
      var actual = has ? (Number(ov[x.id]) || 0) : x.plan;
      x.actual = actual; x.edited = has; x.from = '제안'; x.diff = actual - x.plan;
      return x;
    });

    /* 제안서에 없던 비용 — 현장에서 더 쓴 것 */
    (r.settle.items || []).forEach(function (it, i) {
      var amt = Number(it.amount) || 0;
      rows.push({
        id: 'm' + i, manual: i, group: it.group || '운영비',
        account: it.account || '(계정 미지정)', name: it.name || it.account || '추가 항목',
        detail: '', plan: 0, actual: amt, edited: true, from: '직접', diff: amt
      });
    });

    /* 영수증은 계정 단위로만 안다. 항목 여러 개에 멋대로 나눠 넣지 않고,
       어느 줄에 넣을지는 사람이 고르게 옆에 세워 둔다. */
    var planByAccount = {};
    rows.forEach(function (x) { planByAccount[x.account] = (planByAccount[x.account] || 0) + x.plan; });
    var receipts = Object.keys(rec.byAccount).map(function (k) {
      var hit = rows.filter(function (x) { return x.account === k; });
      return {
        account: k, amount: rec.byAccount[k], plan: planByAccount[k] || 0,
        targets: hit.map(function (x) { return { id: x.id, name: x.name }; }),
        matched: hit.length ? hit.reduce(function (s, x) { return s + x.actual; }, 0) : 0
      };
    }).sort(function (a, b) { return b.amount - a.amount; });

    var groups = GROUPS.map(function (name) {
      return { name: name, rows: rows.filter(function (x) { return x.group === name; }) };
    });
    var rest = rows.filter(function (x) { return GROUPS.indexOf(x.group) === -1; });
    if (rest.length) groups.push({ name: '기타', rows: rest });
    groups = groups.filter(function (x) { return x.rows.length; });
    groups.forEach(function (gr) {
      gr.plan = gr.rows.reduce(function (s, x) { return s + x.plan; }, 0);
      gr.actual = gr.rows.reduce(function (s, x) { return s + x.actual; }, 0);
    });

    var planCost = rows.reduce(function (s, x) { return s + x.plan; }, 0);
    var actualCost = rows.reduce(function (s, x) { return s + x.actual; }, 0);
    var price = quote ? quote.price : 0;

    return {
      rows: rows, groups: groups, receipts: receipts,
      price: price, vat: 0,
      planCost: planCost, actualCost: actualCost,
      planProfit: price - planCost, actualProfit: price - actualCost,
      planMargin: price ? (price - planCost) / price : 0,
      actualMargin: price ? (price - actualCost) / price : 0,
      receiptCount: rec.count, receiptTotal: rec.total,
      proposal: prop, hasPlan: !!(quote && (planCost || price)),
      edited: rows.filter(function (x) { return x.from === '제안' && x.edited; }).length,
      saved: planCost - actualCost
    };
  }

  /* 한 줄의 실제 집행액을 고친다. 계획과 같은 값으로 되돌리면 기록을 지운다. */
  function setActual(r, id, v) {
    r.settle.actual = r.settle.actual || {};
    if (v === null || v === '' || v === undefined) delete r.settle.actual[id];
    else r.settle.actual[id] = Number(v) || 0;
    update(r.id, {});
  }
  function resetActuals(r) { r.settle.actual = {}; update(r.id, {}); }

  function settleText(r, project) {
    var s = settle(r, project);
    var n = function (v) { return Number(v || 0).toLocaleString('ko-KR'); };
    var pct = function (v) { return (Math.round(v * 1000) / 10) + '%'; };
    var out = [];
    out.push('[' + (project ? g.Projects.name(project) : '') + '] 정산');
    out.push('');
    out.push('구분\t항목\t계정\t계획\t실제\t차액');
    s.groups.forEach(function (gr) {
      gr.rows.forEach(function (x) {
        out.push(gr.name + '\t' + x.name + '\t' + x.account + '\t' + n(x.plan) + '\t' + n(x.actual) + '\t' + n(x.diff));
      });
      out.push(gr.name + ' 소계\t\t\t' + n(gr.plan) + '\t' + n(gr.actual) + '\t' + n(gr.actual - gr.plan));
    });
    out.push('원가 합계\t\t\t' + n(s.planCost) + '\t' + n(s.actualCost) + '\t' + n(s.actualCost - s.planCost));
    out.push('');
    out.push('제안가(공급가)\t' + n(s.price));
    out.push('사업이익\t' + n(s.planProfit) + '\t' + n(s.actualProfit));
    out.push('사업이익률\t' + pct(s.planMargin) + '\t' + pct(s.actualMargin));
    if (r.settle.note) { out.push(''); out.push(r.settle.note); }
    return out.join('\n');
  }

  /* ── 개요서 ───────────────────────────────────────── */

  function lines(text) {
    return String(text || '').split(/[\n|]/).map(function (s) { return s.replace(/^[-·•\s]+/, '').trim(); }).filter(Boolean);
  }
  function money(v) { return Number(v || 0).toLocaleString('ko-KR') + '원'; }

  function bulletsFor(src, r, project, slide) {
    var ov = r.overview, sv = r.survey.parsed;
    var prop = project && project.proposalId && g.PropStore ? g.PropStore.get(project.proposalId) : null;

    switch (src) {
      case 'cover':
        return [[companyOf(r, project), courseNameOf(r, project), '결과보고서'].filter(Boolean).join(' '),
                ov.period ? '교육 기간 ' + ov.period : '',
                (g.PropStore ? g.PropStore.myTeam() : 'KMA 인재개발센터'),
                new Date().toLocaleDateString('ko-KR')].filter(Boolean);
      case 'overview': {
        var b = [];
        if (project && project.course) b.push('과정명 ' + project.course);
        if (ov.period) b.push('기간 ' + ov.period);
        if (ov.place) b.push('장소 ' + ov.place);
        if (ov.headcount) b.push('대상 ' + ov.headcount + '명' + (project && project.ops.sessions > 1 ? ' · ' + project.ops.sessions + '차수' : ''));
        if (ov.instructors) b.push('교수 ' + ov.instructors);
        if (ov.partner) b.push('고객 담당 ' + ov.partner);
        return b.concat(lines(ov.summary));
      }
      case 'run': {
        var r2 = [];
        if (ov.headcount) r2.push('신청 ' + ov.headcount + '명');
        if (ov.attended) r2.push('참석 ' + ov.attended + '명' + (ov.headcount ? ' (출석률 ' + Math.round(ov.attended / ov.headcount * 100) + '%)' : ''));
        if (ov.completed) r2.push('수료 ' + ov.completed + '명' + (ov.attended ? ' (수료율 ' + Math.round(ov.completed / ov.attended * 100) + '%)' : ''));
        if (sv) r2.push('만족도 응답 ' + sv.n + '명' + (ov.attended ? ' (응답률 ' + Math.round(sv.n / ov.attended * 100) + '%)' : ''));
        return r2;
      }
      case 'curriculum':
        if (prop && prop.curriculum && (prop.curriculum.lines || []).length) return prop.curriculum.lines.slice(0, 40);
        if (prop && (prop.approach.modules || []).length) {
          return prop.approach.modules.map(function (m) {
            return m.title + (m.hours ? ' (' + m.hours + '시간)' : '') + (m.detail ? ' — ' + m.detail : '');
          });
        }
        return [];
      case 'satisfaction': {
        if (!sv) return [];
        var o = g.Survey.overall(sv);
        var s = [];
        if (o) {
          s.push('종합 만족도 ' + o.to5 + ' / 5.0' + (sv.n ? ' (응답 ' + sv.n + '명)' : ''));
          if (o.best) s.push('가장 높은 문항 — ' + o.best.label + ' ' + o.best.to5);
          if (o.worst && o.worst.label !== o.best.label) s.push('가장 낮은 문항 — ' + o.worst.label + ' ' + o.worst.to5);
        }
        if (sv.nps) s.push('추천의향 NPS ' + sv.nps.score + ' (추천 ' + sv.nps.promoters + '명 · 비추천 ' + sv.nps.detractors + '명)');
        return s.concat(lines(r.survey.note));
      }
      case 'questions':
        if (!sv) return [];
        return sv.questions.map(function (q) {
          return q.label + ' — ' + q.avg + (q.scale !== 5 ? ' / ' + q.scale : '') +
            (q.topRate !== null ? ' (긍정 ' + Math.round(q.topRate * 100) + '%)' : '');
        });
      case 'voices': {
        if (!sv || !sv.texts.length) return [];
        var v = [];
        sv.texts.forEach(function (t) {
          v.push('[' + t.label + ']');
          t.answers.slice(0, 8).forEach(function (a) { v.push('“' + a + '”'); });
        });
        return v;
      }
      case 'photos': {
        var ph = [];
        if (r.photos.count) ph.push('교육 사진 ' + r.photos.count + '장' + (r.photos.sections ? ' · 행사위치 ' + r.photos.sections + '곳' : ''));
        if (r.photos.zipName) ph.push('파일 ' + r.photos.zipName);
        return ph;
      }
      case 'settle': {
        if (!project) return [];
        var st = settle(r, project);
        if (!st.price && !st.actualCost) return [];
        var out = [];
        if (st.price) out.push('제안가(공급가) ' + money(st.price));
        out.push('원가 계획 ' + money(st.planCost) + ' → 실제 ' + money(st.actualCost) +
          (st.saved ? ' (' + (st.saved > 0 ? '절감 ' : '초과 ') + money(Math.abs(st.saved)) + ')' : ''));
        if (st.price) out.push('사업이익 ' + money(st.actualProfit) + ' · 사업이익률 ' + (Math.round(st.actualMargin * 1000) / 10) + '%');
        if (st.receiptCount) out.push('영수증 ' + st.receiptCount + '건 ' + money(st.receiptTotal) + ' 처리');
        return out.concat(lines(r.settle.note));
      }
      case 'good': return lines(r.good);
      case 'issue': return lines(r.issue);
      case 'next': return lines(r.next);
      default: return lines(slide && slide.bullets);
    }
  }

  /* 빈 장을 만났을 때 — 무엇이 없는지와 **어디서 채우는지**를 같이 말한다.
     '어느 탭에서 하세요' 라고만 적어 두면 탭 이름이 바뀔 때마다 거짓말이 된다.
     화면 id 를 들고 있다가 눌러서 바로 데려가는 쪽이 낫다. */
  var NEED = {
    overview:     { text: '기간·장소·인원이 비어 있습니다', at: 'write',  how: '과정 개요에 적기' },
    run:          { text: '참석·수료 인원이 비어 있습니다', at: 'write',  how: '과정 개요에 적기' },
    curriculum:   { text: '제안서에 커리큘럼이 없습니다',   at: 'proposal', how: '제안서에서 올리기' },
    satisfaction: { text: '만족도 결과가 없습니다',         at: 'survey', how: '설문 파일 올리기' },
    questions:    { text: '만족도 결과가 없습니다',         at: 'survey', how: '설문 파일 올리기' },
    voices:       { text: '서술형 응답이 없습니다',         at: 'survey', how: '설문 파일 올리기' },
    photos:       { text: '정리한 교육사진이 없습니다',     at: 'photos', how: '사진 정리하기' },
    settle:       { text: '정산에 넣을 금액이 없습니다',    at: 'settle', how: '정산 열기' },
    good:         { text: '잘된 점이 비어 있습니다',        at: 'write',  how: '정리에 적기' },
    issue:        { text: '아쉬운 점이 비어 있습니다',      at: 'write',  how: '정리에 적기' },
    next:         { text: '다음 제안이 비어 있습니다',      at: 'write',  how: '정리에 적기' },
    free:         { text: '내용이 비어 있습니다',           at: 'write',  how: '내용 채우기' }
  };
  function needOf(src) { return NEED[src] || { text: '내용이 비어 있습니다', at: 'write', how: '내용 채우기' }; }

  /* 개요서(글 목록)에서는 자리를 비워 둘 수 없어 한 줄로 적어 둔다 */
  var PLACEHOLDER = {
    overview: '(기간·장소·인원을 입력하세요)',
    run: '(참석·수료 인원을 입력하세요)',
    curriculum: '(제안서에 커리큘럼을 올리면 여기로 들어옵니다)',
    satisfaction: '(만족도 결과를 넣으세요)',
    questions: '(만족도 결과를 넣으세요)',
    voices: '(서술형 응답이 있으면 여기 들어옵니다)',
    photos: '(교육사진을 정리하고 기록하세요)',
    settle: '(영수증을 처리하거나 정산 항목을 넣으세요)',
    good: '(이번에 잘된 점)',
    issue: '(아쉬웠던 점과 다음에 고칠 것)',
    next: '(이어서 제안할 과정)',
    free: '(내용을 입력하세요)'
  };

  function outline(r, project) {
    var t = template(r.templateId);
    return (t.slides || []).map(function (s, i) {
      var b = bulletsFor(s.src, r, project, s);
      var warn = !b.length && s.src !== 'cover';
      return {
        no: i + 1, title: s.title, src: s.src, note: s.note || '',
        bullets: b.length ? b : [PLACEHOLDER[s.src] || '(내용을 입력하세요)'],
        warn: warn
      };
    });
  }

  /* ── 고른 양식대로 무엇이 나오는지 ──────────────────
     양식을 고르는 곳과 결과물이 떨어져 있어서, 고르고 나서도
     '이 양식으로 뭐가 나오는 거지' 가 안 보였다. 장 단위로 미리 세워 둔다. */
  function planView(r, project) {
    var t = template(r.templateId);
    var jobs = t.kind === 'pptx' ? tableJobs(r, project, t) : [];
    var byslide = {};
    /* 표를 빼는 일(remove)은 채우는 표가 아니다 — 줄 수가 없다 */
    jobs.forEach(function (j) { if (!j.remove) byslide[j.slide] = j; });

    var slides = (t.slides || []).map(function (s, i) {
      var no = s.no || (i + 1);
      var out = {
        no: no, title: s.title || ('슬라이드 ' + no),
        thumb: s.thumb || '', full: s.full || s.thumb || '', src: s.src, bullets: []
      };
      if (s.src === 'skip') { out.drop = true; out.label = '빼고 만듭니다'; return out; }
      if (s.src === 'keep') { out.keep = true; out.label = '양식 그대로'; return out; }

      var j = byslide[no];
      out.label = srcLabel(s.src);
      out.bullets = bulletsFor(s.src, r, project, s);
      out.table = j ? (j.vertical ? (j.pairs || []).length + '칸' : (j.rows || []).length + '줄') : '';
      out.warn = !out.bullets.length && !j && s.src !== 'cover' && s.src !== 'free';
      if (out.warn) {
        var nd = needOf(s.src);
        out.need = nd.text; out.needAt = nd.at; out.needHow = nd.how;
      }
      return out;
    });

    return {
      id: t.id, name: t.name, kind: t.kind || 'outline', builtin: !!t.builtin,
      slides: slides,
      made: slides.filter(function (s) { return !s.drop; }).length,
      dropped: slides.filter(function (s) { return s.drop; }).length,
      warn: slides.filter(function (s) { return s.warn; }).length
    };
  }
  function srcLabel(id) {
    var o = SOURCES.filter(function (x) { return x.id === id; })[0];
    return o ? o.label.replace(/\s*\(.*\)$/, '') : '';
  }

  /* ── 양식에 채워 넣을 작업표 ─────────────────────────
     제안서와 같은 구조다. relay 가 이 표를 받아 PowerPoint 로 파일을 연 뒤
     글자만 갈아 끼운다. 표를 새로 그리지 않으므로 회사 디자인이 그대로 남는다. */
  function fillPlan(r, project) {
    var t = template(r.templateId);
    if (t.kind !== 'pptx') return null;

    /* 사진이 자리보다 많으면 그 장을 늘린다. 한 장에 여섯 자리인데 사진이 스무 장이면
       네 장으로 나눠 담는다 — 넘치는 사진을 조용히 버리면 안 된다.
       늘어난 만큼 뒤쪽 장 번호가 밀리므로, 여기서 보내는 번호는 모두 '늘어난 뒤' 기준이다. */
    var reps = repeatPlan(r, t);
    function shift(no) {
      var d = 0;
      reps.forEach(function (x) { if (x.no < no) d += x.times - 1; });
      return no + d;
    }

    var jobs = tableJobs(r, project, t);
    var tabled = {};
    jobs.forEach(function (j) { tabled[j.slide] = true; });
    jobs.forEach(function (j) { j.slide = shift(j.slide); });

    var fill = [], drop = [];
    var picAt = 0;
    (t.slides || []).forEach(function (s) {
      if (s.src === 'skip') { drop.push(shift(s.no)); return; }
      if (s.src === 'keep') return;
      /* 표지는 제안서와 같게 — 상자를 통째로 갈지 않고 고객사·과정명·날짜 낱말만 바꾼다
         ('Connect Values Navigate Growth' 같은 문구 자리에 우리 팀·날짜가 부어지지 않게) */
      /* 프로젝트가 없어도 보고서에 적은 고객사·과정명으로 채운다.
         전에는 프로젝트를 이어 둔 보고서에서만 이 길을 타서, 결과보고서만 따로 쓴 건은
         표지가 '결과보고서' 한 줄로 덮이고 양식의 날짜(2026. 07. 28.)가 그대로 나갔다. */
      if (s.src === 'cover' && g.PropStore && g.PropStore.coverSlots &&
          (companyOf(r, project) || courseNameOf(r, project))) {
        var cs = g.PropStore.coverSlots({
          title: courseNameOf(r, project), client: { company: companyOf(r, project) }, approach: {}
        }, s);
        if (cs && cs.length) { fill.push({ no: shift(s.no), slots: cs }); return; }
      }
      var b = bulletsFor(s.src, r, project, s);
      if (s.src === 'cover' && b.length) {
        fill.push({ no: shift(s.no), title: b[0], body: b.slice(1) });
        return;
      }
      /* 사진 장은 글이 아니라 그림이 들어가야 한다.
         '교육 사진 24장' 이라고 글로만 적고 정작 사진은 한 장도 안 넣고 있었다. */
      if (s.src === 'photos') {
        var room = picSlotsOf(s);
        var times = 1;
        reps.forEach(function (x) { if (x.no === s.no) times = x.times; });
        var base = shift(s.no);
        /* 장마다 고르게 나눈다. 앞 장을 꽉 채우고 마지막 장에 두 장만 남기면
           마지막 장이 휑해 보인다(14장이면 6·6·2 가 아니라 5·5·4 로). */
        var mine = Math.min(photoCount() - picAt, room * times);
        var each = Math.floor(mine / times);
        var extra = mine % times;
        for (var k = 0; k < times; k++) {
          var take = Math.min(room, each + (k < extra ? 1 : 0));
          fill.push({ no: base + k, title: s.title, body: [],
                      picSlots: take, picFrom: picAt });
          picAt += take;
        }
        return;
      }
      /* 서술형 장 — '① 인상 깊거나 도움이 된 부분 / ② 개선이 필요한 부분' 처럼 칸이 나뉘어 있으면
         설문의 서술형 문항을 성격에 맞는 칸에 나눠 넣는다 */
      if (s.src === 'voices') {
        var vs = voiceSlots(r, s);
        if (vs.length) { fill.push({ no: shift(s.no), slots: vs }); return; }
      }
      /* 표를 채우는 장의 큰 글상자는 대개 안내 문구다. 덮어쓰지 않는다.
         다만 '설문 진행 : … / 교육 인원 : …' 처럼 이름 : 값 줄로 된 상자는 이번 건 값으로 바꾼다. */
      var ll = labelLineSlots(r, project, s);
      if (ll.length) {
        fill.push({ no: shift(s.no), slots: ll });
        return;
      }
      fill.push({ no: shift(s.no), title: s.title, body: tabled[s.no] ? [] : b });
    });

    return {
      templateId: t.fileId, fill: fill, drop: drop, repeat: reps,
      tables: jobs, replace: swapList(r, project, t),
      /* 레이아웃에 박힌 '2026 HMM Learning Curation … 결과 보고서' 를 이번 건으로.
         프로젝트가 없어도 보고서에 적은 이름으로 — 전에는 프로젝트가 없으면 비어서 HMM 이 그대로 나갔다 */
      header: g.PropStore && g.PropStore.headerLine
        ? g.PropStore.headerLine(companyOf(r, project), courseNameOf(r, project), '결과 보고서') : ''
    };
  }

  /* ── 서술형 의견을 칸에 나눠 넣기 ──────────────────────
     양식: 머리 칸('① 인상 깊거나 도움이 된 부분') 바로 밑에 답 칸이 하나씩 있다.
     설문: '본 교육 과정에서 …' · '추후 교육 진행 시 건의하고 싶은 사항' 같은 서술형 문항.
     문항 이름으로 '좋았던 것' 과 '바라는 것' 을 갈라 같은 성격의 칸에 넣는다.
     '없습니다' · '특이사항 없음' 같은 답은 뺀다 — 보고서에 '없습니다' 가 줄줄이 실리면 안 된다. */
  var IMPROVE_RE = /개선|건의|아쉬|보완|바라|요청|불편|희망|추후|향후|제안/;
  var EMPTY_ANSWER = /^(없|딱히|특이\s*사항\s*없|아직(은)?\s*(잘\s*)?(없|모르)|해당\s*(사항\s*)?없|무$|x$|-+$|\.+$|n\/?a$)/i;

  function voiceAnswers(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (a) {
      var t = String(a || '').replace(/\s+/g, ' ').trim().replace(/[~!]+$/, '');
      if (t.length < 2 || EMPTY_ANSWER.test(t)) return;
      var k = t.replace(/\s/g, '');
      if (seen[k]) return;
      seen[k] = 1;
      out.push(t);
    });
    return out;
  }

  function voiceSlots(r, s) {
    var sv = r.survey && r.survey.parsed;
    if (!sv || !(sv.texts || []).length) return [];
    var slots = (s.slots || []).filter(function (x) { return x && x.name; });
    /* 머리 칸 — 한 줄짜리 짧은 이름표 중 ①② 로 시작하거나 '도움·인상·개선·건의' 가 들어간 것 */
    var heads = slots.filter(function (x) {
      var t = String(x.text || '').trim();
      return (x.lines || 1) <= 1 && t.length <= 30 &&
        (/^[①②③④]/.test(t) || /인상|도움|좋았|개선|건의|아쉬|보완/.test(t));
    });
    if (!heads.length) return [];
    /* 머리 칸마다 바로 밑, 같은 줄(왼쪽 끝이 비슷한) 답 칸 */
    var pairs = [];
    heads.forEach(function (h) {
      var best = null;
      slots.forEach(function (x) {
        if (x === h || heads.indexOf(x) !== -1) return;
        if (Math.abs((x.left || 0) - (h.left || 0)) > 24) return;
        if ((x.top || 0) <= (h.top || 0)) return;
        if (!best || x.top < best.top) best = x;
      });
      if (best) pairs.push({ head: h, box: best, improve: IMPROVE_RE.test(String(h.text || '')) });
    });
    if (!pairs.length) return [];

    /* 설문 서술형 문항을 '좋았던 것' · '바라는 것' 으로 가른다 */
    var good = [], want = [];
    sv.texts.forEach(function (t, i) {
      var answers = voiceAnswers(t.answers);
      if (IMPROVE_RE.test(String(t.label || ''))) want = want.concat(answers);
      else good = good.concat(answers);
    });
    /* 문항 이름으로 가를 수 없으면(둘 다 한쪽) 차례대로 — 첫 문항은 왼쪽, 둘째는 오른쪽 */
    if ((!good.length || !want.length) && sv.texts.length >= 2) {
      good = voiceAnswers(sv.texts[0].answers);
      want = voiceAnswers(sv.texts.slice(1).reduce(function (a, t) { return a.concat(t.answers); }, []));
    }
    return pairs.map(function (pr) {
      var list = pr.improve ? want : good;
      /* 칸이 받는 줄 수보다 많이 넣지 않는다 — 넘치면 PPT 가 끝 줄을 자른다 */
      var room = Math.max(3, Math.floor((pr.box.height || 120) / ((pr.box.font || 9) * 1.6)));
      return { name: pr.box.name, text: (list.length ? list.slice(0, room) : ['특이 의견 없음']).join('\n') };
    });
  }

  /* 그 장에 그림 자리가 몇 개인지. 양식을 읽을 때 파워포인트가 세어 둔다.
     예전에 올린 양식에는 그 값이 없으니, 회사 양식 기준(여섯)으로 본다. */
  function picSlotsOf(s) {
    return Number(s.picSlots) || 6;
  }

  /* 사진 장을 몇 장으로 늘릴지 */
  function repeatPlan(r, t) {
    var have = photoCount();
    if (!have) return [];
    var out = [];
    /* 사진 장이 여럿이면 자리를 모두 합쳐 나눈다 */
    var room = 0;
    (t.slides || []).forEach(function (s) {
      if (s.src === 'photos') room += picSlotsOf(s);
    });
    if (!room || have <= room) return [];
    var times = Math.ceil(have / room);
    /* 너무 많이 늘리지 않는다 — 사진 200장이 들어오면 슬라이드가 34장이 된다 */
    times = Math.min(times, 8);
    (t.slides || []).forEach(function (s) {
      if (s.src === 'photos') out.push({ no: s.no, times: times });
    });
    return out;
  }

  /* 지금 '사진 정리' 화면이 들고 있는, 쓰기로 고른 사진 수 */
  function photoCount() {
    var PP = g.PhotoProject;
    if (!PP || !PP.sortedPhotos) return 0;
    try {
      return PP.sortedPhotos().filter(function (x) {
        return x && x.file && x.status === 'keep';
      }).length;
    } catch (e) { return 0; }
  }

  /* 양식에 남아 있는 예전 건의 고객사·과정 이름을 이번 건으로 바꾼다 */
  function swapList(r, project, t) {
    var sw = t.swap || {};
    var out = [];
    function add(from, to) {
      from = String(from || '').trim(); to = String(to || '').trim();
      if (from && to && from !== to) out.push({ from: from, to: to });
    }
    /* 보고서에 직접 적은 이름이 먼저다 — 제안서 없이 쓰는 건이 있다 */
    add(sw.company, companyOf(r, project));
    add(sw.course, courseNameOf(r, project));
    (sw.extra || []).forEach(function (x) { add(x.from, x.to); });
    return out;
  }

  /* 고객사·과정 이름 — 보고서에 적어 둔 것이 먼저, 없으면 이어 둔 프로젝트에서 */
  function companyOf(r, project) {
    var mine = String((r && r.client && r.client.company) || '').trim();
    if (mine) return mine;
    return (project && project.client && project.client.company) || '';
  }
  function courseNameOf(r, project) {
    var mine = String((r && r.client && r.client.course) || '').trim();
    if (mine) return mine;
    return courseOf(project);
  }
  /* 프로젝트에서 과정 이름만 — 이름 앞에 고객사가 붙어 있으면 떼어 낸다 */
  function courseOf(pj) {
    if (!pj) return '';
    var t = String(pj.course || pj.name || pj.title || '').trim();
    /* 프로젝트는 고객사를 pj.company 에 둔다 (pj.client 에는 담당자만) */
    var co = String(pj.company || (pj.client && pj.client.company) || '').trim();
    if (co && t.indexOf(co) === 0) t = t.slice(co.length).trim();
    return g.PropStore && g.PropStore.tidyCourse ? g.PropStore.tidyCourse(t) : t;
  }

  function tableJobs(r, project, t) {
    var jobs = [];
    (t.slides || []).forEach(function (s) {
      if (s.src === 'skip' || s.src === 'keep') return;
      /* 한 장에 만족도 표가 여럿이면(공통 영역 · 강사 영역 · 학습 목표) 문항을 영역별로 나눈다.
         전에는 표마다 같은 문항을 다 보내 첫 표만 세 번 채워지고, 나머지 표에는
         예전 보고서 숫자가 그대로 남았다. */
      var share = shareQuestions(r, (s.tables || []).filter(isScoreTable));
      (s.tables || []).forEach(function (tb) {
        var heads = (tb.headers || []).map(function (h) { return String(h).replace(/\s/g, ''); });

        /* 만족도 표 — 문항 수만큼 줄을 늘린다.
           양식의 9줄 틀에 억지로 욱여넣지 않는다. 설문마다 문항이 다르고,
           어느 문항이 어느 칸인지는 사람만 정할 수 있다. 읽은 그대로 싣는 편이 정직하다. */
        if (isScoreTable(tb) && share) {
          var mine = share.get(tb);
          /* 이 표에 맞는 문항이 하나도 없으면 표를 뺀다 — 예전 숫자가 남아 나가는 것보다 낫다.
             옆 그래프·이름표도 같이 빼고, 남은 묶음을 올려 빈자리가 남지 않게 한다(reflow). */
          if (!mine.length) { if (tb.name) jobs.push({ slide: s.no, remove: [tb.name], reflow: true }); return; }
          var rows = surveyRows(r, tb, mine);
          if (rows.length) {
            jobs.push({ slide: s.no, name: tb.name || '', headers: tb.headers, rows: rows, mergeCol: groupCol(heads) });
            return;
          }
        }

        /* 과정명·교육 일시·강사명처럼 세로로 선 표.
           이름표는 머리글 줄만이 아니라 **모든 줄의 첫 칸**에 있다. 머리글만 보았더니
           '과정명' 만 바뀌고 '교육 일시 26.07.23(목)' · '강사명 이은애 강사' 는
           예전 보고서 값 그대로 나갔다. */
        var labelsInTable = heads.slice();
        (tb.cells || []).forEach(function (row) {
          (row || []).forEach(function (c) { labelsInTable.push(String(c || '').replace(/\s/g, '')); });
        });
        var pairs = infoPairs(r, project).filter(function (pr) {
          return labelsInTable.indexOf(pr.label.replace(/\s/g, '')) !== -1;
        });
        if (pairs.length) { jobs.push({ slide: s.no, vertical: true, pairs: pairs }); return; }
      });
    });
    /* 표 빼기는 맨 끝에 — 다른 표를 다 채운 뒤에 빈자리를 메워야 자리가 맞는다 */
    return jobs.filter(function (j) { return !j.remove; })
      .concat(jobs.filter(function (j) { return j.remove; }));
  }

  function isScoreTable(tb) {
    return (tb.headers || []).some(function (h) { return /만족도|평균/.test(String(h).replace(/\s/g, '')); });
  }

  /* 문항 · 표가 다루는 영역. 표는 양식에 남아 있는 예전 문항 이름(전문성 · 소통력 …)으로 본다 */
  var KINDS = [
    ['teacher', /강사|교수|전문성|소통|전달력|강의/],
    ['content', /콘텐츠|컨텐츠|학습\s*목표|목표\s*(달성|도달)|도달|커리큘럼|교재|실습|난이도|교육\s*내용|현업\s*적용|적용\s*(가능|의지|도)/],
    ['ops', /운영|환경|시설|교육장|식사|숙소|교통|교보재/]
  ];
  function kindsIn(text) {
    var t = String(text || '');
    return KINDS.filter(function (k) { return k[1].test(t); }).map(function (k) { return k[0]; });
  }
  function kindOf(text) {
    return kindsIn(text)[0] || 'common';
  }
  /* 문항은 설문 쪽이 붙인 머리말('1.【강사】…')을 먼저 믿는다. 머리말이 여러 영역에 걸치면
     ('【교육 콘텐츠 및 강사】') 그 안에서 문항 글로 고른다. */
  function questionKind(label) {
    var s = String(label || '');
    var m = /[\[【]([^\]】]+)[\]】]/.exec(s);
    var body = bareLabel(s);
    if (!m) return kindOf(body);
    var tag = kindsIn(m[1]);
    if (tag.length === 1) return tag[0];
    if (!tag.length) return /공통|전반|종합/.test(m[1]) ? 'common' : kindOf(body);
    var own = kindsIn(body).filter(function (k) { return tag.indexOf(k) !== -1; });
    return own[0] || tag[tag.length - 1];
  }
  function tableKind(tb) {
    var n = {};
    (tb.cells || []).slice(1).forEach(function (row) {
      var first = String((row || [])[0] || '').trim();
      if (!first || /평균|합계|전체/.test(first)) return;
      var k = kindOf(first);
      n[k] = (n[k] || 0) + 1;
    });
    /* 공통 표에 '환경' 한 줄이 섞여 있어도 공통 표다 — 가장 많은 쪽으로 */
    var best = 'common', most = 0;
    Object.keys(n).forEach(function (k) { if (n[k] > most) { most = n[k]; best = k; } });
    return best;
  }

  /* 표가 둘 이상일 때만 나눈다. 하나면 모든 문항이 그 표로 간다(예전과 같다). */
  function shareQuestions(r, tables) {
    var sv = r.survey && r.survey.parsed;
    if (!sv || !sv.questions || !sv.questions.length) return null;
    var qs = sv.questions.filter(function (q) { return !q.isNps; });
    var bucket = tables.map(function () { return []; });
    if (tables.length <= 1) {
      return { get: function () { return qs; } };
    }
    var kinds = tables.map(tableKind);
    var home = kinds.indexOf('common');
    if (home < 0) home = 0;
    qs.forEach(function (q) {
      var k = questionKind(q.label);
      var at = kinds.indexOf(k);
      /* 운영 문항은 운영 표가 없으면 공통 표로 */
      bucket[at < 0 ? home : at].push(q);
    });
    return { get: function (tb) { var i = tables.indexOf(tb); return i < 0 ? [] : bucket[i]; } };
  }

  /* 양식 표 끝 줄이 '평균' 이면 이번 문항으로 다시 낸다 */
  function averageRow(heads, rows) {
    return heads.map(function (h, c) {
      if (/문항|평가내용|내용|항목/.test(h) || c === 0) return '평균';
      var nums = rows.map(function (row) { return parseFloat(String(row[c] || '').replace('%', '')); })
        .filter(function (x) { return !isNaN(x); });
      if (!nums.length) return '';
      var avg = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
      return /%$/.test(String(rows[0][c] || '')) ? pct(avg) : avg.toFixed(2);
    });
  }

  function groupCol(heads) {
    for (var i = 0; i < heads.length; i++) if (/구분|영역/.test(heads[i])) return i + 1;
    return undefined;
  }

  /* 문항 이름 앞머리로 어느 영역인지 가른다 */
  function areaOf(label) {
    var t = String(label || '');
    var m = /^\s*(?:\d+\s*[.)]\s*)?[\[【]([^\]】]+)[\]】]/.exec(t);
    /* '[강사 영역]' 처럼 영역 이름이 적힌 것만 그대로 쓴다. '[강사의 전문성]' 은 문항 이름이라
       그걸 영역으로 쓰면 강사 문항마다 영역이 따로 생기고, 띄어쓰기까지 지워
       '강사의전문 / 성' 처럼 쪼개져 나갔다. */
    if (m && /강사|교수/.test(m[1]) && /영역|부문|만족도|평가$/.test(m[1])) return m[1].trim();
    if (/숙소|교육장|식사|교통|운영\s*안내|교보재|시설/.test(t)) return '운영·시설';
    /* '[운영 만족도] 사전 준비와 진행…' — 교육 공통으로 묶이면 영역이 틀린다 */
    if (m && /운영|진행/.test(m[1])) return '교육 운영';
    if (/강사|교수/.test(t)) return '교육콘텐츠 및 강사';
    return '교육 공통 만족도';
  }
  function bareLabel(label) {
    /* '1.【교육 공통】과정 전반에 …' — 번호와 꺾쇠 머리를 어느 순서로 붙였든 뗀다 */
    var t = String(label || '');
    for (var i = 0; i < 2; i++) {
      t = t.replace(/^\s*[\[【][^\]】]+[\]】]\s*/, '').replace(/^\s*\d+\s*[.)]\s*/, '');
    }
    return t.trim();
  }

  /* 설문 결과 → 양식 표의 줄.
     4점 척도는 가운데 보기가 없다. 5점 칸에 옮길 때 ④→5 ③→4 ②→2 로 두고
     3칸과 1칸은 0% 로 남긴다 — 없는 응답을 지어내지 않는다. */
  function surveyRows(r, tb, list) {
    var sv = r.survey && r.survey.parsed;
    if (!sv || !sv.questions || !sv.questions.length) return [];
    var heads = (tb.headers || []).map(function (h) { return String(h).replace(/\s/g, ''); });
    var lens = tb.cellLen || [];
    var qs = list || sv.questions.filter(function (q) { return !q.isNps; });
    if (!qs.length) return [];

    var rows = qs.map(function (q) {
      var d = spread5(q);
      var seen = 0;
      return heads.map(function (h, c) {
        var cap = lens[c] || 0;
        if (/구분|영역/.test(h)) return areaOf(q.label);
        /* 문항은 자르지 않는다 — '적절하다고 생각하십니…' 처럼 끝이 잘리면 무슨 질문인지
           알 수 없다. 칸이 모자라면 표 맞추기(pptx._fit_table)가 글자를 줄인다. */
        if (/문항|평가내용|내용|항목/.test(h)) return bareLabel(q.label);
        if (/만족도|평균/.test(h)) return (q.to5 || q.avg).toFixed(2);
        if (/응답|인원|명$|^n$/i.test(h)) return String(q.n);
        if (/매우\s*만족/.test(h)) return pct(d[5]);
        if (/매우\s*불만/.test(h)) return pct(d[1]);
        if (/^만족$/.test(h)) return pct(d[4]);
        if (/보통/.test(h)) return pct(d[3]);
        if (/불만/.test(h)) return pct(d[2]);
        /* 5 / 4 / 3 / 2 / 1 처럼 숫자만 적힌 머리글 */
        if (/^[1-5]$/.test(h)) return pct(d[Number(h)]);
        /* 머리글이 비어 있는 칸은 차례대로 5→1 로 채운다 */
        if (h === '') { seen++; return seen <= 5 ? pct(d[6 - seen]) : ''; }
        return '';
      });
    });
    /* 구분 칸이 있으면 같은 영역끼리 붙인다 — 떨어져 있으면 칸이 합쳐지지 않고 같은 이름이 두 번 나온다 */
    var gc = groupCol(heads);
    if (gc) {
      var first = {};
      rows.forEach(function (row, i) { var k = row[gc - 1]; if (!(k in first)) first[k] = i; });
      rows = rows.map(function (row, i) { return { row: row, i: i }; })
        .sort(function (a, b) { return (first[a.row[gc - 1]] - first[b.row[gc - 1]]) || (a.i - b.i); })
        .map(function (x) { return x.row; });
    }
    var cells = tb.cells || [];
    var last = cells.length > 1 ? String((cells[cells.length - 1] || [])[0] || '') : '';
    if (/평균/.test(last) && !groupCol(heads)) rows.push(averageRow(heads, rows));
    return rows;
  }

  /* 어떤 척도든 5칸 분포(%)로 옮긴다 */
  function spread5(q) {
    var out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    var dist = q.dist || {};
    var n = q.n || 0;
    if (!n) return out;
    var map4 = { 4: 5, 3: 4, 2: 2, 1: 1 };
    Object.keys(dist).forEach(function (k) {
      var v = Number(k);
      var slot = (q.scale === 4) ? (map4[v] || v)
               : (q.scale === 5) ? v
               : Math.max(1, Math.min(5, Math.round((v - 1) / (q.scale - 1) * 4 + 1)));
      out[slot] += dist[k];
    });
    [1, 2, 3, 4, 5].forEach(function (k) { out[k] = out[k] / n * 100; });
    return out;
  }
  function pct(v) {
    var x = Math.round((v || 0) * 10) / 10;
    return (x % 1 === 0 ? x.toFixed(0) : x.toFixed(1)) + '%';
  }
  function cut(s, cap) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!cap || cap < 8 || s.length <= cap) return s;
    var t = s.slice(0, cap), at = Math.max(t.lastIndexOf(' '), t.lastIndexOf(','));
    if (at > cap * 0.6) t = t.slice(0, at);
    return t.replace(/[\s,]+$/, '') + '…';
  }

  /* 양식의 '과정명 / 교육 일시 / 강사명' 칸에 넣을 값 */
  /* '설문 진행 : 26.07.23(목) 교육 종료 직후 / 교육 장소 : … / 교육 인원 : 20명' 처럼
     '이름 : 값' 줄로 된 글상자. 표 옆에 있으면 채우지 않고 넘어가서 예전 보고서의
     날짜·장소·인원이 그대로 나갔다. 아는 이름은 이번 건 값으로 바꾸고,
     '설문 방식 · 평가 척도' 처럼 건마다 같은 줄은 양식 그대로 둔다.
     값을 모르는 줄은 '-' 로 비운다 — 예전 고객사 값이 남는 것보다 낫다. */
  function labelLineSlots(r, project, s) {
    var o = r.overview || {};
    var sv = r.survey && r.survey.parsed;
    var day = String(o.period || '').split(/[,~]/)[0].trim();
    var came = Number(o.attended) || Number(o.headcount) || 0;
    var VAL = [
      [/^(설문진행|설문일시|설문일자|설문시기)$/, day ? day + ' 교육 종료 직후' : ''],
      [/^(교육장소|장소)$/, o.place || ''],
      [/^(교육인원|참석인원|대상인원|수강인원)$/, came ? came + '명' : ''],
      [/^(설문인원|응답인원|응답자)$/, sv && sv.n ? sv.n + '명' + (came ? ' (' + Math.round(sv.n / came * 100) + '%)' : '') : ''],
      [/^(교육일시|일시|교육일정|교육기간|기간)$/, o.period || ''],
      [/^(강사|강사명|교수)$/, o.instructors || ''],
      [/^(과정명|교육명)$/, courseNameOf(r, project)],
      [/^(고객사|고객사명|기업명)$/, companyOf(r, project)]
    ];
    var out = [];
    (s.slots || []).forEach(function (x) {
      var ls = String((x && x.text) || '').split('\n');
      var known = 0;
      var next = ls.map(function (line) {
        var m = /^(\s*[•▪■·\-]?\s*)([가-힣A-Za-z ]{2,12}?)(\s*[:：]\s*)(.+)$/.exec(line);
        if (!m) return line;
        var key = m[2].replace(/\s/g, '');
        for (var i = 0; i < VAL.length; i++) {
          if (VAL[i][0].test(key)) { known++; return m[1] + m[2] + m[3] + (VAL[i][1] || '-'); }
        }
        return line;
      });
      if (known && ls.filter(function (l) { return /[:：]/.test(l); }).length >= 2) {
        out.push({ name: x.name, text: next.join('\n') });
      }
    });
    return out;
  }

  function infoPairs(r, project) {
    var o = r.overview || {};
    return [
      { label: '과정명', value: courseNameOf(r, project) },
      { label: '교육 일시', value: o.period || '' },
      { label: '교육일시', value: o.period || '' },
      { label: '교육 장소', value: o.place || '' },
      { label: '교육장소', value: o.place || '' },
      { label: '강사명', value: o.instructors || '' },
      { label: '강사', value: o.instructors || '' },
      { label: '교육 일정', value: o.period || '' },
      { label: '교육 기간', value: o.period || '' },
      { label: '교육 인원', value: o.headcount ? o.headcount + '명' : '' },
      { label: '고객사', value: companyOf(r, project) },
      { label: '고객사명', value: companyOf(r, project) }
    ].map(function (x) {
      /* 모르는 값은 '-' 로 비운다. 빈 채로 빼면 양식의 '이은애 강사' 같은 예전 값이 그대로 나갔다 */
      return { label: x.label, value: x.value || '-' };
    });
  }

  function outlineText(r, project) {
    var out = ['# ' + (project ? g.Projects.name(project) : '') + ' 결과보고서 — PPT 개요', ''];
    outline(r, project).forEach(function (s) {
      out.push('## ' + s.no + '. ' + s.title);
      s.bullets.forEach(function (b) { out.push('   - ' + b); });
      out.push('');
    });
    return out.join('\n');
  }

  function gaps(r, project) {
    return outline(r, project).filter(function (s) { return s.warn; }).map(function (s) { return s.no + '. ' + s.title; });
  }

  g.RepStore = {
    SOURCES: SOURCES,
    load: load, save: save, state: state, onChange: onChange, emit: emit, uid: uid,
    templates: templates, template: template, addTemplate: addTemplate,
    updateTemplate: updateTemplate, removeTemplate: removeTemplate,
    templateFromPptx: templateFromPptx, fillPlan: fillPlan, planView: planView,
    pullShared: pullShared, setPinned: setPinned,
    create: create, get: get, active: active, setActive: setActive, update: update, remove: remove,
    byProject: byProject,
    /* 표지·파일 이름이 함께 쓰는 고객사·과정 이름 */
    companyOf: companyOf, courseNameOf: courseNameOf,
    setSurvey: setSurvey, setSurveyGrid: setSurveyGrid, clearSurvey: clearSurvey,
    settle: settle, settleText: settleText, receiptsOf: receiptsOf,
    setActual: setActual, resetActuals: resetActuals,
    outline: outline, outlineText: outlineText, gaps: gaps, lines: lines
  };
})(window);
