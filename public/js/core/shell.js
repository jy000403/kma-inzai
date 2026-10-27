/* shell.js — 상단 도구 전환 · 현황판 · 통합 백업
 *
 * 상단 탭이 항상 떠 있어 도구 사이를 바로 옮겨 다닐 수 있다.
 * 첫 화면은 런처가 아니라 지금 상태를 보여 주는 현황판이다.
 */
(function (g) {
  'use strict';

  var UI = g.UI;

  /* 사이트 이름은 여기 한 곳에서만 고친다.
     상단 로고 · 브라우저 탭 제목 · 백업 파일명이 모두 이 값을 쓴다. */
  /* 이름은 KMA 하나로 둔다.
     '프로젝트'는 원래 상단 탭 이름이기도 해서, 앱 이름으로 같이 쓰니 무엇을 가리키는지 흐려졌다. */
  var SITE_ORG = 'KMA';
  var SITE_NAME = '';
  var SITE = SITE_ORG;
  var LAST_KEY = 'kma-workspace:last';
  var apps = [];
  var current = null;

  /* 일은 프로젝트(고객사 × 과정) 단위로 돈다. 첫 화면도 프로젝트다. */
  /* 앱을 열면 전체 현황부터 보여 준다. 로고를 눌러도, Esc 를 눌러도 여기로 돌아온다.
     null 은 '도구가 아닌 현황판'을 뜻한다. */
  var HOME_APP = null;

  /* 상단 탭에 올라오는 것 — 제안서와 결과보고서가 주업무다.
     증빙·교육사진은 결과보고서 안의 탭으로 들어가 있어서 여기엔 없다. */
  /* 프로젝트는 상단에서 뺐다. 현황판이 이미 같은 목록을 보여 주고 있어서
     들어가는 문이 둘이었다. 이제 현황판의 '프로젝트' 탭이 그 자리다.
     (한 건을 열 때는 여전히 프로젝트 화면으로 들어간다 — 그 화면 자체는 살아 있다) */
  var NAV_IDS = ['proposal', 'report'];

  /* 교육문의는 도구가 아니라 '들어오는 곳' 이다.
     프로젝트 화면 안에 얹어 뒀더니 97건이 머리를 다 차지해서
     정작 프로젝트 목록이 아래로 밀렸다. 제 화면을 준다.
     상단 탭이 곧 일하는 차례가 된다 — 문의 → 프로젝트 → 제안서 → 결과보고서. */
  var INBOX_ID = 'inbox';

  function all() {
    if (apps.length) return apps;
    ['Project', 'Proposal', 'Report', 'Receipt', 'Photos']
      .forEach(function (k) { if (g[k]) apps.push(g[k]); });
    return apps;
  }
  function navApps() {
    return NAV_IDS.map(byId).filter(Boolean);
  }
  function byId(id) { return all().filter(function (a) { return a.id === id; })[0] || null; }

  /* ── 화면 전환 ────────────────────────────────────── */

  /* 상단 탭에 놓인 차례 — 어느 쪽으로 넘어가는지 재는 데 쓴다. 맨 끝이 '전체 현황'. */
  function navOrder() { return [INBOX_ID, ''].concat(NAV_IDS); }

  function go(id, params) {
    /* 교육문의는 앱이 아니라 셸이 직접 그리는 화면이다 */
    if (id === INBOX_ID) {
      var d0 = UI.dirOf(navOrder(), currentId(), INBOX_ID);
      UI.$$('.sheet-wrap').forEach(function (el) { el.remove(); });
      if (current && current.unmount) current.unmount();
      current = null;
      atInbox = true;
      watchInbox(true);          /* 이 화면에 머무는 동안만 자동으로 다시 읽는다 */
      var mainI = document.getElementById('main');
      mainI.innerHTML = '';
      mainI.scrollTop = 0;
      syncNav();
      renderInbox(mainI);
      UI.slideIn(mainI.querySelector('.board'), d0);
      try { localStorage.setItem(LAST_KEY, INBOX_ID); } catch (e) {}
      return;
    }
    atInbox = false;
    watchInbox(false);           /* 다른 화면으로 가면 멈춘다 */

    var app = byId(id);
    var dir = UI.dirOf(navOrder(), currentId(), id || '');
    /* 시트는 body 에 붙어 있어서 도구를 바꿔도 혼자 남는다. 옮기기 전에 닫는다. */
    UI.$$('.sheet-wrap').forEach(function (el) { el.remove(); });
    if (current && current.unmount) current.unmount();
    var main = document.getElementById('main');
    main.innerHTML = '';
    main.scrollTop = 0;

    if (!app) {
      current = null;
      syncNav();
      renderHome(main);
      UI.slideIn(main.querySelector('.board'), dir);
      return;
    }
    current = app;
    syncNav();
    var host = document.createElement('div');
    host.className = 'app-host';
    UI.slideIn(host, dir);
    main.appendChild(host);
    try {
      app.mount(host);
      if (params && params.view && app.go) app.go(params.view);
    } catch (e) {
      host.innerHTML = '<div class="err-dump">' + UI.esc(e && e.stack ? e.stack : String(e)) + '</div>';
    }
    try { localStorage.setItem(LAST_KEY, id); } catch (e) {}
  }

  var atInbox = false;
  function currentId() { return atInbox ? INBOX_ID : (current ? current.id : ''); }

  function syncNav() {
    var here = currentId();
    UI.$$('#toolnav .tool-tab').forEach(function (el) {
      var on = (el.dataset.app || '') === here;
      el.classList.toggle('on', on);
      el.setAttribute('aria-current', on ? 'page' : 'false');
    });
    UI.glideTabs(document.getElementById('toolnav'), '.tool-tab');
    document.title = atInbox ? '교육문의 · ' + SITE
      : (current ? current.name + ' · ' + SITE : SITE);
  }

  /* ── 로고 ─────────────────────────────────────────── */
  /* 공식 KMA 로고 파일을 이 폴더에 두면 상단과 브라우저 탭에 그대로 쓴다.
     파일이 없으면 글자로 짠 워드마크로 나온다 — 없는 로고를 그려 넣지 않는다. */
  var LOGO_FILES = ['logo.svg', 'logo.png', 'logo.jpg', 'logo.jpeg'];
  /* 설정 창에서 로고를 올리던 칸은 뺐다(사용자 요청) — 로고는 폴더의 logo · logo-dark 파일로만 정한다.
     예전에 설정에서 올려 둔 로고가 브라우저에 남아 있으면 폴더 로고를 가리므로 지운다. */
  try { localStorage.removeItem('kma-logo:v1'); } catch (e) {}

  /* 어두운 화면용 로고(흰 글자) — logo-dark.* 가 있으면 어두울 때 그것을 쓴다.
     없으면 밝은 로고를 흰색으로 뒤집어 쓴다(styles.css). */
  var LOGO_DARK = ['logo-dark.svg', 'logo-dark.png', 'logo-dark.jpg'];

  function showLogo(src, darkSrc) {
    var brand = document.getElementById('brand');
    var mark = brand.querySelector('.brand-mark');
    mark.innerHTML = '<img class="lg-light" alt="' + UI.esc(SITE_ORG) + '">' +
      (darkSrc ? '<img class="lg-dark" alt="' + UI.esc(SITE_ORG) + '">' : '');
    mark.querySelector('.lg-light').src = src;
    if (darkSrc) mark.querySelector('.lg-dark').src = darkSrc;
    mark.classList.add('has-img');
    mark.classList.toggle('two', !!darkSrc);
    brand.classList.add('with-logo');
    setFavicon(src);
  }

  function applyBrand() {
    var brand = document.getElementById('brand');
    var mark = brand.querySelector('.brand-mark');
    var name = brand.querySelector('.brand-name');
    name.innerHTML = '<span class="bn-org">' + UI.esc(SITE_ORG) + '</span>' +
      (SITE_NAME ? ' <b>' + UI.esc(SITE_NAME) + '</b>' : '');
    document.title = SITE;
    brand.title = SITE + ' — 첫 화면으로';

    mark.innerHTML = '';
    mark.classList.remove('has-img');
    brand.classList.remove('with-logo');

    /* 1) 폴더의 logo.* 파일  2) 없으면 글자 워드마크 */
    /* 한 번 못 찾았으면 이 페이지에서는 다시 찾지 않는다(화면을 옮길 때마다 404 가 쌓이지 않게).
       예전에는 sessionStorage 에 적어 둬서 새로고침해도 기억해 버렸다 — 파일을 넣고
       새로고침해도 로고가 안 나왔다. 이제는 새로고침하면 다시 찾는다. */
    if (logoMiss) return;
    findLogo(LOGO_FILES, 0, function (src) {
      if (!src) { logoMiss = true; return; }
      findLogo(LOGO_DARK, 0, function (dark) { showLogo(src, dark); });
    });
  }
  var logoMiss = false;

  function findLogo(list, i, done) {
    if (i >= list.length) return done(null);
    var img = new Image();
    img.onload = function () { done(list[i]); };
    img.onerror = function () { findLogo(list, i + 1, done); };
    img.src = list[i];
  }

  function setFavicon(src) {
    var link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = src;
  }

  function buildNav() {
    var nav = document.getElementById('toolnav');
    /* 전체 현황이 맨 앞에 선다.
       일이 시작되는 곳이자 돌아오는 곳인데 맨 끝에 있으면 처음 여는 사람이 어디부터 볼지 모른다.
       그 뒤는 일이 흘러가는 차례 그대로 — 프로젝트 → 제안서 → 결과보고서. */
    nav.innerHTML =
      /* 이름을 '프로젝트' 로 바꿨다. 일은 프로젝트 단위로 돌고,
         제안서·결과보고서는 그 프로젝트 안에서 쓰는 문서다.
         '전체 현황' 이라고만 해 두니 프로젝트를 정리하는 곳이 어디인지 보이지 않았다. */
      /* 상단 탭이 곧 일하는 차례다 — 문의 → 프로젝트 → 제안서 → 결과보고서 */
      '<button class="tool-tab" data-app="' + INBOX_ID + '" type="button">' +
        UI.icon('inbox', 18) + '<span>교육문의</span></button>' +
      '<button class="tool-tab" data-app="" type="button">' + UI.icon('project', 18) + '<span>프로젝트</span></button>' +
      '<span class="tool-sep"></span>' +
      navApps().map(function (a) {
        return '<button class="tool-tab" data-app="' + a.id + '" type="button">' +
          UI.icon(a.id, 18) + '<span>' + UI.esc(a.short || a.name) + '</span></button>';
      }).join('');
    nav.addEventListener('click', function (e) {
      var t = e.target.closest('.tool-tab');
      if (t) go(t.dataset.app || null);
    });

    applyBrand();

    var admin = document.getElementById('top-admin');
    if (admin) {
      admin.innerHTML = UI.icon('lock', 17) + '<span>관리자</span>';
      admin.title = '로그인 · 접속 이력 · 계정 발급';
    }

    var backup = document.getElementById('top-backup');
    backup.innerHTML = UI.icon('settings', 17) + '<span>설정</span>';
    backup.addEventListener('click', openSettings);
    document.getElementById('brand').addEventListener('click', function () { go(HOME_APP); });
    watchScroll();
  }

  /* 스크롤을 내리면 머리띠가 얇아진다.
     내용이 화면 위로 지나가기 시작하면 머리띠는 자리를 조금 내주는 쪽이 낫다.
     아주 숨기지는 않는다 — 도구를 옮겨 다니는 곳이라 늘 손이 닿아야 한다.
     스크롤은 #main 안에서 일어나고, 프레임마다 한 번만 재도록 묶어 둔다. */
  function watchScroll() {
    var body = document.body;
    var ticking = false;

    function apply() {
      ticking = false;
      var y = main.scrollTop;
      body.classList.toggle('scrolled', y > 6);
      /* 한 번 얇아지면 조금 올려도 다시 두꺼워지지 않게 경계를 벌려 둔다.
         경계값 하나로 두면 그 근처에서 머리띠가 떨린다. */
      if (y > 120) body.classList.add('compact');
      else if (y < 70) body.classList.remove('compact');
    }

    main.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(apply); }
    }, { passive: true });
    apply();
  }

  /* 제안서 화면 위에 띄울 다른 도구의 신호 */
  function signals(excludeId) {
    return collect('metrics')
      .filter(function (m) { return m.appId !== excludeId; })
      .sort(function (a, b) { return (a.rank || 9) - (b.rank || 9); });
  }

  /* ── 현황판 ───────────────────────────────────────── */

  var WD = ['일', '월', '화', '수', '목', '금', '토'];

  function todayLabel() {
    var d = new Date();
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + WD[d.getDay()] + '요일';
  }

  function collect(fn) {
    var out = [];
    all().forEach(function (a) {
      if (!a[fn]) return;
      try {
        (a[fn]() || []).forEach(function (x) { x.appId = a.id; out.push(x); });
      } catch (e) {}
    });
    return out;
  }


  /* 마지막 백업이 언제였는지 — 브라우저를 지우면 다 날아가므로 눈에 띄게 둔다 */
  var BACKUP_KEY = 'kma-last-backup';
  function lastBackup() {
    try { return Number(localStorage.getItem(BACKUP_KEY)) || 0; } catch (e) { return 0; }
  }
  function markBackup() {
    try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch (e) {}
  }
  function backupNote() {
    var at = lastBackup();
    if (!at) return { tone: 'warn', text: '아직 한 번도 백업하지 않았습니다.' };
    var days = Math.floor((Date.now() - at) / 86400000);
    if (days >= 7) return { tone: 'warn', text: '마지막 백업 ' + days + '일 전입니다.' };
    return { tone: '', text: '마지막 백업 ' + (days ? days + '일 전' : '오늘') + '.' };
  }


  function renderHome(main) {
    /* 프로젝트가 내놓는 지표('오늘 연락할 곳' 같은 것)는 아래 '오늘 할 일'과 내용이 같다.
       같은 말을 두 번 하지 않도록 여기서는 뺀다. */
    var metrics = collect('metrics')
      .filter(function (m) { return m.appId !== 'project'; })
      .sort(function (a, b) { return (a.rank || 9) - (b.rank || 9); })
      .slice(0, 4);
    var recent = collect('recent').slice(0, 6);

    /* 카드 한 장 = 무엇(아이콘·이름) · 몇 건(큰 숫자, '건' 은 작게) · 상태 한 줄과 가는 길.
       전에는 세 줄이 같은 무게로 쌓여 있어 숫자가 눈에 먼저 걸리지 않았고,
       눌러서 갈 수 있는 카드라는 것도 드러나지 않았다. */
    var tiles = metrics.map(function (m) {
      var v = /^([\d,.]+)\s*(.*)$/.exec(String(m.value || '')) || [null, String(m.value || ''), ''];
      return '<button class="metric' + (m.tone ? ' ' + m.tone : '') + '" type="button"' +
        ' data-go="' + UI.esc(m.appId) + '"' + (m.view ? ' data-view="' + UI.esc(m.view) + '"' : '') + '>' +
        '<span class="m-head"><span class="m-ic">' + UI.icon(m.appId === 'report' ? 'report' : 'proposal', 16) + '</span>' +
          '<span class="m-label">' + UI.esc(m.label) + '</span></span>' +
        '<strong class="m-value">' + UI.esc(v[1]) + (v[2] ? '<small>' + UI.esc(v[2]) + '</small>' : '') + '</strong>' +
        '<span class="m-foot">' +
          (m.sub ? '<span class="m-sub">' + UI.esc(m.sub) + '</span>' : '<span class="m-sub quiet">모두 정리됐습니다</span>') +
          '<span class="m-go">바로 가기' + UI.icon('chevron', 13) + '</span>' +
        '</span>' +
      '</button>';
    }).join('');

    /* 도구 목록('바로 가기')은 없앴다. 상단 탭에 이미 같은 셋이 있어서
       현황판의 절반이 런처로 채워져 있었다. 여기는 지금 무슨 일이 걸려 있는지 보는 곳이다. */

    var c = g.Projects ? g.Projects.counts() : { 전체: 0, 진행중: 0 };

    /* '할 일' 칸은 없앴다.
       프로젝트 카드마다 이미 '지금 할 일' 한 줄이 붙어 있어서 같은 말을 두 번 했고,
       그러느라 정작 프로젝트 목록이 아래로 밀려 있었다.
       남은 칸이 '전체'와 '프로젝트' 뿐이라 서로 같아져서 탭 줄도 함께 접었다. */
    main.innerHTML =
      '<div class="board">' +
        /* 다른 화면과 같은 자리에 아이콘을 세워 제목 시작점을 맞춘다 */
        '<header class="board-head">' +
          '<span class="tr-icon home ph-ic">' + UI.icon('project', 22) + '</span>' +
          /* 날짜를 제목 위에 두면 큰 글자가 한 줄 밀려 내려간다.
             다른 화면은 제목이 맨 위라, 여기만 어긋나 보였다. 설명 줄로 내린다. */
          '<div class="ph-text">' +
            '<h2>프로젝트</h2>' +
            '<p class="bd-sum">' + UI.esc(todayLabel()) + ' · ' + UI.esc(summaryLine(c)) + '</p>' +
          '</div>' +
        '</header>' +

        /* 문의 이야기는 한 줄로 합쳤다.
           전에는 '문의가 들어왔나요(붙여넣기)' 와 '교육문의 94건이 기다립니다(보기)'
           두 장이 나란히 서 있었는데, 둘 다 교육문의 화면으로 가는 길이고
           붙여넣기는 거기에도 그대로 있다. 같은 말을 세 번 한 셈이었다. */
        inboxTease() +

        /* 프로젝트 목록이 이 화면의 본문이다. 거르개를 붙여 한 자리에서 다 본다. */
        projectTab() +
        (metrics.length ? '<section class="board-sec"><h3>살펴볼 것</h3>' +
          '<section class="metrics">' + tiles + '</section></section>' : '') +

        '<section class="board-sec bd-foot">' +
          (recent.length
            ? '<div class="bd-recent"><h4>최근 내려받은 파일</h4><ul class="recent">' + recent.map(function (r) {
                return '<li><span class="rc-name" title="' + UI.esc(r.name) + '">' + UI.esc(r.name) + '</span>' +
                  '<span class="rc-at">' + UI.esc(r.at) + '</span></li>';
              }).join('') + '</ul></div>'
            : '') +
          '<div class="bd-backup' + (backupNote().tone ? ' ' + backupNote().tone : '') + '">' +
            '<span class="nc-icon">' + UI.icon('lock', 18) + '</span>' +
            '<div><b>자료는 이 PC 안에만 있습니다</b>' +
              '<span>' + UI.esc(backupNote().text) + ' 브라우저 기록을 지우면 함께 사라집니다.</span></div>' +
            '<button class="btn' + (backupNote().tone ? ' primary' : '') + '" data-backup type="button">백업</button>' +
          '</div>' +
        '</section>' +
      '</div>';

    bindHome(main);
  }

  /* #main 은 화면을 다시 그려도 그대로 있는 칸이다.
     여기에 매번 클릭 처리기를 붙이면 그릴 때마다 하나씩 쌓인다.
     그러면 '문의 붙여넣기' 를 한 번 눌렀는데 쌓인 수만큼 창이 열린다.
     한 번만 붙이고, 안에서 그때그때 상태를 읽는다. */
  var homeBound = false;

  /* 지금 서 있는 화면을 다시 그린다.
     거르개를 눌렀을 때 교육문의 화면에서 프로젝트 화면으로 튀지 않게. */
  function repaint(main) {
    if (atInbox) renderInbox(main);
    else renderHome(main);
  }

  function bindHome(main) {
    if (homeBound) return;
    homeBound = true;

    main.addEventListener('click', function (e) {
      /* 현황판이 아닌 다른 도구가 올라와 있을 때는 그 도구가 알아서 한다 */
      if (current) return;

      var ibg = e.target.closest('[data-ib-tag]');
      if (ibg) {
        var want = ibg.dataset.ibTag;
        inboxTag = (want && want === inboxTag) ? '' : want;   /* 같은 것 또 누르면 풀린다 */
        inboxShow = 10;
        repaint(main);
        return;
      }
      if (e.target.closest('[data-ib-more]')) { inboxShow += 10; repaint(main); return; }
      /* 노션 다시 읽기 — 새 문의가 들어왔는지 지금 확인한다 */
      if (e.target.closest('[data-ib-reload]')) { loadInbox(true); repaint(main); return; }
      var vo = e.target.closest('[data-voc-open]');
      if (vo) {
        var hit = (inbox.items || []).filter(function (i) { return i.id === vo.dataset.vocOpen; })[0];
        if (hit) {
          var mine = null;
          if (g.Projects) {
            g.Projects.list().forEach(function (pp) { if (pp.vocId === hit.id) mine = pp.id; });
          }
          vocSheet(hit, mine);
        }
        return;
      }
      var vm = e.target.closest('[data-voc-make]');
      if (vm) { makeFromVoc(vm.dataset.vocMake); return; }
      var dp = e.target.closest('[data-del-pj]');
      if (dp) {
        var victim = g.Projects && g.Projects.get(dp.dataset.delPj);
        if (victim && g.ProjectViews && g.ProjectViews.askDelete) {
          g.ProjectViews.askDelete(victim, function () { repaint(main); });
        }
        return;
      }
      var pf = e.target.closest('[data-pf]');
      if (pf) { projFilter = pf.dataset.pf; renderHome(main); return; }
      var a = e.target.closest('[data-act]');
      if (a) {
        if (a.dataset.act === 'sender' && g.MailViews) g.MailViews.editSender(function () { go(null); });
        return;
      }
      if (e.target.closest('[data-voc]') && g.PropViews) {
        g.PropViews.pasteVoc(function () { go('proposal', { view: 'templates' }); });
        return;
      }
      /* 프로젝트를 집어 열 때는 그 건을 먼저 고르고 들어간다 */
      var pj = e.target.closest('[data-project]');
      if (pj) {
        if (g.Projects) g.Projects.setActive(pj.dataset.project);
        go('project', { view: 'detail' });
        return;
      }
      var c2 = e.target.closest('[data-go]');
      if (c2) { go(c2.dataset.go, c2.dataset.view ? { view: c2.dataset.view } : null); return; }
      if (e.target.closest('[data-backup]')) openSettings();
    });
  }

  /* ── 현황판 조각 ──────────────────────────────────── */

  function liveProjects() {
    if (!g.Projects) return [];
    var LIVE = g.Projects.LIVE;
    return g.Projects.list().filter(function (p) { return LIVE.indexOf(p.stage) !== -1; });
  }

  /* ── 노션에 들어온 교육 문의 ───────────────────────────
     사내 노션의 '고객사 미팅 관리' 를 **읽기만** 해서 여기 세운다.
     들어온 문의를 훑어 보고, 제안까지 갈 건만 골라 프로젝트로 담는다
     (모든 문의가 프로젝트가 되지는 않는다 — 한 고객사에서 여러 건이 오기도 한다).

     relay 가 전화번호를 잘라 내고 보낸다. 이름·이메일은 제안서를 메일로
     보낼 때 받는 사람 칸에 넣어야 해서 남기고, 그 밖에는 저장하지 않는다. */
  var inbox = null;      /* null 아직 · 'asking' 묻는 중 · {items:[]} */
  var inboxAt = 0;       /* 마지막으로 읽어 온 시각 */
  var inboxBusy = false; /* 다시 읽는 중 — 단추를 두 번 누르는 걸 막는다 */

  /* 강사 섭외 건인지.
     노션 태그에 '강사섭외' 가 붙어 있으면 확실하고,
     안 붙은 건은 제목·본문의 말투로 가린다 ('○○ 섭외 문의', '[문의 강사] …'). */
  var BOOK_RE = /(강사|명사|사회자|연사|진행자|MC)\s*섭외|섭외\s*(문의|요청)|\[\s*문의\s*강사\s*\]/;

  /* 트렌드M 홈페이지로 들어오는 문의는 모두 섭외다 — 그 사이트가 강사·명사를
     찾는 곳이라 과정 설계 문의가 오지 않는다. 강연·명사특강도 사람을 붙이는 일이라 같은 갈래다. */
  var BOOK_SRC = /트렌드\s*(M|엠)|trend\s*-?m/i;

  function isBooking(x) {
    if (BOOK_SRC.test(String(x.source || ''))) return true;
    /* '특강' 만으로는 못 정한다 — 과정 문의에도 붙는다. 섭외·명사·강연 태그는 확실하다. */
    if ((x.tags || []).some(function (t) { return /섭외|명사|강연/.test(t); })) return true;
    return BOOK_RE.test(String(x.subject || '') + ' ' + String(x.ask || ''));
  }
  /* 섭외 건은 아예 받지 않는다. 사람만 붙이면 되는 일이라 과정 제안서가 필요 없고,
     목록에 섞이면 제안서를 쓸 건을 매번 다시 가려내야 한다. (화면에서만 거른다 — 노션은 그대로) */
  function dropBooking(d) {
    var all = d.items || [];
    d.items = all.filter(function (x) { return !isBooking(x); });
    d.skipped = all.length - d.items.length;
    return d;
  }
  var inboxTag = '';       /* 주제로 좁혀 보기 */
  var inboxShow = 10;      /* 한 화면에 열 줄씩 — 더 깔면 스크롤만 길어진다 */

  /* 주제를 셀 기간.
     기간을 안 정하면 '읽어 온 100건' 이 기준이 되는데, 그건 노션에서 몇 건을
     불러왔느냐에 따라 달라지는 숫자라 '요즘 뭐가 들어오나' 를 말해 주지 못한다.
     일주일로 잡아 봤더니 12건뿐이라 1·2건짜리가 상위에 올라와 흐름이 안 보였다.
     한 달이 지금 데이터(약 5주치)에서 흐름이 읽히는 가장 짧은 기간이다. */
  var TOPIC_DAYS = 30;

  function topicCut() {
    return new Date(Date.now() - TOPIC_DAYS * 864e5).toISOString().slice(0, 10);
  }
  function inTopicWindow(x) {
    return String(x.at || '').slice(0, 10) >= topicCut();
  }

  /* 어떤 주제로 문의가 몰리는지.
     여기는 '무엇이 들어오고 있나' 를 보는 자리다. 그래서 강사 섭외도 한 자리
     차지한다 — 제안서를 쓸 일이 없어 목록에서만 뺐을 뿐, 들어온 건 들어온 거다.
     주제를 고르면 목록도 강사 섭외까지 같이 펼친다(아래 shown 참고). */
  function inboxTopics(rows) {
    if (!rows || !rows.length) return '';
    var by = {};
    rows.filter(inTopicWindow).forEach(function (x) {
      (x.tags || []).forEach(function (t) {
        if (!t) return;
        if (!by[t]) by[t] = 0;
        by[t]++;
      });
    });
    var top = Object.keys(by).map(function (k) { return { tag: k, n: by[k] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    if (!top.length) return '';
    /* 수주 표시는 걷었다 — 결판난 건이 몇 개뿐이라 '수주 1' 이 붙은 주제와
       안 붙은 주제의 차이가 실력이 아니라 표본 수였다. 주제 옆에 달아 두면
       그게 성적표처럼 읽힌다. 여기서 볼 것은 문의가 몰리는 쪽이다. */
    return '<div class="topics">' +
      '<span class="tp-label">최근 한 달 문의 주제</span>' +
      top.map(function (t) {
        return '<button class="tp' + (inboxTag === t.tag ? ' on' : '') +
          '" data-ib-tag="' + UI.esc(t.tag) + '" type="button">' + UI.esc(t.tag) +
          '<em>' + t.n + '</em></button>';
      }).join('') +
      (inboxTag
        ? '<button class="tp-clear" data-ib-tag="" type="button">' + UI.esc(inboxTag) + ' 풀기 ✕</button>'
        : '') +
    '</div>';
  }

  /* 교육문의 화면 — 상단 탭에서 들어온다 */
  function renderInbox(main) {
    main.innerHTML =
      '<div class="board">' +
        '<header class="board-head">' +
          '<span class="tr-icon home ph-ic">' + UI.icon('inbox', 22) + '</span>' +
          '<div class="ph-text"><h2>교육문의</h2>' +
            '<p class="bd-sum">KMA 홈페이지로 들어온 교육문의입니다 · ' +
              '<b class="bd-live">3분마다 자동으로 새 문의를 가져옵니다</b></p>' +
          '</div>' +
          /* 마지막으로 읽어 온 때와 새로고침은 화면 머리에 둔다.
             아래에 '인바운드 문의' 라는 제목을 하나 더 세워 그 안에 넣었더니
             바로 위 '교육문의' 와 같은 말이 두 번 나와 칸만 늘었다. */
          ibSeen() +
        '</header>' +
        inboxSection() +
        '<section class="bd-start">' +
          '<div class="bd-stext"><b>목록에 없는 문의인가요</b>' +
            '<span>메일이나 전화로 받은 문의는 글을 그대로 붙여넣으면 ' +
            '인원·기간·장소·주제를 뽑아 제안서를 만들어 둡니다.</span></div>' +
          '<button class="btn big primary" data-voc type="button">문의 붙여넣기</button>' +
        '</section>' +
      '</div>';
    bindHome(main);
  }

  /* 프로젝트 화면에 남기는 한 줄 — 새 문의가 있다는 것만 알린다 */
  function inboxTease() {
    if (!inbox || inbox === 'asking' || !inbox.items || !inbox.items.length) return '';
    var COLD = { '수주성공': 1, '수주실패': 1, '진행철회': 1 };
    var made = {};
    if (g.Projects) {
      g.Projects.list().forEach(function (p) { if (p.vocId) made[p.vocId] = 1; });
    }
    var fresh = inbox.items.filter(function (x) { return !COLD[x.stage] && !made[x.id]; });
    /* 기다리는 문의가 없어도 '문의 붙여넣기' 길은 남겨 둔다 —
       메일이나 전화로 받은 건은 목록에 없다. */
    return '<section class="bd-start ib-tease">' +
      '<div class="bd-stext"><b>' +
        (fresh.length ? '교육문의 ' + fresh.length + '건이 기다리고 있습니다'
                      : '기다리는 교육문의가 없습니다') + '</b>' +
        '<span>' + (fresh.length
          ? UI.esc(fresh.slice(0, 3).map(function (x) { return x.company || '회사 없음'; }).join(' · ')) +
            (fresh.length > 3 ? ' 외 ' + (fresh.length - 3) + '건' : '')
          : '메일이나 전화로 받은 문의는 글을 그대로 붙여넣으면 제안서까지 만들어 둡니다.') +
        '</span></div>' +
      '<div class="bd-sact">' +
        '<button class="btn big" data-voc type="button">문의 붙여넣기</button>' +
        (fresh.length
          ? '<button class="btn big primary" data-go="' + INBOX_ID + '" type="button">교육문의 보기</button>'
          : '') +
      '</div>' +
    '</section>';
  }

  /* 노션을 다시 읽어 온다.
     한 번 읽고 나면 화면을 떠났다 와도 그대로라, 그 사이에 새 문의가 들어와도
     모르고 지나간다. 그래서 언제 읽어 온 것인지 적어 두고, 다시 읽는 단추를 둔다. */
  function loadInbox(again) {
    if (inbox === 'asking' || inboxBusy) return;
    if (inbox !== null && !again) return;
    inboxBusy = !!again;
    if (!again) inbox = 'asking';
    fetch('/api/notion/voc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 })
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        inbox = (d && d.items) ? dropBooking(d) : { items: [] };
        inboxAt = Date.now();
        inboxBusy = false;
        repaint(document.getElementById('main'));
      })
      .catch(function () {
        inboxBusy = false;
        if (inbox === 'asking') inbox = { items: [] };
        repaint(document.getElementById('main'));
      });
  }

  /* ── 교육문의 자동 갱신 ──────────────────────────────
     새 문의가 들어와도 새로고침을 눌러야만 보였다. 문의를 기다리는 화면인데
     손으로 눌러야 알 수 있으면, 띄워 놓는 뜻이 없다.

     교육문의 화면에 머무는 동안만 3분마다 읽어 온다. 다른 화면에 있을 때는
     멈춘다 — 안 보는 화면 때문에 노션을 두드릴 까닭이 없다.
     창을 다시 볼 때도 한 번 읽는다(자리를 비운 사이에 들어온 것을 잡으려고).
     노션은 읽기만 한다. */
  var INBOX_EVERY = 3 * 60 * 1000;
  var inboxTimer = null;

  function watchInbox(on) {
    if (inboxTimer) { clearInterval(inboxTimer); inboxTimer = null; }
    if (!on) return;
    inboxTimer = setInterval(function () {
      /* 창이 가려져 있으면 건너뛴다. 다시 볼 때 아래 handler 가 읽어 온다. */
      if (document.hidden) return;
      loadInbox(true);
    }, INBOX_EVERY);
  }

  /* 창을 다시 볼 때 — 너무 잦으면 안 되니 한 텀 지났을 때만 */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !inboxTimer) return;
    if (!inboxAt || Date.now() - inboxAt > INBOX_EVERY) loadInbox(true);
  });

  /* 언제 읽어 온 것인지.
     '방금' 만 적어 두니 화면을 오래 띄워 둔 날에는 그 '방금' 이 언제였는지
     알 수가 없었다. 시각을 먼저 박아 두고, 얼마나 지났는지는 뒤에 덧붙인다. */
  function seenAt() {
    if (!inboxAt) return '';
    var t = new Date(inboxAt);
    var p = function (n) { return ('0' + n).slice(-2); };
    var clock = p(t.getMonth() + 1) + '.' + p(t.getDate()) + ' ' +
      p(t.getHours()) + ':' + p(t.getMinutes());
    var m = Math.floor((Date.now() - inboxAt) / 60000);
    var ago = m < 1 ? '방금' : m < 60 ? m + '분 전' : Math.floor(m / 60) + '시간 전';
    return clock + ' 기준 · ' + ago;
  }

  /* 화면 머리 오른쪽에 붙는 '언제 읽어 왔나 + 다시 읽기'.
     아직 한 번도 못 읽었으면 내보내지 않는다 — 빈 화면에 단추만 뜨면 고장으로 보인다. */
  function ibSeen() {
    if (inbox === null) return '';
    return '<span class="ib-seen">' +
      '<span class="ib-when">' + UI.esc(seenAt()) + '</span>' +
      '<button class="btn tiny" data-ib-reload type="button"' +
        (inboxBusy || inbox === 'asking' ? ' disabled' : '') + '>' +
        '<span class="ib-spin' + (inboxBusy || inbox === 'asking' ? ' on' : '') + '">↻</span>' +
        (inboxBusy || inbox === 'asking' ? '가져오는 중' : '새로고침') + '</button>' +
    '</span>';
  }

  function inboxSection() {
    if (inbox === null) { loadInbox(false); return ''; }
    if (inbox === 'asking' || !inbox.items || !inbox.items.length) return '';

    /* 이미 프로젝트로 옮긴 문의는 흐리게 — 두 번 만들지 않게 */
    var made = {};
    if (g.Projects) {
      g.Projects.list().forEach(function (p) {
        if (p.vocId) made[p.vocId] = p.id;
      });
    }
    var fresh = inbox.items.filter(function (x) { return !made[x.id]; });

    /* 이미 결판난 건은 목록에서 뺀다 — 여기서 더 할 일이 없다.
       (수주한 건은 프로젝트 쪽에 남아 있으니 없어지는 게 아니다) */
    var COLD = { '수주성공': 1, '수주실패': 1, '진행철회': 1 };

    /* 섭외 건은 읽어 올 때 이미 걸렀다 (dropBooking) */
    var shown = inbox.items.filter(function (x) { return !COLD[x.stage]; });

    /* 주제를 고르면 그 주제만 */
    if (inboxTag) {
      shown = shown.filter(inTopicWindow).filter(function (x) {
        return (x.tags || []).indexOf(inboxTag) !== -1;
      });
    }

    return '<section class="board-sec">' +
      /* 주제는 끝난 건까지 센다 — 들어온 문의다. 목록만 살아 있는 건으로 좁힌다. */
      inboxTopics(inbox.items) +
      /* 백 줄을 한 번에 깔면 스크롤만 길어진다. 끊어서 보여 주고 더 부르게 둔다. */
      /* 최신순. 등급으로 먼저 줄 세워 봤더니 오늘 들어온 문의가
         한참 아래에 묻혔다. 새로 온 것이 맨 위에 있어야 한다. */
      '<div class="inbox">' + shown.slice().sort(function (a, b) {
        return String(b.at).localeCompare(String(a.at));
      }).slice(0, inboxShow).map(function (x) {
        var done = made[x.id];
        var ask = String(x.subject || x.ask || '').replace(/\s+/g, ' ').trim();
        var who = [x.dept, x.rank].filter(Boolean).join(' ');
        return '<div class="inbox-row' + (done ? ' done' : '') +
            (COLD[x.stage] ? ' cold' : '') + '">' +
          /* 줄을 누르면 원문을 펼친다. 오른쪽 단추는 바로 만들기. */
          '<button class="ib-body" data-voc-open="' + UI.esc(x.id) + '" type="button">' +
            /* 날짜를 맨 앞에 둔다 — 최신순으로 훑을 때 눈이 먼저 닿는 자리다 */
            '<span class="ib-top">' +
              (x.at ? '<time class="ib-date">' + UI.esc(x.at.slice(0, 10)) + '</time>' : '') +
              '<b>' + UI.esc(x.company || '회사 없음') + '</b>' +
              (x.grade ? UI.badge(x.grade.replace('-LEVEL', ''), x.grade === 'A-LEVEL' ? 'ok' : 'off') : '') +
              (x.stage ? UI.badge(x.stage, COLD[x.stage] ? 'off' : 'type') : '') +
              (x.team && x.team !== '미배정' ? '<em>' + UI.esc(x.team) + '</em>'
                : x.team === '미배정' ? UI.badge('미배정', 'warn') : '') + '</span>' +
            '<span class="ib-ask">' + UI.esc(ask.slice(0, 150)) + (ask.length > 150 ? '…' : '') + '</span>' +
            '<span class="ib-meta">' +
              (x.source ? '<em>' + UI.esc(x.source) + '</em>' : '') +
              (who ? '<em>' + UI.esc(who) + '</em>' : '') +
              (x.tags || []).slice(0, 3).map(function (t) {
                return '<em>' + UI.esc(t) + '</em>';
              }).join('') +
            '</span>' +
          '</button>' +
          /* 강사 섭외 줄만 '프로젝트로 담기' 로 바꿔 놨었는데, 프로젝트를 지우고
             돌아오면 단추 이름이 달라져 있어 같은 자리인지 헷갈렸다.
             줄마다 다른 말을 붙일 일이 아니다 — 안 만든 건은 모두 '제안서 만들기'. */
          (done
            ? '<button class="btn tiny" data-project="' + UI.esc(done) + '" type="button">프로젝트 열기</button>'
            : '<button class="btn primary" data-voc-make="' + UI.esc(x.id) + '" type="button">제안서 만들기</button>') +
        '</div>';
      }).join('') + '</div>' +
      (shown.length > inboxShow
        ? '<div class="inbox-more"><button class="btn" data-ib-more type="button">' +
          '더 보기 (' + (shown.length - inboxShow) + '건 남음)</button></div>'
        : '') +
    '</section>';
  }

  /* 문의 한 건을 펼쳐 본다.
     목록에서는 한 줄로 줄여 보여 주는데, 실제로 제안서를 쓰려면
     원문을 끝까지 읽어야 한다. 누르면 여기서 전문을 보고 바로 만든다. */
  function vocSheet(x, madeId) {
    UI.$$('.sheet-wrap[data-voc-detail]').forEach(function (el) { el.remove(); });
    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.setAttribute('data-voc-detail', '1');

    function row(label, val) {
      if (!val) return '';
      return '<div class="vs-row"><span>' + UI.esc(label) + '</span><b>' + UI.esc(val) + '</b></div>';
    }

    host.innerHTML =
      '<div class="sheet wide">' +
        '<div class="sheet-head"><h2 class="sheet-title">' + UI.esc(x.company || '교육 문의') + '</h2>' +
          '<button class="icon-btn" data-no type="button">✕</button></div>' +
        '<div class="sheet-body">' +
          (x.subject ? '<p class="vs-subject">' + UI.esc(x.subject) + '</p>' : '') +
          '<div class="vs-grid">' +
            row('등급', x.grade) + row('진행상태', x.stage) + row('팀 분배', x.team) +
            row('유입경로', x.source) +
            row('담당', [x.person, x.rank].filter(Boolean).join(' ')) +
            row('부서', x.dept) +
            row('메일', x.email) +
            row('문의 시기', [x.year, x.month].filter(Boolean).join(' ')) +
            row('제출', (x.at || '').slice(0, 10)) +
            /* 금액은 실제로 수주된 건에서만 뜻이 있다. 나머지는 빈칸이라 안 그린다. */
            row('매출', x.sales ? Number(x.sales).toLocaleString('ko-KR') + '원' : '') +
            row('매출이익', x.profit ? Number(x.profit).toLocaleString('ko-KR') + '원' : '') +
          '</div>' +
          ((x.tags || []).length
            ? '<div class="vs-tags">' + x.tags.map(function (t) {
                return '<em>' + UI.esc(t) + '</em>';
              }).join('') + '</div>' : '') +
          '<h4 class="vs-h">교육 문의 내용</h4>' +
          '<pre class="vs-ask">' + UI.esc(x.ask || '(내용 없음)') + '</pre>' +
        '</div>' +
        '<div class="sheet-foot">' +
          '<button class="btn big ghost" data-no type="button">닫기</button>' +
          (x.url ? '<a class="btn big" href="' + UI.esc(x.url) + '" target="_blank" rel="noopener">노션에서 보기</a>' : '') +
          (madeId
            ? '<button class="btn big primary" data-open-pj="' + UI.esc(madeId) + '" type="button">프로젝트 열기</button>'
            : '<button class="btn big primary" data-make-here="' + UI.esc(x.id) + '" type="button">이 문의로 제안서 만들기</button>') +
        '</div>' +
      '</div>';

    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });
    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-no]') || e.target === host) return close();
      var mk = e.target.closest('[data-make-here]');
      if (mk) { close(); makeFromVoc(mk.dataset.makeHere); return; }
      var op = e.target.closest('[data-open-pj]');
      if (op) {
        close();
        if (g.Projects) g.Projects.setActive(op.dataset.openPj);
        go('project', { view: 'detail' });
      }
    });
  }

  /* 문의제목이 늘 과정명은 아니다.
     '10월 1일 강의 문의드립니다.' 같은 제목을 그대로 과정명으로 쓰면
     프로젝트 목록이 온통 '문의드립니다' 가 된다.
     인사말투를 떼고, 남는 게 없으면 태그나 파서가 뽑은 주제로 간다. */
  var ASK_WORDS = /(문의\s*(드립니다|드려요|합니다|해요)?|드립니다|요청\s*드립니다|섭외|견적|상담)[.!?]*\s*$/;

  function courseFromVoc(x, v) {
    var s = String(x.subject || '').trim();
    s = s.replace(/^\s*\[[^\]]*\]\s*/, '');        /* 앞머리 [문의 강사] 같은 것 */
    var cut = s.replace(ASK_WORDS, '').replace(/[\s·\-–~]+$/, '').trim();
    /* '증권사에 주제강연을' 같은 문장 조각을 과정 이름꼴로 */
    if (g.PropStore && g.PropStore.tidyCourse) cut = g.PropStore.tidyCourse(cut);
    /* 날짜만 남거나 너무 짧으면 제목을 못 믿는다 */
    var onlyDate = /^\d{1,2}\s*월\s*\d{1,2}\s*일?\s*(강의|교육)?$/.test(cut);
    if (cut.length >= 4 && !onlyDate) return cut;

    var tags = (x.tags || []).filter(Boolean);
    if (tags.length) return tags.slice(0, 2).join(' · ') + ' 과정';
    if (v.topics && v.topics.length) return v.topics[0];
    return s || '교육';
  }

  /* 파서가 문장을 통째로 기간으로 집어 오는 일이 있다
     ('10월 1일 강의 문의드립' 처럼). 날짜로 읽히는 부분만 오려 낸다.
     문장을 그대로 두면 운영 조건 칸에 인사말이 들어앉는다. */
  var DATE_PAT = [
    /\d{2,4}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}\s*일?(\s*[~-]\s*(\d{1,4}\s*[-./년]\s*)?(\d{1,2}\s*[-./월]\s*)?\d{1,2}\s*일?)?/,
    /\d{1,2}\s*월\s*\d{1,2}\s*일?(\s*[~-]\s*\d{1,2}\s*[월]?\s*\d{1,2}\s*일?)?/,
    /\d{1,2}\s*월\s*(초|중|말|중순|하순|상순)/,
    /\d{1,2}\s*월/
  ];

  function cleanPeriod(s) {
    s = String(s || '').trim();
    if (!s) return '';
    for (var i = 0; i < DATE_PAT.length; i++) {
      var m = DATE_PAT[i].exec(s);
      if (m) return m[0].replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  /* 문의 한 건 → 프로젝트 + 제안서. 문의 글은 파서를 태워 칸을 채운다. */
  function makeFromVoc(id) {
    var x = (inbox.items || []).filter(function (i) { return i.id === id; })[0];
    if (!x || !g.PropStore || !g.Voc) return;

    var v = g.Voc.parse(x.ask || '');
    var course = courseFromVoc(x, v);
    var company = x.company || '고객사 미입력';

    /* 문의한 사람이 곧 제안서를 받을 사람이다.
       여기서 안 옮겨 두면 나중에 보낼 때마다 노션을 다시 열어 주소를 베껴야 한다. */
    var who = {
      company: company,
      person: x.person || '',
      dept: x.dept || '',
      rank: x.rank || ''
    };
    /* 과정명이 이미 고객사로 시작하면 앞에 또 붙이지 않는다 —
       '롯데칠성 롯데칠성 직무기반HR도입…' 처럼 두 번 나왔다. */
    var title = course.indexOf(company) === 0 ? course : company + ' ' + course;
    var p = g.PropStore.create({ title: title, client: who });
    g.Voc.applyTo(p, v);
    /* 파서가 못 읽어도 문의 원문은 반드시 남긴다 */
    p.context.inquiry = x.ask || '';
    /* 노션에서 온 맥락 — 어디로 들어왔고 어떤 건인지 */
    var seen = [];
    if (x.source) seen.push('유입 ' + x.source);
    if (x.grade) seen.push('등급 ' + x.grade);
    if (x.team) seen.push('팀 분배 ' + x.team);
    if (x.dept || x.rank) seen.push('담당 ' + [x.dept, x.rank].filter(Boolean).join(' '));
    if (seen.length) p.context.note = seen.join(' · ');
    /* 노션이 달아 둔 태그가 주제를 가장 정확히 말해 준다.
       문의 글은 인사말이 절반인데, 태그는 사람이 골라 둔 것이라 잡음이 없다.
       비슷한 제안 프로그램을 찾을 때 이걸 쓴다. */
    p.tags = (x.tags || []).slice();
    p.ops.period = cleanPeriod(p.ops.period);
    g.PropStore.update(p.id, {});

    var pj = g.Projects.create({
      company: company, course: course, stage: '제안준비',
      proposalId: p.id, vocId: x.id,
      /* 메일 보낼 때 '받는 사람' 은 프로젝트의 담당자 칸에서 온다 */
      client: { person: x.person || '', rank: x.rank || '', dept: x.dept || '',
                email: x.email || '' },
      ops: { headcount: v.headcount, period: cleanPeriod(v.period), place: v.place }
    });
    g.Projects.setActive(pj.id);
    g.PropStore.setActive(p.id);

    /* 양식을 먼저 정한다. 세부 내용은 양식 칸의 줄 수·너비에 맞춰 쓰므로,
       쓰고 나서 양식을 바꾸면 칸에 안 맞는다.
       양식이 하나뿐이거나 기본 양식이 있어도 늘 템플릿 화면부터 — 무엇으로 만드는지 보고 고른 뒤에 쓴다
       (사용자 요청 2026-10-09). 고르는 순간 이어서 커리큘럼·세부 내용을 쓴다(views pickedTpl). */
    p.pendingSeed = true;
    g.PropStore.update(p.id, {});
    go('proposal', { view: 'templates' });
    UI.toast('양식을 먼저 골라 주세요. 고르면 그 양식에 맞춰 커리큘럼과 세부 내용을 씁니다', 'ok');
  }

  /* 커리큘럼 → 세부 내용을 한 번에 쓴다.
     컨설턴트는 만들어진 제안서에서 교수와 견적만 보면 되게 한다.
     기다림 창은 두 걸음 내내 열어 둔다 — 닫았다 다시 뜨면 같은 일을 두 번 하는 것처럼 보였다. */
  function writeAll(p) {
    var company = (p.client && p.client.company) || '';
    delete p.pendingSeed;
    seedCurriculum(p, function (how, from, refs) {
      if (g.Proposal && g.Proposal.render) g.Proposal.render();
      if (how === 'ai' && (p.approach.modules || []).length && g.PropViews && g.PropViews.deepen) {
        g.PropViews.deepen(p, {
          refs: refs || [],
          step: '2/2 ',
          done: function () {
            var asked = p.teacherAsked || [];
            UI.toast(company + ' 제안서를 만들었습니다 · 커리큘럼과 세부 내용까지 썼습니다' +
              (asked.length ? ' · 문의에서 요청한 ' + asked.join('·') + ' 강사를 넣었습니다' : ''), 'ok');
          }
        });
        return;
      }
      UI.busy(false);
      UI.toast(company + ' 제안서를 만들었습니다' +
        (how === 'ai' ? ' · 이 문의에 맞춰 커리큘럼을 새로 썼습니다'
         : how === 'copy' ? ' · 「' + from.slice(0, 14) + '…」 커리큘럼을 담았습니다' : ''), 'ok');
    }, { chain: true });
  }

  /* 커리큘럼을 채워 둔다.
     비슷한 제안서를 그대로 베끼면 이 문의에 안 맞는다 — 5시간짜리 문의에
     16시간 커리큘럼이 붙고, 고객이 말한 주제가 빠진 채로 완성됐다.
     그래서 **매칭된 건을 참고자료로만 넘기고 새로 쓴다.**
     API 가 막히면(키 없음·네트워크) 그때만 매칭된 건을 그대로 담는다 —
     빈 제안서를 내놓는 것보다는 초안이라도 있는 편이 낫다. */
  /* opt.chain — 세부 내용까지 이어 쓸 때. 성공하면 기다림 창을 닫지 않고 넘긴다
     (이어 받는 쪽이 닫는다). 실패하면 여기서 닫는다. */
  function seedCurriculum(p, done, opt) {
    var P = g.PropStore;
    var chain = !!(opt && opt.chain);
    if (!P || !P.matchPast) return done('');

    /* 예상 시간을 달아 두면 기다리는 동안 진행 막대가 찬다 (UI.withEta) */
    UI.busy(true, UI.withEta(chain ? '1/2 커리큘럼을 짜는 중…' : '커리큘럼을 쓰는 중…', 90), null, 'ai');

    fetch('/api/notion/proposals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        var text = [(p.tags || []).join(' '), p.title, p.context.inquiry]
          .filter(Boolean).join(' ');
        /* 참고 건을 다섯으로 늘린다. 토큰을 아끼는 것보다 제안서 품질이 먼저다 —
           재료가 많을수록 모듈을 나누는 방식과 표현의 폭이 넓어진다.
           (틀로 베끼는 것이 아니라 재료로만 쓰므로 많아도 끌려가지 않는다) */
        var hits = P.matchPast(text, items, 5);
        var refs = hits.map(function (h) { return h.item; });

        return fetch('/api/ai/curriculum', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inquiry: p.context.inquiry, title: p.title,
            hours: Number(p.ops.hours) || 0,
            sessions: Number(p.ops.sessions) || 1,
            headcount: Number(p.ops.headcount) || 0,
            names: [p.client.company, p.client.person].filter(Boolean),
            caps: P.caps(p),
            refs: refs
          })
        }).then(function (r) { return r.json(); })
          .then(function (res) {
            if (res && res.curriculum) {
              g.PropViews.takeAi(p, res.curriculum, refs);
              /* 커리큘럼만 넣으면 반쪽이다. 참고한 제안서에는 그 커리큘럼을
                 실제로 진행한 추천 강사가 함께 적혀 있다 — 같이 넣어야
                 '이 과정을 이 사람이 한다' 가 맞아떨어진다.
                 (예전 제안서를 그대로 쓰는 길에서는 이미 그렇게 했는데,
                  AI 로 새로 쓰는 길에서는 강사를 빠뜨리고 있었다) */
              /* items 를 통째로 넘긴다 — 고른 교수가 그동안 어떤 건을 했는지
                 찾아 '유사 프로젝트' 표를 채우는 데 쓴다. */
              return g.PropViews.seedTeachers(p, refs, items).then(function () {
                if (!chain) UI.busy(false);
                return done('ai', '', refs);
              });
            }
            UI.busy(false);
            /* 새로 못 썼으면 왜 못 썼는지 반드시 말한다.
               조용히 베껴 넘어가면 '요즘 제안서가 왜 이러지' 하고 한참 뒤에야 안다. */
            aiFailed(res && res.message);
            var hit = hits[0];
            if (hit && (hit.item.curriculum || []).length >= 2) {
              g.PropViews.usePast(p, hit.item, items, true);
              return done('copy', hit.item.name || '');
            }
            return done('');
          });
      })
      .catch(function (e) {
        UI.busy(false);
        aiFailed('relay 에 닿지 못했습니다');
        done('');
      });
  }

  /* 커리큘럼을 새로 쓰지 못했을 때. 토스트는 몇 초 뒤 사라지므로,
     왜 안 됐는지와 어디서 고치는지를 같이 띄운다. */
  function aiFailed(why) {
    UI.confirm(
      (why || '알 수 없는 까닭으로 실패했습니다.') + '\n\n' +
      '대신 비슷한 제안서의 커리큘럼을 그대로 담아 두었습니다. ' +
      '이 문의에 맞는지 ② 내용 맨 위 경고를 보고 손봐 주세요.',
      { title: '커리큘럼을 새로 쓰지 못했습니다', ok: '설정 열기', cancel: '그냥 쓰기' }
    ).then(function (yes) { if (yes) openSettings(); });
  }

  /* 연락할 날이 지난 건이 몇 건인지 — 프로젝트 카드의 빨간 점과 같은 기준.
     목록을 따로 세우지는 않는다. 카드마다 이미 '지금 할 일' 이 붙어 있다. */
  function overdue() {
    if (!g.Projects) return 0;
    var PJ = g.Projects;
    return liveProjects().filter(function (p) {
      var fu = PJ.followUpOf(p);
      return fu && PJ.daysTo(fu.date) <= 0;
    }).length;
  }

  function summaryLine(c) {
    if (!c['전체']) return '프로젝트를 하나 만들면 여기에 진행 상황이 모입니다.';
    var bits = ['진행 중 ' + c['진행중'] + '건'];
    var od = overdue();
    if (od) bits.push('연락할 날이 지난 건 ' + od + '건');
    return bits.join(' · ');
  }

  /* 프로젝트 목록 — 진행 중만 보다가 전체·완료로 넓힐 수 있어야 해서 거르개를 같이 둔다. */
  var projFilter = '진행중';

  function projectTab() {
    if (!g.Projects) return '';
    var PJ = g.Projects;
    var all = PJ.list();
    var c = PJ.counts();
    if (!all.length) return projectSection([], c);

    var shown = all.filter(function (p) {
      if (projFilter === '전체') return true;
      if (projFilter === '완료') return p.stage === '완료' || p.stage === '무산';
      return PJ.LIVE.indexOf(p.stage) !== -1;
    });

    var chips = [
      { id: '진행중', label: '진행 중', n: c['진행중'] },
      { id: '전체', label: '전체', n: c['전체'] },
      { id: '완료', label: '완료·무산', n: (c['완료'] || 0) + (c['무산'] || 0) }
    ];

    /* 고객사로 묶는다.
       한 고객사에 과정이 여럿 걸리는 일이 흔한데, 밋밋한 한 줄 목록이면
       '이 회사 건이 몇 개였더라' 를 눈으로 훑어 세야 했다.
       묶어 두면 어느 고객사의 어느 과정인지 고르기만 하면 된다. */
    var byCo = {};
    shown.forEach(function (p) {
      var k = p.company || '고객사 미정';
      (byCo[k] = byCo[k] || []).push(p);
    });
    /* 최근에 손댄 고객사가 위로 */
    var cos = Object.keys(byCo).sort(function (a, b) {
      return latestAt(byCo[b]) - latestAt(byCo[a]);
    });

    /* 제목 옆 건수 칩은 걷었다 — 바로 아래 '진행 중 3 / 전체 3' 이 같은 숫자를
       더 자세히 말하고 있어서, 같은 3 이 한 화면에 세 번 나왔다. */
    return '<section class="board-sec">' +
      '<h3>프로젝트' +
        '<button class="btn tiny" data-go="project" type="button">+ 새 프로젝트</button></h3>' +
      '<div class="pipe">' + chips.map(function (x) {
        return '<button class="pipe-cell' + (projFilter === x.id ? ' on' : '') + (x.n ? '' : ' zero') +
          '" data-pf="' + x.id + '" type="button"><b>' + (x.n || 0) + '</b><span>' + x.label + '</span></button>';
      }).join('') + '</div>' +
      (shown.length
        ? '<div class="bd-cos">' + cos.map(function (co) {
            var rows = byCo[co];
            return '<section class="bd-co">' +
              '<h4 class="bd-coh"><span>' + UI.esc(co) + '</span>' +
                '<em>' + rows.length + '건</em></h4>' +
              /* 고객사 이름은 머리에 한 번 적혔다. 카드에는 과정명만 굵게. */
              '<div class="bd-projs">' + rows.map(function (p) {
                return projectCard(p, true);
              }).join('') + '</div>' +
            '</section>';
          }).join('') + '</div>'
        : '<div class="bd-clear"><b>이 조건에 맞는 건이 없습니다</b></div>') +
    '</section>';
  }

  function latestAt(rows) {
    return rows.reduce(function (m, p) {
      var t = Date.parse(p.updatedAt || p.createdAt || '') || 0;
      return t > m ? t : m;
    }, 0);
  }

  function projectSection(live, c) {
    if (!g.Projects) return '';
    if (!c['전체']) {
      return '<section class="board-sec">' +
        '<h3>진행 중인 프로젝트</h3>' +
        /* '아직 없습니다' 를 크게 세워 두면 처음 온 사람이 빈 칸만 보게 된다.
           할 일(첫 프로젝트 만들기)을 가운데에 두고 설명은 아래에 작게. */
        '<div class="panel flat bd-first">' +
          '<button class="btn big primary" data-go="project" type="button">+ 첫 프로젝트 만들기</button>' +
          '<span>고객사 × 과정 한 건이 프로젝트 하나입니다. 여기서 제안서가 시작됩니다</span>' +
        '</div></section>';
    }
    if (!live.length) {
      return '<section class="board-sec">' +
        '<h3>진행 중인 프로젝트</h3>' +
        '<div class="bd-clear"><b>진행 중인 건이 없습니다</b>' +
          '<span>끝났거나 무산된 건은 프로젝트 화면에서 볼 수 있습니다.</span>' +
          '<button class="btn tiny" data-go="project" type="button">프로젝트 보기</button></div>' +
      '</section>';
    }
    return '<section class="board-sec">' +
      '<h3>진행 중인 프로젝트 <em class="bd-cnt">' + live.length + '</em></h3>' +
      '<div class="bd-projs">' + live.map(projectCard).join('') + '</div>' +
      (c['전체'] > live.length
        ? '<p class="board-note">끝났거나 무산된 ' + (c['전체'] - live.length) + '건은 ' +
          '<button class="link small" data-go="project" type="button">프로젝트 화면</button>에 있습니다.</p>'
        : '') +
    '</section>';
  }

  /* 한 건이 제안서 → 발송 → 수주 → 운영 → 결과보고서 → 전달 중 어디까지 왔는지 */
  function projectCard(p, inGroup) {
    var steps = g.Projects.progress(p);
    var now = steps.filter(function (s) { return s.now; })[0];
    var doneN = steps.filter(function (s) { return s.done; }).length;
    /* 고객사로 묶어 놓은 자리에서는 과정명만 — 회사 이름을 줄마다 되풀이하지 않는다 */
    var title = inGroup === true
      ? (p.course || '이름 없는 과정')
      : g.Projects.name(p);
    /* 카드가 버튼이라 그 안에 또 버튼을 못 넣는다. 감싸고 옆에 삭제를 세운다. */
    return '<div class="bd-projwrap">' +
      '<button class="bd-proj" data-project="' + UI.esc(p.id) + '" type="button">' +
      '<span class="bd-phead">' +
        '<b>' + UI.esc(title) + '</b>' +
        '<em class="bd-stage">' + UI.esc(p.stage) + '</em>' +
      '</span>' +
      /* 막대만 여섯 칸 그어 두면 지금이 어느 단계인지 알려면 색을 세어야 했다.
         칸마다 이름을 두 글자로 붙인다 — 지나온 칸은 초록, 지금 칸은 진하게.
         파랑은 이 화면의 다른 단추들과 같은 색이라 '누르는 것' 처럼 보였다. */
      '<span class="bd-steps" aria-label="' + doneN + ' / ' + steps.length + ' 단계">' +
        steps.map(function (s) {
          return '<span class="bd-step' + (s.done ? ' done' : '') + (s.now ? ' now' : '') + '" ' +
            'title="' + UI.esc(s.label + ' — ' + s.sub) + '">' +
            '<i></i><em>' + UI.esc(s.short || s.label) + '</em></span>';
        }).join('') +
      '</span>' +
      '<span class="bd-pfoot">' +
        (now ? '<span class="bd-next">' + UI.icon('chevron', 14) + UI.esc(now.todo) + '</span>'
             : '<span class="bd-next ok">다음 단계를 기다리는 중</span>') +
        '<span class="bd-count">' + doneN + '/' + steps.length + '</span>' +
      '</span>' +
      '</button>' +
      '<button class="icon-btn pj-del" data-del-pj="' + UI.esc(p.id) + '" type="button" ' +
        'title="이 프로젝트 지우기" aria-label="' + UI.esc(g.Projects.name(p)) + ' 지우기">' +
        UI.icon('trash', 17) + '</button>' +
    '</div>';
  }

  /* ── 설정 ─────────────────────────────────────────── */
  /* 내 정보 · 공급자 정보 · 백업 — 여기저기 흩어져 있던 것을 한곳에 모았다 */

  function openSettings() {
    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });
    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }

    function draw() {
      var sender = g.MailStore ? g.MailStore.sender() : null;
      var note = backupNote();

      host.innerHTML =
        '<div class="sheet"><div class="sheet-head"><h2 class="sheet-title">설정</h2>' +
          '<button class="icon-btn" data-close type="button">✕</button></div>' +
        '<div class="sheet-body">' +

          /* 커리큘럼을 쓰는 자리가 막혀 있으면 쓰려고 누른 뒤에야 안다.
             여기서 미리 보고 고칠 수 있게 맨 위에 둔다. */
          '<h3 class="set-h">커리큘럼 쓰기</h3>' +
          '<div class="ai-set" data-ai-set>' +
            '<p class="ff-hint">확인하는 중…</p>' +
          '</div>' +

          '<h3 class="set-h">내 정보 <span>메일 서명에 들어갑니다</span></h3>' +
          '<button class="menu-row" data-sender type="button">' +
            '<span class="mr-icon">' + UI.icon('customers', 19) + '</span>' +
            '<span class="mr-body"><b>' + UI.esc(sender && sender.name ? sender.name + (sender.rank ? ' ' + sender.rank : '') : '아직 안 넣었습니다') + '</b>' +
              '<span>' + UI.esc(sender && (sender.team || sender.email) ? [sender.team, sender.email].filter(Boolean).join(' · ') : '이름 · 직급 · 소속 · 연락처') + '</span></span>' +
            '<span class="mr-arrow">' + UI.icon('chevron', 17) + '</span></button>' +

          '<h3 class="set-h">견적서 공급자 <span>외부용 견적서에 찍힙니다</span></h3>' +
          '<button class="menu-row" data-supplier type="button">' +
            '<span class="mr-icon">' + UI.icon('receipt', 19) + '</span>' +
            '<span class="mr-body"><b>' + UI.esc(g.QuoteStore ? g.QuoteStore.supplier().company : '') + '</b>' +
              '<span>등록번호 · 대표 · 소재지 · 업태</span></span>' +
            '<span class="mr-arrow">' + UI.icon('chevron', 17) + '</span></button>' +

          '<h3 class="set-h">백업 <span>' + UI.esc(note.text) + '</span></h3>' +
          '<p class="sheet-note' + (note.tone ? ' warn' : '') + '">모든 자료는 이 브라우저 안에만 있습니다. ' +
            '<b>기록을 지우면 작업 내용이 함께 사라집니다.</b> 주기적으로 파일로 받아 두세요. ' +
            '(사진·증빙 원본 이미지와 올린 PPT 양식 파일은 들어가지 않습니다)</p>' +
          '<div class="menu-list">' +
            '<button class="menu-row" data-export type="button"><span class="mr-icon">' + UI.icon('download', 19) + '</span>' +
              '<span class="mr-body"><b>전체 내보내기</b><span>JSON 파일 하나로 저장</span></span>' +
              '<span class="mr-arrow">' + UI.icon('chevron', 17) + '</span></button>' +
            '<button class="menu-row" data-import type="button"><span class="mr-icon">' + UI.icon('upload', 19) + '</span>' +
              '<span class="mr-body"><b>가져오기</b><span>내보낸 JSON 으로 되돌리기</span></span>' +
              '<span class="mr-arrow">' + UI.icon('chevron', 17) + '</span></button>' +
          '</div>' +
          '<input type="file" accept="application/json,.json" data-file hidden>' +
        '</div></div>';
    }

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target === host) return close();
      if (e.target.closest('[data-sender]')) {
        if (g.MailViews) g.MailViews.editSender(function () { draw(); go(current ? current.id : null); });
        return;
      }
      if (e.target.closest('[data-supplier]')) {
        if (g.QuoteViews) g.QuoteViews.editSupplier(function () { draw(); });
        return;
      }
      if (e.target.closest('[data-export]')) { doExport(); close(); return; }
      if (e.target.closest('[data-import]')) host.querySelector('[data-file]').click();
    });

    host.addEventListener('change', function (e) {
      if (!e.target.closest('[data-file]')) return;
      var f = e.target.files[0];
      if (f) doImport(f, close);
    });

    draw();
    checkAi(host);
  }

  /* 커리큘럼 쓰기가 살아 있는지 확인해 설정 화면에 적는다 */
  function checkAi(host) {
    var box = host.querySelector('[data-ai-set]');
    if (!box) return;
    fetch('/api/ai/status').then(function (r) { return r.json(); })
      .then(function (d) {
        var b = host.querySelector('[data-ai-set]');
        if (!b) return;
        b.className = 'ai-set' + (d.ok ? ' ok' : ' bad');
        b.innerHTML =
          '<b>' + (d.ok ? '쓸 수 있습니다' : '지금은 쓸 수 없습니다') + '</b>' +
          '<p class="ff-hint">' + UI.esc(d.message || '') +
            (d.ok ? ' 문의 글과 지난 제안서를 보고 커리큘럼을 새로 씁니다 (' +
                    UI.esc(d.model) + ').' : '') + '</p>' +
          (d.ok ? '' :
            '<p class="ff-hint">환경변수 <code>ANTHROPIC_API_KEY</code> 를 넣어 주세요 — ' +
            '로컬은 <code>.env</code> 에 넣고 서버(<code>python relay.py</code>)를 다시 켜고, ' +
            '배포본은 Vercel 환경변수에 넣고 다시 배포합니다.</p>');
      })
      .catch(function () {
        var b = host.querySelector('[data-ai-set]');
        if (b) {
          b.className = 'ai-set bad';
          b.innerHTML = '<b>확인하지 못했습니다</b>' +
            '<p class="ff-hint">서버에 닿지 못했습니다. 잠시 뒤 다시 확인해 주세요.</p>';
        }
      });
  }

  function doExport() {
    var payload = { app: 'kma-workspace', version: 1, savedAt: new Date().toISOString(), apps: {} };
    all().forEach(function (a) {
      if (!a.exportData) return;
      try { payload.apps[a.id] = a.exportData(); } catch (err) {}
    });
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = SITE.replace(/\s+/g, '') + '_백업_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 6000);
    markBackup();
    UI.toast('백업 파일을 저장했습니다', 'ok');
  }

  function doImport(f, close) {
    f.text().then(function (txt) {
      var d;
      try { d = JSON.parse(txt); } catch (err) { UI.toast('읽을 수 없는 파일입니다', 'err'); return; }
      var src = d.apps || d;
      var done = [];
      all().forEach(function (a) {
        if (!a.importData || !src[a.id]) return;
        try { a.importData(src[a.id]); done.push(a.short || a.name); } catch (err) {}
      });
      if (close) close();
      if (done.length) {
        UI.toast(done.join(' · ') + ' 자료를 되살렸습니다', 'ok');
        go(current ? current.id : null);
      } else {
        UI.toast('되살릴 자료를 찾지 못했습니다', 'err');
      }
    });
  }


  /* ── 시작 ─────────────────────────────────────────── */

  function init() {
    buildNav();
    /* 보관소의 '모든 PC 기본 양식' 을 받아 온다 — 어느 PC·브라우저에서 열어도 양식이 있게 */
    if (g.PropStore && g.PropStore.pullShared) { g.PropStore.load(); g.PropStore.pullShared(); }
    if (g.RepStore && g.RepStore.pullShared) { g.RepStore.load(); g.RepStore.pullShared(); }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || document.querySelector('.sheet-wrap')) return;
      if (current) go(HOME_APP);
    });
    /* 들어오면 교육문의부터 — 하루 일이 '새 문의 확인' 에서 시작한다.
       로고·Esc 는 여전히 프로젝트 현황으로 간다. */
    go(INBOX_ID);
  }

  /* 로고는 로그인 전에도 세운다 — 로그인 화면 왼쪽 위에 글자 'KMA' 만 덩그러니 있었다 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyBrand);
  else applyBrand();

  /* 로그인 문(gate.js)이 통과시킨 뒤에 연다. 두 번 불러도 한 번만 돈다. */
  var started = false;
  function start() {
    if (started) return;
    started = true;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  g.Shell = {
    go: go, apps: all, openSettings: openSettings, signals: signals,
    start: start,
    /* 1차 — 문의로 커리큘럼 골격을 잡는다. ② 내용 화면에서도 부른다. */
    seedCurriculum: seedCurriculum,
    /* 양식을 고른 뒤 커리큘럼·세부 내용을 한 번에 (교육문의에서 만들 때 템플릿 화면이 부른다) */
    writeAll: writeAll,
    /* 읽어 온 교육문의. 제안서 쪽에서 '이 고객사가 수주로 이어졌나' 를 볼 때 쓴다 */
    vocItems: function () {
      return (inbox && inbox !== 'asking' && inbox.items) ? inbox.items : [];
    },
    current: function () { return current && current.id; }
  };
})(window);
