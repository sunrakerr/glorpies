import { makeCanvas } from './canvas';
import type { Engine } from './engine';
import { bareFace } from './face/bare';
import { renderStill } from './face/render';
import type { Face } from './face/types';
import { PAINTS, renderPaint } from './paints';
import { markFrame, type MarkFrame } from './marks';
import { avatarMap, renderSmall, SMALL_APPROVED, SMALL_STYLES, type SmallId } from './small';
import { renderStyle, STYLES, type StyleId } from './styles';

/**
 * Every style a face can be shown in: the 21 full styles approved in the lab,
 * then the 8 small ones meant for avatars. Names and notes come from the lab
 * registries so the two never drift apart.
 */
const FULL = [
  'watercolour', 'atkinson', 'bayer', 'plotter', 'cutout', 'neon',
  'gouache', 'oil', 'sumi', 'charcoal', 'pointillism',
  'linocut', 'warhol', 'stencil',
  'stained', 'mosaic', 'felt',
  'lowpoly', 'topo', 'thermal', 'holo',
] as const;

/**
 * Styles built from hard pixels or hard edges. Turning or scaling them by a
 * fraction of a pixel makes their dots and edges crawl, so they move only in
 * whole-pixel steps.
 */
const CRISP = new Set<string>(['atkinson', 'bayer', 'linocut', 'warhol', 'stencil', 'stained', 'mosaic', 'lowpoly', 'topo', 'thermal', 'holo', 'pixel-icon']);

/**
 * Styles of flat colour and clean outlines. A half-faded eye there shows two
 * pupils and a grey lid at once, so their eyes switch pose outright, like a
 * cartoon's, instead of crossfading. Crisp styles do the same.
 */
const FLAT = new Set<string>(['cutout', 'blob', 'ink', 'sticker', 'cutpaper', 'line-icon', 'glow']);

const DARK = new Set<string>(['neon', 'thermal', 'glow']);

export type LookId = (typeof FULL)[number] | (typeof SMALL_APPROVED)[number];

export type Look = {
  id: LookId;
  name: string;
  note: string;
  /** Full styles are for faces shown large; small ones still read at 16px. */
  size: 'full' | 'small';
  /** `snap` moves in whole pixels with no turn or squash; `sway` breathes freely. */
  motion: 'sway' | 'snap';
  /** `snap` switches eye poses outright; `blend` crossfades them, which suits soft paint. */
  eyes: 'blend' | 'snap';
  /** Faces laid out in a grid of this many per side (Warhol's four), each moving on its own. */
  tiles: number;
  /** Painted on a dark ground, so marks drawn beside the face are drawn in light ink. */
  dark: boolean;
};

export const DEFAULT_LOOK: LookId = 'watercolour';

const CATALOGUE = [...STYLES, ...PAINTS.flatMap((g) => g.items)];

export const LOOKS: Look[] = [
  ...FULL.map((id): Look => {
    const entry = CATALOGUE.find((s) => s.id === id);
    if (!entry) throw new Error(`approved style ${id} is missing from the lab`);
    return { id, name: entry.name, note: entry.note, size: 'full', motion: CRISP.has(id) ? 'snap' : 'sway', eyes: CRISP.has(id) || FLAT.has(id) ? 'snap' : 'blend', tiles: id === 'warhol' ? 2 : 1, dark: DARK.has(id) };
  }),
  ...SMALL_APPROVED.map((id): Look => {
    const entry = SMALL_STYLES.find((s) => s.id === id)!;
    return { id, name: entry.name, note: entry.note, size: 'small', motion: CRISP.has(id) ? 'snap' : 'sway', eyes: CRISP.has(id) || FLAT.has(id) ? 'snap' : 'blend', tiles: 1, dark: DARK.has(id) };
  }),
];

const BY_ID = new Map(LOOKS.map((l) => [l.id, l]));

export const FULL_LOOKS = LOOKS.filter((l) => l.size === 'full');
export const SMALL_LOOKS = LOOKS.filter((l) => l.size === 'small');

export const isLook = (id: unknown): id is LookId => typeof id === 'string' && BY_ID.has(id as LookId);

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
const isSmall = (id: string): id is SmallId => (SMALL_APPROVED as readonly string[]).includes(id);

/**
 * One face in one style, as a finished still. Every style reseeds itself, so
 * this is deterministic. `bare` paints only the background the style puts
 * behind the face.
 */
export function renderLook(id: LookId, face: Face, E: Engine, px: number, bare = false): HTMLCanvasElement {
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
