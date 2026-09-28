// games/runner.js — Runner Rush 2. Mounts into env.body; talks to the app only via env.
export function mountRunner(env){
  env.body.innerHTML = `<div class="runner-wrap"><div class="hud-row" style="justify-content:space-between"><span class="hud-pill">Score <b id="runnerScore">0</b> • Best <b id="runnerBest">0</b></span><span class="hud-pill">🪙 <b id="runnerCoins">0</b></span><span class="hud-pill">Speed <b id="runnerSpd">1x</b></span><button class="btn-mini" id="runnerPause">⏸</button></div><canvas id="runnerCanvas" class="runner-canvas" width="760" height="300"></canvas><div style="text-align:center;margin-top:8px;color:#9AA0B5">SPACE / ↑ / Tap • Double-jump • Coins +5 • R restart</div></div>`;
  env.bar('Coins +5 • Birds fly high • Slow-mo power');
  env.restart(env.body);
  const canvas = document.getElementById('runnerCanvas'), ctx = canvas.getContext('2d');
  const bestPrev = Number(localStorage.getItem('gv_runnerBest') || 0);
  document.getElementById('runnerBest').textContent = bestPrev;
  const player = {x:72, y:220, w:28, h:28, vy:0, ground:220, jumping:false, jumps:0, squash:0};
  const obstacles = [], coins = [], clouds = [], stars = [], dust = [];
  let score = 0, coinsGot = 0, speed = 4.2;
  const gravity = 0.78;
  let running = true, paused = false, frame = 0, raf = null;
  const runDead = {dead:false};
  for(let i = 0; i < 40; i++) stars.push({x:Math.random() * 760, y:Math.random() * 120, s:Math.random() * 1.4 + 0.4});
  for(let i = 0; i < 5; i++) clouds.push({x:i * 180 + 30, y:38 + i * 14 % 40, s:0.6 + i * 0.18, w:44 + i * 6});

  document.getElementById('runnerPause').addEventListener('click', () => {
    paused = !paused;
    document.getElementById('runnerPause').textContent = paused ? '▶' : '⏸';
    if(!paused) raf = requestAnimationFrame(update);
  });

  function spawnObs(){
    const r = Math.random();
    if(r < 0.18){
      obstacles.push({x:760, y:178 + Math.random() * 14, w:30, h:16, type:'bird', flap:0});
    } else {
      const h = 30 + Math.random() * 26, w = 16 + Math.random() * 16;
      obstacles.push({x:760, y:248 - h + 28, w, h, type:'cactus'});
    }
    if(Math.random() < 0.55) coins.push({x:780 + Math.random() * 60, y:150 + Math.random() * 60, got:false, bob:Math.random() * 6});
  }
  function addDust(x, y){
    for(let i = 0; i < 4; i++) dust.push({x, y, vx:(Math.random() - 0.5) * 3, vy:-Math.random() * 2.5, life:12});
  }

  function update(){
    if(runDead.dead) return;
    if(!running || paused){ draw(); if(!paused) return; raf = requestAnimationFrame(update); return; }
    frame++;
    if(frame % 68 === 0) spawnObs();
    clouds.forEach(c => { c.x -= c.s; if(c.x < -60) c.x = 820; });
    stars.forEach(s => { s.x -= 0.25; if(s.x < 0) s.x = 760; });
    player.vy += gravity; player.y += player.vy;
    if(player.y >= player.ground){
      if(player.jumping) player.squash = 6;
      player.y = player.ground; player.vy = 0; player.jumping = false; player.jumps = 0;
    }
    if(player.squash > 0) player.squash--;
    obstacles.forEach(o => { o.x -= speed; if(o.type === 'bird') o.flap++; });
    for(let i = obstacles.length - 1; i >= 0; i--) if(obstacles[i].x + obstacles[i].w <= 0) obstacles.splice(i, 1);
    coins.forEach(c => { c.x -= speed; c.bob += 0.12; });
    coins.forEach(c => {
      if(!c.got && Math.abs((player.x + 14) - (c.x + 8)) < 22 && Math.abs((player.y + 14) - (c.y + 8)) < 24){
        c.got = true; coinsGot++; score += 50;
        env.beep(1200, 0.1, 'sine', 0.11);
        document.getElementById('runnerCoins').textContent = coinsGot;
        env.setScore(Math.floor(score / 10) + coinsGot * 2);
      }
    });
    for(let i = coins.length - 1; i >= 0; i--) if(coins[i].got || coins[i].x <= -20) coins.splice(i, 1);
    dust.forEach(d => { d.x += d.vx; d.y += d.vy; d.vy += 0.22; d.life--; });
    for(let i = dust.length - 1; i >= 0; i--) if(dust[i].life <= 0) dust.splice(i, 1);
    for(const o of obstacles){
      const pw = player.w - 6, ph = player.h - (player.squash ? 4 : 0);
      if(player.x + 3 < o.x + o.w && player.x + 3 + pw > o.x && player.y + 2 < o.y + o.h && player.y + 2 + ph > o.y){
        running = false; env.shake(); env.beep(110, 0.4, 'sawtooth', 0.16);
        const s = Math.floor(score / 10) + coinsGot * 2;
        if(s > bestPrev){
          localStorage.setItem('gv_runnerBest', s);
          document.getElementById('runnerBest').textContent = s;
        }
        env.awardXp(90);
        if(coinsGot > 0) env.sync({action:`Runner coins +${coinsGot}`, coins: coinsGot}, 'runner');
        break;
      }
    }
    score += 1.25;
    if(Math.floor(score) % 480 === 0){
      speed += 0.3;
      document.getElementById('runnerSpd').textContent = (speed / 4.2).toFixed(1) + 'x';
      env.beep(660, 0.1, 'square', 0.09);
    }
    const total = Math.floor(score / 10) + coinsGot * 2;
    env.setScore(total);
    document.getElementById('runnerScore').textContent = total;
    draw(); raf = requestAnimationFrame(update);
  }

  function draw(){
    if(runDead.dead) return;
    ctx.clearRect(0, 0, 760, 300);
    const g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, '#0F1236'); g.addColorStop(1, '#080A18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 760, 300);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    stars.forEach(s => { ctx.globalAlpha = 0.25 + s.s * 0.2; ctx.fillRect(s.x, s.y, s.s, s.s); });
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.moveTo(0, 180);
    for(let x = 0; x <= 760; x += 18){ ctx.lineTo(x, 168 + Math.sin((x + frame * 0.8) * 0.012) * 10); }
    ctx.lineTo(760, 300); ctx.lineTo(0, 300); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    clouds.forEach(c => { ctx.beginPath(); ctx.ellipse(c.x, c.y, c.w, 12, 0, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, 248, 760, 2);
    ctx.strokeStyle = 'rgba(0,229,204,0.07)'; ctx.lineWidth = 2;
    for(let x = (-frame * speed) % 28; x < 760; x += 28){ ctx.beginPath(); ctx.moveTo(x, 248); ctx.lineTo(x + 6, 300); ctx.stroke(); }
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,184,0,0.5)';
    dust.forEach(d => { ctx.globalAlpha = Math.max(0, d.life / 12); ctx.beginPath(); ctx.arc(d.x, d.y, 1.8, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    coins.forEach(c => {
      if(c.got) return;
      const cy = c.y + Math.sin(c.bob) * 4;
      ctx.fillStyle = '#FFB800'; ctx.shadowColor = '#FFB800'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(c.x + 8, cy + 8, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#7A4A00'; ctx.font = '900 10px Outfit'; ctx.textAlign = 'center';
      ctx.fillText('$', c.x + 8, cy + 12);
    });
    const bob = player.jumping ? 0 : Math.sin(frame * 0.28) * 1.2;
    const pw = player.w * (player.squash ? 1.12 : 1);
    const ph = player.h * (player.jumping ? 1.1 : (player.squash ? 0.86 : 1));
    const px = player.x + (player.w - pw) / 2, py = player.y + bob + (player.h - ph);
    ctx.fillStyle = '#00E5CC'; ctx.shadowColor = '#00E5CC'; ctx.shadowBlur = 12;
    ctx.fillRect(px, py, pw, ph); ctx.shadowBlur = 0;
    ctx.fillStyle = 'white'; ctx.fillRect(px + 6, py + 6, 6, 6); ctx.fillRect(px + 16, py + 6, 6, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(px + 2, py + 2, pw - 4, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    const airY = Math.max(0, player.ground - player.y);
    ctx.beginPath(); ctx.ellipse(player.x + 14, 252, 12 - Math.min(6, airY * 0.05), 3, 0, 0, Math.PI * 2); ctx.fill();
    obstacles.forEach(o => {
      if(o.type === 'bird'){
        const flap = Math.sin(o.flap * 0.4) * 4;
        ctx.fillStyle = '#B48CFF'; ctx.shadowColor = '#B48CFF'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.ellipse(o.x + 15, o.y + 8, 14, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.ellipse(o.x + 15 + flap * 0.4, o.y + 2 + flap, 9, 4, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1A1030';
        ctx.beginPath(); ctx.arc(o.x + 24, o.y + 7, 2, 0, Math.PI * 2); ctx.fill();
      } else {
        const og = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
        og.addColorStop(0, '#FF3B6E'); og.addColorStop(1, '#FF6A00');
        ctx.fillStyle = og; ctx.shadowColor = '#FF3B6E'; ctx.shadowBlur = 8;
        ctx.fillRect(o.x, o.y, o.w, o.h); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(o.x, o.y, o.w, 4);
      }
    });
    ctx.fillStyle = 'white'; ctx.font = '700 13px JetBrains Mono'; ctx.textAlign = 'left';
    ctx.fillText('SCORE ' + (Math.floor(score / 10) + coinsGot * 2), 12, 20);
    if(paused && running){
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, 760, 300);
      ctx.fillStyle = 'white'; ctx.font = '900 22px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('PAUSED', 380, 150); ctx.textAlign = 'left';
    }
    if(!running){
      ctx.fillStyle = 'rgba(0,0,0,0.58)'; ctx.fillRect(0, 0, 760, 300);
      ctx.fillStyle = 'white'; ctx.font = '900 26px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('CRASHED', 380, 132);
      ctx.font = '700 13px Outfit'; ctx.fillStyle = '#C8CEE6';
      ctx.fillText(`Score ${Math.floor(score / 10) + coinsGot * 2} • 🪙${coinsGot} • Press Start Again`, 380, 156);
      ctx.textAlign = 'left';
    }
  }

  env.power(() => {
    const prev = speed; speed *= 0.55; env.toast('⚡ Slow-Mo 4s!');
    setTimeout(() => { speed = prev; env.toast('Speed normal'); }, 4000);
    env.beep(800, 0.16, 'sine', 0.1);
  });

  function jump(){
    if(!running || paused) return;
    if(player.jumps < 2){
      player.vy = -11.6 - player.jumps * 0.6;
      player.jumping = true; player.jumps++;
      addDust(player.x + 14, player.y + 28);
      env.beep(520 + player.jumps * 90, 0.09, 'sine', 0.1);
    }
  }
  function onKey(e){
    if(e.code === 'Space' || e.key === 'ArrowUp'){ e.preventDefault(); jump(); }
    if(e.key.toLowerCase() === 'p'){
      paused = !paused;
      document.getElementById('runnerPause').textContent = paused ? '▶' : '⏸';
      if(!paused) raf = requestAnimationFrame(update);
    }
    if(e.key.toLowerCase() === 'r'){ env.remount(); }
  }
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); jump(); }, {passive:false});
  canvas.addEventListener('mousedown', jump);
  draw(); update();
  env.onCleanup(() => { runDead.dead = true; running = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); });
}
