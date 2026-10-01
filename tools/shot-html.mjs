/**
 * Screenshot a local HTML file over CDP.
 *
 * usage: node tools/shot-html.mjs <file> <out.png> [width] [height]
 *
 * Used to preview the candidate Portfolio layout comparison (shots/pf-options.html)
 * with the real photographs, without having to deploy anything.
 */
const [file, out, w = "1500", h = "1200"] = process.argv.slice(2);
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const { writeFileSync } = await import("node:fs");

const b = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(b.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send("Emulation.setDeviceMetricsOverride", {
  width: Number(w),
  height: Number(h),
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.enable");
await send("Page.navigate", { url: "file:///" + file.replace(/\\/g, "/") });
await new Promise((r) => setTimeout(r, 2800));

const shot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
});
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log("SHOT", out);
await fetch(`${CDP}/json/close/${b.id}`);
process.exit(0);