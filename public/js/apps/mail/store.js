/* store.js — 메일 초안 만들기
 *
 * 브라우저는 파일을 아웃룩에 직접 넣지 못한다. 그래서 서버가 첨부까지 담은
 * 메일 파일(.eml)을 만들어 준다. 그 파일을 열면 아웃룩 새 메일 창이 뜬다.
 * 로컬 서버든 배포한 웹이든 같다 — 아웃룩을 부르지 않으므로 실행하기.bat 이 필요 없다.
 */
(function (g) {
  'use strict';

  /* relay 주소.
     127.0.0.1 로 못 박아 뒀더니, 주소창이 localhost:8765 일 때 출처가 달라
     브라우저가 막았다 — relay 도 아웃룩도 멀쩡한데 화면에는
     '실행하기.bat 으로 열어야 합니다' 가 떴다. 그 경고가 거짓말이었다.
     relay 가 띄워 준 페이지면 같은 출처로 부르고(상대 주소),
     index.html 을 그냥 더블클릭해 file:// 로 연 때만 127.0.0.1 로 간다. */
  var BASE = /^https?:/.test(location.protocol) ? '' : 'http://127.0.0.1:8765';
  var SIGN_KEY = g.Scope.key('kma-mail-sender:v1');

  var SENDER_DEFAULT = {
    name: '', team: 'KMA 인재개발센터', rank: '', phone: '', email: '',
    closing: '감사합니다.'
  };

  /* { ok, version, account, message } — 성공한 답만 기억한다.
     실패를 기억해 두면, relay 가 잠깐 멈췄다 다시 떠도 화면은 계속
     '연결 안 됨' 이라고 우긴다. 그때 뜨는 '실행하기.bat 으로 열어야 합니다'
     경고가 거짓말이 된다. 실패는 기억하지 않고 다음에 다시 물어본다. */
  var probe = null;
  var lastFail = 0;
  var RETRY_MS = 4000;   /* 다시 묻기 전 이만큼은 쉰다 — 매번 두드리지 않게 */

  function sender() {
    try {
      var raw = localStorage.getItem(SIGN_KEY);
      if (raw) return Object.assign({}, SENDER_DEFAULT, JSON.parse(raw));
    } catch (e) {}
    return Object.assign({}, SENDER_DEFAULT);
  }
  function saveSender(s) {
    try { localStorage.setItem(SIGN_KEY, JSON.stringify(s)); } catch (e) {}
    return s;
  }

  /* relay 와 아웃룩이 살아 있는지.
     붙었다는 답은 기억하고, 못 붙었다는 답은 기억하지 않는다. */
  function status(force) {
    if (probe && probe.ok && !force) return Promise.resolve(probe);
    if (probe && !probe.ok && !force && (Date.now() - lastFail) < RETRY_MS) {
      return Promise.resolve(probe);
    }
    return fetch(BASE + '/api/outlook/status', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        probe = d;
        if (!d || !d.ok) lastFail = Date.now();
        return d;
      })
      .catch(function () {
        lastFail = Date.now();
        probe = { ok: false, reason: 'no_server',
                  message: '서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.' };
        return probe;
      });
  }
  function known() { return probe; }

  /* Blob → base64 (파일을 relay 로 넘길 때 쓴다) */
  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        resolve(s.slice(s.indexOf(',') + 1));
      };
      fr.onerror = function () { reject(new Error('첨부를 읽지 못했습니다.')); };
      fr.readAsDataURL(blob);
    });
  }

  /* '고객사 + 과정명'. 과정명이 이미 고객사로 시작하면 한 번만 쓴다. */
  function head(company, title) {
    var c = String(company || '').trim(), t = String(title || '').trim();
    if (!c) return t;
    if (!t) return c;
    return t.indexOf(c) === 0 ? t : c + ' ' + t;
  }

  /* ── 브라우저에서 메일 파일 만들기 ─────────────────────
     서버에서 묶으면 배포한 웹은 파일 보관 한도(50MB)에 걸려 첨부 35MB 가 끝이었다.
     결과보고서에 사진 zip 까지 붙이면 그걸 넘는다. 첨부가 크면 서버에 올리지 않고
     여기서 바로 묶는다 — 올리는 시간도 없고 크기 한도도 없다.
     서버(mail.py)와 같은 규칙: 'X-Unsent: 1'(아웃룩이 보내지 않은 새 메일로 연다),
     한글 제목·파일명은 UTF-8 인코딩, 본문·첨부는 76자 줄의 base64. */
  var BIG_LOCAL = 30 * 1024 * 1024;   /* 이보다 크면 브라우저에서 묶는다 */
  var WARN = 20 * 1024 * 1024;

  function utf8b64(s) { return btoa(unescape(encodeURIComponent(s))); }

  /* '=?UTF-8?B?…?=' 조각들 — 한 조각이 너무 길지 않게 글자 단위로 끊는다 */
  function encWords(s) {
    s = String(s || '');
    if (/^[\x20-\x7e]*$/.test(s)) return [s];
    var out = [], cur = '';
    Array.from(s).forEach(function (ch) {
      if (unescape(encodeURIComponent(cur + ch)).length > 42) { out.push(cur); cur = ''; }
      cur += ch;
    });
    if (cur) out.push(cur);
    return out.map(function (x) { return '=?UTF-8?B?' + utf8b64(x) + '?='; });
  }
  function lines76(b64) { return b64.replace(/.{1,76}/g, '$&\r\n'); }
  function addrs(s) {
    return String(s || '').split(/[;,\n]+/).map(function (x) { return x.trim(); })
      .filter(Boolean).join(', ');
  }
  function safeName(s) {
    return String(s || '메일').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '메일';
  }
  function mimeOf(name) {
    var ext = String(name).split('.').pop().toLowerCase();
    return {
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pdf: 'application/pdf', zip: 'application/zip', csv: 'text/csv', txt: 'text/plain',
      md: 'text/markdown', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png'
    }[ext] || 'application/octet-stream';
  }

  function buildEml(job, atts) {
    var B = '----=_KMA_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return Promise.all(atts.map(function (a) { return toBase64(a.blob); })).then(function (b64s) {
      var h = [];
      if (addrs(job.to)) h.push('To: ' + addrs(job.to));
      if (addrs(job.cc)) h.push('Cc: ' + addrs(job.cc));
      h.push('Subject: ' + encWords(job.subject || '').join('\r\n '));
      h.push('Date: ' + new Date().toUTCString().replace('GMT', '+0000'));
      h.push('Message-ID: <' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2) + '@kma.local>');
      h.push('X-Unsent: 1');
      h.push('MIME-Version: 1.0');
      h.push('Content-Type: multipart/mixed; boundary="' + B + '"');
      var parts = [h.join('\r\n'), '',
        '--' + B,
        'Content-Type: text/plain; charset="utf-8"',
        'Content-Transfer-Encoding: base64', '',
        lines76(utf8b64(job.body || ''))];
      atts.forEach(function (a, i) {
        var name = safeName(a.name), enc = encWords(name).join(' ');
        parts.push('--' + B,
          'Content-Type: ' + mimeOf(name) + '; name="' + enc + '"',
          'Content-Transfer-Encoding: base64',
          'Content-Disposition: attachment; filename="' + enc + '"; ' +
            "filename*=UTF-8''" + encodeURIComponent(name), '',
          lines76(b64s[i]));
      });
      parts.push('--' + B + '--', '');
      return new Blob([parts.join('\r\n')], { type: 'message/rfc822' });
    });
  }

  /* job = { to, cc, subject, body, attachments: [{name, blob}] }
     첨부는 큰 것만 파일 통로로 따로 올리고(Files.pack), 만든 .eml 을 내려받는다.
     opt.hold — 바로 내려받지 않고 blob 을 돌려준다. 화면이 '저장 시 유의사항' 을 먼저 보여 주고
     [저장하기] 를 눌렀을 때 내려받는다. */
  function send(job, opt) {
    var hold = !!(opt && opt.hold);
    var atts = job.attachments || [];
    var total = atts.reduce(function (n, a) { return n + ((a.blob && a.blob.size) || 0); }, 0);
    var mb = Math.round(total / 1024 / 1024 * 10) / 10;
    /* 첨부가 크면 브라우저에서 바로 묶는다 (이 PC 아웃룩 창을 띄우는 길은 서버가 해야 해서 그대로) */
    if (total > BIG_LOCAL && !(probe && probe.mode === 'outlook')) {
      return buildEml(job, atts).then(function (blob) {
        var name = safeName(job.subject) + '.eml';
        if (!hold) g.Files.save(blob, name);
        return { ok: true, mode: 'eml', attached: atts.length, file: { name: name },
                 mb: mb, big: total > WARN, blob: blob };
      });
    }
    return Promise.all(atts.map(function (a) {
      return g.Files.pack(a.blob, a.name).then(function (v) { return { name: a.name, file: v }; });
    })).then(function (packed) {
      return fetch(BASE + '/api/outlook/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: job.to || '', cc: job.cc || '', subject: job.subject || '',
          body: job.body || '', attachments: packed
        })
      });
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok || d.error) throw new Error(d.message || '메일 파일을 만들지 못했습니다.');
        /* 이 PC 의 아웃룩에 새 메일 창을 띄웠으면 내려받을 것이 없다 */
        if (d.mode === 'draft') return d;
        return g.Files.unpack(d, 'message/rfc822').then(function (blob) {
          if (!hold) g.Files.save(blob, (d.file && d.file.name) || '메일.eml');
          d.blob = blob;
          return d;
        });
      });
    }).catch(function (err) {
      if (err instanceof TypeError) {
        throw new Error('서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
      }
      throw err;
    });
  }

  /* ── 본문 자동 작성 ───────────────────────────────── */

  function won(v) { return Number(v || 0).toLocaleString('ko-KR') + '원'; }

  function signature(s) {
    var out = ['', s.closing || '감사합니다.', ''];
    var who = [s.name, s.rank].filter(Boolean).join(' ');
    if (who) out.push(who);
    if (s.team) out.push(s.team);
    var contact = [s.phone, s.email].filter(Boolean).join(' · ');
    if (contact) out.push(contact);
    return out.join('\n');
  }

  function greeting(company, person) {
    var who = (company ? company + ' ' : '') + (person || '담당자');
    return who + '님 안녕하십니까.';
  }

  /* 제안서 메일 */
  function proposalMail(p, project) {
    var s = sender();
    var b = g.PropStore.budget(p);
    var ops = p.ops || {};
    var company = (p.client && p.client.company) || (project && project.company) || '';
    var person = (p.client && p.client.person) || (project && project.client.person) || '';

    var lines = [
      greeting(company, person),
      (s.team || 'KMA 인재개발센터') + ' ' + (s.name || '') + '입니다.',
      '',
      '문의 주신 [' + (p.title || '교육') + '] 관련하여 제안서와 견적서를 보내드립니다.',
      ''
    ];
    var spec = [];
    if (ops.headcount) spec.push('대상 ' + ops.headcount + '명');
    if (ops.sessions > 1) spec.push(ops.sessions + '차수');
    if (ops.days) spec.push('차수당 ' + ops.days + '일');
    if (ops.period) spec.push('일정 ' + ops.period);
    if (spec.length) lines.push('  · 교육 개요 : ' + spec.join(' · '));
    if (b.price) {
      lines.push('  · 제안가    : ' + won(b.price) +
        (p.quote && p.quote.taxFree ? ' (부가세 면세)' : ' (부가세 별도)'));
    }
    lines.push('');
    lines.push('첨부 파일 확인 부탁드리며, 조정이 필요한 부분은 회신 주시면 바로 반영하겠습니다.');
    lines.push(signature(s));
    return {
      /* 제안서 이름이 이미 고객사로 시작하면 앞에 또 붙이지 않는다 —
         '[KMA] (주)한빛전자 (주)한빛전자 …' 처럼 두 번 나왔다. */
      subject: '[' + (s.team || 'KMA') + '] ' + head(company, p.title || '교육') + ' 제안서',
      body: lines.join('\n')
    };
  }

  /* 결과보고서 메일 */
  function reportMail(r, project) {
    var s = sender();
    var ov = r.overview || {};
    var sv = r.survey && r.survey.parsed;
    var o = sv && g.Survey ? g.Survey.overall(sv) : null;
    var company = (project && project.company) || '';
    var course = (project && project.course) || '교육';

    /* 개요의 '고객 담당'은 "김과장 과장"처럼 직급이 붙어 있어 인사말에 쓰면 겹친다 */
    var lines = [
      greeting(company, (project && project.client && project.client.person) || ov.partner),
      (s.team || 'KMA 인재개발센터') + ' ' + (s.name || '') + '입니다.',
      '',
      (ov.period ? ov.period + '에 ' : '') + '진행한 [' + course + '] 결과보고서를 보내드립니다.',
      ''
    ];
    if (ov.attended) {
      lines.push('  · 참석      : ' + ov.attended + '명' +
        (ov.completed ? ' / 수료 ' + ov.completed + '명' : ''));
    }
    if (o) lines.push('  · 만족도    : ' + o.to5 + ' / 5.0' + (sv.n ? ' (응답 ' + sv.n + '명)' : ''));
    if (r.photos && r.photos.count) lines.push('  · 교육 사진 : ' + r.photos.count + '장');
    lines.push('');
    lines.push('교육에 협조해 주셔서 감사합니다. 다음 과정도 잘 준비해 보겠습니다.');
    lines.push(signature(s));
    return {
      subject: '[' + (s.team || 'KMA') + '] ' + head(company, course) + ' 결과보고서',
      body: lines.join('\n')
    };
  }

  g.MailStore = {
    SENDER_DEFAULT: SENDER_DEFAULT,
    sender: sender, saveSender: saveSender,
    status: status, known: known, send: send, toBase64: toBase64,
    proposalMail: proposalMail, reportMail: reportMail, signature: signature
  };
})(window);
