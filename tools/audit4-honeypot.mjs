/**
 * Does the contact-form honeypot actually work, and does it stay out of the way?
 *
 * Three things must hold:
 *   1. a real visitor cannot see it, focus it, or tab into it
 *   2. a filled honeypot sends NOTHING and shows the success message
 *   3. an empty honeypot with real values still reaches the form path
 *
 * Intercepts fetch() so no mail is ever actually sent while testing — a live
 * submission would land in Alwin's inbox.
 *
 * Run: node tools/audit4-honeypot.mjs
 */
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;
const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const created = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
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

await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__sent = [];
    const realFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (String(url).includes('formspree')) {
        window.__sent.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '' });
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return realFetch.apply(this, arguments);
    };
    window.__posts = 0;
  `,
});

await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: `${ORIGIN}/contact` });
await sleep(3000);

const check = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const hp = document.querySelector('.cform .hp');
    if (!hp) return { present: false };
    const input = hp.querySelector('input');
    const r = hp.getBoundingClientRect();
    const cs = getComputedStyle(hp);
    return {
      present: true,
      name: input.name,
      ariaHidden: hp.getAttribute('aria-hidden'),
      tabindex: input.getAttribute('tabindex'),
      rect: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) },
      display: cs.display, visibility: cs.visibility, pointerEvents: cs.pointerEvents,
      // is it reachable by keyboard from the page?
      focusable: input.tabIndex >= 0,
      offscreen: r.right < 0 || r.left < 0,
    };
  })()`,
});
console.log("\n=== 1. is it hidden from a real visitor? ===");
console.log(JSON.stringify(check.result.value, null, 2));

const fill = (honeypot) => `
  (async () => {
    const f = document.getElementById('cform');
    f.querySelector('[name=name]').value = 'Test Person';
    f.querySelector('[name=email]').value = 'test@example.com';
    f.querySelector('[name=message]').value = 'Testing the trap.';
    ${honeypot ? "f.querySelector('[name=_website]').value = 'http://spam.example';" : ""}
    f.requestSubmit();
    await new Promise(r => setTimeout(r, 1200));
    return {
      posts: window.__sent.length,
      bodies: window.__sent.map(s => (s.body.match(/_website=[^&]*/) || ['no _website field'])[0]),
      note: document.getElementById('cform-note').textContent,
    };
  })()`;

for (const [label, hp] of [["honeypot FILLED (bot)", true], ["honeypot EMPTY (human)", false]]) {
  await send("Page.navigate", { url: `${ORIGIN}/contact` });
  await sleep(2500);
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: fill(hp), awaitPromise: true });
  const v = r.result.value;
  console.log(`\n=== 2. ${label} ===`);
  console.log(`   POSTs made: ${v.posts}   ${hp ? "(want 0 — dropped silently)" : "(want 1 — reaches the form)"}`);
  console.log(`   note shown: "${v.note}"`);
}
ws.close();
process.exit(0);