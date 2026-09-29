// games/snake.js — Neon Snake. Mounts into env.body; talks to the app only via env.
export function mountSnake(env){
  env.body.innerHTML = `<div style="text-align:center"><div class="hud-row"><span class="hud-pill">Level <b id="snakeLvl">1</b></span><span class="hud-pill">Speed <b id="snakeSpd">1x</b></span><span class="hud-pill">🏆 <b id="snakeBest">0</b></span><select id="snakeDiff" class="btn-mini" aria-label="Snake difficulty"><option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select><select id="snakeMode" class="btn-mini" aria-label="Snake mode"><option value="classic" selected>Walls kill</option><option value="wrap">Wrap walls</option><option value="obstacles">Obstacles</option></select><button class="btn-mini" id="snakePause">⏸ Pause</button></div><div class="canvas-wrap"><canvas id="snakeCanvas" class="game-canvas" width="420" height="420"></canvas><div class="countdown-overlay" id="snakeCount" style="display:none">3</div><div class="start-overlay" id="snakeStart"><div class="start-title">🐍 Neon Snake</div><div class="start-hint">Eat red +10 • Gold ★ +30 • Don't hit walls or yourself</div><button class="btn-primary-lg start-btn" id="snakeStartBtn">▶ Start</button></div></div></div>`;
  env.bar('WASD / Arrows • P pause • Red +10 • Gold +30 • Try wrap + obstacles modes');
  env.restart(env.body);
  const canvas = document.getElementById('snakeCanvas'), ctx = canvas.getContext('2d');
  const N = 20, SZ = 21;
  const myRun = {dead:false};
  let rafId = 0;
  let snake = [{x:9,y:9},{x:8,y:9},{x:7,y:9}], dir = {x:1,y:0}, nextDir = {x:1,y:0};
  let food = {x:14,y:10}, gold = null, goldTimer = 0;
  let score = 0, level = 1, alive = true, paused = false, anim = 0, particles = [], eats = 0;
  const modeSel = document.getElementById('snakeMode');
  let mode = 'classic';
  let blocks = [];
  function buildBlocks(){
    blocks = [];
    if(mode !== 'obstacles') return;
    // scattered obstacles, kept clear of the snake plus current foods
    let tries = 0;
    while(blocks.length < 8 + level * 2 && tries++ < 300){
      const p = {x:2 + Math.floor(Math.random() * (N - 4)), y:2 + Math.floor(Math.random() * (N - 4))};
      if(snake.some(s => Math.abs(s.x - p.x) + Math.abs(s.y - p.y) < 4)) continue;
      if(blocks.some(b => b.x === p.x && b.y === p.y)) continue;
      if(p.x === food.x && p.y === food.y) continue;
      if(gold && p.x === gold.x && p.y === gold.y) continue;
      blocks.push(p);
    }
  }
  modeSel.addEventListener('change', () => { env.remount(); });
  mode = modeSel.value;
  buildBlocks();
  const prevBest = env.loadProfile().stats.best.snake || 0;
  document.getElementById('snakeBest').textContent = prevBest;

  function blocked(p){
    return blocks.some(b => b.x === p.x && b.y === p.y);
  }
  function placeFood(){
    let p, guard = 0;
    do{ p = {x:Math.floor(Math.random() * N), y:Math.floor(Math.random() * N)}; guard++; }
    while((snake.some(s => s.x === p.x && s.y === p.y) || blocked(p) || (gold && p.x === gold.x && p.y === gold.y)) && guard < 500);
    food = p;
  }
  function burst(x, y, color){
    for(let i = 0; i < 12; i++) particles.push({x:x * SZ + SZ / 2, y:y * SZ + SZ / 2, vx:(Math.random() - 0.5) * 6.5, vy:(Math.random() - 0.5) * 6.5, life:20, color});
  }
  function rr(x, y, w, h, r){ ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  function draw(){
    if(myRun.dead) return;
    const grd = ctx.createLinearGradient(0, 0, 0, 420);
    grd.addColorStop(0, '#0D1028'); grd.addColorStop(1, '#080A18');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 420, 420);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    for(let i = 0; i <= N; i++){
      ctx.beginPath(); ctx.moveTo(i * SZ, 0); ctx.lineTo(i * SZ, 420); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * SZ); ctx.lineTo(420, i * SZ); ctx.stroke();
    }
    const h = snake[0];
      if(h.x <= 1 || h.y <= 1 || h.x >= N - 2 || h.y >= N - 2){ ctx.fillStyle = 'rgba(255,59,110,0.07)'; ctx.fillRect(0, 0, 420, 420); }
      if(blocks.length){
        ctx.fillStyle = '#3A1030'; ctx.strokeStyle = 'rgba(255,59,110,0.55)'; ctx.lineWidth = 1.5;
        blocks.forEach(b => {
          rr(b.x * SZ + 2, b.y * SZ + 2, SZ - 4, SZ - 4, 4); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,59,110,0.55)';
          ctx.beginPath(); ctx.moveTo(b.x * SZ + 6, b.y * SZ + 6); ctx.lineTo(b.x * SZ + SZ - 6, b.y * SZ + SZ - 6); ctx.stroke();
        });
      }
    const pulse = Math.sin(anim * 0.18) * 1.6;
    ctx.fillStyle = '#FF3B6E'; ctx.shadowColor = '#FF3B6E'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(food.x * SZ + SZ / 2, food.y * SZ + SZ / 2, SZ / 2 - 3 + pulse * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(food.x * SZ + SZ / 2 - 3, food.y * SZ + SZ / 2 - 3, 3, 0, Math.PI * 2); ctx.fill();
    if(gold){
      ctx.fillStyle = '#FFB800'; ctx.shadowColor = '#FFB800'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(gold.x * SZ + SZ / 2, gold.y * SZ + SZ / 2, SZ / 2 - 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#1A1200'; ctx.font = '900 11px Outfit'; ctx.textAlign = 'center';
      ctx.fillText('★', gold.x * SZ + SZ / 2, gold.y * SZ + SZ / 2 + 4);
      ctx.strokeStyle = 'rgba(255,184,0,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gold.x * SZ + SZ / 2, gold.y * SZ + SZ / 2, SZ / 2 + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (goldTimer / 140)); ctx.stroke();
    }
    snake.forEach((s, i) => {
      const t = snake.length <= 1 ? 0 : i / (snake.length - 1);
      if(i === 0){
        ctx.fillStyle = '#00E5CC'; ctx.shadowColor = '#00E5CC'; ctx.shadowBlur = 12;
        rr(s.x * SZ + 1.5, s.y * SZ + 1.5, SZ - 3, SZ - 3, 6); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'white';
        const ox = dir.x !== 0 ? (dir.x > 0 ? 14.5 : 6.5) : 7;
        ctx.beginPath(); ctx.arc(s.x * SZ + ox, s.y * SZ + 7.5, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s.x * SZ + (dir.x !== 0 ? 14.5 : 13.5), s.y * SZ + (dir.y !== 0 ? 14.5 : 7.5), 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0A0B18';
        ctx.beginPath(); ctx.arc(s.x * SZ + ox, s.y * SZ + 7.5, 1, 0, Math.PI * 2); ctx.fill();
        if(anim % 34 < 7){ ctx.fillStyle = '#FF3B6E'; ctx.fillRect(s.x * SZ + SZ / 2 + dir.x * 9 - 1, s.y * SZ + SZ / 2 + dir.y * 9 - 1, 2.5, 6); }
      } else {
        const alpha = 0.96 - t * 0.4;
        ctx.fillStyle = `rgba(${Math.round(255 - t * 70)}, ${Math.round(118 + t * 30)}, ${Math.round(10 + t * 50)}, ${alpha})`;
        rr(s.x * SZ + 3, s.y * SZ + 3, SZ - 6, SZ - 6, 5); ctx.fill();
      }
    });
    particles.forEach(p => {
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life / 20);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.vy += 0.24; p.life--; ctx.globalAlpha = 1;
    });
    particles = particles.filter(p => p.life > 0);
    if(!alive){
      ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, 420, 420);
      ctx.fillStyle = 'white'; ctx.font = '900 24px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', 210, 190);
      ctx.font = '700 13px Outfit'; ctx.fillStyle = '#C8CEE6';
      ctx.fillText(`Score ${score} • Level ${level} • Best ${Math.max(prevBest, score)}`, 210, 212);
      ctx.fillStyle = '#FFB800'; ctx.fillText('Press ↻ Start Again', 210, 232);
    } else if(paused){
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, 420, 420);
      ctx.fillStyle = 'white'; ctx.font = '900 20px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('PAUSED', 210, 210);
    }
  }

  const diffSel = document.getElementById('snakeDiff');
  let baseSpeed = diffSel.value === 'easy' ? 140 : diffSel.value === 'hard' ? 85 : 110;
  diffSel.addEventListener('change', () => {
    baseSpeed = diffSel.value === 'easy' ? 140 : diffSel.value === 'hard' ? 85 : 110;
    speed = Math.max(58, baseSpeed - (level - 1) * 9);
  });
  let last = 0, speed = baseSpeed;

  function tick(ts){
    if(myRun.dead) return;
    if(!alive || paused){ draw(); rafId = requestAnimationFrame(tick); return; }
    if(!last) last = ts;
    if(ts - last < speed){ draw(); rafId = requestAnimationFrame(tick); return; }
    last = ts; anim++;
      dir = nextDir;
      const head = {x:snake[0].x + dir.x, y:snake[0].y + dir.y};
      if(mode === 'wrap'){
        head.x = (head.x + N) % N; head.y = (head.y + N) % N;
      }
      if(head.x < 0 || head.x >= N || head.y < 0 || head.y >= N || blocked(head) || snake.some(s => s.x === head.x && s.y === head.y)){
        alive = false; env.shake(); env.beep(120, 0.4, 'sawtooth', 0.14); env.awardXp(80); draw(); return;
      }
    snake.unshift(head);
    let ate = false;
    if(head.x === food.x && head.y === food.y){
      score += 10; eats++; ate = true; env.setScore(score); env.beep(880, 0.12, 'sine', 0.15); burst(food.x, food.y, '#FFB800');
      placeFood();
      if(eats % 5 === 0 && !gold){
        let gp, guard = 0;
        do{ gp = {x:Math.floor(Math.random() * N), y:Math.floor(Math.random() * N)}; guard++; }
        while((snake.some(s => s.x === gp.x && s.y === gp.y) || blocked(gp) || (gp.x === food.x && gp.y === food.y)) && guard < 300);
        gold = gp; goldTimer = 140; env.beep(1100, 0.15, 'sine', 0.12);
      }
      if(score % 30 === 0){
        level++; speed = Math.max(58, speed - 9);
        document.getElementById('snakeLvl').textContent = level;
        document.getElementById('snakeSpd').textContent = ((110 / speed).toFixed(1) + 'x');
        env.beep(660, 0.18, 'square', 0.12);
        if(mode === 'obstacles' && alive){
          buildBlocks(); placeFood();
          env.toast('🧱 Level ' + level + ' — fresh obstacles!');
        }
      }
    } else if(gold && head.x === gold.x && head.y === gold.y){
      score += 30; eats++; ate = true; env.setScore(score);
      env.beep(1320, 0.16, 'sine', 0.15); burst(gold.x, gold.y, '#FFD60A');
      env.confetti(canvas.getBoundingClientRect().left + 210, canvas.getBoundingClientRect().top + 120);
      gold = null;
    } else snake.pop();
    if(gold){ goldTimer--; if(goldTimer <= 0) gold = null; }
    if(!ate && Math.random() < 0.02) burst(head.x, head.y, 'rgba(0,229,204,0.5)');
    draw(); rafId = requestAnimationFrame(tick);
  }

  env.power(() => {
    const prev = speed; speed = Math.max(70, speed * 1.45); env.toast('⚡ Ghost + Slow 4s!');
    setTimeout(() => { speed = prev; }, 4000);
  });

  (function injectDPad(){
    if(document.getElementById('snakeDpad')) return;
    const dpad = document.createElement('div');
    dpad.id = 'snakeDpad'; dpad.className = 'dpad';
    dpad.innerHTML = `<button class="up" aria-label="Up">▲</button><button class="left" aria-label="Left">◀</button><button class="down" aria-label="Down">▼</button><button class="right" aria-label="Right">▶</button>`;
    dpad.querySelector('.up').addEventListener('click', () => { if(dir.y !== 1) nextDir = {x:0, y:-1}; });
    dpad.querySelector('.down').addEventListener('click', () => { if(dir.y !== -1) nextDir = {x:0, y:1}; });
    dpad.querySelector('.left').addEventListener('click', () => { if(dir.x !== 1) nextDir = {x:-1, y:0}; });
    dpad.querySelector('.right').addEventListener('click', () => { if(dir.x !== -1) nextDir = {x:1, y:0}; });
    canvas.parentElement.appendChild(dpad);
  })();

  const countEl = document.getElementById('snakeCount');
  let started = false, cdInt = null;
  paused = true; draw();
  document.getElementById('snakeStartBtn').addEventListener('click', () => {
    if(started) return;
    started = true;
    document.getElementById('snakeStart').classList.add('hidden');
    countEl.style.display = 'grid';
    let cd = 3; countEl.textContent = cd;
    cdInt = setInterval(() => {
      cd--;
      if(cd <= 0){ clearInterval(cdInt); countEl.style.display = 'none'; paused = false; last = 0; }
      else { countEl.textContent = cd; env.beep(500 + (3 - cd) * 150, 0.1, 'sine', 0.1); }
    }, 420);
  });
  rafId = requestAnimationFrame(tick);

  function togglePause(){
    if(!started) return;
    paused = !paused;
    document.getElementById('snakePause').textContent = paused ? '▶ Resume' : '⏸ Pause';
    if(!paused){ last = 0; rafId = requestAnimationFrame(tick); }
  }
  function onKey(e){
    const k = e.key.toLowerCase();
    if(k === 'p'){ togglePause(); return; }
    if((k === 'arrowup' || k === 'w') && dir.y !== 1) nextDir = {x:0, y:-1};
    if((k === 'arrowdown' || k === 's') && dir.y !== -1) nextDir = {x:0, y:1};
    if((k === 'arrowleft' || k === 'a') && dir.x !== 1) nextDir = {x:-1, y:0};
    if((k === 'arrowright' || k === 'd') && dir.x !== -1) nextDir = {x:1, y:0};
  }
  window.addEventListener('keydown', onKey);
  document.getElementById('snakePause').addEventListener('click', togglePause);
  let sx = 0, sy = 0;
  canvas.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, {passive:true});
  canvas.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if(Math.abs(dx) > Math.abs(dy)){
      if(dx > 18 && dir.x !== -1) nextDir = {x:1, y:0};
      if(dx < -18 && dir.x !== 1) nextDir = {x:-1, y:0};
    } else {
      if(dy > 18 && dir.y !== -1) nextDir = {x:0, y:1};
      if(dy < -18 && dir.y !== 1) nextDir = {x:0, y:-1};
    }
  });
  env.onCleanup(() => { myRun.dead = true; cancelAnimationFrame(rafId); clearInterval(cdInt); window.removeEventListener('keydown', onKey); });
}
