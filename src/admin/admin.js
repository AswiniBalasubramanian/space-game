// 3rd World admin: player management, progression, and content (worlds, missions, NPCs,
// characters, rewards). Backed by Supabase and gated by an admin login: the database only
// returns everyone's data to accounts listed in the `admins` table. Kept entirely
// separate from the immersive game interface.
import './admin.css';
import { defaultState } from '../core/save.js';
import { DEFAULT_CONTENT, deepMerge } from '../data/content.js';
import { cloudEnabled, adminClient } from '../core/cloud.js';

const root = document.getElementById('admin');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WORLDS = ['home', 'space', 'farm', 'knowledge', 'hunger'];
const MISSIONS = ['find_oxygen', 'harvest_day', 'share_knowledge', 'feed_world', 'home_again'];

const sb = adminClient();
let CACHE = {}, SNAP = {}, CONFIG = {};
const fresh = () => deepMerge(structuredClone(DEFAULT_CONTENT), CONFIG);
const clean = (p) => { const { _key, _owner, _nk, ...st } = p; return st; };
const readPlayers = () => CACHE;
const readOverrides = () => CONFIG;

async function loadData() {
  const { data, error } = await sb.from('players').select('owner, nickname_key, state, updated_at').order('updated_at', { ascending: false });
  if (error) throw error;
  CACHE = {}; SNAP = {};
  for (const r of data) {
    const k = `${r.owner}:${r.nickname_key}`;
    CACHE[k] = { ...r.state, _key: k, _owner: r.owner, _nk: r.nickname_key };
    SNAP[k] = JSON.stringify(r.state);
  }
  const c = await sb.from('game_config').select('content').eq('id', 1).maybeSingle();
  CONFIG = c.data?.content || {};
  content = fresh();
}

/** Persist the players map: deletions, then any changed saves (marked as admin edits). */
async function writePlayers(all) {
  for (const k of Object.keys(SNAP)) {
    if (all[k]) continue;
    const [owner, ...nk] = k.split(':');
    const { error } = await sb.from('players').delete().eq('owner', owner).eq('nickname_key', nk.join(':'));
    if (error) return toast('Delete failed: ' + error.message);
  }
  const now = new Date().toISOString();
  for (const [k, p] of Object.entries(all)) {
    const st = clean(p), js = JSON.stringify(st);
    if (SNAP[k] === js) continue;
    const { error } = await sb.from('players').upsert({ owner: p._owner, nickname_key: p._nk, state: st, updated_at: now, admin_edited_at: now });
    if (error) return toast('Save failed: ' + error.message);
  }
  CACHE = all;
  SNAP = Object.fromEntries(Object.entries(all).map(([k, p]) => [k, JSON.stringify(clean(p))]));
}

async function saveConfig(cfg) {
  const { error } = await sb.from('game_config').update({ content: cfg, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) { toast('Save failed: ' + error.message); return false; }
  CONFIG = cfg;
  return true;
}

let tab = 'dashboard';
let content = fresh();

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 1800);
}

const ago = (ts) => {
  if (!ts) return '—';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

function metrics(players) {
  const list = Object.values(players);
  const week = Date.now() - 7 * 864e5;
  return {
    active: list.filter((p) => (p.stats?.lastSeen || 0) > week).length,
    total: list.length,
    worlds: list.reduce((n, p) => n + (p.discovered || []).filter((w) => ['farm', 'knowledge', 'hunger'].includes(w)).length, 0),
    missions: list.reduce((n, p) => n + Object.values(p.missions || {}).filter((m) => m.status === 'complete').length, 0),
    cores: list.reduce((n, p) => n + (p.cores || []).length, 0),
    finished: list.filter((p) => p.stage === 'complete').length,
  };
}

function render() {
  const players = readPlayers();
  const tabs = [['dashboard', 'Dashboard'], ['players', 'Players'], ['worlds', 'Worlds'], ['missions', 'Missions'], ['npcs', 'NPCs'], ['characters', 'Characters'], ['rewards', 'Rewards'], ['data', 'Import / Export']];
  root.innerHTML = `<div class="layout">
    <aside><div class="brand">3RD WORLD<small>Admin console</small></div>
      <nav>${tabs.map(([id, n]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${n}</button>`).join('')}</nav>
      <div class="foot">Signed in as ${esc(ADMIN_EMAIL)}<br><a href="#" id="signout">Sign out</a> · <a href="./index.html">Open the game →</a></div>
    </aside>
    <main>${VIEWS[tab](players)}</main></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); }));
  root.querySelector('#signout').onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); boot(); };
  BIND[tab]?.(players);
}

const VIEWS = {
  dashboard(players) {
    const m = metrics(players);
    const list = Object.values(players).sort((a, b) => (b.stats?.lastSeen || 0) - (a.stats?.lastSeen || 0));
    const perWorld = ['farm', 'knowledge', 'hunger'].map((w) => [w, list.filter((p) => (p.cores || []).includes(w)).length]);
    return `<h1>Dashboard</h1><div class="sub">How explorers are progressing through the three worlds.</div>
      <div class="metrics">
        <div class="metric"><div class="l">Active players</div><div class="v">${m.active}</div><div class="d">last 7 days · ${m.total} total</div></div>
        <div class="metric"><div class="l">Worlds discovered</div><div class="v">${m.worlds}</div><div class="d">across all players</div></div>
        <div class="metric"><div class="l">Missions completed</div><div class="v">${m.missions}</div><div class="d">${m.finished} journeys finished</div></div>
        <div class="metric"><div class="l">Oxygen cores</div><div class="v">${m.cores}</div><div class="d">collected in total</div></div>
      </div>
      <div class="card"><h2>Cores by world</h2>
        <table><tbody>${perWorld.map(([w, n]) => `<tr><td>${esc(content.worlds[w].name)}</td><td class="num"><span class="bar"><i style="width:${m.total ? (n / m.total) * 100 : 0}%"></i></span>${n} of ${m.total} players</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><h2>Recent players</h2>${list.length ? `<table><thead><tr><th>Player</th><th>World</th><th>Oxygen</th><th>Last seen</th></tr></thead><tbody>
        ${list.slice(0, 6).map((p) => `<tr><td>${esc(p.nickname)}</td><td>${esc(content.worlds[p.currentWorld]?.name || p.currentWorld)}</td><td class="num">${(p.cores || []).length} / 3</td><td>${ago(p.stats?.lastSeen)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No players yet — start a journey in the game.</div>'}</div>
      <div class="card"><h2>Game flow</h2><div class="flow">${['Home', 'Character', 'Car', 'Space', 'Black hole', 'World', 'Mission', 'Oxygen core', '×3', 'Return home', 'Mother'].map((s) => `<span>${s}</span>`).join('→')}</div></div>`;
  },

  players(players) {
    const list = Object.values(players).sort((a, b) => (b.stats?.lastSeen || 0) - (a.stats?.lastSeen || 0));
    return `<h1>Players</h1><div class="sub">Inspect and adjust progression for any explorer.</div>
      <div class="card">${list.length ? `<table><thead><tr><th>Player</th><th>Character</th><th>World</th><th>Stage</th><th>Oxygen</th><th>Missions</th><th>Play time</th><th>Last seen</th><th></th></tr></thead><tbody>
      ${list.map((p) => {
        const done = Object.values(p.missions || {}).filter((m) => m.status === 'complete').length;
        return `<tr><td><b>${esc(p.nickname)}</b></td><td>${esc(p.character?.gender)} · ${esc(p.character?.outfit)}</td>
          <td>${esc(content.worlds[p.currentWorld]?.name || p.currentWorld)}</td>
          <td><span class="pill ${p.stage === 'complete' ? 'ok' : 'warm'}">${esc(p.stage)}</span></td>
          <td class="num">${(p.cores || []).length} / 3</td><td class="num">${done}</td>
          <td class="num">${Math.round((p.stats?.playTime || 0) / 60)} min</td><td>${ago(p.stats?.lastSeen)}</td>
          <td class="row"><button class="b" data-edit="${esc(p._key)}">Edit</button><button class="b" data-reset="${esc(p._key)}">Reset</button><button class="b danger" data-del="${esc(p._key)}">Delete</button></td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">No players yet.</div>'}</div>
      <dialog id="dlg"></dialog>`;
  },

  worlds() {
    return `<h1>Worlds</h1><div class="sub">Names and subtitles shown on arrival title cards.</div>
      ${WORLDS.map((w) => `<div class="card"><h2>${w}</h2><div class="grid2">
        <label class="f">Name<input data-path="worlds.${w}.name" value="${esc(content.worlds[w].name)}"></label>
        <label class="f">Subtitle<input data-path="worlds.${w}.subtitle" value="${esc(content.worlds[w].subtitle)}"></label>
        ${content.worlds[w].blackHole !== undefined ? `<label class="f">Black hole label<input data-path="worlds.${w}.blackHole" value="${esc(content.worlds[w].blackHole)}"></label>` : ''}
      </div></div>`).join('')}${saveBar()}`;
  },

  missions() {
    const num = (id, k, label) => content.missions[id][k] !== undefined ? `<label class="f">${label}<input type="number" min="1" max="40" data-num="1" data-path="missions.${id}.${k}" value="${content.missions[id][k]}"></label>` : '';
    return `<h1>Missions</h1><div class="sub">Titles, descriptions and objective sizes.</div>
      ${MISSIONS.map((id) => `<div class="card"><h2>${id}</h2><div class="grid2">
        <label class="f">Title<input data-path="missions.${id}.title" value="${esc(content.missions[id].title)}"></label>
        <label class="f">Description<input data-path="missions.${id}.description" value="${esc(content.missions[id].description)}"></label>
        ${num(id, 'required', 'Required')}${num(id, 'carry', 'Carry capacity')}${num(id, 'wood', 'Wood needed')}${num(id, 'stone', 'Stone needed')}${num(id, 'fish', 'Fish needed')}
      </div></div>`).join('')}${saveBar()}`;
  },

  npcs() {
    const n = content.npcs;
    const block = (id, label) => `<div class="card"><h2>${label}</h2><div class="grid2">
      <label class="f">Name<input data-path="npcs.${id}.name" value="${esc(n[id].name)}"></label><span></span>
      ${n[id].greet !== undefined ? `<label class="f">Greeting (quest assignment)<textarea data-path="npcs.${id}.greet">${esc(n[id].greet)}</textarea></label>` : ''}
      ${n[id].thanks !== undefined ? `<label class="f">Thanks (quest completion)<textarea data-path="npcs.${id}.thanks">${esc(n[id].thanks)}</textarea></label>` : ''}
    </div></div>`;
    return `<h1>NPCs</h1><div class="sub">Who the explorer meets, and what they say.</div>
      ${block('mother', 'Mother')}${block('farmer', 'Farmer · Farm World')}${block('archivist', 'Archivist · Knowledge World')}${block('elder', 'Elder · Hunger World')}
      <div class="card"><h2>Children · Knowledge World</h2><div class="grid2">${n.children.map((c, i) => `<label class="f">Child ${i + 1}<input data-path="npcs.children.${i}" value="${esc(c)}"></label>`).join('')}</div></div>${saveBar()}`;
  },

  characters() {
    const ch = content.characters;
    return `<h1>Characters</h1><div class="sub">Explorer options and outfit palettes on the entry screen.</div>
      ${Object.keys(ch).map((id) => `<div class="card"><h2>${id}</h2><div class="grid2">
        <label class="f">Label<input data-path="characters.${id}.label" value="${esc(ch[id].label)}"></label>
        <label class="f">Available<select data-bool="1" data-path="characters.${id}.enabled"><option value="true" ${ch[id].enabled !== false ? 'selected' : ''}>Enabled</option><option value="false" ${ch[id].enabled === false ? 'selected' : ''}>Hidden</option></select></label>
        <label class="f">Hair colour<input type="color" data-path="characters.${id}.hair" value="${esc(ch[id].hair)}"></label>
        <label class="f">Skin tone<input type="color" data-path="characters.${id}.skin" value="${esc(ch[id].skin)}"></label>
      </div></div>`).join('')}
      <div class="card"><h2>Outfits</h2><div class="grid2">${content.outfits.map((o, i) => `<label class="f">${esc(o.label)} · top<input type="color" data-path="outfits.${i}.top" value="${esc(o.top)}"></label><label class="f">${esc(o.label)} · bottom<input type="color" data-path="outfits.${i}.bottom" value="${esc(o.bottom)}"></label>`).join('')}</div></div>${saveBar()}`;
  },

  rewards() {
    return `<h1>Rewards</h1><div class="sub">What each world grants on mission completion.</div>
      <div class="card"><h2>Oxygen core</h2><div class="grid2">
        <label class="f">Reward name<input data-path="rewards.core.name" value="${esc(content.rewards.core.name)}"></label>
        <label class="f">Per world<input type="number" disabled value="1"></label>
        ${['harvest_day', 'share_knowledge', 'feed_world'].map((m) => `<label class="f">${esc(content.missions[m].title)} reward label<input data-path="missions.${m}.reward" value="${esc(content.missions[m].reward)}"></label>`).join('')}
      </div></div>${saveBar()}`;
  },

  data(players) {
    return `<h1>Import / Export</h1><div class="sub">Back up or move players and content between browsers.</div>
      <div class="card"><h2>Export</h2><div class="row"><button class="b primary" id="exp">Download JSON</button><span style="color:var(--dim)">${Object.keys(players).length} players + content overrides</span></div></div>
      <div class="card"><h2>Import</h2><div class="row"><input type="file" id="imp" accept="application/json"></div></div>
      <div class="card"><h2>Danger zone</h2><div class="row"><button class="b danger" id="resetContent">Reset content to defaults</button><button class="b danger" id="wipe">Delete all players</button></div></div>`;
  },
};

const saveBar = () => `<div class="row" style="margin-top:6px"><button class="b primary" id="save">Save changes</button><button class="b" id="revert">Revert</button><span style="color:var(--dim);font-size:12px">Applies next time the game loads.</span></div>`;

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

function bindContentForm() {
  root.querySelector('#save').onclick = () => {
    root.querySelectorAll('[data-path]').forEach((el) => {
      let v = el.value;
      if (el.dataset.num) v = Math.max(1, Math.min(40, parseInt(v, 10) || 1));
      if (el.dataset.bool) v = v === 'true';
      setPath(content, el.dataset.path, v);
    });
    saveConfig(structuredClone(content)).then((ok) => ok && toast('Saved'));
  };
  root.querySelector('#revert').onclick = () => { content = fresh(); render(); };
}

const BIND = {
  worlds: bindContentForm, missions: bindContentForm, npcs: bindContentForm, characters: bindContentForm, rewards: bindContentForm,
  players(players) {
    const dlg = root.querySelector('#dlg');
    root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
      if (!confirm('Delete this player permanently?')) return;
      delete players[b.dataset.del]; writePlayers(players).then(() => { render(); toast('Player deleted'); });
    }));
    root.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = () => {
      if (!confirm('Reset this player\'s progress to the beginning?')) return;
      const p = players[b.dataset.reset];
      players[b.dataset.reset] = { ...defaultState(p.nickname, p.character), _key: p._key, _owner: p._owner, _nk: p._nk };
      writePlayers(players).then(() => { render(); toast('Progress reset'); });
    }));
    root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
      const p = players[b.dataset.edit];
      const inv = p.inventory || {};
      dlg.innerHTML = `<h1 style="font-size:26px">${esc(p.nickname)}</h1><div class="sub">Progression &amp; inventory</div>
        <div class="grid2">
          <label class="f">Current world<select id="e-world">${WORLDS.map((w) => `<option ${p.currentWorld === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
          <label class="f">Stage<select id="e-stage">${['intro', 'space', 'complete'].map((s) => `<option ${p.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          ${['farm', 'knowledge', 'hunger'].map((w) => `<label class="f"><span><input type="checkbox" data-core="${w}" ${(p.cores || []).includes(w) ? 'checked' : ''}> Core from ${w}</span></label>`).join('')}
          ${['crops', 'wood', 'stone', 'fish', 'food'].map((k) => `<label class="f">${k}<input type="number" min="0" data-inv="${k}" value="${inv[k] || 0}"></label>`).join('')}
        </div>
        <div class="row" style="margin-top:18px"><button class="b primary" id="e-save">Save</button><button class="b" id="e-cancel">Cancel</button></div>`;
      dlg.showModal();
      dlg.querySelector('#e-cancel').onclick = () => dlg.close();
      dlg.querySelector('#e-save').onclick = () => {
        p.currentWorld = dlg.querySelector('#e-world').value;
        p.stage = dlg.querySelector('#e-stage').value;
        p.cores = [...dlg.querySelectorAll('[data-core]')].filter((c) => c.checked).map((c) => c.dataset.core);
        p.inventory = { ...inv, oxygenCore: p.stage === 'complete' ? 0 : p.cores.length };
        for (const w of p.cores) {
          const mid = { farm: 'harvest_day', knowledge: 'share_knowledge', hunger: 'feed_world' }[w];
          p.missions = p.missions || {};
          p.missions[mid] = { ...(p.missions[mid] || { step: 0, counts: {}, data: {} }), status: 'complete' };
        }
        dlg.querySelectorAll('[data-inv]').forEach((i) => (p.inventory[i.dataset.inv] = Math.max(0, parseInt(i.value, 10) || 0)));
        dlg.close();
        writePlayers(players).then(() => { render(); toast('Player updated'); });
      };
    }));
  },
  data(players) {
    root.querySelector('#exp').onclick = () => {
      const rows = Object.values(players).map((p) => ({ owner: p._owner, nickname_key: p._nk, state: clean(p) }));
      const blob = new Blob([JSON.stringify({ players: rows, config: readOverrides() }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'astra-backup.json';
      a.click();
    };
    root.querySelector('#imp').onchange = async (e) => {
      try {
        const data = JSON.parse(await e.target.files[0].text());
        if (Array.isArray(data.players) && data.players.length) {
          const { error } = await sb.from('players').upsert(data.players.map((r) => ({ ...r, updated_at: new Date().toISOString(), admin_edited_at: new Date().toISOString() })));
          if (error) throw error;
        }
        if (data.config) await saveConfig(data.config);
        await loadData();
        render();
        toast('Imported');
      } catch { toast('That file could not be read'); }
    };
    root.querySelector('#resetContent').onclick = () => { if (confirm('Reset all content to defaults?')) { saveConfig({}).then((ok) => { if (ok) { content = fresh(); render(); toast('Content reset'); } }); } };
    root.querySelector('#wipe').onclick = () => { if (confirm('Delete ALL players?')) { writePlayers({}).then(() => { render(); toast('All players deleted'); }); } };
  },
};

let ADMIN_EMAIL = '';

function gate(inner) {
  root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:20px"><div class="card" style="width:min(420px,100%)">
    <div class="brand" style="margin-bottom:18px">3RD WORLD<small>Admin console</small></div>${inner}</div></div>`;
}

function renderSetup() {
  gate(`<p style="color:var(--dim)">The admin console needs the Supabase database.</p>
    <ol style="color:var(--dim);padding-left:18px;line-height:1.7">
      <li>Run <code>supabase/migrations/0001_astra.sql</code> in your project's SQL editor.</li>
      <li>Enable <b>Anonymous sign-ins</b> and add your admin user (email + password).</li>
      <li>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then rebuild.</li>
    </ol>`);
}

function renderLogin(msg = '') {
  gate(`<form id="login" style="display:grid;gap:12px">
      <label class="f">Email<input id="em" type="email" autocomplete="username" required></label>
      <label class="f">Password<input id="pw" type="password" autocomplete="current-password" required></label>
      <button class="b primary" type="submit">Sign in</button>
      <div id="msg" style="color:#ff9aa4;font-size:13px;min-height:18px">${esc(msg)}</div>
    </form>`);
  root.querySelector('#login').onsubmit = async (e) => {
    e.preventDefault();
    const m = root.querySelector('#msg');
    m.textContent = 'Signing in…';
    const { error } = await sb.auth.signInWithPassword({ email: root.querySelector('#em').value.trim(), password: root.querySelector('#pw').value });
    if (error) { m.textContent = error.message; return; }
    boot();
  };
}

async function boot() {
  if (!cloudEnabled) return renderSetup();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return renderLogin();
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || !ok) { await sb.auth.signOut(); return renderLogin('This account does not have admin access.'); }
  ADMIN_EMAIL = user.email || '';
  try { await loadData(); } catch (e) { return renderLogin('Could not load data: ' + e.message); }
  render();
}

boot();
