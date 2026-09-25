import * as THREE from 'three';
import { GLSL_NOISE, mulberry32 } from '../utils/noise.js';
import { cloudTexture } from './textures.js';

// Painted sky dome: gradient + brushed cirrus streaks + optional stars/nebula.
export function createSkyDome(p) {
  const uniforms = {
    uTop: { value: new THREE.Color(p.top) },
    uMid: { value: new THREE.Color(p.mid) },
    uHorizon: { value: new THREE.Color(p.horizon) },
    uBottom: { value: new THREE.Color(p.bottom ?? p.horizon) },
    uSunDir: { value: new THREE.Vector3(...(p.sunDir ?? [0.4, 0.5, -0.6])).normalize() },
    uSunColor: { value: new THREE.Color(p.sun ?? '#fff1c8') },
    uCirrus: { value: p.cirrus ?? 0.5 },
    uStars: { value: p.stars ?? 0 },
    uNebula: { value: p.nebula ?? 0 },
    uNebA: { value: new THREE.Color(p.nebA ?? '#4fd0e8') },
    uNebB: { value: new THREE.Color(p.nebB ?? '#d86aa8') },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uHorizon, uBottom, uSunColor, uSunDir, uNebA, uNebB;
      uniform float uCirrus, uStars, uNebula, uTime;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
        col = mix(col, uTop, smoothstep(0.22, 0.85, h));
        col = mix(col, uBottom, smoothstep(0.0, -0.25, h));
        vec2 sp = vec2(atan(d.z, d.x) * 3.0, h * 6.0);
        // brushed cirrus: anisotropic noise stretched along the horizon
        float c = fbm2(vec2(sp.x * 1.3 + uTime * 0.004, sp.y * 7.0));
        float streak = smoothstep(0.55, 0.85, c) * smoothstep(0.05, 0.35, h) * uCirrus;
        col = mix(col, vec3(1.0, 0.99, 0.97), streak * 0.7);
        // sun bloom
        float sd = max(0.0, dot(d, normalize(uSunDir)));
        col += uSunColor * (pow(sd, 18.0) * 0.55 + pow(sd, 400.0) * 1.2);
        // painted nebula
        if (uNebula > 0.0) {
          float n1 = fbm2(sp * 0.7 + 4.0);
          float n2 = fbm2(sp * 1.4 + 9.0 + n1 * 2.0);
          col = mix(col, uNebA, smoothstep(0.5, 0.85, n1) * uNebula * 0.7);
          col = mix(col, uNebB, smoothstep(0.58, 0.9, n2) * uNebula * 0.45);
        }
        // stars
        if (uStars > 0.0) {
          vec2 g = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0))) * 120.0;
          vec2 cell = floor(g);
          float rnd = hash12(cell);
          vec2 f = fract(g) - 0.5;
          float star = smoothstep(0.08, 0.0, length(f)) * step(0.93, rnd);
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + rnd * 60.0);
          col += vec3(1.0, 0.96, 0.9) * star * tw * uStars * smoothstep(-0.05, 0.2, h);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(p.radius ?? 1500, 48, 24), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.userData.update = (t) => { uniforms.uTime.value = t; };
  return dome;
}

// Ring of billboard cumulus clouds around the world.
export function createCloudRing({ count = 28, radius = [420, 900], height = [60, 260], scale = [140, 320], seed = 3, palette, opacity = 1 } = {}) {
  const group = new THREE.Group();
  const r = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.3;
    const d = radius[0] + r() * (radius[1] - radius[0]);
    const s = scale[0] + r() * (scale[1] - scale[0]);
    const mat = new THREE.SpriteMaterial({ map: cloudTexture(1 + (i % 6), palette), transparent: true, depthWrite: false, fog: false, opacity });
    const sp = new THREE.Sprite(mat);
    sp.position.set(Math.cos(a) * d, height[0] + r() * (height[1] - height[0]), Math.sin(a) * d);
    sp.scale.set(s, s * 0.62, 1);
    sp.renderOrder = -5;
    group.add(sp);
  }
  group.userData.update = (t, dt) => { group.rotation.y += dt * 0.004; };
  return group;
}

export function starPoints({ count = 4000, radius = 1300, size = 2.4, seed = 5, colors = ['#ffffff', '#cfe8ff', '#ffe7c4'] } = {}) {
  const r = mulberry32(seed);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const d = radius * (0.8 + r() * 0.2);
    pos.set([Math.cos(th) * s * d, u * d, Math.sin(th) * s * d], i * 3);
    c.set(colors[Math.floor(r() * colors.length)]);
    col.set([c.r, c.g, c.b], i * 3);
    sz[i] = size * (0.4 + Math.pow(r(), 6) * 3.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPix: { value: Math.min(devicePixelRatio, 1.5) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute float size; attribute vec3 color; varying vec3 vCol; varying float vTw; uniform float uTime, uPix;
      void main(){
        vCol = color;
        vTw = 0.65 + 0.35 * sin(uTime * (1.0 + fract(position.x) * 3.0) + position.y);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPix * 2.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vTw;
      void main(){
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float core = smoothstep(0.5, 0.0, d);
        float cross = max(smoothstep(0.08, 0.0, abs(p.x)) , smoothstep(0.08, 0.0, abs(p.y))) * smoothstep(0.5, 0.1, d) * 0.6;
        gl_FragColor = vec4(vCol * (core * core + cross) * vTw, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -8;
  pts.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return pts;
}
