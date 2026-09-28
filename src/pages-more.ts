import { SITE } from "./config";
import { escapeHtml } from "./layout";
import type { VideoItem } from "./types";

/** The video route — same column grid, each item plays in place. */
export function videoPage(videos: VideoItem[], cols: number): string {
  if (!videos.length) {
    return `<section class="empty">
      <p>Nothing filmed yet.</p>
      <p class="dim">Motion work is being edited — get in touch if it's urgent.</p>
    </section>`;
  }

  const buckets: VideoItem[][] = Array.from({ length: cols }, () => []);
  videos.forEach((v, i) => buckets[i % cols].push(v));

  const one = (v: VideoItem) => `<figure class="cell cell--video">
        <video controls preload="metadata"
               ${v.poster ? `poster="${escapeHtml(v.poster)}"` : ""}
               playsinline>
          <source src="${escapeHtml(v.src)}" />
          Your browser can't play this video.
        </video>
        ${v.title ? `<figcaption>${escapeHtml(v.title)}</figcaption>` : ""}
      </figure>`;

  return `<section class="grid" data-cols="${cols}">
    ${buckets.map((b) => `<div class="col">${b.map(one).join("")}</div>`).join("")}
  </section>`;
}

/** The contact route — details, a mailto form, and the direct links. */
export function contactPage(): string {
  const c = SITE.contact;
  const wa = `https://wa.me/${c.phone.replace(/\D/g, "")}`;

  return `<section class="contact">
    <div class="contact__col">
      <h1 class="contact__h">Let's shoot.</h1>
      <p class="contact__p">${escapeHtml(SITE.blurb)}</p>

      <ul class="contact__list">
        <li><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></li>
        <li><a href="tel:${escapeHtml(c.phone.replace(/\s/g, ""))}">${escapeHtml(c.phone)}</a></li>
        <li><a href="${escapeHtml(wa)}" target="_blank" rel="noopener">WhatsApp</a></li>
        <li class="dim">${escapeHtml(c.location)}<br />${escapeHtml(c.hours)}</li>
      </ul>
    </div>

    <form class="cform" id="cform" novalidate>
      <label>Name<input name="name" type="text" required autocomplete="name" /></label>
      <label>Email<input name="email" type="email" required autocomplete="email" /></label>
      <label>What do you need?
        <select name="kind">
          <option>Mini session</option>
          <option>Portrait</option>
          <option>Couples / family</option>
          <option>Social content</option>
          <option>Something else</option>
        </select>
      </label>
      <label>Message<textarea name="message" rows="4" required></textarea></label>
      <button type="submit">Send enquiry</button>
      <p class="cform__note dim" id="cform-note"></p>
    </form>
  </section>`;
}
