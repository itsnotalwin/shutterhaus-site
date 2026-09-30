/**
 * The wordmark must stay TWO lines: "SHUTTERHAUS" above "VISUALS".
 *
 * This regressed silently once. A tap-target pass added a second `.logo` rule
 * with `display: inline-flex`; flex lays the two spans out as ROW items, so
 * the stacked wordmark collapsed to a single line. Nothing errored, every
 * test passed, and the brand lockup was just… wrong.
 *
 * Run: node tools/check-wordmark.mjs <baseUrl>
 */
const BASE = (process.argv[2] ?? "http://127.0.0.1:4173").replace(/$/, "");
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pend.has(msg.id)) { pend.get(msg.id)(msg); pend.delete(msg.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pend.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
await send("Page.enable");
await send("Runtime.enable");

let fails = 0;
for (const w of [390, 1440]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 });
  await send("Page.navigate", { url: BASE + "/" });
  await sleep(2200);
  const r = await send("Runtime.evaluate", {
    expression: `(() => {
      const logo = document.querySelector(".logo");
      if (!logo) return { err: "no .logo" };
      const row = logo.querySelector(".logo-row");
      const second = logo.querySelector(".logo-lg--b");
      const R = (e) => { const b = e.getBoundingClientRect(); return { t: Math.round(b.top), l: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) }; };
      const cs = getComputedStyle(logo);
      return {
        text: logo.innerText.replace(/\\s+/g, " ").trim(),
        display: cs.display,
        logo: R(logo), row: R(row), second: R(second),
        // The second word must start BELOW the first row, not beside it.
        stacked: R(second).t >= R(row).t + R(row).h - 4,
        // AND the first word must be ON SCREEN. A centred grid plus a
        // min-height taller than its content once pushed .logo-sm above the
        // viewport top at 390px — "SHUTTERHAUS" vanished and only "VISUALS"
        // showed. A stacking check cannot see a clipping bug.
        onScreen: R(row).t >= 0,
        target: Math.round(logo.getBoundingClientRect().height),
      };
    })()`,
    returnByValue: true,
  });
  const v = r.result?.result?.value;
  if (!v || v.err) { console.log("FAIL  w" + w + "  " + (v?.err ?? "no result")); fails++; continue; }
  const okStack = v.stacked;
  const okTap = v.target >= 44;
  const okText = /SHUTTERHAUS/i.test(v.text) && /VISUALS/i.test(v.text);
  const okOn = v.onScreen;
  const line = okStack && okTap && okText && okOn ? "ok  " : "FAIL";
  if (line === "FAIL") fails++;
  console.log(
    `${line}  w${w}  display=${v.display}  text="${v.text}"  ` +
    `rowTop=${v.row.t} 2ndTop=${v.second.t} stacked=${okStack} ` +
    `onScreen=${okOn} tapH=${v.target}`,
  );
}
ws.close();
console.log(fails === 0 ? "\nwordmark intact: two lines, correct text, 44px target" : `\n${fails} wordmark failure(s)`);
process.exit(fails === 0 ? 0 : 1);
