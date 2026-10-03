// Independent re-check of the lightbox changes (not the agent's own harness).
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const ROOT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site'
const OUT = `${ROOT}\\mobile-audit\\mycheck`
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const srv = spawn('npm', ['run', 'preview'], { cwd: ROOT, shell: true, stdio: 'ignore' })
await sleep(6500)

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9381
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-lbv-${Date.now()}`
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--remote-allow-origins=*',`--user-data-dir=${PROFILE}`,'about:blank'], { stdio: 'ignore' })
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/version`);if(r.ok)return (await r.json()).webSocketDebuggerUrl}catch{} await sleep(500)} throw new Error('no chrome')}
const ws = new WebSocket(await ready()); await new Promise(r=>ws.onopen=r)
let id=0; const pending=new Map(); const net=[]
let byId=new Map();
ws.onmessage=(m)=>{const msg=JSON.parse(m.data)
  if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}
  else if(msg.method==='Network.responseReceived'){const r=msg.params.response; byId.set(msg.params.requestId,{url:r.url,bytes:0}); net.push({id:msg.params.requestId,url:r.url,bytes:0})}
  // encodedDataLength is only final at loadingFinished; at responseReceived it
  // is 0 for most responses, which is why the first run measured "0 KB".
  else if(msg.method==='Network.loadingFinished'){const e=net.find(x=>x.id===msg.params.requestId); if(e) e.bytes=msg.params.encodedDataLength}}
const send=(m,p={},s)=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method:m,params:p,sessionId:s}))})
const {targetId}=await send('Target.createTarget',{url:'about:blank'})
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
for(const d of ['Page','Runtime','Network']) await send(`${d}.enable`,{},sessionId)
await send('Network.setCacheDisabled',{cacheDisabled:true},sessionId)
await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true},sessionId)
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},sessionId)

let pass=0, fail=0
const check=(n,ok,d)=>{ ok?(pass++,console.log(`  ok    ${n}  ${d??''}`)):(fail++,console.log(`  FAIL  ${n}  ${d??''}`)) }
const ev = async (e) => (await send('Runtime.evaluate',{returnByValue:true,expression:e},sessionId)).result.value
const tap = async (x,y) => { await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]},sessionId); await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId); await sleep(700) }
const drag = async (x0,y0,x1,y1,steps=8) => {
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y:y0}]},sessionId)
  for(let i=1;i<=steps;i++){ await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/steps, y:y0+(y1-y0)*i/steps}]},sessionId); await sleep(45) }
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId); await sleep(800)
}

await send('Page.navigate',{url:'http://127.0.0.1:4173/#/portfolio'},sessionId)
await sleep(5000)

console.log('=== open the lightbox by tapping a frame ===')
const cell = await ev(`(() => { const c=document.querySelectorAll('.pf-cell')[0]; const r=c.getBoundingClientRect();
  return { x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2) }; })()`)
net.length=0; byId.clear()
await tap(cell.x, cell.y)
await sleep(1800) // let the lightbox image finish before reading the ledger
let lb = await ev(`(() => {
  const img=document.querySelector('.lb__img, .lightbox img, [class*=lb] img');
  return { open: !document.querySelector('.lb').hidden, src: img? img.currentSrc||img.src : null,
    counter: (document.body.textContent.match(/\\d+\\s*\\/\\s*\\d+/)||[])[0] || null,
    alt: img? (img.alt||'').slice(0,40) : null };
})()`)
const lbBytes = net.filter(x=>/gallery/.test(x.url)).map(x=>x.bytes)
const biggest = Math.max(0,...lbBytes)
console.log(`  open=${lb.open}  counter=${lb.counter}  src=${(lb.src||'').split('/').pop()}`)
console.log(`  gallery bytes on open: ${lbBytes.map(b=>(b/1024).toFixed(0)+'KB').join(', ')}`)
check('lightbox opens on tap', lb.open, `counter ${lb.counter}`)
check('loads a derivative, NOT the original .jpg', !/\.jpg$/.test(lb.src||''), (lb.src||'').split('/').pop())
check('per-open bytes under 150 KB', biggest>0 && biggest<150000, `${(biggest/1024).toFixed(0)} KB (was 415513)`)
check('alt text kept', !!lb.alt && lb.alt.length>10, lb.alt)
const shotL = await send('Page.captureScreenshot',{format:'png'},sessionId)
writeFileSync(`${OUT}\\lightbox-mine.png`,Buffer.from(shotL.data,'base64'))

console.log('\n=== swipe ===')
await drag(300,240,80,240)
let s1 = await ev(`(document.body.textContent.match(/\\d+\\s*\\/\\s*\\d+/)||[])[0]`)
check('swipe left advances', s1==='02 / 28', `${lb.counter} -> ${s1}`)
await drag(80,240,300,240)
let s2 = await ev(`(document.body.textContent.match(/\\d+\\s*\\/\\s*\\d+/)||[])[0]`)
check('swipe right goes back', s2==='01 / 28', `${s1} -> ${s2}`)
// Start high and on the LEFT gutter so the gesture begins off the photograph:
// a drag that starts ON the image is the horizontal-swipe path by design.
await drag(28,240,28,780)
// `.lb` is built once and toggled via the `hidden` attribute, so its PRESENCE
// is not the open state. Checking presence was the harness being wrong.
let s3 = await ev(`document.querySelector('.lb').hidden`)
check('drag DOWN dismisses', s3===true, `lb.hidden after downward drag = ${s3}`)

console.log('\n=== keyboard still works ===')
await tap(cell.x, cell.y)
const c1 = await ev(`(document.body.textContent.match(/\\d+\\s*\\/\\s*\\d+/)||[])[0]`)
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},sessionId)
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},sessionId)
await sleep(600)
const c2 = await ev(`(document.body.textContent.match(/\\d+\\s*\\/\\s*\\d+/)||[])[0]`)
check('ArrowRight advances', c2!==c1, `${c1} -> ${c2}`)
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId)
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId)
await sleep(600)
const closed = await ev(`document.querySelector('.lb').hidden`)
check('Escape closes', closed===true, `lb.hidden = ${closed}`)

console.log(`\n${pass} passed, ${fail} failed`)
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
try{srv.kill()}catch{}
console.log(fail? 'RESULT: FAILURES' : 'RESULT: ALL PASS')
