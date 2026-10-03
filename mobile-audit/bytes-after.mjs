// True wire bytes for the portfolio wall: wait for every lazy image to settle.
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const ROOT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const srv = spawn('npm', ['run', 'preview'], { cwd: ROOT, shell: true, stdio: 'ignore' })
await sleep(6000)

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9351
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-bytes-${Date.now()}`
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--remote-allow-origins=*',`--user-data-dir=${PROFILE}`,'about:blank'], { stdio: 'ignore' })
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/version`);if(r.ok)return (await r.json()).webSocketDebuggerUrl}catch{} await sleep(500)} throw new Error('no chrome')}
const ws = new WebSocket(await ready()); await new Promise(r=>ws.onopen=r)
let id=0; const pending=new Map(); const net=[]
ws.onmessage=(m)=>{const msg=JSON.parse(m.data)
  if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}
  else if(msg.method==='Network.loadingFinished'){const e=net.find(x=>x.id===msg.params.requestId); if(e) e.done=true}
  else if(msg.method==='Network.responseReceived'){net.push({id:msg.params.requestId,url:msg.params.response.url,type:msg.params.type,bytes:msg.params.response.encodedDataLength,done:false})}}
const send=(m,p={},s)=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method:m,params:p,sessionId:s}))})
const {targetId}=await send('Target.createTarget',{url:'about:blank'})
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
for(const d of ['Page','Runtime','Network']) await send(`${d}.enable`,{},sessionId)
await send('Network.setCacheDisabled',{cacheDisabled:true},sessionId)
await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true},sessionId)
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},sessionId)

net.length=0
await send('Page.navigate',{url:'http://127.0.0.1:4173/#/portfolio'},sessionId)
await sleep(5000)
// walk the page the way a visitor does, then wait for the network to go quiet
for (let y=0;y<8000;y+=600){ await send('Runtime.evaluate',{expression:`window.scrollTo(0,${y});true`},sessionId); await sleep(450) }
for (let i=0;i<12;i++){
  await sleep(1000)
  const busy = await send('Runtime.evaluate',{returnByValue:true,expression:`[...document.querySelectorAll('.pf-cell img')].filter(i=>!i.complete||i.naturalWidth===0).length`},sessionId)
  if (busy.result.value===0) { console.log(`all images settled after ${i+1}s of quiet`); break }
}
await sleep(1500)

const r = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
  const imgs=[...document.querySelectorAll('.pf-cell img')];
  return { total: imgs.length, loaded: imgs.filter(i=>i.complete&&i.naturalWidth>0).length,
           bytesSoFar: performance.getEntriesByType('resource').reduce((s,r)=>s+(r.transferSize||0),0),
           imgBytes: performance.getEntriesByType('resource').filter(r=>r.initiatorType==='img').reduce((s,r)=>s+(r.transferSize||0),0) };
})()`},sessionId)
const dom = r.result.value
const netImgs = net.filter(x=>x.type==='Image' && x.done)
const rung = {}
for (const x of netImgs){ const m=x.url.match(/-(\d+)w\./); if(m) rung[m[1]]=(rung[m[1]]||0)+1 }
const kb = b => (b/1024).toFixed(0)

console.log(`\nPORTFOLIO WALL, 393px DPR3, cache disabled, full scroll`)
console.log(`  images in DOM        ${dom.total}  (loaded ${dom.loaded})`)
console.log(`  image requests done  ${netImgs.length}`)
console.log(`  rungs served         ${JSON.stringify(rung)}`)
console.log(`  bytes, images        ${kb(dom.imgBytes)} KB`)
console.log(`  bytes, total page    ${kb(dom.bytesSoFar)} KB`)
const perImg = dom.imgBytes/dom.loaded
console.log(`  per image            ${(perImg/1024).toFixed(1)} KB`)

console.log(`\n  COMPARISON (same frames, measured earlier)`)
console.log(`  before: 30 imgs @ 1200w, 1281 KB images  ->  42.7 KB/img`)
console.log(`  after : ${dom.loaded} imgs @ ${Object.keys(rung).join('/')}w, ${kb(dom.imgBytes)} KB images  ->  ${(perImg/1024).toFixed(1)} KB/img`)
console.log(`  saving: ${(1281-dom.imgBytes/1024).toFixed(0)} KB  (${(1281/(dom.imgBytes/1024)).toFixed(1)}x)`)

try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
try{srv.kill()}catch{}
console.log('DONE')
