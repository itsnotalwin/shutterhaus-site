import { SITE } from "./config";
import type { Photo } from "./types";

export const WORK_EDITS = [
  { key: "portraits", label: "Portraits", cover: "5-img-0086.jpg", position: "50% 2.5%" },
  { key: "on-location", label: "On location", cover: "2-20240718114526-img-0124.jpg", position: "50% 29%", portraitPosition: "50% 64%" },
  { key: "social", label: "Social content", cover: SITE.pricing.tiers.find(t => t.name === "Social")?.photo, position: "50% 0%" },
  { key: "landscapes", label: "Landscapes", cover: "6-img-0161.jpg", position: "50% 50%" },
  { key: "families", label: "Families", cover: SITE.pricing.tiers.find(t => t.name === "Signature")?.photo, position: "50% 0%" },
] as const;

export type WorkEdit = typeof WORK_EDITS[number];

// Reviewed against the original photographs. Only frames on the published wall
// (or the selected cover) are displayed, even if another file is listed here.
const onLocation = new Set([
  "2-20240718114526-img-0124.jpg", "12-img-0019.jpg", "14-img-0026.jpg",
  "15-img-0025.jpg", "18-img-0043.jpg", "22-img-0239.jpg", "24-img-0245.jpg",
  "25-img-0249.jpg", "27-img-0297.jpg", "30-img-0396.jpg", "32-img-0404.jpg",
  "35-img-0482.jpg", "36-img-0076.jpg", "37-img-0124.jpg",
]);

function albumTags(photo: Photo): string[] {
  return (photo.album || "").toLowerCase().split(/[\s,]+/).map(tag => tag.replace(/^cat-/, ""));
}

export function belongsToEdit(photo: Photo, edit: WorkEdit): boolean {
  if (photo.filename && photo.filename === edit.cover) return true;
  const tags = albumTags(photo);
  switch (edit.key) {
    case "on-location": return onLocation.has(photo.filename ?? "") || tags.some(tag => ["on-location", "outdoor", "outdoors"].includes(tag));
    case "landscapes": return tags.includes("landscape") || tags.includes("landscapes");
    case "families": return tags.some(tag => ["family", "families"].includes(tag));
    case "social": return tags.some(tag => ["social", "creative"].includes(tag));
    case "portraits": return tags.some(tag => ["portrait", "portraits"].includes(tag));
  }
}

export function collectionLink(edit: WorkEdit): string {
  return `./portfolio.html?collection=${edit.key}#edit-${edit.key}`;
}

export function editCover(edit: WorkEdit, selected: Photo[], library: Photo[]): Photo | undefined {
  const pinned = library.find(photo => photo.visible && photo.filename === edit.cover);
  return pinned ?? selected.find(photo => photo.visible && belongsToEdit(photo, edit));
}

export function frameLabel(photo: Photo): string {
  if (photo.filename === "19-img-0198-3.jpg") return "Afternoon light";
  if (photo.filename === "33-img-0426.jpg") return "Close portrait";
  return WORK_EDITS.find(edit => edit.cover === photo.filename)?.label
    ?? WORK_EDITS.slice(1).find(edit => belongsToEdit(photo, edit))?.label
    ?? (albumTags(photo).includes("landscape") ? "Landscape" : "Portraits");
}
