// Independently verify the two headline subagent claims on the LIVE site:
//   1. grayscale(1) is inert on a touch viewport (hover:hover is false)
//   2. portfolio renders 3 columns at 393px despite --row-cols:2
import { spawn } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9341
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-verify-${Date.now()}`
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

for (const route of ['portfolio','home']) {
  await send('Page.navigate',{url:`https://shutterhausvisuals.co.za/#/${route==='home'?'':route}`},sessionId)
  await sleep(4500)
  const r = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
    const imgs=[...document.querySelectorAll('.cell img, .wall img, img')].filter(i=>i.getBoundingClientRect().width>30);
    const withFilter = imgs.map(i => getComputedStyle(i).filter).filter(f => f && f !== 'none');
    const row = document.querySelector('.pf-row');
    const rowCs = row ? getComputedStyle(row) : null;
    return {
      hoverHover: matchMedia('(hover: hover)').matches,
      hoverNone: matchMedia('(hover: none)').matches,
      anyHover: matchMedia('(any-hover: hover)').matches,
      shellHasIsBw: !!document.querySelector('.shell.is-bw'),
      imgsChecked: imgs.length,
      imgsWithFilter: withFilter.length,
      sampleFilter: getComputedStyle(imgs[0]).filter,
      rowColsInline: row ? row.style.getPropertyValue('--row-cols') : null,
      rowColsComputed: rowCs ? rowCs.gridTemplateColumns : null,
      cellW: imgs[0] ? Math.round(imgs[0].getBoundingClientRect().width) : null,
      headerPos: getComputedStyle(document.querySelector('.site-header')).position,
    };
  })()`},sessionId)
  console.log(`\n===== /${route} (live, 393px touch) =====`)
  console.log(JSON.stringify(r.result.value, null, 2))
}
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
console.log('\nDONE')
