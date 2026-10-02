/**
 * Verify the two suspected CSS defects against the LIVE site, with numbers.
 *
 *  1. `.eyebrow--inv` — used on the dark Investment band. If it has no rule, it
 *     inherits `.eyebrow { color: var(--ink) }` = #111 onto background #0d0d0d.
 *     Measure the actual painted foreground/background and the WCAG ratio.
 *  2. `.pkg--pop` — the "popular" tier. If it has no rule, the recommended
 *     package is pixel-identical to the others. Compare computed styles of a
 *     popular card against a normal one.
 *
 * Run: node tools/audit2-verify-bugs.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9600 + Math.floor(Math.random() * 300);
const URL_ = "https://shutterhausvisuals.co.za/services";

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--hide-scrollbars",
  "--disable-gpu", "--no-first-run",
  `--user-data-dir=${fileURLToPath(new URL(".", import.meta.url))}..\\audit2-chrome-profile-v`,
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
await S("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await S("Page.navigate", { url: URL_ });
await sleep(3500);

const EXPR = `(() => {
  const rgb = s => { const m = s.match(/[\\d.]+/g); return m ? m.slice(0,3).map(Number) : null; };
  const lum = c => { const f = c.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
  const ratio = (a,b) => { const l1 = lum(a), l2 = lum(b);
    return +(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))).toFixed(2); };
  // walk up for the first non-transparent background
  const bgOf = el => { let n = el;
    while (n && n !== document.documentElement) {
      const b = getComputedStyle(n).backgroundColor;
      if (b && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(b)) return b;
      n = n.parentElement; }
    return getComputedStyle(document.body).backgroundColor; };

  const inv = document.querySelector('.eyebrow--inv');
  const invest = document.querySelector('.invest');
  const label = inv ? {
    found: true,
    text: inv.textContent.trim(),
    color: getComputedStyle(inv).color,
    background: bgOf(inv),
    fontSize: getComputedStyle(inv).fontSize,
    rect: (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(inv.getBoundingClientRect()),
    ratio: ratio(rgb(getComputedStyle(inv).color), rgb(bgOf(inv))),
    // is it actually painted, or invisible against its backdrop?
    effectivelyInvisible: ratio(rgb(getComputedStyle(inv).color), rgb(bgOf(inv))) < 1.5,
  } : { found: false };

  // does .invest__label (the rule that DOES exist) match anything in the DOM?
  const deadLabelRule = { inDom: document.querySelectorAll('.invest__label').length };

  const cards = [...document.querySelectorAll('.pkg')].map(c => {
    const s = getComputedStyle(c);
    const r = c.getBoundingClientRect();
    return { cls: c.className, popular: c.classList.contains('pkg--pop'),
      name: c.querySelector('.pkg__name')?.textContent.trim().slice(0,28),
      border: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor,
      bg: s.backgroundColor, outline: s.outlineWidth + ' ' + s.outlineStyle,
      shadow: s.boxShadow === 'none' ? 'none' : s.boxShadow.slice(0,40),
      transform: s.transform, order: s.order, filter: s.filter,
      h: Math.round(r.height) };
  });
  const pop = cards.find(c => c.popular);
  const norm = cards.find(c => !c.popular);
  const identical = pop && norm && JSON.stringify({...pop, cls:0, name:0}) === JSON.stringify({...norm, cls:0, name:0});

  return { label, deadLabelRule, cards, popularCount: cards.filter(c=>c.popular).length,
           popularIsPixelIdenticalToNormal: !!identical };
})()`;

const r = await S("Runtime.evaluate", { returnByValue: true, expression: EXPR });
const d = r.result.value;

console.log("\n=== BUG 1: .eyebrow--inv on the dark Investment band ===");
console.log(JSON.stringify(d.label, null, 2));
console.log("  .invest__label elements actually in the DOM:", d.deadLabelRule.inDom);

console.log("\n=== BUG 2: .pkg--pop (the 'popular' tier) ===");
console.table(d.cards);
console.log("  cards marked popular:", d.popularCount);
console.log("  popular card is pixel-identical to a normal card:", d.popularIsPixelIdenticalToNormal);

ws.close(); chrome.kill(); process.exit(0);