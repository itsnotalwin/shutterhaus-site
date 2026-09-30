/**
 * Locked-state guard: the home page is frozen, so assert it still matches.
 *
 * Alwin, 2026-09-30: "lets lock in our home page as this we dont make more
 * changes here at all from this point." A lock is only real if something
 * fails when it is broken, so this checks the numbers that define the
 * locked look — hero filename, strip frame count, strip columns, and the
 * greyscale-at-rest rule. Any drift exits non-zero.
 *
 * Run after ANY change that could touch the home route, including work aimed
 * at other pages. `homePage()` in pages.ts, `stripCols()`, and the `.hstrip`
 * rules in editorial.css all feed this.
 *
 * Usage: node tools/check-home-locked.mjs <baseUrl> [width]
 */

const BASE = process.argv[2] || "http://127.0.0.1:4173";
const W = Number(process.argv[3] || 1440);
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT || 9222);

/** The values that were live at lock time, commit abbdba8. */
const LOCKED = {
  hero: "27-img-0297.jpg",
  stripFrames: 6,
  stripColumns: 2,
  heroBlackAndWhite: false, // hero is a colour frame, never greyscaled
  stripBlackAndWhite: true, // gallery frames go grey at rest
};

const t = await (
  await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })
).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await new Promise((r) => (ws.onopen = r));

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: W,
  height: 900,
  deviceScaleFactor: 1,
  mobile: W < 640,
});
await send("Page.navigate", { url: `${BASE}#/home` });
await sleep(2600);

const r = await send("Runtime.evaluate", {
  expression: `(() => {
    const heroImg = document.querySelector('.hero__fig img');
    const strip = document.querySelector('.hstrip__grid');
    const cols = strip ? strip.querySelectorAll('.hstrip__col') : [];
    const firstCell = strip ? strip.querySelector('.cell img') : null;
    const heroCs = heroImg ? getComputedStyle(heroImg) : null;
    return JSON.stringify({
      // The hero serves a responsive derivative, e.g. gallery/27-img-0297-1600w.jpg.
      //
      // No regex here on purpose: this code is inside a JS template literal, and
      // a backslash sequence like \d is collapsed to a plain d when the string
      // is built, so the pattern silently stops matching. My first three
      // attempts all failed this way. Parsing the tail by hand is unambiguous.
      hero: (() => {
        if (!heroImg) return null;
        const full = (heroImg.currentSrc || heroImg.src).split('?')[0].split('#')[0];
        const base = full.split('/').pop();
        const dot = base.lastIndexOf('.');
        let stem = dot === -1 ? base : base.slice(0, dot);
        const tail = dot === -1 ? '' : base.slice(dot + 1);
        const dash = stem.lastIndexOf('-');
        if (dash > -1 && /^[0-9]+w$/.test(stem.slice(dash + 1)) === false) {
          // not a derivative suffix; leave the name alone
        } else if (dash > -1) {
          stem = stem.slice(0, dash);
        }
        return stem + '.' + (tail || 'jpg');
      })(),
      stripFrames: strip ? strip.querySelectorAll('.cell').length : 0,
      stripColumns: cols.length,
      stripColsProp: strip ? getComputedStyle(strip).getPropertyValue('--strip-cols').trim() : null,
      heroFilter: heroCs ? heroCs.filter : null,
      cellFilter: firstCell ? getComputedStyle(firstCell).filter : null,
    });
  })()`,
  returnByValue: true,
});

const raw = r.result?.result?.value;
await fetch(`${CDP}/json/close/${t.id}`);
ws.close();

if (!raw) {
  console.log("FAIL  could not read the home page DOM");
  process.exit(1);
}

const got = JSON.parse(raw);
const checks = [
  ["hero frame", got.hero, LOCKED.hero],
  ["strip frame count", got.stripFrames, LOCKED.stripFrames],
  ["strip columns", got.stripColumns, LOCKED.stripColumns],
  ["--strip-cols", got.stripColsProp, String(LOCKED.stripColumns)],
];

let bad = 0;
for (const [name, actual, want] of checks) {
  const ok = String(actual) === String(want);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}: ${actual}${ok ? "" : ` (locked: ${want})`}`);
}

// The hero must never be greyscaled — it is a colour frame and reads as
// broken if it goes grey. The strip must be grey at rest.
const heroGrey = /grayscale\(1\)/.test(got.heroFilter ?? "");
console.log(
  `${heroGrey === LOCKED.heroBlackAndWhite ? "ok  " : "FAIL"}  hero not greyscaled: filter=${got.heroFilter}`,
);
if (heroGrey !== LOCKED.heroBlackAndWhite) bad++;

const cellGrey = /grayscale\(1\)/.test(got.cellFilter ?? "");
console.log(
  `${cellGrey === LOCKED.stripBlackAndWhite ? "ok  " : "FAIL"}  strip grey at rest: filter=${got.cellFilter}`,
);
if (cellGrey !== LOCKED.stripBlackAndWhite) bad++;

console.log(bad ? `\n${bad} check(s) drifted from the locked home page` : "\nhome page matches the locked state");
process.exit(bad ? 1 : 0);
