/* views.js — 단계별 화면 (사진 올리기 / 중복 검토 / 내보내기) · 행사위치 화면은 예전 작업용으로만 남겨 둠 */
(function (g) {
  'use strict';

  var P = g.PhotoProject, U = g.UI, esc = U.esc;
  var V = g.PhotoViews = {};

  var sel = {};                 // 선택한 사진 id
  var lastClicked = null;
  var ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

  function selected() { return Object.keys(sel).filter(function (id) { return P.photo(id); }); }
  function clearSel() { sel = {}; }

  /* ── 썸네일 타일 ─────────────────────────────────── */

  function tile(p, opts) {
    opts = opts || {};
    var flags = [];
    if ((p.flags || []).indexOf('low_resolution') !== -1) flags.push('<span class="fl low" title="같은 묶음 중 해상도가 낮습니다">저해상도</span>');
    if (p.takenAtSource && p.takenAtSource !== 'exif') flags.push('<span class="fl alt" title="EXIF 촬영시각이 없어 대체했습니다">' + (p.takenAtSource === 'filename' ? '파일명 시각' : '수정시각') + '</span>');
    if (p.exifOrientation !== 1) flags.push('<span class="fl rot" title="EXIF 방향값 ' + p.exifOrientation + ' — 저장 시 픽셀을 회전합니다">방향보정</span>');
    if (p.manualRotation) flags.push('<span class="fl rot">' + p.manualRotation + '°</span>');
    if (opts.best) flags.push('<span class="fl best">추천</span>');

    return '<figure class="tile' + (p.status === 'excluded' ? ' excluded' : '') + (sel[p.id] ? ' picked' : '') + '" data-ph="' + p.id + '">' +
      '<div class="tile-img"><img src="' + esc(p.thumbUrl) + '" alt="" loading="lazy" style="transform:rotate(' + (p.manualRotation || 0) + 'deg)"></div>' +
      '<div class="tile-flags">' + flags.join('') + '</div>' +
      '<figcaption>' +
        '<span class="t-sfx">' + esc(p.suffix) + '</span>' +
        '<span class="t-time">' + esc(U.time(p.takenAt)) + '</span>' +
        '<span class="t-res">' + (p.width || '?') + '×' + (p.height || '?') + '</span>' +
      '</figcaption>' +
      (opts.name ? '<div class="t-name">' + esc(opts.name) + '</div>' : '') +
      '<div class="tile-tools">' +
        '<button class="mini" data-rot="' + p.id + ':-90" title="왼쪽 90°">↺</button>' +
        '<button class="mini" data-rot="' + p.id + ':90" title="오른쪽 90°">↻</button>' +
        '<button class="mini" data-rot="' + p.id + ':180" title="180°">⤾</button>' +
        (opts.toggle ? '<button class="mini ' + (p.status === 'keep' ? 'on' : '') + '" data-keep="' + p.id + '">' + (p.status === 'keep' ? '남김' : '제외') + '</button>' : '') +
        (opts.remove ? '<button class="mini del" data-drop="' + p.id + '" title="목록에서 빼기">✕</button>' : '') +
      '</div>' +
    '</figure>';
  }

  function grid(photos, opts) {
    if (!photos.length) return '<p class="empty small">' + esc((opts && opts.empty) || '사진이 없습니다.') + '</p>';
    return '<div class="tile-grid">' + photos.map(function (p) { return tile(p, opts); }).join('') + '</div>';
  }

  /* 타일 공통 동작: 선택, 회전, 남김/제외, 빼기 */
  function bindTiles(host) {
    host.addEventListener('click', function (e) {
      var rot = e.target.closest('[data-rot]');
      if (rot) {
        var parts = rot.dataset.rot.split(':');
        var p = P.photo(parts[0]);
        if (p) { p.manualRotation = (((p.manualRotation + Number(parts[1])) % 360) + 360) % 360; P.emit(); }
        return;
      }
      var keep = e.target.closest('[data-keep]');
      if (keep) {
        var kp = P.photo(keep.dataset.keep);
        if (kp) P.setStatus(kp.id, kp.status === 'keep' ? 'excluded' : 'keep');
        return;
      }
      var drop = e.target.closest('[data-drop]');
      if (drop) { P.removePhoto(drop.dataset.drop); return; }

      var fig = e.target.closest('[data-ph]');
      if (!fig) return;
      var id = fig.dataset.ph;
      if (e.shiftKey && lastClicked) {
        var ids = U.$$('[data-ph]', host).map(function (el) { return el.dataset.ph; });
        var a = ids.indexOf(lastClicked), b = ids.indexOf(id);
        if (a > -1 && b > -1) {
          ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function (x) { sel[x] = true; });
        }
      } else {
        if (sel[id]) delete sel[id]; else sel[id] = true;
        lastClicked = id;
      }
      g.Photos.render();
    });
  }

  function selBar(extra) {
    var n = selected().length;
    return '<div class="sel-bar' + (n ? ' on' : '') + '">' +
      '<span>' + (n ? n + '장 선택' : '사진을 클릭해 선택 (Shift로 범위 선택)') + '</span>' +
      '<button class="btn tiny" data-sel-all type="button">전체 선택</button>' +
      '<button class="btn tiny" data-sel-none type="button">선택 해제</button>' +
      (n ? '<button class="btn tiny" data-rot-sel="-90" type="button">↺ 왼쪽</button>' +
           '<button class="btn tiny" data-rot-sel="90" type="button">↻ 오른쪽</button>' +
           '<button class="btn tiny" data-rot-sel="180" type="button">⤾ 180°</button>' : '') +
      (extra || '') + '</div>';
  }

  function bindSelBar(host, visiblePhotos) {
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-sel-all]')) { visiblePhotos().forEach(function (p) { sel[p.id] = true; }); g.Photos.render(); return; }
      if (e.target.closest('[data-sel-none]')) { clearSel(); g.Photos.render(); return; }
      var rs = e.target.closest('[data-rot-sel]');
      if (rs) {
        var d = Number(rs.dataset.rotSel);
        selected().forEach(function (id) {
          var p = P.photo(id);
          if (p) p.manualRotation = (((p.manualRotation + d) % 360) + 360) % 360;
        });
        P.emit();
      }
    });
  }

  /* ── 1. 업로드 · 방향 ────────────────────────────── */

  V.upload = function (host) {
    var st = P.state();
    var photos = P.sortedPhotos();
    var batches = {};
    photos.forEach(function (p) { batches[p.batchPrefix || '(기타)'] = (batches[p.batchPrefix || '(기타)'] || 0) + 1; });
    var missing = P.missingFromState();

    host.innerHTML =
      '<div class="view-head"><h1>1. 사진 올리기</h1>' +
        '<p class="sub">EXIF 방향값을 반영해 보여 줍니다. 더 돌려야 하면 타일의 회전 버튼을 쓰세요. 저장할 때 픽셀 자체가 돌아갑니다.</p></div>' +

      '<div class="dropzone" id="dropzone" tabindex="0">' +
        '<input type="file" id="file-input" accept="image/jpeg,image/png,image/webp" multiple hidden>' +
        '<p class="dz-title">사진을 여기에 끌어다 놓거나 <button class="link" id="btn-pick" type="button">클릭해서 선택</button></p>' +
        '<p class="dz-sub">JPG · PNG · WEBP · 장수 제한 없음 · 사진은 이 PC 밖으로 나가지 않습니다</p>' +
      '</div>' +

      (photos.length ? '<div class="count-bar">' +
        '<b>인식 ' + photos.length + '장</b>' +
        '<span class="sub">묶음 ' + Object.keys(batches).length + '개 — ' +
          Object.keys(batches).map(function (k) { return esc(k) + ' ' + batches[k] + '장'; }).join(' / ') + '</span>' +
        '<button class="btn tiny ghost-danger" data-clear type="button">전부 비우기</button>' +
      '</div>' : '') +

      (missing.length ? '<div class="warn-box"><b>불러온 작업 상태에 있는 사진 ' + missing.length + '장이 아직 올라오지 않았습니다.</b>' +
        '<div class="sub">' + esc(missing.slice(0, 8).join(', ')) + (missing.length > 8 ? ' 외 ' + (missing.length - 8) + '장' : '') + '</div></div>' : '') +

      (photos.length ? selBar() + grid(photos, { remove: true }) : '');

    bindTiles(host);
    bindSelBar(host, function () { return P.sortedPhotos(); });

    var dz = U.$('#dropzone', host);
    var input = U.$('#file-input', host);
    U.$('#btn-pick', host).addEventListener('click', function () { input.click(); });
    dz.addEventListener('click', function (e) { if (e.target === dz || e.target.className === 'dz-title') input.click(); });
    input.addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('drag'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault(); dz.classList.remove('drag');
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
    host.addEventListener('click', function (e) {
      if (!e.target.closest('[data-clear]')) return;
      U.confirm('올린 사진과 행사위치 구성을 모두 비웁니다. 계속할까요?', { danger: true, ok: '비우기' })
        .then(function (ok) { if (ok) { P.resetAll(); clearSel(); g.Photos.render(); } });
    });
    void st;
  };

  function addFiles(fileList) {
    var picked = Array.prototype.slice.call(fileList || []);
    var files = picked.filter(function (f) { return ACCEPT.indexOf(f.type) !== -1; });
    var rejected = picked.filter(function (f) { return ACCEPT.indexOf(f.type) === -1; });
    var have = {};
    P.state().photos.forEach(function (p) { have[p.originalName + ':' + p.file.size] = true; });
    var fresh = files.filter(function (f) { return !have[f.name + ':' + f.size]; });
    var dupSkipped = files.length - fresh.length;

    if (!fresh.length) {
      U.toast('추가할 새 사진이 없습니다. (선택 ' + picked.length + '장 / 이미 올린 사진 ' + dupSkipped + '장)', rejected.length ? 'err' : '');
      if (rejected.length) reportRejected(rejected);
      return;
    }

    U.busy(true, '사진 읽는 중… 0 / ' + fresh.length, 0);
    g.Imaging.queue(fresh, function (f) {
      return g.Exif.read(f).then(function (meta) {
        return g.Imaging.analyze(f, 360).then(function (an) { P.addPhoto(f, meta, an); });
      });
    }, 3, function (done, total) {
      U.busy(true, '사진 읽는 중… ' + done + ' / ' + total, done / total);
    }).then(function () {
      P.refreshFlags();
      P.applyPendingState();
      U.busy(false);
      P.emit();
      g.Photos.render();
      /* 채팅에서는 30장 중 20장만 보였던 적이 있어, 고른 장수와 인식한 장수를 항상 같이 알린다 */
      U.toast('선택 ' + picked.length + '장 → 인식 ' + fresh.length + '장 추가' +
        (dupSkipped ? ' · 중복 파일 ' + dupSkipped + '장 건너뜀' : '') +
        (rejected.length ? ' · 지원하지 않는 형식 ' + rejected.length + '장 제외' : ''), rejected.length ? 'err' : 'ok');
      if (rejected.length) reportRejected(rejected);
    });
  }

  function reportRejected(rejected) {
    var heic = rejected.filter(function (f) { return /\.(heic|heif)$/i.test(f.name); });
    if (heic.length) {
      U.toast('HEIC 형식 ' + heic.length + '장은 브라우저에서 열 수 없습니다. JPG로 변환 후 올려 주세요.', 'err');
    }
  }

  /* ── 2. 행사위치 분류 ────────────────────────────── */

  V.sections = function (host) {
    var st = P.state();
    var secs = P.sortedSections();
    var un = P.unassigned();

    host.innerHTML =
      '<div class="view-head"><h1>2. 행사위치 분류</h1>' +
        '<p class="sub">과정 안의 세부 장소·세션 단위로 나눕니다. 파일명의 <code>_행사위치_</code> 자리에 들어갑니다.</p>' +
        '<div class="head-actions">' +
          '<button class="btn" data-propose type="button">촬영 공백 ' + st.autoSplitMinutes + '분 기준으로 나누기</button>' +
          '<button class="btn primary" data-add-sec type="button">+ 행사위치 추가</button>' +
        '</div></div>' +

      (secs.length ? '<div class="sec-list">' + secs.map(function (s, i) {
        var all = P.photosOf(s.id), keep = all.filter(function (p) { return p.status === 'keep'; });
        var low = keep.length && keep.length < st.minPerSection;
        return '<div class="sec-card' + (low ? ' low' : '') + '" data-sec="' + s.id + '">' +
          '<div class="sec-head">' +
            '<b>' + esc(s.label) + '</b>' +
            '<span class="sec-count">' + keep.length + '장' + (all.length !== keep.length ? ' (제외 ' + (all.length - keep.length) + ')' : '') + '</span>' +
            (low ? '<span class="fl low">최소 ' + st.minPerSection + '장 미만</span>' : '') +
            '<span class="sec-num">사진 ' + s.startNumber + '번부터</span>' +
            '<span class="spacer"></span>' +
            '<button class="btn tiny" data-up="' + s.id + '" type="button"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
            '<button class="btn tiny" data-down="' + s.id + '" type="button"' + (i === secs.length - 1 ? ' disabled' : '') + '>▼</button>' +
            '<button class="btn tiny" data-edit-sec="' + s.id + '" type="button">편집</button>' +
            '<button class="btn tiny ghost-danger" data-del-sec="' + s.id + '" type="button">삭제</button>' +
          '</div>' +
          '<div class="sec-body">' + grid(all, { toggle: true, empty: '아직 지정된 사진이 없습니다.' }) + '</div>' +
        '</div>';
      }).join('') + '</div>' : '<p class="empty">행사위치를 먼저 만들어 주세요.</p>') +

      '<section class="panel">' +
        '<div class="panel-head"><h2>행사위치 미지정 ' + un.length + '장</h2>' +
          (secs.length && un.length ? '<div class="head-actions">' +
            '<select data-assign-to><option value="">선택 사진을 옮길 행사위치…</option>' +
            secs.map(function (s) { return '<option value="' + s.id + '">' + esc(s.label) + '</option>'; }).join('') +
            '</select></div>' : '') +
        '</div>' +
        '<div class="panel-body">' + selBar() + grid(un, { empty: '모든 사진에 행사위치가 지정되었습니다.' }) + '</div>' +
      '</section>';

    bindTiles(host);
    bindSelBar(host, function () { return P.unassigned(); });

    host.addEventListener('change', function (e) {
      var as = e.target.closest('[data-assign-to]');
      if (!as || !as.value) return;
      var ids = selected();
      if (!ids.length) { U.toast('옮길 사진을 먼저 선택하세요.', 'err'); as.value = ''; return; }
      ids.forEach(function (id) { var p = P.photo(id); if (p) p.sectionId = as.value; });
      clearSel();
      P.refreshFlags();
      P.emit();
      g.Photos.render();
    });

    host.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-add-sec]')) { editSection(null); return; }
      var ed = t.closest('[data-edit-sec]');
      if (ed) { editSection(P.section(ed.dataset.editSec)); return; }
      var del = t.closest('[data-del-sec]');
      if (del) {
        U.confirm('이 행사위치를 지웁니다. 안에 있던 사진은 미지정으로 돌아갑니다.', { danger: true, ok: '삭제' })
          .then(function (ok) { if (ok) { P.removeSection(del.dataset.delSec); g.Photos.render(); } });
        return;
      }
      var up = t.closest('[data-up]'); if (up) { P.moveSection(up.dataset.up, -1); g.Photos.render(); return; }
      var dn = t.closest('[data-down]'); if (dn) { P.moveSection(dn.dataset.down, 1); g.Photos.render(); return; }
      if (t.closest('[data-propose]')) { proposeSplit(); return; }
    });
  };

  function editSection(s) {
    U.form({
      title: s ? '행사위치 편집' : '행사위치 추가',
      fields: [
        { key: 'label', label: '행사위치 이름', type: 'text', required: true, span: 2,
          placeholder: '예) 경복궁 리더십 트립', hint: '파일명에 그대로 들어갑니다.' },
        { key: 'startNumber', label: '시작 번호', type: 'number', required: true,
          hint: '이어서 찍은 사진이면 앞 차수 마지막 번호 +1 을 넣으세요.' }
      ],
      values: s ? { label: s.label, startNumber: s.startNumber } : { label: '', startNumber: 1 }
    }).then(function (d) {
      if (!d) return;
      if (s) { s.label = d.label; s.startNumber = Math.max(1, d.startNumber || 1); P.emit(); }
      else P.addSection(d.label, Math.max(1, d.startNumber || 1));
      g.Photos.render();
    });
  }

  function proposeSplit() {
    var groups = P.proposeSplits();
    if (groups.length < 2) { U.toast('촬영 공백이 없어 나눌 구간이 하나입니다.', 'err'); return; }
    var html = groups.map(function (grp, i) {
      return '<div class="ff span2"><label>구간 ' + (i + 1) + ' · ' + grp.length + '장 · ' +
        esc(U.time(grp[0].takenAt)) + ' ~ ' + esc(U.time(grp[grp.length - 1].takenAt)) + '</label>' +
        '<input data-grp="' + i + '" placeholder="행사위치 이름 (비우면 만들지 않음)"></div>';
    }).join('');

    var hostEl = document.createElement('div');
    hostEl.className = 'modal';
    hostEl.innerHTML = '<div class="modal-box wide"><div class="modal-head"><h2>촬영 공백 기준 나누기</h2>' +
      '<button class="icon-btn" data-no type="button">✕</button></div>' +
      '<div class="modal-body"><p class="modal-note">' + P.state().autoSplitMinutes +
      '분 넘게 촬영이 끊긴 지점에서 ' + groups.length + '개 구간으로 나눴습니다. 이름을 넣은 구간만 행사위치로 만듭니다.</p>' +
      '<div class="ff-grid">' + html + '</div></div>' +
      '<div class="modal-foot"><button class="btn" data-no type="button">취소</button>' +
      '<button class="btn primary" data-ok type="button">만들기</button></div></div>';
    document.body.appendChild(hostEl);

    hostEl.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-no') || e.target === hostEl) { hostEl.remove(); return; }
      if (!e.target.hasAttribute('data-ok')) return;
      var made = 0;
      U.$$('[data-grp]', hostEl).forEach(function (inp) {
        var label = inp.value.trim();
        if (!label) return;
        var s = P.addSection(label, 1);
        groups[Number(inp.dataset.grp)].forEach(function (p) { p.sectionId = s.id; });
        made++;
      });
      hostEl.remove();
      P.refreshFlags();
      P.emit();
      g.Photos.render();
      U.toast(made ? made + '개 행사위치를 만들었습니다.' : '만든 행사위치가 없습니다.', made ? 'ok' : 'err');
    });
  }

  /* ── 3. 중복 검토 ────────────────────────────────── */

  V.dedupe = function (host) {
    var st = P.state();
    var groups = P.groupsNow();
    var excluded = P.sortedPhotos().filter(function (p) { return p.status === 'excluded'; });
    var total = st.photos.length;
    var keep = st.photos.filter(function (p) { return p.status === 'keep'; }).length;

    host.innerHTML =
      '<div class="view-head"><h1>2. 중복 검토</h1>' +
        '<p class="sub">같은 구도로 연달아 찍은 사진만 후보로 올립니다. 판단은 사람이 합니다. 제외한 사진도 지우지 않고 아래 제외함에 남습니다.</p>' +
        '<div class="head-actions">' +
          '<select data-sens>' + Object.keys(P.SENSITIVITY).map(function (k) {
            return '<option value="' + k + '"' + (k === st.dupSensitivity ? ' selected' : '') + '>민감도 ' + k + '</option>';
          }).join('') + '</select>' +
          '<button class="btn primary" data-detect type="button">중복 후보 찾기</button>' +
        '</div></div>' +

      '<div class="count-bar">' +
        '<b>남김 ' + keep + '장</b><span class="sub">원본 ' + total + '장 · 제외 ' + (total - keep) + '장' +
        (total ? ' (제외율 ' + (Math.round((total - keep) / total * 1000) / 10) + '%)' : '') + '</span>' +
        '<span class="sub">' + esc((P.SENSITIVITY[st.dupSensitivity] || {}).desc || '') + '</span>' +
      '</div>' +

      warningsHtml() +

      (groups.length
        ? '<div class="dup-head"><b>중복 후보 ' + groups.length + '그룹 · ' +
            groups.reduce(function (a, x) { return a + x.members.length; }, 0) + '장</b>' +
            '<button class="btn" data-apply type="button">추천대로 제외 적용</button>' +
            '<button class="btn" data-keep-all type="button">전부 남김으로 되돌리기</button></div>' +
          groups.map(function (grp) {
            var secName = (P.section(grp.members[0].sectionId) || {}).label || '행사위치 미지정';
            var span = (grp.members[grp.members.length - 1].takenAt - grp.members[0].takenAt) / 1000;
            return '<div class="dup-group">' +
              '<div class="dup-meta">' + esc(secName) + ' · ' + grp.members.length + '장 · 촬영 간격 ' +
                (Math.round(span * 10) / 10) + '초</div>' +
              '<div class="tile-grid dup">' + grp.members.map(function (m) {
                return tile(m, { toggle: true, best: m === grp.best });
              }).join('') + '</div></div>';
          }).join('')
        : '<p class="empty">중복 후보가 없습니다. 위의 <b>중복 후보 찾기</b>를 눌러 다시 검사할 수 있습니다.</p>') +

      '<section class="panel">' +
        '<div class="panel-head"><h2>제외함 ' + excluded.length + '장</h2>' +
          (excluded.length ? '<div class="head-actions"><button class="btn tiny" data-restore-all type="button">전부 복원</button></div>' : '') + '</div>' +
        '<div class="panel-body">' + grid(excluded, { toggle: true, empty: '제외한 사진이 없습니다.' }) + '</div>' +
      '</section>';

    bindTiles(host);

    host.addEventListener('change', function (e) {
      if (!e.target.closest('[data-sens]')) return;
      P.set({ dupSensitivity: e.target.value });
      P.detectDuplicates();
      P.emit();
      g.Photos.render();
    });
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-detect]')) {
        var n = P.detectDuplicates();
        P.emit(); g.Photos.render();
        U.toast(n.length ? n.length + '개 그룹을 찾았습니다.' : '중복 후보가 없습니다.', n.length ? 'ok' : '');
        return;
      }
      if (e.target.closest('[data-apply]')) {
        var c = P.applyRecommendation();
        g.Photos.render();
        U.toast(c + '장의 상태를 바꿨습니다. 개별 타일에서 되돌릴 수 있습니다.', 'ok');
        return;
      }
      if (e.target.closest('[data-keep-all]')) {
        P.groupsNow().forEach(function (grp) { grp.members.forEach(function (m) { P.setStatus(m.id, 'keep'); }); });
        g.Photos.render();
        return;
      }
      if (e.target.closest('[data-restore-all]')) {
        P.sortedPhotos().forEach(function (p) { if (p.status === 'excluded') P.setStatus(p.id, 'keep'); });
        g.Photos.render();
      }
    });
  };

  function warningsHtml() {
    var st = P.state();
    var rows = [];
    P.sortedSections().forEach(function (s) {
      var keep = P.photosOf(s.id, true).length;
      if (keep && keep < st.minPerSection) {
        rows.push(esc(s.label) + ' <b>' + keep + '장</b> — 최소 ' + st.minPerSection + '장 미만. 제외함에서 되살릴 수 있습니다.');
      }
    });
    var low = st.photos.filter(function (p) { return p.status === 'keep' && (p.flags || []).indexOf('low_resolution') !== -1; });
    if (low.length) {
      rows.push('해상도가 낮은 사진 <b>' + low.length + '장</b> — ' +
        esc(low.slice(0, 6).map(function (p) { return p.suffix + '(' + p.width + '×' + p.height + ')'; }).join(', ')) +
        (low.length > 6 ? ' 외' : '') + '. 뺄지 남길지는 직접 정하세요.');
    }
    if (!rows.length) return '';
    return '<div class="warn-box"><b>확인 필요</b>' + rows.map(function (r) { return '<div>' + r + '</div>'; }).join('') + '</div>';
  }

  /* ── 4. 내보내기 ────────────────────────────────── */

  V.export = function (host) {
    var st = P.state();
    var rows = P.buildNames();
    var issues = P.nameIssues(rows);
    var totalBytes = rows.reduce(function (a, r) { return a + r.photo.file.size; }, 0);
    var rotCount = rows.filter(function (r) { return needsRender(r.photo); }).length;
    var plans = splitPlan(rows);

    host.innerHTML =
      '<div class="view-head"><h1>3. 내보내기</h1>' +
        '<div class="head-actions">' +
          '<button class="btn" data-load-existing type="button">기존 결과 이어 작업</button>' +
          '<button class="btn" data-copy-report type="button">결과 리포트 복사</button>' +
        '</div></div>' +

      (issues.length
        ? '<div class="err-box"><b>내보내기 전에 해결해야 할 것 ' + issues.length + '건</b>' +
            issues.map(function (i) { return '<div>' + esc(i) + '</div>'; }).join('') + '</div>'
        : '') +

      '<div class="count-bar">' +
        '<b>' + rows.length + '장</b>' +
        '<span class="sub">원본 합계 ' + U.bytes(totalBytes) + ' · 회전 저장 ' + rotCount + '장 (나머지는 원본 바이트 그대로)</span>' +
        '<span class="sub">' + (plans.length > 1 ? plans.length + '개 zip 으로 나눠 내보냅니다' : 'zip 1개') + '</span>' +
      '</div>' +

      '<div class="export-opts">' +
        '<label class="opt"><span>zip 파일명</span><input data-zipname value="' + esc(P.zipName().replace(/\.zip$/, '')) + '"><span class="suffix">.zip</span></label>' +
        (st.sections.length ? '<label class="opt chk"><input type="checkbox" data-folders' + (st.zipFolders ? ' checked' : '') + '><span>행사위치별 폴더로 담기</span></label>' : '') +
        '<label class="opt"><span>분할 기준</span><input type="number" data-splitmb value="' + st.splitMB + '" min="50" step="50"><span class="suffix">MB</span></label>' +
        '<label class="opt"><span>회전 저장 품질</span><input type="number" data-quality value="' + st.jpegQuality + '" min="60" max="100"><span class="suffix">%</span></label>' +
        '<button class="btn primary big" data-export type="button"' + (issues.length ? ' disabled' : '') + '>zip 내보내기</button>' +
      '</div>' +

      (plans.length > 1 ? '<div class="plan-box">' + plans.map(function (pl, i) {
        return '<div>' + (i + 1) + '. ' + esc(pl.name) + ' — ' + pl.rows.length + '장 · ' + U.bytes(pl.bytes) + '</div>';
      }).join('') + '</div>' : '') +

      '<section class="panel">' +
        '<div class="panel-head"><h2>최종 파일명</h2><span class="sub">촬영시각 순으로 번호를 붙입니다</span></div>' +
        '<div class="panel-body">' +
          (rows.length ? '<div class="table-wrap"><table class="grid"><thead><tr>' +
            (st.sections.length ? '<th style="width:150px">행사위치</th>' : '') + '<th style="width:230px">원본</th><th>최종 파일명</th><th style="width:90px">크기</th><th style="width:80px">저장</th>' +
            '</tr></thead><tbody>' + rows.map(function (r) {
              /* 행사위치를 안 나눈 사진도 있다(buildNames 가 section: null 로 넘긴다) */
              return '<tr>' + (st.sections.length ? '<td>' + (r.section ? esc(r.section.label) : '<span class="sub">미지정</span>') + '</td>' : '') +
                '<td class="mono">' + esc(r.photo.suffix) + ' <span class="sub">' + esc(r.photo.originalName) + '</span></td>' +
                '<td class="mono"><b>' + esc(r.name) + '</b></td>' +
                '<td>' + U.bytes(r.photo.file.size) + '</td>' +
                '<td>' + (needsRender(r.photo) ? '<span class="fl rot">회전</span>' : '<span class="sub">원본</span>') + '</td></tr>';
            }).join('') + '</tbody></table></div>'
            : '<p class="empty">남긴 사진이 없습니다.</p>') +
        '</div>' +
      '</section>' +

      '<section class="panel">' +
        '<div class="panel-head"><h2>결과 리포트</h2></div>' +
        '<div class="panel-body"><pre class="report">' + esc(P.report()) + '</pre></div>' +
      '</section>';

    host.addEventListener('change', function (e) {
      if (e.target.closest('[data-folders]')) P.set({ zipFolders: e.target.checked });
      if (e.target.closest('[data-splitmb]')) P.set({ splitMB: Math.max(50, Number(e.target.value) || 450) });
      if (e.target.closest('[data-quality]')) P.set({ jpegQuality: Math.min(100, Math.max(60, Number(e.target.value) || 95)) });
      g.Photos.render();
    });
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-export]')) { runExport(U.$('[data-zipname]', host).value.trim()); return; }
      if (e.target.closest('[data-copy-report]')) {
        navigator.clipboard.writeText(P.report())
          .then(function () { U.toast('결과 리포트를 복사했습니다.', 'ok'); })
          .catch(function () { U.toast('복사에 실패했습니다.', 'err'); });
        return;
      }
      if (e.target.closest('[data-load-existing]')) loadExisting();
    });
  };

  function needsRender(p) {
    return p.exifOrientation !== 1 || (p.manualRotation || 0) !== 0;
  }

  function entryFor(r) {
    var st = P.state();
    var name = (st.zipFolders && r.section ? r.section.label + '/' : '') + r.name;
    var p = r.photo;
    if (!needsRender(p)) return { name: name, blob: p.file };
    return {
      name: name,
      get: function () { return g.Imaging.renderRotated(p.file, p.meta, p.manualRotation, st.jpegQuality); }
    };
  }

  /* 행사위치 단위로 잘라 담는다. 한 행사위치가 한도를 넘으면 그것만 따로 나간다. */
  function splitPlan(rows) {
    var st = P.state();
    var cap = (st.splitMB || 450) * 1048576;
    var bySection = [];
    function sum(list) { return list.reduce(function (a, r) { return a + r.photo.file.size; }, 0); }
    P.sortedSections().forEach(function (s) {
      var list = rows.filter(function (r) { return r.section && r.section.id === s.id; });
      if (list.length) bySection.push({ section: s, rows: list, bytes: sum(list) });
    });
    /* 행사위치 없는 사진은 한 묶음으로 — 빠뜨리면 zip 을 나눌 때 그 사진들이 사라진다 */
    var loose = rows.filter(function (r) { return !r.section; });
    if (loose.length) bySection.push({ section: { label: '미지정' }, rows: loose, bytes: sum(loose) });
    var total = sum(rows);
    if (total <= cap || bySection.length <= 1) {
      return [{ name: P.zipName(), rows: rows, bytes: total }];
    }
    var plans = [], cur = null;
    bySection.forEach(function (grp) {
      if (cur && cur.bytes + grp.bytes > cap) cur = null;
      if (!cur) { cur = { labels: [], rows: [], bytes: 0 }; plans.push(cur); }
      cur.labels.push(grp.section.label);
      cur.rows = cur.rows.concat(grp.rows);
      cur.bytes += grp.bytes;
    });
    plans.forEach(function (pl, i) {
      pl.name = P.zipName(pl.labels.length === 1 ? pl.labels[0] : (i + 1) + 'of' + plans.length);
    });
    return plans;
  }

  function runExport(customName) {
    var rows = P.buildNames();
    var issues = P.nameIssues(rows);
    if (issues.length) { U.toast('해결할 항목이 남아 있습니다.', 'err'); return; }
    if (!rows.length) { U.toast('내보낼 사진이 없습니다.', 'err'); return; }

    var plans = splitPlan(rows);
    if (customName && plans.length === 1) plans[0].name = customName.replace(/\.zip$/i, '') + '.zip';
    else if (customName && plans.length > 1) {
      plans.forEach(function (pl, i) {
        pl.name = customName.replace(/\.zip$/i, '') + '_' + (pl.labels.length === 1 ? pl.labels[0] : (i + 1) + 'of' + plans.length) + '.zip';
      });
    }

    var i = 0;
    function next() {
      if (i >= plans.length) { U.busy(false); U.toast('내보내기를 마쳤습니다.', 'ok'); return; }
      var pl = plans[i];
      var entries = pl.rows.map(entryFor);
      U.busy(true, pl.name + ' 만드는 중… 0 / ' + entries.length, 0);

      /* 저장 위치 선택은 클릭 직후에만 열 수 있다. 여러 개로 나눌 때는 두 번째부터 막히므로
       * zip 이 하나일 때만 쓰고, 나눠 보낼 때는 그냥 내려받는다. */
      var opener = (plans.length === 1 && g.Zip.supportsFilePicker())
        ? g.Zip.savePicker(pl.name).then(function (w) { return { writable: w }; })
                .catch(function (err) {
                  if (err && err.name === 'AbortError') return null;      // 사용자가 대화상자를 닫음
                  return {};                                             // 지원하지 않으면 Blob 경로
                })
        : Promise.resolve({});

      opener.then(function (o) {
        if (o === null) { U.busy(false); U.toast('내보내기를 취소했습니다.'); return; }
        return g.Zip.write(entries, {
          writable: o.writable,
          onProgress: function (done, total) {
            U.busy(true, pl.name + ' 만드는 중… ' + done + ' / ' + total, done / total);
          }
        }).then(function (res) {
          if (!res.streamed) g.Zip.download(res.blob, pl.name);
          i++;
          setTimeout(next, 300);
        });
      }).catch(function (err) {
        U.busy(false);
        U.toast('내보내기에 실패했습니다: ' + (err && err.message ? err.message : err), 'err');
      });
    }
    next();
  }

  /* FR-16 — 기존 결과 zip 또는 파일명 목록에서 행사위치·마지막 번호를 되찾는다 */
  function loadExisting() {
    U.form({
      title: '기존 결과 이어 작업',
      note: '이전에 만든 zip 을 고르거나 파일명 목록을 붙여 넣으면, 행사위치와 마지막 번호를 읽어 이어서 번호를 매깁니다. 사진을 다시 올릴 필요는 없습니다.',
      fields: [{ key: 'text', label: '파일명 목록 (한 줄에 하나)', type: 'textarea', rows: 6, span: 2,
        placeholder: '[포스코인재창조원]인사이트 트립_경복궁 리더십 트립_사진 1.jpg' }],
      values: {}, ok: '목록으로 읽기', wide: true
    }).then(function (d) {
      if (!d) return;
      var names = String(d.text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!names.length) { pickZip(); return; }
      applyExisting(names.map(function (n) { return { name: n }; }));
    });

    function pickZip() {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip';
      input.onchange = function () {
        var f = input.files[0];
        if (!f) return;
        U.busy(true, 'zip 목록 읽는 중…');
        g.Zip.readNames(f).then(function (names) {
          U.busy(false);
          applyExisting(names);
        }).catch(function (err) {
          U.busy(false);
          U.toast(err.message || 'zip 을 읽지 못했습니다.', 'err');
        });
      };
      input.click();
    }
  }

  function applyExisting(names) {
    var res = P.importExistingNames(names);
    g.Photos.render();
    if (!res.added.length && !res.updated.length) {
      U.toast('파일명에서 행사위치를 찾지 못했습니다. 파일명 규칙이 설정과 같은지 확인하세요.', 'err');
      return;
    }
    U.toast('행사위치 ' + (res.added.length + res.updated.length) + '개의 시작 번호를 맞췄습니다: ' +
      res.added.concat(res.updated).join(', '), 'ok');
  }

  V._clearSel = clearSel;
})(window);
