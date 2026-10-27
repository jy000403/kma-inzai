/* imaging.js — 썸네일 · 유사도 해시 · 선명도 · 회전 저장
 *
 * EXIF 방향은 createImageBitmap({imageOrientation:'from-image'}) 이 처리한다.
 * 좌우 반전이 섞인 방향값(2·4·5·7)까지 브라우저가 규격대로 처리하므로 직접 계산하지 않는다.
 */
(function (g) {
  'use strict';

  var HASH_W = 9, HASH_H = 8;   /* dHash: 가로 이웃 비교 → 8×8 = 64비트 */

  function bitmapOf(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' });
    }
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('이미지를 열 수 없습니다.')); };
      img.src = url;
    });
  }

  function canvasOf(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function grayData(bmp, w, h) {
    var c = canvasOf(w, h);
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    var d = ctx.getImageData(0, 0, w, h).data;
    var gray = new Float32Array(w * h);
    for (var i = 0, j = 0; i < d.length; i += 4, j++) {
      gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    c.width = c.height = 0;
    return gray;
  }

  /* 가로 이웃 밝기 비교로 64비트 지각 해시를 만든다 */
  function dHash(bmp) {
    var gray = grayData(bmp, HASH_W, HASH_H);
    var bits = new Uint8Array(64);
    var k = 0;
    for (var y = 0; y < HASH_H; y++) {
      for (var x = 0; x < HASH_W - 1; x++) {
        bits[k++] = gray[y * HASH_W + x] > gray[y * HASH_W + x + 1] ? 1 : 0;
      }
    }
    var hex = '';
    for (var i = 0; i < 64; i += 4) {
      hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
    }
    return hex;
  }

  var POPCOUNT = (function () {
    var t = new Uint8Array(16);
    for (var i = 0; i < 16; i++) t[i] = (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1);
    return t;
  })();

  function hamming(a, b) {
    if (!a || !b || a.length !== b.length) return 64;
    var d = 0;
    for (var i = 0; i < a.length; i++) {
      d += POPCOUNT[(parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 15];
    }
    return d;
  }

  /* 라플라시안 근사 — 값이 클수록 또렷하다. 그룹에서 남길 1장을 고를 때 쓴다. */
  function sharpness(bmp) {
    var N = 48;
    var gray = grayData(bmp, N, N);
    var sum = 0;
    for (var y = 1; y < N - 1; y++) {
      for (var x = 1; x < N - 1; x++) {
        var i = y * N + x;
        var v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - N] - gray[i + N];
        sum += v * v;
      }
    }
    return Math.round(sum / ((N - 2) * (N - 2)));
  }

  function thumbBlob(bmp, maxSide) {
    var scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    var w = Math.max(1, Math.round(bmp.width * scale));
    var h = Math.max(1, Math.round(bmp.height * scale));
    var c = canvasOf(w, h);
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return new Promise(function (res) { c.toBlob(function (b) { c.width = c.height = 0; res(b); }, 'image/jpeg', 0.8); });
  }

  /* 문서에 끼워 넣을 크기로 줄여 준다.
     원본은 한 장에 5~10MB 라, 여섯 장만 넣어도 PPT 가 수십 MB 가 된다.
     슬라이드에서 제일 큰 사진 자리가 355pt(≒5인치)라 1600px 이면 넉넉하다.
     세워 찍은 사진은 EXIF 방향대로 돌려서 내보낸다 — 안 돌리면 누워서 들어간다. */
  function fitBlob(file, degrees, maxSide, quality) {
    return bitmapOf(file).then(function (bmp) {
      var deg = (((degrees || 0) % 360) + 360) % 360;
      var swap = deg === 90 || deg === 270;
      var sw = swap ? bmp.height : bmp.width;
      var sh = swap ? bmp.width : bmp.height;
      var scale = Math.min(1, (maxSide || 1600) / Math.max(sw, sh));
      var w = Math.max(1, Math.round(sw * scale));
      var h = Math.max(1, Math.round(sh * scale));
      var c = canvasOf(w, h);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      ctx.rotate(deg * Math.PI / 180);
      var dw = swap ? h : w, dh = swap ? w : h;
      ctx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh);
      if (bmp.close) bmp.close();
      return new Promise(function (res) {
        c.toBlob(function (b) { c.width = c.height = 0; res(b); },
          'image/jpeg', (quality || 82) / 100);
      });
    });
  }

  /* 업로드 직후 1장 분석: 썸네일 + 해시 + 선명도 + 실제 크기 */
  function analyze(file, maxSide) {
    return bitmapOf(file).then(function (bmp) {
      var out = { width: bmp.width, height: bmp.height, hash: '', sharpness: 0, thumbUrl: '' };
      try { out.hash = dHash(bmp); } catch (e) {}
      try { out.sharpness = sharpness(bmp); } catch (e) {}
      return thumbBlob(bmp, maxSide || 320).then(function (b) {
        out.thumbUrl = b ? URL.createObjectURL(b) : '';
        if (bmp.close) bmp.close();
        return out;
      });
    });
  }

  /* 픽셀 자체를 회전해 저장한다. EXIF 를 무시하는 뷰어에서도 바르게 보이도록 (BR-06) */
  function renderRotated(file, meta, degrees, quality) {
    return bitmapOf(file).then(function (bmp) {
      var deg = ((degrees % 360) + 360) % 360;
      var swap = deg === 90 || deg === 270;
      var w = swap ? bmp.height : bmp.width;
      var h = swap ? bmp.width : bmp.height;
      var c = canvasOf(w, h);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      ctx.rotate(deg * Math.PI / 180);
      ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      if (bmp.close) bmp.close();

      return new Promise(function (res) {
        c.toBlob(function (blob) { c.width = c.height = 0; res({ blob: blob, w: w, h: h }); },
          'image/jpeg', (quality || 95) / 100);
      });
    }).then(function (r) {
      if (!r.blob) throw new Error('이미지를 다시 저장하지 못했습니다.');
      return g.Exif.buildApp1(file, meta, r.w, r.h).then(function (app1) {
        if (!app1) return r.blob;
        return r.blob.arrayBuffer().then(function (ab) {
          var merged = g.Exif.spliceApp1(new Uint8Array(ab), app1);
          return new Blob([merged], { type: 'image/jpeg' });
        });
      });
    });
  }

  /* 동시에 너무 많이 디코딩하면 브라우저가 버거우므로 개수를 제한한다 */
  function queue(items, worker, concurrency, onProgress) {
    var i = 0, done = 0, total = items.length;
    concurrency = Math.max(1, concurrency || 3);
    return new Promise(function (resolve) {
      if (!total) return resolve();
      var active = 0;
      function next() {
        while (active < concurrency && i < total) {
          var idx = i++;
          active++;
          Promise.resolve(worker(items[idx], idx))
            .catch(function () {})
            .then(function () {
              active--; done++;
              if (onProgress) onProgress(done, total);
              if (done === total) resolve(); else next();
            });
        }
      }
      next();
    });
  }

  g.Imaging = {
    analyze: analyze, renderRotated: renderRotated, hamming: hamming, queue: queue,
    bitmapOf: bitmapOf, fitBlob: fitBlob
  };
})(window);
