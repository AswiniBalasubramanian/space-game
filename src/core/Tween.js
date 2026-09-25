// Frame-driven tweens and waits. Everything cinematic in the game is built from
// these promises, so cutscenes pause/resume with the main loop.

export const Ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export class Tweens {
  constructor() { this.list = []; }

  tween(duration, onUpdate, ease = Ease.inOut) {
    return new Promise((resolve) => {
      this.list.push({ t: 0, duration: Math.max(0.0001, duration), onUpdate, ease, resolve });
    });
  }

  wait(seconds) { return this.tween(seconds, () => {}); }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t = Math.min(tw.duration, tw.t + dt);
      const k = tw.t / tw.duration;
      tw.onUpdate(tw.ease(k), k);
      if (k >= 1) { this.list.splice(i, 1); tw.resolve(); }
    }
  }

  clear() { this.list.length = 0; }
}
