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
          ? "export function publicPhotosOrNull(){ window.__galleryReads++; return new Promise(resolve=>{window.__resolveGallery=resolve;}); }"
          : "export function readComposition(known,fallback){ window.__knownFiles=[...known]; window.__fallback=fallback; return new Promise(resolve=>{window.__resolveComposition=resolve;}); }",
      }));
    },
  }],
});
const pagesBundle = await build({
  stdin: {
    contents: 'export { mergePhotos, fallbackComposition } from "./src/gallery-model"; export { SITE } from "./src/config"; export { servicesPage, contactPage } from "./src/pages-more"; export { homePage, homeBand } from "./src/pages"; export { DEMO_PHOTOS } from "./src/demo"; export { initLightbox } from "./src/lightbox";',
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: "iife", globalName: "PublicPages",
});

function fixture(url = "https://shutterhausvisuals.co.za/contact.html?package=Social", main = true, width = 1024) {
  const dom = new JSDOM('<div id="app"></div>', { url, runScripts: "outside-only" });
  const w = dom.window;
  w.innerWidth = width;
  w.scrollTo = (x,y) => {w.scrollY=y;};
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


test("same-route history restores the existing form, scroll and draft", async () => {
  const dom=fixture();
  try {
    const w=dom.window;fill(w);
    const form=w.document.querySelector('form');
    w.scrollY=240;
    w.dispatchEvent(new w.PopStateEvent('popstate'));
    assert.equal(w.document.querySelector('form'),form);
    assert.equal(w.document.querySelector('[name="message"]').value,'A test enquiry');
    assert.equal(w.scrollY,240);
    w.document.querySelector('[name="message"]').dispatchEvent(new w.Event('input',{bubbles:true}));
    const storage=w.sessionStorage.getItem('shutterhaus-enquiry-draft-v1');
    assert.match(storage,/A test enquiry/);
    w.document.getElementById('app').innerHTML=w.PublicPages.contactPage();
    // A fresh document boot reads the saved session draft.
    const restored=new JSDOM('<div id="app"></div>',{url:w.location.href,runScripts:'outside-only'});
    try {
      const next=restored.window;next.scrollTo=()=>{};next.matchMedia=()=>({matches:true});
      next.sessionStorage.setItem('shutterhaus-enquiry-draft-v1',storage);
      next.eval(mainBundle.outputFiles[0].text);
      assert.equal(next.document.querySelector('[name="message"]').value,'A test enquiry');
      assert.equal(next.document.querySelector('[name="kind"]').value,'Social');
    } finally {restored.window.close();}
  } finally {dom.window.close();}
});

test("an identical late gallery response preserves an open menu and scroll",async()=>{
  const dom=fixture('https://shutterhausvisuals.co.za/services.html');
  try {
    const w=dom.window;const main=w.document.querySelector('.main');
    w.scrollY=550;w.document.querySelector('.burger').click();
    const focus=w.document.activeElement;
    w.__resolveGallery(w.PublicPages.DEMO_PHOTOS);await tick();
    assert.equal(w.document.querySelector('.main'),main);
    assert.equal(w.scrollY,550);
    assert.equal(w.document.querySelector('.burger').getAttribute('aria-expanded'),'true');
    assert.equal(w.document.activeElement,focus);
  } finally {dom.window.close();}
});

test("UUID gallery rows and an uploaded wall photo render without replacing the menu",async()=>{
  const dom=fixture('https://shutterhausvisuals.co.za/portfolio.html');
  try {
    const w=dom.window;
    const upload={id:'00000000-0000-4000-8000-000000000099',filename:'new-upload.jpg',url:'https://example.supabase.co/storage/v1/object/public/photos/new-upload.jpg',visible:true,album:'photo',width:1200,height:1800,sort_order:100,alt:'A new portrait'};
    const live=w.PublicPages.DEMO_PHOTOS.map((p,i)=>({...p,id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`}));
    const menu=w.document.querySelector('.site-header');w.scrollY=450;
    w.__resolveGallery([...live,upload]);await tick();
    assert.ok(w.__knownFiles.includes('new-upload.jpg'));
    const fallback=w.__fallback;
    const wall=fallback.rows.flat();wall[0]='new-upload.jpg';
    w.__resolveComposition({homeStrip:fallback.strip,heroPhoto:fallback.hero,wallRows:[wall],problems:[]});await tick();
    assert.equal(w.document.querySelectorAll('.pf-cell').length,30);
    assert.ok(w.document.querySelector('[data-full="'+upload.url+'"]'));
    assert.equal(w.document.querySelector('.pf-col [data-full]').dataset.full,upload.url,'The first manually chosen photo must display first.');
    assert.equal(w.document.querySelector('.site-header'),menu);
    assert.equal(w.scrollY,450);
  } finally {dom.window.close();}
});

test("a stale composition response cannot overwrite a newer enquiry route",async()=>{
  const dom=fixture('https://shutterhausvisuals.co.za/');
  try {
    const w=dom.window;w.__resolveGallery(null);await tick();
    const resolve=w.__resolveComposition;const fallback=w.__fallback;
    w.location.hash='/contact';await tick();await tick();fill(w);
    const form=w.document.querySelector('form');
    resolve({homeStrip:fallback.strip,heroPhoto:fallback.hero,wallRows:fallback.rows,problems:[]});await tick();
    assert.equal(w.document.querySelector('form'),form);
    assert.equal(w.document.querySelector('[name="message"]').value,'A test enquiry');
    assert.equal(w.document.querySelector('h1').textContent,'Book a session.');
  } finally {dom.window.close();}
});

test("every built public document has readable content, navigation and contact without JavaScript",async()=>{
  for (const file of ['index','portfolio','about','services','contact']) {
    const html=await readFile(`dist/${file}.html`,'utf8');
    const dom=new JSDOM(html);
    try {
      assert.ok(dom.window.document.querySelector('#app h1'),file);
      assert.ok(dom.window.document.querySelector('a[href="./contact.html"]'),file);
      assert.ok(dom.window.document.querySelector('a[href^="mailto:"]'),file);
      assert.match(html,/Kempton Park/);
      if(file==='contact')assert.equal(dom.window.document.querySelector('form').action,'https://formspree.io/f/xjyklqkp');
      if(file==='portfolio')assert.equal(dom.window.document.querySelectorAll('.pf-cell').length,30);
    }finally{dom.window.close();}
  }
});

test('mobile Portfolio shows ten photos, keeps an open disclosure through updates, and restores it after rotation', async () => {
  const dom = fixture('https://shutterhausvisuals.co.za/portfolio.html', true, 390);
  try {
    const w = dom.window;
    const visible = () => [...w.document.querySelectorAll('.pf-cell')].filter(cell => !cell.closest('details:not([open])'));
    assert.equal(visible().length, 10);
    assert.equal(w.document.querySelectorAll('.pf-cell').length, 30);
    const firstTen = visible().map(cell => cell.querySelector('img').dataset.full);
    const summary = w.document.querySelector('summary');
    summary.focus();
    w.scrollY = 350;
    w.__resolveGallery(w.PublicPages.DEMO_PHOTOS.map(p => ({...p, alt: p.alt + ' updated'})));
    await tick();
    w.document.querySelector('.pf-more').open = true;
    await tick();
    assert.equal(visible().length, 30);
    const fallback = w.__fallback;
    w.__resolveComposition({homeStrip:fallback.strip,heroPhoto:fallback.hero,wallRows:fallback.rows,problems:[]});
    await tick();
    assert.equal(w.document.querySelector('.pf-more').open, true);
    assert.match(w.document.querySelector('.pf-cell img').alt, / updated$/);
    assert.deepEqual(visible().slice(0,10).map(cell => cell.querySelector('img').dataset.full), firstTen);
    assert.equal(w.document.activeElement.tagName, 'SUMMARY');
    assert.equal(w.scrollY, 350);
    w.innerWidth = 1440; w.dispatchEvent(new w.Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(w.document.querySelector('.pf-more'), null);
    assert.equal(w.document.querySelectorAll('.pf-col').length, 3);
    assert.equal(visible().length, 30);
    w.innerWidth = 390; w.dispatchEvent(new w.Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(w.document.querySelector('.pf-more').open, true);
    w.document.querySelector('.pf-more').open = false;
    assert.equal(visible().length, 10);
  } finally { dom.window.close(); }
});

test('mobile photo viewer counts only disclosed photos and reveals the return frame after desktop rotation', async () => {
  const dom = fixture('https://shutterhausvisuals.co.za/portfolio.html', true, 390);
  try {
    const w = dom.window;
    const clickFrame = frame => frame.querySelector('img').dispatchEvent(new w.MouseEvent('click', {bubbles:true}));
    const close = () => w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
    clickFrame(w.document.querySelector('.pf-cell'));
    assert.equal(w.document.querySelector('.lb__cap').textContent, '01 / 10');
    close();
    w.document.querySelector('.pf-more').open = true;
    clickFrame(w.document.querySelector('.pf-more .pf-cell'));
    assert.equal(w.document.querySelector('.lb__cap').textContent, '11 / 30');
    close();
    w.innerWidth = 1440; w.dispatchEvent(new w.Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 120));
    const frame = [...w.document.querySelectorAll('.pf-cell')].at(-1);
    const url = frame.querySelector('img').dataset.full;
    clickFrame(frame);
    w.innerWidth = 390; w.dispatchEvent(new w.Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 120));
    close();
    assert.equal(w.document.activeElement.querySelector('img').dataset.full, url);
    assert.equal(w.document.activeElement.closest('details')?.open ?? true, true);
  } finally { dom.window.close(); }
});

test('pre-rendered Home adopts one mobile column and only repacks when crossing the phone breakpoint', async () => {
  const dom = fixture('https://shutterhausvisuals.co.za/', false, 390);
  const built = new JSDOM(await readFile('dist/index.html', 'utf8'));
  try {
    const w = dom.window;
    w.document.getElementById('app').innerHTML = built.window.document.querySelector('#app').innerHTML;
    w.document.getElementById('app').dataset.route = 'home';
    w.eval(mainBundle.outputFiles[0].text);
    assert.equal(w.document.querySelectorAll('.hstrip__col').length, 1);
    assert.equal(w.document.querySelectorAll('.hstrip__item').length, 6);
    const frames = [...w.document.querySelectorAll('.hstrip img')].map(im => im.dataset.filename);
    assert.deepEqual(frames, Array.from(w.PublicPages.SITE.homeStrip));
    const grid = w.document.querySelector('.hstrip__grid');
    const header = w.document.querySelector('.site-header');
    w.scrollY = 450; w.innerHeight = 500; w.dispatchEvent(new w.Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(w.document.querySelector('.hstrip__grid'), grid);
    const frame = w.document.querySelector('.hstrip__item');
    const filename = frame.querySelector('img').dataset.filename;
    frame.focus();
    w.innerWidth = 1440; w.dispatchEvent(new w.Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal(w.document.querySelectorAll('.hstrip__col').length, 2);
    assert.equal(w.document.querySelector('.site-header'), header);
    assert.equal(w.document.activeElement.querySelector('img').dataset.filename, filename);
    assert.equal(w.scrollY, 450);
  } finally { dom.window.close(); built.window.close(); }
});

test("page metadata stays aligned after hydration and legacy hash navigation", async () => {
  const pages = JSON.parse(await readFile('src/seo.json', 'utf8'));
  for (const [route, page] of Object.entries(pages)) {
    const html = await readFile(`dist/${page.filename}`, 'utf8');
    const dom = fixture(`https://shutterhausvisuals.co.za/${page.filename}`, false);
    try {
      const w = dom.window;
      const source = new JSDOM(html);
      w.document.head.innerHTML = source.window.document.head.innerHTML;
      source.window.close();
      w.eval(mainBundle.outputFiles[0].text);
      assert.equal(w.document.title, page.title);
      assert.equal(w.document.querySelector('meta[name="description"]').content, page.description);
      if (route === 'home') {
        for (const dest of ['services', 'portfolio', 'home']) {
          w.location.hash = `#/${dest}`;
          w.dispatchEvent(new w.Event('hashchange'));
          const expected = pages[dest];
          const url = `https://shutterhausvisuals.co.za/${dest === 'home' ? '' : expected.filename}`;
          assert.equal(w.document.title, expected.title);
          assert.equal(w.document.querySelector('link[rel="canonical"]').href, url);
          assert.equal(w.document.querySelector('meta[property="og:url"]').content, url);
          assert.equal(w.document.querySelector('meta[name="twitter:description"]').content, expected.description);
          const graph = JSON.parse(w.document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
          assert.equal(graph.find(n => n['@type'] === 'WebPage').url, url);
          assert.equal(graph.filter(n => n['@type'] === 'BreadcrumbList').length, dest === 'home' ? 0 : 1);
        }
      }
    } finally { dom.window.close(); }
  }
});

test("sitemap agrees with canonical pages and admin noindex remains readable", async () => {
  const xml = await readFile('dist/sitemap.xml', 'utf8');
  const pages = JSON.parse(await readFile('src/seo.json', 'utf8'));
  assert.equal([...xml.matchAll(/<loc>/g)].length, Object.keys(pages).length);
  for (const page of Object.values(pages)) {
    const dom = new JSDOM(await readFile(`dist/${page.filename}`, 'utf8'));
    assert.ok(xml.includes(`<loc>${dom.window.document.querySelector('link[rel="canonical"]').href}</loc>`));
    dom.window.close();
  }
  assert.doesNotMatch(xml, /admin|lastmod/);
  assert.doesNotMatch(await readFile('dist/robots.txt', 'utf8'), /^Disallow:\s*\/admin/m);
  const admin = new JSDOM(await readFile('dist/admin.html', 'utf8'));
  assert.match(admin.window.document.querySelector('meta[name="robots"]').content, /noindex/);
  admin.window.close();
});
