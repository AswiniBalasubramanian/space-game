import { SaveSystem } from '../save/SaveSystem.js';

// Login → nickname → character selection → "Welcome, NAME." → home.
export class EntryScreen {
  constructor(game, onStart) {
    this.game = game;
    this.onStart = onStart;
    this.el = document.getElementById('entry');
    this.login = document.getElementById('entry-login');
    this.charCard = document.getElementById('entry-char');
    this.nick = document.getElementById('nick');
    this.char = null;

    const profiles = SaveSystem.list().slice(0, 4);
    const box = document.getElementById('profiles');
    for (const p of profiles) {
      const b = document.createElement('button');
      const cores = p.inventory?.oxygenCore ?? 0;
      b.innerHTML = `Continue as <b>${escapeHtml(p.nickname)}</b> · ${cores}/3`;
      b.onclick = () => { this.nick.value = p.nickname; this.begin(); };
      box.appendChild(b);
    }
    const last = SaveSystem.last();
    if (last) this.nick.value = last.nickname;

    document.getElementById('btn-begin').onclick = () => this.begin();
    this.nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.begin(); });
    this.charCard.querySelectorAll('.char').forEach((b) => {
      b.onclick = () => {
        this.charCard.querySelectorAll('.char').forEach((x) => x.classList.toggle('sel', x === b));
        this.char = b.dataset.char;
        document.getElementById('btn-choose').disabled = false;
        game.world?.focusChar?.(this.char);
        game.audio.pick();
      };
      b.onmouseenter = () => game.world?.focusChar?.(b.dataset.char);
    });
    document.getElementById('btn-choose').onclick = () => this.finish(null);
  }

  begin() {
    const name = this.nick.value.trim();
    if (!name) { this.nick.focus(); this.nick.placeholder = 'Please enter a nickname'; return; }
    this.game.audio.init();
    this.game.audio.chime();
    const existing = SaveSystem.load(name);
    if (existing) return this.finish(existing);
    this.name = name;
    this.login.classList.add('hidden');
    this.charCard.classList.remove('hidden');
    this.game.world?.focusChar?.('both');
  }

  async finish(existing) {
    const g = this.game;
    g.audio.init();
    this.el.classList.remove('show');
    const name = existing ? existing.nickname : this.name;
    await cineText(g, `Welcome, ${name}.`, existing ? 'Your journey continues.' : 'Your journey begins at home.');
    this.onStart(existing, name, this.char);
  }
}

export async function cineText(game, l1, l2 = '', hold = 2.6) {
  const box = document.getElementById('cinetext');
  const a = box.querySelector('.l1'), b = box.querySelector('.l2');
  a.textContent = l1; b.textContent = l2;
  await game.hud.fadeTo(0.85, 1.2);
  a.classList.add('show');
  await game.tweens.wait(1.1);
  if (l2) b.classList.add('show');
  await game.tweens.wait(hold);
  a.classList.remove('show'); b.classList.remove('show');
  await game.tweens.wait(1.0);
  await game.hud.fadeTo(1, 0.6);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
