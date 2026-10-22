# Faces

Hand-painted watercolour and dip-pen faces, generated in the browser with p5.js, that blink, breathe and follow your cursor. Copy any face to the clipboard, or download it as PNG (1K/2K) or SVG.

```bash
pnpm install
pnpm dev --port 3417   # http://localhost:3417
pnpm build && pnpm start
```

| Route | |
| --- | --- |
| `/` | The gallery |
| `/how` | Animated explainer of how a face is painted |
| `/lab` | Style lab: the same faces in 36 art styles, with approvals and export |

See **[HANDOFF.md](HANDOFF.md)** for how it's built, the thinking behind it, and what comes next.

## How it works

- `src/lib/face/build.ts` builds a face from a seed: a display list of watercolour glazes, ink strokes, hatching and solids, plus specs for the parts that move (pupils, lids, spirals). The same seed always paints the same face.
- `src/lib/engine.ts` wraps one headless p5 instance for seeded randomness and Perlin noise. Every operation reseeds before it runs, so it renders identically at any size or format.
- `src/lib/face/render.ts` paints the still backdrop once, and the figure once per "boil" phase (the same lines redrawn slightly differently, as in hand-drawn animation). It then composes frames: the figure is multiplied over the backdrop, then the live eyes go on top.
- `src/lib/stage.ts` runs one animation loop for every face: breathing, swaying, blinking, gaze that tracks the pointer (or wanders when idle), line boil, and a springy wobble when you tap a face in the viewer.
- `src/lib/face/svg.ts` exports the same painting as SVG. Ink, hatching and fills are vector paths; glazes and paper are embedded images with the same clips and multiply blending.

Motion respects `prefers-reduced-motion`, and the **Alive / Still** switch is remembered.
