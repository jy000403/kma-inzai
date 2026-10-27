/* office.js — 커리큘럼 파일에서 글자를 뽑아낸다
 *
 * 무엇이 되고 무엇이 안 되는지 먼저 적어 둔다.
 *   PPTX / DOCX / XLSX  →  잘 된다. 이 파일들은 사실 ZIP 안에 XML 이 들어 있는 구조다.
 *   PDF                 →  글자로 만들어진 PDF 면 대체로 된다. 스캔본(그림 PDF)은 안 된다.
 *   PNG / JPG           →  글자를 읽을 수 없다. 브라우저 안에서 OCR 을 돌릴 방법이 없다.
 *                          대신 화면 옆에 띄워 두고 보면서 입력하도록 한다.
 *
 * 외부 라이브러리를 쓰지 않는다. 파일이 이 PC 밖으로 나가지 않아야 하기 때문이다.
 */
(function (g) {
  'use strict';

  var dec = new TextDecoder('utf-8');

  /* ── ZIP 읽기 ─────────────────────────────────────── */

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('이 브라우저에서는 압축을 풀 수 없습니다. Chrome 또는 Edge 를 쓰세요.'));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  function readZip(file) {
    var tail = Math.min(file.size, 128 * 1024);
    return file.slice(file.size - tail).arrayBuffer().then(function (ab) {
      var v = new DataView(ab), pos = -1;
      for (var p = ab.byteLength - 22; p >= 0; p--) {
        if (v.getUint32(p, true) === 0x06054b50) { pos = p; break; }
      }
      if (pos < 0) throw new Error('ZIP 형식이 아닙니다');
      var count = v.getUint16(pos + 10, true);
      var cdSize = v.getUint32(pos + 12, true);
      var cdStart = v.getUint32(pos + 16, true);

      return file.slice(cdStart, cdStart + cdSize).arrayBuffer().then(function (cd) {
        var cv = new DataView(cd), off = 0, map = {};
        for (var i = 0; i < count && off + 46 <= cd.byteLength; i++) {
          if (cv.getUint32(off, true) !== 0x02014b50) break;
          var method = cv.getUint16(off + 10, true);
          var csize = cv.getUint32(off + 20, true);
          var size = cv.getUint32(off + 24, true);
          var nameLen = cv.getUint16(off + 28, true);
          var extraLen = cv.getUint16(off + 30, true);
          var cmtLen = cv.getUint16(off + 32, true);
          var local = cv.getUint32(off + 42, true);
          var name = dec.decode(new Uint8Array(cd, off + 46, nameLen));
          map[name] = { method: method, csize: csize, size: size, local: local };
          off += 46 + nameLen + extraLen + cmtLen;
        }

        function read(name) {
          var e = map[name];
          if (!e) return Promise.resolve(null);
          /* 로컬 헤더 길이는 가변이라 헤더를 먼저 읽어 실제 데이터 시작 위치를 구한다 */
          return file.slice(e.local, e.local + 30).arrayBuffer().then(function (h) {
            var hv = new DataView(h);
            var start = e.local + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
            return file.slice(start, start + e.csize).arrayBuffer().then(function (d) {
              var bytes = new Uint8Array(d);
              return e.method === 0 ? bytes : inflateRaw(bytes);
            });
          });
        }
        function text(name) {
          return read(name).then(function (b) { return b ? dec.decode(b) : null; });
        }
        return { names: Object.keys(map), read: read, text: text };
      });
    });
  }

  /* ── XML 도우미 ───────────────────────────────────── */

  function unesc(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); })
            .replace(/&amp;/g, '&');
  }
  function tagTexts(xml, tag) {
    var re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'g');
    var out = [], m;
    while ((m = re.exec(xml)) !== null) out.push(unesc(m[1]));
    return out;
  }
  /* 문단 단위로 묶어 줄바꿈을 살린다 */
  function paragraphs(xml, pTag, tTag) {
    var re = new RegExp('<' + pTag + '\\b[^>]*>([\\s\\S]*?)</' + pTag + '>', 'g');
    var out = [], m;
    while ((m = re.exec(xml)) !== null) {
      var line = tagTexts(m[1], tTag).join('').trim();
      if (line) out.push(line);
    }
    return out;
  }

  /* ── 표 ───────────────────────────────────────────── */
  /* 커리큘럼은 대개 표로 온다. 줄로 납작하게 만들면 열이 사라져
     제안서 슬라이드에 표로 다시 옮길 수가 없다. 행·열을 그대로 살려 둔다. */

  /* 워드(w:tbl)·파워포인트(a:tbl)가 같은 구조라 태그 이름만 바꿔 쓴다 */
  function readTables(xml, tbl, tr, tc, pTag, tTag) {
    var out = [];
    var tRe = new RegExp('<' + tbl + '\\b[^>]*>([\\s\\S]*?)</' + tbl + '>', 'g'), tm;
    while ((tm = tRe.exec(xml)) !== null) {
      var rows = [];
      var rRe = new RegExp('<' + tr + '\\b[^>]*>([\\s\\S]*?)</' + tr + '>', 'g'), rm;
      while ((rm = rRe.exec(tm[1])) !== null) {
        var cells = [];
        var cRe = new RegExp('<' + tc + '\\b[^>]*>([\\s\\S]*?)</' + tc + '>', 'g'), cm;
        while ((cm = cRe.exec(rm[1])) !== null) {
          cells.push(paragraphs(cm[1], pTag, tTag).join(' ').trim());
        }
        if (cells.length) rows.push(cells);
      }
      if (rows.length) out.push(normalizeTable(rows));
    }
    return out;
  }

  /* 열 수가 행마다 다르면(병합 셀 때문에) 가장 넓은 행에 맞춰 뒤를 빈 칸으로 채운다.
     전부 빈 열은 통째로 버린다 — 원본에 있던 여백 열이 그대로 따라오면 표가 지저분해진다. */
  function normalizeTable(rows) {
    var w = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
    var grid = rows.map(function (r) {
      var out = r.slice();
      while (out.length < w) out.push('');
      return out;
    });
    var keep = [];
    for (var c = 0; c < w; c++) {
      var any = grid.some(function (r) { return r[c] !== ''; });
      if (any) keep.push(c);
    }
    return grid.map(function (r) {
      return keep.map(function (c) { return r[c]; });
    }).filter(function (r) {
      return r.some(function (v) { return v !== ''; });
    });
  }

  /* csv 한 줄을 칸으로 나눈다. "a,b" 처럼 따옴표 안에 든 쉼표는 그대로 둔다. */
  function csvRow(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  /* 표 하나를 줄 목록으로도 남긴다 — 기존 화면과 과목 추출이 그대로 돌아가게 */
  function tableLines(tables) {
    var out = [];
    tables.forEach(function (rows) {
      rows.forEach(function (r) {
        var line = r.filter(Boolean).join('  ').trim();
        if (line) out.push(line);
      });
    });
    return out;
  }

  /* ── PPTX ─────────────────────────────────────────── */

  function readPptx(file) {
    return readZip(file).then(function (z) {
      var slides = z.names.filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
        .sort(function (a, b) {
          return parseInt(/slide(\d+)/.exec(a)[1], 10) - parseInt(/slide(\d+)/.exec(b)[1], 10);
        });
      if (!slides.length) throw new Error('슬라이드를 찾지 못했습니다');

      return slides.reduce(function (chain, name, idx) {
        return chain.then(function (acc) {
          return z.text(name).then(function (xml) {
            if (!xml) return acc;
            var lines = paragraphs(xml, 'a:p', 'a:t');
            /* 제목 자리표시자가 있으면 그걸 슬라이드 제목으로 본다 */
            var title = '';
            var sp = /<p:sp>[\s\S]*?<\/p:sp>/g, m;
            while ((m = sp.exec(xml)) !== null) {
              if (/<p:ph[^>]*type="(ctrTitle|title)"/.test(m[0])) {
                title = paragraphs(m[0], 'a:p', 'a:t').join(' ').trim();
                break;
              }
            }
            if (!title) title = lines[0] || ('슬라이드 ' + (idx + 1));
            acc.push({
              no: idx + 1, title: title, lines: lines,
              tables: readTables(xml, 'a:tbl', 'a:tr', 'a:tc', 'a:p', 'a:t')
            });
            return acc;
          });
        });
      }, Promise.resolve([])).then(function (slideList) {
        var tables = [];
        slideList.forEach(function (s) { (s.tables || []).forEach(function (t) { tables.push(t); }); });
        return { kind: 'pptx', slides: slideList, lines: flatten(slideList), tables: tables };
      });
    });
  }

  function flatten(slideList) {
    var out = [];
    slideList.forEach(function (s) {
      s.lines.forEach(function (l) { if (out[out.length - 1] !== l) out.push(l); });
    });
    return out;
  }

  /* ── DOCX ─────────────────────────────────────────── */

  function readDocx(file) {
    return readZip(file).then(function (z) {
      return z.text('word/document.xml').then(function (xml) {
        if (!xml) throw new Error('문서 본문을 찾지 못했습니다');
        var tables = readTables(xml, 'w:tbl', 'w:tr', 'w:tc', 'w:p', 'w:t');
        /* 표 안의 문단도 w:p 라서 paragraphs 로 훑으면 본문과 표가 섞인다.
           표를 먼저 도려내고 남은 것을 본문 줄로 본다. */
        var body = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, '');
        var lines = paragraphs(body, 'w:p', 'w:t').concat(tableLines(tables));
        return { kind: 'docx', slides: [], lines: lines, tables: tables };
      });
    });
  }

  /* ── XLSX ─────────────────────────────────────────── */

  /* "A" → 0, "C" → 2, "AA" → 26 */
  function colIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }

  function readXlsx(file) {
    return readZip(file).then(function (z) {
      return z.text('xl/sharedStrings.xml').then(function (ss) {
        var shared = ss ? tagTexts(ss, 't') : [];
        var sheet = z.names.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort()[0];
        if (!sheet) throw new Error('시트를 찾지 못했습니다');
        return z.text(sheet).then(function (xml) {
          var rows = [];
          var rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g, rm;
          while ((rm = rowRe.exec(xml)) !== null) {
            var cells = [];
            var cRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g, cm;
            while ((cm = cRe.exec(rm[1])) !== null) {
              var isShared = /t="s"/.test(cm[1]);
              var v = (tagTexts(cm[2], 'v')[0] || '').trim();
              var inline = tagTexts(cm[2], 't')[0];
              var val = inline !== undefined ? inline : (isShared ? (shared[+v] || '') : v);
              /* 빈 셀을 건너뛰면 열이 밀린다. 셀 주소(A1·C5)의 열 자리에 그대로 넣는다. */
              var ref = /r="([A-Z]+)\d+"/.exec(cm[1]);
              var at = ref ? colIndex(ref[1]) : cells.length;
              while (cells.length < at) cells.push('');
              cells[at] = val;
            }
            if (cells.length) rows.push(cells);
          }
          if (!rows.length) return { kind: 'xlsx', slides: [], lines: [], tables: [] };
          var tables = [normalizeTable(rows)];
          return { kind: 'xlsx', slides: [], lines: tableLines(tables), tables: tables };
        });
      });
    });
  }

  /* ── PDF ──────────────────────────────────────────── */
  /* 글자로 만들어진 PDF 만 읽힌다. 한글은 ToUnicode 표가 있어야 제대로 나온다. */

  function readPdf(file) {
    return file.arrayBuffer().then(function (ab) {
      var bytes = new Uint8Array(ab);
      var latin = new TextDecoder('latin1').decode(bytes);

      /* 1) 압축된 스트림을 모두 풀어 하나로 잇는다 */
      var jobs = [];
      var re = /stream\r?\n/g, m;
      while ((m = re.exec(latin)) !== null) {
        var start = m.index + m[0].length;
        var end = latin.indexOf('endstream', start);
        if (end < 0) continue;
        var head = latin.slice(Math.max(0, m.index - 400), m.index);
        var slice = bytes.subarray(start, end);
        if (/FlateDecode/.test(head)) {
          jobs.push(inflateZlib(slice).catch(function () { return null; }));
        } else if (/\/Type\s*\/Font|ToUnicode/.test(head)) {
          jobs.push(Promise.resolve(slice));
        }
        re.lastIndex = end;
      }

      return Promise.all(jobs).then(function (parts) {
        var dl = new TextDecoder('latin1');
        var all = parts.filter(Boolean).map(function (p) { return dl.decode(p); }).join('\n');
        var cmap = buildCMap(all);
        var lines = extractPdfText(all, cmap);
        var ok = quality(lines);
        /* PDF 는 글자 위치만 있고 칸 경계가 없어서 표를 되살릴 수 없다 */
        return { kind: 'pdf', slides: [], lines: lines, tables: [], lowConfidence: !ok };
      });
    });
  }

  function inflateZlib(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  /* ToUnicode CMap — 코드 → 실제 글자 */
  function buildCMap(all) {
    var map = {};
    var bf = /beginbfchar([\s\S]*?)endbfchar/g, m;
    while ((m = bf.exec(all)) !== null) {
      var pair = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g, p;
      while ((p = pair.exec(m[1])) !== null) map[parseInt(p[1], 16)] = hexToStr(p[2]);
    }
    var br = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = br.exec(all)) !== null) {
      var rng = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g, r;
      while ((r = rng.exec(m[1])) !== null) {
        var lo = parseInt(r[1], 16), hi = parseInt(r[2], 16), dst = parseInt(r[3], 16);
        if (hi - lo > 65535) continue;
        for (var c = lo; c <= hi; c++) map[c] = String.fromCharCode(dst + (c - lo));
      }
    }
    return map;
  }
  function hexToStr(h) {
    var s = '';
    for (var i = 0; i + 3 < h.length + 1; i += 4) s += String.fromCharCode(parseInt(h.substr(i, 4), 16));
    return s;
  }

  function extractPdfText(all, cmap) {
    var lines = [], cur = [];
    var bt = /BT([\s\S]*?)ET/g, m;
    var hasMap = Object.keys(cmap).length > 0;

    while ((m = bt.exec(all)) !== null) {
      var body = m[1];
      var op = /(?:\(((?:\\.|[^\\()])*)\)|<([0-9A-Fa-f\s]+)>)\s*(Tj|TJ|'|")|T\*|Td|TD/g, o;
      while ((o = op.exec(body)) !== null) {
        if (!o[3]) { if (cur.length) { lines.push(cur.join('').trim()); cur = []; } continue; }
        var txt = '';
        if (o[1] !== undefined) {
          txt = o[1].replace(/\\([nrt()\\])/g, function (_, c) {
            return { n: '\n', r: '', t: '\t', '(': '(', ')': ')', '\\': '\\' }[c];
          });
        } else if (o[2] !== undefined) {
          var hex = o[2].replace(/\s+/g, '');
          for (var i = 0; i + 1 < hex.length; i += 2) {
            var code = parseInt(hex.substr(i, 4).length === 4 ? hex.substr(i, 4) : hex.substr(i, 2), 16);
            if (hasMap && cmap[code] !== undefined) { txt += cmap[code]; i += 2; }
            else txt += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
          }
        }
        if (txt) cur.push(txt);
      }
      if (cur.length) { lines.push(cur.join('').trim()); cur = []; }
    }
    return lines.filter(Boolean);
  }

  /* 뽑은 글자가 쓸만한지 대충 본다 — 깨진 글자가 많으면 실패로 본다 */
  function quality(lines) {
    var s = lines.join('');
    if (s.length < 10) return false;
    var good = (s.match(/[가-힣a-zA-Z0-9\s:·\-~()[\]]/g) || []).length;
    return good / s.length > 0.7;
  }

  /* ── 진입점 ───────────────────────────────────────── */

  function extOf(name) { return ((/\.([a-z0-9]+)$/i.exec(name || '') || [])[1] || '').toLowerCase(); }

  function read(file) {
    var ext = extOf(file.name);
    if (ext === 'pptx') return readPptx(file);
    if (ext === 'docx') return readDocx(file);
    if (ext === 'xlsx' || ext === 'xlsm') return readXlsx(file);
    if (ext === 'pdf') return readPdf(file);
    if (/^(png|jpg|jpeg|webp|gif)$/.test(ext)) {
      return Promise.resolve({ kind: 'image', slides: [], lines: [], tables: [], imageOnly: true });
    }
    if (ext === 'ppt' || ext === 'doc' || ext === 'xls') {
      return Promise.reject(new Error('옛 형식(' + ext + ')은 읽을 수 없습니다. ' + ext + 'x 로 다시 저장해 주세요.'));
    }
    if (ext === 'txt' || ext === 'md' || ext === 'csv') {
      return file.text().then(function (t) {
        var raw = t.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        /* csv 는 칸이 살아 있으니 표로 읽는다. 따옴표로 묶인 쉼표는 자르지 않는다. */
        if (ext === 'csv') {
          var tables = [normalizeTable(raw.map(csvRow))];
          return { kind: 'text', slides: [], lines: tableLines(tables), tables: tables };
        }
        return { kind: 'text', slides: [], lines: raw, tables: [] };
      });
    }
    return Promise.reject(new Error('읽을 수 없는 형식입니다: ' + (ext || '알 수 없음')));
  }

  /* ── 커리큘럼 → 모듈 후보 ─────────────────────────── */
  /* 커리큘럼 파일은 대개 "09:00-10:30 오리엔테이션 (1.5H)" 같은 줄이다. */

  var TIME = /(\d{1,2})\s*[:：]\s*(\d{2})\s*[~\-–—]\s*(\d{1,2})\s*[:：]\s*(\d{2})/;
  var HOURS = /\(?\s*(\d+(?:\.\d+)?)\s*(?:시간|H|h|hr)\s*\)?/;
  var DAY = /^\s*(\d+)\s*일\s*차|^\s*Day\s*(\d+)/i;
  var NOISE = /^(목차|커리큘럼|과정\s*개요|일정표?|시간표?|구분|내용|비고|강사|교수|교수명|페이지|\d+)$/;

  function toModules(lines) {
    var out = [], day = '';
    lines.forEach(function (raw) {
      var line = String(raw).replace(/\s+/g, ' ').trim();
      if (!line || line.length > 120 || NOISE.test(line)) return;

      var d = DAY.exec(line);
      if (d) { day = (d[1] || d[2]) + '일차'; return; }

      var t = TIME.exec(line);
      var h = HOURS.exec(line);
      var title = line;
      var hours = null;

      if (t) {
        var mins = (Number(t[3]) * 60 + Number(t[4])) - (Number(t[1]) * 60 + Number(t[2]));
        if (mins > 0) hours = Math.round(mins / 6) / 10;
        title = line.replace(t[0], ' ').trim();
      }
      if (h) {
        if (hours === null) hours = Number(h[1]);
        title = title.replace(h[0], ' ').trim();
      }
      title = title.replace(/^[\-·••\s|]+/, '').replace(/[\s|]+$/, '').trim();
      if (!title || title.length < 2) return;

      /* 시간 정보가 있는 줄을 커리큘럼 항목으로 본다. 없으면 제목 후보로만 남긴다. */
      out.push({ title: title, hours: hours, detail: day, strong: !!(t || h) });
    });

    /* 시간이 붙은 줄이 둘 이상이면 그것만 과목으로 본다 — 이게 제대로 읽힌 경우다.
       하나도 없으면 문서의 모든 줄이 후보로 남는다. 그 줄들은 과목이라고 단정할 수
       없으므로 strong: false 인 채로 넘긴다. 부르는 쪽에서 체크를 꺼 둔다. */
    var strong = out.filter(function (m) { return m.strong; });
    if (strong.length >= 2) return strong;
    return out.map(function (m) { m.strong = false; return m; });
  }

  g.Office = { read: read, toModules: toModules, readZip: readZip };
})(window);
