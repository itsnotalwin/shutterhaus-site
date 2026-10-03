// Honest A/B on the SAME measurement method, both sides.
// Run against the live site (before) and the local build (after), full scroll,
// cache disabled, waiting for the network to go quiet.
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function measure(label, url, port, profile, srvCmd, cwd) {
  const srv = srvCmd ? spawn('npm', ['run', 'preview'], { cwd, shell: true, stdio: 'ignore' }) : null
  if (srvCmd) await sleep(6000)
  const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
    `--remote-debugging-port=${port}`,'--remote-allow-origins=*',`--user-data-dir=${profile}`,'about:blank'], { stdio: 'ignore' })
  let wsUrl
  for (let i=0;i<60;i++){ try{ const r=await fetch(`http://127.0.0.1:${port}/json/version`); if(r.ok){ wsUrl=(await r.json()).webSocketDebuggerUrl; break } }catch{} await sleep(500) }
  const ws = new WebSocket(wsUrl); await new Promise(r=>ws.onopen=r)
  let id=0; const pending=new Map()
  ws.onmessage=(m)=>{const msg=JSON.parse(m.data); if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}}
  const send=(m,p={},s)=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method:m,params:p,sessionId:s}))})
  const {targetId}=await send('Target.createTarget',{url:'about:blank'})
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
  for(const d of ['Page','Runtime','Network']) await send(`${d}.enable`,{},sessionId)
  await send('Network.setCacheDisabled',{cacheDisabled:true},sessionId)
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true},sessionId)
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},sessionId)
  await send('Page.navigate',{url},sessionId)
  await sleep(5500)
  for (let y=0;y<9000;y+=600){ await send('Runtime.evaluate',{expression:`window.scrollTo(0,${y});true`},sessionId); await sleep(420) }
  for (let i=0;i<15;i++){
    await sleep(1000)
    const b = await send('Runtime.evaluate',{returnByValue:true,expression:`[...document.querySelectorAll('img')].filter(i=>i.getBoundingClientRect().width>10&&(!i.complete||i.naturalWidth===0)).length`},sessionId)
    if (b.result.value===0) break
  }
  await sleep(2000)
  const r = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
    const res=performance.getEntriesByType('resource');
    const imgs=res.filter(r=>r.initiatorType==='img');
    const rungs={};
    imgs.forEach(r=>{const m=r.name.match(/-(\\d+)w\\./); if(m) rungs[m[1]]=(rungs[m[1]]||0)+1});
    const wall=document.querySelectorAll('.pf-cell img');
    return { wallImgs: wall.length,
             loaded: wall.length? [...wall].filter(i=>i.naturalWidth>0).length : 0,
             imgCount: imgs.length, rungs,
             imgBytes: imgs.reduce((s,r)=>s+(r.transferSize||0),0),
             totalBytes: res.reduce((s,r)=>s+(r.transferSize||0),0) };
  })()`},sessionId)
  const v = r.result.value
  const kb = b => (b/1024).toFixed(0)
  console.log(`\n=== ${label} ===`)
  console.log(`  wall images       ${v.wallImgs} (loaded ${v.loaded})`)
  console.log(`  image requests    ${v.imgCount}   rungs ${JSON.stringify(v.rungs)}`)
  console.log(`  IMAGE BYTES       ${kb(v.imgBytes)} KB`)
  console.log(`  TOTAL PAGE BYTES  ${kb(v.totalBytes)} KB`)
  if (v.wallImgs) console.log(`  per wall image    ${(v.imgBytes/Math.max(1,v.wallImgs)/1024).toFixed(1)} KB`)
  try{ws.close()}catch{};chrome.kill();try{rmSync(profile,{recursive:true,force:true})}catch{}
  if (srv) try{srv.kill()}catch{}
  return v
}

const ROOT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site'
const before = await measure('BEFORE — live site (3 col, sizes=100vw)',
  'https://shutterhausvisuals.co.za/#/portfolio', 9360,
  `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-ab-a-${Date.now()}`, false, null)
const after = await measure('AFTER — local build (2 col, sizes=42vw)',
  'http://127.0.0.1:4173/#/portfolio', 9361,
  `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-ab-b-${Date.now()}`, true, ROOT)

console.log('\n=====================================================')
const kb = b => (b/1024).toFixed(0)
console.log(`  images  ${kb(before.imgBytes)} KB  ->  ${kb(after.imgBytes)} KB`)
console.log(`  total   ${kb(before.totalBytes)} KB  ->  ${kb(after.totalBytes)} KB`)
console.log(`  saving  ${kb(before.imgBytes-after.imgBytes)} KB on images  (${(before.imgBytes/after.imgBytes).toFixed(2)}x lighter)`)
console.log('=====================================================')
