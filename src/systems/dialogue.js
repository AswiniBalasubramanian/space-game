// DialogueSystem: short, typed lines with optional choices and cinematic camera cues.

export class Dialogue {
  constructor(root, game) {
    this.game = game;
    const d = (this.el = document.createElement('div'));
    d.className = 'dlg';
    d.innerHTML = `<div class="dlg-box"><div class="who"></div><div class="txt"></div><div class="choices"></div><div class="next">E ▸</div></div>`;
    root.appendChild(d);
    this.whoEl = d.querySelector('.who');
    this.txtEl = d.querySelector('.txt');
    this.choicesEl = d.querySelector('.choices');
    this.nextEl = d.querySelector('.next');
    this.active = false;
    this._cur = null;
    d.addEventListener('click', () => { this._clicked = true; });
  }

  /** lines: [{ who, text, choices?: [{text, value}], cam?: {pos, target, ms}, player?: bool }] */
  async say(lines) {
    this.active = true;
    const g = this.game;
    g.input.setPointerLock(false);
    this.el.classList.add('on');
    let result = null;
    for (const line of lines) {
      if (line.cam) g.cine.to(line.cam.pos, line.cam.target, line.cam.ms ?? 1400);
      if (line.do) line.do();
      result = await this._line(line);
      if (line.choices && line.choices[result]?.value !== undefined) result = line.choices[result].value;
    }
    this.el.classList.remove('on');
    this.active = false;
    return result;
  }

  _line(line) {
    const g = this.game;
    const name = g.save.state?.nickname || 'Explorer';
    const text = line.text.replaceAll('{name}', name);
    const isPlayer = line.who === 'player';
    this.whoEl.textContent = isPlayer ? name : line.who;
    this.whoEl.classList.toggle('player', isPlayer);
    this.txtEl.textContent = '';
    this.choicesEl.innerHTML = '';
    this.nextEl.style.display = 'none';
    g.xrPanel?.dialogue(this.whoEl.textContent, text, line.choices);
    return new Promise((resolve) => {
      this._cur = { text, shown: 0, choices: line.choices, resolve, hl: 0, done: false };
      this._clicked = false;
    });
  }

  _renderChoices() {
    const c = this._cur;
    this.choicesEl.innerHTML = '';
    c.choices.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'choice' + (i === c.hl ? ' hl' : '');
      b.innerHTML = `<span class="key">${i + 1}</span><span></span>`;
      b.lastChild.textContent = ch.text;
      b.onclick = (e) => { e.stopPropagation(); this._finish(i); };
      this.choicesEl.appendChild(b);
    });
  }

  _finish(v) {
    const c = this._cur;
    if (!c) return;
    this._cur = null;
    this.game.audio.sfx('blip');
    c.resolve(v);
  }

  update(dt) {
    const c = this._cur;
    if (!c) return;
    // test hook: auto-advance (auto = true, or a function(choices) → index)
    if (this.auto) return this._finish(c.choices ? (typeof this.auto === 'function' ? this.auto(c.choices) : 0) : 0);
    const input = this.game.input;
    if (!c.done) {
      const before = Math.floor(c.shown);
      c.shown += dt * 42;
      const n = Math.floor(c.shown);
      if (n !== before && n % 3 === 0) this.game.audio.sfx('type');
      const skip = input.confirm() || this._clicked;
      this._clicked = false;
      if (skip || n >= c.text.length) {
        c.shown = c.text.length;
        c.done = true;
        if (c.choices) this._renderChoices();
        else this.nextEl.style.display = '';
      }
      this.txtEl.textContent = c.text.slice(0, Math.floor(c.shown));
      return;
    }
    if (c.choices) {
      for (let i = 0; i < c.choices.length; i++) if (input.hit('Digit' + (i + 1))) return this._finish(i);
      const nav = (input.hit('ArrowDown') || input.hit('KeyS') || input.xrHit('navDown') ? 1 : 0) - (input.hit('ArrowUp') || input.hit('KeyW') || input.xrHit('navUp') ? 1 : 0);
      if (nav) { c.hl = (c.hl + nav + c.choices.length) % c.choices.length; this._renderChoices(); }
      if (input.hit('Enter') || input.hit('Space') || input.hit('KeyE') || input.xrHit('trigger')) this._finish(c.hl);
    } else if (input.confirm() || this._clicked) {
      this._clicked = false;
      this._finish(0);
    }
  }
}
