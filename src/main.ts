import "./styles.css";
import "./editorial.css";
import "./makeover.css";
import "./visual-refresh.css";
import { SITE } from "./config";
import { updatePageMetadata } from "./seo";
import { escapeHtml, renderShell } from "./layout";
import { portfolioPage, homePage } from "./pages";
import { contactPage, servicesPage, aboutPage } from "./pages-more";
import { publicPhotosOrNull } from "./store";
import { mergePhotos, fallbackComposition } from "./gallery-model";
import { readComposition } from "./composition";
import { setLiveHome } from "./config";
import { setLiveRows } from "./rows";
import { DEMO_PHOTOS } from "./demo";
import { initLightbox, markLoadedImages } from "./lightbox";

const app = document.getElementById("app")!;

/** Reference design is a 3-up grid on desktop, 2-up on tablet, 1-up on phones. */
function columnsFor(w: number): number {
  if (w < 640) return 1;
  if (w < 1000) return 2;
  return 3;
}



/**
 * Which page is this?
 *
 * The FILENAME wins, then the hash. That order is what makes the split work:
 * each route is now a real document (`portfolio.html`, `about.html`, …) so a
 * crawler and a social scraper get a real file with its own title, description
 * and canonical, while the hash is still read so an old `/#/portfolio` link —
 * and every bookmark, and anything already indexed — keeps working.
 *
 * Reading the hash FIRST would have been the bug: on `portfolio.html` the hash
 * is empty, so the route would fall back to "home" and render the homepage
 * under the portfolio's URL.
 */
function route(): string {
  // admin.html is its own bundle and never routes through here.
  const file = location.pathname.split("/").pop() || "";
  const stem = file.replace(/\.html?$/i, "").toLowerCase();

  // `index` is the home document — the same url as the apex `/` — so it must
  // NOT win over the hash the way a NAMED document does. It did: the stem
  // "index" is listed in KNOWN_ROUTES, so this returned "index" on every
  // `/index.html` load and the hash below was never read. Measured in headless
  // Chrome: `/#/contact` rendered the contact form, `/index.html#/contact`
  // rendered the HOMEPAGE instead — silently, no 404. Every bookmark and every
  // already-indexed `/index.html#/…` link landed on the homepage.
  if (stem && stem !== "index" && KNOWN_ROUTES.has(stem)) return stem;

  const h = location.hash.replace(/^#\/?/, "").split("?")[0].toLowerCase();
  // An unrecognised hash is passed through unchanged and lands in paint()'s
  // home+portfolio tail, which is why `#/video` falls back to the gallery —
  // tools/verify.mjs asserts exactly that. Do not "tidy" this into a whitelist
  // without checking that check: it is load-bearing.
  return h || "home";
}

/** Routes with a real document, keyed by filename stem. Keep in step with tools/build-pages.py. */
const KNOWN_ROUTES = new Set(["index", "home", "portfolio", "about", "services", "contact"]);

/**
 * `photo` is the old single-page route — keep it as an alias for /portfolio.
 *
 * `index` is the other half of the same idea, and it was NOT here: `/index.html`
 * matched KNOWN_ROUTES (the stem "index" is listed), so `route()` returned
 * "index", no alias matched, and `paint()` fell through every route branch to
 * the home+portfolio tail where `r === "home"` is false — rendering the
 * PORTFOLIO wall under the HOMEPAGE url, with document.title "Index —
 * SHUTTERHAUS VISUALS". Measured in headless Chrome: `/` gave hasHero=true,
 * cells=0; `/index.html` gave hasHero=false, cells=30. The homepage is the most
 * linked and most crawled url on the site, and it is the one that broke.
 */
const ALIASES: Record<string, string> = {
  index: "home",
  photo: "portfolio",
  pricing: "services",
};


/**
 * Close the live burger drawer, if there is one.
 *
 * `wireBurger()` runs inside `draw()`, which runs inside `paint()`, and `paint()`
 * runs on every route change. It used to register
 * its own `keydown` + `hashchange` pair on `window` each time and never removed
 * them, so every navigation leaked two more listeners — each closing over a
 * `btn`, `nav` and `scrim` that `innerHTML` had already thrown away. A visitor
 * browsing for a few minutes accumulated dozens of dead handlers, every one of
 * which still ran on each Escape press and each hashchange.
 *
 * One registration, one live target. The hashchange case is why this had to keep
 * working: the header is re-rendered per route, so an open drawer's `nav-open` /
 * `nav-locked` classes live on `body`, which `innerHTML` does NOT touch, and
 * would otherwise lock scrolling on a page whose drawer no longer exists.
 */
let closeNav: (() => void) | null = null;
let refreshGalleryLayout: (() => void) | null = null;

function syncHeader(): void {
  const header = document.querySelector<HTMLElement>(".shell--over .site-header");
  header?.classList.toggle("is-solid", scrollY > 24 || !!header.querySelector(".site-nav.is-open"));
}

/**
 * Paint generation counter.
 *
 * `paint()` is async: four of its five routes await the Supabase fetch before
 * upgrading the bundled photos in place. Two paints can therefore overlap — a
 * slow fetch on route A while the visitor navigates to route B — and whichever
 * `draw()` ran LAST won, not whichever was newest. A's late `draw()` replaced
 * B's markup while the URL still said B. Every await re-checks this token and
 * abandons the paint if a newer one has started.
 */
let paintSeq = 0;


let displayedRoute: string | null = null;

async function withinBudget<T>(request: Promise<T>, ms = 6000): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([request, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); })]);
  } finally { clearTimeout(timer!); }
}

async function paint(): Promise<void> {
  const r = ALIASES[route()] ?? route();
  // A restored document already contains its form, focus and scroll position.
  if (r === displayedRoute) return;
  displayedRoute = r;
  refreshGalleryLayout = null;
  const myPaint = ++paintSeq;
  if (r === 'admin') { location.replace('./admin.html'); return; }

  let photos = mergePhotos();
  let portfolioExpanded = false;
  const renderBody = () => r === 'contact' ? contactPage()
    : r === 'services' ? servicesPage(photos)
    : r === 'about' ? aboutPage(photos)
    : r === 'home' ? homePage(photos, columnsFor(innerWidth))
    : portfolioPage(photos, portfolioExpanded);

  const prerendered = app.dataset.route === r && !!app.querySelector('.main');
  if (!prerendered) {
    app.innerHTML = renderShell(r, renderBody(), r === 'home');
    scrollTo(0, 0);
  }
  delete app.dataset.route;
  updatePageMetadata(r);
  markLoadedImages();
  wireBurger();
  syncHeader();
  if (r === 'contact') { wireContact(); return; }

  // Opening a native disclosure does not change the gallery data. Compare
  // content independently of its open state, including while a read is pending.
  const contentKey = (body: string) => body.replace('<details class="pf-more" open>', '<details class="pf-more">');
  let lastBody = contentKey(renderBody());
  const wireMore = () => {
    const more = app.querySelector<HTMLDetailsElement>('.pf-more');
    more?.addEventListener('toggle', () => {
      if (!more.isConnected) return;
      portfolioExpanded = more.open;
    });
  };
  wireMore();
  const upgrade = (force = false) => {
    const main = app.querySelector<HTMLElement>('.main');
    if (!main) return;
    const more = main.querySelector<HTMLDetailsElement>('.pf-more');
    if (more) portfolioExpanded = more.open;
    const body = renderBody();
    if (!force && lastBody === contentKey(body)) return;
    lastBody = contentKey(body);
    const position = scrollY;
    const focused = document.activeElement;
    const frame = focused?.matches('[role="button"]')
      ? focused.querySelector<HTMLImageElement>('[data-full]')?.dataset.full : undefined;
    const moreFocused = document.activeElement?.matches('.pf-more__toggle');
    // Keep the visitor's package choice and keyboard focus across live photo updates.
    const packageChoice = main.querySelector<HTMLInputElement>('[name="package-view"]:checked')?.id;
    const packageFocus = focused?.matches('[name="package-view"]') ? focused.id : null;
    main.innerHTML = body;
    if (packageChoice) {
      const radio = document.getElementById(packageChoice) as HTMLInputElement | null;
      if (radio) radio.checked = true;
    }
    if (packageFocus) document.getElementById(packageFocus)?.focus({preventScroll:true});
    wireMore();
    markLoadedImages();
    if (frame) {
      const target = [...main.querySelectorAll<HTMLImageElement>('[data-full]')]
        .find(el => el.dataset.full === frame)?.closest<HTMLElement>('[role="button"]');
      const disclosure = target?.closest<HTMLDetailsElement>('details');
      if (disclosure && !disclosure.open) disclosure.open = true;
      target?.focus({preventScroll:true});
    }
    if (moreFocused) main.querySelector<HTMLElement>('.pf-more__toggle')?.focus({preventScroll:true});
    scrollTo(0, position);
  };
  if (!['services','about'].includes(r)) {
    refreshGalleryLayout = () => {
      const gallery = mainGallery();
      if (gallery && gallery.dataset.mobileLayout !== String(innerWidth <= 760)) upgrade(true);
    };
    refreshGalleryLayout();
  }

  try {
    const live = await withinBudget(publicPhotosOrNull());
    if (myPaint !== paintSeq) return;
    photos = mergePhotos(live);
    if (r === 'services' || r === 'about') { upgrade(); return; }
    const fallback = fallbackComposition();
    const known = new Set(photos.filter(p => p.visible).map(p => p.filename));
    const comp = await withinBudget(readComposition(known, fallback));
    // Check again after EACH asynchronous read, before changing shared choices.
    if (myPaint !== paintSeq) return;
    if (comp) {
      const byFile = new Map(photos.map(p => [p.filename,p.id]));
      setLiveHome(comp.homeStrip, comp.heroPhoto);
      setLiveRows(comp.wallRows.map(row => row.map(file => byFile.get(file)!).filter(Boolean)));
    }
    upgrade();
  } catch (error) {
    console.warn('[gallery] Keeping the available gallery:', error);
  }
}

function mainGallery(): HTMLElement | null {
  return app.querySelector('.page[data-mobile-layout]');
}

/** Mobile menu toggle. The button and the panel are both in the header. */
function wireBurger(): void {
  const btn = document.querySelector<HTMLButtonElement>(".burger");
  const nav = document.getElementById("site-nav");
  // Drop the stale closer BEFORE bailing. Without this, a route that renders no
  // burger (or one whose header failed to build) leaves `closeNav` pointing at
  // the PREVIOUS page's `set()`, which would close an element that is no longer
  // in the document.
  closeNav = null;
  if (!btn || !nav) return;

  // A scrim behind the drawer, added on open and removed on close. Without it
  // there is no "outside" to tap: the audit measured a tap at (196,600) on
  // #/contact landing on the TEXTAREA with aria-expanded still "true", so the
  // only ways out were the burger, a nav link, or Escape — and on a phone the
  // first two are the only reachable ones. A menu you cannot dismiss by tapping
  // the page you can see is a menu that traps people.
  const scrim = document.createElement("div");
  scrim.className = "nav-scrim";
  scrim.setAttribute("aria-hidden", "true");

  const set = (open: boolean) => {
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
    const label = btn.querySelector(".burger__label");
    if (label) label.textContent = open ? "Close" : "Menu";
    btn.classList.toggle("is-on", open);
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
    // Stop the page behind the drawer scrolling. Dragging the open drawer moved
    // the background 800 -> 985px, which reads as the page jumping under your
    // thumb. `nav-open` was set here since day one and styled NOWHERE, so the
    // class was dead; the CSS that consumes it ships with this change.
    document.documentElement.classList.toggle("nav-locked", open);
    if (open) {
      if (!scrim.parentNode) document.body.appendChild(scrim);
      nav.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
    } else {
      scrim.remove();
      if (nav.contains(document.activeElement)) btn.focus({ preventScroll: true });
    }
    const main = document.querySelector<HTMLElement>('.main');
    if (main) main.inert = open;
    syncHeader();
  };

  btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
  scrim.addEventListener("click", () => set(false));
  // Any nav link closes the panel — otherwise it stays open over the new page.
  nav.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) set(false);
  });
  // Escape and hashchange are handled by the ONE pair of window listeners
  // registered at the bottom of this file. They call `closeNav`, which always
  // points at the CURRENT drawer — see its note for why registering them here
  // was a leak.
  closeNav = () => set(false);
  set(false);
}

/** Contact form: posts to Formspree if configured, else opens the mail client. */
function wireContact(): void {
  const form = document.getElementById("cform") as HTMLFormElement | null;
  const note = document.getElementById("cform-note");
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  let sending = false;

  // Preselect the package the visitor tapped "Book now" on.
  //
  // "Book now" on a tier card links to `contact.html?package=<tier name>`, so
  // arriving from a card arrives already having chosen that package. Matched
  // against the select's own options rather than assigning a value outright:
  // setting an unknown value silently leaves the select on option 0, which
  // would show "Starter" for someone who tapped "Signature". A no-match is
  // therefore a no-op, not a wrong answer.
  //
  // Runs on arrival; the contact page is not repainted by gallery responses.
  const draftKey = 'shutterhaus-enquiry-draft-v1';
  let restored = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (saved && Date.now() - saved.at < 24 * 60 * 60 * 1000) {
      for (const [key,value] of Object.entries(saved.fields)) {
        const input = form?.elements.namedItem(key) as HTMLInputElement | null;
        if (input && typeof value === 'string') input.value = value;
      }
      restored = true;
    }
  } catch { /* Storage can be disabled; the live form still works. */ }
  const saveDraft = () => {
    const fields: Record<string,string> = {};
    for (const key of ['name','email','kind','message']) {
      fields[key] = (form?.elements.namedItem(key) as HTMLInputElement | null)?.value ?? '';
    }
    try { sessionStorage.setItem(draftKey, JSON.stringify({at:Date.now(), fields})); } catch { /* optional */ }
  };
  const clearDraft = () => { try { sessionStorage.removeItem(draftKey); } catch { /* optional */ } };
  form?.addEventListener('input', saveDraft);
  form?.addEventListener('change', saveDraft);
  const wanted = new URLSearchParams(location.search).get("package");
  const kind = document.getElementById("cform-kind") as HTMLSelectElement | null;
  if (wanted && kind) {
    const hit = Array.from(kind.options).find((o) => o.value === wanted);
    if (hit && !restored) kind.value = wanted;
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();

    // Honeypot. A real visitor cannot see or focus this field, so anything in it
    // came from a script filling every input it finds. Pretend it worked: a bot
    // told "sent" learns to retry with the field left empty, whereas an error
    // tells it the trap exists. Nothing is posted either way.
    if (get("_website")) {
      if (note) note.textContent = "Thanks, got it. I'll reply shortly.";
      form.reset();
      clearDraft();
      return;
    }

    if (!get("name") || !get("email") || !get("message")) {
      if (note) note.textContent = "Please fill in name, email and message.";
      const missing = ["name", "email", "message"].find((key) => !get(key));
      form.querySelector<HTMLElement>(`[name="${missing}"]`)?.focus();
      return;
    }

    // Reject malformed addresses. Domain spelling and delivery are the server's
    // job; this only rejects things that are definitely not addresses.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(get("email"))) {
      if (note) note.textContent = "That email address doesn't look right. Check it?";
      form.querySelector<HTMLElement>('[name="email"]')?.focus();
      return;
    }

    if (SITE.contact.formEndpoint) {
      saveDraft();
      sending = true;
      form.setAttribute("aria-busy", "true");
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Sending…";
      }
      if (note) note.textContent = "Sending your message…";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(SITE.contact.formEndpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: fd,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`form endpoint ${res.status}`);
        if (note) note.textContent = "Thanks, got it. I'll reply shortly.";
        form.reset();
        clearDraft();
        return;
      } catch {
        if (note) note.innerHTML = `That didn't send. Your message is saved here. <a href="mailto:${escapeHtml(SITE.contact.email)}">Email me directly</a> or try again.`;
        return;
      } finally {
        clearTimeout(timeout);
        sending = false;
        form.removeAttribute("aria-busy");
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Send message";
        }
      }
    }

    const subject = encodeURIComponent(`Enquiry — ${get("kind")}`);
    const body = encodeURIComponent(
      `${get("message")}\n\n— ${get("name")} (${get("email")})`,
    );
    location.href = `mailto:${SITE.contact.email}?subject=${subject}&body=${body}`;
    // Don't promise a hand-off we can't confirm: on a phone with no mail app
    // this does nothing at all. Show the address so they can copy it instead.
    if (note) {
      note.innerHTML = `If nothing opened, email me directly: <a href="mailto:${SITE.contact.email}">${SITE.contact.email}</a>`;
    }
  });
}

// Home and Portfolio need new markup across the phone breakpoint. Height
// changes from a phone's address bar or keyboard must never redraw a page.
let layoutWidth = innerWidth;
let reflowTimer: ReturnType<typeof setTimeout> | undefined;
addEventListener('resize', () => {
  if (innerWidth === layoutWidth) return;
  layoutWidth = innerWidth;
  if (innerWidth > 1000) closeNav?.();
  clearTimeout(reflowTimer);
  reflowTimer = setTimeout(() => refreshGalleryLayout?.(), 100);
});
addEventListener('orientationchange', () => {
  setTimeout(() => refreshGalleryLayout?.(), 250);
});
addEventListener('scroll', syncHeader, { passive: true });

// Re-paint when the URL changes WITHOUT a document load.
//
// Two kinds of navigation reach this. A hash link (`/#/portfolio`) fires
// hashchange and swaps the page in place. A real link to `portfolio.html` does
// NOT fire anything here — the browser loads a new document and the whole
// script starts again — so `paint()` at the bottom of the file is what renders
// it. Both paths exist on purpose: the hash route is what keeps old bookmarks
// and already-indexed `/#/…` links working.
//
// popstate is included because Back/Forward across a real page load restores a
// document from bfcache WITHOUT re-running the script, so nothing would
// otherwise repaint.
addEventListener("hashchange", () => void paint());
addEventListener("popstate", () => void paint());

// The burger drawer's global listeners — registered ONCE, here, and pointed at
// whatever drawer is currently on screen. See `closeNav` for why these are not
// registered inside wireBurger(), which runs once per paint().
addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeNav?.();
});
addEventListener("hashchange", () => closeNav?.());

initLightbox();
void paint();
