/**
 * Snapshot the LIVE site exactly as it is right now, before a redesign replaces
 * it. This is the rollback record — if the new build is worse, this is the
 * reference for what we had.
 *
 * Read-only: navigates shutterhausvisuals.co.za, writes PNGs into
 * shots/live-snapshot-<date>/, and records a manifest of what was live
 * (bundle hashes, route list, git SHA of the deployed commit).
 *
 * Usage: node tools/snapshot-live.mjs <outDir>
 */
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const OUT = process.argv[2] ?? "shots/live-snapshot";
const SITE = "https://shutterhausvisuals.co.za";
const CDP = "http://127.0.0.1:" + (process.env.CDP_PORT ?? "9222");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The routes the LIVE site has today. Deliberately NOT the new five — this
// records what is actually being served, which is the point of a snapshot.
const ROUTES = [
  ["photo", ""],
  ["pricing", "#/pricing"],
  ["contact", "#/contact"],
];
const VIEWS = [
  [360, 740, 3, "phone-360"],
  [390, 844, 3, "phone-390"],
  [768, 1024, 2, "tablet-768"],
  [1440, 900, 1, "desktop-1440"],
];

mkdirSync(OUT, { recursive: true });

const t = await (
  await fetch(CDP + "/json/new?url=about:blank", { method: "PUT" })
).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
// Must wait for open, or the first send() throws InvalidStateError.
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pend.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await send("Network.enable", {});
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.enable", {});
await send("Runtime.enable", {});

const manifest = { site: SITE, when: new Date().toISOString(), shots: [] };

for (const [w, h, dpr, label] of VIEWS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: dpr,
    mobile: w < 700,
  });
  for (const [rname, route] of ROUTES) {
    await send("Page.navigate", { url: SITE + "/" + route });
    await sleep(2600);
    const r = await send("Runtime.evaluate", {
      expression: `(() => ({
        title: document.title,
        h1: (document.querySelector('h1')||{}).textContent || null,
        imgs: document.querySelectorAll('img').length,
        nav: Array.from(document.querySelectorAll('.nav-link')).map(a=>a.textContent.trim()),
        logo: (document.querySelector('.logo')||{}).textContent.replace(/\\s+/g,' ').trim(),
        scrollH: document.documentElement.scrollHeight,
      }))()`,
      returnByValue: true,
    });
    const name = `${label}-${rname}`;
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    const { writeFileSync: wf } = await import("node:fs");
    wf(`${OUT}/${name}.png`, Buffer.from(shot.result.data, "base64"));
    manifest.shots.push({ name, w, route: route || "#/", ...r.result.result.value });
    console.log("SHOT " + name);
  }
}

// What assets are actually being served, so the record is unambiguous.
const html = await (await fetch(SITE + "/")).text();
manifest.assets = [...html.matchAll(/assets\/[A-Za-z0-9_-]+\.(js|css)/g)].map(
  (m) => m[0],
);
try {
  manifest.deployedCommit = execSync("git rev-parse main", { cwd: ".." })
    .toString()
    .trim();
} catch {}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
ws.close();
console.log(
  `\nsnapshot written to ${OUT} (${manifest.shots.length} shots, ${readdirSync(OUT).length} files)`,
);
