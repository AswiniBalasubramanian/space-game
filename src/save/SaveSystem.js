// Local profile storage. Each nickname is a profile; the admin panel reads the
// same key to show players and edit progression.

const KEY = 'astra.profiles';
const LAST = 'astra.lastProfile';

export function newState(nickname, character) {
  return {
    nickname, character,
    currentWorld: 'home',
    story: { stage: 'talk', starMap: false, worldsDiscovered: [], finale: false, endingSeen: false },
    missions: {},
    inventory: { oxygenCore: 0, crops: 0, books: 0, wood: 0, stone: 0, fish: 0, food: 0 },
    worldState: {},
    stats: { playSeconds: 0, created: Date.now() },
    updatedAt: Date.now(),
  };
}

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable (private mode) */ }
}

export const SaveSystem = {
  key: (nick) => nick.trim().toLowerCase(),
  list() { return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt); },
  load(nick) { return readAll()[this.key(nick)] || null; },
  last() {
    try { const k = localStorage.getItem(LAST); return k ? readAll()[k] || null : null; } catch { return null; }
  },
  save(state) {
    if (!state?.nickname) return;
    const all = readAll();
    state.updatedAt = Date.now();
    all[this.key(state.nickname)] = state;
    writeAll(all);
    try { localStorage.setItem(LAST, this.key(state.nickname)); } catch { /* ignore */ }
  },
  remove(nick) {
    const all = readAll();
    delete all[this.key(nick)];
    writeAll(all);
  },
  replaceAll(all) { writeAll(all); },
  raw: readAll,
};
