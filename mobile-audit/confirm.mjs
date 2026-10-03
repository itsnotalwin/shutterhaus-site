// Confirm naturalWidth, mobile column count, and capture screenshots of the mobile grid.
const BASE = "https://shutterhausvisuals.co.za/";
const CDP = "http://127.0.0.1:9334";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = await import("node:fs/promises");
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\imgshots";

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && pending.has(x.id)) { pending.get(x.id)(x); pending.delete(x.id); } };
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
  return r.result?.exceptionDetails ? { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 300) } : r.result?.result?.value; };

for (const d of ["Page", "Runtime", "Log", "Network"]) await send(d + ".enable");
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
await send("Page.navigate", { url: BASE + "#/portfolio" });
await sleep(6000);
await ev("window.scrollTo(0, document.body.scrollHeight)"); await sleep(1500);
await ev("window.scrollTo(0,0)"); await sleep(2500);

console.log("=== naturalWidth re-check (decoded vs attribute) ===");
console.log(await ev(`JSON.stringify([...document.querySelectorAll('img')].slice(0,4).map(i=>({
  file:(i.currentSrc||'').split('/').pop(),
  naturalW:i.naturalWidth, naturalH:i.naturalHeight,
  attrW:i.getAttribute('width'), attrH:i.getAttribute('height'),
  complete:i.complete, currentSrcW:null
})),null,1)`));

console.log("\n=== which candidate is the served file? test decode size in-page ===");
console.log(await ev(`(async()=>{
  const i=document.querySelector('img');
  const r=await fetch(i.currentSrc);
  const b=await r.blob();
  const bmp=await createImageBitmap(b);
  return JSON.stringify({naturalW:i.naturalWidth, decodedFromFetch:bmp.width+'x'+bmp.height, url:i.currentSrc});
})()`));

console.log("\n=== columns / layout at 393 ===");
console.log(await ev(`JSON.stringify({
  wall:[...document.querySelectorAll('main *')].filter(e=>/col|wall|grid/.test(e.className)).slice(0,10)
    .map(e=>e.className+' | display='+getComputedStyle(e).display+' | w='+getComputedStyle(e).width+' | cols='+getComputedStyle(e).gridTemplateColumns+' | n='+e.querySelectorAll('img').length),
  bodyW: document.body.clientWidth,
  firstImgRect: (()=>{const r=document.querySelector('img').getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}})(),
  imgCount: document.querySelectorAll('img').length
},null,1)`));

// Screenshots
let s = await send("Page.captureScreenshot", { format: "png" });
await fs.writeFile(OUT + "\\01-portfolio-393px-top.png", Buffer.from(s.result.data, "base64"));
await ev("window.scrollTo(0, 1400)"); await sleep(1500);
s = await send("Page.captureScreenshot", { format: "png" });
await fs.writeFile(OUT + "\\02-portfolio-393px-scrolled.png", Buffer.from(s.result.data, "base64"));
console.log("\nscreenshots written");

// Open the lightbox on a portrait to see the tap-to-zoom experience.
await ev(`window.scrollTo(0,0)`); await sleep(800);
const box = await ev(`(()=>{const i=document.querySelectorAll('img')[0];const r=i.getBoundingClientRect();
  return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`);
const pt = JSON.parse(box);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", clickCount: 1, pointerType: "touch" });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", clickCount: 1, pointerType: "touch" });
await sleep(3000);
console.log("\n=== lightbox state ===");
console.log(await ev(`JSON.stringify({
  open: !!document.querySelector('.lb, .lightbox, [class*=lb]'),
  classes: [...document.querySelectorAll('body *')].filter(e=>/lb|lightbox|zoom/i.test(e.className)).slice(0,6).map(e=>e.className),
  imgs: [...document.querySelectorAll('img')].length
},null,1)`));
s = await send("Page.captureScreenshot", { format: "png" });
await fs.writeFile(OUT + "\\03-lightbox-393px.png", Buffer.from(s.result.data, "base64"));
console.log("lightbox screenshot written");
ws.close();
