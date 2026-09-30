// main.js — app shell: state, hub UI, modals, game lifecycle, boot.
// Game implementations live in js/games/*. Inter-module flow is one-way:
// games/* → (env) → main → {utils, profile, theme, api, data, quests}.
import {toast, confettiBurst, beep, triggerShake, updateSoundBtn, setSound, soundOn, store, sess} from './utils.js';
import {avatars, loadProfile, saveProfile, saveStats, levelFromXp, defaultStats, getRivals, addRival, removeRival} from './profile.js';
import {initTheme} from './theme.js';
import {apiAuth, apiHeartbeat, apiSyncStats, fetchUsers, fetchSummary, fetchGameLB, fetchDailyLB, apiDailyScore, shopBuy, getUserId} from './api.js';
import {games, thumbSVG} from './data.js';
import {initQuests, dayKey, getItems, setItems, getDailyRun, clearDailyRun, dailySeedFor} from './quests.js';
import {makeRng} from './utils.js';
import {mountBreakout} from './games/breakout.js';
import {mountMerge} from './games/merge.js';
import {mountSnake} from './games/snake.js';
import {mountMemory} from './games/memory.js';
import {mountTicTac} from './games/tictac.js';
import {mountBlaster} from './games/blaster.js';
import {mountRunner} from './games/runner.js';
import {mountSimon} from './games/simon.js';

const MOUNTS = {snake: mountSnake, memory: mountMemory, tictac: mountTicTac, blaster: mountBlaster, runner: mountRunner, simon: mountSimon, breakout: mountBreakout, merge: mountMerge};

let selectedAvatar = avatars[0];
let chosenGenre = 'Arcade';
let currentGame = null, currentScore = 0, cleanup = null, powerUsed = false;
let questsApi = null;

const gameModal = document.getElementById('gameModal');
const gameBody = document.getElementById('gameBody');
const gameScoreEl = document.getElementById('gameScore');
const gameBestEl = document.getElementById('gameBest');
const gameTitleEl = document.getElementById('gameTitle');
const gameIconEl = document.getElementById('gameIcon');
const gameTagEl = document.getElementById('gameTag');
const profileModal = document.getElementById('profileModal');

// ---------- hub UI ----------
function renderProfile(){
  const {profile, stats} = loadProfile();
  const name = profile?.name || 'Guest Player';
  const handle = profile ? '@' + profile.name.toLowerCase().replace(/\s+/g, '') : '@guest';
  const av = profile?.avatar || '⚡';
  const lvl = levelFromXp(stats.xp);
  document.getElementById('navAvatar').textContent = av;
  document.getElementById('navName').textContent = profile?.name || 'Guest';
  document.getElementById('navLevel').textContent = 'Lv ' + lvl;
  document.getElementById('heroAvatar').textContent = av;
  document.getElementById('heroName').textContent = name;
  document.getElementById('heroHandle').textContent = handle;
  document.getElementById('heroXp').textContent = stats.xp + ' XP';
  document.getElementById('heroLvl').textContent = 'Level ' + lvl;
  document.getElementById('heroXpBar').style.width = ((stats.xp % 300) / 300 * 100).toFixed(1) + '%';
  document.getElementById('pcPlayed').textContent = stats.played;
  document.getElementById('pcWins').textContent = stats.wins;
  document.getElementById('pcXp2').textContent = stats.xp;
  document.getElementById('pcRank').textContent = profile ? '#' + Math.max(1, 99 - Math.floor(stats.xp / 50)) : '#—';
  const ach = document.getElementById('heroAchievements');
  ach.innerHTML = '';
  const badges = [];
  if(stats.played >= 1) badges.push('🎮 First Play');
  if(stats.wins >= 1) badges.push('🏆 Winner');
  if(stats.xp >= 300) badges.push('⚡ Level Up');
  if(stats.xp >= 1000) badges.push('💎 Elite');
  if(Object.keys(stats.best).length >= 3) badges.push('🌟 Explorer');
  badges.forEach(b => { const s = document.createElement('span'); s.className = 'chip gold'; s.textContent = b; ach.appendChild(s); });
  if(!badges.length){
    const s = document.createElement('span');
    s.className = 'chip'; s.textContent = 'Play a game to earn badges';
    ach.appendChild(s);
  }
  refreshCounts();
}

async function refreshCounts(){
  try{
    const s = await fetchSummary();
    document.getElementById('heroUsers').textContent = Number(s.totalUsers).toLocaleString();
    document.getElementById('heroOnline').textContent = Number(s.onlineNow).toLocaleString();
  }catch{
    const {profile} = loadProfile();
    document.getElementById('heroUsers').textContent = profile ? '1' : '0';
    document.getElementById('heroOnline').textContent = '—';
  }
}

let lbGame = 'all';
function lbRow(rank, av, name, sub, score, scoreSuffix){
  const row = document.createElement('div');
  row.className = 'lb-row';
  row.innerHTML = `<div class="lb-rank ${rank === 0 ? 'gold' : ''}">${rank + 1}</div><div class="lb-av"></div><div><div class="lb-name"></div><small style="color:#9AA0B5"></small></div><div class="lb-xp"><b></b> <span></span></div>`;
  row.querySelector('.lb-av').textContent = av;
  row.querySelector('.lb-name').textContent = name;
  row.querySelector('small').textContent = sub;
  row.querySelector('.lb-xp b').textContent = score;
  row.querySelector('.lb-xp span').textContent = scoreSuffix;
  return row;
}
async function renderLB(){
  const c = document.getElementById('lbList');
  c.innerHTML = '';
  if(lbGame === 'rivals'){
    // rivals board: followed names + you, ranked by XP (all data local-filtered)
    const names = getRivals();
    const {profile, stats} = loadProfile();
    let list = [];
    try{
      const users = await fetchUsers();
      list = users
        .filter(u => names.some(n => n.toLowerCase() === u.username.toLowerCase()))
        .map(u => ({name:u.username, av:u.avatar, xp:u.xp}));
    }catch{}
    if(profile){
      list = list.filter(u => u.name.toLowerCase() !== profile.name.toLowerCase());
      list.push({name:profile.name, av:profile.avatar, xp:stats.xp, me:true});
    }
    list.sort((a, b) => b.xp - a.xp);
    if(!names.length && !profile){
      c.innerHTML = '<div class="act"><span>No rivals yet — accept a challenge or tap ＋ Rival! 👥</span></div>';
      return;
    }
    if(!list.length){
      c.innerHTML = '<div class="act"><span>None of your rivals have played yet. Share a challenge link! 🔗</span></div>';
      return;
    }
    list.slice(0, 10).forEach((u, i) => {
      const row = lbRow(i, u.av, u.name + (u.me ? ' (You)' : ''), 'Level ' + levelFromXp(u.xp), Number(u.xp) || 0, 'XP');
      if(!u.me){
        const x = document.createElement('button');
        x.className = 'btn-mini'; x.textContent = '✕'; x.title = 'Unfollow ' + u.name;
        x.style.marginLeft = 'auto';
        x.addEventListener('click', (e) => { e.stopPropagation(); removeRival(u.name); renderLB(); toast(`Unfollowed ${u.name}`); });
        row.appendChild(x);
      }
      c.appendChild(row);
    });
    return;
  }
  if(lbGame !== 'all'){
    // per-game board: best score per player
    let rows = [];
    try{ rows = await fetchGameLB(lbGame); }catch{}
    const {profile, stats} = loadProfile();
    if(profile && (stats.best[lbGame] || 0) > 0 && !rows.some(r => r.username.toLowerCase() === profile.name.toLowerCase()))
      rows.push({username:profile.name, avatar:profile.avatar, score:stats.best[lbGame]});
    rows.sort((a, b) => b.score - a.score);
    if(!rows.length){
      c.innerHTML = '<div class="act"><span>No scores yet — be the first! 🎮</span></div>';
      return;
    }
    rows.slice(0, 5).forEach((u, i) => {
      const you = loadProfile().profile?.name?.toLowerCase() === String(u.username).toLowerCase();
      c.appendChild(lbRow(i, u.avatar, u.username + (you ? ' (You)' : ''), 'Best score', u.score, 'pts'));
    });
    return;
  }
  const {profile, stats} = loadProfile();
  let list = [];
  try{
    const users = await fetchUsers();
    list = users.slice(0, 5).map(u => ({name:u.username, av:u.avatar, xp:u.xp}));
  }catch{}
  if(profile){
    // avoid duplicating yourself when you already appear in server rows
    list = list.filter(u => u.name.toLowerCase() !== profile.name.toLowerCase());
    list.push({name:profile.name, av:profile.avatar, xp:stats.xp, me:true});
  }
  list.sort((a, b) => b.xp - a.xp);
  if(!list.length){
    c.innerHTML = '<div class="act"><span>No players yet — create a profile and play! 🎮</span></div>';
    return;
  }
  list.slice(0, 5).forEach((u, i) => {
    c.appendChild(lbRow(i, u.av, u.name + (u.me ? ' (You)' : ''), 'Level ' + levelFromXp(u.xp), Number(u.xp) || 0, 'XP'));
  });
}

function renderActivity(){
  const acts = JSON.parse(store.get('gv_act') || '[]');
  const c = document.getElementById('activityList');
  c.innerHTML = '';
  if(!acts.length){
    c.innerHTML = '<div class="act"><span>No activity yet — play a game!</span></div>';
    return;
  }
  acts.forEach(a => {
    const d = document.createElement('div');
    d.className = 'act';
    const s = document.createElement('span'); s.textContent = a.text;
    const t = document.createElement('small'); t.textContent = a.time;
    d.appendChild(s); d.appendChild(t);
    c.appendChild(d);
  });
}

function addActivity(text){
  const acts = JSON.parse(store.get('gv_act') || '[]');
  acts.unshift({text, time:new Date().toLocaleTimeString()});
  store.set('gv_act', JSON.stringify(acts.slice(0, 12)));
  renderActivity();
}

function renderGames(filter = 'all', search = ''){
  const grid = document.getElementById('gamesGrid');
  grid.innerHTML = '';
  const list = games.filter(g => (filter === 'all' || g.cat === filter) && (!search || g.title.toLowerCase().includes(search.toLowerCase())));
  document.getElementById('showingCount').textContent = list.length;
  const {stats} = loadProfile();
  list.forEach(g => {
    const best = stats.best[g.id] || 0;
    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `<div class="card-media thumb-${g.id}" style="background:${g.color}"><div class="thumb-art">${thumbSVG(g.id)}</div><div class="thumb-glow" style="--glow:${g.glow}"></div><span class="thumb-emoji" aria-hidden="true">${g.icon}</span><span class="card-badge">● ${g.tag.toUpperCase()}</span>${best ? `<span class="card-best">BEST ${best}</span>` : ''}<span class="thumb-play">▶</span></div><div class="card-body"><div class="card-title">${g.title} <span style="margin-left:auto;font-size:0.68rem;background:rgba(255,255,255,0.08);padding:4px 8px;border-radius:999px">+${g.xp} XP</span></div><div class="card-desc">${g.desc}</div><div class="card-meta"><span>⭐ ${g.rating}</span><span>🏆 ${best || '—'}</span></div><div class="card-actions"><button class="btn-play" data-play="${g.id}">▶ Play Now</button><button class="btn-icon" data-info="${g.id}" aria-label="About ${g.title}">♡</button></div></div>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => openGame(b.dataset.play)));
  grid.querySelectorAll('[data-info]').forEach(b => b.addEventListener('click', () => {
    const g = games.find(x => x.id === b.dataset.info);
    if(g) toast(`${g.icon} ${g.title} — ${g.desc}`);
  }));
  grid.querySelectorAll('.card-media').forEach(m => m.addEventListener('click', (e) => {
    if(e.target.closest('button')) return;
    const btn = m.parentElement.querySelector('[data-play]');
    if(btn) btn.click();
  }));
}

// ---------- profile modal ----------
function openProfileBase(){
  const {profile} = loadProfile();
  document.getElementById('pName').value = profile?.name || '';
  selectedAvatar = profile?.avatar || avatars[0];
  chosenGenre = profile?.genre || 'Arcade';
  renderAvatarGrid(); renderGenre();
  profileModal.classList.remove('hidden');
}
function closeProfileBase(){ profileModal.classList.add('hidden'); }
let openProfile = openProfileBase, closeProfile = closeProfileBase;

// Premium avatars are locked until earned (level) or bought (shop)
const AVATAR_LOCKS = {
  '👑': {flag:'crown', legacy:'gv_unlock_3', hint:'👑 unlocks at Level 3 — or buy it now in the 🪙 shop'},
  '💎': {flag:'diamond', legacy:'gv_unlock_5', hint:'💎 unlocks at Level 5 — or buy it now in the 🪙 shop'},
};
function avatarUnlocked(a){
  const lock = AVATAR_LOCKS[a];
  if(!lock) return true;
  const items = getItems();
  return !!(items[lock.flag] || store.get(lock.legacy));
}
function renderAvatarGrid(){
  const g = document.getElementById('avatarGrid');
  g.innerHTML = '';
  avatars.forEach(a => {
    const locked = !avatarUnlocked(a);
    const d = document.createElement('div');
    d.className = 'avatar-opt' + (a === selectedAvatar ? ' active' : '') + (locked ? ' locked' : '');
    d.textContent = locked ? '🔒' : a;
    d.setAttribute('role', 'button'); d.setAttribute('tabindex', '0');
    d.setAttribute('aria-label', locked ? 'Locked avatar — ' + AVATAR_LOCKS[a].hint : 'Avatar ' + a);
    d.title = locked ? AVATAR_LOCKS[a].hint : a;
    const pick = () => {
      if(locked){ toast(AVATAR_LOCKS[a].hint); return; }
      selectedAvatar = a; renderAvatarGrid();
    };
    d.addEventListener('click', pick);
    d.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } });
    g.appendChild(d);
  });
}
function renderGenre(){
  document.querySelectorAll('.genre').forEach(b => {
    b.classList.toggle('active', b.dataset.genre === chosenGenre);
    b.onclick = () => { chosenGenre = b.dataset.genre; renderGenre(); };
  });
}
function trapFocus(modal){
  const focusable = modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
  if(!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  function handler(e){
    if(e.key === 'Tab'){
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
    if(e.key === 'Escape'){ if(modal === profileModal) closeProfile(); if(modal === gameModal) closeGame(); }
  }
  modal._trapHandler = handler;
  modal.addEventListener('keydown', handler);
  setTimeout(() => first.focus(), 50);
}
function releaseTrap(modal){
  if(modal._trapHandler) modal.removeEventListener('keydown', modal._trapHandler);
}
openProfile = function(){ openProfileBase(); trapFocus(profileModal); };
closeProfile = function(){ releaseTrap(profileModal); closeProfileBase(); document.getElementById('createProfileBtn')?.focus(); };

// ---------- game lifecycle ----------
function gameEnv(){
  return {
    body: gameBody,
    setScore, awardXp,
    toast, confetti: confettiBurst, beep, shake: triggerShake,
    loadProfile,
    bar: injectRestartBar,
    restart: (c) => addInGameRestart(c),
    onCleanup: (fn) => { cleanup = fn; },
    power: (fn) => { window._powerHandler = fn; },
    remount: () => { if(currentGame) mountGame(currentGame.id); },
    sync: (extra, gameId) => apiSyncStats(extra, gameId || currentGame?.id),
  };
}
function mountGame(id){
  powerUsed = false; window._powerHandler = null;
  gameBody.innerHTML = '';
  document.getElementById('gameControls').innerHTML = '';
  document.getElementById('gameExtra').style.display = 'flex';
  const env = gameEnv();
  // daily-challenge mode: seeded RNG shared by the whole run (survives restarts)
  env.daily = (getDailyRun() === id) ? {seed: dailySeedFor(id), rng: makeRng(dailySeedFor(id))} : null;
  (MOUNTS[id] || mountSnake)(env);
}

function openGame(id){
  const g = games.find(x => x.id === id); if(!g) return;
  currentGame = g; currentScore = 0;
  gameTitleEl.textContent = g.title; gameIconEl.textContent = g.icon; gameTagEl.textContent = g.tag;
  const {stats} = loadProfile();
  gameBestEl.textContent = stats.best[g.id] || 0;
  gameScoreEl.textContent = '0';
  if(cleanup){ try{ cleanup(); }catch{} cleanup = null; }
  gameModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  trapFocus(gameModal);
  mountGame(g.id);
  const extra = document.getElementById('gameExtra');
  extra.style.display = 'flex';
  const isDaily = getDailyRun() === g.id;
  let lbHtml = `<span>🏆 Your Best: ${stats.best[g.id] || 0}</span>`;
  if(isDaily) lbHtml = `<span>📅 DAILY — same layout for everyone today</span>` + lbHtml;
  // per-game leaderboard from the server (async upgrade when it arrives)
  fetchGameLB(g.id).then(rows => {
    if(!rows.length || currentGame?.id !== g.id) return;
    const box = document.getElementById('gameExtra')?.querySelector('.mini-lb');
    if(!box) return;
    const s = document.createElement('span');
    s.textContent = '🌍 ' + rows.slice(0, 3).map(u => `${u.avatar} ${u.username} ${u.score}`).join(' • ');
    box.prepend(s);
  }).catch(() => {});
  // today's daily board next to it
  fetchDailyLB(g.id).then(d => {
    if(currentGame?.id !== g.id) return;
    const box = document.getElementById('gameExtra')?.querySelector('.mini-lb');
    if(!box || !d.rows.length) return;
    const s = document.createElement('span');
    s.textContent = '📅 Today: ' + d.rows.slice(0, 3).map(u => `${u.avatar} ${u.username} ${u.score}`).join(' • ');
    box.appendChild(s);
  }).catch(() => {});
  extra.innerHTML = `<div class="mini-lb">${lbHtml}<span>🔥 Streak ${store.get('gv_streak') || 1}</span><span>🔊 ${soundOn ? 'ON' : 'OFF'}</span></div><button class="btn-mini" id="extraPower">⚡ Power-up (1/game)</button><button class="btn-mini" id="extraTut">❓ Tutorial</button>`;
  document.getElementById('extraPower')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('gv-powerup', {detail:{game:g.id}}));
    toast('⚡ Power-up used!');
  });
  document.getElementById('extraTut')?.addEventListener('click', () => showTutorial(g.id));
  const stat = loadProfile().stats;
  stat.played++; saveStats(stat);
  renderProfile(); addActivity(`Started ${g.title}`);
  try{
    const tk = 'gv_played_' + dayKey();
    const n = Number(sess.get('gv_playedToday') || store.get(tk) || 0) + 1;
    sess.set('gv_playedToday', n); store.set(tk, n);
  }catch{}
  try{
    const gh = JSON.parse(sess.get('gv_ghost') || 'null');
    if(gh && gh.game === g.id){
      const gd = document.createElement('div');
      gd.className = 'mini-lb'; gd.style.marginTop = '6px';
      const s = document.createElement('span');
      s.innerHTML = '👻 Ghost: <b></b> — <b></b> to beat!';
      s.children[0].textContent = gh.name; s.children[1].textContent = gh.score;
      gd.appendChild(s); extra.appendChild(gd);
    }
  }catch{}
  apiSyncStats({action:`Started ${g.title}`, score:0, xp_earned:0}, g.id);
  apiHeartbeat();
  if(!store.get('gv_tut_' + g.id)){
    setTimeout(() => showTutorial(g.id), 600);
    store.set('gv_tut_' + g.id, '1');
  }
}

function showTutorial(id){
  const tips = {
    snake:'WASD/Arrows or D-PAD, P pause, eat 10pts, level up every 30pts, avoid walls. Power-up: slow + ghost 4s.',
    memory:'Flip 2 cards, match = stay. Timer + moves = stars. Hint power-up reveals a pair.',
    tictac:'You X vs AI O. Hard = unbeatable minimax. Win line glows. Hint highlights best move.',
    blaster:'Gold ★ +22, Bomb −12, Freeze ❄ +2s. Combo builds. Slow-Mo power-up 5s.',
    runner:'Space/↑ double-jump, R restart, coins +5, birds fly high.',
    simon:'Watch flash + tone, repeat. Strict resets, speed ramps every 4 lvls, Repeat button.',
    breakout:'Move: mouse / touch / arrows. Angle shots off paddle edges. Gold bricks +30.',
    merge:'Arrows / WASD / swipe / buttons. Merge to 2048. Undo power available.'
  };
  toast(`💡 ${tips[id] || 'Have fun!'}`);
}

function closeGame(){
  clearDailyRun();
  if(cleanup){ try{ cleanup(); }catch{} cleanup = null; }
  releaseTrap(gameModal);
  gameModal.classList.add('hidden');
  document.body.style.overflow = '';
  renderGames(document.querySelector('.filter.active')?.dataset.filter || 'all', document.getElementById('searchInput').value);
  renderProfile(); renderLB(); refreshWallet();
}

function setScore(s){
  currentScore = s;
  gameScoreEl.textContent = s;
  const {stats} = loadProfile();
  const best = stats.best[currentGame.id] || 0;
  if(s > best){ stats.best[currentGame.id] = s; saveStats(stats); gameBestEl.textContent = s; }
}

function awardXp(base){
  const {stats} = loadProfile();
  const streak = Number(store.get('gv_streak') || 1);
  const mult = 1 + Math.min(0.5, (streak - 1) * 0.08);
  const bonus = Math.floor(currentScore / 10);
  const xp = Math.round((base + bonus) * mult);
  stats.xp += xp;
  if(currentScore > 0) stats.wins++;
  saveStats(stats); renderProfile(); renderLB();
  toast(`+${xp} XP ${mult > 1 ? ` (×${mult.toFixed(1)} streak)` : ''} • Score ${currentScore}`);
  addActivity(`Scored ${currentScore} in ${currentGame.title} (+${xp} XP)`);
  confettiBurst(window.innerWidth / 2, 180);
  const lvl = levelFromXp(stats.xp);
  if(lvl === 3 && !store.get('gv_unlock_3')){ store.set('gv_unlock_3', '1'); toast('🎉 Unlocked avatar 👑 at Lv 3!'); confettiBurst(window.innerWidth / 2, 120); }
  if(lvl === 5 && !store.get('gv_unlock_5')){ store.set('gv_unlock_5', '1'); toast('💎 Unlocked avatar 💎 at Lv 5!'); confettiBurst(window.innerWidth / 2, 120); }
  try{
    const gh = JSON.parse(sess.get('gv_ghost') || 'null');
    if(gh && gh.game === currentGame.id && currentScore >= gh.score){
      toast(`👻 You beat ${gh.name}'s ${gh.score}!`);
      confettiBurst(window.innerWidth / 2, 140);
      sess.del('gv_ghost');
      document.getElementById('challengeBanner')?.remove();
    }
  }catch{}
  apiSyncStats({action:`Scored ${currentScore} in ${currentGame.title}`, score:currentScore, xp_earned:xp}, currentGame.id);
  // daily-challenge runs also post to today's board (best per day wins)
  if(getDailyRun() === currentGame.id && currentScore > 0) apiDailyScore(currentGame.id, currentScore);
  if(questsApi) setTimeout(() => questsApi.renderDaily(Number(store.get('gv_streak') || 1)), 400);
}

function injectRestartBar(hint){
  const bar = document.getElementById('gameControls');
  bar.innerHTML = '';
  const hintEl = document.createElement('span');
  hintEl.textContent = hint; hintEl.style.opacity = '0.85';
  const btn = document.createElement('button');
  btn.className = 'btn-primary-lg'; btn.style.padding = '10px 18px'; btn.style.fontSize = '0.95rem';
  btn.textContent = '↻ Start Again';
  btn.addEventListener('click', () => { if(currentGame) mountGame(currentGame.id); });
  bar.appendChild(hintEl); bar.appendChild(btn);
  bar.style.display = 'flex'; bar.style.alignItems = 'center';
  bar.style.justifyContent = 'space-between'; bar.style.gap = '12px'; bar.style.flexWrap = 'wrap';
}
function addInGameRestart(container){
  const wrap = document.createElement('div');
  wrap.style.marginTop = '14px'; wrap.style.display = 'flex'; wrap.style.justifyContent = 'center';
  const btn = document.createElement('button');
  btn.className = 'btn-primary-lg'; btn.textContent = '↻ Start Again';
  btn.addEventListener('click', () => { if(currentGame) mountGame(currentGame.id); });
  wrap.appendChild(btn); container.appendChild(wrap);
}

window.addEventListener('gv-powerup', e => {
  if(powerUsed){ toast('Power-up already used this game'); return; }
  powerUsed = true;
  toast('⚡ Power-up activated for ' + e.detail.game);
  if(window._powerHandler) window._powerHandler();
});

// ---------- shop ----------
const SHOP = [
  {id:'freeze', icon:'❄', name:'Streak freeze', desc:'Saves your streak once when you miss a day.', cost:100},
  {id:'crown', icon:'👑', name:'Crown avatar', desc:'Unlocks the 👑 avatar immediately.', cost:200},
  {id:'diamond', icon:'💎', name:'Diamond avatar', desc:'Unlocks the 💎 avatar immediately.', cost:300},
];
function setCoinsPill(){
  const el = document.getElementById('coinsCount');
  if(el) el.textContent = store.get('gv_coins') || '0';
}
async function refreshWallet(){
  const id = getUserId();
  if(!id){ setCoinsPill(); return; }
  try{
    const users = await fetchUsers();
    const me = users.find(u => String(u.id) === String(id));
    if(me){
      store.set('gv_coins', me.coins || 0);
      setItems(me.items || {});
    }
  }catch{}
  setCoinsPill();
}
function renderShop(){
  const box = document.getElementById('shopItems');
  if(!box) return;
  const coins = Number(store.get('gv_coins') || 0);
  const items = getItems();
  document.getElementById('shopBalance').textContent = coins;
  box.innerHTML = '';
  SHOP.forEach(it => {
    const owned = it.id === 'freeze' ? `Owned: x${items.freezes || 0}` : (items[it.id] ? 'Owned ✓' : null);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:12px';
    const em = document.createElement('div');
    em.style.fontSize = '1.8rem'; em.textContent = it.icon;
    const mid = document.createElement('div');
    mid.style.flex = '1';
    const nm = document.createElement('b'); nm.textContent = it.name;
    const ds = document.createElement('div');
    ds.style.cssText = 'color:var(--muted);font-size:0.85rem'; ds.textContent = it.desc;
    mid.appendChild(nm); mid.appendChild(ds);
    const btn = document.createElement('button');
    btn.className = 'btn-neon'; btn.style.padding = '8px 14px';
    btn.textContent = owned || `Buy 🪙${it.cost}`;
    if(owned && it.id !== 'freeze') btn.disabled = true, btn.style.opacity = '0.5';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try{
        const j = await shopBuy(it.id);
        store.set('gv_coins', j.coins);
        setItems(j.items);
        setCoinsPill(); renderShop(); renderAvatarGrid();
        toast(`Bought ${it.icon} ${it.name}!`);
        confettiBurst(window.innerWidth / 2, 200);
      }catch(e){ toast(e.message); btn.disabled = false; }
    });
    row.appendChild(em); row.appendChild(mid); row.appendChild(btn);
    box.appendChild(row);
  });
}
function openShop(){ renderShop(); document.getElementById('shopModal').classList.remove('hidden'); }
function closeShop(){ document.getElementById('shopModal').classList.add('hidden'); }

// ---------- boot ----------
initTheme();
updateSoundBtn();
document.getElementById('soundToggle')?.addEventListener('click', () => {
  setSound(!soundOn);
  toast(soundOn ? 'Sound ON' : 'Sound OFF');
});
document.getElementById('createProfileBtn').addEventListener('click', openProfile);
document.getElementById('heroProfileBtn').addEventListener('click', openProfile);
document.getElementById('editProfileBtn2').addEventListener('click', openProfile);
document.getElementById('nav-profile-btn').addEventListener('click', (e) => { e.preventDefault(); openProfile(); });
document.getElementById('profilePill').addEventListener('click', openProfile);
document.getElementById('closeProfile').addEventListener('click', closeProfile);
profileModal.addEventListener('click', (e) => { if(e.target === profileModal) closeProfile(); });
document.getElementById('saveProfile').addEventListener('click', async () => {
  const name = document.getElementById('pName').value.trim();
  if(name.length < 2){ toast('Enter at least 2 characters'); return; }
  if(!avatarUnlocked(selectedAvatar)){ toast(AVATAR_LOCKS[selectedAvatar].hint); return; }
  const p = {name, avatar:selectedAvatar, genre:chosenGenre, created:Date.now()};
  saveProfile(p); renderProfile(); renderLB();
  const dbUser = await apiAuth(p);
  if(dbUser){
    store.set('gv_coins', dbUser.coins || 0);
    setItems(dbUser.items || {});
    setCoinsPill();
  }
  toast(`Welcome, ${name}! ⚡`);
  closeProfile(); apiHeartbeat(); refreshCounts();
});
document.querySelectorAll('.filter').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  renderGames(b.dataset.filter, document.getElementById('searchInput').value);
}));
document.getElementById('searchInput').addEventListener('input', (e) => {
  const active = document.querySelector('.filter.active')?.dataset.filter || 'all';
  renderGames(active, e.target.value);
});
document.getElementById('lbGame')?.addEventListener('change', (e) => {
  lbGame = e.target.value;
  renderLB();
});
document.getElementById('addRivalBtn')?.addEventListener('click', () => {
  const name = (prompt('Rival player name (exact):') || '').trim();
  if(!name) return;
  if(addRival(name)){
    toast(`👥 Following ${name}!`);
    lbGame = 'rivals';
    document.getElementById('lbGame').value = 'rivals';
    renderLB();
  } else toast('Already following (or invalid name).');
});
document.getElementById('closeGame').addEventListener('click', closeGame);
document.getElementById('gameShare')?.addEventListener('click', () => {
  const {profile} = loadProfile();
  const me = encodeURIComponent(profile?.name || 'A friend');
  const gid = currentGame?.id || 'snake';
  const url = `${location.origin}${location.pathname}?challenge=${gid}-${currentScore}-${me}`;
  const text = `I scored ${currentScore} in ${currentGame?.title || 'GameVerse'}! Beat me: ${url}`;
  if(navigator.share){ navigator.share({title:'GameVerse challenge', text, url}).catch(() => {}); }
  else if(navigator.clipboard){ navigator.clipboard.writeText(text); toast('Challenge link copied — share it! 📋'); }
  else toast(text);
  confettiBurst(window.innerWidth / 2, 120);
});
gameModal.addEventListener('click', (e) => { if(e.target === gameModal) closeGame(); });
document.getElementById('gameRestart').addEventListener('click', () => { if(currentGame) mountGame(currentGame.id); });
document.getElementById('howToBtn')?.addEventListener('click', () => document.getElementById('howToModal').classList.remove('hidden'));
document.getElementById('closeHowTo')?.addEventListener('click', () => document.getElementById('howToModal').classList.add('hidden'));
document.getElementById('howToModal')?.addEventListener('click', (e) => { if(e.target === document.getElementById('howToModal')) e.currentTarget.classList.add('hidden'); });
document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && !gameModal.classList.contains('hidden')) closeGame(); });
document.getElementById('resetProgress').addEventListener('click', () => {
  if(confirm('Reset all XP and progress?')){
    store.del('gv_stats'); store.del('gv_act');
    store.set('gv_stats', JSON.stringify({...defaultStats, best:{}}));
    renderProfile(); renderLB(); renderActivity(); renderGames();
    toast('Progress reset');
  }
});

questsApi = initQuests({renderProfile, apiSyncStats, openGame, openProfile, games});
questsApi.checkIncomingChallenge();
// First-run welcome: no profile and never visited → invite to create one
const isFirstRun = !store.get('gv_lastDay') && !store.get('gv_welcomed') && !loadProfile().profile;
if(isFirstRun){
  store.set('gv_welcomed', '1');
  setTimeout(() => {
    toast('👋 Welcome to GameVerse! Create your profile to save progress.');
    openProfile();
  }, 1400);
}
document.getElementById('coinsPill')?.addEventListener('click', openShop);
document.getElementById('closeShop')?.addEventListener('click', closeShop);
document.getElementById('shopModal')?.addEventListener('click', (e) => { if(e.target === document.getElementById('shopModal')) closeShop(); });
if('serviceWorker' in navigator){
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
renderAvatarGrid(); renderGenre();
document.getElementById('heroTotalGames').textContent = games.length;
renderProfile(); renderLB(); renderActivity(); renderGames(); refreshWallet();
setTimeout(() => questsApi.updateStreak(), 600);
setInterval(apiHeartbeat, 30000);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') apiHeartbeat(); });
setTimeout(apiHeartbeat, 2000);
window.__gvBooted = true; // boot watchdog in index.html watches this flag
const APP_SW_VERSION = 'gv-v3'; // must match const V in sw.js (tests enforce this)
function checkAppVersion(){
  // If the server has a newer service worker than this running bundle,
  // invite (don't force) a refresh so new games/updates actually appear.
  fetch('sw.js', {cache:'no-store'}).then(r => {
    if(!r.ok) throw 0;
    return r.text();
  }).then(t => {
    const m = t.match(/const V = '([^']+)'/);
    if(!m || m[1] === APP_SW_VERSION) return;
    const box = document.getElementById('toast');
    if(!box) return;
    box.textContent = '↻ New version available — tap here to update';
    box.classList.remove('hidden');
    box.onclick = () => location.reload();
    clearTimeout(checkAppVersion._t);
    checkAppVersion._t = setTimeout(() => { box.classList.add('hidden'); box.onclick = null; }, 9000);
  }).catch(() => {});
}
setTimeout(checkAppVersion, 4000);
