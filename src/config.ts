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
  blackAndWhite: boolean;
  nav: { id: string; label: string }[];
  social: { id: IconId; label: string; url: string }[];
  contact: { email: string; phone: string; location: string; hours: string; formEndpoint: string };
  blurb: string;
  /** Shown on the pricing page. Set showPricing to false to hide the nav item. */
  pricing: PricingConfig;
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
  blackAndWhite: true,

  /** `id` must match a route in src/main.ts */
  nav: [
    { id: "photo", label: "photo" },
    { id: "video", label: "video" },
    { id: "pricing", label: "pricing" },
    { id: "contact", label: "contact" },
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
    /** Paste a Formspree/Basin endpoint to use a real form, or leave '' for mailto: */
    formEndpoint: "",
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
        bullets: [
          "70 professionally edited high-res images",
          "B&W timeless set + Reels crops",
          "Print release + 2× 5×7\" fine art prints",
          "Private online gallery (90-day access)",
          "Full prep: clothing guide, shot list, scouting",
        ],
      },
      {
        name: "Social",
        price: "R1,800",
        fit: "Built for creators — vertical-first, quick turnaround.",
        spec: "45 min · 2 outfits · 1 location",
        bullets: [
          "30 edited images + 15 Reels-ready vertical crops",
          "48hr sneak peek",
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
      { label: "Rush delivery (48hr)", price: "+R400" },
      { label: "Extra 5×7\" print", price: "+R150" },
      { label: "Fine art album (20pg)", price: "+R1,200" },
      { label: "Travel beyond 25km", price: "+R5/km" },
    ],

    terms: [
      "50% non-refundable deposit secures your date; balance before gallery delivery.",
      "Rescheduling ≥7 days notice is free. Under 7 days: R500 fee, deposit transfers.",
      "Outdoor shoots include a backup indoor location. Severe weather = free reschedule.",
      "Delivery: Starter, Essential and Social in 5 business days; Signature in 7.",
      "Personal use licence included. Commercial use needs a separate licence (+50–200%).",
    ],

    depositNote: "50% deposit to book · EFT accepted",
  },
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
