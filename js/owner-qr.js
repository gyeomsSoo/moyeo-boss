/* 사장님 QR 설문 (moyeo-boss 첫 화면) — 사장님이 인터뷰 끝에 QR 을 찍고 자기 폰으로 들어온다.
 *
 *  차례: 소개(owner-intro.json) → 2분 설문(owner-qr.json, 한 페이지) → 더 알아보기(소개의 steps · points · faq · contact)
 *  저장:  moyeo.qr.progress  { contentId, answers, others }  쓰는 대로 바로 — 실수로 새로고침해도 남는다
 *         moyeo.qr.done      { contentId, at, id }           보낸 뒤 다시 열면 고맙습니다 화면
 *  전송:  인터뷰 시트(boss.js send)와 똑같이 F.flatten → kind "boss". 같은 '사장님 인터뷰' 탭 · 같은 열 이름에 쌓이고,
 *         _버전(= owner-qr-v1)으로 QR 설문인 줄 구분한다. sid = "boss-qr-<무작위>" (?test=1 이면 앞에 agent-test-)
 *  방문 · 체험 기록은 보내지 않는다 (core.js 의 M.visit 도 비워 둠).
 */
(function () {
  'use strict';
  var M = window.Moyeo;
  var F = M.Fields;
  var el = M.el;
  var main = M.$('#main');

  var PROGRESS = 'moyeo.qr.progress';
  var DONE = 'moyeo.qr.done';

  var intro = null;
  var content = null;
  var form = null;
  var state = null;
  var survey = null;         // 설문 구간 (#survey)
  var qBoxes = {};           // 문항 id → 상자
  var doneView = null;       // { el: 상태 글, done } — 고맙습니다 화면의 보내기 상태
  var lastErr = null;

  var demo = new M.Trial({
    entry: 'owner',
    forceOverlay: true,
    nowPrefix: '사장님 화면 ·',
    endLabel: '돌아가기',
    endHint: '다 둘러보셨으면',
    onEnd: function () { if (history.state && history.state.moyeo === 'trial') history.back(); }
  });

  var CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var CHECK_BIG = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /** 겸수님이 채울 자리({이름} 같은)가 그대로면 보여 주지 않는다 */
  function filled(v) { return typeof v === 'string' && v.trim() && !/^\{.*\}$/.test(v.trim()); }

  function scrollToEl(n, block) {
    if (n) n.scrollIntoView({ behavior: M.reducedMotion() ? 'auto' : 'smooth', block: block || 'start' });
  }

  /* ── 진행 저장 ── */
  var saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    if (state && content) M.local.set(PROGRESS, { contentId: content.id, answers: state.answers, others: state.others, at: Date.now() });
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  window.addEventListener('pagehide', saveNow);

  function freshState() {
    var p = M.local.get(PROGRESS);
    var s = { answers: {}, others: {} };
    if (p && p.contentId === content.id && p.answers && typeof p.answers === 'object') {
      s.answers = p.answers;
      s.others = p.others && typeof p.others === 'object' ? p.others : {};
      F.sanitize(form, s);   // 지금 문항 · 보기에 없는 옛 값은 버린다
    }
    return s;
  }

  /* ── 맨 위: 소개 ── */
  function drawHero() {
    var c = intro || {};
    var go = el('button', { type: 'button', class: 'btn primary block', html: '2분 설문 하기 <span class="arrow" aria-hidden="true">→</span>' });
    go.addEventListener('click', function () { scrollToEl(survey); });
    var look = el('button', { type: 'button', class: 'btn line block', text: '사장님 화면 둘러보기' });
    look.addEventListener('click', function () { demo.open(); });
    return el('section', { class: 'ow-hero' }, [
      el('p', { class: 'ow-eyebrow', text: '동네 가게 사장님께' }),
      el('h1', { text: c.title || '사장님, 동네모여를 소개합니다' }),
      c.lead ? el('p', { class: 'ow-lead', text: c.lead }) : null,
      el('div', { class: 'qr-cta' }, [go, look, c.cta && c.cta.note ? el('p', { class: 'note', text: c.cta.note }) : null])
    ]);
  }

  /* ── 설문 ── */
  function drawSurvey() {
    survey.innerHTML = '';
    qBoxes = {};
    doneView = null;
    var done = M.local.get(DONE);
    if (done && done.contentId === content.id) { drawDone(done); return; }

    survey.appendChild(el('div', { class: 'qr-head' }, [
      el('h2', { id: 'h-survey', text: content.title || '사장님 2분 설문' }),
      content.intro ? el('p', { class: 'qr-intro', text: content.intro }) : null,
      content.notice ? el('p', { class: 'qr-notice', text: content.notice }) : null
    ]));

    var secs = content.sections || [];
    secs.forEach(function (sec, si) {
      var secEl = el('div', { class: 'qr-sec', role: 'group', 'aria-labelledby': 'qs-' + sec.id });
      secEl.appendChild(el('h3', { class: 'qr-sec-title', id: 'qs-' + sec.id }, [
        el('span', { class: 'no', text: (si + 1) + ' / ' + secs.length }), sec.title || ''
      ]));
      form.list.filter(function (q) { return q.sectionIndex === si; }).forEach(function (q) {
        var box = drawQuestion(q);
        qBoxes[q.id] = box;
        secEl.appendChild(box);
      });
      survey.appendChild(secEl);
    });

    var msg = el('p', { class: 'qr-msg', role: 'alert' });
    var btn = el('button', { type: 'button', class: 'btn primary block qr-submit', text: '보내기' });
    btn.addEventListener('click', function () { submit(msg); });
    survey.appendChild(el('div', { class: 'qr-send' }, [
      msg,
      btn,
      M.persist ? el('p', { class: 'qr-send-note', text: '인터넷이 약해도 괜찮아요. 이 폰에 넣어 뒀다가 연결되면 보내요.' }) : null
    ]));

    applyVisibility();
  }

  function drawQuestion(q) {
    var box = el('div', { class: 'qr-q' + (q.type === 'info' ? ' info' : ''), id: 'q-' + q.id });
    var head = el('div', { class: 'qr-qhead' }, [el('h4', { text: q.text })]);
    if (q.required) head.appendChild(el('span', { class: 'req', text: '필수' }));
    box.appendChild(head);

    if (q.type === 'info') {
      if (q.help) box.appendChild(el('div', { class: 'qr-info', text: q.help }));
      return box;
    }
    if (q.help) box.appendChild(el('p', { class: 'help', text: q.help }));

    var err = el('p', { class: 'err', role: 'alert' });
    var ctl = F.render(q, state, function () {
      err.textContent = '';
      box.classList.remove('missing');
      save();
      applyVisibility();
    });
    // 아주 짧은 보기(예 · 아니오 같은)는 두 칸씩
    var list = ctl.querySelector('.opts');
    if (list && (q.type === 'single' || q.type === 'multi')) {
      var opts = q.options.concat(q.other ? ['기타 (직접 입력)'] : []);
      var longest = opts.reduce(function (m, o) { return Math.max(m, o.length); }, 0);
      if (longest <= 6) list.classList.add('two');
    }
    box.appendChild(ctl);
    box.appendChild(err);
    box.err = err;
    return box;
  }

  function applyVisibility() {
    form.list.forEach(function (q) {
      var box = qBoxes[q.id];
      if (box) box.hidden = !F.isVisible(q, form, state);
    });
  }

  function problems() {
    var out = [];
    F.visibleList(form, state).forEach(function (q) {
      var m = F.validate(q, state);
      if (m) out.push({ q: q, msg: m });
    });
    return out;
  }

  function submit(msg) {
    var probs = problems();
    Object.keys(qBoxes).forEach(function (id) {
      var b = qBoxes[id];
      if (b.err) { b.err.textContent = ''; b.classList.remove('missing'); }
    });
    if (probs.length) {
      probs.forEach(function (p) {
        var b = qBoxes[p.q.id];
        if (b && b.err) { b.classList.add('missing'); b.err.textContent = p.msg; }
      });
      msg.textContent = '빨간 글씨로 표시한 ' + probs.length + '곳을 먼저 채워 주세요.';
      scrollToEl(qBoxes[probs[0].q.id], 'center');
      return;
    }
    msg.textContent = '';
    // 인터뷰 시트(boss.js send)와 같은 모양: 문항 id → 시트 열 이름(key), 숨겨진 문항 · 빈 답 · info 는 빠진다
    var answers = F.flatten(form, state);
    answers['_버전'] = content.id;
    var sid = (M.sid.indexOf('agent-test-') === 0 ? 'agent-test-' : '') + 'boss-qr-' + M.rand(10);
    var id = M.submit('boss', answers, { sid: sid, meta: { kind: 'boss' } });
    M.local.set(DONE, { contentId: content.id, at: Date.now(), id: id });
    clearTimeout(saveTimer);
    M.local.del(PROGRESS);
    state = null;
    drawSurvey();
    survey.scrollIntoView();   // 긴 설문이 짧은 카드로 바뀌었으니 부드럽게 말고 바로 (중간 내용이 휙 지나가지 않게)
  }

  /* ── 보낸 뒤: 고맙습니다 ── */
  function drawDone(done) {
    var o = content.outro || {};
    var status = el('p', { class: 'qr-status', role: 'status', 'aria-live': 'polite' });
    var again = el('button', { type: 'button', class: 'textlink', text: '한 번 더 쓰기' });
    again.addEventListener('click', function () {
      M.local.del(DONE);
      state = freshState();
      drawSurvey();
      survey.scrollIntoView();
    });
    survey.appendChild(el('div', { class: 'qr-done' }, [
      el('span', { class: 'ck', html: CHECK_BIG }),
      el('h2', { id: 'h-survey', text: o.title || '말씀 고맙습니다' }),
      o.body ? el('p', { class: 'body', text: o.body }) : null,
      status,
      el('p', { class: 'qr-again' }, [el('span', { text: '다른 분도 쓰시나요? ' }), again])
    ]));
    doneView = { el: status, done: done };
    paintStatus();
  }

  function pending(id) {
    var box = M.local.get('moyeo.outbox');
    return Array.isArray(box) && box.some(function (x) { return x && x.id === id; });
  }

  function paintStatus() {
    if (!doneView || !doneView.el.isConnected) return;
    var s = doneView.el;
    if (doneView.rejected) {
      s.className = 'qr-status bad';
      s.textContent = '죄송해요, 보내지 못했어요. 번거로우시겠지만 아래 연락처로 알려 주세요.';
    } else if (doneView.done.id && pending(doneView.done.id)) {
      s.className = 'qr-status wait';
      s.textContent = (navigator.onLine === false || lastErr)
        ? '인터넷이 약해서 아직 못 보냈어요. 이 화면을 잠깐 열어 두시면 연결될 때 보내요.'
        : '보내는 중이에요…';
    } else {
      s.className = 'qr-status ok';
      s.textContent = '잘 보냈어요.';
    }
  }
  M.on('outbox', function (d) { lastErr = d && d.error ? d.error : null; paintStatus(); });
  M.on('sent', paintStatus);
  M.on('rejected', function (d) {
    if (doneView && d && d.item && d.item.id === doneView.done.id) doneView.rejected = true;
    paintStatus();
  });
  window.addEventListener('online', paintStatus);
  window.addEventListener('offline', paintStatus);

  /* ── 아래: 더 알아보기 (owner.js 와 같은 그림) ── */
  function ctaBlock(c) {
    var b = el('button', { type: 'button', class: 'btn primary block', html: (c.label || '사장님 화면 둘러보기') + ' <span class="arrow">→</span>' });
    b.addEventListener('click', function () { demo.open(); });
    return el('div', { class: 'ow-cta' }, [b, c.note ? el('p', { class: 'note', text: c.note }) : null]);
  }

  function drawMore(c) {
    var wrap = el('div', { class: 'qr-more', id: 'more' }, [el('p', { class: 'qr-more-title', text: '더 알아보기' })]);

    if (c.steps && c.steps.length) {
      var ol = el('ol', { class: 'ow-steps' });
      c.steps.forEach(function (s, i) {
        ol.appendChild(el('li', {}, [
          el('span', { class: 'no', 'aria-hidden': 'true', text: String(i + 1) }),
          el('div', {}, [el('h3', {}, [el('span', { class: 'sr-only', text: (i + 1) + '단계: ' }), s.title || '']), s.body ? el('p', { text: s.body }) : null])
        ]));
      });
      wrap.appendChild(el('section', { class: 'ow-sec', 'aria-labelledby': 'h-steps' }, [el('h2', { id: 'h-steps', text: '이렇게 돌아가요' }), ol]));
    }

    if (c.points && c.points.length) {
      var ul = el('ul', { class: 'ow-points' });
      c.points.forEach(function (p) {
        ul.appendChild(el('li', {}, [
          el('span', { class: 'ck', html: CHECK }),
          el('div', {}, [el('h3', { text: p.title || '' }), p.body ? el('p', { text: p.body }) : null])
        ]));
      });
      wrap.appendChild(el('section', { class: 'ow-sec', 'aria-labelledby': 'h-points' }, [el('h2', { id: 'h-points', text: '사장님께 좋은 점' }), ul]));
    }

    if (c.faq && c.faq.length) {
      var faq = el('div', { class: 'ow-faq' });
      c.faq.forEach(function (f) {
        faq.appendChild(el('details', {}, [
          el('summary', {}, [el('span', { class: 'q', 'aria-hidden': 'true', text: 'Q' }), el('span', { class: 't', text: f.q || '' }), el('span', { class: 'pm', 'aria-hidden': 'true' })]),
          el('p', { class: 'a', text: f.a || '' })
        ]));
      });
      wrap.appendChild(el('section', { class: 'ow-sec', 'aria-labelledby': 'h-faq' }, [el('h2', { id: 'h-faq', text: '자주 물으시는 것' }), faq]));
    }

    wrap.appendChild(el('section', { class: 'ow-sec' }, [ctaBlock(c.cta || {})]));

    // 연락: 전화(tel: · sms:) 와 인스타그램. 둘 중 하나만 있어도, 둘 다 없어도 깨지지 않는다.
    var ct = c.contact || {};
    var phone = filled(ct.phone) ? String(ct.phone).trim() : '';
    var digits = phone.replace(/[^0-9+]/g, '');
    var handle = filled(ct.instagram) ? String(ct.instagram).trim().replace(/^@/, '') : '';
    if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) handle = '';
    if (digits.length < 8) { phone = ''; digits = ''; }

    if (phone || handle) {
      var IG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>';
      var rows = el('div', { class: 'ways' });
      if (phone) {
        rows.appendChild(el('div', { class: 'way' }, [
          el('p', { class: 'label', text: '전화 · 문자' }),
          el('p', { class: 'val num', text: phone }),
          el('div', { class: 'acts' }, [
            el('a', { class: 'btn primary', href: 'tel:' + digits, text: '전화하기' }),
            el('a', { class: 'btn line', href: 'sms:' + digits, text: '문자 보내기' })
          ])
        ]));
      }
      if (handle) {
        rows.appendChild(el('div', { class: 'way' }, [
          el('p', { class: 'label', text: '인스타그램' }),
          el('p', { class: 'val', text: '@' + handle }),
          el('a', {
            class: 'btn line block', href: 'https://www.instagram.com/' + encodeURIComponent(handle) + '/',
            target: '_blank', rel: 'noopener noreferrer', html: IG + '인스타그램 열기'
          })
        ]));
      }
      wrap.appendChild(el('section', { class: 'ow-contact', 'aria-labelledby': 'h-contact' }, [
        el('h2', { id: 'h-contact', text: '연락처' }),
        filled(ct.name) ? el('p', { class: 'who', text: ct.name }) : null,
        ct.note ? el('p', { class: 'note', text: ct.note }) : null,
        rows
      ]));
    }
    main.appendChild(wrap);
  }

  /* ── 시작 ── */
  function draw() {
    main.innerHTML = '';
    main.appendChild(drawHero());
    survey = el('section', { class: 'qr-survey', id: 'survey', 'aria-labelledby': 'h-survey' });
    main.appendChild(survey);
    drawSurvey();
    if (intro) drawMore(intro);
    if (location.hash === '#survey') setTimeout(function () { survey.scrollIntoView(); }, 50);
  }

  Promise.all([
    M.loadContent('owner-qr'),
    M.loadContent('owner-intro').catch(function (err) { console.warn('[사장님 설문] 소개 문구를 못 불러왔어요', err); return null; })
  ]).then(function (r) {
    content = r[0];
    intro = r[1];
    form = F.normalize(content);
    state = freshState();
    draw();
  }).catch(function (err) {
    console.warn('[사장님 설문] 설문을 못 불러왔어요', err);
    main.innerHTML = '';
    var retry = el('button', { type: 'button', class: 'btn primary block', text: '다시 불러오기' });
    retry.addEventListener('click', function () { location.reload(); });
    main.appendChild(el('section', { class: 'ow-hero' }, [
      el('h1', { text: '설문을 못 불러왔어요' }),
      el('p', { class: 'ow-lead', text: navigator.onLine === false ? '인터넷이 끊겨 있어요. 연결된 뒤 다시 눌러 주세요.' : '잠시 뒤에 다시 눌러 주세요.' }),
      el('div', { class: 'qr-cta' }, [retry])
    ]));
  });
})();
