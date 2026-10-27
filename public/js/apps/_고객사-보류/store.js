/* store.js — 고객사(문의) 데이터 · 노션 동기화 · 재접촉 판정
 *
 * 노션 DB "📋 2팀 VOC - AI 리더십 영업 트래킹" 의 실제 속성 이름에 맞춰 읽는다.
 * 브라우저에서 노션을 직접 부를 수 없으므로 이 PC 안의 중계 서버(notion-relay.py)를 거친다.
 */
(function (g) {
  'use strict';

  var KEY = 'kma-customers:v1';

  var DEFAULTS = {
    databaseId: '5c92e398-3d84-466d-831f-0faba1636bb3',
    leadMonths: 1,     // 작년 문의월보다 몇 달 앞서 연락할지
    statuses: ['수주실패', '진행철회', '진행없음', '컨택완료', '잠재고객', '일반문의'],
    includeWon: false  // 수주성공 건(재구매 제안)도 함께 볼지
  };

  var ALL_STATUSES = ['수주성공', '컨택완료', '잠재고객', '진행없음', '일반문의', '수주실패', '진행철회'];

  var S = {
    settings: Object.assign({}, DEFAULTS),
    rows: [],
    syncedAt: null,
    notes: {}          // pageId → { action, memo, at }
  };
  var listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d.settings) S.settings = Object.assign({}, DEFAULTS, d.settings);
      if (Array.isArray(d.rows)) S.rows = d.rows;
      S.syncedAt = d.syncedAt || null;
      S.notes = d.notes || {};
    } catch (e) {}
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        settings: S.settings, rows: S.rows, syncedAt: S.syncedAt, notes: S.notes
      }));
    } catch (e) {
      if (g.UI) g.UI.toast('저장 공간이 부족합니다. 백업 후 정리해 주세요', 'err');
    }
  }
  function set(patch) { Object.assign(S.settings, patch); save(); emit(); }
  function state() { return S; }

  /* ── 노션 값 꺼내기 ───────────────────────────────── */

  function title(p) { return (p && p.title ? p.title : []).map(function (t) { return t.plain_text; }).join(''); }
  function text(p) { return (p && p.rich_text ? p.rich_text : []).map(function (t) { return t.plain_text; }).join(''); }
  function sel(p) { return (p && p.select && p.select.name) || ''; }
  function multi(p) { return (p && p.multi_select ? p.multi_select : []).map(function (o) { return o.name; }); }
  function dat(p) { return (p && p.date && p.date.start) || ''; }

  function mapRow(page) {
    var P = page.properties || {};
    return {
      id: page.id,
      url: page.url,
      company: title(P['회사']),
      person: text(P['담당자']),
      rank: text(P['직급']),
      dept: text(P['부서']),
      subject: text(P['문의제목']),
      detail: text(P['문의내용']),
      year: sel(P['문의연도']),
      month: text(P['문의시기']),
      channel: sel(P['유입경로']),
      email: (P['이메일'] && P['이메일'].email) || '',
      phone: (P['전화번호'] && P['전화번호'].phone_number) || '',
      status: sel(P['진행상태']),
      courses: multi(P['추천과정']),
      nextAction: text(P['다음액션']),
      nextActionAt: dat(P['다음액션일']),
      callStatus: sel(P['콜드콜상태']),
      callAt: dat(P['콜드콜일']),
      mailStatus: sel(P['이메일상태']),
      tag: text(P['태그']),
      createdAt: page.created_time || ''
    };
  }

  /* ── 동기화 ───────────────────────────────────────── */

  function status() {
    return fetch('api/status', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .catch(function () { return { relay: false }; });
  }

  function sync(onProgress) {
    return status().then(function (st) {
      if (!st.relay) {
        var e = new Error('중계 서버가 없습니다');
        e.code = 'no_relay';
        throw e;
      }
      if (!st.hasToken) {
        var e2 = new Error('노션 토큰이 설정되지 않았습니다');
        e2.code = 'no_token';
        e2.tokenFile = st.tokenFile;
        throw e2;
      }
      var out = [], cursor = null, pages = 0;

      function next() {
        var body = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        return fetch('api/notion/databases/' + S.settings.databaseId + '/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (r) {
          return r.json().then(function (j) { return { ok: r.ok, j: j }; });
        }).then(function (res) {
          if (!res.ok) {
            var err = new Error(res.j.message || '노션에서 데이터를 가져오지 못했습니다');
            err.code = res.j.error || res.j.code || 'notion_error';
            throw err;
          }
          out = out.concat((res.j.results || []).map(mapRow));
          pages++;
          if (onProgress) onProgress(out.length);
          if (res.j.has_more && res.j.next_cursor && pages < 30) {
            cursor = res.j.next_cursor;
            return next();
          }
        });
      }

      return next().then(function () {
        S.rows = out;
        S.syncedAt = new Date().toISOString();
        save();
        emit();
        return out.length;
      });
    });
  }

  /* ── 재접촉 판정 ──────────────────────────────────── */

  function yearOf(r) {
    var m = /(\d{4})/.exec(r.year || '');
    return m ? parseInt(m[1], 10) : null;
  }
  function monthOf(r) {
    var m = /(\d{1,2})/.exec(r.month || '');
    if (!m) return null;
    var v = parseInt(m[1], 10);
    return (v >= 1 && v <= 12) ? v : null;
  }
  function coKey(name) { return String(name || '').replace(/[\s()（）㈜(주)]/g, '').toLowerCase(); }

  var BUCKETS = {
    now: { label: '지금 연락할 때', order: 0, tone: 'bad' },
    soon: { label: '곧 연락할 때', order: 1, tone: 'warn' },
    past: { label: '시기가 지난 건', order: 2, tone: '' },
    later: { label: '아직 이른 건', order: 3, tone: '' },
    unknown: { label: '문의 시기 미기재', order: 4, tone: '' }
  };

  /* 작년 N월에 문의가 들어왔으면, 올해 (N - 리드타임)월쯤 연락하는 게 맞다고 본다. */
  function bucketOf(r, now) {
    var y = yearOf(r), m = monthOf(r);
    if (!m) return { key: 'unknown', monthsAway: 99 };
    var M = now.getMonth() + 1;
    var target = Math.max(1, m - (S.settings.leadMonths || 0));
    var away = target - M;
    if (away <= 0 && M <= m) return { key: 'now', monthsAway: 0, target: target };
    if (away > 0 && away <= 2) return { key: 'soon', monthsAway: away, target: target };
    if (M > m) return { key: 'past', monthsAway: away, target: target };
    return { key: 'later', monthsAway: away, target: target };
    void y;
  }

  /* 올해 이미 문의가 들어온 회사는 다시 연락할 이유가 없으므로 뺀다 */
  function followUps(now) {
    now = now || new Date();
    var Y = now.getFullYear();
    var contactedThisYear = {};
    S.rows.forEach(function (r) {
      if (yearOf(r) === Y) contactedThisYear[coKey(r.company)] = true;
    });

    var allow = (S.settings.statuses || []).slice();
    if (S.settings.includeWon) allow.push('수주성공');

    return S.rows.filter(function (r) {
      var y = yearOf(r);
      if (!y || y >= Y) return false;
      if (contactedThisYear[coKey(r.company)]) return false;
      if (allow.indexOf(r.status) === -1) return false;
      var note = S.notes[r.id];
      if (note && note.action === '올해 안 함') return false;
      return true;
    }).map(function (r) {
      var b = bucketOf(r, now);
      return Object.assign({}, r, { bucket: b.key, monthsAway: b.monthsAway, targetMonth: b.target });
    }).sort(function (a, b) {
      var d = BUCKETS[a.bucket].order - BUCKETS[b.bucket].order;
      if (d) return d;
      if (a.bucket === 'past') return (monthOf(b) || 0) - (monthOf(a) || 0);
      return a.monthsAway - b.monthsAway;
    });
  }

  /* 회사 단위로 묶은 문의 이력 */
  function companies() {
    var map = {};
    S.rows.forEach(function (r) {
      var k = coKey(r.company) || '(회사명 없음)';
      if (!map[k]) map[k] = { name: r.company || '(회사명 없음)', rows: [] };
      map[k].rows.push(r);
    });
    return Object.keys(map).map(function (k) {
      var c = map[k];
      c.rows.sort(function (a, b) {
        var ya = yearOf(a) || 0, yb = yearOf(b) || 0;
        if (ya !== yb) return yb - ya;
        return (monthOf(b) || 0) - (monthOf(a) || 0);
      });
      c.latest = c.rows[0];
      c.years = c.rows.map(yearOf).filter(Boolean).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
      c.won = c.rows.some(function (r) { return r.status === '수주성공'; });
      return c;
    }).sort(function (a, b) {
      var ya = yearOf(a.latest) || 0, yb = yearOf(b.latest) || 0;
      if (ya !== yb) return yb - ya;
      return (monthOf(b.latest) || 0) - (monthOf(a.latest) || 0);
    });
  }

  function setNote(id, patch) {
    S.notes[id] = Object.assign({ at: new Date().toISOString() }, S.notes[id], patch, { at: new Date().toISOString() });
    save();
    emit();
  }
  function note(id) { return S.notes[id] || null; }

  g.CustStore = {
    DEFAULTS: DEFAULTS, ALL_STATUSES: ALL_STATUSES, BUCKETS: BUCKETS,
    load: load, save: save, set: set, state: state, onChange: onChange, emit: emit,
    status: status, sync: sync,
    followUps: followUps, companies: companies,
    yearOf: yearOf, monthOf: monthOf,
    setNote: setNote, note: note
  };
})(window);
