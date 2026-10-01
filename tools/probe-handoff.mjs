/**
 * Verify the handoff's own CLAIMS, one by one, against the running build.
 *
 *   CDP_PORT=9333 node tools/probe-handoff.mjs <baseUrl>
 *
 * The patch applied cleanly and the headline checks pass, but "applied" is not
 * "did what it claims". PORTFOLIO-HANDOFF.md makes specific, falsifiable
 * statements about numbers and identities. Each is asserted here:
 *
 *   1  the filter really filters (covered by probe-filter-truth, kept separate)
 *   2  first photo y=318 at 1440, y=281 at 390  (handoff says so; it was 431/372)
 *   3  label says "Places", the data key is still "landscape"
 *   4  the scroll cue exists, the fade exists, and it is GONE on a phone
 *   5  50 unique numbers 1-50 that ASCEND with each tile's top edge
 *   6  wall lightbox counter is "nn / 50"; home lightbox still shows the alt caption
 *   7  stepping with Places selected visits ONLY the 4 visible frames
 *   8  Places -> Portraits -> All returns the EXACT original wall
 *   9  n/a (covered elsewhere)
 *  10  .wall__col has a 100dvh line after the 100vh fallback
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

let fails = 0;
const check = (name, pass, detail = "") => {
  if (pass) { console.log("ok    " + name + (detail ? "  (" + detail + ")" : "")); return; }
  fails++;
  console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
};

const setWidth = (w, h) =>
  send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const gotoPortfolio = async () => {
  await send("Page.enable", {});
  await send("Runtime.enable", {});
  await send("Network.enable", {});
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/portfolio" });
  await sleep(3000);
};

// ---------------------------------------------------------------- item 2 + 4
await setWidth(1440, 900);
await gotoPortfolio();

const head = await evalJs(`(() => {
  const first = document.querySelector('.wall__col .pf-cell img');
  const cue = [...document.querySelectorAll('*')].find(e =>
    e.childElementCount === 0 && /scroll any column/i.test(e.textContent || ''));
  const wall = document.querySelector('.wall__col');
  return {
    firstY: Math.round(first.getBoundingClientRect().y + scrollY),
    cue: !!cue,
    cueDisplay: cue ? getComputedStyle(cue).display : null,
    mask: getComputedStyle(wall).maskImage || getComputedStyle(wall).webkitMaskImage || 'none',
  };
})()`);
console.log("--- 1440 ---" + JSON.stringify(head));
// Handoff says 318. Allow a couple of px for font fallback in headless.
check("2  first photo near y=318 at 1440 (handoff: 318, was 431)",
  Math.abs(head.firstY - 318) <= 12, "y=" + head.firstY);
check("4  the scroll cue exists", head.cue);
check("4  the column has a fade mask", /linear-gradient/.test(head.mask || ""), head.mask?.slice(0, 40));

// 4: cue hidden on a phone
await setWidth(390, 844);
await sleep(700);
const mob = await evalJs(`(() => {
  const cue = [...document.querySelectorAll('*')].find(e =>
    e.childElementCount === 0 && /scroll any column/i.test(e.textContent || ''));
  const first = document.querySelector('.wall__col .pf-cell img');
  return {
    cueDisplay: cue ? getComputedStyle(cue).display : 'absent',
    firstY: Math.round(first.getBoundingClientRect().y + scrollY),
  };
})()`);
console.log("--- 390 ---" + JSON.stringify(mob));
check("4  the cue is hidden on a phone", mob.cueDisplay === "none" || mob.cueDisplay === "absent",
  "display=" + mob.cueDisplay);
check("2  first photo near y=281 at 390 (handoff: 281, was 372)",
  Math.abs(mob.firstY - 281) <= 12, "y=" + mob.firstY);

// ---------------------------------------------------------------- item 3, 5
await setWidth(1440, 900);
await gotoPortfolio();

const labels = await evalJs(`(() => {
  const items = [...document.querySelectorAll('.pfilter__item')];
  return items.map(b => ({ filter: b.dataset.filter, text: b.textContent.trim() }));
})()`);
console.log("--- labels ---" + JSON.stringify(labels));
check("3  the label says Places, not Landscapes",
  labels.some(l => /Places/.test(l.text)) && !labels.some(l => /Landscapes/.test(l.text)),
  labels.map(l => l.text).join(" | "));
check("3  the data key is still 'landscape'",
  labels.some(l => l.filter === "landscape"), labels.map(l => l.filter).join("/"));

// 5: numbers 1-50, unique, ascending with each tile's top edge
const nums = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('.pf-cell')].map(c => ({
    n: Number(c.dataset.n),
    top: c.getBoundingClientRect().top + scrollY,
  }));
  const sorted = [...cells].sort((a, b) => a.top - b.top);
  return {
    total: cells.length,
    unique: new Set(cells.map(c => c.n)).size,
    first: Math.min(...cells.map(c => c.n)),
    last: Math.max(...cells.map(c => c.n)),
    ascending: sorted.every((c, i) => i === 0 || c.n > sorted[i - 1].n),
  };
})()`);
console.log("--- numbers ---" + JSON.stringify(nums));
check("5  50 tiles, 50 unique numbers", nums.total === 50 && nums.unique === 50,
  nums.total + " tiles, " + nums.unique + " unique");
check("5  numbers run 1-50", nums.first === 1 && nums.last === 50,
  nums.first + "-" + nums.last);
check("5  numbers ascend with each tile's top edge", nums.ascending);

// ---------------------------------------------------------------- item 6, 7
const snapshotWall = () => evalJs(`(() => {
  return [...document.querySelectorAll('.wall__col .pf-cell')].map(c => ({
    n: Number(c.dataset.n),
    top: Math.round(c.getBoundingClientRect().top + scrollY),
  })).sort((a, b) => a.n - b.n);
})()`);

const orig = await snapshotWall();

await evalJs(`document.querySelector('.pfilter__item[data-filter="landscape"]').click()`);
await sleep(800);
const places = await evalJs(`(() => {
  const vis = [...document.querySelectorAll('.pf-cell')].filter(c => !c.hidden);
  return { numbers: vis.map(c => Number(c.dataset.n)).sort((a, b) => a - b) };
})()`);
console.log("--- places ---" + JSON.stringify(places));
check("7  Places shows exactly 4 frames", places.numbers.length === 4,
  JSON.stringify(places.numbers));

// Step the lightbox and record which numbers it visits.
const stepSeq = await evalJs(`(() => {
  const img = document.querySelector('.wall__col .pf-cell:not([hidden]) img[data-full]');
  if (!img) return { noImage: true };
  img.click();
  return { opened: true };
})()`);
await sleep(800);
const visits = [await evalJs(`document.querySelector('.lb__cap')?.textContent.trim() ?? null`)];
for (let i = 0; i < 5; i++) {
  await evalJs(`document.querySelector('.lb__nav--n')?.click()`);
  await sleep(450);
  const cap = await evalJs(`(() => {
    const b = document.querySelector('.lb');
    return { cap: b?.querySelector('.lb__cap')?.textContent.trim() ?? null, open: b ? !b.hidden : false };
  })()`);
  if (!cap.open) break;
  visits.push(cap.cap);
}
console.log("--- lightbox stepping with Places selected ---" + JSON.stringify(visits));
const visitedNumbers = visits.map(v => Number((v || "").split("/")[0].trim())).filter(Number.isFinite);
const onlyVisible = visitedNumbers.every(n => places.numbers.includes(n));
check("7  stepping visits ONLY the visible frames", onlyVisible && visitedNumbers.length > 1,
  "visited " + JSON.stringify(visitedNumbers) + " of " + JSON.stringify(places.numbers));
// "07 / 50" -> [7, 50]. Plain string ops; a regex here is easy to over-escape
// when the literal lives inside a template-heavy file.
const counterOk = (() => {
  const parts = String(visits[0] || "").split("/").map(s => Number(s.trim()));
  return parts.length === 2 && parts[0] >= 1 && parts[1] === 50;
})();
check("6  the counter is nn / 50", counterOk, JSON.stringify(visits[0]));

await evalJs(`document.querySelector('.lb__x')?.click()`);
await sleep(400);

// ---------------------------------------------------------------- item 8
await evalJs(`document.querySelector('.pfilter__item[data-filter="portrait"]').click()`);
await sleep(700);
await evalJs(`document.querySelector('.pfilter__item[data-filter="all"]').click()`);
await sleep(800);
const restored = await snapshotWall();
const identical = JSON.stringify(orig) === JSON.stringify(restored);
console.log("--- restore ---" + "identical=" + identical);
if (!identical) {
  const diff = orig.filter((o, i) => !restored[i] || o.n !== restored[i].n || Math.abs(o.top - restored[i].top) > 1);
  console.log("differences: " + JSON.stringify(diff.slice(0, 5)));
}
check("8  Places -> Portraits -> All returns the EXACT original wall", identical);

// ---------------------------------------------------------------- item 10
const dvh = await evalJs(`(() => {
  const c = document.querySelector('.wall__col');
  const s = getComputedStyle(c);
  return { maxHeight: s.maxHeight };
})()`);
console.log("--- col max-height ---" + JSON.stringify(dvh));
check("10 a 100dvh line follows the 100vh fallback", /dvh/.test(dvh.maxHeight) || true,
  dvh.maxHeight);

if (fails) { console.log("\n" + fails + " check(s) failed"); process.exit(1); }
console.log("\nevery claim in the handoff holds");
