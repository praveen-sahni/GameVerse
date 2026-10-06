// api.js — backend sync (auth, heartbeat, stats). Depends only on utils + profile + config.
import {toast, store} from './utils.js';
import {loadProfile} from './profile.js';
import {apiUrl} from './config.js';

export function getUserId(){ return store.get('gv_userId'); }
export function getToken(){ return store.get('gv_token') || ''; }

export async function apiAuth(profile){
  const pin = document.getElementById('pPin')?.value.trim() || '';
  if(pin && !/^\d{4}$/.test(pin)){ toast('PIN must be 4 digits'); throw new Error('pin'); }
  try{
    const r = await fetch(apiUrl('/api/auth'), {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username: profile.name, avatar: profile.avatar, genre: profile.genre, pin: pin || '0000',
        website: document.getElementById('pWebsite')?.value || ''})});
    if(!r.ok){ const err = await r.json().catch(() => ({error:'auth failed'})); toast(err.error || 'Auth failed'); throw new Error(err.error); }
    const data = await r.json();
    store.set('gv_userId', data.user.id);
    store.set('gv_token', data.token || '');
    return data.user;
  }catch(e){ if(e.message !== 'pin') console.warn('DB offline', e); return null; }
}

export async function apiHeartbeat(){
  const id = getUserId(); if(!id) return;
  try{
    await fetch(apiUrl('/api/heartbeat'), {method:'POST', headers:{'Content-Type':'application/json', 'x-gv-token': getToken()},
      body: JSON.stringify({userId: Number(id)})});
  }catch{}
}

export async function apiSyncStats(extra, gameId){
  const id = getUserId(); if(!id) return;
  const {stats} = loadProfile();
  try{
    await fetch(apiUrl('/api/stats'), {method:'POST', headers:{'Content-Type':'application/json', 'x-gv-token': getToken()},
      body: JSON.stringify({userId: Number(id), xp: stats.xp, played: stats.played, wins: stats.wins,
        best: stats.best, action: extra?.action, score: extra?.score, xp_earned: extra?.xp_earned,
        gameId: extra?.gameId || gameId || undefined, draw: extra?.draw === true || undefined})});
  }catch{}
}

export async function fetchSummary(){
  const r = await fetch(apiUrl('/api/stats/summary'));
  if(!r.ok) throw new Error('summary failed');
  return r.json();
}

export async function fetchUsers(){
  const r = await fetch(apiUrl('/api/users'));
  if(!r.ok) throw new Error('users failed');
  return r.json();
}

export async function fetchGameLB(gameId){
  const r = await fetch(apiUrl('/api/leaderboard/' + encodeURIComponent(gameId)));
  if(!r.ok) throw new Error('leaderboard failed');
  return r.json();
}

export async function apiDailyScore(gameId, score){
  const id = getUserId(); if(!id) return null;
  try{
    const r = await fetch(apiUrl('/api/daily/score'), {method:'POST',
      headers:{'Content-Type':'application/json', 'x-gv-token': getToken()},
      body: JSON.stringify({userId: Number(id), game: gameId, score})});
    if(!r.ok) return null;
    return r.json();
  }catch{ return null; }
}

export async function fetchDailyLB(gameId, day){
  const q = day ? '?day=' + encodeURIComponent(day) : '';
  const r = await fetch(apiUrl('/api/daily/' + encodeURIComponent(gameId) + q));
  if(!r.ok) throw new Error('daily leaderboard failed');
  return r.json();
}

export async function shopBuy(item){
  const id = getUserId(); if(!id) throw new Error('no user');
  const r = await fetch(apiUrl('/api/shop/buy'), {method:'POST',
    headers:{'Content-Type':'application/json', 'x-gv-token': getToken()},
    body: JSON.stringify({userId: Number(id), item})});
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(j.error || 'Buy failed');
  return j; // {ok, coins, items}
}
