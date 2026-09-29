/**
 * Verify the LIVE site is actually talking to Supabase: check that the
 * public REST endpoint responds with RLS enforced (not a 500), that the
 * anon key works, and that a write is rejected.
 *
 * Run: node tools/verify-supabase.mjs
 */
const URL_BASE = process.env.SB_URL ?? "https://vthmxvvtbxtqlyqksche.supabase.co";
const KEY = process.env.SB_KEY ?? "";

if (!KEY) {
  console.error("Set SB_KEY to the project's publishable/anon key.");
  process.exit(2);
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

const rest = (path, opts = {}) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });

// 1. The API is reachable and the table exists.
const sel = await rest("photos?select=id&limit=1");
const selBody = await sel.text();
check("REST /photos reachable", sel.ok, `${sel.status} ${selBody.slice(0, 80)}`);

// 2. Public read is allowed (the gallery needs this with no session).
check(
  "public read allowed",
  sel.status === 200,
  `status ${sel.status} — a 401/403 here would break the gallery`,
);

// 3. An unauthenticated write must be refused by RLS.
const bad = await rest("photos", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    filename: "attacker.jpg",
    storage_path: "attacker.jpg",
    url: "https://example.com/x.jpg",
    album: "photo",
    visible: true,
  }),
});
const badBody = await bad.text();
check(
  "anon INSERT blocked by RLS",
  bad.status === 401 || bad.status === 403 || bad.status === 409,
  `status ${bad.status} ${badBody.slice(0, 90)}`,
);

// 4. Confirm nothing was actually written.
const after = await rest("photos?select=filename&filename=eq.attacker.jpg");
const afterText = await after.text();
let afterRows = null;
try {
  const parsed = JSON.parse(afterText);
  afterRows = Array.isArray(parsed) ? parsed.length : null;
} catch {
  afterRows = null;
}
check(
  "no attacker row persisted",
  afterRows === 0,
  `status ${after.status}, rows: ${afterRows === null ? "unparseable " + afterText.slice(0, 60) : afterRows}`,
);

// 5. Auth settings are reachable (we can't read secrets, but a 200 means configured).
const auth = await fetch(`${URL_BASE}/auth/v1/health`, {
  headers: { apikey: KEY },
});
check("auth service reachable", auth.ok, `status ${auth.status}`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} Supabase checks passed`);
process.exit(failed.length ? 1 : 0);
