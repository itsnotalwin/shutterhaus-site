export function markLoadedImages(): void {
  for (const im of document.querySelectorAll<HTMLImageElement>(".cell img")) {
    if (im.classList.contains("is-loaded")) continue;
    if (im.complete && im.naturalWidth > 0) {
      im.classList.add("is-loaded");
      continue;
    }
    im.addEventListener("load", () => im.classList.add("is-loaded"), { once: true });
    im.addEventListener("error", () => im.classList.add("is-loaded"), { once: true });
  }
}

function ladderFor(frame: HTMLImageElement): { w: number; url: string }[] {
  const out: { w: number; url: string }[] = [];
  const pic = frame.closest("picture");
  if (!pic) return out;
  for (const s of pic.querySelectorAll<HTMLSourceElement>('source[type="image/webp"]')) {
    for (const part of (s.getAttribute("srcset") || "").split(",")) {
      const m = /^\s*(\S+)\s+(\d+)w\s*$/.exec(part);
      if (m) out.push({ url: m[1]!, w: Number(m[2]) });
    }
  }
  return out;
}

function aspectOf(frame: HTMLImageElement): number | null {
  if (frame.naturalWidth > 0 && frame.naturalHeight > 0) {
    return frame.naturalWidth / frame.naturalHeight;
  }
  const m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(frame.style.aspectRatio || "");
  return m ? Number(m[1]) / Number(m[2]) : null;
}

function lightboxSrc(frame: HTMLImageElement): string {
  const original = frame.dataset.full ?? "";
  if (!original) return "";

  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return original;
  const EDGE_W = 0.92;
  const EDGE_H = 0.86;
  const ar = aspectOf(frame);
  const cssW = ar
    ? Math.min(EDGE_W * window.innerWidth, EDGE_H * window.innerHeight * ar)
    : EDGE_W * window.innerWidth;
  const px = Math.ceil(cssW * (window.devicePixelRatio || 1));

  const ladder = ladderFor(frame).sort((a, b) => a.w - b.w);
  return ladder.find((c) => c.w >= px)?.url ?? original;
}

export function initLightbox(): () => void {
  markLoadedImages();
  document.addEventListener("contextmenu", (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "IMG") e.preventDefault();
  });
  document.addEventListener("dragstart", (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "IMG") e.preventDefault();
  });

  const box = document.createElement("dialog");
  box.className = "lb";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Photo viewer");
  box.hidden = true;
  // The hidden dialog has no image request until show() assigns a real frame.
  box.innerHTML = `<button class="lb__x" type="button" aria-label="Close"><span class="lb__g">×</span><span class="lb__t">Close</span></button>
                   <button class="lb__nav lb__nav--p" type="button" aria-label="Previous"><span class="lb__g">‹</span><span class="lb__t">← Prev</span></button>
                   <img class="lb__img" alt="" />
                   <button class="lb__nav lb__nav--n" type="button" aria-label="Next"><span class="lb__g">›</span><span class="lb__t">Next →</span></button>
                   <p class="lb__cap"></p>`;
  document.body.appendChild(box);

  const img = box.querySelector<HTMLImageElement>(".lb__img")!;
  const cap = box.querySelector<HTMLElement>(".lb__cap")!;
  let frames: HTMLImageElement[] = [];
  let at = 0;
  let returnFocus: HTMLElement | null = null;
  let returnFrameUrl: string | null = null;
  let backgroundWasInert = false;
  let previousOverflow = "";
  const background = document.getElementById("app");
  cap.setAttribute("aria-live", "polite");

  const pad2 = (n: number) => String(n).padStart(2, "0");

  function wallFrames(): HTMLImageElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(".pf-cell"))
      .filter((c) => !c.hidden && !c.closest('details:not([open])'))
      .sort((a, b) => Number(a.dataset.n) - Number(b.dataset.n))
      .map((c) => c.querySelector<HTMLImageElement>(".cell img[data-full]"))
      .filter((x): x is HTMLImageElement => !!x);
  }

  function show(i: number): void {
    if (!frames.length) return;
    at = (i + frames.length) % frames.length;
    const f = frames[at];
    zoomed = false;
    applyZoom();
    img.src = lightboxSrc(f);
    img.alt = f.dataset.alt || f.alt;
    const cell = f.closest<HTMLElement>(".pf-cell");
    const totalVisible = frames.length;
    // Descriptions belong to the image's alt attribute, never a visible caption.
    const position = cell ? Number(cell.dataset.n) : at + 1;
    cap.textContent = `${pad2(position)} / ${pad2(totalVisible)}`;
  }

  function open(target: HTMLImageElement): void {
    if (box.hidden) {
      returnFocus = target.closest<HTMLElement>('[role="button"]')
        ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      returnFrameUrl = target.dataset.full ?? null;
      backgroundWasInert = background?.inert ?? false;
      previousOverflow = document.body.style.overflow;
    }
    const fromWall = !!target.closest(".pf-cell");
    frames = fromWall
      ? wallFrames()
      : Array.from(document.querySelectorAll<HTMLImageElement>(".cell img[data-full]"));
    box.classList.toggle("lb--wall", fromWall);
    show(Math.max(0, frames.indexOf(target)));
    box.hidden = false;
    box.showModal();
    document.body.style.overflow = "hidden";
    if (background) background.inert = true;
    box.querySelector<HTMLButtonElement>(".lb__x")?.focus();
  }
  let zoomed = false;
  const stage = document.createElement("button");
  stage.type = "button";
  stage.className = "lb__stage";
  stage.appendChild(img);
  box.insertBefore(stage, box.querySelector(".lb__cap"));
  const applyZoom = () => {
    img.style.transform = "";
    stage.setAttribute("aria-label", zoomed ? "Zoom out" : "Zoom in");
    stage.setAttribute("aria-pressed", String(zoomed));
    stage.classList.toggle("is-zoomed", zoomed);
  };

  function close(): void {
    if (box.hidden) return;
    box.close();
    box.hidden = true;
    img.removeAttribute("src");
    document.body.style.overflow = previousOverflow;
    if (background) background.inert = backgroundWasInert;
    const replacement = returnFrameUrl
      ? [...document.querySelectorAll<HTMLImageElement>('.cell img[data-full]')]
          .find(frame => frame.dataset.full === returnFrameUrl)?.closest<HTMLElement>('[role="button"]')
      : null;
    const focusTarget = returnFocus?.isConnected ? returnFocus : replacement;
    const more = focusTarget?.closest<HTMLDetailsElement>('details');
    if (more && !more.open) more.open = true;
    focusTarget?.focus({ preventScroll: true });
    zoomed = false;
    img.style.transform = "";
    stage.classList.remove("is-zoomed");
  }
  box.style.touchAction = "none";

  const SLOP = 10;
  const COMMIT = 48;
  const DISMISS = 90;

  let drag: { id: number; x0: number; y0: number; axis: "" | "x" | "y" } | null = null;
  let swallowClick = false;
  document.addEventListener("pointerdown", () => { swallowClick = false; }, true);

  box.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    if ((e.target as Element).closest("button:not(.lb__stage)")) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: "" };
  });

  box.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }
    if (drag.axis === "x") {
      img.style.transform = `translateX(${dx}px)`;
    }
  });

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { x0, y0, axis } = drag;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    drag = null;
    img.style.transform = "";
    if (!axis) return;
    swallowClick = true;
    if (axis === "y") {
      if (dy >= DISMISS) close();
      return;
    }
    if (Math.abs(dx) >= COMMIT) show(dx < 0 ? at + 1 : at - 1);
  };
  box.addEventListener("pointerup", endDrag);
  box.addEventListener("pointercancel", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    img.style.transform = "";
  });
  const noSave = (e: Event) => e.preventDefault();
  box.addEventListener("contextmenu", noSave);
  box.addEventListener("dragstart", noSave);
  box.style.userSelect = "none";
  box.style.webkitUserSelect = "none";
  img.setAttribute("draggable", "false");
  document.addEventListener("click", (e) => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest(".photo-trigger")) {
      const frame = t.closest(".photo-trigger")?.querySelector<HTMLImageElement>("img[data-full]");
      if (frame) open(frame);
    } else if (t.closest(".lb__x") || t === box) {
      close();
    } else if (t.closest(".lb__nav--n")) {
      show(at + 1);
    } else if (t.closest(".lb__nav--p")) {
      show(at - 1);
    } else if (t.closest(".lb__stage")) {
      zoomed = !zoomed;
      applyZoom();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const cell = (e.target as HTMLElement | null)?.closest?.('.pf-cell, .hstrip__item[role="button"]');
    if (!cell || cell instanceof HTMLButtonElement) return;
    e.preventDefault();
    const target = cell.querySelector<HTMLImageElement>(".cell img[data-full]");
    if (!target) return;
    open(target);
  });

  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Tab") {
      const controls = Array.from(box.querySelectorAll<HTMLButtonElement>("button"));
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") { e.preventDefault(); show(at + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); show(at - 1); }
  });
  box.addEventListener("cancel", event => { event.preventDefault(); close(); });
  return close;
}
