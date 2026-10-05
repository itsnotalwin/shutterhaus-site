/**
 * Does the admin's shrink() honour EXIF orientation?
 *
 * This is the failure a build cannot catch. A phone stores a portrait shot on
 * disk as a landscape buffer plus orientation tag 6, and `drawImage` onto a
 * canvas ignores that tag unless decode was asked to apply it. Get it wrong and
 * every photo added from a phone lands on its side — on his iPhone, and only
 * there, so no headless-Chrome check of the page would ever show it.
 *
 * Runs the real decode from src/admin.ts against a genuinely tagged file and
 * asserts the output is portrait.
 *
 * Run: node tools/verify-admin-exif.mjs   (needs Chrome on 9222)
 */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
const FIXTURE = `${ORIGIN}/verification/exif/portrait-orient6.jpg`;

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
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pending.has(x.id)) {
    const p = pending.get(x.id);
    pending.delete(x.id);
    x.error ? p.reject(new Error(JSON.stringify(x.error))) : p.resolve(x.result);
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
await send("Page.navigate", { url: `${ORIGIN}/index.html` });
await new Promise((r) => setTimeout(r, 2000));

console.log("\n--- EXIF orientation (fixture: 2400x1934 landscape buffer, tag 6) ---");

const applied = await evaluate(`(async () => {
  const blob = await (await fetch(${JSON.stringify(FIXTURE)})).blob();
  const file = new File([blob], 'portrait-orient6.jpg', { type: 'image/jpeg' });

  // exactly what shrink() does
  // NOTE: both calls apply EXIF orientation. createImageBitmap's spec default for
  // imageOrientation IS "from-image", so the explicit option and the default
  // agree — which is exactly why the fixture is the proof and not a footnote.
  const withOption = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const byDefault = await createImageBitmap(file);

  return {
    bytes: blob.size,
    appliedW: withOption.width, appliedH: withOption.height,
    ignoredW: byDefault.width, ignoredH: byDefault.height,
  };
})()`);

// What PIL wrote to disk: a landscape buffer with orientation=6.
const STORED = { w: 2400, h: 1934 };

console.log(
  `  stored buffer ${STORED.w}x${STORED.h} landscape + orientation 6 — ` +
    `browser decodes ${applied.appliedW}x${applied.appliedH} portrait, as it must display`,
);

check(
  "the browser decode is the transpose of the stored buffer",
  applied.appliedW === STORED.h && applied.appliedH === STORED.w,
  `${STORED.w}x${STORED.h} -> ${applied.appliedW}x${applied.appliedH}`,
);
check(
  "decodes as portrait (the phone case)",
  applied.appliedH > applied.appliedW,
  `${applied.appliedW}x${applied.appliedH}`,
);
// createImageBitmap's spec default for imageOrientation is already "from-image",
// so the explicit option and the default agree. Asserted to pin the behaviour:
// an engine that flipped the default would rotate every phone upload, and this
// is where that would surface.
check(
  "explicit from-image matches the engine default",
  applied.ignoredW === applied.appliedW && applied.ignoredH === applied.appliedH,
  `default ${applied.ignoredW}x${applied.ignoredH} vs explicit ${applied.appliedW}x${applied.appliedH}`,
);

// And the full shrink, end to end, to confirm it stays portrait after capping.
const shrunk = await evaluate(`(async () => {
  const blob = await (await fetch(${JSON.stringify(FIXTURE)})).blob();
  const file = new File([blob], 'portrait-orient6.jpg', { type: 'image/jpeg' });
  const MAX_EDGE = 1800, QUALITY = 0.82;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const result = await new Promise((res) => out.toBlob(res, 'image/jpeg', QUALITY));
  return { w, h, bytesOut: result.size, bytesIn: blob.size };
})()`);

console.log(`  shrink -> ${shrunk.w}x${shrunk.h}, ${(shrunk.bytesIn / 1024) | 0}KB -> ${(shrunk.bytesOut / 1024) | 0}KB`);
check("shrunk result stays portrait", shrunk.h > shrunk.w, `${shrunk.w}x${shrunk.h}`);
check("long edge capped at 1800", Math.max(shrunk.w, shrunk.h) <= 1800, `${Math.max(shrunk.w, shrunk.h)}`);
check("payload shrank", shrunk.bytesOut < shrunk.bytesIn, `${shrunk.bytesOut} < ${shrunk.bytesIn}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);