import { ITEMS } from '../data/content.js';

export class InventorySystem {
  constructor(state, onChange) {
    this.state = state;
    this.onChange = onChange;
  }
  get items() { return this.state.inventory; }
  count(id) { return this.items[id] || 0; }
  add(id, qty = 1) {
    this.items[id] = Math.max(0, this.count(id) + qty);
    this.onChange?.(id, this.items[id], qty);
    return this.items[id];
  }
  take(id, qty = 1) {
    if (this.count(id) < qty) return false;
    this.add(id, -qty);
    return true;
  }
  set(id, qty) { this.items[id] = qty; this.onChange?.(id, qty, 0); }
  list() {
    return Object.entries(this.items)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, n, ...ITEMS[id] }));
  }
}
