// Verify the scrim + outside-tap close + scroll lock, with real touch events.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const ROOT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site'
const OUT = `${ROOT}\\mobile-audit\\menu`
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const srv = spawn('npm', ['run', 'preview'], { cwd: ROOT, shell: true, stdio: 'ignore' })
await sleep(6000)

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9370
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-menu-${Date.now()}`
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
const ev = async (expr) => (await send('Runtime.evaluate',{returnByValue:true,expression:expr},sessionId)).result.value

for (const route of ['contact','portfolio','services']) {
  console.log(`\n=== #/${route} ===`)
  await send('Page.navigate',{url:`http://127.0.0.1:4173/#/${route}`},sessionId)
  await sleep(4000)

  // open the menu
  await ev(`document.querySelector('.burger').click(); true`)
  await sleep(700)
  let s = await ev(`(() => {
    const scrim=document.querySelector('.nav-scrim');
    const nav=document.getElementById('site-nav');
    const b=document.querySelector('.burger');
    return { expanded:b.getAttribute('aria-expanded'), navOpen:nav.classList.contains('is-open'),
             bodyClass:document.body.classList.contains('nav-open'),
             lockClass:document.documentElement.classList.contains('nav-locked'),
             scrimPresent:!!scrim, scrimOpacity: scrim?getComputedStyle(scrim).opacity:null,
             htmlOverflow: getComputedStyle(document.documentElement).overflow };
  })()`)
  check('menu opens', s.expanded==='true' && s.navOpen, `aria-expanded=${s.expanded} nav.is-open=${s.navOpen}`)
  check('scrim exists and is visible', s.scrimPresent && parseFloat(s.scrimOpacity)>0.9, `opacity=${s.scrimOpacity}`)
  check('body.nav-open set', s.bodyClass, `body.nav-open=${s.bodyClass}`)
  check('scroll lock applied', s.lockClass && s.htmlOverflow==='hidden', `nav-locked=${s.lockClass} html overflow=${s.htmlOverflow}`)

  const shot = await send('Page.captureScreenshot',{format:'png'},sessionId)
  writeFileSync(`${OUT}\\menu-open-${route}.png`,Buffer.from(shot.data,'base64'))

  // THE bug: tap outside the drawer, low on the page (196,600)
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:196,y:600}]},sessionId)
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId)
  await sleep(700)
  let after = await ev(`(() => ({
    expanded: document.querySelector('.burger').getAttribute('aria-expanded'),
    scrimPresent: !!document.querySelector('.nav-scrim'),
    lockClass: document.documentElement.classList.contains('nav-locked'),
    htmlOverflow: getComputedStyle(document.documentElement).overflow }))()`)
  check('OUTSIDE TAP closes the menu', after.expanded==='false', `tap (196,600) -> aria-expanded=${after.expanded}  [was the defect: stayed "true"]`)
  check('scrim removed on close', !after.scrimPresent, `scrimPresent=${after.scrimPresent}`)
  check('scroll lock released', !after.lockClass && after.htmlOverflow!=='hidden', `nav-locked=${after.lockClass} overflow=${after.htmlOverflow}`)

  // drag on the open drawer must not scroll the background
  await ev(`window.scrollTo(0,600); document.querySelector('.burger').click(); true`)
  await sleep(600)
  const y0 = await ev(`Math.round(scrollY)`)
  // CDP needs an explicit touchStart before touchMove, or it rejects the move.
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:196,y:400}]},sessionId)
  for (let i=1;i<=6;i++){
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:196,y:400+i*40}]},sessionId)
    await sleep(60)
  }
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId)
  await sleep(500)
  const y1 = await ev(`Math.round(scrollY)`)
  check('background does not scroll behind the drawer', y0===y1, `scrollY ${y0} -> ${y1}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
try{srv.kill()}catch{}
console.log(fail? 'RESULT: FAILURES' : 'RESULT: ALL PASS')
