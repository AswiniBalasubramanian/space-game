// Cinematic overlays: fades, letterbox, captions, title cards, banners, warp streaks.

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const el = (cls, html = '', tag = 'div') => {
  const d = document.createElement(tag);
  d.className = cls;
  d.innerHTML = html;
  return d;
};

export class Overlay {
  constructor(root) {
    this.fadeEl = el('fade');
    this.lbTop = el('letterbox top');
    this.lbBot = el('letterbox bottom');
    this.captionEl = el('caption');
    this.titleEl = el('title-card', '<div class="lbl"></div><div class="big"></div><div class="sub"></div>');
    this.bannerEl = el('banner', '<div class="l1"></div><div class="l2"></div><div class="l3"></div>');
    this.toastEl = el('toast');
    this.streakCanvas = el('streaks', '', 'canvas');
    this.endingEl = el('ending', '<div><div class="q"></div><div class="e"></div><button class="btn interactive" style="margin-top:40px">Begin a new journey</button></div>');
    root.append(this.streakCanvas, this.lbTop, this.lbBot, this.titleEl, this.bannerEl, this.toastEl, this.captionEl, this.endingEl, this.fadeEl);
    this._streakAmt = 0;
    this._streaks = [];
    this._drawStreaks = this._drawStreaks.bind(this);
  }

  fade(opacity, ms = 800, color = '#000') {
    const f = this.fadeEl;
    f.style.background = color;
    f.style.transition = `opacity ${ms}ms ease`;
    // force style flush so the transition runs
    void f.offsetWidth;
    f.style.opacity = opacity;
    return wait(ms);
  }

  setFadeInstant(opacity, color = '#000') {
    const f = this.fadeEl;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = opacity;
    void f.offsetWidth;
  }

  letterbox(on) {
    this.lbTop.classList.toggle('on', on);
    this.lbBot.classList.toggle('on', on);
  }

  async caption(text, ms = 3000) {
    this.captionEl.textContent = text;
    this.captionEl.classList.add('on');
    await wait(ms);
    this.captionEl.classList.remove('on');
    await wait(1400);
  }

  async title(label, big, sub, ms = 4200) {
    const [l, b, s] = this.titleEl.children;
    l.textContent = label;
    b.textContent = big;
    s.textContent = sub || '';
    this.titleEl.classList.add('on');
    await wait(ms);
    this.titleEl.classList.remove('on');
  }

  async banner(l1, l2, l3 = '', ms = 3600) {
    const [a, b, c] = this.bannerEl.children;
    a.textContent = l1;
    b.textContent = l2;
    c.textContent = l3;
    this.bannerEl.classList.add('on');
    await wait(ms);
    this.bannerEl.classList.remove('on');
    await wait(900);
  }

  toast(text, ms = 2200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  /** 0..1 intensity of radial warp streaks. */
  streaks(amount) {
    this._streakAmt = amount;
    const c = this.streakCanvas;
    c.style.opacity = Math.min(1, amount * 1.4);
    if (amount > 0 && !this._raf) {
      c.width = innerWidth;
      c.height = innerHeight;
      this._raf = requestAnimationFrame(this._drawStreaks);
    }
  }

  _drawStreaks() {
    const c = this.streakCanvas, g = c.getContext('2d');
    const w = c.width, h = c.height, cx = w / 2, cy = h / 2;
    const amt = this._streakAmt;
    g.clearRect(0, 0, w, h);
    while (this._streaks.length < 260) {
      this._streaks.push({ a: Math.random() * Math.PI * 2, r: Math.random() * 0.3, v: 0.3 + Math.random() * 1.2, hue: Math.random() });
    }
    const R = Math.hypot(w, h) / 2;
    g.lineCap = 'round';
    for (const s of this._streaks) {
      s.r += s.v * 0.012 * (0.5 + amt * 3);
      if (s.r > 1.2) { s.r = Math.random() * 0.1; s.a = Math.random() * Math.PI * 2; }
      const r0 = s.r * R, r1 = r0 + (20 + amt * 260) * s.r;
      const col = s.hue < 0.2 ? '255,180,110' : s.hue < 0.35 ? '169,32,62' : '220,235,255';
      g.strokeStyle = `rgba(${col},${Math.min(1, s.r * 1.4) * amt})`;
      g.lineWidth = 1 + s.r * 2.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0);
      g.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1);
      g.stroke();
    }
    if (amt > 0.001) this._raf = requestAnimationFrame(this._drawStreaks);
    else { this._raf = null; g.clearRect(0, 0, w, h); }
  }

  ending(quote, end, onRestart) {
    const [q, e] = this.endingEl.firstChild.children;
    q.textContent = quote;
    e.textContent = end;
    const btn = this.endingEl.querySelector('button');
    btn.onclick = onRestart;
    this.endingEl.classList.add('on');
  }
}
