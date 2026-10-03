import { FONTS, SITE } from "./config";
import type { IconId } from "./types";

/**
 * The WhatsApp mark, in a 24x24 box, as ONE path with `fill-rule: evenodd`.
 *
 * Alwin, 2026-10-03: "our icons are high quality and clearly visible, the
 * WhatsApp ones are different." The header and the contact page drew it two
 * different ways, and the header's version punched the handset out in
 * `var(--paper)` — white — so on the home page, where the header floats over a
 * dark photograph, the handset vanished and left a hollow bubble.
 *
 * The first fix here, using the official WhatsApp silhouette path, was WRONG and
 * is worth recording: rendered inside the stroked header icon it produced a
 * hollow bubble with a fragment of handset clipped at the top edge. A complex
 * third-party outline path does not survive being dropped into a stroked,
 * `fill: none` svg at a different scale from the one it was drawn for.
 *
 * So it is now built from two simple, reliable subpaths — a speech bubble and
 * the Material handset — combined with `evenodd`. `evenodd` is the point: it
 * guarantees the handset becomes a hole in the bubble regardless of which way
 * each subpath winds. Winding-independent, so the mark cannot invert into a
 * solid blob if either path is edited. One path, one colour, one rule, and it
 * follows `currentColor` on both the white and the dark header.
 */
const WA_BUBBLE =
  "M12 2C6.48 2 2 6.48 2 12c0 1.85.53 3.58 1.44 5.03L2 22l5.09-1.4A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Z";
const WA_HANDSET =
  "M7.4 6.6c.3-.7.6-.7.9-.7h.7c.2 0 .5 0 .7.6l.8 1.9c.1.3 0 .5-.1.7l-.5.6c-.2.2-.3.4-.1.7.4.8 1 1.5 1.7 2 .3.2.5.2.7.1l.7-.8c.2-.2.4-.2.7-.1l1.8.9c.3.1.4.3.4.6v.7c0 .5-.3 1-.7 1.2-.4.2-1 .3-1.6.2-1.6-.2-3.3-1-4.7-2.3-1.3-1.2-2.2-2.7-2.5-4.2-.1-.6 0-1.2.2-1.6Z";

export const WHATSAPP_PATH = WA_BUBBLE + WA_HANDSET;

/** Dependency-free SVG icons, stroke-based to match the reference chrome. */
const ICONS: Record<IconId, string> = {
  instagram:
    '<rect x="2.5" y="2.5" width="15" height="15" rx="4.5"/><circle cx="10" cy="10" r="3.2"/><circle cx="14.6" cy="5.4" r="1" fill="currentColor" stroke="none"/>',
  facebook:
    '<path d="M11.6 17.5v-6.2h2.1l.3-2.4h-2.4V7.5c0-.7.2-1.2 1.2-1.2h1.3V4.2c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3v1.5H6.8v2.4h2.2v6.2z" fill="currentColor" stroke="none"/>',
  // Filled, not stroked. `evenodd` is set on the path itself rather than on the
  // svg, so this mark behaves the same whichever of the two renderers draws it.
  whatsapp: `<g transform="scale(0.8333)"><path d="${WHATSAPP_PATH}" fill="currentColor" fill-rule="evenodd" stroke="none"/></g>`,
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
    <a class="logo" href="${pageHref("home")}" aria-label="${escapeHtml(SITE.nameTop)} | home">
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
      <span class="burger__bars" aria-hidden="true"><i></i><i></i></span>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="Primary">${nav}</nav>
    <div class="site-social">${social}</div>
  </header>`;
}

/**
 * Full page shell — header + the active route's body.
 *
 * `over` makes the header float transparently on top of the first photograph
 * instead of sitting in its own white bar. Only the home page uses it; every
 * other route has a white page behind the header, where transparent type
 * would be invisible.
 */
export function renderShell(active: string, body: string, over = false): string {
  // No `is-bw` class. It gated the greyscale filter (styles.css:301) and nothing
  // else: after the filter was removed on 2026-10-02 at Alwin's instruction,
  // the class was emitted on every page and matched no rule. Carrying it
  // suggested a monochrome treatment that no longer exists.
  return `<div class="shell${over ? " shell--over" : ""}">${header(active)}<main class="main">${body}</main></div>`;
}

export { FONTS };
