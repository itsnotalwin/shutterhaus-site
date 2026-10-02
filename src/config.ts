/**
 * SITE CONFIG — the one file you edit for branding, nav, contact and socials.
 * Change something here, commit, and the site redeploys itself.
 */
import type { IconId } from "./types";

export interface SiteConfig {
  /** small word, sits inline before nameBig1 */
  nameTop: string;
  /** big word, end of the first line (leave '' if you want a single line) */
  nameBig1: string;
  /** big word, the whole second line */
  nameBig2: string;
  /** render the gallery in monochrome, as in the reference design */
  nav: { id: string; label: string }[];
  social: { id: IconId; label: string; url: string }[];
  contact: { email: string; phone: string; location: string; hours: string; formEndpoint: string };
  blurb: string;
  /** Shown on the pricing page. Set showPricing to false to hide the nav item. */
  pricing: PricingConfig;
  /** editorial copy for the reference layout's home + about pages */
  home: {
    eyebrow: string;
    heading: string;
    lede: string;
    cta: string;
    /** founding year, shown in the hero's bottom strip as "EST. 2019" */
    est: string;
    /** the three subjects named in the hero's bottom strip */
    tags: string[];
  };
  about: { eyebrow: string; heading: string; body: string[]; cta: string };
  /** portfolio filter keys; each must match a `cat-` prefix the store sets */
  categories: string[];
  /** how many frames the home page features under its hero */
  homeGalleryCount: number;
  /**
   * Which frame carries the home hero, by filename. Auto-detection picks the
   * first landscape shot, but that is a guess — this pins it so the choice is
   * deliberate and changeable without touching page code. Set to null to fall
   * back to auto-detection. **HOME IS LOCKED** (see HOME-LOCKED.md): changing
   * this needs Alwin to reopen the home route.
   */
  heroPhoto: string | null;
  /** heading block on the services route, reused by the home page CTA */
  services: { eyebrow: string; heading: string; cta: string };
}

export interface PricingTier {
  name: string;
  price: string;
  /** the one-line positioning line, e.g. "headshots & matric farewells" */
  fit: string;
  /** duration / outfits / locations, shown as a compact spec line */
  spec: string;
  bullets: string[];
  /** marks the recommended tier in the UI */
  popular?: boolean;
  /**
   * Pins the card's photograph instead of rotating the gallery.
   *
   * The rotation is fine for three solo portraits, but it sold "Families,
   * maternity, engagements" with another shot of one woman alone. A tier that
   * names families has to show a family. Filename, matching src/demo.ts.
   */
  photo?: string;
  /**
   * Where the subject sits in the frame, as "x% y%" of the natural image, used
   * as `object-position` on the card figure. Needed because the cards share one
   * aspect-ratio slot and this frame is landscape while the others are portrait:
   * without it the family group sits low in the crop. Omit and it centres.
   */
  focal?: string;
}

export interface PricingConfig {
  show: boolean;
  heading: string;
  intro: string;
  tiers: PricingTier[];
  addonsTitle: string;
  addons: { label: string; price: string }[];
  terms: string[];
  /** the deposit / delivery line, kept separate so it's easy to change */
  depositNote: string;
}

export const SITE: SiteConfig = {
  nameTop: "SHUTTERHAUS",
  nameBig1: "",
  nameBig2: "VISUALS",

  /** `id` must match a route in src/main.ts */
  nav: [
    { id: "home", label: "Home" },
    // The route is `portfolio`; `photo` is the legacy alias kept working in
    // main.ts for old links. Using the real id here means the nav href and the
    // active-state check agree instead of relying on the alias.
    { id: "portfolio", label: "Portfolio" },
    { id: "about", label: "About" },
    { id: "services", label: "Services" },
    { id: "contact", label: "Contact" },
  ],

  /** Top-right icons. Delete any you don't want. */
  social: [
    { id: "instagram", label: "Instagram", url: "https://instagram.com/shutterhausvisuals" },
    { id: "whatsapp", label: "WhatsApp", url: "https://wa.me/27730958363" },
  ],

  contact: {
    email: "itsnotalwin@gmail.com",
    phone: "+27 73 095 8363",
    location: "Gauteng, South Africa",
    hours: "Evenings & weekends, by appointment",
    /**
     * Formspree endpoint. Set means the form POSTs here and works on any
     * device, including phones with no mail app. Empty falls back to a
     * `mailto:` handoff, which silently does nothing on such phones.
     */
    formEndpoint: "https://formspree.io/f/xjyklqkp",
  },

  blurb:
    "Portraits, couples, families and social content — shot on location across Gauteng. " +
    "Mini sessions, full galleries and prints available on request.",

  // ---- pricing (source: Shutterhaus_Pricing_Packages.pdf) ----
  pricing: {
    show: true,
    heading: "Packages",
    intro:
      "Every session is directed start to finish — you don't need to know how to pose. " +
      "50% deposit secures your date.",

    tiers: [
      {
        name: "Starter",
        price: "R1,200",
        fit: "Headshots, matric farewells, quick portraits.",
        spec: "30 min · 1 outfit · 1 location",
        // Pinned, so a package card can never be handed a seascape. This tier
        // used to rotate onto 8-img-0268 — an empty pier — on the page whose job
        // is selling.
        //
        // Chosen for headshots and matric farewells, where the client wants a
        // clean direct portrait: 50-img-0143 is "warm low light, looking directly
        // at the camera" in the gallery's own alt text. It replaced 16-img-0030,
        // a genuinely greyscale file (mean saturation 0.0000 — no colour data in
        // it at all), and then 26-img-0253, whose backlit lens flare washed
        // across the subject's face. Measured mean saturation of the four cards
        // now: 0.35 / 0.23 / 0.26 / 0.20.
        photo: "50-img-0143.jpg",
        focal: "50% 26%",
        bullets: [
          "15 professionally edited high-res images",
          "Private online gallery (90-day access)",
          "High-res + web-optimised downloads",
          "Clothing guide & location suggestions",
          "Print release for personal use",
        ],
      },
      {
        name: "Essential",
        price: "R2,200",
        fit: "Our go-to for couples, individuals and small families.",
        spec: "60 min · 2 outfits · 1–2 locations",
        photo: "19-img-0198-3.jpg",
        focal: "50% 24%",
        bullets: [
          "40 professionally edited high-res images",
          "Reels-ready vertical crops",
          "Print release + 5×7\" fine art print",
          "Private online gallery (90-day access)",
          "Clothing guide, location scouting, shot list",
        ],
        popular: true,
      },
      {
        name: "Signature",
        price: "R3,500",
        fit: "Families, maternity, engagements — the full experience.",
        spec: "90 min · 2–3 outfits · multiple locations",
        // Pinned, not rotated. This tier sells families and the rotation was
        // handing it another solo portrait, which is the one image that cannot
        // demonstrate a family session. 54-img-0164 is landscape (2400x1499)
        // with the six faces across the upper half — hence the focal point.
        photo: "54-img-0164.jpg",
        focal: "50% 32%",
        bullets: [
          "70 professionally edited high-res images",
          "B&W timeless set + Reels crops",
          "Print release + two 5×7\" fine art prints",
          "Private online gallery (90-day access)",
          "Full prep: clothing guide, shot list, scouting",
        ],
      },
      {
        name: "Social",
        price: "R1,800",
        fit: "Built for creators — vertical-first, quick turnaround.",
        spec: "45 min · 2 outfits · 1 location",
        // The one genuinely vertical frame in the gallery, which is the honest
        // picture for a tier whose promise is Reels-ready vertical crops.
        photo: "20-img-0202.jpg",
        focal: "50% 22%",
        bullets: [
          "30 edited images + 15 Reels-ready vertical crops",
          "48hr sneak peek — 10 images, not the full set",
          "Vertical (4:5, 9:16) + high-res + web",
          "Content calendar template",
          "Pose coaching for video & content",
        ],
      },
    ],

    addonsTitle: "Add-ons",
    addons: [
      { label: "Extra 30 minutes", price: "+R600" },
      { label: "Extra location", price: "+R400" },
      { label: "Rush delivery — full gallery in 48hr", price: "+R400" },
      { label: "Extra 5×7\" print", price: "+R150" },
      { label: "Fine art album (20pg)", price: "+R1,200" },
      { label: "Travel beyond 25km", price: "+R5/km" },
    ],

    terms: [
      "50% non-refundable deposit secures your date; balance before gallery delivery.",
      "Rescheduling ≥7 days notice is free. Under 7 days: R500 fee, deposit transfers.",
      "Outdoor shoots include a backup indoor location. Severe weather = free reschedule.",
      "Delivery: Starter, Essential and Social in 5 business days; Signature in 7.",
      "Personal use licence included. Commercial use needs a separate licence, +50–200% of the package fee.",
    ],

    depositNote: "50% deposit to book · EFT accepted",
  },

  // ---- editorial copy for the five-page reference layout ----
  /**
   * The reference design was a 5-page editorial site (Home / Portfolio /
   * About / Services / Contact). This holds the copy for the three pages that
   * had no equivalent before. Kept in config so it can be reworded without
   * touching page code.
   */
  home: {
    eyebrow: "Photography is poetry.",
    heading: "Timeless Portraiture",
    lede: "Real people. Honest moments. Portraits that look beyond the now.",
    cta: "View portfolio",
    est: "2019",
    tags: ["Portraits", "Couples", "Families"],
  },
  about: {
    eyebrow: "About me",
    heading: "Photography is poetry.",
    /** paragraphs, in order, on the left column beside the portrait */
    body: [
      "I'm a photographer based in Gauteng, drawn to the raw, unfiltered beauty of real people and unfiltered moments. For me, photography isn't just about what you see — it's about what you feel.",
      "I believe the best images aren't staged. They happen. They live in the in-between, in the quiet looks, the laughter, the chaos, the stillness.",
      "This is my way of telling your story — honestly, creatively, and with intention.",
    ],
    cta: "Let's create together",
  },
  /**
   * Category filter labels on the portfolio. `key` matches the `cat-` prefix
   * the store puts on each photo, so filtering is data-driven rather than
   * a hardcoded list in the page.
   */
  // Alwin's favourites, 50 frames. All on the portfolio, no category filter.
  categories: ["portrait", "couple", "family", "creative"],
  // 6, and the count is load-bearing. The strip is 3 columns on desktop and 2
  // on mobile, so the count has to divide by BOTH. Measured across 6..12 with
  // the height-aware packer, the only counts with no leftover column at any
  // viewport are 6 (2/2/2 and 3/3) and 12 (4/4/4 and 6/6).
  //
  // I picked 12 first and Alwin's verdict was "too many images on home now",
  // so 6 is the fix that keeps the columns even without filling the page. 8
  // and 9 both strand a column and are what created the white hole in the
  // first place — 8 divides by neither width.
  //
  // **HOME IS LOCKED** (see HOME-LOCKED.md). Do not "tidy" this number or the
  // column count in stripCols() without Alwin reopening the home route.
  homeGalleryCount: 6,
  // Pinned deliberately: strongest subject in the set AND real dark space in
  // the lower-left for the white headline. Chosen from a side-by-side of all
  // six landscape frames cropped to the hero ratio.
  heroPhoto: "27-img-0297.jpg",
  services: { eyebrow: "Services", heading: "Capture What Matters.", cta: "View packages" },
};

/** Fonts loaded in index.html. Change these to re-skin the type. */
export const FONTS = {
  display: "'Archivo Black', 'Helvetica Neue', Arial, sans-serif",
  body: "'Inter', 'Helvetica Neue', Arial, sans-serif",
} as const;

/**
 * ADMIN ACCESS — only these Google accounts reach /admin.
 * The Supabase RLS policies in supabase/schema.sql enforce the same list
 * server-side, so this is UX, not security. Keep the two in sync.
 */
export const ADMIN_EMAILS = ["itsnotalwin@gmail.com"];
