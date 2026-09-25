// The family car: a rounded retro coupé with hover thrusters. Drives on the ground
// and flies through space. VehicleController handles both, plus the chase camera.
import * as THREE from 'three';
import { toon, glowMat, glowSprite } from '../world/kit.js';
import { resolveCollisions } from './physics.js';
import { clamp } from '../core/noise.js';

function profileGeo(points, depth, bevel) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export function buildCar({ body = '#5f9fc4', roof = '#f1ead9', trim = '#dfe6ee' } = {}) {
  const car = new THREE.Group();
  const inner = new THREE.Group();
  car.add(inner);
  const bodyMat = toon(body);
  const lower = new THREE.Mesh(profileGeo([
    [-2.05, 0.38], [-2.2, 0.62], [-2.1, 0.9], [-1.7, 1.0], [1.2, 1.02], [1.9, 0.92], [2.2, 0.7], [2.15, 0.42], [1.8, 0.32], [-1.8, 0.32],
  ], 1.5, 0.16), bodyMat);
  inner.add(lower);
  const cabin = new THREE.Mesh(profileGeo([
    [-1.35, 0.98], [-1.0, 1.52], [0.45, 1.55], [1.05, 1.0],
  ], 1.3, 0.1), toon(roof));
  inner.add(cabin);
  const glass = new THREE.MeshToonMaterial({ color: '#27394f', emissive: '#0c1a2a' });
  const glassHi = new THREE.MeshBasicMaterial({ color: '#9fd4ff', transparent: true, opacity: 0.25 });
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 1.2), glass);
    w.position.set(side * 0.77, 1.25, -0.2);
    inner.add(w);
    const hi = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.05), glassHi);
    hi.position.set(side * 0.785, 1.36, -0.05);
    hi.rotation.set(0, side * Math.PI / 2, -0.4);
    inner.add(hi);
  }
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.5, 0.02), glass);
  wind.position.set(0, 1.27, 0.78);
  wind.rotation.x = -0.72;
  inner.add(wind);
  const rear = wind.clone();
  rear.position.set(0, 1.27, -1.2);
  rear.rotation.x = 0.8;
  inner.add(rear);

  const chrome = toon(trim);
  const bumperF = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 1.6, 4, 10), chrome);
  bumperF.rotation.z = Math.PI / 2;
  bumperF.position.set(0, 0.42, 2.32);
  inner.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -2.35;
  inner.add(bumperR);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.05), chrome);
  grille.position.set(0, 0.62, 2.33);
  inner.add(grille);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.05, 3.6), toon('#f2703c'));
  stripe.position.set(0, 0.78, 0);
  stripe.scale.set(1.0, 1, 1);
  inner.add(stripe);

  const headMat = glowMat('#fff2c8', 3);
  const lights = [];
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), headMat);
    hl.position.set(side * 0.62, 0.72, 2.34);
    inner.add(hl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 20), chrome);
    ring.position.copy(hl.position);
    inner.add(ring);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), glowMat('#ff3b4f', 2.5));
    tl.position.set(side * 0.65, 0.7, -2.38);
    inner.add(tl);
    const hs = glowSprite('#fff0c0', 1.4, 0.5);
    hs.position.set(side * 0.62, 0.72, 2.45);
    inner.add(hs);
    lights.push(hs);
  }

  const wheels = [];
  const tire = toon('#23262e');
  const hub = toon('#e9ecef');
  for (const [x, z] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.3], [0.82, -1.3]]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 20), tire);
    t.rotation.z = Math.PI / 2;
    w.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.28, 16), hub);
    h.rotation.z = Math.PI / 2;
    w.add(h);
    w.position.set(x, 0.36, z);
    inner.add(w);
    wheels.push(w);
  }

  // hover thrusters (visible when flying)
  const thrusters = new THREE.Group();
  const ringMat = glowMat('#f2703c', 1.4, { transparent: true, opacity: 0.8 });
  for (const [x, z] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.3], [0.82, -1.3]]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24), ringMat);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, 0.1, z);
    thrusters.add(r);
    const g = glowSprite('#ff9a4a', 0.9, 0.35);
    g.position.set(x, -0.05, z);
    thrusters.add(g);
  }
  const exhaust = glowSprite('#ffb066', 1.2, 0.0);
  exhaust.position.set(0, 0.6, -3.2);
  thrusters.add(exhaust);
  const trailMat = new THREE.MeshBasicMaterial({ color: '#ffae6a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const trail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 5, 12, 1, true), trailMat);
  trail.rotation.x = -Math.PI / 2;
  trail.position.set(0, 0.6, -6.5);
  trail.visible = false; // reads as a bar from the chase camera
  thrusters.add(trail);
  thrusters.visible = false;
  inner.add(thrusters);

  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  thrusters.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  return {
    group: car, inner, wheels, thrusters,
    setFlying(on) {
      thrusters.visible = on;
      wheels.forEach((w) => { w.scale.setScalar(on ? 0.6 : 1); w.rotation.z = on ? Math.PI / 2 * Math.sign(w.position.x) * 0.9 : 0; });
    },
    setThrust(t) {
      exhaust.material.opacity = clamp(t, 0, 1) * 0.45;
      exhaust.scale.setScalar(1.2 + t * 1.2);
      trailMat.opacity = clamp(t - 0.3, 0, 1) * 0.22;
      trail.scale.set(1, 0.6 + t * 1.6, 1);
      ringMat.opacity = 0.6 + t * 0.4;
    },
  };
}

export class VehicleController {
  constructor(game) {
    this.game = game;
    this.car = buildCar();
    this.mode = 'ground';
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.speed = 0;
    this.vert = 0;
    this.maxSpeed = 22;
    this.boost = 0;
    this._cam = new THREE.Vector3();
    this.shake = 0;
    this.active = false;
  }

  get group() { return this.car.group; }
  get position() { return this.car.group.position; }

  attach(world) { world.scene.add(this.car.group); }

  place(x, y, z, yaw = 0, pitch = 0) {
    this.car.group.position.set(x, y, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.speed = 0;
    this.vert = 0;
    this._apply();
  }

  setMode(mode) {
    this.mode = mode;
    this._camQ = null;
    this.car.setFlying(mode === 'fly');
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, 1).applyQuaternion(this.car.group.quaternion);
  }

  _apply() {
    this.car.group.rotation.set(0, 0, 0);
    this.car.group.quaternion.setFromEuler(new THREE.Euler(-this.pitch, this.yaw, 0, 'YXZ'));
    this.car.inner.rotation.z = this.bank;
  }

  update(dt, allowInput = true) {
    const { input, world } = this.game;
    const ax = allowInput ? input.axis() : { x: 0, y: 0 };
    const look = allowInput ? input.consumeLook() : (input.consumeLook(), { x: 0, y: 0 });
    const xr = this.game.engine.renderer.xr.isPresenting;
    const boosting = allowInput && input.run();

    if (this.mode === 'ground') {
      const max = boosting ? 30 : this.maxSpeed;
      const target = ax.y * (ax.y > 0 ? max : 8);
      const accel = Math.sign(target - this.speed) === Math.sign(this.speed) || Math.abs(this.speed) < 0.5 ? 9 : 18;
      this.speed += clamp(target - this.speed, -accel * dt, accel * dt);
      const steer = -ax.x * clamp(Math.abs(this.speed) / 6, 0, 1) * 1.6 * Math.sign(this.speed || 1);
      this.yaw += steer * dt - look.x * 0.0012;
      const p = this.car.group.position;
      const nx = p.x + Math.sin(this.yaw) * this.speed * dt;
      const nz = p.z + Math.cos(this.yaw) * this.speed * dt;
      const h = world.groundAt(nx, nz);
      if (h !== null && h !== undefined) { p.x = nx; p.z = nz; } else this.speed *= -0.3;
      const before = p.clone();
      resolveCollisions(p, 1.5, world.colliders);
      if (before.distanceToSquared(p) > 1e-6) this.speed *= 0.85;
      const gh = world.groundAt(p.x, p.z) ?? p.y;
      p.y += (gh - p.y) * Math.min(1, dt * 10);
      const fh = world.groundAt(p.x + Math.sin(this.yaw) * 1.6, p.z + Math.cos(this.yaw) * 1.6) ?? gh;
      const bh = world.groundAt(p.x - Math.sin(this.yaw) * 1.6, p.z - Math.cos(this.yaw) * 1.6) ?? gh;
      this.pitch += (Math.atan2(fh - bh, 3.2) - this.pitch) * Math.min(1, dt * 8);
      this.bank += (steer * 0.05 * Math.abs(this.speed) / 10 - this.bank) * Math.min(1, dt * 6);
      this.car.wheels.forEach((w) => (w.children[0].rotation.x += this.speed * dt / 0.36));
      this.car.wheels.slice(0, 2).forEach((w) => (w.rotation.y = -ax.x * 0.4));
      this.game.audio.setEngine(0.4 + Math.abs(this.speed) / 30, Math.abs(this.speed) / 20);
    } else {
      // flight
      let yawIn = -look.x * 0.0016 - ax.x * 1.1 * dt;
      let pitchIn = -look.y * 0.0016;
      if (xr) { yawIn = -input.xr.look.x * 1.3 * dt; pitchIn = -input.xr.look.y * 1.0 * dt; }
      this.yaw += yawIn;
      this.pitch = clamp(this.pitch + pitchIn, -1.25, 1.25);
      const max = boosting ? 190 : 70;
      const target = ax.y > 0 ? max * ax.y : ax.y < 0 ? -15 : this.speed * 0.985;
      this.speed += clamp(target - this.speed, -60 * dt, (boosting ? 90 : 40) * dt);
      let v = 0;
      if (allowInput && input.down('Space')) v += 1;
      if (allowInput && (input.down('ControlLeft') || input.down('KeyC'))) v -= 1;
      this.vert += (v * 25 - this.vert) * Math.min(1, dt * 4);
      const fwd = this.forward();
      const p = this.car.group.position;
      p.addScaledVector(fwd, this.speed * dt);
      p.y += this.vert * dt;
      const turn = yawIn / Math.max(dt, 1e-3);
      this.bank += (clamp(turn * 0.35, -0.7, 0.7) - this.bank) * Math.min(1, dt * 3);
      this.boost += ((boosting && this.speed > 60 ? 1 : 0) - this.boost) * Math.min(1, dt * 3);
      this.car.setThrust(clamp(this.speed / 80, 0, 1) + this.boost * 0.5);
      this.game.audio.setEngine(0.5 + this.speed / 120, 0.4 + this.speed / 90);
    }
    this._apply();
  }

  updateCamera(dt) {
    const { engine } = this.game;
    const cam = engine.camera;
    const g = this.car.group;
    if (engine.renderer.xr.isPresenting) {
      engine.rig.position.copy(g.position).add(new THREE.Vector3(0, 0.55, -0.2).applyQuaternion(g.quaternion));
      engine.rig.quaternion.copy(g.quaternion);
      engine.rig.rotateY(Math.PI);
      return;
    }
    engine.rig.position.set(0, 0, 0);
    engine.rig.quaternion.identity();
    let offset, look;
    if (this.mode === 'ground') {
      offset = new THREE.Vector3(-Math.sin(this.yaw) * 8.5, 3.4, -Math.cos(this.yaw) * 8.5);
      look = g.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 4, 1.4, Math.cos(this.yaw) * 4));
      this._cam.copy(g.position).add(offset);
      const gh = this.game.world.groundAt(this._cam.x, this._cam.z);
      if (gh !== null && gh !== undefined) this._cam.y = Math.max(this._cam.y, gh + 1);
      cam.position.lerp(this._cam, Math.min(1, dt * 6));
    } else {
      // position locked to the car; only the viewing angle lags, so the car never shrinks away at speed
      if (!this._camQ) this._camQ = g.quaternion.clone();
      this._camQ.slerp(g.quaternion, Math.min(1, dt * 4));
      const dist = 9.5 + this.boost * 2.5;
      offset = new THREE.Vector3(0, 2.8, -dist).applyQuaternion(this._camQ);
      look = g.position.clone().add(new THREE.Vector3(0, 1.2, 14).applyQuaternion(this._camQ));
      cam.position.copy(g.position).add(offset);
      const fov = 62 + clamp(this.speed / 190, 0, 1) * 16 + this.boost * 6;
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
      cam.updateProjectionMatrix();
    }
    if (this.shake > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake));
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
  }
}
