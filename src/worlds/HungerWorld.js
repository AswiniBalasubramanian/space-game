import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { MissionWorld } from './MissionWorld.js';
import { NPC } from '../npcs/NPC.js';
import { createSkyDome, createCloudRing } from '../render/Sky.js';
import { createBlackHole, createCosmicRing } from '../render/cosmic.js';
import { terrain, grassField, broadleafGeometry, pineGeometry, forest, rocks, rockGeometry, waterMaterial } from '../render/nature.js';
import { toon, vtoon, glow, mesh, colored, merge, mat4, heightTint, outline } from '../render/toon.js';
import { glowTexture, crackTexture } from '../render/textures.js';
import { fbm, mulberry32, smoothstep, clamp } from '../utils/noise.js';
import { Ease } from '../core/Tween.js';

// HUNGER WORLD — SCARCITY · SURVIVAL · COMMUNITY · HOPE. Cracked dusk plains
// around a vast mirror lake that reflects the entire universe. A small
// fishing village with an empty storehouse waits on the shore.
const LAKE = { x: 0, z: -10, r: 52 };
const WATER_Y = -0.3;
const DOCK = { x: 0, z0: 46, z1: 33, w: 1.3 };

export default class HungerWorld extends MissionWorld {
  mood = 'hunger';
  exposure = 1.05;
  vignette = 0.5;

  ground(x, z) {
    const d = Math.hypot(x - LAKE.x, z - LAKE.z);
    const basin = -2.6 * smoothstep(LAKE.r + 2, LAKE.r - 10, d);
    const far = (fbm(x * 0.006 + 9, z * 0.006, 4) - 0.4) * 50 * smoothstep(110, 220, d);
    return basin + far + (fbm(x * 0.04, z * 0.04, 2) - 0.5) * 0.9 * smoothstep(LAKE.r - 2, LAKE.r + 8, d);
  }

  onDock(x, z) { return this.ws.dockBuilt && Math.abs(x - DOCK.x) < DOCK.w && z < DOCK.z0 + 0.5 && z > DOCK.z1 - 0.2; }

  heightAt(x, z) {
    if (this.onDock(x, z)) return 0.45;
    return this.ground(x, z);
  }

  collide(pos, r) {
    super.collide(pos, r);
    // the lake is not walkable, except along the dock
    const dx = pos.x - LAKE.x, dz = pos.z - LAKE.z, d = Math.hypot(dx, dz);
    const lim = LAKE.r - 1.5;
    if (d < lim && !this.onDock(pos.x, pos.z)) { pos.x = LAKE.x + (dx / d) * lim; pos.z = LAKE.z + (dz / d) * lim; }
  }

  async build() {
    const s = this.scene;
    s.fog = new THREE.Fog('#4a3a5a', 120, 900);
    const sky = createSkyDome({ top: '#12163a', mid: '#3a2f62', horizon: '#e0874a', bottom: '#2a1f3a', sunDir: [-0.9, 0.04, -0.4], sun: '#ff9a5a', stars: 1.3, nebula: 0.55, nebA: '#5a6ad0', nebB: '#c86a8a', cirrus: 0.25 });
    this.add(sky); this.skyFollow.push(sky);
    this.onUpdate((dt, t) => sky.userData.update(t));
    const clouds = createCloudRing({ count: 14, seed: 30, radius: [500, 900], height: [0, 50], scale: [180, 320], opacity: 0.8, palette: { light: '#f0b890', mid: '#c98a90', shadow: '#4a3f6a', rim: '#ffd0a0' } });
    this.add(clouds);
    this.onUpdate((dt, t) => clouds.userData.update(t, dt));

    // distant, darker cosmic phenomenon low over the lake
    const hole = createBlackHole({ radius: 190, seed: 33, tilt: 1.25, core: [255, 206, 160], edge: [190, 70, 50], glowColor: 'rgba(200,90,60,1)', calm: true });
    hole.position.set(420, 640, -1700);
    this.add(hole);
    const arc = createCosmicRing({ radius: 2600, width: 220, opacity: 0.35, seed: 35, core: [255, 214, 180], edge: [160, 80, 120] });
    arc.position.set(0, -1400, -2200); arc.rotation.set(-0.3, -0.3, -0.2);
    this.add(arc);
    this.holes.push({ pos: hole.position, radius: 240, strength: 0.12 });
    this.onUpdate((dt, t) => { hole.userData.update(t, this.game.engine.camera); arc.userData.update(t); });

    this.lights({ sun: '#ffc4a0', sunI: 1.6, sky: '#8f8fd8', ground: '#6a5a5a', hemiI: 1.5, dir: [-80, 22, -30] });

    // --- land: cracked earth, sparse life, black glassy patches
    const h = (x, z) => this.ground(x, z);
    const dry = new THREE.Color('#c09a78'), dark = new THREE.Color('#7a6470'), grassC = new THREE.Color('#8a9a5a'), mud = new THREE.Color('#5a4a58');
    const crack = crackTexture(); crack.repeat.set(90, 90);
    const land = terrain({ size: 900, seg: 200, height: h, color: (x, z, y, c) => {
      const d = Math.hypot(x - LAKE.x, z - LAKE.z);
      c.copy(dry).lerp(dark, fbm(x * 0.03, z * 0.03, 3) * 0.9);
      c.lerp(grassC, smoothstep(0.55, 0.75, fbm(x * 0.02 + 5, z * 0.02, 3)) * 0.6);
      c.lerp(mud, smoothstep(LAKE.r + 6, LAKE.r - 2, d));
    } });
    land.material.map = crack;
    land.material.needsUpdate = true;
    this.add(land);
    this.add(grassField({ count: 3000, area: [-90, -90, 90, 100], heightAt: h, accept: (x, z) => Math.hypot(x, z + 10) > LAKE.r + 3 && fbm(x * 0.02 + 5, z * 0.02, 3) > 0.58, colors: ['#8a9a4a', '#a8a050', '#6a7a3a'], blade: 0.4 }));
    const glassy = waterMaterial({ shallow: '#1a1830', deep: '#0a0a18', sky: '#6a5a9a', sparkle: 1 });
    const r = mulberry32(6);
    for (let i = 0; i < 7; i++) {
      const a = r() * 6.28, d = 75 + r() * 60;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 10;
      const p = new THREE.Mesh(new THREE.CircleGeometry(4 + r() * 7, 24), glassy);
      p.rotation.x = -Math.PI / 2; p.position.set(x, h(x, z) + 0.08, z);
      this.add(p);
    }

    this.buildLake();
    this.buildVillage(h);
    this.buildWilds(h);
    this.buildFireflies();
    this.bounds = { x: 0, z: 10, r: 95 };

    this.setupArrival({
      spawn: [0, 80, Math.PI], carSpot: [7, 84, Math.PI * 0.85],
      establish: { from: { pos: [-40, 30, 150], look: [300, 200, -1500] }, to: { pos: [26, 14, 110], look: [0, 3, 60] } },
    });
    this.buildMission(h);
  }

  buildLake() {
    const w = Math.round(innerWidth * 0.5), hgt = Math.round(innerHeight * 0.5);
    const mirror = new Reflector(new THREE.CircleGeometry(LAKE.r + 6, 96), { textureWidth: w, textureHeight: hgt, color: '#9aa6c0', clipBias: 0.003 });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.set(LAKE.x, WATER_Y, LAKE.z);
    this.add(mirror);
    this.mirror = mirror;
    // painted ripples + sparkles on top of the mirror
    const ripple = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 6, 96), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float r = n(vP * 0.25 + uTime * 0.12) * 0.6 + n(vP * 0.7 - uTime * 0.2) * 0.4;
          float band = smoothstep(0.66, 0.7, r) * (1.0 - smoothstep(0.7, 0.76, r));
          float sp = step(0.992, n(vP * 2.4 + uTime * 0.5));
          float edge = smoothstep(${(LAKE.r - 6).toFixed(1)}, ${(LAKE.r + 4).toFixed(1)}, length(vP));
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.7) * (band * 0.12 + sp * 0.8) + vec3(0.5, 0.35, 0.3) * edge * 0.25, 1.0);
        }`,
    }));
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(LAKE.x, WATER_Y + 0.02, LAKE.z);
    this.add(ripple);
    this.onUpdate((dt, t) => { ripple.material.uniforms.uTime.value = t; });
    // floating stone islands mirrored in the water
    const r = mulberry32(12);
    this.floaters = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(rockGeometry(40 + i, '#6a5a6a'), vtoon());
      const s = 3 + r() * 7;
      m.scale.set(s, s * 1.4, s);
      const a = r() * 6.28, d = 20 + r() * 30;
      m.position.set(Math.cos(a) * d, 18 + r() * 30, Math.sin(a) * d - 10);
      m.userData.y = m.position.y; m.userData.o = r() * 10;
      const top = new THREE.Mesh(broadleafGeometry(50 + i, { height: 2, spread: 1.4, leaf: '#6a7a4a', leaf2: '#8a9a5a' }), vtoon());
      top.scale.setScalar(1 / s * 1.8); top.position.y = 0.55;
      m.add(top);
      this.add(m); this.floaters.push(m);
    }
    this.onUpdate((dt, t) => this.floaters.forEach((m) => { m.position.y = m.userData.y + Math.sin(t * 0.25 + m.userData.o) * 1.5; m.rotation.y += dt * 0.02; }));
  }

  buildVillage(h) {
    const wood = toon('#8a6448'), woodD = toon('#6a4a36'), thatch = toon('#b8925a');
    const house = (x, z, rot, s = 1) => {
      const g = new THREE.Group();
      for (const [px, pz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.4, 6), woodD, px, 0.7, pz));
      g.add(mesh(new THREE.BoxGeometry(3.8, 0.2, 3), wood, 0, 1.4, 0));
      g.add(mesh(new THREE.BoxGeometry(3.4, 2.2, 2.6), wood, 0, 2.6, 0));
      const roof = new THREE.ConeGeometry(3, 1.8, 4); roof.rotateY(Math.PI / 4);
      g.add(mesh(roof, thatch, 0, 4.6, 0));
      const win = mesh(new THREE.PlaneGeometry(0.6, 0.6), glow('#3a2a2a'), 0.8, 2.8, 1.31, false);
      g.add(win);
      g.add(mesh(new THREE.BoxGeometry(0.8, 1.5, 0.05), woodD, -0.7, 2.25, 1.32));
      g.position.set(x, h(x, z), z); g.rotation.y = rot; g.scale.setScalar(s);
      outline(g, 0.025);
      this.add(g);
      this.circle(x, z, 2.3 * s);
      return win;
    };
    this.windows = [house(-16, 62, 0.3), house(-8, 72, 0.1, 1.1), house(20, 72, -0.2), house(28, 58, -0.6, 0.9), house(-26, 52, 0.7, 0.9)];

    // the empty storehouse
    const store = new THREE.Group();
    store.add(mesh(new THREE.BoxGeometry(6, 0.3, 4), woodD, 0, 0.15, 0));
    store.add(mesh(new THREE.BoxGeometry(6, 3.2, 0.2), wood, 0, 1.75, -1.9));
    for (const x of [-2.9, 2.9]) store.add(mesh(new THREE.BoxGeometry(0.2, 3.2, 4), wood, x, 1.75, 0));
    store.add(mesh(new THREE.BoxGeometry(6.6, 0.2, 4.8), thatch, 0, 3.45, 0));
    for (const y of [0.9, 1.9]) store.add(mesh(new THREE.BoxGeometry(5.4, 0.08, 1.2), woodD, 0, y, -1.2));
    this.baskets = [];
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Group();
      b.add(mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.35, 10, 1, true), toon('#c9a06a', { side: THREE.DoubleSide }), 0, 0.17, 0));
      const fill = mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(i % 2 ? '#f2a24e' : '#9fc6e8'), 0, 0.26, 0);
      fill.visible = false; b.add(fill);
      b.position.set(-2.2 + (i % 4) * 1.45, i < 4 ? 0.98 : 1.98, -1.2);
      store.add(b); this.baskets.push(fill);
    }
    store.position.set(14, h(14, 60), 60); store.rotation.y = -0.4 + Math.PI;
    outline(store, 0.03);
    this.add(store);
    this.box(10.6, 57, 17.4, 63, {});
    const ry = -0.4 + Math.PI; // open side faces the fire
    this.storePos = new THREE.Vector3(14 + Math.sin(ry) * 3.6, 0, 60 + Math.cos(ry) * 3.6);
    this.storePos.y = h(this.storePos.x, this.storePos.z);
    this.storeFront = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));

    // campfire
    const fire = new THREE.Group();
    for (let i = 0; i < 8; i++) fire.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), toon('#7a7078'), Math.cos(i * 0.785) * 0.9, 0.15, Math.sin(i * 0.785) * 0.9));
    for (let i = 0; i < 4; i++) { const l = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6), woodD, 0, 0.35, 0); l.rotation.set(Math.PI / 2.4, i * 0.8, 0); fire.add(l); }
    this.flames = [];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(['rgba(255,170,80,1)', 'rgba(255,220,140,1)', 'rgba(255,110,60,1)'][i]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      fire.add(f); this.flames.push(f);
    }
    this.pot = new THREE.Group();
    this.pot.add(mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, Math.PI / 2.4, Math.PI / 1.7), toon('#3a3440', { side: THREE.DoubleSide }), 0, 1.1, 0));
    this.pot.visible = false;
    fire.add(this.pot);
    const fx = -4, fz = 57;
    fire.position.set(fx, h(fx, fz), fz);
    this.add(fire);
    this.circle(fx, fz, 1.2);
    this.firePos = fire.position.clone();
    this.fireLight = new THREE.PointLight('#ff9a50', 12, 16, 1.4);
    this.fireLight.position.set(fx, h(fx, fz) + 1.4, fz);
    this.add(this.fireLight);
    this.onUpdate((dt, t) => {
      this.flames.forEach((f, i) => { const k = 1 + Math.sin(t * (9 + i * 3)) * 0.12; f.scale.set(1.1 * k - i * 0.2, 1.8 * k - i * 0.3, 1); f.position.y = 0.7 + i * 0.12; });
      this.fireLight.intensity = 11 + Math.sin(t * 13) * 1.5 + Math.sin(t * 7) * 1;
    });
    // log seats
    for (const [x, z, ry] of [[-7.2, 56, 0.3], [-1, 60, -0.8], [-5, 61, 1.4]]) { const l = mesh(new THREE.CylinderGeometry(0.3, 0.3, 2, 8), woodD, x, h(x, z) + 0.3, z); l.rotation.set(0, ry, Math.PI / 2); this.add(l); }
    // lantern strings across the village (lit at the end)
    this.villageLights = [];
    for (let i = 0; i < 12; i++) {
      const x = -24 + i * 4.4, z = 66 + Math.sin(i * 0.9) * 4;
      const bulb = mesh(new THREE.SphereGeometry(0.16, 8, 6), glow('#4a3a3a'), x, h(x, z) + 3.4, z, false);
      this.add(bulb); this.villageLights.push(bulb);
    }
    // shoreline boats (upturned, unused)
    for (const [x, z, ry] of [[-12, 44, 0.6], [14, 44, -0.5]]) { const b = mesh(new THREE.CapsuleGeometry(0.6, 2.6, 4, 8), woodD, x, h(x, z) + 0.3, z); b.rotation.set(Math.PI / 2, 0, ry); b.scale.set(1, 1, 0.5); this.add(b); this.circle(x, z, 1.2); }
  }

  buildWilds(h) {
    // east grove (wood) — a few living trees among dead ones
    const bare = (() => {
      const parts = [colored(new THREE.CylinderGeometry(0.2, 0.35, 5, 6), '#6a5448', mat4(0, 2.5, 0))];
      for (let i = 0; i < 5; i++) parts.push(colored(new THREE.CylinderGeometry(0.05, 0.12, 2.4, 5), '#6a5448', mat4(Math.cos(i) * 0.5, 3.5 + i * 0.3, Math.sin(i) * 0.5, 1, 1, 1, Math.sin(i * 2) * 0.9, 0, Math.cos(i * 2) * 0.9)));
      return merge(parts);
    })();
    const deadSpots = []; const r = mulberry32(4);
    for (let i = 0; i < 30; i++) { const a = r() * 6.28, d = 62 + r() * 30; deadSpots.push([Math.cos(a) * d, Math.sin(a) * d - 10]); }
    this.add(forest({ template: bare, positions: deadSpots, heightAt: h }));
    deadSpots.forEach(([x, z]) => this.circle(x, z, 0.4));
    this.add(forest({ template: pineGeometry(7, { leaf: '#3f5a48', height: 8 }), positions: Array.from({ length: 30 }, (_, i) => { const a = i * 0.21; return [Math.cos(a) * 115, Math.sin(a) * 115]; }), heightAt: h, scale: [1, 1.8] }));
    this.woodTrees = [[52, 8], [58, 18], [48, 24], [62, 2], [55, -6], [66, 14]];
    this.stonePiles = [[-52, 10], [-58, 20], [-48, 26], [-62, 4], [-56, -4]];
  }

  buildFireflies() {
    const N = 160, r = mulberry32(19);
    const seeds = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) seeds.set([r() * 50 - 25, r() * 4 + 0.5, r() * 30 + 45], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(seeds.slice(), 3));
    const mat = new THREE.PointsMaterial({ size: 0.35, map: glowTexture('rgba(255,236,150,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe89a', opacity: 0.25 });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.add(pts);
    this.fireflies = mat;
    this.onUpdate((dt, t) => {
      const a = g.attributes.position;
      for (let i = 0; i < N; i++) {
        a.array[i * 3] = seeds[i * 3] + Math.sin(t * 0.5 + i) * 1.5;
        a.array[i * 3 + 1] = seeds[i * 3 + 1] + Math.sin(t * 0.8 + i * 2) * 0.6;
        a.array[i * 3 + 2] = seeds[i * 3 + 2] + Math.cos(t * 0.4 + i) * 1.5;
      }
      a.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------ mission
  buildMission(h) {
    const game = this.game, ws = this.ws;
    const def = game.missions.def('feedWorld');
    ws.woodUsed ??= []; ws.stoneUsed ??= [];
    const stage = () => game.missions.stage('feedWorld');

    this.rue = new NPC(this, { preset: 'elder', name: 'Elder Rue', pos: [3, 55], yaw: Math.PI, onTalk: () => this.talkRue() });
    this.villagers = [
      new NPC(this, { preset: 'villager', name: 'Villager', pos: [-7.2, 55.2], yaw: 0.9, pose: 'sit', y: h(-7.2, 55.2) + 0.1 }),
      new NPC(this, { preset: 'child', name: 'Villager', pos: [-1.2, 59.4], yaw: -2.2, pose: 'sit', y: h(-1.2, 59.4) + 0.1 }),
      new NPC(this, { preset: 'villager', name: 'Fisher Tam', pos: [-12, 47], yaw: 0.2, onTalk: () => game.talk([{ who: 'Fisher Tam', text: 'The fish are out there. We just need a dock long enough to reach the deep water.' }]) }),
    ];

    const gatherLabel = () => `Wood ${Math.min(game.inventory.count('wood'), def.wood)}/${def.wood} · Stone ${Math.min(game.inventory.count('stone'), def.stone)}/${def.stone}`;
    const checkGather = () => {
      game.missions.progress('feedWorld', 0, 1, gatherLabel());
      if (game.inventory.count('wood') >= def.wood && game.inventory.count('stone') >= def.stone) {
        game.missions.setStage('feedWorld', 'build');
        game.hud.toast('Enough materials! Build the dock at the lake shore.');
      }
      game.save();
    };
    this.checkGather = checkGather;
    this.gatherLabel = gatherLabel;

    // wood trees (living ones glow faintly)
    this.woodTrees.forEach(([x, z], i) => {
      const tree = new THREE.Mesh(broadleafGeometry(60 + i, { height: 4.2, spread: 2.2, leaf: '#6a8a4a', leaf2: '#9aa85a' }), vtoon());
      tree.position.set(x, h(x, z) - 0.1, z);
      tree.castShadow = true;
      this.add(tree); this.circle(x, z, 0.6);
      if (ws.woodUsed.includes(i)) { tree.scale.set(1, 0.25, 1); return; }
      const it = this.interact({
        label: 'Collect Wood', position: tree.position, radius: 2.4, markerHeight: 2.2, markerColor: '#ffd0a0',
        enabled: () => stage() === 'gather' && game.inventory.count('wood') < def.wood,
        onInteract: async () => {
          await this.work(tree.position);
          ws.woodUsed.push(i);
          this.removeInteract(it);
          game.tweens.tween(0.6, (k) => tree.scale.set(1, 1 - k * 0.75, 1));
          game.inventory.add('wood', 1);
          game.hud.toast(`Wood × ${game.inventory.count('wood')}`);
          checkGather();
        },
      });
    });
    this.stonePiles.forEach(([x, z], i) => {
      const pile = new THREE.Group();
      for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(rockGeometry(70 + i * 4 + k, '#a89aa0'), vtoon()); m.scale.setScalar(0.5 + k * 0.12); m.position.set(Math.cos(k * 1.7) * 0.6, 0.2, Math.sin(k * 1.7) * 0.6); pile.add(m); }
      pile.position.set(x, h(x, z), z);
      this.add(pile); this.circle(x, z, 1);
      if (ws.stoneUsed.includes(i)) { pile.scale.setScalar(0.4); return; }
      const it = this.interact({
        label: 'Collect Stone', position: pile.position, radius: 2.4, markerHeight: 1.8, markerColor: '#ffd0a0',
        enabled: () => stage() === 'gather' && game.inventory.count('stone') < def.stone,
        onInteract: async () => {
          await this.work(pile.position);
          ws.stoneUsed.push(i);
          this.removeInteract(it);
          game.tweens.tween(0.6, (k) => pile.scale.setScalar(1 - k * 0.6));
          game.inventory.add('stone', 1);
          game.hud.toast(`Stone × ${game.inventory.count('stone')}`);
          checkGather();
        },
      });
    });

    // dock
    this.dock = new THREE.Group();
    this.planks = [];
    const plankMat = toon('#9a7050');
    for (let z = DOCK.z0; z >= DOCK.z1; z -= 0.7) {
      const p = mesh(new THREE.BoxGeometry(DOCK.w * 2 + 0.2, 0.14, 0.6), plankMat, DOCK.x, 0.38, z);
      p.visible = !!ws.dockBuilt;
      this.dock.add(p); this.planks.push(p);
    }
    for (let z = DOCK.z0 - 1; z >= DOCK.z1; z -= 3) for (const sx of [-1, 1]) {
      const post = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), toon('#6a4a36'), DOCK.x + sx * DOCK.w, -0.4, z);
      post.visible = !!ws.dockBuilt; this.dock.add(post); this.planks.push(post);
    }
    this.add(this.dock);
    const siteMark = mesh(new THREE.TorusGeometry(1.2, 0.06, 6, 24), glow('#ffd0a0', 0.8), DOCK.x, h(DOCK.x, DOCK.z0 + 1) + 0.05, DOCK.z0 + 1, false);
    siteMark.rotation.x = Math.PI / 2;
    this.add(siteMark);
    this.onUpdate(() => { siteMark.visible = stage() === 'build'; });
    this.interact({
      label: 'Build Fishing Dock', position: new THREE.Vector3(DOCK.x, h(DOCK.x, DOCK.z0 + 1.5), DOCK.z0 + 1.5), radius: 3, markerHeight: 1.6, markerColor: '#ffd0a0',
      enabled: () => stage() === 'build', onInteract: () => this.buildDock(),
    });
    this.fishSpot = new THREE.Vector3(DOCK.x, 0.45, DOCK.z1 + 0.8);
    this.interact({
      label: 'Fish', position: this.fishSpot, radius: 2.2, markerHeight: 1.6, markerColor: '#9ff4ff',
      enabled: () => stage() === 'fish', onInteract: () => this.fish(),
    });
    this.interact({
      label: 'Cook Fish', position: this.firePos, radius: 2.8, markerHeight: 2, markerColor: '#ffb070',
      enabled: () => stage() === 'cook', onInteract: () => this.cook(),
    });
    this.interact({
      label: 'Deliver Food', position: this.storePos, radius: 3.2, markerHeight: 2.6, markerColor: '#ffe08a',
      enabled: () => stage() === 'deliver', onInteract: () => this.deliver(),
    });
    if (ws.delivered) { this.baskets.forEach((b) => (b.visible = true)); }
    if (game.missions.isDone('feedWorld')) this.celebrate(false);
  }

  async work(pos) {
    const game = this.game;
    await game.cutscene(async () => {
      const p = game.player.root.position;
      game.controller.yaw = Math.atan2(pos.x - p.x, pos.z - p.z);
      game.player.root.rotation.y = game.controller.yaw;
      game.player.setPose('work');
      for (let i = 0; i < 3; i++) { game.audio.pick(); await game.tweens.wait(0.35); }
      game.player.setPose('stand');
    });
  }

  async buildDock() {
    const game = this.game, ws = this.ws;
    await game.cutscene(async () => {
      game.inventory.take('wood', 2); game.inventory.take('stone', 3);
      await game.shot(game.currentShot(), { pos: [8, 5, 50], look: [0, 0, 40] }, 1.4);
      for (const p of this.planks) {
        p.visible = true;
        const y = p.position.y;
        p.position.y = y + 2;
        game.tweens.tween(0.35, (k) => { p.position.y = y + 2 * (1 - k); });
        game.audio.blip();
        await game.tweens.wait(0.09);
      }
      await game.tweens.wait(0.5);
      ws.dockBuilt = true;
    });
    game.setControl('walk');
    game.missions.setStage('feedWorld', 'fish');
    game.missions.progress('feedWorld', game.inventory.count('fish'), game.missions.def('feedWorld').fish);
    game.hud.toast('The dock is ready. Walk to the end and fish!');
    game.save();
  }

  async fish() {
    const game = this.game, def = game.missions.def('feedWorld');
    await game.cutscene(async () => {
      game.player.setPose('work');
      const ok = await game.hud.fishing();
      game.player.setPose('stand');
      if (ok) {
        game.audio.chime();
        const n = game.inventory.add('fish', 1);
        game.hud.toast(`A shimmering fish! (${n}/${def.fish})`);
        game.missions.progress('feedWorld', Math.min(n, def.fish), def.fish);
        if (n >= def.fish) { game.missions.setStage('feedWorld', 'cook'); game.hud.toast('Enough fish! Cook them at the village fire.'); }
      } else {
        game.audio.chime(0);
        game.hud.toast('It slipped away… try again.');
      }
      game.save();
    });
  }

  async cook() {
    const game = this.game, def = game.missions.def('feedWorld');
    await game.cutscene(async () => {
      this.pot.visible = true;
      await game.shot(game.currentShot(), { pos: [this.firePos.x + 4, this.firePos.y + 3, this.firePos.z + 4], look: this.firePos.toArray() }, 1.4);
      game.inventory.take('wood', Math.min(2, game.inventory.count('wood')));
      const fish = game.inventory.count('fish');
      game.inventory.set('fish', 0);
      game.audio.pick();
      await game.tweens.wait(1.8);
      game.inventory.add('food', Math.max(fish, def.fish));
    });
    game.setControl('walk');
    await game.talk([{ text: 'The smell of fish stew drifts through the village. Doors open, one by one.' }]);
    game.missions.setStage('feedWorld', 'deliver');
    game.save();
  }

  async deliver() {
    const game = this.game;
    await game.cutscene(async () => {
      const cam = this.storePos.clone().addScaledVector(this.storeFront, 6).add(new THREE.Vector3(-2, 3, 0));
      const look = this.storePos.clone().addScaledVector(this.storeFront, -3.4).add(new THREE.Vector3(0, 1.4, 0));
      await game.shot(game.currentShot(), { pos: cam.toArray(), look: look.toArray() }, 1.4);
      game.inventory.set('food', 0);
      for (const b of this.baskets) { b.visible = true; game.audio.blip(); await game.tweens.wait(0.18); }
      this.ws.delivered = true;
      this.villagers.forEach((v) => v.model.setPose('cheer'));
      await game.tweens.wait(1.2);
    });
    game.setControl('walk');
    game.missions.setStage('feedWorld', 'reward');
    game.hud.toast('The storehouse is full. Elder Rue wants to speak with you.');
    game.save();
  }

  celebrate(animate = true) {
    this.windows.forEach((w) => w.material.color.set('#ffd98a'));
    this.villageLights.forEach((b) => b.material.color.set('#ffe0a0'));
    this.baskets.forEach((b) => (b.visible = true));
    if (animate) this.game.tweens.tween(2, (k) => { this.fireflies.opacity = 0.25 + k * 0.7; });
    else this.fireflies.opacity = 0.95;
  }

  async talkRue() {
    const game = this.game, name = game.state.nickname, st = game.missions.stage('feedWorld');
    const def = game.missions.def('feedWorld');
    if (st === 'talk') {
      await game.talk([
        { who: 'Elder Rue', text: 'A traveller… forgive us. We have nothing to offer you. Not even a meal.' },
        { who: name, text: 'I didn\'t come to take. What does the village need?' },
        { who: 'Elder Rue', text: 'The lake is full of fish, but our old dock rotted into the water, and the storehouse has been empty since spring.' },
        { who: 'Elder Rue', text: `Bring ${def.wood} wood from the living trees to the east, and ${def.stone} stones from the western ridge. We'll build a dock and fish again.` },
      ]);
      game.missions.setStage('feedWorld', 'gather');
      this.checkGather();
      game.hud.hint('Living trees glow in the east grove, stone piles on the west ridge · [E] Collect');
    } else if (st === 'reward') {
      await game.talk([
        { who: 'Elder Rue', text: 'Listen… children laughing. I haven\'t heard that in a long time.' },
        { who: 'Elder Rue', text: 'You gave us more than food — you gave us back the lake. Take this. It was meant for a day like today.' },
      ]);
      await game.rewards.giveCore(this.rue.pos, 'feedWorld');
      this.celebrate();
      await game.talk([{ who: 'Elder Rue', text: 'Go home to your mother, child. Every light in this village will be burning for you.' }]);
    } else if (game.missions.isDone('feedWorld')) {
      await game.talk([{ who: 'Elder Rue', text: 'Safe roads through the dark, little one.' }]);
    } else {
      const hint = { gather: 'Wood from the east, stone from the west ridge.', build: 'The old dock stood right at the shore, south of the lake.', fish: 'Walk to the end of the dock. Patience — the fish rise with the light.', cook: 'Bring the fish to the fire. I\'ll show you our stew.', deliver: 'The storehouse is just there, past the fire.' }[st];
      await game.talk([{ who: 'Elder Rue', text: hint }]);
    }
  }

  onArrive() {
    const st = this.game.missions.stage('feedWorld');
    if (st === 'gather') this.checkGather();
    if (st === 'fish') this.game.missions.progress('feedWorld', this.game.inventory.count('fish'), this.game.missions.def('feedWorld').fish);
    if (st === 'talk') this.game.hud.hint('Elder Rue is by the village fire · [E] Talk');
  }

  waypoint() {
    const game = this.game, st = game.missions.stage('feedWorld'), def = game.missions.def('feedWorld');
    const at = (v, dy = 2.5) => new THREE.Vector3(v.x ?? v[0], (v.y ?? this.ground(v[0], v[1])) + dy, v.z ?? v[1]);
    const p = game.player.root.position;
    const nearest = (list, used) => {
      let best = null, bd = Infinity;
      list.forEach(([x, z], i) => { if (used.includes(i)) return; const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = [x, z]; } });
      return best;
    };
    if (game.missions.isDone('feedWorld')) return at(game.car.root.position, 3);
    if (st === 'talk' || st === 'reward') return at(this.rue.pos);
    if (st === 'gather') {
      const t = game.inventory.count('wood') < def.wood ? nearest(this.woodTrees, this.ws.woodUsed) : null;
      const s = game.inventory.count('stone') < def.stone ? nearest(this.stonePiles, this.ws.stoneUsed) : null;
      const pick = t && s ? (Math.hypot(t[0] - p.x, t[1] - p.z) < Math.hypot(s[0] - p.x, s[1] - p.z) ? t : s) : t || s;
      return pick ? at(pick) : null;
    }
    if (st === 'build') return at([DOCK.x, DOCK.z0 + 1.5]);
    if (st === 'fish') return at(this.fishSpot, 2);
    if (st === 'cook') return at(this.firePos);
    if (st === 'deliver') return at(this.storePos);
    return null;
  }

  dispose() {
    this.mirror?.dispose();
    super.dispose();
  }
}
