// config.js — where the API lives. Same-origin by default (node server.js serves
// both). Repo default is empty (local dev + Railway same-origin just work).
// GitHub Pages has no backend, so it falls back to the Railway API.
// For any other split hosting, set:
//   <meta name="gv-api-base" content="https://your-api.example.com">
const GITHUB_API_FALLBACK = 'https://gameverse-production-e0d6.up.railway.app';
export function apiBase(){
  try{
    const m = document.querySelector('meta[name="gv-api-base"]');
    const v = (m?.content || '').trim().replace(/\/+$/, '');
    if(/^https?:\/\//.test(v)) return v;
    if(typeof location !== 'undefined' && /github\.io$/.test(location.hostname)) return GITHUB_API_FALLBACK;
  }catch{}
  return '';
}
export function apiUrl(path){
  return apiBase() + (path.startsWith('/') ? path : '/' + path);
}
