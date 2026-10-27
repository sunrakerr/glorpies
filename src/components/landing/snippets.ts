import type { FaceState, LookChoice, Shape } from 'glorpies';
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

/** Only what differs from the defaults is written out. */
function props(c: Choice, jsx: boolean) {
  const out = [jsx ? jsxName(c.name) : htmlName(c.name), jsx ? `size={${c.size}}` : `size="${c.size}"`];
  if (c.look !== 'auto') out.push(`look=${q(c.look)}`);
  if (c.shape !== 'circle' && c.background) out.push(`shape=${q(c.shape)}`);
  if (c.state !== 'idle') out.push(`state=${q(c.state)}`);
  if (!c.background) out.push(jsx ? 'background={false}' : 'background="false"');
  if (!c.alive) out.push(jsx ? 'alive={false}' : 'alive="false"');
  return out.join(' ');
}

/** The image's address on your own route (see the server snippet). */
function query(c: Choice, format?: string) {
  const p = new URLSearchParams({ name: c.name, size: String(c.size * 2) });
  if (c.look !== 'auto') p.set('look', c.look);
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
    c.look !== 'auto' && `--look ${c.look}`, '--size 256', c.background ? `--shape ${c.shape}` : '--background false',
    c.state !== 'idle' && `--state ${c.state}`, '-o face.png',
  ].filter(Boolean);
  return `npx -p glorpies -p @napi-rs/canvas glorpies ${flags.join(' ')} ${c.name.startsWith('-') ? '-- ' : ''}${shellWord(c.name || 'face')}`;
}

export const SNIPPETS = {
  react: (c: Choice) => `import { Glorpie } from "glorpies/react";

<Glorpie ${props(c, true)} />`,
  html: (c: Choice) => `<script type="module" src="https://unpkg.com/glorpies"></script>

<glorpie-face ${props(c, false)}></glorpie-face>`,
  server: () => `// faces as images, from your own app: app/api/face/route.ts (Next.js)
import { faceRoute } from "glorpies/server";
export const { GET } = faceRoute();

// or anything that speaks fetch: Bun, Deno, Hono
import { createFaceHandler } from "glorpies/server";
Bun.serve({ fetch: createFaceHandler() });`,
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
  html: { file: 'index.html', lang: 'html' },
  server: { file: 'route.ts', lang: 'ts' },
  url: { file: 'index.html', lang: 'html' },
  cli: { file: 'zsh', lang: 'sh' },
};

/** The props reference: what each is for, what it takes, and what you get without it. */
export const PROPS: { prop: string; type: string; fallback: string; note: string }[] = [
  { prop: 'name', type: 'string | number', fallback: 'required', note: 'any id: a username, email, bot id or a seed. same name, same face.' },
  { prop: 'look', type: '"auto" | look id', fallback: '"auto"', note: 'auto paints watercolour at 72px and up, the ink badge below.' },
  { prop: 'size', type: 'number | css length', fallback: '48', note: 'pixels, or any css length like "100%". repaints sharp when it grows.' },
  { prop: 'shape', type: '"circle" | "squircle" | "rounded" | "square"', fallback: '"circle"', note: 'the crop. without a background there is nothing to crop.' },
  { prop: 'background', type: 'boolean', fallback: 'true', note: 'false keeps only the face: no backdrop, no pencil lines, no crop, transparent all around.' },
  { prop: 'state', type: '"idle" | "thinking" | "working" | "waiting" | "blocked" | "done"', fallback: '"idle"', note: 'for agents: changes the expression, the motion and a mark by the head.' },
  { prop: 'alive', type: 'boolean', fallback: 'true', note: 'breathing, blinking, glancing at the pointer. off when the reader prefers reduced motion.' },
  { prop: 'pokeable', type: 'boolean', fallback: 'false', note: 'a tap makes it wobble.' },
  { prop: 'label', type: 'string', fallback: '"Avatar"', note: 'accessible name.' },
  { prop: 'priority', type: 'number', fallback: '1', note: 'paints sooner when many faces are waiting, e.g. the one in your header.' },
];

/** Where each piece lives. */
export const ENTRIES: { path: string; what: string }[] = [
  { path: 'glorpies/react', what: '<Glorpie>, plus <Avatar>, <AvatarImage> and <AvatarFallback> for a photo with a face behind it' },
  { path: 'glorpies/element', what: '<glorpie-face>, a web component for html, vue, svelte, angular. the same attributes as the props' },
  { path: 'glorpies', what: 'mount(canvas, options) for your own canvas, faceSVG(), faceColors(), seedOf(), LOOKS, STATES' },
  { path: 'glorpies/server', what: 'faceRoute() for your own image route, createFaceHandler(), renderImage(): png, webp, jpeg, svg and gif' },
  { path: 'npx glorpies', what: 'the command line: any name to an image file' },
];
