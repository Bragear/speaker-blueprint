import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeProj, finalizeFrame, radiusScale, resolvePreset } from 'thinking-orbs/engine';

// ---- parts: Blender object names, explode direction (glTF space: +Z = front) and copy
const PARTS = [
  { name: 'grille',    no: 1, label: 'GRILLE',        dir: [0, 0, 0.42],     material: 'Cloth on MDF frame', dim: '180 × 300 × 12', fact: 'A frame of stretched cloth. It hides the drivers and does almost nothing to the sound.' },
  { name: 'baffle',    no: 2, label: 'FRONT BAFFLE',  dir: [0, 0, 0.26],     material: 'MDF, 25 mm',        dim: '180 × 300 × 25', fact: 'The thick front plate that holds both drivers. Stiff, so it does not sing along with them.' },
  { name: 'woofer',    no: 3, label: 'WOOFER Ø130',   dir: [0, -0.04, 0.14], material: 'Paper cone, steel', dim: 'Ø 130',           fact: 'Moves the air for bass and mids. The cone pumps back and forth up to a hundred times a second.' },
  { name: 'tweeter',   no: 4, label: 'TWEETER Ø25',   dir: [0, 0.06, 0.14],  material: 'Silk dome',        dim: 'Ø 25',            fact: 'A tiny dome for the high notes, up to 20 000 Hz. Fast and light.' },
  { name: 'port',      no: 5, label: 'BASS PORT',     dir: [0, 0.08, -0.22], material: 'ABS tube',          dim: 'Ø 40 × 120',      fact: 'A tube tuned to one note. The air in it resonates and adds low bass the woofer cannot make alone.' },
  { name: 'crossover', no: 6, label: 'CROSSOVER',     dir: [-0.2, -0.06, 0], material: 'PCB, coils, caps', dim: '90 × 60',         fact: 'A small circuit board that splits the signal: lows to the woofer, highs to the tweeter.' },
  { name: 'terminal',  no: 7, label: 'TERMINAL CUP',  dir: [0, -0.04, -0.3], material: 'ABS, brass',       dim: '60 × 90',         fact: 'Where the speaker cable connects. Red and black, so you get the two speakers in step.' },
  { name: 'cabinet',   no: 8, label: 'CABINET',       dir: [0, 0, 0], labelDir: [0, -1], material: 'MDF, 18 mm', dim: '180 × 300 × 240', fact: 'A sealed box of MDF. Its volume sets how deep the bass goes.' },
];
const STEP = 1 / PARTS.length;

// ---- styles: a revision letter each. Blueprint is the default.
const STYLES = {
  A: { name: 'BLUEPRINT', key: 'blueprint' },
  B: { name: 'STUDIO',    key: 'studio' },
  C: { name: 'ZINE',      key: 'zine' },
  D: { name: 'ARCADE',    key: 'arcade' },
};
const STUDIO = { grille: ['#232323', 0.95, 0], baffle: ['#151515', 0.5, 0], woofer: ['#d9c7a0', 0.85, 0], tweeter: ['#e8e4da', 0.35, 0.1], port: ['#141414', 0.4, 0], crossover: ['#1f5a2a', 0.6, 0.1], terminal: ['#b08d3c', 0.35, 0.9], cabinet: ['#111111', 0.62, 0] };
const ZINE = { grille: '#111111', baffle: '#e8ff00', woofer: '#ffffff', tweeter: '#00e5ff', port: '#e8ff00', crossover: '#00e5ff', terminal: '#ff2e88', cabinet: '#ff2e88' };
const ARCADE = { grille: '#0f380f', baffle: '#306230', woofer: '#8bac0f', tweeter: '#0f380f', port: '#306230', crossover: '#8bac0f', terminal: '#0f380f', cabinet: '#306230' };
let current = 'A';

// ---- renderer, scene, lights
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.01, 50);

const rig = new THREE.Group();      // user rotation
const model = new THREE.Group();    // loaded parts
rig.add(model);
scene.add(rig);

const hemi = new THREE.HemisphereLight('#ffffff', '#303030', 0.9);
const key = new THREE.DirectionalLight('#fff4e6', 1.3);
key.position.set(1.2, 2.2, 1.6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -0.9, right: 0.9, top: 0.9, bottom: -0.9, near: 0.1, far: 8 });
key.shadow.radius = 4;
const fillLight = new THREE.DirectionalLight('#dfe8ff', 0.5);
fillLight.position.set(-2, 1, -1);
scene.add(hemi, key, fillLight);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.22 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.2; floor.receiveShadow = true; floor.visible = false;
scene.add(floor);
let envTex = null;
function env() {
  if (!envTex) { const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
  return envTex;
}

// ---- materials
const fillMat = new THREE.ShaderMaterial({ // blueprint: translucent fill with a white rim
  transparent: true, depthWrite: false,
  uniforms: { uFill: { value: new THREE.Color('#1d57a8') }, uRim: { value: new THREE.Color('#eef3ff') }, uOpacity: { value: 0.42 } },
  vertexShader: `varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uFill; uniform vec3 uRim; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
    void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(mix(uFill, uRim, f * 0.9), uOpacity + f * 0.45); }`,
});
const edgeMat = new THREE.LineBasicMaterial({ color: '#eef3ff', transparent: true, opacity: 0.85 });
const edgeMatHover = new THREE.LineBasicMaterial({ color: '#ffffff' });
const edgeMatActive = new THREE.LineBasicMaterial({ color: '#ff5a3c' });
// blueprint hidden lines: a depth-only pass records what is in front, then dashed edges draw only where they are behind it
const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const dashed = (color, opacity) => new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.01, gapSize: 0.006, depthFunc: THREE.GreaterDepth, depthWrite: false });
const hiddenMat = dashed('#eef3ff', 0.42), hiddenMatHover = dashed('#ffffff', 0.6), hiddenMatActive = dashed('#ff5a3c', 0.8);
const hiddenMats = [hiddenMat, hiddenMatHover, hiddenMatActive];
// EdgesGeometry hands back loose segments; chain them into polylines so dashes run continuously around rims and along edges
function chainDistances(geo) {
  const pos = geo.attributes.position.array, n = pos.length / 3, segs = n / 2;
  const key = (i) => `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`;
  const at = new Map();
  for (let v = 0; v < n; v++) { const k = key(v); if (!at.has(k)) at.set(k, []); at.get(k).push(v >> 1); }
  const len = (sg) => Math.hypot(pos[sg * 6] - pos[sg * 6 + 3], pos[sg * 6 + 1] - pos[sg * 6 + 4], pos[sg * 6 + 2] - pos[sg * 6 + 5]);
  const other = (sg, v) => (sg * 2 === v ? sg * 2 + 1 : sg * 2);
  const next = (sg, v) => { const list = at.get(key(v)); return list.length === 2 ? list.find((t) => t !== sg) : -1; };
  const touching = (sg, v) => (key(sg * 2) === key(v) ? sg * 2 : sg * 2 + 1);
  const dist = new Float32Array(n), done = new Uint8Array(segs);
  for (let s0 = 0; s0 < segs; s0++) {
    if (done[s0]) continue;
    let sg = s0, v = s0 * 2, guard = 0; // walk back to the chain's free end (or round a loop)
    while (guard++ < segs) { const q = next(sg, v); if (q < 0 || q === s0 || done[q]) break; v = other(q, touching(q, v)); sg = q; }
    let d = 0, cur = sg, head = v; guard = 0; // then forward, accumulating length
    while (cur >= 0 && !done[cur] && guard++ < segs) {
      const tail = other(cur, head);
      dist[head] = d; d += len(cur); dist[tail] = d; done[cur] = 1;
      const q = next(cur, tail); if (q < 0) break;
      head = touching(q, tail); cur = q;
    }
  }
  geo.setAttribute('lineDistance', new THREE.BufferAttribute(dist, 1));
}
const zineEdge = new THREE.LineBasicMaterial({ color: '#111111' });
const arcadeEdge = new THREE.LineBasicMaterial({ color: '#0f380f' });
function gradient(steps) {
  const t = new THREE.DataTexture(new Uint8Array(steps.map((v) => Math.round(v * 255))), steps.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
const toon3 = gradient([0.35, 0.7, 1]), toon2 = gradient([0.55, 1]);
const arcadeHover = new THREE.MeshToonMaterial({ color: '#9bbc0f', gradientMap: toon2 });
const arcadeActive = new THREE.MeshToonMaterial({ color: '#0f380f', gradientMap: toon2 });
const hullShader = { // zine: thick ink outline, drawn as an inflated back-facing shell
  side: THREE.BackSide,
  uniforms: { uColor: { value: new THREE.Color('#111111') }, uWidth: { value: 0.0045 } },
  vertexShader: `uniform float uWidth; void main(){ vec3 p = position + normal * uWidth; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
};
const haloShader = { // zine: the white die-cut border, a fatter shell behind the ink one
  side: THREE.BackSide,
  uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uWidth: { value: 0.013 } },
  vertexShader: hullShader.vertexShader, fragmentShader: hullShader.fragmentShader,
};
const stickerShadow = new THREE.ShaderMaterial({ // zine: the die-cut shape shifted on screen and drawn under everything, as a hard shadow
  side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  uniforms: { uColor: { value: new THREE.Color('#111111') }, uWidth: { value: 0.013 }, uOffset: { value: new THREE.Vector2(0, 0) } },
  vertexShader: `uniform float uWidth; uniform vec2 uOffset; void main(){ vec3 p = position + normal * uWidth; vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0); c.xy += uOffset * c.w; gl_Position = c; }`,
  fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
});

const parts = []; // { cfg, obj, mesh, base, edges, hidden, depth, hull, halo, shadow, dir, mats, r, lift }

const loader = new GLTFLoader();
loader.load('model/speaker.glb', (gltf) => {
  const root = gltf.scene;
  model.add(root);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const cfg = PARTS.find((p) => p.name === o.name || p.name === o.parent?.name);
    if (!cfg || parts.find((p) => p.cfg === cfg)) return;
    const target = o.name === cfg.name ? o : o.parent;
    o.castShadow = true;
    o.material = fillMat;
    o.renderOrder = 1;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), edgeMat);
    edges.renderOrder = 2;
    o.add(edges);
    chainDistances(edges.geometry);
    const hidden = new THREE.LineSegments(edges.geometry, hiddenMat);
    hidden.renderOrder = 3;
    o.add(hidden);
    const depth = new THREE.Mesh(o.geometry, depthMat);
    depth.renderOrder = -1;
    o.add(depth);
    const hg = o.geometry.clone(); hg.deleteAttribute('normal'); hg.deleteAttribute('uv');
    const smooth = mergeVertices(hg); smooth.computeVertexNormals();
    const hull = new THREE.Mesh(smooth, new THREE.ShaderMaterial({ ...hullShader, uniforms: THREE.UniformsUtils.clone(hullShader.uniforms) }));
    hull.visible = false; hull.renderOrder = 0;
    o.add(hull);
    const halo = new THREE.Mesh(smooth, new THREE.ShaderMaterial({ ...haloShader, uniforms: THREE.UniformsUtils.clone(haloShader.uniforms) }));
    halo.visible = false; halo.renderOrder = 0;
    o.add(halo);
    const shadow = new THREE.Mesh(smooth, stickerShadow);
    shadow.visible = false; shadow.renderOrder = -2;
    o.add(shadow);
    o.geometry.computeBoundingSphere();
    const [sc, rough, metal] = STUDIO[cfg.name];
    const mats = {
      A: fillMat,
      B: new THREE.MeshStandardMaterial({ color: sc, roughness: rough, metalness: metal, emissive: '#ffffff', emissiveIntensity: 0 }),
      C: new THREE.MeshToonMaterial({ color: ZINE[cfg.name], gradientMap: toon3 }),
      D: new THREE.MeshToonMaterial({ color: ARCADE[cfg.name], gradientMap: toon2 }),
    };
    const dir = new THREE.Vector3(...cfg.dir);
    parts.push({ cfg, obj: target, mesh: o, base: target.position.clone(), edges, hidden, depth, hull, halo, shadow, dir, mats, r: o.geometry.boundingSphere.radius, lift: 0,
      liftDir: dir.length() ? dir.clone().normalize() : new THREE.Vector3(0, 1, 0) });
  });
  parts.sort((a, b) => a.cfg.no - b.cfg.no);
  modelRoot = root;
  fitSnap = true;
  buildLabels();
  applyStyle(current);
});

// ---- camera: keep whatever is exploded centred and in frame
let modelRoot = null, fitD = 1, fitSnap = false, fitSnapCount = 0;
const v = new THREE.Vector3(), bb = new THREE.Box3(), bc = new THREE.Vector3(), fitTarget = new THREE.Vector3();
function fitCamera(dt) {
  if (!window.innerWidth || !window.innerHeight) return; // a hidden tab has no size; skip so fitD never goes NaN
  if (modelRoot && parts.length) {
    rig.updateMatrixWorld();
    bb.makeEmpty();
    parts.forEach((p) => { p.obj.getWorldPosition(v); bb.expandByPoint(v); });
    bb.getCenter(bc);
    rig.worldToLocal(bc);
    fitTarget.copy(modelRoot.position).sub(bc);
    modelRoot.position.lerp(fitTarget, fitSnap ? 1 : Math.min(1, dt * 5));
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let extent = 0;
    parts.forEach((p) => {
      p.obj.getWorldPosition(v);
      const ry = p.r / (v.distanceTo(camera.position) * tanV), rx = ry / camera.aspect;
      v.project(camera);
      extent = Math.max(extent, Math.abs(v.x) + rx, Math.abs(v.y) + ry);
    });
    const full = window.innerWidth < window.innerHeight ? 0.94 : window.innerWidth >= 900 ? 0.72 : 0.8;
    const want = THREE.MathUtils.lerp(0.42, full, THREE.MathUtils.smoothstep(eased, 0, 0.15));
    fitD += (fitD * (extent / want) - fitD) * (fitSnap ? 1 : Math.min(1, dt * 4));
    if (fitSnap) { fitSnapCount++; if (fitSnapCount > 6) fitSnap = false; }
  }
  camera.position.set(0, fitD * 0.22, fitD);
  camera.lookAt(0, 0, 0);
}

// ---- scroll → explode
let progress = 0, eased = 0;
const scroller = document.getElementById('scroller');
const opening = document.getElementById('opening');
const hint = document.getElementById('hint');
const tbParts = document.getElementById('tb-parts');
function readScroll() {
  const max = scroller.offsetHeight - window.innerHeight;
  progress = THREE.MathUtils.clamp(window.scrollY / max, 0, 1);
}
window.addEventListener('scroll', readScroll, { passive: true });
function partT(i, p) {
  const start = i * STEP * 0.92, end = start + STEP * 1.1;
  return THREE.MathUtils.smoothstep(p, start, Math.min(end, 1));
}

// ---- rotation: drag sideways to spin, idle auto-turn, a small lean toward the mouse
let rotY = 0.35, rotX = 0.12, velY = 0, dragging = false, lastX = 0, lastY = 0, moved = 0, idleSince = 0;
let mx = 0, my = 0, tiltX = 0, tiltY = 0, mouseSeen = false;
canvas.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; velY = 0; canvas.setPointerCapture(e.pointerId); crosshair.classList.remove('show'); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  moved += Math.abs(dx) + Math.abs(dy);
  rotY += dx * 0.006; velY = dx * 0.006;
  if (e.pointerType === 'mouse') rotX = THREE.MathUtils.clamp(rotX + dy * 0.004, -0.6, 0.8);
  lastX = e.clientX; lastY = e.clientY; idleSince = performance.now();
});
const endDrag = (e) => { if (!dragging) return; dragging = false; idleSince = performance.now(); if (moved < 6) pick(e); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---- mouse layer: crosshair + readout, lean, hover lift
const crosshair = document.getElementById('crosshair');
const chV = crosshair.querySelector('.ch-v'), chH = crosshair.querySelector('.ch-h');
const readout = document.getElementById('readout');
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  mouseSeen = true;
  mx = (e.clientX / window.innerWidth) * 2 - 1; my = (e.clientY / window.innerHeight) * 2 - 1;
  chV.style.transform = `translateX(${e.clientX}px)`; chH.style.transform = `translateY(${e.clientY}px)`;
  readout.textContent = `X ${String(Math.round(e.clientX / 2)).padStart(4, '0')} · Y ${String(Math.round(e.clientY / 2)).padStart(4, '0')}`;
  if (!dragging) crosshair.classList.add('show');
});
document.addEventListener('pointerleave', () => crosshair.classList.remove('show'));
window.addEventListener('blur', () => crosshair.classList.remove('show'));

// ---- labels + leader lines + parts list
const labelsEl = document.getElementById('labels');
const bom = document.getElementById('bom');
const leaders = document.getElementById('leaders');
const NS = 'http://www.w3.org/2000/svg';
function buildLabels() {
  parts.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'label';
    el.innerHTML = `<span class="no">${p.cfg.no}</span><span class="nm">${p.cfg.label}</span>`;
    el.addEventListener('click', () => select(p));
    labelsEl.appendChild(el);
    const row = document.createElement('div');
    row.className = 'bom-row';
    row.innerHTML = `<span>${p.cfg.no}</span><span>${p.cfg.label}</span><span>${p.cfg.material}</span><span>1</span>`;
    row.addEventListener('click', () => select(p));
    bom.appendChild(row);
    const g = document.createElementNS(NS, 'g');
    const line = document.createElementNS(NS, 'line');
    const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('r', '2.5');
    g.append(line, dot); leaders.appendChild(g);
    Object.assign(p, { el, row, g, line, dot });
  });
}
function placeLabels() {
  const w = window.innerWidth, h = window.innerHeight, mobile = w < 640;
  const L = mobile ? 64 : 136;
  v.set(0, 0, 0).project(camera); // the drawing's centre on screen (the model is centred on the origin)
  const cx = (v.x * 0.5 + 0.5) * w, cy = (-v.y * 0.5 + 0.5) * h;
  const bomBox = w >= 900 ? bom.getBoundingClientRect() : null;
  const pBox = player.getBoundingClientRect(), ext = mobile ? 24 : 170;
  let shown = 0;
  parts.forEach((p, i) => {
    if (!p.el) return;
    const visible = partT(i, eased) > 0.55 || (i === parts.length - 1 && eased > 0.9);
    p.el.classList.toggle('show', visible);
    p.row.classList.toggle('show', visible);
    p.g.style.opacity = visible ? 1 : 0;
    if (!visible) return;
    shown++;
    p.obj.getWorldPosition(v); v.project(camera);
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    let ux = x - cx, uy = y - cy;
    const len = Math.hypot(ux, uy);
    if (p.cfg.labelDir) { [ux, uy] = p.cfg.labelDir; } else if (len < 24) { ux = 0; uy = -1; } else { ux /= len; uy /= len; }
    const tbTop = h - (mobile ? 96 : 118), tbLeft = w - (mobile ? w : 350);
    const padL = !mobile && ux < 0 ? 180 : 40, padR = !mobile && ux >= 0 ? 180 : 40;
    let lx = THREE.MathUtils.clamp(x + ux * L, padL, w - padR);
    let ly = THREE.MathUtils.clamp(y + uy * L, 48, h - 40);
    if (ly > tbTop && lx > tbLeft) ly = tbTop;
    if (bomBox && lx + (ux >= 0 ? 170 : 0) > bomBox.left - 10 && ly < bomBox.bottom + 30) ly = bomBox.bottom + 30;
    if (lx + (ux >= 0 ? ext : 0) > pBox.left - 10 && lx - (ux < 0 ? ext : 0) < pBox.right + 10 && ly < pBox.bottom + 30) ly = pBox.bottom + 30;
    p.el.classList.toggle('flip', ux < 0);
    p.el.style.left = lx + 'px'; p.el.style.top = ly + 'px';
    p.line.setAttribute('x1', x); p.line.setAttribute('y1', y);
    p.line.setAttribute('x2', lx - ux * 13); p.line.setAttribute('y2', ly - uy * 13);
    p.dot.setAttribute('cx', x); p.dot.setAttribute('cy', y);
  });
  tbParts.textContent = `${shown} / ${parts.length}`;
}

// ---- dimension lines on the cabinet (height, width, depth)
const dims = document.createElementNS(NS, 'g'); dims.id = 'dims'; leaders.appendChild(dims);
const DIMS = [
  { a: ['max', 'min', 'max'], b: ['max', 'max', 'max'], text: '300' },
  { a: ['min', 'min', 'max'], b: ['max', 'min', 'max'], text: '180' },
  { a: ['max', 'min', 'max'], b: ['max', 'min', 'min'], text: '240' },
];
const dimEls = DIMS.map((d) => {
  const g = document.createElementNS(NS, 'g');
  const mk = (t) => { const e = document.createElementNS(NS, t); g.appendChild(e); return e; };
  const o = { g, e1: mk('line'), e2: mk('line'), l: mk('line'), t1: mk('line'), t2: mk('line'), txt: mk('text') };
  o.txt.textContent = d.text;
  dims.appendChild(g);
  return o;
});
const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
function placeDims() {
  const c = parts.find((p) => p.cfg.name === 'cabinet');
  if (!c) return;
  const vis = THREE.MathUtils.smoothstep(eased, 0.015, 0.06) * (1 - THREE.MathUtils.smoothstep(eased, 0.3, 0.42));
  dims.style.opacity = vis;
  if (vis <= 0) return;
  const mesh = c.mesh;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bbox = mesh.geometry.boundingBox;
  mesh.updateWorldMatrix(true, false);
  const w = window.innerWidth, h = window.innerHeight, mobile = w < 640;
  c.obj.getWorldPosition(pc); pc.project(camera);
  const cx = (pc.x * 0.5 + 0.5) * w, cy = (-pc.y * 0.5 + 0.5) * h;
  const off = mobile ? 22 : 34;
  DIMS.forEach((d, i) => {
    pa.set(bbox[d.a[0]].x, bbox[d.a[1]].y, bbox[d.a[2]].z).applyMatrix4(mesh.matrixWorld).project(camera);
    pb.set(bbox[d.b[0]].x, bbox[d.b[1]].y, bbox[d.b[2]].z).applyMatrix4(mesh.matrixWorld).project(camera);
    const ax = (pa.x * 0.5 + 0.5) * w, ay = (-pa.y * 0.5 + 0.5) * h, bx = (pb.x * 0.5 + 0.5) * w, by = (-pb.y * 0.5 + 0.5) * h;
    let dx = bx - ax, dy = by - ay; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    let nx = -dy, ny = dx;
    const mxx = (ax + bx) / 2, myy = (ay + by) / 2;
    if ((mxx - cx) * nx + (myy - cy) * ny < 0) { nx = -nx; ny = -ny; }
    const e = dimEls[i], set = (el, x1, y1, x2, y2) => { el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2); el.setAttribute('y2', y2); };
    set(e.e1, ax + nx * 6, ay + ny * 6, ax + nx * (off + 8), ay + ny * (off + 8));
    set(e.e2, bx + nx * 6, by + ny * 6, bx + nx * (off + 8), by + ny * (off + 8));
    const lax = ax + nx * off, lay = ay + ny * off, lbx = bx + nx * off, lby = by + ny * off;
    set(e.l, lax, lay, lbx, lby);
    const sx = (dx + nx) * 0.7071 * 5, sy = (dy + ny) * 0.7071 * 5;
    set(e.t1, lax - sx, lay - sy, lax + sx, lay + sy);
    set(e.t2, lbx - sx, lby - sy, lbx + sx, lby + sy);
    let ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
    const tx = mxx + nx * (off + 13), ty = myy + ny * (off + 13);
    e.txt.setAttribute('x', tx); e.txt.setAttribute('y', ty);
    e.txt.setAttribute('transform', `rotate(${ang} ${tx} ${ty})`);
  });
}

// ---- pick, hover, detail
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const detail = document.getElementById('detail');
let selected = null, hovered = null;
function hitPart(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(parts.map((p) => p.mesh), false)[0];
  return hit ? parts.find((p) => p.mesh === hit.object) : null;
}
function applyMats() {
  parts.forEach((q) => {
    const state = q === selected ? 'active' : q === hovered ? 'hover' : 'base';
    if (current === 'A') {
      q.edges.material = state === 'active' ? edgeMatActive : state === 'hover' ? edgeMatHover : edgeMat;
      q.hidden.material = state === 'active' ? hiddenMatActive : state === 'hover' ? hiddenMatHover : hiddenMat;
    } else if (current === 'B') {
      const m = q.mats.B; m.emissive.set(state === 'active' ? '#ff5a3c' : '#ffffff'); m.emissiveIntensity = state === 'active' ? 0.5 : state === 'hover' ? 0.12 : 0;
    } else if (current === 'C') {
      q.hull.material.uniforms.uColor.value.set(state === 'active' ? '#ff2e88' : '#111111');
      q.halo.material.uniforms.uColor.value.set(state === 'hover' ? '#ff2e88' : '#ffffff');
    } else {
      q.mesh.material = state === 'active' ? arcadeActive : state === 'hover' ? arcadeHover : q.mats.D;
    }
  });
}
function pick(e) { select(hitPart(e)); }
canvas.addEventListener('pointermove', (e) => {
  if (dragging || e.pointerType !== 'mouse') return;
  const p = hitPart(e);
  if (p !== hovered) { hovered = p; applyMats(); canvas.style.cursor = p ? 'pointer' : ''; }
});
function select(p) {
  parts.forEach((q) => { q.el?.classList.remove('active'); q.g?.classList.remove('active'); q.row?.classList.remove('active'); });
  selected = p;
  applyMats();
  if (!p) { detail.hidden = true; return; }
  p.el?.classList.add('active'); p.g?.classList.add('active'); p.row?.classList.add('active');
  document.getElementById('detail-no').textContent = p.cfg.no;
  document.getElementById('detail-name').textContent = p.cfg.label;
  document.getElementById('detail-material').textContent = p.cfg.material;
  document.getElementById('detail-dim').textContent = p.cfg.dim;
  document.getElementById('detail-fact').textContent = p.cfg.fact;
  detail.hidden = false;
}
document.getElementById('detail-close').addEventListener('click', () => select(null));

// ---- style swap: the REV stamp
const revCell = document.getElementById('rev');
const revLetter = document.getElementById('rev-letter');
const revName = document.getElementById('rev-name');
const flash = document.getElementById('flash');
function applyStyle(letter) {
  current = letter;
  const studio = letter === 'B', zine = letter === 'C', arcade = letter === 'D';
  document.documentElement.dataset.style = STYLES[letter].key;
  orbTheme();
  revLetter.textContent = letter; revName.textContent = STYLES[letter].name;
  scene.environment = studio ? env() : null;
  floor.visible = studio;
  renderer.setPixelRatio(arcade ? 0.11 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  hemi.intensity = studio ? 0.5 : 0.9;
  key.intensity = studio ? 1.6 : 1.3;
  parts.forEach((p) => {
    p.mesh.material = p.mats[letter];
    p.hull.visible = zine;
    p.halo.visible = zine;
    p.shadow.visible = zine;
    p.hidden.visible = letter === 'A';
    p.depth.visible = letter === 'A';
    p.edges.visible = !studio;
    p.edges.material = zine ? zineEdge : arcade ? arcadeEdge : edgeMat;
  });
  applyMats();
}
let stamping = false;
function restamp() {
  if (stamping || !parts.length) return;
  stamping = true;
  const order = Object.keys(STYLES);
  const letter = order[(order.indexOf(current) + 1) % order.length];
  revCell.classList.remove('hit'); void revCell.offsetWidth; revCell.classList.add('hit');
  flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  setTimeout(() => applyStyle(letter), 140);
  setTimeout(() => { stamping = false; }, 500);
}
revCell.addEventListener('click', restamp);
window.addEventListener('keydown', (e) => { if (e.key === 'r' || e.key === 'R') restamp(); if (e.key === 'Escape') select(null); });

// ---- frame loop
let last = performance.now(), shift = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  eased += (progress - eased) * Math.min(1, dt * 6);
  parts.forEach((p, i) => {
    const t = partT(i, eased);
    p.lift += ((p === hovered ? 1 : 0) - p.lift) * Math.min(1, dt * 8);
    p.obj.position.copy(p.base).addScaledVector(p.dir, t).addScaledVector(p.liftDir, p.lift * 0.012);
  });
  if (!dragging) {
    rotY += velY; velY *= 0.92;
    if (now - idleSince > 2500) rotY += dt * 0.12;
  }
  const desktop = window.innerWidth >= 900;
  tiltX += ((mouseSeen && desktop ? my * 0.06 : 0) - tiltX) * Math.min(1, dt * 3);
  tiltY += ((mouseSeen && desktop ? mx * 0.09 : 0) - tiltY) * Math.min(1, dt * 3);
  rig.rotation.set(rotX + tiltX, rotY + tiltY, 0);
  const wantShift = desktop ? window.innerWidth * (selected ? 0.17 : 0.07) : 0;
  shift += (wantShift - shift) * Math.min(1, dt * 6);
  camera.setViewOffset(window.innerWidth, window.innerHeight, shift, 0, window.innerWidth, window.innerHeight);
  fitCamera(dt);
  placeLabels();
  placeDims();
  opening.classList.toggle('gone', eased > 0.03);
  const small = window.innerWidth < 640;
  hint.textContent = eased > 0.97
    ? (small ? 'SCROLL UP · TAP REV FOR A NEW STYLE' : 'END OF SHEET · SCROLL UP TO REASSEMBLE · R FOR A NEW STYLE')
    : (small ? 'DRAG TO SPIN · TAP A PART · TAP REV' : 'DRAG TO ROTATE · TAP A PART · PRESS R FOR A NEW STYLE');
  hint.classList.toggle('show', eased > 0.03 && !selected);
  for (const m of hiddenMats) { m.dashSize = fitD * 0.0075; m.gapSize = fitD * 0.0045; }
  stickerShadow.uniforms.uOffset.value.set(2 * 12 / window.innerWidth, -2 * 14 / window.innerHeight);
  drawOrb(now, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  readScroll();
});
readScroll();


// ---- music-reactive orb: the Thinking Orbs engine's dot language (MIT, Jakub Antalik), with a custom frame fed by the analyser
const orbCanvas = document.getElementById('orb'), orbCtx = orbCanvas.getContext('2d');
const player = document.getElementById('player'), playBtn = document.getElementById('play'), playLabel = document.getElementById('play-label');
const track = document.getElementById('track');
const listening = resolvePreset('listening', 64).opts; // the library's tuned "listening" profile, densified for a bigger orb
const orbOpts = { ...listening, rings: 14, lonDensity: 36, rBase: (listening.rBase ?? 0.6) * 1.6, rDepth: (listening.rDepth ?? 1.7) * 1.6 };
const music = { bass: 0, mids: 0, highs: 0, vol: 0, beat: 0, spin: 0 };
const lo = { bass: 0, mids: 0, highs: 0, vol: 0 }, hi = { bass: 60, mids: 40, highs: 25, vol: 40 }; // each band's running range, so any track normalises itself
let actx = null, analyser = null, freq = null, playing = false, bassAvg = 0, bassDev = 8, bassPrev = 0, lastBeat = 0;
let orbInk = [238, 243, 255], orbPaper = [13, 55, 119];

function parseColor(s) {
  s = s.trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
}
function orbTheme() { // the orb is always drawn in the sheet's ink, fading toward its paper
  const cs = getComputedStyle(document.documentElement);
  orbInk = parseColor(cs.getPropertyValue('--ink')); orbPaper = parseColor(cs.getPropertyValue('--paper'));
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mixC = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
// the engine's own noise helpers, copied because the React-free entry does not export them
function hashD(a, b) { const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hashD(xi, yi), b = hashD(xi + 1, yi), c = hashD(xi, yi + 1), d = hashD(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// -- audio: an AnalyserNode on the audio element, created on the first Play (autoplay rules)
function ensureAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const src = actx.createMediaElementSource(track);
  analyser = actx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.3;
  src.connect(analyser); analyser.connect(actx.destination);
  freq = new Uint8Array(analyser.frequencyBinCount);
}
function setPlaying(on) {
  playing = on;
  playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  playBtn.setAttribute('aria-label', on ? 'Pause music' : 'Play music');
  playLabel.textContent = on ? 'Pause' : 'Play';
}
function noTrack() { playLabel.textContent = 'No track'; playBtn.disabled = true; setPlaying(false); }
playBtn.addEventListener('click', async () => {
  if (playing) { track.pause(); setPlaying(false); return; }
  try {
    ensureAudio();
    if (actx.state !== 'running') await actx.resume();
    await track.play();
    setPlaying(true);
  } catch (err) { console.warn('music: could not start', err); noTrack(); }
});
track.addEventListener('play', () => setPlaying(true));   // keep the button honest when the OS media keys drive it
track.addEventListener('pause', () => setPlaying(false));
track.querySelector('source:last-child').addEventListener('error', noTrack); // every source failed to load

function band(lo, hi) { let s = 0; for (let i = lo; i < hi; i++) s += freq[i]; return s / Math.max(1, hi - lo); }
function range(key, v, floor) { // where v sits between the band's recent quietest and loudest
  lo[key] = v < lo[key] ? v : lo[key] + (v - lo[key]) * 0.004;
  hi[key] = v > hi[key] ? v : hi[key] + (v - hi[key]) * 0.002;
  return Math.min(1, Math.max(0, (v - lo[key]) / Math.max(floor, hi[key] - lo[key])));
}
function ease(k, target, dt, attack, release) { music[k] += (target - music[k]) * Math.min(1, dt * (target > music[k] ? attack : release)); }
function analyse(now, dt) {
  analyser.getByteFrequencyData(freq);
  const hz = actx.sampleRate / analyser.fftSize, bin = (f) => Math.min(freq.length - 1, Math.round(f / hz));
  const bass = band(bin(20), bin(150) + 1), mids = band(bin(150), bin(2000)), highs = band(bin(2000), bin(10000)), vol = band(0, bin(10000));
  // a beat: the bass rises clear of its recent average, by more than its usual wander
  bassAvg += (bass - bassAvg) * Math.min(1, dt * 2.5);
  bassDev += (Math.abs(bass - bassAvg) - bassDev) * Math.min(1, dt * 2.5);
  if (bass > bassPrev && bass - bassAvg > Math.max(6, 1.3 * bassDev) && bass > 60 && now - lastBeat > 180) { music.beat = 1; lastBeat = now; }
  bassPrev = bass;
  ease('bass', range('bass', bass, 30), dt, 20, 6);
  ease('mids', range('mids', mids, 20), dt, 14, 5);
  ease('highs', range('highs', highs, 12), dt, 18, 7);
  ease('vol', range('vol', vol, 20), dt, 8, 3);
}

// -- geometry, in the engine's own contract: (size, t, opts) -> frame of dots
function orbFrame(size, t, o, m) {
  const cx = size / 2, cy = size / 2;
  const breathe = 1 + 0.03 * Math.sin(t * 0.7);                         // idle: slow breathing
  const R = size / 2 * 0.74 * breathe * (1 + 0.10 * m.bass + 0.07 * m.beat); // bass: scale, with a pulse on the beat
  const pt = makeProj(t * 0.18 + m.spin, 0.38 + 0.06 * Math.sin(t * 0.3), cx, cy, 1);
  const rs = radiusScale(size, o.rsPow ?? 0.6);
  const rings = o.rings ?? 15, lonDensity = o.lonDensity ?? 40;
  const wobble = 0.04 + 0.14 * m.mids, boil = 0.12 * m.mids;           // mids: the rolling wave and the surface boil
  const bright = 0.55 + 0.45 * m.vol;                                   // volume: brightness
  const sparkGate = 1 - 0.12 * m.highs, tick = Math.floor(t * 14);      // highs: a share of dots sparkle
  const dots = [];
  for (let ri = 0; ri <= rings; ri++) {
    const lat = -Math.PI / 2 + ri / rings * Math.PI, cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    const w = 0.62 * Math.sin(t * 2.1 - ri * 0.52) + 0.38 * Math.sin(t * 1.27 + ri * 0.83); // the library's listening wave
    const crest = Math.max(0, w);
    const lonCount = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
    for (let lj = 0; lj < lonCount; lj++) {
      const lon = lj / lonCount * 2 * Math.PI;
      const n = (vnoise(lon * 1.2 + t * 0.5, ri * 0.8 + t * 0.35) - 0.5) * 2;
      const rr = R * (0.9 + wobble * w) * (1 + boil * n);
      const [px, py, z] = pt(cosLat * Math.cos(lon) * rr, sinLat * rr, cosLat * Math.sin(lon) * rr);
      const depth = (z / R + 1) / 2;
      const spark = m.highs > 0.02 && hashD(ri * 7.1 + lj, tick) > sparkGate ? 1 : 0;
      dots.push({
        x: px, y: py, z,
        r: ((o.rBase ?? 0.6) + (o.rDepth ?? 1.7) * depth) * (1 + 0.4 * crest + 0.9 * spark * m.highs) * rs,
        white: Math.max(0, 0.66 - 0.56 * depth - 0.1 * crest - 0.25 * spark - 0.12 * m.vol),
        a: Math.min(1, bright * (0.45 + 0.55 * depth) + 0.4 * spark),
      });
    }
  }
  return finalizeFrame(dots, [], o.rMin);
}
function drawOrb(now, dt) {
  const size = orbCanvas.clientWidth;
  if (!size) return;
  const dpr = current === 'D' ? 0.25 : Math.min(2, window.devicePixelRatio || 1);
  const px = Math.max(1, Math.round(size * dpr));
  if (orbCanvas.width !== px) orbCanvas.width = orbCanvas.height = px;
  if (playing && analyser) analyse(now, dt);
  else for (const k of ['bass', 'mids', 'highs', 'vol']) ease(k, 0, dt, 20, 1.5); // paused: settle back to idle
  music.beat *= Math.exp(-dt * 5);
  music.spin += dt * (0.9 * music.vol + 0.6 * music.bass);                      // louder = turns faster
  const frame = orbFrame(size, now / 1000, orbOpts, music);
  orbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  orbCtx.clearRect(0, 0, size, size);
  const glow = 0.04 + 0.3 * (0.5 * music.highs + 0.3 * music.vol + 0.2 * music.beat);  // a soft halo behind the dots
  const halo = orbCtx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
  halo.addColorStop(0, rgba(orbInk, glow)); halo.addColorStop(1, rgba(orbInk, 0));
  orbCtx.fillStyle = halo; orbCtx.fillRect(0, 0, size, size);
  for (const d of frame.dots) {
    orbCtx.fillStyle = rgba(mixC(orbInk, orbPaper, Math.min(1, d.white)), d.a ?? 1);
    orbCtx.beginPath(); orbCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2); orbCtx.fill();
  }
}
orbTheme();

window.__dbg = { scene, camera, parts, rig, renderer, applyStyle, restamp, music, orbFrame, get playing() { return playing; }, get eased() { return eased; }, get progress() { return progress; } };
