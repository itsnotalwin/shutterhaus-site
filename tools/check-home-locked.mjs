/**
 * Locked-state guard: the home page is frozen, so assert it still matches.
 *
 * Alwin, 2026-09-30: "lets lock in our home page as this we dont make more
 * changes here at all from this point."
 *
 * REOPENED 2026-10-01 by Alwin for one round of upgrades (hero, strip header,
 * services band) and LOCKED AGAIN. What changed and why is in HOME-LOCKED.md.
 * The original numbers below are unchanged on purpose: the photographs, the
 * strip's frame/column counts and the greyscale rules did not move. The new
 * checks at the bottom cover the three things that were added.
 *
 * A lock is only real if something
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
// Touch widths must be told they have no hover, or the greyscale check below
// is untestable. `setDeviceMetricsOverride` changes LAYOUT only — headless
// Chrome keeps reporting `(hover: hover) == true` at 390px, so the CSS rule
// stays on and "phones show true colour" could never be verified. This Chrome
// build also IGNORES `setEmulatedMedia({features:[{name:'hover'}]})` entirely;
// `setTouchEmulationEnabled` is what actually flips the media feature (checked
// with tools/probe-emulated-media.mjs). Turn it on for touch widths only, so
// the desktop branch still exercises the real hover rule.
if (W < 640) {
  await send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
}
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
      hoverCapable: matchMedia('(hover: hover)').matches,
      stripFrames: strip ? strip.querySelectorAll('.cell').length : 0,
      // Added in the 2026-10-01 upgrade.
      heroMeta: document.querySelector('.hero__meta') ? document.querySelector('.hero__meta').textContent.trim() : null,
      stripNumbers: strip ? strip.querySelectorAll('.hstrip__n').length : 0,
      bandPrice: document.querySelector('.hcta__price') ? document.querySelector('.hcta__price').textContent.trim() : null,
      bandFoot: document.querySelectorAll('.hcta__foot a').length,
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

// Added 2026-10-01. Each of these is something an agent could plausibly delete
// while "tidying" and not notice, because nothing else fails when it goes —
// and deleting them turns this guard into a rubber stamp on a page that no
// longer has them. They were dropped once already; keep them.
checks.push(
  ["hero meta strip present", Boolean(got.heroMeta), true],
  ["every strip frame is numbered", got.stripNumbers, LOCKED.stripFrames],
  ["band quotes an entry price", Boolean(got.bandPrice), true],
  ["band has contact links (email, phone, instagram)", got.bandFoot >= 3, true],
);


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

// Grey at rest on hover devices; true colour on phones (W < 640), by design.
//
// The greyscale rule lives inside @media (hover: hover). Raw headless Chrome
// over CDP reports `hover: none` and CDP cannot emulate that feature, so on a
// desktop width the check would FAIL even on an untouched build (confirmed
// against 43c1360 on 2026-10-01). When the browser can't hover, say so and skip
// rather than report drift that isn't there. Run it from a headed Chrome, or
// confirm with Playwright (`has_touch=False`), to get a real answer.
const cellGrey = /grayscale\(1\)/.test(got.cellFilter ?? "");
if (W >= 640 && !got.hoverCapable) {
  console.log(`skip  strip grey at rest: this browser reports hover:none, so the rule is off (filter=${got.cellFilter})`);
} else {
  const wantGrey = W < 640 ? false : LOCKED.stripBlackAndWhite;
  console.log(
    `${cellGrey === wantGrey ? "ok  " : "FAIL"}  strip ${wantGrey ? "grey" : "colour"} at rest (${W < 640 ? "touch" : "hover"} device): filter=${got.cellFilter}`,
  );
  if (cellGrey !== wantGrey) bad++;
}

console.log(bad ? `\n${bad} check(s) drifted from the locked home page` : "\nhome page matches the locked state");
process.exit(bad ? 1 : 0);
