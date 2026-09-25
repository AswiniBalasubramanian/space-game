// Short, natural NPC dialogue with typewriter text, plus multiple-choice
// prompts used for the Knowledge World lessons. Advances with E / Space /
// click, or the XR trigger.
export class DialogueSystem {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('dialogue');
    this.whoEl = this.el.querySelector('.who');
    this.textEl = this.el.querySelector('.text');
    this.optsEl = this.el.querySelector('.options');
    this.active = false;
    this.el.addEventListener('click', (e) => { if (!e.target.closest('button')) this.next(); });
  }

  say(lines) {
    this.lines = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
    this.index = -1;
    this.full = true; // no line is typing yet
    this.active = true;
    this.el.classList.add('show');
    this.optsEl.innerHTML = '';
    return new Promise((resolve) => { this.resolve = resolve; this.next(); });
  }

  choose({ who, text, options }) {
    this.active = true;
    this.choosing = true;
    this.el.classList.add('show');
    this.show({ who, text });
    this.full = true; this.shown = text.length;
    this.textEl.textContent = text;
    this.optsEl.innerHTML = '';
    this.selected = 0;
    return new Promise((resolve) => {
      this.pick = (i) => {
        this.choosing = false; this.active = false;
        this.el.classList.remove('show');
        this.optsEl.innerHTML = '';
        this.game.audio?.chime(i === -1 ? 0 : 1);
        resolve(i);
      };
      options.forEach((o, i) => {
        const b = document.createElement('button');
        b.innerHTML = `<span>${i + 1}</span>${o}`;
        b.onclick = () => this.pick(i);
        this.optsEl.appendChild(b);
      });
      this.options = options;
      this.highlight();
    });
  }

  show(line) {
    this.cur = line;
    const who = line.who ?? '';
    this.whoEl.textContent = who;
    this.whoEl.style.display = who ? '' : 'none';
    this.el.classList.toggle('narration', !who);
    this.text = line.text;
    this.shown = 0; this.full = false;
    this.textEl.textContent = '';
    this.mirror();
  }

  next() {
    if (!this.active || this.choosing) return;
    if (!this.full) { this.shown = this.text.length; this.full = true; this.textEl.textContent = this.text; this.mirror(); return; }
    this.index++;
    if (this.index >= this.lines.length) {
      this.active = false;
      this.el.classList.remove('show');
      this.game.xrPanel?.setDialogue(null);
      const r = this.resolve; this.resolve = null; r?.();
      return;
    }
    this.game.audio?.blip();
    this.show(this.lines[this.index]);
  }

  mirror() {
    this.game.xrPanel?.setDialogue({ who: this.cur?.who, text: this.text, options: this.choosing ? this.options : null, selected: this.selected });
  }

  update(dt, input) {
    if (!this.active) return;
    if (this.choosing) {
      for (let i = 0; i < 4; i++) if (input.hit(`Digit${i + 1}`) && i < this.options.length) return this.pick(i);
      // XR / keyboard selection
      const dy = (input.hit('ArrowDown') || input.hit('KeyS') ? 1 : 0) - (input.hit('ArrowUp') || input.hit('KeyW') ? 1 : 0);
      if (dy) { this.selected = (this.selected + dy + this.options.length) % this.options.length; this.highlight(); }
      const xy = input.xr.move.y;
      if (Math.abs(xy) > 0.7 && !this.stickHeld) { this.stickHeld = true; this.selected = (this.selected + Math.sign(xy) + this.options.length) % this.options.length; this.highlight(); }
      if (Math.abs(xy) < 0.3) this.stickHeld = false;
      if (input.hit('Enter') || input.hit('KeyE') || (input.xr.interact && !input.xr.prevInteract)) this.pick(this.selected);
      return;
    }
    if (!this.full) {
      this.shown += dt * 55;
      const n = Math.floor(this.shown);
      if (n >= this.text.length) { this.full = true; this.textEl.textContent = this.text; }
      else this.textEl.textContent = this.text.slice(0, n);
    }
    if (input.advance) this.next();
  }

  highlight() {
    [...this.optsEl.children].forEach((b, i) => b.classList.toggle('sel', i === this.selected));
    this.mirror();
  }
}
