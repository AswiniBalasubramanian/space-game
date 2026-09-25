// Environment detail kit: instanced ground cover, living creatures and hand-built props
// that give each world its lived-in, storybook density.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, paintMaterial, glowMat, glowSprite, box, cyl, sphere } from './kit.js';
import { mulberry32, noise2 } from '../core/noise.js';

const C = (c) => new THREE.Color(c);

function colorGeo(geo, color) {
  if (geo.index) { const n = geo.toNonIndexed(); geo.dispose(); geo = n; }
  const c = C(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

function lumpy(geo, amt, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = noise2(x * 3 + seed, z * 3 + y * 2) * amt;
    p.setXYZ(i, x * (1 + n), y * (1 + n), z * (1 + n));
  }
  geo.computeVertexNormals();
  return geo;
}

/** Instanced scatter of one geometry. pts: [{x,y,z,s,ry,color?}] */
export function scatter(geo, mat, pts, { cast = true, colors = false } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  pts.forEach((p, i) => {
    e.set(p.rx || 0, p.ry || 0, p.rz || 0);
    q.setFromEuler(e);
    const s = p.s || 1;
    sc.set(s * (p.sx || 1), s * (p.sy || 1), s * (p.sz || 1));
    m4.compose(v.set(p.x, p.y, p.z), q, sc);
    m.setMatrixAt(i, m4);
    if (colors && p.color) m.setColorAt(i, C(p.color));
  });
  m.count = pts.length;
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Sample n points with a sampler(rng) → [x,z] | null, lifting to ground via heightAt. */
export function samplePoints(n, sampler, heightAt, seed = 1, extra = () => ({})) {
  const rng = mulberry32(seed), out = [];
  for (let i = 0; i < n * 5 && out.length < n; i++) {
    const p = sampler(rng);
    if (!p) continue;
    const y = heightAt(p[0], p[1]);
    if (y === null || y === undefined) continue;
    out.push({ x: p[0], y, z: p[1], s: 0.7 + rng() * 0.7, ry: rng() * 6.28, ...extra(rng) });
  }
  return out;
}

// ---------------------------------------------------------------- ground cover

export function makeBushes(pts, { sunDir, palette = ['#3f7d3a', '#5d9a45', '#79b04d'], seed = 3 } = {}) {
  const rng = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const g = lumpy(new THREE.IcosahedronGeometry(0.42 + rng() * 0.2, 2), 0.12, rng() * 40);
    g.translate((rng() - 0.5) * 0.7, 0.3 + rng() * 0.25, (rng() - 0.5) * 0.6);
    parts.push(colorGeo(g, palette[i % palette.length]));
  }
  const geo = mergeGeometries(parts);
  const mat = paintMaterial({ lit: '#ffffff', shadow: '#6a82a0', sunDir, vertexColors: true, rim: 0.4, rimColor: '#f7f0a0' });
  // tint per instance for variety
  const inst = scatter(geo, mat, pts, { colors: true });
  pts.forEach((p, i) => inst.setColorAt(i, C('#ffffff').multiplyScalar(0.82 + (i % 5) * 0.06)));
  return inst;
}

export function makeFerns(pts, { color = '#4f8f3e' } = {}) {
  const fronds = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.PlaneGeometry(0.16, 0.7, 1, 4);
    g.translate(0, 0.35, 0);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const y = p.getY(v);
      p.setX(v, p.getX(v) * (1 - y * 0.9));
      p.setZ(v, y * y * 0.6);
    }
    g.rotateX(-0.5);
    g.rotateY((i / 7) * Math.PI * 2);
    fronds.push(colorGeo(g, i % 2 ? color : '#6aa84f'));
  }
  const geo = mergeGeometries(fronds);
  geo.computeVertexNormals();
  return scatter(geo, toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide }), pts, { cast: false });
}

export function makeMushrooms(pts) {
  const stem = colorGeo(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 8).translate(0, 0.08, 0), '#f2ead8');
  const cap = colorGeo(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.15, 0), '#ffffff');
  const geo = mergeGeometries([stem, cap]);
  const inst = scatter(geo, toon('#ffffff', { vertexColors: true }), pts, { colors: true, cast: false });
  pts.forEach((p, i) => inst.setColorAt(i, C(['#e0453a', '#e8a04a', '#f2e6d0'][i % 3])));
  return inst;
}

export function makePebbles(pts, color = '#9a9aa4') {
  const g = lumpy(new THREE.DodecahedronGeometry(0.12, 0), 0.2, 3);
  g.scale(1, 0.55, 1.2);
  return scatter(g, toon(color), pts, { cast: false });
}

export function makeSunflowers(pts) {
  const stem = colorGeo(new THREE.CylinderGeometry(0.025, 0.035, 1.6, 6).translate(0, 0.8, 0), '#4f8a3a');
  const leaf = colorGeo(new THREE.SphereGeometry(0.12, 8, 6).scale(1.6, 0.2, 0.8).translate(0.14, 0.7, 0), '#5d9a45');
  const leaf2 = colorGeo(new THREE.SphereGeometry(0.1, 8, 6).scale(1.6, 0.2, 0.8).translate(-0.12, 1.0, 0), '#5d9a45');
  const petals = colorGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 14).rotateX(Math.PI / 2 - 0.35).translate(0, 1.62, 0.05), '#ffc623');
  const center = colorGeo(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12).rotateX(Math.PI / 2 - 0.35).translate(0, 1.63, 0.07), '#6b3f1d');
  const geo = mergeGeometries([stem, leaf, leaf2, petals, center]);
  geo.computeVertexNormals();
  return scatter(geo, toon('#ffffff', { vertexColors: true }), pts);
}

// ---------------------------------------------------------------- creatures

// Butterfly wing outline (one side): a big rounded forewing and a smaller hindwing.
// Units: x outward from the body, y forward.
function butterflyWingShape() {
  const s = new THREE.Shape();
  s.moveTo(0.0, 0.015);
  s.bezierCurveTo(0.03, 0.12, 0.14, 0.22, 0.225, 0.19);
  s.bezierCurveTo(0.27, 0.17, 0.24, 0.08, 0.2, 0.035);
  s.bezierCurveTo(0.16, 0.005, 0.07, 0.0, 0.03, -0.005);
  s.bezierCurveTo(0.12, -0.03, 0.19, -0.1, 0.16, -0.155);
  s.bezierCurveTo(0.13, -0.2, 0.06, -0.15, 0.03, -0.09);
  s.bezierCurveTo(0.015, -0.06, 0.0, -0.03, 0.0, -0.015);
  return s;
}

let _wingTex = null;
function butterflyWingTexture(bounds) {
  if (_wingTex) return _wingTex;
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const shape = butterflyWingShape();
  const map = (x, y) => [((x - bounds.min.x) / (bounds.max.x - bounds.min.x)) * W, (1 - (y - bounds.min.y) / (bounds.max.y - bounds.min.y)) * H];
  const pts = shape.getPoints(40);
  const path = new Path2D();
  pts.forEach((p, i) => { const [x, y] = map(p.x, p.y); i ? path.lineTo(x, y) : path.moveTo(x, y); });
  path.closePath();
  g.save();
  g.clip(path);
  // base (tinted per butterfly by instance colour)
  g.fillStyle = 'rgb(215,215,215)';
  g.fillRect(0, 0, W, H);
  // soft inner glow toward the body
  const [bx, by] = map(0, 0);
  const grd = g.createRadialGradient(bx, by, 4, bx, by, 150);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // veins radiating from the body
  g.strokeStyle = 'rgba(40,24,20,0.55)';
  g.lineWidth = 2.2;
  for (const [x, y] of [[0.22, 0.18], [0.24, 0.12], [0.21, 0.05], [0.16, -0.14], [0.12, -0.17], [0.09, -0.12]]) {
    const [ex, ey] = map(x, y);
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + ex) / 2 + 6, (by + ey) / 2, ex, ey); g.stroke();
  }
  // dark border band with pale spots
  g.lineWidth = 26;
  g.strokeStyle = 'rgb(38,26,24)';
  g.stroke(path);
  g.fillStyle = 'rgb(255,250,236)';
  for (let i = 4; i < pts.length - 4; i += 3) {
    const p = pts[i];
    const cx = p.x * 0.9, cy = p.y * 0.9;
    if (Math.hypot(p.x, p.y) < 0.09) continue;
    const [x, y] = map(cx, cy);
    g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
  }
  // eye-spot on the forewing
  const [ex, ey] = map(0.17, 0.12);
  g.fillStyle = 'rgb(38,26,24)'; g.beginPath(); g.arc(ex, ey, 9, 0, 7); g.fill();
  g.fillStyle = 'rgb(255,250,236)'; g.beginPath(); g.arc(ex, ey, 4, 0, 7); g.fill();
  g.restore();
  _wingTex = new THREE.CanvasTexture(c);
  _wingTex.colorSpace = THREE.SRGBColorSpace;
  _wingTex.userData.shared = true;
  return _wingTex;
}

function butterflyWingGeometry() {
  const geo = new THREE.ShapeGeometry(butterflyWingShape(), 10);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  const bounds = { min: b.min.clone(), max: b.max.clone() };
  geo.rotateX(-Math.PI / 2);
  geo.scale(1, 1, -1); // keep "forward" on +z after the rotation
  return { geo, bounds };
}

/** Butterflies flitting around a centre: shaped, patterned wings, a body and antennae. */
export function makeButterflies({ count = 24, center = new THREE.Vector3(), radius = 30, heightAt, seed = 5, colors = ['#ffffff', '#ffd23f', '#f2703c', '#8fd0ff', '#e58fd6'] } = {}) {
  const { geo: wingR, bounds } = butterflyWingGeometry();
  const wingL = wingR.clone().scale(-1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ map: butterflyWingTexture(bounds), side: THREE.DoubleSide, alphaTest: 0.3 });
  const bodyGeo = mergeGeometries([
    new THREE.CapsuleGeometry(0.014, 0.1, 4, 8).rotateX(Math.PI / 2),
    new THREE.SphereGeometry(0.018, 8, 6).translate(0, 0.005, 0.065),
    new THREE.CylinderGeometry(0.0025, 0.0025, 0.09, 4).rotateX(Math.PI / 2 - 0.5).rotateY(0.35).translate(0.018, 0.035, 0.1),
    new THREE.CylinderGeometry(0.0025, 0.0025, 0.09, 4).rotateX(Math.PI / 2 - 0.5).rotateY(-0.35).translate(-0.018, 0.035, 0.1),
    new THREE.SphereGeometry(0.007, 6, 4).translate(0.033, 0.055, 0.135),
    new THREE.SphereGeometry(0.007, 6, 4).translate(-0.033, 0.055, 0.135),
  ].map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
  const L = new THREE.InstancedMesh(wingL, mat, count), R = new THREE.InstancedMesh(wingR, mat, count);
  const B = new THREE.InstancedMesh(bodyGeo, new THREE.MeshBasicMaterial({ color: '#2a1c18' }), count);
  const rng = mulberry32(seed);
  const bs = [];
  for (let i = 0; i < count; i++) {
    const c = C(colors[i % colors.length]);
    L.setColorAt(i, c); R.setColorAt(i, c);
    bs.push({
      a: rng() * 6.28, h: 0.5 + rng() * 1.6, sp: 0.18 + rng() * 0.3, ph: rng() * 10, sc: 1.1 + rng() * 0.6,
      cx: center.x + (rng() - 0.5) * radius * 2, cz: center.z + (rng() - 0.5) * radius * 2, wr: 2 + rng() * 3,
    });
  }
  const g = new THREE.Group();
  g.add(L, R, B);
  L.frustumCulled = R.frustumCulled = B.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const pos = (b, t, out) => {
    const a = b.a + t * b.sp;
    const x = b.cx + Math.cos(a) * b.wr + Math.sin(t * 0.7 + b.ph) * 1.2;
    const z = b.cz + Math.sin(a * 1.3) * b.wr;
    const y = (heightAt ? heightAt(x, z) ?? center.y : center.y) + b.h + Math.sin(t * 1.7 + b.ph) * 0.35;
    return out.set(x, y, z);
  };
  const nxt = new THREE.Vector3();
  g.userData.update = (t) => {
    bs.forEach((b, i) => {
      pos(b, t, v);
      pos(b, t + 0.05, nxt);
      const yaw = Math.atan2(nxt.x - v.x, nxt.z - v.z);
      const beat = Math.sin(t * 16 + b.ph);
      const flap = 0.45 + beat * 0.75; // wings lift high, then sweep down
      const bob = beat * 0.02;
      v.y += bob;
      sc.setScalar(b.sc);
      e.set(-0.25, yaw, flap); q.setFromEuler(e); m4.compose(v, q, sc); R.setMatrixAt(i, m4);
      e.set(-0.25, yaw, -flap); q.setFromEuler(e); m4.compose(v, q, sc); L.setMatrixAt(i, m4);
      e.set(-0.25, yaw, 0); q.setFromEuler(e); m4.compose(v, q, sc); B.setMatrixAt(i, m4);
    });
    L.instanceMatrix.needsUpdate = R.instanceMatrix.needsUpdate = B.instanceMatrix.needsUpdate = true;
  };
  return g;
}

/** A flock of birds wheeling high overhead. */
export function makeBirds({ count = 14, center = new THREE.Vector3(0, 60, 0), radius = 90, color = '#2a2a38', seed = 8 } = {}) {
  const ws = new THREE.Shape();
  ws.moveTo(0, 0.14);
  ws.bezierCurveTo(0.35, 0.2, 0.7, 0.1, 1.05, -0.12);
  ws.bezierCurveTo(0.7, -0.08, 0.35, -0.12, 0.0, -0.12);
  const wing = new THREE.ShapeGeometry(ws, 8);
  wing.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true });
  const L = new THREE.InstancedMesh(wing, mat, count), R = new THREE.InstancedMesh(wing, mat, count);
  L.frustumCulled = R.frustumCulled = false;
  const rng = mulberry32(seed);
  const bs = Array.from({ length: count }, (_, i) => ({ off: new THREE.Vector3((rng() - 0.5) * 10, (rng() - 0.5) * 4, (rng() - 0.5) * 10), ph: rng() * 10, i }));
  const g = new THREE.Group();
  g.add(L, R);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  g.userData.update = (t) => {
    const a = t * 0.08;
    bs.forEach((b) => {
      v.set(center.x + Math.cos(a) * radius, center.y + Math.sin(t * 0.3) * 6, center.z + Math.sin(a) * radius).add(b.off);
      const flap = Math.sin(t * 7 + b.ph) * 0.6;
      e.set(0, -a, flap); q.setFromEuler(e); m4.compose(v, q, one); L.setMatrixAt(b.i, m4);
      e.set(0, -a + Math.PI, -flap); q.setFromEuler(e); m4.compose(v, q, one); R.setMatrixAt(b.i, m4);
    });
    L.instanceMatrix.needsUpdate = R.instanceMatrix.needsUpdate = true;
  };
  return g;
}

/** Pecking, wandering chickens within a box. */
export function makeChickens({ count = 6, area, heightAt, seed = 2 } = {}) {
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  const hens = [];
  for (let i = 0; i < count; i++) {
    const h = new THREE.Group();
    const body = sphere(0.18, i % 3 ? '#f5efe4' : '#b8743a', 0, 0.22, 0);
    body.scale.set(1, 0.9, 1.3);
    h.add(body);
    const head = sphere(0.09, i % 3 ? '#f5efe4' : '#b8743a', 0, 0.42, 0.17);
    h.add(head);
    h.add(sphere(0.04, '#e0453a', 0, 0.52, 0.17));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), toon('#f2b233'));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.41, 0.28);
    h.add(beak);
    const tail = sphere(0.1, i % 3 ? '#ece4d4' : '#8a4a24', 0, 0.3, -0.2);
    tail.scale.set(0.6, 1.1, 0.6);
    h.add(tail);
    for (const x of [-0.06, 0.06]) h.add(cyl(0.012, 0.012, 0.12, '#f2b233', x, 0.06, 0));
    const x = area.x0 + rng() * (area.x1 - area.x0), z = area.z0 + rng() * (area.z1 - area.z0);
    h.position.set(x, heightAt(x, z), z);
    g.add(h);
    hens.push({ h, head, tx: x, tz: z, wait: rng() * 3 });
  }
  g.userData.update = (t, _c, _p, dt = 0.016) => {
    for (const c of hens) {
      c.wait -= dt;
      if (c.wait < 0) { c.tx = area.x0 + Math.random() * (area.x1 - area.x0); c.tz = area.z0 + Math.random() * (area.z1 - area.z0); c.wait = 2 + Math.random() * 4; }
      const dx = c.tx - c.h.position.x, dz = c.tz - c.h.position.z, d = Math.hypot(dx, dz);
      if (d > 0.2) {
        c.h.position.x += (dx / d) * dt * 1.1;
        c.h.position.z += (dz / d) * dt * 1.1;
        c.h.rotation.y = Math.atan2(dx, dz);
        c.head.position.y = 0.42 + Math.abs(Math.sin(t * 12)) * 0.03;
      } else c.head.position.y = 0.42 - Math.max(0, Math.sin(t * 5 + c.tx)) * 0.2;
      c.h.position.y = heightAt(c.h.position.x, c.h.position.z);
    }
  };
  return g;
}

// ---------------------------------------------------------------- props

/** Rail fence along a polyline [[x,z],...]. */
export function fence(points, heightAt, { color = '#e8dcc4', spacing = 2.2, h = 1 } = {}) {
  const posts = [], rails = [];
  const post = new THREE.BoxGeometry(0.12, h, 0.12);
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < points.length - 2) continue;
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      posts.push(post.clone().translate(x, heightAt(x, z) + h / 2, z));
      if (k < n) {
        const x2 = ax + ((bx - ax) * (k + 1)) / n, z2 = az + ((bz - az) * (k + 1)) / n;
        const y1 = heightAt(x, z), y2 = heightAt(x2, z2);
        const seg = Math.hypot(x2 - x, z2 - z);
        for (const hy of [0.45, 0.8]) {
          const r = new THREE.BoxGeometry(0.06, 0.08, seg);
          r.rotateX(-Math.atan2(y2 - y1, seg));
          r.rotateY(Math.atan2(x2 - x, z2 - z));
          r.translate((x + x2) / 2, (y1 + y2) / 2 + hy * h, (z + z2) / 2);
          rails.push(r);
        }
      }
    }
  }
  const m = new THREE.Mesh(mergeGeometries([...posts, ...rails]), toon(color));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function lampPost(x, y, z, { color = '#3b3b40', glow = '#ffcf8a', height = 3 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(cyl(0.06, 0.09, height, color, 0, height / 2, 0, 8));
  g.add(cyl(0.16, 0.16, 0.08, color, 0, 0.04, 0, 10));
  const arm = box(0.5, 0.05, 0.05, color, 0.22, height - 0.1, 0);
  g.add(arm);
  const cage = cyl(0.13, 0.09, 0.3, null, 0.45, height - 0.35, 0, 8, glowMat(glow, 1.8));
  g.add(cage);
  g.add(cyl(0.17, 0.05, 0.1, color, 0.45, height - 0.15, 0, 8));
  const halo = glowSprite(glow, 1.6, 0.55);
  halo.position.set(0.45, height - 0.35, 0);
  g.add(halo);
  g.userData.colliders = [{ type: 'circle', x, z, r: 0.2 }];
  return g;
}

export function bench(x, y, z, ry = 0, color = '#8a5a3a') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  for (let i = 0; i < 3; i++) g.add(box(1.6, 0.05, 0.14, color, 0, 0.45, -0.18 + i * 0.17));
  for (let i = 0; i < 2; i++) g.add(box(1.6, 0.12, 0.04, color, 0, 0.7 + i * 0.18, -0.28));
  for (const sx of [-0.7, 0.7]) { g.add(box(0.08, 0.45, 0.45, '#4a3a30', sx, 0.22, 0)); g.add(box(0.06, 0.5, 0.06, '#4a3a30', sx, 0.7, -0.28)); }
  g.userData.colliders = [{ type: 'circle', x, z, r: 0.75, h: 0.8 }];
  return g;
}

export function crate(x, y, z, s = 0.8, ry = 0, color = '#9a6b45') {
  const g = new THREE.Group();
  g.position.set(x, y + s / 2, z);
  g.rotation.y = ry;
  g.add(box(s, s, s, color));
  const dark = toon(new THREE.Color(color).multiplyScalar(0.7));
  for (const sy of [-1, 1]) g.add(box(s * 1.02, s * 0.1, s * 1.02, null, 0, sy * s * 0.42, 0, dark));
  const d = box(s * 1.02, s * 0.08, s * 1.3, null, 0, 0, 0, dark);
  d.rotation.x = Math.PI / 4;
  d.scale.z = 0.95;
  g.add(d);
  return g;
}

export function barrel(x, y, z, s = 1, color = '#8a5a3a') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.9 * s, 14), toon(color));
  const p = body.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const yy = p.getY(i) / (0.45 * s); const k = 1 + (1 - yy * yy) * 0.14; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  body.geometry.computeVertexNormals();
  body.position.y = 0.45 * s;
  body.castShadow = true;
  g.add(body);
  for (const yy of [0.15, 0.45, 0.75]) g.add(cyl(0.37 * s * (yy === 0.45 ? 1.1 : 1.02), 0.37 * s * (yy === 0.45 ? 1.1 : 1.02), 0.05, '#4a4a50', 0, yy * s, 0, 14));
  return g;
}

export function well(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const st = box(0.42, 0.32, 0.3, i % 2 ? '#9a9aa4' : '#8a8a94', Math.cos(a) * 0.8, 0.16, Math.sin(a) * 0.8);
    st.rotation.y = -a;
    g.add(st);
    const st2 = box(0.42, 0.32, 0.3, i % 2 ? '#8a8a94' : '#9a9aa4', Math.cos(a + 0.26) * 0.8, 0.48, Math.sin(a + 0.26) * 0.8);
    st2.rotation.y = -a - 0.26;
    g.add(st2);
  }
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.65, 20), new THREE.MeshBasicMaterial({ color: '#2a4a6a' }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.5;
  g.add(water);
  for (const sx of [-0.8, 0.8]) g.add(box(0.12, 1.8, 0.12, '#6b4b33', sx, 1.2, 0));
  const r1 = box(1.1, 0.08, 1.2, '#b8502c', 0, 2.3, 0.3); r1.rotation.x = 0.6; g.add(r1);
  const r2 = box(1.1, 0.08, 1.2, '#b8502c', 0, 2.3, -0.3); r2.rotation.x = -0.6; g.add(r2);
  const axle = cyl(0.05, 0.05, 1.6, '#6b4b33', 0, 1.6, 0, 8);
  axle.rotation.z = Math.PI / 2;
  g.add(axle);
  const bucket = cyl(0.14, 0.11, 0.2, '#8a5a3a', 0.3, 1.1, 0, 10);
  g.add(bucket);
  g.add(cyl(0.008, 0.008, 0.45, '#d8c8a8', 0.3, 1.4, 0, 4));
  g.userData.colliders = [{ type: 'circle', x, z, r: 1.1 }];
  return g;
}

export function scarecrow(x, y, z, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.add(cyl(0.05, 0.05, 2.2, '#6b4b33', 0, 1.1, 0, 6));
  const bar = cyl(0.04, 0.04, 1.6, '#6b4b33', 0, 1.6, 0, 6);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  g.add(box(0.5, 0.6, 0.3, '#a9203e', 0, 1.45, 0));
  for (const sx of [-1, 1]) { const sl = cyl(0.1, 0.12, 0.6, '#a9203e', sx * 0.5, 1.6, 0, 8); sl.rotation.z = Math.PI / 2; g.add(sl); g.add(sphere(0.08, '#e6c77a', sx * 0.82, 1.6, 0)); }
  g.add(sphere(0.22, '#e8d8b0', 0, 2.0, 0));
  g.add(cyl(0.34, 0.34, 0.03, '#c9a860', 0, 2.17, 0, 16));
  g.add(cyl(0.16, 0.2, 0.2, '#c9a860', 0, 2.27, 0, 12));
  for (const sx of [-0.07, 0.07]) g.add(sphere(0.025, '#2a1b17', sx, 2.03, 0.2));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.update = (t) => (g.rotation.z = Math.sin(t * 0.9) * 0.02);
  g.userData.colliders = [{ type: 'circle', x, z, r: 0.3 }];
  return g;
}

/** Laundry line between two posts, cloths swaying in the wind. */
export function laundryLine(ax, az, bx, bz, heightAt, { colors = ['#ffffff', '#5d93c9', '#f2703c', '#e8d4a8', '#a9203e'], seed = 3 } = {}) {
  const g = new THREE.Group();
  const ya = heightAt(ax, az), yb = heightAt(bx, bz);
  g.add(cyl(0.05, 0.05, 2, '#6b4b33', ax, ya + 1, az, 6));
  g.add(cyl(0.05, 0.05, 2, '#6b4b33', bx, yb + 1, bz, 6));
  const len = Math.hypot(bx - ax, bz - az);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 4), toon('#e8dcc4'));
  rope.rotation.z = Math.PI / 2;
  rope.rotation.y = -Math.atan2(bz - az, bx - ax);
  rope.position.set((ax + bx) / 2, (ya + yb) / 2 + 1.9, (az + bz) / 2);
  g.add(rope);
  const rng = mulberry32(seed);
  const cloths = [];
  const n = Math.floor(len / 0.8);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const piv = new THREE.Group();
    piv.position.set(ax + (bx - ax) * t, ya + (yb - ya) * t + 1.9, az + (bz - az) * t);
    piv.rotation.y = -Math.atan2(bz - az, bx - ax);
    const w = 0.4 + rng() * 0.3, h = 0.5 + rng() * 0.4;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toon(colors[i % colors.length], { side: THREE.DoubleSide }));
    cloth.position.y = -h / 2;
    cloth.castShadow = true;
    piv.add(cloth);
    g.add(piv);
    cloths.push({ piv, ph: rng() * 6 });
  }
  g.userData.update = (t) => cloths.forEach((c) => (c.piv.rotation.x = Math.sin(t * 1.8 + c.ph) * 0.25 + 0.1));
  return g;
}

export function woodpile(x, y, z, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 5 - row; i++) {
      const l = cyl(0.14, 0.14, 1.1, i % 2 ? '#8a5a3a' : '#a0703f', (i - (4 - row) / 2) * 0.3, 0.14 + row * 0.25, 0, 8);
      l.rotation.x = Math.PI / 2;
      g.add(l);
      const end = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), toon('#e8c890'));
      end.position.set(l.position.x, l.position.y, 0.56);
      g.add(end);
    }
  }
  g.userData.colliders = [{ type: 'circle', x, z, r: 0.9, h: 1.0 }];
  return g;
}

export function beehive(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(box(0.5, 0.5, 0.5, '#6b4b33', 0, 0.25, 0));
  for (let i = 0; i < 4; i++) { const r = cyl(0.3 - i * 0.05, 0.32 - i * 0.05, 0.16, '#e0b45c', 0, 0.58 + i * 0.15, 0, 14); g.add(r); }
  g.add(box(0.1, 0.05, 0.05, '#2a1b17', 0, 0.62, 0.3));
  return g;
}

export function boat(x, y, z, ry = 0, color = '#8a5a3a', stripe = '#a9203e') {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(color, { side: THREE.DoubleSide }));
  hull.scale.set(0.8, 0.45, 2.1);
  hull.position.y = 0.4;
  hull.castShadow = true;
  g.add(hull);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 30), toon(stripe));
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(0.8, 2.1, 1);
  rim.position.y = 0.4;
  g.add(rim);
  g.add(box(1.3, 0.05, 0.3, '#6b4b33', 0, 0.3, 0.3));
  const oar = box(0.06, 0.04, 2.2, '#c9a870', 0.4, 0.45, -0.2);
  oar.rotation.y = 0.3;
  g.add(oar);
  return g;
}

export function dryingRack(x, y, z, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  for (const sx of [-1.2, 1.2]) { const a = cyl(0.05, 0.05, 2.2, '#6b4b33', sx, 1.0, 0, 6); a.rotation.z = sx > 0 ? 0.15 : -0.15; g.add(a); }
  const bar = cyl(0.04, 0.04, 2.6, '#6b4b33', 0, 2.0, 0, 6);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4, 10, 6), new THREE.MeshBasicMaterial({ color: '#c9b890', wireframe: true, transparent: true, opacity: 0.8 }));
  net.position.y = 1.3;
  g.add(net);
  g.userData.update = (t) => (net.rotation.x = Math.sin(t * 1.3) * 0.08);
  g.userData.colliders = [{ type: 'circle', x, z, r: 0.5 }];
  return g;
}

export function cairn(x, y, z, n = 5) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  let yy = 0;
  for (let i = 0; i < n; i++) {
    const r = 0.35 - i * 0.05;
    const st = sphere(r, i % 2 ? '#8a8290' : '#a09aa4', (i % 2 - 0.5) * 0.05, yy + r * 0.5, 0);
    st.scale.y = 0.55;
    g.add(st);
    yy += r * 0.9;
  }
  return g;
}

/** Bulb string between two world points (festival lights). */
export function stringLights(a, b, { color = '#ffcf8a', bulbs = 10, sag = 0.8 } = {}) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.012, 4), toon('#2a2420')));
  const bulbMat = glowMat(color, 2.2);
  for (let i = 1; i < bulbs; i++) {
    const p = curve.getPoint(i / bulbs);
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbMat);
    bl.position.copy(p).add(new THREE.Vector3(0, -0.08, 0));
    g.add(bl);
    const s = glowSprite(color, 0.7, 0.6);
    s.position.copy(bl.position);
    g.add(s);
  }
  return g;
}

/** Waving banner on a pole. */
export function banner(x, y, z, { color = '#a9203e', trim = '#ffcf7a', h = 5, ry = 0 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.add(cyl(0.05, 0.06, h, '#c9a860', 0, h / 2, 0, 8));
  g.add(sphere(0.1, trim, 0, h + 0.05, 0));
  const geo = new THREE.PlaneGeometry(0.9, 2.2, 8, 8);
  geo.translate(0.5, -1.1, 0);
  const cloth = new THREE.Mesh(geo, toon(color, { side: THREE.DoubleSide }));
  cloth.position.y = h - 0.2;
  cloth.castShadow = true;
  g.add(cloth);
  const base = geo.attributes.position.array.slice();
  g.userData.update = (t) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1];
      p.setZ(i, Math.sin(t * 3 + bx * 3 + by) * 0.15 * bx);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return g;
}

/** Fountain with arcing water jets. */
export function fountain(x, y, z, { r = 2.4, color = '#e8dfd0', water = '#8fd0ff' } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const basin = new THREE.Mesh(new THREE.TorusGeometry(r, 0.25, 8, 40), toon(color));
  basin.rotation.x = Math.PI / 2;
  basin.position.y = 0.4;
  g.add(basin);
  g.add(cyl(r, r, 0.3, color, 0, 0.15, 0, 40));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(r - 0.1, 40), new THREE.MeshBasicMaterial({ color: water, transparent: true, opacity: 0.7 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.36;
  g.add(pool);
  g.add(cyl(0.3, 0.5, 1.4, color, 0, 0.9, 0, 16));
  g.add(cyl(1.0, 0.4, 0.2, color, 0, 1.6, 0, 20));
  g.add(sphere(0.25, '#ffcf7a', 0, 2.0, 0));
  const n = 240, pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) ph[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, col: { value: C(water) } },
    vertexShader: /* glsl */ `attribute float phase; uniform float time; varying float vA;
      void main(){ float t = fract(time*0.6 + phase); float a = phase*6.2831*7.0;
        vec3 p = vec3(cos(a)*t*1.6, 2.1 + t*1.8 - t*t*3.3, sin(a)*t*1.6);
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = 60.0/-mv.z; vA = 1.0 - t; }`,
    fragmentShader: /* glsl */ `uniform vec3 col; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; gl_FragColor = vec4(col*1.3, vA*0.8); }`,
  });
  g.add(new THREE.Points(geo, mat));
  g.userData.update = (t) => (mat.uniforms.time.value = t);
  g.userData.colliders = [{ type: 'circle', x, z, r: r + 0.2 }];
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function signpost(x, y, z, ry, labels = ['→']) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.add(cyl(0.06, 0.07, 2, '#6b4b33', 0, 1, 0, 6));
  labels.forEach((_, i) => {
    const b = box(0.9, 0.2, 0.05, '#c9a870', 0.35 * (i % 2 ? -1 : 1), 1.7 - i * 0.3, 0);
    b.rotation.y = i * 0.6;
    g.add(b);
  });
  return g;
}
