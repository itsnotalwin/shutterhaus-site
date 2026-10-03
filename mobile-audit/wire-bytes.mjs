// What does a mobile visitor ACTUALLY download for the portfolio first screenful?
// Measures real transfer bytes at iPhone 16 / DPR 3, not a file-size estimate.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9340
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-wire-${Date.now()}`
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit'
mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--remote-allow-origins=*',`--user-data-dir=${PROFILE}`,'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/version`);if(r.ok)return (await r.json()).webSocketDebuggerUrl}catch{} await sleep(500)} throw new Error('no chrome')}
const ws = new WebSocket(await ready()); await new Promise(r=>ws.onopen=r)
let id=0; const pending=new Map(); const net=[]
ws.onmessage=(m)=>{const msg=JSON.parse(m.data)
  if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}
  else if(msg.method==='Network.responseReceived'){net.push({url:msg.params.response.url,status:msg.params.response.status,
    bytes:msg.params.response.encodedDataLength,type:msg.params.type,mime:msg.params.response.mimeType})}}
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const mid=++id;pending.set(mid,{resolve,reject});ws.send(JSON.stringify({id:mid,method,params,sessionId}))})
const {targetId}=await send('Target.createTarget',{url:'about:blank'})
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
for(const d of ['Page','Runtime','Network']) await send(`${d}.enable`,{},sessionId)
await send('Network.setCacheDisabled',{cacheDisabled:true},sessionId)
await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true},sessionId)

for (const route of ['portfolio','home']) {
  net.length = 0
  await send('Page.navigate',{url:`https://shutterhausvisuals.co.za/#/${route==='home'?'':route}`},sessionId)
  await sleep(5000)
  // scroll to trigger any lazy loads the way a real visit would
  for (let y=0;y<3000;y+=800){ await send('Runtime.evaluate',{expression:`window.scrollTo(0,${y});true`},sessionId); await sleep(600) }
  await sleep(1500)

  const imgs = net.filter(r=>r.type==='Image')
  const other = net.filter(r=>r.type!=='Image')
  const sum = a => a.reduce((s,r)=>s+(r.bytes||0),0)
  const kb = b => (b/1024).toFixed(1)

  console.log(`\n===== /${route} =====`)
  console.log(`images: ${imgs.length}  ${kb(sum(imgs))} KB`)
  console.log(`everything else: ${other.length} reqs  ${kb(sum(other))} KB`)
  console.log(`TOTAL: ${kb(sum(net))} KB`)
  const widths = imgs.map(r=>(r.url.match(/-(\d+)w\./)||[])[1]).filter(Boolean)
  const counts = {}; widths.forEach(w=>counts[w]=(counts[w]||0)+1)
  console.log('image derivatives served:', JSON.stringify(counts))
  console.log('largest images:')
  imgs.sort((a,b)=>(b.bytes||0)-(a.bytes||0)).slice(0,5)
    .forEach(r=>console.log(`   ${kb(r.bytes||0)} KB  ${r.url.split('/').pop()}`))
  writeFileSync(`${OUT}\\wire-${route}.json`, JSON.stringify({total:sum(net), images:imgs.length, imgBytes:sum(imgs), counts, all:net},null,2))
}
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
console.log('\nDONE')
