/**
 * Does a DESKTOP still get the original?
 *
 * The phone probe proves the 1200w rung is served at 393px/DPR3. This is the
 * other half of the promise: the fix must not quietly downgrade the picture for
 * the visitor on a big screen, which is where the full-res export is justified.
 *
 * Drives the HOME strip, not the portfolio wall. The wall currently renders
 * zero cells at desktop widths — portfolioPage() drops a row shorter than the
 * column count, and the rows are 2 frames against 3 columns — which is another
 * agent's in-flight work. The home strip is built by the same figure() and
 * carries the same data-full and the same <picture>, so it exercises exactly
 * the lightboxSrc() path under test.
 *
 *   node mobile-audit/lightbox/probe-desktop.mjs <baseUrl>
 */
import { launch } from "./cdp-lb.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:4174";
const SEL = ".cell img[data-full]";
const cases = [
  { name: "phone   393x852 @3", w: 393, h: 852, dpr: 3, mobile: true },
  { name: "laptop  1280x800 @1", w: 1280, h: 800, dpr: 1, mobile: false },
  { name: "desktop 1440x900 @2", w: 1440, h: 900, dpr: 2, mobile: false },
  { name: "wide    1920x1080@1", w: 1920, h: 1080, dpr: 1, mobile: false },
];

const isDerivative = (u) => /-\d+w\.(jpe?g|webp)$/i.test(new URL(u, BASE).pathname);

for (const cs of cases) {
  const c = await launch();
  await c.send("Emulation.setDeviceMetricsOverride", {
    width: cs.w,
    height: cs.h,
    deviceScaleFactor: cs.dpr,
    mobile: cs.mobile,
  });
  // Touch emulation is ON by default in launch() and, left on, the page
  // reports `(hover: none) and (pointer: coarse)` — which is the phone branch
  // by definition. A desktop that reports touch is not a desktop, so each
  // non-mobile case has to turn it back off to test the desktop branch.
  await c.send("Emulation.setTouchEmulationEnabled", { enabled: cs.mobile });
  await c.goto(`${BASE}/#/`, 2200);
  // Poll: the strip is rendered by the SPA after the module boots, and a fixed
  // sleep is not a readiness signal.
  for (let i = 0; i < 40; i++) {
    if (await c.evaluate(`!!document.querySelector('${SEL}')`)) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  await c.evaluate(`(() => {
    const i = document.querySelector('${SEL}');
    if (i) i.scrollIntoView({ block: 'center' });
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  const at = await c.evaluate(`(() => {
    const i = document.querySelector('${SEL}');
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
  })()`);
  if (!at) {
    console.log(`${cs.name.padEnd(20)} -> NO FRAME RENDERED, cannot measure`);
    await c.close();
    continue;
  }
  if (cs.mobile) {
    const p = { x: at.x, y: at.y, id: 1, radiusX: 8, radiusY: 8, force: 1 };
    await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
    await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    // With touch emulation off a touch event produces no click at all, so the
    // desktop branch has to be driven the way a desktop actually is: a mouse.
    for (const type of ["mousePressed", "mouseReleased"]) {
      await c.send("Input.dispatchMouseEvent", {
        type,
        x: at.x,
        y: at.y,
        button: "left",
        clickCount: 1,
      });
    }
  }
  await new Promise((r) => setTimeout(r, 2500));
  // Wait for the decode rather than trusting the sleep: a read taken early
  // reports 0 bytes and naturalWidth 0, which looks like a broken branch when
  // the file was simply still in flight.
  for (let i = 0; i < 40; i++) {
    if (
      await c.evaluate(
        `(() => { const i = document.querySelector('.lb__img');
                  return !!(i && i.complete && i.naturalWidth > 0); })()`,
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 150));
  }

  const st = await c.evaluate(`(() => {
    const i = document.querySelector('.lb__img');
    const b = document.querySelector('.lb');
    return { open: !b.hidden, src: i.currentSrc || i.getAttribute('src'),
             w: i.naturalWidth, rendered: Math.round(i.getBoundingClientRect().width) };
  })()`);
  const hit = c
    .requests(/\.(jpe?g|png|webp)(\?|$)/i)
    .find((r) => r.url === st.src);
  const need = Math.ceil(cs.w * 0.92 * cs.dpr);
  console.log(
    `${cs.name.padEnd(20)} -> ${isDerivative(st.src) ? "derivative" : "ORIGINAL "}` +
      `  ${String(hit?.bytes ?? 0).padStart(7)} B  ${st.src.split("/").pop()}` +
      `   (needs ~${need} device px, image is ${st.w}px wide, painted at ${st.rendered} CSS px)`,
  );
  await c.close();
}
