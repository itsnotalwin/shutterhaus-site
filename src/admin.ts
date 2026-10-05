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
import { readComposition, setSlot, createSlot, type Composition } from "./composition";
import { DEMO_PHOTOS } from "./demo";
import { PHOTO_ROWS } from "./rows";

const app = document.getElementById("app")!;

const TABS = [
  { id: "mock", label: "page mock" },
  { id: "photos", label: "photos" },
  { id: "details", label: "site details" },
] as const;
type TabId = (typeof TABS)[number]["id"];

let tab: TabId = "mock";
let items: AdminPhoto[] = [];
let email: string | null = null;
// Upload in flight. Guards against a second batch starting on top of the first
// and double-uploading the same files.
let busy = false;
// Ids uploaded this session but not yet made visible. Kept across the repaint
// so "publish them" is one tap instead of one tap per photo.
let pending: string[] = [];
// The live composition, mirrored from public.composition. Kept in state so the
// mock can render without a round trip on every repaint.
let comp: Composition = { homeStrip: [], heroPhoto: null, wallRows: [], problems: [] };
// The slot he has tapped, waiting for a photo. null = nothing held. This is what
// makes it a two-tap swap instead of a drag, which is the interaction that works
// with one thumb on a phone.
let held: { page: string; slot: string; order: number } | null = null;

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

/**
 * A scaled, honest preview of each page, with every chosen image as a slot.
 *
 * Shown at the same proportions the real page uses rather than as a flat grid,
 * because the question he is answering is "what does my site look like", not
 * "which files exist". A 1:1 contact sheet would answer the wrong question.
 *
 * Each slot carries its own position in the page's data attributes so the
 * click handler can write to exactly one row — see assign().
 */
function mockView(msg?: { kind: "ok" | "err"; text: string }): string {
  const byFile = new Map(items.map((p) => [p.filename, p]));

  // Resolve a filename to an <img>, or name the gap. A slot that cannot be
  // filled is shown as a hole rather than hidden, because a hole in the preview
  // is a hole on the site.
  const slot = (
    filename: string | null,
    page: string,
    group: string,
    order: number,
    cls: string,
  ): string => {
    const p = filename ? byFile.get(filename) : undefined;
    const url = p?.url ?? (filename ? `gallery/${filename}` : "");
    const isHeld =
      held?.page === page && held?.slot === group && held?.order === order;
    const clsFull = `${cls}${isHeld ? " is-held" : ""}`;
    if (!filename) {
      return `<button type="button" class="mslot mslot--empty ${clsFull}" data-slot="${page}|${group}|${order}">
        <span>empty</span></button>`;
    }
    return `<button type="button" class="mslot ${clsFull}" data-slot="${page}|${group}|${order}" title="${escapeHtml(filename)} — tap to swap">
      <img src="${escapeHtml(url)}" alt="" loading="lazy" />
      <span class="mslot__n">${order + 1}</span>
    </button>`;
  };

  const hero = comp.heroPhoto;
  const strip = comp.homeStrip;

  return `
    ${msg ? `<p class="notice notice--${msg.kind}">${escapeHtml(msg.text)}</p>` : ""}
    ${
      comp.problems.length
        ? `<div class="publishbar publishbar--warn">
             <span>${comp.problems.length} slot${comp.problems.length > 1 ? "s" : ""} couldn't be read — the site fell back to its defaults.</span>
           </div>`
        : ""
    }

    <div class="mock">
      <section class="mock__page">
        <h2 class="mock__h">home — hero</h2>
        <div class="mock__hero">
          ${slot(hero, "home", "hero", 0, "mslot--hero")}
          <span class="mock__cap">the first thing a visitor sees</span>
        </div>

        <h2 class="mock__h">home — strip below the hero</h2>
        <div class="mock__strip">
          ${strip.map((f, i) => slot(f, "home", "strip", i, "")).join("")}
        </div>
        ${
          strip.length < 6
            ? `<p class="pad pad--dim">${strip.length} of 6 filled. The home strip is art direction, not a sample — a short one shows fewer images.</p>`
            : ""
        }
      </section>

      <section class="mock__page">
        <h2 class="mock__h">portfolio wall — ${comp.wallRows.length} rows of ${comp.wallRows[0]?.length ?? 2}</h2>
        <p class="pad pad--dim">
          Each row holds ${comp.wallRows[0]?.length ?? 2} frames of the same shape, so a row
          reads as one clean line. Dropping a photo here leaves a gap in its row.
        </p>
        <div class="mock__wall">
          ${comp.wallRows
            .map(
              (row, ri) =>
                `<div class="mock__row">${row
                  .map((f, i) => slot(f, "portfolio", "wall", ri * (comp.wallRows[0]?.length ?? 2) + i, ""))
                  .join("")}</div>`,
            )
            .join("")}
        </div>
      </section>

      <section class="mock__page">
        <h2 class="mock__h">choose a different photo</h2>
        <p class="pad pad--dim">
          Tap a slot above, then tap the photo you want in it. Or tap a photo
          first and it will fill the next slot you're holding.
        </p>
        <div class="picker">
          ${items
            .map(
              (p) => `<button type="button" class="picker__i" data-pick="${escapeHtml(p.filename ?? "")}" title="${escapeHtml(p.alt || p.filename || "")}">
            <img src="${escapeHtml(p.url)}" alt="" loading="lazy" />
          </button>`,
            )
            .join("")}
        </div>
      </section>
    </div>`;
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
    tab === "mock" ? mockView(msg) : tab === "photos" ? photosView(msg) : detailsView();
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

  // --- page mock: pick a slot, then pick a photo ------------------
  // Two taps rather than drag-and-drop. Drag on a phone is fiddly with one
  // thumb and impossible with two photos in the other hand; tap-tap-then-tap is
  // the interaction that survives contact with a real shoot.
  document.querySelectorAll<HTMLButtonElement>("[data-slot]").forEach((b) => {
    b.addEventListener("click", () => {
      const [page, slot, orderRaw] = (b.dataset.slot ?? "").split("|");
      const order = Number(orderRaw);
      if (!page || !slot || Number.isNaN(order)) return;
      held = { page, slot, order };
      paint({
        kind: "ok",
        text: "Now tap the photo you want in that spot.",
      });
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((b) => {
    b.addEventListener("click", () => {
      const filename = b.dataset.pick ?? "";
      if (!filename) return;
      // No slot held yet: fill the hero. Picking a photo before a slot is the
      // natural first move, and "nothing happened" would be the wrong answer.
      const target = held ?? { page: "home", slot: "hero", order: 0 };
      assign(target, filename).catch((err) => {
        console.error("[admin] assign failed", err);
        paint({
          kind: "err",
          text: `Couldn't save that: ${err instanceof Error ? err.message : "unknown error"}.`,
        });
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

/**
 * Point one slot at one photo, then re-read the composition.
 *
 * Re-reading rather than patching the local copy is deliberate: the site reads
 * this table too, so what the mock shows after the write must come from the same
 * place the public page will read. A local patch would let the mock and the site
 * disagree — which is the failure mode this whole feature exists to remove.
 */
async function assign(
  target: { page: string; slot: string; order: number },
  filename: string,
): Promise<void> {
  const photo = items.find((p) => p.filename === filename) ?? null;

  // A wall slot past the end of the seeded rows has no row to update. Create it,
  // because "add a 16th row" is a thing he will want and failing it would be
  // inexplicable from his side.
  try {
    await setSlot(target.page, target.slot, target.order, photo?.id ?? null, filename);
  } catch {
    await createSlot(target.page, target.slot, target.order, photo?.id ?? null, filename);
  }

  comp = await loadComposition();
  held = null;
  paint({ kind: "ok", text: "Saved — that's on the site now." });
}

/** The committed choices, so the mock is never empty and never wrong. */
function fallbackComposition(): { strip: string[]; hero: string | null; rows: string[][] } {
  const strip: string[] = [];
  for (const f of SITE.homeStrip) strip.push(f);
  const idToFile = new Map(DEMO_PHOTOS.map((p) => [p.id, p.filename]));
  const rows = PHOTO_ROWS.map((r) => r.map((id) => idToFile.get(id) ?? ""));
  return { strip, hero: SITE.heroPhoto, rows };
}

async function loadComposition(): Promise<Composition> {
  // filename is optional on the Photo type, and a Set<string> will not take
  // undefined — so an unnamed row is filtered rather than coerced to "".
  // Coercing would put an empty string in `known`, which would then resolve as
  // a valid "file" and let an empty slot render as a real image.
  const known = new Set<string>([
    ...items.map((p) => p.filename).filter((f): f is string => !!f),
    ...DEMO_PHOTOS.map((p) => p.filename).filter((f): f is string => !!f),
  ]);
  return readComposition(known, fallbackComposition());
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
  comp = await loadComposition();
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
