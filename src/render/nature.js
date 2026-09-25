import * as THREE from 'three';
import { toon, vtoon, colored, merge, mat4, heightTint, scatterInstanced } from './toon.js';
import { mulberry32, fbm } from '../utils/noise.js';

// Shared builders for Ghibli-style landscapes: painted terrain, swaying grass,
// blobby broadleaf trees, pines, boulders, far mountains, shimmering water.

const windUniforms = { uTime: { value: 0 } };
export function updateWind(t) { windUniforms.uTime.value = t; }

function windify(material, strength = 0.18, litBothSides = false) {
  material.onBeforeCompile = (shader) => {
    // thin blades: light both faces as if they faced the sky
    if (litBothSides) shader.fragmentShader = shader.fragmentShader.replace('normal *= faceDirection;', '');
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         vec3 ip = instanceMatrix[3].xyz;
       #else
         vec3 ip = vec3(0.0);
       #endif
       float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.27) * 0.6 + sin(uTime * 3.1 + ip.x * 1.3) * 0.25;
       float k = max(0.0, position.y) * ${strength.toFixed(3)};
       transformed.x += sway * k;
       transformed.z += sway * k * 0.5;`,
    );
  };
  material.customProgramCacheKey = () => `wind${strength}${litBothSides}`;
  return material;
}

// Terrain mesh whose vertex colours are painted from a colour function.
export function terrain({ size = 600, seg = 180, height, color, cx = 0, cz = 0 }) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    const y = height(x, z);
    pos.setXYZ(i, x, y, z);
    color(x, z, y, c);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, vtoon());
  m.receiveShadow = true;
  return m;
}

export function grassField({ count = 9000, area, heightAt, accept = () => true, colors = ['#6fae3f', '#8cc152', '#a4cf5a', '#5d9a36'], seed = 11, blade = 0.5 }) {
  const r = mulberry32(seed);
  const geo = new THREE.BufferGeometry();
  // a tuft of 6 tapered blades fanning outward, deeper base → sunny tip
  const verts = [], cols = [], norms = [];
  const rr = mulberry32(seed + 1);
  for (let b = 0; b < 6; b++) {
    const a = (b / 6) * Math.PI * 2 + rr();
    const lean = 0.25 + rr() * 0.35, hgt = 0.6 + rr() * 0.5, w = 0.05;
    const dx = Math.cos(a), dz = Math.sin(a);
    const ox = dx * 0.06, oz = dz * 0.06;
    verts.push(ox - dz * w, 0, oz + dx * w, ox + dz * w, 0, oz - dx * w, ox + dx * lean, hgt, oz + dz * lean);
    cols.push(0.8, 0.86, 0.66, 0.8, 0.86, 0.66, 1.22, 1.18, 0.9);
    norms.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  const mat = windify(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.22, true);
  const transforms = [], tints = [];
  const pal = colors.map((h) => new THREE.Color(h));
  let tries = 0;
  while (transforms.length < count && tries++ < count * 4) {
    const x = area[0] + r() * (area[2] - area[0]);
    const z = area[1] + r() * (area[3] - area[1]);
    if (!accept(x, z)) continue;
    const s = blade * (0.6 + r() * 0.8);
    transforms.push(mat4(x, heightAt(x, z) - 0.03, z, s * 1.2, s, s * 1.2, 0, r() * Math.PI * 2, 0));
    tints.push(pal[Math.floor(fbm(x * 0.05, z * 0.05, 2) * pal.length * 1.4) % pal.length].clone().offsetHSL(0, 0, (r() - 0.5) * 0.06));
  }
  const im = scatterInstanced(geo, mat, transforms, tints);
  im.castShadow = false;
  return im;
}

export function flowerField({ count = 800, area, heightAt, accept = () => true, colors = ['#ffffff', '#fff2a8', '#ff9fb2', '#f26b4f', '#c9a8ff'], seed = 13 }) {
  const r = mulberry32(seed);
  const petal = new THREE.SphereGeometry(0.09, 6, 4);
  petal.scale(1, 0.55, 1);
  petal.translate(0, 0.35, 0);
  const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.35, 3); stem.translate(0, 0.17, 0);
  const geo = merge([colored(petal, '#ffffff'), colored(stem, '#5b8c3a')]);
  const mat = windify(vtoon(), 0.3);
  const t = [], c = [];
  let tries = 0;
  while (t.length < count && tries++ < count * 5) {
    const x = area[0] + r() * (area[2] - area[0]);
    const z = area[1] + r() * (area[3] - area[1]);
    if (!accept(x, z)) continue;
    const s = 0.7 + r() * 0.8;
    t.push(mat4(x, heightAt(x, z), z, s));
    c.push(new THREE.Color(colors[Math.floor(r() * colors.length)]));
  }
  const im = scatterInstanced(geo, mat, t, c);
  im.castShadow = false;
  return im;
}

// Broadleaf tree template: trunk + clustered foliage blobs.
export function broadleafGeometry(seed = 1, { leaf = '#4f8f3a', leaf2 = '#79b24a', trunk = '#6b4a32', height = 5, spread = 2.4 } = {}) {
  const r = mulberry32(seed);
  const parts = [];
  const tr = new THREE.CylinderGeometry(0.18, 0.34, height, 6);
  parts.push(colored(tr, trunk, mat4(0, height / 2, 0)));
  for (let i = 0; i < 3; i++) {
    const br = new THREE.CylinderGeometry(0.07, 0.14, height * 0.45, 5);
    const a = r() * Math.PI * 2;
    parts.push(colored(br, trunk, mat4(Math.cos(a) * 0.4, height * 0.78, Math.sin(a) * 0.4, 1, 1, 1, Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7)));
  }
  const blobs = 9;
  for (let i = 0; i < blobs; i++) {
    const a = r() * Math.PI * 2, d = r() * spread * 0.8;
    const s = spread * (0.45 + r() * 0.4);
    const y = height * 0.85 + r() * spread * 0.9;
    const ico = new THREE.SphereGeometry(1, 12, 9);
    parts.push(colored(ico, r() > 0.5 ? leaf : leaf2, mat4(Math.cos(a) * d, y, Math.sin(a) * d, s, s * 0.8, s)));
  }
  return heightTint(merge(parts), 0.35, 0.3);
}

export function pineGeometry(seed = 1, { leaf = '#2f6b4a', trunk = '#5a3d2b', height = 7 } = {}) {
  const r = mulberry32(seed);
  const parts = [colored(new THREE.CylinderGeometry(0.15, 0.25, height * 0.35, 5), trunk, mat4(0, height * 0.17, 0))];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const rad = (1 - t) * height * 0.28 + 0.4;
    const cone = new THREE.ConeGeometry(rad, height * 0.38, 7);
    parts.push(colored(cone, leaf, mat4(0, height * (0.3 + t * 0.2) + height * 0.19, 0, 1, 1, 1, 0, r() * 3, 0)));
  }
  return heightTint(merge(parts), 0.4, 0.25);
}

export function forest({ template, positions, heightAt, scale = [0.8, 1.3], seed = 21, tint }) {
  const r = mulberry32(seed);
  const t = [], c = [];
  for (const [x, z, s0] of positions) {
    const s = s0 ?? scale[0] + r() * (scale[1] - scale[0]);
    t.push(mat4(x, heightAt(x, z) - 0.2, z, s, s * (0.9 + r() * 0.25), s, 0, r() * Math.PI * 2, 0));
    c.push(new THREE.Color(1, 1, 1).offsetHSL((r() - 0.5) * 0.03, 0, (r() - 0.5) * 0.1).multiply(new THREE.Color(tint ?? '#ffffff')));
  }
  const im = scatterInstanced(template, windify(vtoon(), 0.012), t, c);
  im.receiveShadow = false; // self-shadowed foliage turns into blocky patches
  return im;
}

export function rockGeometry(seed = 1, color = '#8e97a8') {
  const r = mulberry32(seed);
  const g = new THREE.SphereGeometry(1, 10, 8);
  const p = g.attributes.position;
  const o = r() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + fbm(x * 1.3 + o, z * 1.3 + y, 2) * 0.45;
    p.setXYZ(i, x * k, Math.max(-0.3, y) * k * 0.72, z * k);
  }
  g.computeVertexNormals();
  return heightTint(colored(g, color), 0.35, 0.3);
}

export function rocks({ positions, heightAt, seed = 5, color = '#9aa2b3' }) {
  const r = mulberry32(seed);
  const t = positions.map(([x, z, s]) => mat4(x, heightAt(x, z) + s * 0.1, z, s, s * (0.7 + r() * 0.5), s * (0.8 + r() * 0.4), 0, r() * 6, 0));
  return scatterInstanced(rockGeometry(seed, color), vtoon(), t);
}

// Distant painted mountains: green skirts → blue rock → snow.
export function mountainRange({ count = 9, radius = [380, 560], height = [140, 260], seed = 9, snow = true, colors = {} }) {
  const r = mulberry32(seed);
  const group = new THREE.Group();
  const base = new THREE.Color(colors.base ?? '#5f8f5a');
  const rock = new THREE.Color(colors.rock ?? '#6f86b3');
  const snowC = new THREE.Color(colors.snow ?? '#f4f6ff');
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.4;
    const d = radius[0] + r() * (radius[1] - radius[0]);
    const h = height[0] + r() * (height[1] - height[0]);
    const g = new THREE.ConeGeometry(h * (0.8 + r() * 0.5), h, 28, 12);
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const t = (y + h / 2) / h;
      const n = fbm(x * 0.02 + i * 7, z * 0.02 + y * 0.015, 4);
      const jag = (n - 0.5) * h * 0.25 * (1 - t * 0.6);
      const f = 1 + jag / Math.max(1, Math.hypot(x, z));
      p.setXYZ(k, x * f, y + (n - 0.5) * h * 0.08, z * f);
      c.copy(base).lerp(rock, Math.min(1, t * 1.6 + (n - 0.5)));
      if (snow && t + (n - 0.5) * 0.3 > 0.68) c.copy(snowC).lerp(rock, 0.12 * (1 - t));
      cols.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, vtoon());
    m.position.set(Math.cos(a) * d, h / 2 - 10, Math.sin(a) * d);
    m.rotation.y = r() * 6;
    group.add(m);
  }
  return group;
}

// Stylised water: fresnel sky colour, sparkles and soft ripples.
export function waterMaterial({ shallow = '#7fd3d6', deep = '#2f6fa3', sky = '#cfe9ff', sparkle = 1 } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: windUniforms.uTime,
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uSky: { value: new THREE.Color(sky) },
      uSparkle: { value: sparkle },
    },
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vN;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uSparkle; uniform vec3 uShallow, uDeep, uSky; varying vec3 vW; varying vec3 vN;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(0.0, v.y), 2.2);
        vec2 p = vW.xz * 0.35;
        float rip = n(p + uTime * 0.25) * 0.5 + n(p * 2.3 - uTime * 0.35) * 0.5;
        vec3 col = mix(uShallow, uDeep, 0.35 + rip * 0.3);
        col = mix(col, uSky, fres * 0.75);
        float band = smoothstep(0.62, 0.7, rip) * (1.0 - smoothstep(0.7, 0.8, rip));
        col += vec3(1.0) * band * 0.35;
        float sp = step(0.985, n(vW.xz * 3.0 + uTime * 0.6)) * uSparkle;
        col += vec3(1.0, 0.97, 0.85) * sp;
        gl_FragColor = vec4(col, 0.92);
      }`,
  });
  return m;
}

export function fence({ points, heightAt, color = '#8a6a4a' }) {
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, z1] = points[i], [x2, z2] = points[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / 2.2));
    for (let k = 0; k <= n; k++) {
      const x = x1 + ((x2 - x1) * k) / n, z = z1 + ((z2 - z1) * k) / n;
      parts.push(colored(new THREE.BoxGeometry(0.14, 1.1, 0.14), color, mat4(x, heightAt(x, z) + 0.55, z)));
    }
    const ang = Math.atan2(z2 - z1, x2 - x1);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, my = heightAt(mx, mz);
    for (const hh of [0.45, 0.85]) parts.push(colored(new THREE.BoxGeometry(len, 0.08, 0.06), color, mat4(mx, my + hh, mz, 1, 1, 1, 0, -ang, 0)));
  }
  const m = new THREE.Mesh(merge(parts), vtoon());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export { toon };
