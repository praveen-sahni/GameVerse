// games/memory.js — Memory Flip Pro. Mounts into env.body; talks to the app only via env.
export function mountMemory(env){
  env.body.innerHTML = `<div style="text-align:center"><div class="hud-row"><span class="hud-pill">⏱ <b id="memTime">0s</b></span><span class="hud-pill">♠ <b id="memMoves">0</b></span><span class="hud-pill">⭐ <b id="memStars">★★★</b></span><span class="hud-pill">🔥 <b id="memStreak">x0</b></span><span class="hud-pill">🏆 <b id="memBest">0</b></span><select id="memDiff" class="btn-mini" aria-label="Memory difficulty"><option value="6">Easy 6 pairs</option><option value="8" selected>Medium 8 pairs</option><option value="10">Hard 10 pairs</option></select></div><div style="max-width:420px;margin:0 auto 10px"><div class="combo-wrap" style="max-width:100%"><div class="combo-fill" id="memProg"></div></div></div><div class="mem-wrap"><div id="memGrid" class="memory-grid"></div><div class="start-overlay" id="memStart"><div class="start-title">🧠 Memory Flip</div><div class="start-hint">Flip two cards • Match all pairs • Fewer moves = more stars</div><button class="btn-primary-lg start-btn" id="memStartBtn">▶ Start</button></div></div></div>`;
  env.bar('Match fast • Streak bonus • 1-0 keys work');
  env.restart(env.body);
  const allEmojis = ['🎮','🚀','👾','🎯','💎','⚡','🔥','👑','🐍','🎧','🍕','🚗'];
  let pairCount = 8;
  const diffSel = document.getElementById('memDiff');
  document.getElementById('memBest').textContent = env.loadProfile().stats.best.memory || 0;

  const R = env.daily ? env.daily.rng : Math.random; // daily runs: same shuffle for everyone
  function build(){
    const emojis = allEmojis.slice(0, pairCount);
    const deck = [...emojis, ...emojis];
    for(let i = deck.length - 1; i > 0; i--){
      const j = Math.floor(R() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  const cards = build();
  const flipped = [], matched = new Set();
  let moves = 0, pairs = 0, streak = 0, bestStreak = 0;
  let start = 0; // timer begins when the player presses Start
  let timer = null, locked = false;
  const grid = document.getElementById('memGrid');
  grid.style.gridTemplateColumns = pairCount > 8 ? 'repeat(5,72px)' : 'repeat(4,86px)';

  document.getElementById('memStartBtn').addEventListener('click', () => {
    document.getElementById('memStart').classList.add('hidden');
    start = Date.now();
    updStars();
  });
  function updStars(){
    if(!start) return;
    const secs = Math.floor((Date.now() - start) / 1000);
    const t = document.getElementById('memTime'); if(!t) return;
    t.textContent = secs + 's';
    document.getElementById('memMoves').textContent = moves;
    const st = document.getElementById('memStreak');
    if(st){ st.textContent = 'x' + streak; st.parentElement.style.borderColor = streak >= 3 ? 'rgba(255,184,0,0.55)' : ''; }
    let stars = '★★★';
    if(moves > pairCount * 2.5 || secs > 50) stars = '★★☆';
    if(moves > pairCount * 3.5 || secs > 80) stars = '★☆☆';
    document.getElementById('memStars').textContent = stars;
    document.getElementById('memStars').style.color = stars === '★★★' ? '#FFD60A' : stars === '★★☆' ? '#FFB800' : '#FF6A00';
    document.getElementById('memProg').style.width = (pairs / pairCount * 100) + '%';
  }
  diffSel.addEventListener('change', () => { pairCount = Number(diffSel.value); env.remount(); });
  timer = setInterval(updStars, 400);

  cards.forEach((em, i) => {
    const c = document.createElement('div');
    c.className = 'mem-card'; c.dataset.i = i;
    c.innerHTML = `<div class="mem-inner"><div class="mem-front">?</div><div class="mem-back">${em}</div></div>`;
      const activate = () => {
        if(!start || locked || c.classList.contains('flipped') || matched.has(i)) return;
      c.classList.add('flipped'); env.beep(520, 0.08, 'sine', 0.08); flipped.push({c, i, em});
      if(flipped.length === 2){
        moves++; locked = true;
        const [a, b] = flipped;
        if(a.em === b.em){
          matched.add(a.i); matched.add(b.i); pairs++; streak++; bestStreak = Math.max(bestStreak, streak);
          a.c.classList.add('bounce'); b.c.classList.add('bounce');
          setTimeout(() => { a.c.classList.remove('bounce'); b.c.classList.remove('bounce'); }, 420);
          a.c.classList.add('matched'); b.c.classList.add('matched');
          env.beep(660 + streak * 60, 0.14, 'sine', 0.12); flipped.length = 0; locked = false;
          const secs = Math.floor((Date.now() - start) / 1000);
          const base = 200 - moves * 3 - Math.floor(secs * 0.7) + pairs * 14 + streak * 6;
          env.setScore(Math.max(20, base));
          updStars();
          if(pairs === pairCount){
            clearInterval(timer);
            const stars = document.getElementById('memStars').textContent;
            setTimeout(() => {
              env.awardXp(60 + (stars === '★★★' ? 25 : 0) + Math.min(20, bestStreak * 2));
              env.toast(`Perfect! ${stars} • ${moves} moves • ${secs}s • streak x${bestStreak}`);
              env.confetti(window.innerWidth / 2, 260);
            }, 380);
          }
        } else {
          streak = 0; env.beep(180, 0.18, 'square', 0.08);
          a.c.classList.add('mismatch'); b.c.classList.add('mismatch');
          setTimeout(() => {
            a.c.classList.remove('flipped', 'mismatch'); b.c.classList.remove('flipped', 'mismatch');
            flipped.length = 0; locked = false;
            env.setScore(Math.max(0, 100 - moves * 3)); updStars();
          }, 620);
        }
      }
    };
    c.addEventListener('click', activate);
    c.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); activate(); } });
    grid.appendChild(c);
  });

  function memKey(e){
    if(e.key >= '1' && e.key <= '8'){
      const idx = Number(e.key) - 1;
      const el = grid.children[idx * 2] || grid.children[idx];
      if(el) el.click();
    }
    if(e.key === 'Tab'){
      e.preventDefault();
      const cardsEls = [...grid.children];
      const cur = document.activeElement;
      let idx = cardsEls.indexOf(cur);
      let next = (idx + 1) % cardsEls.length;
      if(idx === -1) next = 0;
      cardsEls[next].focus();
    }
  }
  window.addEventListener('keydown', memKey);
  setTimeout(() => [...grid.children].forEach(c => c.setAttribute('tabindex', '0')), 60);

  env.power(() => {
    if(matched.size >= pairCount * 2 - 2) return;
    const unmatched = cards.map((em, i) => matched.has(i) ? null : {em, i}).filter(Boolean);
    const byEm = {};
    unmatched.forEach(o => { (byEm[o.em] = byEm[o.em] || []).push(o); });
    const pair = Object.values(byEm).find(a => a.length === 2);
    if(!pair) return;
    const els = pair.map(p => grid.children[p.i]);
    els.forEach(el => el.classList.add('flipped'));
    setTimeout(() => { els.forEach(el => { if(!matched.has(Number(el.dataset.i))) el.classList.remove('flipped'); }); }, 850);
    env.beep(700, 0.2, 'sine', 0.1);
  });

  env.setScore(0);
  env.onCleanup(() => { clearInterval(timer); window.removeEventListener('keydown', memKey); });
}
