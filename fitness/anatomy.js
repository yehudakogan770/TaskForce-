// The rotating muscle model: one continuous human body whose surface is divided into muscles.
// Orbit, zoom, preset views, tap-to-pick, and green highlights that fade in and out.
// It only knows muscle ids; names, exercises and everything else come from data.js through app.js.
import * as THREE from "../vendor/three.module.min.js";
import { loadBodyMesh } from "./bodymesh.js";

const rad = d => d * Math.PI / 180;
// the body faces +z; its left side is +x
const VIEWS = { front: 0, back: 180, left: 90, right: -90 };
const HOME = { yaw: 0, pitch: rad(2), zoom: 1, ty: 0.88 };
const BODY_H = 1.78, BODY_W = 1.24;

const SKIN = new THREE.Color(0xdcdee3);     // bare skin, a touch cooler than the muscles
const MUSCLE = new THREE.Color(0xeceef1);   // clean light anatomy
const GREEN = new THREE.Color(0x5ed40f);    // primary: vivid lime green
const SOFT = new THREE.Color(0xb8e992);     // secondary: softer green
const DEEPTINT = new THREE.Color(0xb7c4da); // deep muscles when the deep layer is on

export async function createAnatomy(canvas, { onPick, background } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background ?? 0xeef0f3);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9098a8, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.55); key.position.set(1.4, 2.4, 3.2);
  const fill = new THREE.DirectionalLight(0xeef2ff, 0.45); fill.position.set(-2.2, 0.8, 2.0);
  const rim = new THREE.DirectionalLight(0xffffff, 0.55); rim.position.set(-1.2, 2.2, -3.0);
  // the lights turn with the camera, so the side you look at is always lit the same way
  const rig = new THREE.Group(); rig.add(key, fill, rim); scene.add(rig);

  const body = await loadBodyMesh();
  const { geometry, names, surface, deep, shade } = body;
  const nV = surface.length, ids = names.slice(); // index -> muscle id ("none" at 0)
  const index = Object.fromEntries(ids.map((id, i) => [id, i]));
  const colors = new Float32Array(nV * 3), glow = new Float32Array(nV), hatch = new Float32Array(nV);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("glow", new THREE.BufferAttribute(glow, 1));
  geometry.setAttribute("hatch", new THREE.BufferAttribute(hatch, 1));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.0 });
  // highlighted muscles glow a little from within; deep muscles show through as fine diagonal stripes
  material.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float glow; attribute float hatch; varying float vGlow; varying float vHatch; varying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow; vHatch = hatch; vWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGlow; varying float vHatch; varying vec3 vWorld;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        if (vHatch > 0.01) {
          float s = smoothstep(0.35, 0.5, abs(fract((vWorld.x + vWorld.y) * 70.0) - 0.5));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.85, 0.87), s * 0.6 * vHatch);
        }`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.05, 0.16, 0.0) * vGlow;");
  };
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // per-muscle highlight levels, eased toward their goals: 0 none, 0.55 secondary, 1 primary
  const level = new Float32Array(ids.length), goal = new Float32Array(ids.length);
  const deepLevel = new Float32Array(ids.length), deepGoal = new Float32Array(ids.length);
  let deepTint = 0, deepTintGoal = 0;
  const c = new THREE.Color();
  function paint() {
    for (let v = 0; v < nV; v++) {
      const s = surface[v], d = deep[v], sh = shade[v] / 255;
      const base = s ? MUSCLE : SKIN;
      c.copy(base);
      let g = 0, h = 0;
      const lv = level[s] * (s ? 1 : 0);
      if (lv > 0.001) {
        // up to 0.55 the colour moves to soft green, beyond that on to lime
        if (lv <= 0.55) c.lerp(SOFT, lv / 0.55); else c.copy(SOFT).lerp(GREEN, (lv - 0.55) / 0.45);
        g = lv;
      }
      if (d) {
        const dl = deepLevel[d];
        if (dl > 0.001 && dl > lv + 0.01) { // a deep muscle shows through only where the muscle on top isn't already lit
          c.lerp(dl <= 0.55 ? SOFT : GREEN, Math.min(1, dl / 0.55)); g = Math.max(g, dl * 0.8); h = Math.max(h, dl);
        } else if (deepTint > 0.001) { c.lerp(DEEPTINT, deepTint * 0.8); h = Math.max(h, deepTint); }
      }
      const k = 0.42 + 0.58 * sh; // grooves between muscles
      colors[v * 3] = c.r * k; colors[v * 3 + 1] = c.g * k; colors[v * 3 + 2] = c.b * k;
      glow[v] = g; hatch[v] = h;
    }
    geometry.attributes.color.needsUpdate = true; geometry.attributes.glow.needsUpdate = true; geometry.attributes.hatch.needsUpdate = true;
  }
  function fade(dt) {
    const k = 1 - Math.pow(0.0008, dt); let moving = false;
    const step = (arr, to) => { for (let i = 0; i < arr.length; i++) { const d = to[i] - arr[i]; if (Math.abs(d) > 0.004) { arr[i] += d * k; moving = true; } else arr[i] = to[i]; } };
    step(level, goal); step(deepLevel, deepGoal);
    const dd = deepTintGoal - deepTint; if (Math.abs(dd) > 0.004) { deepTint += dd * k; moving = true; } else deepTint = deepTintGoal;
    return moving;
  }

  // ---- camera
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const cam = { ...HOME, goal: null };
  function place() {
    const half = rad(camera.fov / 2);
    const fitDist = Math.max((BODY_H / 2) / Math.tan(half), (BODY_W / 2) / (Math.tan(half) * camera.aspect)) * 1.06;
    const d = fitDist / cam.zoom;
    camera.position.set(Math.sin(cam.yaw) * Math.cos(cam.pitch) * d, cam.ty + Math.sin(cam.pitch) * d, Math.cos(cam.yaw) * Math.cos(cam.pitch) * d);
    camera.lookAt(0, cam.ty, 0);
    rig.rotation.y = cam.yaw;
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  }
  let dirty = true, visible = true, last = 0;

  // drag to turn, pinch or scroll to zoom, tap to pick
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
      if (cam.zoom > 1.05) cam.ty = Math.max(0.1, Math.min(1.7, cam.ty + (e.clientY - py) * 0.0025 / cam.zoom)); // zoomed in: drag up and down to move along the body
      else cam.pitch = Math.max(rad(-30), Math.min(rad(55), cam.pitch + (e.clientY - py) * 0.006));
    } else {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomBy(d / pinch); pinch = d;
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
  canvas.addEventListener("wheel", e => { e.preventDefault(); zoomBy(1 - e.deltaY * 0.0012); dirty = true; }, { passive: false });
  function zoomBy(f) {
    cam.zoom = Math.max(0.8, Math.min(4.5, cam.zoom * f));
    if (cam.zoom < 1.05) cam.ty += (HOME.ty - cam.ty) * 0.3;
  }
  const ray = new THREE.Raycaster();
  let preferDeep = false;
  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit) { onPick && onPick(null); return; }
    const f = hit.face, vs = [f.a, f.b, f.c];
    // the vertex nearest the tap decides, so taps near a border land on the side you touched
    let best = vs[0], bd = Infinity; const p = new THREE.Vector3();
    for (const v of vs) { p.fromBufferAttribute(geometry.attributes.position, v); const d = p.distanceToSquared(hit.point); if (d < bd) { bd = d; best = v; } }
    const id = (preferDeep || deepLevel.some(l => l > 0.5)) && deep[best] ? ids[deep[best]] : ids[surface[best]];
    onPick && onPick(id && id !== "none" ? id : null);
  }

  function setView(name) {
    cam.goal = name === "reset" ? { ...HOME } : { ...HOME, yaw: rad(VIEWS[name] ?? 0), zoom: cam.zoom, ty: cam.ty };
  }
  function ease(dt) {
    const g = cam.goal; if (!g) return false;
    const k = 1 - Math.pow(0.002, dt);
    let dy = g.yaw - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cam.yaw += dy * k; cam.pitch += (g.pitch - cam.pitch) * k; cam.zoom += (g.zoom - cam.zoom) * k; cam.ty += (g.ty - cam.ty) * k;
    if (Math.abs(dy) < 0.001 && Math.abs(g.pitch - cam.pitch) < 0.001 && Math.abs(g.zoom - cam.zoom) < 0.002 && Math.abs(g.ty - cam.ty) < 0.001) { cam.yaw = g.yaw; cam.goal = null; }
    return true;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (!visible || document.hidden) {
      // off screen: skip the animation and land on the final colours
      if (level.some((l, i) => l !== goal[i]) || deepLevel.some((l, i) => l !== deepGoal[i]) || deepTint !== deepTintGoal) { level.set(goal); deepLevel.set(deepGoal); deepTint = deepTintGoal; paint(); dirty = true; }
      if (cam.goal) { Object.assign(cam, cam.goal); cam.goal = null; dirty = true; }
      return;
    }
    const a = ease(dt), b = fade(dt);
    if (b) paint();
    if (a || b || dirty) { place(); renderer.render(scene, camera); dirty = false; }
  }
  paint();
  new ResizeObserver(resize).observe(canvas); resize();
  new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; if (visible) dirty = true; }).observe(canvas);
  requestAnimationFrame(loop);

  let state = { primary: [], secondary: [], selected: null, deep: false };
  function apply() {
    goal.fill(0); deepGoal.fill(0);
    const set = (id, v) => { const i = index[id]; if (i === undefined) return; goal[i] = Math.max(goal[i], v); deepGoal[i] = Math.max(deepGoal[i], v); };
    state.secondary.forEach(id => set(id, 0.55));
    state.primary.forEach(id => set(id, 1));
    if (state.selected) set(state.selected, 1);
    deepTintGoal = state.deep ? 1 : 0; preferDeep = state.deep;
    dirty = true;
  }
  return {
    highlight(primary = [], secondary = [], selected = null) { state = { ...state, primary, secondary: secondary.filter(s => !primary.includes(s)), selected }; apply(); },
    setDeep(on) { state.deep = on; apply(); },
    setView,
    setBackground(col) { scene.background = new THREE.Color(col); dirty = true; },
    has: id => index[id] !== undefined,
    // draw immediately with every fade finished (for tests and snapshots)
    settle() { level.set(goal); deepLevel.set(deepGoal); deepTint = deepTintGoal; paint(); place(); renderer.render(scene, camera); },
  };
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}
