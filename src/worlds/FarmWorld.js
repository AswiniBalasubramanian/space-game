import * as THREE from 'three';
import { MissionWorld } from './MissionWorld.js';
import { NPC } from '../npcs/NPC.js';
import { createSkyDome, createCloudRing } from '../render/Sky.js';
import { createCosmicRing, createBlackHole } from '../render/cosmic.js';
import { terrain, grassField, flowerField, broadleafGeometry, pineGeometry, forest, mountainRange, rocks, fence, waterMaterial } from '../render/nature.js';
import { toon, vtoon, glow, mesh, colored, merge, mat4, heightTint, scatterInstanced, outline } from '../render/toon.js';
import { glowTexture, sparkleTexture } from '../render/textures.js';
import { fbm, smoothstep, mulberry32, clamp } from '../utils/noise.js';

// FARM WORLD — LIFE · GROWTH · ABUNDANCE. Geometric golden fields and
// shimmering irrigation channels beneath a celestial ring so large it fills
// half the sky. Floating islands of farmland drift overhead.
const PLOTS = [[-38, -10], [-20, -10], [-2, -10], [-38, 8], [-20, 8], [-2, 8]];
const PLOT = 14;

export default class FarmWorld extends MissionWorld {
  mood = 'farm';
  exposure = 1.02;

  ground(x, z) {
    const d = Math.hypot(x - 5, z);
    const hills = (fbm(x * 0.007 + 1, z * 0.007 + 4, 4) - 0.4) * 60 * smoothstep(75, 190, d);
    return hills + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 1.2 * smoothstep(40, 70, d);
  }
  heightAt(x, z) { return this.ground(x, z); }

  inPlot(x, z, pad = 0) {
    return PLOTS.some(([px, pz]) => Math.abs(x - px) < PLOT / 2 - pad && Math.abs(z - pz) < PLOT / 2 - pad);
  }

  async build() {
    const s = this.scene;
    s.fog = new THREE.Fog('#f3dcc0', 140, 900);
    const sky = createSkyDome({ top: '#2f6cc8', mid: '#86b4e6', horizon: '#ffe0b4', sunDir: [-0.6, 0.22, -0.7], sun: '#ffd28a', cirrus: 0.7, stars: 0.35, nebula: 0.18, nebA: '#ffd9a0', nebB: '#f2a0b0' });
    this.add(sky); this.skyFollow.push(sky);
    this.onUpdate((dt, t) => sky.userData.update(t));
    const clouds = createCloudRing({ count: 26, seed: 6, radius: [380, 820], height: [30, 220], scale: [170, 360], palette: { light: '#fff4e0', mid: '#fbe2d2', shadow: '#b8a8d8', rim: '#ffffff' } });
    this.add(clouds);
    this.onUpdate((dt, t) => clouds.userData.update(t, dt));

    // The celestial ring: an accretion arc so vast it dominates the horizon.
    const ring = createCosmicRing({ radius: 2700, width: 620, opacity: 1.0, seed: 8, core: [255, 246, 214], edge: [242, 150, 70], speed: 0.003 });
    ring.position.set(-300, -1100, -1900);
    ring.rotation.set(-0.3, 0.25, 0.4);
    this.add(ring);
    const ring2 = createCosmicRing({ radius: 3700, width: 160, opacity: 0.45, seed: 9, core: [255, 236, 220], edge: [200, 120, 160] });
    ring2.position.copy(ring.position); ring2.rotation.copy(ring.rotation);
    this.add(ring2);
    const hole = createBlackHole({ radius: 70, seed: 4, tilt: 1.3, core: [255, 244, 210], edge: [242, 150, 60] });
    hole.position.set(1300, 380, -2500);
    this.add(hole);
    this.holes.push({ pos: hole.position, radius: 110, strength: 0.25 });
    this.onUpdate((dt, t) => { ring.userData.update(t); ring2.userData.update(t); hole.userData.update(t, this.game.engine.camera); });

    this.lights({ sun: '#ffe2b0', sunI: 2.6, sky: '#cfe4ff', ground: '#b9a86a', hemiI: 1.2, dir: [-45, 40, -40] });

    const h = (x, z) => this.heightAt(x, z);
    const green = new THREE.Color('#86b556'), green2 = new THREE.Color('#bccf6e'), soil = new THREE.Color('#b08a5a'), gold = new THREE.Color('#e8c35a');
    this.add(terrain({ size: 1100, seg: 220, height: (x, z) => this.ground(x, z), color: (x, z, y, c) => {
      const n = fbm(x * 0.04, z * 0.04, 3);
      c.copy(green).lerp(green2, clamp(n * 1.2 - 0.15, 0, 1));
      if (this.inPlot(x, z)) c.copy(soil).lerp(gold, 0.35);
      if (this.pathDist(x, z) < 1.4) c.lerp(new THREE.Color('#e0c89a'), 0.8);
    } }));
    const free = (x, z) => !this.inPlot(x, z, -1) && !this.nearBuild(x, z) && this.pathDist(x, z) > 1.5;
    this.add(grassField({ count: 12000, area: [-70, -50, 70, 70], heightAt: h, accept: free, seed: 5, colors: ['#7fb445', '#a4c850', '#c2d65c', '#8fbf4a'] }));
    this.add(flowerField({ count: 1200, area: [-70, -50, 70, 70], heightAt: h, accept: free, colors: ['#ffffff', '#fff2a8', '#f26b4f', '#ffd0e0'] }));
    this.add(mountainRange({ count: 12, radius: [480, 700], height: [180, 340], seed: 12, colors: { base: '#6f9a5a', rock: '#8a8fc0', snow: '#fff4ea' } }));

    this.buildFields(h);
    this.buildChannels(h);
    this.buildFarmstead(h);
    this.buildIslands();
    this.buildPollen();

    // trees: a giant old tree + orchards + distant woods
    this.add(forest({ template: broadleafGeometry(7, { height: 7, spread: 5, leaf: '#4f8f3a', leaf2: '#86b84a' }), positions: [[44, -30, 2.6]], heightAt: h }));
    this.circle(44, -30, 2);
    const orchard = []; for (let i = 0; i < 12; i++) orchard.push([40 + (i % 4) * 7, 40 + Math.floor(i / 4) * 8]);
    this.add(forest({ template: broadleafGeometry(3, { height: 3.5, spread: 2, leaf: '#5d9a36', leaf2: '#e89a4a' }), positions: orchard, heightAt: h }));
    orchard.forEach(([x, z]) => this.circle(x, z, 0.5));
    const woods = []; for (let i = 0; i < 60; i++) { const a = i * 0.21; const d = 95 + (i % 5) * 14; woods.push([Math.cos(a) * d, Math.sin(a) * d]); }
    this.add(forest({ template: pineGeometry(9, { height: 10 }), positions: woods.filter((_, i) => i % 2), heightAt: h, scale: [0.8, 1.5] }));
    this.add(forest({ template: broadleafGeometry(15), positions: woods.filter((_, i) => !(i % 2)), heightAt: h, scale: [1, 1.8] }));
    this.add(rocks({ positions: [[26, 30, 1.2], [-52, 20, 1.6], [55, -8, 1.1], [-12, 44, 0.8]], heightAt: h }));
    this.bounds = { x: 0, z: 5, r: 80 };

    this.setupArrival({
      spawn: [2, 42, Math.PI], carSpot: [7, 46, Math.PI * 0.9],
      establish: { from: { pos: [70, 60, 150], look: [-200, 380, -1400] }, to: { pos: [22, 16, 70], look: [0, 4, 18] } },
    });
    this.buildMission(h);
  }

  pathDist(x, z) {
    const pts = [[2, 44], [4, 26], [10, 12], [14, 4], [20, 0]];
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const vx = bx - ax, vz = bz - az;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
    return best;
  }

  nearBuild(x, z) {
    return (x > 14 && x < 30 && z > -10 && z < 6) || (x > 25 && x < 37 && z > 9 && z < 20) || Math.hypot(x + 46, z - 34) < 6;
  }

  buildFields(h) {
    const r = mulberry32(3);
    const stalk = new THREE.CylinderGeometry(0.018, 0.025, 1.1, 3); stalk.translate(0, 0.55, 0);
    const ear = new THREE.SphereGeometry(0.07, 5, 4); ear.scale(0.8, 2.6, 0.8); ear.translate(0, 1.2, 0);
    const geo = heightTint(merge([colored(stalk, '#c9a44a'), colored(ear, '#f2cc62')]), 0.3, 0.35);
    const t = [], c = [];
    const pal = [new THREE.Color('#ffffff'), new THREE.Color('#ffe9c0'), new THREE.Color('#f2d9a0')];
    for (const [px, pz] of PLOTS) {
      for (let gx = -PLOT / 2 + 0.3; gx < PLOT / 2; gx += 0.42) {
        for (let gz = -PLOT / 2 + 0.3; gz < PLOT / 2; gz += 0.42) {
          const x = px + gx + (r() - 0.5) * 0.25, z = pz + gz + (r() - 0.5) * 0.25;
          const s = 0.8 + r() * 0.45;
          t.push(mat4(x, h(x, z) - 0.05, z, s, s, s, (r() - 0.5) * 0.2, r() * 6, (r() - 0.5) * 0.2));
          c.push(pal[Math.floor(r() * 3)]);
        }
      }
    }
    const wheat = scatterInstanced(geo, vtoon(), t, c);
    wheat.castShadow = false;
    // wind ripples through the wheat
    wheat.material.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windT = { value: 0 };
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        float w = sin(uTime * 1.4 + ip.x * 0.25 + ip.z * 0.18) * 0.5 + 0.5;
        transformed.x += w * position.y * 0.18; transformed.z += w * position.y * 0.1;`);
    };
    this.add(wheat);
    this.onUpdate((dt, t) => { if (this.windT) this.windT.value = t; });

    // cabbage + pumpkin patches
    const cab = heightTint(colored(new THREE.SphereGeometry(0.35, 8, 6), '#7fc46a'), 0.3, 0.3);
    const pump = heightTint(colored(new THREE.SphereGeometry(0.4, 10, 6).scale(1, 0.7, 1), '#f2903c'), 0.3, 0.3);
    const ct = [], pt = [];
    for (let i = 0; i < 12; i++) for (let k = 0; k < 7; k++) {
      ct.push(mat4(-8 + i * 1.1, h(-8 + i * 1.1, 24 + k * 1.1) + 0.1, 24 + k * 1.1, 0.9 + r() * 0.3));
      if (r() > 0.25) pt.push(mat4(-26 + i * 1.1, h(-26 + i * 1.1, 24 + k * 1.1) + 0.1, 24 + k * 1.1, 0.7 + r() * 0.5, 0.7 + r() * 0.5, 0.7 + r() * 0.5, 0, r() * 6, 0));
    }
    this.add(scatterInstanced(cab, vtoon(), ct), scatterInstanced(pump, vtoon(), pt));
  }

  buildChannels(h) {
    const mat = waterMaterial({ shallow: '#9fe0e8', deep: '#4f8fcf', sky: '#fff0d8' });
    const strips = [[-20, -1, 50, 1.6, 0], [-29, -1, 1.6, 34, 0], [-11, -1, 1.6, 34, 0], [7, -1, 1.6, 34, 0], [-20, 17, 50, 1.6, 0]];
    for (const [x, z, w, d] of strips) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, h(x, z) + 0.06, z);
      this.add(m);
      // little wooden edges
      const edge = toon('#9a7048');
      if (w > d) { this.add(mesh(new THREE.BoxGeometry(w, 0.12, 0.12), edge, x, h(x, z) + 0.06, z - d / 2), mesh(new THREE.BoxGeometry(w, 0.12, 0.12), edge, x, h(x, z) + 0.06, z + d / 2)); }
      else { this.add(mesh(new THREE.BoxGeometry(0.12, 0.12, d), edge, x - w / 2, h(x, z) + 0.06, z), mesh(new THREE.BoxGeometry(0.12, 0.12, d), edge, x + w / 2, h(x, z) + 0.06, z)); }
    }
  }

  buildFarmstead(h) {
    // red barn (the maroon of the game's identity)
    const barn = new THREE.Group();
    const red = toon('#a9203e'), white = toon('#f5efe0'), roofM = toon('#5a3a3a');
    barn.add(mesh(new THREE.BoxGeometry(12, 6, 9), red, 0, 3, 0));
    const shape = new THREE.Shape();
    shape.moveTo(-6.3, 0); shape.lineTo(-5.2, 2.2); shape.lineTo(0, 3.8); shape.lineTo(5.2, 2.2); shape.lineTo(6.3, 0); shape.closePath();
    const roofG = new THREE.ExtrudeGeometry(shape, { depth: 9.6, bevelEnabled: false });
    roofG.translate(0, 0, -4.8);
    barn.add(mesh(roofG, roofM, 0, 6, 0));
    barn.add(mesh(new THREE.BoxGeometry(4, 4.4, 0.2), toon('#7a1830'), 0, 2.2, 4.55));
    barn.add(mesh(new THREE.BoxGeometry(4.3, 0.25, 0.25), white, 0, 4.4, 4.62));
    const x1 = mesh(new THREE.BoxGeometry(0.2, 5.6, 0.1), white, 0, 2.2, 4.68); x1.rotation.z = 0.7;
    const x2 = mesh(new THREE.BoxGeometry(0.2, 5.6, 0.1), white, 0, 2.2, 4.68); x2.rotation.z = -0.7;
    barn.add(x1, x2);
    barn.add(mesh(new THREE.CircleGeometry(0.8, 16), glow('#ffe3a0'), 0, 7.6, 4.81, false));
    barn.position.set(22, h(22, -4), -4);
    outline(barn, 0.04);
    this.add(barn);
    this.box(16, -8.5, 28, 0.5);

    // silo with a futuristic glowing band
    const silo = new THREE.Group();
    silo.add(mesh(new THREE.CylinderGeometry(2, 2, 10, 20), toon('#dfe6ea'), 0, 5, 0));
    silo.add(mesh(new THREE.SphereGeometry(2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon('#9fc6f0'), 0, 10, 0));
    silo.add(mesh(new THREE.TorusGeometry(2.05, 0.12, 8, 30), glow('#9ff4ff'), 0, 7, 0, false));
    silo.children[2].rotation.x = Math.PI / 2;
    silo.position.set(31, h(31, -6), -6);
    outline(silo, 0.04);
    this.add(silo); this.circle(31, -6, 2.2);

    // farmhouse
    const house = new THREE.Group();
    house.add(mesh(new THREE.BoxGeometry(8, 4, 6), toon('#f4e8d2'), 0, 2, 0));
    const hr = new THREE.Shape(); hr.moveTo(-4.6, 0); hr.lineTo(0, 2.8); hr.lineTo(4.6, 0); hr.closePath();
    const hrg = new THREE.ExtrudeGeometry(hr, { depth: 6.8, bevelEnabled: false }); hrg.translate(0, 0, -3.4);
    house.add(mesh(hrg, toon('#6a8fb8'), 0, 4, 0));
    house.add(mesh(new THREE.BoxGeometry(1.2, 2.2, 0.1), toon('#7a5236'), 0, 1.1, 3.02));
    for (const x of [-2.4, 2.4]) house.add(mesh(new THREE.BoxGeometry(1.2, 1.1, 0.1), glow('#ffe7b8'), x, 2.3, 3.02, false));
    house.position.set(31, h(31, 14), 14);
    outline(house, 0.03);
    this.add(house); this.box(26.8, 10.8, 35.2, 17.2);

    // windmill on the rise
    const wm = new THREE.Group();
    wm.add(mesh(new THREE.CylinderGeometry(1.4, 2.4, 11, 8), toon('#f5efe0'), 0, 5.5, 0));
    wm.add(mesh(new THREE.ConeGeometry(2, 2.4, 8), toon('#a9203e'), 0, 12.2, 0));
    this.sails = new THREE.Group();
    this.sails.position.set(0, 11, 2.1);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
      arm.add(mesh(new THREE.BoxGeometry(0.25, 7, 0.15), toon('#7a5236'), 0, 3.6, 0));
      arm.add(mesh(new THREE.BoxGeometry(1.4, 5.6, 0.06), toon('#fff4e0'), 0.75, 4, 0));
      this.sails.add(arm);
    }
    wm.add(this.sails);
    wm.position.set(-46, h(-46, 34), 34);
    wm.rotation.y = 0.5;
    outline(wm, 0.04);
    this.add(wm); this.circle(-46, 34, 2.5);
    // slim modern turbines on the far ridge
    this.turbines = [];
    for (let i = 0; i < 4; i++) {
      const tx = -120 + i * 55, tz = -110 - (i % 2) * 20;
      const tb = new THREE.Group();
      tb.add(mesh(new THREE.CylinderGeometry(0.4, 0.8, 30, 8), toon('#f5f1ea'), 0, 15, 0));
      const rot = new THREE.Group(); rot.position.set(0, 30, 1);
      for (let k = 0; k < 3; k++) { const b = mesh(new THREE.BoxGeometry(0.5, 14, 0.2), toon('#ffffff'), 0, 7, 0); const a = new THREE.Group(); a.rotation.z = k * 2.094; a.add(b); rot.add(a); }
      tb.add(rot);
      tb.position.set(tx, h(tx, tz), tz);
      this.add(tb); this.turbines.push(rot);
    }
    this.onUpdate((dt) => { this.sails.rotation.z += dt * 0.5; this.turbines.forEach((r, i) => (r.rotation.z += dt * (0.6 + i * 0.1))); });

    // sheep pen
    this.add(fence({ points: [[24, 26], [40, 26], [40, 36], [24, 36], [24, 26]], heightAt: h }));
    this.box(23.8, 25.8, 40.2, 26.2); this.box(23.8, 35.8, 40.2, 36.2); this.box(23.8, 25.8, 24.2, 36.2); this.box(39.8, 25.8, 40.2, 36.2);
    const r = mulberry32(9);
    this.sheep = [];
    for (let i = 0; i < 7; i++) {
      const sh = new THREE.Group();
      for (let k = 0; k < 6; k++) sh.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), toon('#fbf6ee'), (r() - 0.5) * 0.6, 0.85 + r() * 0.25, (r() - 0.5) * 0.8));
      sh.add(mesh(new THREE.SphereGeometry(0.26, 10, 8), toon('#3a3040'), 0, 0.95, 0.6));
      for (const [lx, lz] of [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0.3], [0.2, 0.3]]) sh.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), toon('#3a3040'), lx, 0.3, lz));
      const x = 27 + r() * 10, z = 28 + r() * 6;
      sh.position.set(x, h(x, z), z); sh.rotation.y = r() * 6;
      sh.userData.o = r() * 10;
      outline(sh, 0.02);
      this.add(sh); this.sheep.push(sh);
    }
    this.onUpdate((dt, t) => this.sheep.forEach((s) => { s.children[6].position.y = 0.95 + Math.sin(t * 1.5 + s.userData.o) * 0.12 - 0.12; s.rotation.y += Math.sin(t * 0.3 + s.userData.o) * dt * 0.2; }));

    // path fence
    this.add(fence({ points: [[10, 40], [10, 30], [14, 16]], heightAt: h }));
  }

  // Floating islands of farmland drifting overhead.
  buildIslands() {
    const r = mulberry32(17);
    this.islands = [];
    const specs = [[-120, 90, -160, 26], [140, 120, -220, 34], [60, 160, -340, 22], [-220, 140, -60, 30], [200, 80, 40, 18], [-60, 200, -420, 40]];
    for (const [x, y, z, size] of specs) {
      const g = new THREE.Group();
      const cone = new THREE.ConeGeometry(size, size * 1.6, 12, 6);
      cone.rotateX(Math.PI);
      const p = cone.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + (r() - 0.5) * 0.25; p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); }
      cone.computeVertexNormals();
      g.add(new THREE.Mesh(heightTint(colored(cone, '#9a7a62'), 0.5, 0.2), vtoon()));
      g.children[0].position.y = -size * 0.8;
      g.add(mesh(new THREE.CylinderGeometry(size * 1.02, size * 0.95, size * 0.18, 14), toon('#86b84a'), 0, 0, 0));
      g.add(mesh(new THREE.BoxGeometry(size * 0.9, size * 0.06, size * 0.7), toon('#e8c35a'), size * 0.1, size * 0.1, -size * 0.1));
      const tr = broadleafGeometry(20 + size, { height: 3, spread: 2 });
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(tr, vtoon()); m.scale.setScalar(size / 12); m.position.set(Math.cos(i * 2.1) * size * 0.6, 0, Math.sin(i * 2.1) * size * 0.6); g.add(m); }
      // waterfall ribbon
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.12, size * 2.4), new THREE.MeshBasicMaterial({ map: glowTexture('rgba(220,245,255,0.9)'), transparent: true, opacity: 0.55, depthWrite: false }));
      fall.position.set(size * 0.95, -size * 1.1, 0); fall.rotation.y = Math.PI / 2;
      g.add(fall);
      g.position.set(x, y, z);
      g.userData.o = r() * 10; g.userData.y = y;
      this.add(g); this.islands.push(g);
    }
    this.onUpdate((dt, t) => this.islands.forEach((g) => { g.position.y = g.userData.y + Math.sin(t * 0.3 + g.userData.o) * 3; g.rotation.y += dt * 0.01; }));
  }

  buildPollen() {
    const N = 400, R = 30;
    const pos = new Float32Array(N * 3), r = mulberry32(2);
    for (let i = 0; i < N; i++) pos.set([(r() - 0.5) * R * 2, r() * 10, (r() - 0.5) * R * 2], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.18, map: glowTexture('rgba(255,236,170,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#fff0b0' }));
    pts.frustumCulled = false;
    this.add(pts);
    this.onUpdate((dt, t) => {
      const c = this.game.focus;
      pts.position.set(c.x, this.heightAt(c.x, c.z), c.z);
      pts.rotation.y = t * 0.02;
      pts.position.y += Math.sin(t * 0.5) * 0.5;
    });
  }

  // ------------------------------------------------------------ mission
  buildMission(h) {
    const game = this.game, ws = this.ws;
    const def = game.missions.def('harvestDay');
    const target = def.target, cap = def.carry;
    ws.harvested ??= []; ws.delivered ??= 0;

    this.oren = new NPC(this, { preset: 'farmer', name: 'Farmer Oren', pos: [13, 7], yaw: -0.6, onTalk: () => this.talkOren() });
    new NPC(this, { preset: 'farmhand', name: 'Lio', pos: [-20, -2.2], yaw: 0.3, pose: 'work' });
    new NPC(this, { preset: 'farmhand', name: 'Wren', pos: [-34, 16], yaw: 2.4, pose: 'work' });

    // cart
    const cart = new THREE.Group();
    cart.add(mesh(new THREE.BoxGeometry(2.4, 0.8, 1.6), toon('#9a6a44'), 0, 1, 0));
    for (const s of [-1, 1]) { const w = mesh(new THREE.TorusGeometry(0.55, 0.1, 6, 14), toon('#5a3a2a'), 0, 0.6, s * 0.85); cart.add(w); }
    cart.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 2.2), toon('#7a5236'), 1.8, 0.8, 0));
    this.heap = mesh(new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#f2cc62'), 0, 1.35, 0);
    this.heap.scale.set(1.1, 0.01, 0.7);
    cart.add(this.heap);
    cart.position.set(15.5, h(15.5, 2.5), 2.5);
    cart.rotation.y = 0.4;
    outline(cart, 0.03);
    this.add(cart); this.circle(15.5, 2.5, 1.3);
    this.cartPos = cart.position.clone();
    const setHeap = () => this.heap.scale.set(1.1, Math.max(0.01, (ws.delivered / target) * 0.9), 0.7);
    setHeap();

    // golden sheaves
    const r = mulberry32(44);
    const spots = [];
    for (const [px, pz] of PLOTS) for (let i = 0; i < 3; i++) spots.push([px + (r() - 0.5) * 10, pz + (r() - 0.5) * 10]);
    this.sheaves = [];
    const sheafGeo = merge([
      colored(new THREE.CylinderGeometry(0.28, 0.18, 1.3, 8), '#f2cc62', mat4(0, 0.65, 0)),
      colored(new THREE.SphereGeometry(0.34, 8, 6), '#ffe08a', mat4(0, 1.3, 0, 1, 1.3, 1)),
      colored(new THREE.TorusGeometry(0.24, 0.05, 6, 12), '#a9203e', mat4(0, 0.7, 0, 1, 1, 1, Math.PI / 2)),
    ]);
    spots.forEach(([x, z], i) => {
      if (ws.harvested.includes(i)) return;
      const m = new THREE.Mesh(sheafGeo, vtoon({ emissive: '#6a4a10', emissiveIntensity: 0.35 }));
      m.position.set(x, h(x, z), z); m.rotation.y = r() * 6; m.castShadow = true;
      this.add(m);
      const it = this.interact({
        label: 'Harvest', position: m.position, radius: 1.9, markerHeight: 2.1, markerColor: '#ffe08a',
        enabled: () => game.missions.stage('harvestDay') === 'harvest',
        onInteract: async () => {
          if (game.inventory.count('crops') >= cap) { game.hud.toast('Your arms are full — take the crops to the cart.'); return; }
          await game.cutscene(async () => {
            game.player.setPose('harvest');
            game.controller.yaw = Math.atan2(m.position.x - game.player.root.position.x, m.position.z - game.player.root.position.z);
            game.player.root.rotation.y = game.controller.yaw;
            game.audio.pick();
            await game.tweens.tween(0.9, (k) => { m.scale.setScalar(1 - k); m.position.y += 0.02; });
            game.player.setPose('stand');
          });
          this.remove(m, it);
          ws.harvested.push(i);
          const n = game.inventory.add('crops', 1);
          game.hud.toast(n >= cap ? `Crops × ${n} — arms full! Deliver them to the cart.` : `Crops × ${n}`);
          game.save();
        },
      });
      this.sheaves.push({ m, it });
    });

    this.interact({
      label: 'Deliver Crops', position: this.cartPos, radius: 2.8, markerHeight: 2.6, markerColor: '#ffe08a',
      enabled: () => game.missions.stage('harvestDay') === 'harvest' && game.inventory.count('crops') > 0,
      onInteract: async () => {
        const n = game.inventory.count('crops');
        game.inventory.set('crops', 0);
        ws.delivered += n;
        game.audio.chime();
        game.missions.progress('harvestDay', Math.min(ws.delivered, target), target);
        game.tweens.tween(0.8, () => setHeap());
        game.save();
        if (ws.delivered >= target) {
          game.missions.setStage('harvestDay', 'reward');
          game.hud.toast('The cart is full! Tell Farmer Oren.');
        } else game.hud.toast(`Delivered ${ws.delivered} / ${target}`);
      },
    });
  }

  remove(m, it) { this.scene.remove(m); this.removeInteract(it); }

  onArrive() {
    const st = this.game.missions.stage('harvestDay');
    if (st === 'harvest') this.game.missions.progress('harvestDay', Math.min(this.ws.delivered, this.game.missions.def('harvestDay').target), this.game.missions.def('harvestDay').target);
    if (st === 'talk') this.game.hud.hint('Farmer Oren is waiting by the red barn · [E] Talk');
  }

  waypoint() {
    const game = this.game, st = game.missions.stage('harvestDay');
    if (game.missions.isDone('harvestDay')) return game.car.root.position.clone().setY(game.car.root.position.y + 3);
    if (st === 'talk' || st === 'reward') return this.oren.pos.clone().setY(this.oren.pos.y + 2.5);
    if (st === 'harvest') {
      const cap = game.missions.def('harvestDay').carry;
      const carried = game.inventory.count('crops');
      const remaining = game.missions.def('harvestDay').target - this.ws.delivered;
      if (carried >= cap || carried >= remaining || !this.sheaves.some((s) => s.m.parent)) return this.cartPos.clone().setY(this.cartPos.y + 2.5);
      const p = game.player.root.position;
      let best = null, bd = Infinity;
      for (const s of this.sheaves) if (s.m.parent) { const d = s.m.position.distanceTo(p); if (d < bd) { bd = d; best = s.m.position; } }
      return best?.clone().setY(best.y + 2);
    }
    return null;
  }

  async talkOren() {
    const game = this.game, name = game.state.nickname, st = game.missions.stage('harvestDay');
    const target = game.missions.def('harvestDay').target;
    if (st === 'talk') {
      await game.talk([
        { who: 'Farmer Oren', text: 'Well, I\'ll be. You came down through the Ring, didn\'t you? Nobody\'s done that in years.' },
        { who: name, text: 'I\'m looking for oxygen. My mom… her machine is failing.' },
        { who: 'Farmer Oren', text: 'If you help us finish today\'s harvest, I\'ll give you something that may help your mother.' },
        { who: 'Farmer Oren', text: `The ripe sheaves glow gold. Carry them to the cart by the barn — ${target} should do it.` },
      ]);
      game.missions.setStage('harvestDay', 'harvest');
      game.missions.progress('harvestDay', this.ws.delivered, target);
      game.hud.hint('Find glowing golden sheaves in the fields · [E] Harvest · carry up to 6 at a time');
    } else if (st === 'harvest') {
      await game.talk([{ who: 'Farmer Oren', text: `${this.ws.delivered} in the cart so far. The fields are generous today — keep going!` }]);
    } else if (st === 'reward') {
      await game.talk([
        { who: 'Farmer Oren', text: 'Look at that cart! We\'ll eat well this winter — and so will the neighbours.' },
        { who: 'Farmer Oren', text: 'Here. It grows in the roots of the old tree. "Breath of the fields," my grandmother called it.' },
      ]);
      await game.rewards.giveCore(this.oren.pos, 'harvestDay');
      this.oren.model.setPose('cheer');
      await game.talk([{ who: 'Farmer Oren', text: 'Safe travels, little star. Give your mother our love.' }]);
      this.oren.model.setPose('stand');
      game.hud.toast('Return to your car to head back to space');
    } else {
      await game.talk([{ who: 'Farmer Oren', text: 'Go on home when you\'re ready. The fields will remember you.' }]);
    }
  }
}
