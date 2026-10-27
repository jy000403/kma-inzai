/* views.js — 외부용 견적서 편집 화면
 *
 * 내부 예산서 옆에서 버튼 하나로 연다. 원가·사업이익은 여기 들어오지 않는다.
 */
(function (g) {
  'use strict';

  var Q = g.QuoteStore, X = g.QuoteExcel, U = g.UI, esc = U.esc;

  function n(v) { return Number(v || 0).toLocaleString('ko-KR'); }

  /* 견적서 화면을 띄운다. save(p) 는 바뀐 내용을 저장할 함수. */
  function open(p, save) {
    Q.ensure(p);

    var host = document.createElement('div');
    host.className = 'sheet-wrap';
    document.body.appendChild(host);
    requestAnimationFrame(function () { host.classList.add('in'); });

    function close() { host.classList.remove('in'); setTimeout(function () { host.remove(); }, 180); }
    function touch() { if (save) save(p); }

    function draw() {
      var q = p.quote, t = Q.total(q), gs = Q.groups(q), gap = Q.gap(p);

      host.innerHTML =
        '<div class="sheet wide quote-sheet">' +
          '<div class="sheet-head">' +
            '<h2 class="sheet-title">외부용 견적서</h2>' +
            '<button class="icon-btn" data-close type="button">✕</button>' +
          '</div>' +

          '<div class="sheet-body">' +
            '<p class="sheet-note">고객에게 나가는 문서입니다. <b>원가·사업이익률은 들어가지 않습니다.</b> ' +
              '항목·단가·수량·차수·견적가와 합계만 나갑니다.</p>' +

            '<div class="qt-head">' +
              fld('수신', 'to', q.to, '㈜클라우드네트웍스') +
              fld('교육명', 'courseName', q.courseName, '2026년 대리과장 승진자 교육', 2) +
              fld('제출일', 'issueDate', q.issueDate, Q.today()) +
            '</div>' +

            '<div class="qt-opts">' +
              '<label class="bg-vat"><input type="checkbox" data-o="taxFree"' + (q.taxFree ? ' checked' : '') +
                '> 부가가치세 면세</label>' +
              '<label class="bg-vat"><input type="checkbox" data-o="roundDown"' + (q.roundDown ? ' checked' : '') +
                '> 합계 천단위 절사</label>' +
              '<button class="btn tiny" data-seed type="button">예산 항목에서 다시 불러오기</button>' +
              '<button class="btn tiny" data-supplier type="button">공급자 정보</button>' +
            '</div>' +

            (gs.length ? gs.map(groupTable).join('') :
              '<p class="pr-empty">예산서에 단가가 들어간 항목이 없습니다. 예산서를 먼저 채우거나 아래에서 직접 넣으세요.</p>') +

            /* 어느 구분에 넣을지 눌러서 고른다.
               전에는 버튼 하나뿐이라 항상 첫 묶음(대개 운영비)으로 들어가 버렸다. */
            '<div class="btn-row qt-add">' + Q.GROUPS.map(function (gname) {
              return '<button class="btn" data-add="' + esc(gname) + '" type="button">+ ' + esc(gname) + ' 항목</button>';
            }).join('') + '</div>' +

            '<div class="qt-total">' +
              '<div class="bg-row"><span>견적 합계' + (q.roundDown && t.cut ? ' (절사 ' + n(t.cut) + '원)' : '') +
                '</span><b>' + n(t.grand) + '원</b></div>' +
              (q.taxFree
                ? '<p class="pr-hint">부가가치세 면세로 나갑니다.</p>'
                : '<div class="bg-row"><span>부가세 10%</span><b>' + n(t.vat) + '원</b></div>' +
                  '<div class="bg-row"><span>총액</span><b>' + n(t.sum) + '원</b></div>') +
              '<p class="qt-hangul">' + esc(Q.koreanMoney(t.grand)) + '</p>' +
            '</div>' +

            (gap.same ? '' :
              '<div class="qt-gap">' +
                '<b>견적 합계가 제안가와 다릅니다</b>' +
                '<span>견적 ' + n(gap.quote) + '원 · 제안가 ' + n(gap.price) + '원 (차이 ' +
                  (gap.diff > 0 ? '+' : '') + n(gap.diff) + '원)</span>' +
                /* 보통은 견적 단가를 제안가에 맞춘다 (원가 → 판매가).
                   줄을 손봐서 합계를 새 제안가로 삼고 싶을 때만 반대로 한다. */
                '<div class="qt-gap-btns">' +
                  '<button class="btn tiny primary" data-fit-price type="button">견적 단가를 제안가에 맞추기</button>' +
                  '<button class="btn tiny ghost" data-sync-price type="button">제안가를 견적 합계로 바꾸기</button>' +
                '</div>' +
              '</div>') +

            '<div class="pr-field"><label>하단 문구 (선택)</label>' +
              '<textarea data-o-text="notes" rows="2" placeholder="예: 본 견적은 제출일로부터 30일간 유효합니다">' +
              esc(q.notes || '') + '</textarea></div>' +
          '</div>' +

          '<div class="sheet-foot">' +
            '<button class="btn big ghost" data-copy type="button">글로 복사</button>' +
            '<button class="btn big primary" data-xlsx type="button">엑셀로 저장 (.xlsx)</button>' +
          '</div>' +
        '</div>';
    }

    function fld(label, key, val, ph, span) {
      return '<div class="pr-field' + (span === 2 ? ' span2' : '') + '"><label>' + esc(label) + '</label>' +
        '<input data-q="' + key + '" value="' + esc(val || '') + '" placeholder="' + esc(ph) + '"></div>';
    }

    function groupTable(gr) {
      return '<section class="qt-group">' +
        '<div class="qt-gname"><input data-g="' + esc(gr.name) + '" value="' + esc(gr.name) + '"></div>' +
        '<table class="qt-table"><thead><tr>' +
          /* '내용' 칸을 새로 냈다 — 양식에서 항목 오른쪽의 가장 넓은 칸인데
             여기에 아무것도 안 들어가서 고객에게 빈 칸으로 나가고 있었다. */
          /* 칸 폭은 '몇 번째 칸' 이 아니라 이름(class)으로 준다.
             '내용' 칸이 끼어들면서 번호가 한 칸씩 밀려, 수량 폭(54px)이 단가에,
             삭제 단추 폭(32px)이 비고에 걸려 200000 이 안 보였다. */
          '<th class="nm">항목</th><th class="dt">내용</th><th class="p">단가</th>' +
          '<th class="q">수량</th><th class="u">단위</th><th class="q">수량</th><th class="u">단위</th>' +
          '<th class="q">차수</th><th class="amt">견적가</th><th class="memo">비고</th><th class="rm"></th>' +
          '</tr></thead><tbody>' +
        gr.lines.map(function (l) {
          return '<tr data-id="' + esc(l.id) + '">' +
            '<td class="nm"><input data-l="name" value="' + esc(l.name) + '" placeholder="항목명"></td>' +
            '<td class="dt"><input data-l="detail" value="' + esc(l.detail || '') + '" placeholder="산출 근거·내용"></td>' +
            '<td class="p"><input data-l="unit" type="number" inputmode="numeric" value="' + (l.unit || '') + '"></td>' +
            '<td class="q"><input data-l="q1" type="number" inputmode="numeric" value="' + (l.q1 || '') + '"></td>' +
            '<td class="u"><input data-l="u1" value="' + esc(l.u1 || '') + '"></td>' +
            '<td class="q"><input data-l="q2" type="number" inputmode="numeric" value="' + (l.q2 || '') + '"></td>' +
            '<td class="u"><input data-l="u2" value="' + esc(l.u2 || '') + '"></td>' +
            '<td class="q"><input data-l="sessions" type="number" inputmode="numeric" value="' + (l.sessions || '') + '"></td>' +
            '<td class="amt">' + n(Q.amount(l)) + '</td>' +
            '<td class="memo"><input data-l="memo" value="' + esc(l.memo || '') + '" placeholder=""></td>' +
            '<td class="rm"><button class="icon-btn tiny" data-rm type="button">✕</button></td>' +
          '</tr>';
        }).join('') +
        '<tr class="sub"><td colspan="8">소계</td><td class="amt">' + n(gr.sub) + '</td><td colspan="2"></td></tr>' +
        '</tbody></table></section>';
    }

    function lineOf(el) {
      var tr = el.closest('tr[data-id]');
      if (!tr) return null;
      var id = tr.dataset.id;
      return (p.quote.lines || []).filter(function (l) { return l.id === id; })[0] || null;
    }

    var timer = null;
    host.addEventListener('input', function (e) {
      var el = e.target;
      clearTimeout(timer);

      var qf = el.closest('[data-q]');
      if (qf) { p.quote[qf.dataset.q] = qf.value; timer = setTimeout(function () { touch(); }, 300); return; }

      var ot = el.closest('[data-o-text]');
      if (ot) { p.quote[ot.dataset.oText] = ot.value; timer = setTimeout(function () { touch(); }, 300); return; }

      var lf = el.closest('[data-l]');
      if (lf) {
        var l = lineOf(lf);
        if (!l) return;
        var k = lf.dataset.l;
        l[k] = (lf.type === 'number') ? (lf.value === '' ? 0 : Number(lf.value)) : lf.value;
        /* 숫자를 손으로 고쳤으면 그 값을 지킨다 — 제안가를 따라 다시 바꾸지 않는다 */
        if (lf.type === 'number') p.quote.follow = false;
        /* 금액 칸만 즉시 고친다 — 표 전체를 다시 그리면 입력하던 칸에서 커서가 빠진다 */
        var tr = lf.closest('tr');
        tr.querySelector('.amt').textContent = n(Q.amount(l));
        timer = setTimeout(function () { touch(); draw(); }, 600);
        return;
      }

      var gf = el.closest('[data-g]');
      if (gf) {
        var from = gf.dataset.g, to = gf.value;
        p.quote.lines.forEach(function (x) { if (x.group === from) x.group = to; });
        gf.dataset.g = to;
        timer = setTimeout(function () { touch(); }, 600);
      }
    });

    host.addEventListener('change', function (e) {
      var o = e.target.closest('[data-o]');
      if (o) { p.quote[o.dataset.o] = o.checked; touch(); draw(); }
    });

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target === host) return close();

      if (e.target.closest('[data-rm]')) {
        var l = lineOf(e.target);
        if (l) { p.quote.lines = p.quote.lines.filter(function (x) { return x !== l; }); p.quote.follow = false; touch(); draw(); }
        return;
      }
      if (e.target.closest('[data-seed]')) {
        U.confirm('예산서 항목으로 다시 채울까요? 여기서 직접 고친 내용은 사라집니다.', { ok: '다시 불러오기' })
          .then(function (yes) { if (!yes) return; Q.seed(p); Q.fixDetails(p); touch(); draw(); });
        return;
      }
      var add = e.target.closest('[data-add]');
      if (add) {
        var gname = add.dataset.add || Q.GROUPS[0];
        /* 교육비는 시간 단위로 값을 매긴다 — 기본 단위를 그렇게 둔다 */
        var teach = (gname === '교육비');
        /* 교육비 줄의 내용은 과정명 — 교육명 칸에 적힌 것을 그대로 */
        var course = teach ? (String(p.quote.courseName || '').trim() || Q.courseLabel(p)) : '';
        p.quote.lines.push({ id: Q.uid(), group: gname,
          name: '', detail: course, unit: 0, q1: teach ? (Number(p.ops && p.ops.hours) || 1) : 1,
          u1: teach ? 'H' : '식', q2: 1, u2: '',
          sessions: Number(p.ops && p.ops.sessions) || 1, su: '차수', memo: '' });
        p.quote.follow = false;
        touch(); draw();
        return;
      }
      if (e.target.closest('[data-fit-price]')) {
        Q.fit(p);
        touch(); draw();
        U.toast('견적 단가를 제안가에 맞췄습니다', 'ok');
        return;
      }
      if (e.target.closest('[data-sync-price]')) {
        p.budget.price = Q.total(p.quote).grand;
        touch(); draw();
        U.toast('제안가를 견적 합계로 맞췄습니다', 'ok');
        return;
      }
      if (e.target.closest('[data-supplier]')) { editSupplier(draw); return; }
      if (e.target.closest('[data-copy]')) {
        navigator.clipboard.writeText(text(p))
          .then(function () { U.toast('견적 내용을 복사했습니다', 'ok'); })
          .catch(function () { U.toast('복사하지 못했습니다', 'err'); });
        return;
      }
      if (e.target.closest('[data-xlsx]')) saveXlsx(p);
    });

    draw();
  }

  function editSupplier(after) {
    var s = Q.supplier();
    U.form({ title: '공급자 정보', wide: true, fields: [
      { key: 'company', label: '법인명', span: 2 },
      { key: 'bizNo', label: '등록번호' },
      { key: 'ceo', label: '대표' },
      { key: 'address', label: '사업장 소재지', span: 2 },
      { key: 'industry', label: '업태' },
      { key: 'item', label: '종목' },
      { key: 'tel', label: '전화번호' },
      { key: 'fax', label: 'FAX' }
    ], values: s }).then(function (d) {
      if (!d) return;
      Q.saveSupplier(Object.assign(s, d));
      if (after) after();
      U.toast('공급자 정보를 저장했습니다', 'ok');
    });
  }

  function saveXlsx(p) {
    U.busy(true, '견적서를 만드는 중…');
    X.build(p).then(function (blob) {
      U.busy(false);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = X.fileName(p);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
      U.toast('견적서를 저장했습니다', 'ok');
    }).catch(function (err) {
      U.busy(false);
      U.toast(err && err.message ? err.message : '견적서를 만들지 못했습니다', 'err');
    });
  }

  function text(p) {
    var q = p.quote, t = Q.total(q);
    var out = ['견적서', ''];
    out.push((q.to || '') + ' 귀중');
    out.push('교육명\t' + (q.courseName || ''));
    out.push('제출일\t' + (q.issueDate || ''));
    out.push('금액\t' + Q.koreanMoney(t.grand) + ' (' + Number(t.grand).toLocaleString('ko-KR') + ')');
    out.push('');
    out.push('묶음\t항목\t내용\t단가\t수량\t단위\t수량\t단위\t차수\t견적가\t비고');
    Q.groups(q).forEach(function (gr) {
      gr.lines.forEach(function (l) {
        out.push([gr.name, l.name, l.detail || '', l.unit, l.q1, l.u1, l.q2, l.u2,
          l.sessions, Q.amount(l), l.memo || ''].join('\t'));
      });
      out.push('소계\t\t\t\t\t\t\t\t\t' + gr.sub);
    });
    out.push('');
    out.push('합계(' + (q.taxFree ? 'vat 면세' : 'vat 별도') + ')\t' + t.grand);
    if (!q.taxFree) { out.push('부가세\t' + t.vat); out.push('총액\t' + t.sum); }
    if (q.notes) { out.push(''); out.push(q.notes); }
    return out.join('\n');
  }

  g.QuoteViews = { open: open, text: text, saveXlsx: saveXlsx, editSupplier: editSupplier };
})(window);
