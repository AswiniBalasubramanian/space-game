import * as THREE from 'three';
import { streakTexture, glowTexture } from './textures.js';
import { mulberry32 } from '../utils/noise.js';

// Polar-mapped ring shader: u follows the circumference, v crosses the band.
function ringMaterial({ tex, inner, outer, opacity = 1, speed = 0.01, tint = '#ffffff', repeat = 3, doppler = 0, fadeInner = 0.15 }) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTex: { value: tex }, uIn: { value: inner }, uOut: { value: outer }, uOpacity: { value: opacity },
      uTime: { value: 0 }, uSpeed: { value: speed }, uTint: { value: new THREE.Color(tint) }, uRepeat: { value: repeat },
      uDoppler: { value: doppler }, uFadeIn: { value: fadeInner },
    },
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uIn, uOut, uOpacity, uTime, uSpeed, uRepeat, uDoppler, uFadeIn; uniform vec3 uTint;
      varying vec2 vP;
      void main(){
        float r = length(vP);
        float a = atan(vP.y, vP.x);
        float v = (r - uIn) / (uOut - uIn);
        if (v < 0.0 || v > 1.0) discard;
        float u = a / 6.2831853 * uRepeat;
        vec4 t = texture2D(uTex, vec2(u + uTime * uSpeed / max(0.2, v + 0.2), v));
        vec4 t2 = texture2D(uTex, vec2(u * 1.7 - uTime * uSpeed * 0.6, v));
        float edge = smoothstep(0.0, uFadeIn, v) * smoothstep(1.0, 0.7, v);
        float dop = 1.0 + uDoppler * sin(a);
        vec3 col = mix(t.rgb, t2.rgb, 0.35) * uTint * dop;
        gl_FragColor = vec4(min(col * (t.a * 0.75 + t2.a * 0.35) * edge * uOpacity, vec3(1.1)), 1.0);
      }`,
  });
}

// A planet-scale ring arcing across a sky.
export function createCosmicRing({ radius = 1600, width = 260, seed = 2, opacity = 0.8, core, edge, tint, speed = 0.004 } = {}) {
  const inner = radius - width / 2, outer = radius + width / 2;
  const geo = new THREE.RingGeometry(inner, outer, 256, 1);
  const mat = ringMaterial({ tex: streakTexture(seed, core, edge), inner, outer, opacity, speed, tint, repeat: 6 });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -6;
  m.frustumCulled = false;
  m.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return m;
}

// Watercolour black hole: black void, tilted accretion disk, a camera-facing
// lensed ring (the far side of the disk bent around the void), soft corona
// and infalling dust. Scale is set by `radius` (the void).
export function createBlackHole({ radius = 60, core = [255, 240, 205], edge = [242, 112, 60], seed = 3, tilt = 1.25, glowColor = 'rgba(255,196,120,1)', calm = false } = {}) {
  const group = new THREE.Group();
  const tex = streakTexture(seed, core, edge);

  const voidMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), new THREE.MeshBasicMaterial({ color: '#05050a', fog: false }));
  voidMesh.renderOrder = 2;
  group.add(voidMesh);

  const disk = new THREE.Mesh(new THREE.RingGeometry(radius * 1.25, radius * 4.2, 256, 1),
    ringMaterial({ tex, inner: radius * 1.25, outer: radius * 4.2, opacity: 1.15, speed: 0.05, repeat: 4, doppler: 0.45, fadeInner: 0.05 }));
  disk.rotation.x = tilt;
  disk.renderOrder = 3;
  group.add(disk);

  // Billboard group always faces the camera.
  const bb = new THREE.Group();
  group.add(bb);
  const lensed = new THREE.Mesh(new THREE.RingGeometry(radius * 1.02, radius * 1.9, 256, 1),
    ringMaterial({ tex, inner: radius * 1.02, outer: radius * 1.9, opacity: 1.0, speed: 0.08, repeat: 3, doppler: 0.25, fadeInner: 0.02 }));
  lensed.renderOrder = 1;
  bb.add(lensed);
  const photon = new THREE.Mesh(new THREE.RingGeometry(radius * 1.0, radius * 1.06, 128, 1), new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  photon.renderOrder = 3;
  bb.add(photon);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(glowColor), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: calm ? 0.35 : 0.6, fog: false }));
  corona.scale.setScalar(radius * 9);
  corona.renderOrder = 0;
  group.add(corona);

  // Infalling dust spiralling inward.
  const N = 900, r = mulberry32(seed);
  const pos = new Float32Array(N * 3), seeds = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { seeds[i * 2] = r(); seeds[i * 2 + 1] = r(); }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dg.setAttribute('seed', new THREE.BufferAttribute(seeds, 2));
  const dm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uR: { value: radius }, uCol: { value: new THREE.Color(`rgb(${edge.join(',')})`) } },
    vertexShader: /* glsl */`
      attribute vec2 seed; uniform float uTime, uR; varying float vA;
      void main(){
        float life = fract(seed.x + uTime * (0.03 + seed.y * 0.03));
        float rad = uR * mix(6.0, 1.1, life * life);
        float ang = seed.y * 6.2831 + life * 9.0;
        vec3 p = vec3(cos(ang) * rad, (seed.x - 0.5) * uR * 0.25 * (1.0 - life), sin(ang) * rad);
        vA = smoothstep(0.0, 0.2, life) * smoothstep(1.0, 0.8, life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(1400.0 / -mv.z, 1.0, 5.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(mix(vec3(1.0), uCol, 0.5) * smoothstep(0.5, 0.0, d) * vA, 1.0); }`,
  });
  const dust = new THREE.Points(dg, dm);
  dust.rotation.x = tilt - Math.PI / 2;
  dust.frustumCulled = false;
  group.add(dust);

  const mats = [disk.material, lensed.material];
  group.userData = {
    radius,
    update(t, camera) {
      for (const m of mats) m.uniforms.uTime.value = t;
      dm.uniforms.uTime.value = t;
      bb.quaternion.copy(camera.quaternion);
    },
    setCalm(on) {
      corona.material.opacity = on ? 0.3 : 0.6;
      for (const m of mats) m.uniforms.uTint.value.set(on ? '#bfefff' : '#ffffff');
    },
  };
  return group;
}
