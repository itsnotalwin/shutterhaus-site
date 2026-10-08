import assert from 'node:assert/strict';

// Read-only deployment smoke test. Never submits an enquiry or edits photos.
const origin = new URL(process.env.LIVE_URL ?? 'https://shutterhausvisuals.co.za/');
const expected = process.env.EXPECTED_SHA;
assert.ok(expected, 'EXPECTED_SHA identifies the release to verify');
async function get(path) {
  const url = new URL(path, origin);
  url.searchParams.set('release', expected);
  const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
  assert.ok(response.ok, `${url.pathname}: HTTP ${response.status}`);
  return response;
}

// Pages/CDN propagation can lag the deployment acknowledgement briefly.
let released = false;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const release = await (await get('release.json')).json();
    if (release.commit === expected) { released = true; break; }
  } catch { /* Retry until the new release is served. */ }
  await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.ok(released, `Live domain must serve release ${expected}`);
console.log(`PASS live release ${expected}`);

const assets = new Set();
for (const route of ['index', 'portfolio', 'about', 'services', 'contact', 'admin']) {
  const html = await (await get(`${route}.html`)).text();
  assert.match(html, /<title>[^<]*Shutterhaus/i, `${route}: page title`);
  if (route !== 'admin') assert.match(html, /<h1[\s>]/, `${route}: pre-rendered heading`);
  if (route === 'contact') assert.match(html, /action="https:\/\/formspree\.io\/f\/xjyklqkp"/, 'Contact endpoint');
  if (route === 'admin') assert.match(html, /noindex/, 'Admin stays out of search');
  for (const match of html.matchAll(/(?:src|href)="([^"]*assets\/[^"?#]+\.(?:js|css))"/g)) assets.add(match[1]);
  console.log(`PASS live ${route}.html`);
}
for (const asset of assets) {
  const response = await get(asset);
  assert.match(response.headers.get('content-type') ?? '', asset.endsWith('.css') ? /text\/css/ : /javascript/, asset);
}
console.log(`PASS ${assets.size} live JavaScript and stylesheet assets`);
