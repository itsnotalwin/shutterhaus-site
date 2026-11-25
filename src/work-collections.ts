import { SITE } from "./config";
import { SHOOT_OF } from "./shoots";
import type { Photo } from "./types";

// The four edits use the photographer's own frames. Family and Social also
// have a published package photograph when the main wall has no matching tag.
export const WORK_EDITS = [
  { key: "portraits", label: "Portraits", cover: "5-img-0086.jpg", position: "50% 13%" },
  { key: "studio", label: "Studio", cover: "49-img-0131.jpg", position: "50% 7%" },
  { key: "families", label: "Families", cover: SITE.pricing.tiers.find(t => t.name === "Signature")?.photo, position: "50% 0%" },
  { key: "social", label: "Social content", cover: SITE.pricing.tiers.find(t => t.name === "Social")?.photo, position: "50% 2%" },
] as const;

export type WorkEdit = typeof WORK_EDITS[number];

function albumTags(photo: Photo): string[] {
  return (photo.album || "").toLowerCase().split(/[\s,]+/).map(tag => tag.replace(/^cat-/, ""));
}

export function belongsToEdit(photo: Photo, edit: WorkEdit): boolean {
  if (photo.filename && photo.filename === edit.cover) return true;
  const tags = albumTags(photo);
  switch (edit.key) {
    case "studio": return tags.includes("studio") || SHOOT_OF[photo.filename ?? ""] === 16;
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
  if (photo.filename === "2-20240718114526-img-0124.jpg") return "On location";
  return WORK_EDITS.slice(1).find(edit => belongsToEdit(photo, edit))?.label
    ?? (albumTags(photo).includes("landscape") ? "Landscape" : "Portraits");
}
