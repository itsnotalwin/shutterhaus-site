/**
 * The contact page: the detail icons must be small, and the page must be short.
 *
 *   CDP_PORT=9334 node tools/probe-contact-detail.mjs [baseUrl]
 *
 * Two real defects, both from markup classes that had no CSS rule at all:
 *
 *  1. `.cico` — `icon()` emits <svg class="cico" viewBox="0 0 24 24"> with a
 *     comment calling them "tiny inline glyphs", and no stylesheet mentioned the
 *     class. An <svg> with a viewBox and no width/height is a replaced element
 *     that sizes to 100% of its containing block, so the pin filled a whole
 *     screen, then the envelope, then the phone, then WhatsApp.
 *     Measured: .contact__list was 1616px tall for four items.
 *
 *  2. `.contact__fig` — no rule either. The figure reserved a box from the
 *     inline aspect-ratio but nothing bounded the image, and on a phone, where
 *     the grid collapses to one column and the figure drops below the form, it
 *     reserved ~411px of often-blank page.
 *
 * This asserts the SYMPTOM rather than the absence of a selector, because a
 * "class has no rule" check is far too noisy to gate on: it flags every class
 * styled through a compound selector (.shell.is-bw, .pkg.pop) and every
 * structural marker. An icon being 18px is a fact worth asserting; "no
 * stylesheet contains the substring cico" is not.
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

let fails = 0;
const check = (name, pass, detail = "") => {
  if (pass) { console.log("ok    " + name + (detail ? "  (" + detail + ")" : "")); return; }
  fails++;
  console.log("FAIL  " + name + (detail ? "  (" + detail + ")" : ""));
};

for (const [w, h, label] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  await send("Page.navigate", { url: url + "/?nocache=" + Date.now() + "/#/contact" });
  await sleep(2600);

  const r = await evalJs(`(() => {
    const list = document.querySelector('.contact__list');
    const cicos = [...document.querySelectorAll('.cico')].map(s => {
      const b = s.getBoundingClientRect();
      const cs = getComputedStyle(s);
      return { w: Math.round(b.width), h: Math.round(b.height), fill: cs.fill,
               stroked: cs.stroke !== 'none' };
    });
    const fig = document.querySelector('.contact__fig');
    const hours = document.querySelector('.contact__hours');
    return {
      listH: Math.round(list.getBoundingClientRect().height),
      cicos,
      cicoCount: cicos.length,
      figH: fig ? Math.round(fig.getBoundingClientRect().height) : 0,
      docH: document.documentElement.scrollHeight,
      vh: innerHeight,
      blankAfter: hours ? document.documentElement.scrollHeight - Math.round(hours.getBoundingClientRect().bottom + scrollY) : 0,
      links: [...document.querySelectorAll('.contact__list a')].length,
    };
  })()`);

  console.log(`--- ${label} ${w} --- ` + JSON.stringify(r));
  check(`${label}: 4 detail icons present`, r.cicoCount === 4, String(r.cicoCount));
  const big = r.cicos.filter((c) => c.w > 24 || c.h > 24);
  check(`${label}: every icon is small (<=24px)`, big.length === 0,
    r.cicos.map((c) => c.w + "x" + c.h).join(" "));
  check(`${label}: the detail list is a sane height`, r.listH > 0 && r.listH < 320,
    r.listH + "px (was 1616px)");
  check(`${label}: 3 contact links (email, phone, WhatsApp)`, r.links === 3, String(r.links));
  // On a phone the figure is decoration and must not dominate the form.
  if (w < 700) {
    check(`phone: the figure is bounded, not a screen of blank`, r.figH <= h * 0.45,
      r.figH + "px");
    check(`phone: page is not padded out with blank space`, r.blankAfter < h * 0.6,
      r.blankAfter + "px after the last line");
  }
}

if (fails) { console.log("\n" + fails + " check(s) failed"); process.exit(1); }
console.log("\ncontact details render at the right size");
