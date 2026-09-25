import * as THREE from 'three';

// In immersive VR the DOM HUD is invisible, so dialogue, prompts, banners and
// the objective are mirrored onto a floating paper panel that lazily follows
// the headset.
export class XRPanel {
  constructor(engine) {
    this.engine = engine;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024; this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.6),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, fog: false, toneMapped: false }),
    );
    this.mesh.renderOrder = 999;
    this.mesh.visible = false;
    this.state = { dialogue: null, prompt: null, flash: null, objective: '' };
    this.tmp = new THREE.Vector3(); this.q = new THREE.Quaternion();
  }

  attach(scene) { scene.add(this.mesh); }

  setDialogue(d) { this.state.dialogue = d; this.dirty = true; }
  setPrompt(p) { this.state.prompt = p; this.dirty = true; }
  setObjective(o) { this.state.objective = o; this.dirty = true; }
  flash(text, ms = 2600) { this.state.flash = text; this.flashUntil = performance.now() + ms; this.dirty = true; }

  draw() {
    const g = this.ctx, s = this.state;
    const W = 1024, H = 512;
    g.clearRect(0, 0, W, H);
    const flash = s.flash && performance.now() < this.flashUntil ? s.flash : null;
    const has = s.dialogue || s.prompt || flash;
    this.mesh.visible = !!(has || s.objective);
    // paper card
    g.fillStyle = 'rgba(250,245,235,0.92)';
    const round = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    g.font = '600 30px "Zen Maru Gothic", sans-serif';
    g.textBaseline = 'top';
    const wrap = (text, x, y, maxW, lh) => {
      for (const para of String(text).split('\n')) {
        let line = '';
        for (const word of para.split(' ')) {
          const test = line ? line + ' ' + word : word;
          if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = word; } else line = test;
        }
        g.fillText(line, x, y); y += lh;
      }
      return y;
    };
    if (s.objective) {
      round(40, 10, W - 80, 60, 24);
      g.fillStyle = '#a9203e'; g.font = '700 24px "Zen Maru Gothic", sans-serif';
      g.fillText('◆ ' + s.objective, 64, 26);
    }
    if (has) {
      g.fillStyle = 'rgba(250,245,235,0.94)';
      round(40, 100, W - 80, 380, 36);
      g.fillStyle = '#2b2440';
      let y = 130;
      if (flash) { g.font = '700 40px "Shippori Mincho", serif'; y = wrap(flash, 80, y, W - 160, 50) + 10; }
      if (s.dialogue) {
        if (s.dialogue.who) { g.fillStyle = '#f2703c'; g.font = '700 28px "Zen Maru Gothic", sans-serif'; g.fillText(s.dialogue.who, 80, y); y += 40; }
        g.fillStyle = '#2b2440'; g.font = '500 32px "Zen Maru Gothic", sans-serif';
        y = wrap(s.dialogue.text || '', 80, y, W - 160, 42) + 8;
        s.dialogue.options?.forEach((o, i) => {
          g.fillStyle = i === s.dialogue.selected ? '#f2703c' : '#5a5570';
          g.fillText(`${i === s.dialogue.selected ? '▶' : ' '} ${o}`, 100, y); y += 40;
        });
      }
      if (s.prompt && !s.dialogue) { g.fillStyle = '#2b2440'; g.font = '700 34px "Zen Maru Gothic", sans-serif'; g.fillText(s.prompt.replace(/\[E\]/, '[Trigger]'), 80, y); }
    }
    this.tex.needsUpdate = true;
  }

  update(dt) {
    if (!this.engine.inXR) { this.mesh.visible = false; return; }
    if (this.dirty || (this.state.flash && performance.now() > this.flashUntil)) {
      if (this.state.flash && performance.now() > this.flashUntil) this.state.flash = null;
      this.dirty = false; this.draw();
    }
    const cam = this.engine.renderer.xr.getCamera();
    cam.getWorldPosition(this.tmp);
    cam.getWorldQuaternion(this.q);
    const fwd = new THREE.Vector3(0, -0.35, -1).applyQuaternion(this.q).setY(-0.35).normalize();
    const target = this.tmp.clone().addScaledVector(fwd, 1.5);
    this.mesh.position.lerp(target, 1 - Math.exp(-dt * 4));
    this.mesh.lookAt(this.tmp);
  }
}
