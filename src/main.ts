import "./styles.css";
import "./editorial.css";
import "./makeover.css";
import { SITE } from "./config";
import { renderShell } from "./layout";
import { portfolioPage, homePage, emptyGallery } from "./pages";
import { contactPage, servicesPage, aboutPage } from "./pages-more";
import { publicPhotosOrNull, type AdminPhoto } from "./store";
import { readComposition, type Composition } from "./composition";
import { setLiveHome } from "./config";
import { setLiveRows, COMMITTED_ROWS } from "./rows";
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

/** Routes that need the photo set rather than just static copy. */
const GALLERY_ROUTES = new Set(["home", "portfolio", "about"]);

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
let refreshPortfolioLayout: (() => void) | null = null;

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

function setTitle(r: string): void {
  const label = r.charAt(0).toUpperCase() + r.slice(1);
  document.title =
    r === "home"
      ? `${SITE.nameTop} ${SITE.nameBig2} | photography in Gauteng`
      : `${label} — ${SITE.nameTop} ${SITE.nameBig2}`;
}

async function paint(): Promise<void> {
  refreshPortfolioLayout = null;
  const r = ALIASES[route()] ?? route();
  const cols = columnsFor(innerWidth);
  // Abandon this paint the moment a newer one starts — see `paintSeq`.
  const myPaint = ++paintSeq;

  if (r === "admin") {
    // The admin is a separate bundle (admin.html) — bounce across.
    location.replace("./admin.html");
    return;
  }

  if (r === "contact") {
    // Contact has no photographs. A gallery response must never replace a
    // form while the visitor is typing or waiting for their enquiry to send.
    app.innerHTML = renderShell("contact", contactPage());
    wireContact();
    wireBurger();
    scrollTo(0, 0);
    setTitle("contact");
    return;
  }

  if (r === "services") {
    // Package cards carry a photograph each, same non-blocking pattern.
    let photos = DEMO_PHOTOS;
    const draw = () => {
      app.innerHTML = renderShell("services", servicesPage(photos));
      markLoadedImages();
      wireBurger();
      scrollTo(0, 0);
    };
    draw();
    setTitle("services");
    {
      const live = adoptable(await publicPhotosOrNull());
      if (myPaint !== paintSeq) return; // a newer route won
      if (live) {
        photos = live;
        draw();
      }
    }
    return;
  }

  if (r === "about") {
    // The about page shows one portrait beside the prose, so it needs a photo
    // but must never wait on the network for it.
    let photos = DEMO_PHOTOS;
    const draw = () => {
      app.innerHTML = renderShell("about", aboutPage(photos));
      markLoadedImages();
      wireBurger();
      scrollTo(0, 0);
    };
    draw();
    setTitle("about");
    {
      const live = adoptable(await publicPhotosOrNull());
      if (myPaint !== paintSeq) return; // a newer route won
      if (live) {
        photos = live;
        draw();
      }
    }
    return;
  }

  /**
     * Adopt the Supabase set only if every row it names is actually reachable.
     *
     * A row can name a file that isn't there: when the bundled gallery was
     * replaced with Alwin's favourites, the `photos` table still listed the nine
     * old `finals-*.jpg` rows. Those overrode the bundled set and rendered as
     * 404s on every page — a whole-site breakage from nine stale rows. The DB is
     * optional data, so it only wins when it is fully coherent; a partial match is
     * worse than no match and is rejected outright.
     *
     * Two kinds of row, and they get opposite verdicts:
     *   - bundled  (`gallery/…`, committed to the repo): must be in DEMO_PHOTOS.
     *     Checking the manifest is what catches the stale-row case above.
     *   - uploaded (a Supabase storage URL): accepted on trust. The file went up
     *     with the row in the same request, so there is no gap for it to rot in,
     *     and requiring it in DEMO_PHOTOS would reject every photo added through
     *     /admin — the upload would succeed and silently never appear.
     */
  function adoptable(live: AdminPhoto[] | null | undefined): AdminPhoto[] | null {
      if (!live?.length) return null;
      const known = new Set(DEMO_PHOTOS.map((p) => p.filename));
      const ok = live.every((p) => {
        if (!p.url) return false;
        if (/^https?:\/\//.test(p.url)) return true; // uploaded: file is in the bucket
        return !!p.filename && known.has(p.filename); // bundled: must be shipped
      });
      return ok ? live : null;
    }

/**
 * The committed choices, as the fallback for every composition read.
 *
 * Derived from the same git files the site shipped with, so "the database is
 * unreachable" and "Alwin has changed nothing" render identically — which is
 * the point: a visitor cannot tell whether the fallback fired.
 */
const idToFile = new Map(DEMO_PHOTOS.map((p) => [p.id, p.filename]));
const FALLBACK = {
  strip: [...SITE.homeStrip],
  hero: SITE.heroPhoto,
  rows: COMMITTED_ROWS.map((r) => r.map((id) => idToFile.get(id) ?? "")),
};

/**
 * Push a resolved composition into the renderers.
 *
 * The wall arrives as filenames and has to become frame ids, because
 * portfolioPage() looks photos up by id and THROWS on an id it cannot find.
 * Converting here — rather than loosening that check — keeps the guard that
 * stopped the nine-stale-rows outage intact.
 */
function applyComposition(comp: Composition): void {
  const fileToId = new Map(
    DEMO_PHOTOS.filter((p) => p.filename).map((p) => [p.filename!, p.id]),
  );
  setLiveHome(comp.homeStrip, comp.heroPhoto);
  const asIds = comp.wallRows.map((row) =>
    row.map((f) => fileToId.get(f)).filter((id): id is string => !!id),
  );
  // setLiveRows rejects a ragged wall, so a composition that lost a frame cannot
  // reach the renderer as a short row.
  setLiveRows(asIds);
}

// home + portfolio — the two routes built around the wall of frames.
  //
  // The gallery must NEVER depend on a network call succeeding. Two failure
  // modes to survive: Supabase being unreachable, and supabase-js burning ~6s
  // retrying before it admits defeat. So we don't wait on it at all beyond a
  // short cap — the bundled set renders immediately and is upgraded in place
  // if live photos arrive. A visitor never sees a blank page.
  let photos = DEMO_PHOTOS;

  const draw = () => {
    const body =
      r === "home"
        ? photos.length
          ? homePage(photos, cols)
          : emptyGallery()
        : portfolioPage(photos);
    // The home header floats over the hero photograph; portfolio keeps the
    // solid header (its grid starts below the fold anyway).
    app.innerHTML = renderShell(r, body, r === "home");
    markLoadedImages();
    wireBurger();
      // Same: only the portfolio wall is scrollable.
      scrollTo(0, 0);
  };
  draw();
  setTitle(r);
  if (r !== "home") {
    refreshPortfolioLayout = () => {
      const wanted = innerWidth <= 760 ? 2 : 3;
      if (document.querySelectorAll('.pf-col').length === wanted) return;
      const main = document.querySelector<HTMLElement>('.main');
      if (!main) return;
      const position = scrollY;
      main.innerHTML = portfolioPage(photos);
      markLoadedImages();
      scrollTo(0, position);
    };
  }

  {
    const TIMEOUT_MS = 2500;
    // One budget PER QUERY, not one shared promise. A single shared timeout means
    // the composition read starts its clock when the gallery read started, so it
        // inherits whatever the first one already spent and can only ever resolve
        // already-expired. That is not a theoretical race: it made the composition
        // read time out every time, which is how the hero and strip still rendered
        // (they fall back to git) while nothing was actually coming from the DB.
        const budget = () =>
          new Promise<null>((res) => {
            setTimeout(() => res(null), TIMEOUT_MS);
          });
        let t: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<null>((res) => {
          t = setTimeout(() => res(null), TIMEOUT_MS);
        });
        try {
          const live = await Promise.race([publicPhotosOrNull(), timeout]);
          if (myPaint !== paintSeq) return; // a newer route won
          if (live === null) {
                  console.warn("[gallery] timed out, keeping bundled set");
                  // NOT an early return any more. The composition is a different table,
                  // and the two have genuinely different failure modes: `photos` can be
                  // empty or slow (it holds one row per upload) while `composition` holds
                  // the 37 rows that decide which images appear where. Returning here
                  // meant a slow gallery read silently also discarded Alwin's choices.
                }
      // An empty table is a legitimate state (nothing published yet) — keep the
            // bundled set so the site is never empty. `adoptable` additionally rejects
            // a table whose rows name files we no longer ship.
            // `live` can be null here (the race resolved to the timeout), so this is
            // gated on a real array rather than on truthiness.
            if (Array.isArray(live)) {
              const ok = adoptable(live);
              if (ok) {
                photos = ok;
                draw();
              } else if (live.length) {
                console.warn(
                  `[gallery] ignoring ${live.length} DB row(s) naming files that are not bundled`,
                );
              }
            }

            // The composition is a SEPARATE read from the gallery, and it is what
            // makes Alwin's choices in /admin reach the page. Reordering the gallery
            // would not do it: which photo sits in the hero, and which 30 make the
            // wall, is a decision about slots, not about sort_order.
            //
            // Same rule as the gallery read above — never wait long enough to hold the
            // page, and never let a bad row blank it. readComposition() resolves each
            // slot against `known` and falls back per slot, so the worst case here is
            // the committed defaults, which is what the site served before any of this.
            if (myPaint !== paintSeq) return;
                        // The gallery the page is actually rendering — bundled plus
                        // anything live — so a slot naming a file we do not ship falls back
                        // instead of rendering a hole. Same set the admin resolves against.
                        const known = new Set<string>(photos.map((p) => p.filename).filter((f): f is string => !!f));
                        const comp = await Promise.race([readComposition(known, FALLBACK), budget()]);
            if (!comp) {
              console.warn("[composition] timed out, keeping committed defaults");
              return;
            }
            if (comp.problems.length) {
              console.warn(`[composition] ${comp.problems.length} slot(s) fell back:`, comp.problems);
            }
            applyComposition(comp);
            draw();
          } catch (err) {
            console.warn("[gallery] Supabase unreachable, keeping bundled set:", err);
          } finally {
      if (t !== undefined) clearTimeout(t);
    }
  }
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
  const wanted = new URLSearchParams(location.search).get("package");
  const kind = document.getElementById("cform-kind") as HTMLSelectElement | null;
  if (wanted && kind) {
    const hit = Array.from(kind.options).find((o) => o.value === wanted);
    if (hit) kind.value = wanted;
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
        return;
      } catch {
        if (note) note.textContent = "That didn't send. Email me directly instead.";
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

// Only the portfolio needs new markup when its column count changes. Height
// changes from a phone's address bar or keyboard must never redraw a page.
let layoutWidth = innerWidth;
let reflowTimer: ReturnType<typeof setTimeout> | undefined;
addEventListener('resize', () => {
  if (innerWidth === layoutWidth) return;
  layoutWidth = innerWidth;
  if (innerWidth > 1000) closeNav?.();
  clearTimeout(reflowTimer);
  reflowTimer = setTimeout(() => refreshPortfolioLayout?.(), 100);
});
addEventListener('orientationchange', () => {
  setTimeout(() => refreshPortfolioLayout?.(), 250);
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
