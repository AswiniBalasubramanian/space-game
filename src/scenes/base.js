// WorldManager base: each world owns its scene graph, colliders, walkable ground,
// interactables and animated objects. Worlds are lazily imported and disposed.
import * as THREE from 'three';

export class World {
  constructor(game, id) {
    this.game = game;
    this.id = id;
    this.scene = new THREE.Scene();
    this.colliders = [];
    this.cameraBlockers = [];
    this.animated = [];
    this.bloom = { strength: 0.35, radius: 0.55, threshold: 0.88 };
    this.grade = { vignette: 0.35, warmth: 0, saturation: 1.1, exposure: 1.0 };
    this.mood = 'home';
    this.camMin = 2.2;
    this.camMax = 9;
    this.usesPlayer = true;
    this.usesCar = true;
  }

  /** register fn(t, camera, focusPos, dt) */
  animate(fn) { this.animated.push(fn); return fn; }

  /** register objects exposing userData.update */
  track(...objs) {
    for (const o of objs) {
      if (o.userData.update) this.animate((t, cam, p, dt) => o.userData.update(t, cam, p, dt));
      if (o.userData.colliders) this.colliders.push(...o.userData.colliders);
    }
    return objs[0];
  }

  add(...objs) { this.scene.add(...objs); return this.track(...objs); }

  groundAt() { return 0; }

  focus() {
    const g = this.game;
    return g.mode === 'drive' || g.mode === 'fly' ? g.vehicle.position : g.player.position;
  }

  async build() {}
  async enter() {}
  exit() {}

  update(dt, t) {
    const cam = this.game.engine.camera;
    const p = this.focus();
    for (const fn of this.animated) fn(t, cam, p, dt);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m.map && m.map.userData?.canvas && !m.map.userData.shared) m.map.dispose();
        m.dispose();
      }
      if (o.isReflector || o.getRenderTarget) o.dispose?.();
    });
    this.scene.clear();
  }
}
