// games/merge.js — 2048 Merge. Mounts into env.body; talks to the app only via env.
export function mountMerge(env){
  env.body.innerHTML = `<div style="text-align:center"><div class="hud-row"><span class="hud-pill">Score <b id="mrgScore">0</b></span><span class="hud-pill">🏆 <b id="mrgBest">0</b></span><span class="hud-pill">🎯 <b id="mrgMax">2</b></span><button class="btn-mini" id="mrgUndo">↩ Undo</button><button class="btn-mini" id="mrgNew">↻ New</button></div><div class="mem-wrap"><div class="merge-grid" id="mrgGrid" style="touch-action:none"></div><div class="start-overlay" id="mrgStart"><div class="start-title">🔢 2048 Merge</div><div class="start-hint">Arrows / WASD / swipe / buttons • Merge to 2048 • Undo power available</div><button class="btn-primary-lg start-btn" id="mrgStartBtn">▶ Start</button></div></div><div class="hud-row" style="margin-top:10px"><button class="btn-mini" data-mv="up">▲</button><button class="btn-mini" data-mv="left">◀</button><button class="btn-mini" data-mv="down">▼</button><button class="btn-mini" data-mv="right">▶</button></div></div>`;
  env.bar('Merge matching tiles • Reach 2048 • Undo = power-up');
  env.restart(env.body);
  const grid = document.getElementById('mrgGrid');
  document.getElementById('mrgBest').textContent = env.loadProfile().stats.best.merge || 0;
  let board, score = 0, over = false, won = false, started = false, dead = false;
  let prev = null; // undo snapshot (also the power-up)

  const TILE = {
    2:['#3A3F5E','#fff'], 4:['#4A4F7E','#fff'], 8:['#FF6A00','#fff'], 16:['#FF8A00','#1A1200'],
    32:['#FF3B6E','#fff'], 64:['#DC2626','#fff'], 128:['#FFD60A','#1A1200'], 256:['#EAB308','#1A1200'],
    512:['#00E5CC','#062A33'], 1024:['#06B6D4','#fff'], 2048:['#FFD60A','#1A1200'],
  };
  function tileStyle(v){
    const t = TILE[v] || ['#7C3AED', '#fff'];
    const digits = String(v).length;
    return `background:${t[0]};color:${t[1]};font-size:${digits > 4 ? '1rem' : digits > 3 ? '1.2rem' : '1.5rem'};`;
  }
  function emptyCells(b){
    const out = [];
    for(let r = 0; r < 4; r++) for(let c = 0; c < 4; c++) if(!b[r][c]) out.push([r, c]);
    return out;
  }
  function spawn(b){
    const cells = emptyCells(b);
    if(!cells.length) return;
    const [r, c] = cells[Math.floor(Math.random() * cells.length)];
    b[r][c] = {v: Math.random() < 0.9 ? 2 : 4, fresh:true, merged:false};
  }
  function fresh(){
    board = Array.from({length:4}, () => Array(4).fill(null));
    score = 0; over = false; won = false; prev = null;
    spawn(board); spawn(board);
    env.setScore(0);
    document.getElementById('mrgScore').textContent = '0';
    document.getElementById('mrgMax').textContent = '2';
    draw();
  }
  function draw(){
    if(dead) return;
    grid.innerHTML = '';
    let max = 0;
    board.flat().forEach(cell => { if(cell && cell.v > max) max = cell.v; });
    document.getElementById('mrgMax').textContent = max || 2;
    board.forEach(row => row.forEach(cell => {
      const d = document.createElement('div');
      d.className = 'merge-cell' + (cell ? '' : ' empty') + (cell?.fresh ? ' pop' : '') + (cell?.merged ? ' merged' : '');
      if(cell){ d.style.cssText = tileStyle(cell.v); d.textContent = cell.v; cell.fresh = false; cell.merged = false; }
      grid.appendChild(d);
    }));
  }
  function slide(row){
    // returns {merged row of {v} or null, gained score, moved flag}
    const tiles = row.filter(Boolean).map(c => c.v);
    const out = [];
    let gained = 0, moved = false, i = 0;
    while(i < tiles.length){
      if(i + 1 < tiles.length && tiles[i] === tiles[i + 1]){
        const v = tiles[i] * 2;
        out.push({v, fresh:false, merged:true});
        gained += v; i += 2;
      } else { out.push({v:tiles[i], fresh:false, merged:false}); i++; }
    }
    while(out.length < 4) out.push(null);
    return {out, gained};
  }
  function move(dir){
    if(!started || over || dead) return false;
    prev = {grid: board.map(r => r.map(c => (c ? {v:c.v, fresh:false, merged:false} : null))), score};
    let gained = 0, moved = false;
    for(let i = 0; i < 4; i++){
      let line, restore;
      if(dir === 'left'){ line = board[i]; restore = r => { board[i] = r; }; }
      if(dir === 'right'){ line = [...board[i]].reverse(); restore = r => { board[i] = r.reverse(); }; }
      if(dir === 'up'){ line = board.map(r => r[i]); restore = r => { r.forEach((c, k) => { board[k][i] = c; }); }; }
      if(dir === 'down'){ line = board.map(r => r[i]).reverse(); restore = r => { const rr = r.reverse(); rr.forEach((c, k) => { board[k][i] = c; }); }; }
      const before = JSON.stringify(line.map(c => (c ? c.v : 0)));
      const {out, gained:g} = slide(line);
      gained += g;
      restore(out);
      if(JSON.stringify(out.map(c => (c ? c.v : 0))) !== before) moved = true;
    }
    if(!moved){ prev = null; return false; }
    score += gained;
    env.setScore(score);
    document.getElementById('mrgScore').textContent = score;
    spawn(board);
    // fresh flags only for the newly spawned tile
    draw();
    const max = Math.max(...board.flat().map(c => (c ? c.v : 0)));
    if(max >= 2048 && !won){
      won = true;
      env.confetti(window.innerWidth / 2, 220);
      env.toast('🏆 2048! Legendary — keep going!');
      env.beep(880, 0.25, 'square', 0.13);
    } else if(gained > 0) env.beep(440 + Math.min(500, gained), 0.08, 'sine', 0.09);
    if(!canMove()){
      over = true;
      env.shake();
      env.awardXp(65);
      env.toast(`Game over! Score ${score}`);
    }
    return true;
  }
  function canMove(){
    if(emptyCells(board).length) return true;
    for(let r = 0; r < 4; r++) for(let c = 0; c < 4; c++){
      const v = board[r][c]?.v;
      if(c < 3 && board[r][c + 1]?.v === v) return true;
      if(r < 3 && board[r + 1][c]?.v === v) return true;
    }
    return false;
  }
  function doUndo(){
    if(!prev || over) return;
    board = prev.grid; score = prev.score; prev = null;
    env.setScore(score);
    document.getElementById('mrgScore').textContent = score;
    draw();
    env.toast('↩ Undone!');
    env.beep(600, 0.1, 'sine', 0.1);
  }
  env.power(() => { // power-up button = extra undo
    if(!prev){ env.toast('Nothing to undo yet!'); return; }
    doUndo();
  });

  function onKey(e){
    if(!started || over) return;
    const k = e.key.toLowerCase();
    const map = {arrowup:'up', w:'up', arrowdown:'down', s:'down', arrowleft:'left', a:'left', arrowright:'right', d:'right'};
    if(map[k]){ e.preventDefault(); move(map[k]); }
    else if(k === 'u') doUndo();
  }
  window.addEventListener('keydown', onKey);
  let sx = 0, sy = 0;
  grid.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, {passive:true});
  grid.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if(Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  document.querySelectorAll('[data-mv]').forEach(b => b.addEventListener('click', () => move(b.dataset.mv)));
  document.getElementById('mrgUndo').addEventListener('click', doUndo);
  document.getElementById('mrgNew').addEventListener('click', () => { fresh(); env.toast('↻ New board!'); });
  document.getElementById('mrgStartBtn').addEventListener('click', () => {
    if(started) return;
    started = true;
    document.getElementById('mrgStart').classList.add('hidden');
    fresh();
  });
  fresh(); // render dimmed board behind the overlay
  env.onCleanup(() => { dead = true; window.removeEventListener('keydown', onKey); });
}
