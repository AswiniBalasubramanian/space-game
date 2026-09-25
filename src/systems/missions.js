// MissionSystem (+ InventorySystem + RewardSystem helpers). Missions are data: a
// title, description, ordered steps, counters and a completion state, persisted in
// the save file. Scenes advance them; the HUD reads `current()`.

const STEPS = {
  find_oxygen: [
    'Talk to Mother',
    'Inspect the oxygen machine',
    'Leave the house',
    'Get into the car',
    'Drive out and lift off',
    'Follow the signals to the black holes',
  ],
  harvest_day: ['Talk to the farmer', 'Harvest the glowing crops', 'Speak with the farmer', 'Return to your car'],
  share_knowledge: ['Speak with the Archivist', 'Find and teach the children below', 'Return to your car'],
  feed_world: ['Talk to the Elder', 'Gather wood and stone', 'Repair the broken dock', 'Catch fish at the dock', 'Cook at the village fire', 'Deliver food to the granary', 'Return to your car'],
  home_again: ['Fly home — follow the blue signal', 'Go to Mother', 'Insert the Oxygen Cores'],
};

const WORLD_MISSION = { farm: 'harvest_day', knowledge: 'share_knowledge', hunger: 'feed_world' };

export class Missions {
  constructor(game) { this.game = game; }

  get s() { return this.game.save.state; }
  get(id) { return this.s.missions[id]; }
  status(id) { return this.s.missions[id]?.status || 'locked'; }
  step(id) { return this.s.missions[id]?.step ?? -1; }

  start(id, data = {}) {
    if (!this.s.missions[id]) this.s.missions[id] = { status: 'active', step: 0, counts: {}, data, started: Date.now() };
    this.game.save.save();
    return this.s.missions[id];
  }

  setStep(id, step) {
    const m = this.s.missions[id] || this.start(id);
    if (step > m.step) {
      m.step = step;
      this.game.audio.sfx('blip');
    }
    this.game.save.save();
  }

  add(id, key, n = 1) {
    const m = this.s.missions[id] || this.start(id);
    m.counts[key] = (m.counts[key] || 0) + n;
    this.game.save.save();
    return m.counts[key];
  }

  count(id, key) { return this.s.missions[id]?.counts[key] || 0; }

  complete(id) {
    const m = this.s.missions[id] || this.start(id);
    m.status = 'complete';
    m.completed = Date.now();
    this.game.save.save();
  }

  /** Inventory helpers */
  give(item, n = 1) {
    const inv = this.s.inventory;
    inv[item] = Math.max(0, (inv[item] || 0) + n);
    this.game.save.save();
    return inv[item];
  }
  has(item, n = 1) { return (this.s.inventory[item] || 0) >= n; }

  /** RewardSystem: an Oxygen Core from a world, once. */
  grantCore(worldId) {
    if (this.s.cores.includes(worldId)) return false;
    this.s.cores.push(worldId);
    this.give('oxygenCore', 1);
    return true;
  }

  current() {
    const g = this.game, c = g.content.missions;
    const wm = WORLD_MISSION[g.worldId];
    let id = null;
    if (wm && this.s.missions[wm]) id = wm;
    else if (this.s.missions.home_again) id = 'home_again';
    else if (this.s.missions.find_oxygen) id = 'find_oxygen';
    if (!id) return null;
    const m = this.s.missions[id];
    const def = c[id] || {};
    const out = { id, title: def.title || id, objective: STEPS[id]?.[m.step] || '', progress: '', ratio: undefined };
    if (m.status === 'complete' && wm === id) {
      out.objective = 'Complete — return to your car';
      out.progress = `Reward: ${def.reward || 'Oxygen Core'} × 1`;
      out.ratio = 1;
      return out;
    }
    const inv = this.s.inventory;
    if (id === 'find_oxygen' && m.step >= 5) {
      out.progress = `Oxygen cores ${inv.oxygenCore} / 3`;
      out.ratio = inv.oxygenCore / 3;
    } else if (id === 'harvest_day' && m.step === 1) {
      const got = this.count(id, 'delivered'), req = def.required;
      out.progress = `${got} / ${req} delivered${inv.crops ? ` · carrying ${inv.crops}` : ''}`;
      out.ratio = got / req;
      if (inv.crops >= def.carry || got + inv.crops >= req) out.objective = 'Deliver the crops to the cart';
    } else if (id === 'share_knowledge' && m.step === 1) {
      const got = this.count(id, 'taught');
      out.progress = `${got} / ${def.required} children taught`;
      out.ratio = got / def.required;
    } else if (id === 'feed_world') {
      if (m.step === 1) {
        out.progress = `Wood ${Math.min(inv.wood, def.wood)} / ${def.wood} · Stone ${Math.min(inv.stone, def.stone)} / ${def.stone}`;
        out.ratio = (Math.min(inv.wood, def.wood) + Math.min(inv.stone, def.stone)) / (def.wood + def.stone);
      } else if (m.step === 3) {
        const got = this.count(id, 'caught');
        out.progress = `${got} / ${def.fish} fish`;
        out.ratio = got / def.fish;
      } else if (m.step === 5) out.progress = `Food × ${inv.food}`;
    }
    return out;
  }
}
