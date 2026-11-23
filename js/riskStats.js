// ===== 風險數據 (03)：三顆裝著液體的大青蛙頭 =====
// 每顆頭是清透的液態玻璃，裡面的萊姆綠液體高度＝數值（66%、17%、37.7%，照高度算）。
// 液面以下由下往上漸淡；液面保持水平，頭轉動或液體上漲時會晃。頭的邊緣是微微的萊姆綠漸層光。
// 動畫進度由 risk-scroll.js 的 window.riskStats.fill（0～1）控制；頭會跟著滑鼠轉。
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { G, HEAD_BOTTOM, HEAD_TOP, buildHeadGeometry, buildMouth, makeLimeEdge } from "./frogHeadGeo.js";

const statsBox = document.querySelector(".panel-stats .stats");
const slots = Array.from(document.querySelectorAll(".panel-stats .stat-head"));
const state = window.riskStats || (window.riskStats = { fill: 1 });
const HEAD_MID = (HEAD_TOP + HEAD_BOTTOM) / 2; // 頭的垂直中心（模型座標）
const HEAD_H = HEAD_TOP - HEAD_BOTTOM;
const HEAD_W = 1.74;

// ---------- 延後建立（同 riskFrogs.js）：主視覺動畫播完，或風險數據區露出來 ----------
let started = false;
function start() {
  if (started || !statsBox || !slots.length) return;
  if (window.matchMedia("(max-width: 900px)").matches) return; // 窄螢幕用平面後備圖
  started = true;
  init();
}
const near = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) { near.disconnect(); start(); }
}, { rootMargin: "0px", threshold: 0.02 });
near.observe(document.getElementById("risk") || statsBox);
setTimeout(() => {
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 1500 });
  else start();
}, 3500);

// ---------- 液體材質：超過液面的部分丟掉；從背面看進去的地方畫成液面 ----------
function makeLiquid() {
  const mat = new THREE.MeshStandardMaterial({
    color: "#c8fa6e", roughness: 0.25, metalness: 0, side: THREE.DoubleSide,
    emissive: new THREE.Color("#c8fa6e"), emissiveIntensity: 0.3,
  });
  const u = {
    uLevel: { value: -1e5 },                       // 液面高度（世界座標）
    uBottom: { value: 0 },                         // 頭底部高度（世界座標）
    uCenter: { value: new THREE.Vector3() },       // 頭中心（世界座標）
    uTilt: { value: new THREE.Vector2() },         // 液面傾斜（晃動）
    uAmp: { value: 0 },                            // 液面波紋高度
    uFreq: { value: 0.05 },                        // 波紋密度
    uTime: { value: 0 },
    uColBot: { value: new THREE.Color("#c8fa6e") }, // 底部：飽滿萊姆綠
    uColTop: { value: new THREE.Color("#eefcd2") }, // 靠近液面：淡（像變透明）
    uSurf: { value: new THREE.Color("#dbfb9e") },   // 液面本身
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vWP;
uniform float uLevel, uBottom, uAmp, uFreq, uTime;
uniform vec3 uCenter, uColBot, uColTop, uSurf;
uniform vec2 uTilt;
vec3 lqCol;`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
vec3 rel = vWP - uCenter;
float surf = uLevel + rel.x * uTilt.x + rel.z * uTilt.y
  + sin(rel.x * uFreq + uTime * 3.1) * uAmp + sin(rel.z * uFreq * 1.4 - uTime * 2.3) * uAmp * 0.6;
if (vWP.y > surf) discard;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
float hh = clamp((vWP.y - uBottom) / max(uLevel - uBottom, 0.001), 0.0, 1.0);
lqCol = gl_FrontFacing ? mix(uColBot, uColTop, smoothstep(0.0, 1.0, hh)) : uSurf;
diffuseColor.rgb = lqCol;`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance = lqCol * 0.35;");
  };
  mat.customProgramCacheKey = () => "risk-stat-liquid";
  return { mat, u };
}

function init() {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (err) { return; }
  statsBox.classList.add("has-3d");
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = "stats-canvas";
  statsBox.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ffffff");
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  const key = new THREE.DirectionalLight("#ffffff", 2.2); key.position.set(-1.5, 2.5, 2.5); scene.add(key);
  const fill = new THREE.DirectionalLight("#dfe9ff", 0.8); fill.position.set(2, -0.5, 1.5); scene.add(fill);

  // 正投影鏡頭：世界座標 1 單位＝1 像素，三顆頭不會因為靠邊而被拉大變形
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  camera.position.set(0, 0, 2000);

  const glassGeo = buildHeadGeometry(110, 78, 0);
  // 液體裝在玻璃裡面：只比玻璃小一點點，看起來飽滿又不會跑出容器
  const liquidGeo = buildHeadGeometry(90, 64, 2.5);
  const mouthGeo = buildMouth(), pearlGeo = new THREE.SphereGeometry(1, 32, 24);
  const pearlMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.25, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color("#ffffff"), emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.35 });
  const mouthMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.3, clearcoat: 1, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.3 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: "#ffffff", transmission: 1, thickness: 0.3, ior: 1.45, roughness: 0.03,
    clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1,
    iridescence: 0.2, iridescenceIOR: 1.3, envMapIntensity: 0.9,
    emissive: new THREE.Color("#c8fa6e"), emissiveIntensity: 0.03,
  });

  const edgeMat = makeLimeEdge();

  const heads = slots.map((slot, i) => {
    const g = new THREE.Group();          // 位置（跟著網頁欄位）
    const pivot = new THREE.Group();      // 轉頭
    const inner = new THREE.Group();      // 讓頭以自己的中心旋轉
    inner.position.y = -HEAD_MID;
    g.add(pivot); pivot.add(inner);
    const liquid = makeLiquid();
    inner.add(new THREE.Mesh(liquidGeo, liquid.mat));
    inner.add(new THREE.Mesh(glassGeo, glassMat));
    // 邊框：微微的萊姆綠漸層光，讓清透的玻璃頭在白底上看得出輪廓
    const edge = new THREE.Mesh(glassGeo, edgeMat);
    edge.renderOrder = 2;
    inner.add(edge);
    G.pearls.forEach((p) => {
      const m = new THREE.Mesh(pearlGeo, pearlMat);
      m.position.set(p.c[0] / 100, p.c[1] / 100, p.c[2] / 100); m.scale.setScalar(p.r / 100); inner.add(m);
    });
    inner.add(new THREE.Mesh(mouthGeo, mouthMat));
    scene.add(g);
    return {
      slot, g, pivot, liquid,
      value: Number(slot.dataset.value) / 100,
      tilt: new THREE.Vector2(), vel: new THREE.Vector2(), amp: 0,
      prevRot: new THREE.Vector2(), prevLevel: 0, phase: i * 1.7,
    };
  });

  // ---------- 版面：畫布蓋住三個 .stat-head（同一列），頭靠左對齊數字 ----------
  let W = 1, H = 1, S = 100;
  function layout() {
    const box = statsBox.getBoundingClientRect();
    const r0 = slots[0].getBoundingClientRect();
    W = Math.max(1, box.width); H = Math.max(1, r0.height);
    canvas.style.left = "0px";
    canvas.style.top = r0.top - box.top + "px";
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    renderer.setSize(W, H, false);
    camera.left = -W / 2; camera.right = W / 2; camera.top = H / 2; camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
    S = Math.min((H * 0.86) / HEAD_H, (r0.width * 0.6) / HEAD_W); // 頭的大小（每單位幾像素）
    heads.forEach((h) => {
      const r = h.slot.getBoundingClientRect();
      const cx = r.left - box.left + (HEAD_W / 2) * S + 16;
      h.g.position.set(cx - W / 2, 0, 0);
      h.g.scale.setScalar(S);
      h.liquid.u.uFreq.value = 7 / S;
    });
  }
  layout();
  new ResizeObserver(layout).observe(statsBox);

  // ---------- 滑鼠 ----------
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mouse = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  const target = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  window.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    mouse.clampScalar(-3, 3);
  });

  // ---------- 迴圈 ----------
  const lookM = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const e = new THREE.Euler(), wp = new THREE.Vector3();
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);
  const clock = new THREE.Clock(); let t = 0;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    t += dt;
    if (!visible) return;

    plane.constant = -S * 5;                     // 游標投影到頭前方的平面
    ray.setFromCamera(mouse, camera);
    ray.ray.intersectPlane(plane, target);

    heads.forEach((h, i) => {
      h.g.getWorldPosition(wp);

      // 轉頭：看向游標
      if (!reduce) {
        lookM.lookAt(target, wp, up);
        q.setFromRotationMatrix(lookM);
        h.pivot.quaternion.slerp(q, 0.1);
      }
      e.setFromQuaternion(h.pivot.quaternion, "YXZ");

      // 液面：依序上漲到數值高度（照高度算）
      const p = Math.min(1, Math.max(0, state.fill * 1.3 - i * 0.15));
      const levelLocal = HEAD_BOTTOM + HEAD_H * h.value * p;               // 模型座標
      const levelWorld = wp.y + (levelLocal - HEAD_MID) * S;
      const bottomWorld = wp.y + (HEAD_BOTTOM - HEAD_MID) * S;
      const u = h.liquid.u;
      u.uLevel.value = p > 0.001 ? levelWorld : -1e5;
      u.uBottom.value = bottomWorld;
      u.uCenter.value.copy(wp);
      u.uTime.value = t + h.phase;

      // 晃動：頭轉得越快、液面漲得越快，晃得越大；像彈簧一樣慢慢回正
      const dRotY = e.y - h.prevRot.x, dRotX = e.x - h.prevRot.y;
      const dLevel = (levelWorld - h.prevLevel) / S;
      h.prevRot.set(e.y, e.x); h.prevLevel = levelWorld;
      h.vel.x += -h.tilt.x * 0.09 - dRotY * 1.6;
      h.vel.y += -h.tilt.y * 0.09 + dRotX * 1.6;
      h.vel.multiplyScalar(0.9);
      h.tilt.add(h.vel);
      h.tilt.clampScalar(-0.35, 0.35);
      const idle = reduce ? 0 : 0.02;
      u.uTilt.value.set(h.tilt.x + Math.sin(t * 1.3 + h.phase) * idle, h.tilt.y + Math.cos(t * 1.1 + h.phase) * idle);
      h.amp = Math.max(h.amp * 0.94, Math.min(0.05, Math.abs(dLevel) * 3 + h.vel.length() * 0.4));
      u.uAmp.value = (0.008 + h.amp) * S;

    });
    renderer.render(scene, camera);
  });
}
