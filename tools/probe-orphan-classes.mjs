/**
 * Find rendered classes that no stylesheet styles, correctly this time.
 *
 *   CDP_PORT=9334 node tools/probe-orphan-classes.mjs [baseUrl]
 *
 * WHY A CAREFUL VERSION
 * ---------------------
 * The first attempt at this flagged 5 failures across the site, every one a
 * false positive, and I deleted it. Both of its bugs were real though:
 *
 *  - it did NOT recurse into @media. `sheet.cssRules` at the top level returns
 *    CSSMediaRule objects, which have no `.selectorText`; their inner rules live
 *    in a nested `.cssRules`. Every rule inside a media query was therefore
 *    invisible to it. That is why it claimed `.shell.is-bw` was unstyled when
 *    `.shell.is-bw .cell img` exists — inside a media query.
 *  - it tested whether the class appeared as a SUBSTRING of any selector, so
 *    `is-bw` matched nothing while `pkg--pop` would not have matched a selector
 *    written as `.pkg.pop`.
 *
 * This version descends into every nested rule list and compares exact class
 * TOKENS, so `.pkg--pop` and `.pkg.pop` are distinguished correctly.
 *
 * A class with no rule is not automatically a defect — plenty of classes are
 * hooks for JS or for a parent selector. So this reports rather than fails, and
 * the report is only worth reading together with a screenshot.
 */
const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
if (!WebSocket) { console.error("FAIL  no WebSocket"); process.exit(1); }

const url = (process.argv[2] || "http://localhost:4173").replace(/\/$/, "");
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
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

// Descend into @media / @supports / @layer, collecting exact class tokens.
const known = await evalJs(`(() => {
  const classes = new Set();
  const walk = (rules) => {
    for (const r of rules) {
      if (r.selectorText) {
        for (const part of r.selectorText.split(",")) {
          for (const m of part.matchAll(/\\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) classes.add(m[1]);
        }
      }
      if (r.cssRules) walk(r.cssRules);   // @media, @supports, @layer, @container
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch {}
  }
  return [...classes];
})()`);
const knownSet = new Set(known);
console.log(`stylesheets style ${knownSet.size} distinct classes\n`);

let total = 0;
for (const route of ["home", "portfolio", "about", "services", "contact"]) {
  await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/" + route });
  await sleep(2400);
  const r = await evalJs(`(() => {
    const used = new Map();
    for (const el of document.querySelectorAll('#app *')) {
      for (const c of el.classList) {
        if (!used.has(c)) used.set(c, { tag: el.tagName.toLowerCase(), n: 0 });
        used.get(c).n++;
      }
    }
    return [...used].map(([c, v]) => ({ cls: c, ...v }));
  })()`);
  const orphans = r.filter((x) => !knownSet.has(x.cls));
  total += orphans.length;
  console.log(`#/${route}: ${orphans.length ? orphans.map((o) => `${o.cls} <${o.tag}>x${o.n}`).join("  ") : "none"}`);
}
console.log(`\n${total} rendered class(es) with no rule. Read with a screenshot: a class can`);
console.log("be unstyled and still harmless if it is only a JS or parent hook.");
