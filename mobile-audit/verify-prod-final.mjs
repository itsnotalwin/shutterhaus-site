// Production verification of BOTH today's work: the desktop hotfix and the page
// split, checked against the deployed site rather than the local build.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9398
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-final-${Date.now()}`
const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\prod'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--remote-allow-origins=*',`--user-data-dir=${PROFILE}`,'about:blank'], { stdio: 'ignore' })
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/version`);if(r.ok)return (await r.json()).webSocketDebuggerUrl}catch{} await sleep(500)} throw new Error('no chrome')}
const ws = new WebSocket(await ready()); await new Promise(r=>ws.onopen=r)
let id=0; const pending=new Map(); const errs=[]
ws.onmessage=(m)=>{const msg=JSON.parse(m.data)
  if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}
  else if(msg.method==='Log.entryAdded'&&msg.params.entry.level==='error') errs.push(msg.params.entry.text)}
const send=(m,p={},s)=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method:m,params:p,sessionId:s}))})
const {targetId}=await send('Target.createTarget',{url:'about:blank'})
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
for(const d of ['Page','Runtime','Log']) await send(`${d}.enable`,{},sessionId)
let pass=0, fail=0
const check=(n,ok,d)=>{ ok?(pass++,console.log(`  ok    ${n}  ${d??''}`)):(fail++,console.log(`  FAIL  ${n}  ${d??''}`)) }
const ev=async e=>(await send('Runtime.evaluate',{returnByValue:true,expression:e},sessionId)).result.value

console.log('LIVE — https://shutterhausvisuals.co.za/  (deploy 37023329887)\n')

console.log('=== the desktop hotfix, in production ===')
for (const w of [1920,1440,1024,768,393]) {
  const mobile = w < 820
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:900,deviceScaleFactor:mobile?3:2,mobile},sessionId)
  await send('Page.navigate',{url:'https://shutterhausvisuals.co.za/portfolio.html'},sessionId)
  await sleep(4200)
  const v = await ev(`({rows:document.querySelectorAll('.pf-row').length, cells:document.querySelectorAll('.pf-cell').length, cellW:Math.round(document.querySelector('.pf-row')?.children[0]?.getBoundingClientRect().width||0)})`)
  check(`${w}px portfolio renders`, v.rows===14 && v.cells===28, `${v.rows} rows, ${v.cells} cells, ${v.cellW}px cells`)
}

console.log('\n=== the split, in production ===')
const PAGES=[['/','home','.hero'],['/portfolio.html','portfolio','.pf-rows'],['/about.html','about','.about'],
             ['/services.html','services','.page.services'],['/contact.html','contact','.page.contact']]
for (const [path,route,sel] of PAGES) {
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true},sessionId)
  errs.length=0
  await send('Page.navigate',{url:`https://shutterhausvisuals.co.za${path}`},sessionId)
  await sleep(4000)
  const v = await ev(`(() => ({
    found: !!document.querySelector('${sel}'),
    title: document.title,
    canonical: document.querySelector('link[rel=canonical]')?.href,
    ogurl: document.querySelector('meta[property="og:url"]')?.content,
    navs: [...document.querySelectorAll('.nav-link')].map(a=>a.getAttribute('href')),
    active: document.querySelector('.nav-link.is-active')?.textContent.trim(),
    overflow: document.documentElement.scrollWidth - innerWidth }))()`)
  check(`${path} renders ${route}`, v.found, `title="${v.title}" active="${v.active}"`)
  const want = path==='/' ? 'https://shutterhausvisuals.co.za/' : `https://shutterhausvisuals.co.za${path}`
  check(`${path} canonical correct`, v.canonical===want, v.canonical)
  check(`${path} nav links are real files`, v.navs.every(h=>h&&!h.startsWith('#')), v.navs.join(' '))
  check(`${path} og:url matches`, v.ogurl===want, v.ogurl)
  check(`${path} clean + no overflow`, errs.length===0 && v.overflow<=1, `${errs.length} errors, ${v.overflow}px`)
}

console.log('\n=== legacy hash URLs still live ===')
for (const [h,sel,l] of [['#/portfolio','.pf-rows','portfolio'],['#/photo','.pf-rows','photo alias'],
                         ['#/pricing','.page.services','pricing alias'],['#/contact','.page.contact','contact']]) {
  await send('Page.navigate',{url:`https://shutterhausvisuals.co.za/${h}`},sessionId)
  await sleep(3600)
  const ok = await ev(`!!document.querySelector('${sel}')`)
  check(`/${h} -> ${l}`, ok===true, ok?'':'not found')
}

console.log('\n=== sitemap reachable ===')
for (const [p,needle] of [['/sitemap.xml','portfolio.html'],['/robots.txt','Disallow: /admin.html']]) {
  const r = await fetch(`https://shutterhausvisuals.co.za${p}`)
  const t = await r.text()
  check(p, r.ok && t.includes(needle), `${r.status}, ${t.length}B`)
}

const shot=await send('Page.captureScreenshot',{format:'png'},sessionId)
writeFileSync(`${OUT}\\final-portfolio.png`,Buffer.from(shot.data,'base64'))
console.log(`\n${pass} passed, ${fail} failed — against PRODUCTION`)
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
console.log(fail? 'RESULT: NOT READY' : 'RESULT: LIVE AND CORRECT')
