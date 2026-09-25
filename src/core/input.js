// Keyboard / mouse / pointer-lock / WebXR gamepad input, unified into actions.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.look = { x: 0, y: 0 };
    this.dragging = false;
    this.locked = false;
    this.wheel = 0;
    this.enabled = true;
    this.xr = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, trigger: false, grip: false, a: false, b: false };
    this._xrPrev = { trigger: false, a: false, b: false, grip: false, stickNav: 0 };

    addEventListener('keydown', (e) => {
      if (this._typing(e)) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      if (this.wantsLock && !this.locked) {
        try {
          const p = canvas.requestPointerLock?.();
          if (p && p.catch) p.catch(() => {});
        } catch { /* pointer lock unavailable (e.g. sandboxed iframe) — drag-to-look still works */ }
      }
      if (e.button === 0) this.pressed.add('Mouse0');
    });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.look.x += e.movementX || 0;
        this.look.y += e.movementY || 0;
      }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });

    // Touch: drag anywhere to look; the on-screen stick is handled by the HUD.
    this.touchMove = { x: 0, y: 0 };
    let last = null;
    canvas.addEventListener('touchstart', (e) => { last = e.touches[0]; }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (last) { this.look.x += (t.clientX - last.clientX) * 2; this.look.y += (t.clientY - last.clientY) * 2; }
      last = t;
    }, { passive: true });
    canvas.addEventListener('touchend', () => { last = null; }, { passive: true });

    this.wantsLock = false;
  }

  _typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  }

  setPointerLock(want) {
    this.wantsLock = want;
    if (!want && document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }

  /** Interaction action: E, or XR trigger / A button. */
  interact() { return this.hit('KeyE') || this.xrHit('trigger') || this.xrHit('a'); }
  confirm() { return this.hit('KeyE') || this.hit('Space') || this.hit('Enter') || this.hit('Mouse0') || this.xrHit('trigger') || this.xrHit('a'); }
  run() { return this.down('ShiftLeft') || this.down('ShiftRight') || this.xr.grip; }

  axis() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.xr.move.x + this.touchMove.x;
    y += this.xr.move.y + this.touchMove.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = 0; this.look.y = 0;
    if (!this.enabled) return { x: 0, y: 0 };
    return l;
  }

  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  xrHit(btn) { return this.enabled && this._xrEdges?.[btn]; }

  /** Poll XR controllers; called once per frame by the engine when presenting. */
  pollXR(session) {
    const xr = this.xr;
    xr.move.x = xr.move.y = xr.look.x = xr.look.y = 0;
    xr.trigger = xr.grip = xr.a = xr.b = false;
    if (session) {
      for (const src of session.inputSources) {
        const gp = src.gamepad;
        if (!gp) continue;
        const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
        const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
        if (src.handedness === 'left') {
          xr.move.x = dz(ax[0]);
          xr.move.y = -dz(ax[1]);
          if (gp.buttons[1]?.pressed) xr.grip = true;
        } else {
          xr.look.x = dz(ax[0]);
          xr.look.y = dz(ax[1]);
          if (gp.buttons[0]?.pressed) xr.trigger = true;
          if (gp.buttons[4]?.pressed) xr.a = true;
          if (gp.buttons[5]?.pressed) xr.b = true;
        }
      }
    }
    const p = this._xrPrev;
    const nav = xr.look.y > 0.6 ? 1 : xr.look.y < -0.6 ? -1 : 0;
    this._xrEdges = {
      trigger: xr.trigger && !p.trigger,
      a: xr.a && !p.a,
      b: xr.b && !p.b,
      navDown: nav === 1 && p.stickNav !== 1,
      navUp: nav === -1 && p.stickNav !== -1,
    };
    p.trigger = xr.trigger; p.a = xr.a; p.b = xr.b; p.stickNav = nav;
  }

  endFrame() {
    this.pressed.clear();
    if (this._xrEdges) for (const k in this._xrEdges) this._xrEdges[k] = false;
  }
}
