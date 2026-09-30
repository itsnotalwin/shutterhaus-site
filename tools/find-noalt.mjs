/**
 * Which image has no alt text? Name the file and where it comes from.
 *
 * Run: node tools/find-noalt.mjs <baseUrl> [route]
 */
const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const ROUTE = process.argv[3] ?? "";
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: BASE + "/" + ROUTE });
await sleep(1800);

const out = await evaluate(`(() => {
  const imgs = [...document.querySelectorAll("img")];
  const bad = imgs.filter(i => !i.alt || !i.alt.trim());
  return {
    total: imgs.length,
    noAlt: bad.length,
    detail: bad.map(i => ({
      src: (i.currentSrc || i.src || "").split("/").pop(),
      cls: i.className || "(none)",
      parent: i.parentElement ? i.parentElement.tagName.toLowerCase() + "." + (i.parentElement.className || "") : "none",
      rect: (r => Math.round(r.width) + "x" + Math.round(r.height))(i.getBoundingClientRect()),
      visible: getComputedStyle(i).display !== "none" && !i.closest("[hidden]"),
    })),
  };
})()`);

console.log(JSON.stringify(out, null, 2));
ws.close();
