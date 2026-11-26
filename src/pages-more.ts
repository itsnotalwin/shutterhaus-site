import { formatPrice } from "./pricing";
import { SITE } from "./config";
import { escapeHtml, icon } from "./layout";
import { DEMO_PHOTOS } from "./demo";
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
  // Keep the photographer’s own beach frame beside his biography.
  const shot = photos.find((p) => p.filename === a.photo)
    ?? DEMO_PHOTOS.find((p) => p.filename === a.photo);

  const fig = shot
    ? `<figure class="about__fig">
         <picture>${pictureFor(shot.url, "(max-width: 1000px) 100vw, 40vw", shot.width)}
           <img src="${escapeHtml(bestDerivative(shot.url, "jpg", shot.width))}" alt="${escapeHtml(shot.alt || shot.filename || "")}"
                loading="eager" decoding="async"
                style="aspect-ratio:${shot.width ?? 1200}/${shot.height ?? 1600}" />
         </picture>
       </figure>`
    : `<div class="about__fig about__fig--none" aria-hidden="true"></div>`;

  return `<section class="page about">
    <header class="editorial-intro about-intro">
      <div class="about-story__copy"><p class="eyebrow eyebrow--rule">About</p>
        <h1 class="about__h">Behind<br> the lens.</h1>
        <p class="about-byline">Alwin Newman · Photographer</p>
        <div class="prose about__prose">${a.body.map(para => `<p>${escapeHtml(para)}</p>`).join("")}</div>
        <a class="cta" href="./contact.html">${escapeHtml(a.cta)} <span aria-hidden="true">→</span></a>
      </div>
      <div class="about-portrait">${fig}</div>
    </header>
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
      const pinned = photos.find((p) => p.filename === t.photo) ?? DEMO_PHOTOS.find((p) => p.filename === t.photo);
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
    return `<article class="pkg${t.popular ? " pkg--pop" : ""}" data-package="${escapeHtml(t.name)}">
    ${ph ? `<figure class="pkg__fig${ph.width && ph.height && ph.width > ph.height ? " pkg__fig--landscape" : ""}" style="--focal:${escapeHtml(t.focal ?? "50% 20%")};--photo-ar:${ph.width && ph.height ? `${ph.width} / ${ph.height}` : "16 / 9"};--desktop-focal:${escapeHtml(t.desktopFocal ?? t.focal ?? "50% 50%")}"><picture>${pictureFor(ph.url, "(max-width: 760px) 100vw, 33vw", ph.width)}
        <img src="${escapeHtml(bestDerivative(ph.url, "jpg", ph.width))}" alt="${escapeHtml(ph.alt || ph.filename || "")}"
             loading="lazy" decoding="async" /></picture></figure>` : ""}
    <p class="pkg__num"><span>${String(i + 1).padStart(2, "0")} / Session</span><span>${escapeHtml(t.spec.split(" · ")[0])}</span>${
      // Real text, not a CSS ::before. Generated content is invisible to screen
      // readers and to anything reading the DOM, so "most popular" — the one
      // thing that steers a purchase on this page — was not in the document at
      // all. It also sat ABOVE the photograph, which pushed the recommended
      // card's photo ~50px lower than the other three and broke the row.
      t.popular ? ' <span class="pkg__flag">Most popular</span>' : ""
    }</p>
    <h2 class="pkg__name">${escapeHtml(t.name)}</h2>
    <p class="pkg__spec">${escapeHtml(t.spec)}</p>
    <p class="pkg__desc">${escapeHtml(t.fit)}</p>
    <ul class="pkg__list">
      ${t.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
    </ul>
    <p class="pkg__price">${escapeHtml(formatPrice(t.price))}</p>
    <a class="cta cta--sm" href="./contact.html?package=${encodeURIComponent(t.name)}">Book now</a>
  </article>`;
  };

  return `<section class="page services">
    <header class="shead">
      <p class="eyebrow eyebrow--rule">Sessions</p>
      <h1 class="shead__h">Book a<br> session.</h1>
      <div class="shead__col"><p class="shead__p">${escapeHtml(p.intro)}</p>
      <a class="cta cta--line" href="./contact.html">Make an enquiry</a></div>
    </header>
    <div class="section-label"><h2>Choose your session.</h2><span>Packages / ZAR</span></div>
    <fieldset class="package-picker"><legend>Choose your session</legend>${p.tiers.map(t => `<label><input type="radio" name="package-view" id="package-${escapeHtml(t.name.toLowerCase())}" value="${escapeHtml(t.name)}"${t.popular ? ' checked' : ''} /><span>${escapeHtml(t.name)}</span></label>`).join("")}</fieldset>
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
  const p0 = SITE.pricing;
  /*
   * The package names lead the "What do you need?" list and are generated from
   * the pricing config, so "Book now" on a tier card can preselect exactly that
   * tier. They were absent before: the list held only generic descriptions, so
   * a visitor who tapped "Book now" on Signature still had to re-state the
   * package by hand, which is the part they had just decided. The generic
   * "Something else" is the only non-package option left. The generic list
   * (Mini session / Portrait / Couples / Social content) was kept alongside the
   * packages at first and Alwin read the result as a duplicated menu, which it
   * was: "Social content" sat directly above "Social package", and "Portrait"
   * duplicated what Starter is. The packages ARE the choices now.
   */
  // Built from the social config, not from contact.phone, which no longer
  // exists. The number is the only thing WhatsApp needs and it is not shown.
  const wa = SITE.social.find((x) => x.id === "whatsapp")?.url ?? "";


  return `<section class="page contact">
    <div class="contact__col">
      <div class="contact__main">
        <p class="eyebrow eyebrow--rule">Contact</p>
        <h1 class="contact__h">Let’s work<br> together.</h1>
        <p class="contact__p">Have a project, session or idea in mind? Tell me what you’re thinking.</p>
      </div>
      <div class="contact__form-panel">
        <form class="cform" id="cform" action="${escapeHtml(c.formEndpoint)}" method="post" novalidate>
          <label class="field"><input name="name" type="text" required autocomplete="name" placeholder=" " /><span>Name</span></label>
          <label class="field"><input name="email" type="email" required autocomplete="email" placeholder=" " /><span>Email</span></label>
          <label class="field field--select"><span>Session</span><select name="kind" id="cform-kind">
            ${p0.tiers.map(t => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)} package (${escapeHtml(formatPrice(t.price))})</option>`).join("")}
            <option value="Something else">Something else</option>
          </select></label>
          <label class="field"><textarea name="message" rows="4" required placeholder=" "></textarea><span>Message</span></label>
          ${HONEYPOT_FIELD}
          <button type="submit">Send message</button>
          <p class="cform__note dim" id="cform-note" role="status" aria-live="polite" tabindex="-1"></p>
        </form>
      </div>
      <div class="contact__details">
        <a href="mailto:${escapeHtml(c.email)}">${icon("mail",20)}<span>${escapeHtml(c.email)}</span></a>
        <p><span class="detail-label">Location</span>${escapeHtml(c.location)}</p>
        <p><span class="detail-label">Hours</span>${escapeHtml(c.hours)}</p>
        ${wa ? `<a href="${escapeHtml(wa)}" target="_blank" rel="noopener">${icon("whatsapp",20)}<span>WhatsApp</span></a>` : ""}
      </div>
    </div>
  </section>`;
}
