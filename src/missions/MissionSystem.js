import { mission } from '../data/content.js';

// Reusable mission tracker: title, description, staged objectives, progress,
// completion state and reward. Worlds advance stages; the HUD just renders.
export class MissionSystem {
  constructor(state, onChange) {
    this.state = state;
    this.onChange = onChange;
    this.activeId = null;
  }

  rec(id) {
    if (!this.state.missions[id]) this.state.missions[id] = { status: 'inactive', stage: null, progress: 0 };
    return this.state.missions[id];
  }
  def(id) { return mission(id); }
  status(id) { return this.rec(id).status; }
  stage(id) { return this.rec(id).stage; }
  isDone(id) { return this.rec(id).status === 'complete'; }

  focus(id) { this.activeId = id; this.onChange?.(); }

  start(id, stage) {
    const r = this.rec(id);
    if (r.status === 'inactive') { r.status = 'active'; r.stage = stage ?? Object.keys(this.def(id).stages)[0]; r.progress = 0; }
    this.activeId = id;
    this.onChange?.();
  }

  setStage(id, stage, progress = 0) {
    const r = this.rec(id);
    r.stage = stage; r.progress = progress; r.total = undefined; r.label = undefined;
    if (r.status === 'inactive') r.status = 'active';
    this.activeId = id;
    this.onChange?.();
  }

  progress(id, value, total, label) {
    const r = this.rec(id);
    r.progress = value;
    if (total !== undefined) r.total = total;
    r.label = label;
    this.onChange?.();
  }

  complete(id) {
    const r = this.rec(id);
    r.status = 'complete'; r.stage = 'done';
    this.onChange?.();
  }

  // What the HUD should show for the focused mission.
  view() {
    const id = this.activeId;
    if (!id) return null;
    const d = this.def(id), r = this.rec(id);
    return {
      id, title: d.title, code: d.code, objective: d.stages[r.stage] ?? '',
      progress: r.label ?? (r.total ? `${r.progress} / ${r.total}` : null),
      reward: d.reward ? 'Oxygen Core' : null,
      complete: r.status === 'complete',
    };
  }

  completedCount() { return Object.values(this.state.missions).filter((m) => m.status === 'complete').length; }
}
