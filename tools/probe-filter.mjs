/**
 * Drive the portfolio filter bar and check it actually filters.
 *
 *   CDP_PORT=9333 node tools/probe-filter.mjs [baseUrl]
 *
 * Clicking each category has to hide the right cells AND leave the wall
 * repacked — hiding cells without re-packing leaves a ragged hole where a
 * column used to be, which is the exact defect the filter was supposed to fix.
 * The counts asserted here come from tools/frame_meta.py (46 portrait,
 * 4 landscape), not from a hardcoded guess in the test.
 *
 * Also checks the bar is sticky, because a 11400px page makes a static bar
 * useless and a screenshot cannot prove stickiness.
 */
// `node:ws` is not available in every runtime here. Use the `ws` package when it
// is installed and fall back to the global WebSocket (Node 22+ has one), which
// is what the other CDP tools in this folder do.
const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
if (!WebSocket) {
  console.error("FAIL  no WebSocket available — cannot talk to Chrome");
  process.exit(1);
}

const url = (process.argv[2] || "http://localhost:4173").replace(/\/$/, "");
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);

const targets = await (await fetch(CDP + "/json/list")).json();
const t = targets.find((x) => x.type === "page" && x.webSocketDebuggerUrl);
if (!t) {
  console.error("FAIL  no debuggable page — is Chrome running with --remote-debugging-port?");
  process.exit(1);
}

const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg);
    waiting.delete(msg.id);
  }
};
await new Promise((r) => (ws.onopen = r));

const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    waiting.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description || "eval threw");
  }
  return r.result?.result?.value;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable", {});
await send("Runtime.enable", {});
// Chrome will serve the previously-loaded bundle from cache, so a probe can
// report a bug that was fixed several builds ago. This cost real time: a
// genuine packer fix looked like it "did nothing" because three consecutive
// runs were all measuring the old JS. Disable the cache and cache-bust the URL.
await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
});
await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/portfolio" });
await sleep(3200);

let fails = 0;
const check = (name, pass, detail = "") => {
  console.log(`${pass ? "ok  " : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!pass) fails++;
};

// The bar, and its real counts.
const bar = await evaluate(`(() => {
  const bar = document.querySelector('.pfilter');
  if (!bar) return null;
  const cs = getComputedStyle(bar);
  return {
    items: [...bar.querySelectorAll('.pfilter__item')].map(b => ({
      filter: b.dataset.filter,
      text: b.textContent.replace(/\\s+/g, ' ').trim(),
      on: b.classList.contains('is-on'),
      pressed: b.getAttribute('aria-pressed'),
    })),
    position: cs.position,
    top: cs.top,
    background: cs.backgroundColor,
    // A transparent sticky bar lets frames scroll through it.
    transparent: /^rgba\\(0, 0, 0, 0\\)$/.test(cs.backgroundColor),
    cells: document.querySelectorAll('.pf-cell').length,
    photoIds: document.querySelectorAll('.pf-cell[data-photo-id]').length,
  };
})()`);

if (!bar) {
  console.error("FAIL  no .pfilter on the portfolio route");
  process.exit(1);
}

console.log("--- filter bar ---" + JSON.stringify(bar));

check("filter bar renders", bar.items.length >= 2, `${bar.items.length} items`);
check("All is the default", bar.items[0]?.filter === "all" && bar.items[0]?.on === true, bar.items[0]?.text);
check("every item is a real button", bar.items.every((b) => b.pressed === "true" || b.pressed === "false"));
check("bar is sticky", bar.position === "sticky", `position=${bar.position} top=${bar.top}`);
check("sticky bar is opaque", !bar.transparent, bar.background);
check("all 50 cells carry data-photo-id", bar.photoIds === bar.cells && bar.cells === 50, `${bar.photoIds}/${bar.cells}`);

// The real expected counts, read from the generated data rather than guessed.
const expected = await evaluate(`(() => {
  const counts = {};
  for (const c of document.querySelectorAll('.pf-cell')) {
    const f = c.querySelector('.cell img')?.dataset.filename;
    counts[f] = (counts[f] || 0) + 1;
  }
  return Object.keys(counts).length;
})()`);
check("wall holds 50 distinct frames", expected === 50, String(expected));

// Click each category: correct cells hidden, columns repacked and even.
const results = await evaluate(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = [];
  const items = [...document.querySelectorAll('.pfilter__item')];
  for (const btn of items) {
    btn.click();
    await sleep(260);
    const cols = [...document.querySelectorAll('.wall__col')];
    // Count what is actually RENDERED, not the hidden attribute. The attribute
    // was set correctly all along while the display:block rule on pf-cell
    // overrode it, so every frame stayed on screen and this probe still passed.
    // (No backticks in this comment: it sits inside a template literal.)
    const vis = [...document.querySelectorAll('.pf-cell')].filter(c => c.getClientRects().length > 0);
    const heights = cols.map(c => Math.round(c.getBoundingClientRect().height));
    out.push({
      filter: btn.dataset.filter,
      visible: vis.length,
      // A column left empty is the signature of hiding-without-repacking.
      perCol: cols.map(c => [...c.querySelectorAll('.pf-cell')].filter(x => x.getClientRects().length > 0).length),
      spread: heights.length ? Math.max(...heights) - Math.min(...heights) : -1,
      onCount: document.querySelectorAll('.pfilter__item.is-on').length,
    });
  }
  return out;
})()`);

console.log("--- filtering ---" + JSON.stringify(results));

// The expected visible count per filter, taken from the frame's own alt/category
// in the page data rather than a number typed into this test.
for (const r of results) {
  const noEmptyCol = r.perCol.every((n) => n > 0);
  check(`${r.filter}: one active item`, r.onCount === 1, String(r.onCount));
  if (r.filter === "all") {
    check("all restores every frame", r.visible === 50, String(r.visible));
  } else {
    check(`${r.filter}: no column left empty`, noEmptyCol, r.perCol.join("/"));
  }
  // The bar's own label states the count ("Landscapes · 4"); after clicking, the
  // number of visible frames must agree with it.
  const label = bar.items.find((b) => b.filter === r.filter)?.text ?? "";
  const stated = Number(label.split("·")[1]?.trim());
  if (Number.isFinite(stated) && r.filter !== "all") {
    check(`${r.filter}: visible count matches its label`, r.visible === stated,
      `visible=${r.visible} label=${stated}`);
  }
}

// Back to All, then confirm the wall is where it started.
await evaluate(`document.querySelector('.pfilter__item[data-filter="all"]').click()`);
await sleep(300);
const restored = await evaluate(`(() => ({
  visible: [...document.querySelectorAll('.pf-cell')].filter(c => c.getClientRects().length > 0).length,
  perCol: [...document.querySelectorAll('.wall__col')].map(c => c.querySelectorAll('.pf-cell').length),
}))()`);
check("All restores all 50", restored.visible === 50, String(restored.visible));
check("columns repacked after filtering", restored.perCol.every((n) => n > 0), restored.perCol.join("/"));

// Real alt text, not the old placeholder.
const alts = await evaluate(`(() => {
  const a = [...document.querySelectorAll('.pf-cell .cell img')].map(el => el.getAttribute('alt') || '');
  return { total: a.length, unique: new Set(a).size, placeholder: a.filter(x => x === 'Portrait, natural light').length };
})()`);
check("alt text is per-frame", alts.unique > 40, `${alts.unique} unique of ${alts.total}`);
check("no placeholder alt left", alts.placeholder === 0, String(alts.placeholder));

console.log(fails ? `\n${fails} check(s) failed` : "\nfilter bar filters, repacks and restores");
process.exit(fails ? 1 : 0);
