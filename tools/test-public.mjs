import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

// DOM regressions only: these checks do not measure layout or replace a
// browser screenshot review. Requests are mocked; no enquiries are sent.
const mainBundle = await build({
  entryPoints: ["src/main.ts"], bundle: true, write: false, format: "iife",
  loader: { ".css": "empty" },
  plugins: [{
    name: "offline-gallery",
    setup(b) {
      b.onResolve({ filter: /^\.\/(store|composition)$/ }, (args) => ({ path: args.path, namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
        contents: args.path === "./store"
          ? "export function publicPhotosOrNull(){ window.__galleryReads++; return new Promise(()=>{}); }"
          : "export async function readComposition(){ return null; }",
      }));
    },
  }],
});
const pagesBundle = await build({
  stdin: {
    contents: 'export { SITE } from "./src/config"; export { servicesPage, contactPage } from "./src/pages-more"; export { homePage, homeBand } from "./src/pages"; export { DEMO_PHOTOS } from "./src/demo"; export { initLightbox } from "./src/lightbox";',
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: "iife", globalName: "PublicPages",
});

function fixture(url = "https://shutterhausvisuals.co.za/contact.html?package=Social", main = true) {
  const dom = new JSDOM('<div id="app"></div>', { url, runScripts: "outside-only" });
  const w = dom.window;
  w.scrollTo = () => {};
  w.matchMedia = () => ({ matches: true });
  w.__galleryReads = 0;
  w.eval(pagesBundle.outputFiles[0].text);
  if (main) w.eval(mainBundle.outputFiles[0].text);
  return dom;
}
function submit(w) {
  w.document.querySelector("form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
}
function fill(w) {
  for (const [name, value] of Object.entries({ name: "Test visitor", email: "visitor@example.com", message: "A test enquiry" })) {
    w.document.querySelector(`[name="${name}"]`).value = value;
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("approved prices and Social's 40 images agree across pages and metadata", async () => {
  const dom = fixture(undefined, false);
  try {
    const w = dom.window;
    const p = w.PublicPages;
    w.document.getElementById("app").innerHTML = p.servicesPage(p.DEMO_PHOTOS);
    const cards = [...w.document.querySelectorAll(".pkg")];
    assert.deepEqual(cards.map((c) => c.querySelector(".pkg__price").textContent), ["R800", "R2,000", "R2,500", "R2,500"]);
    assert.match(cards[3].textContent, /40 edited photos/);
    assert.match(cards[3].textContent, /10-image preview within 48 hours/);
    assert.doesNotMatch(cards[3].textContent, /same-day/);
    assert.equal(cards.every((c) => c.querySelector("h2.pkg__name")), true);
    const contact = p.contactPage();
    for (const price of ["R800", "R2,000", "R2,500"]) assert.ok(contact.includes(price));
    assert.match(p.homeBand(), /R800/);
    for (const filename of ["index", "services", "contact", "about", "portfolio"]) {
      const html = await readFile(`dist/${filename}.html`, "utf8");
      const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      const business = schema["@graph"].find((node) => node["@type"] === "ProfessionalService");
      assert.equal(business.priceRange, "R800–R2,500");
      assert.equal("telephone" in business, false);
    }
    // A real future price change must reach the band, cards and enquiry menu.
    p.SITE.pricing.tiers[0].price = 900.5;
    assert.match(p.homeBand(), /R900\.5/);
    assert.match(p.servicesPage(), /R900\.5/);
    assert.match(p.contactPage(), /R900\.5/);
  } finally { dom.window.close(); }
});

test("Contact preselects Social and preserves a draft through rotation", async () => {
  const dom = fixture();
  try {
    const w = dom.window;
    fill(w);
    const form = w.document.querySelector("form");
    assert.equal(w.document.querySelector('[name="kind"]').value, "Social");
    w.dispatchEvent(new w.Event("orientationchange"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(w.document.querySelector("form"), form);
    assert.equal(w.document.querySelector('[name="message"]').value, "A test enquiry");
    assert.equal(w.__galleryReads, 0);
  } finally { dom.window.close(); }
});

test("validation focuses missing fields and status feedback is announced", () => {
  const dom = fixture();
  try {
    const w = dom.window;
    submit(w);
    assert.equal(w.document.activeElement.name, "name");
    fill(w);
    w.document.querySelector('[name="email"]').value = "invalid";
    submit(w);
    assert.equal(w.document.activeElement.name, "email");
    assert.match(w.document.getElementById("cform-note").textContent, /doesn't look right/);
    assert.equal(w.document.getElementById("cform-note").getAttribute("role"), "status");
  } finally { dom.window.close(); }
});

test("sending blocks duplicate enquiries and recovers after failure", async () => {
  const dom = fixture();
  try {
    const w = dom.window;
    fill(w);
    let calls = 0;
    let reject;
    w.fetch = () => { calls++; return new Promise((_, fail) => { reject = fail; }); };
    submit(w);
    submit(w);
    const button = w.document.querySelector('button[type="submit"]');
    assert.equal(calls, 1);
    assert.equal(button.disabled, true);
    reject(new Error("offline"));
    await tick();
    assert.equal(button.disabled, false);
    assert.equal(w.document.querySelector('[name="message"]').value, "A test enquiry");
    assert.match(w.document.getElementById("cform-note").textContent, /didn't send/);
    w.fetch = async () => ({ ok: true });
    submit(w);
    await tick();
    assert.equal(w.document.querySelector('[name="message"]').value, "");
    assert.equal(button.disabled, false);
  } finally { dom.window.close(); }
});

test("honeypot submissions make no network request", () => {
  const dom = fixture();
  try {
    const w = dom.window;
    fill(w);
    w.fetch = () => { assert.fail("honeypot submission must not be posted"); };
    w.document.querySelector('[name="_website"]').value = "spam";
    submit(w);
    assert.equal(w.document.querySelector('[name="message"]').value, "");
  } finally { dom.window.close(); }
});

test("home photographs open by keyboard, trap focus, and restore focus", () => {
  const dom = fixture(undefined, false);
  try {
    const w = dom.window;
    w.document.getElementById("app").innerHTML = w.PublicPages.homePage(w.PublicPages.DEMO_PHOTOS, 2);
    w.PublicPages.initLightbox();
    const frame = w.document.querySelector('.hstrip__item[role="button"]');
    frame.focus();
    frame.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const box = w.document.querySelector(".lb");
    assert.equal(box.hidden, false);
    assert.equal(w.document.getElementById("app").inert, true);
    assert.equal(w.document.activeElement.className, "lb__x");
    w.document.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    assert.ok(w.document.activeElement.classList.contains("lb__nav--n"));
    w.document.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert.equal(w.document.activeElement.className, "lb__x");
    w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(box.hidden, true);
    assert.equal(w.document.getElementById("app").inert, false);
    assert.equal(w.document.activeElement, frame);
  } finally { dom.window.close(); }
});
