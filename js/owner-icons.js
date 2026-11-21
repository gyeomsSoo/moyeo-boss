/* 사장님 QR 설문 — 두 톤 선 그림 아이콘 (24×24, 외부 파일·CDN 없음)
 *
 *  그리는 말: 선은 먹색(currentColor), 강조 선은 파랑, 면은 옅은 파랑.
 *    class "f"  옅은 파랑 면 + 먹색 선      (--oi-tint 로 면 색을 바꾼다: 고른 칸에서는 흰색)
 *    class "b"  파랑 선
 *    class "w"  흰 면 + 선
 *    class "d"  먹색 점(면만)   class "bd"  파랑 점(면만)
 *  쓰는 법: M.OwnerIcons.svg('dice') → '<svg class="oi" …>' 문자열. 모르는 이름이면 빈 문자열.
 *  owner-qr.json 의 ui.icons 이름과 맞춘다. 새 이름이 생기면 여기에 더한다(없으면 아이콘 없이 글자만 보인다).
 */
(function () {
  'use strict';
  var M = window.Moyeo = window.Moyeo || {};

  var P = {
    /* ── 업종 ── */
    dice: '<rect class="f" x="4" y="4" width="16" height="16" rx="4"/><circle class="bd" cx="9" cy="9" r="1.35"/><circle class="bd" cx="15" cy="9" r="1.35"/><circle class="bd" cx="12" cy="12" r="1.35"/><circle class="bd" cx="9" cy="15" r="1.35"/><circle class="bd" cx="15" cy="15" r="1.35"/>',
    cup: '<path class="f" d="M5 9.5h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.2a2.3 2.3 0 0 1 0 4.6H16"/><path class="b" d="M9 3.6c-.9 1 .9 2 0 3.2M12.6 3.6c-.9 1 .9 2 0 3.2"/><path d="M4 21.2h13"/>',
    mic: '<rect class="f" x="9" y="2.8" width="6" height="11" rx="3"/><path class="b" d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3.8M9 20.8h6"/>',
    billiard: '<circle class="f" cx="8" cy="15" r="5"/><circle class="w" cx="8" cy="15" r="1.9"/><circle class="w" cx="17.6" cy="17.4" r="3.2"/><path class="b" d="M21 3l-8.4 8.4" stroke-width="2.2"/>',
    bowling: '<path class="f" d="M10 2.8c1.5 0 2.3 1.1 2.3 2.4 0 1.3-.8 2.1-.8 3.3 0 1.5 2.1 3 2.1 6.5 0 3.3-1.6 6.2-3.6 6.2s-3.6-2.9-3.6-6.2c0-3.5 2.1-5 2.1-6.5 0-1.2-.8-2-.8-3.3 0-1.3.8-2.4 2.3-2.4z"/><path class="b" d="M8.6 8.2h2.8"/><circle class="w" cx="18" cy="17.6" r="3.2"/><circle class="bd" cx="17.2" cy="16.6" r=".7"/><circle class="bd" cx="18.9" cy="16.9" r=".7"/>',
    golf: '<path d="M8 20.6V3.5"/><path class="f b" d="M8 4l8.5 3.3L8 10.6z"/><path d="M3.5 20.6h10"/><circle class="w" cx="17.5" cy="17.6" r="2"/>',
    pingpong: '<rect class="f" x="9.3" y="14.6" width="3.4" height="6.9" rx="1.5"/><circle class="f" cx="11" cy="9.2" r="6.4"/><path class="b" d="M7.6 6.8a4.2 4.2 0 0 1 3-1.9"/><circle class="bd" cx="19.4" cy="16.2" r="2"/>',
    brush: '<path class="f" d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.7 1.7-1.7h2.1A4.4 4.4 0 0 0 21 10.2C21 6.4 17 3.5 12 3.5z"/><circle class="bd" cx="7.6" cy="11.4" r="1.3"/><circle class="bd" cx="10" cy="7.5" r="1.3"/><circle class="bd" cx="14.6" cy="7.5" r="1.3"/>',
    balloon: '<path class="f" d="M12 3a5.8 5.8 0 0 0-5.8 5.8c0 3.7 3.3 6.6 5.8 7.6 2.5-1 5.8-3.9 5.8-7.6A5.8 5.8 0 0 0 12 3z"/><path d="M11 16.4l1 1.3 1-1.3"/><path class="b" d="M12 17.7c-1.2 1.4 1.2 2.4 0 3.8M9.4 7.6a3 3 0 0 1 2-1.8"/>',
    gamepad: '<path class="f" d="M7.5 7.5h9a4.5 4.5 0 0 1 4.5 4.5v2.6a2.9 2.9 0 0 1-5.2 1.7L14.6 15H9.4l-1.2 1.3A2.9 2.9 0 0 1 3 14.6V12a4.5 4.5 0 0 1 4.5-4.5z"/><path d="M7.8 10.2v3.4M6.1 11.9h3.4"/><circle class="bd" cx="15.6" cy="10.9" r="1.15"/><circle class="bd" cx="17.6" cy="12.9" r="1.15"/>',
    climb: '<path class="f" d="M2.8 20.2l6.6-11.4 3.5 5.6 2.6-3.9 5.7 9.7z"/><path d="M9.4 8.8V3.6"/><path class="f b" d="M9.4 3.8l4.2 1.6-4.2 1.6z"/><circle class="bd" cx="15.5" cy="16.6" r="1.1"/><circle class="bd" cx="9.6" cy="16" r="1.1"/>',
    more: '<rect class="f" x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle class="bd" cx="8" cy="12" r="1.4"/><circle class="bd" cx="12" cy="12" r="1.4"/><circle class="bd" cx="16" cy="12" r="1.4"/>',

    /* ── 때 ── */
    sun: '<circle class="f" cx="12" cy="12" r="4.2"/><path class="b" d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
    moon: '<path class="f" d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z"/><path class="b" d="M17 3.4v2.6M15.7 4.7h2.6"/>',
    night: '<path class="f" d="M16.5 15.4A6.6 6.6 0 1 1 9.1 6.4a5.2 5.2 0 0 0 7.4 9z"/><path class="b" d="M18 3.4v3M16.5 4.9h3M20.4 9.4v2.2M19.3 10.5h2.2"/>',
    busy: '<circle class="f" cx="13.5" cy="12" r="7"/><path d="M13.5 8.6V12l2.4 1.6"/><path class="b" d="M2.5 8.5h3M2 12h2.6M2.5 15.5h3"/>',

    /* ── 마음 · 고르기 ── */
    smile: '<circle class="f" cx="12" cy="12" r="8.5"/><circle class="d" cx="9" cy="10" r="1.1"/><circle class="d" cx="15" cy="10" r="1.1"/><path class="b" d="M8.4 13.8a4.2 4.2 0 0 0 7.2 0"/>',
    think: '<circle class="f" cx="12" cy="12" r="8.5"/><circle class="d" cx="9" cy="10" r="1.1"/><circle class="d" cx="15" cy="10" r="1.1"/><path class="b" d="M9 15.4l6-1.2"/>',
    store: '<path class="f" d="M4.5 10v10h15V10"/><path d="M3.5 8.4L5.2 4h13.6l1.7 4.4"/><path d="M3.5 8.4a2.85 2.85 0 0 0 5.7 0 2.8 2.8 0 0 0 5.6 0 2.85 2.85 0 0 0 5.7 0"/><path class="b" d="M10 20v-4.5h4V20"/>',
    question: '<circle class="f" cx="12" cy="12" r="8.5"/><path class="b" d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.6v.4"/><circle class="bd" cx="12" cy="16.6" r="1.1"/>',
    person: '<circle class="f" cx="12" cy="8" r="3.6"/><path class="f" d="M5 20.5a7 7 0 0 1 14 0z"/>',
    calendar: '<rect class="f" x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path class="b" d="M8 14.2h2M14 14.2h2M8 17.4h2"/>',
    percent: '<rect class="f" x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path class="b" d="M8.5 15.5l7-7"/><circle class="w" cx="9" cy="9" r="1.6"/><circle class="w" cx="15" cy="15" r="1.6"/>',
    thumb: '<rect class="f" x="3.5" y="10.5" width="3.5" height="9" rx="1"/><path class="f" d="M7 10.5l3.4-6a1.8 1.8 0 0 1 3.3 1.3L13 9.5h5.1a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7z"/>',
    eye: '<path class="f" d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle class="w b" cx="12" cy="12" r="3"/>',
    pause: '<circle class="f" cx="12" cy="12" r="8.5"/><path class="b" d="M10 9v6M14 9v6"/>',
    pin: '<path class="f" d="M12 21s-6.5-5.5-6.5-11a6.5 6.5 0 0 1 13 0c0 5.5-6.5 11-6.5 11z"/><circle class="w b" cx="12" cy="10" r="2.4"/>',
    edit: '<path class="f" d="M4.5 19.5l.9-4.2L15.6 5.1a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.7 18.6z"/><path class="b" d="M13.6 7.1l3.3 3.3M13 20.5h7"/>',
    x: '<circle class="f" cx="12" cy="12" r="8.5"/><path class="b" d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/>',
    check: '<circle class="f" cx="12" cy="12" r="8.5"/><path class="b" d="M8 12.3l2.8 2.8 5.2-5.4"/>',

    /* ── 걸리는 점 ── */
    phone: '<rect class="f" x="6.5" y="2.5" width="11" height="19" rx="2.8"/><path d="M10.8 18.5h2.4"/><path class="b" d="M12 7.6v3.2l1.9 1.1"/>',
    coin: '<circle class="f" cx="12" cy="12" r="8.5"/><path class="b" d="M8.3 8.8l1.8 6.4 1.9-5 1.9 5 1.8-6.4M7.6 11.6h8.8"/>',
    people: '<circle class="f" cx="9" cy="8.5" r="3.2"/><path class="f" d="M3 19.5a6 6 0 0 1 12 0z"/><circle class="b" cx="16.6" cy="8" r="2.6"/><path class="b" d="M15.6 13.4a5.2 5.2 0 0 1 5.4 5.6"/>',
    calendarx: '<rect class="f" x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path class="b" d="M10 13l4 4M14 13l-4 4"/>',
    apps: '<rect class="f" x="3.5" y="3.5" width="7" height="7" rx="2"/><rect class="f" x="13.5" y="3.5" width="7" height="7" rx="2"/><rect class="f" x="3.5" y="13.5" width="7" height="7" rx="2"/><path class="b" d="M17 13.8v6.4M13.8 17h6.4"/>',
    lock: '<rect class="f" x="5" y="10.5" width="14" height="10" rx="2.6"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path class="b" d="M12 14.4v2.4"/>',
    seat: '<path class="f" d="M7.5 12.5V6a2.5 2.5 0 0 1 2.5-2.5h4A2.5 2.5 0 0 1 16.5 6v6.5"/><rect class="f" x="4.5" y="12.5" width="15" height="3.8" rx="1.6"/><path class="b" d="M6.5 16.3v4M17.5 16.3v4"/>',

    /* ── 이야기 · 그림 ── */
    tap: '<path class="f" d="M9.5 12.5V5.8a1.6 1.6 0 0 1 3.2 0v5.4l4.1.9a2.1 2.1 0 0 1 1.6 2.4l-.7 4a2.2 2.2 0 0 1-2.2 1.8h-4.3a2.2 2.2 0 0 1-1.8-.9l-3-4.1a1.5 1.5 0 0 1 2.3-1.9z"/><path class="b" d="M11.1 1.2v1.5M7.5 2.5l.9 1.1M14.7 2.5l-.9 1.1"/>',
    bell: '<path class="f" d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path class="b" d="M10 19.8a2 2 0 0 0 4 0"/>',
    pay: '<rect class="f" x="4.5" y="2.5" width="10.5" height="19" rx="2.6"/><path d="M8.5 18.5h2.5"/><circle class="w b" cx="16.8" cy="13.6" r="4"/><path class="b" d="M15.1 13.7l1.2 1.2 2.2-2.4"/>',
    route: '<circle class="f" cx="6" cy="6" r="2.6"/><circle class="f" cx="18" cy="18" r="2.6"/><path class="b" d="M8.6 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.4"/>',
    star: '<path class="f" d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
    faq: '<path class="f" d="M4 5h16v11.2h-8.5L7 19.8v-3.6H4z"/><path class="b" d="M10.2 8.9a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.3"/><circle class="bd" cx="12" cy="13.9" r=".95"/>',
    call: '<path class="f" d="M6.2 3.8h2.6l1.5 4.3-2 1.3a11.3 11.3 0 0 0 6.3 6.3l1.3-2 4.3 1.5v2.6a2 2 0 0 1-2.2 2A16.4 16.4 0 0 1 4.2 6a2 2 0 0 1 2-2.2z"/>',
    sms: '<path class="f" d="M4 5h16v11.2h-8.5L7 19.8v-3.6H4z"/><circle class="bd" cx="8.5" cy="10.6" r="1.1"/><circle class="bd" cx="12" cy="10.6" r="1.1"/><circle class="bd" cx="15.5" cy="10.6" r="1.1"/>',
    insta: '<rect class="f" x="3.5" y="3.5" width="17" height="17" rx="5"/><circle class="w" cx="12" cy="12" r="4"/><circle class="bd" cx="16.9" cy="7.1" r="1.1"/>',

    /* ── 화면 도구 (한 톤) ── */
    back: '<path d="M14.5 5l-7 7 7 7" stroke-width="2.4"/>',
    chev: '<path d="M6 9l6 6 6-6" stroke-width="2.2"/>',
    tick: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="3"/>',
    search: '<circle cx="11" cy="11" r="6.2" stroke-width="2"/><path d="M20 20l-4.4-4.4" stroke-width="2"/>',
    arrow: '<path d="M4 12h15M13.5 6.5L19 12l-5.5 5.5" stroke-width="2"/>'
  };

  function svg(name, cls) {
    var body = P[name];
    if (!body) return '';
    return '<svg class="oi' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  M.OwnerIcons = { svg: svg, has: function (name) { return !!P[name]; } };
})();
