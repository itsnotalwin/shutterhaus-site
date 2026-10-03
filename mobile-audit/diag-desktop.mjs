// Desktop portfolio is reportedly broken on production. Find out what is
// actually rendering at desktop widths, across widths, on the LIVE site.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9395
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-dsk-${Date.now()}`
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\desktop'
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

const WIDTHS = [1920, 1440, 1280, 1100, 1024, 900, 820, 768, 700, 600]
const ev = async (e) => (await send('Runtime.evaluate',{returnByValue:true,expression:e},sessionId)).result.value

for (const w of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:900,deviceScaleFactor:1,mobile:false},sessionId)
  await send('Page.navigate',{url:'https://shutterhausvisuals.co.za/#/portfolio'},sessionId)
  await sleep(4200)
  const v = await ev(`(() => {
    const rows=[...document.querySelectorAll('.pf-row')];
    const cells=[...document.querySelectorAll('.pf-cell')];
    const imgs=[...document.querySelectorAll('.pf-cell img')];
    const firstRow=rows[0];
    const r0=firstRow?firstRow.getBoundingClientRect():null;
    const c0=firstRow&&firstRow.children[0]?firstRow.children[0].getBoundingClientRect():null;
    return {
      innerW: innerWidth,
      rows: rows.length, cells: cells.length, imgs: imgs.length,
      inlineCols: firstRow? firstRow.style.getPropertyValue('--row-cols') : 'NO .pf-row',
      tracks: firstRow? getComputedStyle(firstRow).gridTemplateColumns : null,
      rowW: r0? Math.round(r0.width):null, rowH: r0? Math.round(r0.height):null,
      cellW: c0? Math.round(c0.width):null,
      firstImgH: imgs[0]? Math.round(imgs[0].getBoundingClientRect().height):null,
      // is anything actually visible?
      wallVisible: !!document.querySelector('.pf-rows'),
      wallDisplay: document.querySelector('.pf-rows')? getComputedStyle(document.querySelector('.pf-rows')).display : null,
      wallH: document.querySelector('.pf-rows')? Math.round(document.querySelector('.pf-rows').getBoundingClientRect().height):null,
      bodyText: (document.querySelector('.page.portfolio')?.textContent||'').trim().replace(/\\s+/g,' ').slice(0,70),
      errors: 0,
    };
  })()`)
  const flag = v.cells === 0 ? '  <<< NO PHOTOS RENDERED' : (v.rowH && v.rowH < 40 ? '  <<< ROW COLLAPSED' : '')
  console.log(`${String(w).padStart(5)}px  cols=${v.inlineCols}  rows=${String(v.rows).padStart(2)}  cells=${String(v.cells).padStart(2)}  imgs=${String(v.imgs).padStart(2)}  track=${(v.tracks||'-').slice(0,26).padEnd(26)}  row=${v.rowW}x${v.rowH}  cell=${v.cellW}px  wallH=${v.wallH}${flag}`)
  if (v.cells===0) console.log(`        text: "${v.bodyText}"`)
  if (w===1440 || w===w) {
    const shot=await send('Page.captureScreenshot',{format:'png'},sessionId)
    writeFileSync(`${OUT}\\desktop-${w}.png`,Buffer.from(shot.data,'base64'))
  }
}
console.log(`\nsaved desktop-*.png to ${OUT}`)
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
console.log('DONE')
