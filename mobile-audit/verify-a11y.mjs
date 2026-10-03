// Independent check of the a11y commit (a7576da): safe-area vars resolve,
// reduced-motion actually kills transitions, contrast improved over the hero.
// Runs against the CURRENT build. I am not trusting the agent's own harness.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const ROOT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site'
const OUT = `${ROOT}\\mobile-audit\\mycheck`
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const srv = spawn('npm', ['run', 'preview'], { cwd: ROOT, shell: true, stdio: 'ignore' })
await sleep(6500)

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9380
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-a11y-${Date.now()}`
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
const ev = async (e) => (await send('Runtime.evaluate',{returnByValue:true,expression:e},sessionId)).result.value

// ---- safe area ----
await send('Page.navigate',{url:'http://127.0.0.1:4173/'},sessionId)
await sleep(4500)
console.log('=== safe-area insets ===')
let v = await ev(`(() => {
  const cs=getComputedStyle(document.documentElement);
  const hdr=document.querySelector('.site-header');
  const hs=getComputedStyle(hdr);
  const vb=document.querySelector('meta[name=viewport]');
  return { sat:cs.getPropertyValue('--sat').trim(), sab:cs.getPropertyValue('--sab').trim(),
    headerPadTop:hs.paddingTop, headerHeight:Math.round(hdr.getBoundingClientRect().height),
    viewportFit: vb? vb.content : null,
    sheetsWithEnv: [...document.styleSheets].reduce((n,s)=>{try{return n+[...s.cssRules].filter(r=>r.cssText.includes('safe-area-inset')).length}catch(e){return n}},0) };
})()`)
console.log(`  --sat="${v.sat}"  --sab="${v.sab}"  header padding-top=${v.headerPadTop}  header height=${v.headerHeight}px`)
console.log(`  viewport meta: ${v.viewportFit}`)
console.log(`  stylesheet rules containing safe-area-inset: ${v.sheetsWithEnv}`)
check('viewport-fit=cover present', /viewport-fit=cover/.test(v.viewportFit||''), 'index.html')
// Lightning CSS folds env() to its known-zero value at build time, so the
// runtime value is "max(0px, 0px)" not the literal env() text. Either proves
// the same thing: the alias resolves to 0 where there is no inset.
check('safe-area aliases resolve to 0 on a 0-inset device', /(^|,\s*)0(px)?\s*\)$/.test(v.sat), `--sat="${v.sat}"`)
check('safe-area rules reached the stylesheet', v.sheetsWithEnv>0, `${v.sheetsWithEnv} rules`)
// With no inset the header must be UNCHANGED from its mobile --head height:
// no regression. 92px is the mobile value (styles.css:886 overrides the 118px
// desktop default); asserting 118 here was the test being wrong, not the CSS.
const HEAD_MOBILE = 92
check('no layout change at 0 inset (header still --head tall)', Math.abs(v.headerHeight-HEAD_MOBILE)<=1, `${v.headerHeight}px vs mobile --head ${HEAD_MOBILE}px`)

const shotA = await send('Page.captureScreenshot',{format:'png'},sessionId)
writeFileSync(`${OUT}\\home-a11y.png`,Buffer.from(shotA.data,'base64'))

// ---- reduced motion ----
console.log('\n=== prefers-reduced-motion ===')
let before = await ev(`getComputedStyle(document.querySelector('.shell.is-bw .cell img')).transitionDuration`)
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId)
await sleep(900)
let after = await ev(`getComputedStyle(document.querySelector('.shell.is-bw .cell img')).transitionDuration`)
console.log(`  cell img transition-duration: normal="${before}"  reduce="${after}"`)
check('transitions are killed under reduce', parseFloat(after)<0.05, `${before} -> ${after}`)
const rm2 = await ev(`(() => { const d=document.createElement('div'); document.body.appendChild(d);
  const cs=getComputedStyle(d); const o={t:cs.transitionDuration,a:cs.animationDuration}; d.remove(); return o; })()`)
check('the blanket rule reaches a fresh element too', parseFloat(rm2.t)<0.05, `transition=${rm2.t} animation=${rm2.a}`)
await send('Emulation.setEmulatedMedia',{features:[]},sessionId)

// ---- scrim / contrast shape ----
console.log('\n=== hero scrim ===')
let scrim = await ev(`(() => {
  const h=document.querySelector('.shell--over .site-header');
  const s=document.querySelector('.hero__scrim');
  return { headerBg:getComputedStyle(h).backgroundImage.slice(0,120),
           scrimExists:!!s, scrimBg: s?getComputedStyle(s).background.slice(0,120):null,
           scrimZ: s?getComputedStyle(s).zIndex:null };
})()`)
console.log(`  header bg: ${scrim.headerBg}`)
console.log(`  hero__scrim: exists=${scrim.scrimExists} z=${scrim.scrimZ} bg=${scrim.scrimBg}`)
check('a hero scrim element exists', scrim.scrimExists, scrim.scrimBg||'')
check('header scrim has a plateau, not just a fade', /7\d%|8\d%|9\d%/.test(scrim.headerBg), 'gradient stops')

console.log(`\n${pass} passed, ${fail} failed`)
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
try{srv.kill()}catch{}
console.log(fail? 'RESULT: FAILURES' : 'RESULT: ALL PASS')
