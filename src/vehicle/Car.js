import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, outline, glow } from '../render/toon.js';
import { glowTexture } from '../render/textures.js';

// A rounded, vintage powder-blue car (a nod to the seaside reference) with
// fold-away wheels and warm hover thrusters for spaceflight.
export class Car {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const paint = toon('#5f93cf'), cream = toon('#f5efe0'), chrome = toon('#dfe4ea'), dark = toon('#2d3448'), glass = toon('#9fd0f0', { transparent: true, opacity: 0.75 });

    const lower = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.7, 4.2, 4, 0.3), paint);
    lower.position.y = 0.75;
    const hood = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.35, 1.5, 4, 0.16), paint);
    hood.position.set(0, 1.12, 1.25); hood.rotation.x = -0.08;
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.8, 2.0, 4, 0.3), cream);
    cabin.position.set(0, 1.45, -0.35);
    const win = new THREE.Mesh(new RoundedBoxGeometry(1.84, 0.46, 1.7, 3, 0.18), glass);
    win.position.set(0, 1.52, -0.35); win.userData.noOutline = true;
    const bumperF = new THREE.Mesh(new RoundedBoxGeometry(2.15, 0.18, 0.25, 2, 0.08), chrome);
    bumperF.position.set(0, 0.55, 2.15);
    const bumperB = bumperF.clone(); bumperB.position.z = -2.15;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.06, 4.0), toon('#f2703c'));
    stripe.position.y = 0.95; stripe.userData.noOutline = true;
    this.body.add(lower, hood, cabin, win, bumperF, bumperB, stripe);

    // lamps
    this.lamps = [];
    for (const s of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), glow('#fff2c8'));
      lamp.position.set(0.7 * s, 0.95, 2.1); lamp.userData.noOutline = true;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,190,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
      halo.scale.setScalar(1.1); lamp.add(halo);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), glow('#ff5a4a'));
      tail.position.set(0.75 * s, 0.9, -2.12); tail.userData.noOutline = true;
      this.body.add(lamp, tail);
      this.lamps.push(halo);
    }

    // wheels (fold flat for flight)
    this.wheels = [];
    const tire = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18);
    tire.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 12); hub.rotateZ(Math.PI / 2);
    for (const [x, z] of [[-1, 1.35], [1, 1.35], [-1, -1.35], [1, -1.35]]) {
      const w = new THREE.Group();
      w.position.set(x * 1.0, 0.42, z);
      const t = new THREE.Mesh(tire, dark), h = new THREE.Mesh(hub, cream);
      w.add(t, h);
      this.body.add(w);
      this.wheels.push(w);
    }

    // thrusters
    this.thrusters = [];
    for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 20), glow('#ffb46a'));
      ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.32, z); ring.userData.noOutline = true;
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,170,90,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.set(x, 0.1, z); flame.scale.setScalar(1.2);
      ring.visible = flame.visible = false;
      this.body.add(ring, flame);
      this.thrusters.push({ ring, flame });
    }
    const booster = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,190,120,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    booster.position.set(0, 0.8, -2.6); booster.scale.set(2.4, 1.6, 1);
    this.body.add(booster);
    this.booster = booster;

    // little antenna with a lantern
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), chrome);
    ant.position.set(0.6, 2.05, -1.1);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow('#f2703c'));
    bulb.position.set(0.6, 2.38, -1.1); bulb.userData.noOutline = true;
    this.body.add(ant, bulb);

    outline(this.body, 0.03);
    this.root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) { o.castShadow = true; } });
    this.flight = 0; // 0 = wheels, 1 = hover
    this.t = 0;
  }

  setFlight(k) {
    this.flight = k;
    this.wheels.forEach((w, i) => {
      w.rotation.z = (i % 2 ? -1 : 1) * k * Math.PI / 2;
      w.position.y = 0.42 + k * 0.1;
    });
    this.thrusters.forEach(({ ring, flame }) => { ring.visible = flame.visible = k > 0.3; });
  }

  update(dt, speed = 0, throttle = 0) {
    this.t += dt;
    if (this.flight < 0.5) {
      this.wheels.forEach((w) => (w.children[0].rotation.x += speed * dt / 0.42));
    }
    const pulse = 0.9 + Math.sin(this.t * 20) * 0.1;
    this.thrusters.forEach(({ flame }) => flame.scale.setScalar((0.9 + throttle * 0.8) * pulse));
    this.booster.material.opacity = this.flight * Math.min(1, 0.2 + throttle) * pulse;
    this.booster.scale.set(2.4, 1.6 + throttle * 2, 1);
    if (this.flight > 0.5) this.body.position.y = Math.sin(this.t * 2) * 0.06;
    else this.body.position.y = 0;
  }
}
