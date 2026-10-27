/* project.js — 과정 상태 · 파일명 규칙 · 중복 그룹 판정 · 리포트 */
(function (g) {
  'use strict';

  var STORE_KEY = g.Scope.key('photo-organizer:v1');

  var DEFAULTS = {
    clientName: '',
    eventName: '',
    /* 지침 예시 3건이 모두 대괄호 뒤에 밑줄이 없다. TC-07 도 같은 형식이다 (Q-01) */
    /* 결과보고서용 교육사진은 한 덩어리라 행사위치 자리를 뺐다 — [고객사]과정명_사진 N */
    fileNameTemplate: '[{client}]{event}_사진 {n}',
    zipNameTemplate: '[{client}]{event}_교육사진',
    minPerSection: 20,
    dupSensitivity: '느슨',
    jpegQuality: 95,
    zipFolders: false,        // Q-03 — 기본은 평면, 섹션 폴더는 선택
    splitMB: 450,
    autoSplitMinutes: 30
  };

  var SENSITIVITY = {
    '느슨': { gapSec: 2, dist: 5, desc: '딱 봐도 같은 사진만 후보로 잡습니다 (기본)' },
    '보통': { gapSec: 2, dist: 8, desc: '비슷한 구도까지 후보로 잡습니다' },
    '엄격': { gapSec: 3, dist: 12, desc: '많이 잡습니다. 과도하게 빠질 수 있어 검토가 필요합니다' }
  };

  var P = null;
  var listeners = [];

  function uid(p) { return (p || 'x') + Math.random().toString(36).slice(2, 9); }
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  function init() {
    P = Object.assign({}, DEFAULTS, { sections: [], photos: [], externalNames: [] });
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        Object.keys(DEFAULTS).forEach(function (k) { if (d[k] !== undefined) P[k] = d[k]; });
        /* 예전 기본값(행사위치 포함)으로 저장된 설정은 새 기본값으로 바꾼다 */
        if (P.fileNameTemplate === '[{client}]{event}_{section}_사진 {n}') P.fileNameTemplate = DEFAULTS.fileNameTemplate;
      }
    } catch (e) {}
    return P;
  }

  function saveSettings() {
    try {
      var out = {};
      Object.keys(DEFAULTS).forEach(function (k) { out[k] = P[k]; });
      localStorage.setItem(STORE_KEY, JSON.stringify(out));
    } catch (e) {}
  }

  function set(patch) {
    Object.assign(P, patch);
    saveSettings();
    emit();
  }
  function state() { return P; }

  /* ── 섹션 ─────────────────────────────────────────── */

  function addSection(label, startNumber) {
    var s = { id: uid('sec'), label: label || '새 행사위치', order: P.sections.length, startNumber: startNumber || 1 };
    P.sections.push(s);
    emit();
    return s;
  }
  function section(id) {
    for (var i = 0; i < P.sections.length; i++) if (P.sections[i].id === id) return P.sections[i];
    return null;
  }
  function removeSection(id) {
    P.photos.forEach(function (p) { if (p.sectionId === id) p.sectionId = null; });
    P.sections = P.sections.filter(function (s) { return s.id !== id; });
    P.sections.forEach(function (s, i) { s.order = i; });
    emit();
  }
  function moveSection(id, delta) {
    var list = sortedSections();
    var i = list.findIndex(function (s) { return s.id === id; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    list.forEach(function (s, k) { s.order = k; });
    emit();
  }
  function sortedSections() {
    return P.sections.slice().sort(function (a, b) { return a.order - b.order; });
  }

  /* ── 사진 ─────────────────────────────────────────── */

  function addPhoto(file, meta, analysis) {
    var p = {
      id: uid('ph'),
      file: file,
      originalName: file.name,
      batchPrefix: g.Exif.batchOf(file.name),
      suffix: g.Exif.suffixOf(file.name),
      takenAt: meta.takenAt,
      takenAtSource: meta.takenAtSource,
      width: analysis.width || meta.width,
      height: analysis.height || meta.height,
      exifOrientation: meta.orientation || 1,
      manualRotation: 0,
      sectionId: null,
      status: 'keep',
      dupGroupId: null,
      excludeReason: '',
      flags: [],
      hash: analysis.hash,
      sharpness: analysis.sharpness,
      thumbUrl: analysis.thumbUrl,
      meta: meta
    };
    P.photos.push(p);
    return p;
  }
  function photo(id) {
    for (var i = 0; i < P.photos.length; i++) if (P.photos[i].id === id) return P.photos[i];
    return null;
  }
  function removePhoto(id) {
    P.photos = P.photos.filter(function (p) {
      if (p.id !== id) return true;
      if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
      return false;
    });
    emit();
  }

  function byTime(a, b) {
    if (a.takenAt !== b.takenAt) return (a.takenAt || 0) - (b.takenAt || 0);
    return String(a.suffix).localeCompare(String(b.suffix), 'ko', { numeric: true });
  }
  function sortedPhotos() { return P.photos.slice().sort(byTime); }
  function photosOf(sectionId, keepOnly) {
    return sortedPhotos().filter(function (p) {
      return p.sectionId === sectionId && (!keepOnly || p.status === 'keep');
    });
  }
  function unassigned() {
    return sortedPhotos().filter(function (p) { return !p.sectionId; });
  }

  /* ── 해상도 플래그 (FR-10) ───────────────────────── */

  function refreshFlags() {
    sortedSections().concat([{ id: null }]).forEach(function (s) {
      var list = P.photos.filter(function (p) { return p.sectionId === s.id; });
      if (!list.length) return;
      var counts = {};
      list.forEach(function (p) {
        var k = Math.max(p.width || 0, p.height || 0);
        counts[k] = (counts[k] || 0) + 1;
      });
      var mode = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || b - a; })[0];
      list.forEach(function (p) {
        p.flags = (p.flags || []).filter(function (f) { return f !== 'low_resolution'; });
        if (Math.max(p.width || 0, p.height || 0) < Number(mode)) p.flags.push('low_resolution');
      });
    });
  }

  /* ── 촬영 공백으로 섹션 분할 제안 (FR-06) ────────── */

  function proposeSplits(minutes) {
    var gap = (minutes || P.autoSplitMinutes) * 60000;
    var list = sortedPhotos();
    var groups = [], cur = [];
    list.forEach(function (p, i) {
      if (i > 0 && (p.takenAt - list[i - 1].takenAt) > gap) { groups.push(cur); cur = []; }
      cur.push(p);
    });
    if (cur.length) groups.push(cur);
    return groups;
  }

  /* ── 중복 그룹 (FR-07) ───────────────────────────── */

  function detectDuplicates() {
    var cfg = SENSITIVITY[P.dupSensitivity] || SENSITIVITY['느슨'];
    P.photos.forEach(function (p) { p.dupGroupId = null; });

    var buckets = sortedSections().map(function (s) { return photosOf(s.id); });
    buckets.push(unassigned());

    var groups = [];
    buckets.forEach(function (list) {
      var i = 0;
      while (i < list.length) {
        var head = list[i];
        var members = [head];
        var j = i + 1;
        while (j < list.length) {
          var prev = list[j - 1], cand = list[j];
          var gapSec = Math.abs((cand.takenAt || 0) - (prev.takenAt || 0)) / 1000;
          if (gapSec > cfg.gapSec) break;
          if (g.Imaging.hamming(head.hash, cand.hash) > cfg.dist) break;
          members.push(cand);
          j++;
        }
        if (members.length > 1) {
          var gid = uid('dg');
          members.forEach(function (m) { m.dupGroupId = gid; });
          groups.push({ id: gid, members: members, best: pickBest(members) });
        }
        i = j > i + 1 ? j : i + 1;
      }
    });
    return groups;
  }

  function pickBest(members) {
    return members.slice().sort(function (a, b) {
      var pa = (a.sharpness || 0), pb = (b.sharpness || 0);
      if (pb !== pa) return pb - pa;
      var ra = (a.width || 0) * (a.height || 0), rb = (b.width || 0) * (b.height || 0);
      if (rb !== ra) return rb - ra;
      return (a.takenAt || 0) - (b.takenAt || 0);
    })[0];
  }

  function groupsNow() {
    var map = {};
    P.photos.forEach(function (p) {
      if (!p.dupGroupId) return;
      (map[p.dupGroupId] = map[p.dupGroupId] || []).push(p);
    });
    return Object.keys(map).map(function (gid) {
      var members = map[gid].sort(byTime);
      return { id: gid, members: members, best: pickBest(members) };
    }).sort(function (a, b) { return byTime(a.members[0], b.members[0]); });
  }

  function applyRecommendation() {
    var n = 0;
    groupsNow().forEach(function (grp) {
      grp.members.forEach(function (m) {
        if (m === grp.best) {
          if (m.status !== 'keep') { m.status = 'keep'; m.excludeReason = ''; n++; }
        } else if (m.status !== 'excluded') {
          m.status = 'excluded';
          m.excludeReason = '동일 구도 연속촬영 (남긴 사진 ' + grp.best.suffix + ')';
          n++;
        }
      });
    });
    emit();
    return n;
  }

  function setStatus(id, status) {
    var p = photo(id);
    if (!p) return;
    p.status = status;
    if (status === 'keep') p.excludeReason = '';
    else if (!p.excludeReason) p.excludeReason = '수동 제외';
    emit();
  }

  /* ── 파일명 (BR-01 / FR-11) ──────────────────────── */

  var FORBIDDEN_RE = /[\\\/:*?"<>|\x00-\x1f]/g;

  function applyTemplate(tpl, ctx) {
    return String(tpl || '').replace(/\{(client|event|section|n)\}/g, function (_, k) {
      var v = ctx[k];
      return (v === null || v === undefined) ? '' : String(v);
    })
      /* 고객사명이 비면 '[]' 가 남는다 — 빈 괄호와 맨 앞 밑줄은 걷어 낸다 */
      .replace(/\[\s*\]/g, '').replace(/^[_\s]+/, '');
  }

  /* 과정명이 비어도 막지 않는다 — '과정 설정' 창을 없앴으니 고칠 곳이 없다.
     빈 자리는 applyTemplate 이 걷어 내 '교육사진.zip' · '사진 1.jpg' 처럼 나간다. */
  function eventOr() { return String(P.eventName || '').trim(); }

  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : 'jpg';
  }

  /* 섹션별로 시작 번호부터 촬영 순으로 매긴다.
     행사위치를 안 나눈 사진도 빠뜨리지 않는다 — 열몇 장짜리 교육사진은
     나눌 일이 없는 게 보통이라, 그때는 파일명에서 그 자리를 빼고 이어 붙인다.
     '[세움전자]역량강화 과정__사진 1' 처럼 밑줄이 겹치지 않게 훑어 낸다. */
  function buildNames() {
    var out = [];
    sortedSections().forEach(function (s) {
      photosOf(s.id, true).forEach(function (p, idx) {
        p.outputName = nameFor(p, s.label, (s.startNumber || 1) + idx);
        out.push({ photo: p, section: s, name: p.outputName });
      });
    });

    /* sectionId 가 null 인지 빈 문자열인지 만드는 자리마다 달라서 직접 거른다 */
    var loose = sortedPhotos().filter(function (p) {
      return p.status === 'keep' && !p.sectionId;
    });
    loose.forEach(function (p, idx) {
      p.outputName = nameFor(p, '', out.length + idx + 1);
      out.push({ photo: p, section: null, name: p.outputName });
    });
    return out;
  }

  function nameFor(p, section, n) {
    var base = applyTemplate(P.fileNameTemplate, {
      client: P.clientName, event: eventOr(), section: section, n: n
    });
    if (!section) base = base.replace(/_{2,}/g, '_').replace(/_(?=\s*사진)/, '_');
    return base + '.' + extOf(p.originalName);
  }

  function nameIssues(rows) {
    var errors = [], seen = {};
    rows.forEach(function (r) {
      var bad = (r.name.match(FORBIDDEN_RE) || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
      if (bad.length) errors.push(r.name + ' — 쓸 수 없는 문자: ' + bad.join(' '));
      var key = r.name.toLowerCase();
      if (seen[key]) errors.push('파일명 중복: ' + r.name);
      seen[key] = true;
    });
    /* 행사위치를 안 나눴다고 막지 않는다. 결과보고서에 넣을 사진 열몇 장은
       대개 한 덩어리라, 나누라고 세워 두면 아무 뜻 없는 칸을 하나 만들고 지나가게 된다.
       하나도 안 나눈 경우에는 파일명에서 그 자리를 통째로 빼고 이어 붙인다. */
    return errors.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }

  function zipName(suffix) {
    var base = applyTemplate(P.zipNameTemplate, { client: P.clientName, event: eventOr(), section: '', n: '' });
    return base + (suffix ? '_' + suffix : '') + '.zip';
  }

  /* ── 기존 결과 이어 작업 (FR-16) ─────────────────── */

  /* "[고객사]행사명_행사위치_사진 12.jpg" 에서 행사위치와 번호를 되찾는다 */
  function parseOutputName(name) {
    var base = String(name).replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
    var m = /^(.*)_사진\s*(\d+)$/.exec(base);
    if (!m) return null;
    var head = m[1], n = parseInt(m[2], 10);
    var prefix = applyTemplate(P.fileNameTemplate.split('{section}')[0], { client: P.clientName, event: P.eventName });
    if (P.clientName && P.eventName && head.indexOf(prefix) === 0) {
      return { section: head.slice(prefix.length), n: n };
    }
    var cut = head.lastIndexOf('_');
    if (cut < 0) return null;
    return { section: head.slice(cut + 1), n: n };
  }

  function importExistingNames(names) {
    var found = {};
    names.forEach(function (item) {
      var parsed = parseOutputName(item.name || item);
      if (!parsed || !parsed.section) return;
      found[parsed.section] = Math.max(found[parsed.section] || 0, parsed.n);
    });
    var added = [], updated = [];
    Object.keys(found).forEach(function (label) {
      var s = P.sections.filter(function (x) { return x.label === label; })[0];
      if (!s) { s = addSection(label, found[label] + 1); added.push(label + ' (사진 ' + (found[label] + 1) + '부터)'); }
      else { s.startNumber = found[label] + 1; updated.push(label + ' (사진 ' + s.startNumber + '부터)'); }
    });
    P.externalNames = names.map(function (i) { return i.name || i; });
    emit();
    return { added: added, updated: updated, total: names.length };
  }

  /* ── 리포트 (FR-14) ──────────────────────────────── */

  function report() {
    var lines = [];
    var head = (P.clientName ? '[' + P.clientName + ']' : '') + P.eventName;
    lines.push(head + ' 사진 정리 결과');
    lines.push('작성 ' + new Date().toLocaleString('ko-KR'));
    lines.push('');

    var totalKeep = 0, totalAll = P.photos.length;
    lines.push('■ 행사위치별 장수');
    sortedSections().forEach(function (s) {
      var keep = photosOf(s.id, true);
      var all = photosOf(s.id);
      totalKeep += keep.length;
      lines.push('- ' + s.label + ': ' + keep.length + '장 (원본 ' + all.length + '장, 제외 ' + (all.length - keep.length) + '장)' +
        (keep.length && keep.length < P.minPerSection ? '  ※ 최소 ' + P.minPerSection + '장 미만' : '') +
        (s.startNumber > 1 ? '  · 사진 ' + s.startNumber + '번부터' : ''));
    });
    var noSec = unassigned();
    if (noSec.length) lines.push('- (행사위치 미지정): ' + noSec.length + '장');
    lines.push('합계 ' + totalKeep + '장 / 원본 ' + totalAll + '장' +
      (totalAll ? ' (제외율 ' + (Math.round((totalAll - totalKeep) / totalAll * 1000) / 10) + '%)' : ''));
    lines.push('');

    var excluded = sortedPhotos().filter(function (p) { return p.status === 'excluded'; });
    lines.push('■ 제외한 사진 ' + excluded.length + '장');
    if (!excluded.length) lines.push('- 없음');
    excluded.forEach(function (p) {
      var sec = section(p.sectionId);
      var grp = p.dupGroupId ? groupsNow().filter(function (x) { return x.id === p.dupGroupId; })[0] : null;
      var gapTxt = '';
      if (grp) {
        var others = grp.members.filter(function (m) { return m !== p; });
        if (others.length) {
          var d = Math.abs(p.takenAt - others[0].takenAt) / 1000;
          gapTxt = ' · 촬영 간격 ' + (Math.round(d * 10) / 10) + '초';
        }
      }
      lines.push('- ' + (sec ? sec.label + ' / ' : '') + p.suffix + ' (' + p.originalName + ')' +
        ' — ' + (p.excludeReason || '제외') + gapTxt);
    });
    lines.push('');

    lines.push('■ 확인 필요');
    var notes = [];
    sortedSections().forEach(function (s) {
      var keep = photosOf(s.id, true).length;
      if (keep && keep < P.minPerSection) notes.push(s.label + ' ' + keep + '장 — 최소 ' + P.minPerSection + '장 미만');
    });
    P.photos.filter(function (p) { return p.status === 'keep' && (p.flags || []).indexOf('low_resolution') !== -1; })
      .forEach(function (p) {
        notes.push((section(p.sectionId) || {}).label + ' / ' + p.suffix + ' — 해상도 ' + p.width + '×' + p.height + ' (같은 묶음 중 낮음)');
      });
    P.photos.filter(function (p) { return p.takenAtSource && p.takenAtSource !== 'exif'; })
      .forEach(function (p) {
        notes.push(p.originalName + ' — 촬영시각을 ' + (p.takenAtSource === 'filename' ? '파일명' : '파일 수정시각') + '에서 가져옴');
      });
    if (!notes.length) notes.push('없음');
    notes.forEach(function (n) { lines.push('- ' + n); });

    return lines.join('\n');
  }

  /* ── 저장 · 불러오기 (FR-15) ─────────────────────── */

  function exportState() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = P[k]; });
    out.sections = P.sections;
    out.externalNames = P.externalNames;
    out.photos = P.photos.map(function (p) {
      return {
        originalName: p.originalName, suffix: p.suffix, takenAt: p.takenAt, takenAtSource: p.takenAtSource,
        width: p.width, height: p.height, exifOrientation: p.exifOrientation, manualRotation: p.manualRotation,
        sectionId: p.sectionId, status: p.status, excludeReason: p.excludeReason, hash: p.hash,
        sharpness: p.sharpness, dupGroupId: p.dupGroupId
      };
    });
    return JSON.stringify({ app: 'photo-organizer', version: 1, savedAt: new Date().toISOString(), project: out }, null, 2);
  }

  /* 같은 원본을 다시 올리면 파일명으로 맞춰 상태를 되살린다 */
  function importState(text) {
    var d = JSON.parse(text);
    var pr = d.project || d;
    Object.keys(DEFAULTS).forEach(function (k) { if (pr[k] !== undefined) P[k] = pr[k]; });
    P.sections = pr.sections || [];
    P.externalNames = pr.externalNames || [];
    P.pendingPhotoState = {};
    (pr.photos || []).forEach(function (s) { P.pendingPhotoState[s.originalName] = s; });
    applyPendingState();
    saveSettings();
    emit();
    return { sections: P.sections.length, photos: (pr.photos || []).length };
  }

  function applyPendingState() {
    if (!P.pendingPhotoState) return 0;
    var n = 0;
    P.photos.forEach(function (p) {
      var s = P.pendingPhotoState[p.originalName];
      if (!s) return;
      p.manualRotation = s.manualRotation || 0;
      p.sectionId = s.sectionId || null;
      p.status = s.status || 'keep';
      p.excludeReason = s.excludeReason || '';
      p.dupGroupId = s.dupGroupId || null;
      n++;
    });
    return n;
  }

  function missingFromState() {
    if (!P.pendingPhotoState) return [];
    var have = {};
    P.photos.forEach(function (p) { have[p.originalName] = true; });
    return Object.keys(P.pendingPhotoState).filter(function (n) { return !have[n]; });
  }

  function resetAll() {
    P.photos.forEach(function (p) { if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl); });
    P.photos = [];
    P.sections = [];
    P.externalNames = [];
    delete P.pendingPhotoState;
    emit();
  }

  g.PhotoProject = {
    DEFAULTS: DEFAULTS, SENSITIVITY: SENSITIVITY,
    init: init, state: state, set: set, onChange: onChange, emit: emit, uid: uid,
    addSection: addSection, section: section, removeSection: removeSection, moveSection: moveSection, sortedSections: sortedSections,
    addPhoto: addPhoto, photo: photo, removePhoto: removePhoto,
    sortedPhotos: sortedPhotos, photosOf: photosOf, unassigned: unassigned,
    refreshFlags: refreshFlags, proposeSplits: proposeSplits,
    detectDuplicates: detectDuplicates, groupsNow: groupsNow, applyRecommendation: applyRecommendation, setStatus: setStatus,
    buildNames: buildNames, nameIssues: nameIssues, zipName: zipName, applyTemplate: applyTemplate,
    parseOutputName: parseOutputName, importExistingNames: importExistingNames,
    report: report, exportState: exportState, importState: importState,
    applyPendingState: applyPendingState, missingFromState: missingFromState, resetAll: resetAll
  };
})(window);
