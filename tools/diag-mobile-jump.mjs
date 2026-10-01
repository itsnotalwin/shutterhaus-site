/**
 * Reproduce the mobile "flash white, jump to top" bug and identify the cause.
 *
 *   CDP_PORT=9334 node tools/diag-mobile-jump.mjs [baseUrl]
 *
 * Alwin, 2026-10-01: "I have this issue on mobile where when I'm scrolling
 * through the website on any page it will flash white and take me back to top".
 * He asked WHY before any fix, so this only measures and reports.
 *
 * Emulates a phone, scrolls like a finger (Input.synthesizeScrollGesture, not
 * window.scrollTo, because a programmatic jump is not what a finger does), and
 * records every event that could reset the position:
 *   - hashchange / popstate -> paint() -> scrollTo(0,0)
 *   - a resize, which on a phone fires every time the URL bar collapses
 *   - a scroll event landing back at 0
 *   - the document being blank at any point (the white flash)
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
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); return; }
  if (msg.method === "Runtime.consoleAPICalled") {
    events.push({ t: Date.now(), k: "console", v: msg.params.type });
  }
  if (msg.method === "Runtime.exceptionThrown") {
    events.push({ t: Date.now(), k: "exception",
      v: msg.params.exceptionDetails?.exception?.description?.slice(0, 120) || "?" });
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => {
  const i = ++id;
  return new Promise((res) => { waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
};
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await send("Page.enable", {});
await send("Runtime.enable", {});
await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });
// A phone: mobile=true enables the meta-viewport and the URL-bar behaviour that
// the desktop emulation does not reproduce.
await send("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

// Instrument the page BEFORE it runs: log every event that could reset scroll.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__diag = { resets: [], hashAt: location.hash, blanks: 0 };
  addEventListener("hashchange", () => {
    window.__diag.resets.push({ why: "hashchange", hash: location.hash, y: Math.round(scrollY) });
  });
  addEventListener("popstate", () => {
    window.__diag.resets.push({ why: "popstate", y: Math.round(scrollY) });
  });
  addEventListener("resize", () => {
    window.__diag.resets.push({ why: "resize", h: innerHeight, y: Math.round(scrollY) });
  });
  // A scroll that lands back at the very top after having moved is the symptom.
  let moved = false, lastY = 0;
  addEventListener("scroll", () => {
    const y = Math.round(scrollY);
    if (y > 40) { moved = true; lastY = y; }
    else if (moved && y === 0) {
      window.__diag.resets.push({ why: "backToTop", from: lastY });
      moved = false;
    }
  }, { passive: true });
`});

for (const route of ["home", "portfolio", "services"]) {
  events.length = 0;
  await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/" + route });
  await sleep(3000);

  const before = await evalJs(`({ y: Math.round(scrollY), h: document.documentElement.scrollHeight,
                                blank: document.body.innerText.trim().length === 0 })`);
  // Scroll like a finger, in steps, the way a thumb does.
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await send("Input.synthesizeScrollGesture", {
      x: 195, y: 500, xDistance: 0, yDistance: -600, speed: 1600, gestureSourceType: "touch",
    });
    await sleep(700);
    samples.push(await evalJs(`Math.round(scrollY)`));
  }
  const diag = await evalJs(`window.__diag`);
  const blankNow = await evalJs(`document.body.innerText.trim().length === 0`);

  console.log(`\n--- #/${route} ---`);
  console.log("  scrollY samples :", JSON.stringify(samples));
  console.log("  page height     :", before.h);
  console.log("  blank at load   :", before.blank, " blank now:", blankNow);
  console.log("  resets          :", JSON.stringify(diag?.resets ?? []).slice(0, 400));
  console.log("  page errors     :", events.filter(e => e.k === "exception").length);
}
console.log("\nReport only — no fix applied.");
