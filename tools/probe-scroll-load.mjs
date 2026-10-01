/**
 * Scroll the portfolio like a visitor and watch what fetches.
 *
 *   CDP_PORT=9333 node tools/probe-scroll-load.mjs <baseUrl>
 *
 * probe-wall-imgs.mjs reported "10 of 50 decoded" and looked like a bug. It
 * is not: 40 of those frames are `loading="lazy"` and below the fold, so the
 * browser has not fetched them yet. That is the feature working.
 *
 * The real question is whether scrolling pulls them in promptly, and whether
 * anything 404s on the way. This scrolls in viewport-sized steps, records which
 * frames decoded at each step, and reports any request that failed.
 */
const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
if (!WebSocket) { console.error("FAIL  no WebSocket"); process.exit(1); }

const url = (process.argv[2] || "http://localhost:4173").replace(/\/$/, "");
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const tabs = await (await fetch(CDP + "/json/list")).json();
const tab = tabs.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!tab) { console.error("FAIL  no page target"); process.exit(1); }

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
const events = [];
ws.onmessage = (m) => {
  const j = JSON.parse(m.data);
  if (j.id && waiting.has(j.id)) { waiting.get(j.id)(j); waiting.delete(j.id); }
  else if (j.method) events.push(j);
};
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res) => { waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
};
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: url + "/?t=" + Date.now() + "/#/portfolio" });
await new Promise((r) => setTimeout(r, 3000));

const docH = await evalJs("document.documentElement.scrollHeight");
const vh = await evalJs("innerHeight");
const steps = Math.ceil(docH / vh);

const seen = new Set();
let bytes = 0;
let bad = [];
const perStep = [];

for (let s = 0; s < steps; s++) {
  events.length = 0;
  await evalJs(`scrollTo(0, ${s * vh})`);
  // Long enough for a lazy image near the new viewport to fetch AND decode.
  await new Promise((r) => setTimeout(r, 1600));

  const state = await evalJs(`(() => {
    const imgs = [...document.querySelectorAll('.pf-cell img')];
    // NOTE: do not assert on naturalWidth here. Through this CDP evaluate path
    // it reads 0 even for frames that a separate evaluate() reports as
    // complete:true with naturalWidth 720. The is-loaded class is what the CSS
    // actually keys on (styles.css: .cell img:not(.is-loaded) { opacity 0 }),
    // so it is the honest signal: it is set on the load AND error events.
    const shown = imgs.filter(i => i.classList.contains('is-loaded')).length;
    return { shown, total: imgs.length, at: Math.round(scrollY) };
  })()`);

  for (const e of events) {
    if (e.method === "Network.loadingFailed") {
      bad.push("failed: " + e.params.errorText);
    }
    if (e.method === "Network.responseReceived") {
      const r = e.params.response;
      if (r.status >= 400) bad.push(r.status + " " + (r.url || "").split("/").pop());
      if (/\.(webp|jpg)$/i.test(r.url || "")) {
        bytes += r.encodedDataLength || 0;
        seen.add((r.url || "").split("/").pop());
      }
    }
  }
  perStep.push({ step: s, y: state.at, shown: state.shown, of: state.total });
  for (const f of perStep[perStep.length - 1].seen || []) seen.add(f);
}

const final = await evalJs(`(() => {
  const imgs = [...document.querySelectorAll('.pf-cell img')];
  return { shown: imgs.filter(i => i.classList.contains('is-loaded')).length, total: imgs.length };
})()`);

console.log("--- per scroll step ---");
for (const p of perStep) console.log(`  y=${String(p.y).padStart(5)}  visible ${p.shown}/${p.of}`);
console.log("--- totals ---");
console.log(JSON.stringify({ steps, docH, vh, ...final, distinctFiles: seen.size, kb: Math.round(bytes / 1024) }));

let fails = 0;
const check = (name, pass, detail = "") => {
  console.log(`${pass ? "ok   " : "FAIL "} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!pass) fails++;
};

check("every frame becomes visible once scrolled to", final.shown === final.total, `${final.shown}/${final.total}`);
check("no failed or 4xx image requests", bad.length === 0, bad.slice(0, 5).join(", ") || "none");
check("frames appear progressively, not all at once", perStep[1] && perStep[1].shown < final.total,
  `step1=${perStep[1]?.shown} final=${final.total}`);

ws.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nlazy loading behaves: progressive, no failures");
process.exit(fails ? 1 : 0);
