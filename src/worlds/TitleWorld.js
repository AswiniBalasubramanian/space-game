import * as THREE from 'three';
import { BaseWorld } from './BaseWorld.js';
import { createSkyDome, createCloudRing } from '../render/Sky.js';
import { terrain, grassField, flowerField, broadleafGeometry, forest, mountainRange, rocks } from '../render/nature.js';
import { CharacterModel } from '../character/CharacterModel.js';
import { fbm, smoothstep } from '../utils/noise.js';

// The entry backdrop: a windy hilltop under a huge painted sky, the two
// explorers waiting beside a lone tree.
export default class TitleWorld extends BaseWorld {
  mood = 'entry';

  heightAt(x, z) {
    const d = Math.hypot(x, z);
    return (fbm(x * 0.01 + 3, z * 0.01, 4) - 0.5) * 30 * smoothstep(20, 120, d) + 3 * Math.exp(-d * d / 400) - d * 0.02;
  }

  async build() {
    const s = this.scene;
    s.fog = new THREE.Fog('#c4dcf4', 120, 800);
    const sky = createSkyDome({ top: '#2f6fd0', mid: '#6ea5e8', horizon: '#e9f1f7', sunDir: [0.5, 0.35, -0.8], cirrus: 0.8 });
    this.add(sky); this.skyFollow.push(sky);
    const clouds = createCloudRing({ count: 22, radius: [420, 760], height: [30, 200], scale: [150, 280], seed: 4 });
    this.add(clouds); this.onUpdate((dt, t) => clouds.userData.update(t, dt));
    this.onUpdate((dt, t) => sky.userData.update(t));
    this.lights({ dir: [30, 40, -50] });

    const h = (x, z) => this.heightAt(x, z);
    this.add(terrain({ size: 900, seg: 160, height: h, color: (x, z, y, c) => {
      const n = fbm(x * 0.04, z * 0.04, 3);
      c.set('#6fae3f').lerp(new THREE.Color('#b9d563'), n * 0.8).offsetHSL(0, 0, (y - 2) * 0.004);
    } }));
    this.add(grassField({ count: 16000, area: [-45, -45, 45, 45], heightAt: h }));
    this.add(flowerField({ count: 900, area: [-40, -40, 40, 40], heightAt: h }));
    this.add(mountainRange({ count: 10, radius: [380, 560], seed: 3 }));
    this.add(forest({ template: broadleafGeometry(3, { height: 5, spread: 3 }), positions: [[-7, -4, 1.5]], heightAt: h }));
    this.add(forest({ template: broadleafGeometry(8), positions: Array.from({ length: 30 }, (_, i) => { const a = i * 2.4; const d = 40 + (i % 5) * 12; return [Math.cos(a) * d, Math.sin(a) * d]; }), heightAt: h }));
    this.add(rocks({ positions: [[-3, 3, 0.7], [5, -2, 0.5], [9, 5, 1.1], [-12, 7, 1.4]], heightAt: h }));

    this.chars = {};
    for (const [key, x] of [['female', -1.3], ['male', 1.3]]) {
      const m = new CharacterModel(key);
      m.root.position.set(x, h(x, 0), 0);
      m.root.rotation.y = x * 0.12;
      this.add(m.root);
      this.chars[key] = m;
    }
    this.onUpdate((dt) => { for (const m of Object.values(this.chars)) m.update(dt, 0); });
    this.focusTarget = null;
    this.onUpdate((dt, t) => {
      const g = this.game;
      if (g.camMode !== 'cine' || g.state) return;
      const f = this.focusTarget;
      const a = t * 0.05;
      // Framed so the explorers sit to the right of the entry card.
      const cx = f && f !== 'both' ? this.chars[f].root.position.x : 0;
      const want = f && f !== 'both'
        ? { pos: new THREE.Vector3(cx * 0.6 - 0.6, 4.7, 5.4), look: new THREE.Vector3(cx - 1.5, 4.2, 0) }
        : { pos: new THREE.Vector3(-1 + Math.sin(a) * 3, f ? 4.8 : 5.4, f ? 8.5 : 13 + Math.cos(a) * 1.5), look: new THREE.Vector3(f ? -2.6 : -3.4, f ? 4 : 4.6, 0) };
      g.cine.pos.lerp(want.pos, 1 - Math.exp(-dt * 1.5));
      g.cine.look.lerp(want.look, 1 - Math.exp(-dt * 1.5));
    });
  }

  focusChar(c) {
    this.focusTarget = c;
    for (const [k, m] of Object.entries(this.chars)) m.setPose(c === k ? 'cheer' : 'stand');
  }

  enter() { this.game.setControl('none'); }
}
