import "./styles.css";
import "./editorial.css";
import { SITE } from "./config";
import { renderShell } from "./layout";
import { portfolioPage, homePage, emptyGallery, packByHeight } from "./pages";
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
 * How many columns the PORTFOLIO wall gets.
 *
 * Alwin, 2026-10-01: "3 column for desktop and 2 column for mobile only
 * portfolio page". Two, not the `columnsFor()` one, because a phone showing
 * one frame per row makes 50 frames an absurd scroll.
 *
 * The breakpoint is 640px, matching the CSS one below, so the JS column count
 * and the CSS track count cannot disagree — the same failure the home strip
 * hit, where 8 frames were emitted as 2 columns and the grid drew 1.
 */
function pfCols(w: number): number {
  return w < 640 ? 2 : 3;
}

/**
 * Drive the portfolio filter bar.
 *
 * Hides the cells that do not match and repacks the columns, rather than just
 * hiding them and leaving a ragged hole where a column used to be. Repacking
 * calls the same `packByHeight()` the initial render used, so filtering cannot
 * reintroduce the clumping the spread order exists to prevent.
 *
 * Delegates on the bar itself rather than binding 50 listeners.
 */
function wireFilterBar(): void {
  const bar = document.querySelector<HTMLElement>(".pfilter");
  if (!bar) return;

  // Deliberately NOT snapshotted. repackWall() moves cells between columns, so
  // a list captured at wire time goes stale after the first filter change: the
  // moved cells fall out of it, the id lookup stops matching, and
  // repackWall()'s guard bails silently — which looked exactly like the feature
  // not working. Query fresh on every click.
  const cells = () => [...document.querySelectorAll<HTMLElement>(".pf-cell")];

  bar.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>(".pfilter__item");
    if (!btn) return;
    const want = btn.dataset.filter ?? "all";

    for (const b of bar.querySelectorAll<HTMLElement>(".pfilter__item")) {
      const on = b === btn;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    }

    // Map each cell back to its photo via data-filename, then re-pack the
    // visible ones. Re-running the packer is what keeps the filtered wall even.
    for (const cell of cells()) {
      const f = cell.querySelector<HTMLElement>(".cell img")?.dataset.filename;
      const photo = DEMO_PHOTOS.find((p) => p.filename === f);
      cell.hidden = !(want === "all" || photo?.album === want);
    }
    repackWall();
  });
}

/**
 * Rebuild the visible columns in place, without re-rendering the page.
 *
 * Called after a filter change. Two things it has to get right, and both have a
 * way to fail quietly:
 *
 *  1. Filtering to fewer frames than there are columns (Landscapes is 4 frames
 *     against 3 columns) must not leave an empty track — a tall gap where a
 *     column used to be. So the number of ACTIVE columns is capped at the
 *     number of visible frames.
 *
 *  2. The surplus columns must not be REMOVED. An earlier version removed them,
 *     which meant clicking "All" afterwards could not bring them back and the
 *     wall stayed two-up for the rest of the session. They are hidden with CSS
 *     instead, and the grid track count is set to match the active ones.
 *
 * Cells are looked up once by id and moved by appendChild, so a cell can end up
 * in exactly one column no matter what order the packer returns.
 */
function repackWall(): void {
  const wall = document.querySelector<HTMLElement>(".grid--wall");
  if (!wall) return;

  const visible = [...wall.querySelectorAll<HTMLElement>(".pf-cell")].filter((c) => !c.hidden);
  if (!visible.length) return;

  const byId = new Map(DEMO_PHOTOS.map((p) => [p.id, p]));
  const photos = visible
    .map((c) => byId.get(c.dataset.photoId ?? ""))
    .filter((p): p is NonNullable<typeof p> => !!p);
  // Bail rather than half-repack: if a cell's id cannot be resolved, moving the
  // rest would silently reshuffle the wall and lose frames.
  if (photos.length !== visible.length) return;

  // Feed the packer in the SAME order the first render did (the photos' own
  // order), not DOM order. DOM order is column by column, so packing from it
  // gave a different arrangement every time: click Places, click All, and the
  // wall came back reshuffled — which also scrambled the frame numbers, because
  // those are assigned from the first render's layout (data-n, see
  // portfolioPage()). With this, "All" restores exactly the original wall.
  const order = new Map(DEMO_PHOTOS.map((p, i) => [p.id, i]));
  photos.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const all = [...wall.querySelectorAll<HTMLElement>(".wall__col")];
  const n = Math.max(1, Math.min(all.length, photos.length));
  const packed = packByHeight(photos, n);

  // Snapshot the cell elements by photo id ONCE, before anything moves.
  const cellOf = new Map<string, HTMLElement>();
  for (const c of visible) {
    const id = c.dataset.photoId;
    if (id) cellOf.set(id, c);
  }

  // First move every visible cell into the first active column, so the
  // per-column assignment below starts from a known state and no cell is left
  // stranded in a column that is about to be hidden.
  for (const c of visible) all[0].appendChild(c);

  all.slice(0, n).forEach((col, i) => {
    for (const p of packed[i] ?? []) {
      const cell = cellOf.get(p.id);
      if (cell) col.appendChild(cell);
    }
  });

  for (let i = 0; i < all.length; i++) all[i].hidden = i >= n;
  wall.style.setProperty("--wall-cols", String(n));
}

function route(): string {
  const h = location.hash.replace(/^#\/?/, "").split("?")[0];
  return h || "home";
}

/** `photo` is the old single-page route — keep it as an alias for /portfolio. */
const ALIASES: Record<string, string> = {
  photo: "portfolio",
  pricing: "services",
};

/** Routes that need the photo set rather than just static copy. */
const GALLERY_ROUTES = new Set(["home", "portfolio", "about"]);

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
        : portfolioPage(photos, r === "portfolio" ? pfCols(innerWidth) : cols);
    // The home header floats over the hero photograph; portfolio keeps the
    // solid header (its grid starts below the fold anyway).
    app.innerHTML = renderShell(r, body, r === "home");
    markLoadedImages();
    wireBurger();
    // Only the portfolio route emits `.pfilter`; the function no-ops elsewhere.
    wireFilterBar();
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
  if (!btn || !nav) return;

  const set = (open: boolean) => {
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("is-on", open);
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
  };

  btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
  // Any nav link closes the panel — otherwise it stays open over the new page.
  nav.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) set(false);
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") set(false);
  });
}

/** Contact form: posts to Formspree if configured, else opens the mail client. */
function wireContact(): void {
  const form = document.getElementById("cform") as HTMLFormElement | null;
  const note = document.getElementById("cform-note");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();

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

let rt: ReturnType<typeof setTimeout> | undefined;
addEventListener("resize", () => {
  clearTimeout(rt);
  rt = setTimeout(() => void paint(), 200);
});
addEventListener("hashchange", () => void paint());

initLightbox();
void paint();
