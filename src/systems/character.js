// Procedural hand-drawn-style characters (player, mother, NPCs) and the
// third-person CharacterController with collision and orbit camera.
import * as THREE from 'three';
import { buildCharacter } from './charmodel.js';
import { resolveCollisions } from './physics.js';
import { clamp } from '../core/noise.js';

export { buildCharacter };

/** An idle NPC that turns to face the player when near. */
export function makeNPC(world, opts) {
  const c = buildCharacter(opts);
  c.group.position.copy(opts.position);
  c.group.rotation.y = opts.yaw || 0;
  world.scene.add(c.group);
  world.animate((t, _cam, _p, dt) => {
    c.animate(dt, 0, t + (opts.phase || 0));
    const pl = world.game.player.position;
    if (pl.distanceTo(c.group.position) < 7) c.lookAt(pl.clone().setY(pl.y + 1.4), dt);
    else c.parts.head.rotation.y *= 0.97;
  });
  world.colliders.push({ type: 'circle', x: opts.position.x, z: opts.position.z, r: 0.4 });
  return c;
}

export class CharacterController {
  constructor(game) {
    this.game = game;
    this.position = new THREE.Vector3();
    this.facing = 0;
    this.speed = 0;
    this.radius = 0.32;
    this.model = null;
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.camDist = 5;
    this.camDistTarget = 5;
    this.minPitch = -0.2;
    this.maxPitch = 1.15;
    this._camPos = new THREE.Vector3();
    this._ray = new THREE.Raycaster();
    this.xrSnap = 0;
  }

  build(character) {
    const c = this.game.content;
    const outfit = c.outfits.find((o) => o.id === character.outfit) || c.outfits[0];
    const def = c.characters[character.gender] || c.characters.female;
    this.model = buildCharacter({ gender: character.gender, top: outfit.top, bottom: outfit.bottom, hair: def.hair, skin: def.skin, backpack: true });
    return this.model;
  }

  attach(world) {
    world.scene.add(this.model.group);
    this.model.group.visible = true;
  }

  place(x, y, z, facing = 0, camYaw = facing + Math.PI) {
    this.position.set(x, y, z);
    this.facing = facing;
    this.camYaw = camYaw;
    this.speed = 0;
    this.model.group.position.copy(this.position);
    this.model.group.rotation.y = facing;
    this.snapCamera();
  }

  snapCamera() {
    this.camDist = this.camDistTarget;
    this._computeCam(this._camPos);
    const cam = this.game.engine.camera;
    cam.position.copy(this._camPos);
    cam.lookAt(this.position.x, this.position.y + 1.4, this.position.z);
  }

  update(dt, allowMove = true) {
    const { input, world } = this.game;
    const xr = this.game.engine.renderer.xr.isPresenting;
    const look = input.consumeLook();
    if (!xr) {
      this.camYaw -= look.x * 0.0026;
      this.camPitch = clamp(this.camPitch + look.y * 0.0022, this.minPitch, this.maxPitch);
      const wheel = input.consumeWheel();
      if (wheel) this.camDistTarget = clamp(this.camDistTarget + wheel * 0.6, world.camMin ?? 2.2, world.camMax ?? 9);
    } else {
      // snap-turn on the right stick
      this.xrSnap -= dt;
      if (Math.abs(input.xr.look.x) > 0.7 && this.xrSnap <= 0) {
        this.camYaw -= Math.sign(input.xr.look.x) * (Math.PI / 6);
        this.xrSnap = 0.35;
      }
    }

    let ax = { x: 0, y: 0 };
    if (allowMove) ax = input.axis();
    let yawRef = this.camYaw;
    if (xr) {
      const q = new THREE.Quaternion();
      this.game.engine.camera.getWorldQuaternion(q);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      yawRef = e.y;
    }
    const fx = -Math.sin(yawRef), fz = -Math.cos(yawRef);
    const rx = Math.cos(yawRef), rz = -Math.sin(yawRef);
    let mx = fx * ax.y + rx * ax.x, mz = fz * ax.y + rz * ax.x;
    const len = Math.hypot(mx, mz);
    const running = input.run();
    const target = len > 0.01 ? (running ? 6.4 : 3.1) * Math.min(1, len) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 8);
    if (len > 0.01) {
      mx /= len; mz /= len;
      const want = Math.atan2(mx, mz);
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 10);
    }
    if (this.speed > 0.01) {
      const vx = Math.sin(this.facing) * this.speed * dt;
      const vz = Math.cos(this.facing) * this.speed * dt;
      const p = this.position;
      // axis-separated so we slide along unwalkable edges
      const tryMove = (nx, nz) => {
        const h = world.groundAt(nx, nz);
        if (h === null || h === undefined) return false;
        if (h - p.y > 0.6) return false; // too steep a step
        p.x = nx; p.z = nz;
        return true;
      };
      if (!tryMove(p.x + vx, p.z + vz)) { tryMove(p.x + vx, p.z) || tryMove(p.x, p.z + vz); }
      resolveCollisions(p, this.radius, world.colliders);
      const h = world.groundAt(p.x, p.z);
      if (h === null || h === undefined) { p.x -= vx; p.z -= vz; }
    }
    const gh = world.groundAt(this.position.x, this.position.z) ?? this.position.y;
    this.position.y += (gh - this.position.y) * Math.min(1, dt * 14);

    const g = this.model.group;
    g.position.copy(this.position);
    g.rotation.y = this.facing;
    this.model.animate(dt, this.speed, this.game.time);
    g.visible = !xr;
  }

  _computeCam(out) {
    const p = this.position;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    out.set(
      p.x + Math.sin(this.camYaw) * cp * this.camDist,
      p.y + 1.45 + sp * this.camDist,
      p.z + Math.cos(this.camYaw) * cp * this.camDist,
    );
    return out;
  }

  updateCamera(dt) {
    const { engine, world } = this.game;
    const cam = engine.camera;
    if (engine.renderer.xr.isPresenting) {
      engine.rig.position.copy(this.position);
      engine.rig.rotation.set(0, this.camYaw, 0);
      return;
    }
    engine.rig.position.set(0, 0, 0);
    engine.rig.rotation.set(0, 0, 0);
    this.camDist += (this.camDistTarget - this.camDist) * Math.min(1, dt * 5);
    const target = new THREE.Vector3(this.position.x, this.position.y + 1.45, this.position.z);
    this._computeCam(this._camPos);
    // keep the camera out of walls
    if (world.cameraBlockers && world.cameraBlockers.length) {
      const dir = this._camPos.clone().sub(target);
      const dist = dir.length();
      dir.normalize();
      this._ray.set(target, dir);
      this._ray.far = dist;
      const hit = this._ray.intersectObjects(world.cameraBlockers, false)[0];
      if (hit) this._camPos.copy(target).addScaledVector(dir, Math.max(0.35, hit.distance - 0.25));
    }
    const gh = world.groundAt(this._camPos.x, this._camPos.z);
    if (gh !== null && gh !== undefined && this._camPos.y < gh + 0.4) this._camPos.y = gh + 0.4;
    cam.position.lerp(this._camPos, Math.min(1, dt * 12));
    cam.lookAt(target);
  }
}
