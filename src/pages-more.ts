import { SITE } from "./config";
import { escapeHtml } from "./layout";
import { homeBand } from "./pages";
import { pictureFor, bestDerivative } from "./pages";
import type { Photo } from "./types";
import type { PricingTier } from "./config";

/**
 * The about route: prose on the left, a tall portrait on the right, exactly
 * the reference's two-column split. The portrait is the photographer's own
 * frame if one is marked as such, otherwise the first gallery image — a
 * missing image would collapse the column and reflow the whole page.
 */
export function aboutPage(photos: Photo[]): string {
  const a = SITE.about;
  // The photograph of the PHOTOGRAPHER, not one of his models. `photos[0]` is
  // whatever the gallery happens to lead with — currently a studio portrait of a
  // subject — which put a stock-looking headshot beside his name on the one page
  // whose entire job is to answer "who is this person". A.PINNED picks the frame
  // of Alwin on a beach with a metal detector; if the gallery is missing it the
  // page still renders with the old fallback rather than an empty column.
  const shot = photos.find((p) => p.filename === a.photo)
    ?? photos.find((p) => p.album === "about")
    ?? photos[0];

  const fig = shot
    ? `<figure class="about__fig">
         <picture>${pictureFor(shot.url, "(max-width: 1000px) 100vw, 40vw", shot.width)}
           <img src="${escapeHtml(bestDerivative(shot.url, "jpg", shot.width))}" alt="${escapeHtml(shot.alt || shot.filename || "")}"
                loading="lazy" decoding="async"
                style="aspect-ratio:${shot.width ?? 1200}/${shot.height ?? 1600}" />
         </picture>
       </figure>`
    : `<div class="about__fig about__fig--none" aria-hidden="true"></div>`;

  return `<section class="page about">
    <div class="about__body">
      <p class="eyebrow">${escapeHtml(a.eyebrow)}</p>
      <h1 class="about__h">${escapeHtml(a.heading)}</h1>
      <div class="prose about__prose">
        ${a.body.map((para) => `<p class="about__p">${escapeHtml(para)}</p>`).join("")}
      </div>
      <a class="cta about__cta" href="./contact.html">${escapeHtml(a.cta)}</a>
    </div>
    ${fig}
    ${homeBand()}
  </section>`;
}

/**
 * The services route.
 *
 * The reference pairs a short intro beside the heading, then three package
 * cards, then a dark "investment" band. That band is the one place the site
 * inverts to black, so it is pulled out of the card grid and rendered as its
 * own full-width section rather than a fourth card.
 */
export function servicesPage(photos: Photo[] = []): string {
  const p = SITE.pricing;
  if (!p.show) return `<section class="page"><div class="empty"><p>Packages coming soon.</p></div></section>`;

  // Each package gets a photograph. `t.photo` pins one by filename; without
  // it the cards rotate the gallery, which is fine for three solo portraits and
  // actively wrong for the tier that sells families. A pinned photo the gallery
  // does not have falls back to the rotation rather than rendering a broken img.
  const shotFor = (t: PricingTier, i: number): Photo | undefined => {
    if (i > 0 && t.photo) {
      const pinned = photos.find((p) => p.filename === t.photo);
      if (pinned) return pinned;
    }
    return photos.length ? photos[i % photos.length] : undefined;
  };

  // `spec` is the compact "30 min · 1 outfit · 1 location" line in config.ts.
  // It is the only place a client can see Starter and Signature differ by
  // anything other than prose, so it belongs on the card next to the name —
  // not behind a separate pricing route (there isn't one).
  const card = (t: PricingTier, i: number): string => {
    const ph = shotFor(t, i + 1);
    return `<article class="pkg${t.popular ? " pkg--pop" : ""}">
    ${ph ? `<figure class="pkg__fig" style="--focal:${escapeHtml(t.focal ?? "50% 50%")};--ar:${escapeHtml(t.ar ?? "3 / 2")}"><picture>${pictureFor(ph.url, "(max-width: 760px) 100vw, 33vw", ph.width)}
        <img src="${escapeHtml(bestDerivative(ph.url, "jpg", ph.width))}" alt="${escapeHtml(ph.alt || ph.filename || "")}"
             loading="lazy" decoding="async" /></picture></figure>` : ""}
    <p class="pkg__num">${String(i + 1).padStart(2, "0")}.${
      // Real text, not a CSS ::before. Generated content is invisible to screen
      // readers and to anything reading the DOM, so "most popular" — the one
      // thing that steers a purchase on this page — was not in the document at
      // all. It also sat ABOVE the photograph, which pushed the recommended
      // card's photo ~50px lower than the other three and broke the row.
      t.popular ? ' <span class="pkg__flag">Most popular</span>' : ""
    }</p>
    <h3 class="pkg__name">${escapeHtml(t.name)}</h3>
    <p class="pkg__spec">${escapeHtml(t.spec)}</p>
    <p class="pkg__desc">${escapeHtml(t.fit)}</p>
    <ul class="pkg__list">
      ${t.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
    </ul>
    <p class="pkg__price">${escapeHtml(t.price)}</p>
    <a class="cta cta--sm" href="./contact.html">Book now</a>
  </article>`;
  };

  return `<section class="page services">
    <header class="shead">
      <div class="shead__col">
        <p class="eyebrow">${escapeHtml(SITE.services.eyebrow)}</p>
        <h1 class="shead__h">${escapeHtml(SITE.services.heading)}</h1>
      </div>
      <p class="shead__p">${escapeHtml(p.intro)}</p>
    </header>

    <div class="pkgrow">${p.tiers.map(card).join("")}</div>

    <section class="invest">
      <div class="invest__col">
        <p class="invest__label">Investment</p>
        <h2 class="invest__h">Quality over quantity.</h2>
      </div>
      <p class="invest__p">${escapeHtml(p.depositNote)}</p>
    </section>

    <div class="sterms">
      <h2 class="sterms__h">${escapeHtml(p.addonsTitle)}</h2>
      <ul class="addons">
        ${p.addons
          .map(
            (a) =>
              `<li><span>${escapeHtml(a.label)}</span><span class="addons__p">${escapeHtml(a.price)}</span></li>`,
          )
          .join("")}
      </ul>
    </div>

    <div class="sterms sterms--terms">
      <h2 class="sterms__h">Booking terms</h2>
      <ul class="terms">
        ${p.terms.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
      </ul>
    </div>
${homeBand()}
  </section>`;
}

/**
 * The contact route.
 *
 * Reference layout: heading + invitation on the left, the form below it, a
 * detail list (location / email / phone) with icons, and a photograph on the
 * right. The form is the SAME markup and the same `#cform` id as before, so
 * the Formspree wiring in main.ts and tools/prove-contact.mjs is untouched.
 */
/**
 * Spam trap for the contact form.
 *
 * The Formspree endpoint (`SITE.contact.formEndpoint`) accepts an unauthenticated
 * POST from anyone who has read the bundle — the id is public by design, which
 * is how Formspree works. Verified live: an empty POST returns
 * `{"error":"Can't send an empty form"}`, a validation error rather than an
 * auth wall, so the request reaches the handler. With no captcha, that is an
 * open relay into Alwin's inbox.
 *
 * This is a honeypot: a field a person cannot see or focus, so only an
 * automated filler completes it. wireContact() drops the submission if it
 * arrives filled, WITHOUT telling the sender — replying "sent!" to a bot just
 * teaches it to try again with the field empty.
 *
 * HONEST LIMITS, so this is not oversold: the check runs in the browser, so a
 * determined bot that reads the script bypasses it. It stops the naive scraper
 * that fills every input it finds, which is the overwhelming majority. Real
 * protection needs Cloudflare Turnstile in front of the endpoint — worth doing
 * when the domain is moved to Cloudflare for the HTTPS redirect anyway.
 *
 * `aria-hidden` + `tabindex="-1"` + `autocomplete="off"` keep it out of the
 * accessibility tree and off the tab order; it must not be a trap for anyone
 * using a screen reader or a keyboard.
 */
const HONEYPOT_FIELD =
  `<label class="hp" aria-hidden="true">Leave this field empty` +
  `<input name="_website" type="text" tabindex="-1" autocomplete="off" /></label>`;

export function contactPage(_photos: Photo[] = []): string {
  const c = SITE.contact;
  const wa = `https://wa.me/${c.phone.replace(/\D/g, "")}`;
  const tel = c.phone.replace(/\s/g, "");


  return `<section class="page contact">
    <div class="contact__col">
      <div class="contact__main">
      <p class="eyebrow">Get in touch</p>
      <h1 class="contact__h">Let's Create Something Beautiful.</h1>
      <p class="contact__p">${escapeHtml(SITE.blurb)}</p>

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
        ${HONEYPOT_FIELD}
        <button type="submit">Send message</button>
        <p class="cform__note dim" id="cform-note"></p>
      </form>
      </div>

      <aside class="contact__aside">
      <ul class="contact__list">
        <li>${icon("pin")}<span>${escapeHtml(c.location)}</span></li>
        <li>${icon("mail")}<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></li>
        <li>${icon("phone")}<a href="tel:${escapeHtml(tel)}">${escapeHtml(c.phone)}</a></li>
        <li>${icon("whatsapp")}<a href="${escapeHtml(wa)}" target="_blank" rel="noopener">WhatsApp</a></li>
      </ul>
      <p class="contact__hours dim">${escapeHtml(c.hours)}</p>
      </aside>
    </div>
  </section>`;
}

/**
 * Inline glyphs for the contact detail list. Decorative, so aria-hidden.
 *
 * The pin, mail and phone paths are outline shapes and draw correctly against the
 * stroke rules in `.cico`. The old WhatsApp path was a hand-drawn approximation
 * ("M4 4h16v16H4z M9 9c0 4 2 6 6 6 ...") that read as a plain square with a
 * squiggle inside it — it was not recognisable as WhatsApp at 18px, so it looked
 * like a rendering fault rather than an icon.
 *
 * It is now the real mark, drawn as a FILLED silhouette, which is the only way a
 * WhatsApp logo stays legible at 18px. `.cico--fill` turns off the stroke and
 * fills instead; the outline treatment would reduce it to a tangle of hairlines.
 */
function icon(id: string): string {
  const outline: Record<string, string> = {
    pin: "M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
    mail: "M3 6h18v12H3z M3 7l9 6 9-6",
    phone: "M6 3h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a4 4 0 0 1-2 2A17 17 0 0 1 4 5a4 4 0 0 1 2-2Z",
  };
  // Solid WhatsApp mark: a rounded speech bubble with the handset cut out of it.
  const solid: Record<string, string> = {
    whatsapp:
      "M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24m4.52 5.03c-.24-.12-1.4-.69-1.62-.77-.22-.08-.37-.12-.53.12-.16.24-.61.77-.75.93-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.19-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3.02-.42-.02-.12-.53-1.28-.72-1.75-.19-.45-.38-.39-.53-.4h-.45c-.12 0-.32.05-.49.24-.17.19-.64.63-.64 1.53s.66 1.77.75 1.89c.09.12 1.29 1.96 3.12 2.75.44.19.78.3 1.04.39.44.14.83.12 1.15.07.35-.05 1.08-.44 1.23-.87.15-.43.15-.79.11-.87-.04-.08-.24-.12-.48-.24",
  };

  if (solid[id]) {
    return `<svg class="cico cico--fill" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${solid[id]}" /></svg>`;
  }
  return `<svg class="cico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${outline[id] ?? ""}" /></svg>`;
}
