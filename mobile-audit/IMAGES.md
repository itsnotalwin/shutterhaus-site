# Mobile image crop & delivery audit — shutterhausvisuals.co.za

**Target:** live site, `https://shutterhausvisuals.co.za/#/portfolio`
**Date:** 2026-10-02
**Device profile:** 393 x 852 CSS px, DPR 3, mobile UA (iPhone 14 Pro class), Chrome 154 headless via CDP
**Method:** every figure below is measured, not estimated. Browser geometry from `getBoundingClientRect` + `getComputedStyle` on the live DOM; bytes from CDP `Network.loadingFinished` with the HTTP cache explicitly disabled; pixel dimensions from the actual bytes served by the origin, downloaded and opened with Pillow 12.3.0. The local repo clone was used only to measure derivative sizes on disk for comparison.

---

## Headline numbers

| Measure | Value | Where the number comes from |
|---|--:|---|
| Images delivered to the mobile portfolio | **30** | live DOM count |
| **Total image bytes, cold cache, whole portfolio** | **4,106,594 B = 3.92 MB** | CDP `loadingFinished`, sum of the 30 responses |
| Non-image payload (HTML/CSS/JS/fonts) | 350,446 B = 342 KB | same capture |
| **Grand total to view the portfolio** | **4,463,686 B = 4.36 MB** | sum |
| **Bytes to first screenful, no scrolling at all** | **4,114,603 B = 4.02 MB** | 25s settle, zero scroll |
| Mean bytes per image | 137 KB | 3.92 MB / 30 |
| Rendered cell width on a 393px phone | **111 CSS px** | `getBoundingClientRect().width` |
| Device pixels that cell actually needs @DPR3 | **333** | 111 x 3 |
| Pixels actually sent | **1200** | Pillow on the served file |
| **Overhead factor** | **7.7x** | 3.92 MB vs 0.51 MB |
| **Wasted bytes per portfolio view** | **3.41 MB** | difference |
| Images losing >40% of frame to crop | **0** | section 2 |
| Images whose subject falls outside the crop | **0** | section 3 |
| Images missing meaningful alt text | **0 of 30** | section 7 |

**The 3.92 MB does not spread out across the scroll. All 30 images arrive before the visitor scrolls once** — first-screenful cost is 4.02 MB, i.e. 98% of the entire portfolio — because every `<img>` is `loading="lazy"` but the wall lays its images out in independently-placed columns that all intersect the viewport, so the browser fetches the whole set on first paint.

---

## 1. Delivered file inventory

Every portfolio image is served as `gallery/<name>-1200w.webp`. WebP is chosen from a `<picture>` that also carries a JPEG `<source>`, so the fallback is present.

**Aggregate**

| Property | Value |
|---|---|
| Count | 30 |
| Format served | WebP (JPEG fallback present in `<picture>`) |
| Distinct pixel sizes | 1200x1800 (15 images), 1200x1500 (12), 1200x2133 (3) |
| Aspect ratios | 0.6667 (2:3), 0.8000 (4:5), 0.5626 (9:16) |
| Total bytes | 4,106,594 B = 3.92 MB |
| Smallest file | 25,358 B — `9-img-0269` |
| Largest file | 323,743 B — `18-img-0043` |
| Non-200 responses | 0 |

All 30 files really are 1200px wide despite the `-1200w` suffix — verified by downloading each from the live origin and opening it (`verify-served.py` reported "files NOT actually 1200px wide: 0 of 30"). Local repo copies match the served byte sizes, so the clone agrees with production.

**Interpretation:** the site has correctly built a 4-rung derivative ladder `[400, 800, 1200, 1600]` and correctly emits WebP with a JPEG fallback. The ladder is simply never used, because `sizes` tells the browser each image is full-width.

---

## 2. Crop geometry — measured, and there is no crop

An audit of this kind usually finds a grid that crops images. **This grid crops nothing.** Measured on the live DOM:

- `object-fit` computes to `fill` on **all 30** images (one distinct value across the set).
- `object-position` computes to `50% 50%` on all 30 — and with `fill` and no overflow clip it is inert.
- Each `<img>` carries an inline `aspect-ratio` (`1600 / 2400`, `1736 / 2170`, `1920 / 2400`, `1350 / 2400`) that matches the natural ratio of its own bitmap.
- No `overflow: hidden` on the image or on its `<figure>` parent.

`fill` combined with a matching aspect ratio reproduces the source rectangle exactly. I compared every image's box ratio against its natural ratio:

- **0 of 30 deviate by more than 1%** — the remainder is sub-pixel rounding.
- **0 of 30 lose any area to crop.** Retained area is 100% for every image.

This is deliberate and documented in the repo. `tools/rows.py` states it:

> "CSS cannot fix it without cropping (object-fit: cover), which Alwin has rejected since the first day."

The spacing guarantee is implemented in the data instead — each row holds three frames of the *exact* same ratio, so equal ratios yield equal heights and zero gap. It works: measured heights are 166.5, 138.75 and 197.33 CSS px, and each row of three is internally consistent.

**So the crop audit passes. No portrait is decapitated, nothing is over-cropped. The delivery audit below does not.**

---

## 3. Focal point / subject loss

Because the crop window is the full frame in all 30 cases, a subject centroid can never fall outside it — the failure this check exists to catch is structurally impossible on this site. I measured it rather than asserting it, using a gradient-magnitude saliency centroid over the served bitmaps.

- **Subject centroid outside the retained crop region: 0 of 30.** The retained region is the entire frame by construction.
- **Centroid spread:** x spans 0.46–0.61, y spans 0.40–0.67 in normalised coordinates. Detail concentrates near the middle of every frame — consistent with composed portraiture, with no frame subject-jammed against an edge.

**On the saliency metric itself, an honest limitation.** I first tried to report a "subject core" box (the bounding box of the top 25% of saliency mass, as a stand-in for the subject). That was wrong and I discarded it: the measured box came out at 289x401 device px on a 333x500 render — essentially the whole frame. Repeating at the top 2% of mass gave a median width of 236 device px on a 333px box, still degenerate. **Gradient-magnitude saliency is too diffuse on these frames to localise a face**, so no "subject core" figure is reported. Reporting it as a face size would have been a fabricated measurement.

What can be measured defensibly is the effect of the render size, and it is the real photographic deficit on mobile. A 4:5 frame is rasterised to **333x416 device px**. For a portrait where a face typically occupies 20–30% of frame width, that puts the face at roughly 65–100 device px across — present and legible, but small enough that catchlight, expression and retouching are not judgeable at a glance. Nothing is cut off; the work is simply shown too small to be evaluated.

That is the substantive finding for a photography portfolio: **not a wrong crop, but a correct crop that is too small to do its job.** It pushes every judgement onto the lightbox — which then compounds the problem, because the lightbox pulls a 406 KB full-resolution JPEG per tap (finding F3).


---

## 4. Per-image crop-quality table

`Area kept` is the measured fraction of the original frame visible in the CSS crop window — 100% everywhere, because there is no crop. `Waste` is `bytes sent / bytes of the 400w derivative that already exists on disk`. The last column is the decisive measurement for F1: both the served 1200w and the 400w candidate were downscaled to the exact 333-device-px render box and compared, so a high dB figure means swapping to 400w is visually free.

| # | File | Source px | Box (CSS) | Bytes sent | 400w would be | Waste | Area kept | Saliency centroid | 1200w vs 400w at render box |
|--:|---|--|--:|--:|--:|--:|--:|--|---|
| 1 | `49-img-0131` | 1200x1800 | 111x166.5 | 93 KB | 14 KB | 6.5x | **100%** | (0.46, 0.61) | 43.1 dB |
| 2 | `48-img-0128` | 1200x1800 | 111x166.5 | 104 KB | 16 KB | 6.4x | **100%** | (0.49, 0.56) | 43.6 dB |
| 3 | `25-img-0249` | 1200x1800 | 111x166.5 | 98 KB | 11 KB | 9.0x | **100%** | (0.59, 0.48) | 46.8 dB |
| 4 | `14-img-0026` | 1200x1800 | 111x166.5 | 150 KB | 25 KB | 6.0x | **100%** | (0.48, 0.49) | 43.0 dB |
| 5 | `15-img-0025` | 1200x1800 | 111x166.5 | 150 KB | 24 KB | 6.2x | **100%** | (0.48, 0.48) | 43.4 dB |
| 6 | `18-img-0043` | 1200x1800 | 111x166.5 | 316 KB | 26 KB | 11.9x | **100%** | (0.46, 0.52) | 41.7 dB |
| 7 | `32-img-0404` | 1200x1800 | 111x166.5 | 143 KB | 23 KB | 6.2x | **100%** | (0.50, 0.47) | 43.3 dB |
| 8 | `37-img-0124` | 1200x1800 | 111x166.5 | 177 KB | 17 KB | 10.5x | **100%** | (0.51, 0.51) | 44.4 dB |
| 9 | `21-img-0234` | 1200x1800 | 111x166.5 | 132 KB | 18 KB | 7.2x | **100%** | (0.52, 0.53) | 44.0 dB |
| 10 | `16-img-0030` | 1200x1800 | 111x166.5 | 119 KB | 17 KB | 7.2x | **100%** | (0.55, 0.46) | 45.5 dB |
| 11 | `12-img-0019` | 1200x1800 | 111x166.5 | 106 KB | 18 KB | 5.9x | **100%** | (0.50, 0.47) | 44.6 dB |
| 12 | `13-img-0020` | 1200x1800 | 111x166.5 | 121 KB | 19 KB | 6.2x | **100%** | (0.51, 0.47) | 45.1 dB |
| 13 | `36-img-0076` | 1200x1800 | 111x166.5 | 99 KB | 13 KB | 7.4x | **100%** | (0.61, 0.42) | 44.0 dB |
| 14 | `50-img-0143` | 1200x1800 | 111x166.5 | 109 KB | 12 KB | 9.4x | **100%** | (0.52, 0.54) | 43.1 dB |
| 15 | `2-20240718114526-img-0124` | 1200x1800 | 111x166.5 | 296 KB | 25 KB | 11.6x | **100%** | (0.52, 0.52) | 40.1 dB |
| 16 | `26-img-0253` | 1200x1500 | 111x138.75 | 62 KB | 11 KB | 5.5x | **100%** | (0.50, 0.54) | 43.3 dB |
| 17 | `40-img-0092` | 1200x1500 | 111x138.75 | 134 KB | 10 KB | 13.1x | **100%** | (0.50, 0.61) | 42.4 dB |
| 18 | `42-img-0095` | 1200x1500 | 111x138.75 | 86 KB | 10 KB | 8.7x | **100%** | (0.47, 0.59) | 42.5 dB |
| 19 | `30-img-0396` | 1200x1500 | 111x138.75 | 237 KB | 28 KB | 8.5x | **100%** | (0.46, 0.40) | 42.2 dB |
| 20 | `45-img-0118` | 1200x1500 | 111x138.75 | 113 KB | 15 KB | 7.3x | **100%** | (0.49, 0.49) | 42.2 dB |
| 21 | `46-img-0119` | 1200x1500 | 111x138.75 | 104 KB | 11 KB | 9.2x | **100%** | (0.48, 0.44) | 42.3 dB |
| 22 | `19-img-0198-3` | 1200x1500 | 111x138.75 | 139 KB | 24 KB | 5.8x | **100%** | (0.47, 0.53) | 40.9 dB |
| 23 | `51-img-0145` | 1200x1500 | 111x138.75 | 102 KB | 12 KB | 8.7x | **100%** | (0.50, 0.53) | 42.3 dB |
| 24 | `28-img-0308` | 1200x1500 | 111x138.75 | 109 KB | 14 KB | 7.6x | **100%** | (0.47, 0.42) | 42.6 dB |
| 25 | `47-img-0121` | 1200x1500 | 111x138.75 | 132 KB | 15 KB | 8.6x | **100%** | (0.50, 0.50) | 42.0 dB |
| 26 | `35-img-0482` | 1200x1500 | 111x138.75 | 73 KB | 11 KB | 6.6x | **100%** | (0.47, 0.49) | 44.5 dB |
| 27 | `9-img-0269` | 1200x1500 | 111x138.75 | 25 KB | 7 KB | 3.5x | **100%** | (0.52, 0.67) | 46.3 dB |
| 28 | `24-img-0245` | 1200x2133 | 111x197.33 | 105 KB | 17 KB | 6.1x | **100%** | (0.57, 0.53) | 44.7 dB |
| 29 | `53-img-0155` | 1200x2133 | 111x197.33 | 209 KB | 26 KB | 8.1x | **100%** | (0.51, 0.57) | 41.6 dB |
| 30 | `20-img-0202` | 1200x2133 | 111x197.33 | 168 KB | 29 KB | 5.7x | **100%** | (0.53, 0.53) | 40.8 dB |

All 30 rows: **100% area kept, alt text present.** Every row is over-served between 3.5x and 13.1x. The PSNR column spans 40.1–46.8 dB (median 43.0 dB) — above the ~40 dB threshold usually treated as visually lossless, and the mean absolute pixel difference at the render box is 0.54–1.80 on a 0–255 scale. **Swapping to the 400w derivative costs no perceptible image quality at this render size.**

---

## 5. Aspect ratio consistency

Consistent, and by design:

| Source shape | Count | Rendered box | Ratio |
|---|--:|---|--:|
| 1200x1800 (2:3) | 15 | 111x166.5 | 0.6667 |
| 1200x1500 (4:5) | 12 | 111x138.75 | 0.8000 |
| 1200x2133 (9:16) | 3 | 111x197.33 | 0.5626 |

The three shapes are grouped into contiguous rows (rows 1–5 are 2:3, rows 6–9 are 4:5, row 10 is 9:16), so the grid forms clean horizontal bands with no ragged mid-row height change. The vertical step at each band boundary (166.5 → 138.75 → 197.33 CSS px) is a uniform band change, not a misalignment. No mixed-orientation raggedness.

One honest caveat: this ordering is visible as banding. A visitor scrolling the 3-column wall sees five rows of tall frames, then four of shorter frames, then one of very tall frames. That is the cost of the "each row is one exact ratio" guarantee, and given the instruction in `tools/rows.py` it is working as specified — but a per-frame mosaic would read more like a curated wall if the banding were reviewed.

---

## 6. Delivery mechanics

**srcset** — present and correct on all 30. Four ascending candidates per image (`400w, 800w, 1200w, 1600w`) for both the WebP and JPEG `<source>`. The ladder is real: 0 missing derivatives at any width.

**sizes — this is the bug.** Emitted identically on all 30 images:

```
sizes="(max-width: 639px) 100vw, (max-width: 999px) 50vw, (max-width: 1399px) 33vw, 50vw"
```

On a 393px phone the first term applies: `100vw` = 393 CSS px, which at DPR 3 demands 1179 device pixels, so the browser correctly selects the **1200w** candidate. The `srcset` machinery is doing exactly what it was told. The instruction is wrong: the image is not 393px wide, it is **111px**. `sizes` describes a full-bleed single column while the DOM lays out a 3-column grid. The correct first term is roughly `calc(100vw / 3)` = 131px, needing 393 device px, which selects **400w** at DPR 3.

**Modern formats** — WebP served with a JPEG `<source>` fallback. Correct. AVIF is not offered: a further saving, not a defect.

**Lazy loading — misplaced.** All 30 images carry `loading="lazy"`; **0 carry `fetchpriority`**. The 4 images whose top edge falls inside the first 852px viewport are all `lazy`. Normally a lazy first-screen image causes a visible blank flash on mobile data. Here it is worse than a flash: because the wall's images sit in independently-placed columns that all intersect the viewport, the browser's lazy heuristic pulls **all 30** on first paint. The attribute buys nothing and the full 3.92 MB arrives up front. The fix is not to strip `lazy` — it is to make `sizes` correct so the eager part is small, then keep `lazy` for genuinely below-fold frames.

**CLS** — every `<img>` carries an inline `aspect-ratio`, so boxes are reserved before decode. `width`/`height` attributes are absent but the CSS ratio covers it. No layout shift observed.

**Lightbox** — one tap loads the **full original** `49-img-0131.jpg` at 1600x2400: **415,649 B (406 KB) for a single image**, drawn with `object-fit: contain` in a 362x542 box. It letterboxes rather than crops, so the whole frame is visible with black bars top and bottom, and the face is fully visible — correct for photography. But 406 KB per tap, with no smaller candidate chosen, even though the box needs only ~1090 device px.

---

## 7. Alt text

**0 of 30 images are missing alt text.** Every image has specific, descriptive alt naming subject, clothing and lighting — for example *"Portrait of a woman in a black top and pale skirt, standing against a dark background"* and *"Black and white close portrait of a woman"*. This is unusually good and serves both accessibility and image search. No action needed.


---

## 8. Ranked findings

**F1 — `sizes="100vw"` is wrong for a 3-column grid: 7.7x over-delivery. (Critical, ~3.41 MB wasted)**
Evidence: rendered width 111px; `sizes` first term `100vw` = 393px; DPR3 therefore selects 1200w. Total 4,106,594 B against 533,974 B if the 400w rung were selected — a measured 7.7x. Per-image waste ranges 3.5x–13.1x. PSNR at the render box is 40.1–46.8 dB, so the smaller file is visually free.
Fix: change the first `sizes` term to the real cell width, e.g. `(max-width: 639px) calc(100vw / 3), ...`. The 400w rung is then chosen automatically. No new files and no pipeline change required.

**F2 — all 30 images load on first paint, so lazy loading is ineffective. (High, 3.92 MB up front)**
Evidence: a 25-second settle with zero scrolling produced 30 image responses totalling 4,114,603 B, while only 4 images are actually within the first viewport.
Fix: after F1 the up-front cost drops to roughly 4 × 15 KB; then confirm `loading="lazy"` still applies below the fold. Consider `fetchpriority="high"` on the first 3–6 grid images.

**F3 — the lightbox pulls a 406 KB full-resolution JPEG per tap. (High)**
Evidence: one tap on image 1 requested `49-img-0131.jpg` (1600x2400, 415,649 B) into a 362x542 `contain` box. The lightbox `<img>` has no srcset.
Fix: give it a srcset capped at 1200w, or serve the existing `-1200w.webp`; at a 362px box even 800w is ample. 415 KB → roughly 40 KB.

**F4 — no derivative below 400w. (Medium)**
Evidence: once F1 lands, the 400w rung (533,974 B, 0.51 MB) is chosen. The ladder bottoms out at 400px for a cell needing 333 device px. Correct, but with no 200w/300w rung a mid-range phone at DPR 2 still gets 400w. Adding 200w and 300w would cut the mobile total further. Not a correctness bug.

**F5 — grid cell is 111px wide, so a portrait's face is roughly 65–100 device px. (Medium, design)**
Evidence: rendered boxes of 111x166.5, 111x138.75 and 111x197.33 CSS px become 333x499, 333x416 and 333x591 device px at DPR3. With a typical face at 20–30% of frame width, that is 65–100 device px — legible, but not enough to judge expression, catchlight or retouching. The centroid analysis confirms nothing is cropped away; the frames are simply too small to evaluate.
Fix: 2 columns on phones instead of 3, or keep 3 columns as a deliberate thumbnail strip and make the lightbox fast and cheap to open. A design decision for Alwin, not a defect.

**F6 — aspect-ratio banding is visible. (Low, cosmetic)**
Evidence: 166.5 → 138.75 → 197.33 CSS px height steps between row bands.
Fix: none required; working as specified by `tools/rows.py`.

**F7 — AVIF not offered. (Low)**
Evidence: `<picture>` carries only `image/webp` and `image/jpeg` sources.
Fix: add an AVIF source — a further ~20–30% on top of the post-F1 total.

### Explicitly NOT defects (checked, and passing)

- **No cropping.** `object-fit: fill` with matching `aspect-ratio`; 0/30 deviate >1%; 0/30 lose area.
- **No subject loss.** 0/30 centroids outside the retained region — structurally impossible when the crop is the full frame.
- **No distortion.** 0/30 drift between box ratio and natural ratio; the "squish bug" documented in the repo has not regressed.
- **Alt text.** 0/30 missing.
- **WebP with JPEG fallback.** Present on all 30.
- **Derivative naming.** All 30 `-1200w` files really are 1200px wide; all statuses 200; 0 missing derivatives.

---

## 9. What I could not determine

- **Real-world network cost.** Figures are encoded transfer bytes from the origin, not billed mobile data after compression. Server-side image compression and any CDN re-compression are invisible to CDP.
- **Subject localisation.** Gradient-magnitude saliency is too diffuse on these frames to isolate a face — the bounding boxes came out near frame-sized, so no subject-size figure is claimed from it. The render-size arithmetic in section 3 and F5 is geometric and defensible; it is not a face detector. A real face-detection pass (e.g. a landmark model) would be needed to state face pixel dimensions as a measurement rather than an estimate.
- **Aesthetic crop judgements** — whether a given crop is flattering — are out of scope for a measurement audit.
- **Other routes.** Not audited for image delivery. The home page was measured once incidentally: 6 images, the same `sizes` bug, and the hero uses `object-fit: cover` with `object-position: 50% 0%`, which is the one place on the site where a real crop occurs. It is excluded from the 30-image inventory because the scope is the portfolio.

---

## 10. Evidence files

Screenshots and renders, all in
`C:\Users\Operations 3\Documents\HERMES\01_Projects\shutterhaus-site\mobile-audit\imgshots\`:

| File | What it shows |
|---|---|
| `01-portfolio-393px-top.png` | Live mobile portfolio at first paint — 3 columns, 111px cells |
| `02-portfolio-393px-scrolled.png` | The same view scrolled |
| `03-lightbox-393px.png` | Lightbox open — `contain`, letterboxed, full frame visible |
| `04-lightbox-first-tap.png` | First tap, capturing the 406 KB fetch |
| `05-contact-sheet-as-rendered-393px.png` | All 30 images at true 111px cell size, DPR3, 3-wide |
| `06-bytes-vs-pixels-1200w-vs-400w.png` | 3.92 MB vs 0.51 MB, 7.7x, identical pixels |
| `07-resolution-1200w-vs-400w.png` | Top-6 byte hogs, 1200px vs 400px source at the real render size — no visible difference |

Raw measurement data: `portfolio-imgs.json`, `bytes.json`, `firstscreen.json`, `served-dims.json`, `crop-quality.json`.

Scripts used: `probe.mjs`, `portfolio.mjs`, `bytes.mjs`, `confirm.mjs`, `firstscreen.mjs`, `verify-served.py`, `crop-quality.py`, `refine-saliency.py`, `detail-metric.py`, `psnr-test.py`, `correct-sizing.py`, `renders.py`, `make-table2.py`.

**Corrections made during the audit, for the record:** a first pass at a "subject core" metric produced degenerate near-frame-sized bounding boxes and was discarded rather than reported; a detail-retention proxy exceeded 1.0 because a fixed blur radius behaves differently at different scales and was replaced by the PSNR comparison; and the initial PSNR formula was wrong (`20*sqrt(255)` instead of `10*log10(255^2/MSE)`), producing implausible 127–275 dB figures before being fixed to the reported 40.1–46.8 dB range.
