/**
 * Prove the LIVE contact form posts to Formspree from a real browser.
 *
 * Why this exists: the endpoint returning 200 via curl is not the same as the
 * shipped page doing it. The form falls back to a `mailto:` handoff, which
 * "succeeds" in a headless browser while silently discarding the enquiry on
 * any device with no mail client. So assert the fetch actually happened, and
 * that no mail-client navigation occurred.
 *
 * Run: node tools/prove-contact.mjs [baseUrl]
 */
const BASE = (process.argv[2] ?? "https://shutterhausvisuals.co.za").replace(/\/$/, "");
const CDP = `http://127.0.0.1:${process.env.CDP_PORT ?? "9222"}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(targets.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

// Instrument fetch BEFORE the bundle runs, so we can prove which branch ran.
await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__fsPosts = [];
    const _fetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (String(url).includes("formspree.io")) {
        window.__fsPosts.push({ url: String(url), method: (init && init.method) || "GET" });
      }
      return _fetch.apply(this, arguments);
    };
  `,
});

await send("Page.navigate", { url: `${BASE}/#/contact` });
await sleep(3500);

const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// 1. The form is on the page.
const hasForm = await evaluate(`!!document.getElementById('cform')`);
check("contact form rendered", hasForm === true, `cform present=${hasForm}`);

// 2. Fill and submit. Fill the real inputs then click the real button, so the
//    submit handler and FormData path are exercised, not bypassed.
await evaluate(`
  (() => {
    const f = document.getElementById('cform');
    const set = (n, v) => {
      const el = f.querySelector('[name="' + n + '"]');
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('name', 'Hermes Live Test');
    set('email', 'itsnotalwin@gmail.com');
    set('kind', 'Mini session');
    set('message', 'Live end-to-end check of the Formspree handoff. Safe to delete.');
    return true;
  })()
`);
await sleep(300);

const beforeUrl = await evaluate("location.href");
await evaluate(`document.querySelector('#cform button[type=submit]').click(); true`);
await sleep(6000);

// 3. It must have POSTed to Formspree.
const posts = await evaluate(`JSON.stringify(window.__fsPosts || [])`);
const parsed = JSON.parse(posts ?? "[]");
check(
  "posted to Formspree",
  parsed.length > 0 && parsed[0].method === "POST",
  `${parsed.length} fetch(es): ${JSON.stringify(parsed)}`,
);

// 4. The visible confirmation must be the success text, not the mailto fallback.
const note = await evaluate(`(document.getElementById('cform-note')||{}).textContent || ""`);
check(
  "success message shown",
  /got it/i.test(note),
  `note="${note}"`,
);

// 5. It must NOT have navigated to a mailto: — that is the bug this replaced.
const afterUrl = await evaluate("location.href");
check(
  "no mailto handoff",
  !afterUrl.startsWith("mailto:") && !/nothing opened/i.test(note),
  `url ${beforeUrl} -> ${afterUrl}`,
);

await send("Page.close");
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} pass`);
process.exit(failed.length ? 1 : 0);
