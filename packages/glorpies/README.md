<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/banner-dark.webp">
  <img alt="glorpies: all hail the glorpies. a row of hand-painted alien faces" src="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/banner-light.webp" width="100%">
</picture>

<p align="center">
  <a href="https://glorpies.vercel.app"><b>./site</b></a> &nbsp;·&nbsp;
  <a href="https://glorpies.vercel.app/gallery">./gallery</a> &nbsp;·&nbsp;
  <a href="https://glorpies.vercel.app/docs">./docs</a> &nbsp;·&nbsp;
  <a href="https://glorpies.vercel.app/how">./how</a> &nbsp;·&nbsp;
  <a href="https://github.com/sunrakerr/glorpies">./source</a>
</p>

# glorpies

Ugly little alien faces from any string. Antennae, extra eyes, horns, halos and too many teeth, painted in watercolour and dip pen. 9,007,199,254,740,992 of them (about 9 quadrillion), the same one for the same name every time, and alive: they breathe, blink and glance at you.

The same name is always the same face, on every device and every server. No API calls, no storage, zero dependencies.

```bash
npm i glorpies
```

## Anywhere: one tag

```html
<script type="module" src="https://unpkg.com/glorpies"></script>

<glorpie-face name="ada@lovelace.dev" size="48"></glorpie-face>
```

Works in plain HTML and in any framework (Vue, Svelte, Angular, Astro…). With a bundler, `import 'glorpies/element'` registers the tag.

## React

```tsx
import { Glorpie, Avatar, AvatarImage, AvatarFallback } from 'glorpies/react';

<Glorpie name="agent-47" size={40} state="thinking" />

// a photo that falls back to a face while it loads, or if it fails
<Avatar size={40}>
  <AvatarImage src={user.photo} alt={user.name} />
  <AvatarFallback name={user.email} />
</Avatar>
```

It renders on the server as a soft placeholder in the face's own background colour, then paints on the client.

## Vue, Svelte, Solid and Preact

The same `<Glorpie>`, with the same props, for each:

```vue
<script setup>
import { Glorpie } from 'glorpies/vue';
</script>

<template>
  <Glorpie :name="user.email" :size="40" state="thinking" />
</template>
```

```svelte
<script>
  import { Glorpie } from 'glorpies/svelte';
</script>

<Glorpie name={user.email} size={40} state="thinking" />
```

```tsx
import { Glorpie } from 'glorpies/solid'; // or 'glorpies/preact'

<Glorpie name={user.email} size={40} state="thinking" />
```

Each renders a placeholder on the server (Nuxt, SvelteKit, SolidStart) and paints in the browser. Svelte also gets a `use:glorpie` action for a canvas of your own. Angular, Astro and anything else that renders HTML use `<glorpie-face>`.

## Props and attributes

| | type | default | |
| --- | --- | --- | --- |
| `name` | `string \| number` | required | Any string. The same name is always the same face. |
| `look` | look id \| `"auto"` | `"auto"` | `auto` paints watercolour, or the ink badge below 72px. |
| `size` | `number \| string` | `48` | Pixels, or any CSS length. |
| `shape` | `circle` `squircle` `rounded` `square` | `circle` | The crop. None without a background. |
| `background` | `boolean` | `true` | `false` keeps only the face: no backdrop, no pencil lines, no crop, transparent all around. |
| `state` | `idle` `thinking` `working` `waiting` `blocked` `done` | `idle` | What the face shows besides who it is. |
| `alive` | `boolean` | `true` | Breathing, blinking, glancing. Off by default for readers who prefer reduced motion. |
| `pokeable` | `boolean` | `false` | A tap makes the face wobble. |
| `label` | `string` | `"Avatar"` | Accessible name (`role="img"`). |

**Looks.** Paintings, for faces shown large: `watercolour`, `atkinson`, `bayer`, `plotter`, `cutout`, `neon`, `gouache`, `oil`, `sumi`, `charcoal`, `pointillism`, `linocut`, `warhol`, `stencil`, `stained`, `mosaic`, `felt`, `lowpoly`, `topo`, `thermal`, `holo`. Avatars, which still read at 16px: `blob`, `ink`, `sticker`, `cutpaper`, `pixel-icon`, `line-icon`, `glow`, `wash`.

**Without a background.** Every look is painted twice, whole and bare, and kept only where the two differ, so `background={false}` works the same in every look: the face, its crown and tentacles, and the sparkles of a celestial one, on nothing. A few looks draw their background from the face itself (`mosaic`, `topo`, `thermal`, `holo`) and keep some of it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/looks-dark.webp">
  <img alt="the same glorpie in 24 of its looks" src="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/looks-light.webp" width="100%">
</picture>

**States.** Made for agents: a face you can tell apart in a crowded sidebar, and a status you read from the face itself. Each state changes the expression (mouth and brows, painted in the look's own hand), how the head moves, and adds a hand-drawn mark that still reads at 32px:

| state | mark | face |
| --- | --- | --- |
| `thinking` | thought bubbles | eyes up and away, one brow raised, head tilted |
| `working` | typing bubble | eyes down reading, brows set, a steady nod |
| `waiting` | `?` | brows up, a hopeful smile, looking at you |
| `blocked` | red `!` | knitted brows, a frown, slumped, shaking now and then |
| `done` | sparkles | a big smile, a pleased squint, a little hop |

<p><img src="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/state-idle.gif" width="80" alt="idle"> <img src="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/state-thinking.gif" width="80" alt="thinking"> <img src="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/state-working.gif" width="80" alt="working"> <img src="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/state-waiting.gif" width="80" alt="waiting"> <img src="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/state-blocked.gif" width="80" alt="blocked"> <img src="https://raw.githubusercontent.com/sunrakerr/glorpies/main/.github/assets/state-done.gif" width="80" alt="done"></p>

## Your own canvas

```ts
import { mount } from 'glorpies';

const face = mount(canvas, { name: 'agent-47', look: 'gouache', state: 'working' });
face.update({ state: 'done' });
face.destroy();
```

Faces paint once they come near the screen, at their displayed size × devicePixelRatio, and animate only while visible. Every face on a page shares one animation loop.

## Images, on a server

Faces as image files, from a route in your own app:

```bash
npm i glorpies @napi-rs/canvas
```

```ts
// app/api/face/route.ts (Next.js)
import { faceRoute } from 'glorpies/server';
export const { GET } = faceRoute();

// anything that speaks fetch: SvelteKit, Nuxt, Astro, Hono, Bun, Deno
import { createFaceHandler } from 'glorpies/server';
Bun.serve({ fetch: createFaceHandler() });

// Express, or node:http
import { nodeFaceHandler } from 'glorpies/server';
app.get('/api/face', nodeFaceHandler());
```

```
/api/face?name=agent-47&look=ink&size=128&shape=circle&format=png
/api/face?name=agent-47&state=thinking&format=gif
```

Query: `name` (required), `look`, `size` (16–1024), `shape` (outside is transparent), `state`, `background` (`false` for only the face), `format` (`png`, `webp`, `jpeg`, `svg`, `gif`), and for GIFs `loop` (seconds) and `fps`. Responses are cached for a year: the same request always gives the same image.

GIFs loop seamlessly with a scripted pose, so the same name always loops the same way. Watercolour SVG is real vector paths; it's large, so prefer PNG or WebP at avatar sizes.

To try the urls before you've set anything up, [glorpies.vercel.app](https://glorpies.vercel.app) answers them too, at `https://glorpies.vercel.app/api/face?name=you`. It's a demo, not a CDN for your app: host the route for anything real.

Or directly:

```ts
import { renderImage, faceGIF } from 'glorpies/server';
const { body, type } = await renderImage('agent-47', { look: 'sticker', size: 256, format: 'webp' });
const gif = await faceGIF('agent-47', { state: 'done', size: 128 });
```

## CLI

The CLI paints with `@napi-rs/canvas`, so ask npx for both:

```bash
npx -p glorpies -p @napi-rs/canvas glorpies agent-47 --look ink --size 128 --shape circle -o agent.png
npx -p glorpies -p @napi-rs/canvas glorpies agent-47 --state thinking -f gif
```

Installed in a project (`npm i glorpies @napi-rs/canvas`), it's just `npx glorpies agent-47`.

## API

| | |
| --- | --- |
| `mount(canvas, options)` | brings a face to life on your canvas; returns `update`, `poke`, `destroy` |
| `faceCanvas(name, options)` | one finished picture, in any look, state and shape |
| `faceSVG(name, options)` | SVG markup |
| `faceColors(name)` | the palette a face is painted in, to theme what sits around it |
| `seedOf(name)` | the number behind a name, below `FACES` (2^53: there are 9,007,199,254,740,992 faces) |
| `randomName()` | a made-up name for a face nobody has named yet, like `soggy-glorp` |
| `LOOKS`, `STATES`, `SHAPES` | everything there is to choose from |
| `setCanvasFactory(f)` | draw on canvases from anywhere (the server entry does this for you) |

The full guide, with every framework, is at [glorpies.vercel.app/docs](https://glorpies.vercel.app/docs).

## Credits

Made by [sunrakerr](https://github.com/sunrakerr). GIFs are encoded with [gifenc](https://github.com/mattdesl/gifenc) (MIT, bundled; see THIRD-PARTY-NOTICES.md).

MIT
