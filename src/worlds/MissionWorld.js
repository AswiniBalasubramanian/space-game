import * as THREE from 'three';
import { BaseWorld } from './BaseWorld.js';
import { Ease } from '../core/Tween.js';
import { WORLDS, WORLD_MISSION } from '../data/content.js';

// Shared flow for the three civilisations: wide establishing shot on arrival,
// the car parked where you landed, per-world progress saved in the profile.
export class MissionWorld extends BaseWorld {
  get missionId() { return WORLD_MISSION[this.key]; }
  get ws() {
    const all = this.game.state.worldState;
    if (!all[this.key]) all[this.key] = {};
    return all[this.key];
  }

  // spawn: [x, z, yaw]; carSpot: [x, z, yaw]; establish: {from, to} camera framing
  setupArrival({ spawn, carSpot, establish }) {
    this.spawn = spawn; this.carSpot = carSpot; this.establish = establish;
    const game = this.game;
    this.carIt = this.interact({
      label: 'Return to Space', position: new THREE.Vector3(carSpot[0], 0, carSpot[1]), radius: 3.2, markerHeight: 3,
      markerColor: '#9ff4ff',
      enabled: () => game.missions.isDone(this.missionId) || this.ws.allowLeave,
      onInteract: () => this.leave(),
    });
    this.interact({
      label: 'Leave (mission unfinished)', position: new THREE.Vector3(carSpot[0], 0, carSpot[1]), radius: 3.2, marker: false,
      enabled: () => !game.missions.isDone(this.missionId) && !this.ws.allowLeave,
      onInteract: async () => {
        const i = await game.dialogue.choose({ text: 'Leave before finishing? Your progress here will be kept.', options: ['Stay and help', 'Leave for now'] });
        if (i === 1) this.leave();
      },
    });
  }

  enter(opts) {
    const game = this.game;
    game.hud.setWorld(this.key);
    const [x, z, yaw] = this.spawn;
    game.addCar(this.carSpot[0], this.carSpot[1], this.carSpot[2]);
    this.carIt.position.copy(game.car.root.position);
    this.carIt.markerSprite.position.copy(game.car.root.position).add(new THREE.Vector3(0, 3, 0));
    this.carIt.markerSprite.userData.base = this.carIt.markerSprite.position.y;
    game.addPlayer(x, z, yaw);
    game.setControl('none');
    const e = this.establish;
    game.setShot(e.from.pos, e.from.look);
    if (!game.missions.isDone(this.missionId)) game.missions.start(this.missionId);
    else game.missions.focus(this.missionId);
    game.state.story.focus = this.missionId;
    if (opts.arrival === 'resume') this.arrive();
  }

  // Wide establishing shot → slow push toward the tiny explorer.
  async arrive() {
    const game = this.game;
    const e = this.establish;
    const p = game.player.root.position;
    await game.cutscene(async () => {
      const w = WORLDS[this.key];
      game.hud.banner(w.name.toUpperCase(), w.mood, 3600);
      await game.shot(e.from, e.to, 5.5, Ease.sine);
      const behind = [p.x - Math.sin(this.spawn[2]) * 6, p.y + 3.2, p.z - Math.cos(this.spawn[2]) * 6];
      await game.shot(e.to, { pos: behind, look: [p.x, p.y + 1.4, p.z] }, 2.6, Ease.inOut);
    });
    game.cam.yaw = this.spawn[2] + Math.PI;
    game.cam.pitch = 0.3; game.cam.dist = 6;
    game.setControl('walk');
    this.onArrive?.();
  }

  async leave() {
    const game = this.game;
    game.playerHidden = true;
    game.vehicle.yaw = this.carSpot[2];
    await game.liftOff({ from: this.key, subtitle: 'Back to the stars' });
  }
}
