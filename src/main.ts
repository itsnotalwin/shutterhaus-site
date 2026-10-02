import "./styles.css";
import "./editorial.css";
import { SITE } from "./config";
import { renderShell } from "./layout";
import { portfolioPage, homePage, emptyGallery } from "./pages";
import { contactPage, servicesPage, aboutPage } from "./pages-more";
import { listPublicPhotos, type AdminPhoto } from "./store";
import { DEMO_PHOTOS } from "./demo";
import { initLightbox, markLoadedImages } from "./lightbox";
import { isSupabaseConfigured } from "./supabase";

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
 * runs on every route change AND every orientation change. It used to register
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
      ? `${SITE.nameTop} ${SITE.nameBig2} — photography in Gauteng`
      : `${label} — ${SITE.nameTop} ${SITE.nameBig2}`;
}

async function paint(): Promise<void> {
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
    // The reference puts a photograph beside the form, so this page needs a
    // photo too — same non-blocking pattern as about.
    let photos = DEMO_PHOTOS;
    const draw = () => {
      app.innerHTML = renderShell("contact", contactPage(photos));
      markLoadedImages();
      wireContact();
      wireBurger();
      scrollTo(0, 0);
    };
    draw();
    setTitle("contact");
    if (isSupabaseConfigured) {
      const live = adoptable(await listPublicPhotos().catch(() => null));
      if (myPaint !== paintSeq) return; // a newer route won
      if (live) {
        photos = live;
        draw();
      }
    }
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
    if (isSupabaseConfigured) {
      const live = adoptable(await listPublicPhotos().catch(() => null));
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
    if (isSupabaseConfigured) {
      const live = adoptable(await listPublicPhotos().catch(() => null));
      if (myPaint !== paintSeq) return; // a newer route won
      if (live) {
        photos = live;
        draw();
      }
    }
    return;
  }

  /**
 * Adopt the Supabase set only if every frame it names is actually shipped.
 *
 * A database row can outlive its file: when the bundled gallery was replaced
 * with Alwin's favourites, the `photos` table still listed the nine old
 * `finals-*.jpg` rows. Those overrode the bundled set and rendered as 404s on
 * every page — a whole-site breakage from nine stale rows. The DB is optional
 * data, so it only wins when it is fully coherent; a partial match is worse
 * than no match and is rejected outright.
 */
function adoptable(live: AdminPhoto[] | null | undefined): AdminPhoto[] | null {
  if (!live?.length) return null;
  const known = new Set(DEMO_PHOTOS.map((p) => p.filename));
  return live.every((p) => p.filename && known.has(p.filename)) ? live : null;
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

  if (isSupabaseConfigured) {
    const TIMEOUT_MS = 2500;
    let t: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((res) => {
      t = setTimeout(() => res(null), TIMEOUT_MS);
    });
    try {
      const live = await Promise.race([listPublicPhotos(), timeout]);
      if (myPaint !== paintSeq) return; // a newer route won
      if (live === null) {
        console.warn("[gallery] timed out, keeping bundled set");
        return; // bundled set already on screen
      }
      // An empty table is a legitimate state (nothing published yet) — keep the
      // bundled set so the site is never empty. `adoptable` additionally rejects
      // a table whose rows name files we no longer ship.
      const ok = adoptable(live);
      if (ok) {
        photos = ok;
        draw();
      } else if (live.length) {
        console.warn(
          `[gallery] ignoring ${live.length} DB row(s) naming files that are not bundled`,
        );
      }
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
    } else {
      scrim.remove();
    }
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
}

/** Contact form: posts to Formspree if configured, else opens the mail client. */
function wireContact(): void {
  const form = document.getElementById("cform") as HTMLFormElement | null;
  const note = document.getElementById("cform-note");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();

    // Honeypot. A real visitor cannot see or focus this field, so anything in it
    // came from a script filling every input it finds. Pretend it worked: a bot
    // told "sent" learns to retry with the field left empty, whereas an error
    // tells it the trap exists. Nothing is posted either way.
    if (get("_website")) {
      if (note) note.textContent = "Thanks — got it, I'll reply shortly.";
      form.reset();
      return;
    }

    if (!get("name") || !get("email") || !get("message")) {
      if (note) note.textContent = "Please fill in name, email and message.";
      return;
    }

    // Catch typos like "name@gamil.com" before the enquiry disappears into a
    // dead address. Deliberately loose — real validation is the mail server's
    // job; this only rejects things that are definitely not addresses.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(get("email"))) {
      if (note) note.textContent = "That email address doesn't look right — check it?";
      return;
    }

    if (SITE.contact.formEndpoint) {
      try {
        const res = await fetch(SITE.contact.formEndpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: fd,
        });
        if (!res.ok) throw new Error(`form endpoint ${res.status}`);
        if (note) note.textContent = "Thanks — got it, I'll reply shortly.";
        form.reset();
        return;
      } catch {
        if (note) note.textContent = "That didn't send. Email me directly instead.";
        return;
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

/**
 * Repaint on a real orientation change, NOT on every `resize`.
 *
 * Alwin, 2026-10-01, on an iPhone 16 / iOS 27 / Safari: "when I'm scrolling
 * through the website on any page it will flash white and take me back to top".
 *
 * The cause was this listener. On iOS Safari the address bar is attached to the
 * scroll, so every flick that moves the page also collapses or expands that bar
 * and Safari fires `resize`. That ran `paint()`, which replaces `app.innerHTML`
 * with freshly built markup — the white flash, the DOM being torn down mid-scroll
 * — and then calls `scrollTo(0, 0)`, which is the jump back to the top. One
 * listener, both symptoms, on every route, because it sits on `window` rather
 * than inside the router.
 *
 * Desktop Chrome has no address bar, so it never fired there. That is why this
 * passed every automated check in this repo, all of which run in headless Chrome.
 * It cannot be verified from here; it has to be checked on the device.
 *
 * `orientationchange` is the event that means "the device physically turned".
 * It does not fire during an ordinary scroll, which is the whole point.
 *
 * Note the portfolio no longer depends on the viewport at all — its track
 * count comes from the row length in rows.ts, so it renders identically at
 * every width. Only the home strip's column count still changes, across
 * 640/1000 px, which an orientation change covers.
 */
addEventListener("orientationchange", () => {
  // A beat, because iOS reports the new dimensions a frame or two after the
  // event. Repainting synchronously here would read the old innerWidth.
  setTimeout(() => void paint(), 250);
});

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
