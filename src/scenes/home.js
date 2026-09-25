// HOME WORLD — a small, warm cottage in a wide painted meadow beneath an enormous sky.
// Opening: Mother, the oxygen machine, the mission. Finale: the cores, the table, the sky.
import * as THREE from 'three';
import { World } from './base.js';
import {
  addLights, makeSky, makeClouds, makeTerrain, makeGrass, makeForest, makeMountain, makeRocks, makeFlowers,
  makeMotes, toon, glowMat, glowSprite, box, cyl, sphere, canvasTexture, paintMaterial,
} from '../world/kit.js';
import { makePlanet, makeCelestialRing, makeBlackHole } from '../world/cosmic.js';
import { buildWall, gableRoof, plankTexture, texturedBox } from '../world/props.js';
import { buildCharacter } from '../systems/character.js';
import { boxCollider } from '../systems/physics.js';
import { fbm, mulberry32, smoothstep, distToPath, clamp } from '../core/noise.js';
import { wait } from '../ui/overlay.js';
import * as D from '../world/details.js';

const FLOOR = 0.15;
const HOUSE = { x0: -7, x1: 7, z0: -5, z1: 5 };
const PATH = [[0, 5.6], [0, 14], [1, 24], [7, 44], [22, 70], [30, 105], [18, 150]];
const CAR_SPOT = new THREE.Vector3(1.2, 0, 21);

const DAY = { top: '#2462bf', mid: '#4f97e0', horizon: '#cfe6f2', bottom: '#9ab8c8', sun: '#fff4d8', glow: '#ffe2b0', fog: '#bcd6ea', hemiSky: '#bfdcff', hemiGround: '#6d8f4a', sunInt: 2.7 };
const DUSK = { top: '#1d2f6b', mid: '#5a5aa0', horizon: '#ffb27a', bottom: '#6a4a5a', sun: '#ffcf8a', glow: '#ff9a5a', fog: '#d9a58a', hemiSky: '#ffc9a0', hemiGround: '#5a4a3a', sunInt: 2.2 };

export default class HomeWorld extends World {
  constructor(game, id) {
    super(game, id);
    this.mood = 'home';
    this.camMax = 8;
    this.doorOpen = false;
    this.inside = false;
  }

  groundAt(x, z) {
    if (Math.hypot(x, z - 10) > 175) return null;
    if (x > HOUSE.x0 - 0.05 && x < HOUSE.x1 + 0.05 && z > HOUSE.z0 - 0.05 && z < HOUSE.z1 + 0.05) return FLOOR;
    if (Math.abs(x) < 1.1 && z >= 5 && z < 6.4) return FLOOR * 0.5; // porch step
    return this.terrainH(x, z);
  }

  terrainH(x, z) {
    const d = Math.max(Math.abs(x) / 1.3, Math.abs(z - 8) / 1.1);
    const w = smoothstep(12, 45, d);
    let h = w * (fbm(x * 0.011 + 3, z * 0.011, 4) * 10 + fbm(x * 0.05, z * 0.05, 2) * 1.5 + 3);
    h += smoothstep(30, 200, -z) * 28 * (0.6 + 0.4 * fbm(x * 0.02, z * 0.02, 2));
    const pd = distToPath(x, z, PATH);
    h *= 1 - smoothstep(5, 1.5, pd) * 0.35;
    return h;
  }

  async build(opts = {}) {
    const g = this.game, s = this.scene;
    const st = g.save.state;
    this.returning = st.inventory.oxygenCore >= 3 && st.stage !== 'complete';
    this.completed = st.stage === 'complete';
    const P = this.returning || this.completed ? DUSK : DAY;
    this.palette = P;
    const q = matchMedia('(pointer: coarse)').matches ? 0.4 : 1;

    const sunDir = this.returning || this.completed ? new THREE.Vector3(-0.55, 0.2, 0.8).normalize() : new THREE.Vector3(0.45, 0.72, 0.53).normalize();
    this.sunDir = sunDir;
    s.fog = new THREE.FogExp2(P.fog, 0.0011);
    this.lights = addLights(s, { sunDir, sunColor: P.sun, sunIntensity: P.sunInt, sky: P.hemiSky, ground: P.hemiGround, hemi: 1.15 });
    this.sky = makeSky({ top: P.top, mid: P.mid, horizon: P.horizon, bottom: P.bottom, sunDir, sunColor: P.sun, glow: P.glow, glowAmt: this.returning ? 0.9 : 0.25, stars: 0 });
    this.add(this.sky);
    this.add(makeClouds({ count: 26, seed: 21, sunDir, lit: this.returning ? '#fff0dc' : '#ffffff', shadow: this.returning ? '#b27a8e' : '#9fb4da', rimColor: this.returning ? '#ffb07a' : '#fff6dc', yMin: 110, yMax: 260 }));

    // the cosmic phenomenon — a vast ringed world and a sleeping black hole, faint by day
    const giant = makePlanet({ radius: 520, sunDir, seed: 9.2, ocean: '#8fb7d8', shallow: '#c6e2ef', land: '#e8e0cf', land2: '#ffffff', atmo: '#cfe7ff', cloudAmt: 0.8, glow: 0.6 });
    giant.position.set(-1500, 900, -2600);
    giant.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.9; } });
    this.add(giant);
    this.giant = giant;
    const ring = makeCelestialRing({ inner: 700, outer: 1250, opacity: this.returning ? 0.55 : 0.28 });
    ring.position.copy(giant.position);
    ring.rotation.set(-1.2, 0.3, 0.35);
    this.add(ring);
    this.ring = ring;
    this.bh = makeBlackHole({ size: 110, tilt: 0.3, dust: 600 });
    this.bh.position.set(1900, 1300, -2800);
    this.bh.visible = false;
    this.add(this.bh);

    // terrain, meadow, path
    const grassCols = [new THREE.Color('#4e8f33'), new THREE.Color('#6cab3e'), new THREE.Color('#3c7a31'), new THREE.Color('#86ba4a')];
    const dirt = new THREE.Color('#c9ab78');
    this.add(makeTerrain({
      size: 560, seg: 220, cz: -40,
      heightAt: (x, z) => this.terrainH(x, z),
      colorAt: (x, z, h, c) => {
        const n = fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5;
        const i = Math.min(3, Math.floor(n * 4));
        c.copy(grassCols[i]).lerp(grassCols[(i + 1) % 4], (n * 4) % 1 * 0.5);
        const pd = distToPath(x, z, PATH);
        if (pd < 2.2) c.lerp(dirt, smoothstep(2.2, 1.0, pd + fbm(x * 0.4, z * 0.4, 2) * 0.6));
        if (h > 26) c.lerp(new THREE.Color('#5d7f5a'), smoothstep(26, 40, h));
      },
    }));
    const inHouse = (x, z) => x > HOUSE.x0 - 0.6 && x < HOUSE.x1 + 0.6 && z > HOUSE.z0 - 0.6 && z < HOUSE.z1 + 1.8;
    const sampleNear = (r) => (rng) => {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r;
      const x = Math.cos(a) * rr, z = 8 + Math.sin(a) * rr;
      if (inHouse(x, z) || distToPath(x, z, PATH) < 1.3) return null;
      return [x, z];
    };
    this.grass = this.add(makeGrass({ count: Math.floor(52000 * q), sample: sampleNear(62), heightAt: (x, z) => this.terrainH(x, z), base: '#2f6a2a', tip: this.returning ? '#d8c870' : '#a9d45e', h: [0.3, 0.85], sunDir }));
    this.add(makeGrass({ count: Math.floor(26000 * q), sample: (rng) => { const p = sampleNear(150)(rng); return p && Math.hypot(p[0], p[1] - 8) > 55 ? p : null; }, heightAt: (x, z) => this.terrainH(x, z), base: '#3a7530', tip: '#b4d86a', h: [0.6, 1.3], w: 0.16, seed: 8, sunDir }));
    s.add(makeFlowers({ count: Math.floor(2600 * q), sample: sampleNear(70), heightAt: (x, z) => this.terrainH(x, z) }));

    const rng = mulberry32(42);
    const rocks = [];
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2, r = 12 + rng() * 80;
      const x = Math.cos(a) * r, z = 8 + Math.sin(a) * r;
      if (distToPath(x, z, PATH) < 3 || inHouse(x, z)) continue;
      rocks.push({ x, z, y: this.terrainH(x, z), s: 0.4 + Math.pow(rng(), 2) * 1.8 });
    }
    this.add(makeRocks(rocks));

    const trees = [];
    const place = (x, z, kind, sc) => { if (!inHouse(x, z) && distToPath(x, z, PATH) > 4 && Math.hypot(x - CAR_SPOT.x, z - CAR_SPOT.z) > 6) trees.push({ x, z, y: this.terrainH(x, z) - 0.2, s: sc, kind }); };
    place(-12, -3, 'round', 1.5); place(12.5, -6, 'round', 1.8); place(-15, 9, 'round', 1.3); place(14, 12, 'round', 1.2);
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI * 2, r = 22 + rng() * 120;
      const x = Math.cos(a) * r, z = 8 + Math.sin(a) * r;
      place(x, z, z < -20 || rng() < 0.35 ? 'pine' : 'round', 0.9 + rng() * 1.1);
    }
    for (let i = 0; i < 90; i++) {
      const a = -Math.PI * (0.1 + rng() * 0.8), r = 150 + rng() * 90;
      const x = Math.cos(a) * r, z = 8 + Math.sin(a) * r;
      trees.push({ x, z, y: this.terrainH(x, z) - 0.2, s: 1.4 + rng(), kind: 'pine' });
    }
    this.add(makeForest(trees, { sunDir }));

    const mtn = [
      { x: -40, z: -620, r: 330, h: 520, seed: 1.2, snow: 0.58 },
      { x: -420, z: -540, r: 260, h: 360, seed: 2.7, snow: 0.66 },
      { x: 330, z: -600, r: 300, h: 400, seed: 4.1, snow: 0.62 },
      { x: 640, z: -300, r: 260, h: 300, seed: 5.3, snow: 0.7 },
      { x: -700, z: -200, r: 280, h: 280, seed: 6.9, snow: 0.72 },
      { x: 700, z: 250, r: 240, h: 220, seed: 7.7, snow: 0.8 },
      { x: -650, z: 380, r: 260, h: 240, seed: 8.8, snow: 0.8 },
    ];
    for (const m of mtn) s.add(makeMountain({ ...m, y: -8, forest: '#2f5a44', rock: this.returning ? '#8a7aa0' : '#6c86ab' }));

    this.add(makeMotes({ count: 260, center: new THREE.Vector3(0, 0, 10), spread: new THREE.Vector3(80, 10, 80), color: this.returning ? '#ffd28a' : '#fffbe0', size: 5, opacity: 0.6 }));

    this.buildHouse();
    this.buildInterior();
    this.decorate(q);
  }

  // ------------------------------------------------------------------ house

  buildHouse() {
    const s = this.scene;
    const house = (this.house = new THREE.Group());
    s.add(house);
    const wood = toon('#ffffff', { map: plankTexture('#a4744a', { seed: 3 }) });
    const plaster = toon('#efe3cb');
    const floor = texturedBox(14, 0.3, 10, toon('#ffffff', { map: plankTexture('#b98a5c', { seed: 7, lines: 10 }) }), 0, 0, 0, 0.45);
    house.add(floor);
    const found = box(14.6, 0.6, 10.6, '#8d8a86', 0, -0.2, 0);
    house.add(found);
    const W = { H: 3, T: 0.22, floor: FLOOR, mat: wood };
    const walls = [];
    walls.push(...buildWall(this, house, { ...W, axis: 'x', c: -5, a1: -7.1, a2: 7.1, openings: [{ a: -5.2, b: -3.8, bottom: 1.1, top: 2.3 }, { a: 3.4, b: 5.0, bottom: 1.2, top: 2.2 }] }));
    walls.push(...buildWall(this, house, { ...W, axis: 'x', c: 5, a1: -7.1, a2: 7.1, openings: [{ a: -5.4, b: -2.4, bottom: 0.8, top: 2.4 }, { a: -0.7, b: 0.7, bottom: 0, top: 2.4 }, { a: 2.6, b: 5.0, bottom: 0.9, top: 2.3 }] }));
    walls.push(...buildWall(this, house, { ...W, axis: 'z', c: -7, a1: -5, a2: 5, openings: [{ a: 1.2, b: 3.2, bottom: 0.9, top: 2.3 }] }));
    walls.push(...buildWall(this, house, { ...W, axis: 'z', c: 7, a1: -5, a2: 5, openings: [{ a: -3.2, b: -1.6, bottom: 1.1, top: 2.2 }, { a: 1.2, b: 3.2, bottom: 0.9, top: 2.3 }] }));
    // interior partitions (bedroom)
    const P = { H: 3, T: 0.16, floor: FLOOR, mat: plaster, frameColor: '#c9a882' };
    walls.push(...buildWall(this, house, { ...P, axis: 'x', c: 0, a1: -7, a2: -1.6, openings: [{ a: -3.9, b: -2.7, bottom: 0, top: 2.35 }] }));
    walls.push(...buildWall(this, house, { ...P, axis: 'z', c: -1.6, a1: -5, a2: 0 }));
    this.cameraBlockers.push(...walls);

    // door
    const pivot = (this.doorPivot = new THREE.Group());
    pivot.position.set(-0.7, FLOOR, 5);
    const door = texturedBox(1.4, 2.4, 0.1, toon('#ffffff', { map: plankTexture('#7a4f33', { seed: 9, lines: 6 }) }), 0.7, 1.2, 0, 1);
    pivot.add(door);
    const knob = sphere(0.05, '#e0c070', 1.2, 1.15, 0.08);
    pivot.add(knob);
    const glassWin = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), glowMat('#ffe6b0', 1.2));
    glassWin.position.set(0.7, 1.85, 0.06);
    pivot.add(glassWin);
    house.add(pivot);
    this.doorCollider = boxCollider(0, 5, 1.4, 0.3);
    this.colliders.push(this.doorCollider);
    this.cameraBlockers.push(door);

    // porch + roof
    house.add(box(2.6, 0.12, 1.6, '#8a6a4c', 0, 0.06, 5.9));
    for (const x of [-1.2, 1.2]) house.add(cyl(0.07, 0.07, 2.8, '#6b4b33', x, 1.4, 6.6));
    const awning = box(3.0, 0.1, 1.9, '#b8502c', 0, 2.85, 6.0);
    awning.rotation.x = 0.18;
    house.add(awning);
    const roof = (this.roof = gableRoof({ x0: -7.1, x1: 7.1, z0: -5.1, z1: 5.1, y: FLOOR + 3, rise: 2.6, color: '#c4552e', gableMat: wood }));
    const chimney = box(0.8, 2.4, 0.8, '#9a8f86', 4.2, FLOOR + 4.6, -2);
    roof.add(chimney);
    house.add(roof);
    this.smoke = makeMotes({ count: 40, center: new THREE.Vector3(4.2, FLOOR + 6, -2), spread: new THREE.Vector3(1.5, 10, 1.5), color: '#d8dde6', size: 30, opacity: 0.25, rise: 0.8 });
    this.add(this.smoke);
    // window glow from outside
    this.windowGlow = [];
    for (const [x, z] of [[-3.9, 5.15], [3.8, 5.15], [-7.15, 2.2], [7.15, 2.2]]) {
      const sp = glowSprite('#ffc27a', 3.2, 0.0);
      sp.position.set(x, FLOOR + 1.6, z);
      house.add(sp);
      this.windowGlow.push(sp);
    }

    // mailbox, fence, garden
    house.add(cyl(0.06, 0.06, 1.1, '#6b4b33', 2.4, 0.55, 8.2));
    house.add(box(0.5, 0.35, 0.3, '#a9203e', 2.4, 1.2, 8.2));
    for (let i = 0; i < 9; i++) {
      house.add(box(0.1, 0.8, 0.1, '#e8dcc4', -7.5 - i * 1.3, 0.4 + this.terrainH(-7.5 - i * 1.3, 7.5), 7.5));
    }
    house.add(box(10.4, 0.08, 0.06, '#e8dcc4', -12.7, 0.6, 7.5));
  }

  buildInterior() {
    const h = this.house;
    const add = (m) => { h.add(m); return m; };
    const F = FLOOR;
    // --- bedroom
    add(box(2.2, 0.35, 1.45, '#8a5a3a', -5.85, F + 0.3, -3.3));
    add(box(0.12, 1.1, 1.5, '#7a4d31', -6.93, F + 0.6, -3.3));
    add(box(0.1, 0.65, 1.5, '#7a4d31', -4.72, F + 0.4, -3.3));
    add(box(2.05, 0.18, 1.35, '#f3ece0', -5.85, F + 0.56, -3.3));
    const pillow = add(sphere(0.3, '#ffffff', -6.5, F + 0.78, -3.3));
    pillow.scale.set(0.8, 0.35, 1.5);
    const quilt = add(box(1.35, 0.22, 1.42, '#b25b6e', -5.3, F + 0.72, -3.3));
    this.quilt = quilt;
    for (let i = 0; i < 4; i++) add(box(0.3, 0.03, 1.43, i % 2 ? '#e0b45c' : '#f5efe4', -5.85 + i * 0.35, F + 0.84, -3.3));
    add(box(0.55, 0.6, 0.5, '#8a5a3a', -6.5, F + 0.3, -4.5));
    add(cyl(0.05, 0.08, 0.3, '#d8c8a8', -6.5, F + 0.75, -4.5));
    const shade = add(cyl(0.12, 0.2, 0.22, null, -6.5, F + 1.0, -4.5, 16, glowMat('#ffd9a0', 1.3)));
    shade.castShadow = false;
    this.bedLamp = new THREE.PointLight('#ffb870', 3, 7, 1.6);
    this.bedLamp.position.set(-6.5, F + 1.2, -4.3);
    h.add(this.bedLamp);
    add(box(1.1, 2.1, 0.6, '#9a6b45', -2.4, F + 1.05, -4.55));
    const rug = add(new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), toon('#c98a5a')));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-4.2, F + 0.16, -1.5);
    rug.scale.set(1.3, 1, 1);

    // mother, lying in bed
    this.mother = buildCharacter({ gender: 'female', top: '#d8c6e6', bottom: '#e9e0f2', hair: '#5d4c46', skin: '#efcfb4', eyesClosed: !this.completed });
    const mom = new THREE.Group();
    mom.rotation.y = Math.PI / 2;
    this.mother.group.rotation.x = -Math.PI / 2;
    mom.add(this.mother.group);
    mom.position.set(-4.85, F + 0.9, -3.3);
    this.mother.parts.armL.rotation.set(0.1, 0, 0.2);
    this.mother.parts.armR.rotation.set(0.1, 0, -0.2);
    this.momBed = mom;
    h.add(mom);
    this.breath = 0.6;

    // oxygen machine
    const mach = (this.machine = new THREE.Group());
    mach.position.set(-6.35, F, -1.95);
    mach.add(box(0.62, 1.05, 0.5, '#e8e4dc', 0, 0.55, 0));
    const top = sphere(0.31, '#e8e4dc', 0, 1.07, 0);
    top.scale.set(1, 0.35, 0.8);
    mach.add(top);
    this.screenTex = canvasTexture(256, 160, () => {});
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), new THREE.MeshBasicMaterial({ map: this.screenTex, toneMapped: false }));
    screen.position.set(0.312, 0.8, 0);
    screen.rotation.y = Math.PI / 2;
    mach.add(screen);
    this.bellows = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 20), toon('#8fa3b8'));
      r.rotation.x = Math.PI / 2;
      r.position.y = i * 0.07;
      this.bellows.add(r);
    }
    this.bellows.position.set(0.1, 0.12, 0.28);
    this.bellows.rotation.x = Math.PI / 2;
    mach.add(this.bellows);
    this.slots = [];
    for (let i = 0; i < 3; i++) {
      const slot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), toon('#3b4152'));
      slot.rotation.z = Math.PI / 2;
      slot.position.set(0.315, 0.45, -0.14 + i * 0.14);
      mach.add(slot);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), glowMat('#ffb070', 3));
      core.position.copy(slot.position).add(new THREE.Vector3(0.02, 0, 0));
      core.visible = false;
      mach.add(core);
      this.slots.push(core);
    }
    this.statusLight = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), glowMat('#ff4a4a', 3));
    this.statusLight.position.set(0.25, 1.05, 0.2);
    mach.add(this.statusLight);
    mach.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    h.add(mach);
    this.colliders.push(boxCollider(-6.35, -1.95, 0.7, 0.6), boxCollider(-5.85, -3.3, 2.25, 1.5), boxCollider(-6.5, -4.5, 0.6, 0.55));
    // tube from machine to mask
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-6.05, F + 0.95, -1.95), new THREE.Vector3(-5.8, F + 1.25, -2.4),
      new THREE.Vector3(-6.2, F + 1.1, -3.0), new THREE.Vector3(-6.45, F + 1.0, -3.3),
    ]);
    add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.022, 8), toon('#cfe4f0', { transparent: true, opacity: 0.85 })));
    const mask = add(sphere(0.07, '#dff2ff', -6.47, F + 0.98, -3.3));
    mask.scale.set(0.6, 1, 1);
    this.o2 = this.completed ? 100 : 11;
    this.drawScreen();

    // photos on the bedroom wall (bedroom side of partition)
    this.photo(-5.8, F + 1.8, -0.1, Math.PI, 'lake');
    this.photo(-2.2, F + 1.7, -0.1, Math.PI, 'mom');

    // --- living room
    add(box(2.4, 0.45, 0.95, '#5d7fa6', -5.4, F + 0.35, 3.9));
    add(box(2.4, 0.7, 0.25, '#4f6f94', -5.4, F + 0.75, 4.35));
    for (const x of [-6.55, -4.25]) add(box(0.25, 0.6, 0.95, '#4f6f94', x, F + 0.5, 3.9));
    add(box(1.1, 0.08, 0.6, '#9a6b45', -5.4, F + 0.45, 2.6));
    for (const [dx, dz] of [[-0.45, -0.22], [0.45, -0.22], [-0.45, 0.22], [0.45, 0.22]]) add(cyl(0.03, 0.03, 0.42, '#7a4d31', -5.4 + dx, F + 0.21, 2.6 + dz));
    add(cyl(0.12, 0.1, 0.12, '#f5efe4', -5.3, F + 0.55, 2.55));
    const lrug = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), toon('#b85d4a')));
    lrug.rotation.x = -Math.PI / 2;
    lrug.position.set(-5.2, F + 0.16, 2.9);
    // bookshelf
    add(box(0.4, 2.2, 1.6, '#8a5a3a', -6.75, F + 1.1, 0.95));
    const bc = ['#a9203e', '#f2703c', '#5d93c9', '#e0c070', '#5f9c6b', '#efe6d8'];
    const r2 = mulberry32(5);
    for (let shelf = 0; shelf < 4; shelf++) {
      let z = 0.25;
      while (z < 1.6) {
        const w = 0.06 + r2() * 0.06, hh = 0.3 + r2() * 0.15;
        add(box(0.28, hh, w, bc[Math.floor(r2() * bc.length)], -6.65, F + 0.25 + shelf * 0.5 + hh / 2, z));
        z += w + 0.01;
      }
    }
    // standing lamp + plant + radio + hologram clock
    add(cyl(0.03, 0.03, 1.6, '#3b3b3b', -3.4, F + 0.8, 4.5));
    add(cyl(0.18, 0.28, 0.3, null, -3.4, F + 1.7, 4.5, 16, glowMat('#ffd9a0', 1.1)));
    this.livingLamp = new THREE.PointLight('#ffc07a', 4, 9, 1.5);
    this.livingLamp.position.set(-3.4, F + 1.6, 4.3);
    h.add(this.livingLamp);
    add(cyl(0.22, 0.17, 0.4, '#c56a3c', -1.2, F + 0.2, 4.4));
    const leaves = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), paintMaterial({ lit: '#8cc152', shadow: '#3f7a3a', sunDir: this.sunDir })));
    leaves.position.set(-1.2, F + 0.8, 4.4);
    leaves.scale.set(1, 1.3, 1);
    const holo = add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.015, 8, 48), glowMat('#8fe0ff', 2.2)));
    holo.position.set(-1.8, F + 2.1, 0.12);
    this.holo = holo;
    const hand = add(new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.2, 0.01), glowMat('#8fe0ff', 2.5)));
    hand.position.set(-1.8, F + 2.18, 0.13);
    this.holoHand = hand;
    // star chart on living-room wall (father's)
    this.photo(-6.86, F + 1.9, 3.2, Math.PI / 2, 'chart', 1.2, 0.8);

    // --- dining
    add(box(1.8, 0.08, 1.1, '#9a6b45', 3.8, F + 0.78, 2.4));
    for (const [dx, dz] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) add(cyl(0.04, 0.04, 0.76, '#7a4d31', 3.8 + dx, F + 0.39, 2.4 + dz));
    for (const dx of [-1.25, 1.25]) {
      add(box(0.5, 0.06, 0.5, '#8a5a3a', 3.8 + dx, F + 0.48, 2.4));
      add(box(0.06, 0.6, 0.5, '#8a5a3a', 3.8 + dx * 1.2, F + 0.78, 2.4));
      for (const [ex, ez] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) add(cyl(0.025, 0.025, 0.46, '#7a4d31', 3.8 + dx + ex, F + 0.23, 2.4 + ez));
    }
    add(cyl(0.08, 0.06, 0.25, '#5d93c9', 3.8, F + 0.95, 2.4));
    for (let i = 0; i < 5; i++) add(sphere(0.045, ['#ffffff', '#f2703c', '#ffd23f'][i % 3], 3.8 + Math.cos(i * 1.3) * 0.07, F + 1.12, 2.4 + Math.sin(i * 1.3) * 0.07));
    const pendant = add(cyl(0.2, 0.3, 0.25, null, 3.8, F + 2.3, 2.4, 16, glowMat('#ffd9a0', 1.2)));
    pendant.castShadow = false;
    add(cyl(0.01, 0.01, 0.6, '#3b3b3b', 3.8, F + 2.72, 2.4));
    this.tableLamp = new THREE.PointLight('#ffc07a', 4, 8, 1.4);
    this.tableLamp.position.set(3.8, F + 2.1, 2.4);
    h.add(this.tableLamp);
    this.bowls = new THREE.Group();
    for (const dx of [-0.5, 0.5]) {
      const bowl = cyl(0.16, 0.1, 0.1, '#f5efe4', 3.8 + dx, F + 0.87, 2.4);
      this.bowls.add(bowl);
      const soup = cyl(0.14, 0.14, 0.02, '#e39a4a', 3.8 + dx, F + 0.92, 2.4);
      this.bowls.add(soup);
    }
    this.bowls.add(cyl(0.2, 0.2, 0.05, '#e0b86a', 3.8, F + 0.85, 2.15));
    this.bowls.visible = false;
    h.add(this.bowls);

    // --- kitchen
    add(box(4.2, 0.9, 0.7, '#e8dcc4', 4.8, F + 0.45, -4.5));
    add(box(4.3, 0.06, 0.78, '#7a8a96', 4.8, F + 0.93, -4.5));
    add(box(4.2, 0.7, 0.4, '#d9c8a8', 4.8, F + 2.2, -4.7));
    add(box(0.8, 2.0, 0.7, '#dfe6ee', 6.4, F + 1.0, -2.3));
    add(box(0.02, 1.6, 0.05, null, 6.0, F + 1.1, -2.0, glowMat('#8fe0ff', 1.8)));
    add(box(0.7, 0.05, 0.6, '#3b4152', 3.4, F + 0.97, -4.5));
    const kettle = add(sphere(0.14, '#a9203e', 3.3, F + 1.1, -4.45));
    kettle.scale.set(1, 0.85, 1);
    this.kettle = kettle;
    for (let i = 0; i < 5; i++) add(cyl(0.06, 0.06, 0.16, ['#e0c070', '#f2703c', '#5f9c6b'][i % 3], 4.5 + i * 0.3, F + 1.97, -4.6));
    add(box(1.2, 0.05, 0.3, '#8a5a3a', 4.9, F + 1.86, -4.75));

    this.windowLight = [];
    // sun spill through windows (fake volumetric shafts)
    for (const [x, z, ry] of [[-4.5, -4.2, 0], [4.2, -4.2, 0]]) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3), new THREE.MeshBasicMaterial({ color: '#fff0c8', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      shaft.position.set(x, F + 1.2, z + 0.6);
      shaft.rotation.set(-0.6, ry, 0);
      h.add(shaft);
    }
  }

  decorate(q) {
    const s = this.scene, sunDir = this.sunDir;
    const H = (x, z) => this.terrainH(x, z);
    const inHouse = (x, z) => x > HOUSE.x0 - 1 && x < HOUSE.x1 + 1 && z > HOUSE.z0 - 1 && z < HOUSE.z1 + 2.5;
    const clearOf = (x, z, d = 2) => !inHouse(x, z) && distToPath(x, z, PATH) > d && Math.hypot(x - CAR_SPOT.x, z - CAR_SPOT.z) > 5;
    const ring = (r0, r1) => (rng) => { const a = rng() * 6.28, r = r0 + rng() * (r1 - r0); const x = Math.cos(a) * r, z = 8 + Math.sin(a) * r; return clearOf(x, z) ? [x, z] : null; };

    // ground cover
    const hugs = [];
    for (let i = 0; i < 26; i++) {
      const t = i / 26, side = i % 4;
      const x = side < 2 ? HOUSE.x0 - 0.6 + t * 0 + (side ? HOUSE.x1 - HOUSE.x0 + 1.2 : 0) : -6 + ((i * 3.1) % 12);
      const z = side < 2 ? -4.5 + ((i * 1.7) % 9) : side === 2 ? HOUSE.z0 - 0.7 : HOUSE.z1 + 0.7;
      if (Math.abs(x) < 1.6 && z > 4) continue;
      hugs.push({ x, y: 0, z, s: 0.7 + (i % 3) * 0.15, ry: i });
    }
    this.add(D.makeBushes([...hugs, ...D.samplePoints(Math.floor(90 * q), ring(12, 90), H, 11)], { sunDir }));
    s.add(D.makeFerns(D.samplePoints(Math.floor(140 * q), ring(10, 80), H, 12)));
    s.add(D.makeMushrooms(D.samplePoints(60, ring(14, 60), H, 13, (r) => ({ s: 0.8 + r() * 0.8 }))));
    s.add(D.makePebbles(D.samplePoints(260, (rng) => { const i = Math.floor(rng() * (PATH.length - 1)); const t = rng(); const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1]; const x = ax + (bx - ax) * t + (rng() - 0.5) * 4.5, z = az + (bz - az) * t + (rng() - 0.5) * 4.5; return inHouse(x, z) ? null : [x, z]; }, H, 14)));
    // stepping stones from the porch to the car
    const stones = [];
    for (let z = 7; z < 19; z += 0.9) stones.push({ x: (Math.sin(z * 1.3) * 0.25), y: H(0, z) + 0.02, z, s: 1, ry: z, sx: 2.6, sy: 0.4, sz: 2 });
    s.add(D.scatter(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 9), toon('#b9b2a8'), stones, { cast: false }));

    // garden beds with vegetables, a fence around them
    const bed = new THREE.Group();
    for (let r = 0; r < 3; r++) {
      bed.add(box(4.4, 0.25, 0.9, '#7a5a3e', 11, H(11, -2 + r * 1.6) + 0.1, -2 + r * 1.6));
      for (let k = 0; k < 6; k++) {
        const veg = sphere(0.22, r === 1 ? '#e0703a' : '#7cb342', 9.2 + k * 0.72, H(11, -2 + r * 1.6) + 0.35, -2 + r * 1.6);
        veg.scale.set(1, r === 1 ? 0.7 : 0.8, 1);
        bed.add(veg);
      }
    }
    s.add(bed);
    this.colliders.push({ type: 'box', minX: 8.6, maxX: 13.4, minZ: -2.6, maxZ: 1.8 });
    s.add(D.fence([[8, -3.4], [14.2, -3.4], [14.2, 2.6], [10.8, 2.6]], H, { color: '#efe4cc' }));

    // homestead props
    this.add(D.well(-11.5, H(-11.5, 13), 13));
    this.add(D.woodpile(8.3, H(8.3, -4.2), -4.2, Math.PI / 2));
    this.add(D.laundryLine(-10.5, -3, -10.5, 5, H));
    this.add(D.bench(3.6, H(3.6, 8.6), 8.6, Math.PI));
    this.add(D.lampPost(1.9, H(1.9, 12), 12, { color: '#3b3b40' }));
    this.add(D.barrel(6.2, H(6.2, 4.6), 5.9, 0.9, '#6b4b33'));
    this.add(D.signpost(4, H(4, 30), 30, 0.4, ['HOME', 'MEADOW']));
    this.add(D.makeChickens({ count: 4, area: { x0: 8.5, x1: 14, z0: 3, z1: 7.5 }, heightAt: H, seed: 6 }));
    this.add(D.makeButterflies({ count: 30, center: new THREE.Vector3(0, 0, 10), radius: 26, heightAt: H }));
    this.add(D.makeBirds({ count: 12, center: new THREE.Vector3(-20, 55, -30), radius: 110 }));
    // window boxes with flowers
    for (const x of [-3.9, 3.8]) {
      s.add(box(1.9, 0.25, 0.3, '#8a5a3a', x, FLOOR + 0.72, 5.3));
      for (let k = 0; k < 7; k++) s.add(sphere(0.09, ['#ff8c5a', '#ffffff', '#e58fd6', '#ffd23f'][k % 4], x - 0.8 + k * 0.27, FLOOR + 0.93, 5.3));
    }
    // curtains and interior warmth
    const curtain = toon('#e8b8a0', { side: THREE.DoubleSide });
    for (const x of [-5.3, -2.5, 2.7, 4.9]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.7), curtain); c.position.set(x, FLOOR + 1.6, 4.85); this.house.add(c); }
    const kitchenHerbs = [3.6, 4.0, 4.4, 4.8];
    kitchenHerbs.forEach((x, i) => { this.house.add(cyl(0.08, 0.06, 0.14, '#c56a3c', x, FLOOR + 1.3, -4.8)); this.house.add(sphere(0.1, i % 2 ? '#6aa84f' : '#8cc152', x, FLOOR + 1.45, -4.8)); });
    for (let i = 0; i < 3; i++) this.house.add(cyl(0.12, 0.1, 0.12, ['#3b4152', '#a9203e', '#8a8f98'][i], 3.5 + i * 0.45, FLOOR + 2.55, -4.2));
    this.house.add(box(1.4, 0.02, 0.35, '#a9203e', 3.8, FLOOR + 0.83, 2.4));
    // a sleeping cat on the living-room rug
    const cat = new THREE.Group();
    const fur = '#e39a4a';
    const cb = sphere(0.22, fur, 0, 0.16, 0); cb.scale.set(1.3, 0.7, 1); cat.add(cb);
    cat.add(sphere(0.13, fur, 0.3, 0.17, 0.05));
    for (const z of [-0.05, 0.12]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 6), toon(fur)); ear.position.set(0.32, 0.3, z); cat.add(ear); }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 16, Math.PI), toon(fur)); tail.rotation.x = Math.PI / 2; tail.position.set(-0.05, 0.08, 0.05); cat.add(tail);
    cat.position.set(-4.6, FLOOR, 2.1);
    cat.rotation.y = 0.5;
    this.house.add(cat);
    this.animate((t) => (cb.scale.y = 0.7 + Math.sin(t * 1.6) * 0.03));
  }

  photo(x, y, z, ry, kind, w = 0.55, hh = 0.42) {
    const tex = canvasTexture(256, 196, (g, W, H) => {
      if (kind === 'chart') {
        g.fillStyle = '#1b2440'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
        g.strokeStyle = 'rgba(245,241,234,0.4)'; g.beginPath(); g.moveTo(30, 150); g.lineTo(90, 60); g.lineTo(170, 110); g.lineTo(220, 40); g.stroke();
        for (const [cx, cy] of [[90, 60], [170, 110], [220, 40]]) {
          g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill();
          g.strokeStyle = '#e0452f'; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, 15, 0, 7); g.stroke();
        }
        g.fillStyle = '#f5f1ea'; g.font = 'italic 14px serif'; g.fillText('worlds that breathe?', 20, 185);
        return;
      }
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, kind === 'lake' ? '#6fb3e6' : '#f2b27c');
      grd.addColorStop(1, kind === 'lake' ? '#dff1f7' : '#f7e3c4');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      if (kind === 'lake') {
        g.fillStyle = '#4f8fb8'; g.fillRect(0, 120, W, 76);
        g.fillStyle = '#5a8f4a'; g.beginPath(); g.moveTo(0, 125); g.quadraticCurveTo(80, 90, 150, 122); g.lineTo(0, 125); g.fill();
      }
      g.fillStyle = '#2a1b17'; g.beginPath(); g.arc(100, 95, 16, 0, 7); g.fill();
      g.fillStyle = '#b25b6e'; g.fillRect(86, 110, 28, 50);
      g.fillStyle = '#2a1b17'; g.beginPath(); g.arc(150, 110, 11, 0, 7); g.fill();
      g.fillStyle = '#5d93c9'; g.fillRect(141, 121, 18, 36);
    });
    const frame = box(w + 0.08, hh + 0.08, 0.04, '#6b4b33', x, y, z);
    frame.rotation.y = ry;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), toon('#ffffff', { map: tex }));
    pic.position.set(0, 0, 0.025);
    frame.add(pic);
    this.house.add(frame);
    return frame;
  }

  drawScreen() {
    const c = this.screenTex.userData.canvas, g = c.getContext('2d');
    const ok = this.o2 > 60;
    g.fillStyle = '#0d141c'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = ok ? '#5fe0a0' : '#ff6a5a';
    g.font = '600 20px monospace'; g.fillText('O₂ RESERVE', 16, 30);
    g.font = '600 54px monospace'; g.fillText(`${Math.round(this.o2)}%`, 16, 92);
    g.strokeStyle = ok ? '#5fe0a0' : '#ff6a5a'; g.lineWidth = 2; g.beginPath();
    const t = this.game.time;
    for (let x = 0; x < 256; x += 4) {
      const y = 132 + Math.sin(x * 0.08 + t * (ok ? 3 : 5)) * (ok ? 10 : 4) * (ok ? 1 : Math.random() * 0.8 + 0.4);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    g.font = '12px monospace'; g.fillText(ok ? 'CORES ACTIVE · 3/3' : 'CORE CELLS: EMPTY', 140, 30);
    this.screenTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ flow

  async enter(opts = {}) {
    const g = this.game, st = g.save.state;
    const M = g.missions;
    this.setupInteractions();
    const step = M.step('find_oxygen');
    if (this.completed) return this.finalShot(true);
    if (this.returning) {
      if (!M.get('home_again')) M.start('home_again');
      this.openDoor(true);
      if (opts.landing) return this.landingSequence();
      g.player.place(CAR_SPOT.x - 2.5, this.terrainH(CAR_SPOT.x - 2.5, CAR_SPOT.z - 1), CAR_SPOT.z - 1, Math.PI);
      g.vehicle.place(CAR_SPOT.x, this.terrainH(CAR_SPOT.x, CAR_SPOT.z), CAR_SPOT.z, 0);
      g.vehicle.setMode('ground');
      g.overlay.fade(0, 1200);
      g.setMode('walk');
      M.setStep('home_again', 1);
      this.refreshMarkers();
      return;
    }
    g.vehicle.place(CAR_SPOT.x, this.terrainH(CAR_SPOT.x, CAR_SPOT.z), CAR_SPOT.z, 0);
    g.vehicle.setMode('ground');
    if (step >= 3 || (opts.resume && step >= 2)) {
      this.openDoor(true);
      g.player.place(0, this.terrainH(0, 12), 12, 0);
      g.player.camDistTarget = 5.5;
      g.overlay.fade(0, 1200);
      g.setMode('walk');
      if (step < 3) M.setStep('find_oxygen', 3);
      this.refreshMarkers();
      return;
    }
    // Opening: wide establishing shot of the tiny house, then inside to Mother.
    g.player.place(-3.6, FLOOR, -1.6, -Math.PI / 2 - 0.3);
    g.player.camDistTarget = 3.2;
    g.setMode('cutscene');
    g.overlay.letterbox(true);
    g.cine.cut(new THREE.Vector3(28, 34, 70), new THREE.Vector3(0, 8, -30));
    g.overlay.fade(0, 2500);
    g.cine.to(new THREE.Vector3(10, 7, 26), new THREE.Vector3(0, 2, 0), 7000, g.ease.sine);
    g.overlay.title('HOME', g.content.worlds.home.name, g.content.worlds.home.subtitle, 5000);
    await g.sleep(7000);
    await g.overlay.fade(1, 700);
    g.cine.cut(new THREE.Vector3(-2.3, 2.2, -0.6), new THREE.Vector3(-5.8, 0.9, -3.3));
    this.inside = true;
    this.roof.visible = false;
    g.overlay.fade(0, 900);
    g.cine.to(new THREE.Vector3(-2.6, 1.9, -0.9), new THREE.Vector3(-5.9, 0.95, -3.3), 3500, g.ease.sine);
    await g.sleep(3500);
    g.overlay.letterbox(false);
    g.cine.release();
    g.player.snapCamera();
    g.setMode('walk');
    M.start('find_oxygen');
    this.refreshMarkers();
    g.hud.hint('<b>WASD</b> walk · <b>Mouse</b> look (click to capture)<br><b>Shift</b> run · <b>Space</b> jump · <b>E</b> interact · <b>Tab</b> inventory', 16000);
  }

  refreshMarkers() {
    const g = this.game, M = g.missions;
    g.markers.clear();
    const step = M.step('find_oxygen');
    const momHead = new THREE.Vector3(-6.3, FLOOR + 1.4, -3.3);
    if (this.returning) {
      const hs = M.step('home_again');
      if (hs <= 1) g.markers.set('mom', momHead);
      else if (hs === 2) g.markers.set('mach', new THREE.Vector3(-6.35, FLOOR + 1.5, -1.95));
      return;
    }
    if (step === 0) g.markers.set('mom', momHead);
    else if (step === 1) g.markers.set('mach', new THREE.Vector3(-6.35, FLOOR + 1.5, -1.95));
    else if (step === 2) g.markers.set('door', new THREE.Vector3(0, FLOOR + 2.6, 5.2));
    else if (step === 3) g.markers.set('car', () => g.vehicle.position.clone().add(new THREE.Vector3(0, 2, 0)));
  }

  setupInteractions() {
    const g = this.game, M = g.missions, I = g.interactions;
    const walking = () => g.mode === 'walk';
    I.add({
      pos: new THREE.Vector3(-4.9, FLOOR, -2.2), radius: 1.8, label: () => 'Talk to Mother',
      enabled: () => walking() && !this.finaleDone,
      action: () => this.talkMother(),
    });
    I.add({
      pos: new THREE.Vector3(-5.7, FLOOR, -1.4), radius: 1.1,
      label: () => (this.returning && M.step('home_again') >= 2 ? 'Insert Oxygen Cores × 3' : 'Inspect oxygen machine'),
      enabled: () => walking() && !this.finaleDone,
      action: () => this.inspectMachine(),
    });
    I.add({
      pos: new THREE.Vector3(0, FLOOR, 5), radius: 1.8, label: () => (this.doorOpen ? null : 'Open door'),
      enabled: () => walking() && !this.doorOpen,
      action: () => {
        if (!this.returning && M.step('find_oxygen') < 2) { g.overlay.toast('Not yet — Mother needs you'); g.audio.sfx('fail'); return; }
        this.openDoor();
      },
    });
    const observe = (pos, label, text, r = 1.4) => I.add({ pos, radius: r, label: 'Observe · ' + label, enabled: walking, action: () => g.dialogue.say([{ who: 'player', text }]) });
    observe(new THREE.Vector3(-5.8, FLOOR, -0.7), 'Photograph', 'Summer by the lake. Mother laughed the whole day.');
    observe(new THREE.Vector3(-2.2, FLOOR, -0.7), 'Photograph', 'Mother and me, when I was small enough to carry.');
    observe(new THREE.Vector3(-6.2, FLOOR, 3.2), 'Star chart', 'Father\'s star chart. Three dark stars, circled in red ink. "Worlds that breathe?"');
    observe(new THREE.Vector3(3.3, FLOOR, -3.8), 'Kettle', this.returning ? 'Cold. She hasn\'t been able to make tea in a long time.' : 'Mother\'s kettle. She used to hum while it boiled.');
    observe(new THREE.Vector3(-3.9, FLOOR, 4.3), 'Window', 'The sky feels bigger today.');
    observe(new THREE.Vector3(-1.8, FLOOR, 0.9), 'Clock', 'A hologram clock. Father built it. It still keeps perfect time.');
    I.add({
      pos: () => g.vehicle.position, radius: 3.4, label: 'Enter car', dy: 4,
      enabled: () => walking() && !this.returning && M.step('find_oxygen') >= 3,
      action: () => this.enterCar(),
    });
  }

  async talkMother() {
    const g = this.game, M = g.missions;
    const momCam = { pos: new THREE.Vector3(-4.2, FLOOR + 1.9, -1.6), target: new THREE.Vector3(-6.2, FLOOR + 0.9, -3.3), ms: 1200 };
    const name = g.content.npcs.mother.name;
    if (this.returning) {
      if (M.step('home_again') >= 2) {
        await g.dialogue.say([{ who: name, text: '…', cam: momCam }]);
        g.cine.release();
        return;
      }
      await g.dialogue.say([
        { who: name, text: '{name}…? Is that you?', cam: momCam },
        { who: 'player', text: 'I\'m here. I brought something. Just breathe, okay?' },
      ]);
      g.cine.release();
      M.setStep('home_again', 2);
      this.refreshMarkers();
      return;
    }
    const step = M.step('find_oxygen');
    if (step === 0) {
      await g.dialogue.say([
        { who: name, text: '{name}… you\'re up early.', cam: momCam },
        { who: 'player', text: 'The machine sounded different last night.' },
        { who: name, text: 'Don\'t worry about me.' },
        { who: 'player', text: 'I\'ll find a way.' },
        { who: name, text: 'Your father used to say… beyond the three dark stars, there are worlds that breathe.' },
        { who: name, text: 'Check the machine for me, would you, love?' },
      ]);
      g.cine.release();
      M.setStep('find_oxygen', 1);
      this.refreshMarkers();
    } else {
      const lines = [
        'Go on. I\'ll be right here.',
        'Take the car. It always liked the sky more than the road.',
        'Come back to me, alright?',
      ];
      await g.dialogue.say([{ who: name, text: lines[Math.floor(Math.random() * lines.length)], cam: momCam }]);
      g.cine.release();
    }
  }

  async inspectMachine() {
    const g = this.game, M = g.missions;
    const cam = { pos: new THREE.Vector3(-4.9, FLOOR + 1.6, -1.2), target: new THREE.Vector3(-6.3, FLOOR + 0.8, -1.95), ms: 1200 };
    if (this.returning) {
      if (M.step('home_again') < 2) {
        await g.dialogue.say([{ who: 'player', text: 'Mother first. Let her know I\'m home.', cam }]);
        g.cine.release();
        return;
      }
      return this.finale();
    }
    if (M.step('find_oxygen') < 1) {
      await g.dialogue.say([{ who: 'player', text: 'Oxygen reserve: 11%. It\'s been dropping every day.', cam }]);
      g.cine.release();
      return;
    }
    if (M.step('find_oxygen') >= 2) {
      await g.dialogue.say([{ who: 'player', text: 'Three empty core slots. Three dark stars.', cam }]);
      g.cine.release();
      return;
    }
    await g.dialogue.say([
      { who: 'player', text: 'Oxygen reserve: 11%. Core cells… empty. All three.', cam },
      { who: 'player', text: 'Three slots. Three dark stars on Father\'s chart.' },
      { who: 'player', text: 'If those worlds really breathe… they might have what she needs.' },
    ]);
    g.cine.release();
    M.setStep('find_oxygen', 2);
    g.audio.sfx('mission');
    g.overlay.banner('Mission 01', 'Find the Oxygen', g.content.missions.find_oxygen.description);
    this.refreshMarkers();
  }

  openDoor(instant = false) {
    if (this.doorOpen) return;
    this.doorOpen = true;
    this.doorCollider.enabled = false;
    this.cameraBlockers = this.cameraBlockers.filter((m) => m.parent !== this.doorPivot);
    if (instant) { this.doorPivot.rotation.y = -1.9; return; }
    this.game.audio.sfx('door');
    this.game.tween(1400, (k) => (this.doorPivot.rotation.y = -1.9 * k), this.game.ease.out);
  }

  async enterCar() {
    const g = this.game;
    g.busy = true;
    g.markers.clear();
    g.setMode('cutscene');
    g.overlay.letterbox(true);
    const car = g.vehicle;
    const side = car.position.clone().add(new THREE.Vector3(-3.5, 1.6, -2.5));
    g.cine.to(side, car.position.clone().add(new THREE.Vector3(0, 1, 0)), 1200);
    await g.sleep(700);
    g.player.model.group.visible = false;
    g.audio.sfx('door');
    await g.sleep(700);
    g.audio.sfx('engineStart');
    g.cine.to(car.position.clone().add(new THREE.Vector3(-4, 2.5, -9)), car.position.clone().add(new THREE.Vector3(0, 1, 6)), 1600);
    await g.sleep(1700);
    g.cine.release();
    g.overlay.letterbox(false);
    g.busy = false;
    g.missions.setStep('find_oxygen', 4);
    g.setMode('drive');
    g.hud.hint('<b>W / S</b> drive · <b>A / D</b> steer · <b>Shift</b> boost<br>Pick up speed, then press <b>Space</b> to lift off', 15000);
  }

  async liftOff() {
    const g = this.game;
    if (this.launching) return;
    this.launching = true;
    g.busy = true;
    g.setMode('cutscene');
    g.overlay.letterbox(true);
    const car = g.vehicle;
    car.setMode('fly');
    g.audio.sfx('whoosh');
    const start = car.position.clone();
    const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));
    g.cine.to(start.clone().addScaledVector(fwd, -14).add(new THREE.Vector3(6, 1.5, 0)), () => car.position.clone(), 1800);
    g.save.state.stage = 'space';
    g.overlay.setFadeInstant(0, '#fff');
    await g.tween(5200, (k) => {
      const p = start.clone().addScaledVector(fwd, k * 60).add(new THREE.Vector3(0, Math.pow(k, 2.2) * 260, 0));
      car.position.copy(p);
      car.pitch = Math.min(1.1, k * 1.6);
      car._apply();
      car.car.setThrust(0.4 + k);
      if (k > 0.55) g.overlay.fadeEl.style.opacity = (k - 0.55) / 0.45;
    }, g.ease.in);
    g.overlay.setFadeInstant(1, '#fff');
    g.busy = false;
    await g.loadWorld('space', {});
  }

  async landingSequence() {
    const g = this.game;
    g.setMode('cutscene');
    g.overlay.letterbox(true);
    const car = g.vehicle;
    car.setMode('fly');
    const end = CAR_SPOT.clone().setY(this.terrainH(CAR_SPOT.x, CAR_SPOT.z));
    const start = end.clone().add(new THREE.Vector3(-40, 160, 90));
    car.place(start.x, start.y, start.z, Math.PI * 0.85, -0.3);
    g.cine.cut(new THREE.Vector3(30, 14, 50), start);
    g.overlay.setFadeInstant(1, '#fff');
    g.overlay.fade(0, 1800, '#fff');
    g.overlay.title('HOME', 'Home', 'The sky feels different now', 4500);
    g.cine.to(new THREE.Vector3(14, 4, 34), () => car.position.clone(), 6000, g.ease.sine);
    await g.tween(6000, (k) => {
      car.position.lerpVectors(start, end, g.ease.out(k));
      car.pitch = -0.3 * (1 - k);
      car.yaw = Math.PI * 0.85 * (1 - k);
      car._apply();
      car.car.setThrust(1 - k * 0.8);
    });
    car.setMode('ground');
    car.place(end.x, end.y, end.z, 0);
    g.audio.sfx('door');
    g.player.place(end.x - 2.4, this.terrainH(end.x - 2.4, end.z - 1), end.z - 1, Math.PI);
    g.player.model.group.visible = true;
    await g.sleep(600);
    g.cine.release();
    g.overlay.letterbox(false);
    g.player.snapCamera();
    g.setMode('walk');
    g.missions.setStep('home_again', 1);
    this.refreshMarkers();
  }

  async finale() {
    const g = this.game;
    this.finaleDone = true;
    g.busy = true;
    g.markers.clear();
    g.setMode('cutscene');
    g.overlay.letterbox(true);
    const mach = this.machine;
    const machPos = mach.localToWorld(new THREE.Vector3(0.3, 0.45, 0));
    g.cine.to(new THREE.Vector3(-4.6, FLOOR + 1.4, -0.6), machPos, 1500);
    await g.sleep(1400);
    // three cores float from the explorer into the machine
    const from = g.player.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const cores = [0, 1, 2].map(() => {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), glowMat('#ffb070', 3));
      const glow = glowSprite('#ffb070', 0.8, 0.9);
      c.add(glow);
      c.position.copy(from);
      this.scene.add(c);
      return c;
    });
    g.missions.give('oxygenCore', 0);
    for (let i = 0; i < 3; i++) {
      const target = this.slots[i].getWorldPosition(new THREE.Vector3());
      const c = cores[i], s0 = from.clone();
      g.audio.bell(72 + i * 4, 0.1);
      await g.tween(900, (k) => {
        c.position.lerpVectors(s0, target, k);
        c.position.y += Math.sin(k * Math.PI) * 0.5;
      });
      c.removeFromParent();
      this.slots[i].visible = true;
    }
    g.audio.sfx('machine');
    this.statusLight.material.color.set('#5fe0a0').multiplyScalar(3);
    const warm = new THREE.Color('#ffb870');
    await g.tween(3500, (k) => {
      this.o2 = 11 + k * 89;
      this.breath = 0.6 + k * 0.4;
      this.bedLamp.intensity = 3 + k * 6;
      this.livingLamp.intensity = 4 + k * 5;
      this.tableLamp.intensity = 4 + k * 5;
      this.bedLamp.color.lerp(warm, k * 0.1);
      g.engine.setGrade({ ...this.grade, warmth: k * 0.6, exposure: 1 + k * 0.12 });
    });
    this.drawScreen();
    g.cine.to(new THREE.Vector3(-4.8, FLOOR + 1.6, -2.3), new THREE.Vector3(-6.4, FLOOR + 1.0, -3.3), 2500);
    await g.sleep(2000);
    // she opens her eyes
    this.momBed.remove(this.mother.group);
    this.mother = buildCharacter({ gender: 'female', top: '#d8c6e6', bottom: '#e9e0f2', hair: '#5d4c46', skin: '#efcfb4' });
    this.mother.group.rotation.x = -Math.PI / 2 + 0.5;
    this.momBed.add(this.mother.group);
    g.audio.bell(76, 0.1);
    await g.sleep(900);
    const name = g.content.npcs.mother.name;
    await g.dialogue.say([
      { who: name, text: 'You came back.' },
      { who: 'player', text: 'I promised I would.' },
    ]);
    g.save.state.inventory.oxygenCore = 0;
    g.missions.complete('home_again');
    g.missions.complete('find_oxygen');
    g.save.state.stage = 'complete';
    g.save.save();
    // later that evening…
    await g.overlay.fade(1, 1400);
    await g.overlay.caption('That evening, she cooked for the first time in months.', 3200);
    this.setupDinner();
    g.overlay.fade(0, 1500);
    g.cine.cut(new THREE.Vector3(3.8, FLOOR + 1.45, 3.7), new THREE.Vector3(3.8, FLOOR + 1.0, 2.4));
    g.cine.to(new THREE.Vector3(2.6, FLOOR + 1.35, 3.4), new THREE.Vector3(3.8, FLOOR + 1.05, 2.4), 9000, g.ease.sine);
    await g.sleep(1600);
    const npcs = g.content.npcs;
    await g.dialogue.say([
      { who: name, text: 'Eat. And tell me everything.' },
      { who: 'player', text: `There was a farmer, ${npcs.farmer.name}. His fields went on forever, under a golden ring in the sky.` },
      { who: 'player', text: 'In a city made of light, there were children nobody had ever taught. So I taught them.' },
      { who: 'player', text: 'And by a lake like a mirror, a village had forgotten what a full granary looked like. We fished until it was full.' },
      { who: name, text: 'You helped all of them?' },
      { who: 'player', text: 'Every time I helped someone, I felt stronger. Like every world was bringing me closer to you.' },
      { who: name, text: 'Then eat, love. Someone, somewhere, will need that strength again.' },
    ]);
    g.busy = false;
    await this.finalShot(false);
  }

  setupDinner() {
    this.bowls.visible = true;
    this.momBed.visible = false;
    this.steam = makeMotes({ count: 30, center: new THREE.Vector3(3.8, FLOOR + 0.95, 2.4), spread: new THREE.Vector3(1.0, 0.8, 0.3), color: '#ffffff', size: 8, opacity: 0.35, rise: 0.3 });
    this.add(this.steam);
    const g = this.game;
    const seat = (c, x, facing) => {
      c.group.position.set(x, FLOOR + 0.05, 2.4);
      c.group.rotation.y = facing;
      c.sit();
      c.group.position.y = FLOOR - 0.34;
    };
    const mom = buildCharacter({ gender: 'female', top: '#d8c6e6', bottom: '#e9e0f2', hair: '#5d4c46', skin: '#efcfb4' });
    this.scene.add(mom.group);
    seat(mom, 5.05, -Math.PI / 2);
    this.dinnerMom = mom;
    const pl = g.player.model;
    seat(pl, 2.55, Math.PI / 2);
    this.animate((t, _c, _p, dt) => { pl.animate(dt, 0, t); mom.animate(dt, 0, t); pl.parts.elbowR.rotation.x = -1.1 + Math.sin(g.time * 1.3) * 0.25; });
  }

  async finalShot(fromResume) {
    const g = this.game;
    this.finaleDone = true;
    g.setMode('cutscene');
    g.markers.clear();
    g.overlay.letterbox(true);
    if (fromResume) {
      this.setupDinner();
      g.overlay.fade(0, 1500);
    }
    this.inside = false;
    // out through the front window into the night, the whole universe overhead
    g.cine.to(new THREE.Vector3(-3.9, FLOOR + 1.6, 4.6), new THREE.Vector3(-3.9, FLOOR + 1.7, 12), 3000);
    await g.sleep(2600);
    this.roof.visible = true;
    const u = this.sky.material.uniforms;
    this.bh.visible = true;
    const top0 = u.top.value.clone(), mid0 = u.mid.value.clone(), hor0 = u.horizon.value.clone();
    const night = { top: new THREE.Color('#050818'), mid: new THREE.Color('#10204a'), horizon: new THREE.Color('#e0805a') };
    g.tween(9000, (k) => {
      u.top.value.lerpColors(top0, night.top, k);
      u.mid.value.lerpColors(mid0, night.mid, k);
      u.horizon.value.lerpColors(hor0, night.horizon, k * 0.6);
      u.stars.value = k * 1.4;
      this.lights.sun.intensity = this.palette.sunInt * (1 - k * 0.85);
      this.lights.hemi.intensity = 1.15 * (1 - k * 0.6);
      this.scene.fog.color.lerp(new THREE.Color('#1a1f3a'), k * 0.05);
      this.windowGlow.forEach((w) => (w.material.opacity = k * 0.9));
      this.ring.material.uniforms.opacity.value = 0.3 + k * 0.6;
    });
    g.cine.to(new THREE.Vector3(-9, 5, 34), new THREE.Vector3(-3, 18, -10), 7000, g.ease.sine);
    await g.sleep(6500);
    g.cine.to(new THREE.Vector3(-14, 7, 62), new THREE.Vector3(-60, 160, -600), 12000, g.ease.sine);
    await g.sleep(5000);
    g.audio.setMood('finale');
    g.hud.show(false);
    g.overlay.ending('Helping others gives us the strength to save the people we love.', 'THE END', () => g.restart());
  }

  update(dt, t) {
    super.update(dt, t);
    const g = this.game;
    const p = g.player.position;
    this.lights.follow(g.mode === 'drive' ? g.vehicle.position : p);
    if (this.grass) this.grass.userData.update(t, null, g.mode === 'walk' ? p : g.vehicle.position);
    // roof hides when inside, so the third-person camera can see
    if (g.mode === 'walk' || g.mode === 'cutscene') {
      const inside = g.mode === 'walk' ? p.x > HOUSE.x0 && p.x < HOUSE.x1 && p.z > HOUSE.z0 && p.z < HOUSE.z1 : this.inside;
      if (g.mode === 'walk') this.inside = inside;
      this.roof.visible = !inside;
      g.player.camDistTarget = clamp(g.player.camDistTarget, 2.2, inside ? 3.6 : 8);
      g.player.maxPitch = inside ? 0.9 : 1.15;
    }
    // breathing
    const b = this.breath;
    const irregular = b < 0.9 ? Math.sin(t * 0.7) * 0.4 : 0;
    const chest = Math.sin(t * (1.4 + irregular)) * 0.02 * b;
    this.mother.group.position.y = chest;
    this.bellows.scale.z = 1 + Math.sin(t * (1.4 + irregular)) * 0.25;
    this.statusLight.visible = this.o2 > 60 || Math.sin(t * 6) > 0;
    this._scr = (this._scr || 0) + dt;
    if (this._scr > 0.12) { this._scr = 0; this.drawScreen(); }
    this.holoHand.rotation.z = -t * 0.5;
    this.holoHand.position.x = -1.8 + Math.sin(-t * 0.5) * 0.09;
    this.holoHand.position.y = FLOOR + 2.1 + Math.cos(-t * 0.5) * 0.09;
    if (this.dinnerMom) this.dinnerMom.parts.head.rotation.x = Math.sin(t * 0.8) * 0.05;

    const M = g.missions;
    if (g.mode === 'walk' && !this.returning && M.step('find_oxygen') === 2 && this.doorOpen && p.z > 6) {
      M.setStep('find_oxygen', 3);
      this.refreshMarkers();
      g.overlay.toast('The car is waiting');
    }
    if (g.mode === 'drive' && !this.launching) {
      const fast = Math.abs(g.vehicle.speed) > 8;
      g.hud.prompt(fast ? 'Lift off' : 'Pick up speed to lift off', 'SPACE');
      if (fast && g.input.hit('Space')) this.liftOff();
    }
  }
}
