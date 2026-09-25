import './style.css';
import { Game } from './core/Game.js';
import { EntryScreen } from './ui/EntryScreen.js';

const game = new Game(document.getElementById('app'));
window.__astra = game; // handy for debugging in the console

async function boot() {
  await game.loadWorld('title');
  game.setShot([-1, 5.4, 14], [-3.4, 4.6, 0]);
  document.getElementById('loading').classList.add('done');

  new EntryScreen(game, async (existing, name, character) => {
    if (existing) game.initProfile(existing);
    else game.newProfile(name, character);
    await resume();
    game.hud.fadeTo(0, 1.6);
  });
}

// Resume at the right place in the story.
async function resume() {
  const st = game.state;
  const w = st.currentWorld;
  if (['farm', 'knowledge', 'hunger'].includes(w) && !game.missions.isDone({ farm: 'harvestDay', knowledge: 'shareKnowledge', hunger: 'feedWorld' }[w])) {
    await game.loadWorld(w, { arrival: 'resume' });
  } else if (w === 'space' || ['farm', 'knowledge', 'hunger'].includes(w)) {
    await game.loadWorld('space', { from: ['farm', 'knowledge', 'hunger'].includes(w) ? w : null });
  } else {
    const returning = ['home', 'machine', 'done'].includes(st.story.stage);
    await game.loadWorld('home', { mode: returning ? 'return' : 'start', resume: true });
  }
}

boot();
