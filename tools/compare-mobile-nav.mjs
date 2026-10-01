/**
 * Compare the mobile header + drawer between two routes, field by field.
 *
 *   CDP_PORT=9334 node tools/compare-mobile-nav.mjs [baseUrl] [routeA] [routeB]
 *
 * Alwin, 2026-10-01: "i want the home menu and portfolio to feel the same i see
 * on mobile my menus are different for some reason home and portfolio should
 * have same menu".
 *
 * Before changing anything, this measures WHERE they differ. A menu can differ
 * in three separate places and the fix is different for each:
 *   1. the header bar above the drawer (logo, burger) — home is transparent over
 *      the hero, portfolio is a solid white bar
 *   2. the drawer panel itself (background, padding, borders)
 *   3. the links inside it (colour, size, spacing)
 *
 * The 2026-10-01 fix already made (3) match. This says whether (1) and (2) do.
 */
const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
if (!WebSocket) { console.error("FAIL  no WebSocket"); process.exit(1); }

const url = (process.argv[2] || "http://localhost:4173").replace(/\/$/, "");
const A = process.argv[3] || "home";
const B = process.argv[4] || "portfolio";
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(CDP + "/json/list")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res) => { waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
};
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text || "eval threw");
  return r.result?.result?.value;
};

await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

const probe = async (route) => {
  await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/" + route });
  await sleep(2800);
  // header BEFORE opening the drawer
  const closed = await evalJs(`(() => {
    const h = document.querySelector('.site-header');
    const bar = document.querySelector('.burger__bars i');
    const logo = document.querySelector('.logo');
    const g = (el) => el ? getComputedStyle(el) : null;
    return {
      headerPos: g(h).position,
      headerBg: g(h).backgroundColor,
      headerBgImage: g(h).backgroundImage.slice(0, 60),
      barColour: g(bar) ? g(bar).backgroundColor : null,
      logoColour: g(logo).color,
      headerH: Math.round(h.getBoundingClientRect().height),
    };
  })()`);
  await evalJs(`document.querySelector('.burger')?.click()`);
  await sleep(500);
  const open = await evalJs(`(() => {
    const nav = document.querySelector('.site-nav');
    const g = getComputedStyle(nav);
    const r = nav.getBoundingClientRect();
    const links = [...nav.querySelectorAll('.nav-link')];
    const l0 = links[0] ? getComputedStyle(links[0]) : null;
    return {
      drawerBg: g.backgroundColor,
      drawerPos: g.position,
      drawerTop: g.top,
      drawerPad: g.padding,
      drawerBorder: g.borderBottomColor + " " + g.borderBottomWidth,
      drawerH: Math.round(r.height),
      drawerTopPx: Math.round(r.top),
      linkCount: links.length,
      // Compare INACTIVE links. On #/home links[0] is the ACTIVE one, so reading
      // it made home look "too dark" when --ink is exactly right for active.
      // The first link that is not .is-active is the fair comparison.
      inactiveColour: (() => {
        const i = links.find(a => !a.classList.contains('is-active'));
        return i ? getComputedStyle(i).color : null;
      })(),
      activeColour: (() => {
        const a2 = links.find(a => a.classList.contains('is-active'));
        return a2 ? getComputedStyle(a2).color : null;
      })(),
      linkColour: l0 ? l0.color : null,
      linkSize: l0 ? l0.fontSize : null,
      linkSpacing: l0 ? l0.letterSpacing : null,
      linkPad: l0 ? l0.padding : null,
      linkText: links.map(a => a.textContent.trim()).join(","),
      firstLinkTop: links[0] ? Math.round(links[0].getBoundingClientRect().top) : null,
    };
  })()`);
  return { route, closed, open };
};

const a = await probe(A);
const b = await probe(B);

console.log(`=== ${A} ===`);
console.log(JSON.stringify(a, null, 1));
console.log(`=== ${B} ===`);
console.log(JSON.stringify(b, null, 1));

console.log("\n=== DIFFERENCES ===");
const rows = [];
for (const k of Object.keys(a.closed)) {
  if (a.closed[k] !== b.closed[k]) rows.push(["HEADER", k, a.closed[k], b.closed[k]]);
}
for (const k of Object.keys(a.open)) {
  if (a.open[k] !== b.open[k]) rows.push(["DRAWER", k, a.open[k], b.open[k]]);
}
if (!rows.length) console.log("  none — they are already identical");
for (const [where, k, x, y] of rows) {
  console.log(`  ${where.padEnd(7)} ${k.padEnd(14)} ${A}=${JSON.stringify(x)}  ${B}=${JSON.stringify(y)}`);
}
