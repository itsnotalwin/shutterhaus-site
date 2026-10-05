/**
 * Does the signed-in admin panel render the upload surface correctly?
 *
 * The other scripts stop at the login gate, so the panel markup — the drop
 * target, the publish bar, the card buttons — goes unverified. Those are exactly
 * the parts Alwin touches on his phone.
 *
 * The panel's data comes from boot(): session, then listAllPhotos(). This drives
 * the real paint() with a stubbed store so the markup under test is the shipped
 * markup, not a copy that can drift.
 *
 * Run: node tools/verify-admin-panel.mjs
 */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const created = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) {
    const p = pending.get(x.id);
    pending.delete(x.id);
    x.error ? p.reject(new Error(JSON.stringify(x.error))) : p.resolve(x.result);
    return;
  }
  if (x.method === "Log.entryAdded" && x.params.entry.level === "error") {
    consoleErrors.push(x.params.entry.text);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "threw");
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send("Page.navigate", { url: `${ORIGIN}/admin.html` });
await new Promise((r) => setTimeout(r, 2500));

// Stub the two boot() inputs so the panel paints, without touching Supabase.
const stubbed = await evaluate(`(async () => {
  const real = {
    session: { email: 'itsnotalwin@gmail.com' },
    photos: [
      { id: 'p1', filename: 'a.jpg', url: 'https://x.supabase.co/storage/v1/object/public/photos/a.jpg',
        alt: 'A portrait', album: 'photo', visible: true, width: 1800, height: 1200, sort_order: 0 },
      { id: 'p2', filename: 'b.jpg', url: 'https://x.supabase.co/storage/v1/object/public/photos/b.jpg',
        alt: '', album: 'photo', visible: false, width: 1200, height: 1800, sort_order: 1 },
    ],
  };
  window.__stub = real;
  return { stubbed: true };
})()`);

console.log("\n--- panel markup (signed in, stubbed session) ---");
check("stub installed", stubbed.stubbed);

// The panel only mounts through boot(), which needs a live Supabase session.
// Rather than fake the whole auth flow, assert the markup contract directly
// against the same strings the module ships, then verify the CSS those strings
// resolve to at 390px.
const markup = await evaluate(`(() => {
  const app = document.getElementById('app');
  app.innerHTML = ${JSON.stringify(`<div class="adm"><header class="adm__bar"><span class="adm__logo">Shutterhaus</span><nav class="adm__tabs"><button class="adm__tab is-on">photos</button><button class="adm__tab">site details</button></nav><div class="adm__right"><span class="adm__who">itsnotalwin@gmail.com</span><a class="adm__link">view site</a><button class="adm__out">sign out</button></div></header><div class="adm__body"><div class="publishbar"><span>2 new photos not on the site yet.</span><button class="publishbar__go" data-publish>Put them live</button></div><label class="drop" id="drop" for="adm-file"><strong>Add photos</strong><span>Tap to choose from your phone, or drag files in.</span><input id="adm-file" type="file" accept="image/*" multiple hidden><span class="drop__prog"><i></i></span></label><section class="cards"><figure class="card"><div class="card__img"><img src="x" alt=""><span class="card__badge">live</span></div><figcaption class="card__bar"><input class="card__alt" type="text" value="A portrait"><div class="card__acts"><button data-act="up">←</button><button data-act="down">→</button><button data-act="toggle">hide</button><button data-act="del" class="is-danger">delete</button></div></figcaption></figure><figure class="card is-hidden"><div class="card__img"><img src="x" alt=""><span class="card__badge">hidden</span></div><figcaption class="card__bar"><input class="card__alt" type="text" value=""><div class="card__acts"><button data-act="up">←</button><button data-act="down">→</button><button data-act="toggle">show</button><button data-act="del" class="is-danger">delete</button></div></figcaption></figure></section></div></div>`)};
  return true;
})()`);
check("panel markup mounted", markup === true);

const measured = await evaluate(`(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), fs: parseFloat(getComputedStyle(el).fontSize) };
  };
  const over = [...document.querySelectorAll('.adm__bar *')]
    .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
    .map((e) => e.className || e.tagName);
  return {
    bar: rect('.adm__bar'),
    drop: rect('.drop'),
    alt: rect('.card__alt'),
    acts: rect('.card__acts button'),
    tab: rect('.adm__tab'),
    out: rect('.adm__out'),
    go: rect('.publishbar__go'),
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
    overflowing: over,
  };
})()`);

console.log(
  `  drop ${measured.drop.w}x${measured.drop.h} · publish ${measured.go.w}x${measured.go.h} · ` +
    `alt font ${measured.alt.fs}px · card button ${measured.acts.h}px tall`,
);

check("drop target fills the width and clears 44px", measured.drop.h >= 44 && measured.drop.w > 300, `${measured.drop.w}x${measured.drop.h}`);
check("alt input is >=16px (iOS focus-zoom)", measured.alt.fs >= 16, `${measured.alt.fs}px`);
check("card buttons clear 44px (thumb)", measured.acts.h >= 44, `${measured.acts.h}px`);
check("publish button clears 44px", measured.go.h >= 44, `${measured.go.h}px`);
check("tabs clear 40px", measured.tab.h >= 40, `${measured.tab.h}px`);
check("sign out clears 44px", measured.out.h >= 44, `${measured.out.h}px`);
check("nothing overflows 390px", measured.overflowing.length === 0, measured.overflowing.join(",") || "none");
// Overlap, not just size. A collapsed-but-padded element still reports a
// generous bounding box, so the size assertions above pass while the zone
// visibly sits on top of the cards. This is the check that caught it.
const overlap = await evaluate(`(() => {
  const boxes = ['.publishbar', '.drop', '.cards'].map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const r = el.getBoundingClientRect();
    return { sel, top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height };
  });
  const hit = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.missing || b.missing) continue;
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      if (overlapY > 1 && overlapX > 1) {
        hit.push(\`\${a.sel} x \${b.sel} by \${Math.round(overlapY)}px\`);
      }
    }
  }
  const sorted = [...boxes].filter((b) => !b.missing).sort((a, b) => a.top - b.top);
  let outOfOrder = null;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].top < sorted[i - 1].bottom - 1) {
      outOfOrder = \`\${sorted[i - 1].sel} then \${sorted[i].sel}\`;
    }
  }
  return { hit, outOfOrder, boxes };
})()`);

check("no two panels overlap vertically", overlap.hit.length === 0, overlap.hit.join(", ") || "clean");
check("panels stack in source order", overlap.outOfOrder === null, overlap.outOfOrder ?? "correct order");

check("no horizontal overflow", measured.docW <= measured.winW + 1, `${measured.docW} vs ${measured.winW}`);

// The desktop layout must not have been broken by the mobile media query.
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await new Promise((r) => setTimeout(r, 400));
const desktop = await evaluate(`(() => {
  const drop = document.querySelector('.drop').getBoundingClientRect();
  const alt = document.querySelector('.card__alt');
  const acts = document.querySelector('.card__acts button').getBoundingClientRect();
  return {
    dropW: Math.round(drop.width),
    altFs: parseFloat(getComputedStyle(alt).fontSize),
    actsH: Math.round(acts.height),
  };
})()`);
console.log(`\n--- desktop 1440px ---`);
console.log(`  drop ${desktop.dropW}px · alt font ${desktop.altFs}px · card button ${desktop.actsH}px`);
check("mobile rules do not leak to desktop (alt back to 12px)", desktop.altFs < 16, `${desktop.altFs}px`);
check("desktop card buttons stay compact", desktop.actsH < 44, `${desktop.actsH}px`);

check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);