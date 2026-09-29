/**
 * Prove the offline-failure claim: with *.supabase.co blocked, does the photo
 * route still render? This is the test that must FAIL if the bug is real.
 */
const PORT = process.env.CDP_PORT || "9222";
const BASE = process.argv[2];
if (!BASE) throw new Error("usage: node tools/prove-offline.mjs <baseUrl>");

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

const { targetId } = (
  await send("Target.createTarget", { url: "about:blank" })
).result;
const { sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true }))
  .result;

await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Network.enable", {}, sessionId);
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    // Simulate a total Supabase outage for this page only.
    const _fetch = window.fetch;
    window.fetch = (input, init) => {
      const u = typeof input === "string" ? input : (input && input.url) || "";
      if (u.includes("supabase.co")) return Promise.reject(new TypeError("network down"));
      return _fetch(input, init);
    };
    true;
  `,
}, sessionId);

const { result } = await send("Runtime.evaluate", {
  expression: `fetch("https://vthmxvvtbxtqlyqksche.supabase.co/rest/v1/photos?select=id").then(()=>"REACHABLE").catch(e=>"BLOCKED: "+e.message)`,
  awaitPromise: true,
  returnByValue: true,
}, sessionId);
console.log("sanity — supabase fetch from page:", result.value);

await send("Page.navigate", { url: `${BASE}/` }, sessionId);

// supabase-js RETRIES failed fetches with exponential backoff, so the promise
// can stay pending for many seconds. Poll instead of sleeping a fixed amount —
// a short sleep measures the retry timer, not the render.
const PROBE = `JSON.stringify({
  appHtmlLen: document.getElementById("app")?.innerHTML.length ?? -1,
  bodyText: (document.body.innerText || "").trim().slice(0, 80),
  imgs: document.querySelectorAll(".cell img").length,
  cells: document.querySelectorAll(".cell").length,
})`;

let r = { appHtmlLen: -2, imgs: 0, cells: 0, bodyText: "" };
let waited = 0;
for (; waited < 30000; waited += 1000) {
  await sleep(1000);
  const p = await send("Runtime.evaluate", {
    expression: PROBE,
    returnByValue: true,
  }, sessionId);
  const val = p.result?.result?.value;
  if (typeof val === "string") r = JSON.parse(val);
  if (r.appHtmlLen > 100) break; // rendered — stop early
}
console.log("\nphoto route with Supabase DOWN (waited " + waited + "ms):");
console.log("  #app innerHTML length :", r.appHtmlLen);
console.log("  visible body text     :", JSON.stringify(r.bodyText));
console.log("  gallery images        :", r.imgs, "in", r.cells, "cells");

await send("Target.closeTarget", { targetId });
ws.close();

const BLANK = r.appHtmlLen < 100;
console.log(
  BLANK
    ? "\nCONFIRMED: blank white page when Supabase is unreachable. Critical bug is real."
    : `\nNOT blank — #app has ${r.appHtmlLen} chars and ${r.imgs} images. Fallback works.`,
);
process.exit(BLANK ? 1 : 0);
