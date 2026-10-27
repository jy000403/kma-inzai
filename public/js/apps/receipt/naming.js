/* naming.js — 파일명 조합 · 포맷 · 검증 (요구사항 정의서 4장, FR-06/07/12/13) */
(function (global) {
  'use strict';

  var TOKEN_RE = /\{(vendor|purpose|amount|date|docSubtype|docType)\}/g;

  var TOKEN_LABEL = {
    vendor: { 영수증: '사용처', _: '업체명' },
    purpose: { 영수증: '사용이유', _: '용도' },
    amount: { _: '금액' },
    date: { _: '날짜' },
    docSubtype: { _: '문서종류' },
    docType: { _: '문서유형' }
  };

  /* Windows 파일명 금지 문자 (4.5) */
  var FORBIDDEN = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
  var FORBIDDEN_RE = /[\\\/:*?"<>|\x00-\x1f]/g;

  function labelOf(token, docType) {
    var m = TOKEN_LABEL[token] || {};
    return m[docType] || m._ || token;
  }

  /* 금액: 숫자만 남기고 천 단위 콤마 (4.2) */
  function digitsOnly(s) {
    return String(s == null ? '' : s).replace(/[^0-9]/g, '');
  }
  function formatAmount(n) {
    if (n === null || n === undefined || n === '') return '';
    var d = digitsOnly(n);
    if (!d) return '';
    d = d.replace(/^0+(?=\d)/, '');
    return d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function parseAmount(s) {
    var d = digitsOnly(s);
    return d === '' ? null : parseInt(d, 10);
  }

  /* 날짜: <input type=date> 값(YYYY-MM-DD) <-> YYMMDD (4.2) */
  function isoToYymmdd(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
  }
  function yymmddToIso(v) {
    if (!/^\d{6}$/.test(v || '')) return '';
    var yy = parseInt(v.slice(0, 2), 10);
    var year = (yy >= 70 ? 1900 + yy : 2000 + yy);
    return year + '-' + v.slice(2, 4) + '-' + v.slice(4, 6);
  }
  function isValidYymmdd(v) {
    if (!/^\d{6}$/.test(v || '')) return false;
    var mm = parseInt(v.slice(2, 4), 10), dd = parseInt(v.slice(4, 6), 10);
    return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
  }

  function tokensOf(pattern) {
    var out = [], m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(pattern)) !== null) {
      if (out.indexOf(m[1]) === -1) out.push(m[1]);
    }
    return out;
  }

  function valueOf(item, token) {
    switch (token) {
      case 'vendor': return (item.vendor || '').trim();
      case 'purpose': return (item.purpose || '').trim();
      case 'amount': return formatAmount(item.amount);
      case 'date': return (item.date || '').trim();
      case 'docSubtype': return (item.docSubtype || '').trim();
      case 'docType': return item.docType || '';
      default: return '';
    }
  }

  /* 템플릿 → 파일명 (확장자 제외). 빈 항목은 그대로 비워 두어
   * 어디가 비었는지 미리보기에서 바로 보이도록 한다. */
  function renderTemplate(pattern, item) {
    var missing = [];
    var text = String(pattern || '').replace(TOKEN_RE, function (_, token) {
      var v = valueOf(item, token);
      if (!v) missing.push(token);
      return v;
    });
    return { text: text, missing: missing };
  }

  function stripForbidden(name) {
    return String(name || '').replace(FORBIDDEN_RE, '').replace(/\s+/g, ' ').trim();
  }

  function foundForbidden(name) {
    var found = [];
    String(name || '').split('').forEach(function (ch) {
      if (FORBIDDEN.indexOf(ch) !== -1 && found.indexOf(ch) === -1) found.push(ch);
      else if (ch.charCodeAt(0) < 32 && found.indexOf('제어문자') === -1) found.push('제어문자');
    });
    return found;
  }

  /* 한 항목 검증 (FR-12).
   * errors → 다운로드 차단, warnings → 안내만 */
  function validate(item, pattern, allItems) {
    var errors = [], warnings = [];
    var name = item.fileName || '';

    if (!item.isManual) {
      var r = renderTemplate(pattern, item);
      r.missing.forEach(function (t) {
        errors.push({ code: 'missing:' + t, msg: labelOf(t, item.docType) + ' 항목이 비어 있습니다.' });
      });
      if (item.amount !== null && item.amount !== undefined && item.amount === 0) {
        warnings.push({ code: 'zero', msg: '금액이 0원입니다. 확인하세요.' });
      }
      if (tokensOf(pattern).indexOf('date') !== -1 && item.date && !isValidYymmdd(item.date)) {
        errors.push({ code: 'date', msg: '날짜는 YYMMDD 6자리여야 합니다. (예: 260819)' });
      }
    }

    if (!name.trim()) {
      errors.push({ code: 'empty', msg: '파일명이 비어 있습니다.' });
    }
    var bad = foundForbidden(name);
    if (bad.length) {
      errors.push({ code: 'forbidden', msg: '파일명에 쓸 수 없는 문자: ' + bad.join(' ') , fix: 'strip' });
    }
    if (/^\s|\s$/.test(name)) {
      warnings.push({ code: 'space', msg: '파일명 앞뒤에 공백이 있습니다. 저장 시 자동으로 제거됩니다.' });
    }
    if (/__/.test(name) || /_\)/.test(name) || /\(\)/.test(name) || /\[\]/.test(name)) {
      warnings.push({ code: 'gap', msg: '빈 항목 때문에 구분자가 붙어 있습니다.' });
    }
    if (name.length > 150) {
      warnings.push({ code: 'long', msg: '파일명이 ' + name.length + '자입니다. ERP 길이 제한을 확인하세요.' });
    }

    /* 같은 배치 내 파일명 중복 (Q-06) */
    if (allItems && name.trim()) {
      var self = (name.trim() + '.' + extOf(item)).toLowerCase();
      var dup = allItems.filter(function (o) {
        return o.id !== item.id && (String(o.fileName || '').trim() + '.' + extOf(o)).toLowerCase() === self;
      });
      if (dup.length) {
        errors.push({ code: 'dup', msg: '같은 이름의 파일이 ' + (dup.length + 1) + '개 있습니다.', fix: 'number' });
      }
    }

    return { errors: errors, warnings: warnings };
  }

  function extOf(item) {
    if (item.outputFormat === 'pdf') return 'pdf';
    return (item.sourceExt || 'png').toLowerCase();
  }

  function fullName(item) {
    return stripForbidden(item.fileName) + '.' + extOf(item);
  }

  /* 중복 해소용 번호 붙이기: 뒤에 _2, _3 … */
  function nextNumbered(base, taken) {
    var m = base.match(/^(.*?)(?:_(\d+))?$/);
    var stem = m[1];
    var i = m[2] ? parseInt(m[2], 10) + 1 : 2;
    while (taken.indexOf((stem + '_' + i).toLowerCase()) !== -1) i++;
    return stem + '_' + i;
  }

  /* 별칭 → 표준 업체명 (4.4, FR-15) */
  function normalizeKey(s) {
    return String(s || '').toLowerCase().replace(/[\s.\-_()（）]/g, '');
  }
  function findCanonical(input, vendors) {
    var key = normalizeKey(input);
    if (!key) return null;
    for (var i = 0; i < vendors.length; i++) {
      var v = vendors[i];
      if (normalizeKey(v.canonicalName) === key) return null; // 이미 표준명
      for (var j = 0; j < (v.aliases || []).length; j++) {
        if (normalizeKey(v.aliases[j]) === key) return v;
      }
    }
    return null;
  }
  function findVendor(name, vendors) {
    var key = normalizeKey(name);
    for (var i = 0; i < vendors.length; i++) {
      if (normalizeKey(vendors[i].canonicalName) === key) return vendors[i];
    }
    return null;
  }

  global.Naming = {
    TOKEN_RE: TOKEN_RE,
    FORBIDDEN: FORBIDDEN,
    labelOf: labelOf,
    formatAmount: formatAmount,
    parseAmount: parseAmount,
    digitsOnly: digitsOnly,
    isoToYymmdd: isoToYymmdd,
    yymmddToIso: yymmddToIso,
    isValidYymmdd: isValidYymmdd,
    tokensOf: tokensOf,
    renderTemplate: renderTemplate,
    stripForbidden: stripForbidden,
    validate: validate,
    extOf: extOf,
    fullName: fullName,
    nextNumbered: nextNumbered,
    findCanonical: findCanonical,
    findVendor: findVendor,
    normalizeKey: normalizeKey
  };
})(window);
