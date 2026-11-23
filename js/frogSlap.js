// ===== 呼青蛙巴掌：會被打凹、像解壓球一樣彈回來的玻璃青蛙頭 =====
// 從 frogHead.js 複製出來再加功能（原檔不動）。
// 用法：
//   import { createFrogSlap } from './frogSlap.js';
//   const game = createFrogSlap(document.querySelector('#frog-slap'), { /* 參數，見下方 P */ });
//   game.slapHand('right', 0.8, 0.5);   // 右手打 → 青蛙「自己的左臉」（畫面右邊）留下右手掌痕；0.8＝力道；0.5＝高度(0上~1下)
//   game.onSlap((e) => console.log(e.score, e.combo));
// 滑鼠／觸控：點臉＝普通力道；在臉上快速滑過＝依速度決定力道。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const SLAP_DEFAULTS = {
  // 外觀
  glassTint: '#c8fa6e',   // 玻璃顏色（螢光萊姆綠）
  glow: 0.28,             // 玻璃自發光（螢光感）
  thickness: 0.45,        // 玻璃厚度（越厚折射越強）
  background: 'blobs',    // 玻璃後面的彩色背景：'blobs'／'none'
  // 掌痕形狀
  handSize: 0.95,         // 掌痕長度（頭寬約 1.74）
  dentDepth: 0.16,        // 最大凹陷深度（力道 1 時）
  fingerSpread: 8,        // 手指張開角度（度）
  handTilt: 18,           // 手指往外斜的角度（度）
  edgeSoft: 0.045,        // 掌痕邊緣柔和度
  bowl: 0.45,             // 整片跟著陷下去的比例（0＝只有手形，1＝像壓球一樣整片凹）
  // 彈性
  pressTime: 0.05,        // 凹下去要多久（秒）
  holdTime: 0.1,          // 凹到底停多久（秒）
  recoverSpeed: 1.6,      // 恢復速度（越大彈回越快）
  bounce: 0.55,           // 回彈晃動（0＝慢慢浮回、1＝晃很多下）
  maxPrints: 6,           // 同時存在的掌痕數
  // 整顆頭
  knock: 20,              // 被打歪的角度（度）
  squash: 0.12,           // 被打扁的程度
  wobble: 0.6,            // 果凍晃動（越大晃越久）
  shake: 0.035,           // 畫面震動
  // 效果
  flushColor: '#ff5fa2',  // 掌印顏色
  flushAmount: 0.65,      // 掌印濃度
  flushTime: 2.4,         // 掌印退掉的秒數
  faceTime: 0.9,          // 痛的表情維持秒數
  fx: true,               // 打擊特效（光圈＋星星）
  comboWindow: 1.2,       // 幾秒內再打一下算連擊
  clickStrength: 0.6,     // 滑鼠點一下的力道
  allowOrbit: false,      // 允許拖曳旋轉視角（關掉才好用滑動打巴掌）
  autoRotate: false,
  // 遊戲：三個階段（分數累積、不會消）
  roundTime: 30,          // 一回合幾秒（從第一巴掌開始算；0＝不限時，要按結算）
  comboMax: 5,            // 連擊倍數上限
  stage2At: 1500,         // 分數到這裡 → 階段 2「腫起來了」
  stage3At: 4000,         // 分數到這裡 → 階段 3「被打到好開心」
  swellMax: 0.14,         // 臉頰最多腫多少
  swellPerHit: 0.012,     // 階段 2 之後每一巴掌多腫一點
  blush: 0.7,            // 階段 2 之後臉頰一直帶的粉紅
  happyTint: '#ff9fd0',   // 階段 3 玻璃變成的粉紅色
  heartColor: '#ff3d8b',  // 愛心眼睛的顏色
  shiver: 0.245,          // 階段 3 被打：上下伸縮顫抖的幅度
  shiverFreq: 8,          // 顫抖快慢（每秒幾下）
  shiverDamp: 0.08,       // 顫抖停下來的速度（越小抖越久）
  // 給外部遊戲用（例如網站的 game.html）
  external: false,        // true＝計分、計時、升階段都交給外部，這個模組只負責青蛙的畫面和反應
  video: null,            // background 設成 'video' 時，傳入 <video>：鏡頭畫面放在青蛙後面，玻璃會折射出玩家
  cameraLift: 0,          // 鏡頭往上抬多少（青蛙在畫面上就往下移）
  cameraDist: 6.2,        // 鏡頭離青蛙多遠（越小青蛙越大）
  lookAtPointer: false,   // 青蛙轉頭看滑鼠（網頁上的裝飾青蛙用）
};
export const STAGE_NAMES = ['', '正常', '腫起來了', '被打到好開心'];

export function createFrogSlap(container, opt = {}) {
  const P = { ...SLAP_DEFAULTS, ...opt };

  // ---------- 幾何（與青蛙頭三視圖相同；單位＝原圖示像素，最後 ÷100）----------
  const G = {
    base: { c: [0, 0, 0], r: [87, 69, 48] },
    bumps: [{ c: [-40, 51, 6], r: 32 }, { c: [40, 51, 6], r: 32 }],
    smooth: 12,
    pearls: [{ c: [-40, 61, 28], r: 12 }, { c: [40, 61, 28], r: 12 }],
    mouth: [[-23, 38.5], [-14, 37], [-7, 33.5], [-2, 29], [0, 25], [2, 29], [7, 33.5], [14, 37], [23, 38.5]],
    mouthR: 1.8,
  };
  const sdEll = (x, y, z, c, r) => {
    const qx = (x - c[0]) / r[0], qy = (y - c[1]) / r[1], qz = (z - c[2]) / r[2];
    const k0 = Math.hypot(qx, qy, qz);
    const k1 = Math.hypot((x - c[0]) / (r[0] * r[0]), (y - c[1]) / (r[1] * r[1]), (z - c[2]) / (r[2] * r[2]));
    return k0 * (k0 - 1) / Math.max(k1, 1e-9);
  };
  const sdSph = (x, y, z, c, r) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
  const smin = (a, b, k) => { const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / k)); return b * (1 - h) + a * h - k * h * (1 - h); };
  const sdHead = (x, y, z) => {
    let d = sdEll(x, y, z, G.base.c, G.base.r);
    for (const b of G.bumps) d = smin(d, sdSph(x, y, z, b.c, b.r), G.smooth);
    return d;
  };
  // 距離函數的梯度＝表面法線（輸入輸出都用 ÷100 後的單位）
  function gradAt(x, y, z, out = new THREE.Vector3()) {
    const e = 0.05; x *= 100; y *= 100; z *= 100;
    out.set(sdHead(x + e, y, z) - sdHead(x - e, y, z), sdHead(x, y + e, z) - sdHead(x, y - e, z), sdHead(x, y, z + e) - sdHead(x, y, z - e));
    return out.normalize();
  }
  // 從 O 沿著方向 d 往外找表面（O、回傳值都用 ÷100 的單位）
  function surfaceAlong(dx, dy, dz, O = [0, 18, 0]) {
    let t = 170;
    for (; t > 0; t -= 1) if (sdHead(O[0] + dx * t, O[1] + dy * t, O[2] + dz * t) < 0) break;
    let a = t, b = t + 1;
    for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (sdHead(O[0] + dx * m, O[1] + dy * m, O[2] + dz * m) < 0) a = m; else b = m; }
    const tt = (a + b) / 2;
    return new THREE.Vector3((O[0] + dx * tt) / 100, (O[1] + dy * tt) / 100, (O[2] + dz * tt) / 100);
  }
  function buildHeadGeometry() {
    let g = new THREE.SphereGeometry(1, 240, 170);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = surfaceAlong(p.getX(i), p.getY(i), p.getZ(i));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = mergeVertices(g, 1e-5);          // 把球的接縫焊起來，重算法線時才不會出現一條線
    g.computeVertexNormals();
    return g;
  }
  function surfaceZ(x, y) { for (let z = 70; z > -70; z -= 0.25) if (sdHead(x, y, z) < 0) return z; return 0; }
  // 沿著臉表面的細管（嘴巴、痛的表情都用它）
  function surfaceTube(pts2d, r, lift = 0.4, tension = 0.3, seg = 80) {
    const pts = pts2d.map(([x, y]) => new THREE.Vector3(x / 100, y / 100, (surfaceZ(x, y) + r * lift) / 100));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', tension), seg, r / 100, 12);
  }

  // ---------- 場景 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;   // Neutral 保留螢光綠的飽和度
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(-1.5, 2.5, 2.5); scene.add(key);
  const fill = new THREE.DirectionalLight('#dfe9ff', 0.8); fill.position.set(2, -0.5, 1.5); scene.add(fill);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const CAM0 = new THREE.Vector3(0, 0.25 + P.cameraLift, P.cameraDist), TGT0 = new THREE.Vector3(0, 0.1 + P.cameraLift, 0);
  camera.position.copy(CAM0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(TGT0); controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 3.5; controls.maxDistance = 10; controls.autoRotateSpeed = 1.2;
  controls.update();
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  }
  resize(); const ro = new ResizeObserver(resize); ro.observe(container);

  // 玻璃後面的背景：'video'＝鏡頭畫面（左右鏡像、撐滿畫面，跟手部座標對齊）；其他＝彩色光斑
  const bgTint = { color: new THREE.Color('#000000'), amount: 0.25 };
  const bg = P.background === 'video' && P.video ? (() => {
    const tex = new THREE.VideoTexture(P.video); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, tint: { value: bgTint.color }, amt: { value: bgTint.amount } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      // 鏡像（1 - x），再疊一層色罩（跟原本 #tint 一樣的效果）
      fragmentShader: `uniform sampler2D map; uniform vec3 tint; uniform float amt; varying vec2 vUv;
        void main(){ vec3 c = texture2D(map, vec2(1. - vUv.x, vUv.y)).rgb; gl_FragColor = vec4(mix(c, tint, amt), 1.); }`,
      toneMapped: false, depthWrite: false,
    }));
    m.userData.isVideo = true; m.renderOrder = -1; return m;
  })() : (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d');
    const g0 = x.createLinearGradient(0, 0, 1024, 1024); g0.addColorStop(0, '#f3e3ec'); g0.addColorStop(1, '#dfe9f7');
    x.fillStyle = g0; x.fillRect(0, 0, 1024, 1024);
    for (const [cx, cy, r, col] of [[250, 300, 300, '#ff9ec4'], [780, 260, 280, '#c8fa6e'], [620, 760, 330, '#8fd0ff'], [200, 820, 240, '#ffd27a']]) {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col); g.addColorStop(1, col + '00');
      x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
    }
    x.globalAlpha = 0.25; x.strokeStyle = '#ffffff'; x.lineWidth = 3;
    for (let i = 0; i <= 1024; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 1024); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(1024, i); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  })();
  function setBgTint(color, amount) { bgTint.color.set(color); bgTint.amount = amount; if (bg.material.uniforms) bg.material.uniforms.amt.value = amount; }

  // ---------- 模型 ----------
  // root（浮動）→ pivot（脖子，被打歪／壓扁）→ body（頭和五官）
  const root = new THREE.Group(); scene.add(root);
  const NECK_Y = -0.62;
  const pivot = new THREE.Group(); pivot.position.y = NECK_Y; root.add(pivot);
  const body = new THREE.Group(); body.position.y = -NECK_Y; pivot.add(body);

  const headGeo = buildHeadGeometry();
  const posAttr = headGeo.attributes.position, nrmAttr = headGeo.attributes.normal;
  const VCOUNT = posAttr.count;
  const basePos = Float32Array.from(posAttr.array), baseNrm = Float32Array.from(nrmAttr.array);
  const flushArr = new Float32Array(VCOUNT);
  headGeo.setAttribute('aFlush', new THREE.BufferAttribute(flushArr, 1));
  posAttr.setUsage(THREE.DynamicDrawUsage); nrmAttr.setUsage(THREE.DynamicDrawUsage);

  // 臉頰腫起來的位置（左右臉頰各一團，沿法線往外鼓）
  const swellW = new Float32Array(VCOUNT);
  {
    const cheeks = [-1, 1].map((sd) => { const az = 58 * Math.PI / 180, el = -14 * Math.PI / 180;
      const c = surfaceAlong(sd * Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), [0, 2, 0]); return { c, n: gradAt(c.x, c.y, c.z) }; });
    for (let i = 0; i < VCOUNT; i++) {
      let w = 0;
      for (const { c, n } of cheeks) {
        const dx = basePos[i * 3] - c.x, dy = basePos[i * 3 + 1] - c.y, dz = basePos[i * 3 + 2] - c.z;
        const facing = baseNrm[i * 3] * n.x + baseNrm[i * 3 + 1] * n.y + baseNrm[i * 3 + 2] * n.z;
        w += Math.max(0, facing) * Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * 0.3 * 0.3));
      }
      swellW[i] = Math.min(1, w);
    }
  }

  // 玻璃材質＋粉紅掌印（在著色器裡把掌印的地方染粉紅）
  const flushU = { value: new THREE.Color(P.flushColor) }, flushAmtU = { value: P.flushAmount };
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(P.glassTint), transmission: 1, thickness: P.thickness, ior: 1.45, roughness: 0.02,
    attenuationColor: new THREE.Color(P.glassTint), attenuationDistance: 0.55,
    emissive: new THREE.Color(P.glassTint), emissiveIntensity: P.glow,
    clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, dispersion: 6,
    iridescence: 0.25, iridescenceIOR: 1.3, envMapIntensity: 0.85,
  });
  glassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlush = flushU; sh.uniforms.uFlushAmt = flushAmtU;
    sh.vertexShader = 'attribute float aFlush;\nvarying float vFlush;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlush = aFlush;');
    sh.fragmentShader = 'uniform vec3 uFlush;\nuniform float uFlushAmt;\nvarying float vFlush;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat fl = clamp(vFlush * uFlushAmt, 0., 1.);\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, uFlush * 0.45, fl);')
      .replace('#include <transmission_fragment>', '#include <transmission_fragment>\ntotalDiffuse = mix(totalDiffuse, uFlush * 0.9, fl * 0.75);');
  };
  const head = new THREE.Mesh(headGeo, glassMat); body.add(head);

  // 白色霧面玻璃（眼珠、嘴巴、痛的表情）
  const whiteMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05,
    sheen: 1, sheenColor: new THREE.Color('#ffffff'), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35 });
  const pearlGeo = new THREE.SphereGeometry(1, 48, 36);
  const pearls = G.pearls.map((p) => {
    const m = new THREE.Mesh(pearlGeo, whiteMat); m.position.set(p.c[0] / 100, p.c[1] / 100, p.c[2] / 100); m.scale.setScalar(p.r / 100);
    m.userData.base = m.position.clone(); m.userData.anchor = new THREE.Vector3(p.c[0] / 100, p.c[1] / 100, (p.c[2] + p.r) / 100);
    body.add(m); return m;
  });
  // 跟著臉一起變形的細管：正常的嘴、痛的 >< 眼睛、痛的波浪嘴
  const decor = [];
  function addDecor(geo) {
    const m = new THREE.Mesh(geo, whiteMat); body.add(m);
    const a = geo.attributes.position; a.setUsage(THREE.DynamicDrawUsage);
    const base = Float32Array.from(a.array), nrm = new Float32Array(a.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < a.count; i++) { gradAt(base[i * 3], base[i * 3 + 1], base[i * 3 + 2], v); nrm.set([v.x, v.y, v.z], i * 3); }
    const d = { mesh: m, geo, base, nrm, count: a.count }; decor.push(d); return d;
  }
  const mouth = addDecor(surfaceTube(G.mouth, G.mouthR));
  const hurtEyes = [
    addDecor(surfaceTube([[-50, 70], [-33, 61], [-50, 52]], 2.6, 0.6, 0.05, 40)),   // 青蛙右眼 >
    addDecor(surfaceTube([[50, 70], [33, 61], [50, 52]], 2.6, 0.6, 0.05, 40)),      // 青蛙左眼 <
  ];
  const hurtMouth = addDecor(surfaceTube([[-20, 33], [-13, 28], [-6.5, 34], [0, 28], [6.5, 34], [13, 28], [20, 33]], 2, 0.6, 0.2, 90));
  // 階段 2 被打：@@ 暈眩眼
  const spiral = (cx, cy, dir) => { const pts = []; for (let i = 0; i <= 44; i++) { const t = i / 44, a = dir * t * Math.PI * 2 * 2.1, r = 2 + 11 * t; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return pts; };
  const dizzyEyes = [addDecor(surfaceTube(spiral(-40, 61, 1), 1.9, 0.6, 0.5, 120)), addDecor(surfaceTube(spiral(40, 61, -1), 1.9, 0.6, 0.5, 120))];
  // 階段 3：笑嘴（平常）、大笑嘴（被打時）
  const smile = addDecor(surfaceTube([[-24, 40], [-14, 32], [0, 28], [14, 32], [24, 40]], 2.2, 0.5, 0.5, 80));
  const bigSmile = addDecor(surfaceTube([[-30, 43], [-18, 30], [0, 23], [18, 30], [30, 43]], 3.0, 0.5, 0.5, 80));
  [...hurtEyes, hurtMouth, ...dizzyEyes, smile, bigSmile].forEach((d) => (d.mesh.visible = false));

  // 階段 3：愛心眼睛（擠出成立體的愛心，貼在眼睛上）
  const heartMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(P.heartColor), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05,
    emissive: new THREE.Color(P.heartColor), emissiveIntensity: 0.35 });
  const heartGeo = (() => {
    const h = new THREE.Shape();
    h.moveTo(0, -0.9); h.bezierCurveTo(-0.15, -0.72, -1, -0.25, -1, 0.25); h.bezierCurveTo(-1, 0.7, -0.6, 0.95, -0.3, 0.95);
    h.bezierCurveTo(-0.12, 0.95, 0, 0.82, 0, 0.62); h.bezierCurveTo(0, 0.82, 0.12, 0.95, 0.3, 0.95);
    h.bezierCurveTo(0.6, 0.95, 1, 0.7, 1, 0.25); h.bezierCurveTo(1, -0.25, 0.15, -0.72, 0, -0.9);
    const g = new THREE.ExtrudeGeometry(h, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.18, bevelSegments: 6, curveSegments: 32 });
    g.center(); return g;
  })();
  const hearts = G.pearls.map((p) => {
    const m = new THREE.Mesh(heartGeo, heartMat);
    const a = new THREE.Vector3(p.c[0] / 100, p.c[1] / 100, (surfaceZ(p.c[0], p.c[1]) + 4) / 100);
    m.position.copy(a); m.lookAt(a.clone().add(gradAt(a.x, a.y, a.z))); m.scale.setScalar(0.15);
    m.userData.base = a.clone(); m.userData.anchor = a.clone(); m.visible = false; body.add(m); return m;
  });
  const anchored = [...pearls, ...hearts];   // 眼珠＋愛心：整顆跟著凹痕移動

  // 玻璃亮邊（菲涅耳），共用頭的幾何，所以會跟著凹
  const rim = new THREE.Mesh(headGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color('#e6ffb0') }, power: { value: 3.2 }, strength: { value: 0.75 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float power, strength; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1. - max(dot(normalize(vN), normalize(vV)), 0.), power); gl_FragColor = vec4(color * f * strength, 1.); }`,
  }));
  body.add(rim);

  // ---------- 掌痕形狀（2D 距離函數）----------
  // 座標：以手長＝1；y 往指尖，x 正向＝小指那側（大拇指在 -x）。這是「右手」的掌印；左手就左右鏡像。
  const sdCapsule = (px, py, ax, ay, bx, by, r) => {
    const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
    return Math.hypot(pax - bax * h, pay - bay * h) - r;
  };
  const sdRoundBox = (px, py, cx, cy, hx, hy, r) => {
    const qx = Math.abs(px - cx) - hx + r, qy = Math.abs(py - cy) - hy + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  };
  let FINGERS = [];
  function buildHand() {
    const s = P.fingerSpread * Math.PI / 180;
    const f = (bx, by, len, r, k) => { const a = s * k; return [bx, by, bx + Math.sin(a) * len, by + Math.cos(a) * len, r]; };
    FINGERS = [
      f(-0.115, 0.03, 0.30, 0.043, -1.3),  // 食指
      f(-0.035, 0.05, 0.34, 0.044, -0.4),  // 中指
      f(0.048, 0.035, 0.31, 0.042, 0.5),   // 無名指
      f(0.128, -0.005, 0.24, 0.036, 1.4),  // 小指
    ];
    const ta = -0.95 - s * 1.5;            // 大拇指往外張
    FINGERS.push([-0.14, -0.24, -0.14 + Math.sin(ta) * 0.26, -0.24 + Math.cos(ta) * 0.26, 0.05]);
  }
  buildHand();
  function sdHand(x, y) {
    let d = sdRoundBox(x, y, 0.0, -0.17, 0.175, 0.19, 0.08);   // 手掌
    for (const [ax, ay, bx, by, r] of FINGERS) {
      const c = sdCapsule(x, y, ax, ay, bx, by, r);
      const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (c - d) / 0.025)); d = c * (1 - h) + d * h - 0.025 * h * (1 - h);   // 指根圓滑接起來
    }
    return d;
  }
  const smooth01 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // ---------- 打擊（每一個掌痕）----------
  const impacts = [];
  const tmpV = new THREE.Vector3();
  // 算出某一點在這個掌痕裡的權重：w＝凹陷、f＝粉紅掌印
  function weightAt(imp, px, py, pz, nx, ny, nz) {
    const qx = px - imp.c.x, qy = py - imp.c.y, qz = pz - imp.c.z;
    const S = imp.S;
    if (qx * qx + qy * qy + qz * qz > S * S * 0.81) return null;
    const facing = nx * imp.n.x + ny * imp.n.y + nz * imp.n.z;
    const wF = smooth01(0.05, 0.55, facing);
    if (wF <= 0) return null;
    let u = (qx * imp.u.x + qy * imp.u.y + qz * imp.u.z) / S, v = (qx * imp.v.x + qy * imp.v.y + qz * imp.v.z) / S;
    if (imp.mirror) u = -u;                                       // 左手＝右手鏡像
    const a = u * imp.ct - v * imp.st, b = u * imp.st + v * imp.ct; // 轉到手的座標（手指往外斜）
    const sd = sdHand(a, b + 0.08);                                // +0.08：打點在掌心偏上
    const soft = P.edgeSoft;
    const mask = smooth01(soft, -soft * 1.6, sd);
    const r2 = (u * u + v * v);
    const g = Math.exp(-r2 / (2 * 0.36 * 0.36));
    const w = wF * (mask + P.bowl * g) / (1 + P.bowl);
    const f = wF * smooth01(soft * 1.4, -soft, sd);
    if (w < 1e-4 && f < 1e-4) return null;
    return [w, f];
  }
  // 預先算好這個掌痕影響哪些頂點（之後每一格只要乘上彈簧的值，很省）
  function prepareImpact(imp) {
    const idx = [], w = [], f = [];
    for (let i = 0; i < VCOUNT; i++) {
      const r = weightAt(imp, basePos[i * 3], basePos[i * 3 + 1], basePos[i * 3 + 2], baseNrm[i * 3], baseNrm[i * 3 + 1], baseNrm[i * 3 + 2]);
      if (r) { idx.push(i); w.push(r[0]); f.push(r[1]); }
    }
    imp.idx = Int32Array.from(idx); imp.w = Float32Array.from(w); imp.f = Float32Array.from(f);
    imp.decor = decor.map((d) => {
      const di = [], dw = [];
      for (let i = 0; i < d.count; i++) {
        const r = weightAt(imp, d.base[i * 3], d.base[i * 3 + 1], d.base[i * 3 + 2], d.nrm[i * 3], d.nrm[i * 3 + 1], d.nrm[i * 3 + 2]);
        if (r) { di.push(i); dw.push(r[0]); }
      }
      return { idx: Int32Array.from(di), w: Float32Array.from(dw) };
    });
    imp.pearl = anchored.map((m) => { const a = m.userData.anchor, n = gradAt(a.x, a.y, a.z, tmpV); const r = weightAt(imp, a.x, a.y, a.z, n.x, n.y, n.z); return r ? r[0] : 0; });
  }

  // 頭整體的彈簧（被打歪、被壓扁）
  const spring = (w, z) => ({ x: 0, v: 0, w, z });
  const yaw = spring(0, 0), roll = spring(0, 0), squash = spring(0, 0), slide = spring(0, 0);
  function stepSpring(s, dt, w, z) { const a = -w * w * s.x - 2 * z * w * s.v; s.v += a * dt; s.x += s.v * dt; }

  // ---------- 特效：光圈＋星星 ----------
  const fxGroup = new THREE.Group(); scene.add(fxGroup);
  const starTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.translate(64, 64); x.fillStyle = '#fff'; x.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 14 : 60, a = i * Math.PI / 4; x.lineTo(Math.sin(a) * r, -Math.cos(a) * r); }
    x.closePath(); x.fill();
    const t = new THREE.CanvasTexture(c); return t;
  })();
  const heartTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(64, 112);
    x.bezierCurveTo(10, 72, 4, 40, 30, 22); x.bezierCurveTo(48, 10, 62, 24, 64, 38);
    x.bezierCurveTo(66, 24, 80, 10, 98, 22); x.bezierCurveTo(124, 40, 118, 72, 64, 112); x.fill();
    return new THREE.CanvasTexture(c);
  })();
  const ringGeo = new THREE.RingGeometry(0.82, 1, 72);
  const fxList = [];
  function spawnFx(worldPoint, worldNormal, strength, love = false) {
    if (!P.fx) return;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(love ? P.happyTint : P.glassTint), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    ring.position.copy(worldPoint).addScaledVector(worldNormal, 0.03);
    ring.lookAt(tmpV.copy(ring.position).add(worldNormal));
    fxGroup.add(ring);
    fxList.push({ obj: ring, t: 0, life: 0.45, kind: 'ring', size: 0.2 + 0.32 * strength });
    const n = Math.round(5 + strength * 9), cols = love ? [P.heartColor, '#ffffff', P.happyTint] : [P.glassTint, '#ffffff', P.flushColor];
    const t1 = new THREE.Vector3().crossVectors(worldNormal, new THREE.Vector3(0, 1, 0)).normalize(), t2 = new THREE.Vector3().crossVectors(worldNormal, t1);
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: love ? heartTex : starTex, color: cols[i % 3], transparent: true, depthWrite: false, toneMapped: false }));
      sp.position.copy(worldPoint).addScaledVector(worldNormal, 0.06);
      const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 2.2 * (0.5 + strength);
      const vel = worldNormal.clone().multiplyScalar(1 + Math.random() * 1.5).addScaledVector(t1, Math.cos(a) * s).addScaledVector(t2, Math.sin(a) * s);
      fxGroup.add(sp);
      fxList.push({ obj: sp, t: 0, life: (love ? 0.9 : 0.55) + Math.random() * 0.35, kind: 'star', vel, size: (love ? 0.09 : 0.06) + Math.random() * 0.09, spin: love ? (Math.random() - 0.5) * 2 : (Math.random() - 0.5) * 12 });
    }
  }
  function stepFx(dt) {
    for (let i = fxList.length - 1; i >= 0; i--) {
      const f = fxList[i]; f.t += dt; const k = f.t / f.life;
      if (k >= 1) { fxGroup.remove(f.obj); f.obj.material.dispose(); fxList.splice(i, 1); continue; }
      if (f.kind === 'ring') { f.obj.scale.setScalar(f.size * (0.25 + 0.75 * (1 - (1 - k) ** 3))); f.obj.material.opacity = 0.9 * (1 - k); }
      else {
        f.vel.multiplyScalar(Math.exp(-3.2 * dt)); f.vel.y -= 2.5 * dt; f.obj.position.addScaledVector(f.vel, dt);
        f.obj.scale.setScalar(f.size * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85 * 0.7)); f.obj.material.opacity = 1 - k * k;
        f.obj.material.rotation += f.spin * dt;
      }
    }
  }

  // ---------- 計分 ----------
  const state = { score: 0, combo: 0, best: 0, hits: 0, lastHit: -1e9, stage: 1, running: false, over: false, timeLeft: P.roundTime };
  const listeners = [], stageListeners = [], finishListeners = [];
  const swell = { target: 0, shown: 0, applied: 0, blushShown: 0, blushApplied: 0 };
  const look = { happy: 0, happyTarget: 0 };          // 0＝萊姆綠、1＝粉紅（階段 3）
  const heartPulse = { x: 0, v: 0 }, hop = { x: 0, v: 0 }, shiver = { x: 0, v: 0 };
  function setStage(n, silent) {
    n = Math.max(1, Math.min(3, n));
    if (n === state.stage) return;
    const up = n > state.stage; state.stage = n;
    look.happyTarget = n >= 3 ? 1 : 0;
    if (n >= 2 && swell.target < P.swellMax * 0.5) swell.target = P.swellMax * 0.5;     // 一進階段 2 就先腫一截
    if (n < 2) swell.target = 0;
    if (up && !silent) {
      hop.v += 3.2; heartPulse.v += 8;
      head.updateWorldMatrix(true, false);
      spawnFx(head.localToWorld(new THREE.Vector3(0, 0.2, 0.5)), new THREE.Vector3(0, 0, 1), 1, n >= 3);
    }
    stageListeners.forEach((f) => f({ stage: n, name: STAGE_NAMES[n], score: state.score }));
  }
  function finish() {
    if (state.over) return;
    state.over = true; state.running = false;
    finishListeners.forEach((f) => f({ score: state.score, stage: state.stage, stageName: STAGE_NAMES[state.stage], hits: state.hits, best: state.best }));
  }
  function resetGame() {
    impacts.length = 0;
    Object.assign(state, { score: 0, combo: 0, hits: 0, lastHit: -1e9, running: false, over: false, timeLeft: P.roundTime });
    setStage(1, true); state.stage = 1; swell.target = 0; look.happyTarget = 0; hurtUntil = 0;
  }
  let now = 0, hurtUntil = 0, shakeAmp = 0;

  // 真正的打一巴掌：localPoint＝頭上的點（頭的座標）、hand＝'right'|'left'、strength 0~1
  function slapLocal(localPoint, hand, strength = 0.7) {
    if (!P.external && state.over) return null;          // 結算後就不能再打
    strength = Math.max(0.05, Math.min(1, strength));
    if (!P.external && !state.running) { state.running = true; state.timeLeft = P.roundTime; }
    const n = gradAt(localPoint.x, localPoint.y, localPoint.z, new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(up, n); if (u.lengthSq() < 1e-4) u.set(1, 0, 0); u.normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    const tilt = P.handTilt * Math.PI / 180;
    const imp = {
      c: localPoint.clone(), n, u, v, S: P.handSize, mirror: hand === 'left', ct: Math.cos(tilt), st: Math.sin(tilt),
      strength, t: 0, x: 0, vel: 0, released: false,
    };
    prepareImpact(imp);
    impacts.push(imp);
    while (impacts.length > P.maxPrints) impacts.shift();

    // 頭的反應：右手打（青蛙左臉，在 +x）→ 臉被推向 -x
    const side = localPoint.x >= 0 ? 1 : -1;
    const wK = 2 * Math.PI * 1.5;
    const happy = state.stage >= 3;
    // 階段 3：被打很開心 → 不太躲，反而把臉湊過去、開心地跳一下
    const kf = happy ? -0.35 : 1;
    yaw.v += -side * kf * (P.knock * Math.PI / 180) * strength * wK * 1.4;
    roll.v += side * kf * (P.knock * 0.35 * Math.PI / 180) * strength * wK * 1.4;
    if (happy) { shiver.v += P.shiver * (0.5 + strength) * 2 * Math.PI * P.shiverFreq * 0.9; heartPulse.v += 5 + 6 * strength; }   // 開心到上下伸縮顫抖
    if (state.stage >= 2) swell.target = Math.min(P.swellMax, swell.target + P.swellPerHit * (0.5 + strength));
    slide.v += -side * 0.12 * strength * wK * 1.4;
    squash.v += P.squash * strength * 2 * Math.PI * 2.2 * 1.6;
    shakeAmp = Math.max(shakeAmp, P.shake * strength);
    hurtUntil = now + P.faceTime * (0.6 + 0.6 * strength);

    // 特效位置（世界座標）
    head.updateWorldMatrix(true, false);
    const wp = head.localToWorld(localPoint.clone());
    const wn = n.clone().transformDirection(head.matrixWorld);
    spawnFx(wp, wn, strength, happy);

    const sp = wp.clone().project(camera), rect = renderer.domElement.getBoundingClientRect();
    if (P.external) {                                    // 外部遊戲自己計分：只回報打在畫面哪裡
      const ev = { hand, cheek: side > 0 ? 'left' : 'right', strength,
        x: (sp.x + 1) / 2 * rect.width, y: (1 - sp.y) / 2 * rect.height,
        screenX: rect.left + (sp.x + 1) / 2 * rect.width, screenY: rect.top + (1 - sp.y) / 2 * rect.height };
      listeners.forEach((f) => f(ev));
      return ev;
    }
    // 計分＋連擊
    state.combo = now - state.lastHit <= P.comboWindow ? state.combo + 1 : 1;
    state.lastHit = now; state.hits++;
    const mult = Math.min(state.combo, P.comboMax);
    const points = Math.round(10 + 40 * strength) * mult;
    state.score += points; state.best = Math.max(state.best, state.score);
    const ev = { hand, cheek: side > 0 ? 'left' : 'right', strength, points, mult, score: state.score, combo: state.combo, best: state.best, stage: state.stage,
      screenX: rect.left + (sp.x + 1) / 2 * rect.width, screenY: rect.top + (1 - sp.y) / 2 * rect.height };
    listeners.forEach((f) => f(ev));
    if (state.stage < 2 && state.score >= P.stage2At) setStage(2);
    if (state.stage < 3 && state.score >= P.stage3At) setStage(3);
    return ev;
  }
  // 用「哪隻手＋高度」打：右手→青蛙左臉（+x）、左手→青蛙右臉（-x）。y：0＝最上 1＝最下
  function slapHand(hand, strength = 0.7, y = 0.5) {
    const side = hand === 'right' ? 1 : -1;
    const az = 52 * Math.PI / 180, el = (22 - 50 * Math.max(0, Math.min(1, y))) * Math.PI / 180;
    const p = surfaceAlong(side * Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), [0, 2, 0]);
    return slapLocal(p, hand, strength);
  }

  // ---------- 滑鼠／觸控 ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(head, false)[0];
    return hit ? head.worldToLocal(hit.point.clone()) : null;
  }
  let drag = null, swiped = false;
  const onDown = (e) => { if (P.allowOrbit) return; drag = { x: e.clientX, y: e.clientY, t: performance.now(), sx: e.clientX, sy: e.clientY }; swiped = false; };
  const onMove = (e) => {
    if (!drag || swiped) return;
    const t = performance.now(), dt = Math.max(1, t - drag.t) / 1000;
    const w = renderer.domElement.clientWidth || 1;
    const speed = Math.hypot(e.clientX - drag.x, e.clientY - drag.y) / w / dt;   // 每秒幾個畫面寬
    drag.x = e.clientX; drag.y = e.clientY; drag.t = t;
    if (speed > 1.2) {
      const p = pick(e);
      if (p) { swiped = true; slapLocal(p, p.x >= 0 ? 'right' : 'left', Math.min(1, 0.3 + (speed - 1.2) / 4)); }
    }
  };
  const onUp = (e) => {
    if (drag && !swiped && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) {
      const p = pick(e); if (p) slapLocal(p, p.x >= 0 ? 'right' : 'left', P.clickStrength);
    }
    drag = null;
  };
  if (!P.external) {                                     // 外部遊戲用鏡頭打，不接滑鼠
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // 玻璃顏色：萊姆綠 → 粉紅（階段 3）
  const cA = new THREE.Color(), cB = new THREE.Color(), cTmp = new THREE.Color(), rimA = new THREE.Color('#e6ffb0'), rimB = new THREE.Color('#ffe0f0');
  function applyLook() {
    const k = look.happy;
    cA.set(P.glassTint); cB.set(P.happyTint); cTmp.copy(cA).lerp(cB, k);
    glassMat.color.copy(cTmp); glassMat.attenuationColor.copy(cTmp); glassMat.emissive.copy(cTmp);
    rim.material.uniforms.color.value.copy(rimA).lerp(rimB, k);
    flushU.value.set(P.flushColor).lerp(cTmp.set('#e0207a'), k * 0.8);   // 粉紅玻璃上掌印改深一點才看得到
  }

  // ---------- 參數更新 ----------
  function applyParams() {
    glassMat.emissiveIntensity = P.glow; glassMat.thickness = P.thickness;
    flushAmtU.value = P.flushAmount; heartMat.color.set(P.heartColor); heartMat.emissive.set(P.heartColor);
    if (!state.running) state.timeLeft = P.roundTime;
    applyLook();
    controls.enableRotate = !!P.allowOrbit; controls.autoRotate = !!P.autoRotate;
    if (P.background !== 'none') scene.add(bg); else scene.remove(bg);
    buildHand();
  }
  applyParams();

  // 滑鼠在畫面上的位置（以青蛙為中心，-1～1），給 lookAtPointer 用
  const look2 = { x: 0, y: 0 };
  const onLook = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    look2.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
    look2.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
  };
  if (P.lookAtPointer) window.addEventListener('pointermove', onLook);

  // ---------- 每一格 ----------
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(container);
  const clock = new THREE.Clock();
  let wasDeforming = false;
  const pa = posAttr.array, na = nrmAttr.array;

  function stepImpacts(dt) {
    const w = 2 * Math.PI * 0.5 * P.recoverSpeed, z = 1 - 0.9 * Math.max(0, Math.min(1, P.bounce));
    for (let i = impacts.length - 1; i >= 0; i--) {
      const m = impacts[i]; m.t += dt;
      const target = P.dentDepth * m.strength;
      if (m.t < P.pressTime) { m.x = target * (1 - (1 - m.t / P.pressTime) ** 3); m.vel = 0; }       // 快速凹下去
      else if (m.t < P.pressTime + P.holdTime) { m.x = target; m.vel = 0; }                           // 停一下
      else { for (let k = 0; k < 4; k++) stepSpring2(m, dt / 4, w, z); }                              // 彈回來（會稍微凸出再晃）
      const ft = m.t - P.pressTime - P.holdTime;
      m.flush = Math.min(1, 0.55 + 0.6 * m.strength) * (ft < 0 ? 1 : Math.max(0, 1 - ft / P.flushTime) ** 1.4);
      if (ft > 0.3 && Math.abs(m.x) < 2e-4 && Math.abs(m.vel) < 2e-3 && m.flush <= 0) impacts.splice(i, 1);
    }
  }
  function stepSpring2(m, dt, w, z) { const a = -w * w * m.x - 2 * z * w * m.vel; m.vel += a * dt; m.x += m.vel * dt; }

  function deform() {
    const swellMoving = Math.abs(swell.shown - swell.applied) > 1e-5 || Math.abs(swell.blushShown - swell.blushApplied) > 1e-4;
    const active = impacts.length > 0 || swellMoving;
    if (!active && !wasDeforming) return;
    swell.applied = swell.shown; swell.blushApplied = swell.blushShown;
    const sw = swell.shown, bl = swell.blushShown;
    for (let i = 0; i < VCOUNT; i++) {
      const k = sw * swellW[i], j = i * 3;
      pa[j] = basePos[j] + baseNrm[j] * k; pa[j + 1] = basePos[j + 1] + baseNrm[j + 1] * k; pa[j + 2] = basePos[j + 2] + baseNrm[j + 2] * k;
      flushArr[i] = bl * swellW[i];
    }
    for (const m of impacts) {
      const { idx, w, f, n } = m, amt = m.x, fl = m.flush;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k] * 3, d = amt * w[k];
        pa[i] -= n.x * d; pa[i + 1] -= n.y * d; pa[i + 2] -= n.z * d;
        flushArr[idx[k]] += fl * f[k];
      }
    }
    for (let i = 0; i < VCOUNT; i++) if (flushArr[i] > 1) flushArr[i] = 1;
    if (active || sw > 0) headGeo.computeVertexNormals(); else na.set(baseNrm);
    posAttr.needsUpdate = true; nrmAttr.needsUpdate = true; headGeo.attributes.aFlush.needsUpdate = true;
    // 五官跟著凹
    decor.forEach((d, di) => {
      const a = d.geo.attributes.position.array; a.set(d.base);
      for (const m of impacts) {
        const { idx, w } = m.decor[di];
        for (let k = 0; k < idx.length; k++) { const i = idx[k] * 3, dd = m.x * w[k]; a[i] -= m.n.x * dd; a[i + 1] -= m.n.y * dd; a[i + 2] -= m.n.z * dd; }
      }
      d.geo.attributes.position.needsUpdate = true;
    });
    anchored.forEach((p, pi) => {
      p.position.copy(p.userData.base);
      for (const m of impacts) p.position.addScaledVector(m.n, -m.x * m.pearl[pi]);
    });
    wasDeforming = active;
  }

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    now += dt;
    if (!visible) return;
    // 回合計時
    if (state.running && !state.over && P.roundTime > 0) { state.timeLeft = Math.max(0, state.timeLeft - dt); if (state.timeLeft <= 0) finish(); }
    // 臉頰腫脹、粉紅、玻璃變色都慢慢過渡
    swell.shown += (swell.target - swell.shown) * Math.min(1, dt * 6);
    if (Math.abs(swell.target - swell.shown) < 1e-5) swell.shown = swell.target;
    const blushT = state.stage >= 2 ? P.blush : 0;
    swell.blushShown += (blushT - swell.blushShown) * Math.min(1, dt * 3);
    if (Math.abs(blushT - swell.blushShown) < 1e-4) swell.blushShown = blushT;
    look.happy += (look.happyTarget - look.happy) * Math.min(1, dt * 2.2);
    applyLook();
    stepImpacts(dt);
    deform();
    // 頭整體的果凍晃動
    const wz = 1 - 0.85 * Math.max(0, Math.min(1, P.wobble));
    for (let k = 0; k < 4; k++) {
      const h = dt / 4;
      stepSpring(yaw, h, 2 * Math.PI * 1.5, wz); stepSpring(roll, h, 2 * Math.PI * 1.5, wz);
      stepSpring(slide, h, 2 * Math.PI * 1.5, wz); stepSpring(squash, h, 2 * Math.PI * 2.2, wz);
    }
    for (let k = 0; k < 8; k++) {
      const h = dt / 8;
      stepSpring(hop, h, 2 * Math.PI * 1.8, 0.25); stepSpring(heartPulse, h, 2 * Math.PI * 2.4, 0.22);
      stepSpring(shiver, h, 2 * Math.PI * P.shiverFreq, P.shiverDamp);
    }
    pivot.rotation.set(0, yaw.x, roll.x);
    pivot.position.x = slide.x; pivot.position.y = NECK_Y + hop.x * 0.12;
    const breathe = Math.sin(now * 2.1) * 0.008;
    const sq = Math.max(-0.35, Math.min(0.35, squash.x)) + breathe;
    const sv = Math.max(-0.4, Math.min(0.4, shiver.x));                 // 上下伸縮：變高時變瘦、變矮時變胖
    pivot.scale.set((1 - sq) * (1 - sv * 0.5), (1 + sq * 0.6) * (1 + sv), (1 + sq * 0.5) * (1 - sv * 0.5));
    root.position.y = Math.sin(now * 1.2) * 0.04;
    if (P.lookAtPointer) {                                 // 慢慢轉頭看滑鼠
      root.rotation.y += (look2.x * 0.55 - root.rotation.y) * Math.min(1, dt * 5);
      root.rotation.x += (look2.y * 0.3 - root.rotation.x) * Math.min(1, dt * 5);
    }

    // 痛的表情
    // 表情：依階段和「剛被打」決定顯示哪組五官
    const hurt = now < hurtUntil, st = state.stage, happyFace = look.happy > 0.5;
    pearls.forEach((p) => (p.visible = !happyFace && !hurt));
    mouth.mesh.visible = !happyFace && !hurt;
    hurtEyes.forEach((d) => (d.mesh.visible = !happyFace && hurt && st === 1));
    dizzyEyes.forEach((d) => (d.mesh.visible = !happyFace && hurt && st >= 2));
    hurtMouth.mesh.visible = !happyFace && hurt;
    hearts.forEach((h) => { h.visible = happyFace; h.scale.setScalar(0.15 * (1 + Math.max(-0.3, heartPulse.x * 0.12)) * (1 + 0.04 * Math.sin(now * 6))); });
    smile.mesh.visible = happyFace && !hurt;
    bigSmile.mesh.visible = happyFace && hurt;

    stepFx(dt);
    controls.update();
    // 畫面震動
    shakeAmp *= Math.exp(-dt * 9);
    const sx = (Math.random() - 0.5) * shakeAmp, sy = (Math.random() - 0.5) * shakeAmp;
    camera.position.x += sx; camera.position.y += sy;
    if (bg.parent) {
      const dir = tmpV.subVectors(controls.target, camera.position).normalize();
      bg.position.copy(controls.target).addScaledVector(dir, 2.4); bg.quaternion.copy(camera.quaternion);
      if (bg.userData.isVideo) {                       // 影片剛好撐滿整個畫面
        const d = camera.position.distanceTo(bg.position), h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        bg.scale.set(h * camera.aspect * 1.02, h * 1.02, 1);
      }
    }
    renderer.render(scene, camera);
    camera.position.x -= sx; camera.position.y -= sy;
  });

  // 青蛙頭在畫面上的範圍（以容器左上角為原點的像素），給外部做打擊判定
  headGeo.computeBoundingBox();
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  function screenRect() {
    const b = headGeo.boundingBox, r = renderer.domElement.getBoundingClientRect();
    head.updateWorldMatrix(true, false);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    corners.forEach((c, i) => {
      c.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z * 0.4 : b.min.z * 0.4)
        .applyMatrix4(head.matrixWorld).project(camera);
      const x = (c.x + 1) / 2 * r.width, y = (1 - c.y) / 2 * r.height;
      x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y);
    });
    return { x1, y1, x2, y2 };
  }

  return {
    params: P, state, applyParams, screenRect, setBgTint,
    slapHand,
    slapAt(clientX, clientY, strength = P.clickStrength) { const p = pick({ clientX, clientY }); return p ? slapLocal(p, p.x >= 0 ? 'right' : 'left', strength) : null; },
    randomSlap() { return slapHand(Math.random() < 0.5 ? 'left' : 'right', 0.35 + Math.random() * 0.65, 0.2 + Math.random() * 0.6); },
    onSlap(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
    onStage(fn) { stageListeners.push(fn); },             // 換階段：{ stage, name, score }
    onFinish(fn) { finishListeners.push(fn); },           // 回合結束：{ score, stage, stageName, hits, best }
    setStage(n) { setStage(n); },                         // 測試用：直接跳階段
    finish, resetGame,
    resetScore: resetGame,
    resetView() { camera.position.copy(CAM0); controls.target.copy(TGT0); controls.update(); },
    debug: { camera, controls, scene, head, impacts },
    dispose() {
      renderer.setAnimationLoop(null); ro.disconnect(); io.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp); window.removeEventListener('pointermove', onLook); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
