import * as THREE from 'three';
import { CharacterModel } from '../character/CharacterModel.js';
import { dampAngle } from '../utils/noise.js';

// Reusable NPC: a character model with a name, an idle pose, a "Talk"
// interaction and the habit of turning to face the player when close.
export class NPC {
  constructor(world, { preset, name, pos, yaw = 0, pose = 'stand', onTalk, label = 'Talk', enabled, markerColor, y }) {
    this.world = world;
    this.name = name;
    this.model = new CharacterModel(preset);
    const [x, z] = pos;
    this.baseYaw = yaw;
    this.model.root.position.set(x, y ?? world.heightAt(x, z, 99), z);
    this.model.root.rotation.y = yaw;
    this.model.setPose(pose);
    world.add(this.model.root);
    const py = this.model.root.position.y;
    this.col = { t: 'c', x, z, r: 0.45, minY: py - 6, maxY: py + 6 };
    world.colliders.push(this.col);
    this.it = onTalk ? world.interact({ label, position: this.model.root.position, radius: 2.4, markerHeight: 2.35, enabled, markerColor, onInteract: () => onTalk(this) }) : null;
    world.onUpdate((dt) => this.update(dt));
  }

  get pos() { return this.model.root.position; }

  moveTo(x, z, y) {
    this.model.root.position.set(x, y ?? this.world.heightAt(x, z, 99), z);
    if (this.it) {
      this.it.position.copy(this.model.root.position);
      this.it.markerSprite?.position.set(x, this.model.root.position.y + 2.35, z);
      if (this.it.markerSprite) this.it.markerSprite.userData.base = this.model.root.position.y + 2.35;
    }
    this.col.x = x; this.col.z = z;
    this.col.minY = this.model.root.position.y - 6; this.col.maxY = this.model.root.position.y + 6;
  }

  update(dt) {
    const game = this.world.game;
    const p = game.player?.root.position;
    let target = this.baseYaw;
    if (p && this.model.pose === 'stand' && p.distanceTo(this.pos) < 5) target = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.model.root.rotation.y = dampAngle(this.model.root.rotation.y, target, 4, dt);
    this.model.update(dt, 0);
  }
}
