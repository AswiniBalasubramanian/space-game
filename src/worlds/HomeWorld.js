import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BaseWorld } from './BaseWorld.js';
import { createSkyDome, createCloudRing } from '../render/Sky.js';
import { createCosmicRing } from '../render/cosmic.js';
import { terrain, grassField, flowerField, broadleafGeometry, pineGeometry, forest, mountainRange, rocks, fence } from '../render/nature.js';
import { toon, glow, mesh, outline } from '../render/toon.js';
import { glowTexture } from '../render/textures.js';
import { CharacterModel } from '../character/CharacterModel.js';
import { makeCore } from '../progression/RewardSystem.js';
import { Ease } from '../core/Tween.js';
import { fbm, smoothstep, clamp } from '../utils/noise.js';
import { cineText } from '../ui/EntryScreen.js';

// HOME — small, warm, human. A cottage on a windy meadow, Mom resting in the
// bedroom beside her failing oxygen machine, the old blue car out front.
const FLOOR = 0.3, H = 3.1, TH = 0.22;
const HOUSE = { minX: -8, maxX: 8, minZ: -5, maxZ: 5 };
const DOOR = { x1: 4.6, x2: 6.0 };
const CAR_SPOT = [9.5, 16];

export default class HomeWorld extends BaseWorld {
  get mood() { return this.mode === 'return' ? 'finale' : 'home'; }

  heightAt(x, z) {
    if (x > HOUSE.minX - 0.2 && x < HOUSE.maxX + 0.2 && z > HOUSE.minZ - 0.2 && z < HOUSE.maxZ + 0.2) return FLOOR;
    if (x > 3.4 && x < 7.3 && z >= 5 && z < 7.6) return z < 7 ? FLOOR : FLOOR * (1 - (z - 7) / 0.6);
    return this.ground(x, z);
  }

  ground(x, z) {
    const d = Math.hypot(x * 0.8, z);
    const hills = (fbm(x * 0.008 + 7, z * 0.008 + 2, 4) - 0.45) * 46 * smoothstep(22, 120, d);
    const roll = (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 2.2 * smoothstep(12, 30, d);
    return hills + roll - 0.02;
  }

  inside(p) { return p.x > HOUSE.minX && p.x < HOUSE.maxX && p.z > HOUSE.minZ && p.z < HOUSE.maxZ; }

  async build(opts) {
    this.mode = opts.mode ?? 'start';
    const dusk = this.mode === 'return';
    const s = this.scene;
    this.maxCamDist = 9;

    // --- sky -----------------------------------------------------------
    s.fog = new THREE.Fog(dusk ? '#c9a3b6' : '#c8def4', 90, 700);
    const sky = createSkyDome(dusk
      ? { top: '#1d2352', mid: '#5b4f8f', horizon: '#f2a36b', sunDir: [0.3, 0.05, -1], sun: '#ffb27a', stars: 1, cirrus: 0.4, nebula: 0.35, nebA: '#6a7fd0', nebB: '#d86aa8' }
      : { top: '#2a66c9', mid: '#6aa3e6', horizon: '#eaf2f8', sunDir: [0.45, 0.45, -0.6], cirrus: 0.9 });
    this.add(sky); this.skyFollow.push(sky);
    this.onUpdate((dt, t) => sky.userData.update(t));
    const clouds = createCloudRing(dusk
      ? { count: 18, seed: 9, palette: { light: '#ffd9c0', mid: '#f0b6b0', shadow: '#7a6aa8', rim: '#fff0d8' }, radius: [450, 800], height: [40, 180] }
      : { count: 26, seed: 2, radius: [380, 780], height: [40, 230], scale: [150, 300] });
    this.add(clouds);
    this.onUpdate((dt, t) => clouds.userData.update(t, dt));
    // The same celestial ring that will later fill the other worlds' skies.
    const ring = createCosmicRing({ radius: 2600, width: dusk ? 380 : 260, opacity: dusk ? 0.9 : 0.28, seed: 5, tint: dusk ? '#ffe0c0' : '#ffffff' });
    ring.position.set(300, dusk ? -200 : -900, -2400);
    ring.rotation.set(-0.35, 0.3, 0.5);
    this.add(ring);
    this.onUpdate((dt, t) => ring.userData.update(t));

    this.lights(dusk
      ? { sun: '#ffb38a', sunI: 1.6, sky: '#8a86c9', ground: '#6a5a6a', hemiI: 1.0, dir: [-30, 22, -45] }
      : { sun: '#fff1d6', sunI: 2.5, sky: '#c6e2ff', ground: '#94a86a', hemiI: 1.15, dir: [35, 55, 20] });

    // --- land ----------------------------------------------------------
    const h = (x, z) => this.heightAt(x, z);
    const onPath = (x, z) => this.pathDist(x, z) < 1.3;
    const grassA = new THREE.Color(dusk ? '#5d8a4a' : '#7cb342'), grassB = new THREE.Color(dusk ? '#8a9a5a' : '#c3d86a'), sand = new THREE.Color(dusk ? '#b89a7a' : '#dcc39a');
    this.add(terrain({ size: 1000, seg: 200, height: (x, z) => this.ground(x, z), color: (x, z, y, c) => {
      const n = fbm(x * 0.05, z * 0.05, 3);
      c.copy(grassA).lerp(grassB, clamp(n * 1.1 - 0.1 + y * 0.01, 0, 1));
      const pd = this.pathDist(x, z);
      if (pd < 1.6) c.lerp(sand, smoothstep(1.6, 0.9, pd));
    } }));
    const notHouse = (x, z) => !(x > -9 && x < 9 && z > -6 && z < 7.8) && !onPath(x, z);
    this.add(grassField({ count: 11000, area: [-40, -35, 45, 55], heightAt: h, accept: notHouse, seed: 3 }));
    this.add(flowerField({ count: 1400, area: [-40, -35, 45, 55], heightAt: h, accept: notHouse, colors: dusk ? ['#ffffff', '#ffd9a8', '#e8a0c0'] : ['#ffffff', '#fff2a8', '#ff9fb2', '#f26b4f', '#c9a8ff'] }));
    this.add(mountainRange({ count: 11, radius: [420, 620], height: [160, 300], seed: 8, colors: dusk ? { base: '#4a5a6a', rock: '#6a6a9a', snow: '#ffd8c8' } : {} }));
    const pines = []; for (let i = 0; i < 40; i++) { const a = -2.2 + i * 0.11 + Math.sin(i * 7) * 0.05; const d = 32 + (i % 6) * 7; pines.push([Math.cos(a) * d, Math.sin(a) * d - 5]); }
    this.add(forest({ template: pineGeometry(4, { height: 9 }), positions: pines.filter(([x, z]) => this.pathDist(x, z) > 7 && !(x > -8 && x < 18 && z > 8 && z < 60)), heightAt: h, scale: [0.8, 1.6] }));
    const broad = []; for (let i = 0; i < 22; i++) { const a = 0.4 + i * 0.13; const d = 35 + (i % 4) * 9; broad.push([Math.cos(a) * d + 10, Math.sin(a) * d]); }
    // keep the lane (and the final camera's view of the house) clear
    const clear = ([x, z]) => this.pathDist(x, z) > 7 && !(x > -8 && x < 18 && z > 8 && z < 60);
    this.add(forest({ template: broadleafGeometry(12), positions: broad.filter(clear), heightAt: h }));
    // the old tree beside the house
    this.add(forest({ template: broadleafGeometry(5, { height: 5.5, spread: 3.6, leaf: '#4c8a3a', leaf2: '#6fae45' }), positions: [[-12, 8, 1.3]], heightAt: h }));
    this.circle(-12, 8, 0.8);
    this.add(rocks({ positions: [[-9, 12, 0.8], [14, 6, 1.2], [16, 9, 0.6], [-15, -8, 1.6], [3, 24, 0.9], [-4, 18, 0.5]], heightAt: h }));
    [[-9, 12, 0.8], [14, 6, 1.2], [-15, -8, 1.6]].forEach(([x, z, r]) => this.circle(x, z, r));
    this.add(fence({ points: [[11, 8], [13, 14], [13.5, 24], [12, 34]], heightAt: h }));
    this.add(fence({ points: [[2, 9.5], [-6, 10], [-10, 5]], heightAt: h }));
    this.laundry(h);

    this.buildHouse(dusk);
    this.buildInterior(dusk);
    this.buildStory(opts);
    this.bounds = { x: 5, z: 10, r: 60 };
  }

  pathDist(x, z) {
    // porch → car → down the lane
    const pts = [[5.3, 7.4], [6.5, 11], [9, 14], [11, 20], [10, 30], [6, 42], [4, 60]];
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const vx = bx - ax, vz = bz - az;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
    return best;
  }

  laundry(h) {
    const g = new THREE.Group();
    const pole = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);
    const y0 = h(-5, 13);
    g.add(mesh(pole, toon('#8a6a4a'), -8, y0 + 1.2, 13), mesh(pole, toon('#8a6a4a'), -2, y0 + 1.2, 13));
    const line = mesh(new THREE.CylinderGeometry(0.01, 0.01, 6, 3), toon('#ffffff'), -5, y0 + 2.3, 13);
    line.rotation.z = Math.PI / 2;
    g.add(line);
    this.cloths = [];
    ['#f5f1ea', '#f2703c', '#9fc6f0', '#f5f1ea'].forEach((c, i) => {
      const cl = mesh(new THREE.PlaneGeometry(0.9, 1.1, 4, 4), toon(c, { side: THREE.DoubleSide }), -7 + i * 1.4, y0 + 1.75, 13);
      cl.geometry.translate(0, -0.55, 0); cl.position.y += 0.55;
      g.add(cl); this.cloths.push(cl);
    });
    this.add(g);
    this.onUpdate((dt, t) => this.cloths.forEach((c, i) => { c.rotation.x = Math.sin(t * 2 + i) * 0.25 - 0.15; }));
  }

  // Axis-aligned wall with door/window openings: [{a, b, bottom, top, window}]
  wallRun(axis, fixed, from, to, openings, mat) {
    const len = to - from;
    const parts = [];
    let cur = from;
    const sorted = [...openings].sort((p, q) => p.a - q.a);
    const place = (a, b, y0, y1) => {
      if (b - a < 0.01 || y1 - y0 < 0.01) return;
      const g = new THREE.BoxGeometry(axis === 'x' ? b - a : TH, y1 - y0, axis === 'x' ? TH : b - a);
      const m = mesh(g, mat, 0, FLOOR + (y0 + y1) / 2, 0);
      if (axis === 'x') { m.position.x = (a + b) / 2; m.position.z = fixed; } else { m.position.z = (a + b) / 2; m.position.x = fixed; }
      this.houseGroup.add(m); this.cameraBlockers.push(m); parts.push(m);
    };
    for (const o of sorted) {
      place(cur, o.a, 0, H);
      place(o.a, o.b, 0, o.bottom);
      place(o.a, o.b, o.top, H);
      if (o.window) this.windowAt(axis, fixed, (o.a + o.b) / 2, o.b - o.a, o.bottom, o.top);
      cur = o.b;
    }
    place(cur, to, 0, H);
    // colliders (doors leave a gap)
    const doors = sorted.filter((o) => o.bottom === 0);
    let c = from;
    for (const d of doors) { this.addWallCollider(axis, fixed, c, d.a); c = d.b; }
    this.addWallCollider(axis, fixed, c, to);
    return len;
  }

  addWallCollider(axis, fixed, a, b) {
    if (b - a < 0.01) return;
    if (axis === 'x') this.wall(a, fixed, b, fixed, TH + 0.05); else this.wall(fixed, a, fixed, b, TH + 0.05);
  }

  windowAt(axis, fixed, center, w, y0, y1) {
    const frame = toon('#7a5236');
    const glass = this.mode === 'return'
      ? glow('#ffd58a', 0.75) // lamplight glowing out into the dusk
      : new THREE.MeshToonMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.35, gradientMap: null });
    const hgt = y1 - y0;
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(w, hgt, 0.04), glass, 0, 0, 0, false));
    g.add(mesh(new THREE.BoxGeometry(w + 0.2, 0.12, 0.34), frame, 0, -hgt / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(w + 0.2, 0.12, 0.3), frame, 0, hgt / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, hgt, 0.3), frame, 0, 0, 0));
    g.add(mesh(new THREE.BoxGeometry(w, 0.06, 0.3), frame, 0, 0, 0));
    // flower box under outer sill
    const box = mesh(new THREE.BoxGeometry(w, 0.25, 0.3), toon('#9a6a44'), 0, -hgt / 2 - 0.2, 0.3);
    g.add(box);
    for (let i = 0; i < 5; i++) {
      const f = mesh(new THREE.SphereGeometry(0.12, 8, 6), toon(['#f26b4f', '#fff2a8', '#ff9fb2'][i % 3]), -w / 2 + 0.15 + i * (w - 0.3) / 4, -hgt / 2 - 0.02, 0.32);
      g.add(f);
    }
    g.position.set(axis === 'x' ? center : fixed, FLOOR + (y0 + y1) / 2, axis === 'x' ? fixed : center);
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    // flower boxes face outward
    const outward = axis === 'x' ? Math.sign(fixed) : Math.sign(fixed);
    if (outward < 0) g.rotation.y += Math.PI;
    this.houseGroup.add(g);
  }

  buildHouse(dusk) {
    this.houseGroup = new THREE.Group();
    this.add(this.houseGroup);
    const plaster = toon('#f4e8d2'), beam = toon('#7a5236'), stone = toon('#a9a49a');
    // stone base + floor
    this.houseGroup.add(mesh(new THREE.BoxGeometry(16.6, FLOOR + 0.3, 10.6), stone, 0, (FLOOR - 0.3) / 2, 0));
    const floor = mesh(new THREE.BoxGeometry(16, 0.06, 10), toon('#c99a66'), 0, FLOOR - 0.02, 0, false);
    this.houseGroup.add(floor);
    for (let i = -7; i <= 7; i++) this.houseGroup.add(mesh(new THREE.BoxGeometry(0.03, 0.065, 10), toon('#a87c50'), i + 0.5, FLOOR - 0.015, 0, false));

    // outer walls
    const win = (a, b) => ({ a, b, bottom: 1.0, top: 2.3, window: true });
    this.wallRun('x', HOUSE.minZ, HOUSE.minX, HOUSE.maxX, [win(-6.2, -4.6), win(2.0, 3.4)], plaster);
    this.wallRun('x', HOUSE.maxZ, HOUSE.minX, HOUSE.maxX, [win(-5.6, -3.8), win(0.2, 2.2), { a: DOOR.x1, b: DOOR.x2, bottom: 0, top: 2.45 }], plaster);
    this.wallRun('z', HOUSE.minX, HOUSE.minZ, HOUSE.maxZ, [win(-1, 1)], plaster);
    this.wallRun('z', HOUSE.maxX, HOUSE.minZ, HOUSE.maxZ, [win(-2.5, -0.9)], plaster);
    // partition wall between bedroom and living room, with a doorway
    this.wallRun('z', -2, HOUSE.minZ, HOUSE.maxZ, [{ a: 0.2, b: 1.8, bottom: 0, top: 2.45 }], toon('#f2dcc0'));

    // timber frame accents
    for (const [x, z] of [[-8, -5], [8, -5], [-8, 5], [8, 5], [0, 5], [0, -5]]) this.houseGroup.add(mesh(new THREE.BoxGeometry(0.32, H, 0.32), beam, x, FLOOR + H / 2, z));
    for (const z of [-5, 5]) this.houseGroup.add(mesh(new THREE.BoxGeometry(16.3, 0.22, 0.3), beam, 0, FLOOR + H, z));

    // front door
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(DOOR.x1, FLOOR, HOUSE.maxZ);
    const door = mesh(new RoundedBoxGeometry(DOOR.x2 - DOOR.x1, 2.4, 0.12, 2, 0.04), toon('#6a8fb8'), (DOOR.x2 - DOOR.x1) / 2, 1.2, 0);
    const knob = mesh(new THREE.SphereGeometry(0.07, 8, 6), toon('#f2c14e'), DOOR.x2 - DOOR.x1 - 0.2, 1.15, 0.1);
    const dwin = mesh(new THREE.CircleGeometry(0.22, 16), glow('#ffe7b8'), (DOOR.x2 - DOOR.x1) / 2, 1.8, 0.07, false);
    this.doorPivot.add(door, knob, dwin);
    this.houseGroup.add(this.doorPivot);
    this.doorCollider = { t: 'b', minX: DOOR.x1, maxX: DOOR.x2, minZ: HOUSE.maxZ - 0.15, maxZ: HOUSE.maxZ + 0.15 };
    this.colliders.push(this.doorCollider);

    // porch + steps + little lamp
    this.houseGroup.add(mesh(new THREE.BoxGeometry(3.9, 0.3, 2.1), toon('#a87c50'), 5.35, FLOOR - 0.15, 6.05));
    this.houseGroup.add(mesh(new THREE.BoxGeometry(2.2, 0.15, 0.5), toon('#9a9488'), 5.3, 0.07, 7.3));
    for (const x of [3.6, 7.1]) this.houseGroup.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), beam, x, FLOOR + 1.3, 6.9));
    this.houseGroup.add(mesh(new THREE.BoxGeometry(4.2, 0.12, 2.5), toon('#c4572d'), 5.35, FLOOR + 2.65, 6.1));
    const lamp = mesh(new THREE.SphereGeometry(0.16, 10, 8), glow('#ffd79a'), 4.2, FLOOR + 2.3, 5.25, false);
    this.houseGroup.add(lamp);
    const porchLight = new THREE.PointLight('#ffc98a', dusk ? 10 : 0, 9);
    porchLight.position.set(4.2, FLOOR + 2.2, 5.6);
    this.add(porchLight);

    // roof (hidden while you're inside so the camera can look down)
    this.roof = new THREE.Group();
    const tile = toon('#d0602f'), tile2 = toon('#b84f28');
    const pitch = 0.62, halfD = 5.9, rise = Math.tan(pitch) * halfD;
    const slabLen = halfD / Math.cos(pitch) + 0.2;
    for (const s of [-1, 1]) {
      const slab = mesh(new THREE.BoxGeometry(17.6, 0.28, slabLen), s > 0 ? tile : tile2, 0, FLOOR + H + rise / 2, s * halfD / 2);
      slab.rotation.x = s * pitch;
      this.roof.add(slab);
      for (let i = 0; i < 6; i++) {
        const r = mesh(new THREE.BoxGeometry(17.62, 0.08, 0.1), toon('#a8461f'), 0, FLOOR + H + rise * (i / 6) + 0.16, s * halfD * (1 - i / 6));
        r.rotation.x = s * pitch; this.roof.add(r);
      }
    }
    // gable triangles
    const tri = new THREE.Shape();
    tri.moveTo(-halfD + 0.8, 0); tri.lineTo(halfD - 0.8, 0); tri.lineTo(0, rise - 0.3); tri.closePath();
    const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
    for (const x of [-8.05, 7.85]) {
      const gm = mesh(gable, plaster, x, FLOOR + H, 0);
      gm.rotation.y = Math.PI / 2; this.roof.add(gm);
    }
    const chimney = mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), toon('#9a8a7a'), -4.5, FLOOR + H + rise, -1.8);
    this.roof.add(chimney);
    this.smoke = [];
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,0.8)'), transparent: true, depthWrite: false, opacity: 0.5 }));
      sp.userData.o = i / 6; this.roof.add(sp); this.smoke.push(sp);
    }
    this.onUpdate((dt, t) => this.smoke.forEach((sp) => {
      const k = (t * 0.15 + sp.userData.o) % 1;
      sp.position.set(-4.5 + Math.sin(k * 5) * 0.4 + k * 2, FLOOR + H + rise + 1.3 + k * 6, -1.8);
      sp.scale.setScalar(0.8 + k * 2.4); sp.material.opacity = 0.45 * (1 - k);
    }));
    this.houseGroup.add(this.roof);
    outline(this.houseGroup, 0.025);
  }

  buildInterior(dusk) {
    const g = new THREE.Group();
    this.add(g);
    const wood = toon('#9a6a44'), woodL = toon('#c99a66'), cloth = toon('#e9c9c9'), cream = toon('#f5efe0');
    const F = FLOOR;

    // --- bedroom ---
    g.add(mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.03, 32), toon('#c98f8f'), -5, F + 0.02, -0.5, false));
    const bed = new THREE.Group();
    bed.add(mesh(new RoundedBoxGeometry(2.0, 0.45, 2.8, 2, 0.08), wood, 0, 0.25, 0));
    bed.add(mesh(new RoundedBoxGeometry(1.85, 0.25, 2.6, 2, 0.1), cream, 0, 0.58, 0));
    bed.add(mesh(new RoundedBoxGeometry(2.1, 1.3, 0.16, 2, 0.06), wood, 0, 0.65, -1.42));
    bed.add(mesh(new RoundedBoxGeometry(1.0, 0.22, 0.5, 2, 0.1), toon('#ffffff'), 0, 0.78, -1.05));
    const blanket = mesh(new RoundedBoxGeometry(1.95, 0.5, 2.0, 3, 0.2), toon('#f2a58f'), 0, 0.98, 0.35);
    bed.add(blanket);
    bed.position.set(-5.4, F, -3.45);
    g.add(bed);
    this.box(-6.45, -4.9, -4.35, -2.0);

    // Mom
    this.mom = new CharacterModel('mother');
    this.mom.root.rotation.x = -Math.PI / 2;
    this.mom.root.position.set(-5.4, F + 0.95, -2.75);
    this.mom.setPose('lie');
    this.mom.setEyesClosed(true);
    this.mom.forceClosed = true;
    g.add(this.mom.root);
    this.onUpdate((dt) => this.mom.update(dt, 0));

    // oxygen machine
    const mach = new THREE.Group();
    mach.add(mesh(new RoundedBoxGeometry(0.9, 1.4, 0.7, 3, 0.1), toon('#e6ebf0'), 0, 0.7, 0));
    mach.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 14), toon('#9fc6f0'), -0.62, 0.56, 0));
    this.gauge = mesh(new THREE.PlaneGeometry(0.5, 0.1), glow('#f2703c'), -0.25, 1.1, 0.36, false);
    this.gauge.geometry.translate(0.25, 0, 0);
    this.gauge.scale.x = 0.15;
    mach.add(mesh(new THREE.PlaneGeometry(0.56, 0.16), glow('#2b2440'), 0, 1.1, 0.355, false), this.gauge);
    this.machLight = mesh(new THREE.SphereGeometry(0.06, 8, 6), glow('#ff5a4a'), 0.3, 1.28, 0.33, false);
    mach.add(this.machLight);
    this.slots = [];
    for (let i = 0; i < 3; i++) {
      const s = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), glow('#3a4a5a'), -0.22 + i * 0.22, 1.42, 0.05, false);
      mach.add(s); this.slots.push(s);
    }
    mach.position.set(-3.55, F, -4.2);
    g.add(mach);
    this.machine = mach;
    this.box(-4.2, -4.6, -2.9, -3.8);
    // tube from machine to Mom
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.55, F + 0.9, -3.85), new THREE.Vector3(-3.7, F + 0.5, -3.3),
      new THREE.Vector3(-4.5, F + 0.95, -3.6), new THREE.Vector3(-5.2, F + 1.0, -4.2), new THREE.Vector3(-5.4, F + 1.12, -4.28),
    ]);
    g.add(mesh(new THREE.TubeGeometry(curve, 40, 0.025, 6), toon('#dff4ff'), 0, 0, 0, false));

    // nightstand + lamp + photos
    g.add(mesh(new RoundedBoxGeometry(0.8, 0.8, 0.6, 2, 0.05), wood, -7.3, F + 0.4, -4.3));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.4, 8), toon('#c9a45a'), -7.3, F + 1.0, -4.3));
    g.add(mesh(new THREE.ConeGeometry(0.28, 0.32, 12, 1, true), toon('#f2d2a8', { side: THREE.DoubleSide }), -7.3, F + 1.32, -4.3));
    this.bedLamp = new THREE.PointLight('#ffc98a', dusk ? 6 : 2.2, 8, 1.6);
    this.bedLamp.position.set(-7.3, F + 1.5, -4.0);
    g.add(this.bedLamp);
    const photoColors = [['#9fc6f0', '#f2a58f'], ['#f5d98a', '#8fae5a'], ['#c9a8ff', '#f5efe0']];
    photoColors.forEach(([a, b], i) => {
      const fr = mesh(new THREE.BoxGeometry(0.06, 0.55, 0.45), woodL, -7.86, F + 1.9 + (i % 2) * 0.1, -3.2 + i * 0.75);
      const pic = mesh(new THREE.PlaneGeometry(0.36, 0.44), toon(a), -7.82, F + 1.9 + (i % 2) * 0.1, -3.2 + i * 0.75, false);
      pic.rotation.y = Math.PI / 2;
      const sun = mesh(new THREE.CircleGeometry(0.08, 10), toon(b), -7.81, F + 2.0 + (i % 2) * 0.1, -3.25 + i * 0.75, false);
      sun.rotation.y = Math.PI / 2;
      g.add(fr, pic, sun);
    });
    // dresser + plant
    g.add(mesh(new RoundedBoxGeometry(1.6, 1.0, 0.6, 2, 0.05), wood, -7.4, F + 0.5, 2.8));
    this.plant(g, -7.4, F + 1.0, 3.2, 0.7);
    this.box(-8, 2.3, -6.7, 3.4);

    // --- living room ---
    g.add(mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.03, 32), toon('#8fa6c9'), 0.8, F + 0.02, 1.6, false));
    const sofa = new THREE.Group();
    sofa.add(mesh(new RoundedBoxGeometry(3.0, 0.55, 1.1, 3, 0.18), toon('#a9203e'), 0, 0.35, 0));
    sofa.add(mesh(new RoundedBoxGeometry(3.0, 0.9, 0.35, 3, 0.15), toon('#a9203e'), 0, 0.75, 0.45));
    for (const x of [-1.5, 1.5]) sofa.add(mesh(new RoundedBoxGeometry(0.35, 0.75, 1.1, 3, 0.15), toon('#8f1a34'), x, 0.5, 0));
    sofa.add(mesh(new RoundedBoxGeometry(0.6, 0.45, 0.2, 3, 0.1), toon('#f2c14e'), -0.8, 0.8, 0.2));
    sofa.position.set(0.8, F, 3.9);
    g.add(sofa);
    this.box(-0.9, 3.3, 2.5, 4.5);
    // coffee table with Dad's star map
    g.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 24), woodL, 0.8, F + 0.5, 1.6));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 8), wood, 0.8, F + 0.25, 1.6));
    this.circle(0.8, 1.6, 0.95);
    this.starMap = this.makeStarMap();
    this.starMap.position.set(0.8, F + 0.57, 1.6);
    g.add(this.starMap);
    // bookshelf + radio
    g.add(mesh(new RoundedBoxGeometry(2.2, 2.4, 0.5, 2, 0.05), wood, 0.6, F + 1.2, -4.6));
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.45 + (i % 3) * 0.06, 0.34), toon(['#a9203e', '#f2703c', '#5b8fd6', '#8fae5a', '#f5d98a'][(i + r) % 5]), -0.2 + i * 0.2, F + 0.55 + r * 0.72, -4.45));
    }
    this.box(-0.5, -5, 1.7, -4.3);
    this.plant(g, -1.3, F, -4.3, 1.1);
    this.plant(g, 3.0, F, 4.4, 1.0);

    // kitchen
    g.add(mesh(new RoundedBoxGeometry(4.2, 1.0, 0.8, 2, 0.05), toon('#e9dcc4'), 5.8, F + 0.5, -4.5));
    g.add(mesh(new THREE.BoxGeometry(4.3, 0.08, 0.9), woodL, 5.8, F + 1.02, -4.5));
    g.add(mesh(new RoundedBoxGeometry(0.9, 0.12, 0.7, 2, 0.04), toon('#3a3a4a'), 4.5, F + 1.1, -4.5));
    const kettle = mesh(new THREE.SphereGeometry(0.2, 12, 10), toon('#f2703c'), 4.5, F + 1.35, -4.5);
    g.add(kettle);
    this.steam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,0.7)'), transparent: true, depthWrite: false, opacity: 0 }));
    this.steam.position.set(4.5, F + 1.8, -4.5); g.add(this.steam);
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 10), toon(['#f5d98a', '#c9e4a0', '#f2a58f'][i % 3]), 6.0 + i * 0.35, F + 2.1, -4.75));
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.06, 0.4), wood, 6.7, F + 1.95, -4.75));
    const cup = mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.14, 10), toon('#ffffff'), 6.4, F + 1.13, -4.4);
    g.add(cup);
    this.box(3.6, -5, 8, -4.0);

    // dining table
    g.add(mesh(new RoundedBoxGeometry(2.0, 0.1, 1.2, 2, 0.04), woodL, 5.6, F + 0.85, -1.3));
    for (const [x, z] of [[4.8, -1.8], [6.4, -1.8], [4.8, -0.8], [6.4, -0.8]]) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 6), wood, x, F + 0.42, z));
    this.chairs = [[5.6, -0.25, Math.PI], [5.6, -2.35, 0]];
    for (const [x, z, ry] of this.chairs) {
      const ch = new THREE.Group();
      ch.add(mesh(new RoundedBoxGeometry(0.6, 0.08, 0.6, 2, 0.03), wood, 0, 0.5, 0));
      ch.add(mesh(new RoundedBoxGeometry(0.6, 0.7, 0.08, 2, 0.03), wood, 0, 0.9, -0.28));
      for (const [lx, lz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) ch.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), wood, lx, 0.25, lz));
      ch.position.set(x, F, z); ch.rotation.y = ry;
      g.add(ch);
    }
    this.box(4.5, -2.0, 6.7, -0.6);
    const vase = mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.25, 10), toon('#5b8fd6'), 5.6, F + 1.02, -1.3);
    g.add(vase);
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), toon(['#ffffff', '#fff2a8', '#f26b4f'][i % 3]), 5.6 + Math.cos(i * 1.6) * 0.1, F + 1.25, -1.3 + Math.sin(i * 1.6) * 0.1));
    // hanging lamp
    g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 4), toon('#3a3a4a'), 5.6, F + 2.6, -1.3, false));
    g.add(mesh(new THREE.ConeGeometry(0.4, 0.3, 14, 1, true), toon('#f2703c', { side: THREE.DoubleSide }), 5.6, F + 2.05, -1.3));
    this.diningLight = new THREE.PointLight('#ffc98a', dusk ? 8 : 3, 9, 1.5);
    this.diningLight.position.set(5.6, F + 1.9, -1.3);
    g.add(this.diningLight);
    this.livingLight = new THREE.PointLight('#ffd6a0', dusk ? 6 : 2, 10, 1.5);
    this.livingLight.position.set(0.8, F + 2.6, 1.6);
    g.add(this.livingLight);
    this.interior = g;
  }

  plant(g, x, y, z, s) {
    g.add(mesh(new THREE.CylinderGeometry(0.22 * s, 0.16 * s, 0.35 * s, 10), toon('#c4572d'), x, y + 0.17 * s, z));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.2 * s, 10, 8), toon(i % 2 ? '#5d9a36' : '#7cb342'), x + Math.cos(i * 1.3) * 0.15 * s, y + (0.45 + (i % 3) * 0.15) * s, z + Math.sin(i * 1.3) * 0.15 * s));
  }

  makeStarMap() {
    const m = new THREE.Group();
    m.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.03, 24), toon('#2b2440'), 0, 0, 0, false));
    const holo = new THREE.Group();
    holo.position.y = 0.45;
    m.add(holo);
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39, r = Math.sqrt(i / 40) * 0.5;
      const st = mesh(new THREE.SphereGeometry(0.015, 6, 4), glow('#fff4dc'), Math.cos(a) * r, Math.sin(i) * 0.12, Math.sin(a) * r, false);
      holo.add(st);
    }
    this.mapHoles = [];
    [[0.25, 0.1, -0.2, '#f2c14e'], [-0.3, 0.05, 0.1, '#fff0c8'], [0.05, -0.05, 0.32, '#f2703c']].forEach(([x, y, z, c]) => {
      const hole = new THREE.Group();
      hole.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), glow('#05050a'), 0, 0, 0, false));
      const r = mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 24), glow(c), 0, 0, 0, false);
      r.rotation.x = 1.2; hole.add(r);
      hole.position.set(x, y, z);
      hole.visible = false;
      holo.add(hole);
      this.mapHoles.push(hole);
    });
    const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(150,210,255,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
    beam.scale.set(1.4, 1.2, 1); beam.position.y = 0.4;
    m.add(beam);
    this.onUpdate((dt, t) => { holo.rotation.y = t * 0.2; this.mapHoles.forEach((h, i) => h.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.15)); });
    return m;
  }

  setDoor(open, animate = true) {
    this.doorOpen = open;
    const i = this.colliders.indexOf(this.doorCollider);
    if (open && i >= 0) this.colliders.splice(i, 1);
    if (!open && i < 0) this.colliders.push(this.doorCollider);
    const target = open ? -1.75 : 0;
    if (!animate) { this.doorPivot.rotation.y = target; return; }
    const from = this.doorPivot.rotation.y;
    this.game.tweens.tween(0.9, (k) => { this.doorPivot.rotation.y = from + (target - from) * k; });
  }

  // --- story ------------------------------------------------------------
  buildStory() {
    const game = this.game;
    const stage = () => game.state.story.stage;
    const name = () => game.state.nickname;
    const F = FLOOR;

    this.interact({ label: 'Talk', position: [-5.4, F, -2.6], radius: 2.4, markerHeight: 1.6, onInteract: () => this.talkMom() });
    this.interact({ label: 'Inspect', position: [-3.55, F, -3.7], radius: 1.8, markerHeight: 1.9, markerColor: '#9ff4ff', enabled: () => this.mode !== 'return', onInteract: () => this.inspectMachine() });
    this.interact({ label: 'Observe', position: [-7.5, F, -2.4], radius: 1.6, markerHeight: 2.2, marker: false,
      onInteract: () => game.talk([{ text: 'A photo from the lake, years ago. Mom is laughing so hard she can barely hold the camera.' }]) });
    this.interact({ label: 'Observe', position: [-5.4, F, -1.7], radius: 1.1, marker: false,
      onInteract: () => game.talk([{ text: 'Her hands are cold. You tuck the blanket around them.' }]) });
    this.interact({ label: 'Observe', position: [5.9, F, -3.8], radius: 1.4, marker: false,
      onInteract: () => game.talk([{ text: 'Her tea cup, still half full. She never lets a kettle go cold.' }]) });
    this.interact({ label: 'Observe', position: [2.7, F, -4.2], radius: 1.4, marker: false,
      onInteract: () => game.talk([{ text: 'Through the window the sky looks endless. Somewhere up there, a pale ring hangs in the daylight.' }]) });
    this.interact({ label: 'Observe', position: [5.6, F, -0.2], radius: 1.3, marker: false,
      onInteract: () => game.talk([{ text: 'Two chairs. It has been a long time since you both ate at this table.' }]) });
    this.interact({ label: 'Read Star Map', position: [0.8, F, 1.6], radius: 1.9, markerHeight: 1.4, enabled: () => stage() !== 'talk', onInteract: () => this.readMap() });
    this.interact({
      label: 'Open', position: [5.3, F, 5], radius: 1.6, markerHeight: 2.2,
      enabled: () => !this.doorOpen,
      onInteract: () => {
        if (stage() === 'talk') { game.hud.toast('I should check on Mom first.'); return; }
        if (stage() === 'map') { game.hud.toast('Dad\'s star map… I should look at it before I go.'); return; }
        game.audio.pick();
        this.setDoor(true);
      },
    });
    this.carIt = this.interact({ label: 'Enter Car', position: new THREE.Vector3(CAR_SPOT[0], 0, CAR_SPOT[1]), radius: 3.2, markerHeight: 3.1,
      enabled: () => !['talk', 'map'].includes(stage()) && this.mode !== 'return',
      onInteract: () => this.enterCar() });
    this.onUpdate(() => { this.carIt.position.copy(game.car.root.position); if (this.carIt.markerSprite) this.carIt.markerSprite.position.set(this.carIt.position.x, this.carIt.position.y + 3.1, this.carIt.position.z); });
    this.interact({ label: 'Insert Oxygen Cores', position: [-3.55, F, -3.6], radius: 1.9, markerHeight: 1.9, markerColor: '#9ff4ff',
      enabled: () => this.mode === 'return' && stage() !== 'done', onInteract: () => this.finale() });

    // roof visibility + little life
    this.onUpdate((dt, t) => {
      const p = game.control === 'walk' ? game.player.root.position : game.focus;
      const inside = this.inside(p);
      this.roof.visible = !inside || game.camMode === 'cine' && !this.roofHideCine;
      if (this.roofHideCine) this.roof.visible = false;
      this.machLight.material.color.set(Math.sin(t * (this.healed ? 1 : 5)) > 0 ? (this.healed ? '#9ff4ff' : '#ff5a4a') : '#5a2a2a');
      this.steam.material.opacity = this.healed ? 0.35 + Math.sin(t * 2) * 0.1 : 0;
      this.steam.position.y = FLOOR + 1.8 + (t * 0.4 % 0.6);
    });
  }

  waypoint() {
    const st = this.game.state.story.stage;
    const v = new THREE.Vector3();
    if (this.game.control === 'drive') return null;
    if (st === 'talk') return v.set(-5.4, 2, -2.8);
    if (st === 'map') return v.set(0.8, 1.6, 1.6);
    if (st === 'leave') return this.doorOpen ? this.game.car.root.position.clone().setY(this.game.car.root.position.y + 3) : v.set(5.3, 2.5, 5);
    if (st === 'machine') return v.set(-3.55, 2.2, -4.2);
    return null;
  }

  enter(opts) {
    const game = this.game;
    game.hud.setWorld('home');
    const st = game.state.story.stage;
    if (this.mode === 'return') {
      this.setDoor(true, false);
      this.gauge.scale.x = 0.08;
      game.addCar(...CAR_SPOT, Math.PI * 0.9);
      if (opts.resume || opts.arrival !== 'landing') {
        game.addPlayer(7.5, 13, Math.PI);
        if (st === 'done') { this.healScene(); this.placeDinner(false); }
        game.setControl('walk');
        if (st === 'home') game.story('machine');
        return;
      }
      return;
    }
    game.addCar(...CAR_SPOT, Math.PI * 0.9);
    if (['leave', 'space', 'cores'].includes(st)) this.setDoor(true, false);
    if (opts.resume && st !== 'talk') {
      game.addPlayer(-3.8, -1.5, Math.PI * 0.8);
      game.setControl('walk');
      return;
    }
    game.addPlayer(-3.9, -1.8, Math.PI * 0.75);
    this.intro();
  }

  // Wide shot of the tiny house under the huge sky → push in through the window.
  async intro() {
    const game = this.game;
    await game.cutscene(async () => {
      game.setShot([40, 30, 60], [0, 8, 0]);
      await game.tweens.wait(0.5);
      game.hud.fadeTo(0, 2.2);
      await game.shot({ pos: [40, 30, 60], look: [0, 12, -40] }, { pos: [18, 9, 26], look: [0, 3, 0] }, 6, Ease.sine);
      this.roofHideCine = true;
      await game.shot({ pos: [18, 9, 26], look: [0, 3, 0] }, { pos: [-2.5, 5.5, 2.5], look: [-5.2, 1.2, -3] }, 3.6, Ease.inOut);
      await game.tweens.wait(0.6);
      this.roofHideCine = false;
    });
    game.setControl('walk');
    game.cam.pitch = 0.75; game.cam.dist = 5.5;
    game.hud.hint('[WASD] Move · [Mouse] Look (click to lock) · [Shift] Run · [E] Interact');
  }

  async talkMom() {
    const game = this.game, st = game.state.story.stage, name = game.state.nickname;
    if (st === 'talk') {
      await game.talk([
        { text: 'The oxygen machine hums unevenly. Its gauge flickers near empty.' },
        { who: 'Mom', text: `${name}… you're still here? You should be sleeping.` },
        { who: 'Mom', text: 'Don\'t worry about me.' },
        { who: name, text: 'I\'ll find a way.' },
        { who: 'Mom', text: 'Your father\'s old star map is still on the living room table. He always said the answers were out there…' },
      ]);
      await game.hud.banner('MISSION 01 — FIND THE OXYGEN', 'Three distant worlds may hold what she needs', 3600);
      game.story('map');
    } else if (st === 'map' || st === 'leave') {
      await game.talk([{ who: 'Mom', text: st === 'map' ? 'The map… on the table. Go look.' : 'Be careful out there. And come back to me, okay?' }]);
    } else if (this.mode === 'return' && st !== 'done') {
      await game.talk([{ text: 'Her breathing is shallow. The machine needs the cores.' }]);
    } else {
      await game.talk([{ who: 'Mom', text: 'I\'m right here. Go on, the night is beautiful.' }]);
    }
  }

  async inspectMachine() {
    const game = this.game;
    if (this.mode === 'return') return;
    await game.talk([{ text: 'OXYGEN RESERVE: 7%. Three empty core slots blink, waiting.' }]);
  }

  async readMap() {
    const game = this.game, name = game.state.nickname;
    if (game.state.story.stage !== 'map') {
      await game.talk([{ text: 'Three dark stars: Farm World, Knowledge World, Hunger World.' }]);
      return;
    }
    await game.cutscene(async () => {
      this.mapHoles.forEach((h) => (h.visible = true));
      game.audio.chime();
      await game.shot(game.currentShot(), { pos: [2.3, 2.6, 3.3], look: [0.8, 1.1, 1.6] }, 1.6);
    });
    await game.talk([
      { text: 'The map flickers awake. Three dark stars pulse where no stars should be.' },
      { who: name, text: 'Black holes… and beside each one, in Dad\'s handwriting: "oxygen".' },
      { who: name, text: 'Farm World. Knowledge World. Hunger World.' },
      { who: name, text: 'Hold on, Mom. I\'m taking the car.' },
    ]);
    game.setControl('walk');
    game.state.story.starMap = true;
    game.story('leave');
    game.hud.toast('Leave through the front door');
  }

  async enterCar() {
    const game = this.game;
    game.audio.chime();
    game.playerHidden = true;
    game.setControl('drive');
    game.cam.dist = 6;
    game.hud.hint('[W/S] Drive · [A/D] Steer · [Space] Lift off into the sky');
    this.driveTime = 0;
    if (this.driveHooked) return;
    this.driveHooked = true;
    this.onUpdate((dt) => {
      if (game.control !== 'drive' || game.locks) return;
      this.driveTime += dt;
      if (this.driveTime > 0.5 && game.input.hit('Space')) {
        game.story('space');
        game.liftOff();
      }
      if (game.input.hit('KeyE') && Math.abs(game.vehicle.speed) < 1 && this.driveTime > 0.5) {
        const c = game.car.root.position;
        game.addPlayer(c.x + Math.cos(game.vehicle.yaw) * 2.2, c.z - Math.sin(game.vehicle.yaw) * 2.2, game.vehicle.yaw);
        game.setControl('walk');
      }
    });
  }

  // Called by the landing cinematic from space.
  async arriveHome() {
    const game = this.game;
    const [cx, cz] = CAR_SPOT;
    const gy = this.heightAt(cx, cz);
    game.car.setFlight(1);
    await game.cutscene(async () => {
      game.setShot([cx + 18, gy + 8, cz + 22], [cx, gy + 30, cz]);
      await game.tweens.tween(4.5, (k) => {
        game.car.root.position.set(cx, gy + (1 - k) * 60, cz - (1 - k) * 30);
        game.cine.look.set(cx, gy + (1 - k) * 60 + 1, cz - (1 - k) * 30);
        game.car.update(1 / 60, 10, 1 - k);
      }, Ease.out);
      await game.tweens.tween(1, (k) => game.car.setFlight(1 - k));
      game.addPlayer(cx - 2.2, cz, -Math.PI / 2);
      await game.shot(game.currentShot(), { pos: [cx - 8, gy + 3.5, cz + 7], look: [0, 2, 0] }, 2.5);
    });
    await game.hud.banner('HOME', 'The windows are glowing', 2600, 'thin');
    game.setControl('walk');
    game.story('machine');
  }

  healScene() {
    this.healed = true;
    this.gauge.scale.x = 1; this.gauge.material.color.set('#9ff4ff');
    this.slots.forEach((s) => s.material.color.set('#9ff4ff'));
    this.mom.calm = true;
    this.bedLamp.intensity = 12; this.diningLight.intensity = 12; this.livingLight.intensity = 9;
  }

  placeDinner(withPlayer = true) {
    const game = this.game;
    const [cx1, cz1, r1] = this.chairs[0], [cx2, cz2, r2] = this.chairs[1];
    this.mom.root.rotation.set(0, r2, 0);
    this.mom.root.position.set(cx2, FLOOR + 0.12, cz2 - 0.05);
    this.mom.setPose('sit');
    this.mom.forceClosed = false; this.mom.setEyesClosed(false);
    if (!this.bowls) {
      this.bowls = [];
      for (const z of [-0.9, -1.7]) {
        const b = mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon('#f5efe0', { side: THREE.DoubleSide }), 5.6, FLOOR + 1.12, z);
        const soup = mesh(new THREE.CircleGeometry(0.2, 14), toon('#f2a24e'), 5.6, FLOOR + 1.1, z, false);
        soup.rotation.x = -Math.PI / 2;
        const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,0.6)'), transparent: true, depthWrite: false, opacity: 0.35 }));
        st.position.set(5.6, FLOOR + 1.5, z); st.scale.setScalar(0.5);
        this.interior.add(b, soup, st);
        this.bowls.push(st);
      }
      this.onUpdate((dt, t) => this.bowls.forEach((s, i) => { s.position.y = FLOOR + 1.35 + ((t * 0.3 + i * 0.5) % 0.5); s.material.opacity = 0.4 * (1 - ((t * 0.3 + i * 0.5) % 0.5) * 2); }));
    }
    if (withPlayer) {
      const p = game.player.root;
      p.position.set(cx1, FLOOR + 0.12, cz1 + 0.05);
      p.rotation.set(0, r1, 0);
      game.controller.yaw = r1;
      game.player.setPose('sit');
    }
  }

  // Insert cores → machine wakes → Mom opens her eyes → dinner → wide shot.
  async finale() {
    const game = this.game, name = game.state.nickname;
    const F = FLOOR;
    await game.cutscene(async () => {
      game.setControl('none');
      await game.shot(game.currentShot(), { pos: [-2.2, F + 2.3, -2.2], look: [-3.55, F + 1.2, -4.2] }, 1.8);
      this.roofHideCine = true;
      const n = game.inventory.count('oxygenCore');
      for (let i = 0; i < 3; i++) {
        const core = makeCore(0.8);
        const from = game.player.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        const to = this.slots[i].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0));
        this.scene.add(core);
        await game.tweens.tween(1.0, (k) => { core.position.lerpVectors(from, to, k); core.position.y += Math.sin(k * Math.PI) * 0.6; core.rotation.y = k * 5; });
        this.scene.remove(core);
        this.slots[i].material.color.set('#9ff4ff');
        game.audio.chime();
        this.gauge.scale.x = 0.1 + (i + 1) * 0.3;
        if (i < n) game.inventory.take('oxygenCore', 1);
      }
      game.player.setCores(0);
      game.audio.reward();
      await game.hud.banner('OXYGEN CORE × 3', 'THE MACHINE WAKES', 2400, 'reward');
      // warm light floods the room
      const b0 = this.bedLamp.intensity;
      await game.tweens.tween(2.5, (k) => {
        this.bedLamp.intensity = b0 + k * 10;
        this.diningLight.intensity = 3 + k * 9;
        this.livingLight.intensity = 2 + k * 7;
        this.hemi.intensity = 1.0 + k * 0.4;
        this.hemi.color.lerp(new THREE.Color('#ffd8b0'), k * 0.05);
      });
      this.healScene();
      await game.shot(game.currentShot(), { pos: [-4.7, F + 1.9, -3.6], look: [-5.4, F + 1.1, -4.35] }, 2.4);
      await game.tweens.wait(1.2);
      this.mom.forceClosed = false;
      this.mom.setEyesClosed(false);
      game.audio.bell();
      await game.tweens.wait(1.0);
    });
    await game.talk([{ who: 'Mom', text: 'You came back.' }, { who: name, text: 'I promised I would.' }]);
    game.story('done');
    game.state.story.finale = true;
    game.save();

    await game.cutscene(async () => {
      await game.hud.fadeTo(1, 1.4);
      this.placeDinner(true);
      game.setShot([7.4, F + 2.4, -1.3], [5.6, F + 1.2, -1.3]);
      await cineText(game, 'Later that evening…', '', 1.2);
      await game.hud.fadeTo(0, 1.4);
    });
    await game.talk([
      { who: 'Mom', text: 'Eat, eat. You look like you crossed the whole sky.' },
      { who: name, text: 'I kind of did. There was a farmer, Oren — his fields floated under a ring of light. I helped him bring the harvest in.' },
      { who: name, text: 'Then a city of towers, full of books… and children living underneath who\'d never read one. I taught them a little.' },
      { who: name, text: 'And a village by a lake that reflected every star. They were so hungry. We fished together until the storehouse was full.' },
      { who: 'Mom', text: 'So you helped all of them… and that\'s how you saved me.' },
      { who: name, text: 'They gave the oxygen freely. I think helping them is what gave me the strength to keep going.' },
      { who: 'Mom', text: 'Then I\'m the luckiest mother in any world.' },
    ]);
    // Final wide shot out through the window: tiny home, enormous universe.
    await game.cutscene(async () => {
      this.roofHideCine = false;
      game.hud.show(false);
      // drift to the front window, out through the glass, then far back:
      // the tiny glowing house beneath the enormous sky.
      await game.shot({ pos: [7.4, F + 2.4, -1.3], look: [5.6, F + 1.2, -1.3] }, { pos: [1.2, F + 1.7, 3.6], look: [1.2, F + 1.8, 12] }, 3.2);
      await game.shot({ pos: [1.2, F + 1.7, 3.6], look: [1.2, F + 1.8, 12] }, { pos: [1.2, F + 2.2, 8], look: [0, F + 1.6, 0] }, 2.2);
      await game.shot({ pos: [1.2, F + 2.2, 8], look: [0, F + 1.6, 0] }, { pos: [6, 11, 34], look: [0, 16, -80] }, 8, Ease.sine);
      await game.hud.banner('HOME', 'Helping others gives us the strength to save the people we love.', 5000);
    });
    this.showEnding();
  }

  showEnding() {
    const game = this.game;
    const el = document.getElementById('ending');
    const st = game.state;
    const mins = Math.round(st.stats.playSeconds / 60);
    el.querySelector('.stats').textContent = `${st.nickname} · 3 worlds helped · ${mins} min journey`;
    el.classList.add('show');
    game.input.unlock();
    document.getElementById('btn-roam').onclick = () => {
      el.classList.remove('show');
      game.hud.show(true);
      game.player.setPose('stand');
      game.addPlayer(5.6, 1.2, 0);
      game.setControl('walk');
      game.hud.toast('Take your time. The night is yours.');
    };
    document.getElementById('btn-again').onclick = () => {
      import('../save/SaveSystem.js').then(({ SaveSystem }) => { SaveSystem.remove(st.nickname); location.reload(); });
    };
    st.story.endingSeen = true;
    game.save();
  }
}
