// quests.js — streaks, rotating daily/weekly quests, challenge links.
// Pure helpers are exported for unit tests; initQuests(deps) wires DOM + side effects.
import {toast, confettiBurst, store, sess} from './utils.js';
import {loadProfile, saveStats, addRival} from './profile.js';

// Local wallet cache (server is source of truth; main.js refreshes via /api/users)
export function getItems(){
  try{ return JSON.parse(store.get('gv_items') || '{}'); }catch{ return {}; }
}
export function setItems(it){ store.set('gv_items', JSON.stringify(it || {})); }

export const QUEST_POOL = [
  {id:'q-snake50', game:'snake', label:'🐍 Score 50 in Snake', xp:40, check:s => (s.best.snake || 0) >= 50},
  {id:'q-snake100', game:'snake', label:'🐍 Score 100 in Snake', xp:70, check:s => (s.best.snake || 0) >= 100},
  {id:'q-mem-win', game:'memory', label:'🧠 Finish Memory Flip', xp:40, check:s => (s.best.memory || 0) > 0},
  {id:'q-mem-150', game:'memory', label:'🧠 Score 150 in Memory', xp:70, check:s => (s.best.memory || 0) >= 150},
  {id:'q-blast200', game:'blaster', label:'🎯 Score 200 in Blaster', xp:50, check:s => (s.best.blaster || 0) >= 200},
  {id:'q-blast400', game:'blaster', label:'🎯 Score 400 in Blaster', xp:80, check:s => (s.best.blaster || 0) >= 400},
  {id:'q-run100', game:'runner', label:'🏃 Score 100 in Runner', xp:50, check:s => (s.best.runner || 0) >= 100},
  {id:'q-run250', game:'runner', label:'🏃 Score 250 in Runner', xp:80, check:s => (s.best.runner || 0) >= 250},
  {id:'q-simon5', game:'simon', label:'✨ Reach Simon level 5', xp:50, check:s => (s.best.simon || 0) >= 112},
  {id:'q-ttt-win', game:'tictac', label:'⭕ Beat TicTacToe AI', xp:40, check:s => (s.best.tictac || 0) >= 100},
  {id:'q-brk200', game:'breakout', label:'🧱 Score 200 in Breakout', xp:50, check:s => (s.best.breakout || 0) >= 200},
  {id:'q-merge1k', game:'merge', label:'🔢 Score 1000 in 2048', xp:50, check:s => (s.best.merge || 0) >= 1000},
  {id:'q-play3', game:null, label:'🎮 Play 3 games today', xp:30, check:() => Number(sess.get('gv_playedToday') || 0) >= 3},
  {id:'q-xp200', game:null, label:'⚡ Earn 200 XP total', xp:30, check:s => s.xp >= 200},
];
export const WEEKLY_QUEST = {id:'q-weekly', game:null, label:'🏆 Weekly: play all 8 games', xp:150, check:s => Object.keys(s.best || {}).length >= 8};

export function hashStr(str){
  let h = 2166136261;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function dayKey(d = new Date()){ return d.toISOString().slice(0, 10); }
export function weekKey(d = new Date()){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fday = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - fday + 3);
  return t.getUTCFullYear() + '-W' + String(1 + Math.round((t - first) / (7 * 864e5))).padStart(2, '0');
}
export function pickDaily(dateKey){
  const h = hashStr('gv-' + dateKey);
  const pool = [...QUEST_POOL];
  const out = [];
  for(let i = 0; i < 3 && pool.length; i++) out.push(pool.splice((h + i * 97 + out.length * 31) % pool.length, 1)[0]);
  return out;
}
export function parseChallenge(search){
  try{
    const p = new URLSearchParams(search);
    const c = p.get('challenge'); if(!c) return null;
    const [game, score, ...nameParts] = c.split('-');
    const s = Math.min(5000, Math.max(1, parseInt(score) || 0));
    if(!game || !s) return null;
    return {game, score:s, name:decodeURIComponent(nameParts.join('-') || 'Friend').slice(0, 20)};
  }catch{ return null; }
}

// Daily-run state: which game (if any) the next/ongoing modal session plays
// in seeded daily-challenge mode. Cleared when the game modal closes.
let dailyRun = null;
export function setDailyRun(id){ dailyRun = id; }
export function getDailyRun(){ return dailyRun; }
export function clearDailyRun(){ dailyRun = null; }
export function dailySeedFor(id){ return dayKey() + ':' + id; }

// deps: {renderProfile, apiSyncStats, openGame, openProfile, games}
export function initQuests(deps){
  const {renderProfile, apiSyncStats, openGame, openProfile, games} = deps;

  function historyChips(){
    // last 6 days (excluding today): count claimed quest keys per day
    const out = [];
    for(let i = 1; i <= 6; i++){
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      let n = 0;
      for(const key of store.keys()){
        if(key && key.startsWith('gv_claimed_d:' + iso + ':')) n++;
      }
      const wd = d.toLocaleDateString(undefined, {weekday:'short'});
      out.push(`<div class="daily-chip" title="Quests completed ${iso}">${wd} ${n}/3</div>`);
    }
    return out.join('');
  }

  function onboardingChips(){
    const {profile, stats} = loadProfile();
    const chips = [];
    if(!profile) chips.push(`<button class="daily-chip active" data-onboard="profile" style="cursor:pointer">① Create your profile →</button>`);
    else if((stats.played || 0) < 1) chips.push(`<button class="daily-chip active" data-onboard="play" style="cursor:pointer">② Play your first game →</button>`);
    else if(!store.get('gv_onboard_done')){
      store.set('gv_onboard_done', '1');
      stats.xp += 50; saveStats(stats);
      setTimeout(() => { toast('🎉 Onboarding complete! +50 XP'); }, 1200);
      apiSyncStats({action:'Onboarding complete', score:0, xp_earned:50});
      renderProfile();
    }
    return chips.join('');
  }

  function renderDaily(streak){
    const strip = document.getElementById('dailyStrip'); if(!strip) return;
    const {stats} = loadProfile();
    const dk = dayKey(), wk = weekKey();
    const daily = pickDaily(dk);
    const all = [...daily.map(q => ({...q, key:'d:' + dk + ':' + q.id})), {...WEEKLY_QUEST, key:'w:' + wk + ':' + WEEKLY_QUEST.id}];
    let newlyDone = 0;
    all.forEach(q => {
      const done = q.check(stats);
      const ckey = 'gv_claimed_' + q.key;
      if(done && !store.get(ckey)){
        store.set(ckey, '1');
        stats.xp += q.xp; saveStats(stats);
        newlyDone++;
        setTimeout(() => { toast(`✅ Quest done: ${q.label} +${q.xp} XP`); confettiBurst(window.innerWidth / 2, 160); }, 400 * newlyDone);
        apiSyncStats({action:`Quest done: ${q.label}`, score:0, xp_earned:q.xp});
      }
    });
    if(newlyDone) renderProfile();
    const cur = loadProfile().stats;
    const doneCount = all.filter(q => q.check(cur)).length;
    const pct = Math.round(doneCount / all.length * 100);
    strip.innerHTML = `
      <div class="daily-chip active">🔥 ${streak} Day Streak</div>
      <div class="daily-chip">🎯 Today ${doneCount}/${all.length}</div>
      <div class="daily-progress"><div style="width:${pct}%"></div></div>
      ${onboardingChips()}
      ${all.map(q => { const d = q.check(cur); return `<div class="daily-chip ${d ? 'active' : ''}" title="+${q.xp} XP">${d ? '✅' : '○'} ${q.label} <b>+${q.xp}</b></div>`; }).join('')}
      <button class="daily-chip active" data-daily="snake" style="cursor:pointer" title="Same layout for everyone today">🎯 Snake daily</button>
      <button class="daily-chip active" data-daily="memory" style="cursor:pointer" title="Same shuffle for everyone today">🎯 Memory daily</button>
      <button class="daily-chip active" data-daily="simon" style="cursor:pointer" title="Same sequence for everyone today">🎯 Simon daily</button>
      ${historyChips()}
      <div class="daily-chip">💡 Tip: quests rotate daily • weekly = all 6 games</div>
    `;
    strip.querySelector('[data-onboard="profile"]')?.addEventListener('click', () => openProfile());
    strip.querySelector('[data-onboard="play"]')?.addEventListener('click', () => document.getElementById('games')?.scrollIntoView({behavior:'smooth'}));
    strip.querySelectorAll('[data-daily]').forEach(b => b.addEventListener('click', () => {
      setDailyRun(b.dataset.daily);
      openGame(b.dataset.daily);
    }));
  }

  function showChallengeBanner(ch){
    let bar = document.getElementById('challengeBanner');
    if(!bar){
      bar = document.createElement('div');
      bar.id = 'challengeBanner';
      bar.style.cssText = 'max-width:1280px;margin:12px auto 0;padding:12px 16px;border-radius:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:linear-gradient(135deg,rgba(255,106,0,0.16),rgba(255,184,0,0.1));border:1px solid rgba(255,184,0,0.3);font-weight:800';
      const nav = document.querySelector('.nav');
      nav ? nav.after(bar) : document.body.prepend(bar);
    }
    const gname = (games.find(g => g.id === ch.game)?.title) || ch.game;
    // escape name (comes from URL)
    const safe = document.createElement('span');
    safe.innerHTML = `👻 <b></b> challenged you: beat <b>${ch.score}</b> in <b>${gname}</b>!`;
    safe.querySelector('b').textContent = ch.name;
    bar.innerHTML = '';
    bar.appendChild(safe);
    const accept = document.createElement('button');
    accept.className = 'btn-neon'; accept.style.padding = '8px 14px'; accept.textContent = 'Accept Challenge →';
    accept.addEventListener('click', () => {
      if(addRival(ch.name)) toast(`👥 ${ch.name} added to your rivals!`);
      openGame(ch.game);
    });
    const dismiss = document.createElement('button');
    dismiss.className = 'btn-mini'; dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => { bar.remove(); history.replaceState({}, '', location.pathname); sess.del('gv_ghost'); });
    bar.appendChild(accept); bar.appendChild(dismiss);
  }

  function checkIncomingChallenge(){
    const ch = parseChallenge(location.search);
    if(!ch) return;
    sess.set('gv_ghost', JSON.stringify(ch));
    setTimeout(() => { showChallengeBanner(ch); toast(`👻 Challenge: beat ${ch.score}!`); }, 800);
  }

  function updateStreak(){
    const today = new Date().toDateString();
    const last = store.get('gv_lastDay');
    let streak = Number(store.get('gv_streak') || 0);
    if(last !== today){
      const y = new Date(); y.setDate(y.getDate() - 1);
      if(last === y.toDateString()) streak += 1;
      else if(last){
        // missed at least one day — burn a streak freeze if owned
        const items = getItems();
        if((items.freezes || 0) > 0){
          items.freezes -= 1; setItems(items);
          streak += 1;
          setTimeout(() => toast(`❄ Streak freeze used! Streak saved at ${streak} 🔥`), 900);
        } else streak = 1;
      }
      else streak = 1;
      store.set('gv_streak', streak);
      store.set('gv_lastDay', today);
      const bonus = 20 + Math.min(30, streak * 5);
      const s = loadProfile().stats; s.xp += bonus; saveStats(s);
      setTimeout(() => toast(`🔥 Day ${streak} streak! +${bonus} XP daily bonus`), 900);
      apiSyncStats({action:`Daily streak ${streak}`, xp_earned:bonus, score:streak});
    }
    const badge = document.getElementById('streakBadge');
    if(badge) badge.textContent = `🔥 Streak ${streak} • +${20 + Math.min(30, streak * 5)} XP daily`;
    renderDaily(streak);
  }

  return {renderDaily, updateStreak, showChallengeBanner, checkIncomingChallenge};
}
