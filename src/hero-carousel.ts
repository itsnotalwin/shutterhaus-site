/** Upgrade the single server-rendered cover. Inert templates keep every
 * unselected slide out of the image request queue until the visitor asks. */
export function mountHeroCarousel(root: Element, selected?: string): void {
  const figure = root.querySelector<HTMLElement>(".hero__fig");
  const controls = root.querySelector<HTMLElement>(".hero__controls");
  const counter = controls?.querySelector<HTMLElement>("[data-slide-count]");
  const slides = Array.from(root.querySelectorAll<HTMLTemplateElement>("template[data-slide]"));
  if (!figure || !controls || !counter || slides.length < 2 || !controls.hidden) return;

  let index = 0;
  function show(next: number): void {
    index = (next + slides.length) % slides.length;
    const slide = slides[index]!;
    figure!.replaceChildren(slide.content.cloneNode(true));
    figure!.dataset.frame = slide.dataset.slide;
    counter!.textContent = [index + 1, slides.length].map(n => String(n).padStart(2, "0")).join(" / ");
  }
  const restored = selected ? slides.findIndex(slide => slide.dataset.slide === selected) : -1;
  if (restored > 0) show(restored);
  controls.hidden = false;
  controls.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-step]");
    if (button) show(index + Number(button.dataset.step));
  });
}
