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
  box.innerHTML = `<button class="lb__x" type="button" aria-label="Close">×</button>
                   <button class="lb__nav lb__nav--p" type="button" aria-label="Previous">‹</button>
                   <img class="lb__img" alt="" />
                   <button class="lb__nav lb__nav--n" type="button" aria-label="Next">›</button>
                   <p class="lb__cap"></p>`;
  document.body.appendChild(box);

  const img = box.querySelector<HTMLImageElement>(".lb__img")!;
  const cap = box.querySelector<HTMLElement>(".lb__cap")!;
  let frames: HTMLImageElement[] = [];
  let at = 0;

  function show(i: number): void {
    if (!frames.length) return;
    at = (i + frames.length) % frames.length;
    img.src = frames[at].dataset.full ?? "";
    img.alt = frames[at].dataset.alt ?? "";
    cap.textContent = frames[at].dataset.alt ?? "";
  }

  function open(i: number): void {
    frames = Array.from(document.querySelectorAll<HTMLImageElement>(".cell img[data-full]"));
    show(i);
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
      const framesNow = Array.from(document.querySelectorAll<HTMLImageElement>(".cell img[data-full]"));
      open(framesNow.indexOf(t as HTMLImageElement));
    } else if (t.closest(".lb__x") || t === box) {
      close();
    } else if (t.closest(".lb__nav--n")) {
      show(at + 1);
    } else if (t.closest(".lb__nav--p")) {
      show(at - 1);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") show(at + 1);
    if (e.key === "ArrowLeft") show(at - 1);
  });
}
