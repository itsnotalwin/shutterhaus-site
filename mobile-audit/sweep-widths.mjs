// Sweep EVERY width on the local build: the wall must render at all of them.
// This is the regression guard for the blank-desktop bug.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const ROOT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site'
const OUT = `${ROOT}\\mobile-audit\\sweep`
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const srv = spawn('npm', ['run', 'preview'], { cwd: ROOT, shell: true, stdio: 'ignore' })
await sleep(6500)

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9396
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-sweep-${Date.now()}`
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--remote-allow-origins=*',`--user-data-dir=${PROFILE}`,'about:blank'], { stdio: 'ignore' })
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/version`);if(r.ok)return (await r.json()).webSocketDebuggerUrl}catch{} await sleep(500)} throw new Error('no chrome')}
const ws = new WebSocket(await ready()); await new Promise(r=>ws.onopen=r)
let id=0; const pending=new Map()
ws.onmessage=(m)=>{const msg=JSON.parse(m.data); if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}}
const send=(m,p={},s)=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method:m,params:p,sessionId:s}))})
const {targetId}=await send('Target.createTarget',{url:'about:blank'})
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
for(const d of ['Page','Runtime']) await send(`${d}.enable`,{},sessionId)
const ev=async e=>(await send('Runtime.evaluate',{returnByValue:true,expression:e},sessionId)).result.value

// every width a real device might be, phone through ultrawide
const WIDTHS = [320,360,393,414,430,540,600,700,768,820,900,1024,1180,1280,1366,1440,1600,1920,2560]
let pass=0, fail=0
const bad=[]
console.log('width  cols  rows cells imgs  cellW   rowH   wallH   verdict')
for (const w of WIDTHS) {
  const mobile = w < 820
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:900,deviceScaleFactor:mobile?3:2,mobile},sessionId)
  await send('Page.navigate',{url:'http://127.0.0.1:4173/#/portfolio'},sessionId)
  await sleep(3200)
  const v = await ev(`(() => {
    const rows=[...document.querySelectorAll('.pf-row')];
    const cells=[...document.querySelectorAll('.pf-cell')];
    const imgs=[...document.querySelectorAll('.pf-cell img')];
    const r0=rows[0]; const c0=r0&&r0.children[0];
    return { rows:rows.length, cells:cells.length, imgs:imgs.length,
      cols: r0? r0.style.getPropertyValue('--row-cols'):null,
      cellW: c0? Math.round(c0.getBoundingClientRect().width):null,
      rowH: r0? Math.round(r0.getBoundingClientRect().height):null,
      wallH: document.querySelector('.pf-rows')? Math.round(document.querySelector('.pf-rows').getBoundingClientRect().height):0,
      loaded: imgs.filter(i=>i.naturalWidth>0).length,
      docW: document.documentElement.scrollWidth, innerW: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      bw: [...new Set(imgs.map(i=>getComputedStyle(i).filter))].join('')
    };
  })()`)
  const ok = v.rows===14 && v.cells===28 && v.cellW>100 && v.rowH>100 && v.overflow<=1
  ok?pass++:(fail++,bad.push(w))
  console.log(`${String(w).padStart(5)}  ${String(v.cols).padEnd(4)}  ${String(v.rows).padStart(4)} ${String(v.cells).padStart(5)} ${String(v.imgs).padStart(4)}  ${String(v.cellW).padEnd(6)}  ${String(v.rowH).padEnd(5)}  ${String(v.wallH).padEnd(6)}  ${ok?'ok':'FAIL'}${v.bw.includes('grayscale')?'':'  [NOT B&W]'}`)
  if ([393,768,1440].includes(w)) {
    const shot=await send('Page.captureScreenshot',{format:'png'},sessionId)
    writeFileSync(`${OUT}\\wall-${w}.png`,Buffer.from(shot.data,'base64'))
  }
}
console.log(`\n${pass}/${WIDTHS.length} widths render the wall correctly`)
if (bad.length) console.log(`FAILED widths: ${bad.join(', ')}`)
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
try{srv.kill()}catch{}
console.log(fail? 'RESULT: REGRESSION REMAINS' : 'RESULT: ALL WIDTHS OK')
