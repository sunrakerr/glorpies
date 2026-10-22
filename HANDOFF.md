# Faces — handoff

A single-page app of hand-painted, wobbly watercolour-and-ink faces that come alive: they breathe, sway, blink, follow your cursor and wobble when tapped. Every face is generated in the browser from one number (its seed). Any face can be copied to the clipboard or downloaded as PNG (1K/2K) or SVG.

This document explains how to run it, how it's built, why it's built that way, and where it was heading when this handoff was written.

---

## 1. Run it on a new machine

Requirements: Node 20.9+ (developed on Node 25.9) and pnpm 10.

```bash
git clone https://github.com/sunrakerr/faces-app.git
cd faces-app
pnpm install
pnpm dev --port 3417        # http://localhost:3417
```

Other scripts: `pnpm typecheck`, `pnpm build && pnpm start`.

The port doesn't matter to the app; 3417 is only what the helper scripts in `scripts/` expect.

### Pages

| Route | What it is |
| --- | --- |
| `/` | The gallery: a grid of taped-up sketches, 12 at a time. Click one to open the viewer. |
| `/how` | A 56-second animated explainer of how one face is painted, drawn with the real renderer. Pause, restart, or paint another face. `?seed=123` picks the face. |
| `/lab` | Unlinked. The style lab: the same three faces in 36 art styles, with approve ticks and export. `?seeds=1,2,3` pins the faces. |
| `/lab/avatars` | Unlinked. An abandoned experiment (3D WebGL avatars). Kept for reference; see §6. |

---

## 2. What the user asked for, in order

The product was shaped by fast feedback, so the history explains a lot of the decisions:

1. Wobbly faces with p5.js, many variations, pen strokes and watercolour, hand-drawn and artistic. Started as one HTML page (`prototype/index.html`).
2. Only the images, no names or captions; bigger faces; no bodies.
3. Thicker lines and strokes; less paint splatter.
4. A React/Next.js single-page app: copy to clipboard, PNG and SVG downloads, every face alive, a subtle and artistic UI, responsive.
5. No header, intro or footer. Minimal but good. Don't call it "Wobbly Folk"; it's just **Faces**.
6. New card style: chosen from options as **taped sketches** (washi tape, slight tilt, lifted corners).
7. An explainer of how the faces are drawn → `/how` plus a rendered video (`docs/how-a-face-gets-painted.mp4`).
8. Variations in other art styles → `/lab`. A 3D avatar system was built and **rejected** ("the new 3d one sucks"): the wobbly faces are the identity of the project.
9. 24 more styles (traditional paint, prints, craft, digital) on the wobbly faces → all liked.
10. Pixel art, cross-stitch and ASCII were rebuilt for more detail, then **reverted** at the user's request: the simpler earlier versions read better, and the embroidery hoop and halo circles were unwanted. Voxel keeps its rebuilt version.
11. Approve ticks plus a manual export in the lab, so the user can hand over the chosen styles.

---

## 3. Ideology

These are the principles that guided the work. Keep them when extending it.

**Hand-made over clean.** Nothing is drawn with a straight line or a uniform stroke. Pen lines are filled ribbons whose width follows noise; colour is built from dozens of translucent, deformed glazes; paper has tooth. The faces should feel painted, not rendered.

**One seed, one face, forever.** A face is a pure function of its seed. Every operation reseeds itself before it runs, so the same face renders identically at 300px, at 2048px, as SVG, in any style, or as one of the "boil" frames. That determinism is what makes export, the explainer and the style lab possible.

**A display list in the middle.** Building a face and drawing it are separate. `buildFace(seed)` produces a list of operations (washes, ink lines, hatching, solids, paper) plus specs for the parts that move (eyes). Renderers consume that list: the canvas animator, the PNG exporter, the SVG exporter, the explainer, and every art style. A new style never needs to know how faces are designed.

**Alive, but cheap.** Each face is painted once into a few rasters; animation only composites them. The page must stay at 60fps with dozens of faces on screen.

**Quiet UI.** The faces are the content. Controls live in one small floating pill, appear on hover, and use the same paper, ink and clay palette as the art. No chrome, no branding.

**Show, don't summarise.** Every visual change was verified by rendering it (headless Chrome screenshots, contact sheets) before reporting it as done.

---

## 4. How a face is made

All of this lives in `src/lib/`.

### 4.1 Randomness: `engine.ts`

One headless p5 instance supplies `randomSeed`, `random`, `randomGaussian`, `noiseSeed` and `noise`. p5 is loaded with a dynamic import, never draws anything itself, and has friendly errors disabled. `noiseSeed` is cached because p5 keeps one noise table per page.

### 4.2 Design: `face/build.ts`

`buildFace(seed, E)` makes every creative decision from one random stream: palette (`palettes.ts`, 8 hand-picked sets), head shape (egg, pear, round, square, bean), hair (spikes, curls, bun, bob, fringe, cap and more), eyes (round, almond, sleepy, button, spiral), brows, nose, mouth, oddities (glasses, plaster, freckles, earrings, stitches, leaves) and temperament (breathing rate, sway, blink rate).

It outputs:

- `back`: paper, pencil underdrawing, background glazes, a rare drop of paint. Never moves.
- `figure`: everything that breathes and sways.
- `eyes`: specs for live pupils, lids and spirals. The painting leaves the eye whites and outlines; the animator draws the rest every frame.
- `pivot`, `gaze`, `temper`: for the animation.

`INK_WEIGHT = 2` doubles every pen width; hatching is sparser and heavier; splatter is capped at one drop. All three were explicit requests.

### 4.3 Watercolour: `face/wash.ts`

A Tyler Hobbs–style glaze:

1. Start with a rough polygon and jitter it.
2. **Deform:** split every edge and push its midpoint by a Gaussian random scaled by the edge length, repeated 2–5 times, so the outline wobbles like wet paint.
3. **Stack** about 30 differently-deformed copies at about 4% opacity. Edges stay soft, the middle goes deep.
4. **Grain:** every few layers, lift specks of pigment (`destination-out`).
5. **Bloom:** sometimes, a drop of water pushes pigment outward and leaves a dark tide line.
6. **Edge darkening:** a thin stroke where pigment pools.

Glazes are composited with `multiply`, so overlaps darken like real paint.

### 4.4 Ink: `face/strokes.ts`

`inkRibbons(op, E, phase, reveal)` turns a polyline into filled outlines:

- pressure from Perlin noise;
- tapered ends;
- an off-register ghost pass;
- gaps where the nib runs dry.

`phase` only moves where the noise is sampled, so each phase is the same line redrawn by hand. Cycling three phases gives the **line boil** of hand-drawn animation. `reveal` draws only part of the line, which the explainer uses.

`hatchLines` makes wobbly parallel lines clipped to a region.

### 4.5 Rendering and animation: `face/render.ts`, `stage.ts`

`rasterizeFace` paints, once per face and size:

- the **backdrop**, with the vignette baked in, because multiply is order-independent;
- the **figure** three times, once per boil phase;
- the eye rasters.

`drawFrame` composites one frame: backdrop, then the figure multiplied on top with the pose transform (breathe, sway, tap jiggle) around the neck pivot, then the live eyes.

`stage.ts` is one shared requestAnimationFrame loop for every face on the page:

- frames at 30fps;
- line boil at 8fps;
- pupils follow the pointer, or make random saccades when it's idle;
- random blinks;
- a damped-spring wobble when a face is tapped in the viewer.

An IntersectionObserver pauses faces that are off screen. `prefers-reduced-motion` is respected, and the Alive/Still switch is remembered in `localStorage`.

`studio.ts` caches built faces and runs rendering through a **priority job queue**, one job per task: the opened face first, then exports, then the gallery in order. The page never freezes while 12 faces paint.

### 4.6 Export: `share.ts`, `face/svg.ts`

- **PNG:** `renderStill` at 1024 or 2048, then `toBlob`.
- **Clipboard:** a `ClipboardItem` built synchronously around a pending blob, so Safari counts the write as part of the click.
- **SVG:** pen lines, hatching and solids are real vector paths. Glazes and paper are embedded images with the same clips and `mix-blend-mode: multiply`.

---

## 5. The UI (`src/components/`, `src/app/`)

- `Studio.tsx`: the gallery grid (2/3/4 columns) and the bottom pill.
  - The Alive switch.
  - New faces.
  - Twelve more.
  - "How they're painted" → `/how`.
- `FaceCard.tsx` + `Sheet.tsx`: a face as a taped sketch.
  - Washi tape colour, stripe or dot pattern and placement are seeded from the face.
  - A slight tilt that straightens on hover.
  - Hover actions: Copy, PNG, SVG, Repaint.
- `Viewer.tsx`: a `<dialog>` with the face enlarged and tappable.
  - Prev/next.
  - Copy image, PNG with 1K/2K choice, SVG, Copy SVG, Repaint.
  - Keys: ← → C R Esc.
- `FaceCanvas.tsx`: sizes the backing store to the element, paints through the job queue, and registers with the stage.
- `HowItsDrawn.tsx` + `lib/explainer.ts`: the explainer.
  - A pure function of time, `draw(ctx, t)`.
  - It plays live and also renders frame-exact video (`scripts/frames.mjs`).
- `globals.css`:
  - theme tokens (paper `#f4eee4`, ink, clay);
  - Fraunces for display type, Inter for text;
  - paper grain on the page;
  - sheet and tape styles;
  - the dialog.

---

## 6. The style lab (`/lab`)

The lab renders the same faces in 36 styles, in five groups. Every style reads the face's display list, or a flat or watercolour rendering of it, and rebuilds the picture from its own primitive.

| File | Styles |
| --- | --- |
| `lib/styles.ts` | Watercolour (original), 1-bit Atkinson, 1-bit ordered (Bayer), pixel art, cross-stitch, ASCII, ASCII terminal, risograph, pen plotter, paper cut-out, neon. Also the shared helpers `drawFlat` (paint-by-numbers rendering), `paletteOf`, `nearest` and `pixelGrid`. |
| `lib/paints.ts` | Gouache, oil impasto, sumi-e, pastel, charcoal, pointillism, fresco, ukiyo-e, linocut, engraving, Warhol, pop art, stencil graffiti, stained glass, mosaic, knitted, felt, brick mosaic, low-poly, topographic, thermal, holographic, vaporwave, blueprint. |
| `lib/pixels.ts` | Voxel: the face as a lit relief of cubes, with a per-face variant from the seed. |
| `lib/raster.ts` | Shared raster helpers: masks of the figure and the pen lines, box blur, the "pillow" dome over the figure, flow fields, sampling, colour conversion. |

Techniques worth knowing:

- **The pillow height map.** A heavily blurred mask of the figure acts like a dome over the head. Linocut and engraving lines bow over it; voxels, topographic contours, thermal and holographic all read it as depth.
- **Flow fields.** The gradient of blurred luminance, rotated 90°, follows the shape of the face. Oil strokes and mosaic tiles run along it.
- **Stained glass.** Voronoi cells intersected with the face's colour regions, so panes never cross a colour edge, then leaded.
- **Low-poly.** A Bowyer–Watson Delaunay triangulation, with extra vertices along the pen lines to keep features sharp.

**Approvals:**

- Tick a style, or click its faces.
- Approvals persist in `localStorage` under `faces:lab-approved`.
- The bottom bar can show only the approved styles, draw new faces, copy the list, download `approved-styles.json`, or clear everything.

The export looks like:

```json
{ "approved": ["linocut", "warhol"], "names": ["Linocut", "Warhol screen print"] }
```

**Rejected: 3D avatars** (`/lab/avatars`, `lib/avatar/`). These were raymarched signed-distance-field characters in a WebGL2 shader (clay, comic, 1-bit, pixel, ASCII, neon, Bauhaus). They were technically fine, but the user preferred the wobbly faces. Nothing else depends on this code, so it can be deleted.

---

## 7. Where it was heading (next step)

The user was about to approve styles in the lab and hand over the exported list. The agreed plan for the main site:

1. **A global style picker** in the bottom pill. It shows only the approved styles, each as a small live thumbnail, and remembers the choice.
2. **A per-face style** in the viewer. A strip of style chips under the enlarged face changes just that face; choosing the gallery's style again clears the override.
3. **Export in any style.** PNG and clipboard render the style at 1024/2048. For raster styles, SVG would wrap the PNG in an SVG, because only the watercolour, plotter and blueprint styles are genuinely vector.
4. **Animation for styled faces.** Styles are single stills today. The cheapest good option is to apply the breathing, sway and tap wobble to the styled image as a whole, slightly overscaled so the edges never show. Live eyes and line boil per style would be a later, larger step.

Everything needed already exists: every style is a pure `(face, E, px) => canvas` function, and every one is procedural, so any face can take any style at any size.

---

## 8. Testing and tooling (`scripts/`)

Plain Node scripts that drive headless Chrome over the DevTools protocol. They expect the dev server on port 3417. Set `CHROME=/path/to/chrome` on non-Mac machines.

| Script | Does |
| --- | --- |
| `run.mjs` | End-to-end check of the gallery: all faces paint, frames keep coming, PNG and SVG download, the clipboard receives `image/png` and SVG text, keyboard navigation works, mobile layout. |
| `shot.mjs` | Screenshot of the gallery at a given size and pixel ratio. |
| `frames.mjs` | Renders the `/how` explainer frame by frame (`fps:30`), for encoding with ffmpeg. |
| `styles.mjs` | Renders lab styles for given seeds to PNGs: `node scripts/styles.mjs out 480 424242,90210 linocut,warhol`. |
| `avatars.mjs` | The same for the rejected 3D avatars. |

The explainer video was made with:

```bash
node scripts/frames.mjs 424242 /tmp/frames fps:30
ffmpeg -framerate 30 -i /tmp/frames/f%05d.jpg -c:v libx264 -pix_fmt yuv420p -crf 19 docs/how-a-face-gets-painted.mp4
```

`pnpm typecheck` must pass (TypeScript strict with `noUncheckedIndexedAccess`).

---

## 9. Gotchas

- **Determinism discipline.** Anything that draws must reseed (`E.seed(op.seed)`) before it consumes randomness, and call `E.noiseSeed(face.seed)` before sampling noise. Skip this and exports stop matching the screen.
- **Next 16 writes `AGENTS.md`** in the repo whenever `next dev` runs. It's committed so the working tree stays clean.
- **Spiral eyes** are authored around the eye centre, so the animator can spin them. Translate by `(e.x, e.y)` before drawing `e.spiral.pts`.
- **Clipping.** Some pen lines carry a `clip` region, such as the stripes on a hat band. Any new style that draws `op.pts` must apply `applyClip(ctx, op.clip)`, or the lines spill outside the hat.
- **`resample()`** spaces points along a polyline, and `addPath()` closes the path. Use a manual moveTo/lineTo loop for open lines.
- **The p5 types** don't declare `disableFriendlyErrors`; it's set through a cast.
- **Generated media** (`media/`) is git-ignored. Regenerate it with the lab and `scripts/styles.mjs`.
