import { clamp, type Pt } from '../geometry';
import type { EyeSpec } from './types';

export type EyeState = {
  /** Pupil offset from rest. */
  dx: number;
  dy: number;
  /** Skin-coloured lid covering the eye from the top, or null when fully open. */
  lid: Pt[] | null;
  /** Inked lid edge with its pen widths, or null when the eye is open. */
  line: { pts: Pt[]; widths: number[] } | null;
  /** How much of the opening shows, from 0 (shut) to 1. */
  open: number;
};

/**
 * `look` is the shared gaze in [-1, 1]; `blink` multiplies the eye's resting
 * openness (1 = as painted, 0 = shut). Closing interpolates the lid edge from
 * the top of the opening to the bottom, so a shut eye reads as a soft "‿".
 */
export function eyeState(spec: EyeSpec, look: Pt, blink: number): EyeState {
  const lx = clamp(look.x + spec.skew.x, -1, 1),
    ly = clamp(look.y + spec.skew.y, -1, 1);
  const button = spec.kind === 'button';
  const dx = lx * spec.r * (button ? 0.12 : 0.38);
  const dy = ly * spec.r * (button ? 0.1 : 0.28);
  const c = 1 - clamp(spec.restOpen * blink, 0, 1);
  if (c < 0.01) return { dx, dy, lid: null, line: null, open: 1 };
  const edge = spec.lidX.map((x, i) => {
    const top = spec.lidTop[i]!,
      bottom = spec.lidBottom[i]!;
    return { x, y: top + c * (bottom - top) };
  });
  const ceiling = Math.min(...spec.lidTop) - spec.r;
  const first = edge[0]!,
    last = edge[edge.length - 1]!;
  const lid = [
    { x: first.x - 3, y: ceiling },
    { x: last.x + 3, y: ceiling },
    { x: last.x + 3, y: last.y },
    ...edge.slice().reverse(),
    { x: first.x - 3, y: first.y },
  ];
  const fade = Math.min(1, c * 4);
  const widths = edge.map(
    (_, i) => spec.lidW * fade * Math.max(0.2, Math.sin((i / (edge.length - 1)) * Math.PI)),
  );
  return { dx, dy, lid, line: { pts: edge, widths }, open: 1 - c };
}
