// theme.js — theme switcher
export function initTheme(){
  function applyTheme(t){
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('gv_theme', t);
    document.querySelectorAll('.theme-btn').forEach(b=> b.classList.toggle('active', b.dataset.theme===t));
  }
  const saved=localStorage.getItem('gv_theme')||'ember';
  applyTheme(saved);
  document.querySelectorAll('.theme-btn').forEach(b=> b.addEventListener('click',()=> applyTheme(b.dataset.theme)));
  return {applyTheme};
}
