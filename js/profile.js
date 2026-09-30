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
// Rivals: a plain name list (local). Leaderboards filter server users by it.
export function getRivals(){
  try{
    const v = JSON.parse(store.get('gv_rivals') || '[]');
    return Array.isArray(v) ? v.filter(n => typeof n === 'string').slice(0, 20) : [];
  }catch{ return []; }
}
export function addRival(name){
  const clean = String(name || '').trim().slice(0, 20);
  if(!clean) return false;
  const list = getRivals();
  if(list.some(n => n.toLowerCase() === clean.toLowerCase())) return false;
  list.push(clean);
  store.set('gv_rivals', JSON.stringify(list));
  return true;
}
export function removeRival(name){
  store.set('gv_rivals', JSON.stringify(getRivals().filter(n => n.toLowerCase() !== String(name).toLowerCase())));
}
