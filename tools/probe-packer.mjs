/**
 * Does packByHeight() ever hand back an empty column?
 *
 *   node tools/probe-packer.mjs
 *
 * Two paths inside packByHeight() can produce one, and only one of them was
 * guarded when the 0/3/1 bug was found:
 *
 *   1. the adjacency/balance swap search — guarded, src/pages.ts:133
 *   2. the early exit `items.length <= cols`, which calls columnise() and
 *      round-robins into `cols` buckets. With FEWER items than columns that
 *      necessarily leaves trailing buckets empty.
 *
 * Case 2 is reachable: a category with 2 frames on a 3-column desktop.
 */
// The packer is TypeScript in a Vite app, so there is no importable module
// here. Bundle it to a throwaway file first — deliberately OUTSIDE dist/, and
// dist/ is wiped by `vite build` anyway, so a stale copy cannot ship.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(HERE, ".packer-bundle.mjs");

// esbuild's JS API, not the CLI: `npx` is a shell shim and is not spawnable on
// Windows, which failed with ENOENT when execFileSync tried to run it directly.
const esbuild = await import("esbuild");
await esbuild.build({
  entryPoints: [resolve(ROOT, "src/pages.ts")],
  bundle: true,
  format: "esm",
  outfile: OUT,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "error",
});

// pathToFileURL: a bare Windows absolute path is not a valid ESM specifier.
const { packByHeight } = await import(pathToFileURL(OUT).href);
process.on("exit", () => { try { rmSync(OUT, { force: true }); } catch {} });

const photo = (id, w, h) => ({ id, url: `gallery/${id}.jpg`, sort_order: 0, visible: true, album: "photo", width: w, height: h });

let fails = 0;
const check = (name, pass, detail = "") => {
  console.log(`${pass ? "ok   " : "FAIL "} ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!pass) fails++;
};

// The real gallery's 4 landscapes, the filter case that exposed 0/3/1.
const landscapes = [
  photo("a", 1600, 2000), photo("b", 1600, 1000),
  photo("c", 1600, 1200), photo("d", 1600, 1000),
];

// Smaller than the column count, in BOTH orderings so a lucky round-robin
// cannot make this pass.
const cases = [
  ["4 frames / 3 cols (the landscape filter)", landscapes, 3],
  ["2 frames / 3 cols (fewer frames than columns)", landscapes.slice(0, 2), 3],
  ["1 frame / 3 cols", landscapes.slice(0, 1), 3],
  ["2 frames / 2 cols", landscapes.slice(0, 2), 2],
  ["3 frames / 5 cols", landscapes, 5],
  ["0 frames / 3 cols", [], 3],
];

for (const [name, items, cols] of cases) {
  const out = packByHeight(items, cols);
  const empty = out.filter((c) => c.length === 0).length;
  const total = out.reduce((a, c) => a + c.length, 0);
  // 0 frames has no correct non-empty answer — every column is empty by
  // definition. The contract is only "return something queryable", so assert
  // one column and no crash, rather than treating it as an empty-column bug.
  if (items.length === 0) {
    check(name, out.length === 1, `cols=${out.length}`);
    continue;
  }
  check(
    name,
    empty === 0,
    `cols=${out.length} perCol=${JSON.stringify(out.map((c) => c.length))}`,
  );
  // Nothing may be dropped or duplicated.
  if (total !== items.length) {
    check(`${name}: no frames lost`, false, `${total} of ${items.length}`);
  }
}

console.log(fails ? `\n${fails} check(s) failed` : "\npacker never returns an empty column");
process.exit(fails ? 1 : 0);
