// Production check: fetch the LIVE deployed bundle and confirm the changes are
// really in the bytes customers receive. A green deploy is not evidence.
import { spawn } from 'node:child_process'
import { rmSync, writeFileSync, mkdirSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9390
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-prod-${Date.now()}`
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\prod'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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
await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true},sessionId)
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},sessionId)

let pass=0, fail=0
const check=(n,ok,d)=>{ ok?(pass++,console.log(`  ok    ${n}  ${d??''}`)):(fail++,console.log(`  FAIL  ${n}  ${d??''}`)) }
const ev=async e=>(await send('Runtime.evaluate',{returnByValue:true,expression:e},sessionId)).result.value

console.log('LIVE PRODUCTION CHECK — https://shutterhausvisuals.co.za/')
await send('Page.navigate',{url:'https://shutterhausvisuals.co.za/portfolio.html'},sessionId)
await sleep(6000)

let v = await ev(`(() => {
  const imgs=[...document.querySelectorAll('.pf-cell img')];
  const rows=[...document.querySelectorAll('.pf-row')];
  const cell=rows[0]?rows[0].children[0]:null;
  const src=document.querySelector('.pf-cell source');
  return { nImgs: imgs.length, nRows: rows.length,
    cellsPerRow: cell? cell.parentElement.children.length : 0,
    cellW: cell? Math.round(cell.getBoundingClientRect().width):null,
    gridTracks: rows[0]? getComputedStyle(rows[0]).gridTemplateColumns : null,
    inlineCols: rows[0]? rows[0].style.getPropertyValue('--row-cols'):null,
    sizes: src? src.getAttribute('sizes'):null,
    filters: [...new Set(imgs.map(i=>getComputedStyle(i).filter))],
    headerPos: getComputedStyle(document.querySelector('.site-header')).position,
    docW: document.documentElement.scrollWidth, innerW: innerWidth };
})()`)
console.log(`\n--- portfolio ---`)
console.log(`  frames ${v.nImgs} in ${v.nRows} rows | cells/row ${v.cellsPerRow} | cell ${v.cellW}px`)
console.log(`  grid ${v.gridTracks} | --row-cols ${v.inlineCols} | sizes="${v.sizes}"`)
console.log(`  filters ${JSON.stringify(v.filters)} | header ${v.headerPos}`)
check('2-column wall is LIVE', v.cellsPerRow===2 && v.cellW>150, `${v.cellsPerRow} cells/row at ${v.cellW}px`)
check('28 frames live', v.nImgs===28, `${v.nImgs}`)
check('sizes fixed live', v.sizes && !v.sizes.includes('100vw'), `sizes="${v.sizes}"`)
check('B&W live on touch', v.filters.some(f=>f.includes('grayscale')), JSON.stringify(v.filters))
check('sticky header live', v.headerPos==='sticky', v.headerPos)
check('no overflow', v.docW<=v.innerW+1, `${v.docW}/${v.innerW}`)

const shot=await send('Page.captureScreenshot',{format:'png'},sessionId)
writeFileSync(`${OUT}\\prod-portfolio.png`,Buffer.from(shot.data,'base64'))

// home: scrim + safe area + reduced motion
await send('Page.navigate',{url:'https://shutterhausvisuals.co.za/'},sessionId)
await sleep(5000)
let h = await ev(`(() => {
  const cs=getComputedStyle(document.documentElement);
  return { vb: document.querySelector('meta[name=viewport]')?.content || '',
    headerBg: getComputedStyle(document.querySelector('.shell--over .site-header')).backgroundImage.slice(0,90),
    scrim: (document.querySelector('.hero__scrim')?.getAttribute('style')||'').slice(0,80) };
})()`)
console.log(`\n--- home ---`)
console.log(`  viewport-fit: ${/viewport-fit=cover/.test(h.vb)}`)
console.log(`  header scrim: ${h.headerBg}`)
check('viewport-fit=cover live', /viewport-fit=cover/.test(h.vb), h.vb)

await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId)
await sleep(800)
const rm = await ev(`getComputedStyle(document.querySelector('.shell.is-bw .cell img')).transitionDuration`)
check('reduced-motion live', parseFloat(rm)<0.05, `transition=${rm}`)
await send('Emulation.setEmulatedMedia',{features:[]},sessionId)

// lightbox on production
await send('Page.navigate',{url:'https://shutterhausvisuals.co.za/portfolio.html'},sessionId)
await sleep(5000)
const c = await ev(`(() => { const r=document.querySelectorAll('.pf-cell')[0].getBoundingClientRect();
  return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}; })()`)
await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:c.x,y:c.y}]},sessionId)
await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId)
await sleep(2500)
const lb = await ev(`(() => { const i=document.querySelector('.lb__img'); return { src:i? (i.currentSrc||i.src):null, hidden:document.querySelector('.lb')?.hidden }; })()`)
console.log(`\n--- lightbox ---`)
console.log(`  loaded: ${(lb.src||'').split('/').pop()}`)
check('lightbox loads a derivative on production', lb.src && !/\.jpg$/.test(lb.src), (lb.src||'').split('/').pop())

console.log(`\n${pass} passed, ${fail} failed — against PRODUCTION`)
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
console.log(fail? 'RESULT: NOT ALL LIVE' : 'RESULT: ALL CONFIRMED LIVE')
