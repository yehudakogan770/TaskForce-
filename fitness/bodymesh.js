// Loads fitness/body.bin (built by tools/build_body.py): one continuous human body mesh,
// with the muscle each vertex belongs to (surface layer and, where there is one, the deep muscle underneath).
import * as THREE from "../vendor/three.module.min.js";

export async function loadBodyMesh(url = new URL("./body.bin", import.meta.url)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("body.bin " + res.status);
  const buf = await res.arrayBuffer();
  const dv = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== "TFB1") throw new Error("body.bin: bad file");
  const nV = dv.getUint32(4, true), nT = dv.getUint32(8, true), nN = dv.getUint32(12, true);
  let o = 20;
  const names = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, o, nN))); o += nN + ((4 - nN % 4) % 4);
  const pos = new Float32Array(buf, o, nV * 3); o += nV * 12;
  const idx = new Uint16Array(buf, o, nT * 3); o += nT * 6 + (nT * 3 % 2 ? 2 : 0);
  const surface = new Uint8Array(buf, o, nV); o += nV;
  const deep = new Uint8Array(buf, o, nV); o += nV;
  const shade = new Uint8Array(buf, o, nV);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return { geometry: geo, names, surface, deep, shade };
}
