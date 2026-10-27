/* app.js — 화면 조립 및 상태 관리 */
(function () {
  'use strict';

  var N = window.Naming, X = window.Exporter, SEED = window.ReceiptSeed;
  /* 이 파일만 IIFE 에 g 를 안 받는다 — window 로 직접 부른다 */
  var STORE_KEY = window.Scope.key('erp-file-namer:v1');

  /* ───────── 상태 ───────── */
  var S = {
    items: [],
    selectedId: null,
    checked: {},
    zoom: 1,
    settings: clone(SEED.SETTINGS),
    vendors: clone(SEED.VENDORS),
    templates: clone(SEED.TEMPLATES),
    history: []
  };
  var seq = 0;
  var issueCache = {};   // id -> {errors, warnings}
  var mounted = false;   // KMA 교육운영지원에서 이 앱이 화면에 떠 있는지

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ───────── 저장소 ───────── */
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        settings: S.settings, vendors: S.vendors, templates: S.templates,
        history: S.history.slice(0, 300)
      }));
    } catch (e) { /* 용량 초과 등은 무시 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d.settings) S.settings = Object.assign(clone(SEED.SETTINGS), d.settings);
      if (Array.isArray(d.vendors)) S.vendors = d.vendors;
      if (Array.isArray(d.templates)) S.templates = mergeTemplates(d.templates);
      if (Array.isArray(d.history)) S.history = d.history;
    } catch (e) { /* 손상된 데이터는 초기값 사용 */ }
  }
  /* 내장 규칙이 사라지지 않도록 보정 */
  function mergeTemplates(saved) {
    var out = saved.slice();
    SEED.TEMPLATES.forEach(function (t) {
      if (!out.some(function (o) { return o.id === t.id; })) out.push(clone(t));
    });
    return out;
  }

  /* ───────── 알림 ───────── */
  function toast(msg, kind) { window.UI.toast(msg, kind); }
  function busy(on, text) { window.UI.busy(on, text); }

  /* ───────── 템플릿 ───────── */
  function templatesFor(docType) {
    return S.templates.filter(function (t) {
      return !t.docTypes || !t.docTypes.length || t.docTypes.indexOf('*') !== -1 || t.docTypes.indexOf(docType) !== -1;
    });
  }
  function templateById(id) {
    for (var i = 0; i < S.templates.length; i++) if (S.templates[i].id === id) return S.templates[i];
    return null;
  }
  function patternOf(item) {
    var t = templateById(item.templateId);
    if (!t) { t = templatesFor(item.docType)[0]; if (t) item.templateId = t.id; }
    return t ? t.pattern : '{vendor}_{purpose}_{amount}';
  }

  /* ───────── 항목 ───────── */
  var EXT_BY_TYPE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

  function extOfFile(file) {
    if (EXT_BY_TYPE[file.type]) return EXT_BY_TYPE[file.type];
    var m = (file.name || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : 'png';
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var rejected = [];
    var added = 0;

    files.forEach(function (f) {
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { rejected.push(f.name || '(이름 없음)'); return; }
      var id = 'i' + (++seq);
      var item = {
        id: id,
        file: f,
        blobUrl: URL.createObjectURL(f),
        srcName: f.name || ('붙여넣기-' + seq + '.' + extOfFile(f)),
        sourceExt: extOfFile(f),
        w: 0, h: 0,
        docType: '영수증',
        templateId: 't_receipt',
        vendor: '', purpose: '', amount: null, date: '', docSubtype: '영수증',
        groupId: null, groupKind: null,
        outputFormat: 'pdf',
        payMethod: 'corp',        // WEHAGO 용도 목록 (pms / corp / personal)
        account: '',              // 계정명 — 비어 있으면 추천값을 따라간다
        accountManual: false,
        fileName: '', isManual: false
      };
      recompute(item);
      S.items.push(item);
      added++;
      X.loadImage(f).then(function (bmp) {
        item.w = bmp.width; item.h = bmp.height;
        if (bmp.close) bmp.close();
        if (S.selectedId === item.id) renderPreviewMeta(item);
      }).catch(function () { /* 크기 표시만 생략 */ });
    });

    if (rejected.length) {
      toast('지원하지 않는 형식이라 건너뛰었습니다: ' + rejected.slice(0, 3).join(', ') +
            (rejected.length > 3 ? ' 외 ' + (rejected.length - 3) + '개' : '') + ' (PNG/JPG/WEBP만 가능)', 'err');
    }
    if (added) {
      if (!S.selectedId) select(S.items[S.items.length - added].id);
      refresh();
    }
  }

  function removeItems(ids) {
    ids.forEach(function (id) {
      var i = indexOf(id);
      if (i === -1) return;
      URL.revokeObjectURL(S.items[i].blobUrl);
      S.items.splice(i, 1);
      delete S.checked[id];
      delete issueCache[id];
    });
    if (ids.indexOf(S.selectedId) !== -1) S.selectedId = S.items.length ? S.items[0].id : null;
    refresh();
  }

  function indexOf(id) {
    for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return i;
    return -1;
  }
  function byId(id) { var i = indexOf(id); return i === -1 ? null : S.items[i]; }
  function current() { return byId(S.selectedId); }

  function recompute(item) {
    if (item.isManual) return;
    item.fileName = N.renderTemplate(patternOf(item), item).text;
  }
  function recomputeAll() { S.items.forEach(recompute); }

  /* ───────── 묶음 (FR-08 / FR-17) ───────── */
  var SHARED = { set: ['vendor', 'purpose', 'amount'], txn: ['vendor', 'purpose', 'amount', 'date'] };

  function groupMembers(item) {
    if (!item || !item.groupId) return [item].filter(Boolean);
    return S.items.filter(function (o) { return o.groupId === item.groupId; });
  }

  function makeGroup(ids, kind) {
    if (ids.length < 2) { toast('2개 이상 선택한 뒤 묶어 주세요.', 'err'); return; }
    var gid = 'g' + (++seq);
    var members = ids.map(byId).filter(Boolean);
    var src = members.find(function (m) { return m.vendor || m.purpose || m.amount !== null; }) || members[0];

    members.forEach(function (m, idx) {
      m.groupId = gid;
      m.groupKind = kind;
      SHARED[kind].forEach(function (f) { m[f] = src[f]; });
      if (kind === 'set') {
        m.docType = (idx === 0) ? '세금계산서' : (idx === 1 ? '견적서' : m.docType);
        m.templateId = templatesFor(m.docType)[0].id;
        m.isManual = false;
      } else {
        m.docType = '영수증';
        if (!templatesFor('영수증').some(function (t) { return t.id === m.templateId; })) m.templateId = 't_receipt';
      }
    });
    S.checked = {};
    S.selectedId = members[0].id;
    recomputeAll();
    refresh();
    toast(kind === 'set' ? '세트로 묶었습니다. 공통 항목은 한 번만 입력하면 됩니다.'
                         : '한 거래로 묶었습니다. 문서종류만 문서별로 지정하세요.', 'ok');
  }

  function ungroup(ids) {
    ids.map(byId).filter(Boolean).forEach(function (m) { m.groupId = null; m.groupKind = null; });
    S.checked = {};
    refresh();
  }

  /* 묶음 내 공통 항목 전파 */
  function setField(item, field, value) {
    item[field] = value;
    if (item.groupId && SHARED[item.groupKind] && SHARED[item.groupKind].indexOf(field) !== -1) {
      groupMembers(item).forEach(function (m) { if (m !== item) { m[field] = value; recompute(m); } });
    }
    recompute(item);
  }

  /* ───────── 검증 ───────── */
  function validateAll() {
    issueCache = {};
    S.items.forEach(function (it) {
      issueCache[it.id] = N.validate(it, patternOf(it), S.items);
    });
  }
  function issuesOf(id) { return issueCache[id] || { errors: [], warnings: [] }; }
  function hasError(id) { return issuesOf(id).errors.length > 0; }

  /* ───────── 렌더링 ───────── */
  function refresh() {
    recomputeAll();
    validateAll();
    renderList();
    renderDetail();
    renderStatus();
    syncDatalists();
  }

  function renderList() {
    var ul = $('item-list');
    $('item-count').textContent = S.items.length;
    $('list-empty').hidden = S.items.length > 0;
    $('dropzone').classList.toggle('compact', S.items.length > 0);

    ul.innerHTML = S.items.map(function (it) {
      var iss = issuesOf(it.id);
      var badges = ['<span class="badge type">' + esc(it.docType) + '</span>'];
      if (it.groupId) badges.push('<span class="badge group">' + (it.groupKind === 'set' ? '세트' : '한 거래') + '</span>');
      if (it.isManual) badges.push('<span class="badge manual">수동</span>');
      badges.push('<span class="badge fmt">' + (it.outputFormat === 'pdf' ? 'PDF' : '원본 ' + esc(it.sourceExt)) + '</span>');
      var ac = accountOf(it);
      if (ac) {
        var no = A.orderOf(ac, it.payMethod);
        badges.push('<span class="badge acct">' + esc(ac.replace(/^원가?\)/, '')) + (no ? ' ' + no + '번' : '') + '</span>');
      }
      if (iss.errors.length) badges.push('<span class="badge err">오류 ' + iss.errors.length + '</span>');
      else if (iss.warnings.length) badges.push('<span class="badge warn">확인 ' + iss.warnings.length + '</span>');

      return '<li class="item' + (it.id === S.selectedId ? ' is-sel' : '') + '" data-id="' + it.id + '">' +
        '<input type="checkbox" class="item-check" data-id="' + it.id + '"' + (S.checked[it.id] ? ' checked' : '') + '>' +
        '<img class="thumb" src="' + it.blobUrl + '" alt="">' +
        '<div class="meta"><div class="fname" title="' + esc(N.fullName(it)) + '">' +
          esc(N.fullName(it) || '(파일명 없음)') + '</div>' +
          '<div class="badges">' + badges.join('') + '</div></div>' +
        '<button class="icon-btn dl" data-dl="' + it.id + '" title="이 파일 다운로드"' +
          (iss.errors.length ? ' disabled' : '') + '>↓</button>' +
      '</li>';
    }).join('');

    var n = Object.keys(S.checked).length;
    $('bulk-bar').hidden = n === 0;
    $('bulk-count').textContent = n + '개 선택';
    $('check-all').checked = n > 0 && n === S.items.length;
  }

  function renderStatus() {
    var total = S.items.length;
    var errs = S.items.filter(function (i) { return hasError(i.id); }).length;
    var warns = S.items.filter(function (i) { return !hasError(i.id) && issuesOf(i.id).warnings.length; }).length;
    var html;
    if (!total) html = '대기 중';
    else if (errs) html = '총 ' + total + '개 · <span class="err-txt">오류 ' + errs + '개</span>' + (warns ? ' · 확인 ' + warns + '개' : '') + ' — 오류를 해결해야 다운로드할 수 있습니다.';
    else html = '총 ' + total + '개 · <span class="ok-txt">다운로드 준비 완료</span>' + (warns ? ' · 확인 ' + warns + '개' : '');
    $('status-summary').innerHTML = html;

    var pool = zipPool();
    $('btn-zip').disabled = !pool.length || pool.some(function (i) { return hasError(i.id); });
    $('btn-zip').textContent = $('zip-selected-only').checked ? '선택 항목 ZIP 다운로드' : '전체 ZIP 다운로드';
  }

  function zipPool() {
    if ($('zip-selected-only').checked) return S.items.filter(function (i) { return S.checked[i.id]; });
    return S.items.slice();
  }

  function renderPreviewMeta(it) {
    $('src-name').textContent = it.srcName;
    $('src-name').title = it.srcName;
    $('src-size').textContent = it.w ? (it.w + ' × ' + it.h + ' px') : '';
  }

  function renderDetail() {
    var it = current();
    $('detail-empty').hidden = !!it;
    $('detail-body').hidden = !it;
    if (!it) return;

    renderPreviewMeta(it);
    if ($('preview-img').getAttribute('src') !== it.blobUrl) {
      $('preview-img').src = it.blobUrl;
      $('preview-img').onload = fitZoom;
    }

    /* 문서유형 */
    Array.prototype.forEach.call($('seg-doctype').children, function (b) {
      b.classList.toggle('is-on', b.dataset.v === it.docType);
    });

    /* 규칙 */
    var opts = templatesFor(it.docType);
    $('f-template').innerHTML = opts.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === it.templateId ? ' selected' : '') + '>' + esc(t.label) + '</option>';
    }).join('');
    var pat = patternOf(it);
    $('template-hint').textContent = pat;

    /* 토큰에 따라 입력 항목 표시 */
    var tokens = N.tokensOf(pat);
    $('row-vendor').hidden = tokens.indexOf('vendor') === -1;
    $('row-purpose').hidden = tokens.indexOf('purpose') === -1;
    $('row-amount').hidden = tokens.indexOf('amount') === -1;
    $('row-date').hidden = tokens.indexOf('date') === -1;
    $('row-subtype').hidden = tokens.indexOf('docSubtype') === -1;

    $('lbl-vendor').textContent = N.labelOf('vendor', it.docType);
    $('lbl-purpose').textContent = N.labelOf('purpose', it.docType);

    $('f-vendor').value = it.vendor || '';
    $('f-purpose').value = it.purpose || '';
    $('f-amount').value = N.formatAmount(it.amount);
    $('f-date').value = N.yymmddToIso(it.date);
    $('date-yymmdd').textContent = it.date ? '→ ' + it.date : '';
    $('f-subtype').value = it.docSubtype || '';

    $('f-filename').value = it.fileName || '';
    $('filename-ext').textContent = '.' + N.extOf(it);
    $('manual-badge').hidden = !it.isManual;
    $('btn-reset-name').hidden = !it.isManual;

    Array.prototype.forEach.call($('seg-format').children, function (b) {
      b.classList.toggle('is-on', b.dataset.v === it.outputFormat);
    });
    $('format-hint').textContent = it.outputFormat === 'pdf'
      ? '원본 픽셀을 재압축 없이 PDF 1개로 변환합니다. (이미지 1장 = PDF 1개)'
      : '원본 파일을 그대로 두고 파일명만 바꿉니다. (.' + it.sourceExt + ')';

    renderVendorSuggest(it);
    renderAccount(it);
    renderIssues(it);
    renderGroupInfo(it);
    $('btn-download-one').disabled = hasError(it.id);
  }

  function renderVendorSuggest(it) {
    var box = $('vendor-suggest');
    if (!S.settings.aliasSuggest || !it.vendor) { box.hidden = true; return; }
    var v = N.findCanonical(it.vendor, S.vendors);
    if (!v) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '표준 업체명은 <b>' + esc(v.canonicalName) + '</b> 입니다. ' +
      '<button class="btn tiny" data-canon="' + esc(v.canonicalName) + '" type="button">바꾸기</button>';
  }

  /* ───────── 계정 분류 (원가 구분 표 · WEHAGO 용도) ───────── */

  var A = window.Accounts;

  /* 용도·사용처·문서종류를 합쳐 추천 근거로 쓴다 */
  function acctText(it) {
    return [it.purpose, it.vendor, it.docSubtype].filter(Boolean).join(' ');
  }
  function suggestFor(it) {
    return A.suggest(acctText(it), it.payMethod);
  }
  /* 우선순위: 직접 고른 값 → 이 업체로 지난번에 쓴 계정 → 용도에서 추천 */
  function resolveAccount(it) {
    if (it.accountManual && it.account) return { code: it.account, source: 'manual' };
    var v = N.findVendor(it.vendor, S.vendors);
    if (v && v.defaultAccount) return { code: v.defaultAccount, source: 'vendor', vendor: v.canonicalName };
    var s = suggestFor(it);
    return s.length ? { code: s[0].code, source: 'suggest', hits: s[0].hits } : { code: '', source: '' };
  }
  function accountOf(it) { return resolveAccount(it).code; }

  function renderAccount(it) {
    Array.prototype.forEach.call($('seg-pay').children, function (b) {
      b.classList.toggle('is-on', b.dataset.v === it.payMethod);
    });

    var box = $('acct-box');
    var picks = suggestFor(it);
    var res = resolveAccount(it);
    var code = res.code;
    var acc = code ? A.byCode(code) : null;
    var order = code ? A.orderOf(code, it.payMethod) : null;
    var all = A.ACCOUNTS.filter(function (a) { return it.payMethod === 'personal' || !a.personalOnly; });

    var html = '<div class="acct-pick">' +
      '<select id="f-account">' +
        '<option value="">— 계정 선택 —</option>' +
        all.map(function (a) {
          var n = A.orderOf(a.code, it.payMethod);
          return '<option value="' + esc(a.code) + '"' + (a.code === code ? ' selected' : '') + '>' +
            esc(a.code) + (n ? ' · ' + n + '번' : ' · 이 용도에 없음') + '</option>';
        }).join('') +
      '</select>' +
      (code
        ? (order
            ? '<span class="acct-no">' + esc(A.ORDERS[it.payMethod].label) + ' <b>' + order + '번</b></span>'
            : '<span class="acct-no warn">이 용도 목록에 없음</span>')
        : '') +
      '</div>';

    if (acc) {
      html += '<div class="acct-meta"><span class="acct-group">' + esc(acc.group) + '</span>' +
        '<span class="acct-basis">' + esc(acc.basis) + '</span></div>';
      html += '<p class="acct-items">' + esc(acc.items) + '</p>';
    }

    if (res.source === 'vendor') {
      html += '<p class="acct-why">‘' + esc(res.vendor) + '’ 건은 지난번에 이 계정으로 처리했습니다. 맞지 않으면 직접 고르세요.</p>';
    } else if (res.source === 'suggest' && res.hits && res.hits.length) {
      html += '<p class="acct-why">‘' + res.hits.slice(0, 3).map(esc).join('’, ‘') + '’ 때문에 추천했습니다. 맞지 않으면 직접 고르세요.</p>';
    }
    if (picks.length > 1) {
      html += '<div class="acct-alts"><span>다른 후보</span>' +
        picks.slice(1, 4).map(function (p) {
          return '<button class="chip-btn" data-alt="' + esc(p.code) + '" type="button">' + esc(p.code) + '</button>';
        }).join('') + '</div>';
    }
    if (!picks.length && !code) {
      html += '<p class="acct-why">용도에서 계정을 찾지 못했습니다. 위에서 직접 골라 주세요.</p>';
    }
    if (code) {
      html += '<div class="acct-actions">' +
        '<button class="btn tiny" data-acct-copy="' + esc(code) + '" type="button">계정명 복사</button>' +
        (order ? '<button class="btn tiny" data-acct-copy="' + esc(String(order)) + '" type="button">' + order + '번 복사</button>' : '') +
        (it.accountManual ? '<button class="btn tiny" data-acct-auto type="button">추천으로 되돌리기</button>' : '') +
      '</div>';
    }
    box.innerHTML = html;
  }

  function renderIssues(it) {
    var iss = issuesOf(it.id);
    var html = iss.errors.map(function (e) {
      return '<div class="issue err"><span>' + esc(e.msg) + '</span>' +
        (e.fix ? '<button class="btn tiny" data-fix="' + e.fix + '" type="button">' +
          (e.fix === 'strip' ? '문자 제거' : '번호 붙이기') + '</button>' : '') + '</div>';
    }).concat(iss.warnings.map(function (w) {
      return '<div class="issue warn"><span>' + esc(w.msg) + '</span></div>';
    })).join('');
    $('field-issues').innerHTML = html;
  }

  function renderGroupInfo(it) {
    var box = $('group-info');
    if (!it.groupId) { box.hidden = true; return; }
    var ms = groupMembers(it);
    var shared = SHARED[it.groupKind].map(function (f) { return N.labelOf(f, it.docType); }).join(' · ');
    box.hidden = false;
    box.innerHTML = '<b>' + (it.groupKind === 'set' ? '세트' : '한 거래') + '</b> · 문서 ' + ms.length + '개 ' +
      '(' + ms.map(function (m) { return esc(m.groupKind === 'set' ? m.docType : (m.docSubtype || '문서종류 미입력')); }).join(', ') + ')<br>' +
      '공유 항목: ' + esc(shared) +
      (it.groupKind === 'txn' ? ' · 문서종류는 문서마다 다르게 지정하세요.' : '') +
      ' <button class="btn tiny" id="btn-ungroup-one" type="button">묶음 해제</button>';
  }

  function syncDatalists() {
    $('dl-vendor').innerHTML = S.vendors.map(function (v) {
      return '<option value="' + esc(v.canonicalName) + '">';
    }).join('');
    $('dl-subtype').innerHTML = (S.settings.subtypes || []).map(function (s) {
      return '<option value="' + esc(s) + '">';
    }).join('');

    var it = current();
    var purposes = [];
    if (it) {
      var v = N.findVendor(it.vendor, S.vendors);
      if (v) purposes = (v.recentPurposes || []).slice();
    }
    if (!purposes.length) {
      S.vendors.forEach(function (v) {
        (v.recentPurposes || []).forEach(function (p) { if (purposes.indexOf(p) === -1) purposes.push(p); });
      });
    }
    $('dl-purpose').innerHTML = purposes.map(function (p) { return '<option value="' + esc(p) + '">'; }).join('');
  }

  function select(id) {
    S.selectedId = id;
    S.zoom = 1;
    renderList();
    renderDetail();
    syncDatalists();
  }

  /* ───────── 확대/축소 ───────── */
  function applyZoom() {
    var img = $('preview-img');
    if (!img.naturalWidth) return;
    img.style.width = Math.round(img.naturalWidth * S.zoom) + 'px';
    $('zoom-level').textContent = Math.round(S.zoom * 100) + '%';
  }
  function fitZoom() {
    var img = $('preview-img'), stage = $('preview-stage');
    if (!img.naturalWidth) return;
    S.zoom = Math.min(1, (stage.clientWidth - 30) / img.naturalWidth);
    applyZoom();
  }

  /* ───────── 출력 ───────── */
  function bytesOf(item) {
    if (item.outputFormat === 'pdf') return X.imageToPdf(item.file, S.settings.pdfPageMode);
    return X.blobToBytes(item.file);
  }

  function pushHistory(item) {
    /* 금액·업체·프로젝트를 같이 남긴다 — 결과보고서 정산이 이 이력을 계정별로 합친다 */
    S.history.unshift({ name: N.fullName(item), at: Date.now(), docType: item.docType, itemId: item.id,
      account: accountOf(item), payMethod: item.payMethod,
      acctNo: A.orderOf(accountOf(item), item.payMethod),
      vendor: item.vendor || '', purpose: item.purpose || '',
      amount: Number(item.amount) || 0,
      projectId: (window.Projects && window.Projects.activeId()) || null });
    S.history = S.history.slice(0, 300);
    if (S.settings.learnVendors) learn(item);
    save();
  }

  function learn(item) {
    var name = (item.vendor || '').trim();
    if (!name) return;
    var v = N.findVendor(name, S.vendors);
    if (!v) { v = { canonicalName: name, aliases: [], recentPurposes: [], defaultDocType: item.docType }; S.vendors.push(v); }
    var p = (item.purpose || '').trim();
    if (p) {
      v.recentPurposes = [p].concat((v.recentPurposes || []).filter(function (x) { return x !== p; })).slice(0, 8);
    }
    /* 같은 업체는 대개 같은 계정으로 잡히므로 마지막 선택을 기억한다 */
    var ac = accountOf(item);
    if (ac) { v.defaultAccount = ac; v.defaultPayMethod = item.payMethod; }
  }

  function downloadOne(item) {
    if (hasError(item.id)) { toast('오류를 먼저 해결해 주세요.', 'err'); return; }
    busy(true, '변환 중…');
    bytesOf(item).then(function (bytes) {
      X.download(bytes, N.fullName(item), item.outputFormat === 'pdf' ? 'application/pdf' : item.file.type);
      pushHistory(item);
      busy(false);
      toast('다운로드: ' + N.fullName(item), 'ok');
    }).catch(function (e) {
      busy(false);
      toast('변환 실패: ' + (e && e.message ? e.message : e), 'err');
    });
  }

  function downloadZip() {
    var pool = zipPool();
    if (!pool.length) { toast('내보낼 파일이 없습니다.', 'err'); return; }
    if (pool.some(function (i) { return hasError(i.id); })) { toast('오류가 있는 파일이 있습니다.', 'err'); return; }

    var entries = [];
    var i = 0;
    busy(true, '변환 중… (0/' + pool.length + ')');

    function next() {
      if (i >= pool.length) {
        var zip = X.makeZip(entries);
        var stamp = new Date();
        var nm = '증빙_' + stamp.getFullYear() + ('0' + (stamp.getMonth() + 1)).slice(-2) + ('0' + stamp.getDate()).slice(-2) +
                 '_' + ('0' + stamp.getHours()).slice(-2) + ('0' + stamp.getMinutes()).slice(-2) + '.zip';
        X.download(zip, nm, 'application/zip');
        pool.forEach(pushHistory);
        busy(false);
        refresh();
        toast(pool.length + '개 파일을 ZIP으로 저장했습니다.', 'ok');
        return;
      }
      var it = pool[i];
      busy(true, '변환 중… (' + (i + 1) + '/' + pool.length + ')');
      bytesOf(it).then(function (bytes) {
        entries.push({ name: N.fullName(it), data: bytes });
        i++;
        setTimeout(next, 0);
      }).catch(function (e) {
        busy(false);
        toast('변환 실패 (' + it.srcName + '): ' + (e && e.message ? e.message : e), 'err');
      });
    }
    next();
  }

  /* ───────── 이벤트: 파일 입력 ───────── */
  function bindInput() {
    var dz = $('dropzone');
    $('btn-pick').addEventListener('click', function () { $('file-input').click(); });
    dz.addEventListener('click', function (e) { if (e.target === dz || e.target.className === 'dz-title') $('file-input').click(); });
    $('file-input').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  }

  /* window·document 에 다는 것은 한 번만 걸고, 이 앱이 화면에 없을 때는 무시한다.
   * (다른 앱을 보고 있을 때 붙여넣기를 가로채면 안 된다) */
  var globalsBound = false;
  function bindGlobals() {
    if (globalsBound) return;
    globalsBound = true;

    ['dragenter', 'dragover'].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (!mounted) return;
        e.preventDefault();
        var dz = $('dropzone'); if (dz) dz.classList.add('drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (!mounted) return;
        e.preventDefault();
        if (ev === 'dragleave' && e.relatedTarget) return;
        var dz = $('dropzone'); if (dz) dz.classList.remove('drag');
      });
    });
    window.addEventListener('drop', function (e) {
      if (!mounted) return;
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    /* FR-02 클립보드 붙여넣기 */
    document.addEventListener('paste', function (e) {
      if (!mounted || !e.clipboardData) return;
      var files = [];
      Array.prototype.forEach.call(e.clipboardData.items || [], function (it) {
        if (it.kind === 'file') { var f = it.getAsFile(); if (f) files.push(f); }
      });
      if (files.length) { e.preventDefault(); addFiles(files); toast(files.length + '개 이미지를 붙여넣었습니다.'); }
    });

    document.addEventListener('click', function (e) {
      if (!mounted) return;
      if (e.target.hasAttribute && e.target.hasAttribute('data-close')) {
        var m = e.target.closest('.modal'); if (m) m.hidden = true;
      }
      if (e.target.classList.contains('modal')) e.target.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (!mounted || e.key !== 'Escape') return;
      document.querySelectorAll('#receipt-root .modal').forEach(function (m) { m.hidden = true; });
    });

    window.addEventListener('resize', function () { if (mounted && current()) fitZoom(); });
  }

  /* ───────── 이벤트: 목록 ───────── */
  function bindList() {
    $('item-list').addEventListener('click', function (e) {
      var dl = e.target.closest('[data-dl]');
      if (dl) { e.stopPropagation(); var it = byId(dl.dataset.dl); if (it) downloadOne(it); return; }
      if (e.target.classList.contains('item-check')) return;
      var li = e.target.closest('.item');
      if (li) select(li.dataset.id);
    });
    $('item-list').addEventListener('change', function (e) {
      if (!e.target.classList.contains('item-check')) return;
      if (e.target.checked) S.checked[e.target.dataset.id] = true;
      else delete S.checked[e.target.dataset.id];
      renderList();
      renderStatus();
    });
    $('check-all').addEventListener('change', function (e) {
      S.checked = {};
      if (e.target.checked) S.items.forEach(function (i) { S.checked[i.id] = true; });
      renderList();
      renderStatus();
    });

    function checkedIds() { return Object.keys(S.checked).filter(function (id) { return indexOf(id) !== -1; }); }
    $('btn-group-set').addEventListener('click', function () { makeGroup(checkedIds(), 'set'); });
    $('btn-group-txn').addEventListener('click', function () { makeGroup(checkedIds(), 'txn'); });
    $('btn-ungroup').addEventListener('click', function () { ungroup(checkedIds()); });
    $('btn-remove').addEventListener('click', function () {
      var ids = checkedIds();
      if (!ids.length) return;
      if (!confirm(ids.length + '개 항목을 목록에서 삭제할까요?')) return;
      removeItems(ids);
    });
  }

  /* ───────── 이벤트: 상세 폼 ───────── */
  function bindForm() {
    $('seg-doctype').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var it = current(); if (!it) return;
      it.docType = b.dataset.v;
      if (!templatesFor(it.docType).some(function (t) { return t.id === it.templateId; })) {
        it.templateId = templatesFor(it.docType)[0].id;
      }
      /* 계산서 건은 PMS 원가, 영수증은 카드 용도로 올라간다 */
      if (!it.payMethodManual) it.payMethod = A.defaultMethod(it.docType);
      refresh();
    });

    $('f-template').addEventListener('change', function (e) {
      var it = current(); if (!it) return;
      it.templateId = e.target.value;
      refresh();
    });

    function onText(inputId, field) {
      $(inputId).addEventListener('input', function (e) {
        var it = current(); if (!it) return;
        setField(it, field, e.target.value);
        afterFieldChange(it);
        if (field === 'vendor') syncDatalists();   // 업체가 바뀔 때만 용도 후보를 갱신
      });
    }
    onText('f-vendor', 'vendor');
    onText('f-purpose', 'purpose');
    onText('f-subtype', 'docSubtype');

    /* FR-13 금액 자동 콤마 */
    $('f-amount').addEventListener('input', function (e) {
      var it = current(); if (!it) return;
      var formatted = N.formatAmount(e.target.value);
      e.target.value = formatted;
      setField(it, 'amount', N.parseAmount(formatted));
      afterFieldChange(it);
    });

    /* FR-13 날짜 → YYMMDD */
    $('f-date').addEventListener('input', function (e) {
      var it = current(); if (!it) return;
      setField(it, 'date', N.isoToYymmdd(e.target.value));
      $('date-yymmdd').textContent = it.date ? '→ ' + it.date : '';
      afterFieldChange(it);
    });

    /* FR-07 파일명 직접 편집 → 수동 모드 */
    $('f-filename').addEventListener('input', function (e) {
      var it = current(); if (!it) return;
      it.fileName = e.target.value;
      it.isManual = true;
      $('manual-badge').hidden = false;
      $('btn-reset-name').hidden = false;
      afterFieldChange(it, true);
    });

    $('btn-reset-name').addEventListener('click', function () {
      var it = current(); if (!it) return;
      it.isManual = false;
      recompute(it);
      refresh();
    });

    $('seg-format').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var it = current(); if (!it) return;
      it.outputFormat = b.dataset.v;
      refresh();
    });

    /* ── 계정 분류 ── */
    $('seg-pay').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var it = current(); if (!it) return;
      it.payMethod = b.dataset.v;
      it.payMethodManual = true;
      if (it.payMethod !== 'personal' && it.account === '주유비') { it.account = ''; it.accountManual = false; }
      renderAccount(it);
      renderList();
    });

    $('acct-box').addEventListener('change', function (e) {
      var s = e.target.closest('#f-account'); if (!s) return;
      var it = current(); if (!it) return;
      it.account = s.value;
      it.accountManual = !!s.value;
      renderAccount(it);
      renderList();
    });

    $('acct-box').addEventListener('click', function (e) {
      var it = current(); if (!it) return;
      var alt = e.target.closest('[data-alt]');
      if (alt) {
        it.account = alt.dataset.alt;
        it.accountManual = true;
        renderAccount(it);
        renderList();
        return;
      }
      if (e.target.closest('[data-acct-auto]')) {
        it.account = '';
        it.accountManual = false;
        renderAccount(it);
        renderList();
        return;
      }
      var cp = e.target.closest('[data-acct-copy]');
      if (cp) {
        navigator.clipboard.writeText(cp.dataset.acctCopy)
          .then(function () { toast('복사했습니다 · ' + cp.dataset.acctCopy, 'ok'); })
          .catch(function () { toast('복사에 실패했습니다', 'err'); });
      }
    });

    $('vendor-suggest').addEventListener('click', function (e) {
      var b = e.target.closest('[data-canon]'); if (!b) return;
      var it = current(); if (!it) return;
      setField(it, 'vendor', b.dataset.canon);
      refresh();
    });

    $('field-issues').addEventListener('click', function (e) {
      var b = e.target.closest('[data-fix]'); if (!b) return;
      var it = current(); if (!it) return;
      if (b.dataset.fix === 'strip') {
        if (it.isManual) {
          it.fileName = N.stripForbidden(it.fileName);
        } else {
          /* 규칙 조합 중이면 입력 항목 자체를 정리해 수동 모드로 넘어가지 않게 한다. */
          ['vendor', 'purpose', 'docSubtype'].forEach(function (f) {
            if (it[f]) setField(it, f, N.stripForbidden(it[f]));
          });
        }
      } else {
        var taken = S.items.filter(function (o) { return o.id !== it.id; })
          .map(function (o) { return String(o.fileName || '').trim().toLowerCase(); });
        it.fileName = N.nextNumbered(String(it.fileName).trim(), taken);
        it.isManual = true;
      }
      refresh();
    });

    $('group-info').addEventListener('click', function (e) {
      if (e.target.id !== 'btn-ungroup-one') return;
      var it = current(); if (!it) return;
      ungroup(groupMembers(it).map(function (m) { return m.id; }));
    });

    $('btn-download-one').addEventListener('click', function () {
      var it = current(); if (it) downloadOne(it);
    });
    $('btn-zip').addEventListener('click', downloadZip);
    $('zip-selected-only').addEventListener('change', renderStatus);
  }

  /* 입력 중에는 포커스를 유지해야 하므로 폼 전체를 다시 그리지 않는다. */
  function afterFieldChange(it, skipNameInput) {
    validateAll();
    if (!skipNameInput) $('f-filename').value = it.fileName || '';
    $('filename-ext').textContent = '.' + N.extOf(it);
    renderIssues(it);
    renderVendorSuggest(it);
    renderAccount(it);
    renderGroupInfo(it);
    $('btn-download-one').disabled = hasError(it.id);
    renderList();
    renderStatus();
  }

  /* ───────── 이벤트: 미리보기 ───────── */
  function bindPreview() {
    $('zoom-in').addEventListener('click', function () { S.zoom = Math.min(8, S.zoom * 1.25); applyZoom(); });
    $('zoom-out').addEventListener('click', function () { S.zoom = Math.max(.05, S.zoom / 1.25); applyZoom(); });
    $('zoom-fit').addEventListener('click', fitZoom);

    var stage = $('preview-stage');
    stage.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      S.zoom = Math.max(.05, Math.min(8, S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      applyZoom();
    }, { passive: false });

    var drag = null;
    stage.addEventListener('mousedown', function (e) {
      drag = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop };
      stage.classList.add('grabbing');
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      stage.scrollLeft = drag.sl - (e.clientX - drag.x);
      stage.scrollTop = drag.st - (e.clientY - drag.y);
    });
    window.addEventListener('mouseup', function () { drag = null; stage.classList.remove('grabbing'); });
  }

  /* ───────── 설정 ───────── */
  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  function bindModals() {
    $('btn-settings').addEventListener('click', function () { renderSettings(); openModal('modal-settings'); });
    $('btn-history').addEventListener('click', function () { renderHistory(); openModal('modal-history'); });

    $('settings-tabs').addEventListener('click', function (e) {
      var t = e.target.closest('.tab'); if (!t) return;
      document.querySelectorAll('#settings-tabs .tab').forEach(function (x) { x.classList.toggle('is-on', x === t); });
      document.querySelectorAll('#modal-settings .tab-pane').forEach(function (p) {
        p.classList.toggle('is-on', p.dataset.pane === t.dataset.tab);
      });
    });

    $('s-pagemode').addEventListener('change', function (e) { S.settings.pdfPageMode = e.target.value; save(); });
    $('s-alias').addEventListener('change', function (e) { S.settings.aliasSuggest = e.target.checked; save(); renderDetail(); });
    $('s-learn').addEventListener('change', function (e) { S.settings.learnVendors = e.target.checked; save(); });
    $('s-subtypes').addEventListener('change', function (e) {
      S.settings.subtypes = e.target.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      save(); syncDatalists();
    });

    $('vendor-search').addEventListener('input', renderVendorTable);
    $('btn-vendor-add').addEventListener('click', function () {
      S.vendors.unshift({ canonicalName: '', aliases: [], recentPurposes: [], defaultDocType: '영수증' });
      $('vendor-search').value = '';
      renderVendorTable(); save();
    });
    $('btn-template-add').addEventListener('click', function () {
      S.templates.push({ id: 'u' + Date.now(), label: '새 규칙', docTypes: ['영수증'], pattern: '[{vendor}]_{purpose}({amount})', builtin: false });
      renderTemplateTable(); save(); renderDetail();
    });

    $('btn-export-json').addEventListener('click', function () {
      var data = JSON.stringify({ settings: S.settings, vendors: S.vendors, templates: S.templates, history: S.history }, null, 2);
      X.download(new Blob([data], { type: 'application/json' }), 'erp-파일명변환-설정.json');
    });
    $('btn-import-json').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (txt) {
        try {
          var d = JSON.parse(txt);
          if (d.settings) S.settings = Object.assign(clone(SEED.SETTINGS), d.settings);
          if (Array.isArray(d.vendors)) S.vendors = d.vendors;
          if (Array.isArray(d.templates)) S.templates = mergeTemplates(d.templates);
          if (Array.isArray(d.history)) S.history = d.history;
          save(); renderSettings(); refresh();
          toast('설정을 가져왔습니다.', 'ok');
        } catch (err) { toast('JSON을 읽을 수 없습니다.', 'err'); }
      });
      e.target.value = '';
    });
    $('btn-reset-all').addEventListener('click', function () {
      if (!confirm('업체 사전·파일명 규칙·설정·이력을 모두 초기 상태로 되돌립니다. 계속할까요?')) return;
      S.settings = clone(SEED.SETTINGS);
      S.vendors = clone(SEED.VENDORS);
      S.templates = clone(SEED.TEMPLATES);
      S.history = [];
      save(); renderSettings(); refresh();
      toast('초기 상태로 되돌렸습니다.', 'ok');
    });

    $('btn-history-clear').addEventListener('click', function () {
      if (!confirm('이력을 모두 지울까요?')) return;
      S.history = []; save(); renderHistory();
    });
    $('history-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-redl]'); if (!b) return;
      var it = byId(b.dataset.redl);
      if (!it) { toast('원본 이미지가 목록에 없어 다시 만들 수 없습니다.', 'err'); return; }
      downloadOne(it);
    });
  }

  function renderSettings() {
    $('s-pagemode').value = S.settings.pdfPageMode;
    $('s-alias').checked = !!S.settings.aliasSuggest;
    $('s-learn').checked = !!S.settings.learnVendors;
    $('s-subtypes').value = (S.settings.subtypes || []).join(', ');
    renderVendorTable();
    renderTemplateTable();
  }

  function renderVendorTable() {
    var q = N.normalizeKey($('vendor-search').value);
    var tbody = $('vendor-table').querySelector('tbody');
    var rows = S.vendors.map(function (v, i) { return { v: v, i: i }; }).filter(function (r) {
      if (!q) return true;
      return N.normalizeKey(r.v.canonicalName).indexOf(q) !== -1 ||
             (r.v.aliases || []).some(function (a) { return N.normalizeKey(a).indexOf(q) !== -1; });
    });
    tbody.innerHTML = rows.map(function (r) {
      return '<tr data-i="' + r.i + '">' +
        '<td><input data-f="canonicalName" value="' + esc(r.v.canonicalName) + '"></td>' +
        '<td><input data-f="aliases" value="' + esc((r.v.aliases || []).join(', ')) + '" placeholder="쉼표 구분"></td>' +
        '<td><input data-f="recentPurposes" value="' + esc((r.v.recentPurposes || []).join(', ')) + '" placeholder="쉼표 구분"></td>' +
        '<td class="act"><button class="btn tiny danger" data-del type="button">삭제</button></td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="4" style="padding:14px;color:#7a8798">검색 결과가 없습니다.</td></tr>';

    tbody.oninput = function (e) {
      var tr = e.target.closest('tr'); if (!tr || !e.target.dataset.f) return;
      var v = S.vendors[+tr.dataset.i];
      var f = e.target.dataset.f;
      if (f === 'canonicalName') v.canonicalName = e.target.value;
      else v[f] = e.target.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      save(); syncDatalists();
    };
    tbody.onclick = function (e) {
      if (!e.target.hasAttribute('data-del')) return;
      var tr = e.target.closest('tr');
      S.vendors.splice(+tr.dataset.i, 1);
      save(); renderVendorTable(); syncDatalists();
    };
  }

  function renderTemplateTable() {
    var tbody = $('template-table').querySelector('tbody');
    var TYPES = ['*'].concat(SEED.DOC_TYPES);
    tbody.innerHTML = S.templates.map(function (t, i) {
      var cur = (!t.docTypes || !t.docTypes.length) ? '*' : t.docTypes[0];
      return '<tr data-i="' + i + '">' +
        '<td><input data-f="label" value="' + esc(t.label) + '"' + (t.builtin ? ' readonly' : '') + '></td>' +
        '<td><select data-f="docTypes"' + (t.builtin ? ' disabled' : '') + '>' + TYPES.map(function (x) {
          return '<option value="' + x + '"' + (x === cur ? ' selected' : '') + '>' + (x === '*' ? '모두' : x) + '</option>';
        }).join('') + '</select></td>' +
        '<td><input data-f="pattern" value="' + esc(t.pattern) + '"></td>' +
        '<td class="act">' + (t.builtin ? '<span class="badge">기본</span>' : '<button class="btn tiny danger" data-del type="button">삭제</button>') + '</td>' +
      '</tr>';
    }).join('');

    function apply(e) {
      var tr = e.target.closest('tr'); if (!tr || !e.target.dataset.f) return;
      var t = S.templates[+tr.dataset.i];
      var f = e.target.dataset.f;
      if (f === 'docTypes') t.docTypes = (e.target.value === '*') ? ['*'] : [e.target.value];
      else t[f] = e.target.value;
      save(); refresh();
    }
    tbody.oninput = apply;
    tbody.onchange = apply;
    tbody.onclick = function (e) {
      if (!e.target.hasAttribute('data-del')) return;
      var tr = e.target.closest('tr');
      S.templates.splice(+tr.dataset.i, 1);
      save(); renderTemplateTable(); refresh();
    };
  }

  function renderHistory() {
    var ul = $('history-list');
    if (!S.history.length) { ul.innerHTML = '<li style="color:#7a8798;padding:14px">이력이 없습니다.</li>'; return; }
    ul.innerHTML = S.history.map(function (h) {
      var d = new Date(h.at);
      var at = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) +
               ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      var live = !!byId(h.itemId);
      return '<li><span class="badge type">' + esc(h.docType || '') + '</span>' +
        (h.account ? '<span class="badge acct">' + esc(h.account.replace(/^원가?\)/, '')) +
          (h.acctNo ? ' ' + h.acctNo + '번' : '') + '</span>' : '') +
        '<span class="h-name" title="' + esc(h.name) + '">' + esc(h.name) + '</span>' +
        '<span class="h-at">' + at + '</span>' +
        '<button class="btn tiny" data-redl="' + esc(h.itemId || '') + '"' + (live ? '' : ' disabled title="원본 이미지가 목록에 없습니다"') + ' type="button">다시 받기</button></li>';
    }).join('');
  }

  /* ───────── 사이트 연결 ───────── */
  var loaded = false, warned = false;

  window.Receipt = {
    id: 'receipt',
    name: '증빙 파일명 변환',
    short: '증빙',
    desc: '영수증·세금계산서 스크린샷을 ERP 업로드용 파일명으로 바꾸고 PDF로 변환합니다.',
    mount: function (host) {
      host.innerHTML = window.ReceiptMarkup;
      mounted = true;
      if (!loaded) { load(); loaded = true; }
      bindGlobals();
      bindInput();
      bindList();
      bindForm();
      bindPreview();
      bindModals();
      refresh();
      if (!X.hasNativeDeflate && !warned) {
        warned = true;
        toast('이 브라우저는 PDF 압축을 지원하지 않아 파일 용량이 커질 수 있습니다. Chrome 또는 Edge 사용을 권장합니다.', 'err');
      }
    },
    unmount: function () { mounted = false; },
    stat: function () {
      if (!loaded) { load(); loaded = true; }
      var out = [];
      if (S.items.length) out.push({ label: '작업 중', value: S.items.length + '장', tone: '' });
      out.push({ label: '업체 사전', value: S.vendors.length + '곳' });
      if (S.history.length) out.push({ label: '이력', value: S.history.length + '건' });
      return out;
    },
    metrics: function () {
      if (!loaded) { load(); loaded = true; }
      if (S.items.length) {
        var bad = S.items.filter(function (i) { return hasError(i.id); }).length;
        return [{ rank: 4, label: '변환 대기', value: S.items.length + '장',
                  sub: bad ? bad + '장 확인 필요' : '내려받을 수 있습니다',
                  tone: bad ? 'warn' : 'ok' }];
      }
      if (S.history.length) {
        return [{ rank: 5, label: '처리한 증빙', value: S.history.length + '건', sub: '누적 이력' }];
      }
      return [];
    },
    recent: function () {
      if (!loaded) { load(); loaded = true; }
      return S.history.slice(0, 6).map(function (h) {
        var d = new Date(h.at);
        return {
          name: h.name,
          at: ('0' + (d.getMonth() + 1)).slice(-2) + '.' + ('0' + d.getDate()).slice(-2) + ' ' +
              ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2)
        };
      });
    },
    /* 통합 백업에 실리는 데이터 */
    exportData: function () {
      if (!loaded) { load(); loaded = true; }
      return { settings: S.settings, vendors: S.vendors, templates: S.templates, history: S.history };
    },
    importData: function (d) {
      if (!d) return;
      if (d.settings) S.settings = Object.assign(clone(SEED.SETTINGS), d.settings);
      if (Array.isArray(d.vendors)) S.vendors = d.vendors;
      if (Array.isArray(d.templates)) S.templates = mergeTemplates(d.templates);
      if (Array.isArray(d.history)) S.history = d.history;
      loaded = true;
      save();
      if (mounted) refresh();
    }
  };
})();
