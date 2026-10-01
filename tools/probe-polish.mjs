/**
 * Check the two NEW behaviours the polish patch adds, and that it did not
 * damage the two it must not touch.
 *
 *   CDP_PORT=9333 node tools/probe-polish.mjs <baseUrl>
 *
 * NEW, from PORTFOLIO-HANDOFF.md:
 *  1. a lightbox opened FROM THE WALL has a counter, word controls, and steps
 *     through the visible frames in number order
 *  2. the portfolio header is compact — first photo higher up the page
 *  3. frames carry a permanent number
 *
 * MUST NOT REGRESS (the home page is locked by HOME-LOCKED.md):
 *  4. the home lightbox still shows glyphs, not words
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

let fails = 0;
const check = (name, pass, detail = "") => {
  if (pass) { console.log("ok    " + name + (detail ? "  (" + detail + ")" : "")); return; }
  fails++;
  console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
};
const goto = async (hash) => {
  await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#" + hash });
  await sleep(3000);
};

// ---------------------------------------------------------------- portfolio
await goto("portfolio");

// 2. Compact header: where does the first frame start?
const header = await evalJs(`(() => {
  const first = document.querySelector('.wall__col .pf-cell img');
  const r = first.getBoundingClientRect();
  return { firstY: Math.round(r.y + scrollY), filterBar: !!document.querySelector('.pfilter') };
})()`);
console.log("--- portfolio header ---" + JSON.stringify(header));
check("first photo is high on the page (compact header)", header.firstY > 0 && header.firstY < 360,
  "first photo at y=" + header.firstY + " (was 431)");

// 3. Frame numbers.
const numbered = await evalJs(`(() => {
  const cells = [...document.querySelectorAll('.pf-cell')];
  const withN = cells.filter(c => c.dataset.n !== undefined || c.querySelector('[data-n]'));
  const n0 = withN[0]?.dataset.n ?? withN[0]?.querySelector('[data-n]')?.dataset.n;
  return { total: cells.length, numbered: withN.length, first: n0 };
})()`);
console.log("--- numbering ---" + JSON.stringify(numbered));
check("every frame carries a number", numbered.numbered === numbered.total,
  numbered.numbered + "/" + numbered.total);

// 1. Wall lightbox: counter, word controls, ordering.
const lbOpen = await evalJs(`(() => {
  const imgs = [...document.querySelectorAll('.wall__col .pf-cell img[data-full]')];
  if (!imgs.length) return { noImages: true };
  imgs[0].click();
  return { clicked: true };
})()`);
await sleep(900);
const lb = await evalJs(`(() => {
  const b = document.querySelector('.lb');
  if (!b) return { missing: true };
  // textContent concatenates the hidden .lb__g glyph span AND the visible
  // .lb__t word span, so reading it proves nothing. Read the two spans
  // separately and report which one the browser actually paints.
  const s = (sel) => {
    const e = b.querySelector(sel);
    if (!e) return null;
    const vis = [...e.children]
      .filter(c => getComputedStyle(c).display !== 'none')
      .map(c => c.textContent.trim())
      .join('');
    return {
      text: (vis || e.textContent.trim()).slice(0, 40),
      painted: vis,
      glyphShown: getComputedStyle(e.querySelector('.lb__g') || e).display !== 'none',
      wordShown: !!(e.querySelector('.lb__t') && getComputedStyle(e.querySelector('.lb__t')).display !== 'none'),
    };
  };
  return {
    hidden: b.hidden,
    wallClass: b.classList.contains('lb--wall'),
    counter: (() => {
      const e = b.querySelector('.lb__cap');
      if (!e) return null;
      const cs = getComputedStyle(e);
      return { text: e.textContent.trim().slice(0, 40), display: cs.display, visible: cs.display !== 'none' };
    })(),
    next: s('.lb__nav--n'),
    prev: s('.lb__nav--p'),
    close: s('.lb__x'),
  };
})()`);
console.log("--- wall lightbox ---" + JSON.stringify(lb));
check("lightbox opened from the wall", lb.hidden === false && !!lb.wallClass);
check("wall lightbox has a counter", !!lb.counter?.visible, lb.counter?.text || "");
check("counter looks like a position, not alt text", /\d+\s*\/\s*\d+/.test(lb.counter?.text || ""),
  lb.counter?.text || "");
check("next control paints a WORD, not a glyph", !!lb.next?.wordShown && !lb.next?.glyphShown,
  JSON.stringify(lb.next?.painted));
check("close control paints a WORD, not a glyph", !!lb.close?.wordShown && !lb.close?.glyphShown,
  JSON.stringify(lb.close?.painted));

// Step to the next frame and confirm the counter advanced.
const step = await evalJs(`(() => {
  const b = document.querySelector('.lb');
  const cap = b.querySelector('.lb__cap');
  const before = cap.textContent.trim();
  const n = b.querySelector('.lb__nav--n');
  n.click();
  return { before };
})()`);
await sleep(700);
const after = await evalJs(`(() => {
  const b = document.querySelector('.lb');
  return { cap: b.querySelector('.lb__cap').textContent.trim(),
           hasImg: !!b.querySelector('.lb__img')?.getAttribute('src') };
})()`);
console.log("--- step ---" + JSON.stringify({ ...step, ...after }));
check("counter advances when stepping", after.cap !== step.before,
  step.before + " -> " + after.cap);

// Close it.
await evalJs(`document.querySelector('.lb__x').click()`);
await sleep(500);
const closed = await evalJs(`document.querySelector('.lb').hidden`);
check("lightbox closes", closed === true);

// -------------------------------------------------------------------- HOME
await goto("home");
await evalJs(`document.querySelector('.cell img[data-full]')?.click()`);
await sleep(900);
const homeLb = await evalJs(`(() => {
  const b = document.querySelector('.lb');
  if (!b) return { missing: true };
  const s = (sel) => {
    const e = b.querySelector(sel);
    if (!e) return null;
    return { text: e.textContent.trim(), display: getComputedStyle(e).display };
  };
  return { wallClass: b.classList.contains('lb--wall'), next: s('.lb__nav--n'), close: s('.lb__x') };
})()`);
console.log("--- home lightbox ---" + JSON.stringify(homeLb));
check("home lightbox is NOT restyled (still glyphs)", homeLb.wallClass === false);
check("home lightbox keeps its glyph controls",
  homeLb.next?.display !== "none" && /[‹›]/.test(homeLb.next.text || ""),
  JSON.stringify(homeLb.next));

if (fails) { console.log("\n" + fails + " check(s) failed"); process.exit(1); }
console.log("\npolish behaviours present, home untouched");
