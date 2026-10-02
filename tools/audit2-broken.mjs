/**
 * Find the broken image(s) reported on every route by audit2-baseline.mjs.
 * Prints every <img> that completed with naturalWidth 0, plus its src,
 * classes, box size and loading strategy, so we can tell a real 404 from a
 * lazy image that simply had not entered the viewport at capture time.
 *
 * Run: node tools/audit2-broken.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9300 + Math.floor(Math.random() * 500);
const ORIGIN = "https://shutterhausvisuals.co.za";
const PROFILE = fileURLToPath(new URL(".", import.meta.url)) + "..\\audit2-chrome-profile-b";
const ROUTES = ["", "portfolio", "about", "services", "contact"];

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--hide-scrollbars",
  "--disable-gpu", "--no-first-run", `--user-data-dir=${PROFILE}`, "about:blank",
], { stdio: "ignore" });

let wsUrl;
for (let i = 0; i < 60; i++) {
  try {
    const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    if (j.webSocketDebuggerUrl) { wsUrl = j.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) {
    const p = pending.get(x.id); pending.delete(x.id);
    x.error ? p.reject(new Error(JSON.stringify(x.error))) : p.resolve(x.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable");
await S("Runtime.enable");

const EXPR = `(() => [...document.images].map(i => {
  const r = i.getBoundingClientRect();
  return {
    src: (i.currentSrc || i.src || '').split('/').pop(),
    full: i.currentSrc || i.src,
    cls: i.className || '',
    alt: (i.alt || '').slice(0, 30),
    naturalW: i.naturalWidth,
    complete: i.complete,
    boxW: Math.round(r.width),
    boxH: Math.round(r.height),
    loading: i.loading || '(eager default)',
    decoding: i.decoding || '(default)',
    inView: r.top < innerHeight && r.bottom > 0,
  };
}))()`;

const HEADERS = { route: "SRC", state: "naturalW / box", loading: "loading", inView: "inView" };
console.table([]);

for (const route of ROUTES) {
  await S("Page.navigate", { url: `${ORIGIN}/${route}` });
  await sleep(3500);
  const before = await S("Runtime.evaluate", { returnByValue: true, expression: EXPR });
  // Now scroll the whole page so every lazy image gets a chance to load,
  // then re-measure. A still-zero naturalWidth after that is a real break.
  await S("Runtime.evaluate", {
    expression: `(async () => {
      const step = innerHeight * 0.8;
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise(r => setTimeout(r, 220));
      }
      scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 1200));
    })()`,
    awaitPromise: true,
  });
  const after = await S("Runtime.evaluate", { returnByValue: true, expression: EXPR });
  const rows = after.result.value.filter((i) => i.naturalW === 0);
  const lazyFixed = rows.filter((r) => {
    const b = before.result.value.find((x) => x.src === r.src);
    return b && b.naturalW === 0 && !b.inView;
  });
  console.log(`\n### /${route || "home"} — ${rows.length} broken after full scroll`);
  for (const r of rows) {
    const isLazy = lazyFixed.some((l) => l.src === r.src);
    console.log(`  ${isLazy ? "LAZY(not yet loaded)" : "BROKEN(real)"}  ${r.src}`);
    console.log(`      box ${r.boxW}x${r.boxH}  loading=${r.loading}  cls="${r.cls}"  alt="${r.alt}"`);
    console.log(`      ${r.full}`);
  }
  if (!rows.length) console.log("  none");
}

ws.close();
chrome.kill();
process.exit(0);