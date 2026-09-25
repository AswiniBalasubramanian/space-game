// In-headset HUD: DOM overlays don't exist in VR, so prompts and dialogue are drawn
// to a canvas panel that floats in front of the viewer.
import * as THREE from 'three';

export class XRPanel {
  constructor(game) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 384;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.41),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, toneMapped: false }),
    );
    this.mesh.position.set(0, -0.32, -1.3);
    this.mesh.rotation.x = -0.25;
    this.mesh.renderOrder = 100;
    this.mesh.visible = false;
    game.engine.camera.add(this.mesh);
    this.state = { prompt: null, who: null, text: null, choices: null, banner: null };
  }

  prompt(t) { if (this.state.prompt !== t) { this.state.prompt = t; this.draw(); } }
  dialogue(who, text, choices) { Object.assign(this.state, { who, text, choices }); this.draw(); }
  clearDialogue() { Object.assign(this.state, { who: null, text: null, choices: null }); this.draw(); }

  update() {
    const on = this.game.engine.renderer.xr.isPresenting;
    this.mesh.visible = on;
    if (on && !this.game.dialogue.active && this.state.text) this.clearDialogue();
  }

  draw() {
    if (!this.game.engine.renderer.xr.isPresenting) return;
    const g = this.canvas.getContext('2d');
    const { width: w, height: h } = this.canvas;
    g.clearRect(0, 0, w, h);
    const s = this.state;
    if (s.text) {
      g.fillStyle = 'rgba(9,10,18,0.82)';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2703c';
      g.font = '500 26px monospace';
      g.fillText((s.who || '').toUpperCase(), 40, 56);
      g.fillStyle = '#f5f1ea';
      g.font = '36px serif';
      wrap(g, s.text, 40, 110, w - 80, 44);
      if (s.choices) s.choices.forEach((c, i) => g.fillText(`${i + 1}. ${c.text}`, 60, 250 + i * 40));
    } else if (s.prompt) {
      g.fillStyle = 'rgba(9,10,18,0.6)';
      g.fillRect(w / 2 - 260, h - 90, 520, 70);
      g.fillStyle = '#f5f1ea';
      g.font = '500 32px sans-serif';
      g.textAlign = 'center';
      g.fillText(s.prompt.replace('[E]', '◉'), w / 2, h - 43);
      g.textAlign = 'left';
    }
    this.tex.needsUpdate = true;
  }
}

function wrap(g, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const t = line ? line + ' ' + word : word;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = word; y += lh; }
    else line = t;
  }
  g.fillText(line, x, y);
}
