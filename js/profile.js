// profile.js — profile + streak + daily
export const avatars = ['⚡','🔥','👾','🤖','👑','🎯','🐯','🦊','🐍','👻','💎','🚀','🎮','🧠','⚔️','🌟'];
export const defaultStats = { xp:0, played:0, wins:0, best:{} };
export function loadProfile(){
  const p=JSON.parse(localStorage.getItem('gv_profile')||'null');
  const s=JSON.parse(localStorage.getItem('gv_stats')||'null') || {...defaultStats, best:{}};
  return {profile:p, stats:s};
}
export function saveProfile(p){ localStorage.setItem('gv_profile', JSON.stringify(p)); }
export function saveStats(s){ localStorage.setItem('gv_stats', JSON.stringify(s)); }
export function levelFromXp(xp){ return Math.floor(xp/300)+1; }
