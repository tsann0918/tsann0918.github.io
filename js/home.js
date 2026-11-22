// ===== 首頁 redesign：主視覺縮放、部位按鈕、進場動畫 =====
// 需要先載入 gsap 與 ScrollTrigger（風險數據區的橫向捲動在 risk-scroll.js）
{
  // ---------- 主視覺：依畫面寬度等比例縮放設計稿（1728 寬） ----------
  const hero = document.getElementById("home-hero");
  const heroInner = document.getElementById("home-hero-inner");
  const DESIGN_WIDTH = 1728;

  function resizeHero() {
    const scale = hero.clientWidth / DESIGN_WIDTH;
    heroInner.style.setProperty("--hero-scale", scale);
    // 對話框反向縮放回實際大小（字級才會跟其他頁一致）；窄螢幕最多放大 1.5 倍，免得蓋滿青蛙
    heroInner.style.setProperty("--pop-scale", Math.min(1.5, 1 / scale));
  }
  resizeHero();
  window.addEventListener("resize", resizeHero);

  // ---------- 三個對話框換成液態玻璃（照 Figma：白 30%＋背景模糊＋邊光＋外陰影） ----------
  const BUBBLE = "M44 0H292C302.667 0 308 5.33333 308 16V184C308 194.667 302.667 200 292 200H44C33.3333 200 28 194.667 28 184V62L0 44L28 26V16C28 5.33333 33.3333 0 44 0Z";
  const GLASS_BLUR = { eye: 4, organ: 12, arm: 4 }; // 背景模糊（Figma 數值，手臂比照眼睛）
  document.querySelectorAll(".home-popout").forEach(function (pop) {
    const key = pop.dataset.popout;
    const img = pop.querySelector(".popout-bubble");
    const flip = img && img.classList.contains("popout-bubble-flip");
    const id = "glass-" + key;
    const glass = document.createElement("span");
    glass.className = "glass" + (flip ? " is-flip" : "");
    glass.setAttribute("aria-hidden", "true");
    glass.style.setProperty("--glass-blur", (GLASS_BLUR[key] || 4) + "px");
    glass.innerHTML =
      // 外陰影：黑色 25%、模糊 4，用遮罩挖掉對話框本身，只留外面
      '<svg class="glass-shadow" viewBox="-20 -20 348 240"><defs>' +
        '<mask id="' + id + '-m" maskUnits="userSpaceOnUse" x="-20" y="-20" width="348" height="240">' +
          '<rect x="-20" y="-20" width="348" height="240" fill="#fff"/><path d="' + BUBBLE + '" fill="#000"/></mask>' +
        '<filter id="' + id + '-f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>' +
      '</defs><path d="' + BUBBLE + '" fill="rgba(0,0,0,0.25)" filter="url(#' + id + '-f)" mask="url(#' + id + '-m)"/></svg>' +
      // 玻璃本體
      '<span class="glass-fill"></span>' +
      // 邊光
      '<svg class="glass-rim" viewBox="0 0 308 200"><defs>' +
        '<linearGradient id="' + id + '-r" x1="0" y1="0" x2="308" y2="200" gradientUnits="userSpaceOnUse">' +
          '<stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.15"/>' +
          '<stop offset="1" stop-color="#fff" stop-opacity="0.7"/></linearGradient>' +
      '</defs><path d="' + BUBBLE + '" fill="none" stroke="url(#' + id + '-r)" stroke-width="1.5"/></svg>';
    const inner = pop.querySelector(".pop-inner");
    inner.insertBefore(glass, inner.firstChild);
    pop.classList.add("has-glass");
  });

  // ---------- 對話框：一次只顯示一個，自動輪流 ----------
  // 順序：眼睛 → 內臟 → 手臂；滑鼠移到部位或對話框上就停在那一個，移開 3.5 秒後繼續輪
  const ORDER = ["eye", "organ", "arm"];
  const STAY = 3.5; // 每個停留秒數
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pops = {};
  const parts = {};
  document.querySelectorAll(".home-popout").forEach(function (p) { pops[p.dataset.popout] = p; });
  document.querySelectorAll(".home-part").forEach(function (p) { parts[p.dataset.part] = p; });
  let current = null;   // 目前顯示的部位
  let timer = null;     // 下一次切換的計時
  let holding = false;  // 滑鼠停在部位／對話框上
  let heroVisible = true;

  // 切到某個部位
  function showPopout(key) {
    if (key === current) return;
    const prev = current ? pops[current] : null;
    const next = pops[key];
    current = key;
    // 部位按鈕：目前這個換成 Active 圖，其他換回預設
    Object.keys(parts).forEach(function (k) {
      const img = parts[k].querySelector("img");
      img.src = k === key ? img.dataset.active : img.dataset.default;
    });
    if (prev) prev.classList.remove("is-active");
    next.classList.add("is-active");
    if (reduce) return; // 減少動態：直接切換，不做動畫
    const prevInner = prev && prev.querySelector(".pop-inner");
    const nextInner = next.querySelector(".pop-inner");
    if (prevInner) {
      gsap.killTweensOf(prevInner);
      gsap.to(prevInner, { autoAlpha: 0, scale: 0.9, duration: 0.25, ease: "power2.in" });
    }
    gsap.killTweensOf(nextInner);
    gsap.fromTo(nextInner,
      { autoAlpha: 0, scale: 0.7 },
      { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(1.8)", delay: prevInner ? 0.12 : 0 });
    // 標題和症狀標籤一個個跳進來
    gsap.fromTo(next.querySelectorAll(".pop-head, .chip"),
      { y: 8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, stagger: 0.04, ease: "power2.out", delay: prevInner ? 0.2 : 0.1, clearProps: "transform,opacity" });
  }

  // 排下一次切換
  function schedule() {
    if (timer) timer.kill();
    timer = null;
    if (holding || !heroVisible || reduce) return;
    timer = gsap.delayedCall(STAY, function () {
      showPopout(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
      schedule();
    });
  }

  // 滑鼠／鍵盤停在某個部位：切過去並停住
  function hold(key) {
    holding = true;
    if (timer) timer.kill();
    showPopout(key);
  }
  function release() {
    holding = false;
    schedule();
  }
  ORDER.forEach(function (key) {
    const part = parts[key];
    part.addEventListener("mouseenter", function () { hold(key); });
    part.addEventListener("mouseleave", release);
    part.addEventListener("focus", function () { hold(key); });
    part.addEventListener("blur", release);
    // 對話框裡的連結（部位名稱、症狀標籤）也算停住
    pops[key].querySelectorAll("a").forEach(function (a) {
      a.addEventListener("mouseenter", function () { hold(key); });
      a.addEventListener("mouseleave", release);
      a.addEventListener("focus", function () { hold(key); });
      a.addEventListener("blur", release);
    });
  });

  // 主視覺捲出畫面就暫停輪播，回來再繼續
  new IntersectionObserver(function (entries) {
    heroVisible = entries[0].isIntersecting;
    if (current) schedule();
  }).observe(hero);

  // 減少動態：直接顯示眼睛，不自動輪
  if (reduce) showPopout("eye");

    // ---------- 進場動畫（使用者開啟「減少動態」時不播） ----------
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: no-preference)", function () {
    // 主視覺：四行大字依序往上浮現 → 說明文字 → 青蛙從右邊滑入、部位按鈕彈出 → 症狀對話框出現
    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    intro
      .from(".home-hero-title span", { yPercent: 60, opacity: 0, duration: 0.8, stagger: 0.12 })
      .from(".home-hero-about > *", { y: 20, opacity: 0, duration: 0.6, stagger: 0.1 }, "-=0.4")
      .from(".home-hero-frog", { x: 120, opacity: 0, duration: 1 }, 0.2)
      .from(".home-part", { scale: 0, duration: 0.5, ease: "back.out(2.5)", stagger: 0.1, clearProps: "transform" }, 0.9)
      // 對話框：先出現眼睛，接著開始自動輪流
      .call(function () { if (!current) showPopout("eye"); schedule(); }, null, 1.3);

    // 部位按鈕待機：心臟慢慢跳（用 img 動畫，不影響 .body-button 的 hover 彈跳）
    gsap.to(".part-heart img", { scale: 1.12, duration: 0.5, repeat: -1, yoyo: true, ease: "sine.inOut", repeatDelay: 0.6 });

    // 往下捲時，主視覺大字往上飄，青蛙微微縮小（視差）
    gsap.to(".home-hero-text", { // 大標和說明一起往上飄
      y: -80, ease: "none",
      scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
    });

    // 字卡：頂線由左畫出 → 圖示、部位名稱、症狀列依序浮上來
    const cards = gsap.timeline({ scrollTrigger: { trigger: ".home-cards-row", start: "top 75%" } });
    cards
      .from(".home-cards-line", { scaleX: 0, duration: 0.9, ease: "power3.out" })
      .from(".home-card-icon, .home-card-title", { y: 24, opacity: 0, duration: 0.5, stagger: 0.08 }, "-=0.5")
      .from(".home-rows li", { y: 16, opacity: 0, duration: 0.35, stagger: 0.03 }, "-=0.3")
      .from(".home-card-more", { opacity: 0, duration: 0.4, stagger: 0.1 }, "-=0.2");
    gsap.from(".home-cards-head > *", {
      y: 30, opacity: 0, duration: 0.7, stagger: 0.12, ease: "power3.out",
      scrollTrigger: { trigger: ".home-cards", start: "top 80%" },
    });
  });
}
