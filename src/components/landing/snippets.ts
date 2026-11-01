import { resolveLook, type FaceState, type LookChoice, type Shape } from 'glorpies';
import type { Lang } from '@/lib/highlight';

/** What a face is set to; every snippet is written from it. */
export type Choice = { name: string; look: LookChoice; shape: Shape; state: FaceState; background: boolean; alive: boolean; size: number };

/** The playground's name is made up on arrival; see Landing. */
export const START: Choice = { name: '', look: 'auto', shape: 'square', state: 'idle', background: true, alive: true, size: 48 };

const q = (s: string) => JSON.stringify(s);

/** A name as a JSX prop: a plain string when it can be one, else a string expression (JSX strings have no escapes). */
const jsxName = (name: string) => (/^[^"\\{}<>&]*$/.test(name) ? `name="${name}"` : `name={${q(name)}}`);

/** A name as an HTML attribute. */
const htmlName = (name: string) => `name="${name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`;

/** A word for a shell, quoted unless it's plainly safe. */
const shellWord = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** How each kind of template writes a name, and a number or boolean value. */
const SYNTAX = {
  jsx: { name: jsxName, value: (k: string, v: number | boolean) => `${k}={${v}}` },
  html: { name: htmlName, value: (k: string, v: number | boolean) => `${k}="${v}"` },
  vue: { name: htmlName, value: (k: string, v: number | boolean) => `:${k}="${v}"` },
  svelte: { name: jsxName, value: (k: string, v: number | boolean) => `${k}={${v}}` },
} as const;

/** Only what differs from the defaults is written out. */
function props(c: Choice, syntax: keyof typeof SYNTAX) {
  const { name, value } = SYNTAX[syntax];
  const out = [name(c.name), value('size', c.size)];
  if (c.look !== 'auto') out.push(`look=${q(c.look)}`);
  if (c.shape !== 'circle' && c.background) out.push(`shape=${q(c.shape)}`);
  if (c.state !== 'idle') out.push(`state=${q(c.state)}`);
  if (!c.background) out.push(value('background', false));
  if (!c.alive) out.push(value('alive', false));
  return out.join(' ');
}

/** The image's address on your own route (see the server snippet): twice the size for sharp screens, in the look shown at the size itself. */
function query(c: Choice, format?: string) {
  const p = new URLSearchParams({ name: c.name, size: String(c.size * 2), look: resolveLook(c.look, c.size) });
  if (c.background) p.set('shape', c.shape);
  else p.set('background', 'false');
  if (c.state !== 'idle') p.set('state', c.state);
  if (format) p.set('format', format);
  return `/api/face?${p}`;
}

/**
 * The CLI paints with @napi-rs/canvas, so npx fetches both. Flags come first
 * and the name last, after `--` when it looks like a flag itself.
 */
function cli(c: Choice) {
  const flags = [
    `--look ${resolveLook(c.look, c.size)}`, '--size 256', c.background ? `--shape ${c.shape}` : '--background false',
    c.state !== 'idle' && `--state ${c.state}`, '-o face.png',
  ].filter(Boolean);
  return `npx -p glorpies -p @napi-rs/canvas glorpies ${flags.join(' ')} ${c.name.startsWith('-') ? '-- ' : ''}${shellWord(c.name || 'face')}`;
}

export const SNIPPETS = {
  react: (c: Choice) => `import { Glorpie } from "glorpies/react";

<Glorpie ${props(c, 'jsx')} />`,
  vue: (c: Choice) => `<script setup>
import { Glorpie } from "glorpies/vue";
</script>

<template>
  <Glorpie ${props(c, 'vue')} />
</template>`,
  svelte: (c: Choice) => `<script>
  import { Glorpie } from "glorpies/svelte";
</script>

<Glorpie ${props(c, 'svelte')} />`,
  html: (c: Choice) => `<script type="module" src="https://unpkg.com/glorpies"></script>

<glorpie-face ${props(c, 'html')}></glorpie-face>`,
  server: () => `// faces as images, from your own app: app/api/face/route.ts (Next.js)
import { faceRoute } from "glorpies/server";
export const { GET } = faceRoute();

// SvelteKit, Nuxt, Astro, Hono, Bun, Deno: anything that speaks fetch
import { createFaceHandler } from "glorpies/server";
Bun.serve({ fetch: createFaceHandler() });

// Express, or node:http
import { nodeFaceHandler } from "glorpies/server";
app.get("/api/face", nodeFaceHandler());`,
  url: (c: Choice) => `<!-- from your route: png, or svg, webp, jpeg -->
<img src="${query(c)}" width="${c.size}" />

<!-- animated, for email, chat and READMEs -->
<img src="${query(c, 'gif')}" width="${c.size}" />`,
  cli,
} as const;

export type SnippetKind = keyof typeof SNIPPETS;
export const SNIPPET_KINDS = Object.keys(SNIPPETS) as SnippetKind[];

/** The file each snippet would live in, for the terminal's title bar, and how to colour it. */
export const SNIPPET_FILES: Record<SnippetKind, { file: string; lang: Lang }> = {
  react: { file: 'App.tsx', lang: 'tsx' },
  vue: { file: 'App.vue', lang: 'html' },
  svelte: { file: 'App.svelte', lang: 'html' },
  html: { file: 'index.html', lang: 'html' },
  server: { file: 'route.ts', lang: 'ts' },
  url: { file: 'index.html', lang: 'html' },
  cli: { file: 'zsh', lang: 'sh' },
};
