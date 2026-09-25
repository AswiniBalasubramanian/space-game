// Shared world beats: cinematic arrival, the Oxygen Core reward, leaving for space.
import * as THREE from 'three';
import { glowMat, glowSprite, makeMotes } from '../world/kit.js';

/** White flash out of the black hole → wide establishing shot → gameplay camera. */
export async function arrival(world, { car, player, from, to, look, ms = 7500 }) {
  const g = world.game;
  const title = g.content.worlds[world.id];
  g.vehicle.setMode('ground');
  g.vehicle.place(car.x, world.groundAt(car.x, car.z) ?? 0, car.z, car.yaw || 0);
  g.player.place(player.x, world.groundAt(player.x, player.z) ?? 0, player.z, player.yaw || 0);
  g.player.model.group.visible = true;
  g.player.camDistTarget = 5.5;
  g.setMode('cutscene');
  g.overlay.letterbox(true);
  g.overlay.setFadeInstant(1, '#fff');
  g.overlay.fade(0, 2200, '#fff');
  g.cine.cut(from, look);
  g.cine.to(to, look, ms, g.ease.sine);
  g.overlay.title(title.blackHole || '', title.name, title.subtitle, ms - 2000);
  await g.sleep(ms);
  const p = g.player.position;
  const behind = new THREE.Vector3(p.x - Math.sin(player.yaw || 0) * 5, p.y + 3, p.z - Math.cos(player.yaw || 0) * 5);
  await g.cine.to(behind, p.clone().add(new THREE.Vector3(0, 1.4, 0)), 1800);
  g.cine.release();
  g.player.snapCamera();
  g.overlay.letterbox(false);
  g.setMode('walk');
}

/** The mission reward: an Oxygen Core rises, a slow cinematic reveal, HUD 1/3 → 2/3 … */
export async function rewardCore(world, { pos, camFrom, missionId }) {
  const g = world.game;
  g.busy = true;
  g.setMode('cutscene');
  g.overlay.letterbox(true);
  const core = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 3), glowMat('#ffc080', 3.2));
  core.add(orb);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: '#ffd8a0', wireframe: true, transparent: true, opacity: 0.5, toneMapped: false }));
  core.add(shell);
  core.add(glowSprite('#f2703c', 4, 0.9));
  core.add(glowSprite('#fff2d8', 1.6, 1));
  const motes = makeMotes({ count: 60, center: new THREE.Vector3(0, -1, 0), spread: new THREE.Vector3(3, 4, 3), color: '#ffcf8a', size: 10, rise: 0.8 });
  core.add(motes);
  const light = new THREE.PointLight('#ffb070', 0, 18, 1.5);
  core.add(light);
  core.position.copy(pos);
  world.scene.add(core);
  const spin = world.animate((t) => { shell.rotation.y = t * 0.8; shell.rotation.x = t * 0.5; orb.rotation.y = -t; motes.userData.update(t); });
  g.audio.sfx('core');
  const up = pos.clone().add(new THREE.Vector3(0, 3, 0));
  g.cine.to(camFrom, pos, 1600);
  await g.tween(4200, (k) => {
    core.position.lerpVectors(pos, up, k);
    core.scale.setScalar(0.2 + k * 0.8);
    light.intensity = k * 40;
  });
  g.cine.to(camFrom.clone().add(new THREE.Vector3(0, 4, 0)).lerp(up, 0.35), up, 3000, g.ease.sine);
  g.missions.grantCore(world.id);
  g.missions.complete(missionId);
  g.overlay.banner('Reward', 'Oxygen Core × 1', `Oxygen ${g.save.state.inventory.oxygenCore} / 3`, 3600);
  await g.sleep(3200);
  // the core flies into the explorer's pack
  const from = core.position.clone();
  await g.tween(1300, (k) => {
    const to = g.player.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    core.position.lerpVectors(from, to, k);
    core.scale.setScalar(1 - k * 0.9);
  }, g.ease.in);
  g.audio.sfx('pickup');
  world.animated.splice(world.animated.indexOf(spin), 1);
  core.removeFromParent();
  g.cine.release();
  g.overlay.letterbox(false);
  g.player.snapCamera();
  g.setMode('walk');
  g.busy = false;
  if (g.save.state.inventory.oxygenCore >= 3) g.overlay.banner('All oxygen cores collected', 'Return home', 'Mother is waiting');
}

/** The car: "[E] Return to space" from any world. */
export function addReturnCar(world) {
  const g = world.game;
  g.interactions.add({
    pos: () => g.vehicle.position, radius: 3.4, dy: 4,
    label: () => (g.save.state.cores.includes(world.id) ? 'Return to space' : 'Return to space (mission unfinished)'),
    enabled: () => g.mode === 'walk',
    action: () => leave(world),
  });
}

export async function leave(world) {
  const g = world.game;
  if (world.leaving) return;
  world.leaving = true;
  g.busy = true;
  g.markers.clear();
  g.setMode('cutscene');
  g.overlay.letterbox(true);
  const car = g.vehicle;
  const start = car.position.clone();
  g.cine.to(start.clone().add(new THREE.Vector3(-6, 2.2, -8)), start.clone().add(new THREE.Vector3(0, 1, 0)), 1200);
  await g.sleep(800);
  g.player.model.group.visible = false;
  g.audio.sfx('engineStart');
  await g.sleep(900);
  car.setMode('fly');
  g.audio.sfx('whoosh');
  g.cine.to(start.clone().add(new THREE.Vector3(-14, 1, -14)), () => car.position.clone(), 1500);
  await g.tween(3800, (k) => {
    car.position.copy(start).add(new THREE.Vector3(0, Math.pow(k, 2) * 320, k * 40));
    car.pitch = Math.min(1.3, k * 2);
    car._apply();
    car.car.setThrust(0.5 + k);
    if (k > 0.6) { g.overlay.fadeEl.style.background = '#fff'; g.overlay.fadeEl.style.opacity = (k - 0.6) / 0.4; }
  }, g.ease.in);
  g.overlay.setFadeInstant(1, '#fff');
  g.busy = false;
  await g.loadWorld('space', { from: world.id });
}
