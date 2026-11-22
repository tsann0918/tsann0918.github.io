// ===== 青蛙頭造型（共用）=====
// 造型沿用「青蛙頭 3D（液態玻璃）」：橢圓球（頭）＋兩顆圓球（眼睛凸起）平滑融合，
// 再放兩顆白色眼珠和一條海鷗形嘴巴。單位：原 icon 像素 ÷ 100。
// riskFrogs.js（25 顆）和 riskStats.js（三顆裝液體的大頭）都從這裡拿模型。
import * as THREE from "three";

export const G = {
  base: { c: [0, 0, 0], r: [87, 69, 48] },                          // 頭：橢圓球
  bumps: [{ c: [-40, 51, 6], r: 32 }, { c: [40, 51, 6], r: 32 }],  // 眼睛凸起
  smooth: 12,                                                        // 融合圓滑度
  pearls: [{ c: [-40, 61, 28], r: 12 }, { c: [40, 61, 28], r: 12 }],// 眼珠
  mouth: [[-23, 38.5], [-14, 37], [-7, 33.5], [-2, 29], [0, 25], [2, 29], [7, 33.5], [14, 37], [23, 38.5]],
  mouthR: 1.8,
};
// 頭的上下範圍（÷100 之後）：下緣 -0.69、上緣（眼睛凸起頂端）0.83
export const HEAD_BOTTOM = -0.69;
export const HEAD_TOP = 0.83;

// 有號距離函數：<0 在裡面、>0 在外面
const sdEll = (x, y, z, c, r) => {
  const qx = (x - c[0]) / r[0], qy = (y - c[1]) / r[1], qz = (z - c[2]) / r[2];
  const k0 = Math.hypot(qx, qy, qz);
  const k1 = Math.hypot((x - c[0]) / (r[0] * r[0]), (y - c[1]) / (r[1] * r[1]), (z - c[2]) / (r[2] * r[2]));
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-9);
};
const sdSph = (x, y, z, c, r) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
const smin = (a, b, k) => { const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k)); return b * (1 - h) + a * h - k * h * (1 - h); };
const sdHead = (x, y, z) => {
  let d = sdEll(x, y, z, G.base.c, G.base.r);
  for (const b of G.bumps) d = smin(d, sdSph(x, y, z, b.c, b.r), G.smooth);
  return d;
};

// 把一顆細分的球「縮」到距離函數的表面上；inset＞0 時往內縮（給液體用，比玻璃小一圈）
export function buildHeadGeometry(widthSeg = 96, heightSeg = 68, inset = 0) {
  const g = new THREE.SphereGeometry(1, widthSeg, heightSeg);
  const p = g.attributes.position, O = [0, 18, 0];
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    let t = 170;
    for (; t > 0; t -= 1) if (sdHead(O[0] + dx * t, O[1] + dy * t, O[2] + dz * t) < -inset) break;
    let a = t, b = t + 1;                                   // 二分法把表面找準
    for (let k = 0; k < 16; k++) {
      const m = (a + b) / 2;
      if (sdHead(O[0] + dx * m, O[1] + dy * m, O[2] + dz * m) < -inset) a = m; else b = m;
    }
    const tt = (a + b) / 2;
    p.setXYZ(i, (O[0] + dx * tt) / 100, (O[1] + dy * tt) / 100, (O[2] + dz * tt) / 100);
  }
  // 用距離函數的梯度當法線，表面才會平滑
  const n = g.attributes.normal, e = 0.05;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 100, y = p.getY(i) * 100, z = p.getZ(i) * 100;
    const nx = sdHead(x + e, y, z) - sdHead(x - e, y, z), ny = sdHead(x, y + e, z) - sdHead(x, y - e, z), nz = sdHead(x, y, z + e) - sdHead(x, y, z - e);
    const l = Math.hypot(nx, ny, nz) || 1; n.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return g;
}

// 嘴巴：沿著臉的表面
function surfaceZ(x, y) { for (let z = 70; z > -70; z -= 0.25) if (sdHead(x, y, z) < 0) return z; return 0; }
export function buildMouth() {
  const pts = G.mouth.map(([x, y]) => new THREE.Vector3(x / 100, y / 100, (surfaceZ(x, y) + G.mouthR * 0.4) / 100));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.3), 48, G.mouthR / 100, 8);
}

// 菲涅耳亮邊材質（疊在玻璃上，邊緣越斜越亮）
// ortho＝true：給正投影鏡頭用（視線方向固定朝鏡頭）
export function makeRim(color = "#e6ffb0", strength = 0.6, ortho = false) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(color) }, power: { value: 3.2 }, strength: { value: strength }, uOrtho: { value: ortho ? 1 : 0 } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 color; uniform float power, strength, uOrtho; varying vec3 vN; varying vec3 vV; void main(){ vec3 V = mix(normalize(vV), vec3(0., 0., 1.), uOrtho); float f = pow(1. - max(dot(normalize(vN), V), 0.), power); gl_FragColor = vec4(color * f * strength, 1.); }",
  });
}

// 萊姆綠漸層邊框光（給白底用）：邊緣越斜越明顯，顏色由下往上從萊姆綠漸淡；
// 用一般混色（不是相加），白底上才看得到
export function makeLimeEdge({ bottom = "#b6f04a", top = "#e9ffc2", strength = 0.55, power = 2.6 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      cBot: { value: new THREE.Color(bottom) }, cTop: { value: new THREE.Color(top) },
      strength: { value: strength }, power: { value: power },
      yMin: { value: HEAD_BOTTOM }, yMax: { value: HEAD_TOP },
    },
    vertexShader: "varying vec3 vN; varying float vY; void main(){ vN = normalize(normalMatrix * normal); vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "uniform vec3 cBot, cTop; uniform float strength, power, yMin, yMax; varying vec3 vN; varying float vY; void main(){ float f = pow(1. - abs(normalize(vN).z), power); float t = smoothstep(yMin, yMax, vY); gl_FragColor = vec4(mix(cBot, cTop, t), f * strength * mix(1.0, 0.55, t)); }",
  });
}
