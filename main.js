import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

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

const parts = []; // { cfg, obj, mesh, base, edges, hull, dir, mats, r, lift }

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
    const hg = o.geometry.clone(); hg.deleteAttribute('normal'); hg.deleteAttribute('uv');
    const smooth = mergeVertices(hg); smooth.computeVertexNormals();
    const hull = new THREE.Mesh(smooth, new THREE.ShaderMaterial({ ...hullShader, uniforms: THREE.UniformsUtils.clone(hullShader.uniforms) }));
    hull.visible = false; hull.renderOrder = 0;
    o.add(hull);
    o.geometry.computeBoundingSphere();
    const [sc, rough, metal] = STUDIO[cfg.name];
    const mats = {
      A: fillMat,
      B: new THREE.MeshStandardMaterial({ color: sc, roughness: rough, metalness: metal, emissive: '#ffffff', emissiveIntensity: 0 }),
      C: new THREE.MeshToonMaterial({ color: ZINE[cfg.name], gradientMap: toon3 }),
      D: new THREE.MeshToonMaterial({ color: ARCADE[cfg.name], gradientMap: toon2 }),
    };
    const dir = new THREE.Vector3(...cfg.dir);
    parts.push({ cfg, obj: target, mesh: o, base: target.position.clone(), edges, hull, dir, mats, r: o.geometry.boundingSphere.radius, lift: 0,
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
    } else if (current === 'B') {
      const m = q.mats.B; m.emissive.set(state === 'active' ? '#ff5a3c' : '#ffffff'); m.emissiveIntensity = state === 'active' ? 0.5 : state === 'hover' ? 0.12 : 0;
    } else if (current === 'C') {
      q.hull.material.uniforms.uColor.value.set(state === 'active' ? '#ff2e88' : state === 'hover' ? '#ffffff' : '#111111');
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

window.__dbg = { scene, camera, parts, rig, renderer, applyStyle, restamp, get eased() { return eased; }, get progress() { return progress; } };
