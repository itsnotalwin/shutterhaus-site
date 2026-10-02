# A11y pass — safe areas, contrast over photographs, reduced motion

2026-10-02. Three defects from the mobile audit, fixed in `index.html`,
`src/styles.css` and `src/editorial.css`. Everything below is measured in
headless Chrome at **393x852, DPR 3, touch emulation on**, against the built
`dist/`, not against the source.

## How the contrast numbers were produced

`capture.mjs` + `contrast.py`. The method matters more than the numbers,
because contrast over a photograph has no single correct answer:

1. The page is captured twice — once normally, once with each target set to
   `visibility: hidden`. The photograph, the scrim and the layout are
   identical between the two; **the only pixels that differ are glyphs**.
   A pixel is therefore classified as background by "did it change when the
   letters were removed", with no per-element colour threshold to tune.
2. The reported background is the **worst** pixel — the one whose luminance
   is *closest* to the text's. (The furthest one is the best case; picking
   it by mistake reports a dark photograph as a comfortable pass, which is
   exactly the bug this harness had first.)
3. The text colour is the rendered colour of the glyph pixels themselves,
   so the 0.9-opacity eyebrow is measured at the white it actually paints.

Thresholds are WCAG 2.1 SC 1.4.3: **4.5:1** for the eyebrow and lede (body
copy), **3:1** for the wordmark (32px display type) and the burger (a
graphical object, not text).

## The contrast defect was photo-conditional, and that is the whole point

The audit reported failures. Measuring the pinned hero showed **passes**.
Both are true, and the reason is the finding: white type over a photograph
has no fixed contrast, because the scrim is a constant and the photo is not.

`SITE.heroPhoto` can point at any frame, and the `portraitShot[0] ??
landscape[0] ?? photos[0]` fallback picks automatically once the gallery is
reordered. So the honest test is not "does today's photo pass" but "how much
headroom does the scrim leave before a bright photo breaks it".

Candidates were therefore **swept, not guessed** (`sweep.mjs`): each was
injected into the live page, painted, captured and decoded against the
gallery's brightest frame. `30-img-0396` and `28-img-0308` have a fully
blown top band (p98 = 255) and are the worst case.

## Measured, before → after

Worst-pixel ratio. Pinned hero `27-img-0297` (what visitors see today):

| element | before | after | need |
|---|---|---|---|
| hero eyebrow | **1.36:1** FAIL | **6.29:1** PASS | 4.5:1 |
| header wordmark | **2.49:1** FAIL | **7.00:1** PASS | 3:1 |
| burger bars | **1.00:1** FAIL | **8.86:1** PASS | 3:1 |
| hero lede | 5.20:1 PASS | **10.65:1** PASS | 4.5:1 |

Worst-case hero `30-img-0396` (blown sky, the reason to care):

| element | before | after | need |
|---|---|---|---|
| hero eyebrow | **1.24:1** FAIL | **5.60:1** PASS | 4.5:1 |
| header wordmark | **2.32:1** FAIL | **6.69:1** PASS | 3:1 |
| burger bars | **1.00:1** FAIL | **15.52:1** PASS | 3:1 |
| hero lede | **3.72:1** FAIL | **8.97:1** PASS | 4.5:1 |

24 measurements across 6 frames, all passing, worst case **5.60:1**.

### Why the old scrim failed, precisely

`herogeo.mjs` maps every type run to a percentage of the hero box, which is
what a gradient stop is expressed in:

```
.site-header            0.0% - 15.0%     burger  6.1%
.logo                   2.7% - 10.6%
.hero__body .eyebrow   35.9% - 38.0%   <-- the dip
.hero__h               40.9% - 61.6%
.hero__lede            67.1% - 74.9%
.hero__meta            93.2% - 100%
```

The old gradient ran `.28 → .12 at 38% → .78 at 100%`. That **.12 stop is
the defect**: the quietest part of the scrim landed exactly on the
smallest, thinnest text on the page. The eyebrow was failing because of a
number someone had already raised once, in the wrong place.

The new shape keeps the 0–22% falloff (that is where the subject's face and
the sky are; a dense wash there would dull the one thing the page exists to
show) and holds a plateau from 34% down, covering all four runs.

`cmp-scrim.png` and `cmp-scrim-bright.png` are the visual check: the face
and sky stay clean, the text band is denser, the photograph reads through.

## Safe areas

`viewport-fit=cover` added; four tokens aliased once in `:root` as
`max(0px, env(safe-area-inset-*))` so no rule spells out the fallback.
Applied to the header (top), the body (left/right/bottom) and every
lightbox control. The header grows by `--sat` rather than trading it away,
and the `@media (max-width: 640px)` override adds it to its own 10px — that
rule replaces the desktop padding wholesale, so omitting it there would have
put the burger back under the island on the one viewport where it is the
only navigation.

**NOT VERIFIED: real iOS insets.** `Emulation.setDeviceMetricsOverride`
cannot emulate `env(safe-area-inset-*)`; it resolves to 0 in headless
Chrome. What *is* verified: the tokens and every `calc()` survive
minification into `dist/`, and with a 0 inset the layout is unchanged
(header 92px, `padding-top: 10px`, body padding 0 on all five routes).
Real-inset behaviour needs Alwin's iPhone.

## Reduced motion

One block at the end of `styles.css`. The blanket `*` is deliberate and not
a shortcut: 11 transitions are declared across two files at (0,1,0) and
(0,2,0), and an enumerated list would rot on the next edit.
`0.01ms` rather than `0s`, so `transition-delay` is not cancelled too.

**Dark mode deliberately NOT implemented.** Not a palette swap: the hero
scrim, the lightbox backdrop, the `.cell` placeholder grey and the
white-on-photo header type are all tuned against a white page, and every
ratio in this file was measured on it. Shipping an unverified inversion is
worse than being honestly light-only. The reasoning is in a comment at the
end of `styles.css` so it is not re-litigated every audit.

## Reproduce

```
node mobile-audit/a11y/capture.mjs     # TAG=before BASE=...  two captures
python mobile-audit/a11y/contrast.py before
node mobile-audit/a11y/sweep.mjs        # CANDS='[...]' inject + capture
node mobile-audit/a11y/verify.mjs       # built-CSS + runtime assertions
node mobile-audit/a11y/regress.mjs      # per-route header regression
```

Evidence PNGs sit beside this file. `verify.mjs` and `regress.mjs` exit
non-zero on failure, so they are usable as a gate.
