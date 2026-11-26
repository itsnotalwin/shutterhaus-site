/** Only the selected frame enters the request queue. The last decoded image
 * stays on the page until its replacement is ready to print. */
export function mountHeroCarousel(root: Element, selected?: string, pending?: string): void {
  const frame = root.querySelector<HTMLElement>(".hero__fig");
  const controls = root.querySelector<HTMLElement>(".hero__controls");
  const counter = controls?.querySelector<HTMLElement>("[data-slide-count]");
  const notice = root.querySelector<HTMLElement>(".hero__notice");
  const slides = Array.from(root.querySelectorAll<HTMLTemplateElement>("template[data-slide]"));
  if (!frame || !controls || !counter || slides.length < 2 || !controls.hidden) return;

  let displayed = 0;
  let requested = 0;
  let revision = 0;
  let dissolve: Animation | undefined;

  const show = async (next: number, manual: boolean) => {
    const index = (next + slides.length) % slides.length;
    requested = index;
    const ticket = ++revision;
    if (notice) notice.textContent = "";
    delete frame.dataset.requestedFrame;
    if (index === displayed) return;
    const slide = slides[index]!;
    const picture = document.importNode(slide.content, true).querySelector("picture");
    const image = picture?.querySelector("img");
    if (!picture || !image) return;
    if (manual && image.decode) {
      frame.dataset.requestedFrame = slide.dataset.slide;
      try {
        await image.decode();
      } catch {
        if (ticket === revision) {
          delete frame.dataset.requestedFrame;
          if (notice) notice.textContent = "This photograph could not load. Try another frame.";
        }
        return;
      }
    }
    if (ticket !== revision || !frame.isConnected) return;
    dissolve?.cancel();
    const previous = frame.querySelector("picture");
    frame.replaceChildren(picture);
    frame.dataset.frame = slide.dataset.slide;
    delete frame.dataset.requestedFrame;
    displayed = index;
    controls.style.setProperty("--frame-progress", String((index + 1) / slides.length));
    counter.textContent = [index + 1, slides.length].map(n => String(n).padStart(2, "0")).join(" / ");

    if (manual && previous?.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      previous.classList.add("hero__outgoing");
      previous.setAttribute("aria-hidden", "true");
      frame.after(previous);
      dissolve = previous.animate([{opacity: 1}, {opacity: 0}], {
        duration: 260, easing: "cubic-bezier(.33, 0, .24, 1)", fill: "both",
      });
      const removePrevious = () => previous.remove();
      void dissolve.finished.then(removePrevious, removePrevious);
    }
  };

  const restored = selected ? slides.findIndex(slide => slide.dataset.slide === selected) : -1;
  if (restored > 0) void show(restored, false);
  if (pending) {
    const next = slides.findIndex(slide => slide.dataset.slide === pending);
    if (next >= 0) void show(next, true);
  }
  controls.hidden = false;
  controls.addEventListener("click", event => {
    const step = (event.target as Element).closest<HTMLButtonElement>("button[data-step]");
    if (step) void show(requested + Number(step.dataset.step), true);
  });
}
