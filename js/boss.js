/* 인터뷰 시트 (/boss/) — 가게마다 초안 하나. 이 폰에 바로바로 저장하고, 보내면 대기열로.
 *
 *  저장:  moyeo.boss.drafts   [{ id, contentId, answers, others, createdAt, updatedAt, queuedAt, queuedVer }]
 *         moyeo.boss.current  지금 펼친 초안 id
 *  전송:  kind "boss", sid = "boss-<초안id>" (같은 가게를 고쳐 다시 보내면 세션 칸이 같아 묶어 볼 수 있다)
 */
(function () {
  'use strict';
  var M = window.Moyeo;
  var F = M.Fields;
  var el = M.el;

  var DRAFTS = 'moyeo.boss.drafts';
  var CURRENT = 'moyeo.boss.current';

  var main = M.$('#main');
  var nav = M.$('#secNav');
  var statusEl = M.$('#status');

  var content = null;
  var form = null;
  var nameQ = null;          // 가게 이름으로 쓸 문항 (첫 text 문항)
  var drafts = [];
  var draft = null;
  var state = null;
  var qBoxes = {};           // 문항 id → 상자
  var secBoxes = [];
  var sendBox = null;
  var savedAt = null;

  /* ── 꼭 물을 것만: 켜 두면 must 가 아닌 문항을 숨긴다. 답한 문항 · showIf · G 구간(인터뷰 후 메모)은 그대로 ── */
  var MUST_ONLY = 'moyeo.boss.mustOnly';
  var mustOnly = M.local.get(MUST_ONLY) !== false;   // 처음엔 켜짐
  var keep = {};             // 이번에 보였던 답한 문항 — 답을 지워도 손가락 밑에서 사라지지 않게
  var ALWAYS_SEC = { G: true };

  function shown(q) {
    if (!F.isVisible(q, form, state)) return false;
    if (!mustOnly || q.must || ALWAYS_SEC[q.section.id]) return true;
    if (q.type !== 'info' && F.answered(q, state)) keep[q.id] = true;
    return !!keep[q.id];
  }
  function shownList() { return form.list.filter(shown); }

  /* ── 시연: 사장님 화면 전체화면 ── */
  var demo = new M.Trial({
    entry: 'owner',
    forceOverlay: true,
    nowPrefix: '사장님 화면 ·',
    endLabel: '시트로',
    endHint: '시연 끝나면',
    onEnd: function () { if (history.state && history.state.moyeo === 'trial') history.back(); }
  });
  M.$('#demoBtn').addEventListener('click', function () { demo.open(); });

  /* ── 초안 ── */
  function loadDrafts() {
    var d = M.local.get(DRAFTS);
    drafts = Array.isArray(d) ? d : [];
  }
  function saveDrafts() { M.local.set(DRAFTS, drafts); }

  function newDraft() {
    var d = { id: Date.now().toString(36) + M.rand(4), contentId: content.id, answers: {}, others: {}, createdAt: Date.now(), updatedAt: Date.now() };
    drafts.unshift(d);
    saveDrafts();
    return d;
  }

  function answeredCount(d) {
    var s = { answers: d.answers || {}, others: d.others || {} };
    return F.visibleList(form, s).filter(function (q) { return q.type !== 'info' && F.answered(q, s); }).length;
  }

  function draftLabel(d) {
    var n = nameQ && d.answers && d.answers[nameQ.id];
    if (n && String(n).trim()) return String(n).trim().slice(0, 40);
    return '이름 없는 가게 · ' + M.time(d.createdAt);
  }

  function pendingFor(d) {
    var box = M.local.get('moyeo.outbox');
    return Array.isArray(box) && box.some(function (x) { return x.meta && x.meta.draftId === d.id; });
  }

  /** 'none' · 'wait'(대기열) · 'sent' · 'edited'(보낸 뒤 고침) */
  function sendStatus(d) {
    if (!d.queuedAt) return 'none';
    if (pendingFor(d)) return 'wait';
    if (d.updatedAt > d.queuedVer) return 'edited';
    return 'sent';
  }

  function openDraft(d) {
    draft = d;
    state = { answers: d.answers || (d.answers = {}), others: d.others || (d.others = {}) };
    M.local.set(CURRENT, d.id);
    savedAt = d.updatedAt;
    keep = {};
    drawSheet();
    paintTop();
    window.scrollTo(0, 0);
  }

  var saveTimer = null;
  function touch() {
    draft.updatedAt = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveDrafts();
      savedAt = Date.now();
      paintTop();
    }, 300);
  }
  window.addEventListener('pagehide', function () { if (draft) saveDrafts(); });

  /* ── 머리 · 상태 ── */
  function paintTop() {
    if (!draft) return;
    M.$('#draftName').textContent = draftLabel(draft);
    M.$('#draftCount').textContent = drafts.length > 1 ? '가게 ' + drafts.length : '';
    var pending = M.outboxCount();
    var cls = 'bz-status';
    var txt;
    if (!M.persist) {
      // 이 브라우저는 저장이 막혀 있다(사생활 모드 등) — 창을 닫으면 사라진다는 것을 숨기지 않는다
      cls += ' off';
      txt = '이 브라우저는 저장이 막혀 있어요 — 창을 닫으면 사라져요. 끝나면 바로 보내세요' + (pending ? ' · 보낼 것 ' + pending + '건' : '');
    } else if (navigator.onLine === false) {
      cls += ' off';
      txt = '오프라인 — 이 기기에 저장 중' + (pending ? ' · 보낼 것 ' + pending + '건 대기' : '');
    } else if (pending) {
      cls += ' wait';
      txt = '보낼 것 ' + pending + '건 대기 — 연결되면 자동으로 보내요';
    } else if (savedAt) {
      txt = '이 기기에 저장됨 ' + M.time(savedAt).split(' ')[1];
    } else {
      cls += ' idle';
      txt = '탭하면 바로 이 기기에 저장돼요';
    }
    statusEl.className = cls;
    statusEl.textContent = txt;
    paintSend();
  }
  window.addEventListener('online', paintTop);
  window.addEventListener('offline', paintTop);
  M.on('outbox', paintTop);
  M.on('sent', function () { paintTop(); if (!M.$('#sheet').hidden) drawList(); });

  /* ── 시트 그리기 ── */
  function drawSheet() {
    main.innerHTML = '';
    nav.innerHTML = '';
    qBoxes = {};
    secBoxes = [];

    main.appendChild(el('div', { class: 'bz-head' }, [
      el('h1', { text: content.title || '인터뷰 시트' }),
      content.intro ? el('p', { class: 'intro', text: content.intro }) : null,
      content.notice ? el('p', { class: 'notice', text: content.notice }) : null,
      el('p', { class: 'bz-meta', text: '시작 ' + M.time(draft.createdAt) + ' · ' + (draft.contentId || content.id) })
    ]));

    (content.sections || []).forEach(function (sec, si) {
      var secEl = el('section', { class: 'bz-sec', id: 'sec-' + sec.id, 'aria-labelledby': 'sh-' + sec.id });
      var count = el('span', { class: 'sec-n' });
      secEl.appendChild(el('h2', { id: 'sh-' + sec.id }, [el('span', { class: 'sec-id', text: sec.id }), sec.title || '', count]));
      if (sec.say && String(sec.say).trim()) {
        secEl.appendChild(el('div', { class: 'say' }, [
          el('span', { class: 'say-tag', html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12z"/></svg>이렇게 말해요' }),
          el('p', { text: sec.say })
        ]));
      }
      form.list.filter(function (q) { return q.sectionIndex === si; }).forEach(function (q) {
        var box = drawQuestion(q);
        qBoxes[q.id] = box;
        secEl.appendChild(box);
      });
      main.appendChild(secEl);

      var chip = el('a', { href: '#sec-' + sec.id }, [el('b', { text: sec.id }), shortTitle(sec.title), el('span', { class: 'n' })]);
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        secEl.scrollIntoView({ behavior: M.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
        try { history.replaceState(history.state, '', '#sec-' + sec.id); } catch (er) { /* 무시 */ }
      });
      nav.appendChild(chip);
      secBoxes.push({ sec: sec, el: secEl, chip: chip, count: count, index: si });
    });

    sendBox = el('section', { class: 'bz-send', id: 'send', 'aria-labelledby': 'sendTitle' });
    main.appendChild(sendBox);

    applyVisibility();
    paintCounts();
    watchSections();
  }

  function shortTitle(t) {
    t = String(t || '');
    var cut = t.split(/\s[·—-]\s|\s\(/)[0];
    return cut.length > 12 ? cut.slice(0, 11) + '…' : cut;
  }

  var NOTE_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';

  function drawQuestion(q) {
    var box = el('div', { class: 'bz-q' + (q.type === 'info' ? ' info' : ''), id: 'q-' + q.id });
    var head = el('div', { class: 'bz-qhead' }, [el('span', { class: 'q-id', text: q.id }), el('h3', { text: q.text })]);
    if (q.must) head.appendChild(el('span', { class: 'must', text: '꼭 물어요' }));
    if (q.required) head.appendChild(el('span', { class: 'req', text: '필수' }));
    box.appendChild(head);
    if (q.note) box.appendChild(el('p', { class: 'note' }, [el('span', { html: NOTE_ICON }), el('span', { text: q.note })]));

    if (q.type === 'info') {
      if (q.help) box.appendChild(el('div', { class: 'bz-info', text: q.help }));
      return box;
    }
    if (q.help) box.appendChild(el('p', { class: 'help', text: q.help }));

    var err = el('p', { class: 'err', role: 'alert' });
    var ctl = F.render(q, state, function () {
      err.textContent = '';
      box.classList.remove('missing');
      touch();
      applyVisibility();
      paintCounts();
      if (nameQ && q.id === nameQ.id) M.$('#draftName').textContent = draftLabel(draft);
    });
    // 짧은 보기는 칩처럼 줄 바꿈 — 한 화면에 더 많이, 탭 영역은 그대로
    var list = ctl.querySelector('.opts');
    if (list && (q.type === 'single' || q.type === 'multi')) {
      var opts = q.options.concat(q.other ? ['기타 (직접 입력)'] : []);
      var longest = opts.reduce(function (m, o) { return Math.max(m, o.length); }, 0);
      if (longest <= 14) list.classList.add('chips');
    }
    box.appendChild(ctl);
    box.appendChild(err);
    box.err = err;
    return box;
  }

  function applyVisibility() {
    form.list.forEach(function (q) {
      var box = qBoxes[q.id];
      if (box) box.hidden = !shown(q);
    });
  }

  function paintCounts() {
    secBoxes.forEach(function (s) {
      var qs = shownList().filter(function (q) { return q.sectionIndex === s.index && q.type !== 'info'; });
      var done = qs.filter(function (q) { return F.answered(q, state); }).length;
      s.count.textContent = done + ' / ' + qs.length;
      s.chip.querySelector('.n').textContent = done + '/' + qs.length;
      s.chip.classList.toggle('full', qs.length > 0 && done === qs.length);
    });
    paintSend();
  }

  /* 지금 보고 있는 구간을 바로가기에 표시 */
  var observer = null;
  function watchSections() {
    if (observer) observer.disconnect();
    if (!('IntersectionObserver' in window)) return;
    var visible = {};
    observer = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { visible[e.target.id] = e.isIntersecting ? e.boundingClientRect.top : null; });
      var best = null;
      secBoxes.forEach(function (s) { if (visible[s.el.id] !== null && visible[s.el.id] !== undefined && best === null) best = s; });
      secBoxes.forEach(function (s) {
        var on = s === best;
        if (on && !s.chip.classList.contains('on')) {
          try { s.chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' }); } catch (e) { /* 무시 */ }
          // scrollIntoView 가 세로로 움직이지 않게 inline 만 쓴다(nearest)
        }
        s.chip.classList.toggle('on', on);
      });
    }, { rootMargin: '-130px 0px -55% 0px' });
    secBoxes.forEach(function (s) { observer.observe(s.el); });
  }

  /* ── 보내기 ── */
  function problems() {
    var out = [];
    F.visibleList(form, state).forEach(function (q) {
      var msg = F.validate(q, state);
      if (msg) out.push({ q: q, msg: msg });
    });
    return out;
  }

  function paintSend() {
    if (!sendBox || !draft) return;
    sendBox.innerHTML = '';
    var n = answeredCount(draft);
    var total = shownList().filter(function (q) { return q.type !== 'info'; }).length;
    var st = sendStatus(draft);
    var probs = problems();

    sendBox.appendChild(el('h2', { id: 'sendTitle', text: '시트로 보내기' }));
    sendBox.appendChild(el('p', { class: 'sum num', text: '답한 칸 ' + n + ' / ' + total + ' · 빈칸은 비워 둔 채로 가요' }));

    if (probs.length) {
      var miss = el('div', { class: 'bz-missing' });
      probs.slice(0, 12).forEach(function (p) {
        var a = el('a', { href: '#q-' + p.q.id, text: p.q.id + ' ' + p.msg });
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var box = qBoxes[p.q.id];
          if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); box.classList.add('missing'); box.err.textContent = p.msg; }
        });
        miss.appendChild(a);
      });
      sendBox.appendChild(miss);
    }

    var label = st === 'sent' ? '보냄 — 다시 보내기' : st === 'edited' ? '고친 내용 다시 보내기' : st === 'wait' ? '보내는 중…' : '시트로 보내기';
    var btn = el('button', { type: 'button', class: 'btn primary block', text: label });
    if (!n || probs.length || st === 'wait') btn.disabled = true;
    btn.addEventListener('click', send);
    sendBox.appendChild(btn);

    var stateMsg = el('p', { class: 'state', role: 'status' });
    if (st === 'wait') { stateMsg.className = 'state wait'; stateMsg.textContent = !M.persist ? '보내는 중이에요. 이 브라우저는 저장이 막혀 있어서, 다 갈 때까지 이 창을 닫지 마세요.' : navigator.onLine === false ? '오프라인이에요. 이 기기에 넣어 뒀다가 연결되면 자동으로 보내요.' : '보내는 중이에요. 창을 닫아도 다음에 열 때 이어서 보내요.'; }
    else if (st === 'sent') { stateMsg.className = 'state ok'; stateMsg.textContent = '보냄 ' + M.time(draft.queuedAt) + ' — 시트 \'사장님 인터뷰\' 탭에 한 줄로 쌓였어요.'; }
    else if (st === 'edited') { stateMsg.className = 'state wait'; stateMsg.textContent = '보낸 뒤(' + M.time(draft.queuedAt) + ') 고친 내용이 있어요.\n다시 보내면 시트에 새 줄로 쌓여요(세션 칸이 같아요).'; }
    else if (!n) stateMsg.textContent = '아직 답한 칸이 없어요.';
    else if (probs.length) { stateMsg.className = 'state bad'; stateMsg.textContent = '위 빨간 칸을 먼저 채워 주세요.'; }
    sendBox.appendChild(stateMsg);

    if (st === 'sent' && content.outro) {
      sendBox.appendChild(el('div', { class: 'bz-done' }, [
        el('h3', { text: content.outro.title || '기록했어요' }),
        content.outro.body ? el('p', { text: content.outro.body }) : null
      ]));
    }

    var demoBtn = el('button', { type: 'button', class: 'btn line block bz-demo', text: '사장님 화면 시연' });
    demoBtn.addEventListener('click', function () { demo.open(); });
    sendBox.appendChild(demoBtn);
    var next = el('button', { type: 'button', class: 'btn ghost block', text: '+ 새 가게 시작' });
    next.addEventListener('click', function () { openDraft(newDraft()); });
    sendBox.appendChild(next);
  }

  function send() {
    var probs = problems();
    if (probs.length) { paintSend(); return; }
    saveDrafts();
    var answers = F.flatten(form, state);
    answers['_버전'] = draft.contentId || content.id;   // 이 초안을 만든 문항 판
    var sid = (M.sid.indexOf('agent-test-') === 0 ? 'agent-test-' : '') + 'boss-' + draft.id;
    M.submit('boss', answers, { sid: sid, meta: { draftId: draft.id } });
    draft.queuedAt = Date.now();
    draft.queuedVer = draft.updatedAt;
    saveDrafts();
    paintTop();
  }

  /* ── 가게 목록 ── */
  var sheet = M.$('#sheet');
  var back = M.$('#sheetBack');
  var sheetOpener = null;
  function openList() {
    sheetOpener = document.activeElement;
    drawList();
    sheet.hidden = false;
    back.hidden = false;
    document.documentElement.classList.add('lock');
    M.$('#sheetClose').focus();
  }
  function closeList() {
    sheet.hidden = true;
    back.hidden = true;
    document.documentElement.classList.remove('lock');
    if (sheetOpener && sheetOpener.focus) sheetOpener.focus();
  }
  M.$('#draftsBtn').addEventListener('click', openList);
  M.$('#sheetClose').addEventListener('click', closeList);
  back.addEventListener('click', closeList);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) closeList(); });
  if (!M.persist) M.$('.bz-sheet-sub').textContent = '이 브라우저는 저장이 막혀 있어서 창을 닫으면 목록이 사라져요. 인터뷰가 끝나면 바로 보내 주세요.';
  M.$('#newDraft').addEventListener('click', function () { closeList(); openDraft(newDraft()); });

  function drawList() {
    var ul = M.$('#draftList');
    ul.innerHTML = '';
    drafts.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).forEach(function (d) {
      var st = sendStatus(d);
      var tag = st === 'sent' ? el('span', { class: 'tag ok', text: '· 보냄' }) :
        st === 'wait' ? el('span', { class: 'tag wait', text: '· 보낼 것 대기' }) :
        st === 'edited' ? el('span', { class: 'tag edit', text: '· 보낸 뒤 고침' }) : null;
      var open = el('button', { type: 'button', class: 'open' + (draft && d.id === draft.id ? ' cur' : '') }, [
        el('b', { text: draftLabel(d) }),
        el('span', {}, ['답 ' + answeredCount(d) + '칸 · ' + M.time(d.updatedAt) + ' 고침 ', tag])
      ]);
      open.addEventListener('click', function () { closeList(); openDraft(d); });
      var del = el('button', { type: 'button', class: 'del', text: '지우기', 'aria-label': draftLabel(d) + ' 지우기' });
      var armed = null;
      del.addEventListener('click', function () {
        if (!armed) {
          del.classList.add('confirm');
          del.textContent = '정말 지우기';
          armed = setTimeout(function () { armed = null; del.classList.remove('confirm'); del.textContent = '지우기'; }, 3000);
          return;
        }
        clearTimeout(armed);
        drafts = drafts.filter(function (x) { return x.id !== d.id; });
        saveDrafts();
        if (draft && draft.id === d.id) openDraft(drafts.find(function (x) { return x.contentId === content.id; }) || newDraft());
        drawList();
        paintTop();
      });
      ul.appendChild(el('li', {}, [open, del]));
    });
  }

  /* ── 꼭 물을 것만 켜고 끄기 ── */
  var mustBtn = M.$('#mustBtn');
  function paintMust() { mustBtn.setAttribute('aria-checked', mustOnly ? 'true' : 'false'); }
  paintMust();

  // 켜고 끌 때 보던 자리가 튀지 않게: 화면에 보이던 것 중 그대로 남는 첫 요소를 같은 높이에 둔다
  function viewAnchor() {
    var top = M.$('.bz-top').getBoundingClientRect().bottom;
    var out = [];
    secBoxes.forEach(function (s) {
      var r = s.el.getBoundingClientRect();
      if (r.bottom <= top || r.top >= window.innerHeight) return;
      [s.el.querySelector('h2')].concat(M.$$('.bz-q', s.el)).forEach(function (n) {
        if (n.hidden) return;
        var b = n.getBoundingClientRect();
        if (b.bottom > top && b.top < window.innerHeight) out.push({ el: n, top: b.top });
      });
      out.push({ el: s.el, top: r.top });
    });
    return out;
  }
  function restoreAnchor(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].el.hidden) continue;
      window.scrollBy(0, list[i].el.getBoundingClientRect().top - list[i].top);
      return;
    }
  }

  mustBtn.addEventListener('click', function () {
    mustOnly = !mustOnly;
    M.local.set(MUST_ONLY, mustOnly);
    paintMust();
    if (!form || !draft) return;
    var anchor = viewAnchor();
    keep = {};
    applyVisibility();
    paintCounts();
    restoreAnchor(anchor);
  });

  /* ── QR: 사장님 폰으로 찍을 설문 주소. 흰 바탕 전체화면, 뒤로가기 · Esc · [닫기] 로 닫는다 ── */
  var QR_URL = 'https://gyeomssoo.github.io/moyeo-boss/';
  var qr = M.$('#qr');
  var qrMsg = M.$('#qrMsg');
  var qrOpener = null;
  function openQr() {
    if (!qr.hidden) return;
    qrOpener = document.activeElement;
    qrMsg.className = 'bz-qr-msg';
    qrMsg.textContent = '';
    qr.hidden = false;
    document.documentElement.classList.add('lock');
    try { history.pushState({ moyeo: 'qr' }, ''); } catch (e) { /* 무시 */ }
    M.$('#qrClose').focus();
  }
  function hideQr() {
    if (qr.hidden) return false;
    qr.hidden = true;
    document.documentElement.classList.remove('lock');
    if (qrOpener && qrOpener.focus) qrOpener.focus();
    return true;
  }
  /** 닫기 — 열 때 넣어 둔 뒤로가기 한 칸도 함께 걷는다 */
  function closeQr() {
    if (!hideQr()) return;
    if (history.state && history.state.moyeo === 'qr') { try { history.back(); } catch (e) { /* 무시 */ } }
  }
  M.$('#qrBtn').addEventListener('click', openQr);
  M.$('#qrClose').addEventListener('click', closeQr);
  window.addEventListener('popstate', function () { hideQr(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !qr.hidden) closeQr(); });

  function copyText(t) {
    function legacy() {
      return new Promise(function (res, rej) {
        var ta = el('textarea', { readonly: true, style: 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0' });
        ta.value = t;
        qr.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        qr.removeChild(ta);
        if (ok) res(); else rej(new Error('copy'));
      });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(legacy);
    return legacy();
  }
  function copyLink() {
    copyText(QR_URL).then(function () {
      qrMsg.className = 'bz-qr-msg ok';
      qrMsg.textContent = '링크를 복사했어요. 문자나 카톡 창에 붙여 넣어 보내 주세요.';
    }, function () {
      qrMsg.className = 'bz-qr-msg bad';
      qrMsg.textContent = '복사가 안 됐어요. 위 주소를 길게 눌러 복사해 주세요.';
    });
  }
  M.$('#qrShare').addEventListener('click', function () {
    if (navigator.share) {
      navigator.share({ title: '동네모여 사장님 2분 설문', text: '동네모여 사장님 2분 설문이에요.', url: QR_URL })
        .catch(function (e) { if (!e || e.name !== 'AbortError') copyLink(); });
      return;
    }
    copyLink();
  });

  /* ── 시작 ── */
  // 끊긴 곳에서 새로고침해도 열리게: 서비스 워커(/boss/sw.js) + 마지막으로 받은 문항 사본
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || M.isLocal) && location.protocol !== 'file:') {
    try { navigator.serviceWorker.register('sw.js').catch(function () { /* 무시 */ }); } catch (e) { /* 무시 */ }
  }
  var CACHED = 'moyeo.boss.content' + (M.sample ? '.sample' : '');
  M.loadContent('boss').then(function (c) {
    M.local.set(CACHED, c);
    return c;
  }, function (err) {
    var c = M.local.get(CACHED);
    if (c) { console.info('[시트] 연결이 안 돼서 마지막으로 받은 문항을 써요'); return c; }
    throw err;
  }).then(function (c) {
    content = c;
    form = F.normalize(c);
    nameQ = form.list.filter(function (q) { return q.type === 'text'; })[0] || null;
    loadDrafts();
    var curId = M.local.get(CURRENT);
    var d = drafts.find(function (x) { return x.id === curId && x.contentId === c.id; }) ||
      drafts.find(function (x) { return x.contentId === c.id && x.updatedAt === x.createdAt; }) ||
      newDraft();
    openDraft(d);
    if (location.hash && /^#(sec|q)-/.test(location.hash)) {
      var t = document.getElementById(location.hash.slice(1));
      if (t) setTimeout(function () { t.scrollIntoView(); }, 50);
    }
  }).catch(function (err) {
    console.warn('[시트] 문항을 못 불러왔어요', err);
    main.innerHTML = '';
    main.appendChild(el('div', { class: 'bz-loading' }, [
      el('h2', { text: '시트를 못 불러왔어요' }),
      el('p', { text: navigator.onLine === false ? '인터넷이 끊겨 있어요. 한 번 열었던 폰이면 연결된 뒤 다시 열어 주세요.' : 'content/boss.json 이 아직 없거나 깨져 있어요.' })
    ]));
  });
})();
