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

export function initLightbox(): void {
  markLoadedImages();

  const box = document.createElement("div");
  box.className = "lb";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
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
      .filter((c) => !c.hidden)
      .sort((a, b) => Number(a.dataset.n) - Number(b.dataset.n))
      .map((c) => c.querySelector<HTMLImageElement>(".cell img[data-full]"))
      .filter((x): x is HTMLImageElement => !!x);
  }

  function show(i: number): void {
    if (!frames.length) return;
    at = (i + frames.length) % frames.length;
    const f = frames[at];
    img.src = f.dataset.full ?? "";
    // The alt stays on the <img> for screen readers either way.
    img.alt = f.dataset.alt ?? "";
    const cell = f.closest<HTMLElement>(".pf-cell");
    // Wall: "02 / 50", using the frame's permanent number and the TOTAL wall
    // size, so it matches the number printed on the tile. Elsewhere (the home
    // strip) the caption is the alt text, exactly as before.
    cap.textContent = cell
      ? `${pad2(Number(cell.dataset.n))} / ${pad2(document.querySelectorAll(".pf-cell").length)}`
      : (f.dataset.alt ?? "");
  }

  function open(target: HTMLImageElement): void {
    const fromWall = !!target.closest(".pf-cell");
    frames = fromWall
      ? wallFrames()
      : Array.from(document.querySelectorAll<HTMLImageElement>(".cell img[data-full]"));
    box.classList.toggle("lb--wall", fromWall);
    show(Math.max(0, frames.indexOf(target)));
    box.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function close(): void {
    box.hidden = true;
    img.src = "";
    document.body.style.overflow = "";
  }

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.matches(".cell img[data-full]")) {
      open(t as HTMLImageElement);
    } else if (t.closest(".lb__x") || t === box) {
      close();
    } else if (t.closest(".lb__nav--n")) {
      show(at + 1);
    } else if (t.closest(".lb__nav--p")) {
      show(at - 1);
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
    const cell = (e.target as HTMLElement | null)?.closest?.(".pf-cell");
    if (!cell) return;
    e.preventDefault();
    const target = cell.querySelector<HTMLImageElement>(".cell img[data-full]");
    if (!target) return;
    open(target);
  });

  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") show(at + 1);
    if (e.key === "ArrowLeft") show(at - 1);
  });
}
