/**
 * Every heading must have breathing room under it.
 *
 *   CDP_PORT=9334 node tools/probe-heading-gaps.mjs [baseUrl]
 *
 * Two pages shipped a heading hard against the first line beneath it:
 *
 *   #/about     "Photography Is Poetry." — margin-bottom computed 0px, gap 0,
 *               at BOTH 390 and 1440. The rule said 32px.
 *   #/services  "Add-ons" and "Booking terms" — no rule existed at all, so both
 *               inherited `.page h2 { margin: 0 }`. Gap 0 under a 24px heading.
 *
 * Cause in both cases: a class-specific rule losing to `.page h1` / `.page h2`
 * (0,1,1) because the specific rule was 0,1,0. The stylesheet already warns
 * about this in two comments, which is a good sign it was a known trap that was
 * simply re-entered.
 *
 * This asserts the computed margin AND the real gap to the next element, at
 * both widths, because a rule can declare a margin that never wins.
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

// Minimum readable gap under a heading, scaled to the heading's own size.
//
// 0.2 of the font size, floored at 12px. The first version used 0.35 and failed
// the locked home hero: "Timeless Portraiture" is 132px with a 34px gap, which
// is 0.26 — perfectly readable, and the page is protected by HOME-LOCKED.md.
// Tightening a threshold until it condemns correct, locked design is the same
// mistake as writing a test to fit the implementation. 0.2 catches the real
// defect (gap 0) without that.
const minGapFor = (fontSizePx) => Math.max(12, Math.round(Number(fontSizePx) * 0.2));

let fails = 0;
const check = (name, pass, detail = "") => {
  if (pass) { console.log("ok    " + name + (detail ? "  (" + detail + ")" : "")); return; }
  fails++;
  console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
};

// Minimum readable gap under a heading, scaled to the heading's own size.
//
// 0.2 of the font size, floored at 12px. The first version used 0.35 and failed
// the locked home hero: "Timeless Portraiture" is 132px with a 34px gap, which
// is 0.26 — perfectly readable, and the page is protected by HOME-LOCKED.md.
// Tightening the threshold until it condemns correct, locked design is the same
// mistake as writing a test to fit the implementation. 0.2 catches the real
// defect (gap 0) without that.

for (const [w, h] of [[1440, 900], [390, 844]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  for (const route of ["home", "portfolio", "about", "services", "contact"]) {
    await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/" + route });
    await sleep(2400);
    const r = await evalJs(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('.page h1, .page h2, .hero__h')) {
        const cs = getComputedStyle(el);
        const nxt = el.nextElementSibling;
        if (!nxt) continue;
        // A hidden next sibling means this heading is the last visible thing on
        // its side (the portfolio lede is display:none by design) — no gap needed.
        if (getComputedStyle(nxt).display === 'none') continue;
        const gap = Math.round(nxt.getBoundingClientRect().top - el.getBoundingClientRect().bottom);
        out.push({
          text: el.textContent.trim().slice(0, 26),
          fontSize: parseFloat(cs.fontSize),
          marginBottom: cs.marginBottom,
          gap,
        });
      }
      return out;
    })()`);
    for (const x of r) {
      const need = minGapFor(x.fontSize);
      check(`${w} #/${route} "${x.text}" has room under it (>=${need}px)`,
        x.gap >= need, `${x.gap}px gap, margin-bottom ${x.marginBottom}`);
    }
  }
}

if (fails) { console.log("\n" + fails + " check(s) failed"); process.exit(1); }
console.log("\nevery heading has breathing room beneath it");
