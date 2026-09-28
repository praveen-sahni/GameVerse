// games/tictac.js — Tic-Tac-Toe Pro (minimax AI). Mounts into env.body; talks to the app only via env.
export function mountTicTac(env){
  env.body.innerHTML = `<div style="text-align:center"><div class="hud-row"><button class="btn-mini" data-diff="easy">Easy</button><button class="btn-mini" data-diff="medium">Medium</button><button class="btn-mini" data-diff="hard" style="background:rgba(124,58,237,0.22)">Hard ★</button><span class="hud-pill" id="ttTurn">Your turn (X)</span></div><div class="tictac" id="ttGrid"></div><div style="margin-top:10px;color:#9AA0B5;font-weight:700">You: <b style="color:#00E5CC">X</b> • AI: <b style="color:#FF3B6E">O</b> • <span id="ttScore">W0 D0 L0</span> <span id="ttThink"></span></div></div>`;
  env.bar('First to win glows • Hint = power-up');
  env.restart(env.body);
  const grid = document.getElementById('ttGrid');
  let board = Array(9).fill(''), over = false, diff = 'hard', aiTimer = null;
  let WL = [], scoreW = {w:0, d:0, l:0};

  document.querySelectorAll('[data-diff]').forEach(b => {
    b.addEventListener('click', () => {
      diff = b.dataset.diff;
      document.querySelectorAll('[data-diff]').forEach(x => x.style.background = '');
      b.style.background = 'rgba(124,58,237,0.22)';
      reset();
    });
  });

  function win(b){
    const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for(let i = 0; i < wins.length; i++){
      const w = wins[i];
      if(b[w[0]] && b[w[0]] === b[w[1]] && b[w[1]] === b[w[2]]) return {winner:b[w[0]], line:w, idx:i};
    }
    return b.includes('') ? null : {winner:'draw'};
  }
  function minimax(b, isMax){
    const r = win(b);
    if(r){ if(r.winner === 'O') return 10; if(r.winner === 'X') return -10; return 0; }
    if(isMax){
      let best = -Infinity;
      for(let i = 0; i < 9; i++) if(!b[i]){ b[i] = 'O'; best = Math.max(best, minimax(b, false)); b[i] = ''; }
      return best;
    }
    let best = Infinity;
    for(let i = 0; i < 9; i++) if(!b[i]){ b[i] = 'X'; best = Math.min(best, minimax(b, true)); b[i] = ''; }
    return best;
  }
  function setTurn(t){ const el = document.getElementById('ttTurn'); if(el) el.textContent = t; }

  function aiMove(){
    setTurn('AI thinking…');
    const th = document.getElementById('ttThink');
    if(th) th.innerHTML = '<span class="tt-thinking">●●●</span>';
    aiTimer = setTimeout(() => {
      if(over) return;
      if(diff === 'easy'){
        const e = board.map((v, i) => v === '' ? i : null).filter(v => v !== null);
        if(e.length) board[e[Math.floor(Math.random() * e.length)]] = 'O';
      } else if(diff === 'medium'){
        if(Math.random() < 0.4){
          const e = board.map((v, i) => v === '' ? i : null).filter(v => v !== null);
          board[e[Math.floor(Math.random() * e.length)]] = 'O';
        } else bestMove();
      } else bestMove();
      function bestMove(){
        let best = -Infinity, move = -1;
        for(let i = 0; i < 9; i++) if(!board[i]){ board[i] = 'O'; const v = minimax(board, false); board[i] = ''; if(v > best){ best = v; move = i; } }
        if(move !== -1) board[move] = 'O';
      }
      if(th) th.innerHTML = '';
      setTurn('Your turn (X)');
      env.beep(420, 0.08, 'sine', 0.08);
      draw(); check();
    }, diff === 'hard' ? 420 : 300);
  }

  function check(){
    const r = win(board);
    if(!r) return;
    over = true; WL = r.line || [];
    setTurn(r.winner === 'draw' ? 'Draw!' : (r.winner === 'X' ? 'You win! 🎉' : 'AI wins'));
    if(r.winner === 'X'){
      scoreW.w++; env.setScore(100 + scoreW.w * 10);
      env.beep(880, 0.14, 'sine', 0.13); setTimeout(() => env.beep(1174, 0.18, 'sine', 0.12), 140);
      env.confetti(window.innerWidth / 2, 220); env.awardXp(60); env.toast('You won! 🎉');
    } else if(r.winner === 'O'){
      scoreW.l++; env.setScore(0); env.shake();
      env.beep(140, 0.35, 'sawtooth', 0.13); env.awardXp(10); env.toast('AI won');
    } else {
      scoreW.d++; env.setScore(50);
      env.beep(500, 0.18, 'square', 0.1); env.awardXp(20); env.toast('Draw');
    }
    document.getElementById('ttScore').textContent = `W${scoreW.w} D${scoreW.d} L${scoreW.l}`;
    draw();
  }

  function reset(){ board = Array(9).fill(''); over = false; WL = []; setTurn('Your turn (X)'); draw(); env.setScore(0); }

  env.power(() => {
    if(over) return;
    let best = -Infinity, move = -1;
    for(let i = 0; i < 9; i++) if(!board[i]){ board[i] = 'X'; const v = minimax(board, true); board[i] = ''; if(v > best){ best = v; move = i; } }
    if(move !== -1){
      const hint = grid.children[move];
      hint.style.outline = '2px dashed #FFB800'; hint.style.outlineOffset = '2px';
      setTimeout(() => { hint.style.outline = ''; }, 1200);
      env.beep(750, 0.14, 'sine', 0.1); env.toast('💡 Hint highlighted!');
    }
  });

  function draw(){
    grid.innerHTML = '';
    board.forEach((v, i) => {
      const cell = document.createElement('div');
      cell.className = 'tt-cell pop';
      cell.setAttribute('role', 'button'); cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', 'Cell ' + (i + 1) + ' ' + (v || 'empty'));
      if(WL.includes(i)){
        cell.style.background = 'linear-gradient(135deg, rgba(0,229,204,0.26), rgba(255,59,110,0.16))';
        cell.style.borderColor = 'rgba(0,229,204,0.55)';
        cell.style.boxShadow = '0 0 18px rgba(0,229,204,0.28)';
      }
      cell.textContent = v;
      if(v === 'X') cell.style.color = '#00E5CC';
      if(v === 'O') cell.style.color = '#FF3B6E';
      const play = () => {
        if(over || board[i]) return;
        board[i] = 'X'; env.beep(600, 0.09, 'sine', 0.1); draw();
        const r = win(board);
        if(r) check(); else aiMove();
      };
      cell.addEventListener('click', play);
      cell.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); play(); } });
      grid.appendChild(cell);
    });
  }
  draw(); env.setScore(0);
  env.onCleanup(() => { clearTimeout(aiTimer); });
}
