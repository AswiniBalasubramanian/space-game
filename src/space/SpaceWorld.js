import * as THREE from 'three';
import { BaseWorld } from '../worlds/BaseWorld.js';
import { createSkyDome, starPoints } from '../render/Sky.js';
import { createBlackHole } from '../render/cosmic.js';
import { rockGeometry } from '../render/nature.js';
import { planetTexture, nebulaTexture, glowTexture, textSprite, streakTexture } from '../render/textures.js';
import { vtoon, mat4, scatterInstanced } from '../render/toon.js';
import { mulberry32 } from '../utils/noise.js';
import { Ease } from '../core/Tween.js';
import { WORLD_MISSION } from '../data/content.js';

// THE QUIET SEA — a living watercolour cosmos: a painted planet below, drifting
// nebulae, asteroid rivers, comets, and three enormous black holes.
const HOLES = {
  farm: { pos: [-60, 140, -950], radius: 55, core: [255, 244, 200], edge: [242, 176, 70], glow: 'rgba(255,214,130,1)', seed: 3, tilt: 1.2 },
  knowledge: { pos: [-1050, 360, -380], radius: 68, core: [255, 252, 236], edge: [236, 190, 110], glow: 'rgba(255,240,200,1)', seed: 7, tilt: 1.35 },
  hunger: { pos: [900, -40, -720], radius: 60, core: [255, 214, 170], edge: [226, 88, 52], glow: 'rgba(242,112,60,1)', seed: 11, tilt: 1.1 },
};
const PLANET = { pos: new THREE.Vector3(0, -1050, 350), radius: 820 };

export default class SpaceWorld extends BaseWorld {
  mood = 'space';
  bloom = 0.14;
  far = 9000;

  heightAt() { return -1e9; }
  collide() {}

  async build(opts) {
    this.from = opts.from;
    const s = this.scene;
    const sky = createSkyDome({ radius: 4000, top: '#07122e', mid: '#0f2a5a', horizon: '#1d4f86', bottom: '#0a1836', stars: 1.2, nebula: 1, nebA: '#3fb8d8', nebB: '#c86aa8', cirrus: 0, sunDir: [0.6, 0.2, -0.7], sun: '#9fdcff' });
    this.add(sky); this.skyFollow.push(sky);
    const stars = starPoints({ count: 5000, radius: 3600, size: 2.6 });
    this.add(stars); this.skyFollow.push(stars);
    this.onUpdate((dt, t) => { sky.userData.update(t); stars.userData.update(t); });

    s.add(new THREE.HemisphereLight('#9fd0ff', '#2a2050', 1.4));
    const sun = new THREE.DirectionalLight('#fff0d8', 2.2);
    sun.position.set(600, 300, -500);
    s.add(sun);

    this.buildPlanet();
    this.buildNebulae();
    this.buildAsteroids();
    this.buildDistantPlanets();
    this.buildComets();
    this.buildDust();
    this.buildHoles();
    this.buildHomeBeacon();
  }

  buildPlanet() {
    const tex = planetTexture(4, { sea: '#4fc3d9', deep: '#1f5aa8', land: '#7cc46a', land2: '#d9b36a', sand: '#f0dca0', level: 0.52 });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET.radius, 96, 64), new THREE.MeshToonMaterial({ map: tex, gradientMap: null }));
    planet.position.copy(PLANET.pos);
    planet.rotation.z = 0.3;
    this.add(planet);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(PLANET.radius * 1.06, 64, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color('#7fe0ff') } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(uColor * f * 1.6, 1.0); }',
    }));
    atmo.position.copy(PLANET.pos);
    this.add(atmo);
    this.onUpdate((dt) => { planet.rotation.y += dt * 0.004; });
    this.planet = planet;
  }

  buildNebulae() {
    const r = mulberry32(21);
    const palettes = [
      ['rgba(80,200,230,ALPHA)', 'rgba(120,150,255,ALPHA)', 'rgba(255,255,255,ALPHA)'],
      ['rgba(220,110,170,ALPHA)', 'rgba(255,170,120,ALPHA)', 'rgba(140,110,230,ALPHA)'],
      ['rgba(90,230,200,ALPHA)', 'rgba(60,140,220,ALPHA)', 'rgba(255,230,180,ALPHA)'],
    ];
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebulaTexture(i + 1, palettes[i % 3]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, fog: false }));
      const a = r() * Math.PI * 2, e = (r() - 0.3) * 1.2, d = 2400 + r() * 900;
      sp.position.set(Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d);
      const sc = 1200 + r() * 1600;
      sp.scale.set(sc, sc * (0.5 + r() * 0.5), 1);
      sp.material.rotation = r() * 6;
      sp.renderOrder = -7;
      this.add(sp);
    }
  }

  buildAsteroids() {
    const r = mulberry32(5);
    const t = [], c = [];
    const tint = [new THREE.Color('#b8b0c8'), new THREE.Color('#8fa6c9'), new THREE.Color('#c9a88f')];
    for (let i = 0; i < 340; i++) {
      const a = r() * Math.PI * 2, d = 520 + r() * 260;
      const s = 1.5 + Math.pow(r(), 3) * 16;
      t.push(mat4(Math.cos(a) * d, (r() - 0.5) * 50 + Math.sin(a * 3) * 20, Math.sin(a) * d * 0.7 - 380, s, s * (0.6 + r() * 0.5), s, r() * 6, r() * 6, r() * 6));
      c.push(tint[i % 3]);
    }
    const belt = scatterInstanced(rockGeometry(3, '#ffffff'), vtoon(), t, c);
    belt.castShadow = belt.receiveShadow = false;
    const g = new THREE.Group(); g.add(belt);
    g.position.set(0, 60, 0);
    this.add(g);
    this.onUpdate((dt) => { g.rotation.y += dt * 0.004; });
    // a few close tumbling boulders near the start
    this.boulders = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(rockGeometry(20 + i, '#c9c0d8'), vtoon());
      const s = 2 + r() * 6;
      m.scale.setScalar(s);
      m.position.set((r() - 0.5) * 300, (r() - 0.3) * 120, -100 - r() * 300);
      m.userData.spin = new THREE.Vector3(r(), r(), r()).multiplyScalar(0.3);
      this.add(m); this.boulders.push(m);
    }
    this.onUpdate((dt) => this.boulders.forEach((b) => { b.rotation.x += b.userData.spin.x * dt; b.rotation.y += b.userData.spin.y * dt; }));
  }

  buildDistantPlanets() {
    const giant = new THREE.Mesh(new THREE.SphereGeometry(260, 48, 32), new THREE.MeshToonMaterial({ map: planetTexture(12, { sea: '#f0c890', deep: '#c96a4a', land: '#f5e0b0', land2: '#e8a070', level: 0.6 }), gradientMap: null }));
    giant.position.set(1700, 700, -2300);
    this.add(giant);
    const ringTex = streakTexture(31, [255, 236, 210], [200, 140, 120]);
    const ring = new THREE.Mesh(new THREE.RingGeometry(330, 560, 128), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 }));
    ring.position.copy(giant.position); ring.rotation.set(1.2, 0.3, 0);
    this.add(ring);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 24), new THREE.MeshToonMaterial({ map: planetTexture(15, { sea: '#9f8fd9', deep: '#5a4aa8', land: '#d9c9ff', land2: '#ffffff', level: 0.5 }), gradientMap: null }));
    moon.position.set(-1500, 900, 900);
    this.add(moon);
    this.onUpdate((dt) => { giant.rotation.y += dt * 0.01; moon.rotation.y += dt * 0.02; });
  }

  // Comets: a bright head trailed by a fading string of glows.
  buildComets() {
    const r = mulberry32(8);
    this.comets = [];
    const tex = glowTexture('rgba(220,250,255,1)');
    for (let i = 0; i < 6; i++) {
      const parts = [];
      for (let k = 0; k < 14; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1 - k / 14 }));
        sp.scale.setScalar(26 * (1 - k / 16));
        this.add(sp); parts.push(sp);
      }
      const dir = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.3, r() - 0.5).normalize();
      this.comets.push({ parts, dir, speed: 160 + r() * 140, off: r() * 30, start: new THREE.Vector3((r() - 0.5) * 3000, 200 + r() * 900, -800 - r() * 1800) });
    }
    this.onUpdate((dt, t) => {
      for (const c of this.comets) {
        const k = (t + c.off) % 30;
        c.parts.forEach((sp, j) => sp.position.copy(c.start).addScaledVector(c.dir, (k - 15) * c.speed - j * 22));
      }
    });
  }

  // Dust that moves past the car so speed is readable.
  buildDust() {
    const N = 700, R = 90;
    const pos = new Float32Array(N * 3);
    const r = mulberry32(3);
    for (let i = 0; i < N * 3; i++) pos[i] = (r() - 0.5) * R * 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#cfefff', opacity: 0.8 }));
    pts.frustumCulled = false;
    this.add(pts);
    this.onUpdate(() => {
      const c = this.game.car.root.position;
      const a = g.attributes.position;
      for (let i = 0; i < N; i++) {
        for (let k = 0; k < 3; k++) {
          let v = a.array[i * 3 + k];
          const cc = [c.x, c.y, c.z][k];
          while (v - cc > R) v -= R * 2;
          while (v - cc < -R) v += R * 2;
          a.array[i * 3 + k] = v;
        }
      }
      a.needsUpdate = true;
    });
  }

  buildHoles() {
    const game = this.game;
    this.holeObjs = {};
    for (const [key, h] of Object.entries(HOLES)) {
      const done = game.missions.isDone(WORLD_MISSION[key]);
      const bh = createBlackHole({ radius: h.radius, core: h.core, edge: h.edge, glowColor: h.glow, seed: h.seed, tilt: h.tilt, calm: done });
      bh.position.set(...h.pos);
      this.add(bh);
      if (done) bh.userData.setCalm(true);
      const known = game.state.story.worldsDiscovered.includes(key);
      const label = textSprite(known ? game.worldName(key) : 'UNKNOWN WORLD', { scale: 7 });
      label.position.set(h.pos[0], h.pos[1] + h.radius * 3.4, h.pos[2]);
      this.add(label);
      // completed worlds float nearby as small glowing planets
      if (done) {
        const col = { farm: ['#8fd46a', '#f2c14e'], knowledge: ['#f5f1ea', '#9fd0ff'], hunger: ['#e8a070', '#4fa8d9'] }[key];
        const orb = new THREE.Mesh(new THREE.SphereGeometry(h.radius * 0.5, 32, 24), new THREE.MeshToonMaterial({ map: planetTexture(40 + h.seed, { sea: col[1], deep: col[1], land: col[0], land2: col[0], level: 0.5 }), gradientMap: null, emissive: col[0], emissiveIntensity: 0.25 }));
        orb.position.set(h.pos[0] + h.radius * 3, h.pos[1] + h.radius * 1.5, h.pos[2] + h.radius * 1.2);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(200,240,255,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
        halo.scale.setScalar(h.radius * 2.6); orb.add(halo);
        this.add(orb);
        this.onUpdate((dt) => { orb.rotation.y += dt * 0.1; });
      }
      const pos = bh.position;
      this.holes.push({ pos, radius: h.radius * 1.6, strength: done ? 0.25 : 0.45, key });
      this.holeObjs[key] = { bh, h, done, pos };
      this.interact({
        position: pos, radius: h.radius * 3.6, marker: false, modes: ['fly'],
        label: 'Enter',
        promptText: `UNKNOWN WORLD DETECTED · [E] ENTER`,
        enabled: () => !done && game.state.story.stage !== 'home',
        onInteract: () => game.enterBlackHole(key, pos),
      });
    }
    this.onUpdate((dt, t) => {
      const cam = game.engine.camera;
      let near = 0;
      for (const { bh, h, pos, done } of Object.values(this.holeObjs)) {
        bh.userData.update(t, cam);
        if (done || game.control !== 'fly') continue;
        const d = game.car.root.position.distanceTo(pos);
        const k = THREE.MathUtils.clamp(1 - (d - h.radius * 1.5) / (h.radius * 5), 0, 1);
        near = Math.max(near, k);
        // gentle gravitational pull
        if (k > 0) game.car.root.position.addScaledVector(pos.clone().sub(game.car.root.position).normalize(), k * k * 14 * dt);
      }
      this.holes.forEach((ho) => { if (!this.holeObjs[ho.key].done) ho.strength = 0.45 + near * 0.35; });
      if (game.control === 'fly') game.shake = near * near * 0.25;
      if (near > 0.2 && !this.detected) { this.detected = true; game.hud.toast('UNKNOWN WORLD DETECTED'); game.audio.rumble(2); }
      if (near < 0.05) this.detected = false;
    });
  }

  buildHomeBeacon() {
    const game = this.game;
    const top = PLANET.pos.clone().add(new THREE.Vector3(0, PLANET.radius, 0));
    const beacon = new THREE.Group();
    beacon.position.copy(top);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(4, 18, 900, 16, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * (0.6 + 0.4 * sin(vUv.y * 20.0 - uTime * 3.0)); gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a * 0.8, 1.0); }',
    }));
    pillar.position.y = 450;
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,200,140,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flare.scale.setScalar(160);
    beacon.add(pillar, flare);
    const label = textSprite('HOME', { scale: 8, color: '#ffe0b8' });
    label.position.y = 120;
    beacon.add(label);
    this.add(beacon);
    this.onUpdate((dt, t) => { pillar.material.uniforms.uTime.value = t; });
    const active = () => game.state.story.stage === 'home';
    beacon.visible = active();
    this.beacon = beacon;
    this.beaconPos = top.clone().add(new THREE.Vector3(0, 40, 0));
    this.interact({
      position: this.beaconPos, radius: 150, marker: false, modes: ['fly'],
      label: 'Land', promptText: 'HOME IS CALLING · [E] LAND', enabled: active,
      onInteract: () => this.landHome(),
    });
  }

  waypoint() {
    const game = this.game;
    if (game.control !== 'fly') return null;
    if (game.state.story.stage === 'home') return this.beaconPos;
    const car = game.car.root.position;
    let best = null, bd = Infinity;
    for (const { pos, done } of Object.values(this.holeObjs)) {
      if (done) continue;
      const d = car.distanceTo(pos);
      if (d < bd) { bd = d; best = pos; }
    }
    return best;
  }

  enter() {
    const game = this.game;
    game.hud.setWorld('space');
    game.playerHidden = true;
    let start = new THREE.Vector3(0, 30, 120), yaw = Math.PI;
    if (this.from && HOLES[this.from]) {
      const h = HOLES[this.from];
      const hp = new THREE.Vector3(...h.pos);
      const out = new THREE.Vector3(0, 30, 120).sub(hp).normalize();
      start = hp.clone().addScaledVector(out, h.radius * 7);
      yaw = Math.atan2(out.x, out.z);
    }
    game.addCar(start.x, start.z, yaw, start.y);
    game.car.setFlight(1);
    game.vehicle.speed = 25;
    game.setControl('none');
    game.setShot(start.clone().add(new THREE.Vector3(-30, 12, 40)).toArray(), start.toArray());
    const st = game.state.story.stage;
    if (['leave', 'space'].includes(st)) game.story('space');
    else if (st !== 'home' && game.inventory.count('oxygenCore') > 0) game.story('cores');
  }

  async arrive() {
    const game = this.game;
    const c = game.car.root.position.clone();
    const home = game.state.story.stage === 'home';
    await game.cutscene(async () => {
      // extreme wide shot: the car is a speck against the painted cosmos
      const look = home ? this.beaconPos.clone() : new THREE.Vector3(-60, 140, -950);
      await game.shot({ pos: c.clone().add(new THREE.Vector3(-30, 12, 40)).toArray(), look: c.toArray() },
        { pos: c.clone().add(new THREE.Vector3(60, 40, 110)).toArray(), look: c.clone().lerp(look, 0.15).toArray() }, 3.2, Ease.sine);
      if (home) game.hud.banner('HOME IS CALLING', 'Follow the light down to your planet', 3400);
      else if (!this.from) game.hud.banner('THE QUIET SEA', 'Three black holes wait in the dark', 3400);
    });
    game.setControl('fly');
    game.hud.hint('[W] Thrust · [A/D] Turn · [Mouse] Steer (click to lock) · [Space/C] Climb/Dive · [Shift] Boost');
  }

  // SPACE → HOME PLANET → LANDING
  async landHome() {
    const game = this.game;
    await game.cutscene(async () => {
      const fx = game.engine.fx;
      game.setControl('none');
      const p0 = game.car.root.position.clone();
      const target = PLANET.pos.clone().add(new THREE.Vector3(0, PLANET.radius - 20, 0));
      game.audio.whoosh(4, false);
      game.hud.banner('HOME IS CALLING', '', 2200, 'thin');
      const cam0 = game.engine.camera.position.clone();
      fx.uFlashColor.value.set('#fff1e0');
      await game.tweens.tween(4.5, (k) => {
        const kk = Ease.in(k);
        game.car.root.position.lerpVectors(p0, target, kk);
        game.cine.pos.lerpVectors(cam0, target.clone().add(new THREE.Vector3(0, 60, 40)), kk * 0.95);
        game.cine.look.copy(game.car.root.position);
        fx.uFlash.value = Math.max(0, (k - 0.75) / 0.25);
      }, Ease.linear);
      await game.loadWorld('home', { mode: 'return', arrival: 'landing' });
      game.tweens.tween(1.5, (k) => { fx.uFlash.value = 1 - k; }).then(() => fx.uFlashColor.value.set('#fff4dc'));
      await game.world.arriveHome();
    });
  }

  update(dt, t) {
    super.update(dt, t);
    const game = this.game;
    // soft boundary: drift back toward the hub
    if (game.control === 'fly') {
      const p = game.car.root.position;
      const d = p.length();
      if (d > 2300) p.multiplyScalar(2300 / d);
      const toPlanet = p.distanceTo(PLANET.pos);
      if (toPlanet < PLANET.radius + 30) p.copy(PLANET.pos).addScaledVector(p.clone().sub(PLANET.pos).normalize(), PLANET.radius + 30);
      const boost = game.input.run && game.input.moveY > 0 ? 1 : 0;
      game.engine.fx.uWarp.value = THREE.MathUtils.damp(game.engine.fx.uWarp.value, boost * 0.07, 3, dt);
    }
  }

  exit() { this.game.engine.fx.uWarp.value = 0; }
}

