// Cinematic camera choreography: eased moves between shots, slow orbits, holds.
import * as THREE from 'three';

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export class Cinematic {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this._from = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    this._to = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
    this._t = 1;
    this._dur = 1;
    this._orbit = null;
    this._resolve = null;
    this.fov = null;
  }

  _currentTarget(out) {
    const cam = this.game.engine.camera;
    return out.copy(cam.position).add(new THREE.Vector3(0, 0, -10).applyQuaternion(cam.quaternion));
  }

  /** Move to a shot. pos/target can be Vector3 or () => Vector3 (tracked each frame). */
  to(pos, target, ms = 1500, easing = ease.inOut) {
    const cam = this.game.engine.camera;
    if (!this.active) { this.pos.copy(cam.position); this._currentTarget(this.target); }
    this._from.pos.copy(this.pos);
    this._from.target.copy(this.target);
    this._toPos = pos;
    this._toTarget = target;
    this._t = 0;
    this._dur = Math.max(ms, 1) / 1000;
    this._ease = easing;
    this._orbit = null;
    this.active = true;
    if (this._resolve) this._resolve();
    return new Promise((r) => (this._resolve = r));
  }

  cut(pos, target) {
    this.to(pos, target, 1);
    this.pos.copy(typeof pos === 'function' ? pos() : pos);
    this.target.copy(typeof target === 'function' ? target() : target);
    this._from.pos.copy(this.pos);
    this._from.target.copy(this.target);
    this._t = 1;
    return Promise.resolve();
  }

  orbit(center, radius, height, speed = 0.05, start = 0) {
    this._orbit = { center, radius, height, speed, a: start };
    this.active = true;
  }

  release() {
    this.active = false;
    this._orbit = null;
    if (this._resolve) { this._resolve(); this._resolve = null; }
  }

  update(dt) {
    if (!this.active) return;
    const cam = this.game.engine.camera;
    if (this.game.engine.renderer.xr.isPresenting) {
      // Never drive the head in VR — move the rig gently instead.
      this.game.engine.rig.position.lerp(this.pos.clone().setY(this.pos.y - 1.6), Math.min(1, dt * 2));
    }
    if (this._orbit) {
      const o = this._orbit;
      o.a += o.speed * dt;
      const c = typeof o.center === 'function' ? o.center() : o.center;
      this.pos.set(c.x + Math.cos(o.a) * o.radius, c.y + o.height, c.z + Math.sin(o.a) * o.radius);
      this.target.copy(c);
    } else {
      this._t = Math.min(1, this._t + dt / this._dur);
      const k = this._ease(this._t);
      const tp = typeof this._toPos === 'function' ? this._toPos() : this._toPos;
      const tt = typeof this._toTarget === 'function' ? this._toTarget() : this._toTarget;
      this.pos.lerpVectors(this._from.pos, tp, k);
      this.target.lerpVectors(this._from.target, tt, k);
      if (this._t >= 1 && this._resolve) { this._resolve(); this._resolve = null; }
    }
    if (!this.game.engine.renderer.xr.isPresenting) {
      cam.position.copy(this.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.target);
    }
  }
}
