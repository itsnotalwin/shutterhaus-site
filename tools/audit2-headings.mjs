/**
 * Measure the mid-word heading break seen on the live home page, and sweep
 * EVERY heading on EVERY route for the same class of defect.
 *
 * A mid-word break is visible when a heading box scrolls wider than its client
 * box (overflow-wrap:anywhere letting a word break) or when a word is wider
 * than the line it sits on. We measure the longest single word at the rendered
 * font-size and compare it against the available inline space, which tells us
 * the exact font-size at which the word would fit on one line.
 *
 * Run: node tools/audit2-headings.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9500 + Math.floor(Math.random() * 400);
const ORIGIN = "https://shutterhausvisuals.co.za";
const ROUTES = ["", "portfolio", "about", "services", "contact"];
const WIDTHS = [320, 393, 430];

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--hide-scrollbars",
  "--disable-gpu", "--no-first-run",
  `--user-data-dir=${fileURLToPath(new URL(".", import.meta.url))}..\\audit2-chrome-profile-h`,
  "about:blank",
], { stdio: "ignore" });

let wsUrl;
for (let i = 0; i < 60; i++) {
  try {
    const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    if (j.webSocketDebuggerUrl) { wsUrl = j.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) {
    const p = pending.get(x.id); pending.delete(x.id);
    x.error ? p.reject(new Error(JSON.stringify(x.error))) : p.resolve(x.result);
  }
};
const send = (m, p = {}, s) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method: m, params: p, sessionId: s }));
});
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable"); await S("Runtime.enable");

// A FUNCTION taking the element, so it can be .map()ped over the headings.
const EXPR = `(el) => {
  const c = getComputedStyle(el);
  const measureWord = (word) => {
    const probe = document.createElement('span');
    probe.textContent = word;
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:pre;visibility:hidden';
    probe.style.font = c.font;
    probe.style.letterSpacing = c.letterSpacing;
    probe.style.textTransform = c.textTransform;
    probe.style.fontFamily = c.fontFamily;
    probe.style.fontSize = c.fontSize;
    probe.style.fontWeight = c.fontWeight;
    (el.parentElement || document.body).appendChild(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  };
  const box = el.getBoundingClientRect();
  const padL = parseFloat(c.paddingLeft) + parseFloat(c.paddingRight);
  const words = (el.textContent || '').trim().split(/\\s+/);
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '');
  const wordW = measureWord(longest);
  const avail = box.width - padL;
  return {
    tag: el.tagName,
    cls: el.className || '',
    text: (el.textContent || '').trim().slice(0, 46),
    fontPx: parseFloat(c.fontSize),
    boxW: Math.round(box.width),
    availW: Math.round(avail),
    longestWord: longest,
    wordNeeds: Math.round(wordW),
    // >1 means the longest word cannot sit on one line -> it will break mid-word
    ratio: +(wordW / Math.max(avail, 1)).toFixed(3),
    overflowsBox: el.scrollWidth > el.clientWidth + 1,
    wrapAnywhere: /anywhere/.test(c.overflowWrap + c.wordBreak),
    tracking: c.letterSpacing,
    // the font-size at which the longest word would just fit the available width
    fontToFit: +(parseFloat(c.fontSize) * (avail / wordW)).toFixed(1),
  };
}`;

const rows = [];
for (const width of WIDTHS) {
  await S("Emulation.setDeviceMetricsOverride", { width, height: 852, deviceScaleFactor: 2, mobile: true });
  for (const route of ROUTES) {
    await S("Page.navigate", { url: `${ORIGIN}/${route}` });
    await sleep(2800);
    const r = await S("Runtime.evaluate", {
      returnByValue: true,
      expression: `[...document.querySelectorAll('h1,h2,h3,.hero__h,.phead__h,.hero__meta')].map(${EXPR})`,
    });
    for (const h of r.result.value) rows.push({ w: width, route: route || "home", ...h });
  }
}

// Anything whose longest word needs more room than it has = mid-word break risk.
const bad = rows.filter((r) => r.ratio > 1);
console.log(`\nHeadings measured: ${rows.length}. Mid-word-break risks: ${bad.length}\n`);
for (const b of bad) {
  console.log(`  [${b.w}px] /${b.route}  ${b.tag}.${b.cls}`);
  console.log(`      "${b.text}"`);
  console.log(`      longest word "${b.longestWord}" needs ${b.wordNeeds}px, has ${b.availW}px  (ratio ${b.ratio})`);
  console.log(`      font-size now ${b.fontPx}px -> would fit at ${b.fontToFit}px   wrap:${b.wrapAnywhere} tracking:${b.tracking}`);
}
const ok = rows.filter((r) => r.ratio <= 1);
console.log(`\nClean headings: ${ok.length}`);

writeFileSync(
  fileURLToPath(new URL("../audit-v2/headings.json", import.meta.url)).replace(/\//g, "\\"),
  JSON.stringify(rows, null, 2),
);
ws.close(); chrome.kill(); process.exit(0);