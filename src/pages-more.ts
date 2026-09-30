import { SITE } from "./config";
import { escapeHtml } from "./layout";
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
  const shot = photos[0];

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
      <a class="cta about__cta" href="#/contact">${escapeHtml(a.cta)}</a>
    </div>
    ${fig}
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

  // The reference gives each package a photograph. Rotate through the gallery
  // so the three cards never show the same frame; short galleries just repeat.
  const shot = (i: number): Photo | undefined => (photos.length ? photos[i % photos.length] : undefined);

  const card = (t: PricingTier, i: number) => {
    const ph = shot(i + 1);
    return `<article class="pkg${t.popular ? " pkg--pop" : ""}">
    ${ph ? `<figure class="pkg__fig"><picture>${pictureFor(ph.url, "(max-width: 760px) 100vw, 33vw", ph.width)}
        <img src="${escapeHtml(bestDerivative(ph.url, "jpg", ph.width))}" alt="${escapeHtml(ph.alt || ph.filename || "")}"
             loading="lazy" decoding="async" /></picture></figure>` : ""}
    <p class="pkg__num">${String(i + 1).padStart(2, "0")}.</p>
    <h3 class="pkg__name">${escapeHtml(t.name)}</h3>
    <p class="pkg__desc">${escapeHtml(t.fit)}</p>
    <ul class="pkg__list">
      ${t.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
    </ul>
    <p class="pkg__price">${escapeHtml(t.price)}</p>
    <a class="cta cta--sm" href="#/contact">Book now</a>
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
        <p class="eyebrow eyebrow--inv">Investment</p>
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
  </section>`;
}

/**
 * The pricing route. Same chrome as the rest of the site: white, heavy
 * wordmark-scale type, hairline rules, no colour except the "popular" flag.
 */
export function pricingPage(): string {
  const p = SITE.pricing;
  if (!p.show) return `<section class="empty"><p>Packages coming soon.</p></section>`;

  const tier = (t: PricingTier) => `<article class="tier${t.popular ? " tier--pop" : ""}">
    ${t.popular ? `<span class="tier__flag">Most popular</span>` : ""}
    <h3 class="tier__name">${escapeHtml(t.name)}</h3>
    <p class="tier__price">${escapeHtml(t.price)}</p>
    <p class="tier__spec">${escapeHtml(t.spec)}</p>
    <p class="tier__fit">${escapeHtml(t.fit)}</p>
    <ul class="tier__list">
      ${t.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
    </ul>
    <a class="tier__cta" href="#/contact">Book this</a>
  </article>`;

  return `<section class="pricing">
    <header class="pricing__head">
      <h1 class="pricing__h">${escapeHtml(p.heading)}</h1>
      <p class="pricing__intro">${escapeHtml(p.intro)}</p>
    </header>

    <div class="pricing__grid">${p.tiers.map(tier).join("")}</div>

    <div class="pricing__addons">
      <h2 class="pricing__sub">${escapeHtml(p.addonsTitle)}</h2>
      <ul class="addons">
        ${p.addons
          .map(
            (a) =>
              `<li><span>${escapeHtml(a.label)}</span><span class="addons__p">${escapeHtml(a.price)}</span></li>`,
          )
          .join("")}
      </ul>
    </div>

    <div class="pricing__terms">
      <h2 class="pricing__sub">Booking terms</h2>
      <ul class="terms">
        ${p.terms.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
      </ul>
      <p class="pricing__note">${escapeHtml(p.depositNote)}</p>
    </div>
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
export function contactPage(photos: Photo[] = []): string {
  const c = SITE.contact;
  const wa = `https://wa.me/${c.phone.replace(/\D/g, "")}`;
  const shot = photos[0];
  const tel = c.phone.replace(/\s/g, "");

  const fig = shot
    ? `<figure class="contact__fig">
         <img src="${escapeHtml(shot.url)}" alt="${escapeHtml(shot.alt || shot.filename || "")}"
              loading="lazy" decoding="async"
              style="aspect-ratio:${shot.width ?? 1600}/${shot.height ?? 1067}" />
       </figure>`
    : "";

  return `<section class="page contact">
    <div class="contact__col">
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
        <button type="submit">Send message</button>
        <p class="cform__note dim" id="cform-note"></p>
      </form>

      <ul class="contact__list">
        <li>${icon("pin")}<span>${escapeHtml(c.location)}</span></li>
        <li>${icon("mail")}<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></li>
        <li>${icon("phone")}<a href="tel:${escapeHtml(tel)}">${escapeHtml(c.phone)}</a></li>
        <li>${icon("whatsapp")}<a href="${escapeHtml(wa)}" target="_blank" rel="noopener">WhatsApp</a></li>
      </ul>
      <p class="contact__hours dim">${escapeHtml(c.hours)}</p>
    </div>
    ${fig}
  </section>`;
}

/** Tiny inline glyphs for the contact detail list. Decorative, so aria-hidden. */
function icon(id: string): string {
  const d: Record<string, string> = {
    pin: "M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
    mail: "M3 6h18v12H3z M3 7l9 6 9-6",
    phone: "M6 3h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2Z",
    whatsapp: "M4 4h16v16H4z M9 9c0 4 2 6 6 6 M9 8v2 M15 12v2",
  };
  return `<svg class="cico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d[id] ?? ""}" /></svg>`;
}
