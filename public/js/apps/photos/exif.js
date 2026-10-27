/* exif.js — JPEG EXIF 읽기 · 회전 저장 시 EXIF 이어붙이기
 *
 * 외부 라이브러리를 쓰지 않는다. 사진이 브라우저 밖으로 나가지 않아야 하고(NFR-06),
 * 사내에서 CDN이 막혀도 동작해야 하기 때문이다.
 *
 * 회전한 사진을 다시 저장할 때 원본의 APP1(Exif) 세그먼트를 그대로 옮겨 붙이고
 * Orientation 만 1로 고쳐 쓴다. 촬영시각 등 메타데이터가 살아남는다(Q-07 → 보존).
 */
(function (g) {
  'use strict';

  var SOF_MARKERS = [0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF];

  /* JPEG 세그먼트를 훑어 APP1(Exif) 위치와 실제 크기(SOF)를 찾는다 */
  function scanJpeg(view) {
    var out = { app1: null, width: 0, height: 0, isJpeg: false };
    if (view.byteLength < 4) return out;
    if (view.getUint16(0) !== 0xFFD8) return out;
    out.isJpeg = true;

    var p = 2;
    while (p + 4 <= view.byteLength) {
      if (view.getUint8(p) !== 0xFF) { p++; continue; }
      var marker = view.getUint8(p + 1);
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { p += 2; continue; }
      if (marker === 0xDA || marker === 0xD9) break;           // 스캔 시작 = 메타 영역 끝
      if (p + 4 > view.byteLength) break;
      var len = view.getUint16(p + 2);
      if (len < 2) break;

      if (marker === 0xE1 && p + 4 + 6 <= view.byteLength) {
        var tag = '';
        for (var i = 0; i < 4; i++) tag += String.fromCharCode(view.getUint8(p + 4 + i));
        if (tag === 'Exif') out.app1 = { start: p, length: len + 2, tiff: p + 10 };
      }
      if (SOF_MARKERS.indexOf(marker) !== -1 && p + 9 <= view.byteLength) {
        out.height = view.getUint16(p + 5);
        out.width = view.getUint16(p + 7);
      }
      p += 2 + len;
    }
    return out;
  }

  function readIfd(view, tiff, ifdOffset, little, want, found) {
    if (tiff + ifdOffset + 2 > view.byteLength) return 0;
    var base = tiff + ifdOffset;
    var count = view.getUint16(base, little);
    var p = base + 2;
    for (var i = 0; i < count; i++, p += 12) {
      if (p + 12 > view.byteLength) break;
      var tag = view.getUint16(p, little);
      if (want.indexOf(tag) === -1) continue;
      var type = view.getUint16(p + 2, little);
      var num = view.getUint32(p + 4, little);
      var valOff = p + 8;
      var size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1;
      if (size * num > 4) {
        var off = view.getUint32(p + 8, little);
        valOff = tiff + off;
        if (valOff + size * num > view.byteLength) continue;
      }
      found[tag] = { type: type, count: num, offset: valOff, little: little };
    }
    if (p + 4 <= view.byteLength) return view.getUint32(p, little);
    return 0;
  }

  function valueOf(view, e) {
    if (!e) return null;
    if (e.type === 2) {                                   // ASCII
      var s = '';
      for (var i = 0; i < e.count; i++) {
        var c = view.getUint8(e.offset + i);
        if (!c) break;
        s += String.fromCharCode(c);
      }
      return s;
    }
    if (e.type === 3) return view.getUint16(e.offset, e.little);
    if (e.type === 4) return view.getUint32(e.offset, e.little);
    return null;
  }

  /* "2026:09:11 11:07:09" (+ SubSecTime) → Date */
  function parseExifDate(s, subsec) {
    if (!s || !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return null;
    var d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10),
                     +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19));
    if (isNaN(d)) return null;
    if (subsec) {
      var ms = parseInt((String(subsec) + '000').slice(0, 3), 10);
      if (!isNaN(ms)) d.setMilliseconds(ms);
    }
    return d;
  }

  /* 카카오톡 파일명에서 시각 추출: KakaoTalk_YYYYMMDD_HHMMSSmmm[_NN].jpg */
  var KAKAO_RE = /^KakaoTalk_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(\d{3})(?:_(\d+))?/i;
  function fromFileName(name) {
    var m = KAKAO_RE.exec(name || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]);
    return isNaN(d) ? null : d;
  }
  function suffixOf(name) {
    var m = KAKAO_RE.exec(name || '');
    if (m) return m[8] ? '_' + m[8] : '(접미사 없음)';
    var m2 = /_(\d+)\.[a-z0-9]+$/i.exec(name || '');
    return m2 ? '_' + m2[1] : '';
  }
  function batchOf(name) {
    var m = KAKAO_RE.exec(name || '');
    return m ? 'KakaoTalk_' + m[1] + m[2] + m[3] + '_' + m[4] + m[5] + m[6] + m[7] : '';
  }

  /* 파일 앞부분만 읽어 메타데이터를 뽑는다 (전체를 메모리에 올리지 않는다) */
  function read(file) {
    var head = file.slice(0, Math.min(file.size, 256 * 1024));
    return head.arrayBuffer().then(function (ab) {
      var view = new DataView(ab);
      var scan = scanJpeg(view);
      var res = {
        isJpeg: scan.isJpeg,
        width: scan.width, height: scan.height,
        orientation: 1, takenAt: null, takenAtSource: null,
        make: '', model: '',
        app1: scan.app1 ? { start: scan.app1.start, length: scan.app1.length } : null,
        patch: null
      };

      if (scan.app1 && scan.app1.tiff + 8 <= view.byteLength) {
        var t = scan.app1.tiff;
        var order = view.getUint16(t);
        if (order === 0x4949 || order === 0x4D4D) {
          var little = order === 0x4949;
          var ifd0 = view.getUint32(t + 4, little);
          var f0 = {};
          readIfd(view, t, ifd0, little, [0x0112, 0x8769, 0x010F, 0x0110, 0x0132], f0);
          if (f0[0x0112]) {
            res.orientation = valueOf(view, f0[0x0112]) || 1;
            res.patch = res.patch || {};
            res.patch.orientation = { offset: f0[0x0112].offset - scan.app1.start, type: f0[0x0112].type, little: little };
          }
          res.make = valueOf(view, f0[0x010F]) || '';
          res.model = valueOf(view, f0[0x0110]) || '';

          if (f0[0x8769]) {
            var exifOff = valueOf(view, f0[0x8769]);
            var f1 = {};
            readIfd(view, t, exifOff, little, [0x9003, 0x9004, 0x9291, 0x9292, 0xA002, 0xA003], f1);
            var dto = valueOf(view, f1[0x9003]) || valueOf(view, f1[0x9004]);
            var sub = valueOf(view, f1[0x9291]) || valueOf(view, f1[0x9292]);
            var d = parseExifDate(dto, sub);
            if (d) { res.takenAt = d.getTime(); res.takenAtSource = 'exif'; }
            ['A002', 'A003'].forEach(function (k, idx) {
              var tag = idx === 0 ? 0xA002 : 0xA003;
              if (f1[tag]) {
                res.patch = res.patch || {};
                res.patch[idx === 0 ? 'pixelX' : 'pixelY'] =
                  { offset: f1[tag].offset - scan.app1.start, type: f1[tag].type, little: little };
              }
            });
          }
          /* DateTime (0x0132) 은 마지막 대체 수단 */
          if (!res.takenAt) {
            var dt = parseExifDate(valueOf(view, f0[0x0132]));
            if (dt) { res.takenAt = dt.getTime(); res.takenAtSource = 'exif'; }
          }
        }
      }

      if (!res.takenAt) {
        var fn = fromFileName(file.name);
        if (fn) { res.takenAt = fn.getTime(); res.takenAtSource = 'filename'; }
      }
      if (!res.takenAt && file.lastModified) {
        res.takenAt = file.lastModified; res.takenAtSource = 'mtime';
      }
      return res;
    });
  }

  /* 원본의 APP1 을 잘라 와 Orientation 을 1로, 크기 태그를 새 크기로 고친다 */
  function buildApp1(file, meta, newW, newH) {
    if (!meta.app1) return Promise.resolve(null);
    return file.slice(meta.app1.start, meta.app1.start + meta.app1.length).arrayBuffer().then(function (ab) {
      var bytes = new Uint8Array(ab);
      var view = new DataView(ab);
      var p = meta.patch || {};
      function put(spec, value) {
        if (!spec || spec.offset < 0 || spec.offset + 4 > bytes.length) return;
        if (spec.type === 3) view.setUint16(spec.offset, value, spec.little);
        else if (spec.type === 4) view.setUint32(spec.offset, value, spec.little);
      }
      put(p.orientation, 1);
      put(p.pixelX, newW);
      put(p.pixelY, newH);
      return bytes;
    });
  }

  /* canvas 로 만든 JPEG 앞(SOI 바로 뒤)에 APP1 을 끼워 넣는다 */
  function spliceApp1(jpegBytes, app1Bytes) {
    if (!app1Bytes || jpegBytes[0] !== 0xFF || jpegBytes[1] !== 0xD8) return jpegBytes;
    var out = new Uint8Array(jpegBytes.length + app1Bytes.length);
    out.set(jpegBytes.subarray(0, 2), 0);
    out.set(app1Bytes, 2);
    out.set(jpegBytes.subarray(2), 2 + app1Bytes.length);
    return out;
  }

  g.Exif = {
    read: read, buildApp1: buildApp1, spliceApp1: spliceApp1,
    suffixOf: suffixOf, batchOf: batchOf, fromFileName: fromFileName
  };
})(window);
