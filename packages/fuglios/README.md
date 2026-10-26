# fuglios

Ugly little alien faces from any string. Antennae, extra eyes, horns, halos and too many teeth, painted in watercolour and dip pen, in 29 looks, and alive: they breathe, blink and glance at you.

The same name is always the same face, on every device and every server. No API calls, no storage, zero dependencies.

```bash
npm i fuglios
```

## Anywhere: one tag

```html
<script type="module" src="https://unpkg.com/fuglios"></script>

<fuglio-face name="ada@lovelace.dev" size="48"></fuglio-face>
```

Works in plain HTML and in any framework (Vue, Svelte, Angular, Astro…). With a bundler, `import 'fuglios/element'` registers the tag.

## React

```tsx
import { Fuglio, Avatar, AvatarImage, AvatarFallback } from 'fuglios/react';

<Fuglio name="agent-47" size={40} state="thinking" />

// a photo that falls back to a face while it loads, or if it fails
<Avatar size={40}>
  <AvatarImage src={user.photo} alt={user.name} />
  <AvatarFallback name={user.email} />
</Avatar>
```

It renders on the server as a soft placeholder in the face's own background colour, then paints on the client.

## Props and attributes

| | type | default | |
| --- | --- | --- | --- |
| `name` | `string \| number` | required | Any string. The same name is always the same face. |
| `look` | look id \| `"auto"` | `"auto"` | `auto` paints watercolour, or the ink badge below 72px. |
| `size` | `number \| string` | `48` | Pixels, or any CSS length. |
| `shape` | `circle` `squircle` `rounded` `square` | `circle` | The crop. |
| `state` | `idle` `thinking` `working` `waiting` `blocked` `done` | `idle` | What the face shows besides who it is. |
| `alive` | `boolean` | `true` | Breathing, blinking, glancing. Off for readers who prefer reduced motion. |
| `pokeable` | `boolean` | `false` | A tap makes the face wobble. |
| `label` | `string` | `"Avatar"` | Accessible name (`role="img"`). |

**Looks.** Paintings, for faces shown large: `watercolour`, `atkinson`, `bayer`, `plotter`, `cutout`, `neon`, `gouache`, `oil`, `sumi`, `charcoal`, `pointillism`, `linocut`, `warhol`, `stencil`, `stained`, `mosaic`, `felt`, `lowpoly`, `topo`, `thermal`, `holo`. Avatars, which still read at 16px: `blob`, `ink`, `sticker`, `cutpaper`, `pixel-icon`, `line-icon`, `glow`, `wash`.

**States.** Made for agents: a face you can tell apart in a crowded sidebar, and a status you read from the face itself. Each state changes the expression (mouth and brows, painted in the look's own hand), how the head moves, and adds a hand-drawn mark that still reads at 32px:

| state | mark | face |
| --- | --- | --- |
| `thinking` | thought bubbles | eyes up and away, one brow raised, head tilted |
| `working` | typing bubble | eyes down reading, brows set, a steady nod |
| `waiting` | `?` | brows up, a hopeful smile, looking at you |
| `blocked` | red `!` | knitted brows, a frown, slumped, shaking now and then |
| `done` | sparkles | a big smile, a pleased squint, a little hop |

## Your own canvas

```ts
import { mount } from 'fuglios';

const face = mount(canvas, { name: 'agent-47', look: 'gouache', state: 'working' });
face.update({ state: 'done' });
face.destroy();
```

Faces paint once they come near the screen, at their displayed size × devicePixelRatio, and animate only while visible. Every face on a page shares one animation loop.

## Images, on a server

The fuglios site serves these at `/api/face`, so you can link to an image without running anything. To host your own:

```bash
npm i fuglios @napi-rs/canvas
```

```ts
// app/api/face/route.ts (Next.js)
import { faceRoute } from 'fuglios/server';
export const { GET } = faceRoute();

// anything that speaks fetch: Hono, Bun.serve, Deno.serve, Remix
import { createFaceHandler } from 'fuglios/server';
Bun.serve({ fetch: createFaceHandler() });
```

```
/api/face?name=agent-47&look=ink&size=128&shape=circle&format=png
/api/face?name=agent-47&state=thinking&format=gif
```

Query: `name` (required), `look`, `size` (16–1024), `shape` (outside is transparent), `state`, `format` (`png`, `webp`, `jpeg`, `svg`, `gif`), and for GIFs `loop` (seconds) and `fps`. Responses are cached for a year: the same request always gives the same image.

GIFs loop seamlessly with a scripted pose, so the same name always loops the same way. Watercolour SVG is real vector paths; it's large, so prefer PNG or WebP at avatar sizes.

Or directly:

```ts
import { renderImage, faceGIF } from 'fuglios/server';
const { body, type } = await renderImage('agent-47', { look: 'sticker', size: 256, format: 'webp' });
```

## CLI

```bash
npx fuglios agent-47 --look ink --size 128 --shape circle -o agent.png
npx fuglios agent-47 --state thinking -f gif
```

## Publishing

Publish with pnpm (`pnpm publish`), which swaps the workspace's source `exports` for the built ones in `publishConfig`. `prepublishOnly` builds and runs the tests first.

## API

| | |
| --- | --- |
| `mount(canvas, options)` | brings a face to life on your canvas; returns `update`, `poke`, `destroy` |
| `faceCanvas(name, options)` | one finished picture, in any look, state and shape |
| `faceSVG(name, options)` | SVG markup |
| `faceColors(name)` | the palette a face is painted in, to theme what sits around it |
| `seedOf(name)` | the number behind a name |
| `LOOKS`, `STATES`, `SHAPES` | everything there is to choose from |
| `setCanvasFactory(f)` | draw on canvases from anywhere (the server entry does this for you) |

MIT
