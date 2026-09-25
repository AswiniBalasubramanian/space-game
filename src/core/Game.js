import * as THREE from 'three';
import { Engine } from './Engine.js';
import { Input } from './Input.js';
import { Tweens, Ease } from './Tween.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { HUD } from '../ui/HUD.js';
import { XRPanel } from '../ui/XRPanel.js';
import { DialogueSystem } from '../dialogue/DialogueSystem.js';
import { InventorySystem } from '../inventory/InventorySystem.js';
import { MissionSystem } from '../missions/MissionSystem.js';
import { SaveSystem, newState } from '../save/SaveSystem.js';
import { CharacterModel } from '../character/CharacterModel.js';
import { CharacterController } from '../player/CharacterController.js';
import { Car } from '../vehicle/Car.js';
import { VehicleController } from '../vehicle/VehicleController.js';
import { RewardSystem } from '../progression/RewardSystem.js';
import { clamp, damp, lerp } from '../utils/noise.js';

// Worlds are code-split and only loaded when the player travels to them.
const WORLD_LOADERS = {
  title: () => import('../worlds/TitleWorld.js'),
  home: () => import('../worlds/HomeWorld.js'),
  space: () => import('../space/SpaceWorld.js'),
  farm: () => import('../worlds/FarmWorld.js'),
  knowledge: () => import('../worlds/KnowledgeWorld.js'),
  hunger: () => import('../worlds/HungerWorld.js'),
};

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

export class Game {
  constructor(container) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.renderer.domElement);
    this.tweens = new Tweens();
    this.audio = new AudioSystem();
    this.hud = new HUD(this);
    this.xrPanel = new XRPanel(this.engine);
    this.dialogue = new DialogueSystem(this);
    this.rewards = new RewardSystem(this);
    this.world = null;
    this.control = 'none';
    this.camMode = 'cine';
    this.cam = { yaw: 0, pitch: 0.28, dist: 5.5, actual: 5.5, offYaw: 0 };
    this.cine = { pos: new THREE.Vector3(0, 5, 10), look: new THREE.Vector3() };
    this.focus = new THREE.Vector3();
    this.shake = 0;
    this.locks = 0;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.last = performance.now();
    // ?dev=4 → larger frame steps + 4× time, for testing on slow machines
    const dev = new URLSearchParams(location.search).get('dev');
    this.timeScale = dev ? +dev || 1 : 1;
    this.maxStep = dev ? 0.5 : 0.05;

    this.engine.enableVRButton(() => this.onXR(true), () => this.onXR(false));
    this.engine.renderer.setAnimationLoop(() => this.loop());
    this.bindKeys();
  }

  // ------------------------------------------------------------------ setup
  bindKeys() {
    document.getElementById('btn-sound')?.addEventListener('click', () => this.toggleMute());
    document.getElementById('btn-paint')?.addEventListener('click', () => this.togglePaint());
    document.getElementById('btn-restart')?.addEventListener('click', () => {
      if (!this.state || !confirm('Start a brand new journey? Your current progress will be erased.')) return;
      SaveSystem.remove(this.state.nickname);
      location.reload();
    });
  }
  toggleMute() {
    const m = this.audio.toggleMute();
    document.getElementById('btn-sound')?.classList.toggle('off', m);
  }
  togglePaint() {
    this.engine.postEnabled = !this.engine.postEnabled;
    document.getElementById('btn-paint')?.classList.toggle('off', !this.engine.postEnabled);
  }

  onXR(on) {
    this.xrPanel.attach(this.engine.scene);
    this.hud.toast(on ? 'VR mode — left stick moves, trigger interacts' : 'Back on screen');
    this.xrPanel.dirty = true;
    if (!on) { this.engine.rig.position.set(0, 0, 0); this.engine.rig.rotation.set(0, 0, 0); }
  }

  initProfile(state) {
    this.state = state;
    this.inventory = new InventorySystem(state, () => { this.refreshHUD(); });
    this.missions = new MissionSystem(state, () => this.refreshHUD());
    this.player = new CharacterModel(state.character);
    this.controller = new CharacterController(this.player);
    this.car = new Car();
    this.vehicle = new VehicleController(this.car);
    this.player.setCores(this.inventory.count('oxygenCore'));
    this.hud.setPlayer(state.nickname, state.character);
    this.hud.show(true);
    this.refreshHUD();
    this.missions.focus(this.state.story.focus || 'findOxygen');
    clearInterval(this.autosave);
    this.autosave = setInterval(() => this.save(), 15000);
  }

  newProfile(nickname, character) {
    const st = newState(nickname, character);
    this.initProfile(st);
    this.missions.start('findOxygen', 'talk');
    this.save();
  }

  save() { if (this.state) SaveSystem.save(this.state); }

  refreshHUD() {
    if (!this.state) return;
    this.hud.setOxygen(this.inventory.count('oxygenCore'));
    this.hud.setResources(this.inventory.list());
    this.hud.setMission(this.missions.view());
  }

  story(stage) {
    this.state.story.stage = stage;
    this.missions.setStage('findOxygen', stage);
    this.save();
  }

  // ------------------------------------------------------------------ worlds
  async loadWorld(key, opts = {}) {
    const mod = await WORLD_LOADERS[key]();
    const Cls = mod.default;
    if (this.world) {
      this.world.exit();
      for (const o of [this.player?.root, this.car?.root, this.engine.rig, this.xrPanel.mesh]) o?.parent?.remove(o);
      this.world.dispose();
    }
    this.tweens.clear();
    this.hud.clearHint();
    this.hud.prompt(null);
    const world = new Cls(this, key);
    await world.build(opts);
    this.world = world;
    this.engine.setScene(world.scene);
    this.xrPanel.attach(world.scene);
    if (this.state && key !== 'title') {
      this.state.currentWorld = key;
      if (!['home', 'space'].includes(key) && !this.state.story.worldsDiscovered.includes(key)) this.state.story.worldsDiscovered.push(key);
      this.hud.setWorld(key);
      this.save();
    }
    this.audio.setMood(opts.mood || world.mood || key);
    this.engine.fx.uTint.value.set(world.tint ?? '#ffffff');
    this.engine.fx.uVignette.value = world.vignette ?? 0.35;
    this.engine.bloom.strength = world.bloom ?? 0.12;
    this.engine.renderer.toneMappingExposure = world.exposure ?? 1.0;
    this.engine.camera.far = world.far ?? 5000;
    this.engine.camera.updateProjectionMatrix();
    world.enter(opts);
    return world;
  }

  addPlayer(x, z, yaw = 0) {
    this.world.scene.add(this.player.root);
    this.playerHidden = false;
    this.controller.place(x, z, yaw, this.world);
    this.player.setPose('stand');
    this.cam.yaw = yaw + Math.PI;
  }

  addCar(x, z, yaw = 0, y) {
    this.world.scene.add(this.car.root);
    this.vehicle.place(x, y ?? this.world.heightAt(x, z, 99), z, yaw);
    this.car.setFlight(0);
  }

  setControl(mode) {
    this.control = mode;
    this.camMode = mode === 'walk' ? 'follow' : mode === 'drive' ? 'car' : mode === 'fly' ? 'space' : 'cine';
    if (mode !== 'none') this.snapCamera();
  }

  snapCamera() { this.cam.actual = this.cam.dist; this.cameraSnap = true; }

  // Run a script while player control is suspended.
  async cutscene(fn) {
    this.locks++;
    const prev = this.control;
    this.hud.prompt(null);
    try { await fn(); } finally { this.locks--; }
    return prev;
  }

  talk(lines) {
    this.locks++;
    this.hud.prompt(null);
    return this.dialogue.say(lines).finally(() => { this.locks--; });
  }

  // Tween the cinematic camera between two framings.
  async shot(from, to, duration = 3, ease = Ease.inOut) {
    this.camMode = 'cine';
    const fp = new THREE.Vector3(...from.pos), fl = new THREE.Vector3(...from.look);
    const tp = new THREE.Vector3(...to.pos), tl = new THREE.Vector3(...to.look);
    await this.tweens.tween(duration, (k) => {
      this.cine.pos.lerpVectors(fp, tp, k);
      this.cine.look.lerpVectors(fl, tl, k);
    }, ease);
  }

  setShot(pos, look) {
    this.camMode = 'cine';
    this.cine.pos.set(...pos); this.cine.look.set(...look);
  }

  // Take the current camera as the start of a cinematic shot.
  currentShot() {
    const c = this.engine.camera;
    const look = c.getWorldDirection(tmpV).multiplyScalar(10).add(c.position);
    return { pos: c.position.toArray(), look: look.toArray() };
  }

  // ---------------------------------------------------------- transitions
  // SPACE → BLACK HOLE → DISTORTION → LIGHT STRETCH → DARKNESS → FLASH → WORLD
  async enterBlackHole(key, holePos) {
    await this.cutscene(async () => {
      const fx = this.engine.fx, cam = this.engine.camera;
      this.setControl('none');
      this.camMode = 'cine';
      const start = this.currentShot();
      const carStart = this.car.root.position.clone();
      const hp = holePos.clone();
      this.audio.rumble(4.5); this.audio.whoosh(4, true);
      this.hud.banner('ENTERING', this.worldName(key), 2200, 'thin');
      const sp = new THREE.Vector3(...start.pos);
      await this.tweens.tween(4.2, (k) => {
        const kk = Ease.in(k);
        this.car.root.position.lerpVectors(carStart, hp, kk * 0.92);
        this.car.root.rotation.z += 0.02 + kk * 0.2;
        this.cine.pos.lerpVectors(sp, hp, kk * 0.85);
        this.cine.look.copy(hp);
        fx.uWarp.value = kk;
        this.shake = kk * 0.6;
        cam.fov = 60 + kk * 55;
        cam.updateProjectionMatrix();
      }, Ease.linear);
      await this.tweens.tween(0.5, (k) => { fx.uDark.value = k; });
      this.shake = 0;
      this.audio.silence(true);
      fx.uWarp.value = 0;
      cam.fov = 60; cam.updateProjectionMatrix();
      await this.loadWorld(key, { arrival: 'portal' });
      await this.tweens.wait(0.9);
      this.audio.bell();
      await this.tweens.wait(0.45);
      fx.uDark.value = 0; fx.uFlash.value = 1;
      this.audio.silence(false);
      this.tweens.tween(1.6, (k) => { fx.uFlash.value = 1 - k; }, Ease.out);
      await this.world.arrive?.();
    });
  }

  // Car climbs through the clouds and bursts into space.
  async liftOff(opts = {}) {
    await this.cutscene(async () => {
      const fx = this.engine.fx;
      this.setControl('none');
      this.playerHidden = true;
      const p0 = this.car.root.position.clone();
      const fwd = new THREE.Vector3(Math.sin(this.vehicle.yaw), 0, Math.cos(this.vehicle.yaw));
      this.audio.whoosh(4.5, true);
      this.audio.engine(1);
      this.hud.banner('LIFT OFF', opts.subtitle ?? 'Next stop: the stars', 2400, 'thin');
      await this.tweens.tween(1.2, (k) => this.car.setFlight(k));
      const side = new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(14);
      await this.tweens.tween(4.2, (k) => {
        const kk = Ease.in(k);
        this.vehicle.pitch = -0.5 * Math.min(1, k * 2);
        this.vehicle.apply();
        this.car.root.position.copy(p0).addScaledVector(fwd, kk * 140).add(new THREE.Vector3(0, kk * 160 + k * 6, 0));
        this.car.update(1 / 60, 30, 1);
        const c = this.car.root.position;
        this.cine.pos.copy(p0).add(side).add(new THREE.Vector3(0, 4 + kk * 60, 0)).addScaledVector(fwd, -8 + kk * 60);
        this.cine.look.copy(c);
        this.camMode = 'cine';
        fx.uFlash.value = Math.max(0, (k - 0.7) / 0.3);
      }, Ease.linear);
      fx.uFlashColor.value.set('#ffffff');
      this.audio.engine(0);
      await this.loadWorld('space', { from: opts.from });
      this.tweens.tween(1.4, (k) => { fx.uFlash.value = 1 - k; }).then(() => fx.uFlashColor.value.set('#fff4dc'));
      await this.world.arrive?.();
    });
  }

  worldName(key) { return { farm: 'Farm World', knowledge: 'Knowledge World', hunger: 'Hunger World', home: 'Home' }[key] ?? key; }

  // ---------------------------------------------------------------- loop
  loop() {
    const now = performance.now();
    const dt = Math.min(this.maxStep, (now - this.last) / 1000) * this.timeScale;
    this.last = now;
    this.time += dt;
    const input = this.input;
    const xr = this.engine.inXR;
    input.pollXR(xr ? this.engine.renderer.xr.getSession() : null);

    if (input.hit('KeyM')) this.toggleMute();
    if (input.hit('KeyV')) this.togglePaint();
    if (this.state) this.state.stats.playSeconds += dt;

    this.tweens.update(dt);
    this.dialogue.update(dt, input);
    this.hud.update(dt, input);

    const w = this.world;
    if (w) {
      const free = this.locks === 0 && !this.dialogue.active;
      if (free && this.control === 'walk') {
        this.controller.update(dt, input, this.moveYaw(), w);
      } else if (this.player && this.player.root.parent) {
        this.player.update(dt, this.control === 'walk' ? 0 : this.player.speed * 0.9);
      }
      if (free && this.control === 'drive') {
        this.vehicle.updateGround(dt, input, w);
        this.audio.engine(Math.abs(this.vehicle.speed) / 20);
      }
      if (free && this.control === 'fly') {
        this.vehicle.updateFlight(dt, input);
        this.audio.engine(0.3 + Math.abs(this.vehicle.speed) / 150);
      }
      w.update(dt, this.time);
      if (free && this.control !== 'none') this.checkInteract();
      else this.hud.prompt(null);
      this.hud.waypoint(free && !xr ? w.waypoint?.() : null, this.engine.camera);
    }

    this.updateCamera(dt);
    this.updateLensing();
    this.xrPanel.update(dt);
    this.engine.render(this.time);
    input.endFrame();
  }

  moveYaw() {
    if (this.engine.inXR) {
      const d = this.engine.renderer.xr.getCamera().getWorldDirection(tmpV);
      return Math.atan2(-d.x, -d.z);
    }
    return this.cam.yaw;
  }

  checkInteract() {
    const w = this.world;
    const mode = this.control;
    const p = mode === 'walk' ? this.player.root.position : this.car.root.position;
    let best = null, bestD = Infinity;
    for (const it of w.interactables) {
      if (!(it.modes ?? ['walk']).includes(mode) || !it.enabled()) continue;
      const d = it.position.distanceTo(p);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    this.hud.prompt(best ? (best.promptText ?? `[E] ${best.label}`) : null);
    if (best && this.input.interact) {
      this.audio.blip();
      best.onInteract(best);
    }
  }

  updateCamera(dt) {
    const cam = this.engine.camera, input = this.input, c = this.cam;
    const rig = this.engine.rig;
    const xr = this.engine.inXR;
    const lookSens = 0.0024;

    if (this.camMode === 'follow' || this.camMode === 'car') {
      const car = this.camMode === 'car';
      const target = tmpV.copy(car ? this.car.root.position : this.player.root.position);
      this.focus.copy(target);
      target.y += car ? 1.6 : 1.45;
      if (this.locks === 0) {
        if (car) {
          c.offYaw -= input.mouseDX * lookSens;
          c.offYaw = damp(c.offYaw, 0, input.mouseDX ? 0 : 1.2, dt);
          c.yaw = this.vehicle.yaw + Math.PI + c.offYaw;
        } else {
          c.yaw -= input.mouseDX * lookSens + input.xr.look.x * dt * 2;
        }
        c.pitch = clamp(c.pitch + input.mouseDY * lookSens * 0.8, -0.25, 1.15);
        c.dist = clamp(c.dist + input.wheel * 0.6, 2.2, this.world?.maxCamDist ?? 10);
      }
      const dist = car ? Math.max(c.dist + 4, 9) : c.dist;
      const dir = tmpV2.set(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch));
      let allowed = dist;
      const blockers = this.world?.cameraBlockers;
      if (blockers?.length) {
        this.raycaster.set(target, dir);
        this.raycaster.far = dist;
        const hit = this.raycaster.intersectObjects(blockers, false)[0];
        if (hit) allowed = Math.max(0.6, hit.distance - 0.3);
      }
      c.actual = allowed < c.actual || this.cameraSnap ? allowed : damp(c.actual, allowed, 3, dt);
      const gy = this.world ? this.world.heightAt(target.x + dir.x * c.actual, target.z + dir.z * c.actual, target.y) : -1e9;
      cam.position.copy(target).addScaledVector(dir, c.actual);
      if (cam.position.y < gy + 0.4) cam.position.y = gy + 0.4;
      cam.lookAt(target);
      if (xr) {
        rig.position.copy(car ? this.car.root.position : this.player.root.position);
        if (car) rig.position.y += 0.6;
        if (input.snapTurn) rig.rotation.y -= input.snapTurn * Math.PI / 6;
      }
    } else if (this.camMode === 'space') {
      const car = this.car.root.position;
      this.focus.copy(car);
      const fwd = this.vehicle.forward(tmpV2);
      const back = tmpV.copy(car).addScaledVector(fwd, -15).add(new THREE.Vector3(0, 4.5, 0));
      c.offYaw = damp(c.offYaw, 0, 1, dt);
      if (this.cameraSnap) cam.position.copy(back);
      else cam.position.lerp(back, 1 - Math.exp(-5 * dt));
      const look = tmpV.copy(car).addScaledVector(fwd, 20);
      cam.lookAt(look);
      const targetFov = 60 + clamp(Math.abs(this.vehicle.speed) / 150, 0, 1) * 22;
      cam.fov = damp(cam.fov, targetFov, 3, dt);
      cam.updateProjectionMatrix();
      if (xr) {
        rig.position.copy(car).add(new THREE.Vector3(0, 0.9, 0));
        rig.rotation.set(0, this.vehicle.yaw + Math.PI, 0);
      }
    } else {
      this.focus.copy(this.cine.look);
      cam.position.copy(this.cine.pos);
      cam.lookAt(this.cine.look);
      if (xr) { rig.position.copy(this.cine.pos).y -= 1.6; }
    }
    this.cameraSnap = false;
    if (this.shake > 0 && !xr) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
    }
    if (xr) { cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0); }
    else { rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); }
    if (this.player) this.player.root.visible = !this.playerHidden && !(xr && this.camMode === 'follow');
  }

  // Feed black-hole screen positions to the watercolour pass for lensing.
  updateLensing() {
    const holes = this.engine.fx.uHoles.value;
    const cam = this.engine.camera;
    const list = this.world?.holes ?? [];
    const aspect = cam.aspect;
    const right = tmpV2.set(1, 0, 0).applyQuaternion(cam.quaternion);
    for (let i = 0; i < 3; i++) {
      const h = list[i];
      if (!h) { holes[i].set(0, 0, 0, 0); continue; }
      const p = tmpV.copy(h.pos).project(cam);
      if (p.z > 1 || Math.abs(p.x) > 2.5 || Math.abs(p.y) > 2.5) { holes[i].w = 0; continue; }
      const u = p.x * 0.5 + 0.5, v = p.y * 0.5 + 0.5;
      const q = tmpV.copy(h.pos).addScaledVector(right, h.radius).project(cam);
      const r = Math.abs(q.x - p.x) * 0.5 * aspect;
      holes[i].set(u, v, Math.min(r, 0.8), (h.strength ?? 0.5));
    }
  }
}

export { lerp };
