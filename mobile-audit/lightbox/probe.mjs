/**
 * Measures one lightbox open on a 393x852 DPR3 phone with touch emulation.
 *
 *   node mobile-audit/lightbox/probe.mjs <baseUrl> <outJson>
 *
 * Runs the SAME script against the pre-fix and post-fix builds, so the byte
 * numbers in the report are a diff of one measurement method, not two
 * different scripts that happened to run a minute apart.
 *
 * Every assertion is reported, never thrown: a probe that dies on the first
 * failed check cannot tell you whether the other four still hold. The lightbox
 * carries no id and exposes no global, so state is read off the DOM — the
 * counter in `.lb__cap` and the image's currentSrc.
 */
import { writeFileSync } from "node:fs";
import { launch, phone, PORT } from "./cdp-lb.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:4174";
const OUT = process.argv[3] || "mobile-audit/lightbox/probe.json";
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: Boolean(pass), detail: detail ?? "" });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const c = await launch();
console.log(`${c.browser} on :${PORT} -> ${BASE}\n`);
await phone(c);

const IMG_RE = /\.(jpe?g|png|webp)(\?|$)/i;
// A derivative carries a width suffix; the original never does.
const isDerivative = (u) => /-\d+w\.(jpe?g|webp)$/i.test(new URL(u, BASE).pathname);
const readLb = `(() => ({
  open: !document.querySelector(".lb").hidden,
  src:
    document.querySelector(".lb__img").currentSrc ||
    document.querySelector(".lb__img").getAttribute("src") ||
    "",
  alt: document.querySelector(".lb__img").alt,
  cap: document.querySelector(".lb__cap").textContent.trim(),
}))()`;
const cap = () => c.evaluate(`document.querySelector('.lb__cap').textContent.trim()`);
const isOpen = () => c.evaluate(`!document.querySelector('.lb').hidden`);

/** Blocks until the lightbox image has real pixels, or gives up loudly. */
async function waitForImage(ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const done = await c.evaluate(`(() => {
      const i = document.querySelector('.lb__img');
      return !!(i && i.complete && i.naturalWidth > 0);
    })()`);
    if (done) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/**
 * Tap a wall frame the way a thumb does: a real touchStart/touchEnd pair, so
 * the browser synthesises the click itself.
 *
 * Two reasons this is not `dispatchEvent(new MouseEvent('click'))`. A synthetic
 * click has no pointerdown in front of it, and the swipe handler resets its
 * click-suppression on pointerdown — so a bare click dispatched right after a
 * swipe is swallowed and the lightbox never opens. And the point of this probe
 * is the phone path, which a MouseEvent does not exercise at all.
 */
async function tapFrame(sel = ".pf-cell img[data-full]") {
  await c.evaluate(`(() => {
    const i = document.querySelector("${sel}");
    if (i) i.scrollIntoView({ block: "center" });
  })()`);
  await new Promise((r) => setTimeout(r, 450));
  const at = await c.evaluate(`(() => {
    const i = document.querySelector("${sel}");
    if (!i) return null;
    const r = i.getBoundingClientRect();
    if (!r.width) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!at) return false;
  const p = { x: at.x, y: at.y, id: 1, radiusX: 8, radiusY: 8, force: 1 };
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return true;
}
const tap = async () => {
  await tapFrame();
  await waitForImage();
};

// --- open the portfolio and tap a frame -------------------------------------
await c.goto(`${BASE}/#/portfolio`, 2000);
await c.evaluate(`window.__probeSentinel = 1`);
const frameCount = await c.evaluate(
  `document.querySelectorAll('.pf-cell img[data-full]').length`,
);
check("portfolio wall rendered", frameCount > 0, `${frameCount} frames`);

const before = c.requests(IMG_RE);
const bytesBeforeTap = before.reduce((n, r) => n + r.bytes, 0);

await tap();
const loadedOk = await waitForImage();
const st = await c.evaluate(readLb);
check("lightbox opened and its image decoded", st.open && loadedOk, st.cap);
check(
  "lightbox loads a bounded derivative, not the original",
  st.open && isDerivative(st.src),
  st.src,
);

// --- (2) byte cost of the open ---------------------------------------------
// Read AFTER waitForImage(): a fixed sleep raced the request and once reported
// a real 95kB fetch as 0 bytes, which is exactly the kind of measurement that
// makes a broken build look like a fast one.
const all = c.requests(IMG_RE);
const after = all.slice(before.length);
const openBytes = after.reduce((n, r) => n + r.bytes, 0);
const hit = all.filter((r) => r.url === st.src);
const loadedBytes = hit.length ? hit[0].bytes : 0;
check("lightbox image was fetched", loadedBytes > 0, `${loadedBytes} bytes`);
console.log(
  `\n      lightbox image : ${loadedBytes} bytes\n` +
    `      bytes for open : ${openBytes} (page had ${bytesBeforeTap} before tap)`,
);
await c.shot("mobile-audit/lightbox/lightbox-open.png");

const vw = await c.evaluate(`window.innerWidth`);
const vh = await c.evaluate(`window.innerHeight`);

/**
 * Dispatch a real touch drag, then report what the page did.
 *
 * "closed" and "navigated" are distinguished by a sentinel on `window`, and
 * they have to be: a lightbox that dismissed and a document that was replaced
 * both leave `.lb` hidden, and reading that as navigation makes the probe
 * re-navigate after a perfectly successful drag and then measure the wrong
 * thing.
 *
 * "navigated" is not hypothetical. On a build with no `touch-action` on the
 * overlay Chrome claims a horizontal drag as an overscroll history-back and
 * replaces the whole document, which is what the pre-fix build does.
 */
async function touchDrag(x0, y0, x1, y1, steps = 14) {
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }];
  await c.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: pt(x0, y0),
  });
  for (let i = 1; i <= steps; i++) {
    await c.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: pt(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps),
    });
  }
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await new Promise((r) => setTimeout(r, 900));
  const after = await c
    .evaluate(
      `(() => ({
         alive: window.__probeSentinel === 1,
         hasLb: !!document.querySelector('.lb'),
         open: !!document.querySelector('.lb') && !document.querySelector('.lb').hidden,
       }))()`,
    )
    .catch(() => ({ alive: false, hasLb: false, open: false }));
  if (!after.alive) {
    await c.goto(`${BASE}/#/portfolio`, 2000);
    await c.evaluate(`window.__probeSentinel = 1`);
  }
  return after;
}
let navigated = false;

// --- (3) horizontal touch drag advances -------------------------------------
// The drag runs at 28% of the viewport height, NOT the middle. `.lb__nav` sits
// at `left/right: 14px` and is vertically centred, so on a 393px phone it
// occupies x 301-379 and x 14-92 across the middle band. A drag through the
// middle therefore STARTS ON THE NEXT BUTTON, and the swipe handler refuses to
// claim a press that lands on a control — so the first version of this probe
// failed for a reason that was the product working correctly. The clear-band
// assertion below makes that failure loud instead of silent.
const band = await c.evaluate(`(() => {
  const r = (s) => {
    const b = document.querySelector(s);
    if (!b) return null;
    const q = b.getBoundingClientRect();
    return { l: q.left, r: q.right, t: q.top, b: q.bottom };
  };
  return { prev: r('.lb__nav--p'), next: r('.lb__nav--n'),
           y: Math.round(window.innerHeight * 0.28) };
})()`);
const overlaps = (x, y) =>
  [band.prev, band.next].some(
    (b) => b && x > b.l && x < b.r && y > b.t && y < b.b,
  );
const swipeY = band.y;
const fromX = Math.round(vw * 0.78);
const toX = Math.round(vw * 0.2);
check(
  "swipe path is clear of the prev/next buttons",
  !overlaps(fromX, swipeY) && !overlaps(toX, swipeY),
  `y=${swipeY} x=${fromX}->${toX}; next button x ${Math.round(band.next?.l)}-${Math.round(band.next?.r)}, y ${Math.round(band.next?.t)}-${Math.round(band.next?.b)}`,
);

const cap0 = st.cap;
const swipe = await touchDrag(fromX, swipeY, toX, swipeY);
if (!swipe.alive) {
  check(
    "a horizontal touch drag does not navigate the tab away",
    false,
    "the drag was claimed by the browser as a history-back",
  );
  check("horizontal touch swipe advances the lightbox", false, "page navigated away");
  check("swiped-to image is also a bounded derivative", false, "page navigated away");
  check("swipe right goes back", false, "page navigated away");
} else {
  check("a horizontal touch drag does not navigate the tab away", true, "");
  const sw = await c.evaluate(readLb);
  check(
    "horizontal touch swipe advances the lightbox",
    sw.open && sw.cap !== cap0,
    `"${cap0}" -> "${sw.cap}"`,
  );
  check("swiped-to image is also a bounded derivative", isDerivative(sw.src), sw.src);
  await c.shot("mobile-audit/lightbox/lightbox-after-swipe.png");

  // Swipe right to go back.
  await touchDrag(toX, swipeY, fromX, swipeY);
  const back = await c.evaluate(readLb);
  check("swipe right goes back", back.cap === cap0, `"${sw.cap}" -> "${back.cap}"`);
}

// --- vertical drag down dismisses -------------------------------------------
// The counter WRAPS (`at = (i + n) % n`), so swiping past the last frame
// cannot dismiss — the gallery is a ring by design. Drag-down is therefore the
// only swipe gesture that closes, and it is the one iOS Photos users reach for.
const wasOpenBeforeDrag = await isOpen();
const drag = await touchDrag(
  Math.round(vw * 0.5), Math.round(vh * 0.35),
  Math.round(vw * 0.5), Math.round(vh * 0.9),
);
// `open === false` is only evidence of a DISMISS when the lightbox was open
// when the drag started. On the pre-fix build the swipe above navigated the
// page, so the overlay was already closed here and the check would pass for
// the wrong reason — which is precisely the sort of green that hides a bug.
const dragMeaningful = swipe.alive && wasOpenBeforeDrag;
if (!dragMeaningful) {
  check(
    "vertical drag down dismisses the lightbox",
    false,
    "INCONCLUSIVE: the lightbox was not open when the drag began",
  );
} else if (!drag.alive) {
  check(
    "vertical drag down dismisses the lightbox",
    false,
    "page navigated away before the drag could dismiss",
  );
} else {
  check(
    "vertical drag down dismisses the lightbox",
    drag.open === false,
    `still open after drag = ${drag.open}`,
  );
}
// --- (4) keyboard still works ------------------------------------------------
const key = async (k) => {
  const m = {
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  };
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...m[k] });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", ...m[k] });
  await new Promise((r) => setTimeout(r, 700));
};
await tap();
check("reopened for the keyboard test", await isOpen(), "");
const k0 = await cap();
await key("ArrowRight");
const k1 = await cap();
check("ArrowRight advances", k1 !== k0, `"${k0}" -> "${k1}"`);
await key("ArrowLeft");
const k2 = await cap();
check("ArrowLeft goes back", k2 === k0, `"${k1}" -> "${k2}"`);
await key("Escape");
check("Escape closes", (await isOpen()) === false, "");

// --- backdrop click still closes (pre-existing behaviour) -------------------
await tap();
await c.evaluate(`(() => {
  document.querySelector('.lb')
    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
})()`);
check("backdrop click still closes", (await isOpen()) === false, "");

// --- a real TAP (no movement) must neither close nor advance ---------------
await tap();
const t0 = await cap();
const tapPt = { x: Math.round(vw / 2), y: swipeY };
await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [tapPt] });
await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((r) => setTimeout(r, 900));
const t1 = { cap: await cap(), open: await isOpen() };
check(
  "a tap on the image does not close or advance",
  t1.cap === t0 && t1.open,
  `"${t0}" -> "${t1.cap}" open=${t1.open}`,
);

// --- (5) controls are real touch targets ------------------------------------
await tap();
const cb = await c.evaluate(`(() => {
  const x = document.querySelector('.lb__x').getBoundingClientRect();
  return { w: Math.round(x.width), h: Math.round(x.height),
           top: Math.round(x.top), right: Math.round(x.right),
           vw: window.innerWidth, vh: window.innerHeight };
})()`);
check(
  "close button >= 44x44 and inside the viewport",
  cb.w >= 44 && cb.h >= 44 && cb.top >= 0 && cb.right <= cb.vw + 1,
  `${cb.w}x${cb.h} at top:${cb.top} right:${cb.right} (vw ${cb.vw} vh ${cb.vh})`,
);
const nav = await c.evaluate(`(() => {
  const l = document.querySelector('.lb__nav--p').getBoundingClientRect();
  const n = document.querySelector('.lb__nav--n').getBoundingClientRect();
  return { pw: Math.round(l.width), ph: Math.round(l.height),
           nw: Math.round(n.width), nh: Math.round(n.height) };
})()`);
check(
  "prev/next >= 44x44",
  nav.pw >= 44 && nav.ph >= 44 && nav.nw >= 44 && nav.nh >= 44,
  `prev ${nav.pw}x${nav.ph}, next ${nav.nw}x${nav.nh}`,
);
const alt = await c.evaluate(`document.querySelector('.lb__img').alt`);
check("lightbox image keeps its alt text", alt.length > 10, alt.slice(0, 55));

// --- (6) console clean -------------------------------------------------------
const errs = c.consoleErrors();
check("0 console errors", errs.length === 0, errs.slice(0, 3).join(" | "));

const failed = results.filter((r) => !r.pass);
writeFileSync(
  OUT,
  JSON.stringify(
    {
      base: BASE,
      viewport: `${vw}x${vh}@3`,
      lightboxImageUrl: st.src,
      lightboxImageBytes: loadedBytes,
      bytesForWholeOpen: openBytes,
      pageBytesBeforeTap: bytesBeforeTap,
      frames: frameCount,
      results,
    },
    null,
    2,
  ),
);
console.log(`\nwrote ${OUT}\n${failed.length ? `${failed.length} FAILED` : "ALL PASS"}`);
await c.close();
