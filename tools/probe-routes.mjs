/**
 * Smoke-test every route after a home-page change.
 *
 * The home upgrade touches `homePage()` plus shared CSS (`.cell`, the header,
 * `--strip-cols`). A change aimed at one route can move another, so this
 * walks all five and reports, per route: uncaught page errors, the rendered
 * text length, the heading, the image count, and any image that failed to
 * decode. A route that throws renders as a near-empty shell, which a
 * home-only check would never catch.
 *
 * Usage: node tools/probe-routes.mjs <baseUrl> [width]
 */

const BASE = process.argv[2] || "http://127.0.0.1:4173";
const W = Number(process.argv[3] || 1440);
const ROUTES = ["home", "portfolio", "services", "about", "contact"];
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (
  await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })
).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  } else if (m.method === "Runtime.exceptionThrown") {
    const d = m.params?.exceptionDetails;
    errors.push(d?.exception?.description || d?.text || "unknown error");
  } else if (m.method === "Log.entryAdded" && m.params?.entry?.level === "error") {
    errors.push(m.params.entry.text);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await new Promise((r) => (ws.onopen = r));

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: 900,
  deviceScaleFactor: 1,
  mobile: W < 640,
});

let bad = 0;
console.log(`\nroute smoke test @ ${W}px\n`);

for (const route of ROUTES) {
  errors.length = 0;
  await send("Page.navigate", { url: `${BASE}#/${route}` });
  await sleep(2400);
  const r = await send("Runtime.evaluate", {
    expression: `(() => {
      const imgs = Array.from(document.images);
      // An <img> with no src is not a broken file. src/lightbox.ts ships a
      // placeholder \`.lb__img\` inside the lightbox shell and only sets its src
      // when a photo is opened, so it always reads as naturalWidth 0 on load.
      const srced = imgs.filter(i => i.getAttribute('src'));
      const broken = srced.filter(i => i.complete && i.naturalWidth === 0)
        .map(i => (i.currentSrc || i.src || '').split('/').pop());
      const main = document.querySelector('main') || document.body;
      return JSON.stringify({
        textLen: (main.innerText || '').trim().length,
        h1: document.querySelector('h1')?.textContent?.trim() || null,
        imgs: srced.length,
        placeholders: imgs.length - srced.length,
        broken: broken.slice(0, 5),
        brokenCount: broken.length,
        navLinks: document.querySelectorAll('nav a').length,
        shell: document.querySelector('.shell')?.className || null,
      });
    })()`,
    returnByValue: true,
  });
  const got = JSON.parse(r.result?.result?.value || "{}");
  const errs = errors.filter((e) => !/favicon|net::ERR_FILE/i.test(e));
  const ok = got.textLen > 80 && got.brokenCount === 0 && errs.length === 0;
  if (!ok) bad++;
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${route.padEnd(10)} text=${String(got.textLen).padEnd(5)} imgs=${String(got.imgs).padEnd(3)} broken=${got.brokenCount} nav=${got.navLinks} h1=${JSON.stringify(got.h1)}`
  );
  if (got.brokenCount) console.log(`        broken: ${got.broken.join(", ")}`);
  for (const e of errs) console.log(`        error: ${String(e).split("\n")[0]}`);
  if (got.placeholders) console.log(`        (${got.placeholders} src-less placeholder img, e.g. the lightbox shell)`);
}

await fetch(`${CDP}/json/close/${t.id}`);
ws.close();
console.log("");
process.exit(bad ? 1 : 0);