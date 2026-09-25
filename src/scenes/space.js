// SPACE HUB — a living universe between worlds: painted nebula, star field, comets,
// asteroid belt, the home planet and three gigantic black holes (portals).
import * as THREE from 'three';
import { World } from './base.js';
import { makeNebulaSky, makeStarfield, makeBlackHole, makePlanet, makeComets, makeAsteroids, makeCelestialRing } from '../world/cosmic.js';
import { glowSprite, softTexture, canvasTexture, toon } from '../world/kit.js';
import { mulberry32 } from '../core/noise.js';
import { clamp } from '../core/noise.js';
import { wait } from '../ui/overlay.js';

const HOME_PLANET = new THREE.Vector3(0, -170, -760);
const HOME_RADIUS = 330;

const PORTALS = [
  { world: 'farm', pos: new THREE.Vector3(-950, 160, 1450), size: 70, hue: 0.0, tilt: 0.3, planet: { ocean: '#3f7f5a', shallow: '#9ccf6a', land: '#d8b45a', land2: '#7fb84e', atmo: '#ffd88a' } },
  { world: 'knowledge', pos: new THREE.Vector3(1350, 380, 950), size: 85, hue: 0.03, tilt: -0.22, planet: { ocean: '#c9b27a', shallow: '#fff0c4', land: '#f5e6c0', land2: '#ffffff', atmo: '#fff2c0' } },
  { world: 'hunger', pos: new THREE.Vector3(250, -260, 2250), size: 95, hue: -0.02, tilt: 0.18, planet: { ocean: '#15304a', shallow: '#2f7b8a', land: '#6b4d36', land2: '#3a2c22', atmo: '#f2a25a' } },
];

export default class SpaceWorld extends World {
  constructor(game, id) {
    super(game, id);
    this.mood = 'space';
    this.usesPlayer = false;
    this.bloom = { strength: 0.7, radius: 0.6, threshold: 0.86 };
    this.grade = { vignette: 0.55, warmth: 0.05, saturation: 1.12, exposure: 1.05 };
    this.warping = false;
  }

  async build(opts) {
    const s = this.scene;
    s.background = new THREE.Color('#04050c');
    this.add(makeNebulaSky({}));
    this.add(makeStarfield({ count: 7000 }));
    this.add(makeComets({ count: 10 }));

    const sunDir = new THREE.Vector3(0.6, 0.35, -0.72).normalize();
    this.sunDir = sunDir;
    const sun = new THREE.DirectionalLight('#fff0dc', 1.5);
    sun.position.copy(sunDir).multiplyScalar(100);
    s.add(sun);
    s.add(new THREE.HemisphereLight('#8fb8ff', '#3a1a2a', 0.7));
    s.add(new THREE.AmbientLight('#ffffff', 0.12));
    const star = glowSprite('#ffe6b8', 520, 0.55);
    star.position.copy(sunDir).multiplyScalar(3800);
    star.material.fog = false;
    s.add(star);
    const star2 = glowSprite('#ffffff', 110, 1);
    star2.position.copy(star.position);
    s.add(star2);
    this.animate((t, cam) => { star.position.copy(cam.position).addScaledVector(sunDir, 3800); star2.position.copy(star.position); });

    this.home = makePlanet({ radius: HOME_RADIUS, sunDir, seed: 3.3, ocean: '#2a74b8', shallow: '#4fc4d8', land: '#6fae55', land2: '#e0cf92', atmo: '#9ed8ff', cloudAmt: 0.7 });
    this.home.position.copy(HOME_PLANET);
    this.add(this.home);
    const moon = makePlanet({ radius: 40, sunDir, seed: 8, ocean: '#b8b2c8', shallow: '#d8d2e4', land: '#9d97ad', land2: '#ece6f5', atmo: '#d8e6ff', cloudAmt: 0, glow: 0.5 });
    moon.position.copy(HOME_PLANET).add(new THREE.Vector3(620, 260, -300));
    this.add(moon);

    this.add(makeAsteroids({ center: HOME_PLANET, rMin: 520, rMax: 760, thickness: 50, count: 450, tilt: 0.22 }));

    this.portals = PORTALS.map((p, i) => {
      const bh = makeBlackHole({ size: p.size, tilt: p.tilt, hue: p.hue, seed: i + 1 });
      bh.position.copy(p.pos);
      bh.rotation.y = i * 1.3;
      this.add(bh);
      const planet = makePlanet({ radius: 28, sunDir, seed: i * 4.1 + 1, ...p.planet, emissive: 0.6, glow: 1.6, cloudAmt: 0.3 });
      planet.position.copy(p.pos).add(new THREE.Vector3(p.size * 6.5, p.size * 2.2, -p.size * 3));
      planet.visible = this.game.save.state?.cores.includes(p.world) ?? false;
      this.add(planet);
      return { ...p, bh, planet };
    });

    // local space dust — sells speed and depth
    const n = 1400, dp = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) dp[i] = (Math.random() - 0.5) * 500;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { cam: { value: new THREE.Vector3() }, map: { value: softTexture() } },
      vertexShader: /* glsl */ `uniform vec3 cam; varying float vA;
        void main(){ vec3 p = mod(position - cam + 250.0, 500.0) - 250.0 + cam;
          vec4 mv = viewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; float d = -mv.z; gl_PointSize = clamp(220.0/d, 1.0, 5.0); vA = smoothstep(250.0, 60.0, d); }`,
      fragmentShader: /* glsl */ `uniform sampler2D map; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(0.75,0.85,1.0)*0.8, t.a*vA*0.45); }`,
    });
    const dust = new THREE.Points(dg, dm);
    dust.frustumCulled = false;
    s.add(dust);
    this.animate((t, cam) => dm.uniforms.cam.value.copy(cam.position));

    // distant painted spiral galaxies
    const galaxy = (c1, c2, seed) => canvasTexture(512, 512, (g, w, h) => {
      const r = mulberry32(seed);
      g.translate(w / 2, h / 2);
      const core = g.createRadialGradient(0, 0, 0, 0, 0, 120);
      core.addColorStop(0, 'rgba(255,245,225,1)'); core.addColorStop(0.3, c1); core.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = core; g.beginPath(); g.arc(0, 0, 120, 0, 7); g.fill();
      for (let i = 0; i < 2600; i++) {
        const arm = i % 2, t = r() * 1, a = t * 9 + arm * Math.PI + (r() - 0.5) * 0.6, rr = 20 + t * 220;
        g.fillStyle = r() < 0.7 ? c2 : 'rgba(255,255,255,0.8)';
        g.globalAlpha = (1 - t) * 0.5 + 0.1;
        g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.55, r() * 2.4 + 0.4, 0, 7); g.fill();
      }
    });
    [[-2600, 900, 1800, 900, 'rgba(160,200,255,0.8)', 'rgba(140,190,255,0.7)', 0.4], [2400, -700, -2200, 700, 'rgba(255,190,140,0.8)', 'rgba(255,170,200,0.6)', -0.6], [800, 1500, 3000, 500, 'rgba(200,170,255,0.8)', 'rgba(170,220,255,0.6)', 1.1]].forEach(([x, y, z, size, c1, c2, rot], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: galaxy(c1, c2, i + 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.8 }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      m.rotateZ(rot);
      m.rotateX(0.7);
      s.add(m);
      this.animate((t) => (m.rotation.z += 0.00005));
    });
    // a ringed gas giant far off the flight lanes
    const giant = makePlanet({ radius: 420, sunDir, seed: 12, ocean: '#c9906a', shallow: '#e8b88a', land: '#d8a07a', land2: '#f2d8b0', atmo: '#ffd8a8', cloudAmt: 0.85, glow: 0.8 });
    giant.position.set(-2400, -300, -1200);
    this.add(giant);
    const gring = makeCelestialRing({ inner: 560, outer: 900, a: '#f5e6c8', b: '#d8a878', c: '#8a5a4a', opacity: 0.7 });
    gring.position.copy(giant.position);
    gring.rotation.set(-1.25, 0.2, 0.3);
    this.add(gring);
    // tumbling debris & old panels along the lanes toward the portals
    const drng = mulberry32(77);
    const dn = 260, dgeo = new THREE.BoxGeometry(1, 0.15, 2);
    const debris = new THREE.InstancedMesh(dgeo, toon('#8a90a0'), dn);
    const dd = [];
    for (let i = 0; i < dn; i++) {
      const p = PORTALS[i % 3].pos, t = 0.15 + drng() * 0.7;
      const base = new THREE.Vector3().lerp(p, t).add(new THREE.Vector3((drng() - 0.5) * 260, (drng() - 0.5) * 140, (drng() - 0.5) * 260));
      dd.push({ base, s: 0.6 + Math.pow(drng(), 3) * 7, rx: drng() * 6, ry: drng() * 6, sp: (drng() - 0.5) * 0.6 });
      debris.setColorAt(i, new THREE.Color(['#8a90a0', '#a9203e', '#c9a860', '#6a7488'][i % 4]));
    }
    const dm4 = new THREE.Matrix4(), dq = new THREE.Quaternion(), de = new THREE.Euler(), dsv = new THREE.Vector3();
    this.animate((t) => {
      dd.forEach((d, i) => {
        de.set(d.rx + t * d.sp, d.ry + t * d.sp * 0.7, 0);
        dq.setFromEuler(de);
        dm4.compose(d.base, dq, dsv.setScalar(d.s));
        debris.setMatrixAt(i, dm4);
      });
      debris.instanceMatrix.needsUpdate = true;
    });
    debris.frustumCulled = false;
    s.add(debris);

    this.vehicleLight = new THREE.PointLight('#ffe2c0', 0, 40, 1.2);
    s.add(this.vehicleLight);
  }

  async enter(opts) {
    const g = this.game;
    g.vehicle.setMode('fly');
    g.player.model && (g.player.model.group.visible = false);
    if (opts.attract) {
      g.vehicle.group.visible = false;
      g.setMode('title');
      const bh = this.portals[2].pos;
      g.cine.orbit(bh.clone().add(new THREE.Vector3(-250, 0, -350)), 1050, 330, 0.018, 3.6);
      return;
    }
    g.vehicle.group.visible = true;
    const s = g.save.state;
    g.missions.start('find_oxygen');
    g.missions.setStep('find_oxygen', 5);
    const allCores = s.inventory.oxygenCore >= 3;
    if (allCores) g.missions.start('home_again');

    if (opts.from) {
      // leaving a world: blasted back out of its black hole
      const p = this.portals.find((x) => x.world === opts.from);
      const away = new THREE.Vector3(0, 0.15, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-p.pos.x, -p.pos.z) + Math.PI).normalize();
      const dirHome = HOME_PLANET.clone().sub(p.pos).normalize();
      away.lerp(dirHome, 0.8).normalize();
      const start = p.pos.clone().addScaledVector(away, p.size * 9);
      g.vehicle.place(start.x, start.y, start.z, Math.atan2(away.x, away.z), Math.asin(clamp(away.y, -1, 1)));
      g.vehicle.speed = 120;
      g.setMode('cutscene');
      g.overlay.setFadeInstant(1, '#fff');
      g.overlay.fade(0, 1600, '#fff');
      g.overlay.streaks(0.8);
      g.tween(2500, (k) => g.overlay.streaks(0.8 * (1 - k)));
      g.cine.cut(start.clone().addScaledVector(away, -40).add(new THREE.Vector3(0, 12, 0)), p.pos);
      g.cine.to(() => g.vehicle.position.clone().addScaledVector(g.vehicle.forward(), -12).add(new THREE.Vector3(0, 3, 0)), () => g.vehicle.position.clone().addScaledVector(g.vehicle.forward(), 20), 3000);
      await g.sleep(3000);
      g.cine.release();
      g.setMode('fly');
      if (allCores) {
        g.overlay.banner('All oxygen cores collected', 'Home is calling', 'Follow the blue signal home');
        g.audio.sfx('mission');
      }
      return;
    }

    // launched from home: establishing shot, the car tiny against the planet
    g.vehicle.place(0, 0, 0, 0.35, 0.05);
    g.vehicle.speed = 40;
    g.setMode('cutscene');
    g.overlay.setFadeInstant(1, '#fff');
    g.overlay.fade(0, 2200, '#fff');
    g.overlay.letterbox(true);
    g.cine.cut(new THREE.Vector3(-60, 30, -120), new THREE.Vector3(0, 0, 0));
    g.cine.to(new THREE.Vector3(-260, 140, -380), new THREE.Vector3(0, -40, 60), 7000, g.ease.sine);
    g.overlay.title('SPACE HUB', g.content.worlds.space.name, g.content.worlds.space.subtitle, 5200);
    await g.sleep(6500);
    g.cine.to(() => g.vehicle.position.clone().addScaledVector(g.vehicle.forward(), -12).add(new THREE.Vector3(0, 3.2, 0)), () => g.vehicle.position.clone().addScaledVector(g.vehicle.forward(), 20), 1800);
    await g.sleep(1800);
    g.cine.release();
    g.overlay.letterbox(false);
    g.setMode('fly');
    g.hud.hint('<b>W</b> thrust · <b>Mouse</b> steer · <b>A/D</b> turn<br><b>Shift</b> boost · <b>Space / C</b> rise / sink<br>Follow the <b>◆ signals</b>', 14000);
  }

  nearestPortal() {
    const p = this.game.vehicle.position;
    let best = null, bd = Infinity;
    for (const x of this.portals) {
      const d = x.pos.distanceTo(p);
      if (d < bd) { bd = d; best = x; }
    }
    return { portal: best, dist: bd };
  }

  update(dt, t) {
    super.update(dt, t);
    const g = this.game;
    if (g.mode === 'title') return;
    const cam = g.engine.camera;
    const u = g.engine.cinema.uniforms;
    const s = g.save.state;
    const vpos = g.vehicle.position;
    // key light riding just above-behind the camera so the car always reads against dark space
    this.vehicleLight.position.copy(cam.position).lerp(vpos, 0.6).add(new THREE.Vector3(0, 3, 0));
    this.vehicleLight.intensity = 8;

    // gravitational lensing around the nearest black hole
    const { portal, dist } = this.nearestPortal();
    if (!this.warping) {
      const v = portal.pos.clone().project(cam);
      const inFront = v.z < 1;
      const fovT = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      const camDist = cam.position.distanceTo(portal.pos);
      const rad = (portal.size * 1.25) / camDist / fovT * 0.5;
      u.center.value.set((v.x + 1) / 2, (v.y + 1) / 2);
      u.lensRadius.value = clamp(rad, 0, 0.45);
      u.lens.value = inFront ? clamp(1.4 - camDist / 2600, 0, 1) * 0.9 : 0;
    }

    // navigation markers
    if (g.mode === 'fly' || g.mode === 'cutscene') {
      const navs = [];
      const allCores = s.inventory.oxygenCore >= 3;
      this.portals.forEach((p, i) => {
        const done = s.cores.includes(p.world);
        const known = s.discovered.includes(p.world);
        const d = p.pos.distanceTo(vpos);
        if (allCores) return;
        navs.push({ id: p.world, pos: p.pos, label: done ? `✓ ${g.content.worlds[p.world].name}` : known ? g.content.worlds[p.world].name : `SIGNAL 0${i + 1}`, sub: `${(d / 1000).toFixed(1)} km` });
      });
      if (allCores || s.stage === 'returning') {
        navs.push({ id: 'home', cls: 'home', pos: HOME_PLANET, label: 'HOME', sub: `${Math.max(0, (HOME_PLANET.distanceTo(vpos) - HOME_RADIUS) / 1000).toFixed(1)} km · home is calling` });
      }
      g.hud.navs(g.mode === 'fly' ? navs : []);
      g.hud.speed(g.mode === 'fly' ? `${Math.round(Math.abs(g.vehicle.speed) * 10)} m/s` : '');
    }

    if (g.mode !== 'fly' || this.warping) return;

    // soft collision with planets
    const toHome = vpos.clone().sub(HOME_PLANET);
    if (toHome.length() < HOME_RADIUS + 30) vpos.copy(HOME_PLANET).addScaledVector(toHome.normalize(), HOME_RADIUS + 30);

    // gravitational pull + detection
    const detectR = portal.size * 9;
    if (dist < detectR * 1.5) {
      const pull = clamp(1 - dist / (detectR * 1.5), 0, 1);
      vpos.addScaledVector(portal.pos.clone().sub(vpos).normalize(), pull * 14 * dt);
      g.vehicle.shake = pull * 0.25;
    } else g.vehicle.shake = 0;
    if (dist < portal.size * 2) {
      // crossing the horizon unprompted still takes you through
      this.warp(portal);
      return;
    }
    const allCores = s.inventory.oxygenCore >= 3;
    if (dist < detectR && !allCores) {
      const known = s.discovered.includes(portal.world);
      g.hud.detect(g.content.worlds[portal.world].blackHole, known ? `${g.content.worlds[portal.world].name} · press E to enter` : 'Press E to enter');
      g.hud.prompt('Enter the black hole');
      if (g.input.interact()) this.warp(portal);
    } else {
      g.hud.detect(null);
      if (allCores && toHome.length() < HOME_RADIUS + 450) {
        g.hud.prompt('Descend — home');
        if (g.input.interact()) this.landHome();
      } else g.hud.prompt(null);
    }
  }

  async warp(portal) {
    if (this.warping) return;
    this.warping = true;
    const g = this.game;
    const u = g.engine.cinema.uniforms;
    g.hud.detect(null);
    g.hud.prompt(null);
    g.hud.navs([]);
    g.hud.speed('');
    g.setMode('cutscene');
    g.overlay.letterbox(true);
    g.audio.sfx('warp');
    const car = g.vehicle;
    const start = car.position.clone();
    const center = portal.pos.clone();
    const dir = center.clone().sub(start).normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    // extreme wide shot → slow push in
    g.cine.to(start.clone().addScaledVector(side, 90).addScaledVector(dir, -120).add(new THREE.Vector3(0, 40, 0)), center, 1800);
    const lens0 = u.lens.value;
    const cam = g.engine.camera;
    const fov0 = cam.fov;
    g.tween(1800, (k) => { u.lens.value = lens0 + k * 0.6; });
    const move = g.tween(5200, (k) => {
      car.position.lerpVectors(start, center, k * 0.985);
      car.group.lookAt(center);
      car.shake = k * 0.6;
      car.car.setThrust(1);
      u.lens.value = 0.6 + k * 2.2;
      u.streak.value = Math.max(0, k - 0.35) * 1.4;
      u.shake.value = k;
      g.overlay.streaks(Math.max(0, k - 0.4) * 1.6);
      portal.bh.userData.setBoost(1 + k * 2);
      cam.fov = fov0 + k * k * 55;
      cam.updateProjectionMatrix();
      const v = center.clone().project(cam);
      u.center.value.set((v.x + 1) / 2, (v.y + 1) / 2);
    }, g.ease.in);
    await g.sleep(1900);
    g.cine.to(() => car.position.clone().addScaledVector(dir, -14).add(new THREE.Vector3(0, 3, 0)), () => center, 2600);
    await move;
    // darkness … silence … a small sound … flash
    g.overlay.setFadeInstant(1, '#000');
    g.overlay.streaks(0);
    u.streak.value = 0;
    u.lens.value = 0;
    u.shake.value = 0;
    g.audio.duck(true, 0.05);
    await wait(1400);
    g.audio.duck(false, 0.2);
    g.audio.sfx('chime');
    await wait(500);
    await g.loadWorld(portal.world, { arrive: true });
  }

  async landHome() {
    if (this.warping) return;
    this.warping = true;
    const g = this.game;
    g.hud.prompt(null);
    g.hud.navs([]);
    g.setMode('cutscene');
    g.overlay.letterbox(true);
    g.audio.sfx('whoosh');
    const car = g.vehicle;
    const start = car.position.clone();
    const target = HOME_PLANET.clone().add(start.clone().sub(HOME_PLANET).normalize().multiplyScalar(HOME_RADIUS));
    g.cine.to(start.clone().add(new THREE.Vector3(60, 40, 60)), target, 2500);
    g.overlay.banner('Oxygen 3 / 3', 'Home is calling', '', 3200);
    g.overlay.setFadeInstant(0, '#fff');
    await g.tween(4200, (k) => {
      car.position.lerpVectors(start, target, k * 0.97);
      car.group.lookAt(target);
      car.car.setThrust(1 - k * 0.5);
      if (k > 0.6) g.overlay.fadeEl.style.opacity = (k - 0.6) / 0.4;
    }, g.ease.in);
    g.overlay.setFadeInstant(1, '#fff');
    await g.loadWorld('home', { landing: true });
  }

  exit() {
    const u = this.game.engine.cinema.uniforms;
    u.lens.value = 0;
    u.streak.value = 0;
    u.shake.value = 0;
    this.game.vehicle.shake = 0;
    this.game.overlay.letterbox(false);
  }
}
