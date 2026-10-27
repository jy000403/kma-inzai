/* store.js — 프로젝트 (고객사 × 과정 = 수주 한 건)
 *
 * 이 사이트의 뼈대다. 제안서도 결과보고서도 견적서도 사진도 영수증도
 * 결국 "어느 프로젝트의 것이냐"로 묶인다.
 */
(function (g) {
  'use strict';

  var KEY = g.Scope.key('kma-projects:v1');

  /* 수주 한 건이 지나가는 길 */
  var STAGES = [
    { id: '제안준비', label: '제안 준비', tone: '' },
    { id: '제안제출', label: '제안 제출', tone: '' },
    { id: '브리핑', label: '브리핑', tone: 'warn' },
    { id: '수주', label: '수주', tone: 'ok' },
    { id: '운영중', label: '운영 중', tone: 'ok' },
    { id: '결과보고', label: '결과보고', tone: 'warn' },
    { id: '완료', label: '완료', tone: 'ok' },
    { id: '무산', label: '무산', tone: 'bad' }
  ];
  var LIVE = ['제안준비', '제안제출', '브리핑', '수주', '운영중', '결과보고'];

  /* ── 날짜 ─────────────────────────────────────────── */

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function plusDays(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  /* 오늘로부터 며칠 뒤인가 (지난 날이면 음수) */
  function daysTo(date) {
    if (!date) return null;
    var a = new Date(date + 'T00:00:00'), b = new Date(today() + 'T00:00:00');
    return Math.round((a - b) / 86400000);
  }
  function dateLabel(date) {
    var d = daysTo(date);
    if (d === null) return '';
    if (d === 0) return '오늘';
    if (d === 1) return '내일';
    if (d > 0) return d + '일 뒤';
    return -d + '일 지남';
  }

  var S = { projects: [], activeId: null };
  var listeners = [];

  function uid() { return 'pj' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6); }
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  var didLoad = false;
  function load() {
    /* 제안서·결과보고서 화면도 이 저장소를 읽는다. 두 번 읽어 덮어쓰지 않게 막는다. */
    if (didLoad) return S;
    didLoad = true;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (Array.isArray(d.projects)) S.projects = d.projects;
        S.activeId = d.activeId || null;
      }
    } catch (e) {}
    return S;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { if (g.UI) g.UI.toast('저장 공간이 부족합니다. 백업 후 정리해 주세요', 'err'); }
  }
  function state() { return S; }
  function list() { return S.projects; }

  function blank() {
    return {
      id: uid(),
      company: '', course: '', year: new Date().getFullYear(),
      stage: '제안준비',
      client: { person: '', rank: '', dept: '', phone: '', email: '' },
      ops: { headcount: null, days: null, sessions: 1, period: '', place: '' },
      manager: '',
      proposalId: null, reportId: null,
      /* 노션 문의에서 만든 건이면 그 문의 id — 같은 문의로 두 번 만들지 않게 */
      vocId: null,
      /* 내보낸 것을 언제 누구에게 보냈는지 — 워크플로우가 여기서 갈린다 */
      sent: { proposal: null, report: null },
      /* 제안을 보낸 뒤 다시 연락할 날 · 브리핑 날짜 */
      followUp: null,   // { date, kind: '연락'|'브리핑', note, doneAt }
      memo: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  }

  function create(patch) {
    var p = blank();
    Object.keys(patch || {}).forEach(function (k) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && p[k]) Object.assign(p[k], patch[k]);
      else if (patch[k] !== undefined) p[k] = patch[k];
    });
    S.projects.unshift(p);
    S.activeId = p.id;
    save(); emit();
    return p;
  }
  function get(id) {
    for (var i = 0; i < S.projects.length; i++) if (S.projects[i].id === id) return S.projects[i];
    return null;
  }
  function active() { return get(S.activeId); }
  function setActive(id) { S.activeId = id; save(); emit(); }
  function update(id, patch) {
    var p = get(id);
    if (!p) return null;
    Object.keys(patch).forEach(function (k) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && p[k] && typeof p[k] === 'object') {
        Object.assign(p[k], patch[k]);
      } else p[k] = patch[k];
    });
    p.updatedAt = new Date().toISOString();
    save(); emit();
    return p;
  }
  /* 프로젝트를 지우면 거기 달린 제안서·결과보고서도 같이 지운다.
     전에는 프로젝트만 없애서, 주인 없는 제안서가 목록에 남아 떠돌았다.
     withDocs 를 false 로 주면 문서는 남긴다. */
  function remove(id, withDocs) {
    var p = get(id);
    if (p && withDocs !== false) {
      if (p.proposalId && g.PropStore) { try { g.PropStore.remove(p.proposalId); } catch (e) {} }
      if (p.reportId && g.RepStore) { try { g.RepStore.remove(p.reportId); } catch (e) {} }
    }
    S.projects = S.projects.filter(function (x) { return x.id !== id; });
    if (S.activeId === id) S.activeId = S.projects.length ? S.projects[0].id : null;
    save(); emit();
  }

  /* 지우기 전에 무엇이 같이 사라지는지 세어 둔다 — 물어볼 때 쓴다 */
  function docsOf(id) {
    var p = get(id);
    if (!p) return { proposal: false, report: false };
    return {
      proposal: !!(p.proposalId && g.PropStore && g.PropStore.get(p.proposalId)),
      report: !!(p.reportId && g.RepStore && g.RepStore.get(p.reportId))
    };
  }

  function name(p) {
    if (!p) return '';
    return (p.company ? '[' + p.company + '] ' : '') + (p.course || '이름 없는 프로젝트');
  }
  function byProposal(pid) {
    return S.projects.filter(function (p) { return p.proposalId === pid; })[0] || null;
  }
  function byReport(rid) {
    return S.projects.filter(function (p) { return p.reportId === rid; })[0] || null;
  }

  /* 단계를 한 칸 앞으로. 무산은 손대지 않는다. */
  function advance(id, to) {
    var p = get(id);
    if (!p) return;
    update(id, { stage: to });
  }

  /* 내보낸 문서를 메일로 넘긴 순간을 남긴다.
     how = 'sent'  바로 보냄
           'draft' 아웃룩 창을 열어 줌 (거기서 보냈는지는 우리가 알 수 없다) */
  function markSent(id, kind, to, how) {
    var p = get(id);
    if (!p) return null;
    if (!p.sent) p.sent = { proposal: null, report: null };
    p.sent[kind] = { at: Date.now(), to: to || '', how: how || 'draft' };
    /* 제안을 넘겼으면 '제안 제출', 결과를 넘겼으면 '완료' 로 옮긴다 */
    if (kind === 'proposal' && (p.stage === '제안준비')) p.stage = '제안제출';
    if (kind === 'report' && (p.stage === '결과보고' || p.stage === '운영중')) p.stage = '완료';
    update(id, {});
    return p.sent[kind];
  }
  function sentOf(p, kind) { return (p && p.sent && p.sent[kind]) || null; }

  /* ── 팔로우업 ─────────────────────────────────────── */
  /* 제안을 보내 놓고 잊는 것이 가장 흔한 실수다. 다시 연락할 날을 여기 적어 둔다. */

  function setFollowUp(id, fu) {
    var p = get(id);
    if (!p) return null;
    p.followUp = fu ? { date: fu.date, kind: fu.kind || '연락', note: fu.note || '', doneAt: null } : null;
    if (fu && fu.kind === '브리핑' && p.stage === '제안제출') p.stage = '브리핑';
    update(id, {});
    return p.followUp;
  }
  function doneFollowUp(id) {
    var p = get(id);
    if (!p || !p.followUp) return;
    p.followUp.doneAt = Date.now();
    update(id, {});
  }
  /* 살아 있는(아직 안 한) 팔로우업 */
  function followUpOf(p) {
    var f = p && p.followUp;
    if (!f || f.doneAt || !f.date) return null;
    return f;
  }
  /* 오늘까지 해야 할 연락 — 지난 것이 먼저 */
  function dueFollowUps() {
    return S.projects.filter(function (p) {
      var f = followUpOf(p);
      return f && daysTo(f.date) <= 0 && p.stage !== '무산' && p.stage !== '완료';
    }).sort(function (a, b) { return a.followUp.date < b.followUp.date ? -1 : 1; });
  }
  /* 곧 다가오는 것까지 (7일 안) */
  function soonFollowUps(days) {
    var n = days === undefined ? 7 : days;
    return S.projects.filter(function (p) {
      var f = followUpOf(p);
      if (!f || p.stage === '무산' || p.stage === '완료') return false;
      var d = daysTo(f.date);
      return d > 0 && d <= n;
    }).sort(function (a, b) { return a.followUp.date < b.followUp.date ? -1 : 1; });
  }

  var LATER = { '수주': 1, '운영중': 1, '결과보고': 1, '완료': 1 };
  var AFTER_SEND = { '제안제출': 1, '브리핑': 1 };

  /* 이 프로젝트가 워크플로우에서 어디까지 왔는지.
     문서가 있느냐가 아니라 **일이 어디까지 갔느냐**를 본다. */
  function progress(p) {
    var steps = buildSteps(p);
    /* 할 일이 여럿이어도 '지금 할 것'은 하나다. 첫 번째만 짚어 준다. */
    var first = true;
    steps.forEach(function (s) {
      if (s.todo && first) { s.now = true; first = false; }
    });
    return steps;
  }

  function buildSteps(p) {
    var prop = g.PropStore && p.proposalId ? g.PropStore.get(p.proposalId) : null;
    var rep = g.RepStore && p.reportId ? g.RepStore.get(p.reportId) : null;
    var sp = sentOf(p, 'proposal'), sr = sentOf(p, 'report');
    var fu = followUpOf(p);
    var won = !!LATER[p.stage];
    var ran = p.stage === '운영중' || p.stage === '결과보고' || p.stage === '완료';
    var pgap = prop && g.PropStore ? g.PropStore.gaps(prop).length : 0;
    var rgap = rep && g.RepStore ? g.RepStore.gaps(rep, p).length : 0;

    return [
      { id: 'proposal', label: '제안서', short: '제안', go: 'proposal', done: !!prop,
        sub: prop ? (pgap ? '빈칸 ' + pgap + '군데' : '작성 완료') : '아직 만들지 않음',
        /* 이미 보냈으면 빈칸이 남아 있어도 '지금 할 일'은 아니다 */
        todo: sp ? '' : (prop ? (pgap ? '제안서 빈칸을 채우세요' : '') : '제안서를 만드세요') },
      { id: 'send', label: '제안 발송', short: '발송', go: 'proposal', done: !!sp,
        sub: sp ? sentLabel(sp) : '아직 보내지 않음',
        todo: !sp && prop ? '담당자에게 메일로 보내세요' : '' },
      { id: 'won', label: '수주', short: '수주', done: won, followUp: fu,
        sub: won ? '수주함'
           : p.stage === '무산' ? '무산'
           : fu ? fu.kind + ' ' + dateLabel(fu.date)
           : sp ? '회신 대기' : '—',
        todo: waitTodo(p, sp, won, fu) },
      { id: 'run', label: '운영', short: '운영', done: ran,
        sub: ran ? (p.ops.period || '진행') : '교육 전',
        todo: won && !ran ? '교육이 시작되면 단계를 바꿔 주세요' : '' },
      { id: 'report', label: '결과보고서', short: '보고', go: 'report', done: !!rep,
        sub: rep ? (rgap ? '빈칸 ' + rgap + '군데' : '작성 완료') : '아직 만들지 않음',
        todo: sr ? '' : (ran && (!rep || rgap) ? (rep ? '결과보고서 빈칸을 채우세요' : '결과보고서를 만드세요') : '') },
      { id: 'deliver', label: '결과 전달', short: '전달', go: 'report', done: !!sr,
        sub: sr ? sentLabel(sr) : '아직 보내지 않음',
        todo: rep && !rgap && !sr ? '고객사에 결과를 보내세요' : '' }
    ];
  }

  /* 보낸 뒤 회신을 기다리는 동안 무엇을 할지 */
  function waitTodo(p, sp, won, fu) {
    if (!sp || won || p.stage === '무산') return '';
    if (!fu) return '다시 연락할 날을 잡아 두세요';
    var d = daysTo(fu.date);
    if (d > 0) return '';                                   /* 아직 기다릴 때 */
    if (fu.kind === '브리핑') {
      return d === 0 ? '오늘 브리핑입니다' : '브리핑 날짜가 지났습니다 — 결과를 기록하세요';
    }
    return d === 0 ? '오늘 연락할 날입니다' : '연락할 날이 ' + (-d) + '일 지났습니다';
  }

  function sentLabel(s) {
    var d = new Date(s.at);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' · ' +
      (s.how === 'sent' ? '발송' : '아웃룩으로 넘김');
  }

  /* 지금 당장 할 일 한 가지 */
  function nextStep(p) {
    var steps = progress(p);
    for (var i = 0; i < steps.length; i++) if (steps[i].todo) return steps[i];
    return null;
  }

  function stageOf(id) {
    return STAGES.filter(function (s) { return s.id === id; })[0] || STAGES[0];
  }
  function counts() {
    var out = {};
    STAGES.forEach(function (s) { out[s.id] = 0; });
    S.projects.forEach(function (p) { if (out[p.stage] !== undefined) out[p.stage]++; });
    out['전체'] = S.projects.length;
    out['진행중'] = S.projects.filter(function (p) { return LIVE.indexOf(p.stage) !== -1; }).length;
    return out;
  }

  g.Projects = {
    STAGES: STAGES, LIVE: LIVE,
    load: load, save: save, state: state, list: list, onChange: onChange, emit: emit, uid: uid,
    create: create, get: get, active: active, setActive: setActive, update: update, remove: remove,
    name: name, byProposal: byProposal, byReport: byReport,
    advance: advance, progress: progress, stageOf: stageOf, counts: counts,
    markSent: markSent, sentOf: sentOf, nextStep: nextStep, docsOf: docsOf,
    setFollowUp: setFollowUp, doneFollowUp: doneFollowUp, followUpOf: followUpOf,
    dueFollowUps: dueFollowUps, soonFollowUps: soonFollowUps,
    today: today, plusDays: plusDays, daysTo: daysTo, dateLabel: dateLabel,
    /* 영수증 도구가 "지금 어느 프로젝트 것인지" 물어볼 때 쓴다 */
    activeId: function () { return S.activeId; }
  };
})(window);
