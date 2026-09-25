// Keyboard / mouse / pointer-lock input, plus WebXR gamepad mapping into the
// same virtual axes so every controller works unchanged in VR.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.xr = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, interact: false, prevInteract: false, turn: 0, prevTurn: 0, up: false, down: false };

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    // Drag-to-look fallback when pointer lock is unavailable.
    let dragging = false;
    canvas.addEventListener('mousedown', (e) => { if (e.button === 2 || !this.canLock) dragging = true; });
    addEventListener('mouseup', () => (dragging = false));
    canvas.addEventListener('mousemove', (e) => {
      if (dragging && !this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('click', () => {
      if (this.canLock && !this.locked && this.enabled) canvas.requestPointerLock?.()?.catch?.(() => {});
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    this.canLock = true;
  }

  unlock() { if (this.locked) document.exitPointerLock?.(); }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }

  get interact() {
    return this.hit('KeyE') || this.hit('Enter') || (this.xr.interact && !this.xr.prevInteract);
  }
  get advance() {
    return this.hit('KeyE') || this.hit('Space') || this.hit('Enter') || (this.xr.interact && !this.xr.prevInteract);
  }

  // Normalised movement axes (-1..1). y = forward.
  get moveX() { return (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0) + this.xr.move.x; }
  get moveY() { return (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0) - this.xr.move.y; }
  get run() { return this.down('ShiftLeft') || this.down('ShiftRight'); }

  pollXR(session) {
    const x = this.xr;
    x.prevInteract = x.interact; x.prevTurn = x.turn;
    x.move.x = x.move.y = x.look.x = x.look.y = 0; x.interact = false; x.up = x.down = false;
    if (!session) return;
    for (const src of session.inputSources) {
      const gp = src.gamepad; if (!gp) continue;
      const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      if (src.handedness === 'left') { x.move.x = dz(ax[0]); x.move.y = dz(ax[1]); }
      else { x.look.x = dz(ax[0]); x.look.y = dz(ax[1]); }
      if (gp.buttons[0]?.pressed) x.interact = true;           // trigger
      if (src.handedness === 'right' && gp.buttons[4]?.pressed) x.up = true;   // A
      if (src.handedness === 'right' && gp.buttons[5]?.pressed) x.down = true; // B
    }
    x.turn = Math.abs(x.look.x) > 0.6 ? Math.sign(x.look.x) : 0;
  }

  get snapTurn() { return this.xr.turn !== 0 && this.xr.prevTurn === 0 ? this.xr.turn : 0; }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0; this.wheel = 0;
  }
}
