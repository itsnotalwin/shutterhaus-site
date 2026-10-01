/**
 * Every mobile-menu link must be VISIBLE, not merely present in the DOM.
 *
 *   CDP_PORT=9334 node tools/probe-menu-visible.mjs [baseUrl]
 *
 * Alwin, 2026-10-01: "when I open the menu in portfolio it doesnt show same
 * things as home". It did not: all five links were in the DOM the whole time, but
 * the drawer had no z-index, so on every route except home the page painted over
 * it. `document.elementFromPoint` at the centre of the "About" link returned an
 * <img class="is-loaded"> — the photo grid was covering the menu, and only the
 * first two links were visible because they happened to sit over white space.
 *
 * This asserts, per link: it is in the DOM, it has a box, the element actually
 * PAINTED at its centre is the link, and it is inside the viewport. Counting
 * `.nav-link` elements cannot catch this class of bug at all.
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
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

let fails = 0;
const check = (name, pass, detail = "") => {
  if (pass) { console.log("ok    " + name + (detail ? "  (" + detail + ")" : "")); return; }
  fails++;
  console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
};

for (const route of ["home", "portfolio", "about", "services", "contact"]) {
  await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/" + route });
  await sleep(2800);
  await evalJs(`document.querySelector('.burger')?.click()`);
  await sleep(500);

  const r = await evalJs(`(() => {
    const nav = document.querySelector('.site-nav');
    const links = [...nav.querySelectorAll('.nav-link')];
    return {
      open: nav.classList.contains('is-open'),
      navZ: getComputedStyle(nav).zIndex,
      links: links.map(a => {
        const b = a.getBoundingClientRect();
        const top = document.elementFromPoint(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2));
        return {
          text: a.textContent.trim(),
          hasBox: b.width > 0 && b.height > 0,
          inViewport: b.top >= -2 && b.bottom <= innerHeight + 2,
          painted: !!top && (top === a || a.contains(top)),
          coveredBy: top && !(top === a || a.contains(top))
            ? (top.className || top.tagName) : null,
        };
      }),
    };
  })()`);

  const hidden = r.links.filter((l) => !l.hasBox || !l.painted || !l.inViewport);
  console.log(`--- #/${route} --- open=${r.open} z=${r.navZ} ` +
    r.links.map((l) => `${l.text}${l.painted ? "" : "[HIDDEN]"}`).join(" "));
  check(`#/${route}: drawer opened`, r.open);
  check(`#/${route}: 5 links in the DOM`, r.links.length === 5, String(r.links.length));
  check(`#/${route}: every link is actually PAINTED, not covered`, hidden.length === 0,
    hidden.map((l) => `${l.text} covered by ${l.coveredBy}`).join("; "));
}

if (fails) { console.log("\n" + fails + " check(s) failed"); process.exit(1); }
console.log("\nevery menu link is visible on every route");
