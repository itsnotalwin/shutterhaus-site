/** print the exact currentSrc of images on the live site */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = "https://shutterhausvisuals.co.za";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = await (await fetch(`${CDP}/json/list`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && pending.has(x.id)) { const p = pending.get(x.id); pending.delete(x.id); x.error ? p.reject(new Error(JSON.stringify(x.error))) : p.resolve(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "err"); return r.result.value; };
await send("Page.enable"); await send("Runtime.enable");
async function waitForVW(w) { for (let i = 0; i < 60; i++) { try { if (await ev("document.documentElement.clientWidth") === w) return true; } catch {} await sleep(250); } return false; }

for (const [route, w, dpr] of [["/portfolio", 393, 3], ["/portfolio", 1440, 1], ["/", 1920, 1], ["/services", 768, 1], ["/", 393, 3]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 852, deviceScaleFactor: dpr, mobile: w < 700, screenWidth: w, screenHeight: 852 });
  await waitForVW(w);
  await send("Page.navigate", { url: ORIGIN + route });
  await sleep(2500);
  await ev("document.fonts.ready").catch(() => {});
  await ev(`(async()=>{const H=document.body.scrollHeight;for(let y=0;y<H;y+=700){scrollTo(0,y);await new Promise(r=>setTimeout(r,80));}scrollTo(0,0);await new Promise(r=>setTimeout(r,500));})()`).catch(() => {});
  await sleep(1500);
  const rows = await ev(`[...document.images].slice(0,4).map(i=>({cur:i.currentSrc, attr:i.getAttribute('src'), nat:i.naturalWidth+'x'+i.naturalHeight, bw:Math.round(i.getBoundingClientRect().width), dpr:devicePixelRatio}))`);
  console.log(`\n== ${route} @${w} dpr${dpr}`);
  for (const r of rows) console.log(`   nat=${r.nat.padEnd(11)} box=${String(r.bw).padStart(5)} need=${Math.round(r.bw * r.dpr)}\n     cur = ${r.cur}\n     attr= ${r.attr}`);
}
ws.close(); process.exit(0);
