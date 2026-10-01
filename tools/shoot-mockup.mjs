/**
 * Render mockups/*.html to a PNG at a given width.
 *
 *   CDP_PORT=9333 node tools/shoot-mockup.mjs <file.html> <width> <out.png>
 *
 * DevTools cannot do "full page" captures, so this grows the viewport to the
 * document height and shoots once. If the result is blank, the images are
 * probably relative paths that resolve outside the page.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";

const CDP_PORT = process.env.CDP_PORT || 9333;
const [, , file, width = "1500", out = "mockup.png"] = process.argv;
if (!file) {
  console.error("usage: node tools/shoot-mockup.mjs <file.html> [width] [out.png]");
  process.exit(1);
}

const htmlPath = resolve(file);
const url = "file:///" + htmlPath.replace(/\\/g, "/");

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const page = list.find((t) => t.type === "page");
if (!page) {
  console.error("FAIL  no page target on CDP; is Chrome running with --remote-debugging-port?");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m);
    waiting.delete(m.id);
  }
};
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});

const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res) => {
    waiting.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
};

const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  return r.result?.result?.value;
};

await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: 1000,
  deviceScaleFactor: 2,
  mobile: false,
});
await send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 2500));

// Wait for the gallery derivatives to decode, so the shot is not half-empty.
const decoded = await evalJs(`(() => {
  const imgs = [...document.images];
  return imgs.filter(i => i.complete && i.naturalWidth > 0).length + "/" + imgs.length;
})()`);
if (decoded && !decoded.startsWith(String(Number(decoded.split("/")[1])))) {
  await new Promise((r) => setTimeout(r, 1200));
}

const h = await evalJs("Math.ceil(document.documentElement.scrollHeight)");
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: Math.min(h, 20000),
  deviceScaleFactor: 2,
  mobile: false,
});
await new Promise((r) => setTimeout(r, 700));

const shot = await send("Page.captureScreenshot", { format: "png" });
const outPath = resolve(out);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(shot.result.data, "base64"));
console.log(`${outPath}  ${width}x${h}  images=${decoded}`);
ws.close();
process.exit(0);
