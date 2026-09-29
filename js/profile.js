// profile.js — profile + streak + daily (storage-crash safe for iOS Private mode)
import {store} from './utils.js';
export const avatars = ['⚡','🔥','👾','🤖','👑','🎯','🐯','🦊','🐍','👻','💎','🚀','🎮','🧠','⚔️','🌟'];
export const defaultStats = { xp:0, played:0, wins:0, best:{} };
function safeParse(raw, fallback){
  try{ const v = JSON.parse(raw || 'null'); return v ?? fallback; }
  catch{ return fallback; }
}
export function loadProfile(){
  const p = safeParse(store.get('gv_profile'), null);
  const s = safeParse(store.get('gv_stats'), null) || {...defaultStats, best:{}};
  if(!s.best || typeof s.best !== 'object') s.best = {};
  return {profile:p, stats:s};
}
export function saveProfile(p){ store.set('gv_profile', JSON.stringify(p)); }
export function saveStats(s){ store.set('gv_stats', JSON.stringify(s)); }
export function levelFromXp(xp){ return Math.floor(xp/300)+1; }
