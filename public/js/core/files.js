/* files.js — 큰 파일 주고받기
 *
 * 배포한 웹(Vercel)은 요청·응답 하나가 4.5MB 를 넘으면 받지 않는다.
 * 회사 양식 PPT 는 11MB, 교육사진 몇 장이면 금방 넘는다.
 * 그래서 파일은 JSON 에 싣지 않고 따로 올린 뒤 표시(ref)만 넘긴다.
 *
 *   Files.pack(blob, name)  → 서버에 넘길 값. 작으면 base64 글자, 크면 {$blob: ref}
 *   Files.unpack(d)         → 서버가 돌려준 파일(d.file 또는 d.b64) → Blob
 *   Files.save(blob, name)  → 내려받기
 *
 * 로컬 서버든 웹이든 같은 코드다. 올릴 자리는 서버가 알려 준다
 * (로컬: 이 서버 / 웹: Supabase Storage 의 서명된 주소).
 */
(function (g) {
  'use strict';

  var INLINE = 512 * 1024;       /* 이보다 작으면 base64 로 바로 싣는다 */

  function b64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        resolve(s.slice(s.indexOf(',') + 1));
      };
      fr.onerror = function () { reject(new Error('파일을 읽지 못했습니다.')); };
      fr.readAsDataURL(blob);
    });
  }

  function toBlob(b64s, mime) {
    var bin = atob(b64s), n = bin.length, arr = new Uint8Array(n);
    for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'application/octet-stream' });
  }

  function upload(blob, name) {
    return fetch('/api/blob/new', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'file', type: blob.type || '' })
    }).then(function (r) {
      return r.json().then(function (slot) {
        if (!r.ok || !slot || !slot.url) throw new Error((slot && slot.message) || '올릴 자리를 받지 못했습니다.');
        return fetch(slot.url, {
          method: slot.method || 'PUT', headers: slot.headers || {}, body: blob
        }).then(function (r2) {
          if (!r2.ok) throw new Error('파일을 올리지 못했습니다 (' + r2.status + ')');
          return { $blob: slot.ref };
        });
      });
    });
  }

  function pack(blob, name, force) {
    if (!blob) return Promise.resolve('');
    if (!force && blob.size <= INLINE) return b64(blob);
    return upload(blob, name);
  }

  function unpack(d, mime) {
    var f = (d && d.file) || null;
    if (f && f.b64) return Promise.resolve(toBlob(f.b64, mime || f.type));
    if (d && d.b64) return Promise.resolve(toBlob(d.b64, mime || (f && f.type)));
    if (f && f.url) {
      return fetch(f.url).then(function (r) {
        if (!r.ok) throw new Error('만든 파일을 받지 못했습니다 (' + r.status + ')');
        return r.blob();
      }).then(function (bl) { return mime ? new Blob([bl], { type: mime }) : bl; });
    }
    return Promise.reject(new Error('서버가 파일을 돌려주지 않았습니다.'));
  }

  /* 만든 파일을 다시 서버에 넘길 때 — 이미 서버에 있으면 표시만 */
  function ref(d) {
    if (d && d.file && d.file.ref) return { $blob: d.file.ref };
    return null;
  }

  function save(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
  }

  g.Files = { pack: pack, unpack: unpack, ref: ref, save: save, b64: b64, toBlob: toBlob,
              upload: upload, INLINE: INLINE };
})(window);
