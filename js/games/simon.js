// games/simon.js — Simon Nova+. Mounts into env.body; talks to the app only via env.
export function mountSimon(env){
  env.body.innerHTML = `<div style="text-align:center"><div class="hud-row"><span class="hud-pill">Level <b id="simonLevel">1</b></span><span class="hud-pill">Speed <b id="simonSpd">1x</b></span><span class="hud-pill">🏆 <b id="simonBest">0</b></span><label style="display:flex;gap:6px;align-items:center;font-size:0.85rem"><input type="checkbox" id="simonStrict"> Strict</label></div><div id="simonDots" style="margin-bottom:8px;min-height:14px"></div><div class="simon-grid" id="simonGrid"></div><div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn-primary-lg" id="simonStart">▶ Start Sequence</button><button class="btn-mini" id="simonRepeat">↻ Repeat</button></div><div style="margin-top:6px;color:#9AA0B5;font-size:0.82rem">Keys 1-4 work • Watch then repeat</div></div>`;
  env.bar('Strict resets • Dots show progress • Power = replay');
  env.restart(env.body);
  const grid = document.getElementById('simonGrid');
  const tones = [261.6, 329.6, 392, 523.2];
  document.getElementById('simonBest').textContent = env.loadProfile().stats.best.simon || 0;
  let seq = [], inputIdx = 0, playing = false, level = 1, speed = 520, dead = false;
  const btns = [];

  function renderDots(){
    const d = document.getElementById('simonDots');
    if(!d) return;
    d.innerHTML = seq.map((_, i) => `<span class="simon-dot ${i < inputIdx ? 'on' : ''}"></span>`).join('');
  }
  function flash(i){
    if(dead) return;
    btns[i].classList.add('active');
    setTimeout(() => btns[i].classList.remove('active'), 300);
    const r = document.createElement('div');
    r.style.position = 'absolute'; r.style.inset = '0'; r.style.borderRadius = '20px';
    r.style.background = 'rgba(255,255,255,0.2)'; r.style.pointerEvents = 'none';
    btns[i].style.position = 'relative';
    btns[i].appendChild(r);
    setTimeout(() => r.remove(), 300);
  }
  function press(i){
    flash(i); env.beep(tones[i], 0.18, 'sine', 0.13);
    btns[i].classList.add('hit');
    setTimeout(() => btns[i].classList.remove('hit'), 130);
    if(seq[inputIdx] !== i){
      env.shake();
      if(document.getElementById('simonStrict').checked){
        env.setScore(Math.max(0, (level - 1) * 20));
        env.awardXp(22);
        env.toast('Strict fail — restarting');
        seq = []; level = 1; inputIdx = 0;
        document.getElementById('simonLevel').textContent = 1;
        speed = 520; document.getElementById('simonSpd').textContent = '1x';
        renderDots();
      } else {
        env.toast('Wrong — watch again');
        inputIdx = 0; renderDots();
        setTimeout(() => { if(!dead) playSeq(); }, 700);
      }
      return;
    }
    inputIdx++; renderDots();
    if(inputIdx === seq.length){
      const bonus = level * 28 + Math.max(0, 200 - Math.floor(speed));
      env.setScore(bonus);
      env.confetti(window.innerWidth / 2 - 60 + Math.random() * 120, 200);
      if(level % 4 === 0){
        speed = Math.max(250, speed - 44);
        document.getElementById('simonSpd').textContent = (520 / speed).toFixed(1) + 'x';
        env.beep(880, 0.18, 'square', 0.11);
      }
      if(level >= 8){ env.awardXp(75); env.toast(`🏆 Level 8 master! Score ${bonus}`); }
      level++;
      document.getElementById('simonLevel').textContent = level;
      inputIdx = 0;
      setTimeout(() => { if(!dead) next(); }, 720);
    }
  }
  function sKey(e){
    if(e.key >= '1' && e.key <= '4'){
      const i = Number(e.key) - 1;
      if(btns[i]) press(i);
    }
  }
  for(let i = 0; i < 4; i++){
    const b = document.createElement('button');
    b.className = 'simon-btn'; b.dataset.i = i;
    b.setAttribute('aria-label', 'Simon pad ' + (i + 1));
    b.addEventListener('click', () => { if(playing || dead) return; press(i); });
    grid.appendChild(b); btns.push(b);
  }
  window.addEventListener('keydown', sKey);

  env.power(() => {
    if(seq.length){ env.toast('🔁 Replaying sequence'); playSeq(); }
  });

  async function playSeq(){
    if(dead) return;
    playing = true; renderDots();
    await new Promise(r => setTimeout(r, 380));
    for(const s of seq){
      if(dead) return;
      flash(s); env.beep(tones[s], 0.24, 'sine', 0.13);
      await new Promise(r => setTimeout(r, speed));
      await new Promise(r => setTimeout(r, 130));
    }
    playing = false;
  }
  function next(){
    if(dead) return;
    seq.push(Math.floor(Math.random() * 4));
    document.getElementById('simonLevel').textContent = level;
    renderDots(); playSeq();
  }
  document.getElementById('simonStart').addEventListener('click', () => {
    seq = []; level = 1; inputIdx = 0; speed = 520; env.setScore(0);
    document.getElementById('simonLevel').textContent = 1;
    document.getElementById('simonSpd').textContent = '1x';
    next();
  });
  document.getElementById('simonRepeat').addEventListener('click', () => { if(seq.length && !playing) playSeq(); });
  env.setScore(0); renderDots();
  env.onCleanup(() => { dead = true; window.removeEventListener('keydown', sKey); });
}
