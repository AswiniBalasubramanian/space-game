// 3RD WORLD — GameStateManager. Boots the engine and systems, owns the main loop,
// switches worlds (lazily imported) and routes input to the active controller.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import './ui/styles.css';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioSys } from './core/audio.js';
import { SaveSystem } from './core/save.js';
import { loadContent, deepMerge } from './data/content.js';
import { ready as cloudReady, loadRemoteConfig, pullSave, flushPush } from './core/cloud.js';
import { Overlay, wait } from './ui/overlay.js';
import { HUD } from './ui/hud.js';
import { XRPanel } from './ui/xrpanel.js';
import { runEntry } from './ui/entry.js';
import { Dialogue } from './systems/dialogue.js';
import { Interactions, Markers } from './systems/interaction.js';
import { Missions } from './systems/missions.js';
import { Cinematic, ease } from './systems/cinematic.js';
import { CharacterController } from './systems/character.js';
import { VehicleController } from './systems/vehicle.js';

const LOADERS = {
  home: () => import('./scenes/home.js'),
  space: () => import('./scenes/space.js'),
  farm: () => import('./scenes/farm.js'),
  knowledge: () => import('./scenes/knowledge.js'),
  hunger: () => import('./scenes/hunger.js'),
};

class Game {
  constructor() {
    const container = document.getElementById('app');
    this.ui = document.getElementById('ui');
    this.engine = new Engine(container);
    this.input = new Input(this.engine.canvas);
    this.audio = new AudioSys();
    this.save = new SaveSystem();
    this.content = loadContent();
    this.overlay = new Overlay(this.ui);
    this.hud = new HUD(this.ui, this);
    this.dialogue = new Dialogue(this.ui, this);
    this.interactions = new Interactions(this);
    this.markers = new Markers(this);
    this.missions = new Missions(this);
    this.cine = new Cinematic(this);
    this.player = new CharacterController(this);
    this.vehicle = new VehicleController(this);
    this.xrPanel = new XRPanel(this);
    this.ease = ease;
    this.world = null;
    this.worldId = null;
    this.mode = 'title';
    this.paused = false;
    this.busy = false;
    this.loading = false;
    this.time = 0;
    this.timeScale = 1;
    this.tweens = [];
    this.clock = new THREE.Clock();
    this._setupKeys();
    this._setupTouch();
    this._setupXR();
    this.engine.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ flow

  async boot() {
    // developer shortcut: ?dev=farm|knowledge|hunger|space|home jumps straight into a world
    const dev = new URLSearchParams(location.search).get('dev');
    if (dev && LOADERS[dev]) {
      this.save.create('Tester', { gender: 'female', outfit: 'sky' });
      this._afterLogin();
      return this.loadWorld(dev, {});
    }
    cloudReady();
    const [remote] = await Promise.all([loadRemoteConfig().catch(() => null), this.loadWorld('space', { attract: true })]);
    if (remote) this.content = deepMerge(this.content, remote);
    this.overlay.setFadeInstant(1);
    this.overlay.fade(0, 2500);
    const res = await runEntry(this);
    this.audio.unlock();
    if (res.resume) {
      this.save.load(res.nickname);
      // an admin may have adjusted this save in the cloud since it was last played
      const cloud = await pullSave(res.nickname).catch(() => null);
      if (cloud?.admin_edited_at && new Date(cloud.admin_edited_at).getTime() > (this.save.state?.stats?.lastSeen || 0)) this.save.adopt(cloud.state);
      this._afterLogin();
      await this.overlay.fade(1, 1200);
      await this.overlay.caption(`Welcome back, ${this.save.state.nickname}.`, 2200);
      await this.loadWorld(this.save.state.currentWorld || 'home', { resume: true });
    } else {
      this.save.create(res.nickname, res.character);
      this._afterLogin();
      await this.overlay.fade(1, 1400);
      await this.overlay.caption(`Welcome, ${res.nickname}.`, 2400);
      await this.overlay.caption('Your journey begins at home.', 2800);
      await this.loadWorld('home', { spawn: 'intro' });
    }
  }

  _afterLogin() {
    this.player.build(this.save.state.character);
    this.hud.show(true);
  }

  async loadWorld(id, opts = {}) {
    this.loading = true;
    this.hud.prompt(null);
    this.hud.detect(null);
    this.hud.navs([]);
    this.hud.speed('');
    const old = this.world;
    if (old) {
      this.markers.clear();
      this.interactions.clear();
      if (this.player.model) old.scene.remove(this.player.model.group);
      old.scene.remove(this.vehicle.group, this.engine.rig);
      old.exit();
      old.dispose();
    }
    this.cine.release();
    const mod = await LOADERS[id]();
    const w = new mod.default(this, id);
    this.world = w;
    this.worldId = id;
    await w.build(opts);
    this.engine.setScene(w.scene);
    this.engine.setBloom(w.bloom);
    this.engine.setGrade(w.grade);
    this.engine.camera.fov = 60;
    this.engine.camera.updateProjectionMatrix();
    if (w.usesPlayer && this.player.model) this.player.attach(w);
    if (w.usesCar) {
      this.vehicle.attach(w);
      this.vehicle.group.visible = true; // the title screen hides it; every world that uses the car shows it
    }
    this.audio.setMood(opts.attract ? 'title' : w.mood);
    if (this.save.state && !opts.attract) {
      const s = this.save.state;
      s.currentWorld = id;
      if (!s.discovered.includes(id)) s.discovered.push(id);
      this.save.save();
    }
    this.loading = false;
    await w.enter(opts);
  }

  setMode(mode) {
    this.mode = mode;
    const inGame = ['walk', 'drive', 'fly'].includes(mode);
    this.input.setPointerLock(inGame);
    if (mode !== 'drive' && mode !== 'fly') this.audio.setEngine(0);
  }

  canInteract() {
    return ['walk', 'drive', 'fly'].includes(this.mode) && !this.dialogue.active && !this.cine.active && !this.paused && !this.loading && !this.busy;
  }

  /** Scripted tween on game time. fn(k) with k in 0..1 */
  tween(ms, fn, easing = ease.inOut) {
    return new Promise((resolve) => this.tweens.push({ t: 0, d: ms / 1000, fn, easing, resolve }));
  }

  sleep(ms) { return this.tween(ms, () => {}); }

  // ------------------------------------------------------------------ loop

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05) * this.timeScale;
    const xr = this.engine.renderer.xr;
    if (xr.isPresenting) this.input.pollXR(xr.getSession());
    if (this.input.hit('Escape') || this.input.hit('KeyP') || this.input.xrHit('b')) this.togglePause();
    if (this.input.hit('Tab') && this.save.state && !this.paused) this.hud.toggleInventory();
    if (this.input.hit('KeyM')) this.audio.toggleMute();
    if (!this.paused) this.step(dt);
    this.engine.render(this.time);
    this.input.endFrame();
  }

  step(dt) {
    this.time += dt;
    if (this.save.state) this.save.state.stats.playTime += dt;
    this.dialogue.update(dt);
    for (const tw of [...this.tweens]) {
      tw.t = Math.min(1, tw.t + dt / tw.d);
      tw.fn(tw.easing(tw.t));
      if (tw.t >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.resolve(); }
    }
    const allow = !this.dialogue.active && !this.busy && !this.loading;
    if (this.world && !this.loading) {
      if (this.mode === 'walk') {
        this.player.update(dt, allow);
        if (!this.cine.active) this.player.updateCamera(dt);
      } else if (this.mode === 'drive' || this.mode === 'fly') {
        this.vehicle.update(dt, allow);
        if (!this.cine.active) this.vehicle.updateCamera(dt);
      } else {
        this.input.consumeLook();
      }
      this.cine.update(dt);
      this.interactions.update();
      this.world.update(dt, this.time);
      this.markers.update(this.time);
    }
    this.hud.update();
    this.xrPanel.update();
    this.audio.update(dt);
  }

  // ------------------------------------------------------------------ menus

  togglePause() {
    if (!this.save.state || this.mode === 'title') return;
    this.paused = this.hud.togglePause(!this.paused);
    this.input.setPointerLock(!this.paused && ['walk', 'drive', 'fly'].includes(this.mode));
    if (this.paused) this.save.flush();
  }

  menuAction(a) {
    if (a === 'resume') this.togglePause();
    else if (a === 'paint') { this.engine.setPainterly(!this.engine.painterly); this.hud.togglePause(true); }
    else if (a === 'mute') { this.audio.toggleMute(); this.hud.togglePause(true); }
    else if (a === 'title') { this.save.flush(); location.reload(); }
  }

  restart() {
    this.save.reset();
    location.reload();
  }

  // ------------------------------------------------------------------ setup

  _setupKeys() {
    addEventListener('beforeunload', () => this.save.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.save.flush(); flushPush(); } });
  }

  _setupTouch() {
    const stick = document.createElement('div');
    stick.className = 'touch-stick';
    stick.innerHTML = '<i></i>';
    const btn = document.createElement('button');
    btn.className = 'touch-btn';
    btn.textContent = 'E';
    this.ui.append(stick, btn);
    const knob = stick.firstChild;
    const move = (e) => {
      const r = stick.getBoundingClientRect();
      const t = e.touches[0];
      let x = (t.clientX - r.left - 60) / 50, y = (t.clientY - r.top - 60) / 50;
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      this.input.touchMove.x = x;
      this.input.touchMove.y = -y;
      knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
      e.preventDefault();
    };
    stick.addEventListener('touchstart', move, { passive: false });
    stick.addEventListener('touchmove', move, { passive: false });
    stick.addEventListener('touchend', () => { this.input.touchMove.x = this.input.touchMove.y = 0; knob.style.transform = ''; });
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.input.pressed.add('KeyE'); });
  }

  async _setupXR() {
    try {
      if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-vr'))) return;
      const b = VRButton.createButton(this.engine.renderer);
      b.classList.add('vr-btn', 'interactive');
      this.ui.appendChild(b);
      this.engine.renderer.xr.addEventListener('sessionstart', () => { this.xrPanel.draw(); });
    } catch { /* WebXR unavailable */ }
  }
}

const game = new Game();
window.__astra = game;
game.boot().catch((e) => console.error(e));

export { wait };
