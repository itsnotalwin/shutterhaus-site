import "./styles.css";
import { SITE } from "./config";
import { renderShell } from "./layout";
import { photoPage } from "./pages";
import { videoPage, contactPage } from "./pages-more";
import { listPublicPhotos } from "./store";
import { DEMO_PHOTOS, DEMO_VIDEOS } from "./demo";
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

  if (r === "video") {
    const videos = DEMO_VIDEOS;
    app.innerHTML = renderShell("video", videoPage(videos, cols));
    scrollTo(0, 0);
    document.title = `video — ${SITE.nameTop} ${SITE.nameBig2}`;
    return;
  }

  // photo — the default route
  let photos = DEMO_PHOTOS;
  if (isSupabaseConfigured) {
    const live = await listPublicPhotos();
    if (live.length) photos = live;
  }
  app.innerHTML = renderShell("photo", photoPage(photos, cols));
  scrollTo(0, 0);
  document.title = `${SITE.nameTop} ${SITE.nameBig2} — photography in Gauteng`;
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

    if (SITE.contact.formEndpoint) {
      try {
        await fetch(SITE.contact.formEndpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: fd,
        });
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
    if (note) note.textContent = "Opening your email app…";
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
