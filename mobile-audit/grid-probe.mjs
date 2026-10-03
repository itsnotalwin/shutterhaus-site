// Focused look: the portfolio grid at 393px, menu state controlled, plus the
// tap-target and overflow measurements the mockup needs to justify itself.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9337
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-grid-${Date.now()}`
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\baseline'
mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function ready() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return (await r.json()).webSocketDebuggerUrl } catch {}
    await sleep(500)
  }
  throw new Error('no chrome')
}
const ws = new WebSocket(await ready())
await new Promise((r) => (ws.onopen = r))
let id = 0; const pending = new Map()
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result) } }
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params, sessionId })) })

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
for (const d of ['Page', 'Runtime']) await send(`${d}.enable`, {}, sessionId)
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3, mobile: true }, sessionId)
await send('Page.navigate', { url: 'https://shutterhausvisuals.co.za/#/portfolio' }, sessionId)
await sleep(4000)

const probe = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    // grid geometry: find the container holding the portfolio images
    const imgs = [...document.querySelectorAll('img')]
      .filter(i => i.getBoundingClientRect().width > 40);
    const cells = imgs.map(i => {
      const r = i.getBoundingClientRect();
      return { src: i.currentSrc.split('/').pop(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), nat: i.naturalWidth + 'x' + i.naturalHeight, lazy: i.loading };
    });
    // group into rows by y
    const rows = [];
    for (const c of cells.sort((a,b) => a.y - b.y || a.x - b.x)) {
      let r = rows.find(r => Math.abs(r.y - c.y) < 20);
      if (!r) { r = { y: c.y, h: c.h, items: [] }; rows.push(r); }
      r.items.push(c);
    }
    return {
      innerWidth: innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      imgCount: cells.length,
      rows: rows.map(r => ({ y: r.y, h: r.h, n: r.items.length, items: r.items })),
      smallTap: [...document.querySelectorAll('a,button,input,textarea,label')]
        .map(el => { const b = el.getBoundingClientRect(); return { t: el.tagName, c: el.className.toString().slice(0,30), txt: (el.textContent||'').trim().slice(0,25), w: Math.round(b.width), h: Math.round(b.height) }; })
        .filter(o => o.w > 0 && o.h > 0 && (o.w < 44 || o.h < 44)),
      fonts: [...new Set([...document.querySelectorAll('p,li,span,a,label,input')].map(el => getComputedStyle(el).fontSize))].sort(),
      imgsUnder16: [...document.querySelectorAll('input,textarea,select')].map(el => ({ t: el.tagName, fs: getComputedStyle(el).fontSize }))
    };
  })()`,
}, sessionId)
const data = probe.result.value
writeFileSync(`${OUT}\\grid-probe-393.json`, JSON.stringify(data, null, 2))

console.log('viewport 393 | doc scrollWidth', data.docScrollWidth, '| imgs', data.imgCount)
console.log('grid rows:')
data.rows.forEach((r, i) => console.log(`  row${i} y=${r.y} h=${r.h} n=${r.n} -> ${r.items.map(x => x.src).join(', ')}`))
console.log('body font sizes in use:', data.fonts.join(' '))
console.log('form control font sizes:', JSON.stringify(data.imgsUnder16))
console.log('elements under 44px tap:', data.smallTap.length)
data.smallTap.slice(0, 20).forEach(o => console.log(`   ${o.t}.${o.c} "${o.txt}" ${o.w}x${o.h}`))

// the grid close-up for the mockup "before"
await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 620); true' }, sessionId)
await sleep(1200)
const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
writeFileSync(`${OUT}\\before-grid-closeup.png`, Buffer.from(shot.data, 'base64'))
console.log('saved before-grid-closeup.png')

try { ws.close() } catch {}; chrome.kill()
try { rmSync(PROFILE, { recursive: true, force: true }) } catch {}
console.log('DONE')
