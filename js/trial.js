/* 동네모여 설문 사이트 — 앱 체험 (iframe)
 *
 *  · iframe 은 처음 누를 때 만든다 — 첫 방문에 Flutter 수 MB 를 받지 않게.
 *  · 넓은 화면(마우스)은 페이지 안 폰 틀에, 폰은 전체화면 겹침창에 띄운다.
 *    (Flutter 가 터치를 다 먹어서, 페이지 안에 두면 폰에서 스크롤이 막힌다)
 *  · 앱이 보내는 메시지(SCHEMA §6)로 본 화면 · 체험 시간을 센다.
 */
(function () {
  'use strict';
  var M = window.Moyeo;
  var el = M.el;

  var ICON_WAIT = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/><path d="M12 7.5v4l2.5 1.5"/></svg>';
  var ICON_OFF = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8A15 15 0 0 0 10.6 5"/><path d="M5 12.5a10 10 0 0 1 3.2-2"/><path d="M19 12.5a10 10 0 0 0-2.3-1.6"/><path d="M8.6 16a5 5 0 0 1 6.8 0"/><path d="M12 20h.01"/><path d="m3 3 18 18"/></svg>';

  /**
   * @param {object} o
   *   entry       'user' | 'owner'
   *   frameHost   넓은 화면에서 iframe 을 넣을 요소(.phone-screen). 없으면 늘 겹침창
   *   statsKey    체험 기록을 남길 저장소 키 (없으면 기록 안 함)
   *   nowPrefix   겹침창 위 글씨 ("앱 체험 중")
   *   endLabel    겹침창 아래 버튼 글씨. 없으면 아래 버튼 없음
   *   onEnd       아래 버튼을 눌렀을 때 ({ fromOverlay })
   *   onOpen      처음 열었을 때 (방문 기록용)
   *   onRoute     화면이 바뀔 때 (label, routes)
   *   onMount     iframe 을 만들었을 때 (mode)
   *   onAction    앱 action 이 올 때마다 (label) — 같은 행동 연속 중복도 그대로 넘긴다
   * open(opts): opts.query 는 앱 주소에 덧붙일 꼬리(예: 'go=club&design=b'), opts.opener 는 닫을 때 포커스를 돌려줄 버튼
   */
  function Trial(o) {
    var self = this;
    var stats = (o.statsKey && M.local.get(o.statsKey)) || { opened: false, ms: 0, routes: [], actions: [] };
    if (!Array.isArray(stats.routes)) stats.routes = [];
    if (!Array.isArray(stats.actions)) stats.actions = [];

    var mode = null;            // 'frame' | 'overlay'
    var iframe = null;
    var cover = null;
    var overlay = null;
    var nowLabel = null;
    var opener = null;
    var timers = [];
    var activeSince = null;
    var paused = false;
    var inView = true;
    var ready = false;
    var extra = '';             // open(opts.query) — 앱 주소에 덧붙일 꼬리
    var openerOpt = null;       // open(opts.opener)

    function save() { if (o.statsKey) M.local.set(o.statsKey, stats); }

    function appUrl() {
      return M.root + (M.stub ? 'dev/app-stub.html' : 'app/') + '?entry=' + encodeURIComponent(o.entry || 'user') + (extra ? '&' + extra : '');
    }

    /* ── 시간 재기 ── */
    function shouldRun() {
      if (!iframe || document.visibilityState === 'hidden') return false;
      if (mode === 'overlay') return !!overlay;
      return inView && !paused;
    }
    function tick() {
      var run = shouldRun();
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (run && activeSince === null) activeSince = now;
      else if (!run && activeSince !== null) { stats.ms += now - activeSince; activeSince = null; save(); }
    }
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pagehide', function () { tick(); save(); });

    self.seconds = function () {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      return Math.round((stats.ms + (activeSince !== null ? now - activeSince : 0)) / 1000);
    };
    self.stats = function () { return { opened: stats.opened, seconds: self.seconds(), routes: stats.routes.slice(), actions: stats.actions.slice() }; };
    self.pause = function (p) { paused = !!p; tick(); };
    self.isOverlayOpen = function () { return !!overlay; };
    self.mounted = function () { return !!iframe; };

    /* ── 앱 메시지 ── */
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || typeof d !== 'object' || d.source !== 'moyeo-app') return;
      if (!iframe || e.source !== iframe.contentWindow) return;
      if (d.type === 'ready') markReady();
      else if (d.type === 'route') {
        markReady();
        var label = String(d.label || d.path || '').slice(0, 30);
        if (label && stats.routes.indexOf(label) < 0) { stats.routes.push(label); save(); }
        if (nowLabel && label) nowLabel.textContent = label;
        if (label === '모임 탭') settleHint();
        if (o.onRoute) o.onRoute(label, stats.routes.slice());
      } else if (d.type === 'action') {
        // _행동: 일어난 순서대로. 같은 행동이 연달아 오면 한 번만 (SCHEMA §5, 11-19)
        if (/^club_design/.test(String(d.name || ''))) settleHint();
        var name = String(d.label || d.name || '').slice(0, 30);
        if (name && o.onAction) o.onAction(name);
        if (name && stats.actions[stats.actions.length - 1] !== name && stats.actions.length < 80) { stats.actions.push(name); save(); }
      }
    });

    function markReady() {
      if (ready) return;
      ready = true;
      hideCover();
    }

    /* ── 덮개(불러오는 중 · 준비 중 · 연결 끊김) ── */
    function makeCover(kind) {
      var c = el('div', { class: 'trial-cover', role: 'status' });
      if (kind === 'loading') {
        c.appendChild(el('div', { class: 'loader', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i'), el('i')]));
        c.appendChild(el('h3', { text: '앱을 불러오고 있어요' }));
        c.appendChild(el('p', { text: '처음 한 번은 10초쯤 걸려요. 설치는 필요 없어요.' }));
        if (o.firstHint) c.appendChild(el('p', { class: 'tip', text: o.firstHint }));
        var slow = el('p', { class: 'slow', hidden: true }, ['연결이 느린가 봐요. 조금만 더 기다려 주세요.']);
        if (o.onEnd && o.skipLabel) {
          var skip = el('button', { type: 'button', class: 'textlink', text: o.skipLabel });
          skip.addEventListener('click', function () { end(); });
          slow.appendChild(el('br'));
          slow.appendChild(skip);
        }
        c.appendChild(slow);
        c.slow = slow;
      } else if (kind === 'missing') {
        c.appendChild(el('div', { html: ICON_WAIT }));
        c.appendChild(el('h3', { text: '앱 체험판을 준비하고 있어요' }));
        c.appendChild(el('p', { text: '조금 뒤에 다시 들러 주세요.' + (o.missingNote ? ' ' + o.missingNote : '') }));
        if (o.onEnd && o.endLabel) {
          var b = el('button', { type: 'button', class: 'btn primary', html: o.endLabel + ' <span class="arrow">→</span>' });
          b.addEventListener('click', function () { end(); });
          c.appendChild(b);
        }
      } else {
        c.appendChild(el('div', { html: ICON_OFF }));
        c.appendChild(el('h3', { text: '인터넷 연결을 확인해 주세요' }));
        c.appendChild(el('p', { text: '연결되면 다시 눌러 주세요.' }));
        var r = el('button', { type: 'button', class: 'btn line', text: '다시 시도' });
        // teardownFrame 이 덮개(c)를 떼어 내므로 붙어 있던 자리를 먼저 잡아 둔다
        r.addEventListener('click', function () { var stage = c.parentNode; teardownFrame(); if (stage) mountInto(stage); });
        c.appendChild(r);
      }
      return c;
    }
    function hideCover() {
      timers.forEach(clearTimeout); timers = [];
      if (!cover) return;
      var c = cover;
      cover = null;
      c.classList.add('fade');
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 300);
    }

    /* ── iframe 만들기 (있는지 먼저 확인) ── */
    function check() {
      if (M.stub) return Promise.resolve('ok');
      return fetch(M.root + 'app/index.html', { method: 'HEAD', cache: 'no-store' })
        .then(function (r) { return r.ok ? 'ok' : 'missing'; })
        .catch(function () { return navigator.onLine === false ? 'offline' : 'missing'; });
    }

    function mountInto(stage) {
      ready = false;
      cover = makeCover('loading');
      stage.appendChild(cover);
      check().then(function (state) {
        if (!stage.isConnected) return;
        if (state !== 'ok') {
          if (cover && cover.parentNode) cover.parentNode.removeChild(cover);
          cover = makeCover(state);
          stage.appendChild(cover);
          return;
        }
        iframe = el('iframe', {
          src: appUrl(),
          title: o.entry === 'owner' ? '동네모여 사장님 화면 체험' : '동네모여 앱 체험',
          allow: 'clipboard-write; geolocation',
          referrerpolicy: 'same-origin'
        });
        iframe.addEventListener('load', function () {
          timers.push(setTimeout(markReady, 9000));   // ready 를 안 보내는 앱이어도 덮개는 걷힌다
        });
        stage.insertBefore(iframe, cover);
        timers.push(setTimeout(function () { if (cover && cover.slow) cover.slow.hidden = false; }, 9000));
        timers.push(setTimeout(markReady, 30000));
        if (!stats.opened) { stats.opened = true; save(); }
        if (o.onOpen) o.onOpen();
        if (o.onMount) o.onMount(mode);
        tick();
      });
    }

    function teardownFrame() {
      tick();
      timers.forEach(clearTimeout); timers = [];
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
      if (cover && cover.parentNode) cover.parentNode.removeChild(cover);
      iframe = null; cover = null; ready = false;
      tick();
    }

    /* ── 넓은 화면: 폰 틀 ── */
    function openFrame() {
      mode = 'frame';
      if (iframe) { iframe.focus(); return; }
      var host = o.frameHost;
      host.classList.add('live');
      var stage = host.querySelector('.phone-stage') || host;
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (ents) { inView = ents[0].isIntersecting; tick(); }, { threshold: 0.25 }).observe(host);
      }
      mountInto(stage);
    }

    /* ── 폰: 전체화면 겹침창 ──────────────────────────────────
     * 세로로 [얇은 위 막대 44px] / [앱: 남는 높이 전부] / [얇은 아래 막대 44px]. 막대는 앱 위에 겹치지 않는다
     * — 앱의 앱바와 하단 탭이 늘 다 보인다.
     * 몰입: 위 막대의 ⤢ 를 누르면 두 막대를 숨기고 앱이 화면 전부를 쓴다. 되는 브라우저(안드로이드 크롬 등)는
     * requestFullscreen 도 건다. 안 돼도(iOS · 인앱) CSS 몰입은 된다. 오른쪽 가장자리 손잡이로 돌아온다.
     */
    var ICON_X = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    var ICON_EXPAND = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
    var ICON_X_SM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    var ICON_HANDLE ='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

    var immersive = false;
    var hintEl = null;
    // 첫 안내(firstHint): 모임 탭에 가 보거나 디자인을 바꾸면(또는 30초 뒤) 평소 안내(endHint)로 바뀐다
    function settleHint() { if (hintEl && o.firstHint && hintEl.textContent !== (o.endHint || '')) hintEl.textContent = o.endHint || ''; }
    var fsOn = false;          // 브라우저 전체화면(requestFullscreen)을 걸었나
    var handleTip = null;
    // ⤢ 안내 말풍선 — 겹침창을 처음 열 때 ⤢ 아래에 뜬다. ✕ 를 누르거나 ⤢ 를 한 번 쓰면 사라지고, 이 기기에선 다시 안 나온다
    var FS_TIP_KEY = 'moyeo.trial.fsTip';
    var fsTip = null;
    var fullBtn = null;
    function hideFsTip() {
      M.local.set(FS_TIP_KEY, 1);
      if (fullBtn) fullBtn.classList.remove('attn');
      if (fsTip && fsTip.parentNode) fsTip.parentNode.removeChild(fsTip);
      fsTip = null;
    }

    function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }

    function enterImmersive() {
      if (!overlay || immersive) return;
      if (fsTip) hideFsTip();   // ⤢ 를 써 봤으니 안내는 할 일을 다 했다
      immersive = true;
      overlay.classList.add('immersive');
      var req = overlay.requestFullscreen || overlay.webkitRequestFullscreen;
      fsOn = false;
      if (req) {
        try {
          fsOn = true;
          var p = req.call(overlay, { navigationUI: 'hide' });
          if (p && typeof p.catch === 'function') p.catch(function () { fsOn = false; });   // 거절돼도 CSS 몰입은 그대로
        } catch (e) { fsOn = false; }
      }
      // 처음 한 번만 손잡이 자리를 알려 준다
      if (handleTip && !M.session.get('moyeo.trial.tip')) {
        M.session.set('moyeo.trial.tip', 1);
        handleTip.hidden = false;
        setTimeout(function () { if (handleTip) handleTip.hidden = true; }, 2600);
      }
    }

    function exitImmersive() {
      if (!immersive) return;
      immersive = false;
      if (overlay) overlay.classList.remove('immersive');
      if (handleTip) handleTip.hidden = true;
      if (fsElement()) {
        var x = document.exitFullscreen || document.webkitExitFullscreen;
        try { var p = x.call(document); if (p && typeof p.catch === 'function') p.catch(function () { /* 무시 */ }); } catch (e) { /* 무시 */ }
      }
      fsOn = false;
    }

    // 브라우저 전체화면이 Esc · 뒤로가기로 풀리면 몰입도 함께 푼다(안드로이드 크롬은 뒤로가기를 전체화면 해제에 먼저 쓴다)
    function onFsChange() { if (!fsElement() && immersive && fsOn) exitImmersive(); }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    self.isImmersive = function () { return immersive; };

    function openOverlay() {
      if (overlay) return;
      mode = 'overlay';
      opener = openerOpt || document.activeElement;
      nowLabel = el('b', { text: '' });
      var close = el('button', { type: 'button', class: 'tb-btn', 'aria-label': '체험 닫기', html: ICON_X + '<span>닫기</span>' });
      close.addEventListener('click', function () { self.close(); });
      var full = el('button', { type: 'button', class: 'tb-btn', 'aria-label': '앱을 화면 가득 보기', title: '화면 가득', html: ICON_EXPAND });
      full.addEventListener('click', enterImmersive);
      var stage = el('div', { class: 'trial-stage' });
      var handle = el('button', { type: 'button', class: 'trial-handle', 'aria-label': '막대 다시 보기', html: ICON_HANDLE });
      handle.addEventListener('click', exitImmersive);
      handleTip = el('span', { class: 'trial-tip', hidden: true, text: '여기를 누르면 막대가 돌아와요' });
      var kids = [
        el('div', { class: 'trial-bar' }, [
          close,
          el('div', { class: 'trial-now' }, [el('span', { class: 'live-dot', 'aria-hidden': 'true' }), el('span', { text: o.nowPrefix || '앱 체험 중' }), nowLabel]),
          full
        ]),
        stage
      ];
      if (o.endLabel) {
        var endBtn = el('button', { type: 'button', class: 'trial-end', html: o.endLabel + ' <span class="arrow" aria-hidden="true">→</span>' });
        endBtn.addEventListener('click', function () { end(); });
        hintEl = el('span', { class: 'hint' + (o.firstHint ? ' first' : ''), text: o.firstHint || o.endHint || '' });
        if (o.firstHint) setTimeout(settleHint, 30000);
        kids.push(el('div', { class: 'trial-foot' }, [hintEl, endBtn]));
      }
      kids.push(handle, handleTip);
      fullBtn = full;
      if (!M.local.get(FS_TIP_KEY)) {
        var tipX = el('button', { type: 'button', class: 'fs-tip-x', 'aria-label': '안내 닫기', html: ICON_X_SM });
        tipX.addEventListener('click', hideFsTip);
        fsTip = el('div', { class: 'fs-tip' }, [el('span', { text: '누르면 전체화면으로 볼 수 있어요' }), tipX]);
        full.classList.add('attn');
        kids.push(fsTip);
      }
      overlay = el('div', { class: 'trial-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.entry === 'owner' ? '사장님 화면 체험' : '앱 체험' }, kids);
      document.body.appendChild(overlay);
      document.documentElement.classList.add('lock');
      try { history.pushState({ moyeo: 'trial' }, ''); } catch (e) { /* 무시 */ }
      close.focus();
      mountInto(stage);
    }

    function removeOverlay() {
      if (!overlay) return false;
      exitImmersive();
      handleTip = null;
      fsTip = null;      // 닫기만 하고 ✕ 는 안 눌렀으면 다음에 열 때 또 뜬다
      fullBtn = null;
      hintEl = null;
      teardownFrame();
      overlay.parentNode.removeChild(overlay);
      overlay = null;
      nowLabel = null;
      document.documentElement.classList.remove('lock');
      tick();
      save();
      if (opener && opener.focus) {
        var back = opener;
        var refocus = function () { try { back.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } };
        refocus();
        setTimeout(function () { if (!overlay && back.isConnected && document.activeElement !== back) refocus(); }, 60);   // 떼어 낸 iframe 이 쥔 포커스가 뒤늦게 body 로 풀리는 경우
      }
      return true;
    }

    /** 닫기 — 뒤로가기 한 칸(겹침창용으로 넣어 둔 것)도 함께 걷는다 */
    self.close = function (fromPop) {
      if (!removeOverlay()) return;
      if (!fromPop && history.state && history.state.moyeo === 'trial') { try { history.back(); } catch (e) { /* 무시 */ } }
    };

    function end() {
      var fromOverlay = !!overlay;
      if (overlay) removeOverlay();
      if (o.onEnd) o.onEnd({ fromOverlay: fromOverlay });
    }

    /* 뒤로가기: 몰입 중이면 먼저 몰입만 푼다(겹침창은 그대로 — 뒤로가기 한 칸을 다시 넣어 둔다). 아니면 겹침창을 닫는다. */
    window.addEventListener('popstate', function () {
      if (!overlay) return;
      if (immersive) {
        exitImmersive();
        try { history.pushState({ moyeo: 'trial' }, ''); } catch (e) { /* 무시 */ }
        return;
      }
      self.close(true);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !overlay) return;
      if (immersive) exitImmersive(); else self.close();
    });

    self.open = function (opts) {
      // 꼬리는 영문·숫자·_=&.- 만 받는다
      extra = opts && typeof opts.query === 'string' && /^[A-Za-z0-9_=&.\-]+$/.test(opts.query) ? opts.query : '';
      openerOpt = (opts && opts.opener) || null;
      if (o.frameHost && !o.forceOverlay && M.isDesktopWide()) openFrame();
      else openOverlay();
    };
  }

  M.Trial = Trial;
})();
