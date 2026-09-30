import { SITE } from "./config";
import { escapeHtml } from "./layout";
import type { PricingTier } from "./config";

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
  </section>
  <p class="contact__back"><a href="#/photo">&larr; Back to the work</a></p>`;
}
