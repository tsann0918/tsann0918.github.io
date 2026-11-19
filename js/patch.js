// ===== 四層青蛙貼布（共用）=====
// 由正面往背面：白色霧面外層 → 綠色透明凸點層 → 藍色透明電路層 → 白色霧面底層
// 單位：公尺。貼布平面在 XY，正面朝 +Z。
// opt.transparentBackground = true：3D 畫布背景透明、讓網站背景透出時使用
function makeFourLayerPatch(THREE, RoundedBoxGeometry, opt = {}) {
  const W = 0.1, H = 0.14, CORNER = 0.006;
  const L = {                        // 各層厚度與組合時的位置（中心 z）
    w1: { t: 0.00035, z: 0.00205 },
    g:  { t: 0.0005,  z: 0.00055 },  // 凸起在綠層正面，高約 1.1 mm，所以 w1 留空隙
    b:  { t: 0.0005,  z: -0.00015 },
    w2: { t: 0.00035, z: -0.00075 },
  };

  // ---- 圓角長方形薄片 ----
  function slab(t) {
    const s = new THREE.Shape(), w = W / 2, h = H / 2, r = CORNER;
    s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
    s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
    s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.25,
      bevelSize: t * 0.25, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -t / 2);
    // 讓正面 UV 對應 0~1（給電路貼圖用）
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w) / W, (p.getY(i) + h) / H);
    return g;
  }

  // ---- 藍色層的電路板紋路（程式產生，固定亂數種子）----
  function circuitTexture() {
    const cw = 1000, ch = 1400, c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const x = c.getContext('2d');
    x.fillStyle = '#a6ecfa'; x.fillRect(0, 0, cw, ch);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const G = 25, dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const used = new Set(), key = (a, b) => a + ',' + b;
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (let n = 0; n < 150; n++) {
      let gx = Math.floor(rnd() * (cw / G - 4)) + 2, gy = Math.floor(rnd() * (ch / G - 4)) + 2;
      if (used.has(key(gx, gy))) continue;
      let d = Math.floor(rnd() * 4) * 2, len = 6 + Math.floor(rnd() * 22);
      const pts = [[gx, gy]];
      for (let i = 0; i < len; i++) {
        if (rnd() < 0.18) d = (d + (rnd() < 0.5 ? 1 : 7)) % 8;          // 45° 轉彎
        const nx = gx + dirs[d][0], ny = gy + dirs[d][1];
        if (nx < 2 || ny < 2 || nx > cw / G - 2 || ny > ch / G - 2 || used.has(key(nx, ny))) break;
        gx = nx; gy = ny; pts.push([gx, gy]); used.add(key(gx, gy));
      }
      if (pts.length < 3) continue;
      const wide = rnd() < 0.25;
      x.strokeStyle = '#1596c4'; x.lineWidth = wide ? 7 : 4;
      x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a * G, b * G) : x.moveTo(a * G, b * G))); x.stroke();
      for (const [a, b] of [pts[0], pts[pts.length - 1]]) {               // 兩端的焊點
        x.fillStyle = '#1596c4'; x.beginPath(); x.arc(a * G, b * G, wide ? 11 : 8, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#eafdff'; x.beginPath(); x.arc(a * G, b * G, wide ? 5 : 3.5, 0, Math.PI * 2); x.fill();
      }
    }
    // 中央晶片
    x.strokeStyle = '#1596c4'; x.lineWidth = 6; x.strokeRect(cw / 2 - 110, ch / 2 - 110, 220, 220);
    x.fillStyle = '#8fe2f5'; x.fillRect(cw / 2 - 104, ch / 2 - 104, 208, 208);
    x.fillStyle = '#1596c4'; x.font = 'bold 150px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('F', cw / 2, ch / 2 + 8);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  const circuit = circuitTexture();
  const M = {
    white: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.55, transparent: true, opacity: 0.58,
      depthWrite: false, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }),
    green: new THREE.MeshPhysicalMaterial({ color: '#c4f46a', roughness: 0.12, transparent: true, opacity: 0.5,
      clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 1 }),
    // 畫布背景透明（疊在網站背景上）時不能用 transmission，改用一般半透明
    blue: opt.transparentBackground
      ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: circuit, bumpMap: circuit, bumpScale: 1.2,
          transparent: true, opacity: 0.8, roughness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.08 })
      : new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: circuit, bumpMap: circuit, bumpScale: 1.2,
          transmission: 0.4, thickness: 0.0005, ior: 1.4, roughness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.08 }),
  };

  const group = new THREE.Group();
  const layers = {};
  const mk = (name, mat, t) => {
    const m = new THREE.Mesh(slab(t), mat); m.name = name;
    const holder = new THREE.Group(); holder.name = name; holder.add(m); group.add(holder);
    layers[name] = holder; return holder;
  };
  mk('w1', M.white, L.w1.t);
  const g = mk('g', M.green, L.g.t);
  mk('b', M.blue, L.b.t);
  mk('w2', M.white, L.w2.t);

  // 綠色層：交錯蜂巢排列的凸起
  const R = 0.0016, A = 0.0062, DY = A * 0.866, MARGIN = 0.0055;
  const dome = new THREE.SphereGeometry(R, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.rotateX(Math.PI / 2); dome.scale(1, 1, 0.65);
  const spots = [];
  for (let r = 0, y = -H / 2 + MARGIN; y <= H / 2 - MARGIN + 1e-6; r++, y += DY)
    for (let xx = -W / 2 + MARGIN + (r % 2 ? A / 2 : 0); xx <= W / 2 - MARGIN + 1e-6; xx += A) spots.push([xx, y]);
  M.bump = M.green.clone(); M.bump.opacity = 0.85; M.bump.color.set('#ffffff');   // 顏色由每顆凸起自己決定（可做發光）
  const bumps = new THREE.InstancedMesh(dome, M.bump, spots.length);
  const BUMP_BASE = new THREE.Color('#b8ef55');
  const mtx = new THREE.Matrix4();
  spots.forEach(([a, b], i) => bumps.setMatrixAt(i, mtx.makeTranslation(a, b, L.g.t / 2)));
  spots.forEach((_, i) => bumps.setColorAt(i, BUMP_BASE));
  g.add(bumps);

  // 分解：e = 0 組合、1 完全分開；gap = 完全分開時相鄰兩層的距離
  const order = ['w1', 'g', 'b', 'w2'];
  function setExplode(e, gap = 0.035) {
    order.forEach((n, i) => { layers[n].position.z = L[n].z + (1.5 - i) * gap * e; });
  }
  setExplode(0);
  return { group, layers, setExplode, materials: M, bumps, spots, BUMP_BASE, size: { W, H, T: 0.0035 } };
}

export { makeFourLayerPatch };
