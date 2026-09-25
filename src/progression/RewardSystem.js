import * as THREE from 'three';
import { glow } from '../render/toon.js';
import { glowTexture } from '../render/textures.js';
import { Ease } from '../core/Tween.js';

// Oxygen Core: a softly breathing capsule of pale-cyan light.
export function makeCore(scale = 1) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.26, 6, 14), new THREE.MeshToonMaterial({ color: '#dffcff', emissive: '#7fe8ff', emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), glow('#ffffff'));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 24), glow('#f2c14e'));
  ring.rotation.x = Math.PI / 2;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(160,240,255,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(1.4);
  g.add(shell, core, ring, halo);
  g.scale.setScalar(scale);
  g.userData.ring = ring;
  return g;
}

export class RewardSystem {
  constructor(game) { this.game = game; }

  // Mission reward cinematic: the core rises from the giver, orbits the
  // player and settles into their backpack.
  async giveCore(fromPos, missionId) {
    const game = this.game;
    const core = makeCore(1.2);
    core.position.copy(fromPos).add(new THREE.Vector3(0, 1.4, 0));
    game.world.scene.add(core);
    const light = new THREE.PointLight('#9ff4ff', 6, 8);
    core.add(light);
    game.audio.reward();
    const p = game.player.root.position;
    const start = core.position.clone();
    await game.tweens.tween(1.6, (k) => {
      core.position.y = start.y + Math.sin(k * Math.PI) * 1.2 + k * 0.6;
      core.rotation.y = k * 6;
      core.userData.ring.rotation.z = k * 10;
    });
    const mid = core.position.clone();
    await game.tweens.tween(1.3, (k) => {
      const a = k * Math.PI * 3;
      const target = new THREE.Vector3(p.x + Math.cos(a) * (1 - k) * 1.6, p.y + 1.3 + (1 - k) * 0.8, p.z + Math.sin(a) * (1 - k) * 1.6);
      core.position.lerpVectors(mid, target, Ease.inOut(k));
      core.scale.setScalar(1.2 * (1 - k * 0.7));
    });
    game.world.scene.remove(core);
    const n = game.inventory.add('oxygenCore', 1);
    game.player.setCores(n);
    if (missionId) game.missions.complete(missionId);
    game.save();
    await game.hud.banner('OXYGEN CORE × 1', `OXYGEN ${n} / 3`, 3000, 'reward');
    if (n >= 3) {
      await game.hud.banner('ALL OXYGEN CORES COLLECTED', 'RETURN HOME', 3400, 'reward');
      game.story('home');
    } else {
      game.story('car');
    }
    game.missions.focus('findOxygen');
    game.state.story.focus = 'findOxygen';
    return n;
  }
}
