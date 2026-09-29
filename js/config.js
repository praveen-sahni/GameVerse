// config.js — where the API lives. Same-origin by default (node server.js serves
// both). For split hosting (static frontend on Vercel + API elsewhere), set:
//   <meta name="gv-api-base" content="https://your-api.example.com">
// in index.html / admin.html before deploying the frontend.
export function apiBase(){
  try{
    const m = document.querySelector('meta[name="gv-api-base"]');
    const v = (m?.content || '').trim().replace(/\/+$/, '');
    if(/^https?:\/\//.test(v)) return v;
  }catch{}
  return '';
}
export function apiUrl(path){
  return apiBase() + (path.startsWith('/') ? path : '/' + path);
}
