/** Mount the responsive drawer and clean it up when its page is replaced. */
export function mountNavigation(syncHeader: () => void): { close: () => void; destroy: () => void } {
  const button = document.querySelector<HTMLButtonElement>(".burger");
  const nav = document.getElementById("site-nav");
  const main = document.querySelector<HTMLElement>(".main");
  if (!button || !nav) return { close: () => {}, destroy: () => {} };
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const mobile = matchMedia("(max-width: 1000px)");
  const scrim = document.createElement("div");
  scrim.className = "nav-scrim";
  scrim.setAttribute("aria-hidden", "true");
  let open = false;

  function set(next: boolean): void {
    open = mobile.matches && next;
    button!.setAttribute("aria-expanded", String(open));
    button!.setAttribute("aria-label", open ? "Close menu" : "Menu");
    const label = button!.querySelector(".burger__label");
    if (label) label.textContent = open ? "Close" : "Menu";
    button!.classList.toggle("is-on", open);
    nav!.classList.toggle("is-open", open);
    nav!.inert = mobile.matches && !open;
    if (main) main.inert = open;
    document.body.classList.toggle("nav-open", open);
    document.documentElement.classList.toggle("nav-locked", open);
    if (open) {
      document.body.appendChild(scrim);
      nav!.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    } else {
      scrim.remove();
      if (nav!.contains(document.activeElement)) button!.focus({ preventScroll: true });
    }
    syncHeader();
  }
  const close = () => set(false);
  button.addEventListener("click", () => set(!open), options);
  scrim.addEventListener("click", close, options);
  nav.addEventListener("click", event => {
    if ((event.target as Element).closest("a")) close();
  }, options);
  mobile.addEventListener("change", close, options);
  set(false);
  return { close, destroy: () => { close(); controller.abort(); } };
}
