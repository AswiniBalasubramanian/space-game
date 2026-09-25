// Minimal in-game HUD: player, mission, world, oxygen, resources, contextual prompt,
// navigation markers, inventory and pause panels.
import * as THREE from 'three';

const RES = [
  ['crops', 'Crops'], ['wood', 'Wood'], ['stone', 'Stone'], ['fish', 'Fish'], ['food', 'Food'],
];

export class HUD {
  constructor(root, game) {
    this.game = game;
    const h = (this.el = document.createElement('div'));
    h.className = 'hud off';
    h.innerHTML = `
      <div class="hud-tl">
        <div class="hud-label">Player</div>
        <div class="hud-name" data-k="name"></div>
        <div class="hud-mission" data-k="mission">
          <div class="hud-label">Mission</div>
          <div class="t" data-k="mtitle"></div>
          <div class="o" data-k="mobj"></div>
          <div class="p" data-k="mprog"></div>
          <div class="hud-bar" data-k="mbarw"><i data-k="mbar"></i></div>
        </div>
      </div>
      <div class="hud-tr">
        <div class="hud-label">World</div>
        <div class="hud-world" data-k="world"></div>
        <div class="hud-label">Oxygen</div>
        <div class="pips" data-k="pips"><span class="pip"></span><span class="pip"></span><span class="pip"></span></div>
        <div class="o2num" data-k="o2"></div>
      </div>
      <div class="hud-res" data-k="res"></div>
      <div class="navs" data-k="navs"></div>
      <div class="detect" data-k="detect"><div class="a">Unknown world detected</div><div class="b" data-k="dname"></div><div class="c" data-k="dsub"></div></div>
      <div class="prompt" data-k="prompt"><span class="key" data-k="pkey">E</span><span data-k="ptext"></span></div>
      <div class="speed" data-k="speed"></div>
      <div class="controls-hint" data-k="hint"></div>`;
    root.appendChild(h);
    this.k = {};
    h.querySelectorAll('[data-k]').forEach((n) => (this.k[n.dataset.k] = n));
    this._navEls = new Map();
    this._last = {};

    // inventory + pause panels
    this.inv = document.createElement('div');
    this.inv.className = 'panel hidden';
    root.appendChild(this.inv);
    this.pause = document.createElement('div');
    this.pause.className = 'panel hidden';
    root.appendChild(this.pause);
  }

  show(on) { this.el.classList.toggle('off', !on); }

  set(key, value, prop = 'textContent') {
    if (this._last[key] === value) return;
    this._last[key] = value;
    this.k[key][prop] = value;
  }

  hint(html, ms = 12000) {
    this.k.hint.innerHTML = html;
    this.k.hint.style.opacity = 1;
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => (this.k.hint.style.opacity = 0), ms);
  }

  prompt(text, key = 'E') {
    const on = !!text;
    this.k.prompt.classList.toggle('on', on);
    if (on) {
      this.set('ptext', text);
      this.set('pkey', key);
    }
  }

  detect(name, sub) {
    this.k.detect.classList.toggle('on', !!name);
    if (name) { this.set('dname', name); this.set('dsub', sub || ''); }
  }

  update() {
    const g = this.game, s = g.save.state;
    if (!s) return;
    this.set('name', s.nickname);
    const w = g.content.worlds[g.worldId];
    this.set('world', w ? w.name : '');
    const m = g.missions.current();
    this.k.mission.style.display = m ? '' : 'none';
    if (m) {
      this.set('mtitle', m.title);
      this.set('mobj', m.objective);
      this.set('mprog', m.progress || '');
      const pct = m.ratio === undefined ? null : Math.round(m.ratio * 100);
      this.k.mbarw.style.display = pct === null ? 'none' : '';
      if (pct !== null && this._last.mbar !== pct) { this._last.mbar = pct; this.k.mbar.style.width = pct + '%'; }
    }
    const cores = s.inventory.oxygenCore;
    this.set('o2', `${cores} / 3`);
    if (this._last.cores !== cores) {
      this._last.cores = cores;
      [...this.k.pips.children].forEach((p, i) => p.classList.toggle('on', i < cores));
    }
    const res = RES.filter(([k]) => s.inventory[k] > 0).map(([k, n]) => `<span>${n}<b>${s.inventory[k]}</b></span>`).join('');
    this.set('res', res, 'innerHTML');
  }

  /** Screen-space navigation markers for far targets (space travel). */
  navs(list) {
    const cam = this.game.engine.camera;
    const seen = new Set();
    const v = new THREE.Vector3();
    for (const n of list) {
      seen.add(n.id);
      let e = this._navEls.get(n.id);
      if (!e) {
        e = document.createElement('div');
        e.className = 'nav ' + (n.cls || '');
        e.innerHTML = `<i></i><span></span><small></small>`;
        this.k.navs.appendChild(e);
        this._navEls.set(n.id, e);
      }
      v.copy(n.pos).project(cam);
      const behind = v.z > 1;
      let x = v.x, y = v.y;
      if (behind) { x = -x; y = -y; }
      const off = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.86;
      if (off) {
        const m = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.86);
        x /= m; y /= m;
      }
      e.style.left = ((x + 1) / 2) * innerWidth + 'px';
      e.style.top = ((1 - y) / 2) * innerHeight + 'px';
      e.style.opacity = off ? 0.65 : 1;
      e.children[1].textContent = n.label;
      e.children[2].textContent = n.sub || '';
    }
    for (const [id, e] of this._navEls) if (!seen.has(id)) { e.remove(); this._navEls.delete(id); }
  }

  speed(text) { this.set('speed', text || ''); }

  toggleInventory(force) {
    const on = force ?? this.inv.classList.contains('hidden');
    if (!on) { this.inv.classList.add('hidden'); return false; }
    const s = this.game.save.state;
    const items = [['oxygenCore', 'Oxygen Core'], ...RES];
    this.inv.innerHTML = `<div class="panel-box"><div class="sub">${s.nickname} · ${this.game.content.worlds[this.game.worldId]?.name || ''}</div><h2>Inventory</h2>
      <div class="inv-grid">${items.map(([k, n]) => `<div class="inv-item ${k === 'oxygenCore' ? 'core' : ''}"><span class="n">${n}</span><span class="c">× ${s.inventory[k] || 0}</span></div>`).join('')}</div>
      <p class="keys-list" style="columns:1;margin-top:22px">Press <b>Tab</b> to close</p></div>`;
    this.inv.classList.remove('hidden');
    return true;
  }

  togglePause(force) {
    const on = force ?? this.pause.classList.contains('hidden');
    if (!on) { this.pause.classList.add('hidden'); return false; }
    const g = this.game;
    this.pause.innerHTML = `<div class="panel-box"><div class="sub">Paused</div><h2>3rd World</h2>
      <div class="menu">
        <button class="btn" data-a="resume">Resume</button>
        <button class="btn" data-a="paint">Painterly filter · ${g.engine.painterly ? 'On' : 'Off'}</button>
        <button class="btn" data-a="mute">Sound · ${g.audio.muted ? 'Off' : 'On'}</button>
        <button class="btn" data-a="title">Save &amp; return to title</button>
      </div>
      <div class="keys-list"><b>WASD</b> move<br><b>Mouse</b> look / steer<br><b>Shift</b> run / boost<br><b>E</b> interact<br><b>Space/C</b> rise / sink<br><b>Tab</b> inventory<br><b>Wheel</b> zoom<br><b>Esc</b> pause</div></div>`;
    this.pause.querySelectorAll('button').forEach((b) => (b.onclick = () => g.menuAction(b.dataset.a)));
    this.pause.classList.remove('hidden');
    return true;
  }
}
