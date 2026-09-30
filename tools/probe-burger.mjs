/**
 * Mobile nav drawer: opens, closes on link click, and closes on Escape.
 *
 * The drawer is `visibility: hidden` rather than `display: none` so it can
 * animate — which means "hidden" is a computed-style question, not the
 * offsetParent one. This asserts the actual visible state, plus that a route
 * change through the drawer leaves it closed.
 *
 * Run: CDP_PORT=9333 node tools/probe-burger.mjs <baseUrl>
 */
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = await (await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })).json();
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
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.text);
  }
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
});
await send("Page.navigate", { url: process.argv[2] + "/#/home" });
await sleep(2500);

const STATE = `(() => {
  const n = document.querySelector(".site-nav");
  const b = document.querySelector(".burger");
  const cs = getComputedStyle(n);
  return {
    visible: cs.visibility === "visible" && parseFloat(cs.opacity) > 0.5,
    expanded: b.getAttribute("aria-expanded"),
    links: n.querySelectorAll("a").length,
    hash: location.hash,
  };
})()`;

let fails = 0;
const ok = (label, cond, detail) => {
  if (!cond) fails++;
  console.log(`${cond ? "ok  " : "FAIL"}  ${label}  ${detail ?? ""}`);
};

// Single row: burger must share the header row with the logo, not wrap below.
const row = await ev(`(() => {
  const l = document.querySelector(".logo").getBoundingClientRect();
  const b = document.querySelector(".burger").getBoundingClientRect();
  return Math.abs(l.top - b.top) < 12;
})()`);
ok("burger shares the header row", row, `logoTop vs burgerTop`);

const closed = await ev(STATE);
ok("drawer starts closed", closed.visible === false, JSON.stringify(closed.visible));
ok("burger reports collapsed", closed.expanded === "false", String(closed.expanded));
ok("all five links present", closed.links === 5, String(closed.links));

await ev(`document.querySelector(".burger").click()`);
await sleep(400);
const open = await ev(STATE);
ok("drawer opens", open.visible === true, JSON.stringify(open.visible));
ok("burger reports expanded", open.expanded === "true", String(open.expanded));

// Tapping a link must navigate AND close, or the panel hangs over the page.
await ev(`document.querySelectorAll(".site-nav a")[1].click()`);
await sleep(900);
const afterNav = await ev(STATE);
ok("link navigates", afterNav.hash === "#/portfolio", afterNav.hash);
ok("drawer closes after nav", afterNav.visible === false, JSON.stringify(afterNav.visible));

await ev(`document.querySelector(".burger").click()`);
await sleep(300);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
await sleep(300);
const afterEsc = await ev(STATE);
ok("Escape closes the drawer", afterEsc.visible === false, JSON.stringify(afterEsc.visible));

ws.close();
console.log(fails === 0 ? "\nburger: all checks pass" : `\n${fails} burger failure(s)`);
process.exit(fails === 0 ? 0 : 1);
