// The split must not change what any page DOES. Verify, against the built
// dist/: every real document renders its own route's content, every legacy
// hash URL still resolves, nav links are real files, and the mobile fixes from
// today are still intact on every page.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const ROOT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site'
const OUT = `${ROOT}\\mobile-audit\\split`
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const srv = spawn('npm', ['run', 'preview'], { cwd: ROOT, shell: true, stdio: 'ignore' })
await sleep(6500)

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9397
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-split-${Date.now()}`
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,'--remote-allow-origins=*',`--user-data-dir=${PROFILE}`,'about:blank'], { stdio: 'ignore' })
async function ready(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/version`);if(r.ok)return (await r.json()).webSocketDebuggerUrl}catch{} await sleep(500)} throw new Error('no chrome')}
const ws = new WebSocket(await ready()); await new Promise(r=>ws.onopen=r)
let id=0; const pending=new Map(); const errs=[]
ws.onmessage=(m)=>{const msg=JSON.parse(m.data)
  if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}
  else if(msg.method==='Log.entryAdded'&&msg.params.entry.level==='error') errs.push(msg.params.entry.text)
  else if(msg.method==='Runtime.exceptionThrown') errs.push(msg.params.exceptionDetails.text)}
const send=(m,p={},s)=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method:m,params:p,sessionId:s}))})
const {targetId}=await send('Target.createTarget',{url:'about:blank'})
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
for(const d of ['Page','Runtime','Log']) await send(`${d}.enable`,{},sessionId)

let pass=0, fail=0
const check=(n,ok,d)=>{ ok?(pass++,console.log(`  ok    ${n}  ${d??''}`)):(fail++,console.log(`  FAIL  ${n}  ${d??''}`)) }
const ev=async e=>(await send('Runtime.evaluate',{returnByValue:true,expression:e},sessionId)).result.value

// A: every REAL document renders its OWN route. This is the regression that
// matters — the hash router used to decide, and on portfolio.html the hash is
// empty, so a hash-first route() would render the homepage under every URL.
console.log('=== A: real documents render their own route (393px) ===')
const PAGES = [
  ['/',            'home',     '.hero',              0],
  ['/portfolio.html','portfolio','.pf-rows',         14],
  ['/about.html',  'about',    '.about',              0],
  ['/services.html','services','.page.services',      0],
  ['/contact.html','contact',  '.page.contact',        0],
]
for (const [path, route, sel, wantRows] of PAGES) {
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:3,mobile:true},sessionId)
  errs.length=0
  await send('Page.navigate',{url:`http://127.0.0.1:4173${path}`},sessionId)
  await sleep(4200)
  const v = await ev(`(() => {
    const sel = document.querySelector('${sel}');
    const rows = document.querySelectorAll('.pf-row').length;
    const cells = document.querySelectorAll('.pf-cell').length;
    const h1 = document.querySelector('h1, .hero__h, .phead__h');
    const navs = [...document.querySelectorAll('.nav-link')].map(a=>a.getAttribute('href'));
    const active = document.querySelector('.nav-link.is-active')?.textContent.trim();
    return { found: !!sel, rows, cells,
      title: document.title,
      heading: h1? h1.textContent.trim().replace(/\\s+/g,' ').slice(0,32):null,
      navs, active,
      canonical: document.querySelector('link[rel=canonical]')?.href,
      ogurl: document.querySelector('meta[property="og:url"]')?.content,
      overflow: document.documentElement.scrollWidth - innerWidth,
      cellImgs: document.querySelectorAll('.cell img').length,
      cellImgBW: [...document.querySelectorAll('.cell img')].filter(i=>getComputedStyle(i).filter.includes('grayscale')).length,
      imgs: document.querySelectorAll('img').length };
  })()`)
  const rowsOk = wantRows===0 || v.rows===wantRows
  check(`${path} renders ${route}`, v.found && rowsOk, `${v.heading} | rows=${v.rows} cells=${v.cells} | active="${v.active}"`)
  // index.html and / are the same document, so the homepage's canonical is the
  // bare apex — asserting it ends with "/index.html" was the test being wrong.
  const wantCanonical = path === '/' ? 'https://shutterhausvisuals.co.za/' : `https://shutterhausvisuals.co.za${path}`
  check(`${path} has its own canonical`, v.canonical === wantCanonical, v.canonical)
  check(`${path} nav links are real files`, v.navs.every(h=>h && !h.startsWith('#')), v.navs.join(' '))
  check(`${path} no overflow`, v.overflow<=1, `${v.overflow}px`)
  check(`${path} 0 console errors`, errs.length===0, errs.slice(0,2).join(' | ')||'clean')
  // B&W is applied to `.cell img` ONLY, and always has been. About/Services/
  // Contact use `.about__fig` / `.pkg__fig` / `.contact__fig`, which are NOT
  // `.cell`, so their images are legitimately full colour — that is pre-existing
  // and unrelated to the split. Assert on cell images only, and separately
  // record how many non-cell images sit on each page rather than failing on it.
  if (v.imgs) {
    check(`${path} every .cell image is greyscale`, v.cellImgBW === v.cellImgs, `${v.cellImgBW}/${v.cellImgs} cell images; ${v.imgs - v.cellImgs} non-cell image(s) unfiltered by design`)
  }
  const shot=await send('Page.captureScreenshot',{format:'png'},sessionId)
  writeFileSync(`${OUT}\\page${path.replace(/[/.]/g,'_')}.png`,Buffer.from(shot.data,'base64'))
}

// B: legacy hash URLs must still work — old bookmarks and indexed links.
console.log('\n=== B: legacy hash URLs still resolve ===')
for (const [hash, sel, label] of [['#/portfolio','.pf-rows','portfolio'],['#/about','.about','about'],
                                  ['#/services','.page.services','services'],['#/contact','.page.contact','contact'],
                                  ['#/photo','.pf-rows','photo (legacy alias)'],['#/pricing','.page.services','pricing (legacy alias)']]) {
  await send('Page.navigate',{url:`http://127.0.0.1:4173/${hash}`},sessionId)
  await sleep(3800)
  const ok = await ev(`!!document.querySelector('${sel}')`)
  check(`/${hash} -> ${label}`, ok===true, ok?'':'selector not found')
}

// C: desktop still fine (the hotfix must survive the split)
console.log('\n=== C: desktop widths still render the wall ===')
for (const w of [1920,1440,1024,768]) {
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:900,deviceScaleFactor:2,mobile:false},sessionId)
  await send('Page.navigate',{url:'http://127.0.0.1:4173/portfolio.html'},sessionId)
  await sleep(3400)
  const v = await ev(`({rows:document.querySelectorAll('.pf-row').length, cells:document.querySelectorAll('.pf-cell').length})`)
  check(`${w}px portfolio.html`, v.rows===14 && v.cells===28, `${v.rows} rows ${v.cells} cells`)
}

// D: sitemap + robots actually served
console.log('\n=== D: sitemap + robots ===')
for (const [p, needle] of [['/sitemap.xml','<urlset'],['/robots.txt','Sitemap:']]) {
  const r = await fetch(`http://127.0.0.1:4173${p}`)
  const t = await r.text()
  check(`${p} served`, r.ok && t.includes(needle), `${r.status}, ${t.length} bytes`)
}

console.log(`\n${pass} passed, ${fail} failed`)
try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
try{srv.kill()}catch{}
console.log(fail? 'RESULT: FAILURES' : 'RESULT: SPLIT IS SAFE')
