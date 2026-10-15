import { SITE } from "./config";
import { escapeHtml } from "./layout";
import { formatPrice } from "./pricing";

export function homeBand(options: { eyebrow?: string; heading?: string; cta?: string; href?: string } = {}): string {
  const from = cheapestTier();
  const insta = SITE.social.find((x) => x.id === "instagram");
  const names = SITE.pricing.tiers.map((t) => t.name).join(" · ");
  return `<section class="hcta">
      <div class="hcta__grid">
        <div class="hcta__main">
          <p class="eyebrow">${escapeHtml(options.eyebrow ?? SITE.services.eyebrow)}</p>
          <h2 class="hcta__h">${escapeHtml(options.heading ?? "Book a session.")}</h2>
        </div>
        <div class="hcta__side">
          ${
            from
              ? `<p class="hcta__k">From</p>
          <p class="hcta__price">${escapeHtml(formatPrice(from.price))}</p>`
              : ""
          }
          <p class="hcta__note">${escapeHtml(names)}<br>${escapeHtml(SITE.pricing.depositNote)}</p>
          <a class="hcta__btn" href="${escapeHtml(options.href ?? "./services.html")}">${escapeHtml(options.cta ?? SITE.services.cta)} →</a>
        </div>
      </div>
      <div class="hcta__foot">
        <a href="mailto:${escapeHtml(SITE.contact.email)}">${escapeHtml(SITE.contact.email)}</a>

        ${insta ? `<a href="${escapeHtml(insta.url)}" target="_blank" rel="noopener">Instagram</a>` : ""}
        <span>© ${escapeHtml(SITE.home.est)}–${new Date().getFullYear()} ${escapeHtml(SITE.nameTop)} ${escapeHtml(SITE.nameBig2)}</span>
      </div>
    </section>`;
}

/**
 * The cheapest package, for the "From R1,200" line on the home band.
 *
 * Read from the pricing config rather than typed in, so changing a tier price
 * on the Services page can never leave the home page quoting a stale figure.
 * Numeric rand amounts avoid parsing formatted display strings.
 */
function cheapestTier(): { name: string; price: number } | null {
  const tiers = SITE.pricing.tiers.filter((t) => Number.isFinite(t.price) && t.price > 0);
  if (!tiers.length) return null;
  return [...tiers].sort((a, b) => a.price - b.price)[0]!;
}
