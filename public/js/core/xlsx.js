/* xlsx.js — 엑셀 파일(.xlsx) 쓰기
 *
 * xlsx 는 XML 몇 장을 zip 으로 묶은 것이다. 라이브러리 없이 직접 쓴다.
 * 필요한 만큼만 지원한다 — 값·수식·병합·열너비·행높이·테두리·채우기·정렬·표시형식.
 *
 * 쓰는 법
 *   Xlsx.build({
 *     sheet: '견적서',
 *     styles: [{ font:{size:26,bold:true}, align:{h:'center',v:'center'} }, ...],
 *     cols:   [{ from:1, to:1, width:2 }, ...],
 *     rows:   { 2: 53.4 },
 *     merges: ['B2:T2'],
 *     cells:  [{ ref:'B2', v:'견적서', s:0 }, { ref:'R13', f:'F13*I13', v:3200000, s:4 }]
 *   })  →  Blob
 */
(function (g) {
  'use strict';

  var FONT = '맑은 고딕';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      /* 제어문자는 xlsx 가 거부한다. 줄바꿈·탭만 남긴다. */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  /* 'B12' → { col: 2, row: 12 } */
  function parseRef(ref) {
    var m = /^([A-Z]+)(\d+)$/.exec(ref);
    var col = 0;
    for (var i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
    return { col: col, row: Number(m[2]) };
  }
  function colName(n) {
    var s = '';
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
    return s;
  }

  /* ── 스타일 ───────────────────────────────────────── */

  var BORDER = { t: 'thin', m: 'medium', h: 'hair', d: 'double' };

  function buildStyles(defs) {
    var numFmts = [], fonts = [], fills = [], borders = [], xfs = [];
    var numKey = {}, fontKey = {}, fillKey = {}, borderKey = {};

    /* 0번은 엑셀이 정한 자리다. 손대지 않는다. */
    fonts.push('<font><sz val="11"/><name val="' + esc(FONT) + '"/><family val="2"/></font>');
    fontKey['11||'] = 0;
    fills.push('<fill><patternFill patternType="none"/></fill>');
    fills.push('<fill><patternFill patternType="gray125"/></fill>');
    borders.push('<border><left/><right/><top/><bottom/><diagonal/></border>');
    borderKey['....'] = 0;

    function fontId(f) {
      f = f || {};
      var size = f.size || 11, name = f.name || FONT;
      var k = size + '|' + (f.bold ? 'b' : '') + '|' + name + '|' + (f.color || '');
      if (fontKey[k] !== undefined) return fontKey[k];
      fonts.push('<font>' + (f.bold ? '<b/>' : '') + '<sz val="' + size + '"/>' +
        (f.color ? '<color rgb="' + esc(f.color) + '"/>' : '') +
        '<name val="' + esc(name) + '"/><family val="2"/></font>');
      return (fontKey[k] = fonts.length - 1);
    }
    function fillId(rgb) {
      if (!rgb) return 0;
      if (fillKey[rgb] !== undefined) return fillKey[rgb];
      fills.push('<fill><patternFill patternType="solid"><fgColor rgb="' + esc(rgb) +
        '"/><bgColor indexed="64"/></patternFill></fill>');
      return (fillKey[rgb] = fills.length - 1);
    }
    /* 테두리는 'MttT' 처럼 좌·우·상·하 네 글자로 받는다 ('.' 은 없음) */
    function borderId(code) {
      if (!code || code === '....') return 0;
      if (borderKey[code] !== undefined) return borderKey[code];
      var side = ['left', 'right', 'top', 'bottom'];
      var xml = '<border>';
      for (var i = 0; i < 4; i++) {
        var st = BORDER[code.charAt(i)];
        xml += st ? '<' + side[i] + ' style="' + st + '"><color indexed="64"/></' + side[i] + '>'
                  : '<' + side[i] + '/>';
      }
      borders.push(xml + '<diagonal/></border>');
      return (borderKey[code] = borders.length - 1);
    }
    function numId(fmt) {
      if (!fmt) return 0;
      if (numKey[fmt] !== undefined) return numKey[fmt];
      var id = 164 + numFmts.length;
      numFmts.push('<numFmt numFmtId="' + id + '" formatCode="' + esc(fmt) + '"/>');
      return (numKey[fmt] = id);
    }

    xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
    (defs || []).forEach(function (d) {
      d = d || {};
      var a = d.align || {};
      var hasAlign = !!(a.h || a.v || a.wrap);
      var nf = numId(d.fmt), fo = fontId(d.font), fi = fillId(d.fill), bo = borderId(d.border);
      xfs.push('<xf numFmtId="' + nf + '" fontId="' + fo + '" fillId="' + fi + '" borderId="' + bo + '" xfId="0"' +
        ' applyFont="1"' + (nf ? ' applyNumberFormat="1"' : '') + (fi ? ' applyFill="1"' : '') +
        (bo ? ' applyBorder="1"' : '') + (hasAlign ? ' applyAlignment="1"' : '') + '>' +
        (hasAlign ? '<alignment' + (a.h ? ' horizontal="' + a.h + '"' : '') +
          (a.v ? ' vertical="' + a.v + '"' : '') + (a.wrap ? ' wrapText="1"' : '') + '/>' : '') +
        '</xf>');
    });

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts>' : '') +
      '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
      '<fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
      '<borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  /* ── 시트 ─────────────────────────────────────────── */

  function buildSheet(o) {
    var byRow = {}, maxCol = 1, maxRow = 1;
    (o.cells || []).forEach(function (c) {
      var p = parseRef(c.ref);
      (byRow[p.row] || (byRow[p.row] = [])).push({ c: c, col: p.col });
      if (p.col > maxCol) maxCol = p.col;
      if (p.row > maxRow) maxRow = p.row;
    });

    /* 병합된 칸도 테두리를 가지려면 빈 셀이라도 존재해야 한다 */
    (o.blanks || []).forEach(function (b) {
      var p = parseRef(b.ref);
      (byRow[p.row] || (byRow[p.row] = [])).push({ c: { ref: b.ref, s: b.s }, col: p.col });
      if (p.col > maxCol) maxCol = p.col;
      if (p.row > maxRow) maxRow = p.row;
    });

    var rowNums = Object.keys(byRow).map(Number).sort(function (a, b) { return a - b; });
    var heights = o.rows || {};

    var data = rowNums.map(function (r) {
      var cells = byRow[r].sort(function (a, b) { return a.col - b.col; }).map(function (x) {
        var c = x.c;
        var s = (c.s === undefined || c.s === null) ? '' : ' s="' + (c.s + 1) + '"';
        if (c.f !== undefined && c.f !== null) {
          return '<c r="' + c.ref + '"' + s + '><f>' + esc(c.f) + '</f>' +
            (typeof c.v === 'number' ? '<v>' + c.v + '</v>' : '') + '</c>';
        }
        if (c.v === undefined || c.v === null || c.v === '') return '<c r="' + c.ref + '"' + s + '/>';
        if (typeof c.v === 'number') return '<c r="' + c.ref + '"' + s + '><v>' + c.v + '</v></c>';
        return '<c r="' + c.ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(c.v) + '</t></is></c>';
      }).join('');
      var h = heights[r];
      return '<row r="' + r + '"' + (h ? ' ht="' + h + '" customHeight="1"' : '') + '>' + cells + '</row>';
    }).join('');

    var cols = (o.cols || []).map(function (c) {
      return '<col min="' + c.from + '" max="' + c.to + '" width="' + c.width + '" customWidth="1"/>';
    }).join('');

    var merges = (o.merges || []);

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      '<dimension ref="A1:' + colName(maxCol) + maxRow + '"/>' +
      '<sheetViews><sheetView showGridLines="' + (o.gridlines === false ? '0' : '1') +
        '" tabSelected="1" workbookViewId="0"/></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (cols ? '<cols>' + cols + '</cols>' : '') +
      '<sheetData>' + data + '</sheetData>' +
      (merges.length ? '<mergeCells count="' + merges.length + '">' +
        merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') +
      '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  var RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var DOC_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function build(o) {
    var name = (o.sheet || 'Sheet1').replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31);

    var files = [
      { name: '[Content_Types].xml', text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>' },
      { name: '_rels/.rels', text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + RELS_NS + '">' +
        '<Relationship Id="rId1" Type="' + DOC_NS + '/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { name: 'xl/workbook.xml', text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + DOC_NS + '">' +
        '<sheets><sheet name="' + esc(name) + '" sheetId="1" r:id="rId1"/></sheets>' +
        '<calcPr calcId="0" fullCalcOnLoad="1"/>' +
        '</workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + RELS_NS + '">' +
        '<Relationship Id="rId1" Type="' + DOC_NS + '/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="' + DOC_NS + '/styles" Target="styles.xml"/>' +
        '</Relationships>' },
      { name: 'xl/styles.xml', text: buildStyles(o.styles) },
      { name: 'xl/worksheets/sheet1.xml', text: buildSheet(o) }
    ];

    return g.Zip.write(files.map(function (f) {
      return { name: f.name, blob: new Blob([f.text], { type: 'application/xml' }) };
    })).then(function (res) {
      return new Blob([res.blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    });
  }

  g.Xlsx = { build: build, colName: colName, parseRef: parseRef, FONT: FONT };
})(window);
