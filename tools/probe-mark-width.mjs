/**
 * Measure the wordmark's two words so the lockup can be tuned by numbers
 * instead of by eye.
 *
 * The goal: the small word's optical width should MATCH the big word below it.
 * That shared measure is what makes the two read as one considered lockup
 * instead of a caption stacked on a title — which is how the reference sets
 * its own wordmark.
 *
 * Run: node tools/probe-mark-width.mjs <baseUrl>
 */
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/\/$/, "");

const t = await (
  await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })
).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pend = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pend.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const ev = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true })).result
    ?.result?.value;

await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });

for (const w of [390, 1440]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: 900,
    deviceScaleFactor: 1,
    mobile: w < 700,
  });
  await send("Page.navigate", { url: `${BASE}/#/home` });
  await new Promise((r) => setTimeout(r, 2200));

  const v = await ev(`(() => {
    const sm = document.querySelector('.logo-sm');
    const lg = document.querySelector('.logo-lg--b');
    if (!sm || !lg) return { err: 'markup missing' };
    // clientWidth excludes the transform; use the layout box for measurement.
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) };
    };
    const cs = getComputedStyle(sm);
    return {
      sm: box(sm),
      lg: box(lg),
      smFS: cs.fontSize,
      smLS: cs.letterSpacing,
      delta: box(sm).w - box(lg).w,
      // How far the two left edges differ — should be 0.
      leftDelta: box(sm).left - box(lg).left,
    };
  })()`);
  if (!v || v.err) {
    console.log(`w${w}  ${v?.err ?? "no result"}`);
    continue;
  }
  // Within 6px counts as aligned at this size.
  const aligned = Math.abs(v.delta) <= 6 && Math.abs(v.leftDelta) <= 1;
  console.log(
    `${aligned ? "ok  " : "CHECK"}  w${w}  sm=${v.sm.w}px lg=${v.lg.w}px ` +
      `delta=${v.delta} leftDelta=${v.leftDelta} fs=${v.smFS} ls=${v.smLS}`,
  );
}

await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
ws.close();
