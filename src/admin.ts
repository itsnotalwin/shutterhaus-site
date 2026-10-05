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
import {
  listAllPhotos,
  updatePhoto,
  deletePhoto,
  uploadPhoto,
  type AdminPhoto,
} from "./store";

const app = document.getElementById("app")!;

const TABS = [
  { id: "photos", label: "photos" },
  { id: "details", label: "site details" },
] as const;
type TabId = (typeof TABS)[number]["id"];

let tab: TabId = "photos";
let items: AdminPhoto[] = [];
let email: string | null = null;
// Upload in flight. Guards against a second batch starting on top of the first
// and double-uploading the same files.
let busy = false;
// Ids uploaded this session but not yet made visible. Kept across the repaint
// so "publish them" is one tap instead of one tap per photo.
let pending: string[] = [];

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
    ${
      pending.length
        ? `<div class="publishbar">
             <span>${pending.length} new photo${pending.length > 1 ? "s" : ""} not on the site yet.</span>
             <button type="button" class="publishbar__go" data-publish>Put them live</button>
           </div>`
        : ""
    }
    <label class="drop" id="drop" for="adm-file">
      <strong>Add photos</strong>
      <span>Tap to choose from your phone, or drag files in. They go live the moment you press the button.</span>
      <!--
        accept="image/*" with NO capture attribute is deliberate: capture forces
        iOS straight into the camera and removes the photo library, which is the
        half of the job that matters. Without it Safari offers "Take Photo",
        "Photo Library" and "Browse" itself. multiple is honoured on iOS too.
      -->
      <input id="adm-file" type="file" accept="image/*" multiple hidden />
      <span class="drop__prog"><i></i></span>
    </label>
    <p class="pad pad--dim">
      Everything here saves instantly — no commit, no deploy, no waiting. Big
      camera files are shrunk to 1800px on your device before they leave it, so
      this stays quick on mobile data. Left to right is the order visitors see.
      “hide” keeps an image in your library but off the public site. “delete”
      removes it from the site; the original file stays in your library folder.
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

  // --- upload ---------------------------------------------------------
  // Both paths funnel into the same runUpload: the input is how a phone hands
  // over a camera roll, the drop zone is how a laptop hands over a shoot folder.
  const input = document.getElementById("adm-file") as HTMLInputElement | null;
  input?.addEventListener("change", () => {
    if (input.files?.length) void runUpload(Array.from(input.files));
    // Reset so picking the same file twice in a row still fires a change event.
    input.value = "";
  });

  const drop = document.getElementById("drop");
  if (drop) {
    // dragover must preventDefault or the browser just navigates to the file.
    for (const ev of ["dragenter", "dragover"] as const) {
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add("is-over");
      });
    }
    for (const ev of ["dragleave", "dragend"] as const) {
      drop.addEventListener(ev, () => drop.classList.remove("is-over"));
    }
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-over");
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) void runUpload(files);
    });
  }

  // data-publish, not data-act: the generic handler below assumes every
  // data-act button has a photo id, and this one deliberately has none.
  document.querySelector<HTMLButtonElement>("[data-publish]")?.addEventListener("click", () => {
    publishPending().catch((err) => {
      console.error("[admin] publish failed", err);
      paint({
        kind: "err",
        text: `Couldn't publish: ${err instanceof Error ? err.message : "unknown error"}.`,
      });
    });
  });

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

/* ------------------------------------------------------------------- logic */

// Matches tools/add-photos.py so a photo looks the same whichever way it
// arrived — phone or laptop.
const MAX_EDGE = 1800;
const QUALITY = 0.82;

/**
 * Downscale in the browser, before anything is sent.
 *
 * A 24MP phone original is 8-12MB; the site's largest frame renders at 1800px.
 * Uploading the original would burn a photographer's mobile data to deliver
 * bytes nobody ever sees.
 */
async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  // imageOrientation is the point: phone photos carry an EXIF rotation flag and
  // decode sideways if it's ignored, which is the whole reason a camera roll
  // upload would otherwise land rotated.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() =>
    createImageBitmap(file),
  );
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't resize images.");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Couldn't re-encode that image.");

  return { blob, width: w, height: h };
}

/**
 * Upload a batch one file at a time.
 *
 * Sequential on purpose. Parallel uploads on a phone share one connection, so
 * eight at once is slower overall, eight times more likely to time out, and one
 * failure loses the whole batch.
 */
async function runUpload(files: File[]): Promise<void> {
  if (busy) return;
  busy = true;

  // The bar is updated in place. Calling paint() mid-upload would replace the
  // DOM holding it and the input still holding the chosen files.
  const bar = document.querySelector<HTMLElement>(".drop__prog i");

  const added: string[] = [];
  const failed: string[] = [];

  for (const [i, file] of files.entries()) {
    try {
      const { blob, width, height } = await shrink(file);
      // Re-extension to .jpg because the bytes are now JPEG whatever the source
      // was, and a .HEIC name on JPEG content confuses the CDN's content-type.
      const out = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
      const row = await uploadPhoto(out, { width, height });
      added.push(row.id);
    } catch (err) {
      // One unreadable file must not abandon the rest of the shoot.
      console.error("[admin] upload failed", file.name, err);
      failed.push(file.name);
    }
    if (bar) bar.style.width = `${Math.round(((i + 1) / files.length) * 100)}%`;
  }

  busy = false;
  items = await listAllPhotos();
  pending = added;

  if (!added.length) {
    paint({
      kind: "err",
      text: `Nothing uploaded. ${failed.slice(0, 3).join(", ")} — ${
        failed.length === 1 ? "this browser" : "these files"
      } couldn't be read as an image.`,
    });
    return;
  }

  paint({
    kind: failed.length ? "err" : "ok",
    text: failed.length
      ? `Added ${added.length} photo${added.length > 1 ? "s" : ""}, but ${failed.length} failed: ${failed
          .slice(0, 3)
          .join(", ")}.`
      : `Added ${added.length} photo${added.length > 1 ? "s" : ""}. They stay hidden until you publish them.`,
  });
}

async function publishPending(): Promise<void> {
  const ids = pending;
  pending = [];
  for (const id of ids) await updatePhoto(id, { visible: true });
  items = await listAllPhotos();
  paint({
    kind: "ok",
    text: `Published ${ids.length} photo${ids.length > 1 ? "s" : ""} — they're on the site now.`,
  });
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
