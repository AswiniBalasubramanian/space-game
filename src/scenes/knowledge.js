// WORLD 02 — KNOWLEDGE WORLD. A luminous city on floating platforms above a sea of
// clouds, a vast black hole overhead. Wealth above; children in the shadows below.
// Mission: SHARE KNOWLEDGE — teach four children through small learning challenges.
import * as THREE from 'three';
import { World } from './base.js';
import { addLights, makeSky, makeClouds, makeMotes, toon, glowMat, glowSprite, box, cyl, sphere, canvasTexture } from '../world/kit.js';
import { makeBlackHole, makePlanet } from '../world/cosmic.js';
import { makeNPC } from '../systems/character.js';
import { boxCollider } from '../systems/physics.js';
import { mulberry32, clamp } from '../core/noise.js';
import { arrival, rewardCore, addReturnCar } from './common.js';
import * as D from '../world/details.js';

const LOWER_Y = -18;
const RAMP = { x: 2.6, z0: 29, z1: 80 };
const LIBRARY = new THREE.Vector3(0, 0, -17);
const ARCHIVIST = new THREE.Vector3(3, 0, -6);

const QUIZ = [
  {
    intro: 'Are you a teacher? Nobody comes down here. Can you help me count?',
    q: 'If one lantern needs 3 sparks, how many sparks do 4 lanterns need?',
    choices: ['7', '12', '34'], answer: 1,
    teach: 'Right! 3 + 3 + 3 + 3 — four groups of three make twelve. That\'s multiplication.',
  },
  {
    intro: 'The gardens up there are so green. Ours never grow.',
    q: 'Why do plants need sunlight?',
    choices: ['To make their own food', 'To stay warm at night', 'So they can sleep'], answer: 0,
    teach: 'Plants catch light in their leaves and turn it into food. It\'s called photosynthesis.',
  },
  {
    intro: 'I want to read the signs in the city, but the letters won\'t hold still.',
    q: 'Which word means "to help someone learn"?',
    choices: ['Forget', 'Teach', 'Hide'], answer: 1,
    teach: 'Teach. And now that you know it — you can teach someone else too.',
  },
  {
    intro: 'Why does the big dark star pull the light around it?',
    q: 'What pulls everything toward a black hole?',
    choices: ['Magnetism', 'Wind', 'Gravity'], answer: 2,
    teach: 'Gravity! The more mass something has, the harder it pulls. Even light can\'t escape a black hole.',
  },
];

export default class KnowledgeWorld extends World {
  constructor(game, id) {
    super(game, id);
    this.mood = 'knowledge';
    this.bloom = { strength: 0.4, radius: 0.5, threshold: 0.95 };
    this.grade = { vignette: 0.42, warmth: 0.1, saturation: 1.15, exposure: 0.82 };
  }

  groundAt(x, z) {
    if (Math.hypot(x, z) < 30) return 0;
    if (Math.abs(x) < RAMP.x && z >= RAMP.z0 && z <= RAMP.z1) return (LOWER_Y * (z - RAMP.z0)) / (RAMP.z1 - RAMP.z0);
    if (x > -26 && x < 26 && z > RAMP.z1 - 0.5 && z < 124) return LOWER_Y;
    return null;
  }

  async build() {
    const s = this.scene;
    const sunDir = new THREE.Vector3(-0.8, 0.28, -0.35).normalize();
    this.sunDir = sunDir;
    s.fog = new THREE.FogExp2('#d8a88a', 0.0007);
    this.lights = addLights(s, { sunDir, sunColor: '#ffd9a0', sunIntensity: 2.1, sky: '#d8c8e8', ground: '#5a4a7a', hemi: 0.7, ambient: 0.1 });
    this.add(makeSky({ top: '#1f2f6e', mid: '#6a78c0', horizon: '#ffcf9a', bottom: '#f0b890', sunDir, sunColor: '#ffd28a', glow: '#ffa060', glowAmt: 0.9, cirrus: 0.3, stars: 0.35 }));

    // the landmark: a vast black hole above the city, visible from everywhere
    const bh = makeBlackHole({ size: 170, tilt: 0.55, dust: 2500, seed: 7 });
    bh.position.set(120, 1100, -1500);
    bh.rotation.set(0.2, 0.4, 0);
    this.add(bh);
    const moon = makePlanet({ radius: 150, sunDir, seed: 4, ocean: '#c8b8e0', shallow: '#e8dcf5', land: '#f5ecd8', land2: '#ffffff', atmo: '#ffd8b0', cloudAmt: 0.2, glow: 0.8 });
    moon.position.set(-1600, 500, 900);
    this.add(moon);

    // sea of clouds far below + cumulus around the platforms
    this.add(makeClouds({ count: 30, seed: 3, rMin: 60, rMax: 700, yMin: -120, yMax: -70, sMin: 40, sMax: 90, lit: '#fff1e0', shadow: '#b48aa8', rimColor: '#ffc080' }));
    this.add(makeClouds({ count: 18, seed: 9, rMin: 200, rMax: 800, yMin: 60, yMax: 220, sMin: 25, sMax: 60, lit: '#fff4e4', shadow: '#a890b8', rimColor: '#ffb070' }));
    const seaMat = new THREE.MeshBasicMaterial({ color: '#f3d6c0', fog: true });
    const sea = new THREE.Mesh(new THREE.CircleGeometry(3000, 48), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -110;
    s.add(sea);

    this.gold = glowMat('#ffcf7a', 1.1);
    this.white = toon('#e8dfd0');
    this.buildUpper();
    this.buildLower();
    this.decorate();
    this.add(makeMotes({ count: 400, center: new THREE.Vector3(0, -20, 40), spread: new THREE.Vector3(120, 50, 160), color: '#ffe0a0', size: 5, opacity: 0.8, rise: 0.4 }));
  }

  platform(x, y, z, r, { top = '#d8c6a8', rock = '#b8a898', depth = 8 } = {}) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const disc = cyl(r, r * 0.96, 0.8, top, 0, -0.4, 0, 48);
    g.add(disc);
    const under = new THREE.Mesh(new THREE.ConeGeometry(r * 0.95, depth, 32, 2), toon(rock));
    under.rotation.x = Math.PI;
    under.position.y = -0.8 - depth / 2;
    under.castShadow = true;
    g.add(under);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 8, 64), this.gold);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.5, 32), new THREE.MeshBasicMaterial({ color: '#ffb060', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = Math.PI / 2;
    glow.position.y = -0.85 - depth;
    g.add(glow);
    this.scene.add(g);
    return g;
  }

  tower(parent, x, z, h, r, rng) {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 16), this.white);
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    t.add(body);
    const bands = Math.floor(h / 6);
    for (let i = 1; i <= bands; i++) {
      const y = (i / (bands + 1)) * h;
      const rr = r - (r * 0.3 * y) / h;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(rr + 0.05, rr + 0.05, 0.5, 16, 1, true), i % 2 ? this.gold : glowMat('#fff2d0', 1.3));
      band.position.y = y;
      t.add(band);
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(r * 0.7, h * 0.35, 12), toon('#e8d4a8'));
    spire.position.y = h + h * 0.175;
    t.add(spire);
    const tip = glowSprite('#ffd890', 4, 0.9);
    tip.position.y = h + h * 0.35;
    t.add(tip);
    if (rng() < 0.5) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.8, 0.15, 8, 48), this.gold);
      ring.rotation.x = Math.PI / 2 + 0.2;
      ring.position.y = h * 0.7;
      t.add(ring);
      this.animate((tt) => (ring.rotation.z = tt * 0.2));
    }
    parent.add(t);
    return t;
  }

  holo(x, y, z, ry, w, h, draw) {
    const tex = canvasTexture(512, 320, draw);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { map: { value: tex }, time: { value: 0 }, tint: { value: new THREE.Color('#9fe8ff') } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */ `uniform sampler2D map; uniform float time; uniform vec3 tint; varying vec2 vUv;
        void main(){ vec4 t = texture2D(map, vUv); float scan = 0.75 + 0.25*sin(vUv.y*300.0 - time*6.0);
          float flick = 0.9 + 0.1*sin(time*23.0); float edge = smoothstep(0.0,0.03,vUv.x)*smoothstep(0.0,0.03,1.0-vUv.x)*smoothstep(0.0,0.03,vUv.y)*smoothstep(0.0,0.03,1.0-vUv.y);
          vec3 c = tint*(0.12 + t.rgb*1.6)*scan*flick; gl_FragColor = vec4(c*0.7, (0.12 + t.a*0.6)*edge); }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.scene.add(m);
    this.animate((t) => { mat.uniforms.time.value = t; m.position.y = y + Math.sin(t + x) * 0.15; });
    return m;
  }

  buildUpper() {
    const rng = mulberry32(21);
    const plaza = this.platform(0, 0, 0, 30, { depth: 14 });
    // gold inlay rings on the plaza floor
    for (const r of [8, 16, 24]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r + 0.12, 96), this.gold);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      plaza.add(ring);
    }
    // library: a glass dome full of drifting books
    const lib = new THREE.Group();
    lib.position.copy(LIBRARY);
    lib.add(cyl(9, 9.5, 1.2, '#efe2c8', 0, 0.6, 0, 48));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.abs(Math.sin(a) - 1) < 0.05) continue;
      lib.add(cyl(0.35, 0.4, 7, '#f5efe4', Math.cos(a) * 8.5, 4.2, Math.sin(a) * 8.5, 10));
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: '#ffe8c0', transparent: true, opacity: 0.35, emissive: '#6a4a20', depthWrite: false, side: THREE.DoubleSide }));
    dome.position.y = 7.6;
    lib.add(dome);
    for (let i = 0; i < 8; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(9, 0.12, 6, 48, Math.PI), this.gold);
      rib.rotation.y = (i / 8) * Math.PI;
      rib.position.y = 7.6;
      lib.add(rib);
    }
    const inner = glowSprite('#ffd890', 10, 0.25);
    inner.position.y = 7;
    lib.add(inner);
    const books = new THREE.Group();
    const bc = ['#a9203e', '#f2703c', '#5d93c9', '#e0c070', '#5f9c6b', '#f5efe4'];
    for (let i = 0; i < 40; i++) {
      const b = box(0.5, 0.7, 0.14, bc[i % bc.length], 0, 0, 0);
      const a = rng() * Math.PI * 2, r = 2 + rng() * 5;
      b.position.set(Math.cos(a) * r, 3 + rng() * 9, Math.sin(a) * r);
      b.rotation.set(rng(), rng() * 6, rng());
      books.add(b);
    }
    lib.add(books);
    this.animate((t) => { books.rotation.y = t * 0.08; });
    this.scene.add(lib);
    this.colliders.push({ type: 'circle', x: LIBRARY.x, z: LIBRARY.z, r: 9.4 });
    const sign = this.holo(0, 12.5, -7.2, 0, 10, 2.4, (g, w, h) => {
      g.fillStyle = '#fff'; g.font = '600 64px serif'; g.textAlign = 'center';
      g.fillText('THE GRAND ARCHIVE', w / 2, 120);
      g.font = '28px monospace'; g.fillText('MEMBERS ONLY · ENTRY 10,000 LUMENS', w / 2, 200);
    });
    sign.material.uniforms.tint.value.set('#ffe0a0');

    // plaza towers & holographic info
    for (const [x, z, h, r] of [[-22, -12, 38, 2.2], [22, -14, 46, 2.6], [-24, 10, 30, 1.8], [24, 12, 34, 2]]) {
      this.tower(plaza, x, z, h, r, rng);
      this.colliders.push({ type: 'circle', x, z, r: r + 0.3 });
    }
    const glyphs = (g, w, h) => {
      g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 3;
      g.font = '30px monospace';
      g.fillText('∑ KNOWLEDGE INDEX', 24, 50);
      g.fillText('E = mc²   ∫ f(x) dx', 24, 100);
      g.beginPath(); g.moveTo(24, 260);
      for (let x = 0; x < 460; x += 12) g.lineTo(24 + x, 260 - Math.abs(Math.sin(x * 0.02)) * 100 - x * 0.1);
      g.stroke();
    };
    this.holo(-12, 4, 6, 0.8, 5, 3.2, glyphs);
    this.holo(13, 4.2, 4, -0.8, 5, 3.2, glyphs);
    this.holo(0, 5, 20, Math.PI, 7, 2.8, (g, w) => {
      g.fillStyle = '#fff'; g.font = '44px serif'; g.textAlign = 'center';
      g.fillText('▼  LOWER DISTRICT', w / 2, 140);
      g.font = '24px monospace'; g.fillText('no archive access', w / 2, 200);
    });
    // benches & gardens
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = Math.cos(a) * 19, z = Math.sin(a) * 19;
      if (z > 20 || Math.hypot(x - LIBRARY.x, z - LIBRARY.z) < 12) continue;
      const planter = cyl(1.6, 1.4, 0.8, '#e8dcc4', x, 0.4, z, 24);
      this.scene.add(planter);
      const tree = sphere(1.6, null, x, 2.4, z, toon('#7cc06a'));
      tree.scale.y = 1.2;
      this.scene.add(tree);
      this.colliders.push({ type: 'circle', x, z, r: 1.7 });
    }
    // wealthy citizens
    const robes = ['#f5efe4', '#e8d4a8', '#c9b8e8', '#a8d8e8'];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 1;
      makeNPC(this, { lite: true, gender: i % 2 ? 'male' : 'female', top: robes[i % 4], robe: robes[(i + 1) % 4], hair: '#3a2a20', scarf: '#ffcf7a', position: new THREE.Vector3(Math.cos(a) * 12, 0, Math.sin(a) * 12 + 2), yaw: a + Math.PI, phase: i });
    }
    const npc = this.game.content.npcs.archivist;
    this.archivist = makeNPC(this, { gender: 'female', elder: true, top: '#f5efe4', robe: '#e8d4a8', scarf: '#a9203e', position: ARCHIVIST.clone(), yaw: Math.PI * 0.85 });
    this.archivistName = npc.name;

    // ramp down to the lower district
    const rampLen = Math.hypot(RAMP.z1 - RAMP.z0, LOWER_Y);
    const ramp = box(RAMP.x * 2, 0.4, rampLen, '#d8ccb8', 0, LOWER_Y / 2 - 0.2, (RAMP.z0 + RAMP.z1) / 2);
    ramp.rotation.x = Math.atan2(-LOWER_Y, RAMP.z1 - RAMP.z0);
    this.scene.add(ramp);
    for (const side of [-1, 1]) {
      const rail = box(0.1, 0.1, rampLen, null, side * RAMP.x, LOWER_Y / 2 + 0.9, (RAMP.z0 + RAMP.z1) / 2, this.gold);
      rail.rotation.x = ramp.rotation.x;
      this.scene.add(rail);
    }

    // distant floating districts & suspended bridges
    const far = [[-90, 12, -60, 22], [95, -6, -40, 26], [-70, 30, 70, 18], [110, 22, 60, 20], [0, 40, -120, 28], [-140, -10, 10, 16]];
    for (const [x, y, z, r] of far) {
      const p = this.platform(x, y, z, r, { depth: r * 0.8 });
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) this.tower(p, (rng() - 0.5) * r, (rng() - 0.5) * r, 20 + rng() * 40, 1.4 + rng() * 1.5, rng);
      const bob = rng() * 6;
      this.animate((t) => (p.position.y = y + Math.sin(t * 0.25 + bob) * 1.2));
    }
    for (const [a, b] of [[0, 4], [1, 3], [2, 5]]) {
      const pa = new THREE.Vector3(far[a][0], far[a][1], far[a][2]), pb = new THREE.Vector3(far[b][0], far[b][1], far[b][2]);
      const len = pa.distanceTo(pb);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, len), this.white);
      bridge.position.copy(pa).add(pb).multiplyScalar(0.5);
      bridge.lookAt(pb);
      this.scene.add(bridge);
    }
    // a sky-tram gliding between platforms
    const tram = new THREE.Group();
    tram.add(box(4, 1.6, 1.6, '#f5efe4', 0, 0, 0));
    tram.add(box(3.2, 0.6, 1.62, null, 0, 0.2, 0, glowMat('#ffd890', 1.5)));
    this.scene.add(tram);
    this.animate((t) => { const a = t * 0.05; tram.position.set(Math.cos(a) * 80, 26 + Math.sin(a * 3) * 3, Math.sin(a) * 80); tram.rotation.y = -a; });
  }

  buildLower() {
    const s = this.scene;
    const rng = mulberry32(8);
    // the lower district: small homes in the shadow of a luxury platform overhead
    const lower = new THREE.Group();
    lower.position.y = LOWER_Y;
    s.add(lower);
    const floor = box(52, 1, 44, '#8a8278', 0, -0.5, 102);
    lower.add(floor);
    const under = new THREE.Mesh(new THREE.ConeGeometry(30, 20, 24), toon('#6a5e58'));
    under.rotation.x = Math.PI;
    under.position.set(0, -11, 102);
    lower.add(under);
    for (let i = 0; i < 10; i++) {
      const x = -20 + (i % 5) * 10, z = i < 5 ? 90 : 116;
      const h = 3 + rng() * 2;
      const home = new THREE.Group();
      home.position.set(x, 0, z);
      home.add(box(5, h, 4, ['#9a8a7a', '#8a7a6a', '#a89888'][i % 3], 0, h / 2, 0));
      const roof = box(5.6, 0.25, 4.6, '#5a4e48', 0, h + 0.1, 0);
      roof.rotation.z = (rng() - 0.5) * 0.2;
      home.add(roof);
      home.add(box(1, 1.8, 0.1, '#4a3a30', 0, 0.9, i < 5 ? 2.01 : -2.01));
      const win = box(0.8, 0.7, 0.1, null, 1.5, h * 0.6, i < 5 ? 2.02 : -2.02, glowMat('#ffb870', 0.6));
      home.add(win);
      lower.add(home);
      this.colliders.push(boxCollider(x, z, 5.2, 4.2));
    }
    // laundry lines, crates, a dry fountain
    for (let i = 0; i < 8; i++) lower.add(box(0.8, 0.8, 0.8, '#7a5a3a', -22 + rng() * 44, 0.4, 96 + rng() * 14));
    lower.add(cyl(3, 3.2, 0.8, '#7a7068', 0, 0.4, 103, 24));
    this.colliders.push({ type: 'circle', x: 0, z: 103, r: 3.3 });
    // the luxury platform overhead, casting its shadow
    const over = this.platform(0, 16, 104, 30, { depth: 8 });
    for (let i = 0; i < 4; i++) this.tower(over, -18 + i * 12, (i % 2) * 8 - 4, 26 + i * 6, 2, rng);

    // lanterns (dark until the children learn)
    this.lanterns = [];
    this.children = [];
    const names = this.game.content.npcs.children;
    const spots = [[-15, 98], [15, 98], [-12, 110], [12, 110]];
    const st = this.game.missions.get('share_knowledge');
    spots.forEach(([x, z], i) => {
      const post = cyl(0.08, 0.1, 2.6, '#3a3430', x + 1.6, LOWER_Y + 1.3, z);
      s.add(post);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), toon('#6a5a48'));
      lamp.position.set(x + 1.6, LOWER_Y + 2.8, z);
      s.add(lamp);
      const light = new THREE.PointLight('#ffb060', 0, 12, 1.5);
      light.position.copy(lamp.position);
      s.add(light);
      const glow = glowSprite('#ffb060', 2.5, 0);
      glow.position.copy(lamp.position);
      s.add(glow);
      const L = { lamp, light, glow, lit: false, base: lamp.position.clone() };
      this.lanterns.push(L);
      const child = makeNPC(this, { gender: i % 2 ? 'male' : 'female', child: true, top: ['#c96a4a', '#5d93c9', '#e0c070', '#5f9c6b'][i], bottom: '#6a5e58', hair: ['#2a1b17', '#4a3020', '#1a1410', '#6a4a30'][i], position: new THREE.Vector3(x, LOWER_Y, z), yaw: i < 2 ? 0 : Math.PI, phase: i * 1.7 });
      this.children.push({ npc: child, name: names[i] || `Child ${i + 1}`, quiz: QUIZ[i % QUIZ.length], taught: !!st?.data?.taught?.includes(i), lantern: L, index: i });
      if (this.children[i].taught) this.lightLantern(L, true);
    });
    this.overLight = new THREE.PointLight('#8a9ad8', 6, 60, 1.2);
    this.overLight.position.set(0, LOWER_Y + 10, 102);
    s.add(this.overLight);
  }

  decorate() {
    const s = this.scene;
    const L = LOWER_Y;
    // plaza: lamp ring, fountain, benches, banners, flower beds
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const x = Math.cos(a) * 27.5, z = Math.sin(a) * 27.5;
      if (Math.abs(x) < 5 && z > 0) continue;
      const lp = D.lampPost(x, 0, z, { color: '#c9a860', glow: '#ffe0a0', height: 3.6 });
      lp.rotation.y = -a + Math.PI;
      this.add(lp);
    }
    this.add(D.fountain(0, 0, 9, { r: 2.6 }));
    for (const [x, z, ry] of [[-4.6, 9, Math.PI / 2], [4.6, 9, -Math.PI / 2], [0, 13.6, Math.PI]]) this.add(D.bench(x, 0, z, ry, '#e8dfd0'));
    for (const x of [-10.5, -6, 6, 10.5]) this.add(D.banner(x, 0, -8.2, { color: x < 0 ? '#a9203e' : '#3f5fa8', h: 6 }));
    const flowers = [];
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2 + (i % 3) * 0.02, r = 24.5 + (i % 3) * 0.35;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 5 && z > 0) continue;
      flowers.push({ x, y: 0.12, z, s: 0.9, color: ['#ffffff', '#ffcf7a', '#e58fd6', '#f2703c'][i % 4] });
    }
    s.add(D.scatter(new THREE.SphereGeometry(0.16, 8, 6), toon('#ffffff'), flowers, { colors: true, cast: false }));
    const hedge = D.scatter(new THREE.BoxGeometry(1, 0.6, 0.6), toon('#6aa84f'), Array.from({ length: 30 }, (_, i) => { const a = (i / 30) * Math.PI * 2; return { x: Math.cos(a) * 25.8, y: 0.3, z: Math.sin(a) * 25.8, ry: -a + Math.PI / 2 }; }).filter((p) => !(Math.abs(p.x) < 5 && p.z > 0)));
    s.add(hedge);
    this.add(D.makeBirds({ count: 18, center: new THREE.Vector3(0, 45, -20), radius: 70, color: '#f5efe4' }));

    // lower district: lived-in clutter
    this.add(D.laundryLine(-22, 94, -12, 94, () => L, { colors: ['#e8dcc4', '#8a7a6a', '#a9203e', '#5d93c9'] }));
    this.add(D.laundryLine(8, 112, 22, 112, () => L, { seed: 7 }));
    for (const [x, z, sc] of [[-24, 100, 0.9], [-23, 101.2, 0.7], [23.5, 99, 0.9], [22, 108, 0.8], [-8, 120, 0.7]]) this.add(D.crate(x, L, z, sc, x));
    for (const [x, z] of [[24, 102], [-24, 106], [-4, 121]]) this.add(D.barrel(x, L, z, 0.9, '#6a5a4a'));
    for (const [x, z] of [[-6, 99], [7, 106], [-10, 108]]) {
      const pud = new THREE.Mesh(new THREE.CircleGeometry(1 + Math.abs(x) * 0.05, 20), new THREE.MeshBasicMaterial({ color: '#5a6a8a', transparent: true, opacity: 0.5 }));
      pud.rotation.x = -Math.PI / 2;
      pud.position.set(x, L + 0.02, z);
      pud.scale.set(1.4, 1, 1);
      s.add(pud);
    }
    // chalk drawings the children made
    const chalk = (x, z, draw) => {
      const tex = canvasTexture(256, 256, draw);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, L + 0.03, z);
      s.add(m);
    };
    chalk(-4, 104, (g) => { g.strokeStyle = 'rgba(255,240,220,0.85)'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 60, 0, 7); g.stroke(); for (let i = 0; i < 8; i++) { const a = i * 0.785; g.beginPath(); g.moveTo(128 + Math.cos(a) * 75, 128 + Math.sin(a) * 75); g.lineTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110); g.stroke(); } });
    chalk(5, 100, (g) => { g.strokeStyle = 'rgba(255,200,160,0.8)'; g.lineWidth = 5; for (let i = 0; i < 4; i++) g.strokeRect(30 + i * 50, 60 + (i % 2) * 60, 46, 46); g.font = '40px sans-serif'; g.fillStyle = 'rgba(255,240,220,0.8)'; g.fillText('1 2 3 4', 40, 230); });
    // pipes running along the homes
    for (const z of [88.1, 117.9]) { const pipe = cyl(0.12, 0.12, 48, '#6a6a70', 0, L + 4.3, z, 8); pipe.rotation.z = Math.PI / 2; s.add(pipe); }
    for (const [x, z] of [[-18, 88], [2, 88], [-12, 118], [14, 118]]) s.add(cyl(0.1, 0.1, 4.3, '#6a6a70', x, L + 2.15, z, 8));
    s.add(D.stringLights(new THREE.Vector3(-20, L + 4.2, 96), new THREE.Vector3(20, L + 4.2, 96), { bulbs: 16, color: '#ffb870', sag: 1 }));
    s.add(D.stringLights(new THREE.Vector3(-20, L + 4.2, 110), new THREE.Vector3(20, L + 4.2, 110), { bulbs: 16, color: '#ffb870', sag: 1 }));
    this.add(D.signpost(3.5, L, 82, 0, ['ARCHIVE ↑']));
  }

  lightLantern(L, instant = false) {
    L.lit = true;
    L.lamp.material = glowMat('#ffc070', 2.5);
    const f = (k) => { L.light.intensity = k * 18; L.glow.material.opacity = k * 0.9; };
    if (instant) f(1); else this.game.tween(1500, f);
  }

  async enter(opts) {
    const g = this.game, M = g.missions;
    this.setupInteractions();
    await arrival(this, {
      car: { x: -12, z: -2, yaw: 0.9 }, player: { x: -8, z: 2, yaw: 0.6 },
      from: new THREE.Vector3(-110, 50, 120), to: new THREE.Vector3(-45, 14, 40), look: new THREE.Vector3(0, 10, -10), ms: opts.resume ? 3000 : 8500,
    });
    if (!M.get('share_knowledge')) {
      M.start('share_knowledge', { taught: [] });
      g.hud.hint('Speak with the <b>Archivist</b> by the library', 8000);
    }
    this.refreshMarkers();
  }

  refreshMarkers() {
    const g = this.game, M = g.missions;
    g.markers.clear();
    if (M.status('share_knowledge') === 'complete') { g.markers.set('car', () => g.vehicle.position.clone().add(new THREE.Vector3(0, 2, 0))); return; }
    const step = M.step('share_knowledge');
    if (step === 0) g.markers.set('arch', () => this.archivist.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)));
    else if (step === 1) {
      const p = g.player.position;
      if (p.y > LOWER_Y + 4) g.markers.set('ramp', new THREE.Vector3(0, 1.5, 30));
      for (const c of this.children) if (!c.taught) g.markers.set('child' + c.index, c.npc.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)), { size: 0.035 });
    }
  }

  setupInteractions() {
    const g = this.game, M = g.missions, I = g.interactions;
    const walking = () => g.mode === 'walk';
    I.add({ pos: () => this.archivist.group.position, radius: 2.6, label: `Talk to ${this.archivistName}`, enabled: walking, action: () => this.talkArchivist() });
    for (const c of this.children) {
      I.add({
        pos: () => c.npc.group.position, radius: 2.2, dy: 2,
        label: () => (c.taught ? `Talk to ${c.name}` : M.step('share_knowledge') >= 1 ? `Teach ${c.name}` : `Talk to ${c.name}`),
        enabled: walking,
        action: () => this.teach(c),
      });
    }
    I.add({ pos: LIBRARY.clone().add(new THREE.Vector3(0, 0, 9.5)), radius: 3, label: 'Observe · Grand Archive', enabled: walking, action: () => g.dialogue.say([{ who: 'player', text: 'Millions of books behind glass. And a sign that says who is allowed to read them.' }]) });
    addReturnCar(this);
  }

  async talkArchivist() {
    const g = this.game, M = g.missions;
    const npc = g.content.npcs.archivist, name = npc.name;
    const ap = this.archivist.group.position;
    const cam = { pos: ap.clone().add(new THREE.Vector3(2.4, 2.1, 2.8)), target: ap.clone().add(new THREE.Vector3(0, 1.4, 0)), ms: 1200 };
    const step = M.step('share_knowledge');
    if (M.status('share_knowledge') === 'complete') {
      await g.dialogue.say([{ who: name, text: 'We are opening the Archive doors. All of them. Thank you, teacher.', cam }]);
    } else if (step === 0) {
      await g.dialogue.say([
        { who: name, text: 'A traveller from beyond the dark star. How rare.', cam },
        { who: name, text: npc.greet },
        { who: 'player', text: 'Why not teach them?' },
        { who: name, text: 'We tell ourselves someone else will. No one ever does.' },
        {
          who: name, text: 'Take this primer. If you can light a lantern of understanding in four of them… I will give you what you came for.',
          choices: [{ text: 'I\'ll go down and teach them.', value: 1 }, { text: 'What\'s down there?', value: 2 }],
        },
      ]).then(async (v) => {
        if (v === 2) await g.dialogue.say([{ who: name, text: 'The Lower District. Follow the ramp at the south edge — where our light doesn\'t reach.' }]);
      });
      M.setStep('share_knowledge', 1);
      g.audio.sfx('mission');
      g.overlay.banner('Mission', g.content.missions.share_knowledge.title, g.content.missions.share_knowledge.description, 3200);
    } else {
      await g.dialogue.say([{ who: name, text: `${M.count('share_knowledge', 'taught')} of ${g.content.missions.share_knowledge.required} lanterns lit. Their light reaches even up here.`, cam }]);
    }
    g.cine.release();
    this.refreshMarkers();
  }

  async teach(c) {
    const g = this.game, M = g.missions;
    const cp = c.npc.group.position;
    const cam = { pos: cp.clone().add(new THREE.Vector3(2, 1.5, c.index < 2 ? 2.5 : -2.5)), target: cp.clone().add(new THREE.Vector3(0, 0.9, 0)), ms: 1000 };
    if (c.taught) {
      await g.dialogue.say([{ who: c.name, text: ['I\'m going to teach my little brother tonight!', 'Look — my lantern is still glowing!', 'Will you come back and teach us more?'][c.index % 3], cam }]);
      g.cine.release();
      return;
    }
    if (M.step('share_knowledge') < 1) {
      await g.dialogue.say([{ who: c.name, text: 'Are you from up there? They don\'t usually come down here.', cam }]);
      g.cine.release();
      return;
    }
    const qz = c.quiz;
    await g.dialogue.say([{ who: c.name, text: qz.intro, cam }]);
    let correct = false;
    while (!correct) {
      const pick = await g.dialogue.say([{ who: 'player', text: qz.q, choices: qz.choices.map((t, i) => ({ text: t, value: i })) }]);
      if (pick === qz.answer) correct = true;
      else {
        g.audio.sfx('fail');
        const again = await g.dialogue.say([{ who: c.name, text: 'Hmm… I don\'t think that\'s it. Can we try again?', choices: [{ text: 'Let\'s try again.', value: 1 }, { text: 'Later.', value: 0 }] }]);
        if (!again) { g.cine.release(); return; }
      }
    }
    await g.dialogue.say([{ who: 'player', text: qz.teach }, { who: c.name, text: 'I understand! Look — my lantern!' }]);
    g.cine.release();
    c.taught = true;
    const st = M.get('share_knowledge');
    st.data.taught = [...(st.data.taught || []), c.index];
    this.lightLantern(c.lantern);
    g.audio.sfx('deliver');
    const n = M.add('share_knowledge', 'taught', 1);
    const req = g.content.missions.share_knowledge.required;
    g.overlay.toast(`${Math.min(n, req)} / ${req} children taught`);
    this.refreshMarkers();
    if (n >= Math.min(req, this.children.length)) this.complete();
  }

  async complete() {
    const g = this.game, M = g.missions;
    g.busy = true;
    g.setMode('cutscene');
    g.overlay.letterbox(true);
    // the lanterns rise toward the city above
    g.cine.to(new THREE.Vector3(18, LOWER_Y + 5, 128), new THREE.Vector3(0, LOWER_Y + 14, 100), 2500);
    g.audio.sfx('mission');
    await g.tween(5000, (k) => {
      for (const L of this.lanterns) {
        L.lamp.position.copy(L.base).add(new THREE.Vector3(0, k * 30, 0));
        L.light.position.copy(L.lamp.position);
        L.glow.position.copy(L.lamp.position);
      }
      this.overLight.intensity = 6 + k * 30;
      this.overLight.color.lerp(new THREE.Color('#ffc080'), k * 0.05);
    });
    g.busy = false;
    g.cine.release();
    const npc = g.content.npcs.archivist;
    await g.dialogue.say([{ who: npc.name, text: npc.thanks, cam: { pos: new THREE.Vector3(10, LOWER_Y + 4, 118), target: new THREE.Vector3(0, LOWER_Y + 6, 100), ms: 1200 } }]);
    g.cine.release();
    await rewardCore(this, { pos: new THREE.Vector3(0, LOWER_Y + 1.5, 106), camFrom: new THREE.Vector3(9, LOWER_Y + 3.5, 120), missionId: 'share_knowledge' });
    M.setStep('share_knowledge', 2);
    this.refreshMarkers();
  }

  update(dt, t) {
    super.update(dt, t);
    const g = this.game;
    this.lights.follow(this.focus());
    // re-evaluate the ramp marker as the player descends
    this._mk = (this._mk || 0) + dt;
    if (this._mk > 1 && g.mode === 'walk') {
      this._mk = 0;
      const below = g.player.position.y < LOWER_Y + 4;
      if (below !== this._wasBelow) { this._wasBelow = below; this.refreshMarkers(); }
    }
    for (const L of this.lanterns) if (L.lit) L.glow.scale.setScalar(2.5 + Math.sin(t * 3 + L.base.x) * 0.2);
    g.player.minPitch = -0.2;
  }
}

void clamp;
