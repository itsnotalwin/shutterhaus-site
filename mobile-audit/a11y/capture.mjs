/* ------------------------------------------------------------------
 * capture.mjs — render the four failing text pairs over photographs and
 * hand back BOTH the PNG and the glyph geometry.
 *
 * The measurement itself lives in contrast.py. It has to: WCAG contrast
 * over a photograph cannot be computed from a colour swatch, because the
 * background is a gradient of photo pixels. The only honest number is
 * measured on the real rendered pixels, so this script's job is to
 * produce (a) a lossless PNG of the page and (b) the exact device-pixel
 * box of each glyph run, so Python can sample photo+scrim and refuse to
 * count the text itself as background.
 *
 * Two screenshots are taken per target:
 *   1. with the text visible  -> gives the glyph pixels
 *   2. with the text hidden   -> gives the same photograph with NO glyphs
 * Comparing the two is how the sampler knows which pixels are letters
 * (they change when the letters are removed) and which are photograph.
 * That is far more reliable than guessing a colour threshold on a
 * gradient, and it needs no threshold tuning per element.
 * ------------------------------------------------------------------ */
import fs from 'node:fs';
import { newMobileTarget, nav, js } from '../cdp.mjs';

const OUT = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\a11y\\';
const BASE = process.env.BASE || 'http://127.0.0.1:4188/';
const TAG = process.env.TAG || 'before';

// The four elements the audit measured as failing. Selectors are read from
// the live DOM, not hardcoded to a size, so a layout change shows up as a
// different box rather than a silently stale measurement.
//
// `pad` widens the sampled box in CSS px. The burger needs it: its bars are
// solid white rectangles 20x1 CSS px with no glyph interior, so a box that
// tight contains nothing but the bar itself and there is no background left
// to compare against. Padding it puts real photograph + scrim in the sample
// while the bar itself still registers as "changed when hidden" = glyph.
const TARGETS = [
  { key: 'eyebrow',  sel: '.hero__body .eyebrow', pad: 0, label: 'hero eyebrow (11px mono, opacity .9)' },
  { key: 'wordmark', sel: '.logo',                pad: 0, label: 'header wordmark (Archivo Black, white)' },
  { key: 'burger',   sel: '.burger__bars i',      pad: 3, label: 'burger bars (white, 20x1px)' },
  { key: 'lede',     sel: '.hero__lede',          pad: 0, label: 'hero lede (14px, opacity .92)' },
];

fs.mkdirSync(OUT, { recursive: true });
const s = await newMobileTarget(393, 852, 3);

/* Viewport-only capture, written to an absolute path.
 * cdp.mjs's shot() hardcodes a full-page capture into its own designshots
 * dir. Full page is wrong here for a specific reason: getBoundingClientRect
 * is VIEWPORT-relative, and on a full-page capture Chrome shifts the origin
 * by the current scroll offset, so a box measured at y=18 could decode from
 * a completely different row of pixels. Scrolling to 0 first and clipping to
 * the layout viewport keeps rects and pixels on the same coordinate system. */
async function shotViewport(name) {
  await js(s, `scrollTo(0,0); return 1;`);
  const m = await s.send('Page.getLayoutMetrics');
  const vs = m.cssVisualViewport;
  const r = await s.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: Math.ceil(vs.clientWidth), height: Math.ceil(vs.clientHeight), scale: 1 },
    captureBeyondViewport: false,
    optimizeForSpeed: false,
  });
  const p = OUT + name + '.png';
  fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
  return p;
}

await nav(s, BASE, 6000);
// Fonts must be in before measuring, or the glyph raster we decode is a
// fallback face that will never be what Alwin sees.
await js(s, `return document.fonts.ready.then(()=>document.fonts.status);`);

/* ---- 1. the page as rendered, nothing hidden */
const withText = await shotViewport(TAG + '-render');
console.log('render ->', withText);

/* ---- 2. geometry + computed colours of each target */
const geom = await js(s, `
const out = {};
for (const t of ${JSON.stringify(TARGETS)}) {
  const e = document.querySelector(t.sel);
  if (!e) { out[t.key] = null; continue; }
  const b = e.getBoundingClientRect();
  const c = getComputedStyle(e);
  const p = t.pad || 0;
  out[t.key] = {
    sel: t.sel,
    label: t.label,
    // device pixels, because the PNG is captured at DPR 3
    x: Math.round((b.left - p) * 3), y: Math.round((b.top - p) * 3),
    w: Math.round((b.width + p * 2) * 3), h: Math.round((b.height + p * 2) * 3),
    cssW: +b.width.toFixed(1), cssH: +b.height.toFixed(1),
    fontSize: c.fontSize, fontFamily: c.fontFamily.split(',')[0],
    color: c.color, background: c.backgroundColor,
    opacity: +c.opacity, fontWeight: c.fontWeight,
    inViewport: b.top >= 0 && b.bottom <= innerHeight,
  };
}
return out;`);
console.log('geom ->', JSON.stringify(geom, null, 1));

/* ---- 3. the same frame with every target's TEXT hidden.
 * `visibility: hidden` keeps the box, so the photograph, the scrim and
 * the layout are all byte-identical — the only difference is the absence
 * of the glyphs. A second capture of exactly that is the background. */
await js(s, `
window.__shSaved = [];
for (const t of ${JSON.stringify(TARGETS)}) {
  const e = document.querySelector(t.sel);
  if (!e) continue;
  window.__shSaved.push([e, e.style.visibility]);
  e.style.visibility = 'hidden';
}
return window.__shSaved.length;`);
const noText = await shotViewport(TAG + '-notext');
console.log('notext ->', noText);

await js(s, `for (const [e,v] of window.__shSaved) e.style.visibility = v; return 1;`);

fs.writeFileSync(OUT + TAG + '-geom.json', JSON.stringify(geom, null, 1));
s.close();
process.exit(0);
