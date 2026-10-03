// The grayscale question, settled properly.
// Headless Chrome reports (hover: hover) = true even with mobile:true, because
// touch emulation was never enabled. A real iPhone reports hover:none. So the
// decisive test is: does the @media (hover:hover) block apply when touch is
// actually emulated? Enable touch + the hover media feature explicitly.
import { spawn } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9342
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-hover-${Date.now()}`
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit'
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
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},sessionId)
await send('Emulation.setEmitTouchEventsForMouse',{enabled:true,configuration:'mobile'},sessionId)
await send('Page.navigate',{url:'https://shutterhausvisuals.co.za/#/portfolio'},sessionId)
await sleep(4500)

console.log('--- A: touch emulation ON, media feature left to the engine ---')
let r = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
  const imgs=[...document.querySelectorAll('img')].filter(i=>i.getBoundingClientRect().width>30);
  return { hoverHover: matchMedia('(hover: hover)').matches, hoverNone: matchMedia('(hover: none)').matches,
    filters: imgs.map(i=>getComputedStyle(i).filter), n: imgs.length };
})()`},sessionId)
let v = r.result.value
console.log('  (hover:hover)=', v.hoverHover, ' (hover:none)=', v.hoverNone, ' n=', v.n)
console.log('  filters with grayscale:', v.filters.filter(f=>f.includes('grayscale')).length, '| none:', v.filters.filter(f=>f==='none').length)
const shotA = await send('Page.captureScreenshot',{format:'png'},sessionId)
writeFileSync(`${OUT}\\imgshots\\verify-touch-on.png`, Buffer.from(shotA.data,'base64'))

console.log('\n--- B: force hover:none via media feature override (what a real iPhone reports) ---')
await send('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'any-hover',value:'none'},{name:'pointer',value:'coarse'}]},sessionId)
await sleep(1500)
r = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
  const imgs=[...document.querySelectorAll('img')].filter(i=>i.getBoundingClientRect().width>30);
  return { hoverHover: matchMedia('(hover: hover)').matches, hoverNone: matchMedia('(hover: none)').matches,
    filters: imgs.map(i=>getComputedStyle(i).filter), n: imgs.length };
})()`},sessionId)
v = r.result.value
console.log('  (hover:hover)=', v.hoverHover, ' (hover:none)=', v.hoverNone, ' n=', v.n)
console.log('  filters with grayscale:', v.filters.filter(f=>f.includes('grayscale')).length, '| none:', v.filters.filter(f=>f==='none').length)
console.log('  sample:', v.filters[0])
const shotB = await send('Page.captureScreenshot',{format:'png'},sessionId)
writeFileSync(`${OUT}\\imgshots\\verify-hover-none.png`, Buffer.from(shotB.data,'base64'))

// and the grid, with hover forced
r = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
  const row=document.querySelector('.pf-row');
  return { rowColsInline: row?row.style.getPropertyValue('--row-cols'):null,
           rowColsComputed: row?getComputedStyle(row).gridTemplateColumns:null,
           headerPos: getComputedStyle(document.querySelector('.site-header')).position };
})()`},sessionId)
console.log('\n  grid:', JSON.stringify(r.result.value))

console.log('\nsaved imgshots/verify-touch-on.png and verify-hover-none.png')
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
console.log('DONE')
