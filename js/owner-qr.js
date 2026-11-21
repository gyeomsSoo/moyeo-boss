/* 사장님 QR 설문 (moyeo-boss 첫 화면) — 사장님이 인터뷰 끝에 QR 을 찍고 자기 폰으로 들어온다.
 *
 *  화면 셋: 소개(hero, owner-intro.json) → 설문 카드(owner-qr.json 의 section 하나 = 한 화면) → 고맙습니다(done)
 *    · 보이는 문항이 하나도 없는 section(showIf 로 다 숨음)은 건너뛴다.
 *    · 뒤로가기: 카드마다 history 한 칸(pushState). 소개 ↔ 설문도 뒤로가기로 오간다.
 *        history.state = { moyeo: 'qr2', v: 'hero' | 'card' | 'done', s: section id, d: 소개 위로 몇 칸 }
 *      보내면 지나온 카드 칸을 걷어 내고(history.go(-d)) 고맙습니다 한 칸만 남긴다 → 뒤로가기 한 번이면 소개.
 *    · 카드 모양은 문항의 ui.layout 으로 정한다: grid · week · meter · story · cards · chips · scale (없으면 F.render).
 *      ui 는 보이는 모양만 바꾼다. 저장 값은 늘 보기 글 그대로(기타는 F.OTHER + others) → F.flatten 결과(시트 열 · 값)가 같다.
 *  저장:  moyeo.qr2.progress  { contentId, answers, others, cur, at }  쓰는 대로 — 새로고침해도 그 카드 · 그 답 그대로
 *         moyeo.qr2.done      { contentId, at, id }                      보낸 뒤 다시 열면 고맙습니다 화면
 *         (문항 묶음이 v2 로 바뀌어 v1 의 moyeo.qr.* 는 읽지 않는다)
 *  전송:  인터뷰 시트(boss.js send)와 똑같이 F.flatten → kind "boss". 같은 '사장님 인터뷰' 탭 · 같은 열 이름에 쌓이고,
 *         _버전(= owner-qr-v2)으로 QR 설문인 줄 구분한다. sid = "boss-qr-<무작위>" (?test=1 이면 앞에 agent-test-)
 *  방문 · 체험 기록은 보내지 않는다 (core.js 의 M.visit 도 비워 둠).
 */
(function () {
  'use strict';
  var M = window.Moyeo;
  var F = M.Fields;
  var el = M.el;
  var I = M.OwnerIcons || { svg: function () { return ''; }, has: function () { return false; } };
  var main = M.$('#main');

  var PROGRESS = 'moyeo.qr2.progress';
  var DONE = 'moyeo.qr2.done';
  var HK = 'qr2';                 // history.state.moyeo
  var ADVANCE_MS = 250;           // 하나 고르면 고른 표시를 보여 준 뒤 넘어간다
  var OTHER_LABEL = '기타 (직접 입력)';

  var intro = null;
  var content = null;
  var form = null;
  var state = null;
  var secs = [];                  // [{ sec, id, qs: [문항] }]

  var view = null;                // 'hero' | 'survey' | 'done'
  var curPos = -1;                // 지금 카드(secs 의 자리)
  var blocks = {};                // 문항 id → 지금 카드의 문항 상자
  var cardEl = null;
  var answeredAtDraw = false;     // 카드를 그릴 때 이미 답이 있었나 (다시 온 카드엔 [다음] 을 보인다)
  var advanceTimer = null;
  var submitting = false;
  var pendingDone = false;        // 보낸 뒤 history 를 소개까지 되감는 중
  var pendingTimer = null;
  var doneView = null;            // { el: 상태 글, done, rejected } — 고맙습니다 화면의 보내기 상태
  var lastErr = null;

  var heroView, surveyView, doneWrap, moreEl, dock;
  var startBtn, dockBtn, resumeNote, donePill, ctaBox;
  var stage, backBtn, trackEl, fillEl, countEl, navEl, nextBtn, hintEl;

  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* 무시 */ }
  // iOS 사파리는 터치 리스너가 하나라도 있어야 :active(누름 스프링)가 먹는다
  document.addEventListener('touchstart', function () {}, { passive: true });

  var demo = new M.Trial({
    entry: 'owner',
    forceOverlay: true,
    nowPrefix: '사장님 화면 ·',
    endLabel: '돌아가기',
    endHint: '다 둘러보셨으면',
    onEnd: function () { if (history.state && history.state.moyeo === 'trial') history.back(); }
  });

  // 손님(청년) 화면 — 처음 설정을 건너뛰려고 go=club 으로 연다(앱이 아는 꼬리는 이것뿐). 모임 탭에서 시작하니
  // '지도·추천을 눌러 보세요'는 첫 안내(firstHint, 모임 탭이면 바로 사라짐) 대신 늘 보이는 endHint 에 둔다.
  var guestDemo = new M.Trial({
    entry: 'user',
    forceOverlay: true,
    nowPrefix: '손님 화면 ·',
    endLabel: '돌아가기',
    endHint: '아래 지도·추천을 눌러 보세요',
    onEnd: function () { if (history.state && history.state.moyeo === 'trial') history.back(); }
  });

  /** [사장님 화면 보기] [손님 화면 보기] 두 버튼 한 줄 */
  function demoButtons(cls) {
    var own = el('button', { type: 'button', class: 'btn ' + cls, text: '사장님 화면 보기' });
    own.addEventListener('click', function () { demo.open({ opener: own }); });
    var guest = el('button', { type: 'button', class: 'btn ' + cls, text: '손님 화면 보기' });
    guest.addEventListener('click', function () { guestDemo.open({ query: 'go=club', opener: guest }); });
    return el('div', { class: 'qr-demos' }, [own, guest]);
  }

  /* ── 작은 도우미 ── */
  function icon(name) { return name && I.has(name) ? I.svg(name) : ''; }
  function tick() { return el('span', { class: 'tk', 'aria-hidden': 'true', html: icon('tick') }); }
  function arrowHtml(t) { return t + ' <span class="arrow" aria-hidden="true">→</span>'; }
  /** 겸수님이 채울 자리({이름} 같은)가 그대로면 보여 주지 않는다 */
  function filled(v) { return typeof v === 'string' && v.trim() && !/^\{.*\}$/.test(v.trim()); }
  function smooth() { return M.reducedMotion() ? 'auto' : 'smooth'; }
  function isDone() { var d = M.local.get(DONE); return !!(d && content && d.contentId === content.id); }

  /** 긴 낱말은 '·' '~' 뒤에서 줄을 바꿀 수 있게 (공방·원데이클래스, 500~1,000원) */
  function softText(text, cls) {
    var s = el('span', { class: cls || null });
    String(text).split(/([·~])/).forEach(function (part) {
      if (!part) return;
      s.appendChild(document.createTextNode(part));
      if (part === '·' || part === '~') s.appendChild(document.createElement('wbr'));
    });
    return s;
  }
  /** "[받기]" 는 작은 파란 버튼 모양으로 */
  function richText(node, text) {
    String(text || '').split(/(\[[^\]\n]+\])/).forEach(function (p) {
      if (!p) return;
      var m = p.match(/^\[([^\]]+)\]$/);
      node.appendChild(m ? el('span', { class: 'kb', text: m[1] }) : document.createTextNode(p));
    });
    return node;
  }

  function hstate() { var s = history.state; return s && s.moyeo === HK ? s : null; }
  function hpush(st, url) { st.moyeo = HK; try { history.pushState(st, '', url); } catch (e) { /* 무시 */ } }
  function hreplace(st, url) { st.moyeo = HK; try { history.replaceState(st, '', url); } catch (e) { /* 무시 */ } }
  function heroUrl() { return location.pathname + location.search; }
  function depth() { var s = hstate(); return s && typeof s.d === 'number' && s.d > 0 ? s.d : 0; }

  /* ── 진행 저장 ── */
  var saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    if (!state || !content || view === 'done' || isDone()) return;
    var cur = secs[curPos] ? secs[curPos].id : (savedProgress() || {}).cur;
    M.local.set(PROGRESS, { contentId: content.id, answers: state.answers, others: state.others, cur: cur || null, at: Date.now() });
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  window.addEventListener('pagehide', saveNow);

  function savedProgress() {
    var p = M.local.get(PROGRESS);
    return p && content && p.contentId === content.id ? p : null;
  }
  function freshState() {
    var p = savedProgress();
    var s = { answers: {}, others: {} };
    if (p && p.answers && typeof p.answers === 'object') {
      s.answers = p.answers;
      s.others = p.others && typeof p.others === 'object' ? p.others : {};
      F.sanitize(form, s);   // 지금 문항 · 보기에 없는 옛 값은 버린다
    }
    return s;
  }
  function answeredCount() {
    return state ? F.visibleList(form, state).filter(function (q) { return q.type !== 'info' && F.answered(q, state); }).length : 0;
  }

  /* ── 카드(section) 목록 ── */
  function buildSecs() {
    secs = (content.sections || []).map(function (sec, si) {
      return { sec: sec, id: String(sec.id || ('s' + si)), qs: form.list.filter(function (q) { return q.sectionIndex === si; }) };
    }).filter(function (s) { return s.qs.length; });
  }
  function secVisible(i) { var s = secs[i]; return !!s && s.qs.some(function (q) { return F.isVisible(q, form, state); }); }
  function visiblePositions() { var out = []; for (var i = 0; i < secs.length; i++) if (secVisible(i)) out.push(i); return out; }
  function nextVisible(i) { for (var j = i + 1; j < secs.length; j++) if (secVisible(j)) return j; return -1; }
  function prevVisible(i) { for (var j = i - 1; j >= 0; j--) if (secVisible(j)) return j; return -1; }
  function firstVisible() { return nextVisible(-1); }
  function lastVisible() { return prevVisible(secs.length); }
  function posById(id) { for (var i = 0; i < secs.length; i++) if (secs[i].id === id) return i; return -1; }
  function posOfQ(q) { for (var i = 0; i < secs.length; i++) if (secs[i].qs.indexOf(q) >= 0) return i; return -1; }
  /** 숨은 카드를 가리키면 그다음 보이는 카드(없으면 앞쪽) */
  function settle(i) {
    if (i < 0 || i >= secs.length) return firstVisible();
    if (secVisible(i)) return i;
    var n = nextVisible(i);
    return n >= 0 ? n : prevVisible(i);
  }
  function savedPos() { var p = savedProgress(); return p && p.cur ? settle(posById(p.cur)) : firstVisible(); }
  function visibleQs(i) { return (secs[i] ? secs[i].qs : []).filter(function (q) { return F.isVisible(q, form, state); }); }

  /* ── 화면 바꾸기 ── */
  function setView(v) {
    view = v;
    heroView.hidden = v !== 'hero';
    surveyView.hidden = v !== 'survey';
    doneWrap.hidden = v !== 'done';
    document.body.classList.toggle('qv-survey', v === 'survey');
    if (moreEl) (v === 'done' ? doneWrap : heroView).appendChild(moreEl);
    paintDock();
  }

  function showHero() {
    clearTimeout(advanceTimer);
    setView('hero');
    paintHero();
    window.scrollTo(0, 0);
  }

  /** 소개 → 설문 (보냈으면 고맙습니다) */
  function startSurvey() {
    if (isDone()) { hpush({ v: 'done', d: depth() + 1 }, '#survey'); showDone(); return; }
    var pos = savedPos();
    if (pos < 0) return;
    hpush({ v: 'card', s: secs[pos].id, d: depth() + 1 }, '#survey');
    showCard(pos, 'fwd');
  }

  /** history.state 하나를 화면으로 */
  function route(st, how) {
    if (!st || st.v === 'hero') { if (view !== 'hero') showHero(); return; }
    if (isDone()) { if (view !== 'done') showDone(); return; }
    var pos = settle(st.v === 'card' && st.s ? posById(st.s) : savedPos());
    if (pos < 0) { showHero(); return; }
    if (view === 'survey' && pos === curPos) return;
    var dir = how === 'boot' ? 'none' : (view === 'survey' && pos < curPos ? 'back' : 'fwd');
    showCard(pos, dir);
  }

  window.addEventListener('popstate', function (e) {
    var st = e.state;
    if (st && st.moyeo === 'trial') return;                                  // 체험 겹침창의 칸
    if (demo.isOverlayOpen() || guestDemo.isOverlayOpen()) return;           // 겹침창이 스스로 닫는다
    if (pendingDone) {                                                       // 보낸 뒤 소개까지 되감았다 → 고맙습니다 한 칸
      pendingDone = false;
      clearTimeout(pendingTimer);
      hpush({ v: 'done', d: (st && st.moyeo === HK && st.d > 0 ? st.d : 0) + 1 }, '#survey');
      return;
    }
    if (!content) return;
    if (!st || st.moyeo !== HK) st = location.hash === '#survey' ? { v: 'card' } : { v: 'hero' };
    route(st, 'pop');
  });

  /* ── 소개 (hero) ── */
  function drawHero() {
    var c = intro || {};
    var h1 = el('h1', { class: 'qh-title', id: 'qh-title' });
    // 제목의 \n 은 줄바꿈으로 (문구 파일에서 끊을 자리를 정한다)
    String(c.title || '사장님, 동네모여를 소개합니다').split('\n').forEach(function (line, i) {
      if (i) h1.appendChild(el('br'));
      h1.appendChild(document.createTextNode(line));
    });
    var badges = Array.isArray(c.badges) && c.badges.length
      ? el('ul', { class: 'qh-badges' }, c.badges.map(function (b) { return el('li', {}, [tick(), el('span', { text: String(b) })]); }))
      : null;

    startBtn = el('button', { type: 'button', class: 'btn primary block qh-start' });
    startBtn.addEventListener('click', startSurvey);
    resumeNote = el('p', { class: 'qh-resume', hidden: true });
    donePill = el('p', { class: 'qh-donepill', hidden: true }, [el('span', { html: icon('check') }), el('span', { text: '설문을 보내 주셨어요. 고맙습니다' })]);
    ctaBox = el('div', { class: 'qh-cta' }, [
      donePill,
      startBtn,
      resumeNote,
      demoButtons('line'),
      c.cta && c.cta.note ? el('p', { class: 'qh-note', text: c.cta.note }) : null
    ]);

    heroView = el('section', { class: 'qh', 'aria-labelledby': 'qh-title' }, [
      el('p', { class: 'qh-eyebrow', text: c.eyebrow || '동네 가게 사장님께' }),
      h1,
      c.lead ? el('p', { class: 'qh-lead', text: c.lead }) : null,
      badges,
      drawPhone(),
      ctaBox
    ]);

    // 첫 화면에서 버튼이 안 보이면(작은 폰 · 아래로 내려 읽는 중) 아래에 같은 버튼을 띄운다
    dockBtn = el('button', { type: 'button', class: 'btn primary block' });
    dockBtn.addEventListener('click', startSurvey);
    dock = el('div', { class: 'qh-dock' }, [dockBtn]);
    document.body.appendChild(dock);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (ents) { ctaInView = ents[0].isIntersecting; paintDock(); }, { threshold: 0.2 }).observe(ctaBox);
    }
  }

  var ctaInView = true;
  function paintDock() {
    if (!dock) return;
    var show = view === 'hero' && !ctaInView;
    dock.classList.toggle('show', show);
    document.body.classList.toggle('dock-on', show);
  }

  function paintHero() {
    var done = isDone();
    var n = done ? 0 : answeredCount();
    var label = done ? '보낸 설문 보기' : (n > 0 ? '이어서 하기' : '2분 설문 시작');
    startBtn.innerHTML = arrowHtml(label);
    dockBtn.innerHTML = arrowHtml(label);
    donePill.hidden = !done;
    resumeNote.hidden = !(n > 0);
    resumeNote.textContent = n > 0 ? '하던 곳부터 이어서 할게요' : '';
  }

  /** 사장님 폰 그림: 알림 카드가 내려오고 [받기]를 누르면 '받았어요'. 화면 밖 · 동작 줄이기면 멈춘다(CSS) */
  function drawPhone() {
    var noti = el('div', { class: 'qp-noti' }, [
      el('span', { class: 'qp-bell', html: icon('bell') }),
      el('span', { class: 'qp-txt' }, [el('b', { text: '새 모임 요청' }), el('span', { text: '토 19:00 · 4명' })]),
      el('span', { class: 'qp-btn' }, [
        el('span', { class: 'qp-t1', text: '받기' }),
        el('span', { class: 'qp-t2', html: icon('tick') + '받았어요' }),
        el('span', { class: 'qp-ring' }),
        el('span', { class: 'qp-finger' })
      ])
    ]);
    var screen = el('div', { class: 'qp-screen' }, [
      el('div', { class: 'qp-status' }, [el('span', { text: '9:41' }), el('i', { class: 'qp-bat' })]),
      el('p', { class: 'qp-head' }, [el('b', { text: '오늘' }), el('span', { text: '모임 예약' })]),
      el('div', { class: 'qp-row' }, [el('span', { class: 'qp-time', text: '17:00' }), el('i', { class: 'qp-line' })]),
      el('div', { class: 'qp-row qp-new' }, [el('span', { class: 'qp-time', text: '19:00' }), el('span', { class: 'qp-tag', text: '4명 모임' })]),
      el('div', { class: 'qp-row' }, [el('span', { class: 'qp-time', text: '21:00' }), el('i', { class: 'qp-line short' })])
    ]);
    var fig = el('figure', {
      class: 'qp', role: 'img',
      'aria-label': '사장님 폰에 "새 모임 요청 · 토 19:00 · 4명" 알림이 오고, 받기를 누르면 "받았어요"로 바뀌는 그림'
    }, [el('div', { class: 'qp-stage' }, [el('div', { class: 'qp-phone' }, [screen]), noti])]);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (ents) { fig.classList.toggle('paused', !ents[0].isIntersecting); }, { threshold: 0 }).observe(fig);
    }
    return fig;
  }

  /* ── 더 알아보기: 접힌 세 줄 + 연락처 ── */
  function drawMore(c) {
    var acc = el('div', { class: 'qm-acc' });
    function item(ic, title, body) {
      acc.appendChild(el('details', { class: 'qa' }, [
        el('summary', {}, [
          el('span', { class: 'qa-ic', html: icon(ic) }),
          el('span', { class: 'qa-t', text: title }),
          el('span', { class: 'qa-chev', html: icon('chev') })
        ]),
        el('div', { class: 'qa-body' }, [body])
      ]));
    }
    if (c.steps && c.steps.length) {
      item('route', '이렇게 돌아가요', el('ol', { class: 'qa-steps' }, c.steps.map(function (s, i) {
        return el('li', {}, [
          el('span', { class: 'no', 'aria-hidden': 'true', text: String(i + 1) }),
          el('div', {}, [el('h3', { text: s.title || '' }), s.body ? richText(el('p'), s.body) : null])
        ]);
      })));
    }
    if (c.points && c.points.length) {
      item('star', '사장님께 좋은 점', el('ul', { class: 'qa-points' }, c.points.map(function (p) {
        return el('li', {}, [tick(), el('div', {}, [el('h3', { text: p.title || '' }), p.body ? el('p', { text: p.body }) : null])]);
      })));
    }
    if (c.faq && c.faq.length) {
      item('faq', '자주 묻는 질문', el('div', { class: 'qa-faq' }, c.faq.map(function (f) {
        return el('div', { class: 'qa-qa' }, [
          el('h3', {}, [el('span', { class: 'q', 'aria-hidden': 'true', text: 'Q' }), el('span', { text: f.q || '' })]),
          richText(el('p'), f.a || '')
        ]);
      })));
    }

    // 연락: 전화(tel: · sms:) 와 인스타그램. 둘 중 하나만 있어도, 둘 다 없어도 깨지지 않는다.
    var ct = c.contact || {};
    var phone = filled(ct.phone) ? String(ct.phone).trim() : '';
    var digits = phone.replace(/[^0-9+]/g, '');
    var handle = filled(ct.instagram) ? String(ct.instagram).trim().replace(/^@/, '') : '';
    if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) handle = '';
    if (digits.length < 8) { phone = ''; digits = ''; }
    var contact = null;
    if (phone || handle) {
      var rows = el('div', { class: 'ways' });
      if (phone) {
        rows.appendChild(el('div', { class: 'way' }, [
          el('p', { class: 'val num', text: phone }),
          el('div', { class: 'acts' }, [
            el('a', { class: 'btn primary', href: 'tel:' + digits, html: icon('call') + '<span>전화하기</span>' }),
            el('a', { class: 'btn line', href: 'sms:' + digits, html: icon('sms') + '<span>문자 보내기</span>' })
          ])
        ]));
      }
      if (handle) {
        rows.appendChild(el('a', {
          class: 'btn line block qm-insta', href: 'https://www.instagram.com/' + encodeURIComponent(handle) + '/',
          target: '_blank', rel: 'noopener noreferrer', html: icon('insta') + '<span>인스타그램 @' + handle + '</span>'
        }));
      }
      contact = el('section', { class: 'qm-contact', 'aria-labelledby': 'h-contact' }, [
        el('h2', { id: 'h-contact' }, [el('span', { class: 'lbl', text: '연락처' }), filled(ct.name) ? el('span', { class: 'who', text: ct.name }) : null]),
        ct.note ? el('p', { class: 'note', text: ct.note }) : null,
        rows
      ]);
    }
    moreEl = el('div', { class: 'qm', id: 'more' }, [el('h2', { class: 'qm-title', text: '더 알아보기' }), acc, contact]);
  }

  /* ── 설문 틀: 위(뒤로 · 진행) / 카드 / 아래(다음) ── */
  function buildSurvey() {
    backBtn = el('button', { type: 'button', class: 'qs-back', 'aria-label': '이전 화면', html: icon('back') });
    backBtn.addEventListener('click', goBack);
    fillEl = el('span', { class: 'qs-fill' });
    trackEl = el('div', { class: 'qs-track', role: 'progressbar', 'aria-label': '설문 진행', 'aria-valuemin': '0' }, [fillEl]);
    countEl = el('span', { class: 'qs-count num', 'aria-hidden': 'true' });
    stage = el('div', { class: 'qs-stage' });
    hintEl = el('p', { class: 'qs-hint', hidden: true }, [el('span', { html: icon('tap') }), el('span', { text: '하나 고르면 바로 넘어가요' })]);
    nextBtn = el('button', { type: 'button', class: 'btn primary block qs-next' });
    nextBtn.addEventListener('click', function () { if (!justDrawn()) next(); });
    // 두 번 톡톡 누르는 손: 넘어간 직후의 두 번째 탭이 다음 카드의 같은 자리 보기를 고르지 않게 잠깐 막는다
    stage.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[role="radio"], [role="checkbox"], .qg-more') : null;
      if (t && justDrawn()) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    navEl = el('div', { class: 'qs-nav' }, [hintEl, nextBtn]);
    surveyView = el('section', { class: 'qs', id: 'survey', 'aria-label': content.title || '사장님 설문' }, [
      el('div', { class: 'qs-top' }, [el('div', { class: 'qs-bar' }, [backBtn, trackEl, countEl])]),
      stage,
      navEl
    ]);
  }

  var drawnAt = 0;
  var GUARD_MS = 350;
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function justDrawn() { return now() - drawnAt < GUARD_MS; }

  function showCard(pos, dir) {
    clearTimeout(advanceTimer);
    pos = settle(pos);
    if (pos < 0) { showHero(); return; }
    curPos = pos;
    drawnAt = dir === 'none' ? 0 : now();
    if (view !== 'survey') setView('survey');
    var s = secs[pos];
    blocks = {};
    var card = el('section', { class: 'qc' + (dir === 'back' ? ' back' : dir === 'none' ? ' still' : ''), 'aria-labelledby': 'qt-' + s.qs[0].id, 'data-sec': s.id });
    var top = el('div', { class: 'qc-top' }, [el('p', { class: 'qc-eyebrow', text: s.sec.title || '' })]);
    if (pos === firstVisible() && content.intro) top.appendChild(el('p', { class: 'qc-pill' }, [el('span', { html: icon('tap') }), el('span', { text: content.intro })]));
    card.appendChild(top);
    var last = pos === lastVisible();
    if (last && content.notice) card.appendChild(el('p', { class: 'qc-notice' }, [el('span', { html: icon('lock') }), el('span', { text: content.notice })]));
    s.qs.forEach(function (q, i) {
      var b = drawBlock(q, i === 0);
      blocks[q.id] = b;
      card.appendChild(b);
    });
    if (last && M.persist) card.appendChild(el('p', { class: 'qc-sendnote', text: '인터넷이 약해도 괜찮아요. 이 폰에 넣어 뒀다가 연결되면 보내요.' }));
    stage.innerHTML = '';
    stage.appendChild(card);
    cardEl = card;
    refreshVisibility(false);
    var auto = autoQ();
    answeredAtDraw = !!(auto && F.answered(auto, state));
    paintNav();
    paintProgress();
    saveNow();
    window.scrollTo(0, 0);
    var h = card.querySelector('.qc-title');
    if (h && dir !== 'none') { try { h.focus({ preventScroll: true }); } catch (e) { /* 무시 */ } }
  }

  /** 이 카드가 '하나 고르면 넘어가는' 카드면 그 문항 (보이는 문항이 하나뿐인 하나 고르기 · 마지막 카드 아님) */
  function autoQ() {
    if (curPos < 0 || curPos === lastVisible()) return null;
    var vis = visibleQs(curPos).filter(function (q) { return q.type !== 'info'; });
    if (vis.length !== 1) return null;
    var q = vis[0];
    var lay = q.ui && q.ui.layout;
    if (q.type === 'single' && !q.other && lay !== 'chips') return q;
    if (q.type === 'select' && lay === 'grid') return q;
    return null;
  }

  function paintNav() {
    var auto = autoQ();
    var last = curPos === lastVisible();
    // 하나 고르면 넘어가는 카드: 필수면 [다음] 대신 안내 한 줄, 선택(F2 같은)이면 [건너뛰기]. 다시 온 카드엔 [다음].
    var skip = !!(auto && !auto.required && !answeredAtDraw);
    var showBtn = !auto || answeredAtDraw || skip;
    hintEl.hidden = showBtn;
    nextBtn.hidden = !showBtn;
    navEl.classList.toggle('hint', !showBtn);
    nextBtn.classList.toggle('primary', !skip);
    nextBtn.classList.toggle('line', skip);
    nextBtn.innerHTML = last ? '보내기' : arrowHtml(skip ? '건너뛰기' : '다음');
    nextBtn.disabled = submitting;
  }

  function paintProgress() {
    var vis = visiblePositions();
    var i = vis.indexOf(curPos);
    var total = vis.length || 1;
    var now = i < 0 ? 0 : i + 1;
    fillEl.style.width = Math.round(now / total * 1000) / 10 + '%';
    trackEl.setAttribute('aria-valuemax', String(total));
    trackEl.setAttribute('aria-valuenow', String(now));
    trackEl.setAttribute('aria-valuetext', total + '개 화면 중 ' + now + '번째');
    countEl.innerHTML = '';
    countEl.appendChild(el('b', { text: String(now) }));
    countEl.appendChild(document.createTextNode(' / ' + total));
  }

  /** 답이 바뀔 때마다: 보이는 문항 · 버튼 · 진행 · 저장 · (하나 고르기면) 넘어가기 */
  function changed(q, info) {
    info = info || {};
    var b = blocks[q.id];
    if (b && b.err && b.err.textContent) { b.err.textContent = ''; b.classList.remove('missing'); }
    save();
    var shown = refreshVisibility(true);
    paintNav();
    paintProgress();
    if (shown.length && !info.typing) {
      var first = shown[0];
      setTimeout(function () { if (first.isConnected && !first.hidden) first.scrollIntoView({ behavior: smooth(), block: 'nearest' }); }, 60);
    }
    if (info.advance) {
      var auto = autoQ();
      if (auto === q && !F.validate(q, state)) {
        clearTimeout(advanceTimer);
        var pos = curPos;
        advanceTimer = setTimeout(function () { if (view === 'survey' && curPos === pos) next(); }, ADVANCE_MS);
      }
    }
    return shown;
  }

  function refreshVisibility(animate) {
    var shown = [];
    Object.keys(blocks).forEach(function (id) {
      var q = form.byId[id];
      var b = blocks[id];
      var vis = F.isVisible(q, form, state);
      if (b.hidden !== !vis) {
        b.hidden = !vis;
        if (vis && animate) { b.classList.remove('reveal'); void b.offsetWidth; b.classList.add('reveal'); shown.push(b); }
      }
    });
    return shown;
  }

  function next() {
    clearTimeout(advanceTimer);
    if (view !== 'survey' || submitting || curPos < 0) return;
    var probs = [];
    secs[curPos].qs.forEach(function (q) {
      var b = blocks[q.id];
      var m = F.isVisible(q, form, state) ? F.validate(q, state) : '';
      if (b && b.err) { b.err.textContent = m; b.classList.toggle('missing', !!m); }
      if (m) probs.push({ q: q, msg: m });
    });
    if (probs.length) {
      if (cardEl) { cardEl.classList.remove('nudge'); void cardEl.offsetWidth; cardEl.classList.add('nudge'); }
      var pb = blocks[probs[0].q.id];
      if (pb) {
        pb.scrollIntoView({ behavior: smooth(), block: 'nearest' });
        var inp = /기타/.test(probs[0].msg) ? pb.querySelector('.qother:not([hidden]) input') : (probs[0].q.type === 'text' ? pb.querySelector('input, textarea') : null);
        if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }
      }
      return;
    }
    var np = nextVisible(curPos);
    if (np < 0) { submit(); return; }
    hpush({ v: 'card', s: secs[np].id, d: depth() + 1 }, '#survey');
    showCard(np, 'fwd');
  }

  function goBack() {
    clearTimeout(advanceTimer);
    if (depth() >= 1) { history.back(); return; }      // 지나온 칸으로 (popstate 가 그린다)
    var p = prevVisible(curPos);                         // 칸이 없으면(바로 #survey 로 열었을 때) 직접
    if (p >= 0) { hreplace({ v: 'card', s: secs[p].id, d: 0 }, '#survey'); showCard(p, 'back'); }
    else { hreplace({ v: 'hero', d: 0 }, heroUrl()); showHero(); }
  }

  /* 키보드: 글 칸에서 Enter → 다음 칸, 마지막 칸이면 다음 화면 */
  document.addEventListener('keydown', function (e) {
    if (view !== 'survey' || e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    var t = e.target;
    if (!t || t.tagName !== 'INPUT' || !cardEl || !cardEl.contains(t) || t.type === 'search') return;
    e.preventDefault();
    var ins = Array.prototype.slice.call(cardEl.querySelectorAll('input.field')).filter(function (x) { return x.offsetParent !== null; });
    var i = ins.indexOf(t);
    if (i >= 0 && i < ins.length - 1) ins[i + 1].focus();
    else { t.blur(); next(); }
  });

  /* ── 문항 상자 ── */
  function drawBlock(q, lead) {
    var lay = q.ui && q.ui.layout;
    var b = el('div', { class: 'qb' + (lead ? ' lead' : '') + (q.type === 'info' ? ' info' : ''), id: 'q-' + q.id, 'data-q': q.id });

    if (q.type === 'info' && lay !== 'story') {     // 안내(F5): 작은 상자에 제목 + 점 목록
      var items = String(q.help || '').split('\n').map(function (s) { return s.replace(/^[·•\-]\s*/, '').trim(); }).filter(Boolean);
      b.appendChild(el('div', { class: 'qi' }, [
        el('span', { class: 'qi-ic', html: icon('lock') }),
        el('div', {}, [
          el(lead ? 'h2' : 'h3', { class: lead ? 'qc-title' : 'qi-t', id: 'qt-' + q.id, text: q.text }),
          items.length ? el('ul', {}, items.map(function (t) { return el('li', { text: t }); })) : null
        ])
      ]));
      return b;
    }

    var t = el(lead ? 'h2' : 'h3', { class: lead ? 'qc-title' : 'qb-title', id: 'qt-' + q.id, tabindex: lead ? '-1' : null });
    t.appendChild(document.createTextNode(q.text));
    if (lead && !q.required && q.type !== 'info') t.appendChild(el('span', { class: 'opt-chip', text: '선택' }));
    b.appendChild(t);

    if (lay === 'story') { b.appendChild(drawStory(q)); return b; }

    var diagram = lay === 'cards' && q.ui.diagram === 'prepay' ? drawPrepay() : null;
    if (diagram) b.appendChild(diagram);
    if (q.help) b.appendChild(el('p', { class: 'qc-help', text: q.help }));

    var ctl;
    switch (lay) {
      case 'grid': ctl = q.type === 'select' || q.type === 'single' ? drawGrid(q) : null; break;
      case 'week': ctl = q.type === 'multi' ? drawWeek(q) : null; break;
      case 'meter': ctl = q.type === 'single' ? drawMeter(q) : null; break;
      case 'cards': ctl = q.type === 'single' ? drawCards(q) : null; break;
      case 'chips': ctl = q.type === 'single' || q.type === 'multi' ? drawChips(q) : null; break;
      case 'scale': ctl = q.type === 'single' ? drawScale(q) : null; break;
      default: ctl = null;
    }
    if (!ctl) {           // ui 가 없거나 모르는 모양 → 공통 엔진 그대로
      ctl = F.render(q, state, function (info) { changed(q, info); });
    }
    b.appendChild(el('div', { class: 'qb-ctl' }, [ctl]));
    var err = el('p', { class: 'err', role: 'alert' });
    b.appendChild(err);
    b.err = err;
    return b;
  }

  function setAnswer(q, v) { if (F.isEmpty(v)) delete state.answers[q.id]; else state.answers[q.id] = v; }
  function choice(cls, role, on, kids, aria) {
    var b = el('button', { type: 'button', class: cls, role: role, 'aria-checked': on ? 'true' : 'false' }, kids);
    if (aria) b.setAttribute('aria-label', aria);
    return b;
  }
  function check(b, on) { b.setAttribute('aria-checked', on ? 'true' : 'false'); }
  function group(role, q, kids, cls) { return el('div', { class: cls || null, role: role, 'aria-labelledby': 'qt-' + q.id }, kids); }

  /** 칩 하나: 앞 아이콘(없으면 동그라미) 자리에 고르면 체크가 들어온다 */
  function chip(role, label, ic, on) {
    var lead = el('span', { class: 'qcp-lead', 'aria-hidden': 'true' }, [
      ic && I.has(ic) ? el('span', { class: 'qcp-ic', html: icon(ic) }) : el('span', { class: 'qcp-ring' }),
      el('span', { class: 'qcp-chk', html: icon('tick') })
    ]);
    return choice('qcp', role, on, [lead, el('span', { class: 'qcp-l', text: label })]);
  }

  /* grid — 업종: 자주 오는 12개는 그림 칸, [다른 업종] 을 누르면 전체 목록(찾기). 기타면 A3 칸이 같은 카드에 열린다 */
  function drawGrid(q) {
    var ui = q.ui || {};
    var opts = q.options;
    var icons = ui.icons || {};
    var top = (Array.isArray(ui.top) ? ui.top : []).filter(function (o) { return opts.indexOf(o) >= 0; });
    var cur = state.answers[q.id];
    var all = [];
    var grid = group('radiogroup', q, [], 'qg');
    top.forEach(function (o) {
      var b = choice('qt', 'radio', cur === o, [el('span', { class: 'qt-ic', html: icon(icons[o]) || icon('store') }), softText(o, 'qt-l'), tick()]);
      b.addEventListener('click', function () { pick(o); });
      grid.appendChild(b);
      all.push({ b: b, v: o });
    });

    var moreV = el('span', { class: 'qg-more-v' });
    var moreBtn = el('button', { type: 'button', class: 'qg-more', 'aria-expanded': 'false' }, [
      el('span', { class: 'qg-more-ic', html: icon('more') }),
      el('span', { class: 'qg-more-t', text: ui.more || '다른 업종' }),
      moreV,
      el('span', { class: 'qg-chev', html: icon('chev') })
    ]);
    grid.appendChild(moreBtn);

    var search = el('input', { class: 'field qg-search', type: 'search', placeholder: '업종 이름으로 찾기', 'aria-label': '업종 찾기', autocomplete: 'off', enterkeyhint: 'search' });
    var list = el('div', { class: 'qg-list', role: 'radiogroup', 'aria-label': '모든 업종' });
    var empty = el('p', { class: 'qg-empty', hidden: true, text: "찾는 업종이 없으면 '기타'를 눌러 주세요" });
    var items = opts.map(function (o) {
      var b = choice('qg-item', 'radio', cur === o, [softText(o), tick()]);
      b.addEventListener('click', function () { pick(o); });
      list.appendChild(b);
      all.push({ b: b, v: o });
      return { b: b, v: o, key: norm(o) };
    });
    var panel = el('div', { class: 'qg-panel', hidden: true }, [
      el('div', { class: 'qg-sbox' }, [el('span', { html: icon('search') }), search]),
      list,
      empty
    ]);
    function norm(s) { return String(s).replace(/[\s·.\-]/g, '').toLowerCase(); }
    search.addEventListener('input', function () {
      var k = norm(search.value);
      var hits = 0;
      items.forEach(function (it) {
        var show = !k || it.key.indexOf(k) >= 0 || it.v === '기타';
        it.b.hidden = !show;
        if (show && it.v !== '기타') hits++;
      });
      empty.hidden = !k || hits > 0;
    });
    function open(on, scroll) {
      panel.hidden = !on;
      moreBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on && scroll) setTimeout(function () { moreBtn.scrollIntoView({ behavior: smooth(), block: 'start' }); }, 40);
    }
    moreBtn.addEventListener('click', function () { open(panel.hidden, true); });
    function paintMore() {
      var v = state.answers[q.id];
      var outside = !!v && top.indexOf(v) < 0;
      moreBtn.classList.toggle('on', outside);
      moreV.textContent = outside ? v : '';
    }
    function pick(o) {
      setAnswer(q, o);
      all.forEach(function (x) { check(x.b, x.v === o); });
      paintMore();
      var shown = changed(q, { advance: true });
      // '기타' 면 A3(직접 적기)가 열린다 → 바로 적을 수 있게
      if (shown.length) {
        var inp = shown[0].querySelector('input.field, textarea.field');
        if (inp) setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }, 120);
      }
    }
    paintMore();
    if (cur && top.indexOf(cur) < 0) open(true, false);
    return el('div', { class: 'qg-wrap' }, [grid, panel]);
  }

  /** 함께 고를 수 없는 보기 ('딱히 없다(늘 바쁨)' 같은) */
  function exclusives(q) {
    var ui = q.ui || {};
    if (Array.isArray(ui.exclusive)) return ui.exclusive.map(String);
    if (ui.layout === 'week') return q.options.filter(function (o) { return /^딱히 없다/.test(o); });
    return [];
  }

  /* week — 한가한 때: 평일/주말 × 낮/저녁 2×2 칸 + 그 밖의 칩. 저장은 보기 글 배열(보기 순서) */
  function drawWeek(q) {
    var ui = q.ui || {};
    var g = ui.grid || {};
    var rows = g.rows || [], cols = g.cols || [], cells = g.cells || {};
    var icons = ui.icons || {};
    var excl = exclusives(q);
    var cur = function () { return Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : []; };
    var btns = [];
    var covered = [];
    var table = el('div', { class: 'qw', role: 'group', 'aria-labelledby': 'qt-' + q.id, style: '--cols:' + Math.max(1, cols.length) });
    table.appendChild(el('span', { class: 'qw-corner', 'aria-hidden': 'true' }));
    cols.forEach(function (c) {
      table.appendChild(el('span', { class: 'qw-h', 'aria-hidden': 'true' }, [el('span', { html: icon(icons[c]) }), el('span', { text: c })]));
    });
    rows.forEach(function (r) {
      table.appendChild(el('span', { class: 'qw-r', 'aria-hidden': 'true', text: r }));
      cols.forEach(function (c) {
        var v = cells[r + '|' + c];
        if (!v || q.options.indexOf(v) < 0) { table.appendChild(el('span', { class: 'qw-x', 'aria-hidden': 'true' })); return; }
        covered.push(v);
        var b = choice('qw-c', 'checkbox', cur().indexOf(v) >= 0, [el('span', { class: 'qw-mark', 'aria-hidden': 'true', html: icon('tick') }), el('span', { class: 'qw-l', text: v })], v);
        b.addEventListener('click', function () { toggle(v); });
        table.appendChild(b);
        btns.push({ b: b, v: v });
      });
    });
    // 칸에 없는 보기는 전부 칩으로 (ui.extra 순서 먼저, 빠진 보기가 있어도 고를 수 있게)
    var extra = (Array.isArray(ui.extra) ? ui.extra : []).filter(function (o) { return q.options.indexOf(o) >= 0 && covered.indexOf(o) < 0; });
    q.options.forEach(function (o) { if (covered.indexOf(o) < 0 && extra.indexOf(o) < 0) extra.push(o); });
    var chips = el('div', { class: 'qchips', role: 'group', 'aria-label': '그 밖의 때' });
    extra.forEach(function (o) {
      var b = chip('checkbox', o, icons[o], cur().indexOf(o) >= 0);
      if (excl.indexOf(o) >= 0) b.classList.add('excl');
      b.addEventListener('click', function () { toggle(o); });
      chips.appendChild(b);
      btns.push({ b: b, v: o });
    });
    function toggle(v) {
      var now = cur();
      if (now.indexOf(v) >= 0) now = now.filter(function (x) { return x !== v; });
      else if (excl.indexOf(v) >= 0) now = [v];                                  // '딱히 없다' 는 다른 것을 지운다
      else { now = now.filter(function (x) { return excl.indexOf(x) < 0; }); now.push(v); }   // 다른 것을 고르면 '딱히 없다' 를 지운다
      now = q.options.filter(function (o) { return now.indexOf(o) >= 0; });
      setAnswer(q, now);
      btns.forEach(function (x) { check(x.b, now.indexOf(x.v) >= 0); });
      changed(q, {});
    }
    return el('div', { class: 'qw-wrap' }, [table, chips]);
  }

  /* meter — 얼마나 자주: 줄마다 점 0~3개. levels 가 null 인 보기는 점 없이 조용한 글 보기 */
  function drawMeter(q) {
    var levels = (q.ui && q.ui.levels) || {};
    var max = 1;
    q.options.forEach(function (o) { if (typeof levels[o] === 'number') max = Math.max(max, levels[o]); });
    var cur = state.answers[q.id];
    var rows = [];
    var list = group('radiogroup', q, [], 'qm-list');
    q.options.forEach(function (o) {
      var lv = levels[o];
      var quiet = typeof lv !== 'number';
      var dots = null;
      if (!quiet) {
        dots = el('span', { class: 'qm-dots', 'aria-hidden': 'true' });
        for (var i = 0; i < max; i++) dots.appendChild(el('i', { class: i < lv ? 'on' : null }));
      }
      var b = choice('qm-row' + (quiet ? ' quiet' : ''), 'radio', cur === o, [dots, el('span', { class: 'qm-t', text: o }), tick()]);
      b.addEventListener('click', function () {
        setAnswer(q, o);
        rows.forEach(function (x) { check(x.b, x.v === o); });
        changed(q, { advance: true });
      });
      list.appendChild(b);
      rows.push({ b: b, v: o });
    });
    return list;
  }

  /* story — 안내: 그림 세 단계가 차례로 떠오른다 */
  function drawStory(q) {
    var steps = (q.ui && Array.isArray(q.ui.steps)) ? q.ui.steps : [];
    if (!steps.length) return q.help ? el('p', { class: 'qc-help', text: q.help }) : el('span');
    return el('ol', { class: 'qst' }, steps.map(function (s, i) {
      return el('li', { style: '--i:' + i }, [
        el('span', { class: 'qst-ic', 'aria-hidden': 'true' }, [el('span', { html: icon(s.icon) || icon('check') }), el('span', { class: 'qst-no', text: String(i + 1) })]),
        el('div', {}, [richText(el('h3'), s.title || ''), s.body ? el('p', { text: s.body }) : null])
      ]);
    }));
  }

  /* 미리 결제 그림: 손님 → 앱에서 미리 결제 → (안 오면) 가게 몫 */
  function drawPrepay() {
    var arrow = function () { return el('span', { class: 'qdia-a', 'aria-hidden': 'true', html: icon('arrow') }); };
    return el('div', { class: 'qdia', role: 'img', 'aria-label': '손님이 앱에서 미리 결제하고, 안 오면 그 돈은 가게 몫' }, [
      el('span', { class: 'qdia-n' }, [el('span', { class: 'qdia-ic', html: icon('person') }), el('span', { text: '손님' })]),
      arrow(),
      el('span', { class: 'qdia-n' }, [el('span', { class: 'qdia-ic', html: icon('pay') }), el('span', { text: '앱에서 미리 결제' })]),
      arrow(),
      el('span', { class: 'qdia-n end' }, [el('span', { class: 'qdia-ic', html: icon('store') }), el('span', {}, [el('small', { text: '안 오면' }), el('span', { text: '가게 몫' })])])
    ]);
  }

  /* cards — 큰 카드. ui.primary 가 있으면 그것만 큰 카드(ui.short 큰 글 · ui.sub 작은 줄), 나머지는 아래 작은 칩.
     보기 2개짜리 짧은 것(예 · 아니오)은 두 칸. 저장 값은 늘 보기 글 전체 */
  function drawCards(q) {
    var ui = q.ui || {};
    var opts = q.options;
    var icons = ui.icons || {};
    var primary = Array.isArray(ui.primary) ? ui.primary.filter(function (o) { return opts.indexOf(o) >= 0; }) : [];
    var big = primary.length ? primary : opts;
    var rest = primary.length ? opts.filter(function (o) { return primary.indexOf(o) < 0; }) : [];
    var two = !primary.length && opts.length === 2 && opts.every(function (o) { return o.length <= 6; });
    var cur = state.answers[q.id];
    var all = [];
    function pick(o) {
      setAnswer(q, o);
      all.forEach(function (x) { check(x.b, x.v === o); });
      changed(q, { advance: true });
    }
    var list = el('div', { class: 'qk-list' + (two ? ' two' : '') });
    big.forEach(function (o) {
      var parts = o.split(/\s+—\s+/);
      var main = (ui.short && ui.short[o]) || parts[0];
      var sub = (ui.sub && ui.sub[o]) || (parts.length > 1 ? parts.slice(1).join(' — ') : '');
      var ic = icons[o];
      var b = choice('qk' + (two ? ' two' : ''), 'radio', cur === o, [
        ic && I.has(ic) ? el('span', { class: 'qk-ic', 'aria-hidden': 'true', html: icon(ic) }) : null,
        el('span', { class: 'qk-tx' }, [el('b', { text: main }), sub ? el('small', { text: sub }) : null]),
        tick()
      ], main === o && !sub ? null : o);
      b.addEventListener('click', function () { pick(o); });
      list.appendChild(b);
      all.push({ b: b, v: o });
    });
    var kids = [list];
    if (rest.length) {
      kids.push(el('p', { class: 'qk-or', 'aria-hidden': 'true', text: '또는' }));
      var chips = el('div', { class: 'qchips' });
      rest.forEach(function (o) {
        var b = chip('radio', o, icons[o], cur === o);
        b.addEventListener('click', function () { pick(o); });
        chips.appendChild(b);
        all.push({ b: b, v: o });
      });
      kids.push(chips);
    }
    return group('radiogroup', q, kids, 'qk-group');
  }

  /* chips — 감싸 흐르는 칩(아이콘 있으면 함께). other: true 면 '기타 (직접 입력)' 칩 + 글 칸 → 보낼 때 "기타: …" (fields.js 와 같은 OTHER) */
  function drawChips(q) {
    var ui = q.ui || {};
    var icons = ui.icons || {};
    var multi = q.type === 'multi';
    var values = q.options.slice();
    var labels = q.options.slice();
    if (q.other) { values.push(F.OTHER); labels.push(OTHER_LABEL); }
    var excl = exclusives(q);
    var curArr = function () { return Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : []; };
    var isOn = function (v) { return multi ? curArr().indexOf(v) >= 0 : state.answers[q.id] === v; };
    var btns = [];
    var box = el('div', { class: 'qchips' });
    var other = null, otherInput = null;
    if (q.other) {
      otherInput = el('input', { class: 'field', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: '직접 적어 주세요', 'aria-label': '기타 내용', enterkeyhint: 'done' });
      otherInput.value = state.others[q.id] || '';
      otherInput.addEventListener('input', function () { state.others[q.id] = otherInput.value; changed(q, { typing: true }); });
      other = el('div', { class: 'qother', hidden: !isOn(F.OTHER) }, [otherInput]);
    }
    values.forEach(function (v, i) {
      var b = chip(multi ? 'checkbox' : 'radio', labels[i], v === F.OTHER ? 'edit' : icons[v], isOn(v));
      b.addEventListener('click', function () { toggle(v); });
      box.appendChild(b);
      btns.push({ b: b, v: v });
    });
    function toggle(v) {
      var now;
      if (multi) {
        now = curArr();
        if (now.indexOf(v) >= 0) now = now.filter(function (x) { return x !== v; });
        else if (excl.indexOf(v) >= 0) now = [v];
        else { now = now.filter(function (x) { return excl.indexOf(x) < 0; }); now.push(v); }
        now = values.filter(function (x) { return now.indexOf(x) >= 0; });   // 보기 순서대로
        setAnswer(q, now);
      } else {
        setAnswer(q, v);
      }
      btns.forEach(function (x) { check(x.b, isOn(x.v)); });
      var otherOn = isOn(F.OTHER);
      if (other) {
        var was = other.hidden;
        other.hidden = !otherOn;
        if (otherOn && was) setTimeout(function () { try { otherInput.focus({ preventScroll: true }); } catch (e) { otherInput.focus(); } other.scrollIntoView({ behavior: smooth(), block: 'nearest' }); }, 60);
      }
      changed(q, { advance: !multi && v !== F.OTHER });
    }
    return group(multi ? 'group' : 'radiogroup', q, other ? [box, other] : [box], 'qchip-group');
  }

  /* scale — 금액 · %: 왼쪽에서 오른쪽으로 높아지는 계단 막대. '모르겠다…' 는 계단 밖 조용한 보기 */
  function drawScale(q) {
    var opts = q.options;
    var quiet = opts.filter(function (o) { return /^모르겠다/.test(o); });
    var steps = opts.filter(function (o) { return quiet.indexOf(o) < 0; });
    var n = steps.length;
    var cur = state.answers[q.id];
    var all = [];
    function pick(o) {
      setAnswer(q, o);
      all.forEach(function (x) { check(x.b, x.v === o); });
      changed(q, { advance: true });
    }
    var ruler = el('div', { class: 'qsc', style: '--n:' + Math.max(1, n) });
    steps.forEach(function (o, i) {
      var h = n > 1 ? Math.round(24 + (i / (n - 1)) * 76) : 60;
      var b = choice('qsc-s', 'radio', cur === o, [
        el('span', { class: 'qsc-box', 'aria-hidden': 'true' }, [el('span', { class: 'qsc-bar', style: 'height:' + h + '%' })]),
        softText(o, 'qsc-l')
      ]);
      b.addEventListener('click', function () { pick(o); });
      ruler.appendChild(b);
      all.push({ b: b, v: o });
    });
    var kids = [ruler];
    if (quiet.length) {
      var ql = el('div', { class: 'qm-list qsc-quiet' });
      quiet.forEach(function (o) {
        var b = choice('qm-row quiet', 'radio', cur === o, [el('span', { class: 'qm-t', text: o }), tick()]);
        b.addEventListener('click', function () { pick(o); });
        ql.appendChild(b);
        all.push({ b: b, v: o });
      });
      kids.push(ql);
    }
    return group('radiogroup', q, kids, 'qsc-group');
  }

  /* ── 보내기 — 전송 모양은 예전 그대로 ── */
  function submit() {
    if (submitting) return;
    // 마지막으로 전부 다시 본다 (되살린 답 · 바뀐 조건 때문에 빈 필수가 남았으면 그 카드로)
    var bad = null;
    F.visibleList(form, state).some(function (q) { var m = F.validate(q, state); if (m) bad = { q: q, msg: m }; return !!m; });
    if (bad) {
      var bp = posOfQ(bad.q);
      if (bp >= 0 && bp !== curPos) { hpush({ v: 'card', s: secs[bp].id, d: depth() + 1 }, '#survey'); showCard(bp, 'back'); }
      var bx = blocks[bad.q.id];
      if (bx && bx.err) { bx.err.textContent = bad.msg; bx.classList.add('missing'); setTimeout(function () { bx.scrollIntoView({ behavior: smooth(), block: 'nearest' }); }, 60); }
      return;
    }
    submitting = true;
    paintNav();
    // 인터뷰 시트(boss.js send)와 같은 모양: 문항 id → 시트 열 이름(key), 숨겨진 문항 · 빈 답 · info 는 빠진다
    var answers = F.flatten(form, state);
    answers['_버전'] = content.id;
    var sid = (M.sid.indexOf('agent-test-') === 0 ? 'agent-test-' : '') + 'boss-qr-' + M.rand(10);
    var id = M.submit('boss', answers, { sid: sid, meta: { kind: 'boss' } });
    M.local.set(DONE, { contentId: content.id, at: Date.now(), id: id });
    clearTimeout(saveTimer);
    M.local.del(PROGRESS);
    state = { answers: {}, others: {} };
    submitting = false;
    showDone();
    // 지나온 카드 칸을 걷어 낸다: 소개 칸까지 되감고(popstate) 거기서 고맙습니다 한 칸을 새로 넣는다
    var d = depth();
    if (d >= 1 && history.length > d) {
      pendingDone = true;
      pendingTimer = setTimeout(function () { if (pendingDone) { pendingDone = false; hreplace({ v: 'done', d: depth() }, '#survey'); } }, 1500);
      try { history.go(-d); } catch (e) { pendingDone = false; hreplace({ v: 'done', d: d }, '#survey'); }
    } else {
      hreplace({ v: 'done', d: d }, '#survey');
    }
  }

  /* ── 보낸 뒤: 고맙습니다 ── */
  function showDone() {
    clearTimeout(advanceTimer);
    setView('done');
    var done = M.local.get(DONE) || {};
    var o = content.outro || {};
    var status = el('p', { class: 'qr-status', role: 'status', 'aria-live': 'polite' });
    var again = el('button', { type: 'button', class: 'textlink', text: '한 번 더 쓰기' });
    again.addEventListener('click', function () {
      M.local.del(DONE);
      state = freshState();
      var p = firstVisible();
      if (p < 0) { showHero(); return; }
      hreplace({ v: 'card', s: secs[p].id, d: depth() }, '#survey');
      showCard(p, 'fwd');
    });
    var card = el('section', { class: 'qd', 'aria-labelledby': 'h-done' }, [
      el('div', { class: 'qd-badge', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg>' }),
      el('h2', { id: 'h-done', tabindex: '-1', text: o.title || '말씀 고맙습니다' }),
      o.body ? el('p', { class: 'qd-body', text: o.body }) : null,
      status,
      el('div', { class: 'qd-acts' }, [demoButtons('line')]),
      el('p', { class: 'qr-again' }, [el('span', { text: '다른 분도 쓰시나요? ' }), again])
    ]);
    doneWrap.innerHTML = '';
    doneWrap.appendChild(card);
    if (moreEl) doneWrap.appendChild(moreEl);
    doneView = { el: status, done: done };
    paintStatus();
    window.scrollTo(0, 0);
  }

  function pending(id) {
    var box = M.local.get('moyeo.outbox');
    return Array.isArray(box) && box.some(function (x) { return x && x.id === id; });
  }

  function paintStatus() {
    if (!doneView || !doneView.el.isConnected) return;
    var s = doneView.el;
    s.innerHTML = '';
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
      s.appendChild(el('span', { class: 'qr-status-ic', 'aria-hidden': 'true', html: icon('tick') }));
      s.appendChild(document.createTextNode('잘 보냈어요.'));
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

  /* ── 시작 ── */
  function boot() {
    buildSecs();
    drawHero();
    if (intro) drawMore(intro);
    buildSurvey();
    doneWrap = el('div', { class: 'qd-wrap', hidden: true });
    main.innerHTML = '';
    main.appendChild(heroView);
    main.appendChild(surveyView);
    main.appendChild(doneWrap);

    var st = hstate();
    if (st) route(st, 'boot');                                   // 새로고침: 보던 화면 그대로
    else if (isDone()) {                                         // 보낸 뒤 다시 열면 고맙습니다 (뒤로가기 → 소개)
      hreplace({ v: 'hero', d: 0 }, heroUrl());
      hpush({ v: 'done', d: 1 }, '#survey');
      showDone();
    } else if (location.hash === '#survey' && savedPos() >= 0) { // 설문 주소로 바로: 소개 칸 위에 카드 한 칸
      hreplace({ v: 'hero', d: 0 }, heroUrl());
      var p = savedPos();
      hpush({ v: 'card', s: secs[p].id, d: 1 }, '#survey');
      showCard(p, 'none');
    } else {
      hreplace({ v: 'hero', d: 0 }, heroUrl());
      showHero();
    }
  }

  Promise.all([
    M.loadContent('owner-qr'),
    M.loadContent('owner-intro').catch(function (err) { console.warn('[사장님 설문] 소개 문구를 못 불러왔어요', err); return null; })
  ]).then(function (r) {
    content = r[0];
    intro = r[1];
    form = F.normalize(content);
    state = freshState();
    boot();
  }).catch(function (err) {
    console.warn('[사장님 설문] 설문을 못 불러왔어요', err);
    main.innerHTML = '';
    var retry = el('button', { type: 'button', class: 'btn primary block', text: '다시 불러오기' });
    retry.addEventListener('click', function () { location.reload(); });
    main.appendChild(el('section', { class: 'qh' }, [
      el('h1', { class: 'qh-title', text: '설문을 못 불러왔어요' }),
      el('p', { class: 'qh-lead', text: navigator.onLine === false ? '인터넷이 끊겨 있어요. 연결된 뒤 다시 눌러 주세요.' : '잠시 뒤에 다시 눌러 주세요.' }),
      el('div', { class: 'qh-cta' }, [retry])
    ]));
  });
})();
