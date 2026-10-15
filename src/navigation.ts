/** One live drawer controller. Repainting a route disposes the old listeners. */
let dispose: (() => void) | undefined;
export function wireNavigation(): () => void {
  dispose?.();
  const button = document.querySelector<HTMLButtonElement>('.burger');
  const nav = document.querySelector<HTMLElement>('#site-nav');
  if (!button || !nav) return () => {};
  const mobile = matchMedia('(max-width: 1000px)');
  const background = [...document.querySelectorAll<HTMLElement>('.main, .site-footer, .logo, .skip-link')];
  const scrim = document.createElement('div');
  scrim.className = 'nav-scrim';
  scrim.setAttribute('aria-hidden', 'true');
  let opened = false;
  function set(open: boolean, restore = true): void {
    const wasOpen = opened;
    opened = open && mobile.matches;
    button!.setAttribute('aria-expanded', String(opened));
    button!.setAttribute('aria-label', opened ? 'Close menu' : 'Open menu');
    button!.classList.toggle('is-on', opened);
    nav!.classList.toggle('is-open', opened);
    nav!.inert = mobile.matches && !opened;
    document.body.classList.toggle('nav-open', opened);
    document.documentElement.classList.toggle('nav-locked', opened);
    background.forEach(el => el.inert = opened);
    if (opened) {
      document.body.appendChild(scrim);
      nav!.querySelector<HTMLAnchorElement>('a')?.focus();
    } else {
      scrim.remove();
      if (wasOpen && restore && mobile.matches) button!.focus();
    }
  }
  const close = () => set(false);
  const toggle = () => set(!opened);
  const navigate = (event: MouseEvent) => {
    if ((event.target as Element).closest('a')) set(false, false);
    else if (event.target === nav) set(false);
  };
  const keys = (event: KeyboardEvent) => {
    if (!opened) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const items: HTMLElement[] = [button!, ...nav!.querySelectorAll<HTMLAnchorElement>('a')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)!.focus(); }
    else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); button!.focus(); }
  };
  button.addEventListener('click', toggle);
  scrim.addEventListener('click', close);
  nav.addEventListener('click', navigate);
  document.addEventListener('keydown', keys);
  mobile.addEventListener('change', close);
  set(false, false);
  dispose = () => {
    set(false, false);
    button.removeEventListener('click', toggle);
    nav.removeEventListener('click', navigate);
    document.removeEventListener('keydown', keys);
    mobile.removeEventListener('change', close);
  };
  return close;
}
