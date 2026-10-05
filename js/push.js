// push.js — Web Push opt-in UI. Depends on utils + api + config (one-way).
import {toast} from './utils.js';
import {getUserId, getToken} from './api.js';
import {apiBase} from './config.js';

export function pushSupported(){
  return ('serviceWorker' in navigator) && ('PushManager' in window) && window.isSecureContext !== false;
}

function b64ToKey(b64){
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function refreshPushBtn(){
  const btn = document.getElementById('pushBtn');
  if(!btn) return;
  try{
    if(!pushSupported() || Notification.permission === 'denied'){
      btn.textContent = '🔔 Reminders: blocked';
      btn.disabled = true;
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    btn.textContent = sub ? '🔔 Reminders: on' : '🔔 Reminders: off';
    btn.disabled = false;
  }catch{
    btn.textContent = '🔔 Reminders: off';
  }
}

export async function togglePush(){
  const btn = document.getElementById('pushBtn');
  try{
    if(!pushSupported()){ toast('Push not supported in this browser'); return; }
    if(!getUserId()){ toast('Create a profile first, then enable reminders'); return; }
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if(existing){
      await existing.unsubscribe();
      await fetch(apiBase() + '/api/push/unsubscribe', {method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({userId: Number(getUserId()), endpoint: existing.endpoint})});
      toast('🔕 Reminders off');
    } else {
      if(Notification.permission === 'denied'){ toast('Notifications blocked — allow them in browser settings'); return; }
      const perm = await Notification.requestPermission();
      if(perm !== 'granted'){ toast('Permission not granted'); return; }
      const kr = await fetch(apiBase() + '/api/push/public-key');
      if(!kr.ok) throw new Error('server push not configured');
      const {key} = await kr.json();
      const sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64ToKey(key)});
      const r = await fetch(apiBase() + '/api/push/subscribe', {method:'POST',
        headers:{'Content-Type':'application/json', 'x-gv-token': getToken()},
        body: JSON.stringify({userId: Number(getUserId()), subscription: sub.toJSON()})});
      if(!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Subscribe failed');
      toast('🔔 Reminders on — see you tomorrow!');
    }
  }catch(e){ toast(e.message || 'Push failed'); }
  refreshPushBtn();
}

export function initPushUI(){
  document.getElementById('pushBtn')?.addEventListener('click', togglePush);
  refreshPushBtn();
}
