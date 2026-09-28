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
