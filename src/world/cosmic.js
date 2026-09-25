// Cosmic phenomena: painted nebula skies, star fields, black holes with accretion
// disks, planets, celestial rings, comets and asteroid belts.
import * as THREE from 'three';
import { NOISE_GLSL, mulberry32 } from '../core/noise.js';
import { softTexture } from './kit.js';

const C = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));

export function makeNebulaSky({ radius = 5000, deep = '#040818', a = '#1a4a8c', b = '#2aa6b8', c = '#7a5ac8', band = 0.9, intensity = 1 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { deep: { value: C(deep) }, ca: { value: C(a) }, cb: { value: C(b) }, cc: { value: C(c) }, band: { value: band }, intensity: { value: intensity }, time: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; gl_Position.z = gl_Position.w*0.99999; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 deep, ca, cb, cc; uniform float band, intensity, time; varying vec3 vW;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vW - cameraPosition);
        vec3 axis = normalize(vec3(0.25, 0.9, -0.35));
        float bd = dot(d, axis);
        float bandMask = exp(-bd*bd*7.0);
        float n1 = fbm3(d*2.2 + vec3(0.0, time*0.004, 0.0));
        float n2 = fbm3(d*5.0 + n1*1.5);
        float n3 = fbm3(d*11.0 + n2);
        vec3 col = deep;
        col = mix(col, ca, smoothstep(0.35, 0.8, n1) * (0.55 + bandMask*0.6));
        col = mix(col, cb, smoothstep(0.5, 0.85, n2) * bandMask * band);
        col += cc * smoothstep(0.62, 0.9, n3*n1*1.6) * 0.5 * bandMask;
        // painted brush-streak clouds of light
        float streak = smoothstep(0.55, 0.75, fbm3(vec3(d.x*3.0, d.y*14.0, d.z*3.0) + n1));
        col += vec3(0.6,0.8,1.0) * streak * 0.08 * bandMask;
        // star dust in the band
        float sd = hash31(floor(d*900.0));
        col += vec3(0.9,0.95,1.0) * step(0.996 - bandMask*0.004, sd) * (0.4 + bandMask) * (0.7+0.3*sin(time*3.0+sd*50.0));
        gl_FragColor = vec4(col*intensity, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  m.userData.update = (t, cam) => { mat.uniforms.time.value = t; m.position.copy(cam.position); };
  return m;
}

export function makeStarfield({ count = 5000, radius = 3500, seed = 2, size = 2.2, follow = true } = {}) {
  const rng = mulberry32(seed);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count);
  const tints = [C('#ffffff'), C('#cfe3ff'), C('#ffe2b8'), C('#aee9ff'), C('#ffd0d8')];
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1, th = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const rad = radius * (0.7 + rng() * 0.3);
    pos[i * 3] = Math.cos(th) * r * rad; pos[i * 3 + 1] = u * rad; pos[i * 3 + 2] = Math.sin(th) * r * rad;
    const t = tints[Math.floor(rng() * tints.length)];
    col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
    sz[i] = Math.pow(rng(), 6) * 5 + 0.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: false,
    uniforms: { time: { value: 0 }, map: { value: softTexture() }, scale: { value: size }, pr: { value: Math.min(devicePixelRatio, 1.75) } },
    vertexShader: /* glsl */ `
      attribute float size; uniform float time, scale, pr; varying vec3 vC; varying float vT;
      void main(){ vC = color; vT = 0.65 + 0.35*sin(time*(1.0+size) + position.x*0.01);
        vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = size*scale*pr; }`,
    fragmentShader: /* glsl */ `uniform sampler2D map; varying vec3 vC; varying float vT;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC*1.4*vT, t.a); }`,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  p.renderOrder = -9;
  p.userData.update = (t, cam) => { mat.uniforms.time.value = t; if (follow) p.position.copy(cam.position); };
  return p;
}

/**
 * A gigantic black hole: event horizon, differentially-rotating accretion disk,
 * a camera-facing lensed halo, photon ring, glow and in-spiralling dust.
 */
export function makeBlackHole({ size = 1, tilt = 0.28, hue = 0, dust = 1500, seed = 1 } = {}) {
  const group = new THREE.Group();
  const hot = C('#fff3d6'), gold = C('#ffb347').offsetHSL(hue, 0, 0), orange = C('#f2703c').offsetHSL(hue, 0, 0), maroon = C('#a9203e').offsetHSL(hue, 0, 0);

  const horizon = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  horizon.renderOrder = 2;
  group.add(horizon);

  const diskUniforms = {
    time: { value: 0 }, hot: { value: hot }, gold: { value: gold }, orange: { value: orange }, maroon: { value: maroon },
    r0: { value: 1.35 }, r1: { value: 4.6 }, boost: { value: 1 },
  };
  const diskShader = /* glsl */ `
    uniform float time, r0, r1, boost; uniform vec3 hot, gold, orange, maroon; varying vec2 vP;
    ${NOISE_GLSL}
    void main(){
      float r = length(vP);
      float t = clamp((r - r0)/(r1 - r0), 0.0, 1.0);
      float a = atan(vP.y, vP.x);
      float rot = time * 0.9 / pow(r, 1.4);
      vec2 q = vec2(cos(a + rot), sin(a + rot)) * r;
      float n = fbm2(q*1.6 + vec2(r*3.0));
      float streaks = 0.55 + 0.45*sin(r*26.0 + n*6.0);
      vec3 col = mix(hot, gold, smoothstep(0.0, 0.18, t));
      col = mix(col, orange, smoothstep(0.18, 0.55, t));
      col = mix(col, maroon, smoothstep(0.55, 1.0, t));
      float inten = pow(1.0 - t, 1.6) * (0.45 + n*0.9) * streaks;
      float beaming = 1.0 + 0.55*sin(a);
      float alpha = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.75, 1.0, t));
      gl_FragColor = vec4(col * inten * beaming * 4.2 * boost, alpha);
    }`;
  const diskMat = new THREE.ShaderMaterial({
    uniforms: diskUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: diskShader,
  });
  const disk = new THREE.Mesh(new THREE.RingGeometry(1.25, 4.8, 256, 4), diskMat);
  disk.rotation.x = -Math.PI / 2 + tilt;
  group.add(disk);

  // lensed image of the far side of the disk, arcing over and under the hole
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { time: diskUniforms.time, gold: diskUniforms.gold, hot: diskUniforms.hot, orange: diskUniforms.orange, boost: diskUniforms.boost },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform float time, boost; uniform vec3 gold, hot, orange; varying vec2 vP;
      ${NOISE_GLSL}
      void main(){
        float r = length(vP); float a = atan(vP.y, vP.x);
        float ring = exp(-pow((r - 1.28)/0.1, 2.0));
        float wide = exp(-pow((r - 1.55)/0.35, 2.0)) * 0.45;
        float vert = 0.35 + 0.65*abs(sin(a));
        float n = vnoise(vec2(a*6.0 + time*0.6, r*8.0));
        vec3 col = mix(gold, orange, smoothstep(1.3, 2.2, r));
        float inten = (ring*1.4 + wide*vert*1.3) * (0.7 + n*0.6);
        gl_FragColor = vec4(col*inten*2.6*boost, clamp(inten,0.0,1.0));
      }`,
  });
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.02, 2.6, 180, 2), haloMat);
  group.add(halo);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color: gold.clone().multiplyScalar(0.6), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  glow.scale.setScalar(11);
  group.add(glow);

  // in-spiralling dust
  const rng = mulberry32(seed);
  const n = dust;
  const pr = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pr[i * 3] = 1.4 + rng() * 7; // start radius
    pr[i * 3 + 1] = (rng() - 0.5) * 0.6; // height
    pr[i * 3 + 2] = rng() * Math.PI * 2; // angle
    ph[i] = rng();
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pr, 3));
  dg.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    uniforms: { time: diskUniforms.time, map: { value: softTexture() }, col: { value: gold }, scale: { value: size } },
    vertexShader: /* glsl */ `
      attribute float phase; uniform float time, scale; varying float vA;
      void main(){
        float life = fract(phase + time*0.03);
        float r = mix(position.x, 1.2, life);
        float ang = position.z + time*1.2/pow(r,1.3) + life*6.0;
        vec3 p = vec3(cos(ang)*r, position.y*(r*0.15), sin(ang)*r);
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix*mv;
        gl_PointSize = clamp(scale*120.0/-mv.z, 1.0, 6.0);
        vA = sin(life*3.14159);
      }`,
    fragmentShader: /* glsl */ `uniform sampler2D map; uniform vec3 col; varying float vA;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(col*2.0, t.a*vA*0.8); }`,
  });
  const dustPts = new THREE.Points(dg, dustMat);
  dustPts.rotation.x = tilt;
  dustPts.frustumCulled = false;
  group.add(dustPts);

  group.scale.setScalar(size);
  group.userData.update = (t, cam) => {
    diskUniforms.time.value = t;
    halo.quaternion.copy(cam.quaternion);
    // keep halo facing camera but in group-local space
    const inv = group.getWorldQuaternion(new THREE.Quaternion()).invert();
    halo.quaternion.premultiply(inv);
  };
  group.userData.setBoost = (b) => (diskUniforms.boost.value = b);
  return group;
}

export function makePlanet({ radius = 100, ocean = '#2f7fc1', shallow = '#57c2d6', land = '#6fae55', land2 = '#d9c48a', cloud = '#ffffff', atmo = '#8fd0ff', sunDir, seed = 1, cloudAmt = 0.55, glow = 1, emissive = 0 } = {}) {
  const group = new THREE.Group();
  const sd = (sunDir || new THREE.Vector3(1, 0.3, 0.4)).clone().normalize();
  const mat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      ocean: { value: C(ocean) }, shallow: { value: C(shallow) }, land: { value: C(land) }, land2: { value: C(land2) }, cloud: { value: C(cloud) },
      sunDir: { value: sd }, seed: { value: seed }, time: { value: 0 }, cloudAmt: { value: cloudAmt }, emissive: { value: emissive },
    },
    vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 ocean, shallow, land, land2, cloud, sunDir; uniform float seed, time, cloudAmt, emissive; varying vec3 vP; varying vec3 vN;
      ${NOISE_GLSL}
      void main(){
        vec3 p = normalize(vP);
        float h = fbm3(p*2.2 + seed);
        vec3 col = mix(ocean, shallow, smoothstep(0.42, 0.5, h));
        col = mix(col, land, smoothstep(0.5, 0.52, h));
        col = mix(col, land2, smoothstep(0.6, 0.7, h + fbm3(p*6.0)*0.15));
        float cl = fbm3(p*3.5 + vec3(time*0.01, 0., seed));
        float sw = fbm3(p*8.0 + cl*2.0);
        float clouds = smoothstep(0.52, 0.66, cl*0.7 + sw*0.45) * cloudAmt;
        col = mix(col, cloud, clouds);
        float l = dot(normalize(vN), sunDir);
        float s = smoothstep(-0.15, 0.35, l);
        s = mix(s, floor(s*3.0+0.5)/3.0, 0.5);
        col *= mix(vec3(0.08,0.1,0.22), vec3(1.05), s);
        col += emissive * col;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
  group.add(body);
  const atmoMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false,
    uniforms: { atmo: { value: C(atmo) }, sunDir: { value: sd }, glow: { value: glow } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `uniform vec3 atmo, sunDir; uniform float glow; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(normalize(vN), V)), 2.2);
        float lit = 0.35 + 0.65*smoothstep(-0.4, 0.5, dot(normalize(vN), sunDir));
        gl_FragColor = vec4(atmo * f * 1.6 * lit * glow, f*glow); }`,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, 64, 48), atmoMat);
  group.add(shell);
  group.userData.update = (t) => { mat.uniforms.time.value = t; body.rotation.y = t * 0.01; };
  group.userData.radius = radius;
  return group;
}

/** A vast glowing ring arcing across a sky (accretion-like bands). */
export function makeCelestialRing({ inner = 900, outer = 1500, a = '#fff0c8', b = '#f2a54a', c = '#a9203e', opacity = 0.85 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { ca: { value: C(a) }, cb: { value: C(b) }, cc: { value: C(c) }, r0: { value: inner }, r1: { value: outer }, time: { value: 0 }, opacity: { value: opacity } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 ca, cb, cc; uniform float r0, r1, time, opacity; varying vec2 vP;
      ${NOISE_GLSL}
      void main(){
        float r = length(vP); float t = (r - r0)/(r1 - r0);
        float a = atan(vP.y, vP.x);
        float bands = 0.55 + 0.45*sin(t*60.0 + vnoise(vec2(t*20.0, 0.))*6.0);
        float fine = 0.7 + 0.3*sin(t*190.0);
        float n = vnoise(vec2(a*40.0 + time*0.05, t*6.0));
        vec3 col = mix(ca, cb, smoothstep(0.1, 0.6, t)); col = mix(col, cc, smoothstep(0.6, 1.0, t));
        float edge = smoothstep(0.0, 0.06, t)*(1.0 - smoothstep(0.9, 1.0, t));
        float gap = 1.0 - 0.8*exp(-pow((t-0.62)/0.02, 2.0));
        gl_FragColor = vec4(col*bands*fine*(0.8+0.4*n)*1.3, edge*gap*opacity*bands);
      }`,
  });
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 256, 8), mat);
  m.userData.update = (t) => (mat.uniforms.time.value = t);
  m.frustumCulled = false;
  return m;
}

export function makeComets({ count = 8, radius = 1500, seed = 3, color = '#bfefff' } = {}) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  const comets = [];
  for (let i = 0; i < count; i++) {
    const len = 60 + rng() * 140;
    const geo = new THREE.PlaneGeometry(len, 2.2);
    geo.translate(-len / 2, 0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
      uniforms: { col: { value: C(i % 3 === 0 ? '#ffcf8a' : color) }, alpha: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */ `uniform vec3 col; uniform float alpha; varying vec2 vUv;
        void main(){ float w = 1.0 - abs(vUv.y-0.5)*2.0; float f = pow(vUv.x, 3.0); gl_FragColor = vec4(col*3.0, f*w*alpha); }`,
    });
    const m = new THREE.Mesh(geo, mat);
    const reset = () => {
      const d = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.6, rng() - 0.5).normalize();
      m.position.copy(d.multiplyScalar(radius * (0.5 + rng() * 0.5)));
      m.userData.vel = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.4, rng() - 0.5).normalize().multiplyScalar(120 + rng() * 200);
      m.userData.life = 0;
      m.userData.max = 3 + rng() * 4;
      m.userData.wait = rng() * 6;
    };
    reset();
    m.userData.reset = reset;
    group.add(m);
    comets.push(m);
  }
  const tmp = new THREE.Vector3();
  group.userData.update = (t, cam, _p, dt = 0.016) => {
    for (const m of comets) {
      const u = m.userData;
      if (u.wait > 0) { u.wait -= dt; m.material.uniforms.alpha.value = 0; continue; }
      u.life += dt;
      m.position.addScaledVector(u.vel, dt);
      tmp.copy(m.position).add(u.vel);
      m.lookAt(tmp);
      m.rotateY(Math.PI / 2);
      m.material.uniforms.alpha.value = Math.sin(Math.min(u.life / u.max, 1) * Math.PI);
      if (u.life > u.max) u.reset();
    }
    group.position.copy(cam.position).multiplyScalar(0.9);
  };
  return group;
}

export function makeAsteroids({ count = 500, center = new THREE.Vector3(), rMin = 300, rMax = 600, thickness = 60, seed = 6, color = '#7d88a3', tilt = 0.15 } = {}) {
  const rng = mulberry32(seed);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = 0.75 + Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3) * 0.18 + Math.cos(p.getZ(i) * 4.1) * 0.1;
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.8, p.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ color: C(color) });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const data = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, r = rMin + rng() * (rMax - rMin);
    const sc = Math.pow(rng(), 3) * 18 + 1.5;
    data.push({ a, r, y: (rng() - 0.5) * thickness, sc, spin: (rng() - 0.5) * 0.5, rx: rng() * 6, ry: rng() * 6, speed: 0.004 + rng() * 0.006 });
  }
  const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, tilt * 0.5));
  const update = (t) => {
    for (let i = 0; i < count; i++) {
      const d = data[i];
      const a = d.a + t * d.speed;
      v.set(Math.cos(a) * d.r, d.y, Math.sin(a) * d.r).applyQuaternion(tiltQ).add(center);
      e.set(d.rx + t * d.spin, d.ry + t * d.spin * 0.7, 0);
      q.setFromEuler(e);
      s.setScalar(d.sc);
      m4.compose(v, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.userData.update = update;
  mesh.userData.data = data;
  return mesh;
}
