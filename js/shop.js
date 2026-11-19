// ===== 商店頁互動 =====
// 各 frame 的互動與動畫依序加入：
// 00 商店首頁、01 貼布飛入、02 開場、03 運作原理、04 規格數字、05 貼布構造、06 購買
// 本檔以 ES module 載入（shop.html 用 type="module"），才能匯入 3D 模組

import { createPouchEntrance } from "./pouchEntrance.js";
import { createLayersFx } from "./layersFx.js";

// 使用者是否開啟「減少動態效果」
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// ===== 01 貼布飛入 =====
// 1. 飛入段跟著捲動（倒捲時倒著飛）
// 2. 飛到定位後，撕開、開袋、貼布彈出自動播完
// 3. 貼布 Q 彈完，頁面以彈性效果自動捲到 02
// 往回捲到飛入範圍時重設，再往下捲會整段重播
const FLYIN = {
  flyEndAt: 0.5, // 捲到區塊的 50% 時飛入完成，接著自動播放撕開與彈出
  smooth: 1, // 飛入跟上捲動的平滑程度（0~1，越小越慢跟上捲動）
  zoom: 1.6, // 袋子大小倍率（1＝參考檔預設大小）
  resetBelow: 0.95, // 自動播放後，飛入進度倒退到這個值以下就重設（可重播）
  jumpDelay: 200, // Q 彈結束後等多久開始捲到 02（毫秒）
  jumpMs: 1400, // 捲到 02 的時間（毫秒）
  overshoot: 0.15, // 彈性：第一次衝過頭的比例（15%）
  bounces: 2.5, // 彈性：擺盪圈數（約回彈兩次）
};

const flyinSection = document.getElementById("flyin");
let flyinAutoDone = null; // 自動播放結束時呼叫（由下方流程設定）
const pouch = createPouchEntrance(document.getElementById("flyin-canvas"), {
  zoom: FLYIN.zoom,
  onComplete: () => { if (flyinAutoDone) flyinAutoDone(); },
});

// 計算 01 區塊的捲動進度（0＝區塊頂端剛碰到畫面頂端，1＝固定畫面即將離開）
function getFlyinProgress() {
  const rect = flyinSection.getBoundingClientRect();
  const scrollable = rect.height - window.innerHeight;
  if (scrollable <= 0) return 1;
  return Math.min(1, Math.max(0, -rect.top / scrollable));
}

// ----- 彈性捲動：捲到指定位置，先衝過頭再回彈 -----
// 曲線：1 − e^(−a·k)·cos(b·k)，b 決定擺盪圈數，a 由 overshoot 反推
const bounceB = FLYIN.bounces * Math.PI;
const bounceA = (Math.log(1 / FLYIN.overshoot) * bounceB) / Math.PI;
const easeBounce = (k) => (k >= 1 ? 1 : 1 - Math.exp(-bounceA * k) * Math.cos(bounceB * k));

let bounceRaf = 0; // 目前的彈性捲動（0＝沒有）
function cancelBounceScroll() {
  if (bounceRaf) cancelAnimationFrame(bounceRaf);
  bounceRaf = 0;
}
function bounceScrollTo(targetY, ms) {
  cancelBounceScroll();
  const startY = window.scrollY;
  const dist = targetY - startY;
  const start = performance.now();
  function step(now) {
    const k = Math.min(1, (now - start) / ms);
    window.scrollTo({ top: startY + dist * easeBounce(k), behavior: "instant" });
    bounceRaf = k < 1 ? requestAnimationFrame(step) : 0;
  }
  bounceRaf = requestAnimationFrame(step);
}
// 使用者自己捲動或按鍵時，立刻取消自動捲動，把控制權還給使用者
["wheel", "touchstart", "keydown", "mousedown"].forEach((type) =>
  window.addEventListener(type, cancelBounceScroll, { passive: true }),
);

if (!reduceMotion) {
  const flyEnd = pouch.timeline.flyEnd; // 飛入結束的故事時間（秒）
  let current = 0; // 目前飛入進度 0~1（平滑後）
  let mode = "scrub"; // scrub＝跟著捲動飛入；auto＝自動播放中或已播完
  let jumpTimer = null;

  // 捲動進度 → 飛入進度（0~flyEndAt 對應 0~1）
  const flyTarget = () => Math.min(1, getFlyinProgress() / FLYIN.flyEndAt);

  // 自動播放結束（貼布 Q 彈完）→ 稍等一下，彈性捲到 02
  flyinAutoDone = () => {
    if (mode !== "auto") return;
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => {
      const introTop = document.getElementById("intro").getBoundingClientRect().top + window.scrollY;
      bounceScrollTo(introTop, FLYIN.jumpMs);
    }, FLYIN.jumpDelay);
  };

  function updateFlyin() {
    const target = flyTarget();

    if (mode === "auto") {
      // 往回捲到飛入範圍：重設成跟著捲動，之後可再重播
      if (target < FLYIN.resetBelow) {
        mode = "scrub";
        clearTimeout(jumpTimer);
        cancelBounceScroll();
        current = 1;
      } else {
        requestAnimationFrame(updateFlyin);
        return;
      }
    }

    // 跟著捲動飛入
    const diff = target - current;
    if (Math.abs(diff) > 0.0005) current += diff * FLYIN.smooth;
    else current = target;
    pouch.seek(current * flyEnd);

    // 飛入完成：撕開、捲起彈掉、轉正、開袋、貼布彈出，由動畫自己播完
    if (current >= 1) {
      mode = "auto";
      pouch.play();
    }
    requestAnimationFrame(updateFlyin);
  }

  // 模型載入後，先對齊目前的捲動位置（例如重新整理時停在頁面中間）
  pouch.ready.then(() => {
    current = flyTarget();
    requestAnimationFrame(updateFlyin);
  });
}
// 減少動態時，pouchEntrance 模組會自己停在最後畫面，也不會自動捲動

// ===== 02 開場：3D 袋子停在左欄商品圖位置，原地緩慢擺動；右欄文字依序滑入 =====
const INTRO = {
  zoom: 1.8, // 3D 袋子的繪製倍率（要比商品圖大，縮小貼齊時才清晰）
  stagger: 0.08, // 文字依序出現的間隔（秒）
  triggerRatio: 0.6, // 區塊露出畫面多少比例時文字開始滑入
  timeoutMs: 8000, // 模型太久沒載入就改顯示靜態圖
};

const introSection = document.getElementById("intro");
const introImg = document.getElementById("intro-img");
const introCanvas = document.getElementById("intro-canvas");
const introReveals = introSection.querySelectorAll(".intro-reveal");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 右欄文字依序滑入（animate＝false 時直接顯示）
function revealIntroText(animate) {
  introReveals.forEach((el, i) => {
    el.style.transitionDelay = animate ? `${i * INTRO.stagger}s` : "0s";
    el.classList.add("is-revealed");
  });
}

if (reduceMotion) {
  // 減少動態：不使用 3D，直接顯示商品圖與文字
  revealIntroText(false);
} else {
  introSection.classList.add("is-3d");

  let placed = false; // 3D 袋子是否已對齊商品圖
  const pouch2 = createPouchEntrance(introCanvas, { zoom: INTRO.zoom });

  // 計算讓袋子對齊商品圖的位移與縮放，套用在 3D 畫布上
  function placeAtImage() {
    const pouchRect = pouch2.getScreenRect({ upright: 1, sway: false }); // 轉正後的袋子外框
    if (!pouchRect) return;
    const box = introSection.getBoundingClientRect(); // 畫布未變形時與區塊同位置
    const img = introImg.getBoundingClientRect();
    const scale = img.height / pouchRect.height;
    const cx = pouchRect.x + pouchRect.width / 2;
    const cy = pouchRect.y + pouchRect.height / 2;
    const tx = img.left - box.left + img.width / 2 - cx;
    const ty = img.top - box.top + img.height / 2 - cy;
    introCanvas.style.transformOrigin = `${cx}px ${cy}px`;
    introCanvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  // 載入失敗或太慢：改顯示靜態商品圖
  function fallbackToStatic() {
    introSection.classList.remove("is-3d", "is-ready");
    revealIntroText(false);
    pouch2.dispose();
  }

  // 模型載入後：袋子停在飛入結束的姿勢並轉正，貼齊商品圖，開始緩慢擺動
  Promise.race([
    pouch2.ready.then(() => true),
    wait(INTRO.timeoutMs).then(() => false),
  ]).then((ok) => {
    if (!ok) {
      fallbackToStatic();
      return;
    }
    pouch2.seek(pouch2.timeline.flyEnd); // 不播飛入，直接用最後姿勢
    pouch2.setUpright(1);
    placeAtImage();
    placed = true;
    pouch2.setSway(true);
    introSection.classList.add("is-ready"); // 顯示 3D 畫布
  });

  // 區塊露出足夠比例時，右欄文字依序滑入（只播一次）
  const introObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      const seen = entry.intersectionRect.height;
      const need =
        Math.min(entry.boundingClientRect.height, window.innerHeight) *
        INTRO.triggerRatio;
      if (seen < need) return;
      introObserver.disconnect();
      revealIntroText(true);
    },
    { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
  );
  introObserver.observe(introSection);

  // 視窗大小改變：袋子重新對齊商品圖
  // 延後兩格，等 3D 模組先依新尺寸更新鏡頭再量測
  window.addEventListener("resize", () => {
    if (!placed) return;
    requestAnimationFrame(() => requestAnimationFrame(() => placeAtImage()));
  });
}

// ===== 04 規格數字：四張卡依序從右側滑入（數字直接顯示，不跳動） =====
const SPECS = {
  stagger: 120, // 每張卡間隔（毫秒）；滑入時間 0.9 秒寫在 CSS
  triggerRatio: 0.8, // 區塊露出多少比例時開始（幾乎整頁進入畫面）
};

const specsSection = document.getElementById("specs");
const specCards = specsSection.querySelectorAll(".spec-card");

if (!reduceMotion) {
  // 進場前：卡片移到畫面右側外
  specsSection.classList.add("is-anim");
  specCards.forEach((card, i) => {
    card.style.transitionDelay = `${i * SPECS.stagger}ms`;
  });

  // 區塊露出足夠比例時播放（只播一次）
  const specsObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      const seen = entry.intersectionRect.height;
      const need =
        Math.min(entry.boundingClientRect.height, window.innerHeight) *
        SPECS.triggerRatio;
      if (seen < need) return;
      specsObserver.disconnect();
      // 每張卡滑到定位後：清掉滑入延遲，標記 is-settled，才開放滑鼠移入的彈跳效果
      specCards.forEach((card) => {
        card.addEventListener(
          "transitionend",
          (ev) => {
            if (ev.propertyName !== "transform") return;
            card.style.transitionDelay = "";
            card.classList.add("is-settled");
          },
          { once: true },
        );
      });
      specsSection.classList.add("is-in"); // 卡片滑入
    },
    // 每 5% 檢查一次，確保露出比例到達時能觸發
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
  );
  specsObserver.observe(specsSection);
}
// 減少動態時：卡片直接顯示最終狀態

// ===== 05 貼布構造：畫面固定後捲一下，自動播完四層分解＋五大程序；說明卡依程序淡入 =====
// 播完後五種特效同時循環、五張說明卡全部顯示（只播一次）
const LAYERS = {
  speed: 1, // 自動播放倍速（1＝原速，完整動畫約 10.2 秒；數字越大越快）
  triggerPx: 16, // 畫面固定後再往下捲多少 px 開始播放
  staggerRatio: 0.5, // 每張說明卡比上一張往下錯開「上一張卡高 × 這個比例」（0.5＝同側卡片剛好上下貼齊）
  sameSideGap: 36, // 同側卡片（例如左側的 05 與 03）之間的間距（px）
};

const layersSection = document.getElementById("layers");
const layerLabels = layersSection.querySelectorAll(".layer-label");
const layersFx = createLayersFx(document.getElementById("layers-canvas"));

// 依目前程序更新說明卡：目前那張完全顯示、播過的半透明、還沒到的隱藏
// 自動播放中，鏡頭同時推近目前程序的區域（0＝分解階段維持全景）
// 動畫播完後改由懸停／點擊控制；手機版與減少動態時不推近
function setLayerStage(stage) {
  layerLabels.forEach((el) => {
    const n = Number(el.dataset.stage);
    el.classList.toggle("is-current", n === stage);
    el.classList.toggle("is-past", n < stage);
  });
  const isMobile = window.matchMedia("(max-width: 767px)").matches;
  if (
    !reduceMotion &&
    !isMobile &&
    !layersSection.classList.contains("is-finale")
  ) {
    layersFx.focus(stage);
  }
}
layersFx.onStage(setLayerStage);

// 說明卡錯開排列：第一張（05）在標題下方 56px（CSS），
// 之後每張卡的頂端比上一張往下錯開「上一張卡高 × staggerRatio ＋ sameSideGap / 2」
// 同側卡片隔兩步，所以同側之間剛好多出 sameSideGap 的間距
// 卡片自然會接在上一張底部，所以 margin-top＝錯開距離 − 上一張高度（負值＝往上重疊）
// 手機版（一次只顯示一張）不需要錯開
const layersMobile = window.matchMedia("(max-width: 767px)");
function layoutLayerLabels() {
  layerLabels.forEach((el, i) => {
    if (i === 0 || layersMobile.matches) {
      el.style.marginTop = "";
      return;
    }
    const prevHeight = layerLabels[i - 1].offsetHeight;
    const step = prevHeight * LAYERS.staggerRatio + LAYERS.sameSideGap / 2; // 往下錯開的距離
    el.style.marginTop = `${step - prevHeight}px`;
  });
}
layoutLayerLabels();
// 卡片高度改變（視窗縮放、字型載入）時重新計算
const layerLabelsObserver = new ResizeObserver(() => layoutLayerLabels());
layerLabels.forEach((el) => layerLabelsObserver.observe(el));
layersMobile.addEventListener("change", layoutLayerLabels);

// 動畫播完：五種特效同時循環，五張說明卡全部 50%，並開放懸停／點擊推近
function showLayersFinale() {
  layersFx.focus(0); // 鏡頭拉回全景
  layersFx.setFinale(true);
  layersSection.classList.add("is-finale");
  enableLayerFocus();
}

// ----- 說明卡懸停／點擊：鏡頭推近對應區域（該區寬度 75vw），其他區淡化 -----
// 懸停：移入推近、移出縮回；點擊：鎖定推近，再點同一張或點空白處才縮回
// 手機版不使用（一次只顯示一張卡）
let layerHover = 0; // 滑鼠目前懸停的卡（0＝沒有）
let layerLocked = 0; // 點擊鎖定的卡（0＝沒有）

// 依懸停／鎖定狀態更新鏡頭與卡片外觀（懸停優先）
function updateLayerFocus() {
  const n = layersMobile.matches ? 0 : layerHover || layerLocked;
  layersFx.focus(n);
  layerLabels.forEach((el) => {
    el.classList.toggle("is-focus", Number(el.dataset.stage) === n);
  });
}

function enableLayerFocus() {
  layerLabels.forEach((el) => {
    const n = Number(el.dataset.stage);
    const box = el.querySelector(".layer-box");
    box.addEventListener("mouseenter", () => {
      layerHover = n;
      updateLayerFocus();
    });
    box.addEventListener("mouseleave", () => {
      layerHover = 0;
      updateLayerFocus();
    });
    box.addEventListener("click", (ev) => {
      ev.stopPropagation(); // 避免被下面的「點空白處」取消
      layerLocked = layerLocked === n ? 0 : n;
      updateLayerFocus();
    });
  });
  // 點卡片以外的地方：取消鎖定
  document.addEventListener("click", () => {
    if (!layerLocked) return;
    layerLocked = 0;
    updateLayerFocus();
  });
  // 切換到手機版時回到全景
  layersMobile.addEventListener("change", updateLayerFocus);
}

if (reduceMotion) {
  // 減少動態：直接顯示最終畫面，五張卡全部顯示
  layersFx.setProgress(1);
  showLayersFinale();
  layersSection.classList.add("show-all");
} else {
  // 畫面固定後（區塊頂端碰到畫面頂端），再往下捲 triggerPx 就自動播完整段動畫（只播一次）
  let layersStarted = false;
  function checkLayersTrigger() {
    if (layersStarted) return;
    const rect = layersSection.getBoundingClientRect();
    if (rect.top > -LAYERS.triggerPx) return;
    layersStarted = true;
    window.removeEventListener("scroll", checkLayersTrigger);
    layersFx.play(LAYERS.speed).then(showLayersFinale);
  }
  window.addEventListener("scroll", checkLayersTrigger, { passive: true });
  checkLayersTrigger(); // 重新整理時若已經捲過頭，直接觸發
}

// ===== 06 購買：3D 袋子跟著滑鼠小幅傾斜；數量加減；加入購物車／願望清單 =====
const BUY = {
  zoom: 1.6, // 袋子在商品框中的大小倍率
  tiltX: 0.35, // 滑鼠左右移動時最大傾斜（弧度）
  tiltY: 0.2, // 滑鼠上下移動時最大傾斜（弧度）
  smooth: 0.1, // 傾斜跟上滑鼠的速度（0~1）
  minQty: 1,
  maxQty: 99,
  addedMs: 1500, // 「已加入 ✓」顯示多久
};

// ----- 3D 袋子：停在飛入結束的姿勢並轉正，放在商品框正中央 -----
const buyVisual = document.getElementById("buy-visual");
const buyPouch = createPouchEntrance(document.getElementById("buy-canvas"), {
  zoom: BUY.zoom,
});
buyPouch.ready.then(() => {
  buyPouch.seek(buyPouch.timeline.flyEnd);
  buyPouch.setUpright(1);
});

if (!reduceMotion) {
  let tiltTarget = { x: 0, y: 0 }; // 目標傾斜
  let tiltNow = { x: 0, y: 0 }; // 目前傾斜（平滑後）
  let tiltRunning = false;

  // 滑鼠在商品框上的位置（-1~1）決定傾斜方向
  buyVisual.addEventListener("pointermove", (ev) => {
    const rect = buyVisual.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
    tiltTarget = { x: nx * BUY.tiltX, y: ny * BUY.tiltY };
    startTilt();
  });
  // 滑鼠離開：回到正面
  buyVisual.addEventListener("pointerleave", () => {
    tiltTarget = { x: 0, y: 0 };
    startTilt();
  });

  // 每一格讓傾斜慢慢追上目標，追到後停止
  function startTilt() {
    if (tiltRunning) return;
    tiltRunning = true;
    requestAnimationFrame(stepTilt);
  }
  function stepTilt() {
    tiltNow.x += (tiltTarget.x - tiltNow.x) * BUY.smooth;
    tiltNow.y += (tiltTarget.y - tiltNow.y) * BUY.smooth;
    buyPouch.setTilt(tiltNow.x, tiltNow.y);
    const done =
      Math.abs(tiltTarget.x - tiltNow.x) < 0.001 &&
      Math.abs(tiltTarget.y - tiltNow.y) < 0.001;
    if (done) tiltRunning = false;
    else requestAnimationFrame(stepTilt);
  }
}

// ----- 數量加減（1~99）-----
const qtyMinus = document.getElementById("qty-minus");
const qtyPlus = document.getElementById("qty-plus");
const qtyValue = document.getElementById("qty-value");
let qty = BUY.minQty;

function renderQty() {
  qtyValue.textContent = qty;
  qtyMinus.disabled = qty <= BUY.minQty;
  qtyPlus.disabled = qty >= BUY.maxQty;
}
qtyMinus.addEventListener("click", () => {
  qty = Math.max(BUY.minQty, qty - 1);
  renderQty();
});
qtyPlus.addEventListener("click", () => {
  qty = Math.min(BUY.maxQty, qty + 1);
  renderQty();
});
renderQty();

// ----- 加入購物車：導覽列數量加上目前數量，按鈕短暫顯示「已加入 ✓」（重新整理後歸零）-----
const addCartBtn = document.getElementById("add-cart");
const cartCount = document.getElementById("cart-count");
let cartTotal = Number(cartCount.textContent) || 0;
let addedTimer = null;

addCartBtn.addEventListener("click", () => {
  cartTotal += qty;
  cartCount.textContent = cartTotal;
  addCartBtn.textContent = "已加入 ✓";
  clearTimeout(addedTimer);
  addedTimer = setTimeout(() => {
    addCartBtn.textContent = "加入購物車";
  }, BUY.addedMs);
});

// ----- 加入願望清單：切換加入／取消 -----
const addWishBtn = document.getElementById("add-wish");
addWishBtn.addEventListener("click", () => {
  const added = addWishBtn.getAttribute("aria-pressed") !== "true";
  addWishBtn.setAttribute("aria-pressed", String(added));
  addWishBtn.textContent = added ? "已加入願望清單 ♥" : "加入願望清單";
});
