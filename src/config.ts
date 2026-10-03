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
  contact: { email: string; location: string; hours: string; formEndpoint: string };
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
  /**
   * The About figure is the PHOTOGRAPHER, not one of his models — it is the only
   * place on the site where a visitor can see who is taking the photographs.
   * Pinned by gallery filename so it can never fall back to `photos[0]`, which is
   * whatever the gallery happens to lead with.
   */
  about: { eyebrow: string; heading: string; body: string[]; cta: string; photo: string };
  /** portfolio filter keys; each must match a `cat-` prefix the store sets */
  categories: string[];
  /** how many frames the home page features under its hero */
  homeGalleryCount: number;
  /** Pinned, ordered filenames for the home strip. See homeStrip below. */
  homeStrip: string[];
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
   * as `object-position` on the card figure.
   *
   * Only matters for the landscape card. The portrait cards now use a slot that
   * matches their own frames, so almost none of their height is cropped and the
   * focal point has very little to do.
   */
  focal?: string;
  /**
   * The slot shape for this card's photograph, as CSS `aspect-ratio`, e.g.
   * "4 / 5". One 3:2 slot was being applied to four photographs of three
   * different shapes, and a 3:2 slot keeps only 44% of a 2:3 portrait's height —
   * which is why the tops of heads were being cut off. Matching the slot to the
   * frame is the whole fix: a 4:5 slot keeps ~83% of a 2:3 portrait.
   * Omit and the figure falls back to 3 / 2.
   */
  ar?: string;
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
    email: "alwin@shutterhausvisuals.co.za",
    /**
         * Phone is deliberately absent from this object. Alwin, 2026-10-03: "remove
         * my cell completely, I won't be taking calls for now either." The number
         * used to render as a `tel:` link on the contact page, which is the one
         * affordance that makes a visitor's phone prompt to dial it. Removing the
         * field removes the affordance; keeping a visible-but-inert string would
         * still read as "call me". Re-add `phone` here if that changes.
         */
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
    "Portraits, couples, families and social content, shot on location across Gauteng. " +
    "Mini sessions and full galleries, with digital delivery.",

  // ---- pricing (source: Shutterhaus_Pricing_Packages.pdf) ----
  pricing: {
    show: true,
    heading: "Packages",
    intro:
      "Every session is directed start to finish, you don't need to know how to pose. " +
      "50% deposit secures your date.",

    tiers: [
      {
        name: "Starter",
        price: "R800",
        fit: "Headshots, matric farewells, quick portraits.",
        spec: "30 min · 1 outfit · 1 location",
        // Alwin, 2026-10-03: "the red haired woman replaces starter" — she is a
        // distinct model from the other three tiers; the previous Starter frame
        // shared a face with Signature, so the row read as one person repeated.
        // He then supplied this frame himself, same rooftop shoot and same white
        // zip top, as a tighter alternative: head and shoulders at 2048x1152.
        photo: "56-img-0126.jpg",
        // A tight head-and-shoulders crop leaves almost no room to move the
        // window: the face occupies the middle band, so any vertical bias crops
        // either her chin or the top of her head. 50% keeps the window on the
        // face, and the horizontal centre is already right.
        focal: "50% 50%",
        // slot matches the frame: 16:9 landscape, 1.778
        //
        // This was 4/5, then 2/3, across two earlier attempts at this slot, and
        // it is worth saying why the value moves rather than being a fixed
        // "phone-shaped" portrait: `ar` is the DESKTOP card aspect, and the
        // phone layout derives its own slot from the frame's real ratio. Pinning
        // a guess here is what put a 2:3 frame inside a 4:5 window and cropped
        // her hair off.
        ar: "16 / 9",
        bullets: [
          "15 edited photos",
          "Private online gallery",
          "Clothing guide & location suggestions",
          "High-res and web-optimised downloads",
        ],
      },
      {
        name: "Essential",
        price: "R2,000",
        fit: "Our go-to for couples, individuals and small families.",
        spec: "60 min · 2 outfits · 1–2 locations",
        photo: "19-img-0198-3.jpg",
        focal: "50% 50%",
        // slot matches the frame: 4:5 portrait, 0.800
        ar: "4 / 5",
        bullets: [
          "20 edited photos",
          "Private online gallery (90-day access)",
          "Clothing guide, location scouting, shot list",
        ],
        popular: true,
      },
      {
        name: "Signature",
        price: "R2,500",
        fit: "Families, maternity and engagements: the full experience.",
        spec: "90 min · 2–3 outfits · multiple locations",
        photo: "54-img-0164.jpg",
        focal: "50% 50%",
        // slot matches the frame: landscape, 1.601
        ar: "3 / 2",
        bullets: [
          "40 edited photos",
          "Private online gallery (90-day access)",
          "Full prep: clothing guide, shot list, scouting",
        ],
      },
      {
        name: "Social",
        price: "R2,500",
        fit: "Built for creators: quick turnaround, same-day previews.",
        spec: "45 min · 2 outfits · 1 location",
        photo: "20-img-0202.jpg",
        focal: "50% 17%",
        // slot matches the frame: 9:16 vertical, 0.563
        ar: "9 / 16",
        // Focal is high because the DESKTOP slot is the uniform 3/2, which
        // keeps only 38% of a 9:16 frame. Centred, that window shows her
        // torso instead of her face. Irrelevant on the phone, where the
        // 9/16 slot keeps ~94%.
        bullets: [
          "20 edited photos",
          "Private online gallery (90-day access)",
          "48hr sneak peek, 10 images, not the full set",
          "High-res and web-optimised downloads",
          "Commercial licence included",
        ],
      },
    ],

    addonsTitle: "Add-ons",
    // Prints and albums are gone entirely at Alwin's instruction, 2026-10-03:
    // "remove the prints completely, we won't be doing those for now." They
    // were not merely removed from this list; the "Print release for personal
    // use" bullet is gone from all four tiers too, so nothing on the page
    // promises a physical product. Re-adding means restoring both.
    // "Rush delivery" only ever applied to Social's 48hr sneak peek, which it
    // now qualifies instead of duplicating.
    addons: [
      { label: "Extra 30 minutes on the shoot", price: "+R300" },
      { label: "Extra location", price: "+R400" },
      { label: "Extra outfit change", price: "+R300" },
      { label: "Full gallery within 48hr", price: "+R400" },
      { label: "Travel beyond 25km", price: "+R5/km" },
    ],

    terms: [
      "50% non-refundable deposit secures your date; balance before gallery delivery.",
      "Rescheduling ≥7 days notice is free. Under 7 days: R500 fee, deposit transfers.",
      "Outdoor shoots include a backup indoor location. Severe weather = free reschedule.",
      "Delivery: 7 to 14 days for every package. Social can be faster, ask about the 48hr sneak peek.",
      "Personal use licence with every package. The Social package includes a commercial licence.",
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
      "I'm a photographer based in Gauteng, drawn to the raw, unfiltered beauty of real people and unfiltered moments. For me, photography isn't just about what you see, it's about what you feel.",
      "I believe the best images aren't staged. They happen. They live in the in-between, in the quiet looks, the laughter, the chaos, the stillness.",
      "This is my way of telling your story, honestly, creatively, and with intention.",
    ],
    cta: "Let's create together",
    // A man walking a beach with a metal detector, black and white. Ratio 4:5
    // (portrait) -- and nothing may crop it hard, see the About figure note.
    photo: "55-metal-detector.jpg",
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

  /**
   * The home strip, pinned BY FILENAME and in this exact order.
   *
   * Alwin, 2026-10-03: "the 3 images on home page are almost duplicates, we
   * should fix that, these should be my best shots."
   *
   * This was `photos.slice(0, 6)` — the first six frames in gallery order — so
   * the home page showed whatever the interleave happened to put first. That
   * produced three shots of the same model in the same black top and pale skirt
   * against the same green wall (51-img-0145, 52-img-0149, 49-img-0131), which
   * is what he saw as near-duplicates. They were genuinely different frames;
   * they read as the same photograph because the pose, the clothing and the
   * backdrop were identical.
   *
   * A strip this short is art direction, not a sample, so it is now named here
   * where the choice is visible. Ordered so the eye moves between looks rather
   * than between outfits:
   *   1. 22-img-0239  colour, gold hour, red hair, movement in the frame
   *   2. 21-img-0234  B&W, straight to camera, lace — the strongest face here
   *   3. 18-img-0043  B&W, hand to cheek, outdoors under palms
   *   4. 26-img-0253  B&W, close, shallow depth against city bokeh
   *   5. 46-img-0119  colour, arms raised, dark interior
   *   6. 1-...-0065   wide, the pier — a landscape to break the run of faces
   *
   * Three models, five settings, colour and monochrome interleaved rather than
   * blocked, and no two adjacent frames share a look. Frames missing from the
   * gallery are skipped rather than shifting the list, so a removed photo
   * thins the strip instead of silently promoting a duplicate into it.
   */
  homeStrip: [
    "22-img-0239.jpg",
    "21-img-0234.jpg",
    "18-img-0043.jpg",
    "26-img-0253.jpg",
    "46-img-0119.jpg",
    "1-20240718113728-img-0065.jpg",
  ],
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
 *
 * The business moved to a Workspace account on 2026-10-03 and all enquiries
 * go to alwin@shutterhausvisuals.co.za, but that address is deliberately NOT
 * here: Alwin signs in to the gallery with his personal Google account, and
 * is_admin() matches on whatever email Google returns. The database copy in
 * supabase/schema.sql is therefore unchanged and needs no migration.
 */
export const ADMIN_EMAILS = ["itsnotalwin@gmail.com"];
