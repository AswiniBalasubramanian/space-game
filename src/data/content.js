// Single source of truth for game content. The admin panel reads this file
// and can override the tunable values (stored in localStorage "astra.config").

export const ITEMS = {
  oxygenCore: { name: 'Oxygen Core', icon: '◈' },
  crops: { name: 'Crops', icon: '🌾' },
  books: { name: 'Lumen Books', icon: '📘' },
  wood: { name: 'Wood', icon: '🪵' },
  stone: { name: 'Stone', icon: '🪨' },
  fish: { name: 'Fish', icon: '🐟' },
  food: { name: 'Food', icon: '🍲' },
};

export const WORLDS = {
  home: { name: 'Home', mood: 'Warm · Emotional' },
  space: { name: 'The Quiet Sea', mood: 'Dark · Mysterious' },
  farm: { name: 'Farm World', hole: 'Black Hole 01', mood: 'Green · Organic', color: '#f2c14e' },
  knowledge: { name: 'Knowledge World', hole: 'Black Hole 02', mood: 'Bright · Futuristic', color: '#fff0c8' },
  hunger: { name: 'Hunger World', hole: 'Black Hole 03', mood: 'Earthy · Raw', color: '#f2703c' },
};

export const NPCS = {
  mother: { name: 'Mom', world: 'home', preset: 'mother' },
  farmer: { name: 'Farmer Oren', world: 'farm', preset: 'farmer' },
  scholar: { name: 'Scholar Ilsa', world: 'knowledge', preset: 'scholar' },
  mira: { name: 'Mira', world: 'knowledge', preset: 'childGirl' },
  tobi: { name: 'Tobi', world: 'knowledge', preset: 'child' },
  pell: { name: 'Pell', world: 'knowledge', preset: 'child' },
  elder: { name: 'Elder Rue', world: 'hunger', preset: 'elder' },
};

export const MISSIONS = {
  findOxygen: {
    title: 'Find the Oxygen', code: 'MISSION 01', world: 'home',
    description: 'Mom\'s oxygen machine is failing. Three distant worlds may hold what she needs.',
    stages: {
      talk: 'Talk to Mom',
      map: 'Check the star map in the living room',
      leave: 'Leave the house and get into your car',
      space: 'Find a black hole — they lead to the three worlds',
      cores: 'Find the next black hole and help another world',
      car: 'Return to your car and head back to space',
      home: 'Return home — follow the light to your planet',
      machine: 'Bring the cores to Mom\'s oxygen machine',
      done: 'Home.',
    },
  },
  harvestDay: {
    title: 'Harvest Day', world: 'farm', reward: { item: 'oxygenCore', qty: 1 },
    description: 'The farm is full but the hands are few. Help bring in today\'s harvest.',
    target: 12, carry: 6,
    stages: {
      talk: 'Talk to Farmer Oren',
      harvest: 'Harvest golden crops and deliver them to the cart',
      reward: 'Return to Farmer Oren',
      done: 'Harvest complete',
    },
  },
  shareKnowledge: {
    title: 'Share Knowledge', world: 'knowledge', reward: { item: 'oxygenCore', qty: 1 },
    description: 'The towers hold every book, but the children below have never read one.',
    target: 3,
    stages: {
      talk: 'Talk to Scholar Ilsa',
      books: 'Borrow Lumen Books from the Great Library',
      teach: 'Take the light-lift down and teach the children',
      reward: 'Talk to Scholar Ilsa below',
      done: 'Knowledge shared',
    },
  },
  feedWorld: {
    title: 'Feed the World', world: 'hunger', reward: { item: 'oxygenCore', qty: 1 },
    description: 'The village storehouse is empty. Help them fish the great lake.',
    wood: 4, stone: 3, fish: 4,
    stages: {
      talk: 'Talk to Elder Rue',
      gather: 'Gather wood and stone',
      build: 'Build the fishing dock on the lake shore',
      fish: 'Catch fish from the dock',
      cook: 'Cook the fish at the village fire',
      deliver: 'Deliver food to the storehouse',
      reward: 'Talk to Elder Rue',
      done: 'The village is fed',
    },
  },
};

export const WORLD_MISSION = { farm: 'harvestDay', knowledge: 'shareKnowledge', hunger: 'feedWorld' };

export const LESSONS = [
  { child: 'mira', q: 'I counted 3 stars, then 4 more came out. How many stars is that?', options: ['6', '7', '9'], answer: 1, thanks: 'Seven! I\'m going to count every star tonight.' },
  { child: 'tobi', q: 'Why do the farm worlds grow so much food?', options: ['Sunlight, water and care', 'They keep it in the dark', 'Moon dust'], answer: 0, thanks: 'Sunlight, water and care… I\'ll grow a garden down here!' },
  { child: 'pell', q: 'This book has a word I can\'t read. H‑O‑P‑E… what does it say?', options: ['Home', 'Hope', 'Hops'], answer: 1, thanks: 'Hope. That\'s a good word to learn first.' },
];

const CONFIG_KEY = 'astra.config';
export function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch { return {}; }
}
export function saveConfig(cfg) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch { /* storage unavailable */ }
}

// Mission definition with admin overrides applied.
export function mission(id) {
  const base = MISSIONS[id];
  const o = loadConfig().missions?.[id] || {};
  return { ...base, ...o, stages: base.stages };
}
