// WORLD 03 — HUNGER WORLD. A dry, cracked land around a vast mirror lake that reflects
// the whole universe. Mission: FEED THE WORLD — gather, repair the dock, fish, cook, deliver.
import * as THREE from 'three';
import { World } from './base.js';
import {
  addLights, makeSky, makeClouds, makeTerrain, makeGrass, makeForest, makeMountain, makeRocks,
  makeMotes, makeMirrorLake, toon, glowMat, glowSprite, box, cyl, sphere, canvasTexture,
} from '../world/kit.js';
import { makeBlackHole, makeStarfield } from '../world/cosmic.js';
import { makeNPC } from '../systems/character.js';
import { boxCollider } from '../systems/physics.js';
import { fbm, mulberry32, smoothstep } from '../core/noise.js';
import { wait } from '../ui/overlay.js';
import { arrival, rewardCore, addReturnCar } from './common.js';
import * as D from '../world/details.js';

const LAKE_R = 70;
const DOCK = { x0: 46, x1: 72, z: -20, w: 3 };
const VILLAGE = new THREE.Vector3(96, 0, 0);
const FIRE = new THREE.Vector3(90, 0, 6);
const GRANARY = new THREE.Vector3(104, 0, -12);
const ELDER = new THREE.Vector3(88, 0, 12);

export default class HungerWorld extends World {
  constructor(game, id) {
    super(game, id);
    this.mood = 'hunger';
    this.bloom = { strength: 0.8, radius: 0.7, threshold: 0.7 };
    this.grade = { vignette: 0.5, warmth: 0.08, saturation: 1.05, exposure: 1.12 };
  }

  terrainH(x, z) {
    const r = Math.hypot(x, z);
    if (r < LAKE_R - 2) return -2.5;
    let h = smoothstep(LAKE_R - 6, LAKE_R + 4, r) * 3.4 - 2.5 + smoothstep(LAKE_R + 4, LAKE_R + 16, r) * 0.6;
    h += smoothstep(120, 240, r) * (fbm(x * 0.01, z * 0.01, 4) * 30 + 14);
    h += fbm(x * 0.05, z * 0.05, 2) * 0.6 * smoothstep(LAKE_R, LAKE_R + 20, r);
    return h;
  }

  dockLen() { return this.dockFixed ? DOCK.x1 - DOCK.x0 : 6; }

  groundAt(x, z) {
    const r = Math.hypot(x, z);
    if (r > 200) return null;
    if (Math.abs(z - DOCK.z) < DOCK.w / 2 && x <= DOCK.x1 + 2 && x >= DOCK.x1 - this.dockLen()) return 0.6;
    if (r < LAKE_R + 0.5) return null;
    return this.terrainH(x, z);
  }

  async build() {
    const s = this.scene;
    const g = this.game;
    const q = matchMedia('(pointer: coarse)').matches ? 0.4 : 1;
    this.dockFixed = g.missions.step('feed_world') >= 3 || g.missions.status('feed_world') === 'complete';
    const sunDir = new THREE.Vector3(0.7, 0.16, -0.65).normalize();
    this.sunDir = sunDir;
    s.fog = new THREE.FogExp2('#3a2e3e', 0.0014);
    this.lights = addLights(s, { sunDir, sunColor: '#ffb070', sunIntensity: 2.0, sky: '#6a78b8', ground: '#4a3428', hemi: 1.1, ambient: 0.35 });
    this.add(makeSky({ top: '#070a1e', mid: '#1c2352', horizon: '#e0784a', bottom: '#2a1c24', sunDir, sunColor: '#ffae6a', glow: '#f2703c', glowAmt: 1.2, cirrus: 0.15, stars: 1.2 }));
    this.add(makeStarfield({ count: 3000, radius: 3500, size: 2 }));
    const bh = makeBlackHole({ size: 150, tilt: 0.35, dust: 1500, seed: 9 });
    bh.position.set(-900, 500, -1800);
    this.add(bh);
    this.add(makeClouds({ count: 14, seed: 13, rMin: 300, rMax: 900, yMin: 80, yMax: 180, sMin: 30, sMax: 70, lit: '#ffc8a0', shadow: '#3a3050', rimColor: '#ff9a5a' }));

    // mirror lake — the whole universe in the water
    const lake = makeMirrorLake({ radius: LAKE_R + 2, tint: '#0a1224', res: q < 1 ? 512 : 1024 });
    lake.position.y = 0;
    this.add(lake);

    // cracked earth
    const crack = canvasTexture(512, 512, (c, w, h) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
      const rng = mulberry32(3);
      c.strokeStyle = 'rgba(40,24,16,0.85)';
      for (let i = 0; i < 70; i++) {
        let x = rng() * w, y = rng() * h;
        c.lineWidth = 1 + rng() * 2.5;
        c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 90; y += (rng() - 0.5) * 90; c.lineTo(x, y); }
        c.stroke();
      }
    });
    crack.wrapS = crack.wrapT = THREE.RepeatWrapping;
    crack.repeat.set(60, 60);
    const dry = new THREE.Color('#9a7a58'), dark = new THREE.Color('#2a2226'), dust = new THREE.Color('#b8956a'), moss = new THREE.Color('#5a6a3a');
    const ter = makeTerrain({
      size: 440, seg: 200,
      heightAt: (x, z) => this.terrainH(x, z),
      colorAt: (x, z, h, c) => {
        const r = Math.hypot(x, z);
        c.copy(dry).lerp(dust, fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5);
        c.lerp(dark, smoothstep(LAKE_R + 16, LAKE_R, r));
        if (x < -60 && r > 90) c.lerp(moss, 0.5);
      },
    });
    ter.material.map = crack;
    ter.material.needsUpdate = true;
    this.add(ter);

    const rng = mulberry32(31);
    this.add(makeGrass({
      count: Math.floor(14000 * q),
      sample: (r2) => { const a = r2() * Math.PI * 2, rr = LAKE_R + 2 + r2() * 90; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; return x < 0 || r2() < 0.25 ? [x, z] : null; },
      heightAt: (x, z) => this.terrainH(x, z), base: '#4a4a2a', tip: '#b8a060', h: [0.3, 0.8], sunDir, wind: 1.4,
    }));

    // sparse forest (west)
    const trees = [];
    for (let i = 0; i < 70; i++) {
      const a = Math.PI * (0.55 + rng() * 0.9), r = 90 + rng() * 90;
      trees.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: this.terrainH(Math.cos(a) * r, Math.sin(a) * r) - 0.2, s: 1 + rng() * 0.8, kind: rng() < 0.5 ? 'pine' : 'round', palette: rng() < 0.6 ? 'dry' : 'pine' });
    }
    this.add(makeForest(trees, { sunDir, seed: 7 }));
    const rocks = [];
    for (let i = 0; i < 40; i++) { const a = rng() * 6.28, r = LAKE_R + 8 + rng() * 110; rocks.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: this.terrainH(Math.cos(a) * r, Math.sin(a) * r), s: 0.5 + rng() * 2 }); }
    this.add(makeRocks(rocks, { color: '#5a5058', top: '#8a7a78', moss: '#6a6a3a' }));
    for (const m of [{ x: -420, z: -620, r: 240, h: 240, seed: 2 }, { x: 480, z: -580, r: 220, h: 210, seed: 5 }, { x: -640, z: 200, r: 200, h: 170, seed: 8 }, { x: 580, z: 450, r: 240, h: 180, seed: 11 }]) {
      s.add(makeMountain({ ...m, y: -5, forest: '#3a3030', rock: '#5a4a5a', snowCol: '#d8c8d8', snow: 0.8 }));
    }
    // floating rock islands over the lake
    for (let i = 0; i < 5; i++) {
      const a = rng() * 6.28, r = 20 + rng() * 40;
      const isl = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.ConeGeometry(4 + rng() * 4, 10, 7), toon('#4a4048'));
      rock.rotation.x = Math.PI;
      isl.add(rock);
      isl.add(cyl(4.5, 4.5, 0.6, '#6a6a3a', 0, 5, 0, 10));
      isl.position.set(Math.cos(a) * r, 18 + rng() * 20, Math.sin(a) * r);
      const y0 = isl.position.y, ph = rng() * 6;
      isl.userData.update = (t) => (isl.position.y = y0 + Math.sin(t * 0.3 + ph) * 1.2);
      this.add(isl);
    }
    this.add(makeMotes({ count: 300, center: new THREE.Vector3(60, 0, 0), spread: new THREE.Vector3(120, 10, 120), color: '#ffc070', size: 5, opacity: 0.9, rise: 0.1 }));

    this.buildVillage(rng);
    this.buildResources();
    this.decorate(q);
  }

  decorate(q) {
    const s = this.scene, sunDir = this.sunDir;
    const H = (x, z) => this.terrainH(x, z);
    const nearDock = (x, z) => Math.abs(z - DOCK.z) < 5 && x > DOCK.x0 - 6;
    // reeds along the shore
    this.add(makeGrass({
      count: Math.floor(5000 * q),
      sample: (rng) => { const a = rng() * 6.28, r = LAKE_R - 1 + rng() * 6; const x = Math.cos(a) * r, z = Math.sin(a) * r; return nearDock(x, z) ? null : [x, z]; },
      heightAt: (x, z) => Math.max(-0.3, H(x, z)), base: '#3a4a2a', tip: '#c9b27a', h: [1.0, 2.2], w: 0.07, head: true, seed: 41, wind: 1.2, sunDir,
    }));
    // boats: one out on the water, two pulled ashore
    const floating = D.boat(30, 0.05, -35, 0.8);
    floating.userData.update = (t) => { floating.position.y = 0.05 + Math.sin(t * 1.2) * 0.06; floating.rotation.z = Math.sin(t * 0.9) * 0.04; };
    this.add(floating);
    this.add(D.boat(79, H(79, 22) - 0.1, 22, 1.9, '#6b4b33', '#3f6fa8'));
    this.add(D.boat(78, H(78, -32) - 0.1, -32, -1.2, '#7a5a3e', '#e0b45c'));
    this.colliders.push({ type: 'circle', x: 79, z: 22, r: 2 }, { type: 'circle', x: 78, z: -32, r: 2 });
    // village life
    this.add(D.dryingRack(84, H(84, -8), -8, 0.3), D.dryingRack(110, H(110, 18), 18, -0.8));
    for (const [x, z, sc] of [[100, -18, 0.8], [101, -17.2, 0.6], [108, -6, 0.7]]) this.add(D.crate(x, H(x, z), z, sc, x));
    for (const [x, z] of [[99, -15.5], [92, 18], [106, 8]]) this.add(D.barrel(x, H(x, z), z, 0.85, '#5a4030'));
    this.add(D.woodpile(86, H(86, 2), 2, 0.6));
    const vl = (x, z, y = 3.6) => new THREE.Vector3(x, H(x, z) + y, z);
    s.add(D.stringLights(vl(96, 18), vl(108, 14), { bulbs: 9, color: '#ffb060' }));
    s.add(D.stringLights(vl(108, 14), vl(114, 2), { bulbs: 7, color: '#ffb060' }));
    s.add(D.stringLights(vl(94, -24), vl(110, -8), { bulbs: 11, color: '#ffb060' }));
    for (const [x, z] of [[82, 8], [86, -14], [74, -20]]) this.add(D.lampPost(x, H(x, z), z, { color: '#4a3426', glow: '#ffa050', height: 2.6 }));
    // driftwood and cairns on the dry land
    const drift = [];
    for (let i = 0; i < 18; i++) { const a = i * 0.9 + 0.3, r = LAKE_R + 3 + (i % 4) * 2; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (!nearDock(x, z)) drift.push({ x, y: H(x, z) + 0.12, z, s: 1, ry: a + 1.2, rz: Math.PI / 2, sy: 1.2 + (i % 3) * 0.5 }); }
    s.add(D.scatter(new THREE.CylinderGeometry(0.12, 0.16, 1.6, 7), toon('#9a8a78'), drift));
    for (const [x, z] of [[-40, 90], [30, 100], [-95, -20], [60, -90], [-20, -110], [110, 60]]) this.add(D.cairn(x, H(x, z), z, 4 + (Math.abs(x) % 3)));
    // western forest floor and the shoreline
    const west = (r0, r1) => (rng) => { const a = Math.PI * (0.55 + rng() * 0.9), r = r0 + rng() * (r1 - r0); return [Math.cos(a) * r, Math.sin(a) * r]; };
    this.add(D.makeBushes(D.samplePoints(Math.floor(90 * q), west(85, 170), H, 51), { sunDir, palette: ['#5a6a3a', '#6b7a44', '#7a7a4a'] }));
    s.add(D.makeFerns(D.samplePoints(Math.floor(100 * q), west(85, 160), H, 52), { color: '#5a6a3a' }));
    s.add(D.makeMushrooms(D.samplePoints(50, west(90, 150), H, 53)));
    s.add(D.makePebbles(D.samplePoints(320, (rng) => { const a = rng() * 6.28, r = LAKE_R + 1 + rng() * 14; const x = Math.cos(a) * r, z = Math.sin(a) * r; return nearDock(x, z) ? null : [x, z]; }, H, 54), '#6a6070'));
    this.add(D.makeBirds({ count: 12, center: new THREE.Vector3(0, 40, 0), radius: 90, color: '#1a1420' }));
  }

  buildVillage(rng) {
    const s = this.scene;
    const V = VILLAGE;
    const houses = [[0, 18], [12, 14], [18, 2], [14, -18], [-2, -24], [22, -8]];
    for (const [dx, dz] of houses) {
      const x = V.x + dx, z = V.z + dz, y = this.terrainH(x, z);
      const h = new THREE.Group();
      h.position.set(x, y, z);
      for (const [px, pz] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) h.add(cyl(0.15, 0.15, 1.2, '#4a3426', px, 0.6, pz));
      h.add(box(4.6, 2.4, 3.8, '#7a5a3e', 0, 2.4, 0));
      const r1 = box(5.2, 0.2, 2.5, '#5a4030', 0, 3.9, 0.95); r1.rotation.x = 0.5; h.add(r1);
      const r2 = box(5.2, 0.2, 2.5, '#5a4030', 0, 3.9, -0.95); r2.rotation.x = -0.5; h.add(r2);
      h.add(box(0.8, 0.7, 0.1, null, 1.2, 2.6, 1.92, glowMat('#ffa050', 1.2)));
      h.rotation.y = Math.atan2(V.x - x, V.z - z) + rng() * 0.3;
      s.add(h);
      this.colliders.push({ type: 'circle', x, z, r: 2.8 });
    }
    // empty granary
    const gy = this.terrainH(GRANARY.x, GRANARY.z);
    const gr = new THREE.Group();
    gr.position.set(GRANARY.x, gy, GRANARY.z);
    gr.add(box(6, 0.3, 5, '#5a4030', 0, 0.15, 0));
    gr.add(box(0.2, 3.5, 5, '#6a4a34', -3, 1.9, 0));
    gr.add(box(0.2, 3.5, 5, '#6a4a34', 3, 1.9, 0));
    gr.add(box(6.2, 3.5, 0.2, '#6a4a34', 0, 1.9, -2.5));
    const gr1 = box(6.8, 0.2, 3, '#4a3426', 0, 4.1, 1.1); gr1.rotation.x = 0.45; gr.add(gr1);
    const gr2 = box(6.8, 0.2, 3, '#4a3426', 0, 4.1, -1.1); gr2.rotation.x = -0.45; gr.add(gr2);
    for (const y of [1, 2.1]) gr.add(box(5.6, 0.1, 1, '#8a6a4a', 0, y, -1.9));
    this.granaryFood = [];
    for (let i = 0; i < 14; i++) {
      const b = cyl(0.3, 0.25, 0.35, '#c9a060', -2.4 + (i % 7) * 0.8, i < 7 ? 1.25 : 2.35, -1.9);
      b.visible = false;
      gr.add(b);
      this.granaryFood.push(b);
    }
    gr.rotation.y = -Math.PI / 2 + 0.3;
    s.add(gr);
    this.colliders.push(boxCollider(GRANARY.x, GRANARY.z, 5.5, 6.5));
    // fire pit
    const fy = this.terrainH(FIRE.x, FIRE.z);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; s.add(sphere(0.3, '#5a5058', FIRE.x + Math.cos(a) * 1, fy + 0.15, FIRE.z + Math.sin(a) * 1)); }
    for (let i = 0; i < 3; i++) { const l = cyl(0.1, 0.1, 1.4, '#3a2a20', FIRE.x, fy + 0.2, FIRE.z); l.rotation.set(Math.PI / 2, i, 0.2); s.add(l); }
    this.fireLight = new THREE.PointLight('#ff8a3a', 4, 16, 1.5);
    this.fireLight.position.set(FIRE.x, fy + 1.2, FIRE.z);
    s.add(this.fireLight);
    this.flame = glowSprite('#ff8a3a', 1.5, 0.6);
    this.flame.position.set(FIRE.x, fy + 0.7, FIRE.z);
    s.add(this.flame);
    this.fireBig = false;
    this.colliders.push({ type: 'circle', x: FIRE.x, z: FIRE.z, r: 1.2 });
    // dock: posts always, planks after repair
    this.planks = [];
    for (let x = DOCK.x0; x <= DOCK.x1; x += 2) {
      for (const dz of [-1.4, 1.4]) s.add(cyl(0.14, 0.14, 4, '#3a2a20', x, -1.4, DOCK.z + dz));
    }
    for (let x = DOCK.x0; x <= DOCK.x1 + 1; x += 0.7) {
      const p = box(0.6, 0.12, DOCK.w, '#8a6a4a', x, 0.55, DOCK.z);
      p.visible = x >= DOCK.x1 - 6 || this.dockFixed;
      s.add(p);
      this.planks.push(p);
    }
    // villagers
    const c = this.game.content.npcs;
    this.elder = makeNPC(this, { gender: 'female', elder: true, top: '#8a5a4a', robe: '#6a4a3a', scarf: '#a9203e', position: ELDER.clone().setY(this.terrainH(ELDER.x, ELDER.z)), yaw: -2.2 });
    this.elderName = c.elder.name;
    const vs = [[100, 16, 3], [108, 4, -1.5], [84, -6, 1], [98, -20, 0.5], [110, 10, -2]];
    vs.forEach(([x, z, yaw], i) => makeNPC(this, { lite: true, gender: i % 2 ? 'male' : 'female', child: i === 3, top: ['#7a6a5a', '#6a5a4a', '#8a6a5a'][i % 3], bottom: '#5a4a3a', hair: '#2a1b17', position: new THREE.Vector3(x, this.terrainH(x, z), z), yaw, phase: i }));
  }

  buildResources() {
    const g = this.game;
    const st = g.missions.get('feed_world');
    const done = new Set(st?.data?.gathered || []);
    this.resources = [];
    // wood that already lies on the ground: fallen branches under the old trees and driftwood on the shore
    const woodSpots = [[80, 38, 'branch'], [72, 44, 'branch'], [92, 40, 'branch'], [66, 30, 'drift'], [100, 32, 'drift']];
    const stoneSpots = [[78, -40], [88, -44], [70, -48], [96, -36], [60, -40]];
    const s = this.scene;
    woodSpots.forEach(([x, z, kind], i) => {
      const y = this.terrainH(x, z);
      // the tree stays standing — only its fallen wood is gathered
      if (kind === 'branch') {
        const tree = new THREE.Group();
        tree.position.set(x + 1.6, this.terrainH(x + 1.6, z - 1.2), z - 1.2);
        tree.add(cyl(0.3, 0.45, 4, '#5a4030', 0, 2, 0, 8));
        for (let k = 0; k < 4; k++) { const br = cyl(0.06, 0.12, 1.8, '#5a4030', 0, 3 + k * 0.3, 0, 5); br.rotation.set(0.9, k * 1.6, 0); br.position.x = Math.cos(k * 1.6) * 0.4; br.position.z = Math.sin(k * 1.6) * 0.4; tree.add(br); }
        tree.add(sphere(1.3, '#8a8a4a', 0, 4.4, 0));
        s.add(tree);
        this.colliders.push({ type: 'circle', x: x + 1.6, z: z - 1.2, r: 0.5 });
      }
      const pile = new THREE.Group();
      pile.position.set(x, y, z);
      const col = kind === 'drift' ? '#b8ab98' : '#6b4b33';
      for (let k = 0; k < (kind === 'drift' ? 3 : 5); k++) {
        const len = kind === 'drift' ? 1.6 - k * 0.3 : 1.1 + (k % 2) * 0.4;
        const stick = cyl(kind === 'drift' ? 0.13 : 0.06, kind === 'drift' ? 0.16 : 0.08, len, col, 0, 0.1 + k * 0.06, 0, 6);
        stick.rotation.set(Math.PI / 2, 0, k * 0.9);
        pile.add(stick);
      }
      if (kind === 'branch') for (let k = 0; k < 3; k++) { const tw = cyl(0.02, 0.03, 0.5, col, -0.3 + k * 0.3, 0.2, 0.2, 4); tw.rotation.set(0.8, k, 0.6); pile.add(tw); }
      const glint = glowSprite('#ffd8a0', 1.3, 0.45);
      glint.position.y = 0.5;
      pile.add(glint);
      s.add(pile);
      const id = 'w' + i;
      const r = { id, kind: 'wood', obj: pile, label: kind === 'drift' ? 'Collect driftwood' : 'Gather fallen branches', pos: new THREE.Vector3(x, y, z), taken: done.has(id) };
      pile.visible = !r.taken;
      this.resources.push(r);
    });
    stoneSpots.forEach(([x, z], i) => {
      const y = this.terrainH(x, z);
      const st2 = sphere(0.45, '#9a92a0', x, y + 0.25, z);
      st2.scale.set(1.2, 0.7, 1);
      const glint = glowSprite('#bfe0ff', 1.2, 0.5);
      glint.position.y = 0.6;
      st2.add(glint);
      s.add(st2);
      const id = 's' + i;
      const r = { id, kind: 'stone', obj: st2, pos: new THREE.Vector3(x, y, z), taken: done.has(id) };
      st2.visible = !r.taken;
      this.resources.push(r);
    });
  }

  async enter(opts) {
    const g = this.game, M = g.missions;
    this.setupInteractions();
    this.updateGranary();
    await arrival(this, {
      car: { x: 6, z: 102, yaw: Math.PI }, player: { x: 9, z: 98, yaw: Math.PI * 0.8 },
      from: new THREE.Vector3(-40, 50, 190), to: new THREE.Vector3(10, 10, 130), look: new THREE.Vector3(0, 4, 0), ms: opts.resume ? 3000 : 8500,
    });
    if (!M.get('feed_world')) {
      M.start('feed_world', { gathered: [] });
      g.hud.hint('The village lies to the <b>east</b> of the lake', 8000);
    }
    this.refreshMarkers();
  }

  refreshMarkers() {
    const g = this.game, M = g.missions, def = g.content.missions.feed_world;
    g.markers.clear();
    const up = (v, y = 2.2) => v.clone().setY(this.terrainH(v.x, v.z) + y);
    if (M.status('feed_world') === 'complete') { g.markers.set('car', () => g.vehicle.position.clone().add(new THREE.Vector3(0, 2, 0))); return; }
    const step = M.step('feed_world');
    const inv = g.save.state.inventory;
    if (step === 0) g.markers.set('elder', () => this.elder.group.position.clone().add(new THREE.Vector3(0, 2.1, 0)));
    else if (step === 1) {
      for (const r of this.resources) {
        if (r.taken) continue;
        if (r.kind === 'wood' && inv.wood >= def.wood) continue;
        if (r.kind === 'stone' && inv.stone >= def.stone) continue;
        g.markers.set(r.id, r.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), { size: 0.03 });
      }
    } else if (step === 2) g.markers.set('dock', new THREE.Vector3(DOCK.x1, 1.8, DOCK.z));
    else if (step === 3) g.markers.set('fish', new THREE.Vector3(DOCK.x0 + 1, 1.8, DOCK.z));
    else if (step === 4) g.markers.set('fire', up(FIRE, 1.8));
    else if (step === 5) g.markers.set('granary', up(GRANARY, 4.6));
  }

  setupInteractions() {
    const g = this.game, M = g.missions, I = g.interactions;
    const def = g.content.missions.feed_world;
    const walking = () => g.mode === 'walk';
    const inv = () => g.save.state.inventory;
    I.add({ pos: () => this.elder.group.position, radius: 2.6, label: `Talk to ${this.elderName}`, enabled: walking, action: () => this.talkElder() });
    for (const r of this.resources) {
      I.add({
        pos: r.pos, radius: 1.9,
        label: r.label || 'Collect stone',
        enabled: () => walking() && !r.taken && M.step('feed_world') === 1 && inv()[r.kind] < def[r.kind],
        action: () => this.gather(r),
      });
    }
    I.add({
      pos: new THREE.Vector3(DOCK.x1, 0.6, DOCK.z), radius: 3,
      label: () => `Repair the dock (${def.wood} wood, ${def.stone} stone)`,
      enabled: () => walking() && M.step('feed_world') === 2,
      action: () => this.repairDock(),
    });
    I.add({
      pos: () => new THREE.Vector3(DOCK.x0 + 1, 0.6, DOCK.z), radius: 2.6, label: 'Fish',
      enabled: () => walking() && M.step('feed_world') === 3 && this.dockFixed,
      action: () => this.fish(),
    });
    I.add({ pos: FIRE, radius: 2.8, label: () => `Cook ${inv().fish} fish`, enabled: () => walking() && M.step('feed_world') === 4 && inv().fish > 0, action: () => this.cook() });
    I.add({ pos: GRANARY, radius: 4.5, label: () => `Deliver ${inv().food} food`, enabled: () => walking() && M.step('feed_world') === 5, action: () => this.deliver() });
    I.add({ pos: GRANARY, radius: 4.5, label: 'Observe · Granary', enabled: () => walking() && M.step('feed_world') < 5 && M.status('feed_world') !== 'complete', action: () => g.dialogue.say([{ who: 'player', text: 'Empty shelves. Dust where the grain should be.' }]) });
    addReturnCar(this);
  }

  async talkElder() {
    const g = this.game, M = g.missions;
    const npc = g.content.npcs.elder, name = npc.name, def = g.content.missions.feed_world;
    const ep = this.elder.group.position;
    const cam = { pos: ep.clone().add(new THREE.Vector3(-2.6, 2, -2.2)), target: ep.clone().add(new THREE.Vector3(0, 1.3, 0)), ms: 1200 };
    const step = M.step('feed_world');
    if (M.status('feed_world') === 'complete') {
      await g.dialogue.say([{ who: name, text: 'Listen — the children are laughing. That sound has been missing a long time.', cam }]);
    } else if (step === 0) {
      await g.dialogue.say([
        { who: name, text: 'A stranger, stepping out of the dark star. Forgive us — we have nothing to offer a guest.', cam },
        { who: name, text: npc.greet },
        { who: 'player', text: 'Then let me help. What do you need?' },
        { who: name, text: `Gather wood and stone — ${def.wood} of each — to mend the dock. Don\'t cut our trees; the wind has already dropped branches, and the lake leaves driftwood on the shore.` },
        { who: name, text: 'Then fish, the fire, and the granary.' },
      ]);
      M.setStep('feed_world', 1);
      g.audio.sfx('mission');
      g.overlay.banner('Mission', def.title, def.description, 3200);
    } else {
      const hints = ['', 'Fallen branches lie under the old trees to the north-east, and driftwood on the shore. Stones are to the south-east. Leave the living trees be.', 'Take the wood and stone to the end of the broken dock.', 'The fish rise near the end of the dock. Be patient.', 'The fire is ready. Cook what you caught.', 'The granary is just behind me.'];
      await g.dialogue.say([{ who: name, text: hints[step] || 'Thank you, child.', cam }]);
    }
    g.cine.release();
    this.refreshMarkers();
  }

  gather(r) {
    const g = this.game, M = g.missions, def = g.content.missions.feed_world;
    r.taken = true;
    const st = M.get('feed_world');
    st.data.gathered = [...(st.data.gathered || []), r.id];
    M.give(r.kind, 1);
    if (r.kind === 'wood') {
      g.audio.sfx('pickup');
      const o = r.obj, y0 = o.position.y;
      g.tween(500, (k) => { o.position.y = y0 + k * 0.8; o.scale.setScalar(1 - k * 0.9); }).then(() => (o.visible = false));
    } else {
      g.audio.sfx('stone');
      const o = r.obj, y0 = o.position.y;
      g.tween(400, (k) => { o.position.y = y0 + k; o.scale.multiplyScalar(0.93); }).then(() => (o.visible = false));
    }
    const inv = g.save.state.inventory;
    g.overlay.toast(`Wood ${Math.min(inv.wood, def.wood)}/${def.wood} · Stone ${Math.min(inv.stone, def.stone)}/${def.stone}`);
    if (inv.wood >= def.wood && inv.stone >= def.stone) {
      M.setStep('feed_world', 2);
      g.overlay.toast('Take the materials to the broken dock', 3000);
    }
    this.refreshMarkers();
  }

  async repairDock() {
    const g = this.game, M = g.missions, def = g.content.missions.feed_world;
    g.busy = true;
    M.give('wood', -def.wood);
    M.give('stone', -def.stone);
    g.setMode('cutscene');
    g.cine.to(new THREE.Vector3(DOCK.x1 + 6, 5, DOCK.z + 10), new THREE.Vector3(DOCK.x0 + 8, 0, DOCK.z), 1500);
    const hidden = this.planks.filter((p) => !p.visible).reverse();
    for (let i = 0; i < hidden.length; i++) {
      hidden[i].visible = true;
      if (i % 3 === 0) g.audio.sfx('chop');
      await g.sleep(90);
    }
    this.dockFixed = true;
    g.cine.release();
    g.setMode('walk');
    g.busy = false;
    M.setStep('feed_world', 3);
    g.overlay.toast('The dock is whole again — go fishing', 3000);
    this.refreshMarkers();
  }

  /** Timing minigame: press E when the line crosses the glowing zone. */
  fishingRound() {
    const g = this.game;
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'fish';
      const zw = 16 + Math.random() * 8, zx = 15 + Math.random() * (80 - zw);
      el.innerHTML = `<div class="lbl">A fish is biting — press E in the glow</div><div class="bar"><div class="zone" style="left:${zx}%;width:${zw}%"></div><div class="needle"></div></div>`;
      g.ui.appendChild(el);
      const needle = el.querySelector('.needle');
      let t = 0, done = false;
      const speed = 1.3 + Math.random() * 0.6;
      const fn = (_tt, _c, _p, dt) => {
        if (done) return;
        t += dt;
        const x = (Math.sin(t * speed * 2) * 0.5 + 0.5) * 100;
        needle.style.left = x + '%';
        if (g.input.interact() || g.input.hit('Space')) {
          done = true;
          const ok = x >= zx && x <= zx + zw;
          this.animated.splice(this.animated.indexOf(fn), 1);
          el.querySelector('.lbl').textContent = ok ? 'Caught!' : 'It slipped away…';
          setTimeout(() => el.remove(), 700);
          resolve(ok);
        }
      };
      this.animated.push(fn);
    });
  }

  async fish() {
    const g = this.game, M = g.missions, def = g.content.missions.feed_world;
    g.busy = true;
    g.setMode('cutscene');
    const at = new THREE.Vector3(DOCK.x0 + 1, 0.6, DOCK.z);
    g.player.place(at.x, at.y, at.z, -Math.PI / 2);
    g.cine.to(new THREE.Vector3(DOCK.x0 + 6, 3.5, DOCK.z + 5), new THREE.Vector3(DOCK.x0 - 6, 0, DOCK.z), 1200);
    g.player.model.parts.armR.rotation.x = -1.2;
    await wait(300);
    const ok = await this.fishingRound();
    g.audio.sfx('splash');
    if (ok) {
      const fishM = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), toon('#8fb8d8'));
      fishM.scale.set(1.8, 0.7, 0.6);
      this.scene.add(fishM);
      await g.tween(900, (k) => { fishM.position.set(DOCK.x0 - 6 + k * 6, Math.sin(k * Math.PI) * 3, DOCK.z); fishM.rotation.z = k * 6; });
      fishM.removeFromParent();
      M.give('fish', 1);
      const n = M.add('feed_world', 'caught', 1);
      g.audio.sfx('pickup');
      g.overlay.toast(`${Math.min(n, def.fish)} / ${def.fish} fish`);
      if (n >= def.fish) { M.setStep('feed_world', 4); g.overlay.toast('Enough fish — cook them at the village fire', 3000); }
    }
    g.player.model.parts.armR.rotation.x = 0;
    g.cine.release();
    g.setMode('walk');
    g.busy = false;
    this.refreshMarkers();
  }

  async cook() {
    const g = this.game, M = g.missions;
    g.busy = true;
    g.setMode('cutscene');
    g.cine.to(FIRE.clone().add(new THREE.Vector3(4, 3, 4)), FIRE.clone().setY(this.terrainH(FIRE.x, FIRE.z) + 0.8), 1200);
    g.audio.sfx('fire');
    this.fireBig = true;
    await g.sleep(2200);
    const n = g.save.state.inventory.fish;
    M.give('fish', -n);
    M.give('food', n);
    g.overlay.toast(`Food × ${n}`);
    g.cine.release();
    g.setMode('walk');
    g.busy = false;
    M.setStep('feed_world', 5);
    this.refreshMarkers();
  }

  async deliver() {
    const g = this.game, M = g.missions;
    M.add('feed_world', 'food', g.save.state.inventory.food);
    M.give('food', -g.save.state.inventory.food);
    g.audio.sfx('deliver');
    this.updateGranary();
    const npc = g.content.npcs.elder;
    await g.dialogue.say([{ who: npc.name, text: npc.thanks, cam: { pos: GRANARY.clone().add(new THREE.Vector3(-8, 4, 8)), target: GRANARY.clone().setY(2), ms: 1400 } }]);
    g.cine.release();
    await rewardCore(this, { pos: new THREE.Vector3(30, 0.5, 0), camFrom: new THREE.Vector3(60, 4, 16), missionId: 'feed_world' });
    M.setStep('feed_world', 6);
    this.refreshMarkers();
  }

  updateGranary() {
    const n = this.game.missions.count('feed_world', 'food');
    this.granaryFood.forEach((b, i) => (b.visible = i < n * 3));
    if (n > 0) this.fireBig = true;
  }

  update(dt, t) {
    super.update(dt, t);
    this.lights.follow(this.focus());
    const k = this.fireBig ? 1 : 0.35;
    this.fireLight.intensity = (6 + Math.sin(t * 13) * 1.5 + Math.sin(t * 7.3)) * k * 2;
    this.flame.scale.setScalar((1.6 + Math.sin(t * 11) * 0.2) * (this.fireBig ? 2 : 1));
  }
}
