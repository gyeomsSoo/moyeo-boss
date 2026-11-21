/* 인터뷰 시트 오프라인 대비 — i/ 아래에서만 돈다 (GitHub Pages: /moyeo-boss/i/).
 * 연결되면 늘 새 파일을 받고(네트워크 먼저), 끊겼을 때만 마지막으로 받은 것을 쓴다.
 * 그래서 지하 가게에서 새로고침해도 시트가 열리고, 답은 이 폰에 저장됐다가 연결되면 간다.
 * 주소는 전부 이 파일 기준 상대 경로 — 사이트가 어느 하위 경로에 있어도 맞는다.
 * 캐시 이름은 다른 사이트(같은 github.io 출처)의 moyeo-boss-* 캐시와 겹치지 않게 따로 쓴다.
 * 미리 받는 파일을 바꾸면 CACHE 숫자를 올릴 것.
 */
var CACHE = 'mb-interview-v1';
var PREFIX = 'mb-interview-';
var CORE = [
  './',
  'script.html',
  '../css/base.css',
  '../css/boss.css',
  '../js/core.js',
  '../js/fields.js',
  '../js/trial.js',
  '../js/boss.js',
  '../content/boss.json',
  '../img/qr.svg',
  '../img/icon.svg',
  '../img/favicon-32.png'
];
// 앱 빌드(../app/)는 손대지 않는다 — 시연은 네트워크가 있어야 된다
var APP_PATH = new URL('../app/', self.location.href).pathname;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(CORE.map(function (u) {
      // 브라우저 HTTP 캐시를 건너뛰고 서버에서 새로 받는다(배포 직후 옛 파일이 들어가지 않게)
      return c.add(new Request(u, { cache: 'reload' })).catch(function () { /* 없는 파일은 건너뜀 */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // 응답 전송(POST) · 앱 확인(HEAD)은 그대로 통과
  var url = new URL(req.url);
  var same = url.origin === self.location.origin;
  if (!same && url.hostname !== 'cdn.jsdelivr.net') return;
  if (same && url.pathname.indexOf(APP_PATH) === 0) return;
  e.respondWith(networkFirst(req));
});

/* 네트워크 먼저. 단 3.5초 안에 답이 없으면(전파가 약한 가게 안) 받아 둔 것을 먼저 준다.
   네트워크 응답은 늦게 와도 캐시를 새로 채워서 다음번엔 최신이 나간다. */
var TIMEOUT_MS = 3500;

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || (req.mode === 'navigate' ? caches.match('./') : undefined);
  });
}

function networkFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    function finish(res) { if (!done && res) { done = true; resolve(res); } }

    var net = fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      finish(res);
      return res;
    }).catch(function () {
      return fromCache(req).then(function (hit) { finish(hit || Response.error()); });
    });

    setTimeout(function () {
      if (done) return;
      fromCache(req).then(function (hit) { if (hit) finish(hit); });   // 캐시도 없으면 네트워크를 계속 기다린다
    }, TIMEOUT_MS);

    return net;
  });
}
