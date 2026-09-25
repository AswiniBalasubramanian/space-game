import { pushSave } from './cloud.js';

// SaveSystem: every player's progress lives in one localStorage registry keyed by
// nickname, so the admin panel can read and manage all of them.

export const PLAYERS_KEY = 'astra.players.v1';
export const ACTIVE_KEY = 'astra.active.v1';

export function defaultState(nickname, character) {
  const now = Date.now();
  return {
    version: 1,
    nickname,
    character, // { gender, outfit }
    currentWorld: 'home',
    stage: 'intro', // intro → mission → space → returning → finale → complete
    missions: {},
    inventory: { oxygenCore: 0, crops: 0, wood: 0, stone: 0, fish: 0, food: 0 },
    cores: [], // world ids that granted a core
    discovered: [],
    flags: {},
    stats: { created: now, lastSeen: now, playTime: 0 },
  };
}

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(PLAYERS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(all));
  } catch { /* storage full or blocked — game keeps running in memory */ }
}

export const idOf = (nick) => nick.trim().toLowerCase();

export class SaveSystem {
  constructor() {
    this.state = null;
    this._timer = null;
  }

  static listPlayers() { return Object.values(readAll()); }

  static activeNickname() {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  }

  static find(nick) { return readAll()[idOf(nick)] || null; }

  create(nickname, character) {
    this.state = defaultState(nickname, character);
    this.flush();
    return this.state;
  }

  load(nickname) {
    const s = SaveSystem.find(nickname);
    if (s) {
      // forwards-compatible defaults
      const d = defaultState(s.nickname, s.character);
      this.state = { ...d, ...s, inventory: { ...d.inventory, ...s.inventory }, stats: { ...d.stats, ...s.stats } };
    }
    return this.state;
  }

  /** Debounced save. */
  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    if (!this.state) return;
    this.state.stats.lastSeen = Date.now();
    const all = readAll();
    all[idOf(this.state.nickname)] = this.state;
    writeAll(all);
    pushSave(this.state);
    try { localStorage.setItem(ACTIVE_KEY, this.state.nickname); } catch { /* ignore */ }
  }

  /** Adopt a cloud copy (e.g. after an admin edit). */
  adopt(state) {
    this.state = state;
    const all = readAll();
    all[idOf(state.nickname)] = state;
    writeAll(all);
  }

  reset() {
    const s = this.state;
    if (!s) return;
    this.state = defaultState(s.nickname, s.character);
    this.flush();
  }
}
