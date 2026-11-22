// ===== 風險數據：垂直捲動 → 橫向滑行（需要先載入 gsap 與 ScrollTrigger） =====
{
  gsap.registerPlugin(ScrollTrigger);

  const risk = document.getElementById("risk");
  const track = document.getElementById("risk-track");
  const waffle = document.getElementById("waffle");

  // ---------- 百點圖改成 25 顆青蛙頭 ----------
  // 3D 青蛙頭由 js/riskFrogs.js 畫；這裡只負責兩件事：
  // 1. 動畫進度 window.riskWaffle（appear：頭冒出來、fill：變成自己那一類的顏色，都是 0～1）
  // 2. 不支援 WebGL 時的後備：25 個平面圓點（每顆＝4 人，跨兩類的用左右漸層）
  window.riskWaffle = window.riskWaffle || { appear: 1, fill: 1 };
  const waffleState = window.riskWaffle;
  const C = { worse: "#fb6291", persist: "#ffbdd1", recur: "#edebeb", other: "#c8fa6e" };
  const people = [];
  [["worse", 10], ["persist", 37], ["recur", 23], ["other", 30]].forEach(function (g) {
    for (let i = 0; i < g[1]; i++) people.push(g[0]);
  });
  let dotsHtml = "";
  for (let h = 0; h < 25; h++) {
    const four = people.slice(h * 4, h * 4 + 4);
    const a = four[0], b = four[3];
    const pct = (four.filter(function (x) { return x === a; }).length / 4) * 100;
    const bg = a === b ? C[a] : "linear-gradient(90deg, " + C[a] + " " + (pct - 20) + "%, " + C[b] + " " + (pct + 20) + "%)";
    dotsHtml += '<span class="dot ' + a + '" style="background:' + bg + '"></span>';
  }
  waffle.innerHTML = dotsHtml;

  // ---------- 三個數字的青蛙頭 ----------
  // 3D 由 js/riskStats.js 畫，進度 window.riskStats.fill（0～1）；
  // 這裡先畫平面後備圖（窄螢幕、不支援 WebGL 時看得到）：青蛙頭輪廓＋萊姆綠液體填到數值高度
  window.riskStats = window.riskStats || { fill: 1 };
  const statsState = window.riskStats;
  document.querySelectorAll(".stat-head").forEach(function (slot, i) {
    const v = Number(slot.dataset.value) / 100;
    const top = -83, bot = 69, lvl = bot - v * (bot - top);
    const shapes = function (attrs) {
      return '<ellipse cx="0" cy="0" rx="87" ry="69" ' + attrs + '/><circle cx="-40" cy="-51" r="32" ' + attrs + '/><circle cx="40" cy="-51" r="32" ' + attrs + '/>';
    };
    slot.insertAdjacentHTML("afterbegin",
      '<svg viewBox="-92 -92 184 168" aria-hidden="true"><defs>' +
      '<clipPath id="stat-clip-' + i + '">' + shapes("") + '</clipPath>' +
      '<linearGradient id="stat-grad-' + i + '" x1="0" y1="' + bot + '" x2="0" y2="' + lvl + '" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0" stop-color="#c8fa6e"/><stop offset="1" stop-color="#c8fa6e" stop-opacity="0.35"/></linearGradient></defs>' +
      '<g>' + shapes('fill="none" stroke="#b6f04a" stroke-width="2"') + '</g>' +
      '<g>' + shapes('fill="#fff"') + '</g>' +
      '<g clip-path="url(#stat-clip-' + i + ')"><rect x="-92" y="' + lvl + '" width="184" height="' + (bot - lvl + 4) + '" fill="url(#stat-grad-' + i + ')"/></g>' +
      '<circle cx="-40" cy="-61" r="12" fill="#fff" stroke="#d7f5a6"/><circle cx="40" cy="-61" r="12" fill="#fff" stroke="#d7f5a6"/></svg>');
  });


  // 數字從 0 跳到目標值（scrub 時跟著捲動來回）
  function countTo(tl, el, to, decimals, position) {
    const proxy = { v: 0 };
    el.textContent = (0).toFixed(decimals);
    tl.to(proxy, {
      v: to,
      ease: "power1.out",
      onUpdate: function () { el.textContent = proxy.v.toFixed(decimals); },
    }, position);
  }

  const mm = gsap.matchMedia();

  // ---------- 桌機＋沒開減少動態：橫向滑行 ----------
  mm.add("(min-width: 901px) and (prefers-reduced-motion: no-preference)", function () {
    risk.classList.remove("is-static");

    // 主動畫：整條軌道往左移，移動距離＝軌道總寬－一個畫面寬
    const distance = function () { return track.scrollWidth - window.innerWidth; };
    const panels = gsap.utils.toArray(".risk-panel");
    const scrollTween = gsap.to(track, {
      x: function () { return -distance(); },
      ease: "none",
      scrollTrigger: {
        trigger: risk,
        start: "top top",
        end: function () { return "+=" + distance(); },
        pin: ".risk-pin",
        scrub: 1,
        invalidateOnRefresh: true,
        // 放開滑鼠滾輪時，自動停在最近的一頁
        snap: {
          snapTo: function (value) {
            const points = panels.map(function (p) { return Math.min(1, p.offsetLeft / distance()); });
            return gsap.utils.snap(points, value);
          },
          duration: { min: 0.2, max: 0.6 },
          ease: "power1.inOut",
        },
      },
    });

    // 以下每一頁的動畫，都用 containerAnimation 綁在橫向位置上

    // 00 開場：大標往左慢慢飄（視差），箭頭來回輕推
    gsap.to("#intro-title", {
      xPercent: -12, ease: "none",
      scrollTrigger: { trigger: ".panel-intro", containerAnimation: scrollTween, start: "left left", end: "right left", scrub: true },
    });
    gsap.to(".intro-arrow", { x: 24, duration: 0.8, repeat: -1, yoyo: true, ease: "sine.inOut" });

    // 01 百點圖：100 個細圈先冒出來 → 依序變成自己的類別 → 70% 跟著數
    // 進度歸零，讓頭跟著捲動冒出來、變色
    waffleState.appear = 0;
    waffleState.fill = 0;
    const wtl = gsap.timeline({
      scrollTrigger: { trigger: ".panel-waffle", containerAnimation: scrollTween, start: "left 85%", end: "left 10%", scrub: 0.6 },
    });
    // 先全部以萊姆綠冒出來（每個人一開始都只是小痛）→ 再依嚴重程度一顆顆變成黃、灰、粉、桃紅
    wtl.to(waffleState, { appear: 1, duration: 0.35, ease: "none" }, 0)
      .to(waffleState, { fill: 1, duration: 0.6, ease: "none" }, 0.35);
    countTo(wtl, document.getElementById("waffle-num"), 70, 0, 0.35);
    wtl.from(".legend li", { x: 40, opacity: 0, stagger: 0.08, duration: 0.25 }, 0.4);

    // 02 三個數字：頂線由左畫出、數字跳到目標值、青蛙頭裡的液體漲上來
    const stl = gsap.timeline({
      scrollTrigger: { trigger: ".panel-stats", containerAnimation: scrollTween, start: "left 80%", end: "left 10%", scrub: 0.6 },
    });
    stl.from(".stat-line", { scaleX: 0, stagger: 0.15, duration: 0.5, ease: "power2.out" }, 0);
    // 青蛙頭裡的液體跟著數字一起漲上來
    statsState.fill = 0;
    stl.to(statsState, { fill: 1, duration: 0.8, ease: "none" }, 0.1);
    document.querySelectorAll(".stat .num").forEach(function (el, i) {
      countTo(stl, el, Number(el.dataset.to), Number(el.dataset.dec), 0.1 + i * 0.15);
    });
    stl.from(".stat-text, .stat .risk-source", { y: 20, opacity: 0, stagger: 0.05, duration: 0.3 }, 0.3);

    // 離開這個情況（例如視窗縮小）時，matchMedia 會自動還原以上全部動畫
    return function () { risk.classList.add("is-static"); };
  });

  // ---------- 窄螢幕或減少動態：直接往下排，數字顯示最終值 ----------
  mm.add("(max-width: 900px), (prefers-reduced-motion: reduce)", function () {
    risk.classList.add("is-static");
    waffleState.appear = 1; // 直接顯示最終顏色
    waffleState.fill = 1;
    statsState.fill = 1;
  });
}
