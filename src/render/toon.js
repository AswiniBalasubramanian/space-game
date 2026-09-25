import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Anime-style cel shading: a soft 4-band ramp so shadows read as painted washes
// rather than hard black blocks.
let ramp;
export function toonRamp() {
  if (ramp) return ramp;
  const data = new Uint8Array([120, 175, 225, 255]);
  ramp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

const matCache = new Map();
export function toon(color, opts = {}) {
  const key = opts.cache === false ? null : `${new THREE.Color(color).getHexString()}|${JSON.stringify(opts)}`;
  if (key && matCache.has(key)) return matCache.get(key);
  const { cache, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...rest });
  if (key) matCache.set(key, m);
  return m;
}

export function vtoon(opts = {}) {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), ...opts });
}

export function glow(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, fog: false });
}

// Inverted-hull ink outline shared by characters and hero props.
const outlineMats = new Map();
function outlineMaterial(thickness, color) {
  const key = `${thickness}|${color}`;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: { uThick: { value: thickness }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`
      uniform float uThick;
      void main(){
        vec3 p = position + normal * uThick;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
    side: THREE.BackSide,
  });
  outlineMats.set(key, m);
  return m;
}

export function outline(obj, thickness = 0.018, color = 0x2b2440) {
  obj.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.noOutline || o.userData.isOutline) return;
    const hull = new THREE.Mesh(o.geometry, outlineMaterial(thickness, color));
    hull.userData.isOutline = true;
    hull.raycast = () => {};
    o.add(hull);
  });
  return obj;
}

export function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}

// Normalise geometries (non-indexed, position/normal/color only) so they can be
// merged into a single instanced template.
export function colored(geo, color, matrix) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (matrix) g.applyMatrix4(matrix);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function merge(list) { return mergeGeometries(list, false); }

export function mat4(x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

// Shade a merged geometry's vertex colours by height (lighter tops like painted
// foliage catching the sun).
export function heightTint(geo, lighten = 0.25, darken = 0.2) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const pos = geo.attributes.position, col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min.y) / Math.max(0.0001, max.y - min.y);
    const k = 1 - darken + (lighten + darken) * t;
    col.setXYZ(i, Math.min(1, col.getX(i) * k), Math.min(1, col.getY(i) * k), Math.min(1, col.getZ(i) * k * 0.97));
  }
  return geo;
}

export function scatterInstanced(geo, material, transforms, colors) {
  const im = new THREE.InstancedMesh(geo, material, transforms.length);
  transforms.forEach((m, i) => im.setMatrixAt(i, m));
  if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
  im.castShadow = true; im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}
