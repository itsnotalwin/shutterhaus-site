/**
 * Is the filter actually hiding anything, or only setting an attribute?
 *
 *   CDP_PORT=9333 node tools/probe-filter-truth.mjs <baseUrl>
 *
 * Exists because the probe shipped so far checked `cell.hidden` — the
 * ATTRIBUTE. The handler set that attribute correctly on all 50 cells while
 * every one of them stayed on screen, because `.pf-cell { display: block }`
 * out-ranks the user-agent `[hidden] { display: none }` rule.
 *
 * So the check passed and the feature did nothing. This probe counts RENDERED
 * geometry instead: an element with `display:block` has a box, a hidden one
 * does not. It should fail on the pre-patch build and pass after.
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
await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/portfolio" });
await sleep(3000);

let fails = 0;
const check = (name, pass, detail = "") => {
  if (pass) { console.log("ok    " + name + (detail ? "  (" + detail + ")" : "")); return; }
  fails++;
  console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
};

/** Count cells that actually occupy space, per column. */
const rendered = () => evalJs(`(() => {
  const cols = [...document.querySelectorAll('.wall__col')];
  const perCol = cols.map(c =>
    [...c.querySelectorAll('.pf-cell')]
      .filter(e => e.getBoundingClientRect().height > 0)
      .length);
  const attrHidden = [...document.querySelectorAll('.pf-cell')].filter(c => c.hidden).length;
  const onBtn = document.querySelector('.pfilter__item.is-on')?.dataset.filter ?? null;
  return { perCol, total: perCol.reduce((a, b) => a + b, 0), attrHidden, onBtn };
})()`);

const bar = await evalJs(`(() => {
  const items = [...document.querySelectorAll('.pfilter__item')];
  return { items: items.map(b => ({ filter: b.dataset.filter, text: b.textContent.trim() })) };
})()`);
console.log("--- bar ---" + JSON.stringify(bar));

const all = await rendered();
console.log("--- all ---" + JSON.stringify(all));
check("All shows all 50 frames", all.total === 50, String(all.total));

for (const item of bar.items) {
  if (item.filter === "all") continue;
  const stated = Number(item.text.split("·")[1]?.trim());
  await evalJs(`document.querySelector('.pfilter__item[data-filter="${item.filter}"]').click()`);
  await sleep(700);
  const st = await rendered();
  console.log("--- " + item.filter + " ---" + JSON.stringify(st));
  check(`${item.filter}: ${stated} frames actually RENDERED`, st.total === stated,
    `rendered=${st.total} label=${stated} attrHidden=${st.attrHidden}`);
  // The specific failure mode: attribute set, nothing hidden.
  check(`${item.filter}: the attribute alone is not what is doing the work`,
    st.attrHidden === 50 - stated || st.total !== 50,
    `rendered=${st.total} attrHidden=${st.attrHidden}`);
}

await evalJs(`document.querySelector('.pfilter__item[data-filter="all"]').click()`);
await sleep(700);
const back = await rendered();
check("All restores all 50 frames", back.total === 50, String(back.total));

if (fails) { console.log("\n" + fails + " check(s) failed"); process.exit(1); }
console.log("\nthe filter really hides frames");
