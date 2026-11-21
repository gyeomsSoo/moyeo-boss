/* 동네모여 설문 사이트 — 공통 (주소 꼬리표 · 저장소 · 기기 · 전송 대기열 · 방문 기록 · 문항 불러오기)
 *
 * 주소 꼬리표 (개발·시험용):
 *   ?content=sample   content/*.sample.json 을 쓴다
 *   ?app=stub         앱 대신 dev/app-stub.html 을 띄운다
 *   ?endpoint=mock    전송을 콘솔에만 찍는다 (localhost 에서는 기본값)
 *   ?endpoint=fail    전송이 늘 실패한다 (재시도 대기열 시험)
 *   ?endpoint=live    localhost 에서도 진짜로 보낸다
 *                     ↑ endpoint 꼬리표는 localhost 에서만 먹는다. 공개 주소는 늘 진짜로 보낸다.
 *   ?test=1           세션 id 를 agent-test- 로 시작하게 한다 (시트에서 골라 지우기 쉽게)
 *   ?reset=1          이용자 페이지: 설문 진행·제출 표시·체험 기록·익명 id 를 지우고 처음부터 (인터뷰 초안·대기열은 안 지움)
 *   ?from=insta       유입 경로 (insta · eta · kakao · card …). 없으면 "직접"
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbzG9NaMqmMXXoWyD1AXFZNPDes4GnFY2l39Rq-pnw2wdtgu88hBm1bvI4QRouVpQuN8/exec';

  var M = window.Moyeo = window.Moyeo || {};
  var qs;
  try { qs = new URLSearchParams(location.search); } catch (e) { qs = { get: function () { return null; } }; }

  M.param = function (k) { return qs.get(k); };
  M.root = document.documentElement.getAttribute('data-root') || '';
  M.isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  M.sample = qs.get('content') === 'sample';
  M.stub = qs.get('app') === 'stub';

  // 전송 방식 꼬리표는 이 컴퓨터(localhost)에서만 먹는다. 공개 주소에서는 늘 진짜로 보낸다.
  var ep = qs.get('endpoint');
  M.endpointMode = !M.isLocal ? 'live' : ((ep === 'mock' || ep === 'fail' || ep === 'live') ? ep : 'mock');

  /* ── 저장소: 막혀 있어도(사생활 모드·인앱 브라우저) 메모리로 버틴다 ── */
  function makeStore(type) {
    var s = null;
    try {
      s = window[type];
      s.setItem('__moyeo', '1');
      s.removeItem('__moyeo');
    } catch (e) { s = null; }
    var mem = {};
    return {
      ok: !!s,
      get: function (k) {
        if (s) {
          try {
            var v = s.getItem(k);
            if (v !== null) return JSON.parse(v);
          } catch (e) { /* 깨진 값은 없는 것으로 */ }
        }
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      set: function (k, v) {
        mem[k] = v;
        if (s) { try { s.setItem(k, JSON.stringify(v)); } catch (e) { /* 꽉 찼거나 막힘 */ } }
      },
      del: function (k) {
        delete mem[k];
        if (s) { try { s.removeItem(k); } catch (e) { /* 무시 */ } }
      },
      keys: function (prefix) {
        var out = [];
        if (s) {
          try { for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(prefix) === 0) out.push(k); } } catch (e) { /* 무시 */ }
        }
        Object.keys(mem).forEach(function (k) { if (k.indexOf(prefix) === 0 && out.indexOf(k) < 0) out.push(k); });
        return out;
      }
    };
  }
  M.local = makeStore('localStorage');
  M.session = makeStore('sessionStorage');

  /* 저장이 막혀 메모리로 버티는 중이면 "이 기기에 저장" 같은 말은 사실이 아니다 — 문구를 바꾸는 데 쓴다 */
  M.persist = M.local.ok;

  /* ?reset=1 — 지우는 범위는 페이지마다 다르다. 보내지 않은 응답(대기열)과 인터뷰 초안은 어디서도 지우지 않는다. */
  M.page = document.documentElement.getAttribute('data-page') || '';
  if (qs.get('reset') === '1') {
    if (M.page === 'user') {
      ['moyeo.progress.user', 'moyeo.done.user', 'moyeo.trial.user', 'moyeo.trylog.user', 'moyeo.sid'].forEach(function (k) { M.local.del(k); });
      ['방문', '체험 시작', '설문 시작'].forEach(function (s) { M.session.del('moyeo.visit.' + s); });
      M.session.del('moyeo.testsid');
    } else if (M.page === 'owner') {
      M.session.del('moyeo.visit.사장님 소개 방문');
    }
    // boss: 아무것도 지우지 않는다 (초안 · 대기열 보호)
  }

  /* ── 한 번만 비우기 (RESET_EPOCH) ──
   * 이 값이 브라우저에 저장된 값과 다르면, 그 브라우저에서 한 번만 이용자 설문 흔적을 지운다.
   * 지우는 것: 설문 진행·완료 표시·체험 기록·익명 id·⤢ 안내를 본 표시, 그리고 아직 못 보낸 이용자·연락처·방문 응답.
   * 남기는 것: 인터뷰 초안과 못 보낸 인터뷰(boss).
   * 11-20: 그때까지의 응답이 전부 겸수님 시험이라, 시트를 비우면서 시험 기기의 흔적도 한 번 정리했다.
   * ⚠ 실제 응답을 받기 시작한 뒤에는 바꾸지 말 것 — 못 보낸 진짜 응답까지 사라진다. */
  var RESET_EPOCH = '2026-11-20';
  if (M.local.ok && M.local.get('moyeo.epoch') !== RESET_EPOCH) {
    ['moyeo.progress.user', 'moyeo.done.user', 'moyeo.trial.user', 'moyeo.trylog.user', 'moyeo.sid', 'moyeo.trial.fsTip']
      .forEach(function (k) { M.local.del(k); });
    M.session.keys('moyeo.visit.').concat(['moyeo.testsid', 'moyeo.trial.tip']).forEach(function (k) { M.session.del(k); });
    var oldBox = M.local.get('moyeo.outbox');
    if (Array.isArray(oldBox)) {
      M.local.set('moyeo.outbox', oldBox.filter(function (it) { return it && it.payload && it.payload.kind === 'boss'; }));
    }
    M.local.set('moyeo.epoch', RESET_EPOCH);
  }

  M.rand = function (n) {
    var abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    var out = '';
    var arr = null;
    try { arr = crypto.getRandomValues(new Uint8Array(n)); } catch (e) { arr = null; }
    for (var i = 0; i < n; i++) out += abc[(arr ? arr[i] : Math.floor(Math.random() * 256)) % abc.length];
    return out;
  };

  /* ── 익명 id: 기기(브라우저)마다 하나. 방문 기록과 응답을 같은 id 로 이어 볼 수 있다 ── */
  if (qs.get('test')) {
    M.sid = M.session.get('moyeo.testsid') || ('agent-test-' + M.rand(8));
    M.session.set('moyeo.testsid', M.sid);
  } else {
    M.sid = M.local.get('moyeo.sid');
    if (!M.sid) { M.sid = 'w-' + M.rand(10); M.local.set('moyeo.sid', M.sid); }
  }

  /* ── 유입 경로: 첫 방문 때의 ?from= 을 세션 동안 기억 ── */
  (function () {
    var from = (qs.get('from') || '').trim().slice(0, 40);
    if (from) M.session.set('moyeo.from', from);
    M.from = from || M.session.get('moyeo.from') || '직접';
  })();

  /* ── 기기 · 인앱 브라우저 ── */
  var ua = navigator.userAgent || '';
  M.device = (function () {
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return '태블릿(iPadOS)';
    if (/Android/.test(ua) && !/Mobile/.test(ua)) return '태블릿(안드로이드)';
    if (/iPhone|iPod/.test(ua)) return '폰(iOS)';
    if (/Android/.test(ua)) return '폰(안드로이드)';
    if (/Windows/.test(ua)) return 'PC(윈도우)';
    if (/Macintosh/.test(ua)) return 'PC(맥)';
    if (/CrOS|Linux/.test(ua)) return 'PC(기타)';
    return '기타';
  })();
  M.inApp = (function () {
    if (/Instagram/i.test(ua)) return '인스타';
    if (/KAKAOTALK/i.test(ua)) return '카톡';
    if (/everytime/i.test(ua)) return '에타';
    if (/FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|Barcelona|Threads|TikTok|musical_ly|BytedanceWebview|Twitter|; wv\)/i.test(ua)) return '기타 인앱';
    if (/(iPhone|iPad|iPod).*AppleWebKit(?!.*Safari)/i.test(ua)) return '기타 인앱';
    return '아님';
  })();

  M.isDesktopWide = function () {
    try { return window.matchMedia('(min-width: 960px) and (hover: hover) and (pointer: fine)').matches; } catch (e) { return false; }
  };
  M.reducedMotion = function () {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };

  /* ── 작은 도우미 ── */
  M.el = function (tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  };
  M.$ = function (sel, root) { return (root || document).querySelector(sel); };
  M.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  M.on = function (name, fn) { document.addEventListener('moyeo:' + name, function (e) { fn(e.detail); }); };
  M.emit = function (name, detail) {
    var ev;
    try { ev = new CustomEvent('moyeo:' + name, { detail: detail }); } catch (e) { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('moyeo:' + name, false, false, detail); }
    document.dispatchEvent(ev);
  };
  M.time = function (ts) {
    var d = new Date(ts);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  /* ── 봇 덫: 사람 눈에 안 보이는 입력칸. 페이지마다 <input id="hp"> 를 둔다 ── */
  M.hp = function () {
    var f = document.getElementById('hp');
    return f ? String(f.value || '') : '';
  };

  /* ── 전송 ────────────────────────────────────────────────
   * 설문·인터뷰 응답은 대기열(localStorage)에 먼저 넣고 보낸다.
   * 끊겨도 남아 있다가 연결되면(online · 다시 열기 · 15초마다) 다시 보낸다.
   */
  var OUTBOX = 'moyeo.outbox';
  var MAX_BODY = 29000;   // Code.gs MAX_BODY 30000 보다 조금 작게

  function fitBody(payload) {
    var body = JSON.stringify(payload);
    if (body.length <= MAX_BODY) return body;
    // 너무 길면 긴 글부터 줄인다 (한 칸 2000자 제한은 시트 쪽에도 있다)
    var a = payload.answers || {};
    var limit = 1500;
    while (body.length > MAX_BODY && limit >= 200) {
      Object.keys(a).forEach(function (k) { if (typeof a[k] === 'string' && a[k].length > limit) a[k] = a[k].slice(0, limit) + '…'; });
      body = JSON.stringify(payload);
      limit -= 300;
    }
    return body;
  }

  function post(payload) {
    var body = fitBody(payload);
    if (M.endpointMode === 'mock') {
      console.info('%c[mock 전송]', 'color:#2563EB;font-weight:700', payload.kind, payload);
      M.lastMock = payload;
      (M.mockLog = M.mockLog || []).push(payload);
      return new Promise(function (res) { setTimeout(function () { res({ ok: true, msg: 'mock' }); }, 350); });
    }
    if (M.endpointMode === 'fail') {
      console.warn('[fail 전송 — 시험용으로 일부러 실패]', payload.kind, payload);
      return new Promise(function (res, rej) { setTimeout(function () { rej(new Error('fail mode')); }, 350); });
    }
    // keepalive: 보내자마자 창을 닫거나 다른 앱으로 넘어가도 요청이 끝까지 간다.
    // 브라우저가 keepalive 몸통을 64KB 까지만 받으므로 그보다 크면 끈다(한글은 글자당 3바이트).
    var bytes = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(body).length : body.length * 3;
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow',
      cache: 'no-store',
      keepalive: bytes < 60000
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }

  function readBox() { var b = M.local.get(OUTBOX); return Array.isArray(b) ? b : []; }
  function writeBox(b) { M.local.set(OUTBOX, b); }

  /* 탭 두 개가 같은 대기열을 동시에 보내지 않게 — 짧은 자물쇠 + 보내기 직전 대기열 다시 읽기.
     그래도 겹치면 _제출id 가 같아서 시트에서 한 줄로 걸러 낼 수 있다. */
  var TAB = 't-' + M.rand(6);
  var LOCK = 'moyeo.outbox.lock';
  function takeLock() {
    if (!M.persist) return true;                       // 메모리뿐이면 이 탭 혼자다
    var now = Date.now();
    var l = M.local.get(LOCK);
    if (l && l.tab !== TAB && l.until > now) return false;
    M.local.set(LOCK, { tab: TAB, until: now + 30000 });
    var again = M.local.get(LOCK);                     // 동시에 잡았으면 나중에 쓴 쪽이 갖는다
    return !!again && again.tab === TAB;
  }
  function dropLock() {
    if (!M.persist) return;
    var l = M.local.get(LOCK);
    if (l && l.tab === TAB) M.local.del(LOCK);
  }

  var flushing = false;
  var timer = null;

  M.outboxCount = function () { return readBox().length; };

  M.flush = function () {
    if (flushing) return Promise.resolve();
    var box = readBox();
    if (!box.length) { dropLock(); M.emit('outbox', { pending: 0 }); return Promise.resolve(); }
    if (!takeLock()) {                                  // 다른 탭이 보내는 중
      M.emit('outbox', { pending: box.length, sending: true });
      schedule();
      return Promise.resolve();
    }
    flushing = true;
    box = readBox();                                    // 보내기 직전에 다시 읽는다
    var item = box[0];
    if (!item) { flushing = false; dropLock(); M.emit('outbox', { pending: 0 }); return Promise.resolve(); }
    M.emit('outbox', { pending: box.length, sending: true });

    return post(item.payload).then(function (res) {
      var drop = res && (res.ok || res.msg === 'kind' || res.msg === 'size');
      var rest = readBox().filter(function (x) { return x.id !== item.id; });
      if (drop) {
        writeBox(rest);
        M.emit(res.ok ? 'sent' : 'rejected', { item: item, res: res });
      } else {
        throw new Error((res && res.msg) || 'not ok');
      }
      flushing = false;
      if (rest.length) return M.flush();
      dropLock();
      M.emit('outbox', { pending: 0 });
    }).catch(function (err) {
      var b = readBox();
      b.forEach(function (x) { if (x.id === item.id) { x.tries = (x.tries || 0) + 1; x.err = String(err && err.message || err); } });
      writeBox(b);
      flushing = false;
      dropLock();
      M.emit('outbox', { pending: b.length, error: String(err && err.message || err), offline: navigator.onLine === false });
      schedule();
    });
  };

  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; if (readBox().length) M.flush(); }, 15000);
  }

  /**
   * 응답 한 건을 대기열에 넣고 보낸다.
   * meta 는 전송되지 않는다 — 'sent' 이벤트에서 어떤 초안이 갔는지 알아보는 데 쓴다.
   */
  M.submit = function (kind, answers, opts) {
    opts = opts || {};
    var id = 'o-' + Date.now().toString(36) + '-' + M.rand(4);
    // _제출id = 대기열 항목 id. 다시 보내도 같은 값이라, 시트에서 겹친 줄을 걸러 낼 수 있다 (SCHEMA §5)
    answers['_제출id'] = id;
    var item = {
      id: id,
      at: Date.now(),
      meta: opts.meta || null,
      // contact 는 sid 를 일부러 비운다("") — 설문 답변과 잇지 않는다는 약속. 그래서 || 로 채우지 않는다
      payload: { kind: kind, sid: Object.prototype.hasOwnProperty.call(opts, 'sid') ? String(opts.sid) : M.sid, answers: answers, hp: M.hp() }
    };
    var box = readBox();
    box.push(item);
    writeBox(box);
    M.flush();
    return item.id;
  };

  window.addEventListener('online', function () { M.flush(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && readBox().length) M.flush(); });

  /* ── 방문 기록: 이 사이트(moyeo-boss)는 보내지 않는다. 보내는 것은 kind 'boss' 응답뿐이다.
   *    (localmoyeo 원본은 세션당 단계별로 kind 'visit' 를 sendBeacon 으로 보낸다) ── */
  M.visit = function () { /* 아무것도 보내지 않음 */ };

  /* ── 문항 JSON ── */
  M.loadContent = function (name) {
    var url = M.root + 'content/' + name + (M.sample ? '.sample' : '') + '.json';
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) { var e = new Error('missing'); e.status = r.status; e.url = url; throw e; }
      return r.json();
    });
  };

  /* 다른 페이지로 갈 때도 개발용 꼬리표를 이어 준다 */
  M.devQuery = function () {
    var keep = ['content', 'app', 'endpoint', 'test'];
    var out = [];
    keep.forEach(function (k) { var v = qs.get(k); if (v) out.push(k + '=' + encodeURIComponent(v)); });
    return out.join('&');
  };

  // 처음 열 때 남은 것이 있으면 보낸다
  setTimeout(function () { if (readBox().length) M.flush(); }, 1200);

  if (M.endpointMode !== 'live') {
    console.info('[동네모여] 전송 방식: ' + M.endpointMode + (M.isLocal && !ep ? ' (localhost 라서 기본 mock — 진짜로 보내려면 ?endpoint=live)' : ''));
  }
})();
