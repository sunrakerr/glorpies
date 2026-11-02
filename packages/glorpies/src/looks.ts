import { makeCanvas } from './canvas';
import type { Engine } from './engine';
import { bareFace } from './face/bare';
import { renderStill } from './face/render';
import type { Face } from './face/types';
import { PAINTS, renderPaint } from './paints';
import { markFrame, type MarkFrame } from './marks';
import { avatarMap, renderSmall, SMALL_STYLES, type SmallId } from './small';
import { renderStyle, STYLES, type StyleId } from './styles';

/** The paintings, in the order they're listed; the avatar looks follow, in theirs. */
const FULL = [
  'watercolour',
  'atkinson',
  'bayer',
  'plotter',
  'cutout',
  'neon',
  'gouache',
  'oil',
  'sumi',
  'charcoal',
  'pointillism',
  'linocut',
  'warhol',
  'stencil',
  'stained',
  'mosaic',
  'felt',
  'lowpoly',
  'topo',
  'thermal',
  'holo',
] as const;

/** Looks of hard pixels or edges, whose dots crawl if turned or scaled by a fraction of a pixel, so they move in whole pixels. */
const CRISP = new Set<string>([
  'atkinson',
  'bayer',
  'linocut',
  'warhol',
  'stencil',
  'stained',
  'mosaic',
  'lowpoly',
  'topo',
  'thermal',
  'holo',
  'pixel-icon',
]);

/** Looks of flat colour, where a half-faded eye would show two pupils at once, so eyes switch pose outright. */
const FLAT = new Set<string>(['cutout', 'blob', 'ink', 'sticker', 'cutpaper', 'line-icon', 'glow']);

const DARK = new Set<string>(['neon', 'thermal', 'glow']);

export type LookId = (typeof FULL)[number] | SmallId;

export type Look = Readonly<{
  id: LookId;
  name: string;
  note: string;
  /** Full looks are for faces shown large; small ones still read at 16px. */
  size: 'full' | 'small';
  /** `snap` moves in whole pixels with no turn or squash; `sway` breathes freely. */
  motion: 'sway' | 'snap';
  /** `snap` switches eye poses outright; `blend` crossfades them, which suits soft paint. */
  eyes: 'blend' | 'snap';
  /** Faces laid out in a grid of this many per side (Warhol's four), each moving on its own. */
  tiles: number;
  /** Painted on a dark ground, so marks drawn beside the face are drawn in light ink. */
  dark: boolean;
}>;

export const DEFAULT_LOOK: LookId = 'watercolour';

const PAINTINGS = [...STYLES, ...PAINTS];

const describe = (id: LookId, size: Look['size']): Look => {
  const entry = (size === 'full' ? PAINTINGS : SMALL_STYLES).find((s) => s.id === id);
  if (!entry) throw new Error(`glorpies: no renderer for the look "${id}"`);
  const crisp = CRISP.has(id);
  return Object.freeze({
    id,
    name: entry.name,
    note: entry.note,
    size,
    motion: crisp ? 'snap' : 'sway',
    eyes: crisp || FLAT.has(id) ? 'snap' : 'blend',
    tiles: id === 'warhol' ? 2 : 1,
    dark: DARK.has(id),
  });
};

export const LOOKS: readonly Look[] = Object.freeze([
  ...FULL.map((id) => describe(id, 'full')),
  ...SMALL_STYLES.map((s) => describe(s.id, 'small')),
]);

const BY_ID = new Map(LOOKS.map((l) => [l.id, l]));

export const FULL_LOOKS: readonly Look[] = Object.freeze(LOOKS.filter((l) => l.size === 'full'));
export const SMALL_LOOKS: readonly Look[] = Object.freeze(LOOKS.filter((l) => l.size === 'small'));

export const isLook = (id: unknown): id is LookId =>
  typeof id === 'string' && BY_ID.has(id as LookId);

export const lookOf = (id: LookId): Look => BY_ID.get(id)!;

/** `auto` paints the original watercolour when there's room for it and the ink badge at avatar sizes. */
export type LookChoice = LookId | 'auto';

/** Below this many CSS pixels, `auto` switches to a small style. */
export const SMALL_BELOW = 72;

export function resolveLook(look: LookChoice | undefined, cssSize: number): LookId {
  if (look && look !== 'auto' && isLook(look)) return look;
  return cssSize > 0 && cssSize < SMALL_BELOW ? 'ink' : DEFAULT_LOOK;
}

/** The smallest size a painting is painted at; smaller ones are reduced from this. */
const MIN_PAINT = 200;

const isStyle = (id: string): id is StyleId => STYLES.some((s) => s.id === id);
const isSmall = (id: string): id is SmallId => SMALL_STYLES.some((s) => s.id === id);

/** One face in one look, as a finished still. `bare` paints only what the look puts behind the face. */
export function renderLook(
  id: LookId,
  face: Face,
  E: Engine,
  px: number,
  bare = false,
): HTMLCanvasElement {
  if (isSmall(id)) return renderSmall(id, face, E, px, bare);
  // a painting's strokes, dots and leading are sized in pixels, so below this it would be a different picture,
  // not a smaller one; it's painted at this size and reduced instead
  if (px < MIN_PAINT) {
    const big = renderLook(id, face, E, MIN_PAINT, bare);
    const c = makeCanvas(px);
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(big, 0, 0, px, px);
    return c;
  }
  const f = bare ? bareFace(face) : face;
  if (id === 'watercolour') return renderStill(f, E, px);
  if (isStyle(id)) return renderStyle(id, f, E, px);
  const c = renderPaint(id, f, E, px);
  if (!c) throw new Error(`no renderer for ${id}`);
  return c;
}

/** Where a look puts the head, for drawing a state's marks beside it; null for looks with several faces (Warhol). */
export function marksFor(id: LookId, face: Face, px: number): MarkFrame | null {
  const l = lookOf(id);
  if (l.tiles > 1) return null;
  return markFrame(face, px, l.size === 'small' ? avatarMap(face, px) : null, l.dark);
}
