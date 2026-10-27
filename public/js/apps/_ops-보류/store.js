/* store.js — 데이터 저장소
 *
 * 브라우저 localStorage 에 전체 데이터를 보관한다. 서버가 없으므로 고객사 운영 정보가
 * 외부로 나가지 않는다(NFR-01/03 미확정 상태에서의 안전한 기본값).
 * 사진 첨부만 용량 때문에 IndexedDB 를 쓴다.
 *
 * 삭제는 실제 삭제 대신 deleted 플래그 + 변경 로그로 처리한다(NFR-05).
 */
(function (g) {
  'use strict';

  var KEY = 'healing-workspace:v1';
  var COLLECTIONS = [
    'programs', 'regions', 'sessions', 'venues', 'facilities', 'distances',
    'meals', 'activities', 'rooms', 'participants', 'assignments',
    'checklists', 'checklistItems', 'rentals', 'trips',
    'facts', 'questions', 'rules', 'lint', 'attachments', 'notionLinks', 'changeLog'
  ];

  var DB = null;
  var listeners = [];

  function uid(prefix) {
    return (prefix || 'x') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
  }

  function blank() {
    var o = {};
    COLLECTIONS.forEach(function (c) { o[c] = []; });
    return o;
  }

  function normalize(d) {
    var base = blank();
    COLLECTIONS.forEach(function (c) { if (Array.isArray(d[c])) base[c] = d[c]; });
    return base;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* 저장소 접근 불가 */ }
    if (!raw) { DB = normalize(g.OpsSeed.data()); persist(); return DB; }
    try { DB = normalize(JSON.parse(raw)); } catch (e) { DB = normalize(g.OpsSeed.data()); }
    return DB;
  }

  var saveTimer = null;
  function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(DB)); }
      catch (e) { g.UI && g.UI.toast('저장 공간이 부족합니다. 설정 → 백업에서 내보내기 후 정리하세요.', 'err'); }
    }, 120);
  }

  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function onChange(fn) { listeners.push(fn); }

  /* ── 조회 ─────────────────────────────────────────── */

  function all(coll, includeDeleted) {
    var rows = DB[coll] || [];
    return includeDeleted ? rows.slice() : rows.filter(function (r) { return !r.deleted; });
  }
  function where(coll, pred) { return all(coll).filter(pred); }
  function get(coll, id) {
    var rows = DB[coll] || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }
  function first(coll, pred) { return all(coll).filter(pred)[0] || null; }

  /* ── 변경 ─────────────────────────────────────────── */

  function log(entity, recordId, field, oldValue, newValue, reason) {
    DB.changeLog.unshift({
      id: uid('lg'), entity: entity, recordId: recordId, field: field,
      oldValue: fmt(oldValue), newValue: fmt(newValue),
      at: new Date().toISOString(), reason: reason || ''
    });
    if (DB.changeLog.length > 3000) DB.changeLog.length = 3000;
  }
  function fmt(v) {
    if (v === null || v === undefined || v === '') return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function insert(coll, rec, reason) {
    rec = rec || {};
    if (!rec.id) rec.id = uid(coll.slice(0, 2));
    DB[coll].push(rec);
    log(coll, rec.id, '(생성)', '', rec.name || rec.title || rec.question || rec.content || rec.id, reason);
    persist(); emit();
    return rec;
  }

  function update(coll, id, patch, reason) {
    var rec = get(coll, id);
    if (!rec) return null;
    Object.keys(patch).forEach(function (k) {
      var before = rec[k], after = patch[k];
      if (fmt(before) === fmt(after)) return;
      log(coll, id, k, before, after, reason);
      rec[k] = after;
    });
    persist(); emit();
    return rec;
  }

  /* 실제 삭제 대신 숨김 처리 — 이력은 남는다 */
  function remove(coll, id, reason) {
    var rec = get(coll, id);
    if (!rec) return;
    rec.deleted = true;
    log(coll, id, '(삭제)', '표시', '숨김', reason);
    persist(); emit();
  }
  function restore(coll, id) {
    var rec = get(coll, id);
    if (!rec) return;
    delete rec.deleted;
    log(coll, id, '(복원)', '숨김', '표시', '');
    persist(); emit();
  }

  /* 변경 이력을 세션 레코드 안에도 남긴다 (PRG-04 "당초 A → 변경 B" 표시용) */
  function updateSession(id, patch, reason) {
    var rec = get('sessions', id);
    if (!rec) return null;
    rec.changes = rec.changes || [];
    ['startDate', 'endDate', 'headcount', 'lodgingVenueId', 'status'].forEach(function (k) {
      if (!(k in patch)) return;
      if (fmt(rec[k]) === fmt(patch[k])) return;
      rec.changes.push({ field: k, from: rec[k], to: patch[k], at: new Date().toISOString().slice(0, 10), reason: reason || '' });
    });
    return update('sessions', id, patch, reason);
  }

  /* ── 백업 ─────────────────────────────────────────── */

  function exportJson() {
    return JSON.stringify({ app: 'healing-workspace', version: 1, exportedAt: new Date().toISOString(), data: DB }, null, 2);
  }
  function importJson(text) {
    var parsed = JSON.parse(text);
    var d = parsed && parsed.data ? parsed.data : parsed;
    DB = normalize(d);
    persist(); emit();
  }
  function reset() {
    DB = normalize(g.OpsSeed.data());
    persist(); emit();
  }

  /* ── 첨부 파일 (IndexedDB) ────────────────────────── */
  /* 로컬 파일(file://)로 열면 브라우저가 IndexedDB 를 막는 경우가 있다.
   * 그때는 사진 기능만 비활성화되고 나머지는 그대로 동작한다. */

  var idbPromise = null;
  function idb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (res, rej) {
      try {
        var req = indexedDB.open('healing-workspace-files', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('files'); };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error || new Error('IndexedDB 사용 불가')); };
      } catch (e) { rej(e); }
    });
    return idbPromise;
  }
  function fileOp(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('files', mode);
        var req = fn(tx.objectStore('files'));
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error); };
      });
    });
  }
  function putFile(id, blob) { return fileOp('readwrite', function (s) { return s.put(blob, id); }); }
  function getFile(id) { return fileOp('readonly', function (s) { return s.get(id); }); }
  function delFile(id) { return fileOp('readwrite', function (s) { return s.delete(id); }); }

  g.Store = {
    COLLECTIONS: COLLECTIONS,
    uid: uid, load: load, onChange: onChange, emit: emit, persist: persist,
    all: all, where: where, get: get, first: first,
    insert: insert, update: update, updateSession: updateSession, remove: remove, restore: restore,
    exportJson: exportJson, importJson: importJson, reset: reset,
    putFile: putFile, getFile: getFile, delFile: delFile,
    raw: function () { return DB; }
  };
})(window);
