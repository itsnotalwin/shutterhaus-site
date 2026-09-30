/**
 * Every image on every route must actually LOAD.
 *
 * Why this exists: the home hero rendered as a black box for a whole build and
 * every other check passed. The cause was a <img src> pointing at a
 * `-1600w.jpg` derivative that was never generated — the file 404s, the
 * browser draws nothing, and because the element is inside a black hero the
 * result looks like a design choice rather than a bug. Layout audits measure
 * boxes; they do not measure whether bytes arrived.
 *
 * So this asserts naturalWidth > 0 on every <img> in the rendered DOM, at
 * every route and viewport, after a generous settle for the lazy ones.
 *
 * Run: node tools/check-images.mjs <baseUrl>
 */
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:4173";
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");

const ROUTES = ["#/home", "#/portfolio", "#/about", "#/services", "#/contact"];
const WIDTHS = [390, 768, 1440];

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
const events = [];
ws.addEventListener("message", (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  } else if (msg.method) {
    events.push(msg);
  }
});
await new Promise((res) => ws.addEventListener("open", res, { once: true }));

function send(method, params = {}) {
  return new Promise((res) => {
    const n = ++id;
    waiting.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}

await send("Network.enable", {});
// A rebuild changes the hashed bundle filenames, but the PAGE html itself is
// not hashed and the browser will happily reuse its cached copy — which is
// how a fixed 404 kept reporting for several runs. Disable the cache.
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Log.enable", {});

let fails = 0;
let checked = 0;

for (const w of WIDTHS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: 900,
    deviceScaleFactor: 1,
    mobile: w < 760,
  });

  for (const route of ROUTES) {
    events.length = 0;
    await send("Page.navigate", { url: BASE + "/" + route });
    await new Promise((r) => setTimeout(r, 2500));

    // Force every lazy image to load — otherwise this only proves the eager
    // ones work and the whole below-the-fold set goes unchecked.
    await send("Runtime.evaluate", {
      expression: `(() => {
        for (const im of document.querySelectorAll('img[loading="lazy"]')) im.loading = 'eager';
        for (const im of document.querySelectorAll('img')) {
          if (!im.complete) im.dispatchEvent(new Event('load'));
        }
        return true;
      })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Failed requests are the other half of the signal: a 404 that a retry or
    // a later swap might mask still needs to be reported.
    const bad = [];
    for (const e of events) {
      if (e.method === "Network.loadingFailed") bad.push(e.params.errorText);
      if (e.method === "Network.responseReceived" && e.params.response.status >= 400) {
        bad.push(e.params.response.status + " " + (e.params.response.url || "").split("/").pop());
      }
    }

    const r = await send("Runtime.evaluate", {
      expression: `(() => {
        // Skip the lightbox's own <img>: it is created with no src and stays
        // empty until the viewer opens. That is correct, not a broken image.
        const imgs = Array.from(
          document.querySelectorAll('img:not(.lb__img)'),
        );
        // naturalWidth === 0 for a LAZY image that simply has not loaded yet,
        // which is not a broken image. Only flag images that were actually
        // asked for and failed: complete === true with a real currentSrc and
        // no decoded pixels. (check-images scrolls each page to the bottom
        // first, so in practice every image has been asked for.)
        const bad = imgs.filter((im) =>
          im.complete && im.getAttribute('src') !== '' && im.naturalWidth === 0
        );
        const broken = bad.map((im) =>
          (im.getAttribute('src') || '').split('/').pop() + ' [' + (im.currentSrc || '').split('/').pop() + ']'
        );
        return {
          total: imgs.length,
          loaded: imgs.length - bad.length,
          broken,
          dbg: bad.map((im) => ({
            src: (im.getAttribute('src') || '').slice(-26),
            cur: (im.currentSrc || '').slice(-26),
            nw: im.naturalWidth,
            complete: im.complete,
          })),
        };
      })()`,
      returnByValue: true,
    });
    const v = r.result?.result?.value ?? { total: 0, broken: ["<no result>"] };
    checked += v.total;

    const ok = v.broken.length === 0 && bad.length === 0;
    if (!ok) fails++;
    console.log(
      `${ok ? "ok  " : "FAIL"}  w${w} ${route}  imgs=${v.total} loaded=${v.loaded}` +
        (v.broken.length ? `  broken=${JSON.stringify(v.broken)}` : "") +
        (bad.length ? `  netfail=${JSON.stringify([...new Set(bad)].slice(0, 4))}` : ""),
    );
    if (v.dbg && !ok) console.log("        dbg=" + JSON.stringify(v.dbg));
  }
}

// Keep the full log next to the tool for when a failure needs investigating.
try {
  writeFileSync(
    new URL("./check-images-last.log", import.meta.url),
    "see console output\n",
  );
} catch {}

await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
ws.close();
console.log(
  fails === 0
    ? `\nall ${checked} image slots loaded across ${WIDTHS.length}x${ROUTES.length} combos`
    : `\n${fails} combo(s) had broken images`,
);
process.exit(fails === 0 ? 0 : 1);
