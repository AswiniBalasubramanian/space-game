import './admin.css';
import { SaveSystem, newState } from '../save/SaveSystem.js';
import { ITEMS, WORLDS, NPCS, MISSIONS, WORLD_MISSION, LESSONS, loadConfig, saveConfig, mission } from '../data/content.js';

// Admin console — kept entirely separate from the immersive game UI.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STAGES = ['talk', 'map', 'leave', 'space', 'cores', 'car', 'home', 'machine', 'done'];
const WORLD_MISSIONS = Object.values(WORLD_MISSION);

document.querySelectorAll('nav button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === `tab-${b.dataset.tab}`));
});

function players() { return SaveSystem.list(); }

function renderDash() {
  const ps = players();
  const week = Date.now() - 7 * 864e5;
  const active = ps.filter((p) => p.updatedAt > week).length;
  const discovered = new Set(ps.flatMap((p) => p.story?.worldsDiscovered ?? []));
  const missionsDone = ps.reduce((n, p) => n + WORLD_MISSIONS.filter((m) => p.missions?.[m]?.status === 'complete').length, 0);
  const cores = ps.reduce((n, p) => n + WORLD_MISSIONS.filter((m) => p.missions?.[m]?.status === 'complete').length, 0);
  const metric = (k, v, s) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  $('#metrics').innerHTML = [
    metric('Active players', active, `${ps.length} total profiles`),
    metric('Worlds discovered', `${discovered.size} / 3`, 'across all players'),
    metric('Missions completed', missionsDone, `${ps.filter((p) => p.story?.finale).length} journeys finished`),
    metric('Oxygen cores collected', cores, 'earned from missions'),
  ].join('');
  const steps = [
    ['Started', (p) => true],
    ['Left home', (p) => STAGES.indexOf(p.story?.stage) >= 3],
    ['Farm World helped', (p) => p.missions?.harvestDay?.status === 'complete'],
    ['Knowledge World helped', (p) => p.missions?.shareKnowledge?.status === 'complete'],
    ['Hunger World helped', (p) => p.missions?.feedWorld?.status === 'complete'],
    ['Mom saved', (p) => !!p.story?.finale],
  ];
  $('#funnel').innerHTML = ps.length ? steps.map(([label, f]) => {
    const n = ps.filter(f).length;
    return `<div class="funnel-row"><span>${label}</span><div class="bar"><i style="width:${(n / ps.length) * 100}%"></i></div><b>${n}</b></div>`;
  }).join('') : '<p class="empty">No players yet — open the game and start a journey.</p>';
}

function renderPlayers() {
  const ps = players();
  const t = $('#players');
  if (!ps.length) { t.innerHTML = '<tr><td class="empty">No saved profiles on this device.</td></tr>'; return; }
  t.innerHTML = `<tr><th>Player</th><th>Character</th><th>World</th><th>Story</th><th>Cores</th><th>Missions</th><th>Play time</th><th>Last seen</th><th></th></tr>` +
    ps.map((p) => {
      const done = WORLD_MISSIONS.filter((m) => p.missions?.[m]?.status === 'complete').length;
      return `<tr>
        <td><b>${esc(p.nickname)}</b></td>
        <td>${esc(p.character)}</td>
        <td>${esc(WORLDS[p.currentWorld]?.name ?? p.currentWorld)}</td>
        <td><span class="pill ${p.story?.finale ? 'done' : 'active'}">${esc(p.story?.stage)}</span></td>
        <td class="num">${p.inventory?.oxygenCore ?? 0} / 3</td>
        <td class="num">${done} / 3</td>
        <td class="num">${Math.round((p.stats?.playSeconds ?? 0) / 60)} min</td>
        <td>${new Date(p.updatedAt).toLocaleString()}</td>
        <td class="actions"><button data-edit="${esc(p.nickname)}">Edit</button><button data-reset="${esc(p.nickname)}">Reset</button><button class="danger" data-del="${esc(p.nickname)}">Delete</button></td>
      </tr>`;
    }).join('');
  t.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEditor(b.dataset.edit));
  t.querySelectorAll('[data-reset]').forEach((b) => b.onclick = () => {
    if (!confirm(`Reset all progress for ${b.dataset.reset}?`)) return;
    const p = SaveSystem.load(b.dataset.reset);
    SaveSystem.save(newState(p.nickname, p.character));
    refresh();
  });
  t.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    if (!confirm(`Delete ${b.dataset.del}? This cannot be undone.`)) return;
    SaveSystem.remove(b.dataset.del);
    $('#editor').classList.add('hidden');
    refresh();
  });
}

function openEditor(nick) {
  const p = SaveSystem.load(nick);
  const ed = $('#editor');
  ed.classList.remove('hidden');
  const opt = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
  ed.innerHTML = `
    <h2>Edit ${esc(p.nickname)}</h2>
    <form id="edit-form">
      <fieldset><legend>Profile</legend>
        <label class="f">Character <select name="character">${opt([['female', 'Female explorer'], ['male', 'Male explorer']], p.character)}</select></label>
        <label class="f">Current world <select name="currentWorld">${opt(Object.entries(WORLDS).map(([k, w]) => [k, w.name]), p.currentWorld)}</select></label>
        <label class="f">Story stage <select name="stage">${opt(STAGES.map((s) => [s, s]), p.story.stage)}</select></label>
      </fieldset>
      <fieldset><legend>Missions</legend>
        ${WORLD_MISSIONS.map((m) => `<label class="f">${MISSIONS[m].title} <select name="m_${m}">${opt([['inactive', 'Not started'], ['active', 'In progress'], ['complete', 'Complete']], p.missions?.[m]?.status ?? 'inactive')}</select></label>`).join('')}
      </fieldset>
      <fieldset><legend>Inventory</legend>
        ${Object.entries(ITEMS).map(([k, it]) => `<label class="f">${it.icon} ${it.name} <input type="number" min="0" max="99" name="i_${k}" value="${p.inventory?.[k] ?? 0}"></label>`).join('')}
      </fieldset>
      <div class="form-actions"><button class="btn primary" type="submit">Save changes</button><button class="btn" type="button" id="ed-cancel">Close</button></div>
    </form>`;
  $('#ed-cancel').onclick = () => ed.classList.add('hidden');
  $('#edit-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    p.character = f.get('character');
    p.currentWorld = f.get('currentWorld');
    p.story.stage = f.get('stage');
    for (const m of WORLD_MISSIONS) {
      const st = f.get(`m_${m}`);
      p.missions[m] = { ...(p.missions[m] ?? {}), status: st, stage: st === 'complete' ? 'done' : st === 'active' ? (p.missions[m]?.stage ?? 'talk') : null };
    }
    for (const k of Object.keys(ITEMS)) p.inventory[k] = Math.max(0, +f.get(`i_${k}`) || 0);
    p.story.worldsDiscovered = [...new Set([...(p.story.worldsDiscovered ?? []), ...Object.entries(WORLD_MISSION).filter(([, m]) => p.missions[m].status !== 'inactive').map(([w]) => w)])];
    SaveSystem.save(p);
    refresh();
    ed.classList.add('hidden');
  };
  ed.scrollIntoView({ behavior: 'smooth' });
}

function renderTuning() {
  const cfg = loadConfig();
  const fields = {
    harvestDay: [['target', 'Crops to deliver'], ['carry', 'Carry capacity']],
    feedWorld: [['wood', 'Wood needed'], ['stone', 'Stone needed'], ['fish', 'Fish to catch']],
  };
  $('#tuning').innerHTML = Object.entries(fields).map(([id, fs]) => `
    <fieldset><legend>${MISSIONS[id].title}</legend>
      ${fs.map(([k, l]) => `<label class="f">${l} <input type="number" min="1" max="40" name="${id}.${k}" value="${mission(id)[k]}"></label>`).join('')}
      <p class="muted">${esc(MISSIONS[id].description)}</p>
    </fieldset>`).join('') + `
    <fieldset><legend>${MISSIONS.shareKnowledge.title}</legend><p class="muted">${esc(MISSIONS.shareKnowledge.description)} Three children, one lesson each (see Worlds &amp; NPCs).</p></fieldset>
    <div class="form-actions"><button class="btn primary" type="submit">Save tuning</button><button class="btn" type="button" id="tune-reset">Restore defaults</button></div>`;
  $('#tuning').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const next = { ...cfg, missions: {} };
    for (const [key, v] of f.entries()) {
      const [id, k] = key.split('.');
      next.missions[id] ??= {};
      next.missions[id][k] = Math.max(1, +v || 1);
    }
    saveConfig(next);
    alert('Saved. New values apply when a player next enters that world.');
  };
  $('#tune-reset').onclick = () => { saveConfig({}); renderTuning(); };
  $('#items').innerHTML = `<tr><th>Item</th><th>Used in</th></tr>` + Object.entries(ITEMS).map(([k, it]) => `<tr><td>${it.icon} ${it.name}</td><td>${{
    oxygenCore: 'Reward for each world\'s mission · 3 restore Mom\'s machine', crops: 'Harvest Day', books: 'Share Knowledge', wood: 'Feed the World (dock + fire)', stone: 'Feed the World (dock)', fish: 'Feed the World', food: 'Feed the World (delivered)',
  }[k]}</td></tr>`).join('');
}

function renderWorlds() {
  $('#worlds').innerHTML = `<tr><th>World</th><th>Portal</th><th>Mood</th><th>Mission</th></tr>` + Object.entries(WORLDS).map(([k, w]) => `<tr><td><b>${w.name}</b></td><td>${w.hole ?? '—'}</td><td>${w.mood}</td><td>${WORLD_MISSION[k] ? MISSIONS[WORLD_MISSION[k]].title : k === 'home' ? MISSIONS.findOxygen.title : '—'}</td></tr>`).join('');
  $('#npcs').innerHTML = `<tr><th>NPC</th><th>World</th><th>Model</th></tr>` + Object.values(NPCS).map((n) => `<tr><td><b>${n.name}</b></td><td>${WORLDS[n.world].name}</td><td>${n.preset}</td></tr>`).join('');
  $('#lessons').innerHTML = `<tr><th>Child</th><th>Question</th><th>Answer</th></tr>` + LESSONS.map((l) => `<tr><td>${NPCS[l.child].name}</td><td>${esc(l.q)}</td><td>${esc(l.options[l.answer])}</td></tr>`).join('');
}

$('#btn-export').onclick = () => {
  const blob = new Blob([JSON.stringify({ profiles: SaveSystem.raw(), config: loadConfig() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'astra-players.json'; a.click();
};
$('#file-import').onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.profiles) SaveSystem.replaceAll(data.profiles);
    if (data.config) saveConfig(data.config);
    refresh();
  } catch { alert('That file is not a valid Astra export.'); }
};

function refresh() { renderDash(); renderPlayers(); }
refresh(); renderTuning(); renderWorlds();
addEventListener('storage', refresh);
