// Minimal CDP driver for the Shutterhaus mobile audit.
import fs from 'node:fs';

export const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\designshots';
export const PORT = 9335;

export async function httpJson(path, method = 'GET') {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { method });
  return r.json();
}

export class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.sessionId = null; }
  static async attach(targetWsUrl) {
    const ws = new WebSocket(targetWsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && s.pending.has(m.id)) {
        const { res, rej } = s.pending.get(m.id);
        s.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method) {
        s.events.push(m);
      }
    };
    return s;
  }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify(msg));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('timeout ' + method)); } }, 60000);
    });
  }
  close() { this.ws.close(); }
}

export async function newMobileTarget(w = 393, h = 852, dpr = 3) {
  const t = await httpJson(`/json/new?about:blank`, 'PUT');
  const s = await Session.attach(t.webSocketDebuggerUrl);
  s.targetId = t.id;
  // Enable ALL domains BEFORE device metrics override, navigate LAST.
  for (const d of ['Page', 'Runtime', 'Log', 'Network', 'DOM', 'Performance', 'CSS']) {
    try { await s.send(d + '.enable'); } catch (e) { /* optional domains */ }
  }
  await s.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile: true,
    screenWidth: w, screenHeight: h,
  });
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await s.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  await s.send('Network.setCacheDisabled', { cacheDisabled: false });
  await s.send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
  });
  return s;
}

export async function nav(s, url, waitMs = 5000) {
  s.events.length = 0;
  await s.send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, waitMs));
  // SPA hash route: wait for the main to be populated
  await s.send('Runtime.evaluate', { expression: `new Promise(r=>{const t=()=>{(document.querySelector('.main')||{}).innerHTML && (document.querySelectorAll('img').length||document.querySelector('.main').innerHTML.length>400)?r(1):setTimeout(t,120)};t()})`, awaitPromise: true });
  await new Promise(r => setTimeout(r, 1800)); // let images decode
}

export async function js(s, expr) {
  const r = await s.send('Runtime.evaluate', { expression: `(()=>{${expr}})()`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
}

export async function shot(s, name, { fullPage = true } = {}) {
  let clip;
  if (fullPage) {
    const m = await s.send('Page.getLayoutMetrics');
    const cs = m.cssContentSize || m.contentSize;
    const h = Math.min(Math.ceil(cs.height), 30000);
    clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: h, scale: 1 };
  }
  const r = await s.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}), optimizeForSpeed: false });
  const p = `${OUT}\\${name}.png`;
  fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
  return p;
}
