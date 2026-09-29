import "./styles.css";
import { SITE } from "./config";
import { renderShell } from "./layout";
import { photoPage } from "./pages";
import { contactPage, pricingPage } from "./pages-more";
import { listPublicPhotos } from "./store";
import { DEMO_PHOTOS } from "./demo";
import { initLightbox } from "./lightbox";
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
  return h || "photo";
}

async function paint(): Promise<void> {
  const r = route();
  const cols = columnsFor(innerWidth);

  if (r === "admin") {
    // The admin is a separate bundle (admin.html) — bounce across.
    location.replace("./admin.html");
    return;
  }

  if (r === "contact") {
    app.innerHTML = renderShell("contact", contactPage());
    wireContact();
    scrollTo(0, 0);
    document.title = `contact — ${SITE.nameTop} ${SITE.nameBig2}`;
    return;
  }

  if (r === "pricing") {
    app.innerHTML = renderShell("pricing", pricingPage());
    scrollTo(0, 0);
    document.title = `pricing — ${SITE.nameTop} ${SITE.nameBig2}`;
    return;
  }

  // photo — the default route
  //
  // The gallery must NEVER depend on a network call succeeding. Two failure
  // modes to survive: Supabase being unreachable, and supabase-js burning ~6s
  // retrying before it admits defeat. So we don't wait on it at all beyond a
  // short cap — the bundled set renders immediately and is upgraded in place
  // if live photos arrive. A visitor never sees a blank page.
  let photos = DEMO_PHOTOS;
  let paintGallery = () => {
    app.innerHTML = renderShell("photo", photoPage(photos, cols));
    scrollTo(0, 0);
  };
  paintGallery();
  document.title = `${SITE.nameTop} ${SITE.nameBig2} — photography in Gauteng`;

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
        paintGallery();
      }
    } catch (err) {
      console.warn("[gallery] Supabase unreachable, keeping bundled set:", err);
    } finally {
      if (t !== undefined) clearTimeout(t);
    }
  }
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
