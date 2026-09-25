// Shared architectural helpers: planked textures, walls with openings, windows, roofs.
import * as THREE from 'three';
import { toon, canvasTexture, box } from './kit.js';
import { boxCollider } from '../systems/physics.js';
import { mulberry32 } from '../core/noise.js';

const texCache = {};

export function plankTexture(base = '#9a6b45', { vertical = false, seed = 1, lines = 8 } = {}) {
  const key = base + vertical + seed + lines;
  if (texCache[key]) return texCache[key];
  const rng = mulberry32(seed);
  const t = canvasTexture(256, 256, (g, w, h) => {
    const c = new THREE.Color(base);
    const step = h / lines;
    for (let i = 0; i < lines; i++) {
      const k = 0.88 + rng() * 0.22;
      g.fillStyle = `rgb(${(c.r * 255 * k) | 0},${(c.g * 255 * k) | 0},${(c.b * 255 * k) | 0})`;
      g.fillRect(0, i * step, w, step);
      g.fillStyle = 'rgba(40,24,12,0.35)';
      g.fillRect(0, i * step, w, 2);
      for (let j = 0; j < 3; j++) {
        g.fillStyle = `rgba(60,36,18,${0.08 + rng() * 0.1})`;
        g.fillRect(rng() * w, i * step + rng() * step, 20 + rng() * 60, 1);
      }
      const x = rng() * w;
      g.fillStyle = 'rgba(40,24,12,0.3)';
      g.fillRect(x, i * step, 2, step);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (vertical) { t.rotation = Math.PI / 2; t.center.set(0.5, 0.5); }
  t.userData.shared = true;
  return (texCache[key] = t);
}

/** Scale box UVs to world size so textures tile instead of stretching. */
export function tileUV(geo, w, h, d, scale = 1) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const [a, b] = dims[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * a * scale, uv.getY(i) * b * scale);
  }
  return geo;
}

export function texturedBox(w, h, d, mat, x, y, z, scale = 0.5) {
  const g = tileUV(new THREE.BoxGeometry(w, h, d), w, h, d, scale);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * Wall along an axis with window/door openings.
 * axis 'x': runs from a1..a2 along x at fixed z = c. axis 'z': along z at fixed x = c.
 * openings: [{ a, b, bottom, top, glass?: bool }]; bottom === 0 → doorway (walkable gap).
 */
export function buildWall(world, parent, { axis, c, a1, a2, H = 3, T = 0.2, floor = 0, mat, openings = [], frameColor = '#f1e6cf' }) {
  const ops = [...openings].sort((p, q) => p.a - q.a);
  const pieces = [];
  let cur = a1;
  for (const o of ops) {
    if (o.a > cur) pieces.push([cur, o.a, 0, H]);
    if (o.bottom > 0) pieces.push([o.a, o.b, 0, o.bottom]);
    if (o.top < H) pieces.push([o.a, o.b, o.top, H]);
    cur = o.b;
  }
  if (cur < a2) pieces.push([cur, a2, 0, H]);
  const meshes = [];
  for (const [p0, p1, y0, y1] of pieces) {
    const len = p1 - p0, mid = (p0 + p1) / 2, hh = y1 - y0, ym = floor + (y0 + y1) / 2;
    const m = axis === 'x' ? texturedBox(len, hh, T, mat, mid, ym, c) : texturedBox(T, hh, len, mat, c, ym, mid);
    parent.add(m);
    meshes.push(m);
  }
  // colliders (doors leave gaps)
  let s = a1;
  const doors = ops.filter((o) => o.bottom === 0);
  const pushCol = (p0, p1) => {
    if (p1 - p0 < 0.01) return;
    const mid = (p0 + p1) / 2, len = p1 - p0;
    world.colliders.push(axis === 'x' ? boxCollider(mid, c, len, T + 0.04) : boxCollider(c, mid, T + 0.04, len));
  };
  for (const d of doors) { pushCol(s, d.a); s = d.b; }
  pushCol(s, a2);
  // window glass + frames
  const frameMat = toon(frameColor);
  const glassMat = new THREE.MeshBasicMaterial({ color: '#cfe9ff', transparent: true, opacity: 0.18, depthWrite: false });
  for (const o of ops) {
    if (o.bottom === 0) continue;
    const len = o.b - o.a, mid = (o.a + o.b) / 2, hh = o.top - o.bottom, ym = floor + (o.bottom + o.top) / 2;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, hh), glassMat);
    if (axis === 'x') glass.position.set(mid, ym, c); else { glass.position.set(c, ym, mid); glass.rotation.y = Math.PI / 2; }
    glass.material.side = THREE.DoubleSide;
    parent.add(glass);
    const bars = [
      [len + 0.16, 0.1, T + 0.08, 0, hh / 2], [len + 0.16, 0.1, T + 0.08, 0, -hh / 2],
      [0.1, hh, T + 0.08, len / 2, 0], [0.1, hh, T + 0.08, -len / 2, 0],
      [0.06, hh, T * 0.4, 0, 0], [len, 0.06, T * 0.4, 0, 0],
    ];
    for (const [bw, bh, bd, ox, oy] of bars) {
      const f = axis === 'x' ? box(bw, bh, bd, null, mid + ox, ym + oy, c, frameMat) : box(bd, bh, bw, null, c, ym + oy, mid + ox, frameMat);
      parent.add(f);
    }
  }
  return meshes;
}

/** Gable roof over a rectangle, ridge along x. */
export function gableRoof({ x0, x1, z0, z1, y, rise = 2.2, overhang = 0.6, color = '#c8552f', thickness = 0.22, gableMat }) {
  const g = new THREE.Group();
  const w = z1 - z0 + overhang * 2, len = x1 - x0 + overhang * 2;
  const half = w / 2;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const mat = toon(color);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, thickness, slope + 0.1), mat);
    m.position.set(cx, y + rise / 2, cz + side * half / 2);
    m.rotation.x = side * ang;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    // shingle rows
    for (let i = 1; i < 6; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.06), toon(new THREE.Color(color).multiplyScalar(0.8)));
      const t = i / 6;
      r.position.set(cx, y + rise * (1 - t) + thickness / 2 + 0.02, cz + side * half * t);
      r.rotation.x = side * ang;
      g.add(r);
    }
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, len, 10), toon(new THREE.Color(color).multiplyScalar(0.75)));
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set(cx, y + rise + 0.08, cz);
  g.add(ridge);
  // gable triangles
  const shape = new THREE.Shape();
  const hw = (z1 - z0) / 2;
  shape.moveTo(-hw, 0); shape.lineTo(hw, 0); shape.lineTo(0, rise); shape.closePath();
  for (const gx of [x0, x1]) {
    const tri = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }), gableMat || toon('#8f6242'));
    tri.rotation.y = Math.PI / 2;
    tri.position.set(gx - 0.1, y, cz);
    tri.castShadow = true;
    g.add(tri);
  }
  return g;
}
