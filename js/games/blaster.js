// games/blaster.js — Aim Blaster+. Mounts into env.body; talks to the app only via env.
export function mountBlaster(env){
  env.body.innerHTML = `<div style="text-align:center;width:100%"><div class="hud-row"><span class="hud-pill">⏱ <b id="blasterTime">30</b>s</span><span class="hud-pill">🎯 <b id="blasterHits">0</b></span><span class="hud-pill">📊 <b id="blasterAcc">100%</b></span><span class="hud-pill">🔥 <b id="blasterCombo">x1</b></span><span class="hud-pill">Lv <b id="blasterLvl">1</b></span><button class="btn-mini" id="blasterPause">⏸</button><div class="combo-wrap"><div class="combo-fill" id="blasterComboFill"></div></div><div style="flex:1;min-width:100px;max-width:160px;height:6px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden"><div id="blasterBar" style="height:100%;width:100%;background:linear-gradient(90deg,#00E5CC,#FFB800);transition:width 0.2s"></div></div></div><div class="blaster-area" id="blasterArea" style="cursor:crosshair"></div></div>`;
  env.bar('Gold ★ +22 • Bomb −12 • Last 5s = sudden-death 2x • Slow-mo power');
  env.restart(env.body);
  const area = document.getElementById('blasterArea');
  let hits = 0, clicks = 0, time = 30;
  let alive = true, paused = false, combo = 0, maxCombo = 0, level = 1, sudden = false;
  let timer = null, spawnTimer = null, decayTimer = null, comboLife = 0, spawnRate = 380;

  document.getElementById('blasterPause').addEventListener('click', () => {
    paused = !paused;
    document.getElementById('blasterPause').textContent = paused ? '▶' : '⏸';
  });
  decayTimer = setInterval(() => {
    if(paused || combo <= 0) return;
    comboLife -= 100;
    if(comboLife <= 0){ combo = 0; document.getElementById('blasterCombo').textContent = 'x1'; }
    document.getElementById('blasterComboFill').style.width = Math.max(0, comboLife / 22) + '%';
  }, 100);

  function spawn(){
    if(!alive || paused) return;
    const roll = Math.random();
    let type = 'normal', points = 10, size = 56, life = 1150;
    if(roll > 0.86){ type = 'gold'; points = 22; size = 44; life = 880; }
    if(roll > 0.955){ type = 'bomb'; points = -12; size = 50; life = 980; }
    if(level >= 3 && Math.random() < 0.12){ type = 'freeze'; points = 15; size = 46; life = 1000; }
    const t = document.createElement('div');
    t.className = 'target';
    const x = Math.random() * Math.max(10, (area.clientWidth - size));
    const y = Math.random() * Math.max(10, (area.clientHeight - size));
    t.style.left = x + 'px'; t.style.top = y + 'px';
    t.style.width = size + 'px'; t.style.height = size + 'px';
    if(type === 'gold'){ t.style.background = 'radial-gradient(circle at 35% 30%, #FFD60A, #FF8A00)'; t.textContent = '★'; t.style.color = '#1A1200'; }
    else if(type === 'bomb'){ t.style.background = 'radial-gradient(circle at 35% 30%, #1A1A1E, #FF1A4B)'; t.textContent = '💣'; }
    else if(type === 'freeze'){ t.style.background = 'radial-gradient(circle at 35% 30%, #9BEFFF, #06B6D4)'; t.textContent = '❄'; t.style.color = '#062A33'; }
    else {
      const hue = Math.floor(Math.random() * 34 + 8);
      t.style.background = `radial-gradient(circle at 32% 28%, hsl(${hue} 100% 68%), hsl(${hue} 92% 48%))`;
      t.textContent = '◎'; t.style.color = 'white';
    }
    t.style.transform = 'scale(0.6)'; t.style.transition = 'transform 0.16s';
    requestAnimationFrame(() => { if(!paused) t.style.transform = 'scale(1)'; });
    const born = Date.now();
    const shrink = setInterval(() => {
      if(!document.body.contains(t)){ clearInterval(shrink); return; }
      const p = 1 - (Date.now() - born) / life;
      t.style.transform = `scale(${Math.max(0.35, p)})`;
    }, 60);
    let gone = false;
    const kill = setTimeout(() => {
      clearInterval(shrink);
      if(!gone){
        t.style.transform = 'scale(0)';
        setTimeout(() => t.remove(), 170);
        combo = 0; comboLife = 0;
        const cc = document.getElementById('blasterCombo');
        if(cc) cc.textContent = 'x1';
      }
    }, life);
    t.addEventListener('click', e => {
      e.stopPropagation();
      if(gone || !alive || paused) return;
      gone = true; clearTimeout(kill); clearInterval(shrink);
      clicks++;
      if(type === 'bomb'){
        hits = Math.max(0, hits - 1); combo = 0; comboLife = 0;
        env.shake(); env.beep(120, 0.28, 'sawtooth', 0.14);
      } else if(type === 'freeze'){
        hits++; combo++; comboLife = 2200;
        time = Math.min(30, time + 2);
        document.getElementById('blasterTime').textContent = time;
        env.beep(990, 0.14, 'sine', 0.12); env.toast('❄ +2s freeze bonus');
      } else {
        hits++; combo++; comboLife = 2200; maxCombo = Math.max(maxCombo, combo);
        env.beep(type === 'gold' ? 1100 : 720, 0.09, 'sine', 0.12);
        if(type === 'gold'){ const r = t.getBoundingClientRect(); env.confetti(r.left + r.width / 2, r.top + r.height / 2); }
        if(hits % 12 === 0){
          level++; document.getElementById('blasterLvl').textContent = level;
          clearInterval(spawnTimer); spawnRate = Math.max(200, spawnRate - 35);
          spawnTimer = setInterval(spawn, spawnRate);
          env.beep(880, 0.15, 'square', 0.1);
        }
      }
      t.style.transform = 'scale(1.4)'; t.style.opacity = '0.6';
      setTimeout(() => t.remove(), 110);
      let pts = type === 'bomb' ? points : points + Math.min(14, combo * 1.6);
      if(sudden && pts > 0) pts *= 2;
      env.setScore(Math.max(0, hits * 10 + Math.floor(maxCombo * 3) + (type === 'gold' ? 8 : 0)));
      document.getElementById('blasterHits').textContent = hits;
      document.getElementById('blasterCombo').textContent = 'x' + (combo ? (1 + combo * 0.2).toFixed(1) : '1');
      document.getElementById('blasterAcc').textContent = (clicks ? Math.round(hits / clicks * 100) : 100) + '%';
      const p = document.createElement('div');
      p.textContent = (pts > 0 ? '+' : '') + pts;
      p.style.position = 'absolute'; p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.color = pts > 0 ? '#22C55E' : '#FF1A4B'; p.style.fontWeight = '900';
      p.style.pointerEvents = 'none'; p.style.transform = 'translateY(0)'; p.style.transition = 'all 0.55s';
      area.appendChild(p);
      requestAnimationFrame(() => { p.style.transform = 'translateY(-22px)'; p.style.opacity = '0'; });
      setTimeout(() => p.remove(), 560);
    });
    area.appendChild(t);
  }

  area.addEventListener('click', () => {
    if(!alive || paused) return;
    clicks++; combo = 0; comboLife = 0;
    document.getElementById('blasterCombo').textContent = 'x1';
    document.getElementById('blasterAcc').textContent = Math.round(hits / Math.max(1, clicks) * 100) + '%';
    env.beep(160, 0.08, 'square', 0.06);
  });

  env.power(() => {
    env.toast('⚡ Slow-Mo 5s!');
    clearInterval(spawnTimer);
    spawnTimer = setInterval(spawn, 720);
    setTimeout(() => { clearInterval(spawnTimer); spawnTimer = setInterval(spawn, 360); env.toast('Slow-Mo ended'); }, 5000);
    env.beep(900, 0.18, 'sine', 0.12);
  });

  timer = setInterval(() => {
    if(paused) return;
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
      area.style.borderColor = 'rgba(255,59,110,0.7)';
      area.style.boxShadow = '0 0 28px rgba(255,59,110,0.35), inset 0 1px 0 rgba(255,255,255,0.06)';
      document.getElementById('blasterBar').style.background = 'linear-gradient(90deg,#FF3B6E,#FFB800)';
    }
    if(time <= 0){
      alive = false;
      clearInterval(timer); clearInterval(spawnTimer); clearInterval(decayTimer);
      const acc = Math.round(hits / Math.max(1, clicks) * 100);
      env.confetti(area.getBoundingClientRect().left + area.offsetWidth / 2, area.getBoundingClientRect().top + 80);
      env.awardXp(70 + Math.floor(acc / 10) + level * 4);
      env.toast(`Time! Hits ${hits} • Acc ${acc}% • Lv${level} • Best combo x${(1 + maxCombo * 0.2).toFixed(1)}`);
    }
  }, 1000);
  spawnTimer = setInterval(spawn, spawnRate);
  setTimeout(() => { for(let i = 0; i < 2; i++) spawn(); }, 120);
  env.setScore(0);
  env.onCleanup(() => { alive = false; clearInterval(timer); clearInterval(spawnTimer); clearInterval(decayTimer); });
}
