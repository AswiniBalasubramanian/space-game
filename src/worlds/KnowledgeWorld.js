import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MissionWorld } from './MissionWorld.js';
import { NPC } from '../npcs/NPC.js';
import { createSkyDome, createCloudRing } from '../render/Sky.js';
import { createCosmicRing, createBlackHole } from '../render/cosmic.js';
import { terrain, grassField, broadleafGeometry, forest, rocks, waterMaterial } from '../render/nature.js';
import { toon, vtoon, glow, mesh, colored, heightTint, outline } from '../render/toon.js';
import { glowTexture, glyphTexture } from '../render/textures.js';
import { fbm, mulberry32, smoothstep } from '../utils/noise.js';
import { LESSONS } from '../data/content.js';
import { Ease } from '../core/Tween.js';

// KNOWLEDGE WORLD — WEALTH · KNOWLEDGE · CONTRAST. A gleaming plaza floats
// high in the light; beneath its shadow, a small district of children who
// have never been inside a library. A colossal black hole hangs overhead.
const TOP = 40, PLAZA_R = 36;
const LIFT = { x: 31, z: 6 };
const UP = { minY: TOP - 6, maxY: TOP + 30 };

export default class KnowledgeWorld extends MissionWorld {
  mood = 'knowledge';
  exposure = 0.96;

  ground(x, z) { return (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 0.8 + smoothstep(55, 140, Math.hypot(x, z)) * 30 * fbm(x * 0.01, z * 0.01, 3); }

  heightAt(x, z, y = 0) {
    if (y > TOP - 8 && Math.hypot(x, z) < PLAZA_R + 1) return TOP;
    return this.ground(x, z);
  }

  async build() {
    const s = this.scene;
    s.fog = new THREE.Fog('#cfe2f2', 220, 1300);
    const sky = createSkyDome({ top: '#2f6cc8', mid: '#8cc0ec', horizon: '#f6efe0', sunDir: [0.3, 0.7, 0.4], sun: '#fff8e0', cirrus: 0.5, stars: 0.25, nebula: 0.15, nebA: '#bfe8ff', nebB: '#ffe6b0' });
    this.add(sky); this.skyFollow.push(sky);
    this.onUpdate((dt, t) => sky.userData.update(t));
    const clouds = createCloudRing({ count: 20, seed: 12, radius: [420, 900], height: [-80, 120], scale: [200, 420] });
    this.add(clouds);
    this.onUpdate((dt, t) => clouds.userData.update(t, dt));

    // The landmark: an immense black hole visible from anywhere in the city.
    const hole = createBlackHole({ radius: 160, seed: 21, tilt: 1.42, core: [255, 250, 232], edge: [236, 176, 96], glowColor: 'rgba(255,236,190,1)' });
    hole.position.set(-120, 820, -900);
    this.add(hole);
    const stretched = createCosmicRing({ radius: 900, width: 520, opacity: 0.4, seed: 23, core: [255, 255, 255], edge: [200, 220, 255], speed: 0.01 });
    stretched.position.copy(hole.position);
    stretched.lookAt(0, 0, 0);
    this.add(stretched);
    this.holes.push({ pos: hole.position, radius: 260, strength: 0.35 });
    this.onUpdate((dt, t) => { hole.userData.update(t, this.game.engine.camera); stretched.userData.update(t); });

    this.lights({ sun: '#fff4dc', sunI: 2.8, sky: '#dcefff', ground: '#9aa0b8', hemiI: 1.1, dir: [20, 90, 30] });
    this.sun.shadow.camera.far = 400;

    const h = (x, z) => this.ground(x, z);
    const dim = new THREE.Color('#5c6a86'), moss = new THREE.Color('#6f8a6a'), bright = new THREE.Color('#9cc46a');
    this.add(terrain({ size: 1200, seg: 180, height: h, color: (x, z, y, c) => {
      const d = Math.hypot(x, z);
      c.copy(dim).lerp(moss, fbm(x * 0.1, z * 0.1, 2));
      c.lerp(bright, smoothstep(PLAZA_R, PLAZA_R + 25, d));
    } }));
    this.add(grassField({ count: 7000, area: [-90, -90, 90, 90], heightAt: h, accept: (x, z) => Math.hypot(x, z) > PLAZA_R + 4, colors: ['#8cbf55', '#a8cf5a', '#78ad48'] }));
    const ring = []; for (let i = 0; i < 44; i++) { const a = i * 0.143; const d = 80 + (i % 4) * 18; ring.push([Math.cos(a) * d, Math.sin(a) * d]); }
    this.add(forest({ template: broadleafGeometry(31, { leaf: '#5d9a50', leaf2: '#9cc46a' }), positions: ring, heightAt: h, scale: [1, 1.8] }));

    this.buildPlaza();
    this.buildCity();
    this.buildLower(h);
    this.buildLift();
    this.bounds = { x: 0, z: 0, r: PLAZA_R - 1 };

    this.setupArrival({
      spawn: [0, 27, Math.PI], carSpot: [9, 29, Math.PI * 0.8],
      establish: { from: { pos: [120, 30, 180], look: [-120, 700, -900] }, to: { pos: [26, 52, 60], look: [0, 44, 10] } },
    });
    this.buildMission();
  }

  buildPlaza() {
    const g = new THREE.Group();
    g.position.y = TOP;
    const marble = toon('#ece2d0'), gold = toon('#e3b95a', { emissive: '#6a4a10', emissiveIntensity: 0.3 });
    const disc = mesh(new THREE.CylinderGeometry(PLAZA_R, PLAZA_R - 2, 2.2, 64), marble, 0, -1.1, 0);
    g.add(disc);
    // underside: inverted rocky cone with glowing bands
    const under = new THREE.ConeGeometry(PLAZA_R - 2, 20, 32, 6);
    under.rotateX(Math.PI);
    g.add(new THREE.Mesh(heightTint(colored(under, '#8a8fa8'), 0.3, 0.5), vtoon()));
    g.children[1].position.y = -11;
    for (let i = 0; i < 3; i++) {
      const band = mesh(new THREE.TorusGeometry(PLAZA_R - 8 - i * 8.5, 0.35, 8, 64), glow('#9ff4ff'), 0, -3.5 - i * 5, 0, false);
      band.rotation.x = Math.PI / 2; g.add(band);
    }
    // central support column down to the lower district
    g.add(mesh(new THREE.CylinderGeometry(3, 4, TOP, 16), toon('#b8bccb'), 0, -TOP / 2, 0));
    // painted floor mosaic: soft pastel bands
    [['#d9cdb8', 30, 34], ['#c9d8e8', 20, 26], ['#e8d2c0', 10, 16], ['#d8e4d0', 4.6, 7]].forEach(([c, a, b]) => {
      const band = mesh(new THREE.RingGeometry(a, b, 96), toon(c), 0, 0.01, 0, false);
      band.rotation.x = -Math.PI / 2; g.add(band);
    });
    for (let i = 0; i < 16; i++) {
      const ray = mesh(new THREE.PlaneGeometry(0.5, 20), toon('#d8c49a'), Math.cos(i * 0.3927) * 20, 0.015, Math.sin(i * 0.3927) * 20, false);
      ray.rotation.set(-Math.PI / 2, 0, -i * 0.3927 + Math.PI / 2); g.add(ray);
    }
    // floor inlay rings
    for (const r of [8, 18, 28]) { const ri = mesh(new THREE.TorusGeometry(r, 0.12, 6, 96), gold, 0, 0.02, 0, false); ri.rotation.x = Math.PI / 2; g.add(ri); }
    // fountain with a holographic globe
    g.add(mesh(new THREE.CylinderGeometry(4, 4.4, 0.8, 32), marble, 0, 0.4, 0));
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.6, 32), waterMaterial({ shallow: '#bfefff', deep: '#6fb8e8', sky: '#ffffff' }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.82; g.add(pool);
    this.globe = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 2), new THREE.MeshBasicMaterial({ color: '#9ff4ff', wireframe: true, transparent: true, opacity: 0.6 }));
    this.globe.position.y = 3.2; g.add(this.globe);
    this.circle(0, 0, 4.5, UP);
    // railing
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.atan2(LIFT.z, LIFT.x)), Math.cos(a - Math.atan2(LIFT.z, LIFT.x)))) < 0.08) continue;
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 5), gold, Math.cos(a) * (PLAZA_R - 0.6), 0.55, Math.sin(a) * (PLAZA_R - 0.6), false));
    }
    const rail = mesh(new THREE.TorusGeometry(PLAZA_R - 0.6, 0.07, 6, 120), gold, 0, 1.1, 0, false);
    rail.rotation.x = Math.PI / 2; g.add(rail);
    // benches + planters
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.5;
      g.add(mesh(new RoundedBoxGeometry(2.4, 0.4, 0.8, 2, 0.1), toon('#d8c8a8'), Math.cos(a) * 13, 0.45, Math.sin(a) * 13));
      this.circle(Math.cos(a) * 13, Math.sin(a) * 13, 1.1, UP);
      const px = Math.cos(a + 0.26) * 22, pz = Math.sin(a + 0.26) * 22;
      g.add(mesh(new THREE.CylinderGeometry(1.1, 0.9, 1, 12), marble, px, 0.5, pz));
      g.add(mesh(new THREE.SphereGeometry(1.2, 12, 10), toon('#6fae45'), px, 1.6, pz));
      this.circle(px, pz, 1.2, UP);
    }
    outline(g, 0.04);
    this.add(g);

    // The Great Library
    const lib = new THREE.Group();
    lib.add(mesh(new THREE.BoxGeometry(20, 1.2, 12), marble, 0, 0.6, 0));
    lib.add(mesh(new THREE.BoxGeometry(18, 9, 9), toon('#f2ead8'), 0, 5.7, -1));
    lib.add(mesh(new THREE.SphereGeometry(7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), toon('#e3b95a', { emissive: '#6a4a10', emissiveIntensity: 0.2 }), 0, 10.2, -1));
    for (let i = 0; i < 8; i++) lib.add(mesh(new THREE.CylinderGeometry(0.45, 0.5, 8.6, 12), marble, -8.4 + i * 2.4, 5.5, 4.6));
    lib.add(mesh(new THREE.BoxGeometry(19.5, 1, 1.6), marble, 0, 10.2, 4.6));
    lib.add(mesh(new THREE.BoxGeometry(7, 6, 0.2), glow('#ffe7b8'), 0, 4.4, 3.52, false));
    for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) lib.add(mesh(new THREE.BoxGeometry(0.4, 1.1, 0.3), toon(['#a9203e', '#5b8fd6', '#f2703c', '#8fae5a'][(i + r) % 4]), -2.9 + i * 0.52, 2.2 + r * 1.4, 3.3));
    lib.position.set(0, TOP, -24);
    outline(lib, 0.04);
    this.add(lib);
    this.box(-10, -30.5, 10, -18, UP);
    this.libraryPos = new THREE.Vector3(0, TOP, -17.3);

    // holographic information panels
    this.holos = [];
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + 0.3, d = 14 + (i % 3) * 6;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), new THREE.MeshBasicMaterial({ map: glyphTexture(i + 1), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
      m.position.set(Math.cos(a) * d, TOP + 3.5 + (i % 2), Math.sin(a) * d);
      m.lookAt(0, TOP + 3.5, 0);
      m.userData.y = m.position.y; m.userData.o = i;
      this.add(m); this.holos.push(m);
    }
    this.onUpdate((dt, t) => {
      this.globe.rotation.y += dt * 0.3;
      this.holos.forEach((m) => { m.position.y = m.userData.y + Math.sin(t + m.userData.o) * 0.25; });
    });
  }

  buildCity() {
    const r = mulberry32(8);
    const white = toon('#f5f1ea'), glass = new THREE.MeshToonMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.55 }), gold = toon('#e3b95a', { emissive: '#8a5a10', emissiveIntensity: 0.35 });
    const winTex = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 256;
      const g = c.getContext('2d'); g.fillStyle = '#f5f1ea'; g.fillRect(0, 0, 64, 256);
      for (let y = 8; y < 256; y += 16) for (let x = 6; x < 64; x += 14) { g.fillStyle = Math.random() > 0.3 ? '#ffd98a' : '#9fb8d8'; g.fillRect(x, y, 8, 9); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })();
    const towerMat = new THREE.MeshToonMaterial({ map: winTex, emissive: '#ffcf7a', emissiveMap: winTex, emissiveIntensity: 0.25 });
    this.pods = [];
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2 + r() * 0.2;
      const d = 70 + r() * 90;
      const g = new THREE.Group();
      const baseY = TOP - 30 + r() * 80;
      const hgt = 40 + r() * 110;
      const rad = 4 + r() * 5;
      // floating foundation
      const isl = new THREE.ConeGeometry(rad * 1.8, rad * 3, 10, 3); isl.rotateX(Math.PI);
      g.add(new THREE.Mesh(heightTint(colored(isl, '#9a9fb8'), 0.3, 0.5), vtoon()));
      g.children[0].position.y = -rad * 1.5;
      g.add(mesh(new THREE.CylinderGeometry(rad * 1.8, rad * 1.8, 1, 16), white, 0, 0, 0));
      const tower = mesh(new THREE.CylinderGeometry(rad * 0.55, rad, hgt, 12), towerMat, 0, hgt / 2, 0);
      tower.material = towerMat.clone(); tower.material.map = winTex.clone(); tower.material.map.repeat.set(3, hgt / 20); tower.material.emissiveMap = tower.material.map;
      g.add(tower);
      g.add(mesh(new THREE.SphereGeometry(rad * 0.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, hgt, 0));
      g.add(mesh(new THREE.ConeGeometry(0.4, rad * 3, 6), gold, 0, hgt + rad * 1.5, 0));
      for (let k = 0; k < 3; k++) { const ringM = mesh(new THREE.TorusGeometry(rad * (0.8 + k * 0.1), 0.2, 6, 30), gold, 0, hgt * (0.3 + k * 0.25), 0, false); ringM.rotation.x = Math.PI / 2; g.add(ringM); }
      g.position.set(Math.cos(a) * d, baseY, Math.sin(a) * d);
      outline(g, 0.08);
      this.add(g);
      // suspended bridges toward the plaza for the nearest towers
      if (d < 100) {
        const len = d - PLAZA_R - rad * 1.8;
        const br = mesh(new THREE.BoxGeometry(2.2, 0.4, len), white, 0, 0, 0);
        const mid = (PLAZA_R + d - rad * 1.8) / 2 + rad * 0.9;
        br.position.set(Math.cos(a) * mid, (TOP + baseY) / 2, Math.sin(a) * mid);
        br.lookAt(new THREE.Vector3(Math.cos(a) * d, baseY, Math.sin(a) * d));
        this.add(br);
      }
    }
    // floating classroom pods and a gliding transit loop
    for (let i = 0; i < 3; i++) {
      const pod = new THREE.Group();
      pod.add(mesh(new THREE.SphereGeometry(4, 20, 14), glass, 0, 0, 0, false));
      pod.add(mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.3, 20), white, 0, -1.4, 0));
      for (let k = 0; k < 4; k++) pod.add(mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), gold, Math.cos(k * 1.57) * 1.8, -1, Math.sin(k * 1.57) * 1.8));
      pod.position.set(-50 + i * 45, TOP + 22 + i * 8, -40 - i * 10);
      pod.userData.y = pod.position.y;
      this.add(pod); this.pods.push(pod);
    }
    this.transit = [];
    for (let i = 0; i < 5; i++) {
      const car = new THREE.Group();
      car.add(mesh(new THREE.CapsuleGeometry(1.2, 3, 4, 10), white, 0, 0, 0));
      car.children[0].rotation.z = Math.PI / 2;
      car.add(mesh(new THREE.SphereGeometry(0.5, 8, 6), glow('#9ff4ff'), 2.4, 0, 0, false));
      this.add(car); this.transit.push(car);
    }
    this.onUpdate((dt, t) => {
      this.pods.forEach((p, i) => { p.position.y = p.userData.y + Math.sin(t * 0.4 + i) * 1.5; });
      this.transit.forEach((c, i) => {
        const a = t * 0.08 + i * 1.256;
        c.position.set(Math.cos(a) * 60, TOP + 30 + Math.sin(a * 2) * 6, Math.sin(a) * 60);
        c.rotation.y = -a;
      });
    });
  }

  // The lower district in the plaza's shadow.
  buildLower(h) {
    const r = mulberry32(31);
    this.homes = [];
    const wood = toon('#8a6a54'), tin = toon('#7a8aa0'), cloth = toon('#b87d8f');
    const spots = [[-18, 6], [-12, -16], [4, -22], [18, -12], [20, 14], [-4, 20], [-24, -4], [10, 22]];
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      const w = 3 + r() * 1.5, d = 3 + r() * 1.2;
      g.add(mesh(new THREE.BoxGeometry(w, 2.4, d), wood, 0, 1.2, 0));
      const roof = mesh(new THREE.BoxGeometry(w + 0.6, 0.2, d + 0.6), tin, 0, 2.6, 0);
      roof.rotation.z = (r() - 0.5) * 0.25; g.add(roof);
      const win = mesh(new THREE.PlaneGeometry(0.7, 0.6), glow('#3a3040'), 0, 1.4, d / 2 + 0.01, false);
      g.add(win);
      g.add(mesh(new THREE.BoxGeometry(0.8, 1.6, 0.05), toon('#5a4030'), w / 4, 0.8, d / 2 + 0.02));
      g.position.set(x, h(x, z), z);
      g.lookAt(0, g.position.y, 0);
      outline(g, 0.025);
      this.add(g);
      this.box(x - w / 2 - 0.2, z - d / 2 - 0.2, x + w / 2 + 0.2, z + d / 2 + 0.2, { minY: -10, maxY: 20 });
      this.homes.push({ g, win });
    }
    // laundry, crates, puddles
    for (let i = 0; i < 10; i++) {
      const a = r() * 6, d = 8 + r() * 20;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      this.add(mesh(new RoundedBoxGeometry(0.8, 0.6, 0.8, 2, 0.06), toon('#9a7a5a'), x, h(x, z) + 0.3, z));
    }
    const puddle = waterMaterial({ shallow: '#4a5a7a', deep: '#2a3450', sky: '#9fb8d8', sparkle: 0.3 });
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(1 + r() * 1.5, 20), puddle);
      p.rotation.x = -Math.PI / 2; const a = r() * 6, d = 6 + r() * 20;
      p.position.set(Math.cos(a) * d, h(Math.cos(a) * d, Math.sin(a) * d) + 0.05, Math.sin(a) * d);
      this.add(p);
    }
    this.circle(0, 0, 4.2, { minY: -10, maxY: TOP - 8 }); // support column
    this.add(rocks({ positions: [[-28, 12, 1.2], [26, -20, 0.9], [14, 28, 1.1]], heightAt: h, color: '#7a8298' }));
  }

  buildLift() {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, TOP, 20, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float a = 0.16 + 0.12 * sin(vUv.y * 40.0 - uTime * 4.0); gl_FragColor = vec4(vec3(0.62, 0.95, 1.0) * a, 1.0); }',
    }));
    beam.position.set(LIFT.x, TOP / 2, LIFT.z);
    this.add(beam);
    this.onUpdate((dt, t) => { beam.material.uniforms.uTime.value = t; });
    for (const y of [TOP + 0.05, this.ground(LIFT.x, LIFT.z) + 0.05]) {
      const pad = mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.12, 24), glow('#9ff4ff', 0.8), LIFT.x, y, LIFT.z, false);
      this.add(pad);
    }
    // a small landing below
    this.add(mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.3, 24), toon('#b8bccb'), LIFT.x, this.ground(LIFT.x, LIFT.z), LIFT.z));
    this.liftTop = new THREE.Vector3(LIFT.x - 2.2, TOP, LIFT.z);
    this.liftBottom = new THREE.Vector3(LIFT.x - 4.5, this.ground(LIFT.x - 4.5, LIFT.z), LIFT.z);
    this.interact({ label: 'Ride the light-lift down', position: new THREE.Vector3(LIFT.x, TOP, LIFT.z), radius: 2.8, markerHeight: 2.4, markerColor: '#9ff4ff', onInteract: () => this.ride(false) });
    this.interact({ label: 'Ride the light-lift up', position: new THREE.Vector3(LIFT.x, this.ground(LIFT.x, LIFT.z), LIFT.z), radius: 2.8, markerHeight: 2.4, markerColor: '#9ff4ff', onInteract: () => this.ride(true) });
  }

  async ride(up) {
    const game = this.game;
    const p = game.player.root.position;
    const from = p.clone(), to = up ? this.liftTop : this.liftBottom;
    await game.cutscene(async () => {
      game.audio.whoosh(2, up);
      const cam = game.engine.camera.position.clone();
      this.bounds = null;
      await game.tweens.tween(2.4, (k) => {
        p.set(LIFT.x, from.y + (to.y - from.y) * k, LIFT.z);
        game.cine.pos.set(LIFT.x + 12, p.y + 4, LIFT.z + 12);
        game.cine.look.set(LIFT.x, p.y + 1, LIFT.z);
        game.camMode = 'cine';
      }, Ease.inOut);
      p.copy(to);
      this.bounds = up ? { x: 0, z: 0, r: PLAZA_R - 1 } : { x: 0, z: 0, r: 50 };
    });
    game.setControl('walk');
    game.cam.yaw = Math.atan2(p.x, p.z);
    if (!up && !this.ws.sawBelow) {
      this.ws.sawBelow = true;
      game.hud.banner('BELOW THE PLAZA', 'The light never quite reaches here', 3000, 'thin');
    }
  }

  // ------------------------------------------------------------ mission
  buildMission() {
    const game = this.game, ws = this.ws;
    ws.taught ??= [];
    this.ilsa = new NPC(this, { preset: 'scholar', name: 'Scholar Ilsa', pos: [-4, 14], y: TOP, yaw: 0.3, onTalk: () => this.talkIlsa() });
    if (game.missions.stage('shareKnowledge') === 'reward' || game.missions.isDone('shareKnowledge')) this.ilsa.moveTo(LIFT.x - 6, LIFT.z + 3, this.ground(LIFT.x - 6, LIFT.z + 3));

    // wealthy citizens (environmental storytelling)
    const lines = [
      'Have you seen the new observatory wing? Forty thousand volumes, and a ceiling of stars.',
      'The district below? I suppose they have… lanterns. Somebody should look into that.',
      'We\'ve digitised every book ever written. Twice.',
    ];
    [[12, -6, 2.2], [-15, -8, 0.9], [-18, 12, 2.6]].forEach(([x, z, yaw], i) => new NPC(this, {
      preset: 'citizen', name: 'Citizen', pos: [x, z], y: TOP, yaw,
      onTalk: () => game.talk([{ who: 'Citizen', text: lines[i] }]),
    }));

    this.interact({
      label: 'Borrow Lumen Books', position: this.libraryPos, radius: 3.2, markerHeight: 3, markerColor: '#fff0c8',
      enabled: () => game.missions.stage('shareKnowledge') === 'books',
      onInteract: async () => {
        await game.talk([{ text: 'Inside, shelves climb higher than you can see. You choose three glowing Lumen Books — the kind that read along with you.' }]);
        game.inventory.add('books', 3 - ws.taught.length);
        game.missions.setStage('shareKnowledge', 'teach', ws.taught.length);
        game.missions.progress('shareKnowledge', ws.taught.length, 3);
        game.audio.chime();
        game.save();
      },
    });

    // children + their lanterns
    const kids = { mira: { pos: [-10, 12], preset: 'childGirl', yaw: 2.4 }, tobi: { pos: [12, -14], preset: 'child', yaw: -0.8 }, pell: { pos: [-16, -9], preset: 'child', yaw: 1.2 } };
    this.lanterns = {};
    this.kids = {};
    for (const [id, k] of Object.entries(kids)) {
      const lesson = LESSONS.find((l) => l.child === id);
      const npc = new NPC(this, {
        preset: k.preset, name: id[0].toUpperCase() + id.slice(1), pos: k.pos, yaw: k.yaw, y: this.ground(...k.pos),
        label: 'Teach', markerColor: '#fff0c8',
        enabled: () => game.missions.stage('shareKnowledge') === 'teach' && !ws.taught.includes(id),
        onTalk: () => this.teach(id, lesson, npc),
      });
      this.kids[id] = npc;
      // lantern post beside each child
      const [x, z] = k.pos;
      const lx = x + 1.4, lz = z + 0.6, gy = this.ground(lx, lz);
      this.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), toon('#4a4050'), lx, gy + 1.1, lz));
      const bulb = mesh(new THREE.SphereGeometry(0.22, 12, 10), glow('#3a3a48'), lx, gy + 2.3, lz, false);
      const light = new THREE.PointLight('#ffcf8a', 0, 12, 1.5);
      light.position.set(lx, gy + 2.3, lz);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,210,140,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      halo.position.copy(light.position); halo.scale.setScalar(3);
      this.add(bulb, light, halo);
      this.lanterns[id] = { bulb, light, halo };
      if (ws.taught.includes(id)) this.lightLantern(id, false);
    }
    if (game.missions.isDone('shareKnowledge')) this.lightDistrict(false);
  }

  lightLantern(id, animate = true) {
    const l = this.lanterns[id];
    l.bulb.material.color.set('#ffe0a0');
    if (!animate) { l.light.intensity = 10; l.halo.material.opacity = 0.8; return; }
    this.game.tweens.tween(1.5, (k) => { l.light.intensity = k * 10; l.halo.material.opacity = k * 0.8; });
  }

  lightDistrict(animate = true) {
    for (const { win } of this.homes) win.material.color.set('#ffd98a');
    for (const id of Object.keys(this.lanterns)) this.lightLantern(id, animate);
    Object.values(this.kids).forEach((k) => k.model.setPose('cheer'));
  }

  async teach(id, lesson, npc) {
    const game = this.game, ws = this.ws;
    const name = npc.name;
    await game.talk([{ who: name, text: ['Is that… a real book? Can you show me?', 'You came down here? Nobody comes down here.', 'I found this book in the rain, but I can\'t read it yet.'][Object.keys(this.kids).indexOf(id)] }]);
    let ok = false;
    while (!ok) {
      game.locks++;
      const i = await game.dialogue.choose({ who: name, text: lesson.q, options: lesson.options });
      game.locks--;
      ok = i === lesson.answer;
      if (!ok) await game.talk([{ who: name, text: 'Hmm… that doesn\'t seem right. Can we try again?' }]);
    }
    game.audio.reward();
    await game.talk([{ who: name, text: lesson.thanks }]);
    ws.taught.push(id);
    game.inventory.take('books', 1);
    this.lightLantern(id);
    npc.model.setPose('cheer');
    game.missions.progress('shareKnowledge', ws.taught.length, 3);
    game.save();
    if (ws.taught.length >= 3) {
      game.missions.setStage('shareKnowledge', 'reward');
      this.ilsa.moveTo(LIFT.x - 6, LIFT.z + 3, this.ground(LIFT.x - 6, LIFT.z + 3));
      game.hud.toast('Scholar Ilsa has come down on the light-lift.');
    }
  }

  async talkIlsa() {
    const game = this.game, name = game.state.nickname, st = game.missions.stage('shareKnowledge');
    if (st === 'talk') {
      await game.talk([
        { who: 'Scholar Ilsa', text: 'A traveller from beyond the Eye! Welcome. Our libraries hold every answer in the known sky.' },
        { who: name, text: 'I need oxygen for my mom. I was told you might help.' },
        { who: 'Scholar Ilsa', text: 'We might. But first — look over the railing. There are children down there who have never held a book.' },
        { who: 'Scholar Ilsa', text: 'We are so rich in knowledge… and none of us thought to carry it forty metres down.' },
        { who: name, text: 'Then let\'s carry it.' },
        { who: 'Scholar Ilsa', text: 'Borrow Lumen Books from the Great Library. The light-lift at the plaza\'s edge will take you below.' },
      ]);
      game.missions.setStage('shareKnowledge', 'books');
    } else if (st === 'books') {
      await game.talk([{ who: 'Scholar Ilsa', text: 'The Great Library is just north of the fountain. Take as many as you can carry.' }]);
    } else if (st === 'teach') {
      await game.talk([{ who: 'Scholar Ilsa', text: `${this.ws.taught.length} of the children have their lanterns lit. Keep going.` }]);
    } else if (st === 'reward') {
      await game.talk([
        { who: 'Scholar Ilsa', text: 'I watched from the lift. I have lived above them my whole life… and never once came down.' },
        { who: 'Scholar Ilsa', text: 'You reminded us what knowledge is for. Please — take this. It breathes like a library at dawn.' },
      ]);
      await game.rewards.giveCore(this.ilsa.pos, 'shareKnowledge');
      this.lightDistrict();
      await game.talk([{ who: 'Scholar Ilsa', text: 'We will open a school down here. Their lanterns will never go out again.' }]);
      game.hud.toast('Return to your car on the plaza (take the light-lift up)');
    } else {
      await game.talk([{ who: 'Scholar Ilsa', text: 'Go well, teacher.' }]);
    }
  }

  onArrive() {
    const st = this.game.missions.stage('shareKnowledge');
    if (st === 'teach') this.game.missions.progress('shareKnowledge', this.ws.taught.length, 3);
    if (st === 'talk') this.game.hud.hint('Scholar Ilsa waits near the fountain · [E] Talk');
  }

  waypoint() {
    const game = this.game, st = game.missions.stage('shareKnowledge');
    const p = game.player.root.position;
    const up = p.y > TOP - 8;
    const lift = up ? this.liftTop : this.liftBottom;
    const at = (v, dy = 2.5) => v.clone().setY(v.y + dy);
    if (game.missions.isDone('shareKnowledge')) return up ? at(game.car.root.position, 3) : at(lift);
    if (st === 'talk') return at(this.ilsa.pos);
    if (st === 'books') return up ? at(this.libraryPos, 4) : at(lift);
    if (st === 'teach') {
      if (up) return at(lift);
      const next = Object.entries(this.kids).find(([id]) => !this.ws.taught.includes(id));
      return next ? at(next[1].pos) : null;
    }
    if (st === 'reward') return up ? at(lift) : at(this.ilsa.pos);
    return null;
  }
}
