/* gate.js — 로그인 문
 *
 * 한 PC 를 여럿이 쓴다. 로그인한 사람마다 제 자료만 보이게 하려고
 * 화면을 열기 전에 여기서 한 번 막는다. 자료는 계정별로 갈린 저장 열쇠에
 * 들어간다(scope.js) — 서버에 올리는 것이 아니라 이 PC 안에서만 갈린다.
 *
 * 로그인을 못 하는 상황(relay 가 안 떠 있거나 Supabase 환경변수가 비었을 때)에는
 * 문을 잠그지 않는다. 자료가 이 PC 안에만 있는데 문만 걸어 두면,
 * 설정이 어긋난 날 아무도 제 자료를 못 보게 된다.
 */
(function (g) {
  'use strict';

  var UI = g.UI;

  function show(reason) {
    var main = document.getElementById('main');
    document.body.classList.add('gated');
    main.innerHTML =
      '<div class="gate">' +
        '<div class="gate-card">' +
          /* 부서 이름보다 '여기서 무슨 일을 하는가' 를 앞에 세운다.
             처음 들어온 사람이 문패만 보고도 무슨 도구인지 알 수 있어야 한다. */
          '<div class="gate-mark">KMA</div>' +
          '<h1>교육 문서 자동화</h1>' +
          '<p class="gate-sub">교육문의를 받아 <b>제안서·견적서·결과보고서</b>를 만듭니다.</p>' +
          (reason ? '<p class="gate-err">' + UI.esc(reason) + '</p>' : '') +
          '<form class="gate-form" id="gate-form">' +
            '<label>아이디<input name="username" autocomplete="username" autofocus></label>' +
            '<label>비밀번호<input name="password" type="password" autocomplete="current-password"></label>' +
            '<button class="btn big primary block" type="submit">로그인</button>' +
          '</form>' +
          '<p class="gate-note">계정은 관리자가 발급합니다. ' +
            '<a href="admin.html">관리자 화면</a></p>' +
        '</div>' +
      '</div>';

    var form = document.getElementById('gate-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button');
      var u = form.username.value.trim();
      var p = form.password.value;
      if (!u || !p) { UI.toast('아이디와 비밀번호를 넣어 주세요', 'err'); return; }
      btn.disabled = true;
      btn.textContent = '확인하고 있습니다…';
      g.Auth.signIn(u, p).then(function () {
        /* 저장 열쇠는 파일이 읽힐 때 한 번 정해진다. 다시 읽어야 이 계정 통이 열린다. */
        location.reload();
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = '로그인';
        var box = form.parentNode.querySelector('.gate-err');
        if (!box) {
          box = document.createElement('p');
          box.className = 'gate-err';
          form.parentNode.insertBefore(box, form);
        }
        box.textContent = err.message || '로그인하지 못했습니다.';
        form.password.value = '';
        form.password.focus();
      });
    });
  }

  /* 로그인한 사람이 누구인지 위쪽에 띄우고, 나가는 길을 둔다 */
  function stamp(name) {
    var right = document.querySelector('.top-right');
    if (!right || document.getElementById('top-who')) return;
    var box = document.createElement('div');
    box.id = 'top-who';
    box.className = 'top-who';
    box.innerHTML = '<span>' + UI.esc(name) + '</span>' +
      '<button class="top-action" type="button">로그아웃</button>';
    box.querySelector('button').addEventListener('click', function () {
      g.Auth.signOut().then(function () { location.reload(); });
    });
    right.insertBefore(box, right.firstChild);
  }

  function start() {
    if (g.Shell && g.Shell.start) g.Shell.start();
  }

  /* 서버가 살아 있고 계정 표(Supabase)가 설정돼 있을 때 문을 건다.
     배포한 웹(loginRequired)은 늘 문을 건다 — 서버도 로그인 없이는 답하지 않는다.
     이 PC 에서 켠 서버는, 계정 표를 아직 안 만들었으면(001_accounts.sql 실행 전)
     로그인 없이 연다. 자료가 이 PC 안에만 있는데 문만 걸어 두면 아무도 못 들어간다. */
  function localOpen(note) {
    start();
    if (note && UI.toast) setTimeout(function () { UI.toast(note, 'warn'); }, 600);
  }

  fetch('/api/supabase/config').then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ready) {                            /* 설정 전 */
        if (d && d.loginRequired) { show('서버에 계정 설정이 없습니다. 관리자에게 알려 주세요.'); return; }
        start(); return;
      }
      return fetch('/api/auth/state').then(function (r) { return r.json(); }).then(function (st) {
        if (st && st.setup_needed && !d.loginRequired) {
          localOpen('계정 표가 아직 없어 로그인 없이 엽니다 — Supabase 에서 server/sql/001_accounts.sql 을 실행하면 로그인이 켜집니다');
          return;
        }
        if (st && st.bootstrap) {
          show('아직 계정이 없습니다. 관리자 화면에서 첫 관리자를 만들어 주세요.');
          return;
        }
        var s = g.Auth.session();
        if (!s) { show(''); return; }
        return g.Auth.me().then(function (who) {
          if (!who) { show('다시 로그인해 주세요.'); return; }
          start();
          var mail = (who.user && who.user.email) || who.email || '';
          stamp(who.name || who.username || mail.split('@')[0] || '사용자');
        });
      });
    })
    .catch(function () { start(); });                /* 서버 없이 열었을 때 */
})(window);
