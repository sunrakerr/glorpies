# fuglios

Every name has a fuglio: an ugly little alien face, painted in watercolour and dip pen from any string. Antennae, extra eyes, horns, halos, too many teeth. The same name is always the same face, in 29 looks, and alive: they breathe, blink and glance at you.

This repo is the **[fuglios](packages/fuglios/README.md)** library and its site. The site also runs the library's image route at `/api/face`, as a demo of what `fuglios/server` gives your own app.

```bash
pnpm install
pnpm dev --port 3417     # http://localhost:3417
pnpm build && pnpm start
```

| Route | |
| --- | --- |
| `/` | Landing page: a playground whose code is always what you see, and the API reference |
| `/gallery` | A wall of random fuglios. Open one to restyle it, export PNG or SVG, or get its code |
| `/how` | An animated explainer of how a face is painted |
| `/api/face` | The demo image route: `?name=soggy-glorp&look=ink&size=128&shape=circle&format=png` (png, webp, jpeg, svg, gif; `background=false` for only the face) |

## Layout

- `packages/fuglios`: the library. Zero runtime dependencies. Entries are `fuglios`, `fuglios/react`, `fuglios/element`, `fuglios/server` and the `fuglios` CLI.
  - `src/face/build.ts` turns a seed into an alien: a display list of glazes, ink, hatching and solids, plus the parts that move (pupils, lids).
  - `src/engine.ts` is seeded randomness and noise, an exact port of p5's, so a face renders identically at any size, in the browser or on a server.
  - `src/face/render.ts` paints the backdrop once and the figure once per line-boil phase, then composes frames with live eyes on top. `src/stage.ts` runs one animation loop for every face on a page.
  - `src/small.ts` redraws faces from their sketch for avatar sizes; `src/styles.ts` re-renders them in the painted looks.
- `src/`: the Next.js site. `src/app/api/face/route.ts` is the demo image route, two lines of `faceRoute()`.
- `scripts/`: headless Chrome checks (`run.mjs` drives the gallery end to end, `shot.mjs` takes screenshots, `frames.mjs` renders the explainer as frames).

## Checks

```bash
pnpm typecheck
pnpm --filter fuglios build && pnpm --filter fuglios test
```

## Deploying

The site deploys to Vercel as is: the library is compiled from source by Next (`transpilePackages`), and `@napi-rs/canvas` paints images on the server. Set `NEXT_PUBLIC_SITE_URL` for a custom domain; otherwise snippets point at the Vercel production domain.

Publish the library with `pnpm publish` from `packages/fuglios`, which swaps the source exports for the built ones.

MIT
