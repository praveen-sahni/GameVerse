// utils.js — sound state, audio blips, toast, confetti, hit feedback.
// No imports: every other module may depend on this one.
export let soundOn = true;
try{ soundOn = localStorage.getItem('gv_sound') !== 'off'; }catch{}
// (lazy try/catch keeps this module importable in Node for unit tests)

export function setSound(v){
  soundOn = !!v;
  localStorage.setItem('gv_sound', soundOn ? 'on' : 'off');
  updateSoundBtn();
}

export function updateSoundBtn(){
  const b = document.getElementById('soundToggle');
  if(b) b.textContent = soundOn ? '🔊' : '🔇';
}

let actx = null;
export function beep(freq, dur = 0.18, type = 'sine', vol = 0.13){
  if(!soundOn) return;
  try{
    if(!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if(actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol; o.connect(g).connect(actx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    setTimeout(() => { try{ o.stop(); }catch{} }, dur * 1000 + 20);
  }catch{}
}

export function toast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2400);
}

export function confettiBurst(x, y){
  for(let i = 0; i < 14; i++){
    const d = document.createElement('div');
    d.textContent = ['✨','🎉','💥','⭐'][Math.floor(Math.random() * 4)];
    d.style.position = 'fixed'; d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.pointerEvents = 'none'; d.style.fontSize = '1.2rem'; d.style.zIndex = 70;
    d.style.transition = 'all 0.85s cubic-bezier(0.16,1,0.3,1)';
    document.body.appendChild(d);
    requestAnimationFrame(() => {
      d.style.transform = `translate(${(Math.random() - 0.5) * 180}px, ${80 + Math.random() * 80}px)`;
      d.style.opacity = '0';
    });
    setTimeout(() => d.remove(), 900);
  }
}

export function triggerShake(){
  const f = document.getElementById('gameBody');
  if(!f) return;
  f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
  const fl = document.createElement('div');
  fl.className = 'hit-flash';
  document.body.appendChild(fl);
  setTimeout(() => fl.remove(), 280);
}
