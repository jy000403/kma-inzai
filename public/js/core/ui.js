/* ui.js — 세 앱이 함께 쓰는 UI 조각
 * 알림 · 확인 · 입력 시트 · 목록 표 · 진행 표시
 */
(function (g) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(s, r) {
    if (typeof s === 'string' && s.charAt(0) !== '#' && s.charAt(0) !== '.' && !/[\s\[>]/.test(s)) {
      var byId = document.getElementById(s);
      if (byId) return byId;
    }
    return (r || document).querySelector(s);
  }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ── 아이콘 ───────────────────────────────────────── */
  /* 이모지는 OS 마다 다르게 보이고 굵기도 제각각이라, 같은 규격으로 그린 선 아이콘만 쓴다.
     24×24 격자 · 선 굵기 1.7 · currentColor */

  var PATHS = {
    home:      '<path d="M3.8 10.4 12 4l8.2 6.4V19a1.6 1.6 0 0 1-1.6 1.6h-3.9v-5.4H9.3v5.4H5.4A1.6 1.6 0 0 1 3.8 19z"/>',
    receipt:   '<path d="M6 3h12a1 1 0 0 1 1 1v16.6a.5.5 0 0 1-.74.44L16 19.8l-2.26 1.3a.5.5 0 0 1-.5 0L11 19.8l-2.24 1.3a.5.5 0 0 1-.5 0L6 19.8l-2.26 1.24A.5.5 0 0 1 3 20.6V4a1 1 0 0 1 1-1z" transform="translate(1 0)"/><path d="M8.4 8.2h7.2M8.4 12h7.2M8.4 15.8h4.4"/>',
    ops:       '<rect x="4.2" y="4.8" width="15.6" height="16.4" rx="2.2"/><path d="M9.2 3.2h5.6a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1H9.2a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1z"/><path d="M8.6 12.4l1.7 1.7 3.5-3.7M8.6 17.4h6.8"/>',
    photos:    '<rect x="3" y="6.6" width="18" height="13.4" rx="2.4"/><path d="M8.7 6.6l1.25-2.1a1 1 0 0 1 .86-.5h2.38a1 1 0 0 1 .86.5l1.25 2.1"/><circle cx="12" cy="13.3" r="3.4"/>',
    customers: '<circle cx="9" cy="8.2" r="3.4"/><path d="M2.9 20.2a6.1 6.1 0 0 1 12.2 0"/><path d="M16.2 5.2a3.4 3.4 0 0 1 0 6.6M17.6 14.6a6.1 6.1 0 0 1 3.5 5.6"/>',
    proposal:  '<path d="M6.4 2.9h8l4.2 4.3v13.9a1.6 1.6 0 0 1-1.6 1.6H6.4a1.6 1.6 0 0 1-1.6-1.6V4.5a1.6 1.6 0 0 1 1.6-1.6z"/><path d="M14.2 2.9v4.4h4.4"/><path d="M8.6 12.6h6.8M8.6 16.4h4.6"/>',
    project:   '<path d="M3.4 7a2 2 0 0 1 2-2h3.3l2 2.4h7.9a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/><path d="M3.4 10.6h17.2"/>',
    /* 결과보고서 — 클립보드에 체크. '점검을 마치고 보고한다' 로 바로 읽힌다.
       위쪽 집게가 있어서 제안서(문서)·프로젝트(폴더)와 작은 크기에서도 실루엣이 갈린다. */
    report:    '<rect x="4.4" y="4.8" width="15.2" height="16.4" rx="2.2"/>' +
               '<path d="M9.2 3.2h5.6a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1H9.2a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1z"/>' +
               '<path d="M8.6 13.2l2.3 2.3 4.5-4.7"/>',
    survey:    '<rect x="4.6" y="3.4" width="14.8" height="17.2" rx="2.2"/><path d="M8.6 8.4l1.3 1.3 2.4-2.5M8.6 14.4l1.3 1.3 2.4-2.5M14.6 8.4h2.4M14.6 14.4h2.4"/>',
    lock:      '<rect x="4.6" y="10.4" width="14.8" height="10" rx="2.2"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/>',
    check:     '<path d="M5 12.6l4.6 4.6L19 7.6"/>',
    alert:     '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.8v5M12 16.1v.1"/>',
    info:      '<circle cx="12" cy="12" r="8.6"/><path d="M12 11.4v4.8M12 7.9v.1"/>',
    chevron:   '<path d="M9.6 5.4 16 12l-6.4 6.6"/>',
    download:  '<path d="M12 3.8v11.4M7.4 10.9 12 15.5l4.6-4.6M4.4 19.6h15.2"/>',
    upload:    '<path d="M12 15.6V4.2M7.4 8.8 12 4.2l4.6 4.6M4.4 19.6h15.2"/>',
    inbox:     '<path d="M3.4 13.6h4.2l1.4 2.6h6l1.4-2.6h4.2"/><path d="M5.9 4.6h12.2l2.5 9v4.6a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2v-4.6z"/>',
    calendar:  '<rect x="3.6" y="5.4" width="16.8" height="15" rx="2.2"/><path d="M8.2 3.2v4M15.8 3.2v4M3.6 10.2h16.8"/>',
    backup:    '<path d="M4 7.4c0-1.6 3.6-2.9 8-2.9s8 1.3 8 2.9-3.6 2.9-8 2.9-8-1.3-8-2.9z"/><path d="M4 7.4v9.2c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9V7.4"/><path d="M4 12c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9"/>',
    settings:  '<circle cx="12" cy="12" r="3.1"/><path d="M19.3 14.6a1.6 1.6 0 0 0 .32 1.77l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.05-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.46v.17a1.9 1.9 0 0 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-.97H3.4a1.9 1.9 0 0 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.77.32h.08a1.6 1.6 0 0 0 .97-1.46V3.4a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.46.97h.17a1.9 1.9 0 0 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46.97z"/>',
    image:     '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.4"/><circle cx="8.6" cy="9.8" r="1.7"/><path d="M20.6 15.4 16 10.9l-8.6 8.5"/>',
    trash:     '<path d="M4.2 6.6h15.6"/>' +
               '<path d="M9.4 6.6V4.9a1.3 1.3 0 0 1 1.3-1.3h2.6a1.3 1.3 0 0 1 1.3 1.3v1.7"/>' +
               '<path d="M6.3 6.6l.8 12.3a1.7 1.7 0 0 0 1.7 1.6h6.4a1.7 1.7 0 0 0 1.7-1.6l.8-12.3"/>' +
               '<path d="M10.4 10.4v6M13.6 10.4v6"/>'
  };

  function icon(name, size) {
    if (!PATHS[name]) return '';
    var s = size || 20;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true" ' +
      'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      PATHS[name] + '</svg>';
  }

  /* ── 알림 ─────────────────────────────────────────── */

  function toast(msg, kind) {
    var wrap = document.getElementById('toast-wrap');
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = '<span class="toast-icon">' + icon(kind === 'err' ? 'alert' : kind === 'ok' ? 'check' : 'info', 17) + '</span>' +
      '<span>' + esc(msg) + '</span>';
    wrap.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 200);
    }, kind === 'err' ? 5200 : 2800);
  }

  /* ── 확인 시트 ────────────────────────────────────── */

  function confirmBox(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var host = document.createElement('div');
      host.className = 'sheet-wrap';
      host.innerHTML =
        '<div class="sheet narrow">' +
          '<div class="sheet-body">' +
            '<h2 class="sheet-title">' + esc(opts.title || '확인해 주세요') + '</h2>' +
            '<p class="sheet-msg">' + esc(message) + '</p>' +
          '</div>' +
          '<div class="sheet-foot">' +
            '<button class="btn big ghost" data-no type="button">취소</button>' +
            '<button class="btn big ' + (opts.danger ? 'danger' : 'primary') + '" data-yes type="button">' + esc(opts.ok || '확인') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(host);
      requestAnimationFrame(function () { host.classList.add('in'); });
      function done(v) {
        host.classList.remove('in');
        setTimeout(function () { host.remove(); }, 180);
        resolve(v);
      }
      host.addEventListener('click', function (e) {
        if (e.target.closest('[data-yes]')) done(true);
        else if (e.target.closest('[data-no]') || e.target === host) done(false);
      });
      setTimeout(function () { var b = host.querySelector('[data-yes]'); if (b) b.focus(); }, 60);
    });
  }

  /* ── 초안 안내 ────────────────────────────────────────
     PPT 를 내려받은 뒤에 띄운다. 자동으로 채운 파일은 초안이다 —
     강사 이력이 비었거나 AI 가 쓴 문장이 사실과 다를 수 있다.
     '저장했습니다' 토스트만 뜨면 그대로 고객에게 보내기 쉽다.
     opts = { title, file, issues: [문장], checks: [문장] }
       issues — 이 파일에서 실제로 찾은 부족한 곳 (빨간 점)
       checks — 늘 사람이 한 번 봐야 하는 것 */
  function draftNote(opts) {
    opts = opts || {};
    var issues = (opts.issues || []).filter(Boolean);
    var checks = (opts.checks || []).filter(Boolean);
    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    host.innerHTML =
      '<div class="sheet">' +
        '<div class="sheet-head"><h2 class="sheet-title">' + esc(opts.title || '초안을 저장했습니다') + '</h2>' +
          '<button class="icon-btn" data-no type="button">✕</button></div>' +
        '<div class="sheet-body">' +
          '<div class="dn-lead">' +
            (opts.file ? '<b>' + esc(opts.file) + '</b>' : '') +
            '<span>자동으로 채운 <b>초안</b>입니다. 파워포인트에서 열어 확인·수정한 뒤 보내 주세요.</span>' +
          '</div>' +
          (issues.length
            /* 빨간색이면 '잘못 만들어졌다'로 읽힌다. 실제로는 사람이 한 번 보면 되는 자리라
               파란 '확인' 톤으로 둔다. */
            ? '<div class="dn-block check"><b>확인이 필요한 곳 ' + issues.length + '개</b>' +
                '<p class="dn-sub">오류가 아니라, 파워포인트에서 한 번 봐 주시면 되는 자리입니다.</p><ul>' +
                issues.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>'
            : '<div class="dn-block ok"><b>비어 있는 칸은 찾지 못했습니다</b></div>') +
          (checks.length
            ? '<div class="dn-block"><b>보내기 전에 한 번 더 봐 주세요</b><ul>' +
                checks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>'
            : '') +
        '</div>' +
        '<div class="sheet-foot"><button class="btn big primary" data-no type="button">확인</button></div>' +
      '</div>';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-no]') || e.target === host) {
        host.classList.remove('in');
        setTimeout(function () { host.remove(); }, 180);
      }
    });
  }

  /* ── 입력 시트 ────────────────────────────────────── */
  /* fields: [{key, label, type, options, required, hint, span, placeholder, rows, checkLabel}] */

  function fieldHtml(f, values) {
    var v = values[f.key];
    var id = 'ff_' + f.key;
    var html = '<div class="ff' + (f.span === 2 ? ' span2' : '') + '">';
    if (f.type !== 'checkbox') {
      html += '<label for="' + id + '">' + esc(f.label) + (f.required ? '<i>필수</i>' : '') + '</label>';
    }

    switch (f.type) {
      case 'textarea':
        html += '<textarea id="' + id + '" data-k="' + f.key + '" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>';
        break;
      case 'select':
        html += '<div class="sel-wrap"><select id="' + id + '" data-k="' + f.key + '">' +
          (f.required ? '' : '<option value=""></option>') +
          (f.options || []).map(function (o) {
            var val = (typeof o === 'object') ? o.value : o;
            var lab = (typeof o === 'object') ? o.label : o;
            return '<option value="' + esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(lab) + '</option>';
          }).join('') + '</select></div>';
        break;
      case 'multiselect':
        html += '<div class="chip-group">' + (f.options || []).map(function (o) {
          var on = Array.isArray(v) && v.indexOf(o) !== -1;
          return '<label class="chip-check' + (on ? ' on' : '') + '"><input type="checkbox" data-multi="' + f.key + '" value="' + esc(o) + '"' + (on ? ' checked' : '') + '>' + esc(o) + '</label>';
        }).join('') + '</div>';
        break;
      case 'checkbox':
        html += '<label class="switch-row"><span class="switch-label">' + esc(f.label) +
          (f.checkLabel ? '<i>' + esc(f.checkLabel) + '</i>' : '') + '</span>' +
          '<input type="checkbox" id="' + id + '" data-k="' + f.key + '" data-bool="1"' + (v ? ' checked' : '') + '>' +
          '<span class="switch"></span></label>';
        break;
      case 'tags':
        html += '<input id="' + id + '" data-k="' + f.key + '" data-tags="1" value="' + esc(Array.isArray(v) ? v.join(', ') : (v || '')) + '" placeholder="' + esc(f.placeholder || '쉼표로 구분해 입력') + '">';
        break;
      default:
        html += '<input id="' + id + '" type="' + (f.type || 'text') + '" data-k="' + f.key + '"' +
          (f.type === 'number' ? ' data-num="1" inputmode="numeric"' : '') +
          ' value="' + esc(v === null || v === undefined ? '' : v) + '"' +
          (f.readonly ? ' readonly' : '') +
          ' placeholder="' + esc(f.placeholder || '') + '">';
    }
    if (f.hint) html += '<p class="ff-hint">' + esc(f.hint) + '</p>';
    return html + '</div>';
  }

  function formModal(opts) {
    var values = Object.assign({}, opts.values || {});
    return new Promise(function (resolve) {
      var host = document.createElement('div');
      host.className = 'sheet-wrap';
      host.innerHTML =
        '<div class="sheet' + (opts.wide ? ' wide' : '') + '">' +
          '<div class="sheet-head">' +
            '<h2 class="sheet-title">' + esc(opts.title) + '</h2>' +
            '<button class="icon-btn" data-no type="button" aria-label="닫기">✕</button>' +
          '</div>' +
          '<div class="sheet-body">' +
            (opts.note ? '<p class="sheet-note">' + esc(opts.note) + '</p>' : '') +
            '<div class="ff-grid">' + opts.fields.map(function (f) { return fieldHtml(f, values); }).join('') + '</div>' +
            '<div class="form-error" hidden></div>' +
          '</div>' +
          '<div class="sheet-foot">' +
            '<button class="btn big primary" data-ok type="button">' + esc(opts.ok || '저장') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(host);
      requestAnimationFrame(function () { host.classList.add('in'); });
      var errBox = host.querySelector('.form-error');

      function collect() {
        var out = {};
        $$('[data-k]', host).forEach(function (el) {
          var k = el.dataset.k;
          if (el.dataset.bool) out[k] = el.checked;
          else if (el.dataset.tags) out[k] = el.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          else if (el.dataset.num) out[k] = el.value === '' ? null : Number(el.value);
          else out[k] = el.value;
        });
        (opts.fields || []).filter(function (f) { return f.type === 'multiselect'; }).forEach(function (f) {
          out[f.key] = $$('[data-multi="' + f.key + '"]', host).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        });
        return out;
      }
      function done(v) {
        host.classList.remove('in');
        setTimeout(function () { host.remove(); }, 180);
        resolve(v);
      }

      host.addEventListener('change', function (e) {
        var chip = e.target.closest('.chip-check');
        if (chip) chip.classList.toggle('on', e.target.checked);
      });
      host.addEventListener('click', function (e) {
        if (e.target.closest('[data-no]') || e.target === host) return done(null);
        if (!e.target.closest('[data-ok]')) return;
        var data = collect();
        var missing = (opts.fields || []).filter(function (f) {
          if (!f.required) return false;
          var v = data[f.key];
          return v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length);
        });
        if (missing.length) {
          errBox.hidden = false;
          errBox.textContent = missing.map(function (f) { return f.label; }).join(', ') + ' 을(를) 입력해 주세요.';
          return;
        }
        if (opts.validate) {
          var msg = opts.validate(data);
          if (msg) { errBox.hidden = false; errBox.textContent = msg; return; }
        }
        done(data);
      });
      host.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(null); });
      setTimeout(function () {
        var first = host.querySelector('.ff input:not([type=checkbox]), .ff select, .ff textarea');
        if (first) first.focus();
      }, 80);
    });
  }

  /* ── 표 ───────────────────────────────────────────── */
  /* columns: [{key, label, width, render(row), cls}] */

  function table(columns, rows, opts) {
    opts = opts || {};
    if (!rows.length) return empty(opts.empty || '아직 없어요');
    return '<div class="table-wrap"><table class="grid">' +
      '<thead><tr>' + columns.map(function (c) {
        return '<th' + (c.width ? ' style="width:' + c.width + '"' : '') + '>' + esc(c.label) + '</th>';
      }).join('') + (opts.actions ? '<th style="width:96px"></th>' : '') + '</tr></thead>' +
      '<tbody>' + rows.map(function (r) {
        return '<tr data-id="' + esc(r.id) + '"' + (opts.rowClass ? ' class="' + opts.rowClass(r) + '"' : '') + '>' +
          columns.map(function (c) {
            var v = c.render ? c.render(r) : esc(r[c.key]);
            return '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + v + '</td>';
          }).join('') +
          (opts.actions ? '<td class="act">' +
            '<button class="btn tiny" data-edit="' + esc(r.id) + '" type="button">수정</button>' +
            (opts.noDelete ? '' : '<button class="btn tiny ghost-danger" data-del="' + esc(r.id) + '" type="button">삭제</button>') +
          '</td>' : '') +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* 빈 화면에는 뜻 없는 그림을 두지 않는다. 무엇이 없고 무엇을 하면 되는지만 적는다. */
  function empty(text, sub) {
    return '<div class="empty"><p>' + esc(text) + '</p>' +
      (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>';
  }

  function badge(text, cls) { return '<span class="badge ' + (cls || '') + '">' + esc(text) + '</span>'; }
  function unknown(text) { return '<span class="unknown">' + esc(text || '확인 필요') + '</span>'; }
  function num(n) { return (n === null || n === undefined || n === '') ? '' : Number(n).toLocaleString('ko-KR'); }

  function bytes(n) {
    if (!n && n !== 0) return '';
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + 'GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + 'MB';
    if (n >= 1024) return Math.round(n / 1024) + 'KB';
    return n + 'B';
  }
  function time(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  }
  function dateTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) + ' ' + time(ts);
  }

  /* ── 창 바깥 클릭 ────────────────────────────────────
     창(시트)들은 바깥 어두운 배경을 누르면 닫힌다. 그런데 창 안에서 글을 드래그해
     고르다가 바깥에서 손을 떼도 '바깥 클릭' 이 되어, 쓰던 메일·견적 창이 꺼졌다.
     누르기 시작한 곳까지 바깥일 때만 닫히게 — 모든 창에 한 번에 건다. */
  var downAt = null;
  document.addEventListener('mousedown', function (e) { downAt = e.target; }, true);
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.classList && (t.classList.contains('sheet-wrap') || t.classList.contains('modal')) &&
        downAt && downAt !== t) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  /* ── 진행 표시 ────────────────────────────────────── */

  /* 기다리는 동안 한 줄씩 바꿔 거는 말.
     '사진 읽는 중… 8 / 16' 만 떠 있으면 몇 십 초가 몇 분처럼 느껴진다.
     무엇을 하고 있는지 한 줄 더 얹으면 기다리는 맛이 달라진다.
     하는 일에 맞는 말만 고른다 — 사진을 읽는데 메일 이야기를 하면 헛소리다. */
  var CHEER = {
    /* 말은 짧게, 실제로 하는 일만 — 한 줄에 들어가게(스무 자 안팎),
       '— …' 로 덧붙이는 문장·수다스러운 말·하지도 않는 일은 적지 않는다. */
    photo: [
      '사진 크기를 맞추는 중이에요',
      '세워 찍은 사진을 바로 돌리는 중이에요',
      '사진을 차례대로 넣고 있어요',
      '사진 자리를 채우는 중이에요',
      '사진 이름을 정리하고 있어요'
    ],
    ppt: [
      '양식에 글자를 채우는 중이에요',
      '장마다 들어갈 내용을 넣고 있어요',
      '표 안의 칸을 맞추는 중이에요',
      '예전 고객사 이름을 확인하고 있어요',
      '글꼴을 맞추는 중이에요',
      '빈 장을 정리하는 중이에요',
      '글이 칸을 넘지 않는지 보고 있어요',
      '표지부터 차례로 채우는 중이에요'
    ],
    report: [
      '숫자와 사진을 모으는 중이에요',
      '만족도 결과를 넣고 있어요',
      '수강생 의견을 담는 중이에요',
      '계획과 실제를 맞춰 보고 있어요',
      '빈 곳이 없는지 확인하고 있어요'
    ],
    excel: [
      '견적서 칸을 채우는 중이에요',
      '합계를 다시 확인하고 있어요',
      '한글 금액을 적는 중이에요'
    ],
    mail: [
      '받는 사람과 첨부를 챙기고 있어요',
      '제목을 다듬는 중이에요',
      '첨부를 확인하고 있어요'
    ],
    read: [
      '새로 들어온 문의를 읽고 있어요',
      '최근 것부터 정리하는 중이에요',
      '빠진 건 없는지 확인하고 있어요'
    ],
    /* 커리큘럼 쓰기는 한 번에 50~70초가 걸린다.
       2초마다 갈아 걸면 서른 줄은 있어야 한 바퀴도 안 돈다 —
       같은 말이 다시 나오면 멈춘 줄 알고 새로고침하게 된다. */
    ai: [
      /* 무엇을 하고 있는지 그대로 적는다.
         막연한 글쓰기 이야기보다 실제로 도는 일을 적어야 기다릴 만하고,
         이 도구가 무슨 일을 하는지도 같이 알게 된다. */
      '문의 내용을 읽고 있어요',
      '요청하신 시간과 인원을 확인하고 있어요',
      '지난 제안서에서 비슷한 주제를 찾고 있어요',
      '참고할 제안서를 고르는 중이에요',
      '개인 정보를 가리고 보내는 중이에요',
      '양식 칸 크기를 재고 있어요',
      '커리큘럼을 새로 쓰는 중이에요',
      '시간에 맞춰 모듈을 나누는 중이에요',
      '모듈마다 소주제를 잡는 중이에요',
      '실습과 강의를 나누는 중이에요',
      '교육 산출물을 정하고 있어요',
      '시간 합계를 확인하고 있어요',
      '모듈 순서를 정하는 중이에요',
      '학습 키워드를 뽑는 중이에요',
      '학습 목표를 다듬는 중이에요',
      '빠진 주제가 없는지 보고 있어요',
      '대상 직급에 맞추는 중이에요',
      '정책·시장 환경을 정리하는 중이에요',
      '핵심 가치와 역량을 정리하는 중이에요',
      '기대 효과를 적는 중이에요',
      '과정 이름을 짓고 있어요',
      '운영 방식을 정하는 중이에요',
      '조 편성을 정하는 중이에요',
      '필요한 강사 경력을 적고 있어요',
      '사전 준비물을 챙기고 있어요',
      '글 길이를 칸에 맞추는 중이에요',
      '겹치는 표현을 정리하는 중이에요',
      '문장을 다듬는 중이에요',
      '제목과 내용을 맞춰 보고 있어요'
    ],
    '': [
      '처리하고 있어요',
      '하나씩 확인하는 중이에요'
    ]
  };

  /* '거의 다 됐어요' 류는 **정말 끝이 보일 때만** 쓴다.
     전에는 다른 말과 섞여 아무 때나 나왔다 — 1분짜리 일이 5초 만에
     '거의 다 썼어요' 라고 하면, 그 뒤로 기다리는 50초 내내 '왜 안 끝나지' 가 된다.
     끝이 보인다는 것은 둘 중 하나로만 안다: 진행률이 90% 를 넘었거나,
     예상 시간(U.withEta)의 80% 를 지났을 때. 둘 다 모르면 끝까지 쓰지 않는다. */
  var CHEER_NEAR = {
    ai: ['거의 다 썼어요', '마지막으로 한 번 더 읽어 봅니다', '마무리하고 있어요'],
    photo: ['거의 다 넣었어요', '마지막 몇 장을 넣고 있어요'],
    '': ['거의 다 됐어요', '마무리하고 있어요', '곧 화면에 나옵니다']
  };

  /* 준비한 말을 다 쓰고도 아직 안 끝났을 때 이어 거는 말.
     하는 일을 계속 말해 주되, 오래 걸리고 있다는 것도 숨기지 않는다.
     여기에도 '곧 끝나요' 는 넣지 않는다 — 예상보다 오래 걸린다는 것은
     언제 끝날지 모른다는 뜻이다. */
  var CHEER_TAIL = [
    '꼼꼼히 확인하는 중이에요',
    '문장을 다시 다듬고 있어요',
    '앞뒤가 맞는지 보고 있어요',
    '내용이 많아 시간이 걸려요'
  ];

  /* 예상 시간을 넘겼을 때 — 멈춘 게 아니라는 것만 솔직하게 */
  var CHEER_OVER = [
    '예상보다 조금 더 걸리고 있어요',
    '계속 작업하고 있어요',
    '창을 닫지 말고 기다려 주세요'
  ];

  var cheerTimer = null;
  var cheerWait = 2000;

  function stopCheer() {
    if (cheerTimer) { clearInterval(cheerTimer); cheerTimer = null; }
    pendingEta = 0;
    cheerPct = null;
    var c = document.getElementById('busy-cheer');
    if (c) c.textContent = '';
  }

  /* kind 를 주면 그 갈래의 말을 2초마다 갈아 건다.
     섞어 두고 차례로 돈다 — 무작위로 뽑으면 같은 말이 연달아 나온다.

     준비한 말을 다 쓰면 **처음으로 되감지 않는다.** 같은 말이 다시 나오면
     멈춘 줄 알고 새로고침하게 되기 때문이다.
     대신 '오래 걸릴 때 하는 말'(CHEER_TAIL)로 넘어가고, 그것도 다 쓰면
     그때서야 얼마나 지났는지를 함께 적는다.
     숫자만 바뀌는 화면은 멈춘 것처럼 보인다 — 무엇을 하고 있는지가 늘 같이 있어야 한다. */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 지금이 일의 어디쯤인지 — 'mid' 한창 · 'near' 끝이 보임 · 'over' 예상 시간 넘김 */
  var cheerPct = null;
  var pendingEta = 0;
  function cheerPhase(began, etaSec) {
    if (cheerPct !== null && cheerPct >= 0.9) return 'near';
    if (!etaSec) return 'mid';
    var r = (Date.now() - began) / 1000 / etaSec;
    if (r >= 1.15) return 'over';
    if (r >= 0.8) return 'near';
    return 'mid';
  }

  function startCheer(kind) {
    var box = document.getElementById('busy-cheer');
    if (!box) return;
    var lines = shuffle((CHEER[kind] || CHEER['']).slice());
    var tail = shuffle(CHEER_TAIL.slice());
    var near = (CHEER_NEAR[kind] || CHEER_NEAR['']).slice();
    var etaSec = pendingEta;
    pendingEta = 0;
    var began = Date.now();
    var at = 0, nearAt = 0, overAt = 0;

    function put() {
      var s;
      var ph = cheerPhase(began, etaSec);
      if (ph === 'near') {
        s = near[nearAt++ % near.length];
      } else if (ph === 'over') {
        s = CHEER_OVER[overAt++ % CHEER_OVER.length];
      } else if (at < lines.length) {
        s = lines[at];
      } else {
        /* 준비한 말을 다 쓰면 꼬리말을 돈다. '얼마나 더 있어야 끝나나' 는
           U.eta 로 위에 한 번 적어 둔다 — 흘러간 초를 세어 보여 주지 않는다. */
        s = tail[(at - lines.length) % tail.length];
      }
      if (ph === 'mid') at++;
      box.textContent = s;
      box.classList.remove('in');
      void box.offsetWidth;                 /* 다시 흐려졌다 나타나게 */
      box.classList.add('in');
      /* 오래 걸릴수록 한 줄을 조금 더 오래 둔다. 후반까지 2초로 몰아치면
         글이 휙휙 지나가 읽히지도 않고 조급해 보인다. */
      var want = (ph === 'mid' && at < lines.length) ? 2000 : 3200;
      if (cheerTimer && want !== cheerWait) {
        clearInterval(cheerTimer);
        cheerWait = want;
        cheerTimer = setInterval(put, want);
      }
    }
    put();
    cheerWait = 2000;
    cheerTimer = setInterval(put, cheerWait);
  }

  /* ── 얼마나 걸릴지 ───────────────────────────────────
     '3분쯤' 은 얼버무리는 말이라 기다려도 되는 건지 감이 안 잡히고,
     '92초째' 는 지나간 시간이라 남은 시간을 알려 주지 않는다.
     재어 본 값을 '약 3분 소요 예정' 처럼 끝나는 때로 적는다.
     어림수로 깎는다 — '약 2분 47초' 는 정확한 척하는 말이지 도움이 안 된다. */
  function eta(sec) {
    var s = Math.round(Number(sec) || 0);
    if (s <= 0) return '';
    if (s < 45) return '약 ' + Math.max(5, Math.round(s / 5) * 5) + '초 소요 예정';
    var m = Math.round(s / 60);
    return '약 ' + Math.max(1, m) + '분 소요 예정';
  }
  /* 띄운 말 뒤에 붙인다 — '파워포인트를 만드는 중… · 약 3분 소요 예정' */
  function withEta(text, sec) {
    var e = eta(sec);
    /* 기다림 멘트가 '끝이 보이는 때' 를 알 수 있게 예상 시간을 넘겨 둔다 */
    if (e) { pendingEta = Number(sec) || 0; etaNext = pendingEta; }
    return e ? text + ' · ' + e : text;
  }

  /* ── 어림 진행 막대 ──────────────────────────────────
     커리큘럼 쓰기처럼 AI 에 한 번 묻고 기다리는 일은 서버가 진행률을 알려 주지 않는다.
     막대가 없으면 멈춘 건지 도는 건지 알 수 없다(사진 넣기처럼 막대를 보고 싶다는 요청).
     예상 시간을 기준으로 채운다 — 예상 시간에 90% 쯤, 그 뒤로는 천천히 97% 까지.
     끝나기 전에 100% 를 찍지 않는다(다 됐다고 해 놓고 기다리게 하면 더 답답하다).
     다음 걸음이 이어지면(다듬기 → PPT 만들기) 지금 자리에서 이어 채운다 — 뒤로 가지 않는다. */
  var etaNext = 0, est = null;
  function estNow() {
    if (!est) return 0;
    var x = (Date.now() - est.start) / 1000 / est.eta;
    return est.base + (0.97 - est.base) * (1 - Math.exp(-2.3 * x));
  }
  function estDraw() {
    var bar = document.getElementById('busy-bar');
    if (!bar || !est) return;
    var p = estNow();
    bar.parentElement.hidden = false;
    bar.style.width = Math.round(p * 100) + '%';
    cheerPct = p;
  }
  function estStart(sec) {
    var base = est ? estNow() : 0;
    est = { start: Date.now(), eta: Math.max(3, sec), base: Math.min(base, 0.9), timer: est && est.timer };
    if (!est.timer) est.timer = setInterval(estDraw, 250);
    estDraw();
  }
  function estStop() {
    if (est && est.timer) clearInterval(est.timer);
    est = null;
  }

  function busy(on, text, pct, kind) {
    var el = document.getElementById('busy');
    if (!el) return;
    el.hidden = !on;
    if (text !== undefined && text !== null) {
      var t = document.getElementById('busy-text');
      if (t) {
        /* '… · 약 1분 소요 예정' 을 한 줄로 이어 붙이면 좁은 창에서 '예정' 만 다음 줄로
           떨어졌다. 예상 시간은 따로 떼어 한 덩어리로 아랫줄에 둔다. */
        var s = String(text), at = s.lastIndexOf(' · 약 ');
        if (at > 0 && /소요 예정$/.test(s)) {
          t.innerHTML = esc(s.slice(0, at)) + '<span class="busy-eta">' + esc(s.slice(at + 3)) + '</span>';
        } else {
          t.textContent = s;
        }
      }
    }
    /* 진행률은 0~1 로 오기도, 0~100 으로 오기도 한다(사진 넣기). 0~1 로 맞춘다. */
    var p = (pct === undefined || pct === null) ? null : Number(pct);
    if (p !== null && p > 1) p = p / 100;
    cheerPct = on ? p : null;
    var bar = document.getElementById('busy-bar');
    /* 진짜 진행률이 오면 그것을, 없으면 예상 시간으로 채우는 막대를 쓴다 */
    if (!on || p !== null) estStop();
    else if (etaNext > 0) { estStart(etaNext); etaNext = 0; }
    if (bar) {
      if (est) estDraw();
      else {
        bar.parentElement.hidden = (p === null);
        if (p !== null) bar.style.width = Math.round(p * 100) + '%';
      }
    }
    if (!on) etaNext = 0;
    /* 켤 때 한 번만 돌리기 시작한다 — busy 는 진행률 때문에 수십 번 불린다 */
    if (!on) stopCheer();
    else if (!cheerTimer) startCheer(kind || guessKind(text));
  }

  /* kind 를 안 넘긴 곳도 많다. 띄운 말을 보고 갈래를 짐작한다. */
  function guessKind(text) {
    var s = String(text || '');
    if (/사진|이미지|ZIP|압축/i.test(s)) return 'photo';
    if (/결과보고서/.test(s)) return 'report';
    if (/견적|엑셀|xlsx/i.test(s)) return 'excel';
    if (/메일|아웃룩/.test(s)) return 'mail';
    if (/PPT|양식|템플릿|슬라이드/i.test(s)) return 'ppt';
    if (/읽|불러|가져/.test(s)) return 'read';
    return '';
  }

  /* ── 글 칸이 내용만큼 늘어나기 ─────────────────────────
     문의 원문·귀사의 상황 같은 칸이 작아서 매번 모서리를 끌어 늘려야 했다.
     칸이 그려질 때와 글을 칠 때 내용 높이에 맞춘다. 줄여 두고 싶은 칸은 data-no-grow 를 단다.
     (직접 모서리를 끌어 크기를 바꾸는 것도 그대로 된다) */
  function grow(t) {
    if (!t || t.tagName !== 'TEXTAREA' || t.hasAttribute('data-no-grow')) return;
    if (!t.offsetParent && t.offsetHeight === 0) return;      /* 안 보이는 칸은 높이를 잴 수 없다 */
    var border = t.offsetHeight - t.clientHeight;
    var minH = parseFloat(t.dataset.minH || '') || t.offsetHeight;
    if (!t.dataset.minH) t.dataset.minH = String(minH);       /* 처음 크기(rows)보다 작아지지 않게 */
    t.style.height = 'auto';
    var want = t.scrollHeight + border;
    t.style.height = Math.max(minH, want) + 'px';
  }
  function growAll(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'TEXTAREA') grow(root);
    else if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('textarea'), grow);
  }
  document.addEventListener('input', function (e) { grow(e.target); }, true);
  if (g.MutationObserver) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, growAll); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  /* 창 폭이 바뀌면 줄바꿈이 달라져 높이도 달라진다 */
  g.addEventListener('resize', function () {
    clearTimeout(grow._t);
    grow._t = setTimeout(function () { growAll(document.body); }, 150);
  });

  /* ── 못 찾은 그림 ────────────────────────────────────
     양식 썸네일은 templates/ 폴더의 파일을 가리킨다.
     폴더를 옮기거나 지우면 목록에는 양식이 남은 채 그림만 빈칸이 된다.
     무슨 일이 난 건지 모르게 되므로 자리를 남기고 말을 적어 둔다.
     error 는 위로 올라오지 않으니 캡처 단계에서 받는다. */
  document.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el.tagName === 'IMG' && !el.classList.contains('img-gone')) {
      el.classList.add('img-gone');
      /* 주소를 비워 두면 브라우저가 찢어진 그림 아이콘을 그려 넣는다.
         투명한 점 하나로 바꿔 그 아이콘을 지우고, 자리는 CSS 가 채운다. */
      el.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }
  }, true);

  /* ── 화면 넘김 ───────────────────────────────────────
     탭을 옮기면 새 화면이 옆에서 밀려 들어온다. 오른쪽 탭으로 가면 오른쪽에서,
     왼쪽 탭으로 가면 왼쪽에서 — 어디로 움직였는지가 몸으로 느껴진다.
     화면이 '바뀔 때'만 건다. 같은 화면을 다시 그릴 때마다 걸면
     글자 한 자 칠 때마다 화면이 흔들린다. */
  function slideIn(el, dir) {
    if (!el || !dir) return;
    el.classList.add(dir > 0 ? 'slide-r' : 'slide-l');
  }

  /* 두 탭의 앞뒤를 재서 어느 쪽으로 넘어가는지 정한다 */
  function dirOf(order, from, to) {
    var a = order.indexOf(from), b = order.indexOf(to);
    if (a < 0 || b < 0 || a === b) return 0;
    return b > a ? 1 : -1;
  }

  /* ── 미끄러지는 유리 알약 ────────────────────────────
     탭을 옮길 때 고른 표시가 툭툭 튀지 않고 흘러가게 한다.
     알약 하나만 움직이므로 탭을 아무리 많이 그려도 비용은 그대로다.
     바탕에 흐림을 주면 밑의 글자가 비쳐 지나가 유리처럼 보인다. */
  function glideTabs(box, itemSel) {
    if (!box) return;
    var sel = itemSel || '.step';
    var pill = box.querySelector(':scope > .tab-pill');
    var first = false;
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'tab-pill';
      box.insertBefore(pill, box.firstChild);
      first = true;
    }
    var on = box.querySelector(sel + '.on');
    if (!on) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '';
    /* offsetLeft 는 '가장 가까운 위치 잡힌 조상' 기준이라, 탭이 다른 묶음 안에 들어 있으면
       그 묶음 기준으로 재져서 알약이 옆 탭으로 밀려났다(결과보고서 알약이 제안서를 덮었다).
       알약이 놓이는 상자 기준으로 직접 잰다. */
    var br = box.getBoundingClientRect(), tr = on.getBoundingClientRect();
    var sx = box.offsetWidth ? br.width / box.offsetWidth : 1;   // 확대·축소 중이어도 CSS 픽셀로 환산
    var sy = box.offsetHeight ? br.height / box.offsetHeight : 1;
    var x = (tr.left - br.left) / (sx || 1) - box.clientLeft + box.scrollLeft;
    var y = (tr.top - br.top) / (sy || 1) - box.clientTop + box.scrollTop;
    pill.style.width = on.offsetWidth + 'px';
    pill.style.height = on.offsetHeight + 'px';
    pill.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    /* 처음 그릴 때는 왼쪽 끝에서 날아오지 않게 전환을 끄고 자리부터 잡는다 */
    if (first) requestAnimationFrame(function () { pill.classList.add('go'); });

    /* 다시 재야 하는 때가 있다.
       ① 글꼴이 늦게 도착하면 탭 너비가 달라진다 — 먼저 잰 알약은 그만큼 어긋나
          옆 탭을 덮는다(제안서 알약이 구분선까지 밀고 들어가 보였다).
       ② 창을 줄이면 탭이 접히거나 줄바꿈되어 자리가 바뀐다.
       한 번만 걸어 두고 되풀이해 걸지 않는다. */
    if (first) {
      var queued = false;
      var again = function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () { queued = false; try { glideTabs(box, itemSel); } catch (e) {} });
      };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(again);
      window.addEventListener('resize', again);
      /* ③ 탭 이름·사용자 이름이 늦게 채워지거나 윗줄이 스크롤로 접혀도(패딩 전환)
            탭 크기·자리가 바뀐다 — 상자와 탭의 크기 변화, 전환 끝을 모두 지켜본다. */
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(again);
        ro.observe(box);
        Array.prototype.forEach.call(box.querySelectorAll(sel), function (t) { ro.observe(t); });
      }
      document.addEventListener('transitionend', function (e) {
        if (e.target !== pill && e.target.contains && e.target.contains(box)) again();
      }, true);
    }
  }

  /* ── 다시 그려도 쓰던 자리를 지킨다 ──────────────────
     입력할 때마다 화면을 통째로 다시 만드는 구조라서,
     한 글자 치고 잠깐 쉬면 커서가 사라지고 화면이 위로 튀었다.
     어느 칸에 있었는지·커서가 몇 번째 글자였는지·어디까지 내렸는지를
     기억했다가 그대로 되돌려 놓는다. */
  var FIELD_KEYS = ['f', 'o', 'q', 'b', 'bVat'];

  function fieldSelector(el) {
    if (!el || !el.dataset) return null;
    for (var i = 0; i < FIELD_KEYS.length; i++) {
      var k = FIELD_KEYS[i];
      if (el.dataset[k] !== undefined) {
        return '[data-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }) +
          '="' + String(el.dataset[k]).replace(/"/g, '\\"') + '"]';
      }
    }
    return null;
  }

  function keepFocus(redraw) {
    var act = document.activeElement;
    var sel = fieldSelector(act);
    var start = null, end = null, scroller = document.getElementById('main');
    var top = scroller ? scroller.scrollTop : 0;
    if (sel) { try { start = act.selectionStart; end = act.selectionEnd; } catch (e) {} }

    redraw();

    if (!sel) return;
    var next = document.querySelector(sel);
    if (!next) return;
    try {
      next.focus({ preventScroll: true });
      if (start !== null && next.setSelectionRange) next.setSelectionRange(start, end);
      else if (next.setSelectionRange) {
        /* 커서 자리를 못 읽는 칸(type=number 등)은 맨 뒤로 보낸다.
           그대로 두면 브라우저가 맨 앞에 놓아서, 한 글자 칠 때마다
           숫자가 거꾸로 쌓인다 — 1,2,3 을 치면 321 이 된다. */
        var len = String(next.value == null ? '' : next.value).length;
        try { next.setSelectionRange(len, len); } catch (e2) {}
      }
    } catch (e) {}
    if (scroller) scroller.scrollTop = top;
  }

  /* 받침에 맞는 조사를 고른다 — josa('교육시간', '이', '가') → '이'.
     칸 이름을 문장에 끼워 넣을 때 '교육시간 가 비어 있어' 처럼 말이 어긋나는 걸 막는다.
     한글이 아닌 글자로 끝나면(숫자·영문) 받침 없는 쪽으로 붙인다. */
  function josa(word, withJong, noJong) {
    var s = String(word == null ? '' : word);
    var c = s.charCodeAt(s.length - 1);
    if (!(c >= 0xAC00 && c <= 0xD7A3)) return noJong;
    return ((c - 0xAC00) % 28) ? withJong : noJong;
  }

  g.UI = {
    esc: esc, $: $, $$: $$, icon: icon, josa: josa,
    toast: toast, confirm: confirmBox, form: formModal, draftNote: draftNote,
    table: table, empty: empty, badge: badge, unknown: unknown,
    num: num, bytes: bytes, time: time, dateTime: dateTime, busy: busy,
    eta: eta, withEta: withEta,
    keepFocus: keepFocus, glideTabs: glideTabs,
    slideIn: slideIn, dirOf: dirOf
  };
})(window);
