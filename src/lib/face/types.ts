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

export type Face = {
  seed: number;
  pal: Palette;
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
