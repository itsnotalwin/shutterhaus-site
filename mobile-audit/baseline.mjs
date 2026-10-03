// Baseline mobile screenshots of the LIVE site, for the mockup "before" panel.
// Own Chrome, own port — does not collide with the audit subagents.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9336
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-baseline-${Date.now()}`
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
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch {}
    await sleep(500)
  }
  throw new Error('chrome never came up')
}

const wsUrl = await ready()
const ws = new WebSocket(wsUrl)
await new Promise((r) => (ws.onopen = r))

let id = 0
const pending = new Map()
const events = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  } else if (msg.method) events.push(msg)
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }))
  })

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })

// Domains FIRST, then metrics, then navigate — this order matters.
for (const d of ['Page', 'Runtime', 'Log', 'Network']) await send(`${d}.enable`, {}, sessionId)

const ROUTES = ['home', 'portfolio', 'about', 'services', 'contact']
const shots = []

for (const [i, route] of ROUTES.entries()) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 393, height: 852, deviceScaleFactor: 3, mobile: true,
  }, sessionId)

  events.length = 0
  await send('Page.navigate', { url: `https://shutterhausvisuals.co.za/#/${route === 'home' ? '' : route}` }, sessionId)
  await sleep(3500)

  // dismiss the menu if a previous route left it open, then reset
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.burger')?.click(); window.scrollTo(0,0); true`,
  }, sessionId)
  await sleep(400)

  const errs = events.filter((e) =>
    e.method === 'Log.entryAdded' && e.params.entry.level === 'error')

  const full = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, optimizeForSpeed: false,
  }, sessionId)
  const name = `before-${route}.png`
  writeFileSync(`${OUT}\\${name}`, Buffer.from(full.data, 'base64'))
  shots.push({ route, name, errs: errs.length })
  console.log(`${route}: ${name}  console-errors=${errs.length}`)
}

// portrait AND a mid-scroll portfolio view, for the crop comparison
await send('Page.navigate', { url: 'https://shutterhausvisuals.co.za/#/portfolio' }, sessionId)
await sleep(3000)
await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 1100); true' }, sessionId)
await sleep(1200)
const scrolled = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
writeFileSync(`${OUT}\\before-portfolio-scrolled.png`, Buffer.from(scrolled.data, 'base64'))
shots.push({ route: 'portfolio-scrolled', name: 'before-portfolio-scrolled.png' })
console.log('portfolio scrolled: saved')

// the real computed type scale at 393px
const type = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const out = [];
    document.querySelectorAll('h1,h2,h3,h4,p,li,span,a,button,label,input,textarea').forEach(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const txt = (el.textContent || '').trim().replace(/\\s+/g,' ').slice(0, 40);
      if (!txt || r.width === 0 || r.height === 0) return;
      out.push({
        tag: el.tagName, cls: el.className.toString().slice(0,40), txt,
        size: cs.fontSize, lh: cs.lineHeight, weight: cs.fontWeight,
        color: cs.color, bg: cs.backgroundColor,
        w: Math.round(r.width), h: Math.round(r.height)
      });
    });
    const seen = new Set();
    return out.filter(o => { const k = o.tag+o.cls+o.size+o.color; if (seen.has(k)) return false; seen.add(k); return true; });
  })()`,
}, sessionId)
writeFileSync(`${OUT}\\type-scale-393.json`, JSON.stringify(type.result.value, null, 2))
console.log(`type scale: ${type.result.value.length} distinct elements`)

writeFileSync(`${OUT}\\manifest.json`, JSON.stringify(shots, null, 2))

try { ws.close() } catch {}
chrome.kill()
try { rmSync(PROFILE, { recursive: true, force: true }) } catch {}
console.log('DONE')
