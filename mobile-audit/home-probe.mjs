// Home page grid + hero: is the white gap a layout hole or an unloaded image?
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9338
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-home-${Date.now()}`
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\baseline'
mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--remote-allow-origins=*',`--user-data-dir=${PROFILE}`,'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/version`);if(r.ok)return (await r.json()).webSocketDebuggerUrl}catch{} await sleep(500)} throw new Error('no chrome')}
const ws = new WebSocket(await ready()); await new Promise(r=>ws.onopen=r)
let id=0; const pending=new Map()
ws.onmessage=(m)=>{const msg=JSON.parse(m.data); if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}}
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const mid=++id;pending.set(mid,{resolve,reject});ws.send(JSON.stringify({id:mid,method,params,sessionId}))})
const {targetId}=await send('Target.createTarget',{url:'about:blank'})
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
for(const d of ['Page','Runtime']) await send(`${d}.enable`,{},sessionId)
await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true},sessionId)
await send('Page.navigate',{url:'https://shutterhausvisuals.co.za/'},sessionId)
await sleep(5000)

const probe = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
  const imgs=[...document.querySelectorAll('img')].map(i=>{const r=i.getBoundingClientRect();const cs=getComputedStyle(i);
    return {src:i.currentSrc.split('/').pop(), alt:(i.alt||'').slice(0,30), x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
      loading:i.loading, complete:i.complete, natW:i.naturalWidth, natH:i.naturalHeight, op:cs.opacity, disp:cs.display, vis:cs.visibility};})
    .filter(o=>o.w>0);
  // hero
  const hero=document.querySelector('.hero, .hero__img, header');
  const hs=hero?getComputedStyle(hero):null;
  return {imgs, count:imgs.length,
    hero: hero?{cls:hero.className, h:Math.round(hero.getBoundingClientRect().height), bg:hs.backgroundImage.slice(0,80), minH:hs.minHeight}:null,
    unloaded: imgs.filter(o=>!o.complete||o.natW===0).map(o=>o.src),
    lazyBelowFold: imgs.filter(o=>o.loading==='lazy').length,
    docW: document.documentElement.scrollWidth};
})()`},sessionId)
const d = probe.result.value
writeFileSync(`${OUT}\\home-probe-393.json`,JSON.stringify(d,null,2))
console.log('imgs:',d.count,'| docW',d.docW)
console.log('hero:',JSON.stringify(d.hero))
console.log('UNLOADED (blank cells):',JSON.stringify(d.unloaded))
console.log('lazy:',d.lazyBelowFold)
console.log('\nimg geometry:')
d.imgs.forEach(o=>console.log(`  y=${o.y} ${o.w}x${o.h} nat=${o.natW}x${o.natH} loading=${o.loading} op=${o.op} ${o.src}`))

// scroll through and re-measure to see if the gap fills in
console.log('\n--- after full scroll (lazy load) ---')
for (let y=0;y<6000;y+=800){ await send('Runtime.evaluate',{expression:`window.scrollTo(0,${y});true`},sessionId); await sleep(500) }
await sleep(1500)
const after = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
  const imgs=[...document.querySelectorAll('img')].filter(i=>i.getBoundingClientRect().width>0);
  return {unloaded: imgs.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.currentSrc.split('/').pop()),
          loaded: imgs.filter(i=>i.complete&&i.naturalWidth>0).length, total: imgs.length};
})()`},sessionId)
console.log('after scroll:',JSON.stringify(after.result.value))

const shot = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId)
writeFileSync(`${OUT}\\before-home-full.png`,Buffer.from(shot.data,'base64'))
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
console.log('DONE')
