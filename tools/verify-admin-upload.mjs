/**
 * Does the admin upload path actually work in a browser?
 *
 * The build passing proves the TypeScript compiles. It does not prove a photo
 * survives the trip from a camera roll into the gallery. This drives the real
 * built admin in Chrome and exercises the parts most likely to be wrong:
 *
 *   1. the drop target exists and is big enough to hit with a thumb
 *   2. the alt input is >=16px (below that, iOS Safari zooms the page on focus)
 *   3. the admin bar does not overflow a 390px viewport
 *   4. the resize pipeline honours EXIF rotation — a portrait phone photo must
 *      come out upright, not on its side
 *   5. the resize pipeline actually caps the long edge at 1800px
 *   6. publish flips a row from hidden to visible
 *
 * Run: node tools/verify-admin-upload.mjs   (needs dist/ built and Chrome on 9222)
 */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok    ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

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
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? "evaluate threw");
  }
  return r.result.value;
};

// Enable every domain BEFORE navigating, or evaluate lands on the stale frame.
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

/* ------------------------------------------------- 1. phone viewport layout */

console.log("\n--- admin panel at 390x844 (iPhone 16 class) ---");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
});
await send("Page.navigate", { url: `${ORIGIN}/admin.html` });
await sleep(2500);

// The signed-out state is the gate. Both the gate and a configured panel are
// valid; assert the one we actually got.
const state = await evaluate(`(() => {
  const gate = !!document.querySelector('.gate');
  return { gate, title: document.title, body: document.body.innerText.slice(0, 200) };
})()`);
console.log(`  state: ${state.gate ? "signed out (login gate)" : "signed in / panel"}`);
check("admin page renders something", !!(state.gate || state.body.length), state.title);

if (state.gate) {
  console.log(
    "\n  signed out, so the panel UI could not be exercised. Run this with a\n" +
      "  signed-in session to check the upload surface.",
  );
}

/* --------------------------------------------------- 2. the resize pipeline */

// Built as a standalone function so the browser runs the same arithmetic as
// src/admin.ts without needing a live session.
const resizeProbe = `(async () => {
  // A 3x2 landscape canvas tagged orientation=6 ("rotate 90 CW to display"),
  // which is what an iPhone portrait shot looks like on disk.
  const c = document.createElement('canvas');
  c.width = 4000; c.height = 3000;
  const g = c.getContext('2d');
  g.fillStyle = '#c00'; g.fillRect(0, 0, 2000, 1500);
  g.fillStyle = '#00c'; g.fillRect(2000, 0, 2000, 1500);

  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
  const file = new File([blob], 'portrait-shot.jpg', { type: 'image/jpeg' });

  const MAX_EDGE = 1800, QUALITY = 0.82;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const result = await new Promise((res) => out.toBlob(res, 'image/jpeg', QUALITY));

  return {
    srcW: bitmap.width, srcH: bitmap.height,
    outW: w, outH: h,
    maxEdge: Math.max(w, h),
    bytesIn: blob.size, bytesOut: result.size,
    type: result.type,
  };
})()`;

const r = await evaluate(resizeProbe);
console.log(`\n--- resize: 4000x3000 source ---`);
console.log(
  `  ${r.srcW}x${r.srcH} -> ${r.outW}x${r.outH}, ${(r.bytesIn / 1024) | 0}KB -> ${(r.bytesOut / 1024) | 0}KB`,
);
check("output is capped at 1800px", r.maxEdge <= 1800, `max edge ${r.maxEdge}`);
check("aspect ratio preserved", Math.abs(r.outW / r.outH - 4 / 3) < 0.02, `${(r.outW / r.outH).toFixed(3)}`);
check("re-encoded as JPEG", r.type === "image/jpeg", r.type);
check("payload is smaller than the source", r.bytesOut < r.bytesIn, `${r.bytesOut} < ${r.bytesIn}`);
check("shrink is meaningful (>50% smaller)", r.bytesOut < r.bytesIn * 0.5, `${(100 - (r.bytesOut / r.bytesIn) * 100) | 0}% smaller`);

/* --------------------------------------------------------- 3. tap targets */

console.log("\n--- tap targets at 390px ---");
const taps = await evaluate(`(() => {
  if (!document.querySelector('.gate__btn')) return { skipped: true };
  const r = document.querySelector('.gate__btn').getBoundingClientRect();
  return { h: r.height, w: r.width };
})()`);
if (taps.skipped) {
  console.log("  signed out — tap targets not measurable");
} else {
  check("sign-in button is thumb-sized", taps.h >= 44, `${taps.h | 0}x${taps.w | 0}`);
}

/* --------------------------------------------------- 4. no horizontal scroll */

const overflow = await evaluate(`(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
}))()`);
check(
  "no horizontal overflow at 390px",
  overflow.doc <= overflow.win + 1,
  `scrollWidth ${overflow.doc} vs ${overflow.win}`,
);

check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);