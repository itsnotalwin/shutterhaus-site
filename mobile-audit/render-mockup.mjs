// Render the mockup page to PNG so it can be delivered as an image.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9339
const PROFILE = `C:\\Users\\Operations 3\\AppData\\Local\\Temp\\cdp-mock-${Date.now()}`
const DIR = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit'
const OUT = `${DIR}\\mockup-shots`
mkdirSync(OUT, { recursive: true })

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
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:2,mobile:false},sessionId)
await send('Page.navigate',{url:`file:///${DIR.replace(/\\/g,'/')}/mockup.html`},sessionId)
await sleep(3000)

const h = await send('Runtime.evaluate',{returnByValue:true,expression:'document.documentElement.scrollHeight'},sessionId)
console.log('page height:', h.result.value)

const full = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId)
writeFileSync(`${OUT}\\mockup-full.png`,Buffer.from(full.data,'base64'))
console.log('saved mockup-full.png')

// phones panel on its own, for inline delivery
const el = await send('Runtime.evaluate',{returnByValue:true,expression:`(() => {
  const p=document.querySelector('.phones'); const r=p.getBoundingClientRect();
  return {x:Math.max(0,r.x+scrollX-14),y:r.y+scrollY-14,w:r.width+28,h:r.height+28};})()`},sessionId)
const b = el.result.value
const clip = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,
  clip:{x:b.x,y:b.y,width:b.w,height:Math.min(b.h,1700),scale:2}},sessionId)
writeFileSync(`${OUT}\\mockup-phones.png`,Buffer.from(clip.data,'base64'))
console.log('saved mockup-phones.png', JSON.stringify(b))

try{ws.close()}catch{};chrome.kill();try{rmSync(PROFILE,{recursive:true,force:true})}catch{}
console.log('DONE')
