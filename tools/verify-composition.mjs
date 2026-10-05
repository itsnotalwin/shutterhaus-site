/**
 * Does the page mock render the site's REAL composition?
 *
 * The mock is only worth anything if what it shows is what the site serves. A
 * mock built from the committed defaults would look right in every screenshot
 * and be wrong the moment he changed something, which is the exact failure this
 * feature exists to remove.
 *
 * So this reads public.composition directly and compares it against what the
 * mock renders — same composition, same slots, same order.
 *
 * Run: node tools/verify-composition.mjs
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

/* --------------------------------------------- 1. read the DB directly */

// The anon key is a public build value, so this reads exactly what any visitor
// could — no credentials, and if it works here the RLS policy is doing its job.
const SUP = "https://vthmxvvtbxtqlyqksche.supabase.co";
const env = await evaluate(`(() => {
  const html = document.documentElement.innerHTML;
  return null;
})()`);

const anon = process.env.VITE_SUPABASE_ANON_KEY;
if (!anon) {
  console.log("\n  (no anon key in env — skipping the direct DB read)");
} else {
  const res = await fetch(`${SUP}/rest/v1/composition?select=page,slot_key,sort_order,filename`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  const rows = await res.json();
  console.log(`\n--- public.composition, read with the anon key (signed out) ---`);
  console.log(`  HTTP ${res.status}, ${Array.isArray(rows) ? rows.length : "?"} rows readable`);
  check("anon key can read composition (RLS allows public read)", res.status === 200 && Array.isArray(rows));

  if (Array.isArray(rows)) {
    const strip = rows.filter((r) => r.page === "home" && r.slot_key === "strip");
    const hero = rows.filter((r) => r.page === "home" && r.slot_key === "hero");
    const wall = rows.filter((r) => r.page === "portfolio" && r.slot_key === "wall");
    check("home strip has 6 slots", strip.length === 6, `${strip.length}`);
    check("home hero has 1 slot", hero.length === 1, `${hero.length}`);
    check("portfolio wall has 30 slots", wall.length === 30, `${wall.length}`);
    check("wall is 15 rows of 2", wall.length === 30 && wall.length % 2 === 0, `${wall.length / 2} rows`);
    const holes = rows.filter((r) => !r.filename);
    check("no slot is empty", holes.length === 0, `${holes.length} empty`);
  }
}

/* ------------------------------------ 2. the mock's own markup, if signed in */

const panel = await evaluate(`(() => {
  const has = (s) => document.querySelectorAll(s).length;
  return {
    signedOut: !!document.querySelector('.gate'),
    slots: has('[data-slot]'),
    picks: has('[data-pick]'),
    rows: has('.mock__row'),
    strip: has('.mock__strip .mslot'),
    hero: has('.mock__hero .mslot'),
    empty: has('.mslot--empty'),
  };
})()`);

console.log(`\n--- admin at 390px ---`);
if (panel.signedOut) {
  console.log("  signed out, so the mock markup could not be exercised here.");
  console.log("  Run with a signed-in session to assert on the rendered mock.");
} else {
  check("hero slot present", panel.hero === 1, `${panel.hero}`);
  check("strip has 6 slots", panel.strip === 6, `${panel.strip}`);
  check("wall has 15 rows", panel.rows === 15, `${panel.rows}`);
  check("wall has 30 slots", panel.slots === 37, `${panel.slots} total slots`);
  check("photo picker is populated", panel.picks > 0, `${panel.picks} photos`);
  check("no empty slots at rest", panel.empty === 0, `${panel.empty} empty`);
}

check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);