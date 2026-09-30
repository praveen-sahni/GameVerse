// games/blaster.js — Aim Blaster+ v4: layered bullseyes, shockwave impacts,
// custom crosshair, overlap-free spawning, countdown start, rising hit pitch,
// reaction bonus, jackpot target, tier callouts, true pause-freeze, end panel.
// Mounts into env.body; talks to the app only via env. XP formula unchanged.
export function mountBlaster(env){
  env.body.innerHTML = `<div style="text-align:center;width:100%"><div class="hud-row"><span class="hud-pill">⏱ <b id="blasterTime">30</b>s</span><span class="hud-pill">🎯 <b id="blasterHits">0</b></span><span class="hud-pill">📊 <b id="blasterAcc">100%</b></span><span class="hud-pill" id="blasterComboPill">🔥 <b id="blasterCombo">x1</b></span><span class="hud-pill">Lv <b id="blasterLvl">1</b></span><button class="btn-mini" id="blasterPause">⏸</button><div class="combo-wrap"><div class="combo-fill" id="blasterComboFill"></div></div><div style="flex:1;min-width:100px;max-width:160px;height:6px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden"><div id="blasterBar" style="height:100%;width:100%;background:linear-gradient(90deg,#00E5CC,#FFB800);transition:width 0.2s"></div></div></div><div class="blaster-area" id="blasterArea"><div class="bl-xhair" id="blXhair"></div><div class="bl-count hidden" id="blCount">3</div><div class="start-overlay" id="blasterStart"><div class="start-title">🎯 Aim Blaster</div><div class="start-hint">Hit targets fast — quicker hits pay more • Gold ★ • Jackpot 💰 • Avoid 💣</div><button class="btn-primary-lg start-btn" id="blasterStartBtn">▶ Start</button></div></div></div>`;
  env.bar('Fast hits pay more • Gold ★ • Jackpot 💰 • Lv2+ targets drift • Sudden-death 2x');
  env.restart(env.body);
  const area = document.getElementById('blasterArea');
  const xhair = document.getElementById('blXhair');
  let hits = 0, clicks = 0, time = 30;
  let alive = true, paused = false, started = false;
  let combo = 0, maxCombo = 0, level = 1, sudden = false;
  let timer = null, spawnTimer = null, decayTimer = null, slowT = null;
  let comboLife = 0, spawnRate = 380;
  const live = []; // live target entries for overlap-free spawning + pause freeze

  function setPaused(v){
    if(v === paused) return;
    paused = v;
    const b = document.getElementById('blasterPause');
    if(b) b.textContent = paused ? '▶' : '⏸';
    // true freeze: disarm every target's timers, banking remaining life
    const now = Date.now();
    live.forEach(o => {
      if(o.gone) return;
      if(v){
        clearTimeout(o.kill); clearInterval(o.shrink);
        o.kill = null; o.shrink = null;
        o.remaining = Math.max(150, o.life - (now - o.born));
      } else {
        o.born = Date.now();
        o.life = o.remaining || o.life;
        o.remaining = 0;
        o.shrink = setInterval(() => shrinkTick(o), 60);
        o.kill = setTimeout(() => expireTarget(o), o.life);
      }
    });
  }
  document.getElementById('blasterPause').addEventListener('click', () => setPaused(!paused));
  function onVis(){
    if(document.hidden && alive && started && !paused){ setPaused(true); env.toast('⏸ Auto-paused — tab hidden'); }
  }
  document.addEventListener('visibilitychange', onVis);

  // custom crosshair follows the pointer (desktop only; hidden on touch via CSS)
  area.addEventListener('mousemove', e => {
    const r = area.getBoundingClientRect();
    xhair.style.left = (e.clientX - r.left) + 'px';
    xhair.style.top = (e.clientY - r.top) + 'px';
  });
  area.addEventListener('mousedown', () => xhair.classList.add('fire'));
  area.addEventListener('mouseup', () => xhair.classList.remove('fire'));

  decayTimer = setInterval(() => {
    if(paused || combo <= 0) return;
    comboLife -= 100;
    if(comboLife <= 0){
      combo = 0;
      document.getElementById('blasterCombo').textContent = 'x1';
      document.getElementById('blasterComboPill').classList.remove('combo-hot');
    }
    document.getElementById('blasterComboFill').style.width = Math.max(0, comboLife / 22) + '%';
  }, 100);

  function freeSpot(size){
    // up to 8 tries for a position that doesn't overlap live targets
    for(let k = 0; k < 8; k++){
      const x = Math.random() * Math.max(10, (area.clientWidth - size));
      const y = Math.random() * Math.max(10, (area.clientHeight - size));
      const clash = live.some(o => {
        const dx = (o.x + o.size / 2) - (x + size / 2);
        const dy = (o.y + o.size / 2) - (y + size / 2);
        return Math.hypot(dx, dy) < (o.size + size) / 2 + 10;
      });
      if(!clash) return {x, y};
    }
    return null;
  }

  function impact(x, y, size, color){
    // expanding shockwave ring
    const w = document.createElement('div');
    w.className = 'bl-wave';
    w.style.left = x + 'px'; w.style.top = y + 'px';
    w.style.width = w.style.height = size + 'px';
    w.style.borderColor = color;
    area.appendChild(w);
    setTimeout(() => w.remove(), 480);
    // spark burst
    for(let i = 0; i < 7; i++){
      const s = document.createElement('div');
      s.className = 'bl-spark';
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.background = color;
      area.appendChild(s);
      const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 34;
      requestAnimationFrame(() => {
        s.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d - 10}px)`;
        s.style.opacity = '0';
      });
      setTimeout(() => s.remove(), 480);
    }
  }

  function callout(x, y, text){
    const c = document.createElement('div');
    c.className = 'bl-callout';
    c.textContent = text;
    c.style.left = x + 'px'; c.style.top = y + 'px';
    area.appendChild(c);
    requestAnimationFrame(() => { c.style.transform = 'translate(-50%,-64px) scale(1.08)'; c.style.opacity = '0'; });
    setTimeout(() => c.remove(), 780);
  }

  function dropTarget(o){
    const i = live.indexOf(o);
    if(i !== -1) live.splice(i, 1);
  }
  function shrinkTick(o){
    const t = o.el;
    if(!document.body.contains(t)) return;
    if(!paused && alive && (o.vx || o.vy)){
      const maxX = Math.max(0, area.clientWidth - o.size), maxY = Math.max(0, area.clientHeight - o.size);
      o.x += o.vx; o.y += o.vy;
      if(o.x < 0 || o.x > maxX){ o.vx *= -1; o.x = Math.max(0, Math.min(maxX, o.x)); }
      if(o.y < 0 || o.y > maxY){ o.vy *= -1; o.y = Math.max(0, Math.min(maxY, o.y)); }
      t.style.left = o.x + 'px'; t.style.top = o.y + 'px';
    }
    const p = 1 - (Date.now() - o.born) / o.life;
    t.style.transform = `scale(${Math.max(0.35, p)})`;
  }
  function expireTarget(o){
    if(o.gone) return;
    o.gone = true;
    clearInterval(o.shrink); dropTarget(o);
    o.el.style.transform = 'scale(0)';
    setTimeout(() => o.el.remove(), 170);
    combo = 0; comboLife = 0;
    const cc = document.getElementById('blasterCombo');
    if(cc) cc.textContent = 'x1';
    document.getElementById('blasterComboPill')?.classList.remove('combo-hot');
  }
  function armTarget(o){
    o.born = Date.now();
    o.shrink = setInterval(() => shrinkTick(o), 60);
    o.kill = setTimeout(() => expireTarget(o), o.life);
  }

  const GLYPHS = {normal:'◎', gold:'★', bomb:'💣', freeze:'❄', jackpot:'💰'};
  const TIERS = {5:'NICE!', 10:'RAMPAGE!', 15:'ON FIRE 🔥', 20:'UNSTOPPABLE!', 30:'GODLIKE ✨'};
  function spawn(){
    if(!alive || paused || !started) return;
    if(live.length >= 6) return; // never flood the arena
    const roll = Math.random();
    let type = 'normal', points = 10, size = 56, life = 1150;
    if(roll > 0.86){ type = 'gold'; points = 22; size = 44; life = 880; }
    if(roll > 0.955){ type = 'bomb'; points = -12; size = 50; life = 980; }
    if(level >= 3 && Math.random() < 0.12){ type = 'freeze'; points = 15; size = 46; life = 1000; }
    if(Math.random() < 0.02){ type = 'jackpot'; points = 50; size = 42; life = 800; } // rare big prize
    const spot = freeSpot(size);
    if(!spot) return;
    const o = {
      x: spot.x, y: spot.y, size, life, born: 0, remaining: 0,
      kill: null, shrink: null, gone: false, type, points, vx: 0, vy: 0, el: null,
    };
    // drifting targets from level 2 — gentle pace, slightly faster each level (bombs stay still)
    if(level >= 2 && type !== 'bomb'){
      const sp = 0.22 + (level - 2) * 0.1;
      const a = Math.random() * Math.PI * 2;
      o.vx = Math.cos(a) * sp; o.vy = Math.sin(a) * sp;
    }
    const t = document.createElement('div');
    t.className = 'target bl-' + type;
    t.style.left = o.x + 'px'; t.style.top = o.y + 'px';
    t.style.width = size + 'px'; t.style.height = size + 'px';
    t.innerHTML = `<div class="bl-ring"></div><div class="bl-core">${GLYPHS[type]}</div>`;
    t.style.transform = 'scale(0.6)'; t.style.transition = 'transform 0.16s';
    requestAnimationFrame(() => { if(!paused) t.style.transform = 'scale(1)'; });
    o.el = t;
    live.push(o);
    armTarget(o);
    t.addEventListener('click', e => {
      e.stopPropagation();
      if(o.gone || !alive || paused) return;
      o.gone = true; clearTimeout(o.kill); clearInterval(o.shrink); dropTarget(o);
      clicks++;
      const cx = o.x + o.size / 2, cy = o.y + o.size / 2;
      const react = Math.max(0, 1 - (Date.now() - o.born) / o.life); // 1 = instant hit
      if(type === 'bomb'){
        hits = Math.max(0, hits - 1); combo = 0; comboLife = 0;
        env.shake(); env.beep(120, 0.28, 'sawtooth', 0.14);
        impact(cx, cy, size, '#FF1A4B');
      } else if(type === 'freeze'){
        hits++; combo++; comboLife = 2200;
        time = Math.min(30, time + 2);
        document.getElementById('blasterTime').textContent = time;
        env.beep(990, 0.14, 'sine', 0.12); env.toast('❄ +2s freeze bonus');
        impact(cx, cy, size, '#9BEFFF');
      } else {
        hits++; combo++; comboLife = 2200; maxCombo = Math.max(maxCombo, combo);
        env.beep(Math.min(1250, 640 + combo * 22), 0.09, 'sine', 0.12);
        impact(cx, cy, size, type === 'gold' ? '#FFD60A' : type === 'jackpot' ? '#FF6A00' : '#00E5CC');
        if(type === 'gold' || type === 'jackpot'){
          const r = t.getBoundingClientRect();
          env.confetti(r.left + r.width / 2, r.top + r.height / 2);
        }
        if(type === 'jackpot') env.toast('💰 JACKPOT +50!');
        if(TIERS[combo]) callout(cx, cy - 20, TIERS[combo]);
        if(hits % 12 === 0){
          level++; document.getElementById('blasterLvl').textContent = level;
          clearInterval(spawnTimer); spawnRate = Math.max(200, spawnRate - 35);
          spawnTimer = setInterval(spawn, spawnRate);
          env.beep(880, 0.15, 'square', 0.1);
          env.toast(`⬆ Level ${level} — faster + drifting targets!`);
        }
      }
      const pill = document.getElementById('blasterComboPill');
      if(pill) pill.classList.toggle('combo-hot', combo >= 8);
      t.style.transform = 'scale(1.35)'; t.style.opacity = '0.6';
      setTimeout(() => t.remove(), 110);
      let pts = type === 'bomb' ? points : points + Math.min(14, combo * 1.6) + (type === 'jackpot' ? 40 : 0);
      if(type !== 'bomb') pts += Math.round(react * 8); // reaction bonus: faster = richer
      if(sudden && pts > 0) pts *= 2;
      env.setScore(Math.max(0, hits * 10 + Math.floor(maxCombo * 3) + (type === 'gold' ? 8 : 0)));
      document.getElementById('blasterHits').textContent = hits;
      document.getElementById('blasterCombo').textContent = 'x' + (combo ? (1 + combo * 0.2).toFixed(1) : '1');
      document.getElementById('blasterAcc').textContent = (clicks ? Math.round(hits / clicks * 100) : 100) + '%';
      const p = document.createElement('div');
      p.textContent = (pts > 0 ? '+' : '') + pts;
      p.className = 'bl-pts';
      p.style.left = o.x + 'px'; p.style.top = o.y + 'px';
      p.style.color = pts > 0 ? '#22C55E' : '#FF1A4B';
      area.appendChild(p);
      requestAnimationFrame(() => { p.style.transform = 'translateY(-24px)'; p.style.opacity = '0'; });
      setTimeout(() => p.remove(), 560);
    });
    area.appendChild(t);
  }

  area.addEventListener('click', e => {
    if(!alive || paused || !started) return; // (start overlay covers the arena until then)
    clicks++; combo = 0; comboLife = 0;
    document.getElementById('blasterCombo').textContent = 'x1';
    document.getElementById('blasterComboPill')?.classList.remove('combo-hot');
    document.getElementById('blasterAcc').textContent = Math.round(hits / Math.max(1, clicks) * 100) + '%';
    env.beep(160, 0.08, 'square', 0.06);
    // miss puff where the shot landed
    const r = area.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'bl-miss';
    m.style.left = (e.clientX - r.left) + 'px';
    m.style.top = (e.clientY - r.top) + 'px';
    area.appendChild(m);
    setTimeout(() => m.remove(), 380);
  });

  env.power(() => {
    env.toast('⚡ Slow-Mo 5s!');
    const restoreRate = spawnRate;
    clearInterval(spawnTimer);
    spawnTimer = setInterval(spawn, 720);
    clearTimeout(slowT);
    slowT = setTimeout(() => {
      if(!alive) return;
      clearInterval(spawnTimer);
      spawnTimer = setInterval(spawn, restoreRate);
      env.toast('Slow-Mo ended');
    }, 5000);
    env.beep(900, 0.18, 'sine', 0.12);
  });

  function gradeOf(acc){
    if(acc >= 90 && hits >= 20) return ['S', '#FFD60A'];
    if(acc >= 80) return ['A', '#00E5CC'];
    if(acc >= 65) return ['B', '#7CFC00'];
    if(acc >= 50) return ['C', '#FFB800'];
    return ['D', '#9AA0B5'];
  }
  function showSummary(acc, score, best, isRecord){
    const [g, color] = gradeOf(acc);
    const el = document.createElement('div');
    el.className = 'bl-end';
    const row = (k, v) => `<div class="bl-end-row"><span>${k}</span><b>${v}</b></div>`;
    el.innerHTML = `<div class="bl-grade" style="color:${color};text-shadow:0 0 26px ${color}">${g}</div>
      <div class="bl-end-title">TIME UP!</div>
      ${row('Score', score)}${row('Best', best + (isRecord ? ' 🏆 NEW!' : ''))}${row('Hits', hits)}${row('Accuracy', acc + '%')}${row('Best combo', 'x' + (maxCombo ? (1 + maxCombo * 0.2).toFixed(1) : '1'))}${row('Level', level)}
      <button class="btn-primary-lg" id="blAgain">↻ Play Again</button>`;
    area.appendChild(el);
    document.getElementById('blAgain').addEventListener('click', () => env.remount());
  }

  timer = setInterval(() => {
    if(paused || !started) return;
    time--;
    const tt = document.getElementById('blasterTime');
    if(!tt){ clearInterval(timer); return; }
    tt.textContent = time;
    document.getElementById('blasterBar').style.width = (time / 30 * 100) + '%';
    if(time === 5 && !sudden){
      sudden = true;
      env.toast('⚡ SUDDEN DEATH — 2x points, faster targets!');
      env.beep(880, 0.25, 'square', 0.13);
      clearInterval(spawnTimer);
      spawnTimer = setInterval(spawn, Math.max(160, spawnRate - 120));
      area.classList.add('bl-sudden');
      document.getElementById('blasterBar').style.background = 'linear-gradient(90deg,#FF3B6E,#FFB800)';
    }
    if(time <= 0){
      alive = false;
      clearInterval(timer); clearInterval(spawnTimer); clearInterval(decayTimer);
      live.slice().forEach(o => { o.gone = true; clearTimeout(o.kill); clearInterval(o.shrink); });
      live.length = 0;
      const acc = Math.round(hits / Math.max(1, clicks) * 100);
      const score = Number(document.getElementById('gameScore')?.textContent) || 0;
      const prevBest = env.loadProfile().stats.best.blaster || 0;
      env.confetti(area.getBoundingClientRect().left + area.offsetWidth / 2, area.getBoundingClientRect().top + 80);
      env.awardXp(70 + Math.floor(acc / 10) + level * 4);
      const best = env.loadProfile().stats.best.blaster || 0;
      showSummary(acc, score, best, score > 0 && score >= prevBest);
    }
  }, 1000);

  // 3-2-1-GO countdown, triggered by the Start button — then the round truly starts
  const countEl = document.getElementById('blCount');
  const steps = ['3', '2', '1', 'GO!'];
  let ci = 0, cdInt = null, countdownDone = false;
  // Start button: click, or Enter/Space for keyboard players
  function pressStart(){
    document.getElementById('blasterStartBtn').click();
  }
  function startKey(e){
    if((e.key === 'Enter' || e.key === ' ') && !countdownDone){
      e.preventDefault();
      pressStart();
    }
  }
  window.addEventListener('keydown', startKey);
  document.getElementById('blasterStartBtn').addEventListener('click', () => {
    if(countdownDone) return;
    countdownDone = true;
    document.getElementById('blasterStart').classList.add('hidden');
    countEl.classList.remove('hidden');
    countEl.textContent = steps[0];
    env.beep(500, 0.1, 'sine', 0.1);
    cdInt = setInterval(() => {
      ci++;
      if(ci >= steps.length){
        clearInterval(cdInt);
        countEl.classList.add('hidden');
        started = true;
        spawnTimer = setInterval(spawn, spawnRate);
        for(let i = 0; i < 2; i++) spawn();
        return;
      }
      countEl.textContent = steps[ci];
      env.beep(steps[ci] === 'GO!' ? 880 : 500 + ci * 150, 0.1, 'sine', 0.1);
    }, 420);
  });

  env.setScore(0);
  env.onCleanup(() => {
    alive = false;
    clearInterval(timer); clearInterval(spawnTimer); clearInterval(decayTimer); clearInterval(cdInt); clearTimeout(slowT);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('keydown', startKey);
  });
}
