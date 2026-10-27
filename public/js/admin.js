/* admin.js — 관리자 화면
 *
 * 본 앱(index.html)과 떼어 놓은 별도 페이지다. 여기서만 로그인하고,
 * 관리자로 지정된 계정만 접속 이력과 사용자 목록을 본다.
 *
 * '관리자냐' 는 서버가 판단한다(accounts 표의 role). 브라우저가 스스로 정하면
 * 개발자 도구에서 한 줄 고쳐 관리자가 될 수 있어서 아무 뜻이 없다.
 */
(function (g) {
  'use strict';

  var U = g.UI, esc = U.esc;
  var main = document.getElementById('ad-main');
  var topRight = document.getElementById('ad-topright');
  var state = { me: null, tab: 'history', history: [], users: [], busy: false };

  function n(v) { return Number(v || 0).toLocaleString('ko-KR'); }

  function when(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  var EVENT = {
    signup: { label: '가입', tone: 'type' },
    login: { label: '로그인', tone: 'ok' },
    logout: { label: '로그아웃', tone: 'off' },
    login_failed: { label: '로그인 실패', tone: 'err' }
  };

  /* ── 로그인 ────────────────────────────────────────
     회원가입 칸은 없다. 계정은 관리자가 발급한다 —
     Supabase 쪽에서도 자가 가입(disable_signup)을 닫아 두었다. */

  function gate(note) {
    topRight.innerHTML = '<a class="btn tiny" href="index.html">앱으로</a>';
    main.innerHTML =
      '<div class="ad-gate">' +
        '<div class="ad-card">' +
          '<h1>로그인</h1>' +
          '<p class="ad-sub">관리자 화면입니다. 계정은 관리자가 발급합니다 — ' +
            '아이디가 없으면 담당자에게 요청하세요.</p>' +
          (note ? '<div class="ad-note">' + esc(note) + '</div>' : '') +
          '<form id="ad-form" novalidate>' +
            '<label class="ad-field"><span>아이디 또는 이메일</span>' +
              '<input type="text" id="ad-id" autocomplete="username" autocapitalize="off" ' +
                'spellcheck="false" placeholder="hong.gildong" required></label>' +
            '<label class="ad-field"><span>비밀번호</span>' +
              '<input type="password" id="ad-pw" autocomplete="current-password" required></label>' +
            '<p class="ad-err" id="ad-err" hidden></p>' +
            '<button class="btn big primary block" type="submit" id="ad-go">로그인</button>' +
          '</form>' +
        '</div>' +
      '</div>';

    var form = document.getElementById('ad-form');
    var err = document.getElementById('ad-err');
    var go = document.getElementById('ad-go');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.busy) return;
      var id = document.getElementById('ad-id').value.trim();
      var pw = document.getElementById('ad-pw').value;
      err.hidden = true;
      if (!id || !pw) { err.textContent = '아이디와 비밀번호를 모두 입력해 주세요.'; err.hidden = false; return; }

      state.busy = true;
      go.disabled = true;
      go.textContent = '확인하는 중…';

      g.Auth.signIn(id, pw).then(function () {
        return boot();
      }).catch(function (e2) {
        err.textContent = e2.message || '요청이 실패했습니다.';
        err.hidden = false;
      }).then(function () {
        state.busy = false;
        if (go.isConnected) { go.disabled = false; go.textContent = '로그인'; }
      });
    });

    document.getElementById('ad-id').focus();
  }

  /* ── 로그인 후 ─────────────────────────────────────── */

  function whoLabel() {
    var s = g.Auth.session() || {};
    var p = s.profile || {};
    return p.name ? p.name + ' (' + p.username + ')' : (state.me.user.email || '');
  }

  function shell() {
    var me = state.me;
    topRight.innerHTML =
      '<span class="ad-who">' + esc(whoLabel()) +
        (me.is_admin ? ' <em class="ad-badge">관리자</em>' : '') + '</span>' +
      '<a class="btn tiny" href="index.html">앱으로</a>' +
      '<button class="btn tiny" id="ad-out" type="button">로그아웃</button>';
    document.getElementById('ad-out').addEventListener('click', function () {
      U.confirm('로그아웃할까요?', { ok: '로그아웃' }).then(function (yes) {
        if (!yes) return;
        g.Auth.signOut().then(function () { state.me = null; gate('로그아웃했습니다.'); });
      });
    });

    if (!me.is_admin) {
      main.innerHTML =
        '<div class="ad-gate"><div class="ad-card">' +
          '<h1>관리자 권한이 없습니다</h1>' +
          '<p class="ad-sub"><b>' + esc(whoLabel()) + '</b> 으로 로그인했지만 ' +
            '이 화면은 관리자로 지정된 계정만 볼 수 있습니다. ' +
            '기존 관리자에게 권한을 요청하세요.</p>' +
          '<button class="btn big block" id="ad-out2" type="button">다른 계정으로 로그인</button>' +
        '</div></div>';
      document.getElementById('ad-out2').addEventListener('click', function () {
        g.Auth.signOut().then(function () { state.me = null; gate(); });
      });
      return;
    }

    main.innerHTML =
      '<div class="ad-wrap">' +
        '<header class="ad-head"><h1>관리자</h1>' +
          '<p class="ad-sub">접속 이력과 계정을 봅니다. 두 표는 <b>서버를 거쳐야만</b> 읽힙니다 — ' +
            '브라우저 키로는 손댈 수 없습니다.</p></header>' +
        '<nav class="ad-tabs">' +
          '<button class="ad-tab' + (state.tab === 'history' ? ' on' : '') + '" data-t="history" type="button">접속 이력</button>' +
          '<button class="ad-tab' + (state.tab === 'users' ? ' on' : '') + '" data-t="users" type="button">계정</button>' +
        '</nav>' +
        '<div id="ad-body"><p class="ad-loading">불러오는 중…</p></div>' +
      '</div>';

    main.querySelectorAll('[data-t]').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.dataset.t; shell(); load(); });
    });
    load();
  }

  function load() {
    var body = document.getElementById('ad-body');
    if (!body) return;
    if (state.tab === 'history') {
      g.Auth.admin('/api/admin/history').then(function (d) {
        state.history = d.rows || [];
        drawHistory();
      }).catch(function (e) { body.innerHTML = '<p class="ad-err">' + esc(e.message) + '</p>'; });
    } else {
      g.Auth.admin('/api/admin/users').then(function (d) {
        state.users = d.rows || [];
        drawUsers();
      }).catch(function (e) { body.innerHTML = '<p class="ad-err">' + esc(e.message) + '</p>'; });
    }
  }

  function drawHistory() {
    var rows = state.history;
    var fail = rows.filter(function (r) { return r.event === 'login_failed'; }).length;
    document.getElementById('ad-body').innerHTML =
      '<div class="ad-stats">' +
        '<div class="ad-stat"><span>이력</span><b>' + n(rows.length) + '</b></div>' +
        '<div class="ad-stat' + (fail ? ' bad' : '') + '"><span>로그인 실패</span><b>' + n(fail) + '</b></div>' +
      '</div>' +
      (rows.length
        ? '<div class="ad-tablewrap"><table class="ad-table">' +
          '<thead><tr><th>시각</th><th>아이디</th><th>이름</th><th>일</th>' +
          '<th>비고</th><th>접속지</th></tr></thead><tbody>' +
          rows.map(function (r) {
            var ev = EVENT[r.event] || { label: r.event, tone: 'off' };
            return '<tr class="' + (r.event === 'login_failed' ? 'bad' : '') + '">' +
              '<td class="ad-at">' + esc(when(r.at)) + '</td>' +
              '<td><b>' + esc(r.username || '—') + '</b></td>' +
              '<td>' + esc(r.name || '') + '</td>' +
              '<td>' + U.badge(ev.label, ev.tone) + '</td>' +
              '<td class="ad-reason">' + esc(r.reason || '') + '</td>' +
              '<td class="ad-ip">' + esc(r.ip || '') + '</td>' +
            '</tr>';
          }).join('') + '</tbody></table></div>'
        : '<p class="ad-empty">아직 이력이 없습니다.</p>');
  }

  function drawUsers() {
    var rows = state.users;
    var meId = state.me.user.id;
    document.getElementById('ad-body').innerHTML =
      newUserCard() +
      '<p class="ad-hint">관리자로 지정하면 이 화면을 볼 수 있습니다. ' +
        '자기 자신의 권한을 빼거나 자기 계정을 지울 수는 없습니다 — ' +
        '아무도 못 들어가는 일을 막기 위해서입니다.</p>' +
      '<div class="ad-tablewrap"><table class="ad-table">' +
        '<thead><tr><th>아이디</th><th>이름</th><th>이메일</th><th>발급</th>' +
        '<th>마지막 로그인</th><th>권한</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          var self = r.id === meId;
          return '<tr>' +
            '<td><b>' + esc(r.username || '—') + '</b>' +
              (self ? ' <em class="ad-self">나</em>' : '') + '</td>' +
            '<td>' + esc(r.name || '—') + '</td>' +
            '<td class="ad-reason">' + esc(r.email || '—') + '</td>' +
            '<td class="ad-at">' + esc(when(r.created_at)) + '</td>' +
            '<td class="ad-at">' + esc(when(r.last_sign_in_at)) + '</td>' +
            '<td>' + (r.is_admin ? U.badge('관리자', 'type') : U.badge('일반', 'off')) + '</td>' +
            '<td class="ad-act">' +
              (self ? '' :
                '<button class="btn tiny' + (r.is_admin ? '' : ' primary') + '" ' +
                  'data-set="' + esc(r.id) + '" data-on="' + (r.is_admin ? '0' : '1') + '" type="button">' +
                  (r.is_admin ? '권한 빼기' : '관리자로') + '</button>') +
              '<button class="btn tiny" data-pw="' + esc(r.id) + '" ' +
                'data-who="' + esc(r.username || r.email || '') + '" type="button">비밀번호</button>' +
              (self ? '' :
                '<button class="icon-btn tiny" data-del="' + esc(r.id) + '" ' +
                  'data-who="' + esc(r.username || r.email || '') + '" ' +
                  'title="계정 삭제" type="button">' + U.icon('trash', 16) + '</button>') +
            '</td></tr>';
        }).join('') + '</tbody></table></div>';

    bindNewUser();

    document.querySelectorAll('[data-set]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        g.Auth.admin('/api/admin/set', {
          method: 'POST',
          body: JSON.stringify({ user_id: b.dataset.set, admin: b.dataset.on === '1' })
        }).then(function () {
          U.toast(b.dataset.on === '1' ? '관리자로 지정했습니다' : '권한을 뺐습니다', 'ok');
          load();
        }).catch(function (e) { U.toast(e.message, 'err'); b.disabled = false; });
      });
    });

    document.querySelectorAll('[data-pw]').forEach(function (b) {
      b.addEventListener('click', function () {
        U.form({ title: b.dataset.who + ' 비밀번호 바꾸기', fields: [
          { key: 'password', label: '새 비밀번호', type: 'text', required: true, span: 2,
            placeholder: '6자 이상 — 본인에게 따로 알려 주세요' }
        ], values: {} }).then(function (d) {
          if (!d) return;
          g.Auth.admin('/api/admin/reset-pw', {
            method: 'POST',
            body: JSON.stringify({ user_id: b.dataset.pw, password: d.password })
          }).then(function () { U.toast('비밀번호를 바꿨습니다', 'ok'); })
            .catch(function (e) { U.toast(e.message, 'err'); });
        });
      });
    });

    document.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        U.confirm('"' + b.dataset.who + '" 계정을 지웁니다. 되돌릴 수 없습니다.',
          { title: '계정을 지울까요', ok: '지우기', danger: true }).then(function (yes) {
          if (!yes) return;
          g.Auth.admin('/api/admin/delete-user', {
            method: 'POST', body: JSON.stringify({ user_id: b.dataset.del })
          }).then(function () { U.toast('계정을 지웠습니다', 'ok'); load(); })
            .catch(function (e) { U.toast(e.message, 'err'); });
        });
      });
    });
  }

  /* 계정 발급 — 아이디·비밀번호·이메일·이름을 여기서 준다 */
  function newUserCard() {
    return '<section class="ad-new">' +
      '<h3>계정 발급</h3>' +
      '<p class="ad-hint">아이디와 비밀번호를 정해서 알려 주시면 그 사람이 그대로 로그인합니다. ' +
        '확인 메일은 보내지 않습니다.</p>' +
      '<form id="ad-newform" class="ad-newgrid" novalidate>' +
        '<label class="ad-field"><span>아이디</span>' +
          '<input id="nu-username" type="text" autocapitalize="off" spellcheck="false" ' +
            'placeholder="hong.gildong" required></label>' +
        '<label class="ad-field"><span>이름</span>' +
          '<input id="nu-name" type="text" placeholder="홍길동" required></label>' +
        '<label class="ad-field"><span>이메일 (선택)</span>' +
          '<input id="nu-email" type="email" placeholder="hong@kma.or.kr"></label>' +
        '<label class="ad-field"><span>비밀번호</span>' +
          '<input id="nu-pw" type="text" placeholder="6자 이상" required></label>' +
        '<label class="ad-field"><span>권한</span>' +
          '<select id="nu-role"><option value="user">일반</option>' +
          '<option value="admin">관리자</option></select></label>' +
        '<p class="ad-err" id="nu-err" hidden></p>' +
        '<button class="btn primary" type="submit" id="nu-go">계정 만들기</button>' +
      '</form>' +
    '</section>';
  }

  function bindNewUser() {
    var form = document.getElementById('ad-newform');
    if (!form) return;
    var err = document.getElementById('nu-err');
    var go = document.getElementById('nu-go');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var d = {
        username: document.getElementById('nu-username').value.trim(),
        name: document.getElementById('nu-name').value.trim(),
        email: document.getElementById('nu-email').value.trim(),
        password: document.getElementById('nu-pw').value,
        role: document.getElementById('nu-role').value
      };
      go.disabled = true;
      go.textContent = '만드는 중…';
      g.Auth.createUser(d).then(function () {
        U.toast(d.username + ' 계정을 만들었습니다', 'ok');
        load();
      }).catch(function (e2) {
        err.textContent = e2.message || '만들지 못했습니다.';
        err.hidden = false;
        go.disabled = false;
        go.textContent = '계정 만들기';
      });
    });
  }

  /* ── 시작 ─────────────────────────────────────────── */

  function boot() {
    return g.Auth.me().then(function (me) {
      state.me = me;
      if (me) { shell(); return; }
      /* 계정이 하나도 없으면 로그인 화면을 보여 줘 봐야 들어갈 길이 없다.
         자가 가입을 닫아 두었으므로, 이때만 첫 관리자를 세우는 문을 연다. */
      return fetch('/api/auth/state').then(function (r) { return r.json(); })
        .then(function (d) { if (d && d.bootstrap) firstAdmin(); else gate(); })
        .catch(function () { gate(); });
    });
  }

  /* 첫 관리자 — 계정이 0개일 때만 보인다 */
  function firstAdmin() {
    topRight.innerHTML = '<a class="btn tiny" href="index.html">앱으로</a>';
    main.innerHTML =
      '<div class="ad-gate"><div class="ad-card">' +
        '<h1>첫 관리자 만들기</h1>' +
        '<p class="ad-sub">아직 계정이 하나도 없습니다. 지금 만드는 계정이 ' +
          '<b>관리자</b>가 되고, 그다음부터는 이 화면에서 계정을 발급합니다. ' +
          '회원가입은 열지 않습니다.</p>' +
        '<form id="ad-form" novalidate>' +
          '<label class="ad-field"><span>아이디</span>' +
            '<input id="nu-username" type="text" autocapitalize="off" spellcheck="false" ' +
              'placeholder="hong.gildong" required></label>' +
          '<label class="ad-field"><span>이름</span>' +
            '<input id="nu-name" type="text" placeholder="홍길동" required></label>' +
          '<label class="ad-field"><span>이메일 (선택)</span>' +
            '<input id="nu-email" type="email" placeholder="hong@kma.or.kr"></label>' +
          '<label class="ad-field"><span>비밀번호</span>' +
            '<input id="nu-pw" type="password" placeholder="6자 이상" required></label>' +
          '<p class="ad-err" id="nu-err" hidden></p>' +
          '<button class="btn big primary block" type="submit" id="nu-go">만들고 로그인</button>' +
        '</form>' +
      '</div></div>';

    var err = document.getElementById('nu-err');
    var go = document.getElementById('nu-go');
    document.getElementById('ad-form').addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var d = {
        username: document.getElementById('nu-username').value.trim(),
        name: document.getElementById('nu-name').value.trim(),
        email: document.getElementById('nu-email').value.trim(),
        password: document.getElementById('nu-pw').value
      };
      go.disabled = true; go.textContent = '만드는 중…';
      fetch('/api/admin/create-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      }).then(function (r) {
        return r.json().then(function (res) {
          if (!r.ok) throw new Error(res.message || '만들지 못했습니다.');
          return g.Auth.signIn(d.username, d.password);
        });
      }).then(function () {
        U.toast('첫 관리자로 만들었습니다', 'ok');
        return boot();
      }).catch(function (e2) {
        err.textContent = e2.message || '만들지 못했습니다.';
        err.hidden = false;
        go.disabled = false; go.textContent = '만들고 로그인';
      });
    });
    document.getElementById('nu-username').focus();
  }

  g.Auth.config()
    .then(boot)
    .catch(function (e) {
      main.innerHTML = '<div class="ad-gate"><div class="ad-card">' +
        '<h1>연결되지 않았습니다</h1>' +
        '<p class="ad-sub">' + esc(e.message) + '</p></div></div>';
    });
})(window);
