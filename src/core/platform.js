// Game-portal integration. The website build (VITE_PORTAL unset) uses plain localStorage and
// never loads a portal SDK. The CrazyGames build (`npm run build:crazygames`) loads the
// CrazyGames SDK v3 and routes saves, mute, ad breaks and gameplay events through it.
// Every SDK call is guarded, so the game keeps running if the SDK is missing or fails.

export const PORTAL = import.meta.env.VITE_PORTAL || '';
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

let sdk = null;
let playing = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/** Load and start the portal SDK. Call once, before anything reads saves. */
export async function initPlatform() {
  if (PORTAL !== 'crazygames') return;
  try {
    if (!window.CrazyGames?.SDK) await loadScript(SDK_URL);
    await window.CrazyGames.SDK.init();
    // 'disabled' means the game is running outside CrazyGames: fall back to localStorage.
    if (window.CrazyGames.SDK.environment !== 'disabled') sdk = window.CrazyGames.SDK;
  } catch (e) {
    console.warn('[platform] CrazyGames SDK unavailable', e);
  }
}

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

/** localStorage-compatible store: the CrazyGames Data Module inside the portal, localStorage elsewhere. */
export const store = {
  getItem: (k) => safe(() => (sdk?.data ? sdk.data.getItem(k) : localStorage.getItem(k)), null),
  setItem: (k, v) => safe(() => (sdk?.data ? sdk.data.setItem(k, v) : localStorage.setItem(k, v))),
  removeItem: (k) => safe(() => (sdk?.data ? sdk.data.removeItem(k) : localStorage.removeItem(k))),
};

export function loadingStart() { safe(() => sdk?.game.loadingStart()); }
export function loadingStop() { safe(() => sdk?.game.loadingStop()); }

/** Tell the portal whether the player is actively playing (it uses this to time ads and pause). */
export function setPlaying(on) {
  if (!sdk || on === playing) return;
  playing = on;
  safe(() => (on ? sdk.game.gameplayStart() : sdk.game.gameplayStop()));
}

/** A small celebration moment (earning a core, the finale). */
export function happytime() { safe(() => sdk?.game.happytime()); }

/** Portal-level mute (the CrazyGames mute button). cb(muted) runs now and on every change. */
export function onPortalMute(cb) {
  if (!sdk) return;
  safe(() => cb(!!sdk.game.settings?.muteAudio));
  safe(() => sdk.game.addSettingsChangeListener((s) => cb(!!s?.muteAudio)));
}

/** Midgame ad at a natural break. Resolves when the ad ends, fails or isn't available. */
export function midgameAd({ onStart } = {}) {
  if (!sdk) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    // never leave the player stuck if the SDK never calls back
    const timer = setTimeout(finish, 45000);
    const end = () => { clearTimeout(timer); finish(); };
    try {
      sdk.ad.requestAd('midgame', { adStarted: () => onStart?.(), adFinished: end, adError: end });
    } catch { end(); }
  });
}
