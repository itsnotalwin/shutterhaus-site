/**
 * Settle three claims against the live DOM before reporting them:
 *
 *  A. Is any `.cta` rendered inside a dark band (where `.cta`'s `color:var(--ink)`
 *     would be black-on-black)? The only white override is `.hero__body .cta`.
 *  B. The contact figure markup uses class "contact__fig" but the stylesheet
 *     defines ".ct__fig" (editorial.css:620). Is that a third class mismatch?
 *  C. Does the contact figure really serve the raw original instead of a
 *     derivative (pages-more.ts:179 uses shot.url, not bestDerivative)?
 *
 * Run: node tools/audit2-verify2.mjs
 */
import { writeFileSync } from "node:fs";

const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = "https://shutterhausvisuals.co.za";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`${CDP}/json/list`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) {
    const p = pending.get(x.id); pending.delete(x.id);
    x.error ? p.reject(new Error(JSON.stringify(x.error))) : p.resolve(x.result);
  }
};
const send = (m, p = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method: m, params: p }));
});
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });

const EXPR = `(() => {
  const rgb = s => { const m = String(s).match(/[\\d.]+/g); return m ? m.slice(0,3).map(Number) : null; };
  const lum = c => { const f = c.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
  const ratio = (a,b) => { const l1 = lum(a), l2 = lum(b);
    return +(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05))).toFixed(2); };
  const bgOf = el => { let n = el;
    while (n && n !== document.documentElement) {
      const b = getComputedStyle(n).backgroundColor;
      if (b && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(b)) return b;
      n = n.parentElement; }
    return getComputedStyle(document.body).backgroundColor; };

  // A. every .cta, its colour vs its nearest non-transparent background
  const ctas = [...document.querySelectorAll('.cta')].map(el => {
    const c = getComputedStyle(el);
    const fg = rgb(c.color), bg = rgb(bgOf(el));
    const r = fg && bg ? ratio(fg, bg) : null;
    const rect = el.getBoundingClientRect();
    return { text: el.textContent.trim().slice(0,26), color: c.color, bg: bgOf(el),
      contrast: r, invisible: r !== null && r < 1.5, visible: rect.width > 0 && rect.height > 0,
      parent: el.parentElement.className };
  });

  // B. does the contact figure have a matching stylesheet rule?
  const fig = document.querySelector('.contact__fig');
  let figInfo = null;
  if (fig) {
    const img = fig.querySelector('img');
    const ci = img ? getComputedStyle(img) : null;
    // Does ANY rule match .ct__fig? Check the stylesheets directly.
    let ctFigRule = false, contactFigRule = false;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        if (!r.selectorText) continue;
        if (/\\.ct__fig\\b/.test(r.selectorText)) ctFigRule = true;
        if (/\\.contact__fig\\b/.test(r.selectorText)) contactFigRule = true;
      }
    }
    const rect = fig.getBoundingClientRect();
    figInfo = { markupClass: 'contact__fig',
      cssRule_for_ct__fig_exists: ctFigRule,
      cssRule_for_contact__fig_exists: contactFigRule,
      imgSrc: img ? img.currentSrc.split('/').pop() : null,
      imgNaturalW: img ? img.naturalWidth : null,
      imgRenderedW: img ? Math.round(img.getBoundingClientRect().width) : null,
      objectFit: ci ? ci.objectFit : null,
      aspectRatio: ci ? ci.aspectRatio : null,
      figBoxW: Math.round(rect.width), figBoxH: Math.round(rect.height) };
  }

  // C. every image on the page: bytes actually transferred vs rendered size
  const heavy = [...document.images].filter(i => i.complete && i.naturalWidth > 0)
    .map(i => ({ src: i.currentSrc.split('/').pop(), natW: i.naturalWidth,
      renderedW: Math.round(i.getBoundingClientRect().width),
      waste: i.naturalWidth > 0 ? Math.round(i.getBoundingClientRect().width) : 0,
      cls: i.className }))
    .filter(x => x.natW > x.renderedW * 2.2 && x.renderedW > 0)
    .sort((a,b) => (b.natW - b.renderedW) - (a.natW - a.renderedW));

  return { ctas, figInfo, oversizedImages: heavy };
})()`;

for (const route of ["services", "contact"]) {
  await send("Page.navigate", { url: `${ORIGIN}/${route}` });
  await sleep(3500);
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: EXPR });
  const d = r.result.value;
  console.log(`\n================ /${route} ================`);
  console.log("A. .cta elements — colour vs background:");
  if (!d.ctas.length) console.log("   (no .cta on this page)");
  for (const c of d.ctas) {
    console.log(`   "${c.text}"  color=${c.color}  bg=${c.bg}  contrast=${c.contrast}  ` +
      `${c.invisible ? "<<< INVISIBLE" : "ok"}  visible=${c.visible}`);
  }
  if (d.figInfo) {
    console.log("B. contact figure class-name check:");
    console.log("  ", JSON.stringify(d.figInfo, null, 2).replace(/\n/g, "\n   "));
  }
  if (d.oversizedImages.length) {
    console.log("C. images served far larger than rendered:");
    for (const i of d.oversizedImages) console.log(`   ${i.src}  natural=${i.natW}px rendered=${i.renderedW}px  cls=${i.cls}`);
  } else console.log("C. no oversized images");
}
ws.close(); process.exit(0);