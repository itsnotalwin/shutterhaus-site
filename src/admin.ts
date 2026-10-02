import "./styles.css";
import { ADMIN_EMAILS, SITE } from "./config";
import { escapeHtml, icon } from "./layout";
import {
  isAdmin,
  signInWithGoogle,
  signOut,
  getSession,
  isSupabaseConfigured,
} from "./supabase";
import { listAllPhotos, updatePhoto, deletePhoto, type AdminPhoto } from "./store";

const app = document.getElementById("app")!;

const TABS = [
  { id: "photos", label: "photos" },
  { id: "details", label: "site details" },
] as const;
type TabId = (typeof TABS)[number]["id"];

let tab: TabId = "photos";
let items: AdminPhoto[] = [];
let email: string | null = null;

/* ------------------------------------------------------------------ views */

function shell(body: string): string {
  return `<div class="adm">
    <header class="adm__bar">
      <span class="adm__logo">${escapeHtml(SITE.nameTop)} ${escapeHtml(SITE.nameBig2)}</span>
      <nav class="adm__tabs">
        ${TABS.map(
          (t) =>
            `<button class="adm__tab${tab === t.id ? " is-on" : ""}" data-tab="${t.id}" type="button">${t.label}</button>`,
        ).join("")}
      </nav>
      <div class="adm__right">
        <span class="adm__who">${escapeHtml(email ?? "")}</span>
        <a class="adm__link" href="./index.html" target="_blank" rel="noopener">view site ↗</a>
        <button class="adm__out" id="adm-out" type="button">sign out</button>
      </div>
    </header>
    <div class="adm__body">${body}</div>
  </div>`;
}

function gate(err?: string): string {
  return `<div class="gate">
    <div class="gate__card">
      <h1 class="gate__h">admin</h1>
      <p class="gate__p">Sign in with Google to manage the gallery.</p>
      ${err ? `<p class="gate__err">${escapeHtml(err)}</p>` : ""}
      <button class="gate__btn" id="gate-btn" type="button">
        ${icon("google", 18)}<span>Continue with Google</span>
      </button>
      <p class="gate__note">
        Restricted to ${ADMIN_EMAILS.map((e) => `<code>${escapeHtml(e)}</code>`).join(", ")}.
      </p>
    </div>
  </div>`;
}

function photosView(msg?: { kind: "ok" | "err"; text: string }): string {
  const cards = items.length
    ? items
        .map(
          (p) => `<figure class="card${p.visible ? "" : " is-hidden"}" data-id="${p.id}">
      <div class="card__img">
        <img src="${escapeHtml(p.url)}" alt="" loading="lazy" />
        <span class="card__badge">${p.visible ? "live" : "hidden"}</span>
      </div>
      <figcaption class="card__bar">
        <input class="card__alt" type="text" placeholder="alt text" value="${escapeHtml(p.alt ?? "")}" data-alt-for="${p.id}" />
        <div class="card__acts">
          <button type="button" data-act="up" data-id="${p.id}" title="Earlier in the grid">←</button>
          <button type="button" data-act="down" data-id="${p.id}" title="Later in the grid">→</button>
          <button type="button" data-act="toggle" data-id="${p.id}">${p.visible ? "hide" : "show"}</button>
          <button type="button" data-act="del" class="is-danger" data-id="${p.id}">delete</button>
        </div>
      </figcaption>
    </figure>`,
        )
        .join("")
    : `<p class="pad dim">No photos yet — drop some above.</p>`;

  return `
    ${msg ? `<p class="notice notice--${msg.kind}">${escapeHtml(msg.text)}</p>` : ""}
    <section class="drop drop--static">
      <strong>Adding new photos</strong>
      <span>Image files live in the GitHub repository, not in a database.</span>
      <p class="drop__how">
        From your machine, run
        <code>python tools/add-photos.py "C:/path/to/your/shoot"</code> —
        it resizes, optimises, drops the files into
        <code>public/gallery/</code> and prints the commit command. Everything
        you do <em>often</em> — alt text, order, hide and show — is right here
        below and saves instantly, with no deploy.
      </p>
    </section>
    <p class="pad pad--dim">
      Left to right is the order visitors see. “hide” keeps an image in your library
      but off the public site. “delete” removes the row only — the file itself
      stays in the repository, so a deleted photo can always be brought back.
    </p>
    <section class="cards">${cards}</section>`;
}

function detailsView(): string {
  return `<p class="pad">
      Name, nav, contact details and social links all live in <code>src/config.ts</code>.
      Edit that one file, commit, and the site redeploys.
    </p>
    <p class="pad dim">
      This tab is read-only on purpose — a browser visitor should never be able to
      change your contact details.
    </p>`;
}

function notConfigured(): string {
  return `<div class="gate"><div class="gate__card">
    <h1 class="gate__h">admin</h1>
    <p class="notice notice--err">Supabase isn't connected yet.</p>
    <p class="gate__p">
      Copy <code>.env.example</code> to <code>.env</code>, paste in your project URL
      and anon key, then restart <code>npm run dev</code>. README.md has the
      step-by-step.
    </p>
  </div></div>`;
}

function paint(msg?: { kind: "ok" | "err"; text: string }): void {
  const body =
    tab === "photos" ? photosView(msg) : detailsView();
  app.innerHTML = shell(body);
  wire();
}

/* ------------------------------------------------------------------- wire */

function wire(): void {
  document.getElementById("adm-out")?.addEventListener("click", async () => {
    await signOut();
    location.reload();
  });

  document.querySelectorAll<HTMLButtonElement>(".adm__tab").forEach((b) => {
    b.addEventListener("click", () => {
      tab = b.dataset.tab as TabId;
      paint();
    });
  });

  // No file-input wiring: image files live in git, not in a bucket, so there is
  // nothing for the browser to upload. See the "Adding new photos" panel.

  document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => {
    b.addEventListener("click", () => {
      // A rejected write must surface, not vanish into an unhandled rejection:
      // otherwise "hide" silently leaves the photo live on the public site.
      act(b.dataset.act!, b.dataset.id!).catch((err) => {
        console.error("[admin] action failed", err);
        paint({
          kind: "err",
          text: `That didn't save: ${err instanceof Error ? err.message : "unknown error"}. Try again.`,
        });
      });
    });
  });

  document.querySelectorAll<HTMLInputElement>("[data-alt-for]").forEach((inp) => {
    inp.addEventListener("change", () => {
      // Only claim success once the write actually resolved. Painting "saved"
      // before awaiting made a failed save look successful, and the re-render
      // then silently reverted the text the photographer had typed.
      updatePhoto(inp.dataset.altFor!, { alt: inp.value.trim() })
        .then(() => paint({ kind: "ok", text: "Alt text saved." }))
        .catch((err) => {
          console.error("[admin] alt text save failed", err);
          paint({
            kind: "err",
            // The re-render below REPLACES the input, so "your text is still in
            // the box" was false — the typed text was destroyed by the very
            // paint that reported the failure. Carry it in the notice instead,
            // where it survives the repaint.
          text: `Alt text didn't save: ${err instanceof Error ? err.message : "unknown error"}. Your text was "${inp.value.trim()}" — copy it from here and re-enter it.`,
          });
        });
    });
  });
}

/* ------------------------------------------------------------------ logic */

// No upload path: image bytes are committed to the repo, not written to a
// bucket from the browser. See the "Adding new photos" panel in photosView()
// and tools/add-photos.py.

async function act(action: string, id: string): Promise<void> {
  const i = items.findIndex((p) => p.id === id);
  if (i < 0) return;
  const p = items[i];

  if (action === "up" && i > 0) {
    const other = items[i - 1];
    await updatePhoto(p.id, { sort_order: other.sort_order });
    await updatePhoto(other.id, { sort_order: p.sort_order });
    items = await listAllPhotos();
    paint();
    return;
  }
  if (action === "down" && i < items.length - 1) {
    const other = items[i + 1];
    await updatePhoto(p.id, { sort_order: other.sort_order });
    await updatePhoto(other.id, { sort_order: p.sort_order });
    items = await listAllPhotos();
    paint();
    return;
  }
  if (action === "toggle") {
    await updatePhoto(id, { visible: !p.visible });
    items = await listAllPhotos();
    paint({
      kind: "ok",
      text: p.visible ? "Hidden from the site." : "Now live on the site.",
    });
    return;
  }
  if (action === "del") {
    if (!confirm(`Delete "${p.alt || p.filename}"? This can't be undone.`)) return;
    await deletePhoto(id);
    items = await listAllPhotos();
    paint({ kind: "ok", text: "Deleted." });
  }
}

/* ------------------------------------------------------------------- boot */

async function boot(): Promise<void> {
  if (!isSupabaseConfigured) {
    app.innerHTML = notConfigured();
    return;
  }

  const session = await getSession();
  email = session?.email ?? null;

  if (!session) {
    app.innerHTML = gate();
    bindGate();
    return;
  }
  if (!isAdmin(email)) {
    app.innerHTML = gate("That Google account isn't on the admin allowlist.");
    bindGate();
    return;
  }

  items = await listAllPhotos();
  paint();
}

function bindGate(): void {
  const btn = document.getElementById("gate-btn") as HTMLButtonElement | null;
  btn?.addEventListener("click", async () => {
    btn.disabled = true;
    const { error } = await signInWithGoogle();
    if (error) {
      // Re-enable: a failed popup/denied consent used to leave the button
      // disabled forever, so one refused click locked the admin out of the
      // gate with no way back except a full page reload.
      btn.disabled = false;
      const p = document.querySelector(".gate__err") ?? createErr();
      p.textContent = error.message;
    }
  });
}

function createErr(): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = "gate__err";
  document.querySelector(".gate__card")?.prepend(p);
  return p;
}

void boot();
