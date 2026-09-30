// E2E: boot the real page in headless Chrome over raw CDP (zero test deps —
// Playwright can't drive this machine's Chrome 154, so we speak DevTools
// protocol directly with Node's built-in WebSocket). Skipped if no Chrome.
// Run: npm test (or directly: node --test tests/e2e.test.mjs)
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const hasChrome = fs.existsSync(CHROME);
const describeE2E = hasChrome ? describe : describe.skip;

// Minimal CDP client over a page-level debugger WebSocket.
function connectDebugger(wsUrl){
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const handlers = {exception: []};
  ws.onmessage = (ev) => {
    let msg;
    try{ msg = JSON.parse(ev.data); }catch{ return; }
    if(msg.id !== undefined && pending.has(msg.id)){
      const {resolve, reject} = pending.get(msg.id);
      pending.delete(msg.id);
      if(msg.error) reject(new Error('CDP: ' + JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if(msg.method === 'Runtime.exceptionThrown'){
      const d = msg.params?.exceptionDetails || {};
      handlers.exception.forEach(fn => fn(new Error(d.text || d.exception?.description || 'page exception')));
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params}));
  });
  const opened = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('debugger socket failed'));
  });
  return {
    opened,
    onException(fn){ handlers.exception.push(fn); },
    async evaluate(fnSource, ...args){
      const r = await send('Runtime.evaluate', {expression: `(${fnSource})(${args.map(a => JSON.stringify(a)).join(',')})`, awaitPromise: true, returnByValue: true});
      if(r.exceptionDetails) throw new Error('page eval threw: ' + JSON.stringify(r.exceptionDetails.text || r.exceptionDetails).slice(0, 300));
      return r.result?.value;
    },
    screenshot(file){
      return send('Page.captureScreenshot', {format: 'png'}).then(r => fs.writeFileSync(file, Buffer.from(r.data, 'base64')));
    },
    key(name, code, vk){
      const base = {key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk};
      return send('Input.dispatchKeyEvent', {type: 'keyDown', ...base})
        .then(() => send('Input.dispatchKeyEvent', {type: 'keyUp', ...base}));
    },
    close(){ try{ ws.close(); }catch{} },
  };
}

async function launchChrome(){
  // fixed debug port; cleaned up in after()
  const proc = spawn(CHROME, [
    '--headless', '--no-sandbox', '--disable-gpu', '--mute-audio',
    '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'gv-chrome-')),
    '--remote-debugging-port=9333', '--no-first-run', 'about:blank',
  ], {stdio: ['ignore', 'ignore', 'ignore']});
  const t0 = Date.now();
  for(;;){
    try{
      const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
      const page = targets.find(t => t.type === 'page');
      if(page?.webSocketDebuggerUrl) return {proc, wsUrl: page.webSocketDebuggerUrl};
    }catch{}
    if(Date.now() - t0 > 20000){ proc.kill(); throw new Error('chrome debugger never came up'); }
    await new Promise(r => setTimeout(r, 300));
  }
}

describeE2E('browser E2E', () => {
  const PORT = 3461;
  const BASE = `http://localhost:${PORT}`;
  let child, chrome, dbg;
  const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-e2e-')), 'test.db');

  before(async () => {
    // clear stale debugger-Chrome instances from earlier runs (same fixed port)
    try{
      const {exec} = await import('node:child_process');
      await new Promise(r => exec('pkill -f "remote-debugging-port=9333"', () => r()));
      await new Promise(r => setTimeout(r, 1000));
    }catch{}
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: {...process.env, GAMEVERSE_NO_LISTEN: '', PORT: String(PORT),
        GAMEVERSE_DB: tmpDb, GAMEVERSE_NO_MIGRATE: '1', GAMEVERSE_NO_BACKUP: '1'},
      stdio: 'ignore',
    });
    const t0 = Date.now();
    for(;;){
      try{ const r = await fetch(BASE + '/api/stats/summary'); if(r.ok) break; }catch{}
      if(Date.now() - t0 > 20000) throw new Error('e2e server did not boot');
      await new Promise(r => setTimeout(r, 250));
    }
    chrome = await launchChrome();
    dbg = connectDebugger(chrome.wsUrl);
    await dbg.opened;
    await dbg.evaluate(() => new Promise((resolve) => {
      const errs = [];
      window.addEventListener('error', e => errs.push(String(e.message)));
      window.__gvE2EErrors = errs;
      resolve(true);
    }).then(() => {}));
    dbg.onException(e => { throw e; });
  }, {timeout: 60000});
  after(() => { dbg?.close(); try{ chrome?.proc.kill(); }catch{} child?.kill(); });

  async function gotoHome(){
    await dbg.evaluate((url) => { location.href = url; return true; }, BASE + '/');
    const t0 = Date.now();
    for(;;){
      const [booted, cards] = await dbg.evaluate(() => [
        window.__gvBooted === true,
        document.querySelectorAll('.game-card').length,
      ]);
      if(booted && cards === 8) return;
      if(Date.now() - t0 > 15000) throw new Error(`boot failed (booted=${booted}, cards=${cards})`);
      await new Promise(r => setTimeout(r, 400));
    }
  }
  const errCheck = () => dbg.evaluate(() => (window.__gvE2EErrors || []).slice(0, 3));

  it('boots with no JS errors and renders 8 game cards', async () => {
    await gotoHome();
    const cards = await dbg.evaluate(() => document.querySelectorAll('.game-card').length);
    assert.equal(cards, 8);
    assert.deepEqual(await errCheck(), []);
  });

  it('opens every game behind its Start gate, then starts it', async () => {
    async function clickPlay(id){
      try{
        await dbg.evaluate((gid) => { document.querySelector(`[data-play="${gid}"]`).click(); return true; }, id);
      }catch{
        // CDP evaluate can die mid-navigation-commit; wait for a settled DOM and retry once
        await new Promise(r => setTimeout(r, 1500));
        await gotoHome();
        await dbg.evaluate((gid) => { document.querySelector(`[data-play="${gid}"]`).click(); return true; }, id);
      }
    }
    for(const id of ['snake', 'memory', 'tictac', 'blaster', 'runner', 'simon', 'breakout', 'merge']){
      await gotoHome();
      await clickPlay(id);
      // modal open?
      await dbg.evaluate(() => new Promise((resolve, reject) => {
        const t0 = Date.now();
        const tick = () => {
          if(!document.getElementById('gameModal').classList.contains('hidden')) return resolve(true);
          if(Date.now() - t0 > 5000) return reject(new Error('modal never opened for ' + document.title));
          setTimeout(tick, 150);
        };
        tick();
      }));
      // start gate visible (overlay button, or Simon's Start Sequence)?
      const gate = await dbg.evaluate(() => {
        const ov = document.querySelector('.start-overlay:not(.hidden) .start-btn');
        if(ov) return 'overlay';
        if(document.getElementById('simonStart')) return 'simon';
        return 'none';
      });
      assert.ok(gate !== 'none', id + ' has no start gate');
      await dbg.screenshot(`/tmp/gv-e2e-${id}.png`);
      // press Start, let it run briefly, then close
      await dbg.evaluate(() => {
        const ov = document.querySelector('.start-overlay:not(.hidden) .start-btn');
        if(ov) ov.click();
        else document.getElementById('simonStart').click();
        return true;
      });
      await new Promise(r => setTimeout(r, 900));
      await dbg.key('Escape', 'Escape', 27);
      await new Promise(r => setTimeout(r, 300));
      assert.deepEqual(await errCheck(), []);
    }
  });

  it('daily buttons and rivals tab render', async () => {
    await gotoHome();
    const t0 = Date.now();
    let daily = 0;
    for(;;){
      daily = await dbg.evaluate(() => document.querySelectorAll('[data-daily]').length);
      if(daily >= 3 || Date.now() - t0 > 10000) break;
      await new Promise(r => setTimeout(r, 400));
    }
    assert.ok(daily >= 3, 'expected 3 daily buttons');
    await dbg.evaluate(() => {
      const sel = document.getElementById('lbGame');
      sel.value = 'rivals';
      sel.dispatchEvent(new Event('change', {bubbles: true}));
      return true;
    });
    await new Promise(r => setTimeout(r, 600));
    const text = await dbg.evaluate(() => document.getElementById('lbList').innerText.length);
    assert.ok(text > 0);
    assert.deepEqual(await errCheck(), []);
  });
});
