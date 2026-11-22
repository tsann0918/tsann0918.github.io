/* =========================================================
   解壓遊戲：呼青蛙巴掌（3D 玻璃青蛙版・B 版介面）

   計分、動作捕捉、倒數、音效：沿用 whack-slap 的 game.js
   主角：3D 玻璃青蛙（js/frogSlap.js），被打會凹出掌痕、像解壓球一樣彈回
   成績資料：js/slapScores.js（遊玩資料頁 game-data.html 也用同一份）
   畫面（body 的 data-view）：lobby 初始頁 → play 遊戲中 → result 結算
   青蛙的三個階段（依分數累積，不會消）：
     1 正常 → 2 臉腫起來了 → 3 被打到好開心（變粉紅、愛心眼、上下伸縮顫抖）
   ========================================================= */
import { createFrogSlap } from './frogSlap.js';
import { fmt, STAGE_TEXT, loadScores, addScore, sortScores, syncAndLoad, statusText } from './slapScores.js';

/* ---------- 可以自己調的參數 ---------- */
const CONFIG = {
  // MediaPipe 的左右手標籤以鏡像畫面為準；我們餵的是原始畫面，所以預設要交換。
  // 如果舉左手卻顯示右手，改成 false。
  SWAP_HANDEDNESS: true,

  SWING_SPEED: 1400,       // 揮動速度門檻（舞台像素/秒），越小越敏感
  HORIZONTAL_RATIO: 1.6,   // 橫向速度必須是縱向的幾倍以上，才算「橫著揮」
  SWING_COOLDOWN: 380,     // 同一隻手兩次揮動的最短間隔（毫秒）
  HIT_PADDING: 40,         // 青蛙判定範圍外擴（像素），越大越好打
  MISS_ZONE_PADDING: 160,  // 在青蛙附近揮空才算揮空（會斷連擊）；設 0 就不判揮空

  // 揮動速度 → 巴掌力道（決定掌痕多深、青蛙晃多大）
  POWER_MIN_SPEED: 1400,   // 這個速度＝最小力道
  POWER_MAX_SPEED: 4200,   // 這個速度以上＝最大力道

  START_COUNTDOWN: 5,
  FINAL_COUNTDOWN: 10,
  GAME_SECONDS: 30,
  AUTO_RETURN_SECONDS: 15, // 結算後幾秒，自動回到初始頁給下一位玩家（0 = 不自動回去）

  // 青蛙的三個階段：分數到這裡就升級（分數不會倒退）
  STAGE2_AT: 2888,         // 階段 2：臉腫起來了
  STAGE3_AT: 7777,         // 階段 3：被打到好開心

  COMBO_WINDOW_MS: 2200,   // 打中後多久內沒再打中，連擊就歸零
  // 每一巴掌的分數 =（基本分 × 力道加成 ＋ 隨機零頭）× 連擊倍數
  // 隨機零頭讓分數不會是整數（像 1,387 而不是 1,300），看起來比較爽
  BASE_POINTS: 120,        // 基本分
  POWER_BONUS: 0.6,        // 力道加成：最大力道時多 60%
  RANDOM_EXTRA: [3, 47],   // 每下隨機多加幾分（最小, 最大）

  EFFECTS: { shake: true, flash: true, popText: true, sound: true },

  // 音效檔：有檔案就用，沒有就用合成音效（網站已經有青蛙叫聲）
  SOUND_FILES: { hit: "", miss: "", croak: "audio/frog-sound-effect.mp3" },

  // 結算時依分數推薦商品（⚠ 範例資料，請換成商店的真實商品）
  PRODUCTS: [
    { minScore: 0,    name: "【範例】F-TRANSFER 體驗單片",   desc: "力道還很溫柔，先從一片開始，把痠痛轉給青蛙吧。", url: "shop.html" },
    { minScore: 2888, name: "【範例】F-TRANSFER 6 片入夾鏈袋", desc: "青蛙的臉都腫了，你的肩頸應該也差不多。", url: "shop.html" },
    { minScore: 7777, name: "【範例】F-TRANSFER 家庭號",       desc: "青蛙已經被你打到愛上你了，痠痛太多請直接囤貨。", url: "shop.html" }
  ],

  // 頒獎台上的青蛙圖：第 1 名是粉紅愛心青蛙
  PODIUM_FROG: { 1: "img/game-frog-love.png", 2: "img/game-frog-idle.png", 3: "img/game-frog-idle.png" },

  // 3D 青蛙的外觀與手感（參數面板調好的定案值；沒寫的就用 frogSlap.js 的預設）
  FROG: { cameraDist: 4.6, cameraLift: 0.2 }
};

/* ---------- 連擊階段：數字越高特效越誇張 ---------- */
const TIERS = [
  { min: 0,  k: 0.6, texts: ["啪！"] },
  { min: 3,  k: 1.0, texts: ["連擊！", "漂亮！"] },
  { min: 5,  k: 1.6, texts: ["太猛了！", "啪啪啪！"] },
  { min: 10, k: 2.4, texts: ["瘋狂！！", "停不下來！"] },
  { min: 20, k: 3.2, texts: ["神之巴掌！！！"] }
];
const MILESTONES = [3, 5, 10, 15, 20, 30, 40, 50];

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const page = document.body;
const stage = $("stage"), video = $("video"), canvas = $("overlay");
const ctx = canvas.getContext("2d");
const fx = $("fx"), flash = $("flash"), banner = $("banner"), countdownEl = $("countdown");
const scoreEl = $("score"), timeEl = $("time"), stageNumEl = $("stageNum"), stageBar = $("stageBar"), stagePill = $("stagePill");
const comboBox = $("comboBox"), comboNum = $("comboNum"), comboMult = $("comboMult"), comboBar = $("comboBar").firstElementChild;
const startForm = $("startForm"), startBtn = $("startBtn"), nameInput = $("nameInput"), nameHint = $("nameHint");
const playerNameEl = $("playerName"), nextBtn = $("nextBtn"), againBtn = $("againBtn"), exitBtn = $("exitBtn");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOUSE_TEST = new URLSearchParams(location.search).has("mouse");   // 網址加 ?mouse：不開鏡頭，用滑鼠拖曳測試

/* ---------- 3D 青蛙 ---------- */
// 鏡頭畫面放進 3D 場景當背景，玻璃青蛙才折射得到玩家；<video> 本身不顯示
const frog = createFrogSlap($("frog3d"), { ...CONFIG.FROG, external: true, background: "video", video, fx: !reduceMotion });
window.__frog = frog;                           // 方便在主控台調整

// 初始頁的大青蛙、結算頁「這一局的青蛙」：透明背景，轉頭看滑鼠，點牠會被打一下（只是好玩，不計分）
const decoFrogOpts = { background: "none", lookAtPointer: true, roundTime: 0, stage2At: Infinity, stage3At: Infinity,
                       fx: !reduceMotion, cameraDist: 4.3, cameraLift: -0.05, knock: 14, shake: 0 };
const heroFrog = createFrogSlap($("heroFrog"), { ...decoFrogOpts });
const resFrog = createFrogSlap($("resFrog"), { ...decoFrogOpts });

/* ---------- 遊戲狀態 ---------- */
let handLandmarker = null;
let running = false;
let score = 0, hits = 0;
let combo = 0, maxCombo = 0;
let frogStage = 1;                              // 青蛙目前第幾階段
let busyUntil = 0;                              // 升階段演出中，這段時間內的揮動不算
let timeLeft = CONFIG.GAME_SECONDS;
let countdownTimer = null, comboTimer = null;
let lastVideoTime = -1;
let roundId = 0;                                // 每一局的編號（中途離開時，讓倒數停下來）

const history = { left: [], right: [] };
const smooth  = { left: { vx: 0, vy: 0 }, right: { vx: 0, vy: 0 } };
const lastSwing = { left: 0, right: 0 };
const HAND_COLOR = { left: "#ff5391", right: "#c8fa6e" };   // 左手粉紅、右手萊姆綠
let trails = [];
let lastHitPos = null;                          // 最近一次打中的位置（給跳字定位）

const tierOf = c => TIERS.reduce((t, x, i) => (c >= x.min ? i : t), 0);
const multOf = c => (c >= 20 ? 4 : c >= 10 ? 3 : c >= 5 ? 2 : 1);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 分數像計數器一樣往上滾，不是直接跳到新數字
let shownScore = 0, rollRAF = 0;
function rollScore() {
  if (rollRAF) return;
  const step = () => {
    const diff = score - shownScore;
    shownScore = Math.abs(diff) < 1 ? score : shownScore + diff * 0.22;
    scoreEl.textContent = fmt(shownScore);
    rollRAF = shownScore === score ? 0 : requestAnimationFrame(step);
  };
  rollRAF = requestAnimationFrame(step);
}
function setScoreNow(n) { cancelAnimationFrame(rollRAF); rollRAF = 0; shownScore = n; scoreEl.textContent = fmt(n); }

// 切換畫面：lobby／play／result
function setView(v) {
  page.dataset.view = v;
  window.scrollTo(0, 0);
  if (v === "lobby") reveal($("lobby"));
  if (v === "result") reveal($("result"));
}

/* =========================================================
   初始頁、結算頁的動態
   - 文字和細線照首頁（base.css 的 data-reveal、line-draw）：細線由左畫出、內容往上浮現
   - 頒獎台：第 3 → 2 → 1 名依序從底線升起、分數往上滾、第一名頭上冒愛心
   ========================================================= */
// 每次進到這個畫面都重播一次（base.js 只會播第一次）
function reveal(viewEl) {
  const els = [...viewEl.querySelectorAll("[data-reveal], .line-draw")];
  if (reduceMotion) { els.forEach(e => e.classList.add("is-in")); return; }
  els.forEach(e => e.classList.remove("is-in"));
  void viewEl.offsetWidth;                      // 讓瀏覽器先套用「還沒出現」的樣子
  requestAnimationFrame(() => els.forEach(e => e.classList.add("is-in")));
}

// 數字從 0 往上滾到 to
function countUp(el, to, delay = 0, dur = 1100, suffix = "") {
  if (reduceMotion) { el.textContent = fmt(to) + suffix; return; }
  const t0 = performance.now() + delay;
  el.textContent = "0" + suffix;
  const step = now => {
    const k = clamp((now - t0) / dur, 0, 1);
    el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// 頒獎台進場；scores：[第1名, 第2名, 第3名] 的分數（沒人就 null）
function animatePodium(ol, scores) {
  stopHearts(ol);
  if (reduceMotion) { startHearts(ol); return; }
  const delays = { 3: 150, 2: 400, 1: 650 };   // 第 3 名先升起，第 1 名最後
  [1, 2, 3].forEach(rank => {
    const li = ol.querySelector(`.p${rank}`);
    if (!li) return;
    const d = delays[rank];
    li.querySelector(".pd-block").animate(
      [{ transform: "scaleY(0)" }, { transform: "scaleY(1.06)", offset: 0.75 }, { transform: "scaleY(1)" }],
      { duration: 700, delay: d, easing: "cubic-bezier(.2,.8,.3,1)", fill: "backwards" });
    li.querySelectorAll(".pd-frog, .pd-name, .pd-combo").forEach((el, i) => el.animate(
      [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }],
      { duration: 500, delay: d + 450 + i * 60, easing: "ease-out", fill: "backwards" }));
    if (scores[rank - 1] != null) countUp(li.querySelector(".pd-score"), scores[rank - 1], d + 250, 1000);
  });
  ol._heartStart = setTimeout(() => startHearts(ol), 1300);
}

// 第一名頭上不時冒出小愛心（畫面切走就停）
const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.6.7-1.4 2.2-2.6 4.3-2.6 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
function startHearts(ol) {
  const li = ol.querySelector(".p1");
  if (!li || li.dataset.empty === "1" || reduceMotion) return;
  ol._hearts = setInterval(() => {
    if (!ol.offsetParent) return;                // 畫面沒顯示時不冒
    const frogImg = li.querySelector(".pd-frog");
    const h = document.createElement("span");
    h.className = "pd-heart";
    h.innerHTML = HEART_SVG;
    h.style.left = `${li.clientWidth / 2 + rand(-frogImg.clientWidth * 0.35, frogImg.clientWidth * 0.35) - 9}px`;
    h.style.top = `${frogImg.offsetTop + frogImg.clientHeight * 0.2}px`;
    h.style.color = pick(["#ff5391", "#ffbdd1", "#ff3d8b"]);
    li.appendChild(h);
    const s = rand(0.7, 1.3), dx = rand(-24, 24);
    h.animate([
      { opacity: 0, transform: `translate(0,0) scale(${s * 0.4})` },
      { opacity: 1, transform: `translate(${dx * 0.3}px,-20px) scale(${s})`, offset: 0.2 },
      { opacity: 0, transform: `translate(${dx}px,-90px) scale(${s * 0.8})` }
    ], { duration: rand(1400, 2000), easing: "ease-out" }).onfinish = () => h.remove();
  }, 650);
}
function stopHearts(ol) {
  clearTimeout(ol._heartStart);
  clearInterval(ol._hearts);
  ol.querySelectorAll(".pd-heart").forEach(h => h.remove());
}

// 列表一列一列浮現
function animateList(ol, delay = 800) {
  if (reduceMotion) return;
  [...ol.children].forEach((li, i) => li.animate(
    [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
    { duration: 450, delay: delay + i * 70, easing: "ease-out", fill: "backwards" }));
}

/* =========================================================
   聲音：優先用音效檔，沒有就用 Web Audio 合成
   ========================================================= */
let ac = null, noiseBuf = null;
const custom = {};
Object.entries(CONFIG.SOUND_FILES).forEach(([name, src]) => {
  if (!src) return;
  const a = new Audio();
  a.addEventListener("canplaythrough", () => { custom[name] = a; }, { once: true });
  a.addEventListener("error", () => { custom[name] = null; });
  a.src = src;
});

function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === "suspended") ac.resume();
}

function synthNoise(t, dur, freqFrom, freqTo, vol, q = 0.9) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = q;
  bp.frequency.setValueAtTime(freqFrom, t);
  bp.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + dur + 0.05);
}

function synthTone(t, freq, dur, vol, type = "triangle", freqEnd = null) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// 合成的蛙鳴：低頻鋸齒波 + 快速開關的音量 = 「呱呱」的顫音
function synthCroak(t, pitch = 1, vol = 0.35, syllables = 2) {
  for (let n = 0; n < syllables; n++) {
    const st = t + n * 0.2, dur = 0.17;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime((230 - n * 25) * pitch, st);
    o.frequency.exponentialRampToValueAtTime((120 - n * 10) * pitch, st + dur);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(700, st);
    bp.frequency.exponentialRampToValueAtTime(1300, st + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, st);
    const pulses = 6, pd = dur / pulses;
    for (let i = 0; i < pulses; i++) {
      const pt = st + i * pd;
      g.gain.setValueAtTime(0.0001, pt);
      g.gain.linearRampToValueAtTime(vol, pt + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, pt + pd * 0.95);
    }
    o.connect(bp).connect(g).connect(ac.destination);
    o.start(st);
    o.stop(st + dur + 0.05);
  }
}

function playSound(name, tier = 0) {
  if (!CONFIG.EFFECTS.sound) return;

  // 有放自己的音效檔就優先用
  const key = name === "croakBig" ? "croak" : name;
  if (["hit", "miss", "croak", "croakBig"].includes(name) && custom[key]) {
    const a = custom[key].cloneNode();
    a.playbackRate = name === "hit" ? 1 + tier * 0.06
                   : name === "croakBig" ? 0.75
                   : name === "croak" ? 0.95 + Math.random() * 0.25 + tier * 0.03
                   : 1;
    a.play().catch(() => {});
    return;
  }
  if (!ac) return;
  const t = ac.currentTime;

  if (name === "hit") {
    synthNoise(t, 0.16, 2200 + tier * 500, 900, 0.9, 0.8);
    synthTone(t, 190 + tier * 35, 0.15, 0.8, "sine", 60);
  } else if (name === "miss") {
    synthNoise(t, 0.26, 3200, 500, 0.22, 1.4);
  } else if (name === "milestone") {
    const base = 523 * Math.pow(1.06, tier);
    [1, 1.26, 1.5, 2].forEach((m, i) => synthTone(t + i * 0.07, base * m, 0.18, 0.28, "triangle"));
  } else if (name === "croak") {
    synthCroak(t, (0.9 + Math.random() * 0.3) * Math.pow(1.03, tier), 0.32, 2);     // 被打到的叫聲
  } else if (name === "croakBig") {
    synthCroak(t, 0.7, 0.4, 3);                                                     // 升階段的大叫
  } else if (name === "boom") {
    synthTone(t, 110, 0.55, 0.9, "sine", 28);                                       // 轟！
    synthNoise(t, 0.5, 1800, 120, 0.7, 0.6);
  } else if (name === "stageup") {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => synthTone(t + 0.1 + i * 0.07, f, 0.22, 0.28, "square"));
    synthTone(t, 120, 0.5, 0.3, "sawtooth", 900);                 // 升級
  } else if (name === "tick") {
    synthTone(t, 660 * Math.pow(1.06, tier), 0.09, 0.3, "square");
  } else if (name === "go") {
    synthTone(t, 880, 0.35, 0.3, "square");
    synthTone(t + 0.08, 1320, 0.3, 0.25, "triangle");
  } else if (name === "break") {
    synthTone(t, 330, 0.3, 0.25, "sawtooth", 110);
  }
}


/* =========================================================
   特效
   ========================================================= */
function stageSize() { return { w: stage.clientWidth, h: stage.clientHeight }; }

// 特效的出現位置：剛打中的地方，否則在青蛙中間
function fxOrigin() {
  if (lastHitPos) return lastHitPos;
  const r = frog.screenRect();
  return { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 };
}

function shake(k) {
  if (!CONFIG.EFFECTS.shake || reduceMotion) return;
  const amp = 5 * k;
  const frames = [{ transform: "translate(0,0)" }];
  for (let i = 0; i < 6; i++) {
    const f = 1 - i / 6;
    frames.push({ transform: `translate(${rand(-amp, amp) * f}px, ${rand(-amp, amp) * f}px)` });
  }
  frames.push({ transform: "translate(0,0)" });
  stage.animate(frames, { duration: 140 + 40 * k, easing: "linear" });
}

function doFlash(k, tier) {
  if (!CONFIG.EFFECTS.flash || reduceMotion) return;
  flash.style.background = tier >= 3 ? "#ffbdd1" : "#ecffca";
  flash.animate([{ opacity: Math.min(0.15 + 0.15 * k, 0.8) }, { opacity: 0 }], { duration: 220 });
}

function megaFlash() {
  if (!CONFIG.EFFECTS.flash || reduceMotion) return;
  flash.style.background = "#ffffff";
  flash.animate([{ opacity: 1 }, { opacity: 0.25, offset: 0.25 }, { opacity: 0.85, offset: 0.4 }, { opacity: 0 }],
                { duration: 800, easing: "ease-out" });
}

function megaShake() {
  if (!CONFIG.EFFECTS.shake || reduceMotion) return;
  const amp = 14, frames = [{ transform: "translate(0,0) scale(1)" }];
  for (let i = 0; i < 12; i++) {
    const f = 1 - i / 12;
    frames.push({ transform: `translate(${rand(-amp, amp) * f}px, ${rand(-amp, amp) * f}px) scale(${1 + 0.07 * f})` });
  }
  frames.push({ transform: "translate(0,0) scale(1)" });
  stage.animate(frames, { duration: 700, easing: "linear" });
}

// 打中時跳出「啪！」，下面一行小字顯示這一下拿幾分
function popText(k, tier, dir, points) {
  if (!CONFIG.EFFECTS.popText) return;
  const { x, y } = fxOrigin();
  const u = stageSize().w / 100;
  const el = document.createElement("div");
  el.className = "pop-text";
  el.textContent = pick(TIERS[tier].texts);
  if (points) {
    const sm = document.createElement("small");
    sm.textContent = `+${fmt(points)}`;
    el.appendChild(sm);
  }
  el.style.fontSize = `${(3 + k * 1.2) * u}px`;
  fx.appendChild(el);

  const w = el.offsetWidth;
  const tx = clamp(x - w / 2 + dir * 8 * u, u, stageSize().w - w - u);
  const ty = Math.max(y - 12 * u, 2 * u);
  const tilt = rand(-10, 10);

  el.animate(
    [
      { transform: `translate(${tx}px, ${ty}px) scale(0.2) rotate(${tilt}deg)`, opacity: 0 },
      { transform: `translate(${tx}px, ${ty - 2 * u}px) scale(1.2) rotate(${tilt}deg)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${tx}px, ${ty - 5 * u}px) scale(1) rotate(${tilt}deg)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${tx}px, ${ty - 9 * u}px) scale(1) rotate(${tilt}deg)`, opacity: 0 }
    ],
    { duration: 800, easing: "ease-out" }
  ).onfinish = () => el.remove();
}

function showBanner(text) {
  banner.textContent = text;
  if (reduceMotion) { banner.style.opacity = 1; setTimeout(() => (banner.style.opacity = 0), 800); return; }
  banner.animate(
    [
      { opacity: 0, transform: "translate(-50%, -50%) scale(2.2) rotate(-6deg)" },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1) rotate(0deg)", offset: 0.2 },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1.05) rotate(0deg)", offset: 0.75 },
      { opacity: 0, transform: "translate(-50%, -60%) scale(1) rotate(0deg)" }
    ],
    { duration: 1000, easing: "ease-out" }
  );
}

/* =========================================================
   青蛙升階段：全螢幕轉場
   ========================================================= */
const STAGE_INTRO_MS = 2000;
const STAGE_INTRO_TEXT = {
  2: { en: "STAGE 2", zh: "臉腫起來了", sub: "繼續打，看看會怎樣" },
  3: { en: "STAGE 3", zh: "被打到好開心", sub: "青蛙愛上你的巴掌了" }
};
function stageIntro(n) {
  const el = $("stageIntro");
  const band = el.querySelector(".si-band"), en = el.querySelector(".si-en"), zh = el.querySelector(".si-zh"),
        sub = el.querySelector(".si-sub");
  en.textContent = STAGE_INTRO_TEXT[n].en; zh.textContent = STAGE_INTRO_TEXT[n].zh; sub.textContent = STAGE_INTRO_TEXT[n].sub;
  el.hidden = false;
  if (reduceMotion) { setTimeout(() => { el.hidden = true; }, 900); return; }
  el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }],
             { duration: STAGE_INTRO_MS, easing: "linear" });
  band.animate([
    { transform: "translateX(-110%)" },
    { transform: "translateX(0)", offset: 0.22, easing: "cubic-bezier(.2,.9,.2,1)" },
    { transform: "translateX(0)", offset: 0.78 },
    { transform: "translateX(110%)" }
  ], { duration: STAGE_INTRO_MS });
  zh.animate([
    { opacity: 0, transform: "translateY(30%)" },
    { opacity: 0, transform: "translateY(30%)", offset: 0.15 },
    { opacity: 1, transform: "translateY(0)", offset: 0.34, easing: "ease-out" },
    { opacity: 1, transform: "translateY(0)", offset: 0.8 },
    { opacity: 0, transform: "translateY(-10%)" }
  ], { duration: STAGE_INTRO_MS });
  setTimeout(() => { el.hidden = true; }, STAGE_INTRO_MS + 50);
}

// 鏡頭畫面的色罩：階段 1 稍暗、階段 2 偏粉、階段 3 更粉
const STAGE_TINT = { 1: ["#000000", 0.25], 2: ["#ff5391", 0.22], 3: ["#ffbdd1", 0.32] };
function applyStageTint() { const [c, a] = STAGE_TINT[frogStage]; frog.setBgTint(c, a); }

// 上排的階段標籤＋最底下的進度條
function updateStageHud() {
  stagePill.textContent = `( 0${frogStage} ) ${STAGE_TEXT[frogStage]}`;
  const lo = frogStage === 1 ? 0 : CONFIG.STAGE2_AT;
  const next = frogStage === 1 ? CONFIG.STAGE2_AT : frogStage === 2 ? CONFIG.STAGE3_AT : null;
  if (next) {
    stageBar.style.width = `${clamp((score - lo) / (next - lo), 0, 1) * 100}%`;
    stageNumEl.textContent = `${fmt(Math.min(score, next))} / ${fmt(next)} → 下一階段`;
  } else {
    stageBar.style.width = "100%";
    stageNumEl.textContent = "最高階段！";
  }
}

function setFrogStage(n) {
  if (n <= frogStage || !running) return;
  frogStage = n;
  stage.dataset.stage = String(n);
  frog.setStage(n);
  applyStageTint();
  updateStageHud();
  busyUntil = performance.now() + (reduceMotion ? 300 : STAGE_INTRO_MS + 200);   // 轉場中不算揮動
  stageIntro(n);
  playSound("stageup");
  playSound("croakBig");
  megaFlash();
  megaShake();
  [260, 520].forEach(d => setTimeout(() => { if (running) { megaFlash(); playSound("boom"); } }, d));
}

/* =========================================================
   連擊系統（照 whack-slap）
   ========================================================= */
function updateComboUI(bump) {
  const tier = tierOf(combo);
  stage.dataset.tier = combo >= 2 ? tier : 0;
  comboNum.textContent = combo;
  comboMult.textContent = `x${multOf(combo)}`;
  comboBox.classList.toggle("hidden", combo < 2);

  if (bump && combo >= 2) {
    comboBox.classList.remove("bump");
    void comboBox.offsetWidth;
    comboBox.classList.add("bump");
  }
}

function restartComboTimer() {
  clearTimeout(comboTimer);
  comboBar.getAnimations().forEach(a => a.cancel());
  comboBar.animate(
    [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
    { duration: CONFIG.COMBO_WINDOW_MS, easing: "linear", fill: "forwards" }
  );
  comboTimer = setTimeout(() => breakCombo(false), CONFIG.COMBO_WINDOW_MS);
}

function breakCombo(byMiss) {
  clearTimeout(comboTimer);
  if (combo >= 3 && byMiss) playSound("break");
  combo = 0;
  updateComboUI(false);
}

// 打中：side＝哪隻手、power＝力道 0~1、yNorm＝打在青蛙的高度（0 上 1 下）
function registerHit(side, power, yNorm) {
  combo++;
  hits++;
  maxCombo = Math.max(maxCombo, combo);
  const [ex0, ex1] = CONFIG.RANDOM_EXTRA;
  const points = Math.round((CONFIG.BASE_POINTS * (1 + CONFIG.POWER_BONUS * power) + rand(ex0, ex1)) * multOf(combo));
  score += points;
  rollScore();

  const tier = tierOf(combo);
  const k = TIERS[tier].k;
  const dir = side === "right" ? -1 : 1;           // 右手往左揮、左手往右揮

  // 3D 青蛙：右手打青蛙左臉（畫面右邊）留下右手掌痕；左手相反
  const ev = frog.slapHand(side, power, yNorm);
  lastHitPos = ev ? { x: ev.x, y: ev.y } : null;

  updateComboUI(true);
  restartComboTimer();

  playSound("hit", tier);
  setTimeout(() => playSound("croak", tier), 70);  // 被打到的叫聲
  shake(k);
  doFlash(k, tier);
  popText(k, tier, dir, points);

  if (MILESTONES.includes(combo)) {
    showBanner(`${combo} 連擊！`);
    setTimeout(() => playSound("milestone", tier), 120);
  }

  updateStageHud();
  if (frogStage < 3 && score >= CONFIG.STAGE3_AT) setTimeout(() => setFrogStage(3), 350);
  else if (frogStage < 2 && score >= CONFIG.STAGE2_AT) setTimeout(() => setFrogStage(2), 350);
}

function registerMiss() {
  breakCombo(true);
  playSound("miss");
}

/* =========================================================
   揮動與打擊判定（照 whack-slap：揮動路徑穿過青蛙的範圍才算）
   ========================================================= */
function frogRect(p = CONFIG.HIT_PADDING) {
  const r = frog.screenRect();
  return { x1: r.x1 - p, x2: r.x2 + p, y1: r.y1 - p, y2: r.y2 + p, raw: r };
}

// 回傳路徑第一個進入範圍的點（沒有就回傳 null）
function pathHitsFrog(start, end, pad = CONFIG.HIT_PADDING) {
  const r = frogRect(pad);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) return { x, y, rect: r.raw };
  }
  return null;
}

function onSwing(side, start, end, vx) {
  if (performance.now() < busyUntil) return false;          // 升階段演出中

  const hitAt = pathHitsFrog(start, end);
  const near = hitAt || (CONFIG.MISS_ZONE_PADDING > 0 && pathHitsFrog(start, end, CONFIG.MISS_ZONE_PADDING));

  trails.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, t0: performance.now(), color: HAND_COLOR[side], hit: !!hitAt });
  if (!near) return false;

  if (hitAt) {
    const power = clamp((Math.abs(vx) - CONFIG.POWER_MIN_SPEED) / (CONFIG.POWER_MAX_SPEED - CONFIG.POWER_MIN_SPEED), 0, 1) * 0.75 + 0.25;
    const r = hitAt.rect;
    const yNorm = clamp((hitAt.y - r.y1) / Math.max(1, r.y2 - r.y1), 0, 1);
    registerHit(side, power, yNorm);
  } else {
    registerMiss();
  }
  return true;
}

/* =========================================================
   偵測迴圈（照 whack-slap）
   ========================================================= */
function palmCenter(lm) {
  const ids = [0, 5, 9, 13, 17];
  let x = 0, y = 0;
  ids.forEach(i => { x += lm[i].x; y += lm[i].y; });
  return { x: x / ids.length, y: y / ids.length };
}

function drawTrails(now) {
  trails = trails.filter(t => now - t.t0 < 350);
  trails.forEach(t => {
    const a = 1 - (now - t.t0) / 350;
    ctx.save();
    ctx.globalAlpha = a * (t.hit ? 0.9 : 0.5);
    ctx.strokeStyle = t.hit ? t.color : "#edebeb";
    ctx.lineWidth = (t.hit ? 26 : 14) * a;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
    ctx.restore();
  });
}

function loop() {
  requestAnimationFrame(loop);
  if (!handLandmarker || video.readyState < 2 || page.dataset.view !== "play") return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const { w: W, h: H } = stageSize();
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.clearRect(0, 0, W, H);

  const now = performance.now();
  drawTrails(now);

  const result = handLandmarker.detectForVideo(video, now);
  const handedness = result.handedness || result.handednesses || [];
  const seen = { left: false, right: false };

  result.landmarks.forEach((lm, i) => {
    const label = handedness[i]?.[0]?.categoryName || "Right";
    let side = label === "Left" ? "left" : "right";
    if (CONFIG.SWAP_HANDEDNESS) side = side === "left" ? "right" : "left";
    seen[side] = true;

    const c = palmCenter(lm);
    const cur = { x: (1 - c.x) * W, y: c.y * H, t: now };
    const hist = history[side];
    const prev = hist[hist.length - 1];

    let swinging = false;
    if (prev) {
      const dt = Math.max((now - prev.t) / 1000, 0.001);
      const vx = (cur.x - prev.x) / dt, vy = (cur.y - prev.y) / dt;
      const s = smooth[side];
      s.vx = s.vx * 0.4 + vx * 0.6;
      s.vy = s.vy * 0.4 + vy * 0.6;

      swinging = Math.abs(s.vx) > CONFIG.SWING_SPEED &&
                 Math.abs(s.vx) > Math.abs(s.vy) * CONFIG.HORIZONTAL_RATIO;

      if (running && swinging && now - lastSwing[side] > CONFIG.SWING_COOLDOWN) {
        if (onSwing(side, hist[0], cur, s.vx)) lastSwing[side] = now;
      }
    }
    hist.push(cur);
    if (hist.length > 5) hist.shift();

    // 手的位置：細黑框圓點，揮動時變大
    ctx.beginPath();
    ctx.arc(cur.x, cur.y, swinging ? 40 : 24, 0, Math.PI * 2);
    ctx.fillStyle = HAND_COLOR[side] + (swinging ? "cc" : "88");
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#000";
    ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.font = "500 18px 'Noto Sans TC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(side === "left" ? "左" : "右", cur.x, cur.y + 6);
  });

  ["left", "right"].forEach(s => {
    if (!seen[s]) { history[s] = []; smooth[s] = { vx: 0, vy: 0 }; }
  });
}

/* ---------- 沒有鏡頭時用滑鼠測試：按住快速橫向拖過青蛙＝揮一巴掌 ---------- */
// 往左拖＝右手、往右拖＝左手（跟真的揮手方向一樣）
let mouseHist = [];
stage.addEventListener("pointermove", e => {
  if (!running || e.buttons !== 1) { mouseHist = []; return; }
  const sr = stage.getBoundingClientRect();
  const cur = { x: e.clientX - sr.left, y: e.clientY - sr.top, t: performance.now() };
  const prev = mouseHist[mouseHist.length - 1];
  mouseHist.push(cur);
  if (mouseHist.length > 5) mouseHist.shift();
  if (!prev) return;
  const dt = Math.max((cur.t - prev.t) / 1000, 0.001);
  const vx = (cur.x - prev.x) / dt, vy = (cur.y - prev.y) / dt;
  const side = vx < 0 ? "right" : "left";
  if (Math.abs(vx) > CONFIG.SWING_SPEED && Math.abs(vx) > Math.abs(vy) * CONFIG.HORIZONTAL_RATIO &&
      cur.t - lastSwing[side] > CONFIG.SWING_COOLDOWN) {
    if (onSwing(side, mouseHist[0], cur, vx)) lastSwing[side] = cur.t;
  }
});

/* =========================================================
   倒數
   ========================================================= */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function showCount(text, mode) {
  countdownEl.dataset.mode = mode;
  countdownEl.textContent = text;
  if (reduceMotion) {
    countdownEl.style.opacity = 1;
    setTimeout(() => (countdownEl.style.opacity = 0), 700);
    return;
  }
  countdownEl.animate(
    [
      { opacity: 0, transform: "translate(-50%, -50%) scale(1.8)" },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.25 },
      { opacity: mode === "final" ? 0.85 : 1, transform: "translate(-50%, -50%) scale(0.95)", offset: 0.75 },
      { opacity: 0, transform: "translate(-50%, -50%) scale(0.7)" }
    ],
    { duration: 950, easing: "ease-out" }
  );
}

// 回傳 false＝倒數途中被中斷（玩家按了離開）
async function runStartCountdown(id) {
  for (let n = CONFIG.START_COUNTDOWN; n >= 1; n--) {
    if (id !== roundId) return false;
    showCount(n, "start");
    playSound("tick", 0);
    await sleep(1000);
  }
  if (id !== roundId) return false;
  showCount("開始！", "start");
  playSound("go");
  return true;
}

/* =========================================================
   排行榜：前 3 名立體頒獎台＋第 4 名以後細線列表
   ========================================================= */
const RANK_LABEL = { 1: "1st", 2: "2nd", 3: "3rd" };
const PODIUM_H = { normal: { 1: 220, 2: 160, 3: 120 }, compact: { 1: 170, 2: 125, 3: 95 } };
const DEPTH = 16;

// 一個台子：SVG 畫正面、頂面、側面（viewBox 寬 100，高度依台子高度換算，立體深度固定 16px）
function podiumBlock(h) {
  const H = h + DEPTH, d = DEPTH, dx = 16;   // dx：寬度方向的深度（viewBox 單位，會跟著寬度縮放）
  return `<div class="pd-block"><svg aria-hidden="true" viewBox="0 0 100 ${H}" preserveAspectRatio="none">
<polygon class="pd-front" points="0,${d} ${100 - dx},${d} ${100 - dx},${H} 0,${H}"></polygon>
<polygon class="pd-top" points="0,${d} ${dx},0 100,0 ${100 - dx},${d}"></polygon>
<polygon class="pd-side" points="${100 - dx},${d} 100,0 100,${h} ${100 - dx},${H}"></polygon>
</svg><div class="pd-text"><p class="pd-rank"></p><p class="pd-score"></p></div></div>`;
}

function renderPodium(ol, sorted, meId, compact) {
  ol.textContent = "";
  const hs = PODIUM_H[compact ? "compact" : "normal"];
  [1, 2, 3].forEach(rank => {
    const r = sorted[rank - 1];
    const li = document.createElement("li");
    li.className = `p${rank}` + (r && r.id === meId ? " is-me" : "");
    li.innerHTML = `<img class="pd-frog" src="${CONFIG.PODIUM_FROG[rank]}" alt=""><p class="pd-name"></p><p class="pd-combo"></p>${podiumBlock(hs[rank])}`;
    // 名字用 textContent 放，名字裡的符號不會被當成程式
    li.querySelector(".pd-name").textContent = r ? r.name + (r.id === meId ? "（你）" : "") : "等你上榜";
    li.querySelector(".pd-combo").textContent = r ? `最高連擊 ${r.maxCombo}` : " ";
    li.querySelector(".pd-rank").textContent = RANK_LABEL[rank] + (r && r.id === meId ? "　・　你" : "");
    li.querySelector(".pd-score").textContent = r ? fmt(r.score) : "-";
    if (!r) { li.querySelector(".pd-frog").style.opacity = "0.25"; li.dataset.empty = "1"; }
    ol.appendChild(li);
  });
}

// 第 4 名以後；這一場不在名單裡時，在最下面多加一列
function renderList(ol, sorted, meId, last) {
  ol.textContent = "";
  const addRow = (rank, r) => {
    const li = document.createElement("li");
    if (r.id === meId) li.className = "is-me";
    li.innerHTML = '<span class="r"></span><span class="n"></span><span class="c"></span><span class="s"></span>';
    li.querySelector(".r").textContent = String(rank).padStart(2, "0");
    li.querySelector(".n").textContent = r.name + (r.id === meId ? "（你）" : "");
    li.querySelector(".c").textContent = `連擊 ${r.maxCombo}`;
    li.querySelector(".s").textContent = fmt(r.score);
    ol.appendChild(li);
  };
  sorted.slice(3, last).forEach((r, i) => addRow(i + 4, r));
  const myIndex = meId ? sorted.findIndex(r => r.id === meId) : -1;
  if (myIndex >= last) {
    const gap = document.createElement("li");
    gap.className = "gap";
    gap.textContent = "⋮";
    ol.appendChild(gap);
    addRow(myIndex + 1, sorted[myIndex]);
  }
}

function boardSummary(list) {
  const players = new Set(list.map(r => r.name)).size;
  return list.length ? `共 ${fmt(list.length)} 場・${fmt(players)} 位玩家` : "還沒有人上榜，快來當第一名！";
}

let lobbySig = "";
function renderLobbyBoard(list, animate) {
  const sorted = sortScores(list);
  const sig = sorted.slice(0, 10).map(r => r.id + r.score).join("|") + list.length;
  $("boardStatus").textContent = statusText();
  if (sig === lobbySig && !animate) return;     // 名單沒變就不重畫（避免動畫重播）
  lobbySig = sig;
  renderPodium($("podium"), sorted, null, false);
  renderList($("boardList"), sorted, null, 10);
  $("boardInfo").textContent = boardSummary(list);
  animatePodium($("podium"), sorted.slice(0, 3).map(r => r.score).concat([null, null, null]).slice(0, 3));
  animateList($("boardList"));
}

function renderResultBoard(list, meId, animate) {
  const sorted = sortScores(list);
  renderPodium($("resPodium"), sorted, meId, true);
  renderList($("resList"), sorted, meId, 5);
  if (animate) {
    animatePodium($("resPodium"), sorted.slice(0, 3).map(r => r.score).concat([null, null, null]).slice(0, 3));
    animateList($("resList"), 900);
  } else {
    stopHearts($("resPodium"));
    startHearts($("resPodium"));
  }
  $("resBoardInfo").textContent = boardSummary(list);
  const rank = sorted.findIndex(r => r.id === meId) + 1;
  $("resRank").textContent = rank ? `第 ${rank} 名` : "-";
}

async function refreshLobbyBoard() {
  renderLobbyBoard(loadScores(), true);         // 先馬上顯示本機的（播進場動畫）
  renderLobbyBoard(await syncAndLoad(), false); // 再去線上抓最新的（有變才重畫）
}

/* =========================================================
   結算後回到初始頁
   ========================================================= */
let returnTimer = null;
let currentResult = null;                       // 目前結算頁顯示的是哪一場

function stopAutoReturn() {
  clearInterval(returnTimer);
  returnTimer = null;
  nextBtn.textContent = "換下一位玩家";
}

function startAutoReturn() {
  stopAutoReturn();
  let left = CONFIG.AUTO_RETURN_SECONDS;
  if (!left) return;
  nextBtn.textContent = `換下一位玩家（${left}）`;
  returnTimer = setInterval(() => {
    left--;
    if (left <= 0) goToLobby(true);
    else nextBtn.textContent = `換下一位玩家（${left}）`;
  }, 1000);
}

function resetFrog() {
  frogStage = 1;
  stage.dataset.stage = "1";
  frog.resetGame();
  applyStageTint();
}

// 回到初始頁；clearName＝換下一位玩家（清掉名字）
function goToLobby(clearName) {
  stopAutoReturn();
  currentResult = null;
  if (clearName) nameInput.value = "";
  nameHint.textContent = "";
  startBtn.disabled = false;
  startBtn.textContent = "進入遊戲 →";
  setView("lobby");
  refreshLobbyBoard();                          // 順便更新別人剛玩完的成績
  nameInput.focus();
}

// 結算頁上動了滑鼠或鍵盤，就不要自動跳走
["pointerdown", "keydown"].forEach(ev => $("result").addEventListener(ev, stopAutoReturn));
nextBtn.addEventListener("click", () => goToLobby(true));
againBtn.addEventListener("click", () => { stopAutoReturn(); startGame(); });

/* =========================================================
   初始化、開始與結束
   ========================================================= */
async function initTracking() {
  const { HandLandmarker, FilesetResolver } = await import(VISION_URL);
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  handLandmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 30 }, facingMode: "user" },
    audio: false
  });
  video.srcObject = stream;
  await new Promise(res => (video.onloadeddata = res));
  loop();
}

let playerName = "";
let cameraFailed = false;

async function startGame() {
  const name = nameInput.value.trim();
  if (!name) {
    setView("lobby");
    nameHint.textContent = "請先輸入你的名字";
    nameInput.focus();
    return;
  }
  nameHint.textContent = "";
  stopAutoReturn();
  currentResult = null;
  playerName = name;
  playerNameEl.textContent = name;

  unlockAudio();
  startBtn.disabled = true;
  startBtn.textContent = "載入中…";

  if (!handLandmarker && !MOUSE_TEST && !cameraFailed) {
    try {
      await initTracking();
    } catch (err) {
      console.error(err);
      cameraFailed = true;                      // 再按一次就直接用滑鼠玩
      setView("lobby");
      nameHint.textContent = "鏡頭開不了：請允許鏡頭權限，並用 localhost 或 https 開啟。再按一次可以先用滑鼠玩（按住快速橫向拖過青蛙）。";
      startBtn.disabled = false;
      startBtn.textContent = "進入遊戲 →";
      return;
    }
  }

  const id = ++roundId;
  score = 0; hits = 0; combo = 0; maxCombo = 0;
  busyUntil = 0;
  lastHitPos = null;
  resetFrog();
  timeLeft = CONFIG.GAME_SECONDS;
  setScoreNow(0);
  timeEl.textContent = timeLeft;
  timeEl.parentElement.classList.remove("urgent");
  updateComboUI(false);
  updateStageHud();
  startBtn.disabled = false;
  startBtn.textContent = "進入遊戲 →";
  stopHearts($("podium"));
  stopHearts($("resPodium"));
  setView("play");

  if (!(await runStartCountdown(id))) return;
  running = true;

  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    timeLeft--;
    timeEl.textContent = timeLeft;

    if (timeLeft > 0 && timeLeft <= CONFIG.FINAL_COUNTDOWN) {
      timeEl.parentElement.classList.add("urgent");
      showCount(timeLeft, "final");
      playSound("tick", CONFIG.FINAL_COUNTDOWN - timeLeft);
    }
    if (timeLeft <= 0) endGame();
  }, 1000);
}

// 中途按「離開」：這一局不記成績，回到初始頁
function quitGame() {
  roundId++;
  running = false;
  clearInterval(countdownTimer);
  breakCombo(false);
  resetFrog();
  goToLobby(false);
}
exitBtn.addEventListener("click", quitGame);

// 結算頁進場：大分數往上滾、萊姆綠底由左刷上，四格數據依序跳出
function playResultIntro() {
  const scoreSpan = $("resScore");
  countUp(scoreSpan, score, 300, 1400);
  countUp($("resHits"), hits, 900, 700, " 次");
  countUp($("resCombo"), maxCombo, 1000, 700);
  if (reduceMotion) return;
  scoreSpan.animate([{ backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%" }],
                    { duration: 700, delay: 1500, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
  [...$("resStats").children].forEach((cell, i) => cell.animate(
    [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
    { duration: 450, delay: 700 + i * 120, easing: "ease-out", fill: "backwards" }));
}

// 結算頁的 3D 青蛙：變成這一局最後的階段，左右各留一個掌痕（停一下再慢慢彈回）
function setResultFrog(n) {
  resFrog.resetGame();
  if (n >= 2) resFrog.setStage(n);
  const hold = resFrog.params.holdTime;
  resFrog.params.holdTime = 1.6;
  setTimeout(() => resFrog.slapHand("right", 0.8, 0.5), 500);
  setTimeout(() => resFrog.slapHand("left", 0.7, 0.45), 850);
  setTimeout(() => { resFrog.params.holdTime = hold; }, 2600);   // 掌痕停 1.6 秒後再彈回
}

// 依分數挑推薦商品：從高往低找第一個符合的
function recommend(s) {
  return [...CONFIG.PRODUCTS].sort((a, b) => b.minScore - a.minScore).find(p => s >= p.minScore) || CONFIG.PRODUCTS[0];
}

function endGame() {
  running = false;
  timeEl.parentElement.classList.remove("urgent");
  clearInterval(countdownTimer);
  breakCombo(false);

  // 記錄這一場的成績（先存本機，有設定線上資料庫的話再補傳）
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: playerName, score, hits, maxCombo, stage: frogStage, t: Date.now()
  };
  const local = addScore(record);
  currentResult = record.id;

  // 結算頁
  $("resName").textContent = playerName;
  $("resStage").textContent = STAGE_TEXT[frogStage];
  const p = recommend(score);
  $("recoName").textContent = p.name;
  $("recoDesc").textContent = p.desc;
  $("recoLink").href = p.url;
  renderResultBoard(local, record.id, true);

  setView("result");
  playResultIntro();
  setResultFrog(frogStage);
  startAutoReturn();

  // 在背景同步線上榜單；回來時如果還停在這一場的結算頁，就更新名次
  syncAndLoad().then(list => {
    if (currentResult !== record.id) return;
    renderResultBoard(list, record.id, false);
  });
}

/* ---------- 啟動 ---------- */
applyStageTint();
updateStageHud();
startForm.addEventListener("submit", e => { e.preventDefault(); startGame(); });
nameInput.addEventListener("input", () => { nameHint.textContent = ""; });
refreshLobbyBoard();
