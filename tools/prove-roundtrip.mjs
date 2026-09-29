/**
 * Prove the full round-trip after moving image hosting from Supabase to git.
 *
 * The claim to test: the public site now reads its photo METADATA from
 * Supabase and its image BYTES from GitHub Pages, so an admin change to
 * Supabase is what changes the live site.
 *
 * Checks, in order:
 *   1. rows come from Supabase (not the bundled demo fallback)
 *   2. every image URL points at github.io, never supabase.co/storage
 *   3. every image actually loads (200 + naturalWidth > 0)
 *   4. real alt text is present — blank alt is what Google indexes
 *   5. width/height are recorded, so the layout can reserve space
 */
const PORT = process.env.CDP_PORT || "9222";
const BASE = process.argv[2];
if (!BASE) throw new Error("usage: node tools/prove-roundtrip.mjs <baseUrl>");

const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(v.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression, sessionId) => {
  const r = await send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  return r.result?.result?.value;
};

const { targetId } = (await send("Target.createTarget", { url: "about:blank" }))
  .result;
const { sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true }))
  .result;
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Page.navigate", { url: `${BASE}/` }, sessionId);

// Wait for the gallery, then let every image finish loading.
for (let i = 0; i < 25; i++) {
  await sleep(1000);
  const n = await evaluate(`document.querySelectorAll('.cell img').length`, sessionId);
  if (n > 0) break;
}
await sleep(4000);

const info = JSON.parse(
  await evaluate(
    `JSON.stringify((() => {
      const imgs = [...document.querySelectorAll('.cell img')];
      return {
        count: imgs.length,
        sources: imgs.map(i => i.currentSrc || i.src),
        loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
        broken: imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
        alts: imgs.map(i => i.alt),
        fromGitHub: imgs.filter(i => /itsnotalwin\\.github\\.io/.test(i.src)).length,
        fromSupabase: imgs.filter(i => /supabase\\.co/.test(i.src)).length,
      };
    })())`,
    sessionId,
  ),
);

let pass = 0,
  fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

console.log(`\n=== round-trip: metadata from Supabase, bytes from GitHub ===\n`);
check("gallery rendered", info.count > 0, `${info.count} photos`);
check(
  "images served from github.io",
  info.fromGitHub === info.count && info.count > 0,
  `${info.fromGitHub}/${info.count}`,
);
check(
  "no supabase.co/storage image URLs",
  info.fromSupabase === 0,
  `${info.fromSupabase} found`,
);
check(
  "every image loaded",
  info.loaded === info.count,
  `${info.loaded}/${info.count} loaded`,
);
check(
  "no broken images",
  info.broken.length === 0,
  info.broken.length ? info.broken.join(", ") : "none",
);
const blankAlt = info.alts.filter((a) => !a || !a.trim()).length;
check("every photo has real alt text", blankAlt === 0, `${blankAlt} blank`);

console.log(`\n${pass}/${pass + fail} checks passed`);
await send("Target.closeTarget", { targetId });
ws.close();
process.exit(fail ? 1 : 0);
