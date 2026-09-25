import * as THREE from 'three';
import { clamp, damp } from '../utils/noise.js';

// Drives the car on the ground (arcade steering) and in space (thrust, yaw,
// pitch, banking, boost). Mouse steering works while the pointer is locked.
export class VehicleController {
  constructor(car) {
    this.car = car;
    this.pos = car.root.position;
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.throttle = 0;
    this.mode = 'ground';
    this.maxSpeed = 16;
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z); this.yaw = yaw; this.pitch = 0; this.roll = 0; this.speed = 0;
    this.apply();
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  apply() {
    const r = this.car.root.rotation;
    r.order = 'YXZ';
    r.set(this.pitch, this.yaw, this.roll);
  }

  updateGround(dt, input, world) {
    const f = input.moveY, s = input.moveX;
    const target = f * this.maxSpeed * (input.run ? 1.4 : 1);
    this.speed = damp(this.speed, target, f === 0 ? 1.5 : 2.2, dt);
    const steer = -s * clamp(Math.abs(this.speed) / 6, 0, 1) * 1.6 * Math.sign(this.speed || 1);
    this.yaw += steer * dt;
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    const before = this.pos.clone();
    world.collide(this.pos, 1.6);
    if (before.distanceToSquared(this.pos) > 1e-4) this.speed *= 0.6;
    const gy = world.heightAt(this.pos.x, this.pos.z, this.pos.y);
    const gyF = world.heightAt(this.pos.x + Math.sin(this.yaw) * 1.5, this.pos.z + Math.cos(this.yaw) * 1.5, this.pos.y);
    this.pos.y = damp(this.pos.y, gy, 15, dt);
    this.pitch = damp(this.pitch, -Math.atan2(gyF - gy, 1.5), 8, dt);
    this.roll = damp(this.roll, s * clamp(this.speed / this.maxSpeed, -1, 1) * 0.06, 6, dt);
    this.throttle = Math.abs(f);
    this.apply();
    this.car.update(dt, this.speed, 0);
  }

  updateFlight(dt, input) {
    const boost = input.run ? 2.2 : 1;
    const thrust = input.moveY;
    const maxS = 70 * boost;
    const target = thrust > 0 ? maxS * thrust : thrust < 0 ? -15 : this.speed * 0.985;
    this.speed = damp(this.speed, target, thrust ? 1.2 : 0.4, dt);
    const yawIn = -input.moveX - input.mouseDX * 0.0025 / Math.max(dt, 0.001) * 0.016;
    const pitchIn = (input.down('Space') || input.xr.up ? -1 : 0) + (input.down('KeyC') || input.down('ControlLeft') || input.xr.down ? 1 : 0)
      + input.mouseDY * 0.0025 / Math.max(dt, 0.001) * 0.016 + input.xr.look.y * 0.8;
    this.yawRate = damp(this.yawRate || 0, clamp(yawIn, -1.6, 1.6) * 0.9, 5, dt);
    this.pitchRate = damp(this.pitchRate || 0, clamp(pitchIn, -1.6, 1.6) * 0.7, 5, dt);
    this.yaw += this.yawRate * dt;
    this.pitch = clamp(this.pitch + this.pitchRate * dt, -1.2, 1.2);
    this.roll = damp(this.roll, -this.yawRate * 0.55, 4, dt);
    const fwd = this.forward();
    this.pos.addScaledVector(fwd, this.speed * dt);
    this.throttle = damp(this.throttle, Math.max(0, thrust) * (input.run ? 1 : 0.6), 4, dt);
    this.apply();
    this.car.update(dt, this.speed, this.throttle);
  }
}
