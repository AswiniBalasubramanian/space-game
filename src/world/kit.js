// The "hand-painted" environment kit: toon materials, painted skies, cumulus clouds,
// wind-blown grass, clumpy trees, snow-capped mountains, rocks, flowers and water.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { NOISE_GLSL, fbm, mulberry32, noise2 } from '../core/noise.js';

const C = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));

// ---------------------------------------------------------------- materials

let _ramp;
export function toonRamp() {
  if (!_ramp) {
    _ramp = new THREE.DataTexture(new Uint8Array([110, 175, 230, 255]), 4, 1, THREE.RedFormat);
    _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter;
    _ramp.needsUpdate = true;
  }
  return _ramp;
}

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color: C(color), gradientMap: toonRamp(), ...extra });
}

export function glowMat(color, intensity = 2, extra = {}) {
  const c = C(color).clone().multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: false, ...extra });
}

/** Stylised sun-banded shading used for foliage and clouds. */
export function paintMaterial({ lit = '#ffffff', shadow = '#8fa3c7', sunDir, rim = 0.35, rimColor = '#fff6d8', vertexColors = false, fog = true, bands = 3, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    vertexColors,
    fog,
    transparent: opacity < 1,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        lit: { value: C(lit) },
        shadow: { value: C(shadow) },
        sunDir: { value: (sunDir || new THREE.Vector3(0.5, 0.8, 0.3)).clone().normalize() },
        rim: { value: rim },
        rimColor: { value: C(rimColor) },
        bands: { value: bands },
        opacity: { value: opacity },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW; varying vec3 vCol;
      #include <fog_pars_vertex>
      void main(){
        vec4 wp = vec4(position,1.0);
        vec3 nn = normal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp; nn = mat3(instanceMatrix) * nn;
        #endif
        wp = modelMatrix * wp;
        vN = normalize(mat3(modelMatrix) * nn);
        vW = wp.xyz;
        #ifdef USE_COLOR
          vCol = color;
        #else
          vCol = vec3(1.0);
        #endif
        #ifdef USE_INSTANCING_COLOR
          vCol *= instanceColor;
        #endif
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 lit, shadow, sunDir, rimColor; uniform float rim, bands, opacity;
      varying vec3 vN; varying vec3 vW; varying vec3 vCol;
      #include <fog_pars_fragment>
      void main(){
        vec3 n = normalize(vN);
        float l = dot(n, normalize(sunDir));
        float s = smoothstep(-0.25, 0.55, l);
        float b = floor(s*bands + 0.5)/bands;
        s = mix(s, b, 0.45);
        vec3 col = mix(shadow, lit, s) * vCol;
        vec3 V = normalize(cameraPosition - vW);
        float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        col += rimColor * fr * rim * (0.35 + 0.65*s);
        gl_FragColor = vec4(col, opacity);
        #include <fog_fragment>
      }`,
  });
}

export function shadowed(mesh, cast = true, receive = true) {
  mesh.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return mesh;
}

export function box(w, h, d, color, x = 0, y = 0, z = 0, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || toon(color));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 16, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat || toon(color));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function sphere(r, color, x = 0, y = 0, z = 0, mat, seg = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat || toon(color));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- textures

const _texCache = {};
export function softTexture() {
  if (_texCache.soft) return _texCache.soft;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (_texCache.soft = t);
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.canvas = c;
  return t;
}

export function glowSprite(color, size, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softTexture(), color: C(color), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  s.scale.setScalar(size);
  return s;
}

// ---------------------------------------------------------------- lighting

export function addLights(scene, { sunDir, sunColor = '#fff1d6', sunIntensity = 2.6, sky = '#bfdcff', ground = '#6d8f5a', hemi = 1.1, ambient = 0.25, shadowSize = 45 } = {}) {
  const dir = (sunDir || new THREE.Vector3(0.5, 0.8, 0.3)).clone().normalize();
  const sun = new THREE.DirectionalLight(C(sunColor), sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -shadowSize;
  sc.right = sc.top = shadowSize;
  sc.near = 1;
  sc.far = 260;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemiL = new THREE.HemisphereLight(C(sky), C(ground), hemi);
  scene.add(hemiL);
  const amb = new THREE.AmbientLight(0xffffff, ambient);
  scene.add(amb);
  return {
    sun, hemi: hemiL, ambient: amb, dir,
    follow(p) {
      sun.position.set(p.x + dir.x * 110, p.y + dir.y * 110, p.z + dir.z * 110);
      sun.target.position.copy(p);
    },
  };
}

// ---------------------------------------------------------------- sky

export function makeSky({ top = '#2f6fc4', mid = '#5fa2e3', horizon = '#cfe8f5', bottom = '#8fb2c9', sunDir, sunColor = '#fff4d6', sunSize = 1, cirrus = 0.35, stars = 0, glow = '#ffd9a0', glowAmt = 0.25, radius = 4000 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: C(top) }, mid: { value: C(mid) }, horizon: { value: C(horizon) }, bottom: { value: C(bottom) },
      sunDir: { value: (sunDir || new THREE.Vector3(0.5, 0.8, 0.3)).clone().normalize() },
      sunColor: { value: C(sunColor) }, sunSize: { value: sunSize },
      cirrus: { value: cirrus }, stars: { value: stars }, glow: { value: C(glow) }, glowAmt: { value: glowAmt },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; gl_Position.z = gl_Position.w*0.99999; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, mid, horizon, bottom, sunDir, sunColor, glow; uniform float sunSize, cirrus, stars, time, glowAmt;
      varying vec3 vW;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vW - cameraPosition);
        float h = d.y;
        vec3 col;
        if (h > 0.0) col = mix(mix(horizon, mid, smoothstep(0.0, 0.22, h)), top, smoothstep(0.22, 0.85, h));
        else col = mix(horizon, bottom, smoothstep(0.0, -0.25, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += glow * pow(s, 4.0) * glowAmt * (1.0 - smoothstep(0.0, 0.5, h)) ;
        col += sunColor * (smoothstep(0.9993 - 0.0006*sunSize, 0.9997, s) * 3.0 + pow(s, 60.0) * 0.35 + pow(s, 8.0)*0.12);
        // painted wisps — stretched brush strokes high in the sky
        if (cirrus > 0.0 && h > 0.02) {
          vec2 p = d.xz / (h + 0.25);
          float n = fbm2(vec2(p.x*1.4 + time*0.004, p.y*4.5));
          float w = smoothstep(0.55, 0.85, n) * smoothstep(0.02, 0.25, h);
          col = mix(col, vec3(1.0), w * cirrus);
        }
        if (stars > 0.0 && h > -0.05) {
          vec3 q = d * 380.0;
          float st = hash31(floor(q));
          float tw = 0.6 + 0.4*sin(time*2.0 + st*40.0);
          col += vec3(0.9,0.95,1.0) * step(0.9975, st) * stars * tw * smoothstep(0.0, 0.3, h);
          // milky band
          float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.6, -0.74)))*3.2, 2.0));
          col += vec3(0.35,0.4,0.7) * band * stars * 0.25 * fbm3(d*6.0);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.update = (t, cam) => { mat.uniforms.time.value = t; mesh.position.copy(cam.position); };
  return mesh;
}

// ---------------------------------------------------------------- clouds

/**
 * Painted cumulus: every puff is a camera-facing billboard with hand-shaded, top-lit
 * falloff, all clouds in a single instanced draw call.
 */
export function makeClouds({ count = 22, seed = 7, rMin = 250, rMax = 900, yMin = 90, yMax = 260, sMin = 18, sMax = 55, lit = '#ffffff', shadow = '#9db4d8', rimColor = '#fff3d6', drift = 1.2, arc = null, center = new THREE.Vector3() } = {}) {
  const rng = mulberry32(seed);
  const centers = [], sizes = [], shades = [], seeds = [], cloudIdx = [];
  const bases = [];
  for (let c = 0; c < count; c++) {
    const a = arc ? arc[0] + rng() * (arc[1] - arc[0]) : rng() * Math.PI * 2;
    const r = rMin + rng() * (rMax - rMin);
    const S = sMin + rng() * (sMax - sMin);
    const base = new THREE.Vector3(center.x + Math.cos(a) * r, yMin + rng() * (yMax - yMin), center.z + Math.sin(a) * r);
    bases.push({ base, speed: (0.4 + rng()) * drift });
    const width = 1.4 + rng() * 1.4;
    const puffs = 16 + Math.floor(rng() * 16);
    const along = new THREE.Vector3(Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2));
    for (let i = 0; i < puffs; i++) {
      const t = rng();
      const bell = 1 - Math.pow(Math.abs(t - 0.5) * 2, 1.7);
      const x = (t - 0.5) * width * 2;
      const y = bell * (0.35 + rng() * 0.9) + (i > puffs * 0.7 ? bell * 0.5 : 0);
      const z = (rng() - 0.5) * 0.8;
      const off = along.clone().multiplyScalar(x * S).add(new THREE.Vector3(0, y * S * 0.75, 0)).add(new THREE.Vector3(-along.z, 0, along.x).multiplyScalar(z * S));
      centers.push(off.x, off.y, off.z);
      sizes.push(S * (0.55 + bell * 0.75) * (0.8 + rng() * 0.4));
      shades.push(Math.min(1, y / 1.4));
      seeds.push(rng() * 100);
      cloudIdx.push(c);
    }
    // flat-ish shaded base
    for (let i = 0; i < 5; i++) {
      const x = (rng() - 0.5) * width * 1.6;
      const off = along.clone().multiplyScalar(x * S);
      centers.push(off.x, off.y - S * 0.05, off.z);
      sizes.push(S * (0.7 + rng() * 0.3));
      shades.push(0);
      seeds.push(rng() * 100);
      cloudIdx.push(c);
    }
  }
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  geo.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(centers), 3));
  geo.setAttribute('size', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
  geo.setAttribute('shade', new THREE.InstancedBufferAttribute(new Float32Array(shades), 1));
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
  geo.setAttribute('cloud', new THREE.InstancedBufferAttribute(new Float32Array(cloudIdx), 1));
  geo.instanceCount = sizes.length;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      lit: { value: C(lit) }, shadow: { value: C(shadow) }, rimColor: { value: C(rimColor) },
      bases: { value: bases.map((b) => b.base.clone()) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 offset; attribute float size, shade, seed, cloud;
      uniform vec3 bases[${count}];
      varying vec2 vUv; varying float vShade; varying float vSeed;
      void main(){
        vUv = uv; vShade = shade; vSeed = seed;
        vec3 c = bases[int(cloud)] + offset;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 lit, shadow, rimColor; varying vec2 vUv; varying float vShade; varying float vSeed;
      ${NOISE_GLSL}
      void main(){
        vec2 p = vUv*2.0 - 1.0;
        float r = length(p);
        float n = fbm2(vUv*3.0 + vSeed);
        float edge = 1.0 - smoothstep(0.5 + n*0.3, 0.98, r);
        if (edge < 0.01) discard;
        vec3 nrm = normalize(vec3(p, sqrt(max(0.0, 1.0 - r*r)) + 0.2));
        float l = dot(nrm, normalize(vec3(0.25, 0.9, 0.35)));
        float lightAmt = clamp(l*0.6 + 0.25 + vShade*0.55, 0.0, 1.0);
        lightAmt = smoothstep(0.15, 0.85, lightAmt);
        vec3 col = mix(shadow, lit, lightAmt);
        col += rimColor * smoothstep(0.55, 0.95, r) * smoothstep(0.0, 0.6, p.y) * 0.35;
        col += (n - 0.5) * 0.06;
        gl_FragColor = vec4(col, edge);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -5;
  mesh.userData.update = (_t, _c, _p, dt = 0.016) => {
    const arr = mat.uniforms.bases.value;
    for (let i = 0; i < count; i++) {
      arr[i].x += bases[i].speed * dt;
      if (arr[i].x > center.x + rMax) arr[i].x = center.x - rMax;
    }
  };
  return mesh;
}

// ---------------------------------------------------------------- terrain

export function makeTerrain({ size = 600, seg = 200, heightAt, colorAt, cx = 0, cz = 0 }) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, z = p.getZ(i) + cz;
    const h = heightAt(x, z);
    p.setY(i, h);
    colorAt(x, z, h, col);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const mat = toon('#ffffff', { vertexColors: true });
  const uTime = { value: 0 };
  // painted ground: brush-scale colour variation, directional strokes and drifting cloud shadows
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; uniform float uTime;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bn = vnoise(vWPos.xz * 0.35) * 0.55 + vnoise(vWPos.xz * 1.6) * 0.45;
        float strokes = vnoise(vec2(vWPos.x * 0.8 + vWPos.z * 0.35, vWPos.z * 2.6));
        float speck = step(0.93, hash21(floor(vWPos.xz * 4.0)));
        diffuseColor.rgb *= 0.88 + bn * 0.24 + (strokes - 0.5) * 0.1 + speck * 0.06;
        float cs = smoothstep(0.38, 0.72, vnoise(vWPos.xz * 0.012 + uTime * vec2(0.012, 0.006)));
        diffuseColor.rgb *= 1.0 - cs * 0.2;`);
  };
  const m = new THREE.Mesh(g, mat);
  m.position.set(cx, 0, cz);
  m.receiveShadow = true;
  m.userData.update = (t) => (uTime.value = t);
  return m;
}

// ---------------------------------------------------------------- grass / wheat

function bladeGeometry(w, segs = 4, head = false) {
  const g = new THREE.PlaneGeometry(w, 1, 1, segs);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    let taper = 1 - Math.pow(y, 1.4) * 0.92;
    if (head && y > 0.7) taper = 1.6 - (y - 0.7) * 3.2;
    p.setX(i, p.getX(i) * taper);
    p.setZ(i, Math.pow(y, 2) * 0.12);
  }
  g.computeVertexNormals();
  return g;
}

export function makeGrass({ count = 30000, sample, heightAt, base = '#2f6b2e', tip = '#b7d86a', h = [0.35, 0.9], w = 0.09, seed = 3, wind = 1, head = false, patch = 0.25, sunDir } = {}) {
  const rng = mulberry32(seed);
  const geo = bladeGeometry(w, head ? 6 : 4, head);
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 }, base: { value: C(base) }, tip: { value: C(tip) }, wind: { value: wind }, patchAmt: { value: patch },
        sunDir: { value: (sunDir || new THREE.Vector3(0.5, 0.8, 0.3)).clone().normalize() },
        player: { value: new THREE.Vector3(9999, 0, 9999) },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform float time, wind; uniform vec3 player;
      varying float vH; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vec3 p = position; vH = p.y;
        vec4 base = modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.);
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        float ph = base.x*0.12 + base.z*0.09;
        float sway = sin(time*1.6 + ph)*0.55 + sin(time*2.7 + ph*2.3)*0.25 + sin(time*0.6 + base.x*0.03)*0.6;
        vec2 bend = vec2(0.8, 0.35) * sway * wind * vH*vH * 0.32;
        // part the grass around the player
        vec2 away = base.xz - player.xz; float dd = length(away);
        bend += (away/(dd+0.001)) * smoothstep(1.3, 0.0, dd) * vH * 0.6;
        wp.xz += bend; wp.y -= length(bend)*0.3;
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 base, tip; uniform float time, patchAmt;
      varying float vH; varying vec3 vW;
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      void main(){
        vec3 col = mix(base, tip, smoothstep(0.0, 1.0, vH));
        float n = vnoise(vW.xz*0.07);
        col *= 1.0 + (n-0.5)*patchAmt*2.0;
        float cs = smoothstep(0.35, 0.75, vnoise(vW.xz*0.012 + vec2(time*0.012, time*0.006)));
        col *= 1.0 - cs*0.28;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  const e = new THREE.Euler();
  let n = 0, tries = 0;
  while (n < count && tries < count * 4) {
    tries++;
    const pt = sample(rng);
    if (!pt) continue;
    const [x, z] = pt;
    const y = heightAt(x, z);
    if (y === null || y === undefined) continue;
    const hh = h[0] + rng() * (h[1] - h[0]);
    e.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
    q.setFromEuler(e);
    s.set(1, hh, 1);
    pos.set(x, y - 0.03, z);
    m4.compose(pos, q, s);
    mesh.setMatrixAt(n++, m4);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.update = (t, _cam, playerPos) => {
    mat.uniforms.time.value = t;
    if (playerPos) mat.uniforms.player.value.copy(playerPos);
  };
  return mesh;
}

// ---------------------------------------------------------------- trees

const TREE_PALETTES = {
  meadow: ['#3f7d3a', '#5d9a45', '#79b04d', '#2f6634'],
  spring: ['#6aa84f', '#8cc152', '#a6d05e', '#4f8a3c'],
  pine: ['#24503c', '#2f5f45', '#3a6d4c', '#1d4032'],
  dry: ['#7a7a45', '#8f8a50', '#6b6a3c', '#a09a5a'],
  gold: ['#c9a247', '#d8b85a', '#b48a35', '#e2c872'],
};

function lumpy(geo, amt, freq, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = noise2(x * freq + seed, z * freq + y * freq * 0.7) * amt;
    const l = Math.hypot(x, y, z) || 1;
    p.setXYZ(i, x + (x / l) * n, y + (y / l) * n, z + (z / l) * n);
  }
  geo.computeVertexNormals();
  return geo;
}

function colorize(geo, color) {
  if (geo.index) { const ni = geo.toNonIndexed(); geo.dispose(); geo = ni; }
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function makeForest(trees, { sunDir, seed = 11 } = {}) {
  const rng = mulberry32(seed);
  const leaves = [], trunks = [];
  const colliders = [];
  const col = new THREE.Color();
  for (const t of trees) {
    const s = t.s || 1;
    const pal = TREE_PALETTES[t.palette || (t.kind === 'pine' ? 'pine' : 'meadow')];
    const trunkCol = new THREE.Color(t.kind === 'pine' ? '#4b3a2c' : '#5b4331');
    if (t.kind === 'pine') {
      const th = 1.2 * s;
      trunks.push(colorize(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, th * 1.4, 7).translate(t.x, t.y + th * 0.7, t.z), trunkCol));
      const tiers = 4 + Math.floor(rng() * 2);
      for (let i = 0; i < tiers; i++) {
        const k = i / tiers;
        const r = (1.5 - k * 1.1) * s;
        const g = new THREE.ConeGeometry(r, 1.9 * s, 9, 2);
        lumpy(g, 0.12 * s, 1.3, rng() * 50);
        g.translate(t.x, t.y + th + k * 3.2 * s + 0.9 * s, t.z);
        col.set(pal[i % pal.length]);
        leaves.push(colorize(g, col));
      }
      colliders.push({ type: 'circle', x: t.x, z: t.z, r: 0.35 * s });
      continue;
    }
    const giant = t.kind === 'giant';
    const th = (giant ? 7 : 2.4) * s;
    const trunk = new THREE.CylinderGeometry(0.16 * s * (giant ? 2.2 : 1), 0.3 * s * (giant ? 2.4 : 1), th, 8, 3);
    lumpy(trunk, 0.05 * s, 2, rng() * 10);
    trunk.translate(t.x, t.y + th / 2, t.z);
    trunks.push(colorize(trunk, trunkCol));
    // branches
    for (let b = 0; b < (giant ? 5 : 2); b++) {
      const a = rng() * Math.PI * 2;
      const len = (giant ? 3.5 : 1.3) * s;
      const br = new THREE.CylinderGeometry(0.05 * s * (giant ? 2 : 1), 0.1 * s * (giant ? 2 : 1), len, 5);
      br.translate(0, len / 2, 0);
      br.rotateZ(0.9 + rng() * 0.3);
      br.rotateY(a);
      br.translate(t.x, t.y + th * (0.65 + rng() * 0.25), t.z);
      trunks.push(colorize(br, trunkCol));
    }
    const clumps = giant ? 16 : 6 + Math.floor(rng() * 5);
    const spread = (giant ? 6.5 : 1.7) * s;
    for (let i = 0; i < clumps; i++) {
      const a = rng() * Math.PI * 2;
      const rr = rng() * spread;
      const r = (giant ? 3 : 1.05) * s * (0.7 + rng() * 0.6);
      const g = new THREE.IcosahedronGeometry(r, 2);
      lumpy(g, r * 0.14, 1.6 / s, rng() * 90);
      g.scale(1, 0.82, 1);
      const y = t.y + th + (giant ? 2 : 0.6) * s + (1 - rr / spread) * (giant ? 4 : 1.4) * s + rng() * 0.8 * s;
      g.translate(t.x + Math.cos(a) * rr, y, t.z + Math.sin(a) * rr);
      // soften: bend normals toward the whole canopy's centre so it shades like one painted mass
      const cc = new THREE.Vector3(t.x, t.y + th + (giant ? 4 : 1.1) * s, t.z);
      const gp = g.attributes.position, gn = g.attributes.normal, tv = new THREE.Vector3(), nv = new THREE.Vector3();
      for (let vi = 0; vi < gp.count; vi++) {
        tv.set(gp.getX(vi), gp.getY(vi), gp.getZ(vi)).sub(cc).normalize();
        nv.set(gn.getX(vi), gn.getY(vi), gn.getZ(vi)).lerp(tv, 0.7).normalize();
        gn.setXYZ(vi, nv.x, nv.y, nv.z);
      }
      col.set(pal[Math.floor(rng() * pal.length)]);
      leaves.push(colorize(g, col));
    }
    colliders.push({ type: 'circle', x: t.x, z: t.z, r: (giant ? 1.4 : 0.4) * s });
  }
  const group = new THREE.Group();
  if (leaves.length) {
    const lg = mergeGeometries(leaves);
    const lm = new THREE.Mesh(lg, paintMaterial({ lit: '#ffffff', shadow: '#6f86a6', sunDir, vertexColors: true, rim: 0.45, rimColor: '#f7f0a0', bands: 3 }));
    lm.castShadow = true;
    group.add(lm);
  }
  if (trunks.length) {
    const tg = mergeGeometries(trunks);
    const tm = new THREE.Mesh(tg, toon('#ffffff', { vertexColors: true }));
    tm.castShadow = tm.receiveShadow = true;
    group.add(tm);
  }
  [...leaves, ...trunks].forEach((g) => g.dispose());
  group.userData.colliders = colliders;
  return group;
}

// ---------------------------------------------------------------- mountains

export function makeMountain({ x = 0, z = 0, y = 0, r = 120, h = 160, seed = 1, snow = 0.62, forest = '#35604a', rock = '#6f86a8', snowCol = '#f4f7fb', sharp = 1.35 } = {}) {
  const radial = 96, rings = 40;
  const positions = [], colors = [], idx = [];
  const cF = C(forest), cR = C(rock), cS = C(snowCol), c = new THREE.Color();
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const n = fbm(ca * 1.6 + seed * 3.1, sa * 1.6 + t * 2.2, 5);
      const ridge = Math.abs(Math.sin(a * 5 + n * 4 + seed)) * 0.18;
      let rad = r * Math.pow(1 - t, sharp) * (1 + n * 0.45 + ridge * (1 - t));
      if (j === rings) rad = 0;
      const yy = t * h * (1 + n * 0.12);
      positions.push(x + ca * rad, y + yy, z + sa * rad);
      const gully = Math.abs(Math.sin(a * 11 + n * 6));
      const sn = snow - 0.12 * gully + n * 0.18;
      if (t > sn) c.copy(cS);
      else if (t > 0.22 + n * 0.2) c.copy(cR).lerp(cS, Math.max(0, (t - sn + 0.15) / 0.15) * 0.4 * gully);
      else c.copy(cF).lerp(cR, t * 2);
      c.multiplyScalar(0.9 + 0.2 * noise2(a * 8, t * 12));
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, toon('#ffffff', { vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- rocks & flowers

export function makeRocks(list, { color = '#8c95a3', top = '#b8c0c8', moss = '#6f9a4a', seed = 5 } = {}) {
  const rng = mulberry32(seed);
  const geos = [], colliders = [];
  const cBase = C(color), cTop = C(top), cMoss = C(moss), c = new THREE.Color();
  for (const r of list) {
    const g = new THREE.DodecahedronGeometry(r.s, 1);
    lumpy(g, r.s * 0.18, 1.2 / r.s, rng() * 100);
    g.scale(1 + rng() * 0.5, 0.55 + rng() * 0.35, 1 + rng() * 0.4);
    g.rotateY(rng() * 6.28);
    const p = g.attributes.position;
    const arr = new Float32Array(p.count * 3);
    const mossy = rng() < 0.4;
    for (let i = 0; i < p.count; i++) {
      const yn = p.getY(i) / r.s;
      c.copy(cBase).lerp(mossy && yn > 0.35 ? cMoss : cTop, Math.max(0, yn));
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.translate(r.x, r.y + r.s * 0.2, r.z);
    geos.push(g);
    if (r.s > 0.45) colliders.push({ type: 'circle', x: r.x, z: r.z, r: r.s * 1.05 });
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), toon('#ffffff', { vertexColors: true }));
  geos.forEach((g) => g.dispose());
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.colliders = colliders;
  return mesh;
}

export function makeFlowers({ count = 2000, sample, heightAt, colors = ['#ffffff', '#ffd23f', '#ff8c5a', '#e58fd6', '#9fb8ff'], seed = 9, size = 1 } = {}) {
  const rng = mulberry32(seed);
  const petal = new THREE.CylinderGeometry(0.07 * size, 0.02 * size, 0.035, 6);
  const mesh = new THREE.InstancedMesh(petal, new THREE.MeshToonMaterial({ gradientMap: toonRamp() }), count);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count * 3 && n < count; i++) {
    const pt = sample(rng);
    if (!pt) continue;
    const y = heightAt(pt[0], pt[1]);
    if (y === null || y === undefined) continue;
    m4.makeRotationFromEuler(new THREE.Euler((rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6));
    m4.setPosition(pt[0], y + 0.28 + rng() * 0.3, pt[1]);
    mesh.setMatrixAt(n, m4);
    mesh.setColorAt(n, c.set(colors[Math.floor(rng() * colors.length)]));
    n++;
  }
  mesh.count = n;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- particles

export function makeMotes({ count = 400, center = new THREE.Vector3(), spread = new THREE.Vector3(60, 12, 60), color = '#fff2b0', size = 6, opacity = 0.8, seed = 4, rise = 0.2 } = {}) {
  const rng = mulberry32(seed);
  const pos = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center.x + (rng() - 0.5) * spread.x;
    pos[i * 3 + 1] = center.y + rng() * spread.y;
    pos[i * 3 + 2] = center.z + (rng() - 0.5) * spread.z;
    ph[i] = rng() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, color: { value: C(color) }, size: { value: size }, opacity: { value: opacity }, map: { value: softTexture() }, rise: { value: rise }, height: { value: spread.y } },
    vertexShader: /* glsl */ `
      attribute float phase; uniform float time, size, rise, height; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(time*0.3 + phase)*1.5; p.z += cos(time*0.25 + phase*1.3)*1.5;
        p.y += mod(time*rise + phase, height) - height*0.5 + sin(time + phase)*0.4;
        vec4 mv = modelViewMatrix * vec4(p,1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = size * (60.0 / -mv.z);
        vA = 0.5 + 0.5*sin(time*2.0 + phase*3.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float opacity; uniform sampler2D map; varying float vA;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color*1.6, t.a*opacity*vA); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.update = (t) => (mat.uniforms.time.value = t);
  return pts;
}

// ---------------------------------------------------------------- water

export function makeWater({ w = 20, h = 20, deep = '#2a6f8f', shallow = '#6cc3c9', sky = '#cfe8f5', sunDir, opacity = 0.92 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 }, deep: { value: C(deep) }, shallow: { value: C(shallow) }, sky: { value: C(sky) }, opacity: { value: opacity },
      sunDir: { value: (sunDir || new THREE.Vector3(0.5, 0.8, 0.3)).clone().normalize() },
    }]),
    vertexShader: /* glsl */ `varying vec3 vW; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv=uv; vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float time, opacity; uniform vec3 deep, shallow, sky, sunDir; varying vec3 vW; varying vec2 vUv;
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float fr = pow(1.0 - max(V.y, 0.0), 3.0);
        float n = fbm2(vW.xz*0.25 + vec2(time*0.15, time*0.08));
        vec3 col = mix(deep, shallow, n);
        col = mix(col, sky, fr*0.7);
        float lines = smoothstep(0.47, 0.5, abs(fract(n*6.0 + time*0.2) - 0.5));
        col += vec3(1.0)*lines*0.12;
        vec3 R = reflect(-V, vec3(0.,1.,0.));
        col += vec3(1.0,0.95,0.8) * pow(max(dot(R, normalize(sunDir)),0.0), 120.0) * 2.0;
        float edge = smoothstep(0.0, 0.04, vUv.x)*smoothstep(0.0,0.04,1.0-vUv.x)*smoothstep(0.0,0.04,vUv.y)*smoothstep(0.0,0.04,1.0-vUv.y);
        gl_FragColor = vec4(col, opacity*edge);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.x = -Math.PI / 2;
  m.userData.update = (t) => (mat.uniforms.time.value = t);
  return m;
}

/** A true mirror lake — the whole universe reflected, with painted ripples. */
export function makeMirrorLake({ radius = 120, tint = '#0d1a2e', res = 1024 } = {}) {
  const geo = new THREE.CircleGeometry(radius, 96);
  const shader = {
    name: 'LakeShader',
    uniforms: {
      color: { value: C(tint) }, tDiffuse: { value: null }, textureMatrix: { value: null }, time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vUv = textureMatrix*vec4(position,1.0); vW = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform sampler2D tDiffuse; uniform float time; varying vec4 vUv; varying vec3 vW;
      #include <logdepthbuf_pars_fragment>
      ${NOISE_GLSL}
      void main(){
        #include <logdepthbuf_fragment>
        vec2 w = vec2(vnoise(vW.xz*0.35 + time*0.25), vnoise(vW.xz*0.35 - time*0.2)) - 0.5;
        vec4 uv = vUv; uv.xy += w * 0.9 * uv.w * 0.03;
        vec4 base = texture2DProj(tDiffuse, uv);
        vec3 V = normalize(cameraPosition - vW);
        float fr = 0.35 + 0.65*pow(1.0 - max(V.y, 0.0), 2.0);
        float streak = smoothstep(0.49, 0.5, abs(fract(vnoise(vW.xz*0.08 + time*0.03)*5.0) - 0.5));
        vec3 refl = min(base.rgb * 0.8, vec3(0.75)) * vec3(0.85, 0.9, 1.0);
        vec3 col = mix(color, refl, fr * 0.85) + streak*0.035;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const lake = new Reflector(geo, { clipBias: 0.003, textureWidth: res, textureHeight: res, color: tint, shader });
  lake.rotation.x = -Math.PI / 2;
  lake.userData.update = (t) => (lake.material.uniforms.time.value = t);
  return lake;
}
