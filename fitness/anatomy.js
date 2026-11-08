// The rotating muscle model: orbit, zoom, preset views, tap-to-pick and fading highlights.
// It only knows muscle ids; names, exercises and everything else come from data.js through app.js.
import * as THREE from "../vendor/three.module.min.js";
import { buildBody } from "./body.js";

const COLORS = {
  primary: { color: new THREE.Color(0xe0352b), emissive: new THREE.Color(0x5a0d08) },
  secondary: { color: new THREE.Color(0xf08a6a), emissive: new THREE.Color(0x2a0c06) },
  selected: { color: new THREE.Color(0xe0352b), emissive: new THREE.Color(0x7a140c) },
  none: { color: new THREE.Color(0xb7bcc5), emissive: new THREE.Color(0x000000) },
};
const rad = d => d * Math.PI / 180;
// the body faces +z; its left side is +x
const VIEWS = { front: 0, back: 180, left: 90, right: -90 };
const HOME = { yaw: 0, pitch: rad(3), dist: 3.65, ty: 0.9 };

export function createAnatomy(canvas, { onPick, deepIds = {}, background } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background || 0x161a21);
  scene.add(new THREE.HemisphereLight(0xdde3ee, 0x1a1d24, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.8, 2.6, 2.4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.5); fill.position.set(-2, 1, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9fb4ff, 0.9); rim.position.set(-2, 2, -3); scene.add(rim);
  const back = new THREE.DirectionalLight(0xffffff, 0.8); back.position.set(0.5, 1.5, -3); scene.add(back);
  // the key light follows the camera so the side you look at is never in shadow
  const lightRig = new THREE.Group(); lightRig.add(key, fill); scene.add(lightRig);

  const { group, muscles } = buildBody();
  scene.add(group);
  const pickables = [];
  for (const [id, meshes] of muscles) for (const m of meshes) {
    pickables.push(m);
    m.userData.goal = COLORS.none; m.userData.opacity = 1; m.userData.goalOpacity = 1;
    m.renderOrder = deepIds[id] ? 0 : 1;
  }

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const cam = { ...HOME, goal: null };
  function place() {
    const fit = camera.aspect < 0.62 ? 0.62 / camera.aspect : 1; // keep the whole body in frame on tall, narrow screens
    const d = cam.dist * fit;
    camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch) * d, cam.ty + Math.sin(cam.pitch) * d, Math.cos(cam.yaw) * Math.cos(cam.pitch) * d);
    camera.lookAt(0, cam.ty, 0);
    lightRig.rotation.y = cam.yaw;
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  }
  let dirty = true, visible = true, last = 0;

  // ---- highlights: every mesh eases toward its goal colour and opacity
  let state = { primary: [], secondary: [], selected: null, deep: false };
  function apply() {
    const pr = new Set(state.primary), se = new Set(state.secondary);
    const showDeep = new Set();
    for (const id of [...pr, ...se, state.selected].filter(Boolean)) if (deepIds[id]) deepIds[id].forEach(u => showDeep.add(u));
    if (state.deep) Object.values(deepIds).forEach(list => list.forEach(u => showDeep.add(u)));
    for (const [id, meshes] of muscles) {
      const goal = id === state.selected ? COLORS.selected : pr.has(id) ? COLORS.primary : se.has(id) ? COLORS.secondary : COLORS.none;
      const op = showDeep.has(id) ? 0.16 : 1;
      for (const m of meshes) { m.userData.goal = goal; m.userData.goalOpacity = op; }
    }
    dirty = true;
  }
  function fade(dt) {
    const k = 1 - Math.pow(0.0005, dt); let moving = false;
    for (const m of pickables) {
      const mat = m.material, g = m.userData.goal;
      if (!mat.color.equals(g.color) || !mat.emissive.equals(g.emissive) || m.userData.opacity !== m.userData.goalOpacity) {
        mat.color.lerp(g.color, k); mat.emissive.lerp(g.emissive, k);
        let o = m.userData.opacity + (m.userData.goalOpacity - m.userData.opacity) * k;
        if (Math.abs(o - m.userData.goalOpacity) < 0.01) o = m.userData.goalOpacity;
        if (Math.abs(mat.color.r - g.color.r) + Math.abs(mat.color.g - g.color.g) + Math.abs(mat.color.b - g.color.b) < 0.004) { mat.color.copy(g.color); mat.emissive.copy(g.emissive); }
        m.userData.opacity = o;
        const see = o < 0.999;
        if (mat.transparent !== see) { mat.transparent = see; mat.depthWrite = !see; mat.needsUpdate = true; }
        mat.opacity = o;
        moving = true;
      }
    }
    return moving;
  }

  // ---- camera control: drag to turn, pinch or scroll to zoom, tap to pick
  const ptrs = new Map(); let pinch = 0, down = null, moved = 0;
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    cam.goal = null; if (ptrs.size === 1) { down = [e.clientX, e.clientY]; moved = 0; } else down = null;
  });
  canvas.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (down) moved = Math.max(moved, Math.hypot(e.clientX - down[0], e.clientY - down[1]));
    if (ptrs.size === 1) {
      if (moved < 6) return;
      cam.yaw -= (e.clientX - px) * 0.011;
      cam.pitch = Math.max(rad(-35), Math.min(rad(60), cam.pitch + (e.clientY - py) * 0.006));
    } else {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoom(pinch / d); pinch = d;
    }
    dirty = true;
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0;
    if (down && moved < 6 && e.type === "pointerup") pick(e.clientX, e.clientY);
    down = null;
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", e => { e.preventDefault(); zoom(1 + e.deltaY * 0.0012); dirty = true; }, { passive: false });
  function zoom(f) {
    cam.dist = Math.max(0.9, Math.min(5.5, cam.dist * f));
  }
  const ray = new THREE.Raycaster();
  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const hits = ray.intersectObjects(pickables, false).filter(h => h.object.userData.opacity > 0.5 || deepIds[h.object.userData.muscleId]);
    const hit = hits[0];
    onPick && onPick(hit ? hit.object.userData.muscleId : null);
  }

  function setView(name) {
    const h = name === "reset" ? HOME : { ...HOME, yaw: rad(VIEWS[name] ?? 0), dist: cam.dist, ty: cam.ty };
    cam.goal = { ...h };
  }
  function ease(dt) {
    const g = cam.goal; if (!g) return false;
    const k = 1 - Math.pow(0.002, dt);
    let dy = g.yaw - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cam.yaw += dy * k; cam.pitch += (g.pitch - cam.pitch) * k; cam.dist += (g.dist - cam.dist) * k; cam.ty += (g.ty - cam.ty) * k;
    if (Math.abs(dy) < 0.001 && Math.abs(g.pitch - cam.pitch) < 0.001 && Math.abs(g.dist - cam.dist) < 0.002) { cam.yaw = g.yaw; cam.goal = null; }
    return true;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (!visible || document.hidden) return;
    const a = ease(dt), b = fade(dt);
    if (a || b || dirty) { place(); renderer.render(scene, camera); dirty = false; }
  }
  new ResizeObserver(resize).observe(canvas); resize();
  new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; if (visible) dirty = true; }).observe(canvas);
  requestAnimationFrame(loop);

  return {
    highlight(primary = [], secondary = [], selected = null) { state = { ...state, primary, secondary: secondary.filter(s => !primary.includes(s)), selected }; apply(); },
    setDeep(on) { state.deep = on; apply(); },
    setView,
    setBackground(c) { scene.background = new THREE.Color(c); dirty = true; },
    // a snapshot of the view, for tests
    render() { place(); renderer.render(scene, camera); },
  };
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}
