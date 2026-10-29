import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---- parts: Blender object names, explode direction (glTF space: +Z = front) and copy
const PARTS = [
  { name: 'grille',    no: 1, label: 'GRILLE',        dir: [0, 0, 1.0],     material: 'Cloth on MDF frame', dim: '180 × 300 × 12', fact: 'A frame of stretched cloth. It hides the drivers and does almost nothing to the sound.' },
  { name: 'baffle',    no: 2, label: 'FRONT BAFFLE',  dir: [0, 0, 0.62],    material: 'MDF, 25 mm',        dim: '180 × 300 × 25', fact: 'The thick front plate that holds both drivers. Stiff, so it does not sing along with them.' },
  { name: 'woofer',    no: 3, label: 'WOOFER Ø130',   dir: [0, -0.06, 0.38], material: 'Paper cone, steel', dim: 'Ø 130',           fact: 'Moves the air for bass and mids. The cone pumps back and forth up to a hundred times a second.' },
  { name: 'tweeter',   no: 4, label: 'TWEETER Ø25',   dir: [0, 0.08, 0.38],  material: 'Silk dome',        dim: 'Ø 25',            fact: 'A tiny dome for the high notes, up to 20 000 Hz. Fast and light.' },
  { name: 'port',      no: 5, label: 'BASS PORT',     dir: [0, 0, -0.5],    material: 'ABS tube',          dim: 'Ø 40 × 120',      fact: 'A tube tuned to one note. The air in it resonates and adds low bass the woofer cannot make alone.' },
  { name: 'crossover', no: 6, label: 'CROSSOVER',     dir: [-0.55, -0.1, 0], material: 'PCB, coils, caps', dim: '90 × 60',         fact: 'A small circuit board that splits the signal: lows to the woofer, highs to the tweeter.' },
  { name: 'terminal',  no: 7, label: 'TERMINAL CUP',  dir: [0, -0.05, -0.7], material: 'ABS, brass',       dim: '60 × 90',         fact: 'Where the speaker cable connects. Red and black, so you get the two speakers in step.' },
  { name: 'cabinet',   no: 8, label: 'CABINET',       dir: [0, 0, 0],       material: 'MDF, 18 mm',        dim: '180 × 300 × 240', fact: 'A sealed box of MDF. Its volume sets how deep the bass goes.' },
];
const STEP = 1 / PARTS.length;

// ---- renderer
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.01, 50);

const rig = new THREE.Group();      // user rotation
const model = new THREE.Group();    // loaded parts
rig.add(model);
scene.add(rig);

// ---- materials: translucent fill with a white rim + crisp edge lines
const fillMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: {
    uFill: { value: new THREE.Color('#1d57a8') },
    uRim: { value: new THREE.Color('#eef3ff') },
    uOpacity: { value: 0.42 },
  },
  vertexShader: `
    varying vec3 vN; varying vec3 vV;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uFill; uniform vec3 uRim; uniform float uOpacity;
    varying vec3 vN; varying vec3 vV;
    void main(){
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      vec3 c = mix(uFill, uRim, f * 0.9);
      gl_FragColor = vec4(c, uOpacity + f * 0.45);
    }`,
});
const edgeMat = new THREE.LineBasicMaterial({ color: '#eef3ff', transparent: true, opacity: 0.85 });
const edgeMatActive = new THREE.LineBasicMaterial({ color: '#ff5a3c', transparent: true, opacity: 1 });

const parts = []; // { cfg, obj, base: Vector3, edges, center }

const loader = new GLTFLoader();
loader.load('model/speaker.glb', (gltf) => {
  const root = gltf.scene;
  model.add(root);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const cfg = PARTS.find((p) => p.name === o.name || p.name === o.parent?.name);
    o.material = fillMat;
    o.renderOrder = 1;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), edgeMat);
    edges.renderOrder = 2;
    o.add(edges);
    if (cfg && !parts.find((p) => p.cfg === cfg)) {
      const target = o.name === cfg.name ? o : o.parent;
      parts.push({ cfg, obj: target, base: target.position.clone(), edges, dir: new THREE.Vector3(...cfg.dir) });
    }
  });
  parts.sort((a, b) => a.cfg.no - b.cfg.no);
  // centre the model and size the camera
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.sub(c);
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  dist0 = r * 2.9; dist1 = r * 5.2;
  buildLabels();
  fitCamera();
});

let dist0 = 1, dist1 = 2;
function fitCamera() {
  const portrait = window.innerWidth < window.innerHeight;
  const k = portrait ? 1.35 : 1;
  const d = THREE.MathUtils.lerp(dist0, dist1, eased) * k;
  camera.position.set(0, d * 0.18, d);
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
  // each part separates in its own window, slightly overlapping the next
  const start = i * STEP * 0.92, end = start + STEP * 1.1;
  return THREE.MathUtils.smoothstep(p, start, Math.min(end, 1));
}

// ---- rotation: drag horizontally to spin, idle auto-turn
let rotY = 0.5, rotX = 0.08, velY = 0, dragging = false, lastX = 0, lastY = 0, moved = 0, idleSince = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; velY = 0; canvas.setPointerCapture(e.pointerId); });
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

// ---- labels + leader lines
const labelsEl = document.getElementById('labels');
const leaders = document.getElementById('leaders');
const NS = 'http://www.w3.org/2000/svg';
function buildLabels() {
  parts.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'label' + (i % 2 ? ' flip' : '');
    el.innerHTML = `<span class="no">${p.cfg.no}</span><span class="nm">${p.cfg.label}</span>`;
    el.addEventListener('click', () => select(p));
    labelsEl.appendChild(el);
    const g = document.createElementNS(NS, 'g');
    const line = document.createElementNS(NS, 'line');
    const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('r', '2.5');
    g.append(line, dot); leaders.appendChild(g);
    p.el = el; p.g = g; p.line = line; p.dot = dot;
  });
}
const v = new THREE.Vector3();
function placeLabels() {
  const w = window.innerWidth, h = window.innerHeight, mobile = w < 640;
  let shown = 0;
  parts.forEach((p, i) => {
    if (!p.el) return;
    const visible = partT(i, eased) > 0.55 || (i === parts.length - 1 && eased > 0.9);
    p.el.classList.toggle('show', visible);
    p.g.style.opacity = visible ? 1 : 0;
    if (!visible) return;
    shown++;
    p.obj.getWorldPosition(v); v.project(camera);
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    const side = i % 2 ? -1 : 1;
    const lx = x + side * (mobile ? 54 : 120), ly = y - (mobile ? 26 : 34);
    p.el.style.left = lx + 'px'; p.el.style.top = ly + 'px';
    p.line.setAttribute('x1', x); p.line.setAttribute('y1', y);
    p.line.setAttribute('x2', lx - side * (mobile ? 13 : 13)); p.line.setAttribute('y2', ly);
    p.dot.setAttribute('cx', x); p.dot.setAttribute('cy', y);
  });
  tbParts.textContent = `${shown} / ${parts.length}`;
}

// ---- pick + detail
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const detail = document.getElementById('detail');
let selected = null;
function pick(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const meshes = parts.map((p) => p.obj.isMesh ? p.obj : p.obj.children.find((c) => c.isMesh)).filter(Boolean);
  const hit = ray.intersectObjects(meshes, false)[0];
  if (!hit) { select(null); return; }
  select(parts.find((p) => p.obj === hit.object || p.obj === hit.object.parent));
}
function select(p) {
  parts.forEach((q) => { q.edges.material = edgeMat; q.el?.classList.remove('active'); q.g?.classList.remove('active'); });
  selected = p;
  if (!p) { detail.hidden = true; return; }
  p.edges.material = edgeMatActive; p.el?.classList.add('active'); p.g?.classList.add('active');
  document.getElementById('detail-no').textContent = p.cfg.no;
  document.getElementById('detail-name').textContent = p.cfg.label;
  document.getElementById('detail-material').textContent = p.cfg.material;
  document.getElementById('detail-dim').textContent = p.cfg.dim;
  document.getElementById('detail-fact').textContent = p.cfg.fact;
  detail.hidden = false;
}
document.getElementById('detail-close').addEventListener('click', () => select(null));

// ---- frame loop
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  eased += (progress - eased) * Math.min(1, dt * 6);
  parts.forEach((p, i) => {
    const t = partT(i, eased);
    p.obj.position.copy(p.base).addScaledVector(p.dir, t);
  });
  if (!dragging) {
    rotY += velY; velY *= 0.92;
    if (now - idleSince > 2500) rotY += dt * 0.12;
  }
  rig.rotation.set(rotX, rotY, 0);
  fitCamera();
  placeLabels();
  opening.classList.toggle('gone', eased > 0.03);
  hint.classList.toggle('show', eased > 0.03 && eased < 0.97 && !selected);
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
