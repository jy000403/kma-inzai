/* zip.js — zip 쓰기(무압축 저장) · 읽기(파일명만)
 *
 * 사진은 이미 JPEG 로 압축돼 있어 다시 압축해도 거의 줄지 않는다. 그래서 store 방식으로 담는다.
 * 파일명에는 UTF-8 플래그(bit 11)를 세워 Windows 탐색기에서 한글이 깨지지 않게 한다(NFR-05).
 *
 * 500MB 가 넘는 결과를 메모리에 통째로 올리지 않도록 두 가지 경로를 둔다(NFR-02).
 *   1) 파일 저장 대화상자를 지원하면 디스크로 바로 흘려보낸다.
 *   2) 아니면 Blob 조각 목록으로 만든다. 원본 File 을 그대로 참조하므로 복사가 일어나지 않는다.
 */
(function (g) {
  'use strict';

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32Chunk(c, buf) {
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return c;
  }

  /* 큰 파일도 메모리에 다 올리지 않고 조각으로 읽어 CRC 를 구한다 */
  function crc32Blob(blob) {
    if (!blob.stream) {
      return blob.arrayBuffer().then(function (ab) {
        return (crc32Chunk(0xFFFFFFFF, new Uint8Array(ab)) ^ 0xFFFFFFFF) >>> 0;
      });
    }
    var reader = blob.stream().getReader();
    var c = 0xFFFFFFFF;
    return (function step() {
      return reader.read().then(function (r) {
        if (r.done) return (c ^ 0xFFFFFFFF) >>> 0;
        c = crc32Chunk(c, r.value);
        return step();
      });
    })();
  }

  function u16(n) { return [n & 0xff, (n >> 8) & 0xff]; }
  function u32(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

  function dosStamp(d) {
    return {
      time: ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xffff,
      date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
    };
  }

  function localHeader(nameBytes, crc, size, stamp) {
    return new Uint8Array([].concat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0),
      u16(stamp.time), u16(stamp.date),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0)
    ));
  }
  function centralHeader(nameBytes, crc, size, stamp, offset) {
    return new Uint8Array([].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
      u16(stamp.time), u16(stamp.date),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset)
    ));
  }
  function eocd(count, cdSize, cdStart) {
    return new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(count), u16(count),
      u32(cdSize), u32(cdStart), u16(0)
    ));
  }

  /* entry 는 { name, blob } 또는 { name, get:()=>Promise<Blob> } 둘 다 받는다 */
  function resolveBlob(e) {
    if (e.blob) return Promise.resolve(e.blob);
    return Promise.resolve(e.get());
  }

  function supportsFilePicker() {
    return typeof g.showSaveFilePicker === 'function';
  }

  /* entries: [{ name, blob }] — 순서대로 담는다 */
  function write(entries, opts) {
    opts = opts || {};
    var enc = new TextEncoder();
    var stamp = dosStamp(new Date());

    if (opts.writable) return streamTo(opts.writable, entries, enc, stamp, opts.onProgress);
    return buildBlob(entries, enc, stamp, opts.onProgress);
  }

  function streamTo(writable, entries, enc, stamp, onProgress) {
    var offset = 0, central = [], i = 0;

    function writeBytes(bytes) {
      return writable.write(bytes).then(function () { offset += bytes.length; });
    }
    function writeBlob(blob) {
      if (!blob.stream) {
        return blob.arrayBuffer().then(function (ab) { return writeBytes(new Uint8Array(ab)); });
      }
      var reader = blob.stream().getReader();
      return (function step() {
        return reader.read().then(function (r) {
          if (r.done) return;
          return writeBytes(r.value).then(step);
        });
      })();
    }

    function next() {
      if (i >= entries.length) {
        var cdStart = offset;
        return central.reduce(function (p, c) {
          return p.then(function () { return writeBytes(c.head); }).then(function () { return writeBytes(c.name); });
        }, Promise.resolve()).then(function () {
          var cdSize = offset - cdStart;
          return writeBytes(eocd(entries.length, cdSize, cdStart));
        }).then(function () { return writable.close(); })
          .then(function () { return { streamed: true, bytes: offset, count: entries.length }; });
      }
      var e = entries[i];
      var nameBytes = enc.encode(e.name);
      /* blob 을 미리 다 만들어 두면 메모리를 크게 쓰므로 한 장씩 그때그때 만든다 */
      return resolveBlob(e).then(function (blob) {
        return crc32Blob(blob).then(function (crc) {
          var start = offset;
          return writeBytes(localHeader(nameBytes, crc, blob.size, stamp))
            .then(function () { return writeBytes(nameBytes); })
            .then(function () { return writeBlob(blob); })
            .then(function () {
              central.push({ head: centralHeader(nameBytes, crc, blob.size, stamp, start), name: nameBytes });
              i++;
              if (onProgress) onProgress(i, entries.length);
              return next();
            });
        });
      });
    }
    return next();
  }

  function buildBlob(entries, enc, stamp, onProgress) {
    var parts = [], central = [], offset = 0, i = 0;

    function next() {
      if (i >= entries.length) {
        var cdStart = offset;
        var cdSize = 0;
        central.forEach(function (c) { parts.push(c.head, c.name); cdSize += c.head.length + c.name.length; });
        parts.push(eocd(entries.length, cdSize, cdStart));
        var blob = new Blob(parts, { type: 'application/zip' });
        return Promise.resolve({ streamed: false, blob: blob, bytes: blob.size, count: entries.length });
      }
      var e = entries[i];
      var nameBytes = enc.encode(e.name);
      return resolveBlob(e).then(function (blob) {
        return crc32Blob(blob).then(function (crc) {
          var head = localHeader(nameBytes, crc, blob.size, stamp);
          /* 원본 File 을 그대로 참조한다. Blob 조립은 바이트를 복사하지 않는다. */
          parts.push(head, nameBytes, blob);
          central.push({ head: centralHeader(nameBytes, crc, blob.size, stamp, offset), name: nameBytes });
          offset += head.length + nameBytes.length + blob.size;
          i++;
          if (onProgress) onProgress(i, entries.length);
          return next();
        });
      });
    }
    return next();
  }

  /* 기존 결과 zip 에서 파일명만 읽는다 (압축을 풀지 않는다) — FR-16 */
  function readNames(file) {
    var tailSize = Math.min(file.size, 128 * 1024);
    return file.slice(file.size - tailSize).arrayBuffer().then(function (ab) {
      var v = new DataView(ab);
      var eocdPos = -1;
      for (var p = ab.byteLength - 22; p >= 0; p--) {
        if (v.getUint32(p, true) === 0x06054b50) { eocdPos = p; break; }
      }
      if (eocdPos < 0) throw new Error('zip 파일이 아니거나 형식을 읽을 수 없습니다.');
      var count = v.getUint16(eocdPos + 10, true);
      var cdSize = v.getUint32(eocdPos + 12, true);
      var cdStart = v.getUint32(eocdPos + 16, true);
      return file.slice(cdStart, cdStart + cdSize).arrayBuffer().then(function (cd) {
        var cv = new DataView(cd);
        var dec = new TextDecoder('utf-8');
        var names = [], off = 0;
        for (var i = 0; i < count && off + 46 <= cd.byteLength; i++) {
          if (cv.getUint32(off, true) !== 0x02014b50) break;
          var nameLen = cv.getUint16(off + 28, true);
          var extraLen = cv.getUint16(off + 30, true);
          var cmtLen = cv.getUint16(off + 32, true);
          var size = cv.getUint32(off + 24, true);
          names.push({ name: dec.decode(new Uint8Array(cd, off + 46, nameLen)), size: size });
          off += 46 + nameLen + extraLen + cmtLen;
        }
        return names;
      });
    });
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
  }

  function savePicker(suggestedName) {
    return g.showSaveFilePicker({
      suggestedName: suggestedName,
      types: [{ description: 'ZIP 압축 파일', accept: { 'application/zip': ['.zip'] } }]
    }).then(function (handle) { return handle.createWritable(); });
  }

  g.Zip = {
    write: write, readNames: readNames, download: download,
    savePicker: savePicker, supportsFilePicker: supportsFilePicker
  };
})(window);
