// WORLD 01 — FARM WORLD. Endless golden fields beneath a gigantic celestial ring.
// Mission: HARVEST DAY — harvest glowing sun-gourds, carry them to the cart.
import * as THREE from 'three';
import { World } from './base.js';
import {
  addLights, makeSky, makeClouds, makeTerrain, makeGrass, makeForest, makeMountain, makeRocks, makeFlowers,
  makeMotes, makeWater, toon, glowMat, glowSprite, box, cyl, sphere, paintMaterial,
} from '../world/kit.js';
import { makeCelestialRing, makeBlackHole } from '../world/cosmic.js';
import { makeNPC, buildCharacter } from '../systems/character.js';
import { boxCollider } from '../systems/physics.js';
import { fbm, mulberry32, smoothstep, clamp } from '../core/noise.js';
import { arrival, rewardCore, addReturnCar } from './common.js';
import * as D from '../world/details.js';

const FARMSTEAD = new THREE.Vector3(0, 0, 26);
const FIELDS = [new THREE.Vector3(-22, 0, -2), new THREE.Vector3(22, 0, 2)];
const CART = new THREE.Vector3(7, 0, 18);
const FARMER = new THREE.Vector3(3.5, 0, 15);

export default class FarmWorld extends World {
  constructor(game, id) {
    super(game, id);
    this.mood = 'farm';
    this.bloom = { strength: 0.45, radius: 0.6, threshold: 0.86 };
    this.grade = { vignette: 0.32, warmth: 0.12, saturation: 1.12, exposure: 1.02 };
  }

  terrainH(x, z) {
    const d = Math.hypot(x, z - 10);
    let h = smoothstep(40, 110, d) * (fbm(x * 0.01, z * 0.01, 4) * 18 + 6);
    h += fbm(x * 0.03 + 7, z * 0.03, 3) * 1.2 * smoothstep(8, 30, d);
    return h;
  }

  groundAt(x, z) { return Math.hypot(x, z - 10) > 170 ? null : this.terrainH(x, z); }

  async build() {
    const s = this.scene;
    const q = matchMedia('(pointer: coarse)').matches ? 0.4 : 1;
    const sunDir = new THREE.Vector3(-0.35, 0.62, 0.7).normalize();
    this.sunDir = sunDir;
    s.fog = new THREE.FogExp2('#c4dcec', 0.0008);
    this.lights = addLights(s, { sunDir, sunColor: '#fff0cc', sunIntensity: 2.8, sky: '#cfe6ff', ground: '#8aa050', hemi: 1.2 });
    this.add(makeSky({ top: '#1f5fbf', mid: '#4f9be6', horizon: '#cfe6f0', bottom: '#b8c8a8', sunDir, glow: '#ffe0a0', glowAmt: 0.35, cirrus: 0.45 }));

    // the gigantic celestial ring arching over the whole world
    const ring = makeCelestialRing({ inner: 2300, outer: 3150, opacity: 0.75 });
    ring.position.set(-300, -1100, 3400);
    ring.rotation.set(-0.12, 0.25, 0.22);
    this.add(ring);
    const ring2 = makeCelestialRing({ inner: 3250, outer: 3350, a: '#fff6e0', b: '#ffd9a0', c: '#f2703c', opacity: 0.5 });
    ring2.position.copy(ring.position);
    ring2.rotation.copy(ring.rotation);
    this.add(ring2);
    const bh = makeBlackHole({ size: 55, tilt: 0.4, dust: 500 });
    bh.position.set(2100, 1350, 3000);
    this.add(bh);

    this.add(makeClouds({ count: 30, seed: 5, sunDir, yMin: 90, yMax: 240, sMin: 20, sMax: 60, shadow: '#a8bcd8', rimColor: '#fff0c0' }));

    // floating islands of farmland drifting in the sky
    const rng = mulberry32(12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng();
      const r = 120 + rng() * 140;
      this.add(this.floatingIsland(Math.cos(a) * r, 45 + rng() * 60, 10 + Math.sin(a) * r, 8 + rng() * 10, rng));
    }

    // terrain + fields
    const green = [new THREE.Color('#5d9a3a'), new THREE.Color('#78b24a'), new THREE.Color('#4a8a36')];
    const soil = new THREE.Color('#8a6a45'), gold = new THREE.Color('#d9b458');
    this.add(makeTerrain({
      size: 520, seg: 200, cz: 10,
      heightAt: (x, z) => this.terrainH(x, z),
      colorAt: (x, z, h, c) => {
        const n = fbm(x * 0.025, z * 0.025, 3) * 0.5 + 0.5;
        c.copy(green[Math.floor(n * 2.99)]);
        for (const f of FIELDS) {
          const d = Math.hypot(x - f.x, z - f.z);
          if (d < 15) c.lerp(soil, smoothstep(15, 13, d) * (0.6 + 0.4 * Math.abs(Math.sin(d * 1.4))));
        }
        if (this.isWheat(x, z)) c.lerp(gold, 0.8);
      },
    }));
    const sample = (r, cx = 0, cz = 10, filter) => (rng2) => {
      const a = rng2() * Math.PI * 2, rr = Math.sqrt(rng2()) * r;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      return filter(x, z) ? [x, z] : null;
    };
    const open = (x, z) => !this.isWheat(x, z) && !this.nearFarm(x, z) && FIELDS.every((f) => Math.hypot(x - f.x, z - f.z) > 15) && Math.abs(x + 6) > 1.5;
    this.grass = this.add(makeGrass({ count: Math.floor(42000 * q), sample: sample(75, 0, 10, open), heightAt: (x, z) => this.terrainH(x, z), base: '#3b7a2c', tip: '#c2de6a', h: [0.3, 0.8], sunDir }));
    this.wheat = this.add(makeGrass({ count: Math.floor(60000 * q), sample: sample(150, 0, 10, (x, z) => this.isWheat(x, z)), heightAt: (x, z) => this.terrainH(x, z), base: '#9a6a28', tip: '#ffd982', h: [0.9, 1.5], w: 0.07, head: true, seed: 17, wind: 1.6, patch: 0.15, sunDir }));
    s.add(makeFlowers({ count: Math.floor(1800 * q), sample: sample(80, 0, 10, open), heightAt: (x, z) => this.terrainH(x, z), colors: ['#ffffff', '#ffd23f', '#ff8c5a', '#c79bff'] }));

    // decorative crops in geometric rings — abundance
    const cab = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 1), paintMaterial({ lit: '#b6e07a', shadow: '#3d7a3a', sunDir, rim: 0.3 }), 900);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (const f of FIELDS) {
      for (let ring = 0; ring < 6; ring++) {
        const r = 3 + ring * 2;
        const cnt = Math.floor(r * 4.2);
        for (let i = 0; i < cnt && n < 900; i++) {
          const a = (i / cnt) * Math.PI * 2 + ring * 0.3;
          const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
          if (ring % 2 === 1) continue;
          m4.makeScale(1, 0.75, 1).setPosition(x, this.terrainH(x, z) + 0.18, z);
          cab.setMatrixAt(n++, m4);
        }
      }
    }
    cab.count = n;
    cab.castShadow = true;
    s.add(cab);

    // irrigation channels
    for (const [x, z, w, d] of [[-6, 0, 1.6, 90], [0, -18, 70, 1.4]]) {
      const water = makeWater({ w, h: d, deep: '#3b8fb0', shallow: '#8fe0e6', sky: '#dff2fa', sunDir, opacity: 0.9 });
      water.position.set(x, 0.08, z);
      this.add(water);
      const bank = box(w + 0.4, 0.12, d + 0.4, '#7a6a4a', x, 0.0, z);
      bank.receiveShadow = true;
      s.add(bank);
    }

    const trees = [];
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2, r = 60 + rng() * 110;
      const x = Math.cos(a) * r, z = 10 + Math.sin(a) * r;
      if (this.isWheat(x, z) && rng() < 0.8) continue;
      trees.push({ x, z, y: this.terrainH(x, z) - 0.2, s: 1 + rng(), kind: rng() < 0.3 ? 'pine' : 'round', palette: rng() < 0.3 ? 'spring' : 'meadow' });
    }
    trees.push({ x: -30, z: 34, y: this.terrainH(-30, 34), s: 1.4, kind: 'giant', palette: 'spring' });
    trees.push({ x: 40, z: -30, y: this.terrainH(40, -30), s: 1.1, kind: 'giant', palette: 'meadow' });
    this.add(makeForest(trees, { sunDir, seed: 4 }));
    const rocks = [];
    for (let i = 0; i < 25; i++) { const x = (rng() - 0.5) * 160, z = 10 + (rng() - 0.5) * 160; if (open(x, z) && Math.hypot(x, z - 10) > 30) rocks.push({ x, z, y: this.terrainH(x, z), s: 0.4 + rng() * 1.2 }); }
    this.add(makeRocks(rocks));

    for (const m of [
      { x: -500, z: -520, r: 320, h: 380, seed: 3.3, snow: 0.66 }, { x: 150, z: -700, r: 380, h: 480, seed: 1.9, snow: 0.6 },
      { x: 620, z: -380, r: 280, h: 320, seed: 6.1, snow: 0.7 }, { x: -700, z: 200, r: 260, h: 260, seed: 9.4, snow: 0.78 },
      { x: 600, z: 480, r: 300, h: 240, seed: 2.2, snow: 0.8 },
    ]) s.add(makeMountain({ ...m, y: -10, forest: '#3f6a44', rock: '#7a92b8' }));

    this.add(makeMotes({ count: 500, center: new THREE.Vector3(0, 0, 10), spread: new THREE.Vector3(120, 14, 120), color: '#ffe7a0', size: 6, opacity: 0.8 }));

    this.buildFarmstead();
    this.buildCrops();
    this.buildSheep(rng);
    this.decorate(q);
  }

  decorate(q) {
    const s = this.scene, sunDir = this.sunDir;
    const H = (x, z) => this.terrainH(x, z);
    const free = (x, z) => !this.nearFarm(x, z) && FIELDS.every((f) => Math.hypot(x - f.x, z - f.z) > 17) && Math.abs(x + 6) > 2.5 && Math.abs(z + 18) > 2.5;
    const area = (r0, r1, filt = free) => (rng) => { const a = rng() * 6.28, r = r0 + rng() * (r1 - r0); const x = Math.cos(a) * r, z = 10 + Math.sin(a) * r; return filt(x, z) && !this.isWheat(x, z) ? [x, z] : null; };

    // fences circling the crop fields, open toward the farmstead
    for (const f of FIELDS) {
      const pts = [];
      const gap = Math.atan2(FARMSTEAD.z - f.z, FARMSTEAD.x - f.x);
      for (let i = 0; i <= 18; i++) {
        const a = gap + 0.45 + (i / 18) * (Math.PI * 2 - 0.9);
        pts.push([f.x + Math.cos(a) * 16, f.z + Math.sin(a) * 16]);
      }
      s.add(D.fence(pts, H, { color: '#d9c7a4', spacing: 2.6 }));
      this.add(D.scarecrow(f.x, H(f.x, f.z), f.z, gap + Math.PI / 2));
    }
    // sunflower rows along the irrigation channel
    const sf = [];
    for (let z = -40; z < 42; z += 1.3) {
      if (Math.abs(z + 18) < 3 || Math.abs(z - 10) < 3) continue;
      for (const x of [-8.3, -3.7]) if (!this.nearFarm(x, z)) sf.push({ x: x + Math.sin(z) * 0.2, y: H(x, z), z, s: 0.85 + ((z * 7) % 3) * 0.1, ry: 0.4 });
    }
    s.add(D.makeSunflowers(sf));
    // plank bridge over the channel
    const bridge = new THREE.Group();
    for (let i = 0; i < 7; i++) bridge.add(box(0.36, 0.1, 2.6, '#9a6b45', -7.1 + i * 0.37, 0.28, 10));
    for (const z of [8.8, 11.2]) bridge.add(box(2.8, 0.08, 0.08, '#6b4b33', -6, 0.75, z));
    s.add(bridge);

    // farmstead life
    for (let i = 0; i < 4; i++) this.add(D.beehive(-18 + i * 1.6, H(-18 + i * 1.6, 19), 19));
    this.add(D.well(20, H(20, 21), 21));
    this.add(D.barrel(-2.5, H(-2.5, 31), 31, 1), D.barrel(-1.6, H(-1.6, 31.6), 31.6, 0.9));
    this.add(D.crate(-3, H(-3, 29.5), 29.5, 0.8, 0.3), D.crate(-3.1, H(-3.1, 29.5) + 0.8, 29.5, 0.6, 0.8));
    for (let i = 0; i < 5; i++) {
      const c = D.crate(9.5 + (i % 3) * 0.95, H(10, 18), 16.8 + Math.floor(i / 3) * 0.95, 0.8, i);
      for (let k = 0; k < 4; k++) c.add(sphere(0.15, i % 2 ? '#f28a3c' : '#9ad05a', -0.2 + (k % 2) * 0.4, 0.45, -0.2 + Math.floor(k / 2) * 0.4));
      this.add(c);
    }
    this.colliders.push({ type: 'box', minX: 9, maxX: 12.4, minZ: 16.3, maxZ: 18.5 });
    this.add(D.woodpile(14, H(14, 33), 33));
    this.add(D.makeChickens({ count: 8, area: { x0: -1, x1: 8, z0: 20, z1: 24 }, heightAt: H, seed: 4 }));
    this.add(D.laundryLine(14, 26, 20, 26, H));
    s.add(D.stringLights(new THREE.Vector3(-3.5, 5.2, 28), new THREE.Vector3(7, 3.3, 29), { bulbs: 12 }));
    for (const [x, z] of [[-3, -22], [-3, -8], [-3, 6]]) this.add(D.lampPost(x, H(x, z), z));
    this.add(D.signpost(-1.5, H(-1.5, -26), -26, 0.3, ['FARM', 'MILL']));

    // ground cover and life
    this.add(D.makeBushes(D.samplePoints(Math.floor(110 * q), area(20, 110), H, 21), { sunDir, palette: ['#4f8f3e', '#6aab4a', '#86c05a'] }));
    s.add(D.makeFerns(D.samplePoints(Math.floor(120 * q), area(25, 100), H, 22)));
    s.add(D.makeMushrooms(D.samplePoints(40, (r) => { const a = r() * 6.28, rr = 3 + r() * 9; const t = r() < 0.5 ? [-30, 34] : [40, -30]; return [t[0] + Math.cos(a) * rr, t[1] + Math.sin(a) * rr]; }, H, 23)));
    s.add(D.makePebbles(D.samplePoints(200, area(5, 60), H, 24)));
    this.add(D.makeButterflies({ count: 44, center: new THREE.Vector3(0, 0, 8), radius: 45, heightAt: H, colors: ['#ffffff', '#ffd23f', '#f2703c', '#8fd0ff'] }));
    this.add(D.makeBirds({ count: 16, center: new THREE.Vector3(10, 70, 20), radius: 130 }));
    this.add(D.makeBirds({ count: 9, center: new THREE.Vector3(-60, 48, -40), radius: 70, seed: 3 }));
  }

  isWheat(x, z) {
    const d = Math.hypot(x, z - 10);
    if (d < 38 || d > 150) return false;
    const a = Math.atan2(z - 10, x);
    return Math.sin(a * 3 + d * 0.02) > -0.3 || (z > 50);
  }

  nearFarm(x, z) { return Math.abs(x - FARMSTEAD.x) < 22 && Math.abs(z - FARMSTEAD.z) < 16; }

  floatingIsland(x, y, z, r, rng) {
    const g = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.8, 9, 3), toon('#8a7a66'));
    rock.rotation.x = Math.PI;
    rock.position.y = -r * 0.9;
    g.add(rock);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r, r * 0.25, 14), toon('#79b24a'));
    g.add(top);
    const field = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, r * 0.26, 14), toon('#e0bc5a'));
    field.position.y = 0.02;
    field.scale.set(0.6, 1, 1);
    g.add(field);
    const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.35, 1), paintMaterial({ lit: '#8cc152', shadow: '#3f6a4a', sunDir: this.sunDir }));
    tree.position.set(r * 0.5, r * 0.4, 0);
    g.add(tree);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.15, r * 3), new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    fall.position.set(-r * 0.7, -r * 1.5, 0);
    g.add(fall);
    g.position.set(x, y, z);
    g.rotation.y = rng() * 6;
    const base = y, ph = rng() * 6;
    g.userData.update = (t) => { g.position.y = base + Math.sin(t * 0.3 + ph) * 1.5; };
    return g;
  }

  buildFarmstead() {
    const s = this.scene;
    const F = FARMSTEAD;
    const add = (m) => { s.add(m); return m; };
    // barn with gambrel roof
    const barn = new THREE.Group();
    barn.position.set(F.x - 8, 0, F.z + 2);
    barn.add(box(9, 5, 7, '#b8452e', 0, 2.5, 0));
    for (const x of [-4.55, 4.55]) barn.add(box(0.15, 5, 7.1, '#f1e6cf', x, 2.5, 0));
    const r1 = box(9.6, 0.25, 4.2, '#5a4a44', 0, 5.9, 1.9); r1.rotation.x = 0.55; barn.add(r1);
    const r2 = box(9.6, 0.25, 4.2, '#5a4a44', 0, 5.9, -1.9); r2.rotation.x = -0.55; barn.add(r2);
    barn.add(box(3.2, 3.6, 0.2, '#8a2f22', 0, 1.8, 3.55));
    const x1 = box(0.15, 4.6, 0.1, '#f1e6cf', 0, 1.8, 3.68); x1.rotation.z = 0.7; barn.add(x1);
    const x2 = x1.clone(); x2.rotation.z = -0.7; barn.add(x2);
    barn.add(box(1.4, 1.1, 0.2, '#f1e6cf', 0, 4.4, 3.55));
    add(barn);
    this.colliders.push(boxCollider(barn.position.x, barn.position.z, 9.2, 7.2));
    // silo
    const silo = new THREE.Group();
    silo.position.set(F.x - 15, 0, F.z + 1);
    silo.add(cyl(1.8, 1.8, 9, '#dcd3c2', 0, 4.5, 0));
    silo.add(sphere(1.85, '#8fa3b8', 0, 9, 0));
    for (let i = 1; i < 5; i++) silo.add(cyl(1.83, 1.83, 0.12, '#a89c88', 0, i * 1.9, 0));
    add(silo);
    this.colliders.push({ type: 'circle', x: silo.position.x, z: silo.position.z, r: 2 });
    // farmhouse
    const house = new THREE.Group();
    house.position.set(F.x + 10, 0, F.z + 3);
    house.add(box(6, 3.2, 5, '#efe3cb', 0, 1.6, 0));
    const hr1 = box(6.6, 0.2, 3.3, '#3f6fa8', 0, 3.9, 1.3); hr1.rotation.x = 0.6; house.add(hr1);
    const hr2 = box(6.6, 0.2, 3.3, '#3f6fa8', 0, 3.9, -1.3); hr2.rotation.x = -0.6; house.add(hr2);
    house.add(box(1.1, 2, 0.1, '#7a4f33', 0, 1, 2.55));
    for (const x of [-1.8, 1.8]) house.add(box(1, 0.9, 0.1, null, x, 1.9, 2.55, glowMat('#ffe0a0', 1.3)));
    add(house);
    this.colliders.push(boxCollider(house.position.x, house.position.z, 6.2, 5.2));
    // windmill
    const mill = new THREE.Group();
    mill.position.set(F.x - 26, this.terrainH(F.x - 26, F.z - 6), F.z - 6);
    mill.add(cyl(1.3, 2.4, 11, '#e8dcc4', 0, 5.5, 0, 10));
    const millCap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 10), toon('#a9203e'));
    millCap.position.y = 12.2;
    mill.add(millCap);
    const hub = new THREE.Group();
    hub.position.set(0, 10.8, 1.6);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      arm.add(box(0.25, 6.5, 0.1, '#6b4b33', 0, 3.3, 0));
      arm.add(box(1.2, 5, 0.05, '#f5efe4', 0.7, 3.8, 0.05));
      hub.add(arm);
    }
    mill.add(hub);
    mill.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    add(mill);
    this.animate((t) => (hub.rotation.z = t * 0.6));
    this.colliders.push({ type: 'circle', x: mill.position.x, z: mill.position.z, r: 2.5 });
    // futuristic wind turbines on the ridge
    for (let i = 0; i < 4; i++) {
      const tx = -80 + i * 55, tz = -110 - (i % 2) * 20;
      const tur = new THREE.Group();
      tur.position.set(tx, this.terrainH(tx, tz), tz);
      tur.add(cyl(0.5, 0.9, 34, '#f5f1ea', 0, 17, 0, 10));
      const rot = new THREE.Group();
      rot.position.set(0, 34, 1.2);
      for (let b = 0; b < 3; b++) {
        const bl = box(0.8, 16, 0.2, '#f5f1ea', 0, 8, 0);
        const pivot = new THREE.Group();
        pivot.rotation.z = (b * Math.PI * 2) / 3;
        pivot.add(bl);
        rot.add(pivot);
      }
      rot.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), glowMat('#f2703c', 1.6)));
      tur.add(rot);
      add(tur);
      this.animate((t) => (rot.rotation.z = t * 0.35 + i));
    }
    // hay bales, fence, cart
    for (let i = 0; i < 6; i++) {
      const b = cyl(0.8, 0.8, 1.3, '#e6c36a', F.x - 3 + (i % 3) * 1.8, 0.8, F.z - 6 - Math.floor(i / 3) * 2);
      b.rotation.z = Math.PI / 2;
      add(b);
    }
    this.colliders.push(boxCollider(F.x - 1.2, F.z - 7, 6, 4));
    for (let i = 0; i < 14; i++) add(box(0.12, 1, 0.12, '#e8dcc4', F.x - 20 + i * 3, 0.5 + this.terrainH(F.x - 20 + i * 3, F.z - 14), F.z - 14));
    const cart = (this.cart = new THREE.Group());
    cart.position.copy(CART).setY(this.terrainH(CART.x, CART.z));
    cart.add(box(2.6, 0.9, 1.6, '#9a6b45', 0, 0.95, 0));
    for (const [x, z] of [[-1, 0.9], [1, 0.9], [-1, -0.9], [1, -0.9]]) {
      const w = cyl(0.45, 0.45, 0.12, '#5b4331', x, 0.45, z);
      w.rotation.x = Math.PI / 2;
      cart.add(w);
    }
    cart.add(box(1.6, 0.08, 0.08, '#6b4b33', 2.1, 0.8, 0));
    this.cartLoad = [];
    for (let i = 0; i < 24; i++) {
      const c = this.gourd(0.8);
      c.position.set(-1 + (i % 6) * 0.4, 1.35 + Math.floor(i / 12) * 0.25, -0.5 + (Math.floor(i / 6) % 2) * 0.55);
      c.visible = false;
      cart.add(c);
      this.cartLoad.push(c);
    }
    add(cart);
    this.colliders.push({ type: 'circle', x: CART.x, z: CART.z, r: 1.4 });

    // people
    const c = this.game.content.npcs;
    this.farmer = makeNPC(this, { gender: 'male', top: '#6f8f5a', bottom: '#4a5a78', hair: '#6d5a4a', skin: '#e3b58e', hat: true, beard: true, apron: '#c9b48a', position: FARMER.clone().setY(this.terrainH(FARMER.x, FARMER.z)), yaw: -2.4 });
    this.farmerName = c.farmer.name;
    makeNPC(this, { gender: 'female', top: '#c96a4a', bottom: '#efe6d8', hair: '#3a2a20', skin: '#f0c8a0', hat: '#f0d890', position: new THREE.Vector3(-20, this.terrainH(-20, 12), 12), yaw: 0.6, phase: 2 });
    makeNPC(this, { gender: 'male', child: true, top: '#5d93c9', bottom: '#3d4358', hair: '#2a1b17', position: new THREE.Vector3(12, this.terrainH(12, 12), 12), yaw: -0.8, phase: 4 });
  }

  gourd(scale = 1) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.3, 16, 12);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.cos(a * 8) * 0.06;
      p.setXYZ(i, x * k, p.getY(i) * 0.78, z * k);
    }
    geo.computeVertexNormals();
    const body = new THREE.Mesh(geo, toon('#f28a3c', { emissive: '#7a2a08', emissiveIntensity: 0.35 }));
    body.castShadow = true;
    g.add(body);
    const stem = cyl(0.03, 0.05, 0.15, '#5a7a3a', 0, 0.28, 0);
    g.add(stem);
    g.scale.setScalar(scale);
    return g;
  }

  buildCrops() {
    const g = this.game, M = g.missions;
    const def = g.content.missions.harvest_day;
    const total = Math.max(16, def.required + 4);
    const st = M.get('harvest_day');
    const harvested = new Set(st?.data?.harvested || []);
    this.crops = [];
    const leafMat = paintMaterial({ lit: '#9ad05a', shadow: '#3f7a3a', sunDir: this.sunDir });
    for (let i = 0; i < total; i++) {
      const f = FIELDS[i % 2];
      const k = Math.floor(i / 2);
      const per = Math.ceil(total / 2);
      const ringR = k % 2 === 0 ? 5 : 9;
      const a = (k / per) * Math.PI * 2 + (i % 2) * 0.4;
      const x = f.x + Math.cos(a) * ringR, z = f.z + Math.sin(a) * ringR;
      const y = this.terrainH(x, z);
      const crop = this.gourd(1.3);
      crop.position.set(x, y + 0.25, z);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), leafMat);
      leaf.scale.set(1.4, 0.3, 1);
      leaf.position.set(0.2, -0.12, 0.1);
      crop.add(leaf);
      const glow = glowSprite('#ffb060', 1.6, 0.5);
      crop.add(glow);
      this.scene.add(crop);
      const item = { id: i, obj: crop, glow, taken: harvested.has(i) };
      crop.visible = !item.taken;
      this.crops.push(item);
      this.animate((t) => { if (!item.taken) { glow.material.opacity = 0.35 + Math.sin(t * 2 + i) * 0.15; crop.rotation.y = Math.sin(t * 0.8 + i) * 0.1; } });
    }
  }

  buildSheep(rng) {
    const wool = paintMaterial({ lit: '#ffffff', shadow: '#b8c0d8', sunDir: this.sunDir, rim: 0.5 });
    for (let i = 0; i < 7; i++) {
      const sh = new THREE.Group();
      for (let j = 0; j < 5; j++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), wool);
        puff.position.set((j - 2) * 0.18, 0.75 + (j % 2) * 0.1, (j % 2 ? 0.12 : -0.12));
        puff.castShadow = true;
        sh.add(puff);
      }
      sh.add(sphere(0.2, '#2a2420', 0.62, 0.8, 0));
      for (const [x, z] of [[-0.3, 0.15], [0.3, 0.15], [-0.3, -0.15], [0.3, -0.15]]) sh.add(cyl(0.04, 0.04, 0.5, '#2a2420', x, 0.25, z));
      let x = 30 + rng() * 25, z = 30 + rng() * 25;
      sh.position.set(x, this.terrainH(x, z), z);
      this.scene.add(sh);
      let tx = x, tz = z, wait = rng() * 5;
      this.animate((t, _c, _p, dt) => {
        wait -= dt;
        if (wait <= 0) { tx = 25 + Math.random() * 35; tz = 25 + Math.random() * 35; wait = 4 + Math.random() * 6; }
        const dx = tx - sh.position.x, dz = tz - sh.position.z, d = Math.hypot(dx, dz);
        if (d > 0.3) {
          sh.position.x += (dx / d) * dt * 0.8;
          sh.position.z += (dz / d) * dt * 0.8;
          sh.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
        }
        sh.position.y = this.terrainH(sh.position.x, sh.position.z) + (d > 0.3 ? Math.abs(Math.sin(t * 8)) * 0.05 : 0);
      });
    }
  }

  async enter(opts) {
    const g = this.game, M = g.missions;
    this.setupInteractions();
    this.updateCart();
    await arrival(this, {
      car: { x: -2, z: -34, yaw: 0 }, player: { x: 1, z: -31, yaw: 0.1 },
      from: new THREE.Vector3(-60, 90, -120), to: new THREE.Vector3(-12, 16, -58), look: new THREE.Vector3(0, 30, 20), ms: opts.resume ? 3000 : 8000,
    });
    if (!M.get('harvest_day')) {
      M.start('harvest_day', { harvested: [] });
      g.hud.hint('Find the <b>farmer</b> by the barn', 8000);
    }
    this.refreshMarkers();
  }

  refreshMarkers() {
    const g = this.game, M = g.missions;
    g.markers.clear();
    const step = M.step('harvest_day');
    const head = () => this.farmer.group.position.clone().add(new THREE.Vector3(0, 2.2, 0));
    if (M.status('harvest_day') === 'complete') { g.markers.set('car', () => g.vehicle.position.clone().add(new THREE.Vector3(0, 2, 0))); return; }
    if (step === 0 || step === 2) g.markers.set('farmer', head);
    else if (step === 1) {
      const inv = g.save.state.inventory, def = g.content.missions.harvest_day;
      const delivered = M.count('harvest_day', 'delivered');
      if (inv.crops > 0 && (inv.crops >= def.carry || delivered + inv.crops >= def.required)) g.markers.set('cart', CART.clone().setY(2.2));
      else {
        this.crops.filter((c) => !c.taken).slice(0, 3).forEach((c) => g.markers.set('crop' + c.id, c.obj.position.clone().add(new THREE.Vector3(0, 0.6, 0)), { size: 0.03 }));
        if (inv.crops > 0) g.markers.set('cart', CART.clone().setY(2.2), { size: 0.03 });
      }
    }
  }

  setupInteractions() {
    const g = this.game, M = g.missions, I = g.interactions;
    const def = g.content.missions.harvest_day;
    const walking = () => g.mode === 'walk';
    I.add({ pos: () => this.farmer.group.position, radius: 2.6, label: `Talk to ${this.farmerName}`, enabled: walking, action: () => this.talkFarmer() });
    for (const c of this.crops) {
      I.add({
        pos: c.obj.position, radius: 1.6, label: () => (g.save.state.inventory.crops >= def.carry ? 'Basket full — deliver to the cart' : 'Harvest'),
        enabled: () => walking() && !c.taken && M.step('harvest_day') === 1,
        action: () => this.harvest(c),
      });
    }
    I.add({
      pos: CART, radius: 2.8, label: () => `Deliver ${g.save.state.inventory.crops} crops`,
      enabled: () => walking() && g.save.state.inventory.crops > 0,
      action: () => this.deliver(),
    });
    addReturnCar(this);
  }

  async talkFarmer() {
    const g = this.game, M = g.missions;
    const npc = g.content.npcs.farmer, name = npc.name;
    const def = g.content.missions.harvest_day;
    const fp = this.farmer.group.position;
    const cam = { pos: fp.clone().add(new THREE.Vector3(-2.6, 2.2, 2.6)), target: fp.clone().add(new THREE.Vector3(0, 1.5, 0)), ms: 1200 };
    const step = M.step('harvest_day');
    if (M.status('harvest_day') === 'complete') {
      await g.dialogue.say([{ who: name, text: 'Safe travels, friend. Tell your mother the fields send their love.', cam }]);
    } else if (step === 0) {
      await g.dialogue.say([
        { who: name, text: 'Well now. Not every day someone falls out of the sky and into my wheat.', cam },
        { who: 'player', text: 'I\'m looking for oxygen. My mother can\'t breathe on her own.' },
        { who: name, text: npc.greet },
        {
          who: name, text: `The sun-gourds glow when they\'re ripe. Bring ${def.required} to the cart by the barn — your basket holds ${def.carry}.`,
          choices: [{ text: 'I\'ll do it.', value: 1 }, { text: 'Why do they glow?', value: 2 }],
        },
      ]).then(async (v) => {
        if (v === 2) await g.dialogue.say([{ who: name, text: 'Ask the ring up there. It\'s been lighting this soil longer than my family\'s been farming it.' }]);
      });
      M.setStep('harvest_day', 1);
      g.audio.sfx('mission');
      g.overlay.banner('Mission', g.content.missions.harvest_day.title, g.content.missions.harvest_day.description, 3200);
    } else if (step === 1) {
      await g.dialogue.say([{ who: name, text: `${Math.max(0, def.required - M.count('harvest_day', 'delivered'))} more to go. The cart\'s right behind me.`, cam }]);
    } else if (step === 2) {
      await g.dialogue.say([
        { who: name, text: 'Look at that cart. Haven\'t seen it that full since my father\'s time.', cam },
        { who: name, text: npc.thanks },
      ]);
      g.cine.release();
      await rewardCore(this, { pos: FIELDS[0].clone().setY(this.terrainH(FIELDS[0].x, FIELDS[0].z) + 0.5), camFrom: FIELDS[0].clone().add(new THREE.Vector3(9, 4, 12)), missionId: 'harvest_day' });
      M.setStep('harvest_day', 3);
    }
    g.cine.release();
    this.refreshMarkers();
  }

  harvest(c) {
    const g = this.game, M = g.missions, def = g.content.missions.harvest_day;
    const inv = g.save.state.inventory;
    if (inv.crops >= def.carry) { g.overlay.toast('Your basket is full'); g.audio.sfx('fail'); return; }
    c.taken = true;
    const st = M.get('harvest_day');
    st.data.harvested = [...(st.data.harvested || []), c.id];
    M.give('crops', 1);
    g.audio.sfx('harvest');
    const o = c.obj, y0 = o.position.y;
    g.tween(500, (k) => { o.position.y = y0 + k * 1.2; o.scale.setScalar(1.3 * (1 - k)); }, g.ease.in).then(() => (o.visible = false));
    g.player.model.setCarry(Math.min(6, inv.crops), '#f28a3c');
    this.refreshMarkers();
  }

  deliver() {
    const g = this.game, M = g.missions, def = g.content.missions.harvest_day;
    const inv = g.save.state.inventory;
    const n = inv.crops;
    const total = M.add('harvest_day', 'delivered', n);
    M.give('crops', -n);
    g.player.model.setCarry(0);
    g.audio.sfx('deliver');
    g.overlay.toast(`${Math.min(total, def.required)} / ${def.required} delivered`);
    this.updateCart();
    if (total >= def.required && M.step('harvest_day') === 1) {
      M.setStep('harvest_day', 2);
      g.overlay.toast('Harvest complete — speak with ' + this.farmerName, 3000);
    }
    this.refreshMarkers();
  }

  updateCart() {
    const n = this.game.missions.count('harvest_day', 'delivered');
    this.cartLoad.forEach((c, i) => (c.visible = i < n * 2));
    this.game.player.model?.setCarry(Math.min(6, this.game.save.state.inventory.crops), '#f28a3c');
  }

  update(dt, t) {
    super.update(dt, t);
    const g = this.game;
    const p = this.focus();
    this.lights.follow(p);
    this.grass.userData.update(t, null, g.player.position);
    this.wheat.userData.update(t, null, g.player.position);
  }

  exit() { this.game.player.model.setCarry(0); }
}
