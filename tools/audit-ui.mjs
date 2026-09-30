/**
 * Full-matrix UI audit: every route x every viewport, checked for the things
 * that make a site feel broken on a phone.
 *
 * Run: node tools/audit-ui.mjs <baseUrl>
 * Needs Chrome on CDP_PORT (default 9222) with a fresh --user-data-dir.
 *
 * This exists because the first mobile pass screenshotted 5 of 13 route/
 * viewport combinations and shipped a clipped header in the other 8.
 */
import { mkdirSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const OUT = process.argv[3] ?? "shots/audit";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const COMBOS = [];
for (const w of [320, 360, 390, 414, 768, 1024, 1440]) {
  for (const route of ["", "#/pricing", "#/contact"]) {
    COMBOS.push({ w, route, tag: `w${w}${route || "-photo"}` });
  }
}

// Everything measurable about one rendered page, in a single round-trip.
const AUDIT = `(() => {
  const de = document.documentElement;
  const vw = window.innerWidth;

  // Horizontal overflow: which element actually sticks out past the viewport.
  const wide = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      wide.push({
        sel: el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
          ? "." + el.className.trim().split(/\\s+/).join(".") : ""),
        left: Math.round(r.left), right: Math.round(r.right),
      });
    }
  }

  // Clipped chrome: content wider than its own box (the header bug).
  const clipped = [...document.querySelectorAll(".logo, .nav-link, .site-header *, .logo-row, .site-nav, .site-social")]
    .filter(e => e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0)
    .map(e => e.className || e.tagName);

  // Touch targets under 44px. Width is only a problem for square/icon
  // targets — a text link that is 33px wide and 44px tall is perfectly
  // tappable, because the finger lands on the text. Icon-only controls
  // (the .social links) are the ones that genuinely need a 44px WIDTH.
  const small = [];
  for (const el of document.querySelectorAll("a,button,input,select,textarea")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // A full-width or text link is tappable at any width; the 44px rule is
    // about the SHORT axis (height), plus width for icon-only controls. The
    // logo is a text link to "/", so width never applies to it either.
    const isTextLink = el.tagName === "A" && el.textContent.trim().length > 0;
    const badH = r.height < 44;
    const badW = r.width < 44 && !isTextLink;
    if (badH || badW) {
      small.push((el.className || el.tagName) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    }
  }

  // Text clipped by its own container.
  const textClip = [];
  for (const el of document.querySelectorAll("h1,h2,h3,p,li,td,th,label,span,a,button")) {
    if (el.children.length) continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      textClip.push((el.className || el.tagName) + ": " + (el.textContent || "").trim().slice(0, 40));
    }
  }

  return {
    vw,
    scrollW: de.scrollWidth,
    docOverflow: de.scrollWidth - vw,
    wide: wide.slice(0, 6),
    clipped: clipped.slice(0, 6),
    small: small.slice(0, 8),
    smallCount: small.length,
    textClip: textClip.slice(0, 6),
    pageScrolls: de.scrollHeight > window.innerHeight + 20,
    imgs: document.querySelectorAll("img").length,
    // A hidden <img> needs no alt (it is not exposed until opened), and an
    // explicit alt="" is the CORRECT markup for a decorative image. Only flag
    // an image that is actually visible with genuinely missing alt text.
    imgsNoAlt: [...document.querySelectorAll("img")].filter(i => {
      if (i.getAttribute("alt") === null) return true;          // attribute absent
      if (i.alt.trim()) return false;                            // has real text
      const r = i.getBoundingClientRect();
      const hidden = i.closest("[hidden]") || r.width === 0 || r.height === 0;
      return !hidden;                                            // alt="" but VISIBLE
    }).length,
    inputs: document.querySelectorAll("input,select,textarea").length,
    title: document.title,
  };
})()`;

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");

let fails = 0;
const rows = [];

for (const c of COMBOS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: c.w, height: 900, deviceScaleFactor: 1, mobile: c.w < 700,
  });
  await send("Page.navigate", { url: BASE + "/" + c.route });
  await sleep(1400);
  const a = await evaluate(AUDIT);
  if (!a) { console.log("FAIL  " + c.tag + " — no evaluation"); fails++; continue; }

  const problems = [];
  if (a.docOverflow > 0) problems.push("overflow " + a.docOverflow + "px " + JSON.stringify(a.wide));
  if (a.clipped.length) problems.push("clipped " + JSON.stringify(a.clipped));
  if (a.smallCount) problems.push("smallTargets " + a.smallCount + " " + JSON.stringify(a.small));
  if (a.textClip.length) problems.push("textClip " + JSON.stringify(a.textClip));
  if (a.imgsNoAlt) problems.push("imgsNoAlt " + a.imgsNoAlt);

  if (problems.length) fails++;
  rows.push({ tag: c.tag, problems });
  console.log((problems.length ? "FAIL  " : "ok    ") + c.tag +
    "  (imgs " + a.imgs + ", inputs " + a.inputs + ")" +
    (problems.length ? "\n        " + problems.join("\n        ") : ""));
}

console.log("\n" + (COMBOS.length - fails) + "/" + COMBOS.length + " route/viewport combos clean");
ws.close();
