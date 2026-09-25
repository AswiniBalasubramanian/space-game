import * as THREE from 'three';
import { dampAngle } from '../utils/noise.js';

// Third-person walking controller: camera-relative WASD, run, ground snapping
// and simple circle/box collision provided by the current world.
export class CharacterController {
  constructor(model) {
    this.model = model;
    this.pos = model.root.position;
    this.yaw = 0;
    this.speed = 0;
    this.radius = 0.35;
    this.dir = new THREE.Vector3();
  }

  place(x, z, yaw, world) {
    this.pos.set(x, world.heightAt(x, z, 99), z);
    this.yaw = yaw; this.model.root.rotation.y = yaw;
    this.speed = 0;
  }

  update(dt, input, camYaw, world) {
    const f = input.moveY, s = input.moveX;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    this.dir.set(fx * f + rx * s, 0, fz * f + rz * s);
    const len = this.dir.length();
    const target = len > 0.05 ? (input.run ? 6.2 : 3.4) * Math.min(1, len) : 0;
    this.speed += (target - this.speed) * (1 - Math.exp(-10 * dt));
    if (len > 0.05) {
      this.dir.divideScalar(len);
      this.yaw = dampAngle(this.yaw, Math.atan2(this.dir.x, this.dir.z), 12, dt);
      this.pos.x += this.dir.x * this.speed * dt;
      this.pos.z += this.dir.z * this.speed * dt;
    }
    world.collide(this.pos, this.radius);
    const gy = world.heightAt(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-20 * dt));
    this.model.root.rotation.y = this.yaw;
    this.model.update(dt, this.speed);
  }
}
