import * as THREE from 'three';
import { WORLDS } from '../data/content.js';

// Minimal painted HUD: player, mission, world, oxygen and resources, plus
// context prompts, cinematic banners, a waypoint and the fishing mini-game.
const $ = (s) => document.querySelector(s);

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.el = {
      player: $('#hud-player .value'),
      avatar: $('#hud-player .avatar'),
      mTitle: $('#hud-mission .title'),
      mObj: $('#hud-mission .objective'),
      mProg: $('#hud-mission .progress'),
      mission: $('#hud-mission'),
      world: $('#hud-world .value'),
      pips: [...document.querySelectorAll('#hud-oxygen .pip')],
      oxyText: $('#hud-oxygen .count'),
      res: $('#hud-resources'),
      prompt: $('#prompt'),
      toast: $('#toast'),
      banner: $('#banner'),
      bTitle: $('#banner .b-title'),
      bSub: $('#banner .b-sub'),
      way: $('#waypoint'),
      wayDist: $('#waypoint .dist'),
      fade: $('#fade'),
      hint: $('#controls-hint'),
      fish: $('#fishing'),
    };
    this.v = new THREE.Vector3();
    this.lastPrompt = null;
  }

  show(on = true) { this.root.classList.toggle('show', on); }

  setPlayer(name, character) {
    this.el.player.textContent = name;
    this.el.avatar.dataset.char = character;
  }

  setWorld(key) { this.el.world.textContent = WORLDS[key]?.name ?? key; }

  setOxygen(n) {
    this.el.pips.forEach((p, i) => p.classList.toggle('on', i < n));
    this.el.oxyText.textContent = `${n} / 3`;
  }

  setMission(view) {
    if (!view) { this.el.mission.classList.add('hidden'); return; }
    this.el.mission.classList.remove('hidden');
    const t = `${view.code ? view.code + ' — ' : ''}${view.title}`;
    if (this.el.mTitle.textContent !== t) this.el.mTitle.textContent = t;
    if (this.el.mObj.textContent !== view.objective) {
      this.el.mObj.textContent = view.objective;
      this.el.mission.classList.remove('pulse'); void this.el.mission.offsetWidth; this.el.mission.classList.add('pulse');
    }
    this.el.mProg.textContent = view.progress ?? '';
    this.el.mProg.style.display = view.progress ? '' : 'none';
    this.game.xrPanel?.setObjective(view.objective);
  }

  setResources(list) {
    const show = list.filter((i) => i.id !== 'oxygenCore');
    this.el.res.innerHTML = show.map((i) => `<div class="res"><span class="ico">${i.icon}</span><span>${i.name}</span><b>× ${i.n}</b></div>`).join('');
  }

  prompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    const el = this.el.prompt;
    if (!text) { el.classList.remove('show'); this.game.xrPanel?.setPrompt(null); return; }
    el.innerHTML = text.replace(/\[(.+?)\]/g, '<kbd>$1</kbd>');
    el.classList.add('show');
    this.game.xrPanel?.setPrompt(text);
  }

  toast(text, ms = 2600) {
    const el = this.el.toast;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.remove('show'), ms);
    this.game.xrPanel?.flash(text);
  }

  async banner(title, sub = '', ms = 3200, cls = '') {
    const el = this.el.banner;
    this.el.bTitle.textContent = title;
    this.el.bSub.textContent = sub;
    el.className = `show ${cls}`;
    this.game.xrPanel?.flash(sub ? `${title}\n${sub}` : title, ms);
    await this.game.tweens.wait(ms / 1000);
    el.className = cls;
    await this.game.tweens.wait(0.6);
  }

  fadeTo(opacity, seconds = 0.8, color = '#0a0b14') {
    const el = this.el.fade;
    el.style.background = color;
    el.style.transition = `opacity ${seconds}s ease`;
    el.style.opacity = opacity;
    return this.game.tweens.wait(seconds);
  }

  clearHint() { clearTimeout(this.hintT); this.el.hint.classList.remove('show'); }

  hint(text) {
    this.el.hint.innerHTML = text.replace(/\[(.+?)\]/g, '<kbd>$1</kbd>');
    this.el.hint.classList.add('show');
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => this.el.hint.classList.remove('show'), 9000);
  }

  // Waypoint marker that sticks to the screen edge when off-screen.
  waypoint(target, camera) {
    const el = this.el.way;
    if (!target) { el.classList.remove('show'); return; }
    const v = this.v.copy(target).project(camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const edge = behind || Math.abs(x) > 0.9 || Math.abs(y) > 0.85;
    if (edge) {
      const m = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.85);
      x /= m; y /= m;
    }
    const sx = (x * 0.5 + 0.5) * innerWidth, sy = (-y * 0.5 + 0.5) * innerHeight;
    el.style.transform = `translate(${sx}px, ${sy}px)`;
    el.classList.add('show');
    el.classList.toggle('edge', edge);
    const d = camera.position.distanceTo(target);
    this.el.wayDist.textContent = d > 1000 ? `${(d / 1000).toFixed(1)}k` : `${Math.round(d)}m`;
    el.querySelector('.arrow').style.transform = edge ? `rotate(${Math.atan2(-y, x)}rad)` : '';
  }

  // Timing mini-game: press E while the float is inside the glowing zone.
  fishing() {
    const el = this.el.fish;
    const zone = el.querySelector('.zone'), bob = el.querySelector('.bob'), label = el.querySelector('.label');
    const zStart = 0.25 + Math.random() * 0.5, zW = 0.16;
    zone.style.left = `${zStart * 100}%`; zone.style.width = `${zW * 100}%`;
    label.textContent = 'Wait for the ripple… press E inside the light';
    el.classList.add('show');
    let t = Math.random() * 3, speed = 0.9 + Math.random() * 0.5;
    return new Promise((resolve) => {
      this.fishTick = (dt, input) => {
        t += dt * speed;
        const x = 0.5 + 0.5 * Math.sin(t * 2.2) * Math.cos(t * 0.7);
        bob.style.left = `${x * 100}%`;
        if (input.interact || input.hit('Space')) {
          const ok = x >= zStart && x <= zStart + zW;
          el.classList.remove('show');
          this.fishTick = null;
          resolve(ok);
        }
      };
    });
  }

  update(dt, input) { this.fishTick?.(dt, input); }
}
