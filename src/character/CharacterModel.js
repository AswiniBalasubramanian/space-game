import * as THREE from 'three';
import { toon, outline, glow } from '../render/toon.js';

// Procedural anime-style people built from soft primitives: big heads, big
// eyes, rounded limbs, ink outlines. Presets cover the player explorers, Mom
// and every NPC in the three worlds.

export const PRESETS = {
  female: { skin: '#ffe0cc', hair: '#3b2a36', hairStyle: 'bun', top: '#f7f3ea', accent: '#f2703c', pants: '#dfe6f0', boots: '#6b4a3a', eye: '#3a4a7a', scarf: '#f2703c', pack: true },
  male: { skin: '#f6d2b8', hair: '#2d2a3a', hairStyle: 'spiky', top: '#f7f3ea', accent: '#a9203e', pants: '#d8dfe9', boots: '#5a3f33', eye: '#2c3a5a', scarf: '#f2703c', pack: true },
  mother: { skin: '#f7dcc8', hair: '#6a4a3e', hairStyle: 'long', top: '#e9c9c9', accent: '#c98f8f', pants: '#e9c9c9', boots: '#e9c9c9', eye: '#4a3a3a' },
  farmer: { skin: '#e8b98f', hair: '#9a9a9a', hairStyle: 'short', top: '#8fae5a', accent: '#c9a45a', pants: '#6a7fa6', boots: '#5a3f33', eye: '#2c2a2a', hat: 'straw', beard: true },
  farmhand: { skin: '#f0c9a0', hair: '#7a4a2a', hairStyle: 'short', top: '#e8d7a0', accent: '#b8683a', pants: '#7a8fb0', boots: '#5a3f33', eye: '#2c2a2a', hat: 'straw' },
  scholar: { skin: '#f6d8c4', hair: '#c9d6f0', hairStyle: 'long', top: '#f5f1ea', accent: '#d8b35a', pants: '#f5f1ea', boots: '#b89a5a', eye: '#3a5a8a', robe: true },
  citizen: { skin: '#f3d3be', hair: '#e8c070', hairStyle: 'short', top: '#dfe8f6', accent: '#d8b35a', pants: '#b8c6e0', boots: '#8a7a6a', eye: '#3a4a6a', robe: true },
  child: { skin: '#f7d6c0', hair: '#4a3a2a', hairStyle: 'short', top: '#7d8fb8', accent: '#e8a05a', pants: '#5a607a', boots: '#4a3a33', eye: '#2c2a3a', child: true },
  childGirl: { skin: '#f0cdb4', hair: '#2a2a3a', hairStyle: 'bun', top: '#b87d8f', accent: '#f0d27a', pants: '#5a4a6a', boots: '#4a3a33', eye: '#2c2a3a', child: true },
  elder: { skin: '#d9a883', hair: '#e8e2da', hairStyle: 'bun', top: '#9a7a5a', accent: '#c96a3a', pants: '#7a6a5a', boots: '#4a3a33', eye: '#2c2a2a', robe: true },
  villager: { skin: '#d6a07a', hair: '#3a2a22', hairStyle: 'short', top: '#a88a6a', accent: '#8a5a3a', pants: '#6a5a4a', boots: '#4a3a33', eye: '#2c2a2a' },
};

function limb(radius, length, mat) {
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat);
  m.position.y = -length / 2 - radius * 0.5;
  m.castShadow = true;
  pivot.add(m);
  pivot.userData.mesh = m;
  return pivot;
}

export class CharacterModel {
  constructor(presetName = 'female', overrides = {}) {
    const p = { ...PRESETS[presetName], ...overrides };
    this.p = p;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const S = p.child ? 0.72 : 1;
    this.body.scale.setScalar(S);
    this.phase = 0; this.speed = 0; this.pose = 'stand'; this.t = Math.random() * 10;

    const skin = toon(p.skin), top = toon(p.top), pants = toon(p.pants), boots = toon(p.boots), hair = toon(p.hair), accent = toon(p.accent);

    // torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.8;
    this.body.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.34, 4, 12), top);
    chest.scale.set(1, 1, 0.78); chest.position.y = 0.2; chest.castShadow = true;
    this.torso.add(chest);
    this.chest = chest;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 14), accent);
    belt.scale.z = 0.8; belt.position.y = 0.0;
    this.torso.add(belt);
    if (p.robe) {
      const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.7, 14, 1, true), top);
      robe.material = toon(p.top, { side: THREE.DoubleSide });
      robe.position.y = -0.3;
      this.torso.add(robe);
    }
    // jacket stripe (explorer suit accents like the astronaut reference)
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.022, 6, 20), accent);
    stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.32; stripe.scale.set(1, 0.8, 1);
    this.torso.add(stripe);

    if (p.scarf) {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.055, 8, 16), toon(p.scarf));
      scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.5;
      this.torso.add(scarf);
      this.scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.03), toon(p.scarf));
      this.scarfTail.geometry.translate(0, -0.17, 0);
      this.scarfTail.position.set(0.08, 0.5, -0.16);
      this.torso.add(this.scarfTail);
    }
    if (p.pack) {
      const pack = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.22, 4, 8), toon('#cfc6b8'));
      pack.position.set(0, 0.2, -0.22);
      this.torso.add(pack);
      this.coreSlots = [];
      for (let i = 0; i < 3; i++) {
        const slot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glow('#3a4a5a'));
        slot.position.set(-0.07 + i * 0.07, 0.34, -0.34);
        slot.userData.noOutline = true;
        this.torso.add(slot);
        this.coreSlots.push(slot);
      }
    }

    // head
    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8), skin);
    neck.position.y = -0.1;
    this.head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), skin);
    skull.scale.set(1, 1.02, 0.96); skull.position.y = 0.2; skull.castShadow = true;
    this.head.add(skull);
    this.face = new THREE.Group();
    this.face.position.set(0, 0.17, 0.235);
    this.head.add(this.face);
    this.buildFace(p);
    this.buildHair(p, hair);
    if (p.hat === 'straw') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.03, 20), toon('#e8cf7a'));
      brim.position.y = 0.4;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.2, 16), toon('#e8cf7a'));
      crown.position.y = 0.5;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.05, 16), toon('#a9203e'));
      band.position.y = 0.43;
      this.head.add(brim, crown, band);
    }

    // limbs
    this.armL = limb(0.075, 0.46, top); this.armL.position.set(0.31, 0.44, 0);
    this.armR = limb(0.075, 0.46, top); this.armR.position.set(-0.31, 0.44, 0);
    for (const a of [this.armL, this.armR]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skin);
      hand.position.y = -0.62;
      a.add(hand);
      a.rotation.z = a === this.armL ? 0.12 : -0.12;
      this.torso.add(a);
    }
    this.legL = limb(0.095, 0.46, pants); this.legL.position.set(0.12, 0.0, 0);
    this.legR = limb(0.095, 0.46, pants); this.legR.position.set(-0.12, 0.0, 0);
    for (const l of [this.legL, this.legR]) {
      const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.12, 4, 8), boots);
      boot.rotation.x = Math.PI / 2; boot.position.set(0, -0.68, 0.05);
      l.add(boot);
      this.torso.add(l);
    }
    outline(this.body, 0.014);
    this.root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) o.castShadow = true; });
  }

  buildFace(p) {
    const eyeMat = toon(p.eye);
    const white = glow('#ffffff');
    this.eyes = [];
    this.closedEyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(0.095 * s, 0.0, 0.0);
      eye.rotation.y = 0.32 * s;
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), eyeMat);
      iris.scale.set(0.82, 1.18, 0.35);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), white);
      hl.position.set(0.018 * s, 0.026, 0.018);
      const hl2 = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), white);
      hl2.position.set(-0.014 * s, -0.022, 0.018);
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 4, 12, Math.PI * 0.9), toon('#2a2230'));
      lash.position.set(0, 0.012, 0.006); lash.rotation.z = Math.PI * 0.05;
      for (const m of [iris, hl, hl2, lash]) m.userData.noOutline = true;
      eye.add(iris, hl, hl2, lash);
      this.face.add(eye);
      this.eyes.push(eye);
      const closed = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.008, 4, 12, Math.PI), toon('#3a2a2a'));
      closed.rotation.z = Math.PI; closed.position.copy(eye.position); closed.position.y += 0.005; closed.position.z += 0.005;
      closed.rotation.y = 0.32 * s; closed.visible = false; closed.userData.noOutline = true;
      this.face.add(closed);
      this.closedEyes.push(closed);
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6), glow('#ff9f9f', 0.45));
      blush.scale.set(1.3, 0.55, 0.3); blush.position.set(0.14 * s, -0.07, -0.012); blush.rotation.y = 0.5 * s;
      blush.userData.noOutline = true;
      this.face.add(blush);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 4, 10, Math.PI), toon('#8a3a3a'));
    mouth.rotation.z = Math.PI; mouth.position.set(0, -0.1, 0.012); mouth.userData.noOutline = true;
    this.face.add(mouth);
    this.mouth = mouth;
  }

  buildHair(p, hair) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.position.y = 0.22; cap.rotation.x = -0.25; cap.scale.set(1, 1, 1.02);
    this.head.add(cap);
    // fringe
    for (let i = -2; i <= 2; i++) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 6), hair);
      b.position.set(i * 0.075, 0.33, 0.2); b.rotation.set(Math.PI * 0.78, 0, i * 0.18);
      this.head.add(b);
    }
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), hair);
    back.position.set(0, 0.2, -0.06); back.scale.set(1.02, 1.0, 0.95);
    this.head.add(back);
    if (p.hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), hair);
      bun.position.set(0, 0.4, -0.2);
      this.head.add(bun);
    } else if (p.hairStyle === 'spiky') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), hair);
        s.position.set(Math.cos(a) * 0.17, 0.42, Math.sin(a) * 0.17 - 0.04);
        s.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        this.head.add(s);
      }
    } else if (p.hairStyle === 'long') {
      const fall = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 4, 10), hair);
      fall.position.set(0, -0.05, -0.12); fall.scale.set(1.25, 1, 0.6);
      this.head.add(fall);
    }
    if (p.beard) {
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), hair);
      beard.position.set(0, 0.04, 0.14); beard.scale.set(1.1, 0.7, 0.7);
      this.head.add(beard);
    }
  }

  setEyesClosed(closed) {
    this.eyes.forEach((e) => (e.visible = !closed));
    this.closedEyes.forEach((e) => (e.visible = closed));
  }

  setCores(n) {
    if (!this.coreSlots) return;
    this.coreSlots.forEach((s, i) => s.material = glow(i < n ? '#9ff4ff' : '#3a4a5a'));
  }

  setPose(pose) { this.pose = pose; }

  update(dt, speed = 0) {
    this.t += dt;
    this.speed = speed;
    const k = Math.min(1, speed / 6);
    this.phase += dt * (4 + speed * 1.7);
    const s = Math.sin(this.phase);
    const reset = (o, x = 0, z = null) => { o.rotation.x = x; if (z !== null) o.rotation.z = z; };
    const breath = Math.sin(this.t * 1.6) * 0.012;

    if (this.pose === 'sit') {
      reset(this.legL, -1.45); reset(this.legR, -1.45);
      reset(this.armL, -0.6, 0.1); reset(this.armR, -0.6, -0.1);
      this.torso.position.y = 0.45;
      this.torso.rotation.x = 0;
      this.chest.scale.y = 1 + breath;
      this.head.rotation.x = Math.sin(this.t * 0.7) * 0.04;
      return;
    }
    if (this.pose === 'lie') {
      reset(this.legL, 0); reset(this.legR, 0);
      reset(this.armL, 0, 0.18); reset(this.armR, 0, -0.18);
      this.torso.position.y = 0.8;
      this.chest.scale.y = 1 + Math.sin(this.t * (this.calm ? 1.3 : 2.6)) * (this.calm ? 0.03 : 0.045);
      return;
    }
    if (this.pose === 'harvest' || this.pose === 'work') {
      const w = Math.sin(this.t * 6);
      reset(this.armL, -1.2 + w * 0.4, 0.1); reset(this.armR, -1.2 - w * 0.4, -0.1);
      this.torso.rotation.x = 0.35;
      reset(this.legL, -0.2); reset(this.legR, 0.1);
      this.torso.position.y = 0.74;
      return;
    }
    if (this.pose === 'cheer') {
      const w = Math.abs(Math.sin(this.t * 5));
      reset(this.armL, 0, 2.6 + w * 0.3); reset(this.armR, 0, -2.6 - w * 0.3);
      this.torso.position.y = 0.8 + w * 0.08;
      this.torso.rotation.x = 0;
      reset(this.legL, 0); reset(this.legR, 0);
      return;
    }
    this.torso.rotation.x = k * 0.08;
    this.torso.position.y = 0.8 + Math.abs(s) * 0.05 * k + breath;
    this.legL.rotation.x = s * 0.75 * k;
    this.legR.rotation.x = -s * 0.75 * k;
    this.armL.rotation.x = -s * 0.6 * k;
    this.armR.rotation.x = s * 0.6 * k;
    this.armL.rotation.z = 0.12 + (1 - k) * Math.sin(this.t * 1.6) * 0.02;
    this.armR.rotation.z = -0.12 - (1 - k) * Math.sin(this.t * 1.6) * 0.02;
    this.head.rotation.x = 0;
    if (this.scarfTail) this.scarfTail.rotation.x = -0.3 - k * 0.9 + Math.sin(this.t * 8) * 0.12 * k;
    // occasional blink
    const blink = (this.t % 4.2) < 0.12;
    if (!this.forceClosed) this.eyes.forEach((e) => (e.scale.y = blink ? 0.15 : 1));
  }
}
