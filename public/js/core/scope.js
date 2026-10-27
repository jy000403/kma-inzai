/* scope.js — 계정마다 따로 쓰는 저장소
 *
 * 이 앱은 자료를 전부 브라우저 localStorage 에 둔다. 한 PC 를 여럿이 쓰면
 * 프로젝트·제안서·결과보고서가 한 통에 섞인다. 로그인한 사람마다 다른
 * 통을 쓰게 하려고, 저장 열쇠 뒤에 계정 id 를 붙인다.
 *
 *   kma-projects:v1  →  kma-projects:v1@3f2a…    (로그인한 사람)
 *   kma-projects:v1  →  kma-projects:v1          (로그인 안 한 상태 · 예전 자료)
 *
 * 이렇게 하면 서버로 옮기지 않고도 계정별로 갈린다. 대신 그 PC 를 벗어나면
 * 안 따라간다 — 다른 자리에서 이어 쓰려면 자료를 서버에 올려야 한다.
 *
 * 로그인 전에 쓰던 자료는 처음 로그인할 때 그 계정 통으로 한 번 옮겨 준다.
 * 안 그러면 로그인을 붙인 날 쓰던 것이 통째로 사라진 것처럼 보인다.
 */
(function (g) {
  'use strict';

  var SESSION_KEY = 'kma-session:v1';

  /* 옮겨 담을 열쇠들. 각 store 가 쓰는 이름과 같아야 한다. */
  var OWNED = [
    'kma-projects:v1',
    'kma-proposal:v1',
    'kma-reports:v1',
    'photo-organizer:v1',
    'erp-file-namer:v1',
    'kma-mail-sender:v1',
    'kma-quote-supplier:v1'
  ];

  function uid() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      var id = s && s.user && s.user.id;
      return id ? String(id).slice(0, 8) : '';
    } catch (e) { return ''; }
  }

  var who = uid();

  /* store 들이 부르는 함수. KEY 상수를 이걸로 감싸면 계정별로 갈린다. */
  function key(base) { return who ? base + '@' + who : base; }

  /* 로그인 전에 쌓아 둔 것을 이 계정 통으로 한 번만 옮긴다.
     이미 계정 통에 뭔가 있으면 건드리지 않는다 — 덮어쓰면 남의 자료를 지운다. */
  function adopt() {
    if (!who) return;
    OWNED.forEach(function (base) {
      try {
        var mine = base + '@' + who;
        if (localStorage.getItem(mine) !== null) return;
        var old = localStorage.getItem(base);
        if (old === null) return;
        localStorage.setItem(mine, old);
      } catch (e) {}
    });
  }

  adopt();

  g.Scope = { key: key, uid: function () { return who; }, OWNED: OWNED };
})(window);
