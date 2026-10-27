/* pptx.js — 파워포인트 파일(.pptx) 쓰기
 *
 * pptx 도 xlsx 처럼 XML 여러 장을 zip 으로 묶은 것이다. 라이브러리 없이 직접 쓴다.
 * 슬라이드마다 제목 하나와 불렛 여러 개 — 개요서를 옮기는 데 필요한 만큼만 지원한다.
 *
 * 쓰는 법
 *   Pptx.build({
 *     title: '...', company: '...',
 *     slides: [{ kind:'cover', title, lines:[] }, { title, bullets:[] }]
 *   })  →  Promise<Blob>
 *
 * 만들어진 파일은 파워포인트에서 그대로 열리고, 글자도 도형도 손으로 고칠 수 있다.
 * 회사 디자인 양식을 입히려면 [디자인] → [테마]에서 고르면 된다.
 */
(function (g) {
  'use strict';

  var FONT = '맑은 고딕';
  var W = 12192000, H = 6858000;          /* 16:9 */
  var MARGIN = 838200;
  var BODY_W = W - MARGIN * 2;

  var INK = '191F28', INK3 = '6B7684', BLUE = '1B64DA';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  var NS_P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
             ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
             ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  /* ── 조각 ─────────────────────────────────────────── */

  function rPr(o) {
    o = o || {};
    return '<a:rPr lang="ko-KR" altLang="en-US" sz="' + (o.sz || 1600) + '"' +
      (o.b ? ' b="1"' : '') + ' dirty="0">' +
      '<a:solidFill><a:srgbClr val="' + (o.color || INK) + '"/></a:solidFill>' +
      '<a:latin typeface="' + esc(FONT) + '"/><a:ea typeface="' + esc(FONT) + '"/>' +
      '<a:cs typeface="' + esc(FONT) + '"/></a:rPr>';
  }

  function para(text, o) {
    o = o || {};
    var pPr = '<a:pPr' + (o.marL !== undefined ? ' marL="' + o.marL + '" indent="' + (o.indent || 0) + '"' : '') +
      ' algn="' + (o.algn || 'l') + '">' +
      (o.space ? '<a:lnSpc><a:spcPct val="' + o.space + '"/></a:lnSpc>' : '') +
      (o.before ? '<a:spcBef><a:spcPts val="' + o.before + '"/></a:spcBef>' : '') +
      (o.bullet ? '<a:buFont typeface="Arial"/><a:buChar char="' + esc(o.bullet) + '"/>' : '<a:buNone/>') +
      '</a:pPr>';
    if (text === '') return '<a:p>' + pPr + '<a:endParaRPr lang="ko-KR"/></a:p>';
    return '<a:p>' + pPr + '<a:r>' + rPr(o) + '<a:t>' + esc(text) + '</a:t></a:r></a:p>';
  }

  function textBox(id, name, x, y, cx, cy, paras, anchor) {
    return '<p:sp>' +
      '<p:nvSpPr><p:cNvPr id="' + id + '" name="' + esc(name) + '"/>' +
        '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
      '<p:txBody>' +
        '<a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="' + (anchor || 't') + '">' +
          '<a:normAutofit/></a:bodyPr><a:lstStyle/>' +
        paras +
      '</p:txBody></p:sp>';
  }

  function rect(id, x, y, cx, cy, color) {
    return '<p:sp>' +
      '<p:nvSpPr><p:cNvPr id="' + id + '" name="선"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
        '<a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>' +
      '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ko-KR"/></a:p></p:txBody></p:sp>';
  }

  var EMPTY_TREE =
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
      '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

  /* ── 슬라이드 ─────────────────────────────────────── */

  function coverSlide(s) {
    var lines = (s.lines || []).filter(Boolean);
    var body = lines.map(function (t, i) {
      return para(t, { sz: i === 0 ? 1800 : 1400, color: i === 0 ? INK : INK3, before: 400 });
    }).join('');
    return slideXml(
      rect(2, MARGIN, 2170000, 1600000, 68580, BLUE) +
      textBox(3, '표지 제목', MARGIN, 2450000, BODY_W, 1500000,
        para(s.title || '', { sz: 4000, b: true, space: 110000 })) +
      textBox(4, '표지 설명', MARGIN, 4150000, BODY_W, 1700000, body)
    );
  }

  function contentSlide(s) {
    var bullets = (s.bullets || []);
    /* 줄이 많으면 글자를 줄여 한 장에 담는다 */
    var sz = bullets.length > 14 ? 1200 : bullets.length > 9 ? 1400 : 1600;
    var body = bullets.length
      ? bullets.map(function (t) {
          return para(t, { sz: sz, marL: 285750, indent: -285750, bullet: '•',
                           before: 500, space: 115000 });
        }).join('')
      : para('', {});
    return slideXml(
      textBox(2, '제목', MARGIN, 548640, BODY_W, 700000,
        para(s.title || '', { sz: 2800, b: true })) +
      rect(3, MARGIN, 1390650, 685800, 45720, BLUE) +
      textBox(4, '본문', MARGIN, 1700000, BODY_W, H - 1700000 - 640080, body) +
      (s.note
        ? textBox(5, '메모', MARGIN, H - 590550, BODY_W, 350000,
            para(s.note, { sz: 1100, color: INK3 }))
        : '')
    );
  }

  function slideXml(shapes) {
    return XML +
      '<p:sld ' + NS_P + '><p:cSld><p:spTree>' + EMPTY_TREE + shapes +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  /* ── 뼈대 부품 ────────────────────────────────────── */

  function theme() {
    var scheme = [
      ['dk1', 'sysClr', 'windowText" lastClr="000000'],
      ['lt1', 'sysClr', 'window" lastClr="FFFFFF'],
      ['dk2', 'srgbClr', '191F28'], ['lt2', 'srgbClr', 'F4F6F8'],
      ['accent1', 'srgbClr', BLUE], ['accent2', 'srgbClr', '0F9B55'],
      ['accent3', 'srgbClr', 'B57500'], ['accent4', 'srgbClr', 'E5384A'],
      ['accent5', 'srgbClr', '7C4DD8'], ['accent6', 'srgbClr', '6B7684'],
      ['hlink', 'srgbClr', BLUE], ['folHlink', 'srgbClr', '7C4DD8']
    ].map(function (c) {
      return '<a:' + c[0] + '><a:' + c[1] + ' val="' + c[2] + '"/></a:' + c[0] + '>';
    }).join('');

    var fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    var fills = fill + fill + fill;
    var ln = '<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">' + fill +
      '<a:prstDash val="solid"/></a:ln>';
    var lns = ln + ln + ln;
    var eff = '<a:effectStyle><a:effectLst/></a:effectStyle>';

    return XML +
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="KMA">' +
      '<a:themeElements>' +
        '<a:clrScheme name="KMA">' + scheme + '</a:clrScheme>' +
        '<a:fontScheme name="KMA">' +
          '<a:majorFont><a:latin typeface="' + esc(FONT) + '"/><a:ea typeface="' + esc(FONT) + '"/><a:cs typeface=""/></a:majorFont>' +
          '<a:minorFont><a:latin typeface="' + esc(FONT) + '"/><a:ea typeface="' + esc(FONT) + '"/><a:cs typeface=""/></a:minorFont>' +
        '</a:fontScheme>' +
        '<a:fmtScheme name="KMA">' +
          '<a:fillStyleLst>' + fills + '</a:fillStyleLst>' +
          '<a:lnStyleLst>' + lns + '</a:lnStyleLst>' +
          '<a:effectStyleLst>' + eff + eff + eff + '</a:effectStyleLst>' +
          '<a:bgFillStyleLst>' + fills + '</a:bgFillStyleLst>' +
        '</a:fmtScheme>' +
      '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
  }

  function master() {
    return XML +
      '<p:sldMaster ' + NS_P + '>' +
      '<p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill>' +
        '<a:effectLst/></p:bgPr></p:bg><p:spTree>' + EMPTY_TREE + '</p:spTree></p:cSld>' +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"' +
        ' accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6"' +
        ' hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>' +
      '</p:sldMaster>';
  }

  function layout() {
    return XML +
      '<p:sldLayout ' + NS_P + ' type="blank" preserve="1">' +
      '<p:cSld name="빈 화면"><p:spTree>' + EMPTY_TREE + '</p:spTree></p:cSld>' +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  }

  function presentation(count) {
    var ids = '';
    for (var i = 0; i < count; i++) {
      ids += '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>';
    }
    return XML +
      '<p:presentation ' + NS_P + ' saveSubsetFonts="1">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' + ids + '</p:sldIdLst>' +
      '<p:sldSz cx="' + W + '" cy="' + H + '"/>' +
      '<p:notesSz cx="6858000" cy="9144000"/>' +
      '<p:defaultTextStyle/></p:presentation>';
  }

  function rels(list) {
    return XML + '<Relationships xmlns="' + REL_NS + '">' +
      list.map(function (r) {
        return '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + r.target + '"/>';
      }).join('') + '</Relationships>';
  }

  /* ── 진입점 ───────────────────────────────────────── */

  function build(o) {
    var slides = o.slides || [];
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    var types = XML +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      slides.map(function (s, i) {
        return '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ' +
          'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
      }).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';

    var presRels = [{ id: 'rId1', type: DOC + '/slideMaster', target: 'slideMasters/slideMaster1.xml' }];
    slides.forEach(function (s, i) {
      presRels.push({ id: 'rId' + (i + 2), type: DOC + '/slide', target: 'slides/slide' + (i + 1) + '.xml' });
    });
    presRels.push({ id: 'rId' + (slides.length + 2), type: DOC + '/theme', target: 'theme/theme1.xml' });

    var files = [
      { name: '[Content_Types].xml', text: types },
      { name: '_rels/.rels', text: rels([
          { id: 'rId1', type: DOC + '/officeDocument', target: 'ppt/presentation.xml' },
          { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
          { id: 'rId3', type: DOC + '/extended-properties', target: 'docProps/app.xml' }
        ]) },
      { name: 'docProps/core.xml', text: XML +
          '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
          ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"' +
          ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
          '<dc:title>' + esc(o.title || '') + '</dc:title>' +
          '<dc:creator>' + esc(o.company || 'KMA') + '</dc:creator>' +
          '<cp:lastModifiedBy>' + esc(o.company || 'KMA') + '</cp:lastModifiedBy>' +
          '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
          '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
          '</cp:coreProperties>' },
      { name: 'docProps/app.xml', text: XML +
          '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"' +
          ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
          '<Application>Microsoft Office PowerPoint</Application>' +
          '<Slides>' + slides.length + '</Slides>' +
          '<Company>' + esc(o.company || '') + '</Company>' +
          '</Properties>' },
      { name: 'ppt/presentation.xml', text: presentation(slides.length) },
      { name: 'ppt/_rels/presentation.xml.rels', text: rels(presRels) },
      { name: 'ppt/slideMasters/slideMaster1.xml', text: master() },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', text: rels([
          { id: 'rId1', type: DOC + '/slideLayout', target: '../slideLayouts/slideLayout1.xml' },
          { id: 'rId2', type: DOC + '/theme', target: '../theme/theme1.xml' }
        ]) },
      { name: 'ppt/slideLayouts/slideLayout1.xml', text: layout() },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', text: rels([
          { id: 'rId1', type: DOC + '/slideMaster', target: '../slideMasters/slideMaster1.xml' }
        ]) },
      { name: 'ppt/theme/theme1.xml', text: theme() }
    ];

    slides.forEach(function (s, i) {
      files.push({ name: 'ppt/slides/slide' + (i + 1) + '.xml',
                   text: s.kind === 'cover' ? coverSlide(s) : contentSlide(s) });
      files.push({ name: 'ppt/slides/_rels/slide' + (i + 1) + '.xml.rels', text: rels([
        { id: 'rId1', type: DOC + '/slideLayout', target: '../slideLayouts/slideLayout1.xml' }
      ]) });
    });

    return g.Zip.write(files.map(function (f) {
      return { name: f.name, blob: new Blob([f.text], { type: 'application/xml' }) };
    })).then(function (res) {
      return new Blob([res.blob], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });
    });
  }

  /* 개요(제목 + 불렛 목록)를 슬라이드로 옮긴다.
     첫 장이 표지면 표지 모양으로, 나머지는 제목 + 불렛으로 만든다. */
  function fromOutline(outline, opts) {
    opts = opts || {};
    var slides = outline.map(function (s, i) {
      if (i === 0 && (s.src === 'cover' || opts.firstIsCover)) {
        return { kind: 'cover', title: (s.bullets || [])[0] || s.title,
                 lines: (s.bullets || []).slice(1) };
      }
      return { title: s.title, bullets: s.bullets || [], note: s.note || '' };
    });
    return build({ title: opts.title, company: opts.company, slides: slides });
  }

  g.Pptx = { build: build, fromOutline: fromOutline, FONT: FONT };
})(window);
