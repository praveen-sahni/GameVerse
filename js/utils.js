// utils.js — sound state, audio blips, toast, confetti, hit feedback, seeded RNG.
// No imports: every other module may depend on this one.
export function hashSeed(str){
  let h = 2166136261;
  for(let i = 0; i < String(str).length; i++){ h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Deterministic PRNG (mulberry32). Same seed → same sequence, every device.
export function makeRng(seed){
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export let soundOn = true;
try{ soundOn = localStorage.getItem('gv_sound') !== 'off'; }catch{}
// (lazy try/catch keeps this module importable in Node for unit tests)

// Crash-proof storage: Safari Private Browsing throws on setItem.
// Falls back to memory so the app keeps running (progress just won't persist).
const memFallback = {};
export const store = {
  get(k){
    try{ return localStorage.getItem(k); }
    catch{ return k in memFallback ? memFallback[k] : null; }
  },
  set(k, v){
    try{ localStorage.setItem(k, v); }
    catch{ memFallback[k] = String(v); }
  },
  del(k){
    try{ localStorage.removeItem(k); }
    catch{ delete memFallback[k]; }
  },
  keys(){
    try{
      const out = [];
      for(let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
      return out;
    }catch{ return Object.keys(memFallback); }
  },
};

// Same crash-proofing for sessionStorage (throws in old iOS Private mode)
const sessMem = {};
export const sess = {
  get(k){
    try{ return sessionStorage.getItem(k); }
    catch{ return k in sessMem ? sessMem[k] : null; }
  },
  set(k, v){
    try{ sessionStorage.setItem(k, v); }
    catch{ sessMem[k] = String(v); }
  },
  del(k){
    try{ sessionStorage.removeItem(k); }
    catch{ delete sessMem[k]; }
  },
};

export function setSound(v){
  soundOn = !!v;
  store.set('gv_sound', soundOn ? 'on' : 'off');
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

const toastQueue = [];
let toastShowing = false;
// Queued toasts: rapid messages stack (max 3) instead of stomping each other.
// opts: {ms, onClick} — onClick makes the toast tappable (e.g. update prompt).
export function toast(msg, opts = {}){
  toastQueue.push({msg, ms: opts.ms || 2400, onClick: opts.onClick || null});
  while(toastQueue.length > 3) toastQueue.shift();
  pumpToast();
}
function pumpToast(){
  if(toastShowing) return;
  const next = toastQueue.shift();
  if(!next) return;
  const el = document.getElementById('toast');
  if(!el) return;
  toastShowing = true;
  el.textContent = next.msg;
  el.onclick = next.onClick;
  el.style.cursor = next.onClick ? 'pointer' : '';
  el.classList.remove('hidden');
  clearTimeout(pumpToast._t);
  pumpToast._t = setTimeout(() => {
    el.classList.add('hidden');
    el.onclick = null;
    toastShowing = false;
    pumpToast();
  }, next.ms);
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
