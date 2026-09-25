// Contextual interaction ("[E] Talk", "[E] Harvest" …) and floating objective markers.
import * as THREE from 'three';
import { canvasTexture } from '../world/kit.js';

export class Interactions {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.current = null;
    this._v = new THREE.Vector3();
  }

  clear() { this.items = []; this.current = null; }

  /** opts: { pos: Vector3 | () => Vector3, radius, label, key, enabled: () => bool, action: (item) => void } */
  add(opts) {
    const item = { radius: 2, key: 'E', enabled: () => true, ...opts };
    this.items.push(item);
    return item;
  }

  remove(item) { this.items = this.items.filter((i) => i !== item); }

  update() {
    const g = this.game;
    if (!g.canInteract()) { this.current = null; g.hud.prompt(null); return; }
    const origin = g.mode === 'drive' || g.mode === 'fly' ? g.vehicle.position : g.player.position;
    let best = null, bestD = Infinity;
    for (const it of this.items) {
      if (!it.enabled()) continue;
      const p = typeof it.pos === 'function' ? it.pos() : it.pos;
      const dx = p.x - origin.x, dz = p.z - origin.z, dy = p.y - origin.y;
      const d = Math.hypot(dx, dz);
      if (d < it.radius && Math.abs(dy) < (it.dy ?? 3) && d < bestD) { best = it; bestD = d; }
    }
    this.current = best;
    const label = best ? (typeof best.label === 'function' ? best.label() : best.label) : null;
    g.hud.prompt(label, best?.key);
    g.xrPanel?.prompt(label);
    if (best && g.input.interact()) best.action(best);
  }
}

let _diamond;
function diamondTex() {
  if (_diamond) return _diamond;
  _diamond = canvasTexture(64, 96, (g) => {
    g.translate(32, 40);
    const grd = g.createRadialGradient(0, 0, 2, 0, 0, 30);
    grd.addColorStop(0, 'rgba(255,245,220,1)');
    grd.addColorStop(0.4, 'rgba(242,112,60,0.9)');
    grd.addColorStop(1, 'rgba(169,32,62,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff6e4';
    g.beginPath();
    g.moveTo(0, -14); g.lineTo(9, 0); g.lineTo(0, 14); g.lineTo(-9, 0); g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,240,220,0.8)';
    g.fillRect(-1, 30, 2, 40);
  });
  _diamond.userData.shared = true;
  return _diamond;
}

export class Markers {
  constructor(game) {
    this.game = game;
    this.map = new Map();
  }

  set(id, pos, { color = '#ffffff', size = 0.045 } = {}) {
    this.remove(id);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: diamondTex(), color, transparent: true, depthTest: false, sizeAttenuation: false, toneMapped: false }));
    s.scale.set(size * 0.66, size, 1);
    s.renderOrder = 50;
    s.center.set(0.5, 0.2);
    this.game.world.scene.add(s);
    this.map.set(id, { sprite: s, pos });
  }

  remove(id) {
    const m = this.map.get(id);
    if (m) { m.sprite.removeFromParent(); m.sprite.material.dispose(); this.map.delete(id); }
  }

  clear() { for (const id of [...this.map.keys()]) this.remove(id); }

  update(t) {
    const cam = this.game.engine.camera;
    for (const m of this.map.values()) {
      const p = typeof m.pos === 'function' ? m.pos() : m.pos;
      m.sprite.position.set(p.x, p.y + 0.25 + Math.sin(t * 2.4) * 0.12, p.z);
      const d = cam.position.distanceTo(m.sprite.position);
      m.sprite.material.opacity = d < 2.5 ? d / 2.5 : 1;
    }
  }
}
