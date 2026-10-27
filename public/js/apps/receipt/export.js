/* export.js — 이미지 → PDF 변환, ZIP 생성, 다운로드 (FR-09/10/11, NFR-03/04)
 *
 * 외부 라이브러리를 쓰지 않는다. 사내 PC에서 CDN이 막혀 있어도 동작해야 하고,
 * 이미지가 외부로 전송되는 경로를 아예 만들지 않기 위해서다.
 *
 * PDF는 원본 픽셀을 그대로 FlateDecode(무손실)로 담는다. JPEG 재압축이 없으므로
 * 금액·날짜 글자가 뭉개지지 않는다(NFR-04).
 */
(function (global) {
  'use strict';

  var A4 = { w: 595.276, h: 841.89 };
  var PX_TO_PT = 72 / 96;

  /* ── zlib (FlateDecode용) ───────────────────────────── */

  function adler32(buf) {
    var a = 1, s = 0, i = 0, n = buf.length;
    while (i < n) {
      var end = Math.min(i + 3000, n);
      for (; i < end; i++) { a += buf[i]; s += a; }
      a %= 65521; s %= 65521;
    }
    return ((s << 16) | a) >>> 0;
  }

  /* CompressionStream 이 없는 환경을 위한 비압축(stored) zlib 스트림.
   * 용량은 커지지만 PDF 자체는 정상적으로 열린다. */
  function zlibStored(bytes) {
    var blocks = Math.max(1, Math.ceil(bytes.length / 65535));
    var out = new Uint8Array(2 + blocks * 5 + bytes.length + 4);
    var p = 0;
    out[p++] = 0x78; out[p++] = 0x01;
    for (var i = 0; i < blocks; i++) {
      var off = i * 65535;
      var len = Math.min(65535, bytes.length - off);
      out[p++] = (i === blocks - 1) ? 1 : 0;
      out[p++] = len & 0xff; out[p++] = (len >> 8) & 0xff;
      out[p++] = (~len) & 0xff; out[p++] = ((~len) >> 8) & 0xff;
      out.set(bytes.subarray(off, off + len), p); p += len;
    }
    var ad = adler32(bytes);
    out[p++] = (ad >>> 24) & 0xff; out[p++] = (ad >>> 16) & 0xff;
    out[p++] = (ad >>> 8) & 0xff; out[p++] = ad & 0xff;
    return out;
  }

  function zlibDeflate(bytes) {
    if (typeof global.CompressionStream === 'function') {
      try {
        var stream = new Blob([bytes]).stream().pipeThrough(new global.CompressionStream('deflate'));
        return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
      } catch (e) { /* fall through */ }
    }
    return Promise.resolve(zlibStored(bytes));
  }

  /* ── 이미지 디코딩 ──────────────────────────────────── */

  function loadImage(blob) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob).catch(function () { return loadViaImg(blob); });
    }
    return loadViaImg(blob);
  }

  function loadViaImg(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다.')); };
      img.src = url;
    });
  }

  /* 투명 영역은 흰색 위에 합성한다(ERP 증빙은 흰 배경이 기본). */
  function toRGB(bmp) {
    var w = bmp.width, h = bmp.height;
    if (!w || !h) throw new Error('이미지 크기를 확인할 수 없습니다.');
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0);
    var data = ctx.getImageData(0, 0, w, h).data;
    var rgb = new Uint8Array(w * h * 3);
    for (var i = 0, j = 0; i < data.length; i += 4) {
      rgb[j++] = data[i]; rgb[j++] = data[i + 1]; rgb[j++] = data[i + 2];
    }
    canvas.width = canvas.height = 0;
    if (bmp.close) bmp.close();
    return { w: w, h: h, rgb: rgb };
  }

  /* ── PDF 작성 ───────────────────────────────────────── */

  function num(n) {
    return (Math.round(n * 1000) / 1000).toString();
  }

  function buildPdf(img, deflated, pageMode) {
    var enc = new TextEncoder();
    var pageW, pageH, dw, dh, dx, dy;

    if (pageMode === 'a4') {
      var landscape = img.w > img.h;
      pageW = landscape ? A4.h : A4.w;
      pageH = landscape ? A4.w : A4.h;
      var scale = Math.min(pageW / img.w, pageH / img.h);
      dw = img.w * scale; dh = img.h * scale;
      dx = (pageW - dw) / 2; dy = (pageH - dh) / 2;
    } else {
      pageW = dw = img.w * PX_TO_PT;
      pageH = dh = img.h * PX_TO_PT;
      dx = 0; dy = 0;
    }

    var content = enc.encode('q ' + num(dw) + ' 0 0 ' + num(dh) + ' ' + num(dx) + ' ' + num(dy) + ' cm /Im0 Do Q\n');

    var chunks = [], size = 0, offsets = [];
    function push(x) {
      var b = (typeof x === 'string') ? enc.encode(x) : x;
      chunks.push(b); size += b.length;
    }
    function obj(n, body, stream) {
      offsets[n] = size;
      push(n + ' 0 obj\n' + body + '\n');
      if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); }
      push('endobj\n');
    }

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(pageW) + ' ' + num(pageH) + ']' +
           ' /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    obj(4, '<< /Type /XObject /Subtype /Image /Width ' + img.w + ' /Height ' + img.h +
           ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ' + deflated.length + ' >>', deflated);
    obj(5, '<< /Length ' + content.length + ' >>', content);

    var xref = size;
    var lines = ['xref\n0 6\n', '0000000000 65535 f \n'];
    for (var i = 1; i <= 5; i++) {
      lines.push(('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n');
    }
    push(lines.join(''));
    push('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    var out = new Uint8Array(size), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }

  /* 이미지 파일 1개 → PDF 1개 (합본 없음) */
  function imageToPdf(file, pageMode) {
    return loadImage(file)
      .then(toRGB)
      .then(function (img) {
        return zlibDeflate(img.rgb).then(function (def) { return buildPdf(img, def, pageMode); });
      });
  }

  /* ── ZIP (store 방식) ───────────────────────────────── */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTime(d) {
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2))) & 0xffff,
      date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
    };
  }

  /* entries: [{ name, data:Uint8Array }]
   * 파일명은 UTF-8 플래그(bit 11)를 세워 한글이 깨지지 않게 한다(NFR-03). */
  function makeZip(entries) {
    var enc = new TextEncoder();
    var dt = dosTime(new Date());
    var parts = [], central = [], offset = 0, total = 0;

    function u8(n) { return [n & 0xff]; }
    function u16(n) { return [n & 0xff, (n >> 8) & 0xff]; }
    function u32(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

    entries.forEach(function (e) {
      var nameBytes = enc.encode(e.name);
      var crc = crc32(e.data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0),
        u16(dt.time), u16(dt.date),
        u32(crc), u32(e.data.length), u32(e.data.length),
        u16(nameBytes.length), u16(0)
      );
      var head = new Uint8Array(local);
      parts.push(head, nameBytes, e.data);
      total += head.length + nameBytes.length + e.data.length;

      central.push({
        bytes: new Uint8Array([].concat(
          u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
          u16(dt.time), u16(dt.date),
          u32(crc), u32(e.data.length), u32(e.data.length),
          u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
          u32(0), u32(offset)
        )),
        name: nameBytes
      });
      offset += head.length + nameBytes.length + e.data.length;
    });

    var cdStart = total;
    central.forEach(function (c) { parts.push(c.bytes, c.name); total += c.bytes.length + c.name.length; });
    var cdSize = total - cdStart;

    var eocd = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(entries.length), u16(entries.length),
      u32(cdSize), u32(cdStart), u16(0)
    ));
    parts.push(eocd); total += eocd.length;
    void u8;

    var out = new Uint8Array(total), p = 0;
    parts.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }

  /* ── 다운로드 ───────────────────────────────────────── */

  function download(bytesOrBlob, filename, mime) {
    var blob = (bytesOrBlob instanceof Blob) ? bytesOrBlob : new Blob([bytesOrBlob], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function blobToBytes(blob) {
    return blob.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  global.Exporter = {
    imageToPdf: imageToPdf,
    makeZip: makeZip,
    download: download,
    blobToBytes: blobToBytes,
    loadImage: loadImage,
    hasNativeDeflate: typeof global.CompressionStream === 'function'
  };
})(window);
