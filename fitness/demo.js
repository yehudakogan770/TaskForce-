// 3D exercise demonstrations: a jointed figure, the equipment each exercise needs, and a looping movement per exercise.
// Hands and feet are placed with two-bone inverse kinematics, so they stay on bars, handles, benches and the floor.
import * as THREE from "../vendor/three.module.min.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rad = d => d * Math.PI / 180;
const DOWN = V(0, -1, 0);

// ---------------------------------------------------------------- the figure
const SKIN = new THREE.MeshStandardMaterial({ color: 0xc8cdd5, roughness: 0.55, metalness: 0.02 });
const JOINT = new THREE.MeshStandardMaterial({ color: 0x8e95a1, roughness: 0.6 });
const SHORTS = new THREE.MeshStandardMaterial({ color: 0x3d63d6, roughness: 0.7 });
const SHIRT = new THREE.MeshStandardMaterial({ color: 0x2b3140, roughness: 0.75 });
const SHOE = new THREE.MeshStandardMaterial({ color: 0x1d2129, roughness: 0.6 });

const ell = (sx, sy, sz, mat, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mat); m.scale.set(sx, sy, sz); m.position.set(0, y, z); return m; };
const cap = (r, len, mat, y, sx = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), mat); m.position.y = y; m.scale.set(sx, 1, sz); return m; };
const node = (parent, x = 0, y = 0, z = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

export const L = { upper: 0.29, fore: 0.26, thigh: 0.44, shin: 0.42, ankle: 0.075 };

function buildFigure() {
  const root = new THREE.Object3D();
  root.add(ell(0.155, 0.1, 0.11, SHORTS));
  const spine = node(root, 0, 0.08, 0);
  spine.add(ell(0.135, 0.13, 0.1, SHIRT, 0.12));
  spine.add(ell(0.172, 0.165, 0.112, SHIRT, 0.3));
  const neck = node(spine, 0, 0.47, 0);
  neck.add(cap(0.045, 0.05, SKIN, 0.03));
  const head = node(neck, 0, 0.13, 0.01);
  head.add(ell(0.088, 0.11, 0.1, SKIN));
  head.add(ell(0.035, 0.03, 0.03, SKIN, -0.01, 0.095)); // nose and brow line give the face a direction
  const sides = {};
  for (const s of [1, -1]) {
    const sh = node(spine, 0.19 * s, 0.4, 0);
    sh.add(ell(0.058, 0.058, 0.058, SHIRT));
    sh.add(cap(0.045, 0.21, SKIN, -0.15));
    const el = node(sh, 0, -L.upper, 0);
    el.add(ell(0.04, 0.04, 0.04, JOINT));
    el.add(cap(0.036, 0.19, SKIN, -0.13));
    const wr = node(el, 0, -L.fore, 0);
    const hand = node(wr);
    hand.add(cap(0.025, 0.05, SKIN, -0.045, 0.75, 1.35));
    const grip = node(hand, 0, -0.06, 0);
    const hip = node(root, 0.09 * s, -0.05, 0);
    hip.add(cap(0.077, 0.27, SKIN, -0.22));
    hip.add(ell(0.08, 0.1, 0.085, SHORTS, -0.06));
    const kn = node(hip, 0, -L.thigh, 0);
    kn.add(ell(0.052, 0.05, 0.05, JOINT));
    kn.add(cap(0.053, 0.29, SKIN, -0.21));
    kn.add(ell(0.05, 0.1, 0.05, SKIN, -0.13, -0.025)); // calf
    const an = node(kn, 0, -L.shin, 0);
    const foot = node(an);
    const shoe = cap(0.038, 0.16, SHOE, 0); shoe.rotation.x = Math.PI / 2; shoe.position.set(0, -0.045, 0.06); shoe.scale.set(1.05, 1, 0.75);
    foot.add(shoe);
    const toe = node(foot, 0, -0.075, 0.17), heel = node(foot, 0, -0.075, -0.05);
    sides[s] = { sh, el, wr, hand, grip, hip, kn, an, foot, toe, heel, shBase: sh.position.y };
  }
  return { root, spine, neck, head, sides };
}

// ---------------------------------------------------------------- posing
const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
function aimBone(bone, from, to) {           // turn a bone so its -y axis points from `from` to `to` (world)
  const dir = to.clone().sub(from).normalize();
  tmpQ.setFromUnitVectors(DOWN, dir);
  bone.parent.getWorldQuaternion(tmpQ2);
  bone.quaternion.copy(tmpQ2.invert().multiply(tmpQ));
  bone.updateMatrixWorld(true);
}
function ik(upper, lower, end, target, pole, a, b) {
  const S = upper.getWorldPosition(new THREE.Vector3());
  let d = target.clone().sub(S); const len = Math.min(Math.max(d.length(), Math.abs(a - b) + 0.005), a + b - 0.003);
  d.normalize();
  const along = (a * a - b * b + len * len) / (2 * len), h = Math.sqrt(Math.max(0, a * a - along * along));
  const p = pole.clone().sub(d.clone().multiplyScalar(pole.dot(d)));
  if (p.lengthSq() < 1e-6) p.set(0, 0, 1); p.normalize();
  const E = S.clone().add(d.clone().multiplyScalar(along)).add(p.multiplyScalar(h));
  const T = S.clone().add(d.multiplyScalar(len));
  aimBone(upper, S, E);
  aimBone(lower, E, T);
  end.quaternion.identity();
}
function setFoot(side, fig, footSpec, forward) {
  const f = fig.sides[side].foot;
  if (footSpec === undefined || typeof footSpec === "number") {
    // flat on the ground (pointing along the body's forward direction), with an optional heel lift in degrees
    const fwd = forward.clone(); fwd.y = 0; fwd.normalize();
    const lift = rad(footSpec || 0);
    const z = fwd.clone().multiplyScalar(Math.cos(lift)).add(V(0, -Math.sin(lift), 0)).normalize();
    const x = new THREE.Vector3().crossVectors(V(0, 1, 0), z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    tmpQ.setFromRotationMatrix(tmpM.makeBasis(x, y, z));
    f.parent.getWorldQuaternion(tmpQ2);
    f.quaternion.copy(tmpQ2.invert().multiply(tmpQ));
  } else f.rotation.set(rad(footSpec.rel || 0), 0, 0); // relative to the shin, for lying and hanging positions
}

// pose fields: root {p:[x,y,z], r:[deg]}, sp/tw/sb spine bend, twist, side bend, nk neck,
// arm/armL/armR: {h:[x,y,z], pole} hand target (world, right side mirrored) or {sf, sa, el, sy} angles; el2 shoulder lift; wr wrist
// leg/legL/legR: {f:[x,y,z], pole, foot} ankle target or {hf, ha, kn, foot}
function applyPose(fig, P) {
  const { root, spine, neck, sides } = fig;
  root.position.set(...P.root.p);
  root.rotation.set(rad(P.root.r[0]), rad(P.root.r[1]), rad(P.root.r[2]));
  spine.rotation.set(rad(P.sp || 0), rad(P.tw || 0), rad(P.sb || 0));
  neck.rotation.set(rad(P.nk || 0), 0, 0);
  root.updateMatrixWorld(true);
  const forward = V(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
  for (const s of [1, -1]) {
    const S = sides[s], mirror = v => V(v[0] * s, v[1], v[2]);
    S.sh.position.y = S.shBase + (P.el2 || 0);
    S.sh.updateMatrixWorld(true);
    const arm = { ...(P.arm || {}), ...(s > 0 ? P.armL : P.armR) };
    if (arm.h) ik(S.sh, S.el, S.wr, s > 0 && P.armL?.h ? V(...P.armL.h) : s < 0 && P.armR?.h ? V(...P.armR.h) : mirror(arm.h), mirror(arm.pole || [0.5, -0.2, -1]), L.upper, L.fore);
    else {
      S.sh.rotation.set(-rad(arm.sf || 0), rad((arm.sy || 0) * s), s * rad(arm.sa ?? 6));
      S.el.rotation.set(-rad(arm.el ?? 8), 0, 0);
    }
    S.wr.rotation.set(-rad(P.wr || 0), 0, 0);
    const leg = { ...(P.leg || {}), ...(s > 0 ? P.legL : P.legR) };
    if (leg.f) {
      const target = s > 0 && P.legL?.f ? V(...P.legL.f) : s < 0 && P.legR?.f ? V(...P.legR.f) : mirror(leg.f);
      ik(S.hip, S.kn, S.an, target, mirror(leg.pole || [0.15, 0, 1]), L.thigh, L.shin);
    } else {
      S.hip.rotation.set(-rad(leg.hf || 0), 0, s * rad(leg.ha || 0));
      S.kn.rotation.set(rad(leg.kn || 0), 0, 0);
    }
    S.an.updateMatrixWorld(true);
    setFoot(s, fig, leg.foot, forward);
  }
  root.updateMatrixWorld(true);
}

// blend two poses: every number (and every number inside arrays and objects) is interpolated
function blend(a, b, t) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => blend(v, b[i], t));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const o = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = k in a && k in b ? blend(a[k], b[k], t) : (t < 0.5 ? a[k] ?? b[k] : b[k] ?? a[k]);
    return o;
  }
  return t < 0.5 ? a : b;
}

// ---------------------------------------------------------------- equipment
const STEEL = new THREE.MeshStandardMaterial({ color: 0xb7bcc4, roughness: 0.3, metalness: 0.85 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.55, metalness: 0.3 });
const PAD = new THREE.MeshStandardMaterial({ color: 0x2c3240, roughness: 0.8 });
const PLATE = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.5, metalness: 0.2 });
const MAT = new THREE.MeshStandardMaterial({ color: 0x3d63d6, roughness: 0.9 });
const WALL = new THREE.MeshStandardMaterial({ color: 0xd9dde4, roughness: 0.95 });
const CABLE = new THREE.LineBasicMaterial({ color: 0x8c93a2 });
const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cyl = (r, len, mat, axis = "x") => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), mat); if (axis === "x") m.rotation.z = Math.PI / 2; if (axis === "z") m.rotation.x = Math.PI / 2; return m; };
const gp = (fig, s) => fig.sides[s].grip.getWorldPosition(new THREE.Vector3());

function barbell(plates = true, len = 1.9) {
  const g = new THREE.Group(); g.add(cyl(0.014, len, STEEL));
  if (plates) for (const s of [1, -1]) for (let i = 0; i < 2; i++) { const p = cyl(0.225 - i * 0.04, 0.035, PLATE); p.position.x = s * (0.72 + i * 0.04); g.add(p); }
  else for (const s of [1, -1]) { const p = cyl(0.12, 0.03, PLATE); p.position.x = s * 0.5; g.add(p); }
  return g;
}
function dumbbell() {
  const g = new THREE.Group(); g.add(cyl(0.016, 0.16, STEEL));
  for (const s of [1, -1]) { const h = cyl(0.055, 0.06, PLATE); h.position.x = s * 0.1; g.add(h); }
  return g;
}
function kettlebell() {
  const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 18), PLATE); b.position.y = -0.11; g.add(b);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 24, Math.PI), STEEL); g.add(h); return g;
}
function bench(z0, z1, top = 0.43, tilt = 0) {     // pad from z0 to z1 (along the body), optional tilt in degrees
  const g = new THREE.Group(), len = z1 - z0, pad = box(0.3, 0.06, len, PAD, 0, 0, 0);
  const holder = new THREE.Group(); holder.add(pad); holder.position.set(0, top - 0.03, (z0 + z1) / 2); holder.rotation.x = rad(tilt); g.add(holder);
  for (const z of [z0 + 0.1, z1 - 0.1]) g.add(box(0.06, top - 0.06, 0.06, DARK, 0, (top - 0.06) / 2, z));
  g.add(box(0.06, 0.04, len - 0.1, DARK, 0, 0.02, (z0 + z1) / 2));
  return g;
}
function seat(y, z, backTilt = null, backZ = -0.12) {   // a seat, optionally with a backrest leaning back by backTilt degrees
  const g = new THREE.Group();
  g.add(box(0.4, 0.07, 0.4, PAD, 0, y - 0.035, z));
  g.add(box(0.07, y - 0.07, 0.07, DARK, 0, (y - 0.07) / 2, z));
  g.add(box(0.5, 0.04, 0.5, DARK, 0, 0.02, z));
  if (backTilt !== null) {
    const b = new THREE.Group(); b.add(box(0.36, 0.7, 0.07, PAD, 0, 0.35, 0)); b.position.set(0, y, z + backZ); b.rotation.x = -rad(backTilt); g.add(b);
  }
  return g;
}
function cableLine() {
  const geo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 1, 0)]);
  return new THREE.Line(geo, CABLE);
}
function tower(x, z, h = 2.2) {
  const g = new THREE.Group(); g.add(box(0.12, h, 0.12, DARK, x, h / 2, z)); g.add(box(0.4, 0.05, 0.4, DARK, x, 0.025, z));
  return g;
}
function setLine(line, a, b) { line.geometry.setFromPoints([a, b]); }

// each equipment kit: build(fig) adds static parts to the group and returns an update(fig) for the parts that follow the hands or feet
const KITS = {
  floor: () => ({}),
  mat: (scene, opts) => { const m = box(opts.w || 0.62, 0.012, opts.len || 1.85, MAT, opts.x || 0, 0.006, opts.z || 0); if (opts.ry) m.rotation.y = rad(opts.ry); scene.add(m); },
  wall: (scene, opts) => { scene.add(box(1.3, 2.0, 0.06, WALL, 0, 1.0, opts.z)); },
  bench: (scene, o) => { const b = bench(o.z0, o.z1, o.top, o.tilt || 0); b.position.x = o.x || 0; scene.add(b); },
  seat: (scene, o) => { scene.add(seat(o.y, o.z || 0, o.back ?? null, o.backZ)); },
  step: (scene, o) => { scene.add(box(0.6, o.h || 0.1, 0.24, PAD, 0, (o.h || 0.1) / 2, o.z || 0.05)); },
  rack: (scene, o) => { for (const s of [1, -1]) { scene.add(box(0.07, 1.9, 0.07, DARK, s * 0.62, 0.95, o.z || -0.3)); scene.add(box(0.12, 0.04, 0.16, STEEL, s * 0.6, o.y || 1.45, (o.z || -0.3) + 0.06)); } },
  pullbar: (scene, o) => {
    const y = o.y || 2.25; const bar = cyl(0.016, 1.3, STEEL); bar.position.set(0, y, o.z || 0); scene.add(bar);
    for (const s of [1, -1]) scene.add(box(0.07, y + 0.1, 0.07, DARK, s * 0.68, (y + 0.1) / 2, (o.z || 0) - 0.05));
  },
  barbell: (scene, o) => {
    const b = barbell(o.plates !== false, o.len || 1.9); scene.add(b);
    return fig => { const a = gp(fig, 1), c = gp(fig, -1); b.position.copy(a).add(c).multiplyScalar(0.5); b.lookAt(a.clone().add(c).multiplyScalar(0.5).add(a.clone().sub(c).cross(V(0, 1, 0)).normalize())); b.rotateY(Math.PI / 2); };
  },
  ezbar: (scene, o) => KITS.barbell(scene, { plates: false, len: 1.2 }),
  dumbbells: (scene, o) => {
    const d = [dumbbell(), dumbbell()]; d.forEach(x => scene.add(x));
    return fig => [1, -1].forEach((s, i) => {
      const hand = fig.sides[s].hand; d[i].position.copy(gp(fig, s));
      hand.getWorldQuaternion(d[i].quaternion);
      if (o.hammer) d[i].rotateX(Math.PI / 2); else d[i].rotateY(o.along ? Math.PI / 2 : 0);
    });
  },
  dumbbell1: (scene) => {     // one dumbbell held by both hands, standing on end
    const d = dumbbell(); d.rotation.z = Math.PI / 2; scene.add(d);
    return fig => { d.position.copy(gp(fig, 1)).add(gp(fig, -1)).multiplyScalar(0.5); d.position.y += 0.06; };
  },
  kettlebell: (scene) => { const k = kettlebell(); scene.add(k); return fig => { k.position.copy(gp(fig, 1)).add(gp(fig, -1)).multiplyScalar(0.5); }; },
  plateOnHips: (scene) => { const b = barbell(true, 1.6); scene.add(b); return fig => { const p = fig.root.getWorldPosition(new THREE.Vector3()); const f = V(0, 0, 1).applyQuaternion(fig.root.getWorldQuaternion(new THREE.Quaternion())); b.position.copy(p).add(f.multiplyScalar(0.13)); }; },
  plateOnKnees: (scene) => { const p = cyl(0.17, 0.05, PLATE, "y"); scene.add(p); return fig => { p.position.copy(fig.sides[1].kn.getWorldPosition(new THREE.Vector3())).add(fig.sides[-1].kn.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5); p.position.y += 0.07; p.position.z -= 0.06; }; },
  // a cable from a fixed pulley to the hands (mid point) or to one ankle; with an optional bar or rope between the hands
  cable: (scene, o) => {
    for (const x of (o.towers || [0])) scene.add(tower(x, o.p[2] + (o.tz || 0.05), Math.max(o.p[1] + 0.15, 1.2)));
    const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 20), STEEL);
    const lines = (o.dual ? [1, -1] : [0]).map(() => { const l = cableLine(); scene.add(l); return l; });
    const pulleys = (o.dual ? [1, -1] : [0]).map(s => { const p = pulley.clone(); p.position.set(o.p[0] * (s || 1), o.p[1], o.p[2]); scene.add(p); return p; });
    let bar = null;
    if (o.bar) { bar = cyl(0.013, o.bar, STEEL); scene.add(bar); }
    return fig => {
      if (o.dual) [1, -1].forEach((s, i) => setLine(lines[i], pulleys[i].position, gp(fig, s)));
      else {
        const end = o.ankle ? fig.sides[o.ankle].an.getWorldPosition(new THREE.Vector3()) : gp(fig, 1).add(gp(fig, -1)).multiplyScalar(0.5);
        setLine(lines[0], pulleys[0].position, end);
        if (bar) { bar.position.copy(end); }
      }
    };
  },
  parallelBars: (scene) => { for (const s of [1, -1]) { const b = cyl(0.02, 1.0, STEEL, "z"); b.position.set(s * 0.27, 1.15, 0.1); scene.add(b); scene.add(box(0.05, 1.15, 0.05, DARK, s * 0.27, 0.575, -0.35)); scene.add(box(0.05, 1.15, 0.05, DARK, s * 0.27, 0.575, 0.55)); } },
  // pads that follow a joint (leg extension, leg curl, hip machines)
  anklePad: (scene, o) => { const p = cyl(0.045, 0.34, PAD); scene.add(p); return fig => { p.position.copy(fig.sides[1].an.getWorldPosition(new THREE.Vector3())).add(fig.sides[-1].an.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5); p.position.z += o.dz || 0.05; p.position.y += o.dy || 0; }; },
  kneePads: (scene, o) => { const ps = [1, -1].map(() => { const p = box(0.05, 0.16, 0.16, PAD, 0, 0, 0); scene.add(p); return p; }); return fig => [1, -1].forEach((s, i) => { ps[i].position.copy(fig.sides[s].kn.getWorldPosition(new THREE.Vector3())); ps[i].position.x += s * (o.inside ? -0.075 : 0.075); ps[i].position.z -= 0.08; }); },
  sled: (scene, o) => {      // leg press: reclined seat, rails, and a foot platform that moves with the feet
    const back = new THREE.Group(); back.add(box(0.42, 0.8, 0.07, PAD, 0, 0.4, 0)); back.position.set(0, 0.36, -0.12); back.rotation.x = -rad(55); scene.add(back);
    scene.add(box(0.46, 0.07, 0.42, PAD, 0, 0.36, 0.1)); scene.add(box(0.08, 0.32, 0.08, DARK, 0, 0.16, 0.1));
    for (const s of [1, -1]) { const r = box(0.05, 0.05, 1.6, DARK, s * 0.32, 0, 0); r.position.set(s * 0.32, 0.75, 0.7); r.rotation.x = -rad(45); scene.add(r); }
    const plat = box(0.62, 0.05, 0.48, DARK, 0, 0, 0); scene.add(plat);
    return fig => { const a = fig.sides[1].heel.getWorldPosition(new THREE.Vector3()).add(fig.sides[-1].toe.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5); plat.position.copy(a).add(V(0, 0.035, 0.035)); plat.rotation.x = rad(-45); };
  },
  preacher: (scene, o) => { const g = new THREE.Group(); g.add(box(0.5, 0.06, 0.34, PAD, 0, 0, 0)); g.position.set(0, o.y, o.z); g.rotation.x = rad(45); scene.add(g); scene.add(box(0.07, o.y, 0.07, DARK, 0, o.y / 2, o.z + 0.05)); },
  hyper: (scene) => {        // 45° back extension bench
    const pad = box(0.36, 0.08, 0.3, PAD, 0, 0, 0); pad.position.set(0, 0.95, 0.06); pad.rotation.x = rad(45); scene.add(pad);
    const frame = box(0.08, 0.08, 1.5, DARK, 0, 0, 0); frame.position.set(0, 0.55, -0.25); frame.rotation.x = rad(-38); scene.add(frame);
    scene.add(box(0.4, 0.04, 0.3, DARK, 0, 0.28, -0.6)); const roll = cyl(0.04, 0.34, PAD); roll.position.set(0, 0.48, -0.47); scene.add(roll);
  },
  frame: (scene, o) => { scene.add(box(1.0, 0.05, 0.05, STEEL, 0, o.y || 1.15, o.z || 0.62)); },
};

// ---------------------------------------------------------------- the exercises
// keys: poses in order; the movement goes through them and back to the first. hold: seconds to pause on each key.
const ST = { p: [0, 0.985, 0], r: [0, 0, 0] };         // standing pelvis
const FEET = { f: [0.11, 0.075, 0.02], pole: [0.1, 0, 1] };
const SUP = (y, z) => ({ p: [0, y, z], r: [-90, 0, 0] });   // lying on the back, head toward -z
const benchFeet = { f: [0.21, 0.075, 0.62], pole: [0.2, 1, 0.4] };

export const DEMOS = {
  bench_press: { kit: [["bench", { z0: -0.75, z1: 0.45 }], ["barbell", {}], ["rack", { z: -0.55, y: 1.0 }]], cam: { yaw: 50, pitch: 18, dist: 2.8, y: 0.7 },
    keys: [{ root: SUP(0.53, 0.25), leg: benchFeet, arm: { h: [0.4, 1.06, -0.18], pole: [1, -1, 0] } }, { root: SUP(0.53, 0.25), leg: benchFeet, arm: { h: [0.41, 0.66, -0.12], pole: [1, -1, 0] } }] },
  incline_press: { kit: [["seat", { y: 0.47, z: 0.12, back: 50, backZ: -0.12 }], ["barbell", {}]], cam: { yaw: 60, pitch: 15, dist: 2.9, y: 0.85 },
    keys: [{ root: { p: [0, 0.55, 0.12], r: [-50, 0, 0] }, leg: { f: [0.21, 0.075, 0.58], pole: [0.2, 1, 0.4] }, arm: { h: [0.39, 1.35, -0.12], pole: [1, -1, 0] } },
      { root: { p: [0, 0.55, 0.12], r: [-50, 0, 0] }, leg: { f: [0.21, 0.075, 0.58], pole: [0.2, 1, 0.4] }, arm: { h: [0.41, 1.0, 0.0], pole: [1, -1, -0.3] } }] },
  decline_press: { kit: [["bench", { z0: -0.7, z1: 0.42, top: 0.48, tilt: -18 }], ["anklePad", { dz: 0.06, dy: -0.02 }], ["barbell", {}]], cam: { yaw: 55, pitch: 15, dist: 2.8, y: 0.6 },
    keys: [{ root: { p: [0, 0.68, 0.24], r: [-108, 0, 0] }, leg: { f: [0.12, 0.33, 0.6], pole: [0, 1, 0.3], foot: { rel: 20 } }, arm: { h: [0.39, 1.05, -0.16], pole: [1, -1, 0] } },
      { root: { p: [0, 0.68, 0.24], r: [-108, 0, 0] }, leg: { f: [0.12, 0.33, 0.6], pole: [0, 1, 0.3], foot: { rel: 20 } }, arm: { h: [0.41, 0.66, -0.2], pole: [1, -1, 0] } }] },
  dumbbell_fly: { kit: [["bench", { z0: -0.75, z1: 0.45 }], ["dumbbells", { along: true }]], cam: { yaw: 25, pitch: 30, dist: 2.8, y: 0.65 },
    keys: [{ root: SUP(0.53, 0.25), leg: benchFeet, arm: { h: [0.1, 1.04, -0.2], pole: [1, 0, 0] } }, { root: SUP(0.53, 0.25), leg: benchFeet, arm: { h: [0.66, 0.66, -0.2], pole: [0.3, -1, 0] } }] },
  push_up: { kit: [["mat", { z: 0.1 }]], cam: { yaw: 70, pitch: 12, dist: 2.7, y: 0.35 },
    keys: [{ root: { p: [0, 0.38, 0.29], r: [69, 0, 0] }, arm: { h: [0.26, 0.03, 0.76], pole: [0.6, 0.2, -1] }, leg: { hf: 0, kn: 0, foot: { rel: 62 } } },
      { root: { p: [0, 0.19, 0.34], r: [81, 0, 0] }, arm: { h: [0.26, 0.03, 0.76], pole: [0.6, 0.4, -1] }, leg: { hf: 0, kn: 0, foot: { rel: 72 } } }] },
  cable_crossover: { kit: [["cable", { p: [0.95, 1.95, -0.15], dual: true, towers: [0.95, -0.95] }]], cam: { yaw: 35, pitch: 12, dist: 3.3, y: 1.0 },
    keys: [{ root: { p: [0, 0.96, 0.05], r: [14, 0, 0] }, legL: { f: [0.12, 0.075, 0.3] }, legR: { f: [-0.12, 0.075, -0.25] }, leg: { pole: [0.1, 0, 1] }, arm: { h: [0.66, 1.42, 0.12], pole: [0, 1, -0.6] } },
      { root: { p: [0, 0.96, 0.05], r: [14, 0, 0] }, legL: { f: [0.12, 0.075, 0.3] }, legR: { f: [-0.12, 0.075, -0.25] }, leg: { pole: [0.1, 0, 1] }, arm: { h: [0.07, 1.02, 0.45], pole: [1, 0.3, -1] } }] },
  pull_up: { kit: [["pullbar", { y: 2.25 }]], cam: { yaw: 30, pitch: 8, dist: 3.4, y: 1.4 },
    keys: [{ root: { p: [0, 1.2, 0], r: [0, 0, 0] }, arm: { h: [0.36, 2.25, 0.0], pole: [1, -0.3, 0] }, leg: { hf: 8, kn: 25, foot: { rel: 25 } } },
      { root: { p: [0, 1.6, 0.03], r: [-4, 0, 0] }, arm: { h: [0.36, 2.25, 0.0], pole: [1, -1, -0.2] }, leg: { hf: 12, kn: 35, foot: { rel: 25 } } }] },
  lat_pulldown: { kit: [["seat", { y: 0.48, z: 0 }], ["cable", { p: [0, 2.25, 0.12], bar: 1.1 }], ["frame", { y: 0.72, z: 0.22 }]], cam: { yaw: 40, pitch: 10, dist: 3.1, y: 1.1 },
    keys: [{ root: { p: [0, 0.56, 0], r: [-12, 0, 0] }, leg: { f: [0.15, 0.075, 0.5], pole: [0.2, 1, 0.5] }, arm: { h: [0.42, 1.84, 0.12], pole: [1, -0.4, 0] } },
      { root: { p: [0, 0.56, 0], r: [-16, 0, 0] }, leg: { f: [0.15, 0.075, 0.5], pole: [0.2, 1, 0.5] }, arm: { h: [0.4, 1.3, 0.14], pole: [1, -1, -0.4] } }] },
  barbell_row: { kit: [["barbell", {}]], cam: { yaw: 70, pitch: 10, dist: 3.0, y: 0.7 },
    keys: [{ root: { p: [0, 0.9, -0.12], r: [50, 0, 0] }, leg: { f: [0.13, 0.075, 0.02], pole: [0.1, 0, 1] }, arm: { h: [0.25, 0.46, 0.24], pole: [0.3, 0, -1] } },
      { root: { p: [0, 0.9, -0.12], r: [50, 0, 0] }, leg: { f: [0.13, 0.075, 0.02], pole: [0.1, 0, 1] }, arm: { h: [0.26, 0.78, 0.06], pole: [0.3, 0, -1] } }] },
  seated_row: { kit: [["seat", { y: 0.32, z: -0.2 }], ["cable", { p: [0, 0.55, 1.05], bar: 0.22 }], ["step", { h: 0.24, z: 0.62 }]], cam: { yaw: 75, pitch: 10, dist: 3.0, y: 0.6 },
    keys: [{ root: { p: [0, 0.4, -0.2], r: [-2, 0, 0] }, leg: { f: [0.12, 0.31, 0.45], pole: [0.1, 1, 0.3] }, arm: { h: [0.11, 0.66, 0.42], pole: [0.4, -1, 0] } },
      { root: { p: [0, 0.4, -0.2], r: [-8, 0, 0] }, leg: { f: [0.12, 0.31, 0.45], pole: [0.1, 1, 0.3] }, arm: { h: [0.13, 0.66, 0.06], pole: [0.4, 0, -1] } }] },
  deadlift: { kit: [["barbell", {}]], cam: { yaw: 75, pitch: 8, dist: 3.0, y: 0.7 },
    keys: [{ root: { p: [0, 0.66, -0.16], r: [46, 0, 0] }, leg: { f: [0.13, 0.075, 0.0], pole: [0.25, 0, 1] }, arm: { h: [0.24, 0.235, 0.07], pole: [0.2, 0, -1] } },
      { root: ST, leg: { f: [0.13, 0.075, 0.0], pole: [0.25, 0, 1] }, arm: { h: [0.23, 0.74, 0.1], pole: [0.2, 0, -1] } }], hold: [0.5, 0.4] },
  shrug: { kit: [["barbell", {}]], cam: { yaw: 35, pitch: 10, dist: 2.8, y: 1.0 },
    keys: [{ root: ST, leg: FEET, arm: { h: [0.23, 0.74, 0.1], pole: [0.2, 0, -1] } }, { root: ST, el2: 0.055, leg: FEET, arm: { h: [0.23, 0.795, 0.1], pole: [0.2, 0, -1] } }] },
  shoulder_press: { kit: [["seat", { y: 0.47, z: 0, back: 8, backZ: -0.14 }], ["dumbbells", {}]], cam: { yaw: 30, pitch: 10, dist: 3.0, y: 1.0 },
    keys: [{ root: { p: [0, 0.55, 0], r: [-4, 0, 0] }, leg: { f: [0.2, 0.075, 0.42], pole: [0.2, 1, 0.5] }, arm: { h: [0.31, 1.06, 0.06], pole: [1, -1, 0] } },
      { root: { p: [0, 0.55, 0], r: [-4, 0, 0] }, leg: { f: [0.2, 0.075, 0.42], pole: [0.2, 1, 0.5] }, arm: { h: [0.15, 1.56, 0.02], pole: [1, 0, 0] } }] },
  lateral_raise: { kit: [["dumbbells", { along: true }]], cam: { yaw: 15, pitch: 8, dist: 3.0, y: 1.0 },
    keys: [{ root: { ...ST, r: [6, 0, 0] }, leg: FEET, arm: { sf: 8, sa: 10, el: 15 } }, { root: { ...ST, r: [6, 0, 0] }, leg: FEET, arm: { sf: 8, sa: 85, el: 18 } }] },
  front_raise: { kit: [["dumbbells", {}]], cam: { yaw: 70, pitch: 8, dist: 3.0, y: 1.0 },
    keys: [{ root: ST, leg: FEET, arm: { sf: 8, sa: 5, el: 10 } }, { root: ST, leg: FEET, arm: { sf: 88, sa: 5, el: 10 } }] },
  rear_delt_fly: { kit: [["dumbbells", { along: true }]], cam: { yaw: 30, pitch: 25, dist: 3.0, y: 0.8 },
    keys: [{ root: { p: [0, 0.92, -0.12], r: [68, 0, 0] }, leg: { f: [0.13, 0.075, 0.02], pole: [0.1, 0, 1] }, arm: { h: [0.13, 0.55, 0.38], pole: [1, -0.3, 0] } },
      { root: { p: [0, 0.92, -0.12], r: [68, 0, 0] }, leg: { f: [0.13, 0.075, 0.02], pole: [0.1, 0, 1] }, arm: { h: [0.63, 0.99, 0.36], pole: [0, -1, -0.2] } }] },
  face_pull: { kit: [["cable", { p: [0, 1.62, 1.3], bar: 0.18 }]], cam: { yaw: 55, pitch: 10, dist: 3.2, y: 1.2 },
    keys: [{ root: ST, leg: { f: [0.15, 0.075, 0.02] }, arm: { h: [0.08, 1.56, 0.66], pole: [1, -0.5, 0] } },
      { root: ST, leg: { f: [0.15, 0.075, 0.02] }, arm: { h: [0.29, 1.66, 0.14], pole: [1, 0.6, -0.4] } }] },
  barbell_curl: { kit: [["ezbar", {}]], cam: { yaw: 70, pitch: 8, dist: 2.8, y: 1.0 },
    keys: [{ root: ST, leg: FEET, arm: { sf: 2, sa: 8, el: 8 } }, { root: ST, leg: FEET, arm: { sf: 12, sa: 8, el: 138 } }] },
  dumbbell_curl: { kit: [["dumbbells", { along: true }]], cam: { yaw: 60, pitch: 8, dist: 2.8, y: 1.0 },
    keys: [{ root: ST, leg: FEET, arm: { sf: 2, sa: 6, el: 8 } }, { root: ST, leg: FEET, arm: { sf: 10, sa: 6, el: 135 } }] },
  hammer_curl: { kit: [["dumbbells", { hammer: true }]], cam: { yaw: 60, pitch: 8, dist: 2.8, y: 1.0 },
    keys: [{ root: ST, leg: FEET, arm: { sf: 2, sa: 6, el: 8, sy: 0 } }, { root: ST, leg: FEET, arm: { sf: 10, sa: 6, el: 130 } }] },
  preacher_curl: { kit: [["seat", { y: 0.5, z: -0.1 }], ["preacher", { y: 0.95, z: 0.28 }], ["ezbar", {}]], cam: { yaw: 70, pitch: 10, dist: 2.8, y: 0.9 },
    keys: [{ root: { p: [0, 0.58, -0.1], r: [12, 0, 0] }, leg: { f: [0.18, 0.075, 0.3], pole: [0.2, 1, 0.5] }, arm: { sf: 52, sa: 10, el: 25 } },
      { root: { p: [0, 0.58, -0.1], r: [12, 0, 0] }, leg: { f: [0.18, 0.075, 0.3], pole: [0.2, 1, 0.5] }, arm: { sf: 52, sa: 10, el: 125 } }] },
  cable_curl: { kit: [["cable", { p: [0, 0.15, 0.7], bar: 0.5 }]], cam: { yaw: 65, pitch: 8, dist: 3.0, y: 1.0 },
    keys: [{ root: ST, leg: FEET, arm: { sf: 6, sa: 8, el: 10 } }, { root: ST, leg: FEET, arm: { sf: 12, sa: 8, el: 135 } }] },
  pushdown: { kit: [["cable", { p: [0, 2.0, 0.42], bar: 0.42 }]], cam: { yaw: 65, pitch: 8, dist: 3.0, y: 1.1 },
    keys: [{ root: { ...ST, r: [8, 0, 0] }, leg: FEET, arm: { sf: 2, sa: 6, el: 100 } }, { root: { ...ST, r: [8, 0, 0] }, leg: FEET, arm: { sf: 2, sa: 6, el: 6 } }] },
  overhead_extension: { kit: [["seat", { y: 0.47, z: 0, back: 4, backZ: -0.14 }], ["dumbbell1", {}]], cam: { yaw: 70, pitch: 8, dist: 2.9, y: 1.1 },
    keys: [{ root: { p: [0, 0.55, 0], r: [-2, 0, 0] }, leg: { f: [0.2, 0.075, 0.42], pole: [0.2, 1, 0.5] }, arm: { sf: 168, sa: -9, el: 8 } },
      { root: { p: [0, 0.55, 0], r: [-2, 0, 0] }, leg: { f: [0.2, 0.075, 0.42], pole: [0.2, 1, 0.5] }, arm: { sf: 168, sa: -9, el: 135 } }] },
  skull_crusher: { kit: [["bench", { z0: -0.75, z1: 0.45 }], ["ezbar", {}]], cam: { yaw: 70, pitch: 15, dist: 2.7, y: 0.7 },
    keys: [{ root: SUP(0.53, 0.25), leg: benchFeet, arm: { sf: 100, sa: 6, el: 6 } }, { root: SUP(0.53, 0.25), leg: benchFeet, arm: { sf: 108, sa: 6, el: 118 } }] },
  close_grip_bench: { kit: [["bench", { z0: -0.75, z1: 0.45 }], ["barbell", {}], ["rack", { z: -0.55, y: 1.0 }]], cam: { yaw: 50, pitch: 18, dist: 2.8, y: 0.7 },
    keys: [{ root: SUP(0.53, 0.25), leg: benchFeet, arm: { h: [0.2, 1.06, -0.14], pole: [0.4, -1, 0.5] } }, { root: SUP(0.53, 0.25), leg: benchFeet, arm: { h: [0.21, 0.66, -0.02], pole: [0.4, -1, 0.6] } }] },
  bench_dip: { kit: [["bench", { z0: -0.85, z1: -0.15 }]], cam: { yaw: 70, pitch: 10, dist: 2.8, y: 0.55 },
    keys: [{ root: { p: [0, 0.6, 0.0], r: [-4, 0, 0] }, arm: { h: [0.2, 0.45, -0.2], pole: [0.1, 0, -1] }, leg: { f: [0.12, 0.06, 0.78], pole: [0, 1, 0], foot: { rel: -10 } } },
      { root: { p: [0, 0.36, 0.03], r: [-4, 0, 0] }, arm: { h: [0.2, 0.45, -0.2], pole: [0.1, 0, -1] }, leg: { f: [0.12, 0.06, 0.78], pole: [0, 1, 0], foot: { rel: -10 } } }] },
  wrist_curl: { kit: [["seat", { y: 0.47, z: 0 }], ["dumbbells", { along: true }]], cam: { yaw: 75, pitch: 15, dist: 2.4, y: 0.6 },
    keys: [{ root: { p: [0, 0.55, 0], r: [28, 0, 0] }, leg: { f: [0.17, 0.075, 0.44], pole: [0.2, 1, 0.4] }, arm: { h: [0.13, 0.6, 0.5], pole: [0.4, -1, -0.2] }, wr: -45 },
      { root: { p: [0, 0.55, 0], r: [28, 0, 0] }, leg: { f: [0.17, 0.075, 0.44], pole: [0.2, 1, 0.4] }, arm: { h: [0.13, 0.6, 0.5], pole: [0.4, -1, -0.2] }, wr: 50 }] },
  reverse_wrist_curl: { kit: [["seat", { y: 0.47, z: 0 }], ["dumbbells", { along: true }]], cam: { yaw: 75, pitch: 15, dist: 2.4, y: 0.6 },
    keys: [{ root: { p: [0, 0.55, 0], r: [28, 0, 0] }, leg: { f: [0.17, 0.075, 0.44], pole: [0.2, 1, 0.4] }, arm: { h: [0.13, 0.6, 0.5], pole: [0.4, -1, -0.2] }, wr: 40 },
      { root: { p: [0, 0.55, 0], r: [28, 0, 0] }, leg: { f: [0.17, 0.075, 0.44], pole: [0.2, 1, 0.4] }, arm: { h: [0.13, 0.6, 0.5], pole: [0.4, -1, -0.2] }, wr: -40 }] },
  farmers_carry: { kit: [["dumbbells", { along: true }]], cam: { yaw: 70, pitch: 8, dist: 3.0, y: 0.9 },
    keys: [{ root: { p: [0, 0.97, 0], r: [0, 0, 0] }, legL: { f: [0.11, 0.075, 0.2] }, legR: { f: [-0.11, 0.11, -0.18], foot: 25 }, arm: { sf: 0, sa: 10, el: 5 } },
      { root: { p: [0, 0.97, 0], r: [0, 0, 0] }, legL: { f: [0.11, 0.11, -0.18], foot: 25 }, legR: { f: [-0.11, 0.075, 0.2] }, arm: { sf: 0, sa: 10, el: 5 } }], hold: [0.05, 0.05] },
  crunch: { kit: [["mat", {}]], cam: { yaw: 75, pitch: 15, dist: 2.6, y: 0.3 },
    keys: [{ root: SUP(0.1, 0), leg: { f: [0.13, 0.075, 0.42], pole: [0, 1, 0.3] }, arm: { sf: 160, sa: 45, el: 135 } }, { root: SUP(0.1, 0), sp: 38, nk: 10, leg: { f: [0.13, 0.075, 0.42], pole: [0, 1, 0.3] }, arm: { sf: 160, sa: 45, el: 135 } }] },
  hanging_leg_raise: { kit: [["pullbar", { y: 2.25 }]], cam: { yaw: 70, pitch: 5, dist: 3.4, y: 1.3 },
    keys: [{ root: { p: [0, 1.2, 0], r: [0, 0, 0] }, arm: { h: [0.36, 2.25, 0], pole: [1, -0.3, 0] }, leg: { hf: 0, kn: 4, foot: { rel: 20 } } },
      { root: { p: [0, 1.2, 0.04], r: [-12, 0, 0] }, arm: { h: [0.36, 2.25, 0], pole: [1, -0.3, 0] }, leg: { hf: 100, kn: 8, foot: { rel: 20 } } }] },
  cable_crunch: { kit: [["mat", { z: -0.1 }], ["cable", { p: [0, 2.1, 0.5], bar: 0.16 }]], cam: { yaw: 70, pitch: 10, dist: 2.9, y: 0.8 },
    keys: [{ root: { p: [0, 0.56, 0], r: [8, 0, 0] }, leg: { f: [0.13, 0.08, -0.4], pole: [0, -1, 1], foot: { rel: 40 } }, arm: { sf: 155, sa: 30, el: 140 } },
      { root: { p: [0, 0.56, 0], r: [16, 0, 0] }, sp: 58, nk: 15, leg: { f: [0.13, 0.08, -0.4], pole: [0, -1, 1], foot: { rel: 40 } }, arm: { sf: 155, sa: 30, el: 140 } }] },
  russian_twist: { kit: [["mat", {}]], cam: { yaw: 20, pitch: 20, dist: 2.6, y: 0.4 },
    keys: [{ root: { p: [0, 0.12, 0], r: [-42, 0, 0] }, tw: 0, leg: { f: [0.13, 0.075, 0.46], pole: [0, 1, 0.3] }, arm: { sf: 70, sa: -22, el: 72 } },
      { root: { p: [0, 0.12, 0], r: [-42, 0, 0] }, tw: -38, leg: { f: [0.13, 0.075, 0.46], pole: [0, 1, 0.3] }, arm: { sf: 70, sa: -22, el: 72 } },
      { root: { p: [0, 0.12, 0], r: [-42, 0, 0] }, tw: 0, leg: { f: [0.13, 0.075, 0.46], pole: [0, 1, 0.3] }, arm: { sf: 70, sa: -22, el: 72 } },
      { root: { p: [0, 0.12, 0], r: [-42, 0, 0] }, tw: 38, leg: { f: [0.13, 0.075, 0.46], pole: [0, 1, 0.3] }, arm: { sf: 70, sa: -22, el: 72 } }], hold: [0.05, 0.25, 0.05, 0.25] },
  plank: { kit: [["mat", { z: 0.1 }]], cam: { yaw: 70, pitch: 12, dist: 2.7, y: 0.3 },
    keys: [{ root: { p: [0, 0.23, 0.33], r: [78, 0, 0] }, arm: { sf: 76, sa: 8, el: 92 }, leg: { hf: 0, kn: 0, foot: { rel: 68 } } },
      { root: { p: [0, 0.235, 0.33], r: [78, 0, 0] }, sp: -1, arm: { sf: 76, sa: 8, el: 92 }, leg: { hf: 0, kn: 0, foot: { rel: 68 } } }], hold: [1.2, 1.2] },
  side_plank: { kit: [["mat", { ry: 90 }]], cam: { yaw: 0, pitch: 10, dist: 2.8, y: 0.4 },
    keys: [{ root: { p: [-0.05, 0.3, 0], r: [0, 0, 77] }, armR: { h: [-0.66, 0.03, 0.08], pole: [0, 0, 1] }, armL: { sf: 0, sa: 4, el: 5 }, leg: { hf: 0, kn: 0, ha: 0, foot: { rel: 0 } } },
      { root: { p: [-0.05, 0.31, 0], r: [0, 0, 78] }, armR: { h: [-0.66, 0.03, 0.08], pole: [0, 0, 1] }, armL: { sf: 0, sa: 4, el: 5 }, leg: { hf: 0, kn: 0, ha: 0, foot: { rel: 0 } } }], hold: [1.2, 1.2] },
  back_extension: { kit: [["hyper", {}]], cam: { yaw: 75, pitch: 10, dist: 3.0, y: 0.8 },
    keys: [{ root: { p: [0, 0.95, 0.02], r: [-45, 180, 0] }, leg: { f: [0.12, 0.38, -0.58], pole: [0, 0, -1], foot: 0 }, arm: { sf: 150, sa: 40, el: 140 } },
      { root: { p: [0, 0.95, 0.02], r: [-110, 180, 0] }, leg: { f: [0.12, 0.38, -0.58], pole: [0, 0, -1], foot: 0 }, arm: { sf: 150, sa: 40, el: 140 } }] },
  dead_bug: { kit: [["mat", {}]], cam: { yaw: 60, pitch: 25, dist: 2.6, y: 0.3 },
    keys: [{ root: SUP(0.1, 0), arm: { sf: 90, sa: 6, el: 5 }, leg: { hf: 90, kn: 90, foot: { rel: 10 } } },
      { root: SUP(0.1, 0), armL: { sf: 170, sa: 6, el: 5 }, armR: { sf: 90, sa: 6, el: 5 }, legL: { hf: 90, kn: 90, foot: { rel: 10 } }, legR: { hf: 12, kn: 6, foot: { rel: 10 } } },
      { root: SUP(0.1, 0), arm: { sf: 90, sa: 6, el: 5 }, leg: { hf: 90, kn: 90, foot: { rel: 10 } } },
      { root: SUP(0.1, 0), armR: { sf: 170, sa: 6, el: 5 }, armL: { sf: 90, sa: 6, el: 5 }, legR: { hf: 90, kn: 90, foot: { rel: 10 } }, legL: { hf: 12, kn: 6, foot: { rel: 10 } } }] },
  hip_thrust: { kit: [["bench", { z0: -0.75, z1: -0.42, top: 0.43 }], ["plateOnHips", {}]], cam: { yaw: 75, pitch: 10, dist: 2.8, y: 0.5 },
    keys: [{ root: { p: [0, 0.24, -0.06], r: [-58, 0, 0] }, leg: { f: [0.16, 0.075, 0.42], pole: [0.2, 1, 0.4] }, arm: { sf: 25, sa: 30, el: 60 } },
      { root: { p: [0, 0.5, -0.02], r: [-90, 0, 0] }, leg: { f: [0.16, 0.075, 0.42], pole: [0.2, 1, 0.4] }, arm: { sf: 25, sa: 30, el: 60 } }] },
  glute_bridge: { kit: [["mat", {}]], cam: { yaw: 75, pitch: 10, dist: 2.6, y: 0.3 },
    keys: [{ root: SUP(0.1, 0), leg: { f: [0.14, 0.075, 0.4], pole: [0, 1, 0.3] }, arm: { sf: 0, sa: 14, el: 0 } },
      { root: { p: [0, 0.33, 0.04], r: [-117, 0, 0] }, leg: { f: [0.14, 0.075, 0.4], pole: [0, 1, 0.3] }, arm: { sf: 0, sa: 14, el: 0 } }] },
  cable_kickback: { kit: [["cable", { p: [-0.12, 0.1, 0.85] }], ["frame", { y: 1.12, z: 0.66 }]], cam: { yaw: 80, pitch: 8, dist: 3.0, y: 0.8 },
    keys: [{ root: { p: [0, 0.97, 0], r: [18, 0, 0] }, legL: { f: [0.11, 0.075, 0.08] }, legR: { hf: 0, kn: 12, foot: { rel: 20 } }, arm: { h: [0.22, 1.12, 0.62], pole: [0.5, -1, 0] } },
      { root: { p: [0, 0.97, 0], r: [18, 0, 0] }, legL: { f: [0.11, 0.075, 0.08] }, legR: { hf: -38, kn: 6, foot: { rel: 30 } }, arm: { h: [0.22, 1.12, 0.62], pole: [0.5, -1, 0] } }] },
  hip_abduction: { kit: [["seat", { y: 0.5, z: 0, back: 12 }], ["kneePads", {}]], cam: { yaw: 10, pitch: 25, dist: 2.7, y: 0.7 },
    keys: [{ root: { p: [0, 0.58, 0], r: [-12, 0, 0] }, leg: { hf: 82, ha: 2, kn: 80 }, arm: { sf: 30, sa: 20, el: 30 } }, { root: { p: [0, 0.58, 0], r: [-12, 0, 0] }, leg: { hf: 82, ha: 30, kn: 80 }, arm: { sf: 30, sa: 20, el: 30 } }] },
  squat: { kit: [["barbell", {}], ["rack", { z: -0.35, y: 1.45 }]], cam: { yaw: 80, pitch: 8, dist: 3.0, y: 0.85 },
    keys: [{ root: ST, leg: { f: [0.17, 0.075, 0.05], pole: [0.35, 0, 1] }, arm: { h: [0.36, 1.46, -0.1], pole: [0.2, -1, -0.4] } },
      { root: { p: [0, 0.53, -0.22], r: [36, 0, 0] }, leg: { f: [0.17, 0.075, 0.05], pole: [0.35, 0, 1] }, arm: { h: [0.36, 1.06, -0.05], pole: [0.2, -1, -0.4] } }], hold: [0.4, 0.2] },
  leg_press: { kit: [["sled", {}]], cam: { yaw: 80, pitch: 10, dist: 3.2, y: 0.7 },
    keys: [{ root: { p: [0, 0.44, 0.04], r: [-55, 0, 0] }, leg: { f: [0.15, 0.98, 0.76], pole: [0.2, 1, 0], foot: { rel: -40 } }, arm: { sf: 15, sa: 30, el: 20 } },
      { root: { p: [0, 0.44, 0.04], r: [-55, 0, 0] }, leg: { f: [0.15, 0.74, 0.5], pole: [0.2, 1, 0], foot: { rel: -50 } }, arm: { sf: 15, sa: 30, el: 20 } }] },
  leg_extension: { kit: [["seat", { y: 0.5, z: 0, back: 8 }], ["anklePad", { dz: 0.06 }]], cam: { yaw: 80, pitch: 10, dist: 2.8, y: 0.65 },
    keys: [{ root: { p: [0, 0.58, 0], r: [-6, 0, 0] }, leg: { hf: 88, kn: 88, foot: { rel: 0 } }, arm: { sf: 10, sa: 22, el: 20 } }, { root: { p: [0, 0.58, 0], r: [-6, 0, 0] }, leg: { hf: 88, kn: 6, foot: { rel: 0 } }, arm: { sf: 10, sa: 22, el: 20 } }] },
  lunge: { kit: [["dumbbells", { along: true }]], cam: { yaw: 80, pitch: 8, dist: 3.1, y: 0.8 },
    keys: [{ root: ST, legL: { f: [0.12, 0.075, 0.02] }, legR: { f: [-0.12, 0.075, -0.02] }, leg: { pole: [0.1, 0, 1] }, arm: { sf: 0, sa: 8, el: 5 } },
      { root: { p: [0, 0.56, 0.28], r: [0, 0, 0] }, legL: { f: [0.12, 0.075, 0.6] }, legR: { f: [-0.12, 0.12, -0.08], foot: 55 }, leg: { pole: [0.1, 0, 1] }, arm: { sf: 0, sa: 8, el: 5 } }] },
  wall_sit: { kit: [["wall", { z: -0.37 }]], cam: { yaw: 80, pitch: 8, dist: 3.0, y: 0.7 },
    keys: [{ root: { p: [0, 0.985, -0.22], r: [0, 0, 0] }, leg: { f: [0.13, 0.075, 0.25], pole: [0.1, 0, 1] }, arm: { sf: 0, sa: 6, el: 5 } },
      { root: { p: [0, 0.53, -0.22], r: [0, 0, 0] }, leg: { f: [0.13, 0.075, 0.25], pole: [0.1, 0, 1] }, arm: { sf: 0, sa: 6, el: 5 } }], hold: [0.3, 2.0] },
  leg_curl: { kit: [["bench", { z0: -0.48, z1: 0.75, top: 0.45 }], ["anklePad", { dz: -0.06, dy: 0.05 }]], cam: { yaw: 80, pitch: 12, dist: 2.9, y: 0.6 },
    keys: [{ root: { p: [0, 0.55, 0.0], r: [90, 0, 0] }, arm: { h: [0.24, 0.3, 0.62], pole: [0.5, 0, -1] }, leg: { hf: 0, kn: 4, foot: { rel: 10 } } },
      { root: { p: [0, 0.55, 0.0], r: [90, 0, 0] }, arm: { h: [0.24, 0.3, 0.62], pole: [0.5, 0, -1] }, leg: { hf: 0, kn: 112, foot: { rel: 10 } } }] },
  romanian_deadlift: { kit: [["barbell", {}]], cam: { yaw: 80, pitch: 8, dist: 3.0, y: 0.8 },
    keys: [{ root: ST, leg: { f: [0.12, 0.075, 0.02], pole: [0.1, 0, 1] }, arm: { h: [0.23, 0.74, 0.1], pole: [0.2, 0, -1] } },
      { root: { p: [0, 0.93, -0.18], r: [72, 0, 0] }, leg: { f: [0.12, 0.075, 0.02], pole: [0.1, 0, 1] }, arm: { h: [0.23, 0.36, 0.14], pole: [0.2, 0, -1] } }] },
  hip_adduction: { kit: [["seat", { y: 0.5, z: 0, back: 12 }], ["kneePads", { inside: true }]], cam: { yaw: 10, pitch: 25, dist: 2.7, y: 0.7 },
    keys: [{ root: { p: [0, 0.58, 0], r: [-12, 0, 0] }, leg: { hf: 82, ha: 32, kn: 80 }, arm: { sf: 30, sa: 20, el: 30 } }, { root: { p: [0, 0.58, 0], r: [-12, 0, 0] }, leg: { hf: 82, ha: 3, kn: 80 }, arm: { sf: 30, sa: 20, el: 30 } }] },
  copenhagen_plank: { kit: [["bench", { z0: -0.25, z1: 0.25, top: 0.42, x: 0.86 }], ["mat", { ry: 90, x: -0.3 }]], cam: { yaw: 10, pitch: 12, dist: 2.9, y: 0.4 },
    keys: [{ root: { p: [-0.02, 0.3, 0], r: [0, 0, 80] }, armR: { h: [-0.46, 0.03, 0.14], pole: [0, 1, 1] }, armL: { sf: 0, sa: 4, el: 5 }, legL: { f: [0.86, 0.47, 0.02], pole: [0, 1, 0.2], foot: { rel: 0 } }, legR: { hf: 40, kn: 70, ha: 0, foot: { rel: 0 } } },
      { root: { p: [-0.02, 0.4, 0], r: [0, 0, 87] }, armR: { h: [-0.46, 0.03, 0.14], pole: [0, 1, 1] }, armL: { sf: 0, sa: 4, el: 5 }, legL: { f: [0.86, 0.47, 0.02], pole: [0, 1, 0.2], foot: { rel: 0 } }, legR: { hf: 0, kn: 5, ha: 2, foot: { rel: 0 } } }], hold: [0.4, 1.2] },
  calf_raise: { kit: [["step", { h: 0.1, z: 0.1 }]], cam: { yaw: 80, pitch: 8, dist: 2.8, y: 0.8 },
    keys: [{ root: { p: [0, 1.06, -0.04], r: [0, 0, 0] }, leg: { f: [0.12, 0.16, -0.04], foot: -12 }, arm: { sf: 0, sa: 8, el: 5 } }, { root: { p: [0, 1.15, -0.04], r: [0, 0, 0] }, leg: { f: [0.12, 0.25, -0.04], foot: 28 }, arm: { sf: 0, sa: 8, el: 5 } }] },
  seated_calf_raise: { kit: [["seat", { y: 0.5, z: -0.05 }], ["step", { h: 0.1, z: 0.42 }], ["plateOnKnees", {}]], cam: { yaw: 80, pitch: 10, dist: 2.6, y: 0.5 },
    keys: [{ root: { p: [0, 0.58, -0.05], r: [-2, 0, 0] }, leg: { f: [0.13, 0.16, 0.36], foot: -10, pole: [0, 1, 0.4] }, arm: { h: [0.2, 0.68, 0.35], pole: [0.5, -1, 0] } },
      { root: { p: [0, 0.58, -0.05], r: [-2, 0, 0] }, leg: { f: [0.13, 0.25, 0.36], foot: 30, pole: [0, 1, 0.4] }, arm: { h: [0.2, 0.77, 0.35], pole: [0.5, -1, 0] } }] },
  tibialis_raise: { kit: [["wall", { z: -0.37 }]], cam: { yaw: 80, pitch: 8, dist: 3.0, y: 0.8 },
    keys: [{ root: { p: [0, 0.96, -0.2], r: [-9, 0, 0] }, leg: { f: [0.12, 0.075, 0.12], pole: [0.1, 0, 1] }, arm: { sf: 0, sa: 6, el: 5 } }, { root: { p: [0, 0.96, -0.2], r: [-9, 0, 0] }, leg: { f: [0.12, 0.075, 0.12], pole: [0.1, 0, 1], foot: -30 }, arm: { sf: 0, sa: 6, el: 5 } }] },
  burpee: { kit: [["mat", { z: -0.2 }]], cam: { yaw: 80, pitch: 8, dist: 3.4, y: 0.7 },
    keys: [
      { root: ST, leg: { f: [0.15, 0.075, 0.05], pole: [0.2, 0, 1] }, arm: { h: [0.25, 0.8, 0.08], pole: [0.2, 0, -1] } },
      { root: { p: [0, 0.45, -0.1], r: [40, 0, 0] }, leg: { f: [0.15, 0.075, 0.05], pole: [0.2, 0, 1] }, arm: { h: [0.22, 0.03, 0.42], pole: [0.3, 0, -1] } },
      { root: { p: [0, 0.38, -0.38], r: [69, 0, 0] }, leg: { f: [0.15, 0.11, -1.25], pole: [0, -1, 0], foot: 70 }, arm: { h: [0.22, 0.03, 0.42], pole: [0.3, 0, -1] } },
      { root: { p: [0, 0.45, -0.1], r: [40, 0, 0] }, leg: { f: [0.15, 0.075, 0.05], pole: [0.2, 0, 1] }, arm: { h: [0.22, 0.03, 0.42], pole: [0.3, 0, -1] } },
      { root: { p: [0, 1.15, 0], r: [0, 0, 0] }, leg: { f: [0.15, 0.2, 0.02], pole: [0.2, 0, 1], foot: 30 }, arm: { h: [0.2, 2.1, 0.05], pole: [1, 0, 0] } }], hold: [0.2, 0.05, 0.1, 0.05, 0.05] },
  kettlebell_swing: { kit: [["kettlebell", {}]], cam: { yaw: 80, pitch: 8, dist: 3.0, y: 0.8 },
    keys: [{ root: { p: [0, 0.9, -0.14], r: [55, 0, 0] }, leg: { f: [0.18, 0.075, 0.05], pole: [0.3, 0, 1] }, arm: { h: [0.05, 0.42, -0.08], pole: [0.2, 0, -1] } },
      { root: { p: [0, 0.985, 0], r: [-3, 0, 0] }, leg: { f: [0.18, 0.075, 0.05], pole: [0.3, 0, 1] }, arm: { h: [0.05, 1.28, 0.55], pole: [0.3, -1, 0] } }], hold: [0.05, 0.1] },
  thruster: { kit: [["barbell", {}]], cam: { yaw: 70, pitch: 8, dist: 3.2, y: 1.0 },
    keys: [
      { root: ST, leg: { f: [0.17, 0.075, 0.05], pole: [0.35, 0, 1] }, arm: { h: [0.22, 1.38, 0.18], pole: [0.3, -0.4, 1] } },
      { root: { p: [0, 0.54, -0.18], r: [24, 0, 0] }, leg: { f: [0.17, 0.075, 0.05], pole: [0.35, 0, 1] }, arm: { h: [0.22, 1.0, 0.1], pole: [0.3, -0.4, 1] } },
      { root: ST, leg: { f: [0.17, 0.075, 0.05], pole: [0.35, 0, 1] }, arm: { h: [0.22, 1.38, 0.18], pole: [0.3, -0.4, 1] } },
      { root: ST, leg: { f: [0.17, 0.075, 0.05], pole: [0.35, 0, 1] }, arm: { h: [0.24, 2.05, 0.03], pole: [1, 0, 0] } }], hold: [0.3, 0.05, 0.05, 0.3] },
};

// ---------------------------------------------------------------- the demo viewer
export function createDemo(canvas, { onFrame } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef1f6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2.5, 4, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 3, bottom: -1, near: 0.5, far: 12 }); scene.add(sun);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xe2e6ed, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  let grid = null;
  function setTheme(dark) {
    scene.background = new THREE.Color(dark ? 0x2a303b : 0xeef1f6);
    floorMat.color.set(dark ? 0x3a414e : 0xe2e6ed);
    if (grid) { scene.remove(grid); grid.geometry.dispose(); }
    grid = dark ? new THREE.GridHelper(8, 32, 0x4a5260, 0x424956) : new THREE.GridHelper(8, 32, 0xc9cfd9, 0xd6dbe3);
    grid.position.y = 0.001; scene.add(grid);
  }
  setTheme(false);
  const fig = buildFigure(); scene.add(fig.root);
  fig.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  const cam = { yaw: rad(40), pitch: rad(10), dist: 3, target: V(0, 0.8, 0), goal: null };
  let kitGroup = new THREE.Group(); scene.add(kitGroup);
  let updaters = [], demo = null, t = 0, playing = true, speed = 1, last = 0, visible = true;

  function placeCamera() {
    camera.position.set(cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
    camera.lookAt(cam.target);
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (demo && !cam.goal && !ptrs.size) { const y = cam.yaw, p = cam.pitch; setView(curView, true); cam.yaw = y; cam.pitch = p; }
  }
  // timeline: each key holds, then eases to the next; the last eases back to the first
  function timeline(d) {
    const n = d.keys.length, hold = d.hold || d.keys.map(() => 0.35), move = d.move || 1.25, segs = [];
    let at = 0;
    for (let i = 0; i < n; i++) { segs.push({ i, j: i, t0: at, t1: at + hold[i] }); at += hold[i]; segs.push({ i, j: (i + 1) % n, t0: at, t1: at + move }); at += move; }
    return { segs, total: at };
  }
  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  function poseAt(time) {
    const tl = demo.tl, tt = ((time % tl.total) + tl.total) % tl.total;
    const s = tl.segs.find(s => tt >= s.t0 && tt < s.t1) || tl.segs[0];
    const k = s.t1 > s.t0 ? ease((tt - s.t0) / (s.t1 - s.t0)) : 0;
    return s.i === s.j ? demo.d.keys[s.i] : blend(demo.d.keys[s.i], demo.d.keys[s.j], k);
  }
  function setExercise(id) {
    scene.remove(kitGroup); kitGroup = new THREE.Group(); scene.add(kitGroup); updaters = [];
    const d = DEMOS[id]; if (!d) { demo = null; fig.root.visible = false; return false; }
    fig.root.visible = true;
    for (const [name, opts] of d.kit) { const u = KITS[name]?.(kitGroup, opts || {}); if (typeof u === "function") updaters.push(u); }
    kitGroup.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    demo = { d, tl: timeline(d) }; t = 0;
    // frame the camera on the space the figure moves through
    const bb = new THREE.Box3();
    d.keys.forEach((k, i) => { applyPose(fig, k); updaters.forEach(u => u(fig)); bb.expandByObject(fig.root); });
    demo.fit = bb.getBoundingSphere(new THREE.Sphere());
    setView("angled", true);
    frame(0);
    return true;
  }
  function frame(dt) {
    if (!demo) return;
    if (playing) t += dt * speed;
    applyPose(fig, poseAt(t));
    updaters.forEach(u => u(fig));
    if (onFrame) onFrame(t / demo.tl.total);
  }
  const VIEWS = { front: 0, side: 90, back: 180, angled: null };
  let curView = "angled";
  function setView(name, instant) {
    curView = name;
    const c = demo?.d.cam || { yaw: 40, pitch: 10, dist: 3, y: 0.8 };
    const yaw = name === "angled" ? c.yaw : VIEWS[name];
    const goal = { yaw: rad(yaw), pitch: rad(c.pitch), dist: c.dist, ty: c.y, tx: 0, tz: 0 };
    if (demo?.fit) {
      const f = demo.fit, half = rad(camera.fov / 2), hfov = Math.atan(Math.tan(half) * camera.aspect);
      goal.dist = Math.max(1.4, f.radius * 1.02 / Math.sin(Math.min(half, hfov)));
      goal.tx = f.center.x; goal.ty = f.center.y; goal.tz = f.center.z;
    }
    if (instant) { cam.yaw = goal.yaw; cam.pitch = goal.pitch; cam.dist = goal.dist; cam.target.set(goal.tx, goal.ty, goal.tz); cam.goal = null; }
    else cam.goal = goal;
  }
  // drag to orbit, pinch or scroll to zoom
  const ptrs = new Map(); let pinch = 0;
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); cam.goal = null; });
  canvas.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { cam.yaw -= (e.clientX - px) * 0.01; cam.pitch = Math.max(-0.2, Math.min(1.2, cam.pitch + (e.clientY - py) * 0.006)); }
    else { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.dist = Math.max(1.0, Math.min(8, cam.dist * pinch / d)); pinch = d; }
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", e => { e.preventDefault(); cam.dist = Math.max(1.0, Math.min(8, cam.dist * (1 + e.deltaY * 0.001))); }, { passive: false });

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (!visible) return;
    if (cam.goal) {
      const g = cam.goal, k = 1 - Math.pow(0.001, dt);
      let dy = g.yaw - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      cam.yaw += dy * k; cam.pitch += (g.pitch - cam.pitch) * k; cam.dist += (g.dist - cam.dist) * k; cam.target.x += (g.tx - cam.target.x) * k; cam.target.y += (g.ty - cam.target.y) * k; cam.target.z += (g.tz - cam.target.z) * k;
      if (Math.abs(dy) < 0.002 && Math.abs(g.dist - cam.dist) < 0.002) cam.goal = null;
    }
    frame(dt); placeCamera(); renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(canvas); resize();
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
  requestAnimationFrame(loop);
  return {
    setExercise, setView, setTheme,
    play() { playing = true; }, pause() { playing = false; }, get playing() { return playing; },
    replay() { t = 0; playing = true; }, setSpeed(s) { speed = s; },
    seek(fraction) { if (demo) { t = fraction * demo.tl.total; frame(0); } },
    keyCount() { return demo ? demo.d.keys.length : 0; },
    seekKey(i) { if (demo) { const s = demo.tl.segs[i * 2]; t = s.t0 + 0.001; frame(0); placeCamera(); renderer.render(scene, camera); } },
  };
}
