import { FONTS, SITE } from "./config";
import type { IconId } from "./types";

/**
 * The WhatsApp mark as a STROKE bubble with the handset drawn on top in the
 * page background colour, in a 20x20 box.
 *
 * HISTORY, because this has now been changed twice and reverted once:
 *
 * 1. Original: stroke bubble, handset filled `var(--paper)`. Alwin liked the
 *    look. It was duplicated between the header and the contact list, which
 *    disagreed, and the white handset was invisible on the home page where the
 *    header floats over a dark photograph.
 * 2. Replaced with the official WhatsApp silhouette, shared by both renderers.
 *    Rendered inside the stroked header icon that produced a hollow bubble with
 *    the handset clipped off the top edge.
 * 3. Rebuilt from two subpaths with `fill-rule: evenodd`. Correct, legible, and
 *    Alwin's verdict: "the previous whatsapp button was cooler." So this
 *    restores form 1, with the two real defects from step 1 fixed.
 *
 * Fixes over the original, and nothing else about its appearance changed:
 *  - The handset uses the page background via a CSS variable rather than a
 *    hard-coded white, so it reads on the dark header too. `.social` sets
 *    `--social-bg` and the header-over case overrides it.
 *  - ONE definition, shared by layout.ts and pages-more.ts, so the two marks
 *    cannot drift apart again.
 */
export const WHATSAPP_PATH =
  '<path d="M17.2 10.3c0-3.4-2.8-6.2-6.2-6.2a6.2 6.2 0 0 0-5.4 9.4L3.7 17.4l4-1.4a6.2 6.2 0 0 0 9.5-5.7Z"/>' +
  '<path d="M16.2 10.2c-.3-.2-1.5-.7-1.8-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a8 8 0 0 1-2.3-1.4 8.6 8.6 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.5c.2-.2.2-.3.3-.5a.5.5 0 0 0 0-.5c0-.1-.6-1.3-.8-1.8s-.4-.4-.6-.4h-.4c-.2 0-.4 0-.6.3s-.8.8-.8 1.4a3.7 3.7 0 0 0 .7 1.8 8.7 8.7 0 0 0 3.3 2.9 11 11 0 0 0 4.4.9c.6 0 1.1-.1 1.5-.2a4.4 4.4 0 0 0 2.9-2.5c.2-.8.2-1.4.1-1.5Z" fill="var(--social-bg, #fff)" stroke="none"/>';

/** Dependency-free SVG icons, stroke-based to match the reference chrome. */
const ICONS: Record<IconId, string> = {
  instagram:
    '<rect x="2.5" y="2.5" width="15" height="15" rx="4.5"/><circle cx="10" cy="10" r="3.2"/><circle cx="14.6" cy="5.4" r="1" fill="currentColor" stroke="none"/>',
  facebook:
    '<path d="M11.6 17.5v-6.2h2.1l.3-2.4h-2.4V7.5c0-.7.2-1.2 1.2-1.2h1.3V4.2c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3v1.5H6.8v2.4h2.2v6.2z" fill="currentColor" stroke="none"/>',
  // Filled, not stroked. `evenodd` is set on the path itself rather than on the
  // svg, so this mark behaves the same whichever of the two renderers draws it.
  whatsapp: WHATSAPP_PATH,
  mail: '<rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="m3 5.5 7 5 7-5"/>',
  google:
    '<path d="M18.2 10.2c0-.7-.06-1.3-.18-1.9H10.4v3.6h4.4a3.8 3.8 0 0 1-1.65 2.5v2h2.66c1.56-1.44 2.35-3.55 2.35-6.2z" fill="#4285F4" stroke="none"/><path d="M10.4 18.6c2.2 0 4.06-.73 5.41-1.98l-2.66-2.06c-.73.5-1.67.8-2.75.8-2.12 0-3.92-1.43-4.56-3.36H3.08v2.14A8 8 0 0 0 10.4 18.6z" fill="#34A853" stroke="none"/><path d="M5.84 11.99a4.8 4.8 0 0 1 0-3.06V6.79H3.08a8 8 0 0 0 0 7.34l2.76-2.14z" fill="#FBBC05" stroke="none"/><path d="M10.4 5.52c1.2 0 2.28.41 3.13 1.22l2.34-2.34A7.6 7.6 0 0 0 10.4 3.2a8 8 0 0 0-7.32 4.81l2.76 2.06c.64-1.93 2.44-3.36 4.56-3.36z" fill="#EA4335" stroke="none"/>',
};

export function icon(id: IconId, size = 22): string {
  // Stroke scales with the viewBox, so a 20px icon draws a 1.25/20 stroke at
  // 1.25px — the same optical weight as the old 15px icon only by accident.
  // Drop to 1.05 so growing the icon makes it look bigger, not bolder. The
  // brief is a minimal brutalist line, and a thick stroke reads as a blob.
  //
  // Alwin, 2026-10-03: "make sure our icons are high quality and clearly
  // visible." 20px -> 22px, and the default stroke lightened from 1.25 to 1.15
  // so the growth reads as size rather than as a bolder line.
  return `<svg class="icon" viewBox="0 0 20 20" width="${size}" height="${size}" fill="none"
    stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${ICONS[id]}</svg>`;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * The href that serves a route as a real document.
 *
 * Every route is its own file now (see tools/build-pages.py), so links point at
 * `portfolio.html` rather than `#/portfolio`. That is the point of the split: a
 * crawler and a scraper get a document, and the browser gets a real URL it can
 * bookmark, share and go Back to.
 *
 * `home` maps to `./` rather than `index.html` so the homepage keeps its clean
 * apex URL — `index.html` and `/` are the same document, and the apex is what
 * is canonical.
 */
function pageHref(id: string): string {
  return id === "home" ? "./" : `./${id}.html`;
}

/**
 * The site chrome, matching the reference: a small word inlined before two big
 * stacked words, nav offset from the left, socials pinned right.
 */
export function header(active: string): string {
  const wordmark = `
    <a class="logo" href="${pageHref("home")}" aria-label="${escapeHtml(SITE.nameTop)} ${escapeHtml(SITE.nameBig2)} | home">
      <span class="logo-row">
        <span class="logo-sm">${escapeHtml(SITE.nameTop)}</span>
        <span class="logo-lg">${escapeHtml(SITE.nameBig1)}</span>
      </span>
      <span class="logo-lg logo-lg--b">${escapeHtml(SITE.nameBig2)}</span>
    </a>`;

  const nav = SITE.nav
    .map(
      (n) =>
        `<a class="nav-link${n.id === active ? " is-active" : ""}" href="${pageHref(n.id)}"${
          n.id === active ? ' aria-current="page"' : ""
        }>${escapeHtml(n.label)}</a>`,
    )
    .join("");

  const social = SITE.social
    .map(
      (s) =>
        `<a class="social" href="${escapeHtml(s.url)}" target="_blank" rel="noopener"
          aria-label="${escapeHtml(s.label)}" title="${escapeHtml(s.label)}">${icon(s.id)}</a>`,
    )
    .join("");

  return `<header class="site-header">
    ${wordmark}
    <button class="burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-nav">
      <span class="burger__label">Menu</span>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="Primary">${nav}</nav>
    <div class="site-social">${social}</div>
  </header>`;
}

/**
 * Full page shell — header + the active route's body.
 *
 * `over` makes the header float transparently on top of the first photograph
 * instead of sitting in its own white bar. Home, Services and Contact have
 * photographic or dark introductions; other routes keep solid chrome.
 */
export function renderShell(active: string, body: string, over = false): string {
  // No `is-bw` class. It gated the greyscale filter (styles.css:301) and nothing
  // else: after the filter was removed on 2026-10-02 at Alwin's instruction,
  // the class was emitted on every page and matched no rule. Carrying it
  // suggested a monochrome treatment that no longer exists.
  return `<div class="shell shell--${escapeHtml(active)}${over || active === "services" || active === "contact" ? " shell--over" : ""}">${header(active)}<main class="main">${body}</main></div>`;
}

export { FONTS };
