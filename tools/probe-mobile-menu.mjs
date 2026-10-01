/**
 * The mobile drawer, measured: are all five links actually readable?
 *
 *   CDP_PORT=9334 node tools/probe-mobile-menu.mjs [baseUrl]
 *
 * Alwin, 2026-10-01: "menu isnt showing all pages properly on mobile only home
 * page". All five links are in SITE.nav, so the suspicion is not a missing link
 * but an INVISIBLE one: the home page is the only route rendered with
 * `shell--over`, which recolours .nav-link white, while the mobile drawer paints
 * `background: var(--paper)` — white. White on white.
 *
 * This computes the actual contrast of each link against the drawer it sits in,
 * on every route, rather than trusting a selector reading. WCAG relative
 * luminance is used so the number means the same thing as any other contrast
 * figure, and 3:1 is the threshold for large/bold text and UI boundaries
 * (WCAG 1.4.11); 4.5:1 is the body-text threshold.
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
await send("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
});
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

  // Open the drawer the way a finger would: tap the burger.
  await evalJs(`document.querySelector('.burger')?.click()`);
  await sleep(500);

  const m = await evalJs(`(() => {
    const nav = document.querySelector('.site-nav');
    const cs = getComputedStyle(nav);
    const open = nav.classList.contains('is-open');
    // The colour actually painted behind the links: walk up for the first
    // non-transparent background, so a transparent drawer is measured against
    // whatever it actually sits on rather than assumed white.
    const bgOf = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const b = getComputedStyle(n).backgroundColor;
        const m2 = /rgba?\\(([^)]+)\\)/.exec(b);
        if (m2 && !m2[1].split(",").slice(3).every(x => x.trim() === "0")) return b;
        n = n.parentElement;
      }
      return "rgb(255, 255, 255)";
    };
    const lum = (rgb) => {
      const v = rgb.match(/[\\d.]+/g).slice(0, 3).map(Number).map(c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const navBg = bgOf(nav);
    const links = [...nav.querySelectorAll('.nav-link')].map(a => {
      const fg = getComputedStyle(a).color;
      const r = a.getBoundingClientRect();
      return {
        text: a.textContent.trim(),
        fg, contrast: Number(ratio(fg, navBg).toFixed(2)),
        // An element with no box is not being shown at all.
        visible: r.width > 0 && r.height > 0,
        inViewport: r.top >= -2 && r.bottom <= innerHeight + 2,
      };
    });
    return {
      open, navBg, links,
      shellOver: !!document.querySelector('.shell--over'),
      drawerBg: cs.backgroundColor,
      drawerPos: cs.position,
    };
  })()`);

  const bad = m.links.filter((l) => !l.visible || !l.inViewport || l.contrast < 3);
  console.log(`--- #/${route} --- shell--over=${m.shellOver} drawer=${m.navBg} open=${m.open}`);
  console.log("   " + m.links.map((l) => `${l.text}:${l.contrast}:1`).join("  "));
  check(`#/${route}: all 5 links present`, m.links.length === 5, String(m.links.length));
  check(`#/${route}: all 5 links actually visible`, m.links.every((l) => l.visible));
  check(`#/${route}: all 5 links inside the viewport`, m.links.every((l) => l.inViewport),
    m.links.filter((l) => !l.inViewport).map((l) => l.text).join(", "));
  check(`#/${route}: every link readable (contrast >= 3:1)`, bad.length === 0,
    bad.map((l) => `${l.text} ${l.contrast}:1 on ${m.navBg}`).join("; "));
}

if (fails) { console.log("\\n" + fails + " check(s) failed"); process.exit(1); }
console.log("\\nevery link is visible and readable in the mobile drawer");
