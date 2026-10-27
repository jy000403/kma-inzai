/* views.js — 메일 보내기 화면
 *
 * 받는 사람을 넣고 첨부를 고른 뒤, 메일 파일(.eml)을 만든다.
 * 그 파일을 열면 아웃룩이 '보내지 않은 새 메일' 로 연다 — 받는 사람·제목·본문·첨부가
 * 채워진 채로. 확인하고 [보내기]만 누르면 된다.
 *
 * 예전에는 서버가 아웃룩을 직접 띄웠고(윈도우 + 실행하기.bat 에서만 됨),
 * '바로 보내기' 도 있었다. 배포한 웹에서도 되게 하면서 바로 보내기는 뺐다 —
 * 고객에게 가는 메일은 사람이 한 번 보고 보낸다.
 * 내부용 문서(예산서·정산표)는 기본으로 꺼 두고 빨간 표시를 붙인다.
 */
(function (g) {
  'use strict';

  var M = g.MailStore, U = g.UI, esc = U.esc;

  function bytes(n) { return U.bytes ? U.bytes(n) : Math.round(n / 1024) + 'KB'; }

  /*
   * open({
   *   title, to, cc, subject, body,
   *   files: [{ id, name, desc, internal, make: () => Promise<Blob>|Blob, on }]
   * })
   */
  function open(opts) {
    var state = {
      to: opts.to || '', cc: opts.cc || '',
      subject: opts.subject || '', body: opts.body || '',
      picked: {},
      mode: (M.known() && M.known().mode) || '',   /* 'outlook' 이 PC 아웃룩 · 'eml' 메일 파일 */
      ready: null,                                 /* 만들었지만 아직 저장 안 한 메일 파일 */
      done: null                                   /* 메일 파일을 내려받은 뒤의 안내 */
    };
    (opts.files || []).forEach(function (f) { state.picked[f.id] = !!f.on; });

    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });
    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }

    /* 저장 시 유의사항 — 저장하기 전 창과 저장한 뒤 안내에 똑같이 싣는다.
       이 PC 는 회사 보안 프로그램이 저장을 가로챈다: '다운로드' 는 막히고, 업무문서함에 저장하면
       아웃룩이 못 읽고, 원드라이브에 저장해도 다 써지기 전에 열면 파일이 깨졌다
       (12.5MB 에서 끊기거나, 크기만 잡히고 내용이 비어 '열 수 없습니다'). 다시 저장하면 정상으로 나온다. */
    function saveNotes() {
      return '<div class="dn-block ml-notes"><b>저장 시 유의사항</b>' +
        '<ol>' +
          '<li>저장 위치는 <b>원드라이브 폴더</b>(OneDrive - KMA한국능률협회)로 고릅니다.</li>' +
          '<li>저장한 뒤 <b>바로 열지 마세요.</b> 원드라이브 아이콘이 <b class="ml-green">✓ 초록 체크</b>가 될 때까지 기다렸다가 엽니다. ' +
            '다 저장되기 전에 열면 파일이 깨질 수 있습니다.</li>' +
          '<li>"파일을 열 수 없습니다"가 나오거나 첨부가 빠져 있으면, 그 파일은 지우고 ' +
            '<b>메일 파일을 다시 만들어</b> 저장합니다.</li>' +
        '</ol></div>';
    }

    function draw() {
      var chosen = (opts.files || []).filter(function (f) { return state.picked[f.id]; });
      var risky = chosen.filter(function (f) { return f.internal; });

      /* 메일 파일은 만들었고, 저장하기 전 — 유의사항을 먼저 읽게 한다. [저장하기] 를 눌러야 저장 창이 뜬다. */
      if (state.ready && !state.done) {
        host.innerHTML =
          '<div class="sheet mail-sheet">' +
            '<div class="sheet-head"><h2 class="sheet-title">저장하기 전에 확인해 주세요</h2>' +
              '<button class="icon-btn" data-close type="button">✕</button></div>' +
            '<div class="sheet-body">' +
              '<div class="ml-done">' +
                '<b>' + esc(state.ready.name) + '</b>' +
                '<span>첨부 ' + (state.ready.attached || 0) + '개' +
                  (state.ready.mb ? ' (' + state.ready.mb + 'MB)' : '') + ' · 받는 사람 ' + esc(state.to) + '</span>' +
              '</div>' +
              saveNotes() +
            '</div>' +
            '<div class="sheet-foot ml-foot">' +
              '<button class="btn big ghost" data-close type="button">취소</button>' +
              '<button class="btn big primary" data-save type="button">저장하기</button>' +
            '</div>' +
          '</div>';
        return;
      }

      /* 메일 파일을 내려받은 뒤 — 창을 말없이 닫지 않고 다음에 할 일을 보여 준다.
         예전에는 누르자마자 창이 닫히고 파일만 조용히 받아져서 '창이 꺼졌다' 고 느꼈다. */
      if (state.done) {
        host.innerHTML =
          '<div class="sheet mail-sheet">' +
            '<div class="sheet-head"><h2 class="sheet-title">메일 파일을 만들었습니다</h2>' +
              '<button class="icon-btn" data-close type="button">✕</button></div>' +
            '<div class="sheet-body">' +
              '<div class="ml-done">' +
                '<b>' + esc(state.done.name || '메일.eml') + '</b>' +
                '<span>첨부 ' + (state.done.attached || 0) + '개' +
                  (state.done.mb ? ' (' + state.done.mb + 'MB)' : '') + ' · 받는 사람 ' + esc(state.to) + '</span>' +
              '</div>' +
              /* 20MB 가 넘어도 파일은 만든다. 다만 받는 쪽 메일 한도에 걸릴 수 있어 미리 알린다. */
              (state.done.big
                ? '<div class="dn-block warn"><b>첨부가 ' + state.done.mb + 'MB로 큽니다</b>' +
                    '<p class="dn-sub">받는 회사의 메일 한도(보통 20~25MB)를 넘으면 반송될 수 있습니다. ' +
                    '아웃룩에서 첨부가 크다고 나오면 OneDrive 링크로 보내기를 고르거나, ' +
                    '견적서처럼 작은 파일만 먼저 보내고 제안서는 따로 보내 주세요.</p></div>'
                : '') +
              '<ol class="ml-steps">' +
                /* 회사 보안 프로그램이 '다운로드' 폴더 저장을 막는다. 업무문서함(X:)에 저장하면
                   아웃룩이 파일을 못 읽는다. 원드라이브 폴더에 저장해야 아웃룩에서 열린다. */
                '<li>저장 창이 뜨면 <b>원드라이브 폴더</b>(OneDrive - KMA한국능률협회)에 저장합니다.</li>' +
                '<li>원드라이브 폴더에서 그 파일을 열면 아웃룩 <b>새 메일 창</b>이 받는 사람·제목·본문·첨부가 채워진 채 뜹니다.<br>' +
                  '<span class="ml-tip">다른 프로그램이 뜨거나 열리지 않으면 파일을 우클릭 → 연결 프로그램 → ' +
                  '<b>Outlook (new)</b> → 항상 이 앱 사용.</span></li>' +
                '<li>한 번 확인하고 <b>보내기</b>를 누릅니다. 저절로 보내지지 않습니다.</li>' +
              '</ol>' +
              saveNotes() +
            '</div>' +
            '<div class="sheet-foot ml-foot">' +
              '<button class="btn big primary" data-close type="button">확인</button>' +
            '</div>' +
          '</div>';
        return;
      }

      host.innerHTML =
        '<div class="sheet wide mail-sheet">' +
          '<div class="sheet-head">' +
            '<h2 class="sheet-title">' + esc(opts.title || '메일 보내기') + '</h2>' +
            '<button class="icon-btn" data-close type="button">✕</button>' +
          '</div>' +

          '<div class="sheet-body">' +
            statusStrip() +

            '<div class="ml-to">' +
              field('받는 사람', 'to', state.to, '담당자 메일 주소 (여러 명이면 ; 로 구분)') +
              field('참조', 'cc', state.cc, '선택') +
            '</div>' +
            field('제목', 'subject', state.subject, '', true) +

            '<div class="pr-field"><label>본문</label>' +
              '<textarea data-f="body" rows="11" class="ml-body">' + esc(state.body) + '</textarea>' +
              '<p class="ff-hint">보내는 사람 이름·연락처는 ' +
                '<button class="link small" data-sender type="button">내 정보</button> 에서 한 번만 넣으면 계속 쓰입니다.</p>' +
            '</div>' +

            '<div class="ml-files">' +
              '<b>첨부</b>' +
              (opts.files || []).map(function (f) {
                return '<label class="ml-file' + (f.internal ? ' internal' : '') + '">' +
                  '<input type="checkbox" data-file="' + esc(f.id) + '"' + (state.picked[f.id] ? ' checked' : '') + '>' +
                  '<span class="mf-body"><b>' + esc(f.name) + '</b>' +
                    '<span>' + esc(f.desc || '') + '</span></span>' +
                  (f.internal ? '<span class="mf-tag">내부용</span>' : '') +
                '</label>';
              }).join('') +
            '</div>' +

            (risky.length
              ? '<div class="warn-box"><b>내부용 문서가 들어 있습니다</b>' +
                '<div>' + esc(risky.map(function (f) { return f.name; }).join(' · ')) +
                ' 에는 원가와 사업이익률이 들어 있습니다. 고객에게 보내는 메일이라면 빼 주세요.</div></div>'
              : '') +
          '</div>' +

          '<div class="sheet-foot ml-foot">' +
            '<button class="btn big ghost" data-close type="button">닫기</button>' +
            '<button class="btn big primary" data-draft type="button">' +
              (state.mode === 'eml' ? '메일 파일 만들기' : '아웃룩에서 열기') + '</button>' +
          '</div>' +
        '</div>';
    }

    function statusStrip() {
      if (state.mode === 'eml') {
        return '<p class="sheet-note">메일 파일(.eml)을 만들어 내려받습니다. ' +
          '<b>원드라이브 폴더에 저장</b>한 뒤 열면 아웃룩 새 메일 창이 첨부까지 채워진 채 뜹니다. 확인하고 보내 주세요.</p>';
      }
      return '<p class="sheet-note">아웃룩 새 메일 창을 첨부까지 채워 띄웁니다. ' +
        '<b>저절로 보내지 않습니다</b> — 확인하고 보내 주세요.</p>';
    }

    function field(label, key, val, ph, wide) {
      return '<div class="pr-field' + (wide ? ' span2' : '') + '"><label>' + esc(label) + '</label>' +
        '<input data-f="' + key + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '"></div>';
    }

    /* 고른 첨부를 실제로 만든다 (개요서·견적서 등은 누를 때 생성된다) */
    function collect() {
      var chosen = (opts.files || []).filter(function (f) { return state.picked[f.id]; });
      return chosen.reduce(function (chain, f) {
        return chain.then(function (acc) {
          return Promise.resolve(f.make()).then(function (blob) {
            /* 고른 첨부가 비어 있으면 조용히 빼지 않고 멈춘다 — 견적서를 골랐는데 PPT 만 붙어 나가면 안 된다 */
            if (!blob || !blob.size) throw new Error((f.name || '첨부') + ' 파일을 만들지 못했습니다. 다시 시도해 주세요.');
            acc.push({ name: f.fileName || f.name, blob: blob });
            return acc;
          });
        });
      }, Promise.resolve([]));
    }

    function go() {
      if (!state.to.trim()) { U.toast('받는 사람을 넣어 주세요', 'err'); return; }
      U.busy(true, state.mode === 'eml' ? '첨부를 만들고 메일 파일로 묶는 중…' : '첨부를 만들고 아웃룩 창을 여는 중…');
      collect().then(function (atts) {
        return M.send({
          to: state.to, cc: state.cc, subject: state.subject, body: state.body,
          attachments: atts
        }, { hold: true });
      }).then(function (res) {
        U.busy(false);
        if (res.mode === 'draft') {
          /* 초안을 만든 사실을 프로젝트에 남긴다 — 워크플로우가 여기서 다음 칸으로 넘어간다 */
          if (opts.onSent) { try { opts.onSent('draft', state.to); } catch (e) {} }
          close();
          U.toast('아웃룩 새 메일 창을 열었습니다' + (res.attached ? ' (첨부 ' + res.attached + '개)' : '') +
            (res.big ? '. 첨부가 ' + res.mb + 'MB로 커서 반송될 수 있습니다' : '. 확인하고 보내 주세요'),
            res.big ? 'warn' : 'ok');
          return;
        }
        /* 바로 저장하지 않는다 — '저장 시 유의사항' 을 먼저 보여 주고 [저장하기] 로 저장한다 */
        state.ready = { blob: res.blob, name: (res.file && res.file.name) || '메일.eml',
                        attached: res.attached, mb: res.mb, big: res.big };
        draw();
      }).catch(function (err) {
        U.busy(false);
        U.toast(err.message || '메일 파일을 만들지 못했습니다', 'err');
      });
    }

    host.addEventListener('input', function (e) {
      var f = e.target.closest('[data-f]');
      if (f) state[f.dataset.f] = f.value;
    });
    host.addEventListener('change', function (e) {
      var c = e.target.closest('[data-file]');
      if (c) { state.picked[c.dataset.file] = c.checked; draw(); }
    });
    /* 바깥을 드래그 끝에 눌린 것으로 닫히지 않게 하는 것은 ui.js 가 모든 창에 대신 건다 */
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target === host) return close();
      if (e.target.closest('[data-sender]')) { editSender(draw); return; }
      if (e.target.closest('[data-draft]')) return go();
      /* 유의사항을 읽고 [저장하기] — 여기서 저장 창이 뜬다(누른 순간이라 브라우저가 막지 않는다) */
      if (e.target.closest('[data-save]') && state.ready) {
        var rd = state.ready;
        g.Files.save(rd.blob, rd.name);
        if (opts.onSent) { try { opts.onSent('draft', state.to); } catch (x) {} }
        state.done = { name: rd.name, attached: rd.attached, mb: rd.mb, big: rd.big };
        state.ready = null;
        draw();
      }
    });

    draw();
    /* 이 PC 에서 아웃룩 창을 띄울 수 있는지 한 번 물어 단추 이름을 맞춘다 */
    if (!state.mode) {
      M.status().then(function (st) {
        if (st && st.mode && !state.done) { state.mode = st.mode; draw(); }
      });
    }
  }

  function editSender(after) {
    var s = M.sender();
    U.form({ title: '보내는 사람', wide: true, fields: [
      { key: 'name', label: '이름', placeholder: '박주열' },
      { key: 'rank', label: '직급', placeholder: '연구원' },
      { key: 'team', label: '소속', span: 2, placeholder: 'KMA 인재개발센터' },
      { key: 'phone', label: '전화', placeholder: '02-3274-0000' },
      { key: 'email', label: '메일', placeholder: 'name@kma.or.kr' },
      { key: 'closing', label: '맺음말', span: 2, placeholder: '감사합니다.' }
    ], values: s }).then(function (d) {
      if (!d) return;
      M.saveSender(Object.assign(s, d));
      if (after) after();
      U.toast('보내는 사람 정보를 저장했습니다', 'ok');
    });
  }

  g.MailViews = { open: open, editSender: editSender };
})(window);
