import * as THREE from 'three';
import { sparkleTexture } from '../render/textures.js';
import { updateWind } from '../render/nature.js';

// Shared plumbing for every world: scene, lights, ground height, collision,
// interactables with floating sparkle markers, and per-frame updaters.
export class BaseWorld {
  constructor(game, key) {
    this.game = game;
    this.key = key;
    this.scene = new THREE.Scene();
    this.colliders = [];
    this.interactables = [];
    this.cameraBlockers = [];
    this.updaters = [];
    this.skyFollow = [];
    this.holes = [];
    this.walkable = true;
  }

  // --- building helpers -------------------------------------------------
  lights({ sun = '#fff1d6', sunI = 2.6, sky = '#bfe0ff', ground = '#8a9a6a', hemiI = 1.2, dir = [40, 60, 25], shadow = true, ambient = 0 } = {}) {
    const hemi = new THREE.HemisphereLight(sky, ground, hemiI);
    const sunL = new THREE.DirectionalLight(sun, sunI);
    sunL.position.set(...dir);
    if (shadow) {
      sunL.castShadow = true;
      sunL.shadow.mapSize.set(2048, 2048);
      const s = sunL.shadow.camera;
      s.left = -45; s.right = 45; s.top = 45; s.bottom = -45; s.near = 1; s.far = 300;
      sunL.shadow.bias = -0.0006;
      sunL.shadow.normalBias = 0.03;
    }
    this.scene.add(hemi, sunL, sunL.target);
    if (ambient) this.scene.add(new THREE.AmbientLight('#ffffff', ambient));
    this.sun = sunL; this.hemi = hemi;
    this.sunOffset = new THREE.Vector3(...dir);
    return { hemi, sun: sunL };
  }

  add(...objs) { this.scene.add(...objs); return objs[0]; }

  circle(x, z, r, extra = {}) { this.colliders.push({ t: 'c', x, z, r, ...extra }); }
  box(minX, minZ, maxX, maxZ, extra = {}) { this.colliders.push({ t: 'b', minX, minZ, maxX, maxZ, ...extra }); }
  // Axis-aligned wall segment of a given thickness.
  wall(x1, z1, x2, z2, th = 0.25) {
    this.box(Math.min(x1, x2) - th / 2, Math.min(z1, z2) - th / 2, Math.max(x1, x2) + th / 2, Math.max(z1, z2) + th / 2);
  }

  interact(def) {
    const it = { radius: 2.2, marker: true, ...def };
    it.enabled = def.enabled ?? (() => true);
    it.position = def.position.clone ? def.position.clone() : new THREE.Vector3(...def.position);
    if (it.marker) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: def.markerColor ?? '#ffe7b0', fog: false }));
      m.scale.setScalar(0.55);
      m.position.copy(it.position).add(new THREE.Vector3(0, def.markerHeight ?? 1.2, 0));
      m.userData.base = m.position.y;
      this.scene.add(m);
      it.markerSprite = m;
    }
    this.interactables.push(it);
    return it;
  }

  removeInteract(it) {
    const i = this.interactables.indexOf(it);
    if (i >= 0) this.interactables.splice(i, 1);
    if (it.markerSprite) this.scene.remove(it.markerSprite);
  }

  onUpdate(fn) { this.updaters.push(fn); }

  // --- physics ------------------------------------------------------------
  heightAt() { return 0; }

  collide(pos, r) {
    for (const c of this.colliders) {
      if (c.minY !== undefined && (pos.y < c.minY || pos.y > c.maxY)) continue;
      if (c.t === 'c') {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-5) { pos.x = c.x + (dx / d) * m; pos.z = c.z + (dz / d) * m; }
      } else {
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-8) {
          if (d2 < r * r) { const d = Math.sqrt(d2); pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r; }
        } else {
          // centre inside the box: exit via the shallowest side
          const opts = [
            [pos.x - c.minX + r, -1, 0], [c.maxX - pos.x + r, 1, 0],
            [pos.z - c.minZ + r, 0, -1], [c.maxZ - pos.z + r, 0, 1],
          ].sort((a, b) => a[0] - b[0]);
          pos.x += opts[0][1] * opts[0][0];
          pos.z += opts[0][2] * opts[0][0];
        }
      }
    }
    if (this.bounds) {
      const d = Math.hypot(pos.x - this.bounds.x, pos.z - this.bounds.z);
      if (d > this.bounds.r) { pos.x = this.bounds.x + ((pos.x - this.bounds.x) / d) * this.bounds.r; pos.z = this.bounds.z + ((pos.z - this.bounds.z) / d) * this.bounds.r; }
    }
  }

  // --- lifecycle -----------------------------------------------------------
  async build() {}
  enter() {}
  exit() {}

  update(dt, t) {
    updateWind(t);
    const cam = this.game.engine.camera;
    for (const s of this.skyFollow) s.position.copy(cam.position);
    for (const it of this.interactables) {
      if (!it.markerSprite) continue;
      const on = it.enabled();
      it.markerSprite.visible = on;
      if (on) {
        it.markerSprite.position.y = it.markerSprite.userData.base + Math.sin(t * 2.2 + it.position.x) * 0.12;
        it.markerSprite.material.rotation = t * 0.6;
      }
    }
    if (this.sun?.castShadow) {
      // keep the shadow frustum centred on whatever the camera is following
      const f = this.game.focus;
      this.sun.target.position.copy(f);
      this.sun.position.copy(f).add(this.sunOffset);
    }
    for (const u of this.updaters) u(dt, t);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (!m.userData?.shared) m.dispose();
      }
    });
  }
}
