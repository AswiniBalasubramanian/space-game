// Cinematic entry: nickname → character selection (live 3D preview) → begin.
import * as THREE from 'three';
import { SaveSystem } from '../core/save.js';
import { buildCharacter } from '../systems/character.js';

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function runEntry(game) {
  return new Promise((resolve) => {
    const content = game.content;
    const root = document.createElement('div');
    root.className = 'entry';
    document.body.appendChild(root);
    const unlock = () => game.audio.unlock();
    root.addEventListener('pointerdown', unlock);
    root.addEventListener('keydown', unlock);

    let nickname = '';
    let gender = content.characters.female.enabled !== false ? 'female' : 'male';
    let outfit = content.outfits[0].id;
    let preview = null;

    const finish = (result) => {
      if (preview) preview.dispose();
      root.classList.add('fade');
      setTimeout(() => root.remove(), 1300);
      resolve(result);
    };

    const players = SaveSystem.listPlayers().sort((a, b) => (b.stats?.lastSeen || 0) - (a.stats?.lastSeen || 0)).slice(0, 3);

    function stepName() {
      root.innerHTML = `<div class="entry-inner step">
        <div class="kicker">An interactive journey</div>
        <h1>3RD WORLD</h1>
        <p class="tag">Helping others gives us the strength to save the people we love.</p>
        <label class="field-label" for="nick">What should we call you, explorer?</label>
        <input id="nick" class="nick" maxlength="18" autocomplete="off" placeholder="Your nickname" />
        <div><button class="btn primary" id="go" disabled>Continue <span>→</span></button></div>
        ${players.length ? `<div class="continue-list"><span class="field-label">Continue a journey</span>${players.map((p) => `
          <div class="continue-item" data-n="${esc(p.nickname)}"><span>${esc(p.nickname)}</span><small>${p.inventory?.oxygenCore || 0} / 3 OXYGEN · ${(content.worlds[p.currentWorld]?.name || '').toUpperCase()}</small></div>`).join('')}</div>` : ''}
      </div>
      <div class="entry-foot">WASD · MOUSE · E · SHIFT</div>`;
      const input = root.querySelector('#nick');
      const go = root.querySelector('#go');
      input.focus();
      input.oninput = () => { go.disabled = input.value.trim().length < 2; };
      const next = () => {
        nickname = input.value.trim();
        if (nickname.length < 2) return;
        const existing = SaveSystem.find(nickname);
        if (existing) { finish({ nickname: existing.nickname, resume: true }); return; }
        stepCharacter();
      };
      input.onkeydown = (e) => { if (e.key === 'Enter') next(); };
      go.onclick = next;
      root.querySelectorAll('.continue-item').forEach((el) => (el.onclick = () => finish({ nickname: el.dataset.n, resume: true })));
    }

    function stepCharacter() {
      const chars = Object.entries(content.characters).filter(([, c]) => c.enabled !== false);
      root.innerHTML = `<div class="entry-inner step">
        <div class="kicker">Choose your explorer</div>
        <div class="chars">${chars.map(([id, c]) => `<button class="char-card ${id === gender ? 'sel' : ''}" data-g="${id}"><div class="n">${esc(c.label)}</div><div class="d">${id === 'female' ? 'Steady · Curious' : 'Brave · Gentle'}</div></button>`).join('')}</div>
        <div class="preview" id="pv"></div>
        <span class="field-label">Outfit</span>
        <div class="swatches">${content.outfits.map((o) => `<span class="swatch ${o.id === outfit ? 'sel' : ''}" data-o="${o.id}" title="${esc(o.label)}" style="background:${o.top}"></span>`).join('')}</div>
        <div><button class="btn primary" id="begin">Begin the journey <span>→</span></button> <button class="btn ghost" id="back">Back</button></div>
      </div>`;
      preview = makePreview(root.querySelector('#pv'), content);
      const refresh = () => preview.set(gender, outfit);
      refresh();
      root.querySelectorAll('.char-card').forEach((b) => (b.onclick = () => {
        gender = b.dataset.g;
        root.querySelectorAll('.char-card').forEach((x) => x.classList.toggle('sel', x === b));
        refresh();
      }));
      root.querySelectorAll('.swatch').forEach((s) => (s.onclick = () => {
        outfit = s.dataset.o;
        root.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('sel', x === s));
        refresh();
      }));
      root.querySelector('#back').onclick = () => { preview.dispose(); preview = null; stepName(); };
      root.querySelector('#begin').onclick = () => finish({ nickname, character: { gender, outfit }, resume: false });
    }

    stepName();
  });
}

function makePreview(container, content) {
  const w = container.clientWidth || 400, h = container.clientHeight || 300;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(28, w / h, 0.1, 50);
  cam.position.set(0, 1.3, 4.3);
  cam.lookAt(0, 1.0, 0);
  const key = new THREE.DirectionalLight('#ffe6c8', 2.6);
  key.position.set(2, 4, 3);
  const rim = new THREE.DirectionalLight('#f2703c', 2.2);
  rim.position.set(-3, 2, -3);
  scene.add(key, rim, new THREE.HemisphereLight('#9fc8ff', '#2a1a2a', 1.3));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshBasicMaterial({ color: '#f2703c', transparent: true, opacity: 0.12 }));
  disc.rotation.x = -Math.PI / 2;
  scene.add(disc);
  let model = null, raf = 0, t = 0;
  const loop = () => {
    t += 0.016;
    if (model) {
      model.group.rotation.y = Math.sin(t * 0.5) * 0.7 + 0.3;
      model.animate(0.016, 0, t);
    }
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  };
  loop();
  return {
    set(gender, outfitId) {
      if (model) scene.remove(model.group);
      const o = content.outfits.find((x) => x.id === outfitId) || content.outfits[0];
      const c = content.characters[gender];
      model = buildCharacter({ gender, top: o.top, bottom: o.bottom, hair: c.hair, skin: c.skin, backpack: true });
      scene.add(model.group);
    },
    dispose() {
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}
