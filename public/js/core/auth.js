/* auth.js — 로그인
 *
 * 계정(아이디·비밀번호·일반/관리자)은 Supabase 의 accounts 표에 있고,
 * 확인은 서버가 한다(/api/auth/login). 브라우저는 서버가 서명해 준 표(토큰)만 들고 다닌다.
 * 비밀번호 해시도, 표를 여는 열쇠(secret key)도 브라우저로는 오지 않는다.
 *
 * 배포한 웹에서는 /api 를 부를 때마다 그 표를 보여야 한다. 아래에서 fetch 를
 * 한 번 감싸 /api 로 가는 요청에 표를 저절로 붙인다 — 화면 코드마다 챙기지 않게.
 *
 * 접속 이력은 서버가 남긴다. 실패한 로그인은 세션이 없어 브라우저가 남길 수 없고,
 * 남길 수 있게 열어 주면 아무나 이력을 지어낼 수 있다.
 */
(function (g) {
  'use strict';

  var KEY = 'kma-session:v1';
  var cfg = null;

  /* /api 로 가는 요청에 로그인 표를 붙인다 */
  var rawFetch = g.fetch.bind(g);
  g.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var mine = /^\/?api\//.test(url) || url.indexOf(location.origin + '/api/') === 0;
    var t = mine ? token() : null;
    if (t) {
      init = init || {};
      var h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
      if (!h.has('Authorization')) h.set('Authorization', 'Bearer ' + t);
      init.headers = h;
    }
    return rawFetch(input, init).then(function (r) {
      /* 표가 만료되면 다시 로그인하게 — 한 번만 알리고 문으로 돌려보낸다 */
      if (mine && r.status === 401 && t && !/\/api\/(auth|admin)\//.test(url)) {
        keep(null);
        if (!g.__kmaExpired) {
          g.__kmaExpired = true;
          setTimeout(function () { location.reload(); }, 50);
        }
      }
      return r;
    });
  };

  function config() {
    if (cfg) return Promise.resolve(cfg);
    return fetch('/api/supabase/config')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ready) throw new Error('환경변수 SUPABASE_URL 과 SUPABASE_SECRET_KEY 를 넣어 주세요.');
        cfg = d;
        return cfg;
      });
  }

  /* 세션은 이 브라우저에만 둔다 */
  function session() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (e) { return null; }
  }
  function keep(s) {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch (e) {}
  }
  function token() { var s = session(); return s && s.access_token; }

  /* 접속 이력 — 실패해도 로그인 자체를 막지는 않는다 */
  function log(event, o) {
    var body = {
      event: event,
      email: (o && o.email) || '',
      username: (o && o.username) || '',
      user_id: (o && o.user_id) || null,
      ok: event !== 'login_failed',
      reason: (o && o.reason) || null,
      user_agent: navigator.userAgent
    };
    return fetch('/api/admin/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
  }

  /* 로그인은 relay 를 거친다.
     아이디→이메일 맞춤이 서버에만 있어야 하기 때문이다. 그 표를 브라우저에
     열어 주면 아이디만 넣어 보며 누가 있는지 훑을 수 있다.
     실패 이력도 relay 가 남긴다 — 실패한 쪽엔 세션이 없다. */
  function signIn(username, password) {
    return fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password,
                             user_agent: navigator.userAgent })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok || !d.access_token) {
          throw new Error((d && d.message) || '로그인하지 못했습니다.');
        }
        keep(d);
        return d;
      });
    });
  }

  /* 표는 서버에 적어 두는 것이 아니라서, 이 브라우저에서 지우면 끝이다 */
  function signOut() {
    var s = session();
    var prof = (s && s.profile) || {};
    var email = prof.email || (s && s.user && s.user.email);
    var uid = s && s.user && s.user.id;
    keep(null);
    cfg = null;
    return log('logout', { email: email, user_id: uid, username: prof.username });
  }

  /* 계정은 관리자가 발급한다. 자가 회원가입은 Supabase 쪽에서도 닫아 두었다. */
  function createUser(d) {
    return admin('/api/admin/create-user', { method: 'POST', body: JSON.stringify(d) });
  }

  /* relay 에게 '나 누구냐' 고 묻는다. 관리자인지도 여기서 온다 —
     브라우저가 스스로 '나 관리자야' 라고 정하면 아무 의미가 없다. */
  function me() {
    var t = token();
    if (!t) return Promise.resolve(null);
    return fetch('/api/admin/me', { headers: { Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { if (d && d.error === 'bad_token') keep(null); return null; }
        return d;
      })
      .catch(function () { return null; });
  }

  function admin(path, opt) {
    var t = token();
    opt = opt || {};
    opt.headers = Object.assign({ 'Content-Type': 'application/json' },
                                opt.headers || {}, { Authorization: 'Bearer ' + t });
    return fetch(path, opt).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error((d && d.message) || '요청이 실패했습니다');
        return d;
      });
    });
  }

  g.Auth = {
    config: config, session: session, token: token,
    signIn: signIn, signOut: signOut, me: me,
    createUser: createUser, admin: admin, log: log
  };
})(window);
