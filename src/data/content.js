// Default game content. The admin panel can override any of these values; overrides
// are stored in localStorage under CONFIG_KEY and deep-merged at load time.

export const CONFIG_KEY = 'astra.config.v1';

export const DEFAULT_CONTENT = {
  characters: {
    female: { label: 'Female Explorer', hair: '#2a1b17', skin: '#f3cfae', enabled: true },
    male: { label: 'Male Explorer', hair: '#231a16', skin: '#e8bf9a', enabled: true },
  },
  outfits: [
    { id: 'sky', label: 'Sky', top: '#5d93c9', bottom: '#f4efe4' },
    { id: 'maroon', label: 'Maroon', top: '#a9203e', bottom: '#efe6d8' },
    { id: 'meadow', label: 'Meadow', top: '#5f9c6b', bottom: '#f1ead9' },
    { id: 'ember', label: 'Ember', top: '#f2703c', bottom: '#3d4358' },
  ],
  worlds: {
    home: { name: 'Home', subtitle: 'Where every journey begins' },
    space: { name: 'The Space Between', subtitle: 'Three dark stars are calling' },
    farm: { name: 'Farm World', subtitle: 'Fields beneath the golden ring', blackHole: 'BLACK HOLE 01' },
    knowledge: { name: 'Knowledge World', subtitle: 'A city of light with dark streets below', blackHole: 'BLACK HOLE 02' },
    hunger: { name: 'Hunger World', subtitle: 'A thirsty land around a mirror lake', blackHole: 'BLACK HOLE 03' },
  },
  missions: {
    find_oxygen: {
      title: 'Find the Oxygen',
      description: 'Three distant worlds may hold what Mother needs.',
    },
    harvest_day: {
      title: 'Harvest Day',
      description: 'Help the farmer bring in today\'s harvest.',
      required: 12,
      carry: 6,
      reward: 'Oxygen Core',
    },
    share_knowledge: {
      title: 'Share Knowledge',
      description: 'The children below the city have never been taught.',
      required: 4,
      reward: 'Oxygen Core',
    },
    feed_world: {
      title: 'Feed the World',
      description: 'The village granary is empty. Help them fish and cook.',
      wood: 3,
      stone: 3,
      fish: 4,
      reward: 'Oxygen Core',
    },
    home_again: {
      title: 'Home Is Calling',
      description: 'Bring the Oxygen Cores back to Mother.',
    },
  },
  npcs: {
    mother: { name: 'Mother' },
    farmer: {
      name: 'Hollis',
      greet: 'If you help us finish today\'s harvest, I\'ll give you something that may help your mother.',
      thanks: 'The fields will feed us all winter. Here — this glowed in the soil the day you arrived.',
    },
    archivist: {
      name: 'Archivist Venn',
      greet: 'Our libraries hold every answer ever written. Yet the children below have never been inside.',
      thanks: 'You gave them what we locked away. Take this — knowledge should always come with air to breathe.',
    },
    elder: {
      name: 'Elder Suna',
      greet: 'The lake is full of life, but our dock is broken and our hands are tired.',
      thanks: 'Tonight, no one sleeps hungry. The lake gave us this long ago. It belongs with you.',
    },
    children: ['Mira', 'Oren', 'Tali', 'Pip'],
  },
  rewards: {
    core: { name: 'Oxygen Core', perWorld: 1 },
  },
};

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

export function deepMerge(base, over) {
  if (!isObj(over)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over)) {
    out[k] = isObj(base?.[k]) && isObj(over[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

export function loadContent() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? deepMerge(DEFAULT_CONTENT, JSON.parse(raw)) : structuredClone(DEFAULT_CONTENT);
  } catch {
    return structuredClone(DEFAULT_CONTENT);
  }
}
