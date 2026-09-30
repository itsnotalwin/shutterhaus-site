import "./styles.css";
import "./editorial.css";
import { SITE } from "./config";
import { renderShell } from "./layout";
import { photoPage, portfolioPage, homePage, emptyGallery } from "./pages";
import { contactPage, servicesPage, aboutPage } from "./pages-more";
import { listPublicPhotos } from "./store";
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
      const live = await listPublicPhotos().catch(() => null);
      if (live?.length) {
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
      const live = await listPublicPhotos().catch(() => null);
      if (live?.length) {
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
      const live = await listPublicPhotos().catch(() => null);
      if (live?.length) {
        photos = live;
        draw();
      }
    }
    return;
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
          ? homePage(photos)
          : emptyGallery()
        : portfolioPage(photos, cols);
    // The home header floats over the hero photograph; portfolio keeps the
    // solid header (its grid starts below the fold anyway).
    app.innerHTML = renderShell(r, body, r === "home");
    markLoadedImages();
    wireBurger();
    if (r === "portfolio") wireFilter();
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
      // bundled set so the site is never empty.
      if (live.length) {
        photos = live;
        draw();
      }
    } catch (err) {
      console.warn("[gallery] Supabase unreachable, keeping bundled set:", err);
    } finally {
      if (t !== undefined) clearTimeout(t);
    }
  }
}

/**
 * Portfolio category filter.
 *
 * Toggles a class on the frames rather than re-rendering: every <img> stays in
 * the DOM, so nothing refetches and the lightbox — which walks the same set —
 * keeps working without a re-init.
 */
function wireFilter(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".pfilter__item");
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const want = btn.dataset.filter ?? "all";
      buttons.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      for (const cell of document.querySelectorAll<HTMLElement>(".cell")) {
        const cat = cell.querySelector("img")?.dataset.cat ?? "portrait";
        cell.classList.toggle("is-hidden", want !== "all" && cat !== want);
      }
      // Keyboard focus can end up on a hidden frame after filtering.
      (document.activeElement as HTMLElement | null)?.blur();
    });
  });
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
