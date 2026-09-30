// games/breakout.js — Neon Breakout. Mounts into env.body; talks to the app only via env.
export function mountBreakout(env){
  env.body.innerHTML = `<div style="text-align:center"><div class="hud-row"><span class="hud-pill">Level <b id="brkLvl">1</b></span><span class="hud-pill">❤ <b id="brkLives">3</b></span><span class="hud-pill">🏆 <b id="brkBest">0</b></span><button class="btn-mini" id="brkPause">⏸ Pause</button></div><div class="canvas-wrap"><canvas id="brkCanvas" class="game-canvas" width="480" height="420"></canvas><div class="start-overlay" id="brkStart"><div class="start-title">🧱 Neon Breakout</div><div class="start-hint">Move: mouse / touch / ← → • Gold bricks +30 • Clear all to level up</div><button class="btn-primary-lg start-btn" id="brkStartBtn">▶ Start</button></div></div></div>`;
  env.bar('Break bricks • Gold +30 • 3 lives • Power = wide paddle');
  env.restart(env.body);
  const canvas = document.getElementById('brkCanvas'), ctx = canvas.getContext('2d');
  const W = 480, H = 420;
  const prevBest = env.loadProfile().stats.best.breakout || 0;
  document.getElementById('brkBest').textContent = prevBest;
  const myRun = {dead:false};
  let rafId = 0;
  let score = 0, level = 1, lives = 3, alive = true, paused = true, started = false;
  let paddle, ball, bricks, particles = [];
  const ROWS = 5, COLS = 8, TOP = 52, GAP = 6, SIDE = 14;
  const BW = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS, BH = 20;
  const ROW_COLORS = ['#FF3B6E', '#FF6A00', '#FFB800', '#00E5CC', '#7C3AED'];

  function buildLevel(){
    bricks = [];
    for(let r = 0; r < ROWS; r++) for(let c = 0; c < COLS; c++){
      const gold = Math.random() < 0.1;
      bricks.push({
        x: SIDE + c * (BW + GAP), y: TOP + r * (BH + GAP),
        hp: gold ? 1 : (r < 2 ? 2 : 1), gold,
        color: gold ? '#FFB800' : ROW_COLORS[r % ROW_COLORS.length],
      });
    }
  }
  function resetPositions(){
    paddle = {x: W / 2 - 38, w: 76, h: 12, y: H - 26, wide: 0};
    const sp = 4.2 + (level - 1) * 0.45;
    const a = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
    ball = {x: paddle.x + paddle.w / 2, y: paddle.y - 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, stuck: true};
  }
  buildLevel(); resetPositions();

  function burst(x, y, color){
    for(let i = 0; i < 10; i++) particles.push({x, y, vx:(Math.random() - 0.5) * 5, vy:(Math.random() - 0.5) * 5 - 1, life:16, color});
  }
  function rr(x, y, w, h, r){ ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  function draw(){
    if(myRun.dead) return;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0D1028'); grd.addColorStop(1, '#080A18');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for(let x = 0; x <= W; x += 30){ ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    // bricks
    bricks.forEach(b => {
      ctx.fillStyle = b.color; ctx.globalAlpha = b.hp > 1 ? 1 : 0.85;
      ctx.shadowColor = b.color; ctx.shadowBlur = b.gold ? 14 : 7;
      rr(b.x, b.y, BW, BH, 5); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if(b.hp > 1){ ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(b.x + 5, b.y + 4, BW - 10, 3); }
      if(b.gold){ ctx.fillStyle = '#1A1200'; ctx.font = '900 11px Outfit'; ctx.textAlign = 'center'; ctx.fillText('★', b.x + BW / 2, b.y + 15); }
    });
    // paddle (wide while powered)
    const pw = paddle.wide > 0 ? 122 : paddle.w;
    const px = Math.max(4, Math.min(W - 4 - pw, paddle.x + (paddle.w - pw) / 2));
    const pg = ctx.createLinearGradient(px, 0, px + pw, 0);
    pg.addColorStop(0, '#00E5CC'); pg.addColorStop(1, '#7C3AED');
    ctx.fillStyle = pg; ctx.shadowColor = '#00E5CC'; ctx.shadowBlur = 12;
    rr(px, paddle.y, pw, paddle.h, 6); ctx.fill(); ctx.shadowBlur = 0;
    paddle.px = px; paddle.pw = pw;
    // ball with trail
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(ball.x - ball.vx * 1.6, ball.y - ball.vy * 1.6, ball.r * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#00E5CC'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    // particles
    particles.forEach(p => {
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life / 16);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--; ctx.globalAlpha = 1;
    });
    particles = particles.filter(p => p.life > 0);
    if(!alive){
      ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white'; ctx.font = '900 24px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 8);
      ctx.font = '700 13px Outfit'; ctx.fillStyle = '#C8CEE6';
      ctx.fillText(`Score ${score} • Level ${level} • Best ${Math.max(prevBest, score)}`, W / 2, H / 2 + 16);
      ctx.fillStyle = '#FFB800'; ctx.fillText('Press ↻ Start Again', W / 2, H / 2 + 38);
    } else if(paused && started){
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white'; ctx.font = '900 20px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('PAUSED', W / 2, H / 2);
    }
  }

  function update(){
    if(myRun.dead) return;
    if(!alive || paused){ draw(); rafId = requestAnimationFrame(update); return; }
    if(paddle.wide > 0) paddle.wide--;
    if(ball.stuck){ ball.x = paddle.px + paddle.pw / 2; ball.y = paddle.y - 8; draw(); rafId = requestAnimationFrame(update); return; }
    ball.x += ball.vx; ball.y += ball.vy;
    if(ball.x < ball.r){ ball.x = ball.r; ball.vx *= -1; }
    if(ball.x > W - ball.r){ ball.x = W - ball.r; ball.vx *= -1; }
    if(ball.y < ball.r){ ball.y = ball.r; ball.vy *= -1; }
    // paddle bounce — angle depends on hit position
    if(ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.h + 10 &&
       ball.x >= paddle.px - ball.r && ball.x <= paddle.px + paddle.pw + ball.r){
      const rel = Math.max(-1, Math.min(1, (ball.x - (paddle.px + paddle.pw / 2)) / (paddle.pw / 2)));
      const sp = Math.min(8.5, Math.hypot(ball.vx, ball.vy) * 1.015);
      const ang = -Math.PI / 2 + rel * 1.05;
      ball.vx = Math.cos(ang) * sp; ball.vy = Math.sin(ang) * sp;
      ball.y = paddle.y - ball.r - 1;
      env.beep(520, 0.07, 'sine', 0.1);
    }
    // bricks (resolve along the axis of least penetration)
    for(let i = bricks.length - 1; i >= 0; i--){
      const b = bricks[i];
      if(ball.x + ball.r < b.x || ball.x - ball.r > b.x + BW || ball.y + ball.r < b.y || ball.y - ball.r > b.y + BH) continue;
      const dxL = (ball.x + ball.r) - b.x, dxR = (b.x + BW) - (ball.x - ball.r);
      const dyT = (ball.y + ball.r) - b.y, dyB = (b.y + BH) - (ball.y - ball.r);
      const m = Math.min(dxL, dxR, dyT, dyB);
      if(m === dxL){ ball.vx = -Math.abs(ball.vx); ball.x = b.x - ball.r; }
      else if(m === dxR){ ball.vx = Math.abs(ball.vx); ball.x = b.x + BW + ball.r; }
      else if(m === dyT){ ball.vy = -Math.abs(ball.vy); ball.y = b.y - ball.r; }
      else { ball.vy = Math.abs(ball.vy); ball.y = b.y + BH + ball.r; }
      b.hp--;
      if(b.hp <= 0){
        bricks.splice(i, 1);
        const gain = b.gold ? 30 : 10;
        score += gain; env.setScore(score);
        burst(b.x + BW / 2, b.y + BH / 2, b.color);
        env.beep(b.gold ? 1100 : 700 + Math.min(400, score / 4), 0.09, 'sine', 0.12);
        if(b.gold) env.toast('★ Gold brick +30!');
      } else env.beep(420, 0.06, 'square', 0.08);
      break; // one brick per frame keeps physics stable
    }
    if(!bricks.length){
      level++;
      document.getElementById('brkLvl').textContent = level;
      score += 50 * level; env.setScore(score);
      env.toast(`🎉 Level ${level} clear! +${50 * level}`);
      env.beep(880, 0.2, 'square', 0.12);
      buildLevel(); resetPositions(); ball.stuck = false;
    }
    if(ball.y - ball.r > H){
      lives--;
      document.getElementById('brkLives').textContent = Math.max(0, lives);
      env.shake(); env.beep(140, 0.3, 'sawtooth', 0.13);
      if(lives <= 0){
        alive = false; env.awardXp(85); draw(); return;
      }
      resetPositions();
      env.toast(`❤ ${lives} ${lives === 1 ? 'life' : 'lives'} left`);
    }
    draw(); rafId = requestAnimationFrame(update);
  }

  env.power(() => {
    paddle.wide = 600; // ~10s at 60fps
    env.toast('⚡ Wide paddle 10s!');
    env.beep(900, 0.16, 'sine', 0.12);
  });

  // controls: mouse, touch drag, arrows
  function toPaddle(clientX){
    const r = canvas.getBoundingClientRect();
    paddle.x = ((clientX - r.left) / r.width) * W - paddle.w / 2;
    paddle.x = Math.max(4, Math.min(W - 4 - paddle.w, paddle.x));
  }
  canvas.addEventListener('mousemove', e => { if(alive && !paused) toPaddle(e.clientX); });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); if(ball.stuck) ball.stuck = false; }, {passive:false});
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if(alive && !paused) toPaddle(e.touches[0].clientX); }, {passive:false});
  const keys = {};
  function onKey(e){
    const k = e.key.toLowerCase();
    if(k === 'p'){ togglePause(); return; }
    if(k === ' '){ e.preventDefault(); if(ball.stuck) ball.stuck = false; return; }
    keys[k] = true;
    if(['arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  }
  function onKeyUp(e){ keys[e.key.toLowerCase()] = false; }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  const keyInt = setInterval(() => { // keyboard paddle drift
    if(myRun.dead || !alive || paused) return;
    if(keys['arrowleft'] || keys['a']) paddle.x = Math.max(4, paddle.x - 9);
    if(keys['arrowright'] || keys['d']) paddle.x = Math.min(W - 4 - paddle.w, paddle.x + 9);
  }, 16);

  function togglePause(){
    if(!started) return;
    paused = !paused;
    document.getElementById('brkPause').textContent = paused ? '▶ Resume' : '⏸ Pause';
    if(!paused) rafId = requestAnimationFrame(update);
  }
  document.getElementById('brkPause').addEventListener('click', togglePause);
  function onVis(){
    if(document.hidden && alive && started && !paused){ togglePause(); env.toast('⏸ Auto-paused — tab hidden'); }
  }
  document.addEventListener('visibilitychange', onVis);

  document.getElementById('brkStartBtn').addEventListener('click', () => {
    if(started) return;
    started = true;
    document.getElementById('brkStart').classList.add('hidden');
    ball.stuck = false;
    togglePause();
  });
  // start overlay covers controls until then
  draw(); rafId = requestAnimationFrame(update);
  env.onCleanup(() => { myRun.dead = true; cancelAnimationFrame(rafId); clearInterval(keyInt); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); document.removeEventListener('visibilitychange', onVis); });
}
