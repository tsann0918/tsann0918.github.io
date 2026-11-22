// ===== 風險數據 (01)：25 顆液態玻璃青蛙頭 =====
// 每顆頭＝4 個人。顏色依嚴重程度沿著「萊姆綠 → 淡綠 → 灰 → 淡粉 → 桃紅」漸層；
// 剛好跨兩類的頭（小數點那幾顆）整顆用左右漸層表示。
// 動畫進度由 risk-scroll.js 的 window.riskWaffle（appear、fill，0～1）控制；頭會跟著滑鼠轉。
// 造型來自 frogHeadGeo.js（沿用「青蛙頭 3D（液態玻璃）」模型）。
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { G, buildHeadGeometry, buildMouth, makeRim } from "./frogHeadGeo.js";

const container = document.getElementById("waffle");
const state = window.riskWaffle || (window.riskWaffle = { appear: 1, fill: 1 });

// ---------- 顏色：五階漸層（0＝好、1＝壞） ----------
const SCALE = ["#c8fa6e", "#ecffca", "#edebeb", "#ffbdd1", "#fb6291"].map((c) => new THREE.Color(c));
function sampleScale(t, out) {
  const x = Math.min(1, Math.max(0, t)) * (SCALE.length - 1);
  const i = Math.min(SCALE.length - 2, Math.floor(x));
  return out.copy(SCALE[i]).lerp(SCALE[i + 1], x - i);
}

// 四類的嚴重程度（在漸層上的位置）
const SEV = { worse: 1, persist: 0.75, recur: 0.5, other: 0 };

// ---------- 25 顆頭的資料：依人數 10／37／23／30 每 4 人一顆 ----------
// 依序排：更嚴重 → 持續痛 → 反覆發作 → 其餘；跨類的頭記下左右兩類與比例
function buildHeads() {
  const people = [];
  [["worse", 10], ["persist", 37], ["recur", 23], ["other", 30]].forEach(([k, n]) => {
    for (let i = 0; i < n; i++) people.push(k);
  });
  const heads = [];
  for (let h = 0; h < 25; h++) {
    const group = people.slice(h * 4, h * 4 + 4);
    const a = group[0], b = group[3];
    const split = group.filter((p) => p === a).length / 4; // 左邊那一類佔幾成
    heads.push({ a, b, split: a === b ? 1 : split });
  }
  return heads;
}
const HEADS = buildHeads();
// 會變色的頭（不是整顆「其餘」的），依序編號，決定變色先後
let order = 0;
HEADS.forEach((h) => { h.order = h.a === "other" && h.b === "other" ? -1 : order++; });
const CHANGING = order;

// ---------- 玻璃材質：在官方玻璃材質裡加「左右漸層」 ----------
function makeGlass() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: "#ffffff", transmission: 1, thickness: 0.45, ior: 1.45, roughness: 0.02,
    attenuationColor: new THREE.Color("#c8fa6e"), attenuationDistance: 0.55,
    clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1,
    iridescence: 0.2, iridescenceIOR: 1.3, envMapIntensity: 0.85,
  });
  const u = {
    uColL: { value: new THREE.Color("#c8fa6e") }, // 頭的左半邊顏色
    uColR: { value: new THREE.Color("#c8fa6e") }, // 右半邊顏色
    uSplit: { value: 1 },   // 左邊佔幾成（0～1）
    uSoft: { value: 0.22 }, // 交界的漸層寬度
    uEmi: { value: 0.28 },  // 自發光強度：顏色越清楚越亮
    uClearL: { value: 0.55 }, // 左半邊清透程度：越大顏色越淡、越像透明玻璃
    uClearR: { value: 0.55 }, // 右半邊清透程度
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vLX;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLX = position.x;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vLX;\nuniform vec3 uColL, uColR;\nuniform float uSplit, uSoft, uEmi, uClearL, uClearR;\nvec3 gCol;")
      .replace("#include <color_fragment>",
        "#include <color_fragment>\nfloat gt = smoothstep(uSplit - uSoft, uSplit + uSoft, (vLX + 0.87) / 1.74);\ngCol = mix(uColL, uColR, gt);\ndiffuseColor.rgb = mix(gCol, vec3(1.0), mix(uClearL, uClearR, gt));")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance = gCol * uEmi;");
  };
  mat.customProgramCacheKey = () => "risk-frog-glass";
  return mat;
}
// ---------- 場景 ----------
// 建 25 顆頭的模型要花一點時間，所以不在一進頁面就做（會卡住主視覺的進場動畫）：
// 等主視覺動畫播完（約 3 秒），或捲到風險數據區附近，才開始建立
let started = false;
function start() {
  if (started) return;
  started = true;
  init();
}
const near = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) { near.disconnect(); start(); }
}, { rootMargin: "0px", threshold: 0.02 }); // 風險數據區一露出來就開始建（前面還有一整頁開場，時間夠）
if (container) near.observe(document.getElementById("risk") || container);
setTimeout(() => {
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 1500 });
  else start();
}, 3000);

function init() {
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (err) {
  renderer = null; // 不支援 WebGL：保留 risk-scroll.js 畫的平面圓點
}
if (renderer && container) {
  container.classList.add("has-3d");
  container.parentElement.classList.add("has-3d"); // 舞台：藏掉網頁上的後備數字
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = "waffle-canvas";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ffffff"); // 跟頁面同色的白底：玻璃折射白底，顏色才乾淨
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  const key = new THREE.DirectionalLight("#ffffff", 2.2); key.position.set(-1.5, 2.5, 2.5); scene.add(key);
  const fill = new THREE.DirectionalLight("#dfe9ff", 0.8); fill.position.set(2, -0.5, 1.5); scene.add(fill);

  // ---------- 70%：畫在青蛙頭後面的一張平面上，玻璃才會真的折射到數字 ----------
  // 數字跟著 risk-scroll.js 的 #waffle-num 一起跳（0 → 70）
  const numEl = document.getElementById("waffle-num");
  const textCanvas = document.createElement("canvas");
  textCanvas.width = 2048; textCanvas.height = 1024;
  const tctx = textCanvas.getContext("2d");
  const textTex = new THREE.CanvasTexture(textCanvas);
  textTex.colorSpace = THREE.SRGBColorSpace;
  textTex.anisotropy = 4;
  const textPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.5),
    new THREE.MeshBasicMaterial({ map: textTex, toneMapped: false })
  );
  textPlane.position.z = -4; // 在頭的後面
  scene.add(textPlane);
  const NUM_SIZE = 860; // 數字字級（畫布像素）
  let textW = 1400;     // 「70%」的寬（畫布像素），resize 用來算平面大小
  let lastNum = null;
  function drawNumber(n) {
    tctx.fillStyle = "#ffffff";
    tctx.fillRect(0, 0, 2048, 1024);
    tctx.fillStyle = "#000000";
    tctx.textBaseline = "alphabetic";
    tctx.font = "300 " + NUM_SIZE + 'px "Noto Sans TC", sans-serif';
    const w = tctx.measureText(n).width;
    tctx.font = "300 " + NUM_SIZE * 0.2 + 'px "Noto Sans TC", sans-serif';
    const pw = tctx.measureText("%").width;
    const gap = NUM_SIZE * 0.04;
    const x = (2048 - (w + gap + pw)) / 2;
    const base = 512 + NUM_SIZE * 0.36; // 讓數字上下置中
    tctx.font = "300 " + NUM_SIZE + 'px "Noto Sans TC", sans-serif';
    tctx.fillText(n, x, base);
    tctx.font = "300 " + NUM_SIZE * 0.2 + 'px "Noto Sans TC", sans-serif';
    tctx.fillText("%", x + w + gap, base);
    textTex.needsUpdate = true;
  }
  function measureFull() {
    tctx.font = "300 " + NUM_SIZE + 'px "Noto Sans TC", sans-serif';
    textW = tctx.measureText("70").width + NUM_SIZE * 0.24;
  }
  // 等網頁字型載好再畫，不然會先用系統字
  document.fonts.load('300 100px "Noto Sans TC"').then(() => { measureFull(); lastNum = null; resize(); });

  // 5×5 排列：間距 2.1（頭寬約 1.74）
  const GAP = 2.1;
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
  camera.position.set(0, 0, 30);

  const headGeo = buildHeadGeometry(96, 68), mouthGeo = buildMouth(), pearlGeo = new THREE.SphereGeometry(1, 32, 24);
  const pearlMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.25, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color("#ffffff"), emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.35 });
  const mouthMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.3, clearcoat: 1, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.3 });

  const frogs = HEADS.map((d, i) => {
    const col = i % 5, row = Math.floor(i / 5);
    const g = new THREE.Group();
    g.position.set((col - 2) * GAP, (2 - row) * GAP - 0.1, 0);
    const pivot = new THREE.Group(); g.add(pivot); // pivot 負責轉頭與出現的縮放
    const glass = makeGlass();
    const rimMat = makeRim();
    const head = new THREE.Mesh(headGeo, glass); pivot.add(head);
    pivot.add(new THREE.Mesh(headGeo, rimMat));
    G.pearls.forEach((p) => {
      const m = new THREE.Mesh(pearlGeo, pearlMat);
      m.position.set(p.c[0] / 100, p.c[1] / 100, p.c[2] / 100); m.scale.setScalar(p.r / 100); pivot.add(m);
    });
    pivot.add(new THREE.Mesh(mouthGeo, mouthMat));
    scene.add(g);
    return { d, g, pivot, glass, rimMat, phase: i * 0.7 };
  });

  // 依容器大小調整鏡頭距離，讓 5×5 剛好塞滿
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const need = GAP * 5 * 0.5 + 0.3; // 半寬（含一點邊）
    const dist = need / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect);
    camera.position.z = dist;
    camera.updateProjectionMatrix();
    // 數字平面：數字高度約等於青蛙頭方陣的高度，但寬度不超出畫面
    const viewH = 2 * (dist + 4) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const viewW = viewH * camera.aspect;
    const perPx = Math.min((viewH * 1.25) / 1024, (viewW * 0.94) / textW);
    textPlane.scale.set(2048 * perPx, 2048 * perPx, 1); // 平面幾何是 1×0.5，所以兩邊都乘畫布寬
  }
  resize();
  new ResizeObserver(resize).observe(container);

  // ---------- 滑鼠：每顆頭都轉向游標（游標在畫面任何地方都算） ----------
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mouse = new THREE.Vector2(0, 0);
  const target = new THREE.Vector3(0, 0, 8);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -6); // z＝6 的平面
  window.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    mouse.clampScalar(-2.5, 2.5);
  });

  // ---------- 每一格：依進度算出顏色、大小、朝向 ----------
  const tmpL = new THREE.Color(), tmpR = new THREE.Color(), tmpAvg = new THREE.Color();
  const lookM = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const wp = new THREE.Vector3();
  const easeBack = (x) => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(container);
  const clock = new THREE.Clock(); let t = 0;

  renderer.setAnimationLoop(() => {
    t += Math.min(clock.getDelta(), 1 / 30);
    if (!visible) return;

    // 游標投到 z＝6 的平面上，當作大家要看的點
    ray.setFromCamera(mouse, camera);
    ray.ray.intersectPlane(plane, target);

    frogs.forEach((f, i) => {
      const d = f.d;
      // 出現：依序從 0 彈到原大小
      const ap = clamp01((state.appear * 30 - i) / 5);
      const s = ap <= 0 ? 0.0001 : easeBack(ap);
      f.pivot.scale.setScalar(s);

      // 變色：會變色的頭依序從萊姆綠走到自己那一類
      let p = 0;
      if (d.order >= 0) p = clamp01((state.fill * (CHANGING + 3) - d.order) / 3);
      sampleScale(SEV[d.a] * p, tmpL);
      sampleScale(SEV[d.b] * p, tmpR);
      const u = f.glass.userData.u;
      u.uColL.value.copy(tmpL); u.uColR.value.copy(tmpR); u.uSplit.value = d.split;
      tmpAvg.copy(tmpL).lerp(tmpR, 1 - d.split);
      f.glass.attenuationColor.copy(tmpAvg);
      // 「其餘」（研究未細分）一直保持清透，代表「狀況不確定」
      // 一開始大家都是清透的萊姆綠；會變色的頭一邊變色一邊變得飽滿
      const solid = d.order >= 0 ? p : 0;
      u.uClearL.value = d.a === "other" ? 0.55 : 0.55 * (1 - p);
      u.uClearR.value = d.b === "other" ? 0.55 : 0.55 * (1 - p);
      u.uEmi.value = 0.1 + 0.2 * solid;
      f.glass.attenuationDistance = 1.8 - 1.25 * solid;
      f.rimMat.uniforms.color.value.copy(tmpAvg).lerp(new THREE.Color("#ffffff"), 0.35);

      // 朝向：看向游標；平常輕輕上下浮動
      f.g.getWorldPosition(wp);
      if (!reduce) {
        lookM.lookAt(target, wp, up);
        q.setFromRotationMatrix(lookM);
        f.pivot.quaternion.slerp(q, 0.12);
        f.pivot.position.y = Math.sin(t * 1.4 + f.phase) * 0.06;
      }
    });
    // 數字有變才重畫
    const n = numEl ? numEl.textContent : "70";
    if (n !== lastNum) { lastNum = n; drawNumber(n); }
    renderer.render(scene, camera);
  });
}
} // init()
