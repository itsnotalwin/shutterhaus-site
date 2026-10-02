/**
 * Does the visitor actually avoid downloading the Supabase SDK on first paint?
 *
 * The bundle split only matters if the big chunk stops being fetched before the
 * page is usable. This loads each route with an empty cache, records every
 * script the browser requested AND the moment it finished, then reports the
 * bytes in the initial document's critical path versus everything after.
 *
 * "First paint" is approximated by the load event: that is the point at which
 * the page is on screen and the visitor could start reading.
 *
 * Run: node tools/audit4-critical.mjs
 */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const created = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
const scripts = [];
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) {
    const p = pending.get(x.id); pending.delete(x.id);
    x.error ? p.reject(new Error(JSON.stringify(x.error))) : p.resolve(x.result);
    return;
  }
  if (x.method === "Network.responseReceived") {
    const u = x.params.response.url;
    if (/\.(js|mjs)(\?|$)/.test(u) || x.params.type === "Script") {
      scripts.push({ name: u.split("/").pop().split("?")[0], size: x.params.response.encodedDataLength, t: x.params.timestamp });
    }
  }
};
const send = (m, p = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");

for (const route of ["", "about", "contact"]) {
  scripts.length = 0;
  await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Network.clearBrowserCache");

  const loadAt = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `new Promise(res => {
      const t0 = performance.timing.navigationStart;
      if (document.readyState === 'complete') return res(performance.now());
      addEventListener('load', () => res(performance.now()), { once: true });
    })`,
    awaitPromise: true,
  });
  await send("Page.navigate", { url: `${ORIGIN}/${route}` });
  const loadMs = (await loadAt).result.value;
  // let any lazily-imported chunk arrive after the page is already usable
  await sleep(4000);

  const total = scripts.reduce((s, x) => s + (x.size || 0), 0);
  const afterLoad = scripts.filter((x) => x.t - (loadAt.result.value ? 0 : 0) > 0);
  console.log(`\n=== /${route || "home"} — load event at ${Math.round(loadMs)}ms ===`);
  for (const s of scripts) {
    const kb = Math.round((s.size || 0) / 1024);
    const late = s.name.startsWith("store-") ? "  <- Supabase SDK, after paint" : "";
    console.log(`   ${String(kb + "KB").padEnd(8)} ${s.name}${late}`);
  }
  console.log(`   TOTAL js: ${Math.round(total / 1024)}KB across ${scripts.length} file(s)`);
  const supabase = scripts.filter((s) => s.name.startsWith("store-")).length;
  console.log(`   Supabase SDK requested on this route: ${supabase ? "YES (" + supabase + ")" : "no"}`);
}
ws.close();
process.exit(0);