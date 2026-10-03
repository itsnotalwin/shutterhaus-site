// Verify the 4 core fixes against the LOCAL BUILD (dist), served by vite preview.
// This is a touch-emulated iPhone 16. Asserts real rendered values, not intent.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const ROOT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site'
const OUT = `${ROOT}\\mobile-audit\\after`
mkdirSync(OUT, { recursive: true })

// serve the build
const srv = spawn('npm', ['run', 'preview'], { cwd: ROOT, shell: true, stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(6000)

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9350
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-after-${Date.now()}`
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--remote-allow-origins=*',`--user-data-dir=${PROFILE}`,'about:blank'], { stdio: 'ignore' })
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/version`);if(r.ok)return (await r.json()).webSocketDebuggerUrl}catch{} await sleep(500)} throw new Error('no chrome')}
const ws = new WebSocket(await ready()); await new Promise(r=>ws.onopen=r)
let id=0; const pending=new Map(); const net=[]
ws.onmessage=(m)=>{const msg=JSON.parse(m.data)
  if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}
  else if(msg.method==='Network.responseReceived'){const r=msg.params.response;net.push({url:r.url,type:msg.params.type,bytes:r.encodedDataLength})}}
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const mid=++id;pending.set(mid,{resolve,reject});ws.send(JSON.stringify({id:mid,method,params,sessionId}))})
const {targetId}=await send('Target.createTarget',{url:'about:blank'})
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
for(const d of ['Page','Runtime','Network']) await send(`${d}.enable`,{},sessionId)
await send('Network.setCacheDisabled',{cacheDisabled:true},sessionId)
await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true},sessionId)
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},sessionId)

let pass=0, fail=0
const check=(name,ok,detail)=>{ if(ok){pass++;console.log(`  ok    ${name}  ${detail??''}`)} else {fail++;console.log(`  FAIL  ${name}  ${detail??''}`)} }

// ---- FIX 1 + 2 + 4: portfolio at 393px ----
net.length=0
await send('Page.navigate',{url:'http://127.0.0.1:4173/#/portfolio'},sessionId)
await sleep(5000)
for (let y=0;y<4000;y+=800){ await send('Runtime.evaluate',{expression:`window.scrollTo(0,${y});true`},sessionId); await sleep(500) }
await sleep(1500)

let r = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
  const imgs=[...document.querySelectorAll('.pf-cell img')].filter(i=>i.getBoundingClientRect().width>20);
  const rows=[...document.querySelectorAll('.pf-row')];
  const row0=rows[0];
  const cells=[...document.querySelectorAll('.pf-row')[0].children];
  return {
    nImgs: imgs.length, nRows: rows.length, cellsInRow0: cells.length,
    cellW: Math.round(cells[0].getBoundingClientRect().width),
    rowCols: row0? getComputedStyle(row0).gridTemplateColumns : null,
    inlineCols: row0? row0.style.getPropertyValue('--row-cols') : null,
    sizes: document.querySelector('.pf-cell source')?.getAttribute('sizes'),
    chosen: imgs[0]?.currentSrc.split('/').pop(),
    filters: [...new Set(imgs.map(i=>getComputedStyle(i).filter))],
    rowHeights: rows.map(x=>Math.round(x.getBoundingClientRect().height)),
    docW: document.documentElement.scrollWidth, innerW: innerWidth,
  };
})()`},sessionId)
let v = r.result.value
console.log('\n=== FIX 1/2/4 — portfolio at 393px, touch ===')
check('wall is 2 columns', v.cellsInRow0===2, `cells in row 0 = ${v.cellsInRow0}, inline --row-cols = ${v.inlineCols}`)
// two equal tracks, e.g. "172.5px 172.5px"
const tracks = (v.rowCols || "").split(" ").filter(Boolean);
check("computed grid is exactly 2 tracks", tracks.length === 2, `${v.rowCols} -> ${tracks.length} tracks`);
check('cell width >= 150px', v.cellW>=150, `${v.cellW}px per cell`)
check('28 frames render', v.nImgs===28, `${v.nImgs} images in ${v.nRows} rows`)
check('grayscale applied on touch', v.filters.some(f=>f.includes('grayscale')), JSON.stringify(v.filters))
check('sizes no longer 100vw', v.sizes && !v.sizes.includes('100vw'), `sizes="${v.sizes}"`)
// At 172.5 CSS px and DPR 3 the cell needs 518 device px, so the browser
// correctly picks the 800w rung. 400w would only be right for the old 111px
// three-column cell. Asserting 400w here was the test being wrong, not the code.
const cellDevice = Math.round(v.cellW * 3);
const want = cellDevice <= 400 ? "400w" : cellDevice <= 800 ? "800w" : cellDevice <= 1200 ? "1200w" : "1600w";
check(`served the correct rung (${want}) for a ${cellDevice}px device cell`, (v.chosen || "").includes(want), v.chosen);
check('no overflow', v.docW<=v.innerW+1, `${v.docW} vs ${v.innerW}`)
const rowH=[...new Set(v.rowHeights)]
console.log(`  note  row heights: ${rowH.join(', ')} px across ${v.rowHeights.length} rows (per-ratio, not ragged within a ratio)`)

// bytes
const imgs=net.filter(x=>x.type==='Image')
const total=net.reduce((s,x)=>s+(x.bytes||0),0)
const imgB=imgs.reduce((s,x)=>s+(x.bytes||0),0)
const w400=imgs.filter(x=>/400w/.test(x.url)).length
console.log(`  BYTES images ${(imgB/1024).toFixed(0)} KB | total ${(total/1024).toFixed(0)} KB | 400w served: ${w400}/${imgs.length}`)
const rungCount = (r) => imgs.filter((x) => x.url.includes(`-${r}w.`)).length;
const r400 = rungCount("400"), r800 = rungCount("800"), r1200 = rungCount("1200");
check("no 1200w over-fetch left in the wall", r1200 === 0, `400w:${r400} 800w:${r800} 1200w:${r1200} of ${imgs.length}`);
const shot=await send('Page.captureScreenshot',{format:'png'},sessionId)
writeFileSync(`${OUT}\\after-portfolio-2col.png`,Buffer.from(shot.data,'base64'))

// ---- FIX 3: sticky header ----
console.log('\n=== FIX 3 — sticky header ===')
for (const route of ['services','about','contact']) {
  await send('Page.navigate',{url:`http://127.0.0.1:4173/#/${route}`},sessionId)
  await sleep(3500)
  // scroll to the very bottom
  await send('Runtime.evaluate',{expression:'window.scrollTo(0, document.body.scrollHeight); true'},sessionId)
  await sleep(1200)
  const rr = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
    const h=document.querySelector('.site-header'); const b=document.querySelector('.burger');
    const hb=h.getBoundingClientRect(), bb=b?b.getBoundingClientRect():null;
    return { pos:getComputedStyle(h).position, headerTop:Math.round(hb.top), burgerTop: bb?Math.round(bb.top):null,
             scrollY: Math.round(scrollY), burgerVisible: bb? (bb.top>=0 && bb.bottom<=innerHeight) : null };
  })()`},sessionId)
  const d=rr.result.value
  check(`${route}: burger reachable at page bottom`, d.burgerTop!==null && d.burgerTop>=0, `position=${d.pos} headerTop=${d.headerTop}px burgerTop=${d.burgerTop}px at scrollY=${d.scrollY}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
try{srv.kill()}catch{}
console.log(fail? 'RESULT: FAILURES PRESENT' : 'RESULT: ALL PASS')
