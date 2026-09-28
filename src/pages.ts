import { escapeHtml } from "./layout";
import type { Photo } from "./types";

/** Round-robin into N columns, preserving the admin's chosen order. */
export function columnise<T>(items: T[], cols: number): T[][] {
  const out: T[][] = Array.from({ length: cols }, () => []);
  items.forEach((it, i) => out[i % cols].push(it));
  return out;
}

function figure(p: Photo): string {
  return `<figure class="cell">
      <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.alt || p.filename || "")}"
           loading="lazy" decoding="async"
           data-full="${escapeHtml(p.url)}" data-alt="${escapeHtml(p.alt || "")}" />
    </figure>`;
}

/** The photo route: independent columns, each scrolling on its own. */
export function photoPage(photos: Photo[], cols: number): string {
  if (!photos.length) {
    return `<section class="empty">
      <p>No photos published yet.</p>
      <p class="dim">If you're the admin, add some in <a href="#/admin">the gallery manager</a>.</p>
    </section>`;
  }

  return `<section class="grid" data-cols="${cols}">
    ${columnise(photos, cols)
      .map((col) => `<div class="col">${col.map(figure).join("")}</div>`)
      .join("")}
  </section>`;
}
