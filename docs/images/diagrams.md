# Diagrams

Three images, all 16:9 at 1600x900. They exist to explain the method in one glance, so every one of
them is built around **four to six words**: more text means smaller type, and a diagram that needs
small type is a paragraph with decoration.

The composition of each one comes from a document in this folder: `docs/method.md`,
`docs/architecture.md` and `docs/artifacts.md`. If the method changes, change the spec here first.

## Constraints for every diagram

| Rule | Why |
|---|---|
| At most six words, uppercase, wide tracking | Legibility at 900 px wide, the size the image is actually displayed |
| No brand logos, product names, numbers, or dollar amounts | Imported specifics date the image and can be false; a diagram must not promise what the tool does not do |
| One icon per node, geometric and outline-style | Consistent set reads as one system; mixed icon styles read as clip art |
| 16:9, centered, 8% safe margin | The detail page renders it in an `aspect-video` frame; anything near the edge is cropped on some viewports |
| English labels | The image serves both locales, so it should carry as few language-specific words as possible |

## Style block

Paste this with every prompt, and attach `funky-secure-neon-diagram.webp` from the portfolio as the
style reference.

```text
Style: flat vector infographic, dark navy background with a faint starfield,
neon-outlined rounded squares with soft inner glow, thin glowing beams as arrows,
crisp geometric line icons, high contrast, generous negative space.
Palette: deep navy background, cyan primary, magenta and violet accents, white text.
Composition: 16:9 landscape, centered, 8% safe margin on all sides.
Text rules: uppercase, wide letter spacing, large enough to stay legible when the
image is shown at 900px wide.
Hard constraints: no brand logos, no real product names, no numbers, no dollar
amounts, no fake UI screenshots, no watermark, no long sentences.
```

## D1 - Four gates

Source: `docs/method.md` (the phase table) and `docs/architecture.md` (the phase graph).
Used as: the detail page visual.

```text
Four neon rounded squares in a single horizontal row, connected left to right by
thin glowing beams with arrowheads. Each square contains one simple icon, in order:
a magnifier over a small speech bubble; a blueprint with three stacked blocks; a
calculator with a ruler; a document with a wax seal.
Below the last square, a single glowing arc returns to the first, and at its
midpoint a small shield with a keyhole.
Exactly these words, nothing else: PROBLEM, DESIGN, ESTIMATE, PROPOSAL under the
four squares, and CHECK above the beams, APPROVE on the returning arc.
```

Preferred variant: ask for the artwork **without text**, then set the six labels in SVG with the
project palette. The reference image `funky-sdd-neon.webp` shows the failure mode of generated text:
it reads `venky-verify`. Artwork from the model, type from us.

## D2 - Who decides

Source: `docs/architecture.md`, section "Who decides what".
Used as: gallery, the frame that explains why the tool cannot approve.

```text
Three vertical panels of equal size, left to right, each a neon-outlined rounded
rectangle with one large icon and two lines of text.
Left: a terminal window with a check mark - CHECK / deterministic.
Center: a single eye inside a lens ring - REVIEW / independent.
Right: a human silhouette holding a seal stamp - APPROVE / accountable.
A thin beam runs through all three and ends at a small gate that opens upward.
Exactly these words: CHECK, REVIEW, APPROVE, and the three one-word subtitles.
```

## D3 - The hash is the approval

Source: `docs/artifacts.md` ("Normalized body and `approved_hash`") and `docs/method.md`
("Approval and staleness").
Used as: gallery, the frame that explains why an edit revokes an approval.

```text
Four document cards in a row, each with a small wax seal at the bottom right, all
tinted in the same cyan glow, representing an approved chain.
From the third card, a pencil descends and cracks its seal; the card turns violet
and a short beam leads down to a small tag that reads STALE.
The first two cards stay intact to show that the break propagates forward.
Exactly these words: APPROVE, HASH, EDIT, STALE.
```

## Images that are not model-generated

Two more assets are produced deterministically from real output, by a script that lives in the
portfolio repository (which already declares `sharp`), so this package keeps zero dependencies:

| Asset | Source | Property |
|---|---|---|
| Terminal transcript, failing check then passing check | The CLI's real stdout, ANSI stripped, typeset over a terminal panel | Regenerate after any message change; it cannot drift |
| Rendered gate report | A real `gates/3-estimate.md` from `docs/validation/` | Shows the artifact, not the tool: verdict, severities, accepted risks |
