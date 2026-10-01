/**
 * Verify shots/pf-options.html in the headless Chrome already on CDP 9333.
 * Fails loudly on broken images, and MEASURES the layout claims (no ragged
 * edges in A/B, voids present in C) instead of trusting the generator.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = process.env.CDP_PORT || 9333;
const FILE_URL =
  'file:///C:/Users/Operations%203/Documents/HERMES/01_Projects/shutterhaus-site/shots/pf-options.html';
const SHOT_DIR =
  'C:/Users/Operations 3/AppData/Local/hermes/cache/scratch/shots-pf';

const base = `http://127.0.0.1:${PORT}`;
const ver = await (await fetch(`${base}/json/version`)).json();

const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

let id = 0;
const pend = new Map();
const evs = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { res, rej } = pend.get(m.id);
    pend.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method && evs.has(m.method)) {
    for (const h of evs.get(m.method)) h(m.params);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const n = ++id;
    pend.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });
const on = (method, fn) => {
  if (!evs.has(method)) evs.set(method, []);
  evs.get(method).push(fn);
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

await S('Page.enable');
await S('Runtime.enable');
await S('Log.enable');

const consoleErrs = [];
on('Runtime.exceptionThrown', (p) =>
  consoleErrs.push('EXCEPTION ' + JSON.stringify(p.exceptionDetails?.text)));
on('Log.entryAdded', (p) => {
  if (p.entry.level === 'error') consoleErrs.push('LOG ' + p.entry.text);
});
on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') consoleErrs.push('CONSOLE ' + JSON.stringify(p.args));
});

await S('Emulation.setDeviceMetricsOverride', {
  width: 1920, height: 1200, deviceScaleFactor: 1, mobile: false,
});
await S('Page.navigate', { url: FILE_URL });

// Wait for load, then for every <img> to settle (decode success OR error).
await new Promise((res) => on('Page.loadEventFired', res));
await S('Runtime.evaluate', {
  expression: `Promise.all([...document.images].map(i =>
    i.decode().catch(()=>{})))`.replace('Promise', 'Promise'),
  awaitPromise: true,
});
await new Promise((r) => setTimeout(r, 600));

const probe = await S('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(() => {
    const imgs = [...document.images];
    const bad = imgs.filter(i => !i.complete || i.naturalWidth === 0)
      .map(i => ({ src: i.getAttribute('src'), nw: i.naturalWidth, complete: i.complete }));

    // A: flushness == exactly 3 distinct lefts (columns) and 4 distinct tops
    // (rows) across all 12 cells. Integer-rounding comparison per row was
    // unreliable; the distinct-count is the real test.
    const A = [...document.querySelectorAll('#cand-a .ugrid')];
    const aGrids = A.map(g => {
      const cells = [...g.querySelectorAll('.cell')].map(c => c.getBoundingClientRect());
      const rowsY = [...new Set(cells.map(c => Math.round(c.y)))].sort((a, b) => a - b);
      const colsX = [...new Set(cells.map(c => Math.round(c.x)))].sort((a, b) => a - b);
      const sizes = [...new Set(cells.map(c => Math.round(c.width) + 'x' + Math.round(c.height)))];
      // every row must have all 3 columns occupied
      const colsPerRow = rowsY.map(y =>
        new Set(cells.filter(c => Math.round(c.y) === y).map(c => Math.round(c.x))).size);
      return { n: cells.length, sizes, rows: rowsY.length,
               distinctRowTops: rowsY.length, distinctColLefts: colsX.length,
               colsPerRow, colsFlush: colsPerRow.every(v => v === 3) };
    });

    const jrows = [...document.querySelectorAll('#cand-b .jrow')].map(r => {
      const b = r.getBoundingClientRect();
      const cells = [...r.querySelectorAll('.cell')].map(c => c.getBoundingClientRect());
      return {
        rowW: Math.round(b.width * 100) / 100,
        rowH: Math.round(b.height * 100) / 100,
        cellWidthSum: Math.round(cells.reduce((a, c) => a + c.width, 0) * 100) / 100,
        sameRowTops: new Set(cells.map(c => Math.round(c.y))).size === 1,
        sameRowBottom: new Set(cells.map(c => Math.round(c.bottom))).size === 1,
        n: cells.length };
    });
    const bWrap = document.querySelector('#cand-b .jwrap')?.getBoundingClientRect();

    // A and B must have flush right edges: last cell right == container right.
    const aFlush = A.every(g => {
      const cells = [...g.querySelectorAll('.cell')].map(c => c.getBoundingClientRect());
      const gb = g.getBoundingClientRect();
      return Math.abs(Math.max(...cells.map(c => c.right)) - gb.right) < 1.5;
    });
    const bFlush = jrows.every(r => Math.abs(r.cellWidthSum - r.rowW) < 1.5);

    // C voids: measure the IMG, not the <figure>. The figure is a grid item and
    // is STRETCHED to the row height, so the void lives between the bottom of
    // the short <img> and the bottom of its figure. Measuring the figure would
    // report every row as gapless and hide the defect entirely.
    const cCells = [...document.querySelectorAll('#cand-c .cell')].map(c => {
      const im = c.querySelector('img').getBoundingClientRect();
      const fg = c.getBoundingClientRect();
      return { w: Math.round(im.width), h: Math.round(im.height),
               figH: Math.round(fg.height), y: Math.round(im.y) };
    });
    const cRows = [];
    for (let r = 0; r < cCells.length / 3; r++) {
      const t = cCells.slice(r * 3, r * 3 + 3);
      const rowTop = Math.min(...t.map(c => c.y));
      // row height = figure height (the stretched grid track)
      const rh = Math.max(...t.map(c => c.figH));
      cRows.push({ row: r + 1, tops: [...new Set(t.map(c => c.y))].length,
                  voids: t.map(c => rh - c.h) });
    }
    const totalVoid = cRows.flatMap(x => x.voids).reduce((a, b) => a + b, 0);
    const cCellW = [...new Set(cCells.map(c => c.w))];

    // Hover must reveal colour. Don't read the CSSOM (a nested @media rule is easy
// to mis-walk and a silent catch hides the miss) — actually move the mouse over
// a cell with a real input event and read the computed filter. End-to-end.
    // Guard against unexpanded template text ever shipping again (a bug once
    // emitted 12 literal "{img(s, 800)}" strings in panel B and still passed,
    // because the <img> count was satisfied by panels A and C).
    const OUTER = document.documentElement.outerHTML;
    const TOKENS = ['{img(', '{hs}', 'height:{', '{p}px'];
    const literalTpl = TOKENS.reduce((n, t) =>
      n + (OUTER.split(t).length - 1), 0);

    const cs = getComputedStyle(imgs[0]);

    // Overflow audit: no descendant may stick out of its own panel. This is the
    // check that catches the 44px box-model bug where A's second sub-grid was
    // pushed onto an implicit row and B's rows were clipped.
    const overflow = [];
    for (const p of document.querySelectorAll('.panel')) {
      const pb = p.getBoundingClientRect();
      for (const el of p.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        const overR = b.right - pb.right, overB = b.bottom - pb.bottom;
        if (overR > 1 || overB > 1) overflow.push({
          panel: p.id, tag: el.className || el.tagName,
          overRight: Math.round(overR), overBottom: Math.round(overB),
        });
      }
    }
    // A's two sub-grids must be SIDE BY SIDE (same top, different lefts).
    const subs = [...document.querySelectorAll('#cand-a .asub')].map(d => {
      const b = d.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y),
               w: Math.round(b.width), h: Math.round(b.height) };
    });
    const sideBySide = subs.length === 2
      && subs[0].y === subs[1].y && subs[0].x !== subs[1].x;

    return {
      imgTotal: imgs.length, imgBad: bad,
      aGrids, aFlush, jrows, bFlush,
      subs, sideBySide, overflow: overflow.slice(0, 12),
      cRows, totalVoid, cCellW, distinctCHeights: [...new Set(cCells.map(c => c.h))].sort((a,b)=>a-b),
      restFilter: cs.filter, literalTpl,
      docH: document.documentElement.scrollHeight,
      stageW: document.querySelector('.stage').getBoundingClientRect().width,
      hScroll: document.documentElement.scrollWidth > window.innerWidth,
    };
  })()`,
});

const d = probe.result.value;

// Real hover test: scroll the target into view FIRST (Input.dispatchMouseEvent
// uses viewport coords, so an off-screen cell returns undefined), then move the
// physical pointer onto it and read back the computed filter. End-to-end.
const hv = await S('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const cell = document.querySelector('#cand-b .cell');
    cell.scrollIntoView({ block: 'center', behavior: 'instant' });
    const b = cell.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(b.x + b.width / 2),
                            y: Math.round(b.y + b.height / 2),
                            inView: b.top >= 0 && b.bottom <= innerHeight });
  })()`,
});
const hpRaw = JSON.stringify(hv);
if (hv.result.value === undefined) {
  console.log('DEBUG scroll evaluate raw:', hpRaw);
  throw new Error('scroll-into-view evaluate failed: ' + hpRaw);
}
const hp = JSON.parse(hv.result.value);
let hoverFilter = { hovering: false, filter: 'no-cell' };
if (hp.inView) {
  await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hp.x, y: hp.y, buttons: 0 });
  await new Promise((r) => setTimeout(r, 450));   // beat the 260ms transition
  const hv2 = await S('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => { const e = document.querySelector('#cand-b .cell:hover img')
      || document.querySelector('#cand-b .cell img');
      return JSON.stringify({ hovering: !!document.querySelector('#cand-b .cell:hover'),
        filter: getComputedStyle(e).filter }); })()`,
  });
  if (hv2.result.value === undefined) {
    console.log('DEBUG post-hover raw:', JSON.stringify(hv2));
    throw new Error('post-hover evaluate failed');
  }
  hoverFilter = JSON.parse(hv2.result.value);
} else {
  hoverFilter = { hovering: false, filter: 'NOT IN VIEWPORT: ' + JSON.stringify(hp) };
}
const out = [];
const log = (...a) => { const s = a.join(' '); out.push(s); console.log(s); };

log('=== IMAGES ===');
log(`total <img>: ${d.imgTotal}   broken: ${d.imgBad.length}`);
if (d.imgBad.length) log('  BROKEN: ' + JSON.stringify(d.imgBad));
log('=== A (uniform grid) ===');
d.aGrids.forEach((g, i) => log(
  `  grid${i + 1}: n=${g.n} cell=${g.sizes.join('/')} rows=${g.rows} ` +
  `distinctRowTops=${g.distinctRowTops} distinctColLefts=${g.distinctColLefts} ` +
  `colsFlush=${g.colsFlush}`));
log(`  flush right edge: ${d.aFlush}`);
log('=== B (justified rows) ===');
d.jrows.forEach((r, i) => log(
  `  row${i + 1}: n=${r.n} h=${r.rowH} rowW=${r.rowW} cellSum=${r.cellWidthSum} ` +
  `sameTop=${r.sameRowTops} sameBottom=${r.sameRowBottom}`));
log(`  every row fills width (<=1.5px): ${d.bFlush}`);
log('=== C (current masonry) ===');
d.cRows.forEach(r => log(`  row${r.row}: voids ${r.voids.join(', ')}px`));
log(`  cell widths: ${d.cCellW.join('/')}  total void: ${d.totalVoid}px`);
log('=== GREYSCALE ===');
log(`  at rest: ${d.restFilter}`);
log(`  pointer over a cell -> :hover matched=${hoverFilter.hovering} filter=${hoverFilter.filter}`);
const hoverOk = hoverFilter.hovering && /grayscale\(0(?![\d.])/.test(hoverFilter.filter);
log('=== BOX MODEL ===');
log(`  A sub-grids side by side: ${d.sideBySide}  (${d.subs.map(s => `${s.w}x${s.h}@${s.x},${s.y}`).join('  ')})`);
log(`  elements overflowing their panel: ${d.overflow.length}`);
d.overflow.forEach(o => log(`    ${o.panel} .${o.tag} +${o.overRight}px right, +${o.overBottom}px bottom`));

log('=== PAGE === stage ' + d.stageW + 'px  doc ' + d.docH + 'px  hscroll=' + d.hScroll);
log(`console errors: ${consoleErrs.length}`);
consoleErrs.forEach(e => log('  ' + e));

// ---- pass/fail gate ----
const fails = [];
if (d.literalTpl) fails.push(`${d.literalTpl} unexpanded template token(s) in output`);
if (d.imgBad.length) fails.push(`${d.imgBad.length} broken image(s)`);
// 12 frames per candidate, but A renders the set twice (4:5 AND 1:1) = 48.
if (d.imgTotal !== 48) fails.push(`expected 48 <img> (12 x2 in A, 12 in B, 12 in C), got ${d.imgTotal}`);
if (!d.aFlush) fails.push('A not flush to its container edge');
if (d.aGrids.some(g => !g.colsFlush)) fails.push('A columns not flush');
if (!d.bFlush) fails.push('B rows do not fill the panel width');
if (d.jrows.some(r => !r.sameRowTops || !r.sameRowBottom)) fails.push('B row not single-height');
if (!(d.totalVoid > 0)) fails.push('C shows no voids — not a faithful baseline');
if (!d.restFilter.includes('grayscale(1)')) fails.push('greyscale-at-rest missing');
if (!hoverOk) fails.push(`colour-on-hover not active on a real pointer move (${hoverFilter.filter})`);
if (consoleErrs.length) fails.push(`${consoleErrs.length} console error(s)`);
if (d.overflow.length) fails.push(`${d.overflow.length} element(s) overflow their panel`);
if (!d.sideBySide) fails.push('A sub-grids not side by side');

log('=== VERDICT === ' + (fails.length ? 'FAIL: ' + fails.join('; ') : 'PASS'));

// ---- screenshots ----
mkdirSync(SHOT_DIR, { recursive: true });
const m = await S('Page.getLayoutMetrics');
const full = Math.min(Math.ceil(m.cssContentSize.height), 6000);
await S('Emulation.setDeviceMetricsOverride', {
  width: 1920, height: full, deviceScaleFactor: 1, mobile: false,
});
await new Promise((r) => setTimeout(r, 500));
const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
const path = `${SHOT_DIR}/pf-options-full.png`;
writeFileSync(path, Buffer.from(shot.data, 'base64'));

// Per-panel close-ups so each candidate can be eyeballed on its own.
for (const [sel, nm] of [['#cand-a', 'a'], ['#cand-b', 'b'], ['#cand-c', 'c']]) {
  const box = await S('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => { const b = document.querySelector('${sel}').getBoundingClientRect();
      return JSON.stringify({x: Math.floor(b.x), y: Math.floor(b.y),
                             width: Math.ceil(b.width), height: Math.ceil(b.height)}); })()`,
  });
  const r = JSON.parse(box.result.value);
  const s = await S('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { ...r, scale: 1 },
  });
  writeFileSync(`${SHOT_DIR}/pf-${nm}.png`, Buffer.from(s.data, 'base64'));
  log(`shot ${nm}: ${r.width}x${r.height}`);
}
log('full: ' + path);
await send('Target.closeTarget', { targetId });
ws.close();
writeFileSync(`${SHOT_DIR}/verify.txt`, out.join('\n'));
process.exit(fails.length ? 1 : 0);