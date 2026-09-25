// Supabase cloud layer. Optional: with no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the
// game runs entirely on localStorage. Players are signed in anonymously and Row Level
// Security limits each browser to its own saves; only accounts in `admins` see everything.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudEnabled = !!(URL && KEY);
export const supabase = cloudEnabled ? createClient(URL, KEY, { auth: { persistSession: true, storageKey: 'astra.auth' } }) : null;

const key = (nick) => nick.trim().toLowerCase();
const withTimeout = (p, ms = 4000) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

let readyPromise = null;

/** Ensure a (possibly anonymous) session exists. Resolves to the user or null. */
export function ready() {
  if (!cloudEnabled) return Promise.resolve(null);
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) return data.session.user;
        const res = await supabase.auth.signInAnonymously();
        if (res.error) { console.warn('[cloud] anonymous sign-in failed:', res.error.message); return null; }
        return res.data.user;
      } catch (e) {
        console.warn('[cloud] offline:', e.message);
        return null;
      }
    })();
  }
  return readyPromise;
}

/** Admin content overrides stored in the cloud (merged over defaults + local overrides). */
export async function loadRemoteConfig() {
  if (!cloudEnabled) return null;
  const res = await withTimeout(supabase.from('game_config').select('content').eq('id', 1).maybeSingle());
  return res?.data?.content || null;
}

let pushTimer = null;
let pending = null;

/** Debounced upsert of the player's save. */
export function pushSave(state) {
  if (!cloudEnabled || !state) return;
  pending = structuredClone(state);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flushPush, 2000);
}

export async function flushPush() {
  if (!pending) return;
  const state = pending;
  pending = null;
  const user = await ready();
  if (!user) return;
  const { error } = await supabase.from('players').upsert({
    owner: user.id, nickname_key: key(state.nickname), state, updated_at: new Date().toISOString(),
  });
  if (error) console.warn('[cloud] save failed:', error.message);
}

/** Fetch this browser's cloud save for a nickname (to pick up admin edits). */
export async function pullSave(nickname) {
  if (!cloudEnabled) return null;
  const user = await withTimeout(ready());
  if (!user) return null;
  const res = await withTimeout(supabase.from('players').select('state, admin_edited_at, updated_at').eq('owner', user.id).eq('nickname_key', key(nickname)).maybeSingle());
  return res?.data || null;
}

/** Separate client for the admin console (its own session, never the anonymous player's). */
export function adminClient() {
  return cloudEnabled ? createClient(URL, KEY, { auth: { persistSession: true, storageKey: 'astra.admin.auth' } }) : null;
}
