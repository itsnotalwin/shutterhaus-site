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
import { listAllPhotos, uploadPhoto, updatePhoto, deletePhoto, type AdminPhoto } from "./store";

const app = document.getElementById("app")!;

const TABS = [
  { id: "photos", label: "photos" },
  { id: "videos", label: "videos" },
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
    <section class="drop" id="drop">
      <input type="file" id="file" accept="image/*" multiple hidden />
      <strong>Drop images here</strong>
      <span>or click to choose — JPG, PNG, WebP</span>
      <div class="drop__prog" id="prog" hidden><i></i></div>
    </section>
    <p class="pad pad--dim">
      Left to right is the order visitors see. “hide” keeps an image in your library
      but off the public site.
    </p>
    <section class="cards">${cards}</section>`;
}

function videosView(): string {
  return `<p class="pad">
      Videos are edited in <code>src/demo.ts</code> (<code>DEMO_VIDEOS</code>) and committed —
      keeps hosting free and the site fast. Host the files on Supabase Storage or
      Cloudinary, paste the URL, done.
    </p>`;
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
    tab === "photos" ? photosView(msg) : tab === "videos" ? videosView() : detailsView();
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

  const drop = document.getElementById("drop");
  const file = document.getElementById("file") as HTMLInputElement | null;
  drop?.addEventListener("click", () => file?.click());

  ["dragenter", "dragover"].forEach((ev) =>
    drop?.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("is-over");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop?.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("is-over");
    }),
  );
  drop?.addEventListener("drop", (e) => {
    const dt = (e as DragEvent).dataTransfer;
    if (dt?.files.length) void ingest(dt.files);
  });
  file?.addEventListener("change", () => {
    if (file.files?.length) void ingest(file.files);
    file.value = "";
  });

  document.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => {
    b.addEventListener("click", () => void act(b.dataset.act!, b.dataset.id!));
  });

  document.querySelectorAll<HTMLInputElement>("[data-alt-for]").forEach((inp) => {
    inp.addEventListener("change", () => {
      void updatePhoto(inp.dataset.altFor!, { alt: inp.value.trim() });
      paint({ kind: "ok", text: "Alt text saved." });
    });
  });
}

/* ------------------------------------------------------------------ logic */

async function ingest(files: FileList): Promise<void> {
  const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) {
    paint({ kind: "err", text: "Those files aren't images." });
    return;
  }

  const prog = document.getElementById("prog");
  const bar = prog?.querySelector("i") as HTMLElement | null;
  if (prog) prog.hidden = false;

  let ok = 0;
  for (const f of imgs) {
    try {
      await uploadPhoto(f);
      ok += 1;
    } catch (e) {
      paint({ kind: "err", text: `${f.name} failed: ${(e as Error).message}` });
    }
    if (bar) bar.style.width = `${Math.round(((ok + 1) / imgs.length) * 100)}%`;
  }
  if (prog) setTimeout(() => (prog.hidden = true), 500);

  items = await listAllPhotos();
  paint({ kind: "ok", text: `Uploaded ${ok} image${ok === 1 ? "" : "s"}. Review, then hit show.` });
}

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
