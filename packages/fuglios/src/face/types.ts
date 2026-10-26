import type { Pt } from '../geometry';
import type { Palette } from '../palettes';

/** Faces are authored on a fixed square canvas and scaled at render time. */
export const W = 480;

/** 'paper' resolves to the sheet colour on the backdrop and to white inside the multiplied figure layer. */
export type Color = string;

type Clipped = { clip?: Pt[]; exclude?: Pt[][] };

export type WashOp = Clipped & {
  k: 'wash';
  seed: number;
  pts: Pt[];
  col: Color;
  layers: number;
  alpha: number;
  v: number;
  shift: number;
  depth: number;
  grain: boolean;
  edge: boolean;
  edgeAlpha: number;
  bloom: number;
};

export type InkOp = Clipped & {
  k: 'ink';
  seed: number;
  pts: Pt[];
  col: Color;
  w: number;
  passes: number;
  jit: number;
  alpha: number;
  ghost: number;
  taper: boolean;
  dry: boolean;
  closed: boolean;
};

export type HatchOp = {
  k: 'hatch';
  seed: number;
  region: Pt[];
  exclude: Pt[][];
  col: Color;
  angle: number;
  gap: number;
  w: number;
  alpha: number;
};

export type SolidOp = Clipped & { k: 'solid'; pts: Pt[]; col: Color; alpha: number };

export type PaperOp = { k: 'paper'; seed: number };

export type Op = WashOp | InkOp | HatchOp | SolidOp | PaperOp;

export type EyeKind = 'round' | 'almond' | 'sleepy' | 'button' | 'spiral';

/** The parts of an eye that move: pupils look around, lids blink, spirals spin. */
export type EyeSpec = {
  kind: EyeKind;
  x: number;
  y: number;
  r: number;
  /** Area the pupil and lid are confined to. */
  clip: Pt[];
  /** Lid travel: at each sample x, the top and bottom of the eye opening. */
  lidX: number[];
  lidTop: number[];
  lidBottom: number[];
  restOpen: number;
  /** Per-eye offset added to the shared gaze, so some faces stay googly. */
  skew: Pt;
  iris: WashOp | null;
  pupil: Pt[];
  highlight: Pt[];
  spiral: InkOp | null;
  lidCol: string;
  lidW: number;
};

/** What grows out of the top of the head. Only spines and brain cover it; the rest are parts. */
export type HairKind = 'antennae' | 'horns' | 'spines' | 'brain' | 'frill' | 'halo' | 'crystals' | 'tentacles' | 'stalks' | 'bald';
export type MouthKind = 'smile' | 'frown' | 'wavy' | 'open' | 'grin' | 'o' | 'smirk';

/**
 * The same face as a handful of named shapes, recorded while it is built. The
 * display list is what the painting is made of; this is what the face is, for
 * styles that redraw it with far less detail (small avatars).
 */
export type Sketch = {
  head: Pt[];
  centre: Pt;
  rx: number;
  ry: number;
  /** Which side the light comes from: 1 is the right. */
  light: 1 | -1;
  hair: { kind: HairKind; col: Color; cover: Pt[] | null; back: Pt[] | null };
  /** A beanie's crown band and pompom, drawn over the cover. */
  hat: { bandY: number; pompom: Pt[] } | null;
  /** Stalks (and a leaf) on a bald or sprouting head. */
  sprouts: Pt[][];
  leaf: Pt[] | null;
  ears: { x: number; y: number; rx: number; ry: number }[];
  brows: Pt[][];
  nose: Pt[];
  /** The mouth's pen line (or its outline, for open mouths), and its centre and half-width. */
  mouth: { kind: MouthKind; line: Pt[]; shape: Pt[] | null; x: number; y: number; w: number };
  blush: Pt[][];
  glasses: Pt[][] | null;
  /**
   * Everything alien that isn't head or hair, as filled outlines: antennae,
   * horns, fins, tentacles, halos, gems, spots. `front` parts sit over the
   * head; the rest are behind it. `loose` parts (a nimbus) are left out
   * when a small avatar frames the face.
   */
  parts: { pts: Pt[]; col: Color; front: boolean; loose?: boolean }[];
  /** Which of the figure's ops draw the mouth and each brow, as [from, to) index ranges, so an expression can reshape them. */
  ops: { mouth: [number, number]; brows: [number, number][] };
};

export type Face = {
  seed: number;
  pal: Palette;
  sketch: Sketch;
  /** Paper, pencil underdrawing, background glazes, stray drops. Never moves. */
  back: Op[];
  /** Everything that breathes and sways; composited over the backdrop with multiply. */
  figure: Op[];
  eyes: EyeSpec[];
  /** Neck point the head sways around. */
  pivot: Pt;
  /** The resting gaze, as a fraction of how far pupils can travel. */
  gaze: Pt;
  temper: { breathe: number; sway: number; blinkEvery: number; phase: number };
};
