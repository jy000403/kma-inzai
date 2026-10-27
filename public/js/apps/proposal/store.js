/* store.js — 제안서 데이터 · 템플릿 · 커리큘럼 · 예산서 · 개요서 생성
 *
 * 골격은 노션 「KMA 인재개발센터 2팀 매출 전략」의 '제안서 수주율 높이는 법'을 따른다.
 *   "귀사 팀장급의 이런 문제를 → 이 방식으로 → 이런 변화를 만들겠습니다"
 *   · 고객사 상황을 제안서 첫 페이지에 반영할 것
 *
 * 예산서는 PMS 등록 기준에 맞춘다. 원가 계정은 증빙 도구와 같은 원가 구분 표를 쓴다.
 */
(function (g) {
  'use strict';

  var KEY = g.Scope.key('kma-proposal:v1');

  var INDUSTRIES = ['금융', '제조', '유통·물류', '건설', 'IT·통신', '공공·공기업', '서비스', '의료·제약', '교육', '기타'];
  var SIZES = ['~100명', '100~300명', '300~1,000명', '1,000~3,000명', '3,000명 이상'];
  var STATUSES = ['작성중', '발송', '브리핑', '수주', '실패', '보류'];

  /* 예산 항목 기본 틀 — 계정은 증빙 도구(원가 구분 표)와 같다 */
  /* 교육은 시간 단위로 값을 매긴다. 강사료가 대표적이다 — 시간당 단가 × 교육시간 × 차수.
     회사 견적 양식도 "450,000 × 4 H × 1 차수" 로 적힌다.
     교육시간은 커리큘럼 모듈의 시간을 더해 저절로 잡힌다. */
  /* 견적서는 교육비와 운영비로 나눠 적는다. 고객이 그렇게 읽고, 회사 양식도 그 구분으로 병합돼 있다.
     교육비 = 강의 자체의 값(시간당 강사료), 운영비 = 교재·장소·인력 등 굴리는 데 드는 값. */
  var GROUPS = ['교육비', '운영비'];

  var COST_PRESET = [
    { group: '교육비', account: '원)비상임강사료', name: '강사료', basis: 'hours', unit: 'H' },
    { group: '교육비', account: '원)컨설턴트급여(용역비)', name: '상임강사료', basis: 'hours', unit: 'H' },
    { group: '운영비', account: '원)교재비', name: '교재', basis: 'head', unit: '명' },
    { group: '운영비', account: '원)교육생숙식비', name: '식대·다과', basis: 'headday', unit: '명·일' },
    { group: '운영비', account: '원)임차료', name: '장소 대관', basis: 'days', unit: '일' },
    { group: '운영비', account: '원)교육물품', name: '운영물품', basis: 'fixed', unit: '식' },
    { group: '운영비', account: '원)기타교육진행비', name: '진행 제반비', basis: 'fixed', unit: '식' },
    { group: '운영비', account: '원)운영자강사진행비', name: '운영 인력', basis: 'days', unit: '일' },
    { group: '운영비', account: '원)여비교통비', name: '이동비', basis: 'fixed', unit: '식' },
    { group: '운영비', account: '원)지급수수료', name: '차량·외부 수수료', basis: 'fixed', unit: '식' }
  ];
  var BASIS_LABEL = {
    hours: '교육시간 × 차수', days: '일수 × 차수', head: '인원 × 차수',
    headday: '인원 × 일수 × 차수', fixed: '직접 입력'
  };

  /* 슬라이드에 무엇을 채울지 — 템플릿을 만들 때 고르는 항목 */
  var SOURCES = [
    { id: 'cover', label: '표지 (고객사·제목·날짜)' },
    { id: 'situation', label: '귀사의 상황' },
    { id: 'problem', label: '지금 풀어야 할 문제' },
    { id: 'direction', label: '제안 방향' },
    { id: 'modules', label: '과정 설계 (모듈)' },
    /* 양식의 'Program Details' 장 — 한 장에 모듈 두 개씩, 모듈 수만큼 장이 늘어난다 */
    { id: 'detail', label: '모듈 상세 (Program Details · 장이 모듈 수만큼 늘어남)' },
    { id: 'curriculum', label: '커리큘럼 원문 (업로드 파일)' },
    { id: 'ops', label: '운영 방식 (인원·차수·일정)' },
    { id: 'outcome', label: '이렇게 달라집니다' },
    { id: 'teachers', label: '추천 교수 (고른 교수만, 한 장에 한 명)' },
    { id: 'budget', label: '견적 · 예산' },
    { id: 'next', label: '다음 단계' },
    { id: 'free', label: '고정 문구 (직접 입력)' }
  ];

  /* 양식을 아직 안 올렸을 때 쓰는 최소 구성. 필요한 장만 담았다.
     실제로는 '템플릿' 탭에 회사 PPT 양식을 올려 쓰는 것이 기본이다. */
  var DEFAULT_TEMPLATE = {
    id: 't_default', name: '기본 구성 (양식 없이 만들 때)', builtin: true, kind: 'outline', v: 2,
    desc: 'PPT 양식을 올리지 않았을 때 쓰는 간단한 구성',
    slides: [
      { title: '표지', src: 'cover' },
      { title: '과정 개요', src: 'ops' },
      { title: '과정 설계', src: 'modules' },
      { title: '세부 커리큘럼', src: 'curriculum', note: '올린 커리큘럼 원문' },
      { title: '견적', src: 'budget' },
      { title: '다음 단계', src: 'next' }
    ]
  };

  /* 교수 명단은 제안서마다 다시 적을 것이 아니라 한 번 모아 두고 골라 쓰는 것이다.
     양식에 남아 있던 예전 건의 교수 프로필을 그대로 내보내는 일을 막으려면 이게 있어야 한다. */
  var TEACHER_FIELDS = [
    { key: 'name', label: '성명' },
    { key: 'edu', label: '학력' },
    { key: 'career', label: '경력' },
    { key: 'field', label: '강의분야' },
    { key: 'books', label: '저서' },
    { key: 'record', label: '강의실적' }
  ];

  /* me = 제안서 맨 뒤 연락처 장에 들어갈 내 정보.
     양식이 '인재개발센터 [성명] [직함] / Tel: 02-3274-[연락처 뒷번호]' 로 비워 둔 자리다.
     한 번 적어 두면 제안서마다 다시 안 물어본다. */
  var S = { proposals: [], templates: [], teachers: [], activeId: null, me: {} };
  var listeners = [];

  function uid(p) { return (p || 'x') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6); }
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  var didLoad = false;
  function load() {
    /* 다른 도구(프로젝트·결과보고서)도 이 저장소를 읽는다. 두 번 읽어 덮어쓰지 않게 막는다. */
    if (didLoad) return S;
    didLoad = true;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (Array.isArray(d.proposals)) S.proposals = d.proposals;
        if (Array.isArray(d.templates)) S.templates = d.templates;
        if (Array.isArray(d.teachers)) S.teachers = d.teachers;
        if (d.me && typeof d.me === 'object') S.me = d.me;
        S.activeId = d.activeId || null;
      }
    } catch (e) {}
    /* 기본 골격('기본 구성 (양식 없이 만들 때)')은 더 이상 깔지 않는다.
       회사가 쓰는 PPT 양식을 올려 두고 쓰는 것이 실제 운영 방식이고,
       그 옆에 회사 디자인이 없는 기본 장표가 같이 서 있으면 잘못 고르게 된다.
       예전에 깔린 것이 남아 있으면 치운다. */
    var had = S.templates.length;
    S.templates = S.templates.filter(function (t) { return t.id !== 't_default'; });
    if (S.templates.length !== had) save();
    S.templates.forEach(function (t) { if (!t.kind) t.kind = 'outline'; });

    /* 강사료는 어느 과정에나 들어간다. 예산이 비어 있는 건은 그 한 줄을 깔아 둔다.
       blank() 만 고치면 이미 만들어 둔 제안서에는 끝내 안 생긴다.
       부가세도 여기서 끈다 — 교육비는 면세인데 예전 건에 켜진 채로 남아 있다. */
    S.proposals.forEach(function (p) {
      if (!p.budget) return;
      p.budget.vat = false;
      if (!(p.budget.items || []).length) {
        p.budget.items = [Object.assign({ id: uid('c'), qty: 1, price: 0, note: '' }, COST_PRESET[0])];
      }
    });
    return S;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { if (g.UI) g.UI.toast('저장 공간이 부족합니다. 백업 후 정리해 주세요', 'err'); }
    syncTemplates();
  }

  /* ── 양식 설정을 보관소에도 ───────────────────────────
     양식 PPT 는 보관소에 있는데 '장마다 무엇을 채울지' 는 이 브라우저에만 있었다.
     다른 PC 에서는 되살린 뒤 장마다 다시 골라야 했다. 바뀔 때마다 보관소에도 적어 둔다.
     pinned(모든 PC 기본 양식)는 어느 브라우저에서 열어도 저절로 목록에 들어간다.
     보관소에서 먼저 받아 온 뒤에만 올린다 — 오래된 PC 가 먼저 올려 최신 설정을 덮지 않게. */
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
          body: JSON.stringify({ templateId: t.fileId, kind: 'proposal', name: t.name,
                                 pinned: !!t.pinned, settings: tplPayload(t) })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (!d || !d.ok) { delete synced[t.fileId]; return; }
          t._syncedAt = d.settingsAt;
          try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
        }).catch(function () { delete synced[t.fileId]; });
      });
    }, now ? 0 : 1500);
  }
  /* 보관소의 '모든 PC 기본 양식' 을 받아 목록에 넣는다(없으면 더하고, 보관소가 새것이면 갈아 끼운다) */
  function pullShared() {
    if (typeof fetch !== 'function') return Promise.resolve(0);
    return fetch('/api/ppt/stored?kind=proposal').then(function (r) { return r.json(); }).then(function (d) {
      var n = 0;
      (d.templates || []).forEach(function (row) {
        var local = S.templates.filter(function (t) { return t.fileId === row.id; })[0];
        /* 보관소가 '기본 해제' 라고 해도, 이 브라우저가 그 뒤에 기본으로 정했으면(아직 못 올렸으면) 지킨다 */
        if (local && !row.pinned && local.pinned && (local._syncedAt || '') < (row.settingsAt || '')) local.pinned = false;
        /* 모든 PC 기본 양식이거나 **이 계정이 올린 양식**이면 설정째 목록에 넣는다 —
           같은 아이디로 다른 PC 에서 들어와도 내 양식이 그대로 있게 */
        if (!(row.pinned || row.mine) || !row.settings) return;
        var remote = row.settings;
        if (!local) {
          local = Object.assign({}, remote, { fileId: row.id, pinned: !!row.pinned, kind: 'pptx' });
          if (!local.id || S.templates.some(function (t) { return t.id === local.id; })) local.id = uid('tp');
          S.templates.push(local);
          n++;
        } else if ((row.settingsAt || '') > (local._syncedAt || '')) {
          var keep = local.id;
          Object.keys(local).forEach(function (k) { delete local[k]; });
          Object.assign(local, remote, { id: keep, fileId: row.id, pinned: !!row.pinned, kind: 'pptx' });
          n++;
        }
        local._syncedAt = row.settingsAt || local._syncedAt;
        delete local._labels; delete local._sample;
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
  /* 되살리기 — 보관소에 설정이 있으면 그대로 가져온다(장마다 다시 고를 필요가 없다) */
  function restoreFromSettings(st) {
    var t = Object.assign({}, st, { kind: 'pptx' });
    if (!t.id || S.templates.some(function (x) { return x.id === t.id; })) t.id = uid('tp');
    delete t._labels; delete t._sample;
    S.templates.push(t);
    synced[t.fileId] = JSON.stringify(tplPayload(t));
    save(); emit();
    return t;
  }
  function state() { return S; }

  /* 연락처 장에 들어갈 내 정보 */
  function me() { return S.me || {}; }
  /* 문서에 박히는 소속. 적어 두지 않았으면 우리 부서로 둔다 —
     다른 부서가 쓸 때는 「내 정보」에서 제 소속으로 바꾸면 된다. */
  function myTeam() { return String((S.me && S.me.team) || '').trim() || 'KMA 인재개발센터'; }
  /* 글자를 칠 때마다 부르므로 emit 하지 않는다 — 다시 그리면 커서가 튄다 */
  function setMe(patch) {
    S.me = Object.assign({}, S.me, patch || {});
    save();
    return S.me;
  }

  /* ── 템플릿 ───────────────────────────────────────── */

  function templates() { return S.templates; }
  /* 기본 골격을 없앴으므로 양식이 하나도 없는 때가 생긴다.
     그때 undefined 를 돌려주면 여기저기서 터지므로 빈 껍데기를 준다. */
  var NO_TEMPLATE = { id: '', name: '양식을 올려 주세요', kind: 'outline', slides: [] };

  function template(id) {
    return S.templates.filter(function (t) { return t.id === id; })[0] ||
           S.templates[0] || NO_TEMPLATE;
  }
  function addTemplate(t) {
    t.id = uid('tp');
    t.slides = t.slides || [];
    S.templates.push(t);
    save(); emit();
    return t;
  }
  function updateTemplate(id, patch) {
    var t = template(id);
    if (!t) return;
    Object.assign(t, patch);
    save(); emit();
  }
  function removeTemplate(id) {
    /* 모든 PC 기본 양식은 목록에서 지우지 않는다 — 먼저 '기본 해제' 를 해야 한다 */
    S.templates = S.templates.filter(function (t) { return t.id !== id || t.builtin || t.pinned; });
    save(); emit();
  }

  /* 제안서 양식 PPTX 를 올리면 슬라이드 제목으로 템플릿 골격을 만든다 */
  function templateFromSlides(name, slides) {
    return addTemplate({
      name: name, kind: 'outline', desc: 'PPTX 양식에서 읽어 온 ' + slides.length + '장 골격',
      slides: slides.map(function (s) {
        return { title: s.title || ('슬라이드 ' + s.no), src: guessSource(s.title, s), bullets: '' };
      })
    });
  }

  /* relay 가 파워포인트로 읽어 온 양식 — 썸네일이 있고, 만들 때 그 파일을 그대로 쓴다.
     처음에는 전부 '그대로 두기'로 두고, 제목을 보고 짐작되는 장만 미리 골라 둔다. */
  /* 양식은 대개 예전 제안서를 그대로 쓴 것이라 고객사 이름이 곳곳에 박혀 있다.
     표지 제목에서 회사 이름처럼 보이는 말을 집어 미리 채워 둔다. 틀리면 화면에서 고친다. */
  /* 대괄호 안이 고객사 이름처럼 보여도 자리표시자면 손대면 안 된다.
     회사 표준 양식의 머리말은 『 [연도] [기업명] [프로그램명] 』 인데,
     여기서 '연도' 를 예전 고객사로 집어 '한라시멘트' 로 바꿔 버렸다.
     그러면 '[연도]' 가 '[한라시멘트]' 가 되어 진짜 연도 치환이 안 먹고
     머리말이 『 [한라시멘트] 한라시멘트 … 』 로 나갔다. */
  var PH_WORD = /^(연도|기업명|프로그램명|과정명|교육명|성명|직함|연락처|이메일|내용|상세|키워드|시간|모듈명|학습목표|소속|대상|장소|비고|단가|수량|소계|합계|항목)/;

  function guessOldClient(res) {
    var first = ((res.slides || [])[0] || {});
    var text = [first.title].concat(first.texts || []).join(' ');
    var m = /([가-힣A-Za-z0-9]{2,20}(?:전자|산업|물산|화학|제약|식품|은행|카드|증권|건설|통신|시스템|테크|랩스|네트웍스|네트웍|솔루션|코리아|그룹|공사|공단|재단|협회))/.exec(text);
    if (m) return m[1];
    m = /\(주\)\s*([가-힣A-Za-z0-9]{2,20})/.exec(text);
    if (m) return m[1];
    /* 대괄호는 마지막 수단이고, 자리표시자 이름이면 쓰지 않는다 */
    var re = /\[([가-힣A-Za-z0-9]{2,20})\]/g, hit;
    while ((hit = re.exec(text))) {
      if (!PH_WORD.test(hit[1])) return hit[1];
    }
    return '';
  }

  function templateFromPptx(res) {
    var t = {
      /* 이 양식에 남아 있는 예전 건의 이름 — 만들 때 이번 건으로 바꿔 끼운다 */
      swap: { company: guessOldClient(res), course: '', extra: [] },
      name: res.name || '양식', kind: 'pptx', fileId: res.id, dir: res.dir,
      desc: res.count + '장 · ' + Math.round((res.width || 960) / (res.height || 540) * 10) / 10 + ':1 양식',
      slides: (res.slides || []).map(function (s, i) {
        var guess = i === 0 ? 'cover' : guessSource(s.title, s);
        return {
          no: s.no, thumb: s.thumb, full: s.full || s.thumb, title: s.title || ('슬라이드 ' + s.no),
          /* 양식에 원래 들어 있던 글의 분량과 표 구조.
             '기존 글만큼' 채워 넣으려면 이 명세가 있어야 한다. */
          slots: s.slots || [], tables: s.tables || [], picSlots: s.pics || 0,
          texts: (s.texts || []).slice(0, 4),
          /* 무엇을 채울지 못 알아본 장은 '빼기'가 기본이다.
             그대로 두면 예전 고객사의 견적·사례·교수 프로필이 새 제안서에 그대로 실려 나간다.
             남겨야 할 장은 회사 소개·간지처럼 건마다 안 바뀌는 것뿐이고, 그건 위에서 따로 잡는다. */
          src: (i === 0 || guess !== 'free') ? guess : 'skip',
          bullets: ''
        };
      })
    };
    return addTemplate(t);
  }

  /* 이미 올려 둔 양식에 고친 판정 규칙을 다시 대 본다.
     규칙이 바뀌었는데 되살리려면 42MB 파일을 다시 올려야 한다면 아무도 안 한다.
     사람이 직접 골라 둔 장(picked)은 건드리지 않는다. */
  /* force 를 주면 직접 고른 장까지 처음 판정으로 되돌린다.
     '양식 그대로 두기' 로 잘못 눌러 둔 장은 규칙을 고쳐도 영영 안 바뀌어서,
     '왜 반영이 안 되지' 하고 한참 헤매게 된다. 되돌릴 길이 있어야 한다. */
  function reguess(id, force) {
    var t = template(id);
    if (!t || !t.slides) return 0;
    var n = 0;
    t.slides.forEach(function (s, i) {
      if (s.picked && !force) return;
      if (force) s.picked = false;
      var was = s.src;
      var guess = i === 0 ? 'cover' : guessSource(s.title, s);
      s.src = (i === 0 || guess !== 'free') ? guess : 'skip';
      if (s.src !== was) n++;
    });
    if (n) { save(); emit(); }
    return n;
  }

  /* ── 회사 표준 양식이 스스로 적어 둔 명세 ──────────────
     인재개발센터 표준 양식은 칸마다 '[모듈명]', '[시간]H',
     '교육대상 : [대상 내용]' 처럼 대괄호를 끼워 두었다.
     곧 양식이 '여기에 무엇을 넣으라'고 적어 둔 것이다.
     위치를 눈대중으로 짐작하지 말고 이걸 읽어 채운다 — 그래야
     'M1. ' · 'H' · '교육대상 : ' 같은 뼈대가 살아남는다.

     양식 뒤에는 '이렇게 쓰라'는 샘플 장이 붙어 있다(모서리에 sample 표시).
     샘플에는 남의 고객사 이야기가 그대로 들어 있어 반드시 빼야 한다. */
  /* 자리표시자 안에 줄바꿈이 있는 양식도 있다 —
     '[기업 활동 정의 1,⏎기업 방향에 대한 내용⏎총 3줄]'. 줄바꿈을 막아 두었더니
     자리표시자로 못 알아봐 대괄호째 고객에게 나갔다. */
  var PH_RE = /\[[^\[\]]{1,80}\]/g;

  /* 장마다 되풀이되는 것 — 어느 장인지 가려낼 단서가 못 된다.
     머리말 『 [연도] [기업명] [프로그램명] 』 은 2장부터 17장까지 다 있다. */
  var PH_EVERY = /연도|기업명|프로그램명|성명|직함|연락처|이메일|과정명|교육명/;

  function slotTexts(s) {
    return ((s && s.slots) || []).map(function (x) { return String((x && x.text) || ''); });
  }
  /* 이 장에 남아 있는 자리표시자. 머리말처럼 어느 장에나 있는 것은 뺀다. */
  function phOf(s, all) {
    var out = [];
    slotTexts(s).forEach(function (t) {
      (t.match(PH_RE) || []).forEach(function (m) {
        if (all || !PH_EVERY.test(m)) out.push(m);
      });
    });
    return out;
  }
  /* 모서리에 'sample' 이라고 적어 둔 장 — 양식 저자가 '이건 예시'라고 표시한 것이다 */
  function isSample(s) {
    return slotTexts(s).some(function (t) { return /^\s*sample\s*$/i.test(t); });
  }

  /* 대괄호가 다 '채울 자리' 는 아니다.
     '[강의 분야]', '[주요 경력]', '[유사 프로젝트]' 는 이 양식이 쓰는 **이름표**다 —
     다 채운 샘플 장에도 대괄호째로 그대로 남아 있다.
     그러니 샘플 장에 살아남은 대괄호는 이름표로 보고 손대지 않는다.
     양식이 스스로 가르쳐 주는 셈이다. */
  /* 빈 양식의 칸 크기는 '얼마나 쓸 수 있는가' 를 말해 주지 않는다.
     빈 양식의 '[경력 내용 5~7개]' 상자는 한 줄 높이(21pt)로 접혀 있지만,
     다 채운 샘플 장의 같은 상자는 120pt 에 379자가 들어 있다.
     도형 이름이 빈 양식과 샘플에서 같으므로(Rectangle 44 ↔ Rectangle 44),
     샘플 쪽 상자를 찾아 그 크기를 자리로 잡는다. 양식이 스스로 가르쳐 준다. */
  function sampleSlots(t) {
    if (t && t._sample) return t._sample;
    var out = {};
    (t && t.slides || []).forEach(function (s) {
      if (s.src !== 'skip' || !isSample(s)) return;
      (s.slots || []).forEach(function (x) {
        if (!x || !x.name) return;
        var prev = out[x.name];
        var area = (Number(x.width) || 0) * (Number(x.height) || 0);
        if (prev && (Number(prev.width) || 0) * (Number(prev.height) || 0) >= area) return;
        out[x.name] = x;
      });
    });
    if (t) t._sample = out;
    return out;
  }

  /* 빈 양식 칸과 샘플 칸 가운데 넉넉한 쪽을 자리로 본다 */
  function bigRoom(slot, big) {
    var a = roomOf(slot);
    var b = roomOf(big && big[slot && slot.name]);
    if (!a) return b;
    if (!b) return a;
    return (a.perLine * a.rows >= b.perLine * b.rows) ? a : b;
  }
  function bigCap(slot, big) {
    var r = bigRoom(slot, big);
    var mine = capOf(slot);
    if (!r) return mine;
    return Math.max(mine, Math.floor(r.perLine * r.rows * 0.5),
      Number((big && big[slot && slot.name] || {}).chars) || 0);
  }

  function labelSet(t) {
    if (t && t._labels) return t._labels;
    var set = {};
    (t && t.slides || []).forEach(function (s) {
      if (s.src !== 'skip' || !isSample(s)) return;
      phOf(s, true).forEach(function (m) { set[m] = true; });
    });
    if (t) t._labels = set;
    return set;
  }

  /* 자리표시자 이름만 보고 어느 장인지 가린다.
     양식이 쓰는 말이 곧 이름표라, 제목을 눈대중하는 것보다 정확하다.
     차례가 중요하다 — '[강의 분야 키워드 5~7개]' 가 '키워드' 규칙에 먼저
     걸리면 교수 소개 장이 과정 개요로 넘어간다. */
  function phSource(ph) {
    var t = ph.join(' ');
    if (/모듈명/.test(t) && /시간/.test(t)) return 'detail';
    if (/강의\s*분야|경력\s*내용|소속/.test(t)) return 'teachers';
    if (/PEST/i.test(t)) return 'situation';
    if (/긍정적\s*표현/.test(t)) return 'cover';
    if (/만족도|설문/.test(t)) return 'outcome';
    if (/대상\s*내용|장소\s*내용|시간\s*내용|키워드\s*\d\]/.test(t)) return 'ops';
    if (/일정|구성/.test(t)) return 'curriculum';
    if (/역량/.test(t)) return 'modules';
    if (/설계\s*방향|방향성/.test(t)) return 'direction';
    return '';
  }

  function guessSource(title, s) {
    var t = String(title || '').trim();

    /* ⓪ 양식 저자가 붙여 둔 표시를 먼저 읽는다.
       'sample' 장은 남의 고객사 제안서 그대로다 — 무조건 뺀다. */
    if (isSample(s)) return 'skip';

    /* 긴 문장은 장 제목이 아니라 **본문**이다.
       '…기술 변화와 정렬된 성장 구조…' 처럼 한 문장 안에 '변화' 가 들어 있다고
       기대효과 장으로 읽으면, 남의 사례가 채울 칸으로 올라온다.
       양식이 안내하려고 넣어 둔 [대괄호] 자리표시자는 길어도 진짜 제목이다. */
    /* ① 협회 소개 — 제안 건마다 바뀌지 않는 뒷부분.
       손대지 않고 그대로 내보낸다(keep). 이 판정이 맨 앞에 와야 한다 —
       이 장들은 제목이 '64년 간 다양한 산업을 대상으로…' 같은 긴 문장이라,
       아래 '긴 문장은 free' 규칙에 먼저 걸리면 통째로 빠져 버린다.
       실제로 17장짜리 양식에서 협회 소개 7장이 그렇게 사라졌다. */
    if (/별첨|부록|appendix/i.test(t)) return 'keep';
    if (/(KMA|회사|기관|협회|조직|능률협회)\s*소개/i.test(t)) return 'keep';
    if (/한국능률협회|능률협회/.test(t)) return 'keep';
    if (/\d{4}년\s*설립|설립\s*이후|연혁/.test(t)) return 'keep';
    /* '64년 간 …', '64년간 …' — 뒤에 띄어쓰기가 오든 말든 잡는다 */
    if (/\d+\s*년\s*간\s|\d+\s*년간\s/.test(t)) return 'keep';
    if (/수상|인증|사업영역|조직\s*편재|계열사|주요\s*고객/.test(t)) return 'keep';
    /* 협회가 무엇을 해 온 곳인지 늘어놓는 장 — 건마다 안 바뀐다 */
    if (/(민간기업|공공부문|지식서비스|경영혁신|컨설팅\s*프로젝트)/.test(t)) return 'keep';
    if (/Tel\s*[:：]|연락처|담당자\s*[:：]/i.test(t)) return 'keep';
    if (/^INDEX$|^목차$|^CONTENTS$/i.test(t)) return 'keep';
    if (/^PART\s*\d+\s*\.?$/i.test(t)) return 'keep';

    /* ①-b 양식이 대괄호로 '여기 채우라'고 적어 둔 장.
       제목만 보면 2장(PEST)·5장(과정 개요)·8장(설문 설계)이 죄다 '방향' 으로
       읽혀 한 칸으로 몰린다. 양식이 쓴 말을 그대로 읽는 편이 정확하다. */
    var ph = phOf(s);
    if (ph.length) {
      var byPh = phSource(ph);
      if (byPh) return byPh;
    }

    /* ② 긴 문장에 섞여 있어도 확실한 것들 — 여기서 먼저 집는다 */
    if (/program\s*details?/i.test(t)) return 'curriculum';
    if (/강사\s*(전문성|프로필|소개)|교수진|강사진/.test(t)) return 'teachers';
    if (/운영\s*비용|교육\s*비용|비용은|견적/.test(t)) return 'budget';

    var bracketed = /^\s*[\[(]/.test(t);
    if (!bracketed && (t.length > 30 || /[.!?]\s*$|습니다|합니다|입니다/.test(t))) {
      return 'free';
    }
    if (/교수|강사/.test(t)) return 'teachers';
    if (/표지|제안서$/.test(t)) return 'cover';
    if (/상황|배경|현황/.test(t)) return 'situation';
    if (/문제|이슈|과제|필요성|니즈/.test(t)) return 'problem';
    if (/방향|접근|제안\s*개요/.test(t)) return 'direction';
    if (/커리큘럼|교과|시간표|일정표/.test(t)) return 'curriculum';
    if (/설계|모듈|구성/.test(t)) return 'modules';
    if (/운영|진행\s*방식/.test(t)) return 'ops';
    if (/효과|기대|변화|성과/.test(t)) return 'outcome';
    if (/견적|예산|비용|금액/.test(t)) return 'budget';
    if (/다음|향후|추진\s*일정|일정\s*협의|문의/.test(t)) return 'next';
    return 'free';
  }

  /* ── 제안서 ───────────────────────────────────────── */

  /* 올려 둔 양식이 곧 기본값이다.
     기본 골격을 없앴으니 새 제안서는 올려 둔 양식으로 시작하는 게 맞다.
     여러 개면 수주로 이어진 순(rankedTemplates)으로 맨 위를 쓴다 —
     ① 템플릿에서 언제든 바꿀 수 있다. */
  function defaultTemplateId() {
    if (!S.templates.length) return '';
    /* 모든 PC 기본 양식이 있으면 그것부터 */
    var pin = S.templates.filter(function (t) { return t.pinned; })[0];
    if (pin) return pin.id;
    try { return rankedTemplates().list[0].id; }
    catch (e) { return S.templates[0].id; }
  }

  function blank() {
    return {
      id: uid('pr'), title: '', status: '작성중',
      templateId: defaultTemplateId(),
      /* 양식이 하나뿐이거나 '모든 PC 기본' 으로 정해 둔 양식이 있으면 고른 것으로 친다 */
      templatePicked: S.templates.length === 1 || S.templates.some(function (t) { return t.pinned; }),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      client: { company: '', person: '', rank: '', dept: '', industry: '', size: '', vocId: '' },
      context: { inquiry: '', situation: '', problem: '' },
      approach: { direction: '', modules: [], method: '' },
      outcome: { changes: '' },
      /* hours = 총 교육시간. 커리큘럼을 올리면 모듈 시간을 더해 저절로 채워진다. */
      ops: { headcount: null, sessions: 1, days: 1, hours: null, place: '', period: '' },
      teacherIds: [],
      curriculum: null,          // { fileName, kind, lines, slides, attachmentId }
      /* 강사료는 어느 과정에나 들어간다. 빈 표에서 시작해 매번 더하게 하지 않는다.
         KMA 는 교육비에 부가세를 매기지 않는 면세기관이라 vat 는 늘 false 다. */
      budget: {
        items: [Object.assign({ id: uid('c'), qty: 1, price: 0, note: '' }, COST_PRESET[0])],
        price: null, vat: false, targetMargin: 25, note: ''
      }
    };
  }

  function create(patch) {
    var p = Object.assign(blank(), patch || {});
    if (!p.title) p.title = (p.client.company || '새 제안서') + ' 제안서';
    S.proposals.unshift(p);
    S.activeId = p.id;
    save(); emit();
    return p;
  }
  function get(id) {
    for (var i = 0; i < S.proposals.length; i++) if (S.proposals[i].id === id) return S.proposals[i];
    return null;
  }
  function active() { return get(S.activeId); }
  function setActive(id) { S.activeId = id; save(); emit(); }
  function update(id, patch) {
    var p = get(id);
    if (!p) return null;
    Object.keys(patch).forEach(function (k) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) {
        Object.assign(p[k], patch[k]);
      } else p[k] = patch[k];
    });
    p.updatedAt = new Date().toISOString();
    save(); emit();
    return p;
  }
  function remove(id) {
    S.proposals = S.proposals.filter(function (p) { return p.id !== id; });
    if (S.activeId === id) S.activeId = S.proposals.length ? S.proposals[0].id : null;
    save(); emit();
  }

  /* ── 교수 ─────────────────────────────────────────── */

  function teachers() { return S.teachers; }
  function teacherById(id) { return S.teachers.filter(function (x) { return x.id === id; })[0] || null; }
  function addTeacher(t) {
    /* rank = 직함('주임교수'), photo = 얼굴 사진 주소.
       둘 다 제안서의 교수 소개 장에 그대로 들어가는 자리다. */
    t = Object.assign({ id: uid('tc'), name: '', rank: '', edu: '', career: '',
                        field: '', books: '', record: '', photo: '' }, t || {});
    S.teachers.push(t); save(); emit();
    return t;
  }
  function updateTeacher(id, patch) {
    var t = teacherById(id);
    if (t) { Object.assign(t, patch); save(); emit(); }
  }
  function removeTeacher(id) {
    S.teachers = S.teachers.filter(function (x) { return x.id !== id; });
    S.proposals.forEach(function (p) {
      p.teacherIds = (p.teacherIds || []).filter(function (x) { return x !== id; });
    });
    save(); emit();
  }
  function pickedTeachers(p) {
    return (p.teacherIds || []).map(teacherById).filter(Boolean);
  }

  /* ── 예산서 ───────────────────────────────────────── */

  function qty(item, ops) {
    /* 손으로 적어 둔 값이 있으면 그것이 이긴다.
       자동 계산은 편하라고 있는 것이지 사람을 막으라고 있는 게 아니다.
       (강사가 둘이라 시간이 두 배인 경우처럼, 식으로 안 떨어지는 건이 늘 있다) */
    if (item.qtyFixed !== null && item.qtyFixed !== undefined && item.qtyFixed !== '') {
      return Number(item.qtyFixed) || 0;
    }
    var head = Number(ops.headcount) || 0, days = Number(ops.days) || 0, sess = Number(ops.sessions) || 1;
    var hrs = Number(ops.hours) || 0;
    switch (item.basis) {
      case 'hours': return round1(hrs * sess);
      case 'days': return days * sess;
      case 'head': return head * sess;
      case 'headday': return head * days * sess;
      default: return Number(item.qty) || 1;
    }
  }
  /* 2.5H + 3H 처럼 반 시간이 섞이므로 소수 한 자리까지 남긴다 */
  function round1(n) { return Math.round(n * 10) / 10; }

  /* 커리큘럼 모듈의 시간을 더한 값. 교육시간을 손으로 적을 일이 없게 한다. */
  function courseHours(p) {
    return round1((p.approach.modules || []).reduce(function (a, m) {
      return a + (Number(m.hours) || 0);
    }, 0));
  }
  function lineTotal(item, ops) { return qty(item, ops) * (Number(item.price) || 0); }

  /* ── 문의한 것과 제안한 것이 맞는지 ───────────────────
     지난 제안서에서 커리큘럼을 통째로 가져오면 내용은 금방 차지만,
     그게 이 문의에 맞는다는 뜻은 아니다. 실제로 5시간짜리 문의에
     16시간짜리 커리큘럼이 붙고, 고객이 말한 '변화관리' 는 한 줄도 없는 채로
     제안서가 완성돼 버렸다. 보내기 전에 이 네 가지를 맞대 본다.
     ①②는 커리큘럼이 없어도 본다 — 견적이 안 맞는 건 커리큘럼과 상관없는 일이다. */
  function misfits(p) {
    var out = [];
    var ops = p.ops || {};

    /* ① 커리큘럼 시간 vs 요청 시간 */
    var need = Number(ops.hours) || 0;
    var have = courseHours(p);
    if (need && have && Math.abs(have - need) > 0.5) {
      out.push({
        id: 'hours', bad: have > need * 1.5 || have < need * 0.6,
        text: '문의는 ' + need + '시간인데 커리큘럼은 ' + have + '시간입니다',
        why: have > need
          ? '이대로 보내면 ' + round1(have - need) + '시간을 덜어내야 합니다.'
          : round1(need - have) + '시간이 빕니다.',
        at: 'modules',
        /* 고칠 수 있는 어긋남이다 — 화면에서 '고치기' 단추를 단다 */
        fix: 'hours', want: need, now: have
      });
    }

    /* ② 견적표 줄 합계 vs 제안가.
       전에는 견적서(p.quote)를 따로 만든 건에서만 봤고, 그것도 커리큘럼이 있어야
       닿는 자리에 있었다. 그런데 견적서를 안 만들면 PPT 의 견적표는 예산 항목으로
       채워지고 합계 줄에는 제안가가 찍힌다 — 줄은 강사료 630만원 하나인데
       합계는 980만원이라고 적힌 종이가 그대로 나갔고, 경고는 뜨지 않았다.
       고객이 줄을 더해 보면 합계가 나와야 한다. 견적서가 있든 없든,
       커리큘럼이 있든 없든, '그 종이에 실제로 찍히는 줄' 을 더해 맞대 본다. */
    var qrows = quoteRows(p);
    var qsum = qrows.reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0);
    var price = Number(p.budget.price) || 0;
    var fromQuote = !!(p.quote && (p.quote.lines || []).length && g.QuoteStore);
    /* 합계 천단위 절사가 켜져 있으면(새 견적서는 기본으로 켜짐) 절사한 합계로 맞대 본다 */
    var cut = g.QuoteStore ? (fromQuote ? !!p.quote.roundDown : true) : false;
    if (cut) qsum = Math.floor(qsum / 1000) * 1000;
    if (qsum && price && Math.abs(qsum - price) >= 1) {
      out.push({
        id: 'price', bad: true,
        text: (fromQuote ? '견적서' : '견적 항목 ' + qrows.length + '줄') +
              ' 합계(' + money(qsum) + ')와 제안가(' + money(price) + ')가 다릅니다',
        why: '고객이 받는 견적표에서 줄을 더하면 합계가 나와야 하는데 ' +
             money(Math.abs(price - qsum)) + '이 설명되지 않습니다. ' +
             '고치기를 누르면 견적 단가를 제안가에 맞춥니다(줄마다 같은 비율).',
        at: 'budget',
        /* 이건 AI 가 할 일이 아니라 숫자를 맞추는 일이다 */
        fix: 'price', want: qsum, now: price
      });
    } else if (!qsum && price) {
      /* 항목이 하나도 없으면 견적표가 합계 한 줄만 있는 종이가 된다 */
      out.push({
        id: 'price', bad: true,
        text: '견적 항목이 비어 있는데 제안가(' + money(price) + ')만 적혀 있습니다',
        why: '견적표에 줄이 하나도 없이 합계만 나갑니다.',
        at: 'budget'
      });
    }

    /* ③ 고객이 말한 주제가 커리큘럼에 있는지.
       찾는 쪽(mine)에 제목을 넣으면 안 된다 — 제목에서 주제를 뽑아 놓고
       그 제목에서 다시 찾으니 언제나 '있다' 가 나왔다.
       실제로 제안하는 것, 즉 모듈·커리큘럼·제안 방향에서만 찾는다. */
    /* 제목에서 주제를 뽑을 때 고객사 이름은 빼야 한다.
       '롯데칠성 이 커리큘럼에 없습니다' 는 맞는 말이지만 아무 쓸모가 없다 —
       커리큘럼에 고객사 이름을 적을 일이 없다. */
    var co = words((p.client && p.client.company) || '');
    var said = (p.tags || []).slice();
    words(p.title).forEach(function (w) {
      if (co.indexOf(w) !== -1) return;
      /* '창업과', '주제로' 처럼 조사가 붙은 낱말은 떼고 본다 — 붙은 채로는 커리큘럼에서 못 찾는다 */
      if (w.length > 2) w = w.replace(/(으로|에서|과|와|을|를|로|에|의)$/, '');
      if (said.indexOf(w) === -1) said.push(w);
    });
    var mine = [(p.approach.modules || []).map(function (m) {
                  return m.title + ' ' + (m.detail || '');
                }).join(' '),
                ((p.curriculum && p.curriculum.lines) || []).join(' '),
                /* 커리큘럼을 새로 썼을 때 모델이 짚어 준 '다루는 주제' */
                ((p.curriculum && p.curriculum.covered) || []).join(' '),
                p.approach.direction].filter(Boolean).join(' ');
    if (!mine.trim()) return out;      /* 아직 커리큘럼이 없으면 따질 것이 없다 */
    /* 낱말을 통째로 맞대면 '팀장급' 과 '팀장', '리더십' 과 '리더' 가 다른 말이 된다.
       커리큘럼에 팀장 이야기가 가득한데 '팀장급이 없습니다' 라고 거짓 경고가 떴다.
       앞이 겹치면 같은 말로 본다. */
    var bag = words(mine).map(stem);
    /* 붙여 쓴 말은 그대로 찾으면 못 찾는다.
       '공정평가' 는 커리큘럼에 '공정성' 과 '평가 면담' 으로 다 들어 있는데도
       그 낱말이 통째로는 없어서 '빠졌다' 고 잘못 알렸다.
       네 글자가 넘으면 앞뒤로 갈라 보고, 둘 다 있으면 다룬 것으로 본다. */
    var flat = String(mine).replace(/\s+/g, '');
    function hit(w) {
      if (w.length < 2) return true;
      for (var i = 0; i < bag.length; i++) {
        var b = bag[i];
        if (b === w) return true;
        if (b.length >= 2 && (b.indexOf(w) === 0 || w.indexOf(b) === 0)) return true;
      }
      /* 띄어쓰기를 무시하고 한 번 더 — '성과 코칭' 과 '성과코칭' */
      return flat.indexOf(w) !== -1;
    }
    function covered(w) {
      if (hit(w)) return true;
      if (w.length < 4) return false;
      for (var cut = 2; cut <= w.length - 2; cut++) {
        if (hit(w.slice(0, cut)) && hit(w.slice(cut))) return true;
      }
      return false;
    }
    /* '과정' '교육' 처럼 어디에나 붙는 말은 주제가 아니다 */
    var PLAIN = { '과정': 1, '교육': 1, '프로그램': 1, '워크숍': 1, '특강': 1,
                  '대상': 1, '기본': 1, '심화': 1, '차수': 1,
                  /* 제목에 늘 붙는 말들. 이게 커리큘럼에 없다고 알릴 일이 아니다. */
                  '교육프로그램': 1, '기획': 1, '문의': 1, '도입': 1, '운영': 1,
                  '요청': 1, '검토': 1, '제안': 1, '진행': 1, '관련': 1,
                  /* 대상(직급)을 가리키는 말. 커리큘럼 본문에 그 말이 그대로
                     안 나오는 것이 정상이다 — 모듈 제목에는 '팀장' 이라고 쓰지
                     '직책자' 라고 쓰지 않는다. 대상이 맞는지는 운영 조건에서 따로 본다.
                     ('직책자가 커리큘럼에 없습니다' 라는 쓸모없는 경고가 떴다) */
                  '직책자': 1, '직책': 1, '실무자': 1, '핵심실무자': 1, '승진자': 1,
                  '관리자': 1, '중간관리자': 1, '구성원': 1, '직원': 1, '임직원': 1,
                  '담당자': 1, '사원': 1, '대리': 1, '과장': 1, '차장': 1, '부장': 1,
                  '차석급': 1, '팀장급': 1, '직급별': 1,
                  /* 노션 태그 가운데 주제가 아니라 일의 종류를 적은 것 —
                     '강사섭외 이(가) 커리큘럼에 없습니다' 같은 헛경고가 떴다 */
                  '강사섭외': 1, '섭외': 1, '직원교육': 1, '세미나': 1, '강연': 1, '맞춤': 1,
                  '교육체계수립': 1, '과정개발': 1, '사내아카데미': 1, '사내 아카데미': 1, '단체교육': 1,
                  '주제': 1, '가능여부': 1, '역량': 1, '향상': 1, '실무': 1, '채용': 1, '단체': 1 };
    var missed = said.filter(function (t) {
      if (PLAIN[t] || t.length < 2) return false;
      var ws = words(t);
      if (!ws.length) return false;
      /* 원래 낱말과 줄기 둘 다로 찾는다.
         stem 은 끝 글자를 떼므로 '공정평가' 가 '공정평' 이 되어,
         갈라 보기(공정 + 평가)가 아예 막혔다. */
      return !ws.some(function (w) { return covered(w) || covered(stem(w)); });
    });
    if (missed.length) {
      out.push({
        id: 'topic', bad: true,
        text: '문의에 있던 ' + missed.slice(0, 3).map(function (t) {
          return '‘' + t + '’';
        }).join(' · ') + ' 이(가) 커리큘럼에 없습니다',
        why: '문의가 말한 주제를 커리큘럼이 안 다루고 있습니다.',
        at: 'modules',
        fix: 'topic', missing: missed.slice(0, 6)
      });
    }

    /* ④ 양식 칸보다 글이 길어 잘려 나가는지.
       잘린 글은 '…' 으로 끝나 고객이 받는 종이에서 말이 끊긴다. */
    var room = caps(p);
    var over = [];
    var LABEL = { situation: '귀사의 상황', problem: '풀어야 할 문제',
                  direction: '제안 방향', ops: '운영 방식',
                  outcome: '이렇게 달라집니다' };
    var VAL = { situation: p.context.situation, problem: p.context.problem,
                direction: p.approach.direction, ops: p.approach.method,
                outcome: p.outcome && p.outcome.changes };
    /* 양식이 대괄호로 자리를 지정해 둔 장은 그 자리만 채운다 —
       이 글(귀사의 상황·이렇게 달라집니다 …)이 통째로 들어가지 않는다.
       그런 장의 칸 크기로 길이를 재면, 들어가지도 않는 글을 두고
       '칸보다 깁니다' 라고 알리게 된다. 실제로 그렇게 헛경고가 떴다. */
    var byPh = {};
    var tpl = template(p.templateId);
    if (tpl && tpl.kind === 'pptx') {
      (tpl.slides || []).forEach(function (s) {
        if (s.src && s.src !== 'skip' && s.src !== 'keep' && phOf(s).length) byPh[s.src] = true;
      });
    }

    var tight = [];
    Object.keys(LABEL).forEach(function (k) {
      var c = room[k];
      if (!c || byPh[k]) return;
      var s = String(VAL[k] || '').replace(/\s+/g, ' ').trim();
      if (s.length > c.room * 1.15) {
        over.push(LABEL[k]);
        /* 줄여야 할 칸과 그 칸이 받아 주는 분량을 같이 실어 보낸다 */
        tight.push({ key: k, label: LABEL[k], text: String(VAL[k] || ''),
                     room: c.room, lines: c.lines, lineLen: c.lineLen });
      }
    });
    var longMods = [];
    if (room.moduleDetail) {
      (p.approach.modules || []).forEach(function (m, i) {
        if (String(m.detail || '').length > room.moduleDetail * 1.15) longMods.push(i);
      });
      if (longMods.length) over.push('커리큘럼 ' + longMods.length + '줄');
    }
    if (over.length) {
      out.push({
        id: 'room', bad: false,
        text: over.join(' · ') + ' 이(가) 양식 칸보다 깁니다',
        why: '이대로 만들면 넘치는 부분이 ‘…’ 으로 잘려 나갑니다.',
        at: 'situation',
        fix: 'room', fields: tight, longMods: longMods,
        modRoom: room.moduleDetail || 0
      });
    }

    return out;
  }

  /* PMS 에는 계정 단위로 올리므로 같은 계정끼리 합쳐 둔다 */
  function budget(p) {
    var items = (p.budget.items || []);
    var cost = items.reduce(function (a, it) { return a + lineTotal(it, p.ops); }, 0);
    var byAccount = {};
    items.forEach(function (it) {
      var k = it.account || '(계정 미지정)';
      byAccount[k] = (byAccount[k] || 0) + lineTotal(it, p.ops);
    });
    var accounts = Object.keys(byAccount).map(function (k) {
      return { account: k, amount: byAccount[k], ratio: cost ? byAccount[k] / cost : 0 };
    }).sort(function (a, b) { return b.amount - a.amount; });

    /* 견적서에 적히는 큰 묶음 — 교육비 얼마, 운영비 얼마 */
    var groups = GROUPS.concat([]).map(function (gname) {
      var rows = items.filter(function (it) { return groupOf(it) === gname; });
      return {
        name: gname, items: rows,
        amount: rows.reduce(function (a, it) { return a + lineTotal(it, p.ops); }, 0)
      };
    }).filter(function (x) { return x.items.length; });

    var price = Number(p.budget.price) || 0;
    /* 교육비는 면세다. 예전에 만든 건에 vat: true 가 남아 있어도 0 으로 둔다. */
    var vat = 0;
    var profit = price - cost;
    var margin = price ? profit / price : 0;
    var head = Number(p.ops.headcount) || 0;
    var sess = Number(p.ops.sessions) || 1;

    return {
      cost: cost, accounts: accounts, groups: groups,
      price: price, vat: vat, total: price + vat,
      profit: profit, margin: margin,
      perHead: head ? Math.round(price / (head * sess)) : 0,
      costPerHead: head ? Math.round(cost / (head * sess)) : 0,
      /* 목표 이익률을 맞추려면 제안가가 얼마여야 하는지 */
      suggested: function (target) {
        var m = (Number(target) || 0) / 100;
        return m < 1 ? Math.ceil(cost / (1 - m) / 1000) * 1000 : 0;
      }
    };
  }
  function addCostItem(p, preset) {
    p.budget.items.push(Object.assign({ id: uid('c'), qty: 1, price: 0, note: '' }, preset));
    update(p.id, {});
  }

  /* 예전에 만든 항목에는 구분이 없다. 계정 이름으로 어느 쪽인지 짚어 준다. */
  function groupOf(it) {
    if (it.group) return it.group;
    return /강사료|컨설턴트/.test(it.account || '') ? '교육비' : '운영비';
  }

  /* PMS 등록용 — 계정별 한 줄씩 */
  function budgetText(p) {
    var b = budget(p);
    var n = function (v) { return Number(v || 0).toLocaleString('ko-KR'); };
    var out = [];
    out.push('[' + (p.client.company || '') + '] ' + (p.title || '') + ' 예산서');
    if (p.ops.headcount) out.push('대상 ' + p.ops.headcount + '명 · ' + p.ops.sessions + '차수 · 차수당 ' + p.ops.days + '일');
    out.push('');
    out.push('제안가(공급가)\t' + n(b.price));
    if (p.budget.vat) { out.push('부가세(10%)\t' + n(b.vat)); out.push('합계\t' + n(b.total)); }
    out.push('');
    out.push('[원가]');
    b.accounts.forEach(function (a) { out.push(a.account + '\t' + n(a.amount)); });
    out.push('원가 합계\t' + n(b.cost));
    out.push('');
    out.push('사업이익\t' + n(b.profit));
    out.push('사업이익률\t' + (Math.round(b.margin * 1000) / 10) + '%');
    if (b.perHead) out.push('1인당 제안가\t' + n(b.perHead));
    if (p.budget.note) { out.push(''); out.push(p.budget.note); }
    return out.join('\n');
  }

  /* ── 커리큘럼 ─────────────────────────────────────── */

  function setCurriculum(p, cur) { p.curriculum = cur; update(p.id, {}); }
  function clearCurriculum(p) { p.curriculum = null; update(p.id, {}); }

  /* ── 개요서 생성 (템플릿 기반) ────────────────────── */

  function lines(text) {
    return String(text || '').split(/[\n|]/).map(function (s) { return s.replace(/^[-·•\s]+/, '').trim(); }).filter(Boolean);
  }
  function money(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }

  /* 문의 글에서 뽑은 값에는 조사가 붙어 온다 — '사내 대회의실입니다'.
     문서에 그대로 박히면 남이 쓴 문장을 오려 붙인 티가 난다. 꼬리를 자른다. */
  function tidy(s) {
    return String(s || '').trim()
      .replace(/(입니다|이에요|예요|입니다\.|이다)$/, '')
      .replace(/[.,·\s]+$/, '')
      .trim();
  }

  /* 기계로 자른 토막인지. 끝이 어중간하게 끊겼거나 너무 짧으면 내보내지 않는다.
     '대상 리더십 · 변화관리 교육을 검토하고 있어 문 · 5시간' 같은 것을 막는다. */
  function sane(s) {
    var t = String(s || '').trim();
    if (t.length < 4) return false;
    /* 조사·접속어로 끝나면 문장이 잘린 것이다 */
    if (/(을|를|이|가|은|는|와|과|에|의|로|으로|고|며|서|문)$/.test(t)) return false;
    /* 가운데에 서술어가 끼어 있으면 문장을 오려 낸 토막이다 —
       '… 교육을 검토하고 있어 문 · 5시간' 같은 것. */
    if (/(검토|문의|고민|찾고|생각|진행)(하고|드립|중|해)/.test(t)) return false;
    return true;
  }

  function bulletsFor(src, p, slide) {
    var c = p.client, ctx = p.context, ap = p.approach, ops = p.ops;
    switch (src) {
      case 'cover':
        /* 제목에 이미 고객사가 들어 있는 일이 많다('한라시멘트 팀장 리더십 과정').
           앞에 한 번 더 붙이면 '[한라시멘트] 한라시멘트 …' 가 된다. */
        return [c.company ? '[' + c.company + '] ' + courseName(p) : (p.title || ''),
                myTeam(),
                c.person ? c.person + (c.rank ? ' ' + c.rank : '') + (c.dept ? ' · ' + c.dept : '') + ' 귀하' : '',
                new Date().toLocaleDateString('ko-KR')].filter(Boolean);
      case 'situation': return lines(ctx.situation);
      case 'problem': return lines(ctx.problem);
      case 'direction': return lines(ap.direction);
      case 'modules':
        return (ap.modules || []).map(function (m) {
          return m.title + (m.hours ? ' (' + m.hours + '시간)' : '') + (m.detail ? ' — ' + m.detail : '');
        });
      /* Program Details — 모듈 상세. 한 장에 두 개씩, 장이 모듈 수만큼 늘어난다.
         미리보기에는 어느 모듈이 어떤 내용으로 들어가는지 한 줄씩 보여 준다.
         (이 갈래를 빠뜨려 두어 '내용이 비어 있습니다' 로만 떴다 — 채우기는 되는데
          화면만 비었다고 해서, 왜 안 되는지 알 길이 없었다) */
      case 'detail':
        return (ap.modules || []).map(function (m, i) {
          var head = 'M' + (i + 1) + '. ' +
            String(m.title || '').replace(/^M\s*\d+\s*[.)]?\s*/i, '') +
            (m.hours ? ' (' + m.hours + 'H)' : '');
          var sub = String(m.detail || '').split('\n')
            .map(function (x) { return x.trim(); })
            .filter(function (x) { return /^\d\)/.test(x); })
            .map(function (x) { return x.replace(/^\d\)\s*/, ''); });
          return head + (sub.length ? ' — ' + sub.join(' / ') : '');
        });
      case 'curriculum':
        return p.curriculum ? (p.curriculum.lines || []).slice(0, 40) : [];
      case 'ops': {
        var b = [];
        if (ops.headcount) b.push('대상 ' + ops.headcount + '명');
        if (ops.sessions > 1) b.push(ops.sessions + '개 차수');
        if (ops.hours) b.push('교육시간 ' + ops.hours + '시간');
        if (ops.days) b.push('차수당 ' + ops.days + '일');
        if (ops.place) b.push('장소 ' + tidy(ops.place));
        if (ops.period) b.push('일정 ' + tidy(ops.period));
        /* 운영 방식 메모는 문의 글에서 기계로 뽑은 것이라 문장이 잘려 있을 때가 많다
           ('대상 리더십 · 변화관리 교육을 검토하고 있어 문 · 5시간').
           말이 안 되는 토막은 고객에게 내보내지 않는다. */
        return b.concat(lines(ap.method).filter(sane));
      }
      case 'outcome': return lines(p.outcome.changes);
      /* 교수 장. 이 갈래를 빠뜨려 두어, 교수를 골라 놨는데도 '아직 빈 곳' 으로 떴다.
         (planView 는 따로 처리하고 있었는데 outline/gaps 는 여기를 지나간다) */
      case 'teachers': {
        var who = pickedTeachers(p);
        if (!who.length) return [];
        /* 장마다 한 명씩 실린다. 미리보기에는 고른 교수를 차례로 보여 준다. */
        return who.map(function (t) {
          return t.name + (t.rank ? ' ' + t.rank : ' 교수') +
            (t.field ? ' — ' + String(t.field).split(/[,·]/)[0].trim() : '');
        });
      }
      case 'budget': {
        var bd = budget(p);
        if (!bd.price && !bd.cost) return [];
        var out = (p.budget.items || []).map(function (it) {
          return it.name + ' · ' + qty(it, ops).toLocaleString('ko-KR') + (it.unit || '') + ' × ' + money(it.price);
        });
        if (bd.price) {
          /* KMA 는 교육비 면세기관이다. vat=false 는 '포함' 이 아니라 '면세' 다 —
             '부가세 포함' 이라고 적어 내보내면 금액을 잘못 읽게 만든다. */
          out.push('제안가 ' + money(bd.price) + (p.budget.vat ? ' (부가세 별도)' : ' (VAT 면세)'));
          if (bd.perHead) out.push('1인당 ' + money(bd.perHead));
        }
        /* 예산 메모는 내보내지 않는다.
           지난 제안서에서 가져온 예산 줄이 여기 그대로 붙어, 방금 계산한 견적과
           다른 금액('합계 7,650,000원', '교재 15,000원×30부')이 한 장에 같이 나갔다.
           메모는 우리가 보고 쓰는 것이지 고객이 볼 것이 아니다. */
        return out;
      }
      case 'next':
        return ['제안 내용 브리핑 미팅(30분) 제안', '일정 확정 후 세부 커리큘럼·교수 확정', '문의: ' + myTeam()];
      default:
        return lines(slide && slide.bullets);
    }
  }

  /* 빈 장을 만났을 때 — 무엇이 없는지와 **어느 칸에서 채우는지**.
     'at' 은 ② 내용 화면의 그 카드(data-holds)로 데려가는 열쇠다. */
  var NEED = {
    situation:  { text: '귀사의 상황이 비어 있습니다',   at: 'situation', how: '문의 내용에 적기' },
    problem:    { text: '풀어야 할 문제가 비어 있습니다', at: 'problem',   how: '문의 내용에 적기' },
    direction:  { text: '제안 방향이 비어 있습니다',     at: 'direction', how: '과정 설계에 적기' },
    modules:    { text: '모듈이 없습니다',               at: 'modules',   how: '커리큘럼 올리기' },
    detail:     { text: '모듈 상세가 없습니다',          at: 'modules',   how: '커리큘럼 올리기' },
    curriculum: { text: '커리큘럼 파일이 없습니다',      at: 'curriculum', how: '커리큘럼 올리기' },
    ops:        { text: '인원·차수·일정이 비어 있습니다', at: 'ops',      how: '운영 조건에 적기' },
    outcome:    { text: '기대 변화가 비어 있습니다',     at: 'outcome',   how: '과정 설계에 적기' },
    teachers:   { text: '고른 교수가 없습니다',          at: 'teachers',  how: '교수 고르기' },
    budget:     { text: '견적이 비어 있습니다',          at: 'budget',    how: '예산서 열기' },
    free:       { text: '내용이 비어 있습니다',          at: '',          how: '내용 채우기' }
  };
  function needOf(src) { return NEED[src] || { text: '내용이 비어 있습니다', at: '', how: '내용 채우기' }; }

  /* 개요서(글 목록)에서는 자리를 비워 둘 수 없어 한 줄로 적어 둔다 */
  var PLACEHOLDER = {
    situation: '(문의에서 파악한 고객사 상황)',
    problem: '(이번 교육으로 해결하고 싶은 것)',
    direction: '(이 문제를 어떤 방식으로 풀지)',
    modules: '(모듈을 추가하거나 커리큘럼 파일을 올리세요)',
    detail: '(모듈 상세 — 커리큘럼을 올리거나 「제안서 쓰기」를 누르세요)',
    curriculum: '(커리큘럼 파일을 올리세요)',
    ops: '(인원·차수·일정을 입력하세요)',
    outcome: '(교육 후 기대되는 변화)',
    teachers: '(추천할 교수를 고르세요)',
    budget: '(예산서를 작성하세요)',
    free: '(내용을 입력하세요)'
  };

  /* 미리보기·내보내기가 함께 쓰는 한 장씩의 결과.
     'keep' 은 양식에 있는 글을 그대로 두는 장, 'skip' 은 빼는 장이다. */
  function outline(p) {
    var t = template(p.templateId);
    var out = [], no = 0;

    /* 표로 채우는 장은 글이 없어도 빈 장이 아니다.
       일정표·견적표가 그렇다 — '빈 곳' 이라고 알리면 채울 수 없는 것을
       채우라고 보채는 꼴이 된다. (planView 는 이미 이렇게 본다) */
    var tabled = {};
    if (t.kind === 'pptx') {
      try {
        tableJobs(p, t, [], function (n) { return n; }).forEach(function (j) {
          if (j.from) tabled[j.from] = true;
        });
      } catch (e) {}
    }

    (t.slides || []).forEach(function (s) {
      if (s.src === 'skip' || isSample(s)) return;
      no++;
      if (s.src === 'keep') {
        out.push({ no: no, title: s.title, src: 'keep', note: s.note || '',
                   slideNo: s.no, thumb: s.thumb, keep: true,
                   bullets: (s.texts && s.texts.length ? s.texts : ['(양식에 있는 내용 그대로)']),
                   warn: false });
        return;
      }
      var b = bulletsFor(s.src, p, s);
      /* 교수 장은 표가 있어도 교수를 안 고르면 빈 장이다 —
         그 장에 유사 프로젝트 표가 같이 있어서, 표만 보고 '채워졌다' 고 넘기면
         교수 없는 제안서가 조용히 나간다. */
      var fromTable = !!tabled[s.no] && s.src !== 'teachers';
      var warn = !b.length && !fromTable && s.src !== 'cover' && s.src !== 'next';
      out.push({
        no: no, title: s.title, src: s.src, note: s.note || '',
        slideNo: s.no, thumb: s.thumb,
        bullets: b.length ? b : [PLACEHOLDER[s.src] || '(내용을 입력하세요)'],
        warn: warn
      });
    });
    return out;
  }

  /* ── 문의와 가장 가까운 제안 프로그램 찾기 ───────────
     노션의 'KMA 주요 제안서 통합' 21건에는 이름·영역·키워드·요약이 있다.
     문의 글과 그 21건을 견줘 가장 가까운 것을 고른다.

     낱말이 겹치는 정도로만 센다. 영리한 척하지 않는 대신,
     왜 그게 골라졌는지(겹친 낱말) 화면에 그대로 보여 줄 수 있다. */

  /* 어느 문의에나 들어 있어 판단에 도움이 안 되는 말 */
  var STOP = ('교육 과정 프로그램 문의 진행 관련 대상 내용 검토 예정 희망 가능 안녕하세요 ' +
    '감사합니다 부탁 드립니다 드려요 회사 기업 직원 임직원 구성원 우리 저희 담당 ' +
    '이며 하여 또한 그리고 하는 있는 위한 통해 대한 등의 및 ' +
    /* 어느 제안서에나 들어 있어 겹쳐도 뜻이 없는 말들.
       '기반' 하나 때문에 PM 문의에 'PBS 기반 AI 교육' 이 딸려 올라왔다. */
    '기반 중심 강화 실무 실습 활용 적용 설계 운영 지원 개발 수행 구축 ' +
    '역량 업무 조직 인재 전략 혁신 솔루션 워크숍 특강 연수 세미나 ' +
    '기본 심화 실전 맞춤 통합 종합 표준 체계 방식 방법 수준').split(/\s+/);

  function words(s) {
    return String(s || '')
      .replace(/[^가-힣A-Za-z0-9]+/g, ' ')
      .split(/\s+/)
      .map(function (w) { return w.trim(); })
      .filter(function (w) {
        if (w.length < 2) return false;
        return STOP.indexOf(w) === -1;
      });
  }

  /* 한글은 어미가 붙어 서로 다른 낱말처럼 보인다.
     '리더십은' 과 '리더십' 이 안 겹치면 셈이 무의미해진다. 앞 두 글자로 자른다. */
  function stem(w) { return w.length > 3 ? w.slice(0, Math.max(2, w.length - 1)) : w; }

  /* 예전에 실제로 나간 제안서 중 이 문의에 가까운 것.
     노션 '인재개발센터 제안서 데이터베이스' 를 읽어 온 것이고, 건마다
     커리큘럼 표·추천 강사·제안 금액이 붙어 있다. 그대로 가져다 쓰면
     맨바닥에서 쓰는 것보다 훨씬 빠르고, 이미 나간 문장이라 말도 다듬어져 있다.

     이름·키워드·교육영역은 그 제안서의 정체라 무겁게 세고, 컨셉·VOC 본문은
     거들기만 한다 — 본문에는 흔한 말이 많아 그것만으로 줄 세우면 엉뚱한 게 올라온다. */
  /* 실제로 수주까지 간 고객사 이름.
     노션 제안서 DB 에는 수주 여부 칸이 없다. 대신 교육문의(VOC) 쪽에 진행상태가
     있어서, 읽어 온 문의 가운데 '수주성공' 인 회사를 모아 둔다.
     읽어 온 만큼만 아는 것이라 빠질 수 있다 — 없다고 수주 못 한 건이 아니다. */
  var wonCache = null;
  function wonClients() {
    if (wonCache) return wonCache;
    wonCache = {};
    var rows = (g.Shell && g.Shell.vocItems && g.Shell.vocItems()) || [];
    rows.forEach(function (x) {
      if (x.stage === '수주성공' && x.company) wonCache[String(x.company).trim()] = 1;
    });
    return wonCache;
  }

  function matchPast(text, items, n) {
    var src = words(text).map(stem);
    if (!src.length || !items || !items.length) return [];
    var seen = {};
    src.forEach(function (w) { seen[w] = 1; });

    return items.map(function (it) {
      var strong = words(it.name)
        .concat(it.keywords || [], it.areas || [], it.targets || [])
        .map(stem);
      var weak = words([it.concept, it.voc, it.modules].filter(Boolean).join(' ')).map(stem);
      var hit = {}, score = 0, strongHit = 0;
      strong.forEach(function (w) {
        if (seen[w] && !hit[w]) { hit[w] = 1; score += 3; strongHit++; }
      });
      weak.forEach(function (w) {
        if (seen[w] && !hit[w]) { hit[w] = 1; score += 1; }
      });
      /* 커리큘럼이 실제로 붙어 있는 건을 위로 — 여기서 가져올 것이 그것이다 */
      if ((it.curriculum || []).length > 1) score += 2;

      /* 날짜로는 줄 세우지 않는다 — 오래된 건이라고 덜 맞는 것이 아니고,
         425건 전체에서 가장 가까운 것을 찾는 게 맞다.
         다만 실제로 수주까지 간 고객사의 건은 한 번 더 쳐 준다. */
      var won = !!wonClients()[String(it.client || '').trim()];
      if (won) score += 3;

      return { item: it, score: score, strong: strongHit, hits: Object.keys(hit), won: won };
    })
      .filter(function (r) { return r.strong > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, n || 5);
  }

  /* 강사 한 명이 이 문의에 얼마나 맞는지.
     studio.kma.or.kr 에서 읽어 온 480명에는 '강의 주제' 가 붙어 있다.
     그 주제가 문의 글과 겹치면 올려 준다 — 직함·분야는 거들기만 한다
     ('교수' 같은 흔한 말이 직함마다 들어 있어 그것만으로 줄 세우면 엉망이 된다). */
  function matchTeachers(text, roster, n) {
    var src = words(text).map(stem);
    if (!src.length || !roster || !roster.length) return [];
    var seen = {};
    src.forEach(function (w) { seen[w] = 1; });

    return roster.map(function (t) {
      var strong = (t.topics || []).reduce(function (a, s) {
        return a.concat(words(s).map(stem));
      }, []);
      var weak = words([t.field, t.title].filter(Boolean).join(' ')).map(stem);
      var hit = {}, score = 0, strongHit = 0;
      strong.forEach(function (w) {
        if (seen[w] && !hit[w]) { hit[w] = 1; score += 3; strongHit++; }
      });
      weak.forEach(function (w) {
        if (seen[w] && !hit[w]) { hit[w] = 1; score += 1; }
      });
      return { item: t, score: score, strong: strongHit, hits: Object.keys(hit) };
    })
      /* 주제가 한 번은 걸려야 한다. 직함만 스친 사람을 권하면
         '교수' 가 들어간 사람이 전부 올라온다. */
      .filter(function (r) { return r.strong > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, n || 12);
  }

  /* ── 어느 템플릿이 실제로 수주로 이어졌나 ───────────
     우리가 이미 갖고 있는 것으로 센다. 제안서마다 어느 템플릿을 썼는지 남아 있고,
     그 제안서가 붙은 프로젝트가 수주까지 갔는지도 남아 있다. 둘을 이으면 된다.

     표본이 적을 때 비율만 보면 1건 중 1건이 100% 로 맨 위에 선다.
     그래서 '몇 건이나 써 봤는지' 를 같이 본다(a/b 평활). */
  var WON = { '수주': 1, '운영중': 1, '결과보고': 1, '완료': 1 };

  function templateStats() {
    var by = {};
    function seat(id) {
      if (!by[id]) by[id] = { id: id, used: 0, won: 0, lost: 0, waiting: 0 };
      return by[id];
    }
    (S.proposals || []).forEach(function (p) {
      if (!p.templateId) return;
      var s = seat(p.templateId);
      s.used++;
      var pj = g.Projects ? g.Projects.byProposal(p.id) : null;
      if (!pj) { s.waiting++; return; }
      if (WON[pj.stage]) s.won++;
      else if (pj.stage === '무산') s.lost++;
      else s.waiting++;
    });
    Object.keys(by).forEach(function (k) {
      var s = by[k];
      var decided = s.won + s.lost;
      s.rate = decided ? s.won / decided : null;
      /* 아직 결판난 건이 적으면 전체 평균 쪽으로 끌어당긴다 */
      s.score = (s.won + 1) / (decided + 2);
    });
    return by;
  }

  /* 수주로 이어진 템플릿이 위로. 아직 아무 기록도 없으면 손대지 않는다. */
  function rankedTemplates() {
    var stats = templateStats();
    var list = templates().slice();
    var anyData = Object.keys(stats).some(function (k) {
      return stats[k].won + stats[k].lost > 0;
    });
    if (!anyData) return { list: list, stats: stats, ranked: false };

    list.sort(function (a, b) {
      var sa = stats[a.id], sb = stats[b.id];
      var xa = sa ? sa.score : 0.5, xb = sb ? sb.score : 0.5;
      if (xb !== xa) return xb - xa;
      return ((sb && sb.used) || 0) - ((sa && sa.used) || 0);
    });
    return { list: list, stats: stats, ranked: true };
  }

  /* ── 고른 양식으로 무엇이 나오는지 ──────────────────
     '만들기' 를 누르기 전에, 어느 장에 무엇이 들어가고 어느 장이 빠지는지
     장 단위로 세워 둔다. 누르고 나서야 아는 일이 없게. */
  function planView(p) {
    var t = template(p.templateId);
    var plan = t.kind === 'pptx' ? fillPlan(p) : null;
    var dropped = {}, tabled = {};
    if (plan) {
      (plan.drop || []).forEach(function (no) { dropped[no] = true; });
      (plan.tables || []).forEach(function (j) { tabled[j.slide] = j; });
    }

    /* 교수 장은 한 장에 한 명 — 자리를 먼저 배정해 둔다.
       빠지는 장을 걸러 가며 세면 순번이 어긋난다. */
    var picked = pickedTeachers(p), seat = 0, seatOf = {};
    (t.slides || []).forEach(function (s, i) {
      if (s.src === 'teachers') seatOf[s.no || (i + 1)] = picked[seat++];
    });

    var slides = (t.slides || []).map(function (s, i) {
      var no = s.no || (i + 1);
      var out = { no: no, title: s.title || ('슬라이드 ' + no), thumb: s.thumb || '', src: s.src, bullets: [] };
      if (s.src === 'skip' || dropped[no]) {
        out.drop = true;
        out.label = s.src === 'skip' ? '빼고 만듭니다' : '넣을 내용이 없어 뺍니다';
        return out;
      }
      if (s.src === 'keep') { out.keep = true; out.label = '양식 그대로'; return out; }

      out.label = srcLabel(s.src);
      out.bullets = s.src === 'teachers'
        ? (seatOf[no] ? teacherLines(seatOf[no]) : [])
        : bulletsFor(s.src, p, s);

      var j = tabled[no];
      out.table = j && j.rows ? (j.rows.length + '줄') : '';
      out.warn = !out.bullets.length && !j && s.src !== 'cover';
      if (out.warn) {
        var nd = needOf(s.src);
        out.need = nd.text; out.needAt = nd.at; out.needHow = nd.how;
      }
      return out;
    });

    return {
      id: t.id, name: t.name, kind: t.kind || 'outline',
      slides: slides,
      made: slides.filter(function (x) { return !x.drop; }).length,
      dropped: slides.filter(function (x) { return x.drop; }).length,
      warn: slides.filter(function (x) { return x.warn; }).length
    };
  }
  function srcLabel(id) {
    var o = SOURCES.filter(function (x) { return x.id === id; })[0];
    return o ? o.label.replace(/\s*\(.*\)$/, '') : '';
  }

  /* 내보낸 순간의 내용을 장별로 기억해 둔다.
     나중에 "그때와 무엇이 달라졌는지"를 알아야 고친 PPT 에 바뀐 것만 다시 넣을 수 있다. */
  function hash(s) {
    var h = 5381;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function snapshot(p) {
    var marks = {};
    outline(p).forEach(function (s) {
      if (s.keep) return;
      marks[s.title] = hash(s.bullets.join(''));
    });
    return marks;
  }
  function markExported(p, fileName) {
    p.lastExport = { at: Date.now(), fileName: fileName || '', marks: snapshot(p) };
    update(p.id, {});
    return p.lastExport;
  }
  /* 지난번 내보낸 뒤로 내용이 달라진 장 */
  function changedSince(p) {
    var was = (p.lastExport && p.lastExport.marks) || null;
    var now = snapshot(p);
    return Object.keys(now).filter(function (k) { return !was || was[k] !== now[k]; });
  }

  /* relay 에 넘길 지시서 — 어느 장에 무엇을 쓰고 어느 장을 뺄지 */
  /* ── 자리표시자 채우기 ───────────────────────────────
     양식의 칸을 통째로 덮어쓰지 않고, 대괄호만 갈아 끼운다.
     'M1. [모듈명]' → 'M1. 변화관리 리더십', '[시간]H' → '4H',
     '교육대상 : [대상 내용]' → '교육대상 : 2026년 승진 대상자 30명'.
     통째로 덮어쓰면 양식이 안내하던 'M1. ' · 'H' · '교육대상 : ' 가 사라진다. */

  /* 어느 장에나 되풀이되는 값 */
  function phEvery(p) {
    var year = String(p.ops.period || '').match(/20\d\d/);
    if (!year) year = String(p.createdAt || '').match(/20\d\d/);
    var me = S.me || {};
    return {
      '연도': year ? year[0] : String(new Date().getFullYear()),
      '기업명': p.client.company || '',
      '프로그램명': courseName(p),
      '과정명': courseName(p),
      '교육명': courseName(p),
      '성명': me.name || '',
      '직함': me.rank || '',
      '연락처 뒷번호': me.tel || '',
      '이메일 주소': me.email || ''
    };
  }

  /* 대괄호 안의 이름으로 값을 찾는다. 이름이 '[상세 내용 1, 총 2줄]' 처럼
     설명까지 붙어 있으므로, 앞쪽 낱말로 느슨하게 맞춘다. */
  function phFind(name, map) {
    var key = name.replace(/^\[|\]$/g, '').trim();
    if (map[key] != null) return map[key];
    var k = bare(key);
    var keys = Object.keys(map).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      if (k.indexOf(bare(keys[i])) === 0) return map[keys[i]];
    }
    return null;
  }

  /* 한 칸의 글에서 대괄호를 갈아 끼운다.
     채울 값이 없는 대괄호가 하나라도 남으면 null 을 돌려 '이 칸은 못 채운다'고 알린다 —
     '[상세 내용]' 이 그대로 고객에게 나가는 것보다는 그 장을 빼는 편이 낫다.

     머리말의 [연도]·[기업명] 처럼 어느 장에나 있는 것은 여기서 따지지 않는다.
     그건 KMA 소개 장(손대지 않는 장)에도 있어서, 장을 훑는 방식으로는 못 닿는다.
     대신 swapList 가 만든 '바꿔치기 목록' 이 모든 장·표·머리말을 훑어 갈아 끼운다. */
  /* 양식이 디자이너에게 남긴 메모 — 고객이 볼 글이 아니다.
     '[강사 이미지, 원형에 맞게 조정]', 'PPT의 SmartArt를 활용하여 도식화하고…'
     채우지 않고 지운다. 그대로 나가면 제안서에 작업 지시가 실려 나간다. */
  var PH_NOTE = /도식화|SmartArt|맞게\s*조정|반영해\s*줘|시각화\]|이미지\s*[,\]]/i;

  /* 같은 이름의 자리표시자가 한 장에 여러 번 나온다. 과정 개요 장은
     '[내용 1] [내용 2] [내용 3]' 이 세 상자에 그대로 되풀이돼 아홉 자리다.
     이름만으로는 어느 자리에 무엇을 넣을지 못 가리므로,
     위 → 아래 · 왼 → 오른 차례로 줄을 하나씩 꺼내 쓴다. */
  /* 이름을 견줄 때는 띄어쓰기를 지운다 — 양식에 '[상세 내용 1]' 과
     '[상세내용 2]' 가 섞여 있다(사람이 손으로 적은 양식이라 그렇다).
     긴 이름부터 견줘야 '상세내용' 이 '내용' 에 먼저 걸리지 않는다. */
  function bare(s) { return String(s || '').replace(/\s/g, ''); }
  function queueKey(key, q) {
    var k = bare(key);
    var ks = Object.keys(q || {}).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < ks.length; i++) if (k.indexOf(bare(ks[i])) === 0) return ks[i];
    return '';
  }

  function phSub(text, map, q, labels) {
    var miss = false, filled = 0;
    var out = String(text || '').replace(PH_RE, function (m) {
      if (labels && labels[m]) return m;       /* 양식의 이름표 — 그대로 둔다 */
      var key = m.replace(/^\[|\]$/g, '').trim();
      var qk = queueKey(key, q);
      if (qk) {
        /* 줄이 모자라면 비운다 — 세 줄 상자에 두 줄만 있어도 괜찮다.
           없는 줄을 억지로 지어내는 것보다 낫다. */
        var qv = q[qk].length ? q[qk].shift() : '';
        if (qv) filled++;
        return String(qv);
      }
      var v = phFind(m, map);
      if (v != null && v !== '') { filled++; return String(v); }
      /* 장마다 되풀이되는 이름은 바꿔치기 목록이 맡는다.
         단, 그 장이 따로 값을 준 경우에는 위에서 이미 쓰였다 —
         강사 소개 장의 '[성명] [직함]' 은 내 이름이 아니라 그 교수의 이름이다. */
      if (PH_EVERY.test(m)) return m;
      miss = true;
      return '';
    });
    return { text: out, miss: miss, filled: filled };
  }

  /* ── Program Details 장 ──────────────────────────────
     양식의 이 장은 '제목 / 상세 / 시간' 세 칸이 한 묶음이고, 한 장에 두 묶음이다.
     모듈이 여섯 개면 이 장을 세 장으로 늘려 싣는다.
     칸을 위에서 아래 차례로 읽어 묶음을 짝지운다. */
  function detailBlocks(s) {
    var titles = [], bodies = [], hours = [], teacher = null, chev = null, bar = null;
    /* 본문 옆 세로 칸 — 그룹 안에 묶여 있다. 학습 시간 · 키워드 · 목표가 들어간다. */
    var side = { time: null, keyword: null, goal: null, course: null };
    var slots = (s.slots || []).slice().sort(function (a, b) {
      if (a.top !== b.top) return a.top - b.top;
      return a.left - b.left;
    });
    slots.forEach(function (x) {
      var txt = String((x && x.text) || '');
      if (/^\s*M\s*\d+\s*\.\s*\[/.test(txt)) { titles.push(x); return; }
      if (/^\s*\[\s*시간\s*\]\s*H\s*$/.test(txt)) { hours.push(x); return; }
      if (/\[\s*내용\s*\d/.test(txt) && /\[\s*상세\s*내용/.test(txt)) { bodies.push(x); return; }
      /* '000 교수' — 양식이 강사 이름 자리로 비워 둔 칸 */
      if (/^\s*0{2,}\s*교수\s*$/.test(txt)) { teacher = x; return; }
      if (/program\s*details/i.test(txt)) { chev = x; return; }
      /* 세로 칸. 이름표('▶ 학습 시간')가 아니라 값이 들어갈 칸만 집는다. */
      if (/\[\s*시간\s*\]/.test(txt) && /전체\s*시간/.test(txt)) { side.time = x; return; }
      if (/\[\s*키워드\s*\d/.test(txt)) { side.keyword = x; return; }
      if (/\[\s*학습\s*목표\s*\d/.test(txt)) { side.goal = x; return; }
      /* 'Course Details | 프로그램명' — 머리 띠에 과정 이름이 들어간다 */
      if (/course\s*details/i.test(txt)) { side.course = x; return; }
      /* 제목 밑 넓은 띠에 숫자 하나만 적힌 양식 — 그대로 두면 '1' 만 덩그러니 나간다 */
      if (/^\s*\d{1,2}\s*$/.test(txt) && (Number(x.width) || 0) >= 300 && !bar) { bar = x; return; }
    });
    var n = Math.min(titles.length, bodies.length);
    var blocks = [];
    for (var i = 0; i < n; i++) {
      blocks.push({ title: titles[i], body: bodies[i], hour: hours[i] || null });
    }
    return { blocks: blocks, teacher: teacher, chev: chev, side: side, bar: bar };
  }

  /* 칸 하나에 한글 몇 자가 들어가는가.
     빈 양식에 적힌 글자 수는 '얼마나 쓸 수 있는가'를 말해 주지 않는다 —
     '[모듈명]' 은 다섯 자지만 그 칸에는 서른 자가 들어간다.
     한글은 글꼴 크기만큼 넓고, 줄 간격은 1.35배쯤이다.
     그대로 곱하면 실제보다 두 배쯤 크게 나오므로(자간·여백·줄바꿈)
     절반으로 줄여 잡는다. 회사 샘플의 416자 칸이 이 셈으로 428자가 나온다. */
  function capOf(slot) {
    if (!slot) return 0;
    var r = roomOf(slot);
    if (!r) return Number(slot.chars) || 0;
    return Math.max(Number(slot.chars) || 0, Math.floor(r.perLine * r.rows * 0.5));
  }

  /* 잘라 낼 때 쓰는 자리 — 글을 쓰라고 알려 줄 때(capOf)보다 넉넉하게 본다.
     잘라 내는 쪽은 넘치는 것만 막으면 되고, 파워포인트도 자동으로 글자를 줄여 준다.
     0.5 를 그대로 쓰면 두 줄짜리 문구에서 둘째 줄이 통째로 날아간다
     (표지 인용 상자 “○○의 / …” 에서 실제로 그랬다). */
  function roomOf(slot) {
    if (!slot) return null;
    var fs = Number(slot.font) || 9;
    var w = Number(slot.width) || 0;
    var h = Number(slot.height) || 0;
    if (!w || !h) return null;
    return {
      perLine: Math.max(4, Math.floor(w / fs)),
      rows: Math.max(1, Math.floor(h / (fs * 1.35)))
    };
  }

  /* 한 장에 모듈 몇 개가 들어가는지 */
  function detailRoom(t) {
    var room = 0;
    (t.slides || []).forEach(function (s) {
      if (s.src !== 'detail') return;
      var d = detailBlocks(s);
      if (d.blocks.length > room) room = d.blocks.length;
    });
    return room;
  }

  /* Program Details 한 장을 채운다. from 번째 모듈부터 담는다. */
  function detailSlots(p, s, from, seat, big) {
    var d = detailBlocks(s);
    if (!d.blocks.length) return null;
    var ms = p.approach.modules || [];
    var every = phEvery(p);
    var out = [];

    d.blocks.forEach(function (b, i) {
      var m = ms[from + i];
      if (!m) {
        /* 남는 칸은 비운다 — 양식의 '[모듈명]' 이 그대로 나가면 안 된다 */
        out.push({ name: b.title.name, text: '' });
        out.push({ name: b.body.name, text: '' });
        if (b.hour) out.push({ name: b.hour.name, text: '' });
        return;
      }
      /* 'M1. [모듈명]' 의 번호는 양식에 박혀 있다. 전체에서 몇 번째 모듈인지로 고쳐 준다.
         모듈 제목이 이미 'M1.' 으로 시작하면 (AI 도, 업로드한 커리큘럼도 그렇게 준다)
         떼고 다시 붙인다 — 그대로 두면 'M1. M1. 변화의 이해' 가 된다. */
      var name = cleanTitle(m.title).replace(/^M\s*\d+\s*[.)]?\s*/i, '');
      /* 제목 칸은 한 줄짜리라 재 놓은 값이 실제보다 작게 나온다(451pt 칸이 25자로 잡혔다).
         'M1. 업무를 Project/Task로…' 처럼 제목이 잘려 나갔다.
         한 줄에 들어갈 글자 수를 칸 너비로 직접 재고, 넘치면 Set-BoxText 가 줄여 준다. */
      var room = bigRoom(b.title, big);
      var cap = room ? room.perLine - 5 : (bigCap(b.title, big) - 5);
      out.push({
        name: b.title.name,
        text: 'M' + (from + i + 1) + '. ' + fit(name, Math.max(14, cap))
      });
      out.push({ name: b.body.name, text: fitLines(moduleBody(m), bigRoom(b.body, big)) });
      if (b.hour) out.push({ name: b.hour.name, text: (m.hours ? String(m.hours) : '') + (m.hours ? 'H' : '') });
    });

    /* 'Program Details ( … )' — 괄호 안은 과정 이름이 아니라 **이 장에 실린 모듈의
       묶음 주제**다. 회사 샘플이 'Program Details ( 성과관리 및 목표 달성을 위한
       팀원 코칭 )' 이다. 과정 이름을 넣으면 장마다 똑같은 말이 되풀이된다. */
    /* 이 장에 실린 모듈. 머리 띠도 세로 칸도 이 목록만 보고 채운다 —
       장마다 다른 값이라 한 번 채우고 끝나는 자리가 아니다. */
    var mine = ms.slice(from, from + d.blocks.length).filter(Boolean);

    if (d.chev) {
      var band = groupOfPage(mine) || courseName(p);
      if (band) out.push({ name: d.chev.name, text: 'Program Details ( ' + fit(band, 34) + ' )' });
    }
    if (d.bar && mine.length) {
      /* 'M1–M2 · 증권사 비즈니스 이해와 기술 언어 전환' */
      var span = 'M' + (from + 1) + (mine.length > 1 ? '–M' + (from + mine.length) : '');
      var topic = groupOfPage(mine) || tidyCourse(courseName(p));
      var room2 = roomOf(d.bar);
      out.push({ name: d.bar.name, text: fit(span + (topic ? ' · ' + topic : ''), room2 ? room2.perLine - 2 : 60) });
    }
    if (d.teacher) {
      var picked = pickedTeachers(p);
      var who = picked[seat] || picked[0];
      out.push({ name: d.teacher.name, text: who && who.name ? who.name + ' 교수' : '' });
    }

    var sd = d.side || {};
    if (sd.time) {
      /* 회사 샘플: '7시간 구성' / '총 7H (09:00~17:00)' */
      var here = mine.reduce(function (a, m) { return a + (Number(m.hours) || 0); }, 0);
      var all = courseHours(p);
      var days = Number(p.ops.days) || 0;
      var t1 = here ? round1(here) + '시간 구성' : '';
      var t2 = '';
      if (all) {
        t2 = '총 ' + round1(all) + 'H';
        if (days > 1) t2 += ' (' + days + '일 × ' + round1(all / days) + 'H)';
        else t2 += ' (' + dayClock(all) + ')';
      }
      out.push({ name: sd.time.name, text: [t1, t2].filter(Boolean).join('\n') });
    }
    if (sd.keyword) {
      var kw = [];
      mine.forEach(function (m) { kw = kw.concat(m.keywords || []); });
      kw = uniq(kw.map(function (x) { return String(x).trim(); }).filter(Boolean));
      /* AI 가 키워드를 안 줬으면 모듈 제목이라도 세운다 — 비우지 않는다 */
      if (!kw.length) kw = mine.map(function (m) {
        return cleanTitle(m.title).replace(/^M\s*\d+\s*[.)]?\s*/i, '');
      }).filter(Boolean);
      /* 회사 샘플은 넷이다. 다섯을 넣으면 칸이 빡빡해 글자가 줄어든다.
         모듈 둘의 키워드를 번갈아 뽑아 한쪽에 치우치지 않게 한다. */
      var mix = [];
      for (var kk = 0; kk < 4; kk++) {
        mine.forEach(function (m) {
          var list = (m.keywords || []).filter(Boolean);
          if (list[kk]) mix.push(String(list[kk]).trim());
        });
      }
      kw = uniq(mix.concat(kw)).filter(Boolean).slice(0, 4);
      out.push({ name: sd.keyword.name, text: fitLines(kw.join('\n'), bigRoom(sd.keyword, big)) });
    }
    if (sd.goal) {
      var gs = [];
      mine.forEach(function (m) { gs = gs.concat(m.goals || []); });
      gs = uniq(gs.map(function (x) { return String(x).trim(); }).filter(Boolean));
      /* 목표가 없으면 소주제를 '~할 수 있음' 으로 세운다 */
      if (!gs.length) {
        mine.forEach(function (m) {
          String(m.detail || '').split('\n').forEach(function (x) {
            var t = x.trim();
            if (!/^\d\)/.test(t)) return;
            t = t.replace(/^\d\)\s*/, '').replace(/[?？]$/, '');
            if (t) gs.push(t.replace(/(하기|하는 법|의 이해)$/, '') + '을(를) 할 수 있음');
          });
        });
        gs = uniq(gs);
      }
      out.push({ name: sd.goal.name, text: fitLines(gs.slice(0, 3).join('\n'), bigRoom(sd.goal, big)) });
    }
    if (sd.course) {
      /* 'Course Details | 프로그램명' → 'Course Details | <우리 과정 이름>' */
      var cn = courseName(p);
      if (cn) out.push({ name: sd.course.name, text: 'Course Details | ' + cn });
    }
    return out;
  }

  /* 모듈 상세 — 양식이 보여 준 꼴을 그대로 쓴다.
       1) 소주제
       (이론) …
       (실습) …
     AI 가 이미 이 꼴로 써 주지만, 사람이 손으로 적었거나 옛 제안서에서
     가져온 글은 한 줄로 뭉쳐 있다. 그럴 때는 번호 앞에서 줄을 나눈다. */
  function moduleBody(m) {
    var s = String(m.detail || m.method || '').trim();
    if (!s) return '';
    if (s.indexOf('\n') >= 0) return s;
    return s
      .replace(/\s*(\d\))\s*/g, '\n$1 ')
      /* 글머리 '·' 는 앞뒤가 띄어진 것만. '수익·비용·리스크' 처럼 붙은 가운뎃점은
         낱말을 잇는 것이라 여기서 줄을 나누면 '수익 / · 비용 / · 리스크' 가 된다. */
      .replace(/(^|\s+)[·・•]\s+/g, '\n· ')
      .replace(/\s*(\((?:이론|실습|토론|사례|진단|발표)\))\s*/g, '\n$1 ')
      .replace(/^\n+/, '');
  }

  /* ── 그 밖의 장 ──────────────────────────────────────
     대괄호가 있는 칸만 갈아 끼운다. 채울 값이 없는 칸이 있으면
     그 장은 통째로 뺀다(부르는 쪽에서 판단). */
  function phSlots(p, s, labels, big, seat) {
    /* phEvery 는 여기서 섞지 않는다 — 바꿔치기 목록이 모든 장을 훑어 처리하고,
       장마다 뜻이 달라지는 이름([성명])은 phContent 가 덮는다. */
    var map = phContent(p, s.src, seat);
    var q = phQueues(p, s.src);
    /* 줄을 꺼내 쓰는 차례가 곧 읽는 차례여야 한다 — 위에서 아래, 왼쪽에서 오른쪽 */
    var slots = (s.slots || []).slice().sort(function (a, b) {
      if (Math.abs((a.top || 0) - (b.top || 0)) > 4) return (a.top || 0) - (b.top || 0);
      return (a.left || 0) - (b.left || 0);
    });

    var out = [], miss = 0, hit = 0;
    slots.forEach(function (x) {
      var txt = String((x && x.text) || '');

      /* 대괄호가 없어도 양식이 쓰는 자리 표시가 있다 — '주요 모듈 1', 'TEXT' */
      var tk = tokenSlot(txt, q);
      if (tk !== null) { out.push({ name: x.name, text: tk }); if (tk) hit++; return; }

      if (txt.indexOf('[') < 0) return;

      /* 양식이 디자이너에게 남긴 메모는 채우지 않고 지운다 */
      if (PH_NOTE.test(txt)) { out.push({ name: x.name, text: '' }); return; }

      /* 한 상자가 한 덩어리를 쓴다. '[내용 1][내용 2][내용 3]' 이 있는 상자는
         덩어리 하나를 통째로 받는다 — 덩어리를 한 줄로 늘어놓으면 짧은 덩어리
         뒤로 다음 상자의 줄이 밀려 들어온다(세 상자가 서로 섞였다). */
      var local = {};
      var flat = bare(txt);
      Object.keys(q).forEach(function (k) {
        /* 양식의 글에는 띄어쓰기가 있고('[상세 내용 1]') 줄 이름에는 없다.
           지우고 견줘야 맞는다 — 이것 때문에 환경 분석 장이 통째로 빠졌다. */
        if (flat.indexOf('[' + bare(k)) < 0) return;
        local[k] = q[k].groups ? (q[k].groups.shift() || []).slice() : q[k];
      });

      var v = phSub(txt, map, local, labels);
      if (v.miss) { miss++; return; }
      if (v.filled) hit++;
      if (!v.filled && v.text === txt) return;   /* 손댈 것이 없는 칸은 보내지 않는다 */
      /* '교육대상 : … / 교육장소 : … / 교육시간 : …' 처럼 여러 줄인 칸이 있다.
         줄 나눔을 눌러 버리면 세 줄이 한 줄로 뭉친다. */
      out.push({ name: x.name, text: fitLines(v.text, bigRoom(x, big)) });
    });
    return { slots: out, miss: miss, hit: hit };
  }

  /* 장 종류별로 채울 수 있는 자리표시자 — 이름 하나에 값 하나 */
  function phContent(p, src, seat) {
    var m = {};
    if (src === 'ops') {
      m['대상 내용'] = targetLine(p);
      m['장소 내용'] = p.ops.place || '';
      m['시간 내용'] = hoursLine(p);
      m['과정에 대한 방향성과 개요에 대한 내용'] = lines(p.approach.direction)[0] || '';
    }
    if (src === 'teachers') {
      /* 교수 장은 강사 수만큼 늘어난다. 어느 교수의 장인지 부르는 쪽이 정해 준다 —
         늘 첫 번째 교수를 쓰면 늘어난 장마다 같은 사람이 실린다. */
      var who = seat || pickedTeachers(p)[0];
      if (who) {
        m['소속'] = who.org || 'KMA 한국능률협회';
        /* 이 장의 '[성명] [직함]' 은 내 이름이 아니라 그 교수의 것이다 */
        m['성명'] = who.name || '';
        m['직함'] = who.rank || '주임교수';
        m['강의 분야 키워드'] = teacherField(who);
        m['경력 내용'] = teacherCareer(who);
        m['강사 전문성을 어필할 수 있는 내용'] = teacherPitch(p, who);
      }
    }
    if (src === 'direction') m['교육 설계 방향'] = lines(p.approach.direction)[0] || '';
    if (src === 'curriculum') {
      m['프로그램에 대한 전체 일정과 구성에 대한 내용'] = scheduleHeadline(p);
    }
    if (src === 'cover') {
      m['기업에 대한 긍정적 표현 메시지'] =
        (p.env && p.env.headline) || lines(p.context.situation)[0] || '';
    }
    if (src === 'situation' && p.env) {
      m['기업에 대한 경영 활동 정의'] = p.env.headline || '';
      m['기업 활동 요약'] = p.env.summary || '';
      m['교육 관련 내용 정의'] = p.env.quote || '';
    }
    if (src === 'modules') {
      /* '[교육을 통해 향상될 수 있는 역량, 교육 방향, 교육 핵심 키워드로 정리]' */
      m['교육을 통해 향상될 수 있는 역량'] = competenceHeadline(p);
    }
    if (src === 'outcome') {
      m['교육 만족도 조사 설계 방향'] =
        '교육 직후 만족도와 현업 적용도를 함께 물어, 다음 차수 설계에 반영합니다.';
      m['교육만족도 설문조사 문항'] = '교육만족도 설문조사 문항';
    }
    return m;
  }

  function competenceHeadline(p) {
    var ns = modNames(p).slice(0, 3);
    if (!ns.length) return '';
    /* '사례 분석 을 중심으로' 처럼 띄워 붙이던 것을 받침에 맞춰 붙인다 */
    var last = ns[ns.length - 1];
    return ns.join(' · ') + objJosa(last) + ' 중심으로 역량을 설계했습니다.';
  }

  /* 을/를 — 끝 글자 받침으로 고른다. 한글이 아니면(AI, HR …) 읽는 소리를 알 수 없어 '을(를)' 대신
     흔한 영문 끝소리 규칙만 쓴다: 자음으로 끝나면 '을', 모음이면 '를'. */
  function objJosa(word) {
    var s = String(word || '').replace(/[\s)\]」』"'”’.]+$/, '');
    var c = s.charCodeAt(s.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 ? '을' : '를';
    if (/[0-9]$/.test(s)) return /[013678]$/.test(s) ? '을' : '를';
    return /[aeiouyAEIOUY]$/.test(s) ? '를' : '을';
  }

  /* 여러 번 나오는 자리표시자 — 차례대로 하나씩 꺼내 쓴다.
     groups 로 주면 상자 하나가 덩어리 하나를 통째로 받는다. */
  function phQueues(p, src) {
    var q = {};
    if (src === 'ops') {
      /* 과정 개요 장의 세 상자 — 양식이 붙여 둔 이름표가 무엇을 넣을지 말해 준다.
         Starting From Why / Competency-Based Development / Data-Driven Improvement */
      q['내용'] = {
        groups: [
          three(p.context.problem || p.context.situation),
          three(p.approach.direction),
          three(p.outcome.changes)
        ]
      };
      /* '핵심 포인트 # ○○ # ○○ # ○○' — 회사 샘플은 '# 성과코칭 # 공정평가
         # 전원실습' 처럼 네댓 자다. 모듈 이름을 그대로 넣으면
         '# 성과관리 사이클과 팀장 역할 점검' 이 되어 칸을 넘는다.
         AI 가 뽑아 준 학습 키워드 가운데 짧은 것을 먼저 쓴다. */
      var kws = [];
      (p.approach.modules || []).forEach(function (m) {
        kws = kws.concat(m.keywords || []);
      });
      kws = uniq(kws.map(function (x) { return String(x).trim(); })
        .filter(function (x) { return x && x.length <= 10; }));
      q['키워드'] = (kws.length >= 3 ? kws : kws.concat(modNames(p))).slice(0, 3);
    }
    /* 역량 체계 장(Course Approach)은 세 묶음으로 짜여 있다.
       묶음 하나가 모듈 하나를 맡는다 —
         핵심가치·핵심역량·행동변화(표) | 교육 설계 칸 3개 | 교육 키워드 칸 4개
       전에는 '주요 모듈 1/2/3' 아홉 칸에 모듈 이름만 죽 늘어놓고
       키워드 열두 칸은 통째로 비워 뒀다. 묶음마다 그 모듈의 것을 채운다. */
    if (src === 'modules') {
      /* 이 장은 세 묶음이고, 묶음마다 두 열이 나란히 선다.
           교육 설계  ← 그 모듈에서 **무엇을 하는가** (소주제)
           교육 키워드 ← 그 모듈이 다루는 **개념·프레임워크** (키워드)
         회사 샘플이 그렇게 갈라 놓았다 —
           설계: '코칭 패러다임 전환' · '목표설정 코칭'
           키워드: '코칭형 리더십' · 'SMART 목표' · 'GROW 면담'
         둘을 섞으면 같은 말이 양쪽에 두 번 나온다(실제로 그랬다).
         칩은 117×28, 8pt 라 두 줄 × 열네 자 = 스물여덟 자까지 들어간다. */
      var ms = (p.approach.modules || []).slice(0, 3);
      var chips = [], keys = [];
      var seen = {};                       /* 온 장에서 같은 말이 두 번 나오지 않게 */
      function pick(pool, want, cap) {
        var out = [];
        for (var i = 0; i < pool.length && out.length < want; i++) {
          var v = String(pool[i] || '').trim();
          if (!v || seen[v]) continue;
          seen[v] = 1;
          out.push(fit(v, cap));
        }
        while (out.length < want) out.push('');   /* 모자라면 비운다 */
        return out;
      }
      ms.forEach(function (m) {
        var name = cleanTitle(m.title).replace(/^M\s*\d+\s*[.)]?\s*/i, '');
        var sub = subTopics(m);
        var kw = (m.keywords || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
        /* 설계 칸은 소주제가 먼저다. 모자라면 모듈 이름으로 메운다 — 키워드는 안 쓴다. */
        chips = chips.concat(pick(sub.concat([name]), 3, 26));
        /* 키워드 칸은 키워드만. 모자라면 비워 둔다 — 소주제를 끌어오면 왼쪽과 겹친다. */
        keys = keys.concat(pick(kw, 4, 26));
      });
      q['모듈명'] = chips;
      q['상세 내용 키워드'] = keys;
    }
    if (src === 'situation') Object.assign(q, envQueues(p));
    return q;
  }

  /* 이 장에 실린 모듈들의 묶음 이름. 다르면 첫 모듈 것을 쓴다. */
  function groupOfPage(mine) {
    var gs = uniq((mine || []).map(function (m) { return String(m.group || '').trim(); })
      .filter(Boolean));
    return gs[0] || '';
  }

  /* 총 N시간을 '09:00~17:00' 같은 하루 일과로. 점심 한 시간을 더해 셈한다. */
  function dayClock(h) {
    var n = Math.round(Number(h) || 0);
    if (!n) return '';
    var end = 9 + n + (n >= 5 ? 1 : 0);      /* 5시간 넘으면 점심 한 시간 */
    if (end > 18) end = 18;
    return '09:00~' + (end < 10 ? '0' : '') + end + ':00';
  }

  /* 모듈 상세의 '1) 소주제' 줄만 뽑는다 */
  function subTopics(m) {
    return String((m && m.detail) || '').split('\n')
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return /^\d\)/.test(x); })
      .map(function (x) { return x.replace(/^\d\)\s*/, '').replace(/[?？]$/, '').trim(); })
      .filter(Boolean);
  }

  /* ── 환경 분석 장 (정책·시장·사회·기술) ──────────────
     양식은 사분면 넷을 쓰고, 칸이 줄 단위로 섞여 놓여 있다.
     위 → 아래 · 왼 → 오른으로 읽으면 P1 · E1 · P2 · E2 · S1 · T1 · S2 · T2 차례다.
     (왼쪽 위 P, 오른쪽 위 E, 왼쪽 아래 S, 오른쪽 아래 T — 같은 줄끼리 짝지어 놓였다)
     그 차례로 줄을 세워 두면 칸마다 제 짝이 들어간다. */
  function envQueues(p) {
    var e = p.env;
    if (!e) return {};
    var fs = (e.factors || []).slice(0, 4);
    if (fs.length < 2) return {};
    var q = {};
    q['PEST분석중'] = fs.map(function (f) { return String(f.axis || ''); });

    var titles = [], details = [];
    /* (P,E) 한 짝, (S,T) 한 짝 — 짝마다 첫 근거 둘, 그 다음 두 번째 근거 둘 */
    [[0, 1], [2, 3]].forEach(function (pair) {
      for (var k = 0; k < 2; k++) {
        pair.forEach(function (i) {
          var pt = ((fs[i] || {}).points || [])[k] || {};
          titles.push(String(pt.title || ''));
          details.push(String(pt.detail || ''));
        });
      }
    });
    q['내용'] = titles;
    q['상세내용'] = details;
    q['기업활동정의'] = (e.identity || []).slice(0, 3).map(String);
    return q;
  }

  /* 대괄호 없이 양식이 비워 둔 자리.
     역량 지도의 칸은 '주요 모듈 1' 이라고만 적혀 있고, 일정표의 빈 칸은 'TEXT' 다.
     채울 것이 없으면 빈 글로 돌려 지운다 — 그대로 나가면 안 되는 글이다.
     해당 없으면 null 을 돌려 '내 일이 아니다' 라고 알린다. */
  function tokenSlot(txt, q) {
    var t = String(txt || '').trim();
    /* 이미 칸 크기에 맞춰 잘라 둔 값이다. 여기서 또 자르면 두 번 잘린다
       ('성과관리 사이클과 팀장 역할 점검' 이 '성과관리 사이클과 팀장…' 이 됐다). */
    if (/^주요\s*모듈\s*\d+$/.test(t)) {
      var list = q['모듈명'];
      return (list && list.length) ? list.shift() : '';
    }
    /* '상세 내용 키워드 1' — 역량 체계 장의 키워드 칸. 대괄호가 없어 자리표시자로
       안 잡혔고, 그래서 열두 칸이 그대로 고객에게 나갔다. */
    if (/^상세\s*내용\s*키워드\s*\d+$/.test(t)) {
      var kw = q['상세 내용 키워드'];
      return (kw && kw.length) ? kw.shift() : '';
    }
    if (/^TEXT$/.test(t)) return '';
    return null;
  }

  function modNames(p) {
    return (p.approach.modules || []).map(function (m) {
      return cleanTitle(m.title).replace(/^M\s*\d+\s*[.)]?\s*/i, '');
    }).filter(Boolean);
  }

  /* 세 줄로 맞춘다 — 모자라면 모자란 대로 둔다(억지로 채우지 않는다) */
  function three(text) { return lines(text).slice(0, 3); }

  /* 강사 프로필 장의 '[경력 내용 5~7개]'.
     회사 샘플은 이 칸에 학력 · 경력 · 자격을 한데 넣어 다섯 줄로 싣는다
     ('연세대학교 경영학 석사 / 前 AIG … / 자격) 심리분석상담사 1급 …').
     칸을 나눠 두지 않았으니 우리도 한 칸에 모아 넣는다.
     경력 한 줄만 나가면 '이력과 프로필이 안 들어갔다' 는 말이 나온다. */
  function teacherCareer(t) {
    var out = [];
    lines(t.edu).forEach(function (x) { out.push(x); });
    lines(t.career).forEach(function (x) { out.push(x); });
    var extra = lines(t.books);
    if (extra.length) out.push('저서) ' + extra.join(', '));
    var rec = lines(t.record);
    if (rec.length && !t.career) out.push('강의) ' + rec.join(', '));
    return uniq(out.filter(Boolean)).join('\n');
  }

  /* '[강의 분야 키워드 5~7개]' — 쉼표로 나열된 키워드가 그대로 들어간다 */
  function teacherField(t) {
    var f = String(t.field || '').trim();
    if (f) return f;
    return lines(t.record).join(', ');
  }

  /* 강사 소개 장의 머리말.
     강의 분야를 쉼표로 자르면 '리더십(코칭' 처럼 괄호 가운데가 끊긴다.
     괄호 안은 세부 항목이니 괄호째로 떼어 내고 앞쪽 큰 분야만 쓴다. */
  function teacherPitch(p, who) {
    var field = String(who.field || '').replace(/\([^)]*\)/g, '').trim();
    field = field.split(/[,·및]/)[0].replace(/\s+/g, ' ').trim();
    var rank = (who.rank || '주임교수') + subj(who.rank || '주임교수');
    if (!field) return '현업 경험과 강의 경력을 함께 갖춘 ' + rank + ' 진행합니다.';
    return field + ' 영역에서 현업 경험과 강의 경력을 함께 갖춘 ' + rank + ' 진행합니다.';
  }

  /* '이/가' — 받침이 있으면 '이'. '주임교수이 진행합니다' 로 나가면 안 된다. */
  function subj(word) {
    var ch = String(word || '').trim().slice(-1);
    var code = ch.charCodeAt(0);
    if (!(code >= 0xac00 && code <= 0xd7a3)) return '가';
    return ((code - 0xac00) % 28) ? '이' : '가';
  }

  function scheduleHeadline(p) {
    var bits = [];
    if (p.ops.days) bits.push(p.ops.days + '일');
    if (p.ops.hours) bits.push('총 ' + p.ops.hours + '시간');
    var n = (p.approach.modules || []).length;
    if (n) bits.push('모듈 ' + n + '개');
    if (!bits.length) return '';
    return bits.join(' · ') + ' 구성으로 진행합니다.';
  }

  function targetLine(p) {
    var bits = [];
    if (p.client.rank) bits.push(p.client.rank);
    if (p.ops.headcount) bits.push(p.ops.headcount + '명');
    return bits.join(' · ');
  }
  function hoursLine(p) {
    var bits = [];
    if (p.ops.days) bits.push(p.ops.days + '일');
    if (p.ops.hours) bits.push('총 ' + p.ops.hours + '시간');
    if (p.ops.sessions > 1) bits.push(p.ops.sessions + '차수');
    return bits.join(' · ');
  }

  /* 모듈이 양식의 칸보다 많으면 Program Details 장을 복제한다.
     복제는 파워포인트가 하고, 여기서는 '몇 장으로 늘릴지'만 정해
     뒤쪽 장 번호를 미리 밀어 둔다. */
  function repeatPlan(p, t) {
    var room = detailRoom(t);
    var need = room ? (Math.ceil((p.approach.modules || []).length / room) || 1) : 1;
    /* 교수 장은 한 장에 한 명이다. 고른 교수가 셋이면 세 장으로 늘린다 —
       커리큘럼에 맞춰 교수를 셋 넣었는데 프로필이 한 명만 실리면 반쪽이다. */
    var who = pickedTeachers(p).length || 1;
    var seats = (t.slides || []).filter(function (s) { return s.src === 'teachers'; }).length || 1;
    var teach = Math.ceil(who / seats) || 1;

    var out = [];
    (t.slides || []).forEach(function (s) {
      if (isSample(s) || s.src === 'skip') return;
      if (s.src === 'detail' && need > 1) out.push({ no: s.no, times: need });
      if (s.src === 'teachers' && teach > 1) out.push({ no: s.no, times: teach });
    });
    return out;
  }

  function fillPlan(p) {
    var t = template(p.templateId);
    if (t.kind !== 'pptx') return null;
    useShort(p);     /* AI 가 칸에 맞게 줄여 둔 글을 fit() 이 꺼내 쓰게 */
    var fill = [], drop = [];

    /* 늘어난 장 때문에 뒤쪽 번호가 밀린다. 파워포인트는 복제를 맨 먼저 하므로
       여기서 보내는 모든 번호는 '늘어난 뒤' 기준이어야 한다. */
    var reps = repeatPlan(p, t);
    function shift(no) {
      var d = 0;
      reps.forEach(function (r) { if (r.no < no) d += r.times - 1; });
      return no + d;
    }

    /* 교수 장은 한 장에 한 명이다. 고른 교수 수보다 장이 많으면 남는 장은 뺀다 —
       그대로 두면 예전 건의 교수 프로필이 그대로 실려 나간다. */
    var picked = pickedTeachers(p);
    var teacherSeat = 0;

    /* 표를 채우는 장에는 본문 글을 붓지 않는다.
       견적 장의 큰 글상자는 대개 "※ 교재비 미포함" 같은 안내 문구라,
       거기에 예산 줄을 덮어쓰면 고객이 읽어야 할 조건이 사라진다. */
    var jobs = tableJobs(p, t, reps, shift);
    /* '이 장은 표로 채운다' 는 표시. 늘어난 뒤 번호가 아니라 양식의 원래 번호로
       적어 둔다 — 아래에서 양식 장을 훑을 때 원래 번호로 물어보기 때문이다. */
    var tabled = {};
    jobs.forEach(function (j) { if (j.from) tabled[j.from] = true; });

    var room = detailRoom(t);
    var detailSeat = 0;
    /* 양식이 이름표로 쓰는 대괄호 — 샘플 장에 남아 있는 것으로 알아낸다 */
    var labels = labelSet(t);
    /* 샘플 장의 같은 이름 도형 — 빈 양식보다 실제 자리를 정확히 말해 준다 */
    var big = sampleSlots(t);

    (t.slides || []).forEach(function (s) {
      /* 샘플 장은 무슨 일이 있어도 빠진다.
         양식 저자가 모서리에 'sample' 이라고 적어 둔 장이고, 안에는 남의 고객사
         제안서가 그대로 들어 있다. 판정(src)은 화면에서 사람이 바꿀 수 있으니
         판정에만 맡기지 않고 여기서 한 번 더 막는다 — 완성본에 있으면 안 되는 장이다. */
      if (isSample(s)) { drop.push(shift(s.no)); return; }
      if (s.src === 'skip') { drop.push(shift(s.no)); return; }
      if (s.src === 'keep') return;

      /* Program Details — 늘어난 장마다 모듈 두 개씩 나눠 담는다 */
      if (s.src === 'detail') {
        var times = 1;
        reps.forEach(function (r) { if (r.no === s.no) times = r.times; });
        var base = shift(s.no);
        var any = false;
        for (var k = 0; k < times; k++) {
          var ds = detailSlots(p, s, k * room, detailSeat + k, big);
          if (!ds) continue;
          /* 모듈이 하나도 안 들어가는 장은 뺀다 */
          var real = ds.filter(function (x) { return x.text; });
          if (!real.length) { drop.push(base + k); continue; }
          fill.push({ no: base + k, slots: ds });
          any = true;
        }
        detailSeat += times;
        if (!any) drop.push(base);
        return;
      }

      /* 교수 장 — 늘어난 장마다 다른 교수를 싣는다.
         커리큘럼에 맞춰 교수를 셋 넣었으면 프로필도 셋 나가야 한다.
         교수가 모자라 남는 장은 뺀다 — 그대로 두면 예전 건의 프로필이 실려 나간다. */
      if (s.src === 'teachers') {
        var tTimes = 1;
        reps.forEach(function (r) { if (r.no === s.no) tTimes = r.times; });
        var tBase = shift(s.no);
        for (var j = 0; j < tTimes; j++) {
          var who = picked[teacherSeat + j];
          if (!who) { drop.push(tBase + j); continue; }
          /* 양식이 '[강의 분야]' 처럼 칸을 지정해 뒀으면 그 칸에 정확히 넣는다 */
          var tp = phSlots(p, s, labels, big, who);
          /* 얼굴 사진 — 양식이 동그란 자리를 비워 두었다. 주소만 넘기면 relay 가 받아 넣는다. */
          if (tp.hit) {
            fill.push({ no: tBase + j, slots: tp.slots, teacher: who, photo: who.photo || '' });
            continue;
          }
          fill.push({ no: tBase + j, title: s.title, body: teacherLines(who),
                      teacher: who, photo: who.photo || '' });
        }
        teacherSeat += tTimes;
        return;
      }

      /* 양식이 대괄호로 자리를 지정해 둔 장은 그 자리만 갈아 끼운다.
         못 채운 자리가 하나라도 있으면 그 장은 뺀다 — '[상세 내용]' 이
         그대로 고객에게 나가는 것보다 장이 빠지는 편이 낫다. */
      if (phOf(s).length) {
        var pf = phSlots(p, s, labels, big);
        if (pf.hit && !pf.miss) { fill.push({ no: shift(s.no), slots: pf.slots }); return; }
        if (!tabled[s.no]) { drop.push(shift(s.no)); return; }
        fill.push({ no: shift(s.no), slots: pf.slots });
        return;
      }

      if (s.src === 'cover') {
        var cs = coverSlots(p, s);
        if (cs && cs.length) { fill.push({ no: shift(s.no), slots: cs }); return; }
      }
      var b = bulletsFor(s.src, p, s);
      /* 표지는 첫 줄이 곧 제목이다. 제목 칸과 본문에 같은 글이 두 번 들어가지 않게 나눈다. */
      if (s.src === 'cover' && b.length) {
        fill.push({ no: shift(s.no), title: b[0], body: b.slice(1) });
        return;
      }
      /* 도형이 여럿인 장은 도형마다 따로 채운다.
         큰 글상자 하나만 바꾸면 나머지에 예전 고객사 글이 그대로 남는다. */
      var slots = slotPlan(p, s);
      if (slots && slots.length) {
        fill.push({ no: shift(s.no), title: s.src === 'cover' ? (b[0] || s.title) : s.title, slots: slots });
        return;
      }

      /* 넣을 내용이 없으면 그 장은 뺀다.
         빈 채로 두면 채우기가 그 장을 건드리지 않아 예전 고객사의 글이 그대로 남는다.
         비어 나가는 편이 남의 내용이 실려 나가는 것보다 낫다. */
      if (!b.length && !tabled[s.no]) { drop.push(shift(s.no)); return; }

      /* 표만 채우는 장은 글상자를 건드리지 않는다.
         PPT_FILL 은 제목 칸이 따로 없으면 '맨 위 글상자' 를 제목으로 본다.
         이 양식은 맨 위가 『 2026 … 』 머리말이라, 제목을 써 넣으면 머리말이
         견적 안내문으로 덮여 버렸다. */
      if (tabled[s.no]) return;

      fill.push({ no: shift(s.no), title: s.title, body: b });
    });
    return {
      templateId: t.fileId, fill: fill, drop: drop, repeat: reps,
      tables: jobs, replace: swapList(p, t),
      /* 레이아웃에 박힌 '2026 ○○ … 제안서' 머리말을 이번 건으로 (pptx.set_header) */
      header: headerLine(p.client && p.client.company, courseName(p), '제안서')
    };
  }

  /* 장마다 머리에 찍히는 한 줄 — '2026 (주)코스콤 증권사 주제강연 결과 보고서' */
  function headerLine(company, course, kind) {
    var c = tidyCourse(course);
    var co = String(company || '').trim();
    if (!c && !co) return '';
    return [String(new Date().getFullYear()), co, c, kind].filter(Boolean).join(' ');
  }

  /* ── 도형 단위 채우기 ────────────────────────────────
     양식의 한 장은 '작은 제목 + 설명' 짝이 여러 개로 짜여 있는 일이 많다.
     (특장점 1·2·3 처럼) 큰 글상자 하나만 바꾸면 나머지에 예전 글이 남는다.

     양식을 읽을 때 도형마다 글자 수·줄 수·위치를 재 뒀으므로,
     읽는 차례(위 → 아래, 왼 → 오른)대로 짝을 찾아 우리 내용을 끼운다.
     '교육 목표' 같은 짧은 이름표는 건드리지 않는다 — 그건 양식의 뼈대다. */
  function slotPlan(p, s) {
    var items = slotItems(p, s.src);
    if (!items.length) return null;

    var slots = (s.slots || []).filter(function (x) { return x && x.chars >= 12; });
    if (slots.length < 2) return null;

    slots = slots.slice().sort(function (a, b2) {
      if (Math.abs(a.top - b2.top) > 40000) return a.top - b2.top;   /* 40000 EMU ≈ 0.04인치 */
      return a.left - b2.left;
    });

    /* 짧은 것은 작은 제목, 긴 것은 설명으로 본다 */
    var out = [], i = 0;
    for (var k = 0; k < slots.length && i < items.length; k++) {
      var sl = slots[k];
      var next = slots[k + 1];
      var isHead = next && sl.chars < next.chars && sl.chars <= 40;
      if (isHead) {
        out.push({ name: sl.name, text: fit(items[i].title, sl.chars) });
        out.push({ name: next.name, text: fit(items[i].body || items[i].title, next.chars) });
        k++;
      } else {
        out.push({ name: sl.name, text: fit(items[i].body || items[i].title, sl.chars) });
      }
      i++;
    }
    /* 우리 내용이 모자라 남은 도형은 비운다 — 예전 글을 남기지 않는다 */
    for (; k < slots.length; k++) out.push({ name: slots[k].name, text: '' });
    return out;
  }

  /* 그 장에 들어갈 '작은 제목 + 설명' 목록 */
  function slotItems(p, src) {
    var ms = p.approach.modules || [];
    if (src === 'modules' || src === 'curriculum') {
      return ms.map(function (m) {
        return { title: cleanTitle(m.title), body: m.detail || m.method || '' };
      });
    }
    if (src === 'direction') {
      /* 직접 쓴 글이 '제목 — 설명' 꼴이면 그대로 쓴다.
         그냥 줄글이면 쪼개지 않는다 — 가운뎃점으로 자르면 "조직 이해 / 일하는 방식 성장 설계"
         처럼 말이 끊긴다. 그럴 때는 모듈이 이미 제목·설명으로 나뉘어 있으니 그쪽을 쓴다. */
      var pairs = asPairs(p.approach.direction);
      if (pairs) return pairs;
      return ms.map(function (m) {
        return { title: cleanTitle(m.title), body: m.detail || m.method || '' };
      });
    }
    if (src === 'outcome') {
      var op = asPairs(p.outcome.changes);
      if (op) return op;
      return ms.map(function (m) {
        return { title: cleanTitle(m.title), body: m.detail || '' };
      });
    }
    return [];
  }

  /* "제목 — 설명" 또는 "제목: 설명" 으로 적힌 줄만 짝으로 본다.
     구분 기호가 없으면 null 을 돌려 '쪼개지 말라'고 알린다. */
  function asPairs(text) {
    var ls = lines(text);
    if (ls.length < 2) return null;
    var hit = ls.filter(function (t) { return /\s[—–:]\s/.test(t); });
    if (hit.length < ls.length) return null;
    return ls.map(function (t) {
      var m = /^(.*?)\s[—–:]\s(.*)$/.exec(t);
      return { title: m[1].trim(), body: m[2].trim() };
    });
  }

  /* 양식에 남아 있는 예전 건의 이름을 이번 건으로 바꾼다.
     채우기는 장마다 몇 칸만 건드리므로, 나머지에는 예전 고객사 이름이 그대로 남는다.
     양식을 올릴 때 적어 둔 '예전 고객사·과정'을 여기서 갈아 끼운다. */
  function swapList(p, t) {
    var sw = t.swap || {};
    var out = [];
    function add(from, to) {
      from = String(from || '').trim();
      to = String(to || '').trim();
      if (from && to && from !== to) out.push({ from: from, to: to });
    }
    /* 예전 고객사 이름이 자리표시자 낱말이면 바꾸지 않는다.
       '연도' 를 고객사로 잘못 집어 두면 '[연도]' 가 '[한라시멘트]' 가 되고,
       진짜 연도 치환이 그 뒤로 영영 안 먹는다. 짐작이 틀렸을 때의 피해가 크다. */
    if (!PH_WORD.test(String(sw.company || '').trim())) add(sw.company, p.client.company);
    if (!PH_WORD.test(String(sw.course || '').trim())) add(sw.course, courseName(p));
    (sw.extra || []).forEach(function (pair) { add(pair.from, pair.to); });

    /* 양식이 어느 장에나 박아 둔 자리표시자.
       머리말 『 [연도] [기업명] [프로그램명] 』 은 2장부터 17장까지 다 있고,
       마지막 연락처 장에는 [성명]·[직함]·[이메일 주소] 가 있다.
       KMA 소개 장은 '손대지 않는 장' 이라 칸을 채우는 쪽으로는 닿지 않으니,
       모든 장·표·머리말을 훑는 바꿔치기로 처리한다.
       채울 값이 없으면 지운다 — '[성명]' 이 그대로 고객에게 가면 안 된다. */
    var every = phEvery(p);
    Object.keys(every).forEach(function (k) {
      out.push({ from: '[' + k + ']', to: String(every[k] || '') });
    });
    /* 『  』 안이 통째로 비면 괄호만 남는다. 그럴 땐 머리말을 아예 지운다. */
    if (!p.client.company && !courseName(p)) out.push({ from: '『  』', to: '' });

    /* 견적 장 안내문은 '15명 기준 운영 비용은…' 으로 박혀 있다.
       인원이 다르면 견적표 숫자와 안내문이 어긋나 보인다. */
    if (p.ops.headcount) out.push({ from: '15명 기준', to: p.ops.headcount + '명 기준' });

    /* 마지막 그물 — AI 는 고객사를 모르므로 '○○사' 라고 쓴다.
       받을 때 되돌리지만(views.restoreName), 손으로 붙여 넣은 글이나
       예전에 만들어 둔 건에는 그대로 남아 있을 수 있다.
       고객에게 '○○사' 가 나가는 것만은 여기서 막는다. */
    var co = String(p.client.company || '').trim();
    ['○○사', '○○', '◯◯사', '◯◯', 'XX사', 'OO사'].forEach(function (x) {
      out.push({ from: x, to: co || '귀사' });
    });
    return out;
  }

  /* 제목에서 고객사 이름을 뺀 과정 이름 */
  /* ── 표지 ────────────────────────────────────────────
     표지 양식은 대개 '2026 고객사 이름'(작은 글씨) / '제안 과정명 제안서'(큰 글씨) /
     날짜 / 'Connect Values Navigate Growth' 같은 문구로 돼 있다.
     예전에는 제목 상자를 '[고객사] 과정명' 한 줄로 통째로 갈고, 남은 글(우리 팀·
     담당자 귀하·날짜)을 가장 큰 다른 상자에 부었다 — 그게 오른쪽 문구 자리여서
     'KMA 인재개발센터 / ○○ 부서장 귀하' 가 제목 위에 겹쳐 나갔다.
     이제는 상자를 갈지 않고 **낱말만** 바꾼다. 고객사·과정명·날짜 자리만 바뀌고
     줄마다의 글씨 크기와 나머지 문구는 양식 그대로 남는다. */
  var COVER_CO = /\[?(?:고객사\s*(?:이름|명)|기업\s*명|회사\s*명)\]?/;
  var COVER_COURSE = /\[?(?:제안\s*)?(?:교육\s*)?(?:과정\s*명|프로그램\s*명|교육\s*명)\]?/;
  var COVER_YEAR = /\[연도\]|\b20\d\d(?=\s)/;
  var COVER_DATE = /20\d\d\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}\s*\.?(?:\s*\(?[월화수목금토일]요일\)?)?/;

  function coverDate(like) {
    var d = new Date();
    var pad = /\.\s*0\d/.test(like);
    var mm = d.getMonth() + 1, dd = d.getDate();
    var s = d.getFullYear() + '. ' + (pad && mm < 10 ? '0' : '') + mm + '. ' + (pad && dd < 10 ? '0' : '') + dd + '.';
    var wk = /([월화수목금토일])요일/.exec(like);
    if (wk) s += ' ' + '일월화수목금토'.charAt(d.getDay()) + '요일';
    return s;
  }

  /* 과정명을 표지·머리말에 쓸 수 있는 이름꼴로.
     과정명은 문의 제목에서 '문의드립니다' 만 떼어 만든 것이라
     '증권사에 주제강연을' 처럼 문장 조각이 표지에 그대로 찍혔다.
     끝의 부탁 말투와 조사를 떼고, 낱말 끝 '에'(○○사에 △△)는 띄어 쓴다. */
  function tidyCourse(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    s = s.replace(/\s*(관련|에\s*대한|에\s*관한)?\s*(문의|요청|의뢰|부탁|섭외|견적|상담)\s*(드립니다|드려요|합니다|해요|드림|바랍니다|원합니다)?[.!?]*$/, '');
    s = s.replace(/\s*(부탁|요청)?\s*(드립니다|드려요|바랍니다|원합니다)[.!?]*$/, '');
    /* 끝에 매달린 부탁·절차 낱말과 괄호 메모를 떼어 낸다 — 더 뗄 게 없을 때까지.
       '…교육 관련', '…CS강사 섭외 가능여부', '…제안 및 견적 요청 ('26년 4분기 파일럿 / …)' */
    for (var guard = 0; guard < 6; guard++) {
      var before = s;
      s = s.replace(/\s*[(（\[][^()（）\[\]]*[)）\]]\s*$/, '')
           .replace(/\s*(제안\s*및\s*견적|견적\s*및\s*제안)\s*(요청|문의)?$/, '')
           .replace(/\s*(섭외|진행|운영)?\s*가능\s*여부$/, '')
           .replace(/\s*(관련|건|요청|문의|섭외|견적|제안|의뢰|검토)$/, '')
           .replace(/[\s·,\-–~/]+$/, '').trim();
      if (s === before) break;
    }
    s = s.replace(/(\S)(을|를)$/, '$1');
    /* '코스콤이 주관하는 증권사 CIO/CISO 포럼행사' → '코스콤 주관 증권사 CIO/CISO 포럼행사' —
       문장 꼴을 이름 꼴로 */
    s = s.replace(/(\S+?)(이|가)\s+(주관|주최|주재|개최|운영|진행)하는\s+/g, '$1 $3 ');
    /* '… 맞춤 강연 — 본사를 만들 것인가, 가맹점을 열 것인가' — 부제는 떼어 낸다.
       과정 이름은 표지·머리말·'왜 ○○이 필요한가?' 에 거듭 들어가 길면 곳곳이 넘친다. */
    var sub = s.split(/\s+[—–]\s+|\s*:\s+/);
    if (sub.length > 1 && sub[0].length >= 8) s = sub[0];
    s = s.replace(/(\S{2,})에\s+(?!대한|관한|따른|의한|걸친)/g, '$1 ');
    s = s.replace(/\s*(제안서|결과\s*보고서)\s*$/, '');
    return s.replace(/[\s·,\-–~]+$/, '').trim();
  }

  function coverSlots(p, s) {
    var co = String((p.client && p.client.company) || '').trim();
    var course = tidyCourse(courseName(p));
    var out = [], named = false;
    (s.slots || []).forEach(function (x) {
      if (!x || !x.name) return;
      var t = String(x.text || '');
      var swap = [], m;
      if (co && (m = COVER_CO.exec(t))) { swap.push([m[0], co]); named = true; }
      if (course && (m = COVER_COURSE.exec(t))) { swap.push([m[0], course]); named = true; }
      /* 연도는 고객사·과정 자리가 있는 상자에서만 — 다른 곳의 '2026' 은 건드리지 않는다 */
      if (swap.length && (m = COVER_YEAR.exec(t))) swap.push([m[0], String(new Date().getFullYear())]);
      if ((m = COVER_DATE.exec(t))) swap.push([m[0], coverDate(m[0])]);
      if (swap.length) out.push({ name: x.name, swap: swap });
    });
    /* 고객사·과정 자리를 하나도 못 찾은 양식은 예전 방식으로 채운다 */
    return named ? out : null;
  }

  function courseName(p) {
    var co = String((p.client && p.client.company) || '').trim();
    /* AI 가 지어 준 과정 이름 — 그 뒤로 제목을 사람이 고치지 않았을 때만 */
    var ai = p.course && p.course.name && p.course.forTitle === p.title ? String(p.course.name) : '';
    var t = (ai || String(p.title || '')).trim();
    t = stripCompany(t, co);
    return t || (p.approach.direction || '').split('\n')[0] || '';
  }

  /* 앞에 붙은 고객사 이름을 뗀다 — '(주)코스콤' 이든 '코스콤' 이든 */
  function stripCompany(t, co) {
    if (!co) return t;
    var bareCo = co.replace(/^\s*(\(주\)|㈜|주식회사)\s*|\s*(\(주\)|㈜|주식회사)\s*$/g, '').trim();
    [co, bareCo].forEach(function (n) {
      if (n && t.indexOf(n) === 0) t = t.slice(n.length).replace(/^\s*(의|을 위한)?\s+/, ' ').trim();
    });
    return t;
  }

  /* ── 양식의 표 채우기 ───────────────────────────────
     양식에 이미 놓인 표가 곧 '이 모양으로 넣어라'는 명세다.
     머리글을 읽어 어떤 표인지 알아내고, 우리 데이터를 그 열 차례에 맞춰 넣는다.
     표를 새로 그리지 않으므로 회사 양식의 테두리·색·글꼴이 그대로 남는다. */
  function tableJobs(p, t, reps, shift) {
    var jobs = [];
    var picked = pickedTeachers(p);
    var seat = 0;
    (t.slides || []).forEach(function (s) {
      if (s.src === 'skip' || isSample(s)) return;

      /* 늘어난 장에도 표가 그대로 복제된다. 복제본마다 따로 채워야
         둘째·셋째 장의 표가 양식 그대로 나가지 않는다. */
      var times = 1;
      (reps || []).forEach(function (r) { if (r.no === s.no) times = r.times; });
      var base = shift ? shift(s.no) : s.no;

      for (var k = 0; k < times; k++) {
        /* 교수 장의 표는 세로다 — 왼쪽에 '성명·학력·경력', 오른쪽에 값.
           줄을 늘리는 표가 아니라 값만 갈아 끼우면 되므로 따로 다룬다.
           같은 장에 유사 프로젝트 표도 있으니 아래에서 계속 훑는다. */
        var slideWho = null;
        if (s.src === 'teachers') {
          slideWho = picked[seat + k] || null;
          if (slideWho) {
            jobs.push({ slide: base + k, from: s.no, vertical: true, pairs: teacherPairs(slideWho) });
          }
        }
        /* eslint-disable no-loop-func */
        (function (copy, mine) {
          (s.tables || []).forEach(function (tb) {
            var heads = (tb.headers || []).map(function (h) { return String(h).replace(/\s/g, ''); });
            var job = null;
            if (heads.some(function (h) { return /모듈명|과목명|교과목/.test(h); })) job = curriculumJob(p, tb);
            /* 줄 수가 정해진 견적표는 칸을 짚어 채운다. 줄을 늘리면 세로 병합이 깨진다. */
            else if (isQuoteGrid(tb)) job = quoteJob(p, tb);
            else if (heads.some(function (h) { return /단가|금액/.test(h); })) job = budgetJob(p, tb);
            /* 아래는 줄 수가 양식에 이미 정해진 표다. 줄을 늘리지 않고 칸만 짚어 채운다. */
            else if (heads.some(function (h) { return /golden\s*circle/i.test(h); })) job = goldenJob(p, tb);
            else if (heads.some(function (h) { return /핵심가치/.test(h); })) job = valuesJob(p, tb);
            else if (heads.some(function (h) { return /핵심주제|고객사/.test(h); })) job = recordJob(p, tb, mine);
            else if (isSchedule(tb)) job = scheduleJob(p, tb);
            /* 채울 것이 없는 유사 프로젝트 표 — 표와 이름표를 지운다 */
            if (job && job.remove) {
              var label = (s.slots || []).filter(function (x) {
                return /유사\s*프로젝트/.test(String(x.text || '')) && String(x.text || '').length < 20;
              })[0];
              jobs.push({ slide: base + copy, from: s.no, remove: [tb.name].concat(label ? [label.name] : []) });
              return;
            }
            if (job && ((job.rows && job.rows.length) || (job.cells && job.cells.length))) {
              job.slide = base + copy;
              job.from = s.no;
              job.headers = tb.headers;
              jobs.push(job);
            }
          });
        })(k, slideWho);
        /* eslint-enable no-loop-func */
      }
      if (s.src === 'teachers') seat += times;
    });
    return jobs;
  }

  /* ── 줄 수가 정해진 표 ───────────────────────────────
     일정표·Golden Circle·역량표·설문표는 양식이 줄까지 다 잡아 둔 표다.
     줄을 늘리면 표가 슬라이드 밖으로 밀려 나가므로, 칸을 좌표로 짚어 값만 넣는다.
     왼쪽 이름표('08:00 – 09:00', 'Why', '번호')는 그대로 둔다. */

  function grid(tb) { return (tb && tb.cells) || []; }
  function cellAt(tb, r, c) {
    var g2 = grid(tb);
    return String((g2[r - 1] || [])[c - 1] || '');
  }

  /* 전체 일정표 — 첫 열이 '08:00 – 09:00' 같은 시간 띠면 일정표로 본다 */
  function isSchedule(tb) {
    if ((tb.cols || 0) < 3 || (tb.rows || 0) < 6) return false;
    var n = 0;
    for (var r = 1; r <= Math.min(20, tb.rows); r++) {
      if (/\d{1,2}\s*:\s*\d\d\s*[–\-~]\s*\d{1,2}\s*:\s*\d\d/.test(cellAt(tb, r, 1))) n++;
    }
    return n >= 4;
  }

  /* 일정표 채우기.
       r1  일차 | 1일차 (8시간) | 2일차 (8시간) | …
       r2  요일 | 5월 18일(월)  | …
       r3~ 시간 띠마다 그 시간에 하는 모듈
     모듈을 시간만큼 위에서 아래로 놓는다. 점심 띠는 '중식' 으로 남긴다.
     날수가 양식의 열보다 적으면 남는 열은 비운다 — 'TEXT' 가 그대로 나가면 안 된다. */
  function scheduleJob(p, tb) {
    var have = (tb.cols || 4) - 1;                  /* 양식이 잡아 둔 날짜 열 수 */
    /* 날수를 양식에 맞춰 자르지 않는다. 전에는 3일 과정을 넣어도 양식이 2일치면
       3일차가 통째로 사라졌다 — 고객이 받는 일정표에서 하루가 없어지는 셈이다.
       모자라면 열을 늘리고, 남으면 지운다. 양식보다 내용이 먼저다. */
    var days = Math.max(Number(p.ops.days) || 1, 1);
    /* 다만 한 장에 들어갈 수 있는 만큼까지다. 여섯 날이 넘으면 글씨가 깨알이 된다. */
    if (days > 6) days = 6;
    var ms = (p.approach.modules || []).slice();
    if (!ms.length) return null;

    /* 시간 띠를 읽는다 — 양식이 적어 둔 그대로 쓴다 */
    var bands = [];
    for (var r = 1; r <= Math.min(20, tb.rows); r++) {
      var lab = cellAt(tb, r, 1);
      var m = /(\d{1,2})\s*:\s*(\d\d)\s*[–\-~]\s*(\d{1,2})\s*:\s*(\d\d)/.exec(lab);
      if (m) bands.push({ r: r, from: Number(m[1]), to: Number(m[3]) });
    }
    if (!bands.length) return null;

    /* 점심(12시를 지나는 띠)과 이른 아침 한 띠는 교육에 쓰지 않는다 */
    var teach = bands.filter(function (b) { return b.from >= 9 && b.from !== 12; });
    var lunch = bands.filter(function (b) { return b.from === 12; });
    var early = bands.filter(function (b) { return b.from < 9; });
    var perDay = Math.ceil(teach.length);

    /* 하루에 몇 시간씩 갈지 — 총 시간을 날수로 나누되 띠 수를 넘지 않게 */
    var total = ms.reduce(function (a, x) { return a + (Number(x.hours) || 1); }, 0);
    var want = Math.min(perDay, Math.ceil(total / days));

    var cells = [];
    /* 모듈을 시간 줄 위에 늘어놓는다 — [시작, 끝) 시간 단위(소수 가능).
       예전에는 한 칸에 한 시간씩 모듈 하나를 채웠다. 0.5·0.75시간짜리 모듈이 섞인
       2시간 특강에서 M3 이 일정표에서 통째로 빠졌다. 한 칸에 두 모듈이 걸치면 함께 적는다. */
    var spans = [], clock0 = 0;
    ms.forEach(function (m, i) {
      var hh = Number(m.hours) || 1;
      spans.push({ i: i, from: clock0, to: clock0 + hh, m: m });
      clock0 += hh;
    });
    var dayStart = 0;
    var when = dayLabels(p, days);
    for (var d = 0; d < days; d++) {
      var col = d + 2;
      var used = 0;
      var dayHours = 0;
      cells.push({ r: 1, c: col, text: (d + 1) + '일차' });      /* 시간은 아래에서 다시 적는다 */
      /* '요일' 줄 — 날짜를 알면 적고, 모르면 비워 두지 않고 그렇게 적는다.
         이름표만 있고 칸이 비면 덜 만든 표로 보인다. */
      if (tb.rows >= 2 && /요일|월\s*O?\s*일/.test(cellAt(tb, 2, 1))) {
        cells.push({ r: 2, c: col, text: when[d] });
      }
      early.forEach(function (b) {
        cells.push({ r: b.r, c: col, text: d === 0 ? '입소' : '집결' });
      });
      lunch.forEach(function (b) { cells.push({ r: b.r, c: col, text: '중식' }); });

      var tail = [];
      for (var k = 0; k < teach.length; k++) {
        var b2 = teach[k];
        var t0 = dayStart + used, t1 = t0 + 1;
        if (used >= want || t0 >= total - 1e-9) { tail.push(b2); continue; }
        var inBand = spans.filter(function (s) { return s.from < t1 - 1e-9 && s.to > t0 + 1e-9; });
        var label = inBand.map(function (s) {
          return '[M' + (s.i + 1) + '] ' + cleanTitle(s.m.title).replace(/^M\s*\d+\s*[.)]?\s*/i, '');
        }).join(' · ');
        cells.push({ r: b2.r, c: col, text: fit(label, inBand.length > 1 ? 64 : 40) });
        used++;
      }
      dayHours = Math.round((Math.min(total, dayStart + used) - dayStart) * 100) / 100;
      dayStart += used;
      /* 수업이 끝난 뒤 남는 띠. 마지막 날은 '퇴소', 그 앞 날은 비운다.
         (회사 샘플도 마지막 날 끝 두 칸이 '퇴소' 다) */
      tail.forEach(function (b) {
        cells.push({ r: b.r, c: col, text: (d === days - 1) ? '퇴소' : '' });
      });
      cells.push({ r: 1, c: col, text: (d + 1) + '일차 (' + dayHours + '시간)' });
    }
    /* 남거나 모자라는 날짜 열을 맞춘다.
       남으면 지운다 — 비우기만 하면 '3일차가 비어 있는 표' 로 보인다.
       모자라면 늘린다 — 자르면 하루가 통째로 없어진 일정표가 나간다. */
    var drop = [];
    for (var c2 = days + 2; c2 <= (tb.cols || 4); c2++) drop.push(c2);

    /* 하루짜리 짧은 과정 — 2시간 특강에 08시~18시 하루 일정표가 나가고 남는 칸마다
       '퇴소' 가 찍혔다. 수업이 없는 줄(입소·끝난 뒤, 수업 전에 끝나는 날의 점심)을 지운다. */
    var dropRows = [];
    if (days === 1) {
      var usedRows = cells.filter(function (c) { return c.c === 2 && /^\[M\d+\]/.test(c.text || ''); })
        .map(function (c) { return c.r; });
      if (usedRows.length && usedRows.length < teach.length) {
        var first = Math.min.apply(null, usedRows), last = Math.max.apply(null, usedRows);
        bands.forEach(function (b) {
          if (b.r < first || b.r > last) dropRows.push(b.r);
        });
        cells = cells.filter(function (c) { return dropRows.indexOf(c.r) < 0; });
      }
    }
    return {
      name: tb.name, cells: cells,
      dropCols: drop.length ? drop : undefined,
      dropRows: dropRows.length ? dropRows : undefined,
      addCols: days > have ? days - have : undefined
    };
  }

  /* 일정표의 '요일' 줄. 교육 기간에 날짜가 적혀 있으면 그대로 세고,
     '2026년 8월' 처럼 달만 적혀 있으면 정해지지 않았다고 말한다. */
  var WDAY = ['일', '월', '화', '수', '목', '금', '토'];
  function dayLabels(p, days) {
    var s = String(p.ops.period || '');
    var m = /(\d{4})[.\-\/년]\s*(\d{1,2})[.\-\/월]\s*(\d{1,2})/.exec(s);
    var out = [];
    if (m) {
      var d0 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      for (var i = 0; i < days; i++) {
        var d = new Date(d0.getTime() + i * 86400000);
        out.push((d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + WDAY[d.getDay()] + ')');
      }
      return out;
    }
    for (var j = 0; j < days; j++) out.push('협의 후 확정');
    return out;
  }

  /* Golden Circle — Why / How / What 세 줄, 오른쪽 칸에 '한 줄 요약 + 근거 넷' */
  function goldenJob(p, tb) {
    var ms = p.approach.modules || [];
    var want = [
      { re: /why/i, head: '왜 지금 이 교육이 필요한가',
        body: lines(p.context.problem).concat(lines(p.context.situation)) },
      { re: /how/i, head: '어떻게 진행하는가',
        body: lines(p.approach.direction).concat(lines(p.approach.method)) },
      { re: /what/i, head: '무엇을 다루는가',
        body: ms.map(function (m) {
          return cleanTitle(m.title).replace(/^M\s*\d+\s*[.)]?\s*/i, '') +
                 (m.hours ? ' (' + m.hours + 'H)' : '');
        }) }
    ];
    var cells = [];
    for (var r = 1; r <= Math.min(20, tb.rows); r++) {
      var lab = cellAt(tb, r, 1);
      for (var i = 0; i < want.length; i++) {
        if (!want[i].re.test(lab)) continue;
        /* 한 줄이 칸 너비를 넘으면 두세 줄로 접혀 표가 장 밑으로 빠져나갔다(신한라이프·경농).
           줄마다 한 줄에 들어갈 만큼으로 — 넘는 줄은 AI 가 뜻을 살려 줄인다(fit). */
        var body = want[i].body.filter(Boolean).slice(0, 4).map(function (x) { return fit(x, 52); });
        if (!body.length) continue;
        cells.push({ r: r, c: 2, text: [want[i].head].concat(body).join('\n') });
      }
    }
    return cells.length ? { name: tb.name, cells: cells } : null;
  }

  /* 핵심 가치 | 핵심 역량 | 구성원 행동 변화.

     회사 샘플은 이 표를 이렇게 쓴다 —
       성장 지향 | 성과 코칭 역량       | 팀원과 정기 1on1 코칭 대화 실행
       공정 신뢰 | 평가 설계·판단 역량   | KPI 근거로 평가 결과를 설명
     '핵심 가치' 는 네 글자짜리 가치명이지 모듈 이름이 아니다.
     전에는 모듈 이름을 그대로 넣어, 가치도 역량도 아닌 것이 첫 칸에 들어갔다.
     AI 가 values 를 주면 그걸 쓰고, 없을 때만 모듈로 흉내 낸다. */
  function valuesJob(p, tb) {
    var body = Math.max(0, Math.min(20, tb.rows || 0) - 1);
    if (!body) return null;

    var rows = (p.values || []).filter(function (v) { return v && v.value; });
    if (!rows.length) {
      var ms = (p.approach.modules || []).slice();
      var chg = lines(p.outcome.changes);
      if (!ms.length) return null;
      rows = ms.map(function (m, i) {
        var name = cleanTitle(m.title).replace(/^M\s*\d+\s*[.)]?\s*/i, '');
        var one = String(lines(m.detail)[0] || '').replace(/^\s*\d\)\s*/, '');
        return { value: name, competency: one || m.method || name, behavior: chg[i] || '' };
      });
    }

    var cells = [];
    for (var i = 0; i < body; i++) {
      var v = rows[i];
      /* 줄이 모자라면 비운다 — 양식의 예전 글이 남으면 안 된다 */
      cells.push({ r: i + 2, c: 1, text: v ? fit(v.value, 14) : '' });
      cells.push({ r: i + 2, c: 2, text: v ? fit(v.competency, 24) : '' });
      cells.push({ r: i + 2, c: 3, text: v ? fit(v.behavior, 40) : '' });
    }
    return { name: tb.name, cells: cells };
  }

  /* 교육 만족도 설문 문항 표는 손대지 않는다.
     양식에 협회 표준 문항 11개가 번호(A1-1…)·구분까지 다 들어 있고,
     칸이 세로로 병합돼 있다. 줄마다 값을 넣으면 병합 때문에 번호와 문항이
     어긋나 버린다(한 번 그렇게 망가뜨렸다). 건마다 바뀌지 않는 표다. */

  /* 유사 프로젝트 표(연번·고객사·진행 시기 및 차수·대상자·핵심 주제).
     양식에는 '[내용 1]…[내용 5]' 자리표시자만 들어 있다. 협회가 실제로 해 온
     실적을 적는 자리라 우리가 지어낼 수 없다 — 지어내면 고객에게 거짓을 적는 것이다.
     그래서 비워서 내보내고, 기획자가 직접 채우게 한다.
     자리표시자가 그대로 나가는 것만은 막는다. */
  function recordJob(p, tb, who) {
    var body = Math.max(0, Math.min(20, tb.rows || 0) - 1);
    if (!body) return null;

    /* 그 장에 실리는 교수가 해 온 건. 커리큘럼을 쓸 때 노션 제안서 DB 에서
       그 교수 이름으로 되짚어 적어 둔다(views.rememberWork). */
    var list = [];
    if (who && p.teacherWork) list = p.teacherWork[who.name] || [];
    /* 노션 기록이 없으면 교수 카드의 '강의실적' 에서 뽑는다 —
       '미래에셋증권 임원 워크숍, NH투자증권 디지털 리더 과정' 처럼 적혀 있다. */
    if (!list.length && who) list = recordsFromText(who.record);
    if (!list.length && p.teacherWork) {
      /* 그 교수 기록이 없으면 아무 교수 것이라도 — 표가 통째로 비는 것보다 낫다 */
      var ks = Object.keys(p.teacherWork);
      for (var i = 0; i < ks.length && !list.length; i++) list = p.teacherWork[ks[i]] || [];
    }
    /* 실을 것이 하나도 없으면 표와 '[유사 프로젝트]' 이름표를 통째로 뺀다.
       줄만 지우면 머리글만 남은 표가, 그냥 두면 '[내용 1]' 이 고객에게 나간다. */
    if (!list.length) return { name: tb.name, remove: true };

    /* 열 자리 — 머리글로 찾는다 */
    var heads = (tb.headers || []).map(function (h) { return String(h).replace(/\s/g, ''); });
    var col = {};
    heads.forEach(function (h, i) {
      if (/연번|번호|No/i.test(h) && !col.no) col.no = i + 1;
      else if (/고객사|기업|회사/.test(h) && !col.client) col.client = i + 1;
      else if (/시기|일정|기간|차수/.test(h) && !col.when) col.when = i + 1;
      else if (/대상/.test(h) && !col.target) col.target = i + 1;
      else if (/주제|내용/.test(h) && !col.topic) col.topic = i + 1;
    });

    var cells = [], gone = [];
    for (var r = 2; r <= body + 1; r++) {
      var it = list[r - 2];
      /* 채울 것이 없는 줄은 아예 지운다. 비우기만 하면 연번만 남은 빈 줄이
         그대로 나가, 실적이 모자란 것이 눈에 띈다. */
      if (!it) { gone.push(r); continue; }
      for (var c = 1; c <= Math.min(10, tb.cols || 5); c++) {
        /* 연번 열은 양식이 1·2·3… 을 적어 두었다. 그건 그대로 둔다. */
        if (c === col.no || /^\d+$/.test(cellAt(tb, r, c).trim())) continue;
        var v = '';
        if (c === col.client) v = fit(it.client, 18);
        else if (c === col.when) v = fit(it.when, 18);
        else if (c === col.target) v = fit(it.target, 22);
        else if (c === col.topic) v = fit(it.topic, 40);
        cells.push({ r: r, c: c, text: v });
      }
    }
    if (!cells.length && !gone.length) return null;
    return { name: tb.name, cells: cells, dropRows: gone.length ? gone : undefined };
  }

  /* '미래에셋증권 임원 워크숍, NH투자증권 디지털 리더 과정' → 표 줄.
     첫 낱말을 고객사로, 직급 낱말을 대상자로, 나머지를 주제로 본다. */
  var TARGET_WORD = /^(임원|경영진|팀장|신임\s*팀장|부서장|리더|중간관리자|관리자|신입사원|신입|승진자|직원|전\s*직원|연구원|영업직|실무자)$/;
  function recordsFromText(text) {
    return String(text || '').split(/[,，\n;]+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length >= 2; }).slice(0, 10).map(function (x) {
        var ws = x.split(/\s+/);
        var client = ws.shift() || '';
        var target = '';
        /* '신임 팀장' 처럼 두 낱말인 대상자도 잡는다 */
        for (var i = 0; i < ws.length; i++) {
          var two = ws[i] + (ws[i + 1] ? ' ' + ws[i + 1] : '');
          if (ws[i + 1] && TARGET_WORD.test(two)) { target = two; break; }
          if (TARGET_WORD.test(ws[i])) { target = ws[i]; break; }
        }
        /* 주제는 고객사만 뗀 나머지 그대로 — 대상자 낱말까지 빼면
           'NH투자증권 디지털 리더 과정' 이 '디지털 과정' 이 되어 말이 안 된다 */
        return { client: client, when: '-', target: target || '-', topic: ws.join(' ') || x };
      });
  }

  /* 교수 한 명을 '이름표 → 값' 짝으로. 양식의 세로 표가 이 짝을 찾아 채운다. */
  function teacherPairs(t) {
    return TEACHER_FIELDS.map(function (f) {
      return { label: f.label, value: String(t[f.key] || '').trim() };
    }).filter(function (x) { return x.value; });
  }
  function teacherLines(t) {
    return teacherPairs(t).map(function (x) { return x.label + ' — ' + x.value; });
  }

  /* 커리큘럼 표 — 양식의 열 차례(모듈명 / 세부내용 / 진행 방법 / 시간)에 맞춰 넣는다.
     열 구성은 양식마다 다르므로 머리글을 보고 무엇을 넣을지 고른다. */
  function curriculumJob(p, tb) {
    var heads = (tb.headers || []).map(function (h) { return String(h).replace(/\s/g, ''); });
    var lens = tb.cellLen || [];

    /* 올린 커리큘럼이 이미 표라면 그 표를 그대로 옮기는 것이 가장 충실하다.
       모듈로 한 번 쪼갰다 다시 붙이면 '세부내용'이 통째로 날아간다. */
    var src = curriculumGrid(p);
    if (src) {
      return { rows: src.body.map(function (r) {
        return heads.map(function (h, c) {
          var from = src.pick(h);
          return fit(from < 0 ? '' : r[from], lens[c] || 0);
        });
      }) };
    }

    var rows = (p.approach.modules || []).map(function (m, i) {
      return heads.map(function (h, c) {
        var cap = lens[c] || 0;
        if (/모듈명|과목명|교과목|구분/.test(h)) return fit(m.title, cap);
        if (/세부내용|내용|상세/.test(h)) return fit(m.detail, cap);
        if (/진행방법|방법|방식/.test(h)) return fit(m.method || '', cap);
        if (/시간|시수/.test(h)) return m.hours ? m.hours + 'H' : '';
        if (/차시|순번|No/i.test(h)) return String(i + 1);
        return '';
      });
    });
    return { rows: rows };
  }

  /* 올린 커리큘럼 파일에서 가장 큰 표를 골라, 양식의 열 이름으로 찾아 쓸 수 있게 만든다.
     머리글 이름이 달라도(세부내용 / 강의내용 / 주요내용) 같은 뜻이면 이어 준다. */
  var COL_ALIAS = [
    { re: /모듈명|과목명|교과목|주제|과정명/, as: 'title' },
    { re: /세부내용|강의내용|주요내용|내용|상세|세부/, as: 'detail' },
    { re: /진행방법|교수법|방법|방식|형태/, as: 'method' },
    { re: /시간|시수|H$/i, as: 'hours' },
    { re: /차시|순번|No|번호/i, as: 'no' }
  ];
  function meaningOf(head) {
    var h = String(head || '').replace(/\s/g, '');
    for (var i = 0; i < COL_ALIAS.length; i++) if (COL_ALIAS[i].re.test(h)) return COL_ALIAS[i].as;
    return '';
  }

  /* 커리큘럼 표를 과정 설계(모듈)로도 옮겨 둔다.
     개요 미리보기와 '과정 설계' 슬라이드가 이 목록을 읽기 때문이다.
     사람이 줄을 고를 필요는 없다 — 표가 이미 무엇이 무엇인지 말해 주고 있다. */
  function modulesFromCurriculum(p) {
    var g2 = curriculumGrid(p);
    if (!g2) return 0;
    var idx = {
      title: g2.at('title'), detail: g2.at('detail'),
      method: g2.at('method'), hours: g2.at('hours')
    };
    if (idx.title < 0) return 0;
    var out = [];
    g2.body.forEach(function (r) {
      var name = String(r[idx.title] || '').trim();
      if (!name) return;
      var h = idx.hours >= 0 ? parseFloat(String(r[idx.hours]).replace(/[^\d.]/g, '')) : NaN;
      out.push({
        title: name,
        detail: idx.detail >= 0 ? String(r[idx.detail] || '').trim() : '',
        method: idx.method >= 0 ? String(r[idx.method] || '').trim() : '',
        hours: isNaN(h) ? null : h
      });
    });
    if (!out.length) return 0;
    p.approach.modules = out;
    /* 교육시간은 커리큘럼이 정한다. 강사료가 이 값으로 계산되므로 여기서 같이 채운다. */
    var h = courseHours(p);
    if (h) p.ops.hours = h;
    /* 특장점·기대효과도 초안을 깔아 둔다 — 비워 두면 그 장이 통째로 빠진다 */
    if (!String(p.approach.direction || '').trim()) p.approach.direction = draftDirection(p);
    if (!String(p.outcome.changes || '').trim()) p.outcome.changes = draftChanges(p);
    return out.length;
  }

  /* 커리큘럼에서 특장점 초안을 만든다.
     지어내지 않는다 — 모듈 이름·시간·진행 방법처럼 실제로 적혀 있는 것만 쓴다.
     화면에서 그대로 고칠 수 있게 두고, 고치면 그 글이 나간다. */
  function draftDirection(p) {
    var ms = p.approach.modules || [];
    if (!ms.length) return '';
    var names = ms.map(function (m) { return cleanTitle(m.title); }).filter(Boolean);
    var hrs = courseHours(p);
    var ways = uniq(ms.map(function (m) { return String(m.method || '').split(/[+,·]/)[0].trim(); }).filter(Boolean));

    var out = [];
    if (names.length) {
      out.push(names.slice(0, 4).join(' · ') + (names.length > 4 ? ' 외 ' + (names.length - 4) + '개' : '') +
        ' 로 구성했습니다');
    }
    if (hrs) out.push('총 ' + hrs + '시간' + (p.ops.sessions > 1 ? ' · ' + p.ops.sessions + '개 차수' : '') + ' 과정입니다');
    if (ways.length) out.push(ways.slice(0, 2).join(' · ') + ' 방식으로 진행합니다');
    return out.join('\n');
  }

  function draftChanges(p) {
    var ms = p.approach.modules || [];
    if (!ms.length) return '';
    return ms.slice(0, 4).map(function (m) {
      return cleanTitle(m.title) + ' — 현업에 바로 적용할 수 있습니다';
    }).join('\n');
  }

  /* "[Relate] 팀장의 협업관리" → "팀장의 협업관리" */
  function cleanTitle(s) {
    return String(s || '').replace(/^\s*\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim();
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  function curriculumGrid(p) {
    var tabs = (p.curriculum && p.curriculum.tables) || [];
    if (!tabs.length) return null;
    /* 줄이 가장 많은 표를 커리큘럼 본문으로 본다 */
    var g2 = tabs.slice().sort(function (a, b) { return b.length - a.length; })[0];
    if (!g2 || g2.length < 2) return null;

    var srcHeads = g2[0].map(meaningOf);
    /* 머리글에서 하나도 못 알아보면 자리 순서로도 못 믿는다 — 모듈 쪽으로 넘긴다 */
    if (!srcHeads.filter(Boolean).length) return null;

    return {
      body: g2.slice(1),
      heads: g2[0],
      meanings: srcHeads,
      /* 뜻 이름으로 그 열이 몇 번째인지 */
      at: function (meaning) { return srcHeads.indexOf(meaning); },
      /* 양식 쪽 머리글을 주면 커리큘럼의 몇 번째 열을 쓸지 */
      pick: function (targetHead) {
        var want = meaningOf(targetHead);
        if (!want) return -1;
        return srcHeads.indexOf(want);
      }
    };
  }

  /* 고객에게 나가는 줄은 '외부용 견적서'다.
     예산서(내부 원가)를 그대로 실으면 원가와 이익률이 고객에게 나간다.
     견적서를 만들어 두었으면 그것을, 아직이면 예산 항목으로 임시로 채운다.
     임시로 채울 때도 단가는 원가가 아니라 제안가에 맞춘 판매가다 —
     원가(시간당 20만원)가 고객 종이에 찍히면 안 된다. */
  function quoteRows(p) {
    var q = p.quote;
    var lines = null;
    if (g.QuoteStore) {
      lines = (q && (q.lines || []).length) ? g.QuoteStore.ensure(p).lines : g.QuoteStore.preview(p);
    }
    if (lines && lines.length) {
      return lines.map(function (l) {
        return {
          group: l.group || '운영비', name: l.name || '',
          price: Number(l.unit) || 0,
          /* 양식의 수량 칸은 두 벌뿐이라 가운데 수량은 첫 칸에 곱해 넣는다 */
          qty1: (Number(l.q1) || 1) * (Number(l.q2) || 1), unit1: l.u1 || '',
          qty2: Number(l.sessions) || 1, unit2: l.su || '차수',
          amount: g.QuoteStore.amount(l), memo: l.memo || ''
        };
      });
    }
    var ops = p.ops || {};
    return (p.budget.items || []).map(function (it) {
      return {
        group: groupOf(it), name: it.name || '',
        price: Number(it.price) || 0,
        qty1: qty(it, ops), unit1: it.unit || '',
        qty2: Number(ops.sessions) || 1, unit2: '차수',
        amount: lineTotal(it, ops), memo: ''
      };
    });
  }

  /* 견적서 숫자는 쉼표만 찍는다 — '원' 글자는 양식 머리글에 이미 있다 */
  function plain(n) { return Number(n || 0).toLocaleString('ko-KR'); }

  /* ── 견적표 (줄 수가 정해진 양식) ────────────────────
     인재개발센터 양식의 견적표는 7행 9열로 줄까지 다 잡혀 있다.
       구분 | 구분 | 단가 | 수량(단위) ×4 | 견적가 | 내용
       강사료 | [항목1] | [단가] | [단위/내용] | H | [수량/내용] | 회 | [소계] | [비고]
       …
       제안 금액 (부가세 면세) | … | [합계] | [비고]
     머리글이 넷 다 '수량(단위)' 라서 머리글만 보면 수량 칸과 단위 칸을 못 가린다.
     양식 본문에 적힌 'H·회·명·일·개' 를 읽어 단위 칸을 알아낸다.
     첫 열(강사료·운영비)은 세로로 병합돼 있어 손대지 않는다. */
  function isQuoteGrid(tb) {
    if ((tb.cols || 0) < 6 || !(tb.cells || []).length) return false;
    var n = 0;
    for (var c = 1; c <= Math.min(10, tb.cols); c++) {
      if (/^수량/.test(String((tb.headers || [])[c - 1] || '').replace(/\s/g, ''))) n++;
    }
    return n >= 3;
  }

  function quoteJob(p, tb) {
    var heads = (tb.headers || []).map(function (h) { return String(h).replace(/\s/g, ''); });
    var rows = Math.min(20, tb.rows || 0);

    /* 합계 줄 — '제안 금액' 이나 '[합계]' 가 적힌 줄 */
    var sumRow = 0;
    for (var r = rows; r >= 2; r--) {
      var joined = (grid(tb)[r - 1] || []).join(' ');
      if (/제안\s*금액|합계|총액/.test(joined)) { sumRow = r; break; }
    }
    var last = (sumRow ? sumRow - 1 : rows);
    if (last < 2) return null;

    /* 열 자리 찾기 */
    var cName = 0, cPrice = 0, cAmount = 0, cMemo = 0, qtyCols = [], unitCols = [];
    heads.forEach(function (h, i) {
      var c = i + 1;
      if (/구분|항목|내역/.test(h)) cName = c;          /* 마지막 '구분' 열이 항목명이다 */
      else if (/단가/.test(h)) cPrice = c;
      else if (/견적가|금액|소계/.test(h)) cAmount = c;
      else if (/내용|비고/.test(h)) cMemo = c;
      else if (/^수량/.test(h)) {
        /* 본문이 'H·회·명·일·개' 처럼 짧은 단위 글자면 단위 칸이다 */
        var unit = 0, num = 0;
        for (var rr = 2; rr <= last; rr++) {
          var v = cellAt(tb, rr, c).trim();
          if (!v) continue;
          if (/^(H|h|시간|회|명|일|개|식|박|차수|건)$/.test(v)) unit++;
          else num++;
        }
        if (unit > num) unitCols.push(c); else qtyCols.push(c);
      }
    });
    if (!cName || !cAmount) return null;

    /* 줄마다 첫 열에 적힌 묶음(강사료·운영비) */
    var groupOfRow = {};
    for (var r2 = 2; r2 <= last; r2++) groupOfRow[r2] = cellAt(tb, r2, 1).trim();

    /* 우리 견적 줄을 묶음별로 나눈다. 교육비는 양식의 '강사료' 칸에 들어간다. */
    var all = quoteRows(p);
    if (!all.length) return null;
    var pool = { 강사료: [], 운영비: [] };
    all.forEach(function (x) {
      var k = /교육비|강사/.test(x.group) ? '강사료' : '운영비';
      pool[k].push(x);
    });

    /* 양식의 줄보다 견적 항목이 많으면 줄을 늘린다.
       전에는 넘치는 항목을 그냥 버렸다 — 열 줄짜리 견적을 넣어도 양식이 다섯 줄이면
       다섯 줄만 나가고, 그런데 합계는 열 줄을 다 더한 값이라
       고객이 줄을 더해 보면 합계가 안 맞는 견적서가 됐다. */
    var need = pool['강사료'].length + pool['운영비'].length;
    var body = last - 1;                       /* 양식이 잡아 둔 본문 줄 수 */
    var grow = Math.max(0, need - body);
    if (grow) {
      last += grow;
      /* 늘린 줄은 '운영비' 쪽에 붙는다 — 양식의 마지막 본문 줄을 따라간다 */
      var tailGroup = groupOfRow[last - grow] || '운영비';
      for (var gr = 0; gr < grow; gr++) groupOfRow[last - grow + 1 + gr] = tailGroup;
      if (sumRow) sumRow += grow;
    }

    var cells = [], over = 0, gone = [];
    for (var r3 = 2; r3 <= last; r3++) {
      var key = /강사|교육비/.test(groupOfRow[r3]) ? '강사료' : '운영비';
      var it = pool[key].shift();
      /* 그 묶음이 비었으면 다른 묶음에서 가져다 쓴다 — 줄을 비워 두기보다 낫다 */
      if (!it) {
        var other = key === '강사료' ? '운영비' : '강사료';
        it = pool[other].shift();
      }
      if (!it) {
        /* 남는 줄은 지운다. 비우기만 하면 '강사료' 라벨만 있는 빈 줄이 그대로 나가
           견적이 덜 만들어진 것처럼 보인다. */
        gone.push(r3);
        continue;
      }
      cells.push({ r: r3, c: cName, text: fit(it.name, 16) });
      if (cPrice) cells.push({ r: r3, c: cPrice, text: plain(it.price) });
      if (qtyCols[0]) cells.push({ r: r3, c: qtyCols[0], text: String(it.qty1) });
      if (unitCols[0]) cells.push({ r: r3, c: unitCols[0], text: it.unit1 || '' });
      if (qtyCols[1]) cells.push({ r: r3, c: qtyCols[1], text: String(it.qty2) });
      if (unitCols[1]) cells.push({ r: r3, c: unitCols[1], text: it.unit2 || '' });
      cells.push({ r: r3, c: cAmount, text: plain(it.amount) });
      if (cMemo) cells.push({ r: r3, c: cMemo, text: fit(it.memo || '', 60) });
    }
    over = pool['강사료'].length + pool['운영비'].length;

    /* 합계 줄 */
    if (sumRow) {
      /* 제안가를 아직 안 적었으면 줄 합계를 쓴다 — 0 원으로 나가면 안 된다 */
      var b = budget(p);
      var sum = b.total || all.reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0);
      cells.push({ r: sumRow, c: cAmount, text: plain(sum) });
      if (cMemo) cells.push({ r: sumRow, c: cMemo, text: quoteNote(p) });
    }
    return { name: tb.name, cells: cells, over: over,
             dropRows: gone.length ? gone : undefined,
             addRows: grow || undefined,
             /* 합계 줄 앞에 끼운다. 뒤에 붙이면 '제안 금액' 이 가운데로 들어간다. */
             addRowsAt: grow ? (sumRow ? sumRow - grow : undefined) : undefined };
  }

  /* 견적표의 '[비고 내용]' 자리.

     ※ 예산 메모(p.budget.note)는 **절대 넣지 않는다.**
     거기에는 '필요한 강사상 — …', '기획 메모 — …', '문의 시 예산: 200만원 내외'
     처럼 우리가 보고 쓰는 글이 들어 있다. 그대로 내보냈더니 고객 견적서에
     내부 검토 메모와 고객이 말한 예산 상한까지 실려 나갔다.
     여기에는 고객이 읽어야 할 거래 조건만 적는다. */
  function quoteNote(p) {
    var out = ['교육비는 부가세 면세 대상입니다.'];
    var ops = p.ops || {};
    if (ops.headcount) out.push(ops.headcount + '명 기준이며, 인원에 따라 조정됩니다.');
    if (Number(ops.sessions) > 1) out.push(ops.sessions + '차수 기준 금액입니다.');
    out.push('교재비·식음료 등 현장 운영 조건은 협의 후 확정합니다.');
    return out.join('\n');
  }

  /* 견적 표 — 구분이 같은 줄끼리 묶이도록 mergeCol 을 함께 넘긴다 */
  function budgetJob(p, tb) {
    var heads = (tb.headers || []).map(function (h) { return String(h).replace(/\s/g, ''); });
    var lens = tb.cellLen || [];
    var mergeCol = 0;
    heads.forEach(function (h, i) { if (/구분/.test(h) && !mergeCol) mergeCol = i + 1; });

    var rows = quoteRows(p).map(function (r) {
      var seen = 0;
      return heads.map(function (h, c) {
        var cap = lens[c] || 0;
        /* 견적서의 '구분'은 계정 이름이 아니라 교육비·운영비다 */
        if (/구분/.test(h)) return r.group;
        if (/항목|내역|품목/.test(h)) return fit(r.name, cap);
        if (/단가/.test(h)) return plain(r.price);
        if (/금액|합계/.test(h)) return plain(r.amount);
        if (/비고/.test(h)) return fit(r.memo, cap);
        /* 수량·단위가 두 벌(수량·단위·수량·단위)인 양식이 있다. 나온 차례대로 채운다. */
        if (/수량/.test(h)) { seen++; return String(seen === 1 ? r.qty1 : r.qty2); }
        if (/단위/.test(h)) { return seen <= 1 ? r.unit1 : r.unit2; }
        return '';
      });
    });
    return { rows: rows, mergeCol: mergeCol || undefined };
  }

  /* 양식의 그 칸이 원래 쓰던 글자 수에 맞춰 줄인다.
     넘치면 표가 부풀고, 너무 짧으면 빈 칸처럼 보인다.
     자를 때는 낱말 한가운데가 아니라 쉼표·띄어쓰기에서 끊는다. */
  /* 줄 나눔을 지키면서 한도에 맞춘다.
     fit() 은 \s+ 를 공백 하나로 눌러 버린다 — 모듈 상세는 양식이 보여 준
     '1) 소주제 / (이론) … / (실습) …' 꼴이 생명이라 그걸로 자르면 안 된다.
     한도를 넘으면 뒤쪽 줄을 버린다. 줄 가운데를 자르면 문장이 끊긴다. */
  function fitLines(text, room) {
    var ls = String(text == null ? '' : text).split('\n')
      .map(function (x) { return x.replace(/[ \t]+/g, ' ').trim(); })
      .filter(function (x) { return x; });
    if (!room || !room.rows) return ls.join('\n');
    /* 줄 하나가 칸 너비를 넘으면 두 줄, 세 줄을 잡아먹는다. 그걸 세어야 맞는다. */
    var out = [], used = 0;
    for (var i = 0; i < ls.length; i++) {
      var need = Math.max(1, Math.ceil(ls[i].length / room.perLine));
      if (used + need > room.rows && out.length) break;
      out.push(ls[i]);
      used += need;
    }
    return out.join('\n');
  }

  /* ── 칸보다 긴 글 ─────────────────────────────────────
     예전에는 칸 길이에서 잘라 '…' 을 붙였다 — '2026 증권 IT 기술…' 처럼
     말이 끊긴 채 고객에게 나갔다.
     이제는 AI 가 칸 길이에 맞춰 **뜻이 통하게 다시 쓴 글**을 쓴다.
       1) fillPlan 이 돌면서 칸보다 긴 글을 모은다 (SHORT_NEED)
       2) 화면이 그것을 /api/ai/condense 로 보내 줄인 글을 받아 p.shortCache 에 둔다
       3) fillPlan 을 한 번 더 돌리면 여기서 줄인 글을 꺼내 쓴다
     AI 를 못 쓰면 말이 끝나는 자리(쉼표·가운뎃점·띄어쓰기)에서 끊고 '…' 은 붙이지 않는다. */
  var SHORT = {}, SHORT_NEED = [];
  function shortKey(s, cap) { return cap + '|' + s; }

  function fit(text, cap) {
    var s = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!cap || cap < 8 || s.length <= cap) return s;
    var hit = SHORT[shortKey(s, cap)];
    if (hit && hit.length <= cap + 2) return hit;
    if (!SHORT_NEED.some(function (x) { return x.text === s && x.max === cap; })) {
      SHORT_NEED.push({ text: s, max: cap });
    }
    return softCut(s, cap);
  }

  /* '…' 없이 자르기 — 뜻 덩어리가 끝나는 자리에서 */
  function softCut(s, cap) {
    var cut = s.slice(0, cap);
    /* 문장이 끝나는 자리가 있으면 거기서 */
    var end = Math.max(cut.lastIndexOf('다.'), cut.lastIndexOf('요.'));
    if (end > cap * 0.5) return cut.slice(0, end + 2);
    var marks = [' — ', ' - ', ': ', ', ', '·', ' / ', ' '];
    for (var i = 0; i < marks.length; i++) {
      var at = cut.lastIndexOf(marks[i]);
      if (at > cap * 0.5) { cut = cut.slice(0, at); break; }
    }
    /* 끝에 매달린 조사·기호를 떼어 '… 을' 처럼 끝나지 않게 */
    return cut.replace(/[\s,·\/:—\-(]+$/, '').replace(/\s(과|와|및|의|을|를|이|가|에|로|으로)$/, '');
  }

  /* 화면이 쓴다 — 이번에 줄여야 할 글 목록과, 받은 줄인 글을 넣는 곳 */
  function shortNeeds() { return SHORT_NEED.slice(); }
  function useShort(p) {
    SHORT = (p && p.shortCache) || {};
    SHORT_NEED = [];
  }
  function setShort(p, items) {
    p.shortCache = p.shortCache || {};
    (items || []).forEach(function (x) {
      if (x && x.text && x.short && x.max) p.shortCache[shortKey(x.text, x.max)] = x.short;
    });
    /* 오래된 것이 끝없이 쌓이지 않게 — 최근 300개만 */
    var ks = Object.keys(p.shortCache);
    if (ks.length > 300) ks.slice(0, ks.length - 300).forEach(function (k) { delete p.shortCache[k]; });
  }

  /* 고른 양식이 글을 얼마나 받아 주는지.
     칸보다 길게 쓰면 fit() 이 '…' 으로 잘라 낸다 — 내용이 사라지는 것이다.
     그럴 바에는 처음부터 칸에 맞는 길이로 쓰게 하는 편이 낫다.
     쓸 수 있는 글자 수를 세어 커리큘럼 쓰는 쪽에 알려 준다. */
  function caps(p) {
    var t = template(p.templateId);
    var out = {};
    var big = sampleSlots(t);
    (t && t.slides || []).forEach(function (s) {
      if (!s.src || s.src === 'skip' || s.src === 'keep') return;
      /* 이 장이 글을 어떻게 받는지.
         양식은 대개 '짧은 문구 여러 칸' 으로 짜여 있다 — 200자 문단을 주면
         칸마다 20자만 남고 나머지는 '…' 으로 잘린다. 그러니 총량만 알려 줄 게
         아니라 '몇 줄을, 한 줄에 몇 자로' 써야 하는지를 알려 줘야 한다. */
      /* 'Program Details' 장은 칸에 '1) [내용 1] ・ [상세 내용]' 처럼 짧게 적혀 있다.
         그 글자 수를 한도로 삼으면 80자짜리 모듈 설명이 나온다.
         빈 양식의 글자 수는 '얼마나 쓸 수 있는가'를 말해 주지 않는다 —
         칸 크기와 글꼴로 재야 한다. 회사가 준 샘플은 한 칸에 400자 넘게 담겨 있었다. */
      if (s.src === 'detail') {
        var d = detailBlocks(s);
        d.blocks.forEach(function (b) {
          /* 다 채운 샘플 장의 같은 도형이 더 정확하다 — 빈 양식 상자는 접혀 있다 */
          out.moduleTitle = Math.max(out.moduleTitle || 0, bigCap(b.title, big));
          out.moduleDetail = Math.max(out.moduleDetail || 0, bigCap(b.body, big));
          /* 글자 수만 알려 주면 줄 수가 넘친다 — 11줄짜리 칸에 12줄을 써서 모듈마다 끝줄이 잘렸다.
             실제로 글이 들어가는 칸의 줄 수와 한 줄 글자 수를 같이 넘긴다. 칸이 여럿이면 가장 작은 쪽. */
          var r = roomOf(b.body) || bigRoom(b.body, big);
          if (r) {
            out.moduleRows = out.moduleRows ? Math.min(out.moduleRows, r.rows) : r.rows;
            out.moduleLineLen = out.moduleLineLen ? Math.min(out.moduleLineLen, r.perLine) : r.perLine;
          }
        });
        out.detailRoom = Math.max(out.detailRoom || 0, d.blocks.length);
        return;
      }

      var lens = (s.slots || []).map(function (x) { return x && x.chars >= 12 ? x.chars : 0; })
        .filter(Boolean).sort(function (a, b) { return a - b; });
      var room = lens.reduce(function (a, n) { return a + n; }, 0);
      if (!room) return;
      /* 모듈은 여러 장에 걸쳐 실린다. 장마다 따로 보지 말고 칸을 모두 모아
         '제목은 몇 자, 내용은 몇 자' 를 잡는다. slotPlan 이 짧은 칸을 제목,
         그 다음 큰 칸을 내용으로 짝지어 넣기 때문이다. */
      if (s.src === 'modules') {
        out._modLens = (out._modLens || []).concat(lens);
        return;
      }
      var prev = out[s.src];
      if (prev && prev.room >= room) return;
      out[s.src] = {
        room: room,
        lines: lens.length,
        /* 가운데값 — 유난히 큰 칸 하나에 휘둘리지 않게 */
        lineLen: lens[Math.floor(lens.length / 2)] || room
      };

      /* 커리큘럼 표가 있으면 '내용' 칸 하나가 몇 글자인지 */
      (s.tables || []).forEach(function (tb) {
        var heads = (tb.headers || []).map(function (h) { return String(h).replace(/\s/g, ''); });
        heads.forEach(function (h, i) {
          if (/내용|세부|상세|주요/.test(h)) {
            var c = (tb.cellLen || [])[i] || 0;
            if (c) out.moduleDetail = Math.max(out.moduleDetail || 0, c);
          }
        });
      });
    });

    /* 모아 둔 모듈 칸에서 제목·내용 한도를 잡는다.
       작은 쪽 넷 중 하나(25%)를 제목, 큰 쪽 넷 중 셋(75%)을 내용으로 본다. */
    var ml = (out._modLens || []).sort(function (a, b) { return a - b; });
    delete out._modLens;
    if (ml.length) {
      out.moduleTitle = Math.max(out.moduleTitle || 0, ml[Math.floor(ml.length * 0.25)] || ml[0]);
      /* 표가 있으면 표 칸이 이깁니다 — 표는 보통 더 넉넉하다 */
      var fromSlot = ml[Math.floor(ml.length * 0.75)] || ml[ml.length - 1];
      out.moduleDetail = Math.max(out.moduleDetail || 0, fromSlot);
      /* 모듈을 몇 개 쓸지는 칸 수로 정하지 않는다 — 양식은 한 장에 두 칸만
         있어도 장을 늘려 가며 싣는다. 개수는 문의 내용이 정한다. */
    }
    return out;
  }

  function outlineText(p) {
    var out = ['# ' + (p.client.company ? '[' + p.client.company + '] ' : '') + (p.title || '제안서') + ' — PPT 개요', ''];
    outline(p).forEach(function (s) {
      out.push('## ' + s.no + '. ' + s.title);
      s.bullets.forEach(function (b) { out.push('   - ' + b); });
      out.push('');
    });
    return out.join('\n');
  }

  /* 빈 곳 — 장 이름만 알려 주면 어디를 채워야 할지 알 수 없다.
     어느 입력 칸으로 가야 하는지(src)까지 함께 넘겨 화면에서 바로 짚어 갈 수 있게 한다. */
  function gaps(p) {
    return outline(p).filter(function (s) { return s.warn; }).map(function (s) {
      return { no: s.no, title: s.title, src: s.src, label: s.no + '. ' + s.title };
    });
  }

  g.PropStore = {
    INDUSTRIES: INDUSTRIES, SIZES: SIZES, STATUSES: STATUSES,
    COST_PRESET: COST_PRESET, BASIS_LABEL: BASIS_LABEL, SOURCES: SOURCES,
    GROUPS: GROUPS, groupOf: groupOf,
    load: load, save: save, state: state, onChange: onChange, emit: emit, uid: uid,
    me: me, setMe: setMe, myTeam: myTeam,
    templates: templates, template: template, addTemplate: addTemplate,
    updateTemplate: updateTemplate, removeTemplate: removeTemplate,
    templateFromSlides: templateFromSlides, templateFromPptx: templateFromPptx,
    reguess: reguess,
    fillPlan: fillPlan, planView: planView,
    templateStats: templateStats, rankedTemplates: rankedTemplates,
    matchTeachers: matchTeachers, matchPast: matchPast,
    snapshot: snapshot, markExported: markExported, changedSince: changedSince,
    create: create, get: get, active: active, setActive: setActive, update: update, remove: remove,
    TEACHER_FIELDS: TEACHER_FIELDS,
    teachers: teachers, teacherById: teacherById, addTeacher: addTeacher,
    updateTeacher: updateTeacher, removeTeacher: removeTeacher, pickedTeachers: pickedTeachers,
    qty: qty, lineTotal: lineTotal, budget: budget, addCostItem: addCostItem, budgetText: budgetText,
    courseHours: courseHours, misfits: misfits, caps: caps,
    setCurriculum: setCurriculum, clearCurriculum: clearCurriculum,
    curriculumGrid: curriculumGrid, modulesFromCurriculum: modulesFromCurriculum,
    outline: outline, outlineText: outlineText, gaps: gaps, lines: lines,
    coverSlots: coverSlots, tidyCourse: tidyCourse, headerLine: headerLine,
    shortNeeds: shortNeeds, setShort: setShort, courseTitle: courseName,
    pullShared: pullShared, setPinned: setPinned, restoreFromSettings: restoreFromSettings
  };
})(window);
