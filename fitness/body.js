// A modular 3D muscle model, built from code.
// The body is a set of smooth surfaces (torso, neck, limbs, shoulder caps). Each muscle is its own mesh: a patch laid
// over one of those surfaces, given a raised, fibrous shape, mirrored for left and right, and tagged with its muscle id.
// Shapes and positions follow standard anatomy references but are simplified; this is not a medical-grade model.
import * as THREE from "../vendor/three.module.min.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const rad = d => d * Math.PI / 180;

// smooth interpolation through a table of [key, ...values]
function keys(table, k) {
  if (k <= table[0][0]) return table[0].slice(1);
  for (let i = 1; i < table.length; i++) {
    if (k <= table[i][0]) {
      const [k0, ...a] = table[i - 1], [k1, ...b] = table[i];
      let t = (k - k0) / (k1 - k0); t = t * t * (3 - 2 * t);
      return a.map((v, j) => lerp(v, b[j], t));
    }
  }
  return table[table.length - 1].slice(1);
}

// ---- body surfaces. x is the body's left, y up, z the front. Height about 1.8.
// torso cross-sections: [height, half width, front depth, back depth]
const TORSO = [
  [0.80, .150, .085, .105], [0.86, .162, .095, .126], [0.93, .160, .100, .110], [1.00, .148, .100, .086],
  [1.06, .138, .102, .080], [1.15, .145, .110, .090], [1.25, .160, .120, .100], [1.34, .172, .118, .102],
  [1.41, .178, .098, .094], [1.46, .140, .072, .072], [1.50, .072, .056, .056], [1.53, .056, .050, .050],
];
const se = v => Math.sign(v) * Math.pow(Math.abs(v), 2 / 2.4);   // slightly squared-off cross-sections
function torsoAt(y, th) {
  const [rx, rzf, rzb] = keys(TORSO, y), s = Math.sin(th), c = Math.cos(th);
  return V(rx * se(s), y, (c >= 0 ? rzf : rzb) * se(c));
}
function torsoSurf(y, th) {
  const p = torsoAt(y, th), e = 0.002;
  const dy = torsoAt(y + e, th).sub(torsoAt(y - e, th)), dt = torsoAt(y, th + e).sub(torsoAt(y, th - e));
  const n = new THREE.Vector3().crossVectors(dt, dy).normalize();
  if (n.dot(V(p.x, 0, p.z)) < 0) n.negate();
  return { p, n };
}

// limbs: a tube from A to B (left side), radius along the length
const LIMBS = {
  uarm: { A: V(0.195, 1.405, 0), B: V(0.245, 1.13, -0.005), r: [[0, .050], [.3, .048], [.7, .040], [1, .034]] },
  farm: { A: V(0.245, 1.13, -0.005), B: V(0.27, 0.875, 0.03), r: [[0, .038], [.25, .040], [.7, .028], [1, .022]] },
  thigh: { A: V(0.092, 0.905, 0.005), B: V(0.098, 0.505, 0.012), r: [[0, .088], [.25, .082], [.7, .064], [1, .050]] },
  shin: { A: V(0.098, 0.505, 0.012), B: V(0.095, 0.085, -0.012), r: [[0, .050], [.22, .052], [.5, .040], [.85, .026], [1, .024]] },
  neck: { A: V(0, 1.46, -0.005), B: V(0, 1.62, 0.015), r: [[0, .066], [0.5, .058], [1, .054]], center: true },
};
function limbSurf(name, s, t, a) {
  const L = LIMBS[name], A = L.A.clone(), B = L.B.clone();
  if (s < 0) { A.x = -A.x; B.x = -B.x; }
  const d = B.clone().sub(A), len = d.length(); d.normalize();
  const fwd = V(0, 0, 1).sub(d.clone().multiplyScalar(d.z)).normalize();
  const lat = new THREE.Vector3().crossVectors(d, fwd).normalize();
  if (L.center ? lat.x < 0 : lat.x * s < 0) lat.negate();
  if (L.center && s < 0) lat.negate();
  const r = keys(L.r, t)[0];
  const n = fwd.clone().multiplyScalar(Math.cos(a)).add(lat.clone().multiplyScalar(Math.sin(a)));
  return { p: A.add(d.multiplyScalar(len * t)).add(n.clone().multiplyScalar(r)), n };
}
// shoulder cap: a sphere around the shoulder joint; u = angle down from the top, a = around (0 front, 90 out, 180 back)
const SHOULDER = { C: V(0.19, 1.405, 0), R: 0.058 };
function shoulderSurf(s, phi, al) {
  const n = V(Math.sin(phi) * Math.sin(al) * s, Math.cos(phi), Math.sin(phi) * Math.cos(al));
  const C = SHOULDER.C.clone(); C.x *= s;
  return { p: C.add(n.clone().multiplyScalar(SHOULDER.R)), n };
}
function surf(kind, s, u, a) {
  if (kind === "torso") return torsoSurf(u, rad(a) * s);
  if (kind === "shoulder") return shoulderSurf(s, rad(u), rad(a));
  return limbSurf(kind, s, u, a);
}

// ---- muscles. rows: [u, from, to] along the surface; torso and shoulder angles in degrees, limb angles in radians.
const P = [
  // chest
  { id: "pec_major_clavicular", k: "torso", rows: [[1.37, 2.5, 74], [1.405, 3, 70], [1.44, 5, 58]], h: .014, layer: 1 },
  { id: "pec_major_sternal", k: "torso", rows: [[1.205, 14, 42], [1.24, 4, 62], [1.30, 2.2, 74], [1.365, 2.2, 76]], h: .022, layer: 1 },
  { id: "pec_minor", k: "torso", rows: [[1.27, 28, 58], [1.38, 36, 66]], h: .005, layer: -1 },
  { id: "serratus_anterior", k: "torso", rows: [[1.16, 64, 96], [1.24, 66, 100], [1.31, 74, 100]], h: .008, digits: 4 },
  // belly
  { id: "rectus_abdominis", k: "torso", rows: [[0.92, 0.7, 9], [1.0, 0.7, 14], [1.12, 0.7, 17], [1.22, 0.8, 16], [1.27, 1, 13]], h: .013, ridges: 4 },
  { id: "external_oblique", k: "torso", rows: [[0.95, 26, 70], [1.05, 20, 86], [1.15, 22, 96], [1.22, 40, 98]], h: .011 },
  { id: "internal_oblique", k: "torso", rows: [[0.96, 22, 66], [1.12, 22, 84]], h: .005, layer: -1 },
  { id: "transverse_abdominis", k: "torso", rows: [[0.94, 10, 80], [1.15, 10, 88]], h: .003, layer: -2 },
  // back
  { id: "trapezius", k: "torso", rows: [[1.17, 170, 180], [1.25, 148, 180], [1.33, 124, 180], [1.40, 108, 180], [1.45, 98, 180], [1.49, 118, 180], [1.525, 150, 180]], h: .012, layer: 2 },
  { id: "rhomboids", k: "torso", rows: [[1.27, 152, 179], [1.40, 150, 179]], h: .006, layer: 0 },
  { id: "infraspinatus", k: "torso", rows: [[1.26, 120, 150], [1.33, 116, 154], [1.37, 122, 148]], h: .011, layer: 1 },
  { id: "supraspinatus", k: "torso", rows: [[1.39, 118, 150], [1.44, 116, 150]], h: .006, layer: 0 },
  { id: "teres_minor", k: "torso", rows: [[1.315, 104, 120], [1.345, 104, 118]], h: .009, layer: 1 },
  { id: "teres_major", k: "torso", rows: [[1.25, 102, 128], [1.30, 100, 126]], h: .011, layer: 1 },
  { id: "subscapularis", k: "torso", rows: [[1.27, 108, 140], [1.39, 110, 140]], h: .004, layer: -1 },
  { id: "latissimus_dorsi", k: "torso", rows: [[1.02, 118, 172], [1.08, 96, 174], [1.16, 88, 172], [1.24, 88, 150], [1.30, 96, 124]], h: .012, layer: 1 },
  { id: "erector_spinae", k: "torso", rows: [[0.94, 164, 179.5], [1.05, 160, 179.5], [1.20, 163, 179.5], [1.32, 166, 179.5]], h: .016, layer: 0 },
  { id: "quadratus_lumborum", k: "torso", rows: [[0.98, 140, 162], [1.12, 140, 162]], h: .005, layer: -1 },
  // hips
  { id: "gluteus_maximus", k: "torso", rows: [[0.80, 118, 172], [0.84, 100, 178.5], [0.90, 100, 178.5], [0.955, 118, 172]], h: .026, layer: 1 },
  { id: "gluteus_medius", k: "torso", rows: [[0.92, 78, 122], [0.98, 82, 128], [1.01, 92, 124]], h: .016, layer: 0 },
  { id: "gluteus_minimus", k: "torso", rows: [[0.93, 84, 118], [0.99, 88, 120]], h: .006, layer: -1 },
  { id: "tensor_fasciae_latae", k: "torso", rows: [[0.84, 54, 76], [0.92, 52, 78], [0.97, 56, 74]], h: .010 },
  { id: "iliopsoas", k: "torso", rows: [[0.86, 22, 40], [0.95, 18, 38]], h: .008 },
  // neck
  { id: "sternocleidomastoid", k: "neck", rows: [[0.05, 0.15, 0.7], [0.5, 0.7, 1.25], [0.95, 1.2, 1.8]], h: .010 },
  // shoulder caps, continuing down the upper arm
  { id: "deltoid_anterior", k: "shoulder", rows: [[18, -25, 55], [60, -15, 55], [100, 5, 52]], h: .016, layer: 1 },
  { id: "deltoid_lateral", k: "shoulder", rows: [[8, 55, 125], [60, 55, 125], [100, 60, 120]], h: .018, layer: 1 },
  { id: "deltoid_posterior", k: "shoulder", rows: [[18, 125, 205], [60, 125, 195], [100, 128, 180]], h: .016, layer: 1 },
  { id: "deltoid_anterior", k: "uarm", rows: [[0.0, -0.6, 0.9], [0.22, -0.2, 0.85], [0.42, 0.65, 1.0]], h: .016, layer: 2 },
  { id: "deltoid_lateral", k: "uarm", rows: [[0.0, 0.9, 2.0], [0.25, 0.85, 1.8], [0.45, 1.05, 1.3]], h: .018, layer: 2 },
  { id: "deltoid_posterior", k: "uarm", rows: [[0.0, 2.0, 3.2], [0.22, 1.8, 2.7], [0.42, 1.35, 1.6]], h: .016, layer: 2 },
  // upper arm
  { id: "biceps_brachii", k: "uarm", rows: [[0.2, -0.85, 0.55], [0.55, -0.95, 0.75], [0.85, -0.55, 0.45], [0.96, -0.25, 0.2]], h: .02, layer: 1 },
  { id: "brachialis", k: "uarm", rows: [[0.5, 0.75, 1.35], [0.8, 0.6, 1.45], [0.97, 0.4, 1.2]], h: .010 },
  { id: "brachialis", k: "uarm", rows: [[0.55, -1.5, -0.95], [0.85, -1.55, -0.6], [0.97, -1.2, -0.4]], h: .008 },
  { id: "triceps_brachii", k: "uarm", rows: [[0.18, 2.0, 4.0], [0.5, 1.7, 4.3], [0.85, 2.3, 4.0], [0.97, 2.8, 3.5]], h: .02, layer: 1 },
  // forearm
  { id: "brachioradialis", k: "farm", rows: [[0.0, 0.5, 1.4], [0.35, 0.4, 1.3], [0.8, 0.6, 1.1]], h: .013, layer: 1 },
  { id: "forearm_flexors", k: "farm", rows: [[0.02, -1.9, 0.45], [0.5, -1.9, 0.4], [0.88, -1.4, 0.2]], h: .012 },
  { id: "forearm_extensors", k: "farm", rows: [[0.02, 1.4, 3.6], [0.5, 1.35, 3.7], [0.88, 1.6, 3.3]], h: .012 },
  // thigh
  { id: "rectus_femoris", k: "thigh", rows: [[0.08, -0.3, 0.3], [0.5, -0.42, 0.42], [0.88, -0.25, 0.25]], h: .022, layer: 1 },
  { id: "vastus_lateralis", k: "thigh", rows: [[0.18, 0.4, 1.9], [0.55, 0.35, 2.0], [0.92, 0.25, 1.2]], h: .022 },
  { id: "vastus_medialis", k: "thigh", rows: [[0.5, -0.7, -0.3], [0.78, -1.35, -0.25], [0.95, -1.1, -0.2]], h: .026 },
  { id: "vastus_intermedius", k: "thigh", rows: [[0.25, -0.3, 0.35], [0.85, -0.3, 0.35]], h: .005, layer: -1 },
  { id: "sartorius", k: "thigh", rows: [[0.02, 0.7, 0.95], [0.35, -0.25, 0.05], [0.65, -1.2, -0.95], [0.97, -2.05, -1.8]], h: .008, layer: 2 },
  { id: "adductors", k: "thigh", rows: [[0.02, -2.2, -0.6], [0.35, -2.3, -0.65], [0.65, -2.1, -0.85]], h: .018 },
  { id: "biceps_femoris", k: "thigh", rows: [[0.15, 2.0, 2.8], [0.6, 1.95, 2.95], [0.95, 2.2, 2.75]], h: .02 },
  { id: "semitendinosus", k: "thigh", rows: [[0.12, 2.85, 3.45], [0.6, 2.95, 3.5], [0.95, 3.25, 3.65]], h: .02, layer: 1 },
  { id: "semimembranosus", k: "thigh", rows: [[0.25, 3.5, 4.05], [0.6, 3.5, 4.1], [0.92, 3.6, 4.0]], h: .016 },
  // lower leg
  { id: "gastrocnemius", k: "shin", rows: [[0.04, 2.2, 3.05], [0.25, 2.05, 3.1], [0.5, 2.5, 3.1]], h: .026, layer: 1 },
  { id: "gastrocnemius", k: "shin", rows: [[0.04, 3.2, 4.05], [0.25, 3.15, 4.25], [0.52, 3.2, 3.8]], h: .026, layer: 1 },
  { id: "soleus", k: "shin", rows: [[0.3, 1.75, 4.55], [0.6, 1.9, 4.4], [0.82, 2.6, 3.7]], h: .014 },
  { id: "tibialis_anterior", k: "shin", rows: [[0.06, 0.05, 0.85], [0.5, 0.1, 0.75], [0.85, -0.05, 0.35]], h: .014 },
  { id: "peroneals", k: "shin", rows: [[0.08, 1.0, 1.7], [0.5, 1.05, 1.65], [0.85, 1.2, 1.5]], h: .011 },
];

// interpolate a patch's [from, to] at u
function bounds(rows, u) {
  for (let i = 1; i < rows.length; i++) if (u <= rows[i][0]) {
    const t = (u - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]);
    return [lerp(rows[i - 1][1], rows[i][1], t), lerp(rows[i - 1][2], rows[i][2], t)];
  }
  return [rows[rows.length - 1][1], rows[rows.length - 1][2]];
}

function patchGeometry(def, s) {
  const NU = 26, NV = 16, pos = [], idx = [], uv = [];
  const u0 = def.rows[0][0], u1 = def.rows[def.rows.length - 1][0];
  const off = 0.0025 + 0.0022 * (def.layer || 0);
  for (let i = 0; i <= NU; i++) {
    const fi = i / NU, u = lerp(u0, u1, fi), [lo, hi] = bounds(def.rows, u);
    for (let j = 0; j <= NV; j++) {
      const fv = j / NV, { p, n } = surf(def.k, s, u, lerp(lo, hi, fv));
      let bulge = Math.pow(Math.sin(Math.PI * fv), 0.55) * Math.pow(Math.sin(Math.PI * fi), 0.45);
      if (def.ridges) bulge *= 0.78 + 0.22 * Math.abs(Math.sin(Math.PI * fi * def.ridges));
      if (def.digits) bulge *= 0.7 + 0.3 * Math.abs(Math.sin(Math.PI * fi * def.digits));
      bulge *= 1 + 0.035 * Math.sin(fv * 46 + fi * 3);   // fine fibre texture
      const h = Math.max(0.0006, off + def.h * bulge);
      pos.push(p.x + n.x * h, p.y + n.y * h, p.z + n.z * h);
      uv.push(fv, fi);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + NV + 1;
    if (s > 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// fine lengthwise fibres, drawn once and used as a bump map on every muscle
let fibreTex = null;
function fibres() {
  if (fibreTex) return fibreTex;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"); g.fillStyle = "#808080"; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 2) {
    const v = 110 + Math.random() * 60; g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1 + Math.random() * 1.5, 256);
  }
  fibreTex = new THREE.CanvasTexture(c); fibreTex.wrapS = fibreTex.wrapT = THREE.RepeatWrapping; fibreTex.repeat.set(3, 1);
  return fibreTex;
}

// the body underneath: a darker sheath so the gaps between muscles read as anatomy, not holes
function baseGeometry() {
  const parts = [];
  const grid = (NU, NV, fn, closeV) => {
    const pos = [], idx = [];
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) { const p = fn(i / NU, j / NV); pos.push(p.x, p.y, p.z); }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  parts.push(grid(48, 64, (fu, fv) => torsoAt(lerp(0.795, 1.535, fu), fv * Math.PI * 2)));
  for (const s of [1, -1]) {
    for (const k of ["uarm", "farm", "thigh", "shin"]) parts.push(grid(24, 24, (fu, fv) => limbSurf(k, s, fu, fv * Math.PI * 2).p));
    const sph = new THREE.SphereGeometry(SHOULDER.R * 0.98, 24, 16); sph.translate(SHOULDER.C.x * s, SHOULDER.C.y, SHOULDER.C.z); parts.push(sph);
    for (const k of ["uarm", "farm", "thigh", "shin"]) {   // round the joints
      const L = LIMBS[k], r = L.r[L.r.length - 1][1];
      const j = new THREE.SphereGeometry(r * 1.02, 16, 12); j.translate(L.B.x * s, L.B.y, L.B.z); parts.push(j);
    }
  }
  parts.push(grid(16, 24, (fu, fv) => limbSurf("neck", 1, fu, fv * Math.PI * 2).p));
  // bottom of the pelvis
  const cap = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); cap.scale(0.15, 0.07, 0.1); cap.translate(0, 0.80, 0); parts.push(cap);
  return parts;
}

// head, hands and feet: smooth, non-muscle shapes
function extremities() {
  const parts = [];
  const head = new THREE.SphereGeometry(1, 40, 30); head.scale(0.086, 0.11, 0.1); head.translate(0, 1.685, 0.008); parts.push(head);
  const jaw = new THREE.SphereGeometry(1, 28, 18); jaw.scale(0.06, 0.055, 0.07); jaw.translate(0, 1.625, 0.022); parts.push(jaw);
  for (const s of [1, -1]) {
    const palm = new THREE.CapsuleGeometry(0.022, 0.05, 6, 12); palm.scale(0.75, 1, 1.55);
    palm.rotateZ(s * rad(6)); palm.translate(0.277 * s, 0.825, 0.032); parts.push(palm);
    const fingers = new THREE.CapsuleGeometry(0.017, 0.045, 6, 10); fingers.scale(0.8, 1, 1.6);
    fingers.rotateZ(s * rad(8)); fingers.rotateX(rad(-8)); fingers.translate(0.283 * s, 0.765, 0.04); parts.push(fingers);
    const thumb = new THREE.CapsuleGeometry(0.009, 0.035, 4, 8); thumb.rotateX(rad(-30));
    thumb.translate(0.272 * s, 0.81, 0.062); parts.push(thumb);
    const foot = new THREE.CapsuleGeometry(0.032, 0.15, 6, 12); foot.rotateX(Math.PI / 2); foot.scale(1.1, 0.75, 1);
    foot.translate(0.095 * s, 0.035, 0.055); parts.push(foot);
  }
  return parts;
}

export function buildBody() {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x434955, roughness: 0.9, metalness: 0 });
  for (const g of baseGeometry()) group.add(new THREE.Mesh(g, baseMat));
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x8d939e, roughness: 0.6, metalness: 0 });
  for (const g of extremities()) group.add(new THREE.Mesh(g, skinMat));
  const muscles = new Map(), centers = {};
  for (const def of P) for (const s of [1, -1]) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb7bcc5, roughness: 0.42, metalness: 0.04, side: THREE.DoubleSide, emissive: 0x000000,
      bumpMap: fibres(), bumpScale: 0.9 });
    const mesh = new THREE.Mesh(patchGeometry(def, s), mat);
    mesh.userData.muscleId = def.id; mesh.userData.side = s;
    group.add(mesh);
    if (!muscles.has(def.id)) muscles.set(def.id, []);
    muscles.get(def.id).push(mesh);
  }
  for (const [id, meshes] of muscles) {
    const box = new THREE.Box3(); meshes.forEach(m => { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); });
    centers[id] = box.getCenter(new THREE.Vector3());
  }
  return { group, muscles, centers };
}
