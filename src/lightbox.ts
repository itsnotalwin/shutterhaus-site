/** Click-to-enlarge lightbox for the photo grid. */

/**
 * Tag every grid frame that has decoded so the CSS fade-in can run.
 *
 * Called after EVERY gallery paint, not once at boot: the grid re-renders when
 * live Supabase photos replace the bundled set, and frames added by that
 * second paint would otherwise sit at opacity 0 waiting for a class nothing
 * ever sets.
 */
export function markLoadedImages(): void {
  for (const im of document.querySelectorAll<HTMLImageElement>(".cell img")) {
    if (im.classList.contains("is-loaded")) continue;
    if (im.complete && im.naturalWidth > 0) {
      im.classList.add("is-loaded");
      continue;
    }
    im.addEventListener("load", () => im.classList.add("is-loaded"), { once: true });
    // A failed frame must not stay invisible forever.
    im.addEventListener("error", () => im.classList.add("is-loaded"), { once: true });
  }
}

/**
 * The derivative rung the browser was ALREADY offered for this frame, read
 * back off the <picture> that rendered its thumbnail.
 *
 * Empty when there is no webp <source>. That is the absolute-URL case — a
 * photo from the Supabase CDN has no local ladder at all — and for that the
 * original is the right answer rather than a file that does not exist.
 */
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

/**
 * The frame's own width:height ratio.
 *
 * Read off the thumbnail, which is already decoded — the user tapped it — and
 * every rung of the ladder preserves aspect, so the thumbnail's intrinsic size
 * is the frame's ratio exactly. Falls back to the ratio `figure()` writes
 * inline, and to null when neither is known.
 */
function aspectOf(frame: HTMLImageElement): number | null {
  if (frame.naturalWidth > 0 && frame.naturalHeight > 0) {
    return frame.naturalWidth / frame.naturalHeight;
  }
  const m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(frame.style.aspectRatio || "");
  return m ? Number(m[1]) / Number(m[2]) : null;
}

/**
 * The file the lightbox should actually load for one frame.
 *
 * WHY NOT ALWAYS THE ORIGINAL
 * ---------------------------
 * This used to be `img.src = data-full`, the full-resolution export, for
 * everyone. One tap on a 393px phone therefore pulled 415,513 bytes for
 * 49-img-0131: a 1600x2400 JPEG decoded into a box that can show at most ~1085
 * device pixels. That is roughly four times the pixels the glass can resolve,
 * paid for on a 1.6Mbps phone, for a picture that looks identical.
 *
 * WHY THE LADDER IS READ FROM THE DOM AND NOT BUILT
 * -------------------------------------------------
 * `derivative()` BUILDS a path; it never checks the file is on disk, and
 * `make-derivatives.py` does not upscale. So a photo narrower than the width
 * asked for has no such derivative and the lightbox 404s into a broken image —
 * the exact failure `src/pages.ts` documents for the home hero, which is why
 * `tools/check-srcset.py` gates the build. Every entry in a rendered srcset is
 * a file the build has already proven is there, so asking from that list cannot
 * 404 whatever the source width turns out to be.
 *
 * WHY A DESKTOP STILL GETS THE EXPORT
 * ------------------------------------
 * Deliberately, and by pointer rather than by arithmetic. A visitor with a real
 * cursor is on a screen that can show the photograph, they opened it on purpose,
 * and this is a photographer's site — the full-resolution file is the
 * deliverable there, not a consolation prize. Downgrading it would save bytes
 * nobody asked to save at the cost of the one thing this site is selling.
 *
 * WHY THE TOUCH PATH MEASURES BOTH EDGES
 * ---------------------------------------
 * `.lb__img` is contain-fitted inside a box that is at most 92vw AND at most
 * 86vh, and which of those binds depends on the frame's own ratio. Working out
 * the width from 92vw alone — which is what the first version of this did —
 * overstates by more than 2x for a portrait frame on a wide screen, because the
 * height cap is what actually limits it. Measured: at 1280x800 a 1600x2400
 * frame is painted into 459 CSS px, not the 1177 that 92vw suggests.
 *
 * `tools/make-derivatives.py` already wrote 400 / 800 / 1200 / 1600 for every
 * frame: the mean 1200w webp is 138kB against a mean original of 596kB, and
 * 49-img-0131 drops from 415kB to 95kB. Rounding UP to the next rung is
 * deliberate, in the same spirit as wallSizes(): understating costs sharpness,
 * overstating costs a little bandwidth.
 */
function lightboxSrc(frame: HTMLImageElement): string {
  const original = frame.dataset.full ?? "";
  if (!original) return "";

  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return original;

  // Mirrors `max-width: 92vw` and `max-height: 86vh` on `.lb__img`, the way
  // wallSizes() in pages.ts mirrors --pad and --gut.
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

export function initLightbox(): void {
  markLoadedImages();

  // Page-wide save blocking, installed once rather than per-lightbox-open,
  // because the photographs are reachable without ever opening the lightbox:
  // the hero, the package cards and the portfolio wall are all plain <img>.
  // Alwin asked for this on the hero specifically ("the hero is also affected
  // by this"), and the same reasoning applies to every other frame.
  //
  // `contextmenu` covers right-click on desktop. `dragstart` covers drag-to-a-
  // new-tab, which is a separate path to the same result and is NOT covered by
  // the CSS alone. Both are cancellable; cancelling them is the whole extent of
  // what is being claimed here. See the longer note on the lightbox's own
  // handlers for what this does not do.
  document.addEventListener("contextmenu", (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "IMG") e.preventDefault();
  });
  document.addEventListener("dragstart", (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "IMG") e.preventDefault();
  });

  const box = document.createElement("div");
  box.className = "lb";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Photo viewer");
  box.hidden = true;
  // Each control carries BOTH a glyph and a word; CSS shows one. The glyphs (×
  // ‹ ›) are what the home page's lightbox has always shown, and the home page
  // is locked. The words (CLOSE / PREV / NEXT) appear only under `.lb--wall`,
  // which is set when the lightbox is opened from the portfolio wall.
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

  /**
   * The portfolio wall's frames, in the order the eye reads them (their
   * permanent number), skipping any the filter has hidden.
   *
   * The generic query below returns frames in DOM order, which on the wall is
   * column by column (everything in column one, then column two), so Next
   * would walk down one column instead of across the wall — and it includes
   * cells the filter has hidden, so with Places selected the arrows would step
   * through 46 frames the visitor cannot see.
   */
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
    img.src = lightboxSrc(f);
    // The alt stays on the <img> for screen readers either way.
    img.alt = f.dataset.alt ?? "";
    const cell = f.closest<HTMLElement>(".pf-cell");
    // Wall: "02 / 50", using the frame's permanent number and the TOTAL wall
    // size, so it matches the number printed on the tile. Elsewhere (the home
    // strip) the caption is the alt text, exactly as before.
    const totalVisible = frames.length;
    cap.textContent = cell
      ? `${pad2(Number(cell.dataset.n))} / ${pad2(totalVisible)}`
      : (f.dataset.alt ?? "");
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
    document.body.style.overflow = "hidden";
    if (background) background.inert = true;
    box.querySelector<HTMLButtonElement>(".lb__x")?.focus();
  }

  // Declared before close() so the reset inside it can reach them; hoisted from
  // the deterrence block further down, which is where they are used.
  let zoomed = false;
  const stage = document.createElement("div");
  stage.className = "lb__stage";
  stage.appendChild(img);
  box.insertBefore(stage, box.querySelector(".lb__cap"));
  const applyZoom = () => {
    img.style.transform = zoomed ? "scale(2)" : "";
    stage.classList.toggle("is-zoomed", zoomed);
  };

  function close(): void {
    if (box.hidden) return;
    box.hidden = true;
    img.src = "";
    document.body.style.overflow = previousOverflow;
    if (background) background.inert = backgroundWasInert;
    // Rotation can repack the wall while the viewer is open. Restore focus to
    // the same photograph in the new columns if its old element was replaced.
    const replacement = returnFrameUrl
      ? [...document.querySelectorAll<HTMLImageElement>('.cell img[data-full]')]
          .find(frame => frame.dataset.full === returnFrameUrl)?.closest<HTMLElement>('[role="button"]')
      : null;
    const focusTarget = returnFocus?.isConnected ? returnFocus : replacement;
    // A desktop frame may move into the mobile disclosure during rotation.
    // Reveal it before restoring focus so the visitor returns to their photo.
    const more = focusTarget?.closest<HTMLDetailsElement>('details');
    if (more && !more.open) more.open = true;
    focusTarget?.focus({ preventScroll: true });
    // Reset zoom on close, or the next frame opens pre-zoomed and the visitor
    // cannot tell why it is cropped with no way back to fit.
    zoomed = false;
    img.style.transform = "";
    stage.classList.remove("is-zoomed");
  }

  // ---- swipe ---------------------------------------------------------------
  //
  // A 310px CDP touch drag changed nothing before this block existed, and the
  // missing handler was only half the reason. With no `touch-action` on the
  // overlay the browser claims the gesture before the page ever sees it:
  // measured against the pre-fix build, a horizontal drag across the photo
  // navigated the tab to about:blank, because Chrome read it as an overscroll
  // history-back. So this property is what makes the gesture reachable at all.
  //
  // `none` is safe here precisely because the overlay has nothing to scroll —
  // the photo is contain-fitted to 86vh inside a fixed, full-viewport box — and
  // it is set from this file rather than from src/styles.css because it is a
  // requirement of this handler, not a choice about how the thing looks.
  box.style.touchAction = "none";

  /**
   * How far a finger must travel, in CSS px, for the gesture to count.
   *
   * SLOP ignores a thumb that is resting rather than swiping. COMMIT is the
   * distance that has to be covered to step the gallery, and at a 393px
   * reference phone it is about an eighth of the width: comfortably reachable,
   * comfortably clear of a sloppy tap. DISMISS is the downward travel that
   * closes, the gesture iOS Photos trained everyone to try first.
   */
  const SLOP = 10;
  const COMMIT = 48;
  const DISMISS = 90;

  let drag: { id: number; x0: number; y0: number; axis: "" | "x" | "y" } | null = null;
  // A touch that MOVED still produces a click when the finger lifts, and that
  // click lands on the backdrop branch of the handler below, which closes. So
  // a swipe that advanced would immediately close what it just advanced. One
  // click is swallowed per drag.
  let swallowClick = false;

  // Cleared on ANY pointerdown, not only on the box. A drag that ends with the
  // lightbox dismissed has no click left to swallow, so the flag outlives the
  // gesture — and the next press is on the WALL, outside the box. Scoping the
  // reset to the box meant that press was swallowed too and the lightbox
  // refused to open until the user tapped a second time. Capture phase, so it
  // runs before anything can consume the click.
  document.addEventListener("pointerdown", () => { swallowClick = false; }, true);

  box.addEventListener("pointerdown", (e) => {
    // Mouse and pen keep the click path exactly as it was: this is a touch
    // gesture only, so a mouse drag still selects and a mouse click still
    // advances. A stylus is a pointing device here, not a thumb.
    if (e.pointerType !== "touch") return;
    // A press that lands on a control is a control press. The close and arrow
    // targets are 44px tall and sit exactly where a thumb naturally falls, so
    // claiming their drags would make the buttons unreliable to use.
    if ((e.target as Element).closest("button")) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: "" };
  });

  box.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      // Lock the axis on the first real movement, so one diagonal drag can
      // never both step the gallery and dismiss the lightbox.
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
    }
    if (drag.axis === "x") {
      // The photo follows the finger 1:1. This is direct manipulation, not an
      // animation — there is no easing, no overshoot and nothing that moves
      // on its own — so it is also why nothing here has to be switched off for
      // prefers-reduced-motion, which asks for the absence of motion the user
      // did not initiate.
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
    // No axis means the finger never travelled: that is a tap, and the click
    // handler below owns it. Advancing on it would double-step the gallery.
    if (!axis) return;
    swallowClick = true;
    if (axis === "y") {
      if (dy >= DISMISS) close();
      return;
    }
    // Leftwards is forward, the same direction as the arrow keys and the same
    // direction the caption counts.
    if (Math.abs(dx) >= COMMIT) show(dx < 0 ? at + 1 : at - 1);
  };
  box.addEventListener("pointerup", endDrag);
  // A gesture the browser takes over (a system edge-swipe, an incoming call)
  // ends without pointerup. Dropping the transform here is what stops a
  // cancelled drag from leaving the photo parked off to one side.
  box.addEventListener("pointercancel", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    img.style.transform = "";
  });

  // ---- image theft deterrence ---------------------------------------------
  //
  // HONEST LIMIT, stated once so nobody reads this as a guarantee: **this does
  // not make the images impossible to take.** A browser is a program that has
  // already been handed the bytes to paint the picture. Anyone can open
  // DevTools, read the network panel, screenshot the canvas, or right-click
  // Save on a machine where the menu is restored. No client-side code can
  // prevent that, and any site claiming otherwise is lying.
  //
  // What this DOES do is remove every casual, one-tap path. Alwin,
  // 2026-10-03: "we can save and download images, which is a huge issue, we
  // should not be able to hold images and just save them." The realistic goal
  // is that an ordinary visitor on a phone cannot save a photo by accident,
  // and a scraper has to work for it.
  //
  // Long-press is the one that actually mattered here. On iOS Safari a
  // long-press on an <img> raises the system callout with "Save Image", and
  // that is the gesture a phone user reaches for without thinking.
  const noSave = (e: Event) => e.preventDefault();
  box.addEventListener("contextmenu", noSave);
  box.addEventListener("dragstart", noSave);
  // `user-select` stops the iOS callout selecting the image as text first.
  box.style.userSelect = "none";
  box.style.webkitUserSelect = "none";
  img.setAttribute("draggable", "false");

  // Tap the photo to toggle a 2x zoom. `touch-action: none` is already set on
  // the overlay above for the swipe handler, so this reuses it rather than
  // fighting it. Applied to a wrapper rather than to the img itself so the
  // swipe handler's `translateX` and this `scale` cannot both write to one
  // `transform` property and cancel each other out.
  document.addEventListener("click", (e) => {
    // The click a completed swipe leaves behind. Swallowed before anything
    // else, so it cannot reach the branches below.
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    const t = e.target as HTMLElement;
    if (t.matches(".cell img[data-full]")) {
      open(t as HTMLImageElement);
    } else if (t.closest(".lb__x") || t === box) {
      close();
    } else if (t.closest(".lb__nav--n")) {
      show(at + 1);
    } else if (t.closest(".lb__nav--p")) {
      show(at - 1);
    } else if (t === img || t === stage) {
      // Tap the photo itself to zoom. Checked last so it cannot swallow the
      // close / nav taps, which all sit outside the stage.
      zoomed = !zoomed;
      applyZoom();
    }
  });

  // Keyboard activation for the portfolio wall cells.
  //
  // Those cells carry `role="button" tabindex="0"`, so Enter and Space must
  // open the frame — otherwise the page advertises a keyboard affordance that
  // does nothing, which is what the <button> wrapper used to do: the lightbox
  // opens on click of the inner img, so pressing Enter on the focused button
  // fired nothing. Opening the frame that contains focus is what the user
  // expects from a role=button, and it keeps the shadow DOM and textContent
  // intact (an <img> inside a button has neither).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const cell = (e.target as HTMLElement | null)?.closest?.('.pf-cell, .hstrip__item[role="button"]');
    if (!cell) return;
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
    if (e.key === "ArrowRight") show(at + 1);
    if (e.key === "ArrowLeft") show(at - 1);
  });
}
