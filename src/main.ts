import "./styles.css";
import "./public.css";
import "./fonts.css";
import { updatePageMetadata } from "./seo";
import { renderShell } from "./layout";
import { portfolioPage, homePage } from "./pages";
import { contactPage, servicesPage, aboutPage } from "./pages-more";
import { publicPhotosOrNull } from "./store";
import { mergePhotos, fallbackComposition } from "./gallery-model";
import { readComposition } from "./composition";
import { setLiveHome } from "./config";
import { setLiveRows } from "./rows";
import { mountContactForm } from "./contact-form";
import { mountNavigation } from "./navigation";
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
let cleanupPage = () => {};
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
  closeLightbox();
  cleanupPage();
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
  const navigation = mountNavigation(syncHeader);
  closeNav = navigation.close;
  cleanupPage = navigation.destroy;
  syncHeader();
  if (r === 'contact') {
    const unmountForm = mountContactForm();
    cleanupPage = () => { unmountForm(); navigation.destroy(); };
    return;
  }

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

document.addEventListener("click", event => {
  if (!(event.target as Element).closest(".skip-link")) return;
  event.preventDefault();
  document.querySelector<HTMLElement>("#main-content")?.focus();
});

const closeLightbox = initLightbox();
void paint();
