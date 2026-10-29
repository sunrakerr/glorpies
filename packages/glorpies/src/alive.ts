import { makeCanvas } from './canvas';
import type { EyePatch } from './face/render';
import type { Face } from './face/types';
import type { Pt } from './geometry';

/**
 * A styled face is a single picture, so its eyes can't be moved after the
 * fact. Instead the style is painted again with the eyes in a few other poses,
 * and only the parts of the picture that changed are kept. The animator then
 * lays the patch for the nearest pose over the resting picture each frame.
 */

/** `look: null` keeps the face's resting gaze; `blink` scales how open the eyes are. */
export type EyePose = { look: Pt | null; blink: number };

/** In painting order: a blink first, since it reads as alive soonest, then glances, then the in-betweens. */
export const EYE_POSES: readonly EyePose[] = [
  { look: null, blink: 0 },
  { look: { x: -0.9, y: 0 }, blink: 1 },
  { look: { x: 0.9, y: 0 }, blink: 1 },
  { look: null, blink: 0.45 },
  { look: { x: 0, y: -0.8 }, blink: 1 },
  { look: { x: 0, y: 0.8 }, blink: 1 },
];

/** The same face with its eyes posed; every renderer reads gaze and openness from these fields. */
export function posed(face: Face, pose: EyePose): Face {
  return {
    ...face,
    gaze: pose.look ?? face.gaze,
    eyes: face.eyes.map((e) => ({ ...e, restOpen: e.restOpen * pose.blink })),
  };
}

/** Channel difference below which a pixel counts as unchanged. */
const THRESHOLD = 24;
/** Pixels of surrounding picture copied around each run in the atlas. */
const GUTTER = 1;

export function pixelsOf(c: HTMLCanvasElement): Uint8ClampedArray {
  return c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
}

/**
 * Compares a posed painting with the resting one tile by tile and keeps only
 * the tiles that differ, joined into horizontal runs and packed into a small
 * atlas. Pixels outside the runs are identical to the resting picture, so the
 * runs can be drawn straight over it without seams. Returns null when the pose
 * changes nothing (a style whose eyes don't move).
 */
export function eyePatch(rest: Uint8ClampedArray, posedStill: HTMLCanvasElement, face: Face, pose: EyePose, mask: HTMLCanvasElement | null = null): EyePatch | null {
  const w = posedStill.width, h = posedStill.height;
  const data = pixelsOf(posedStill);
  const tile = Math.max(8, Math.round(w / 40));
  const cols = Math.ceil(w / tile), rows = Math.ceil(h / tile);

  const spans: { x: number; y: number; w: number; h: number }[] = [];
  for (let ty = 0; ty < rows; ty++) {
    const y = ty * tile, th = Math.min(tile, h - y);
    let from = -1;
    for (let tx = 0; tx <= cols; tx++) {
      const x = tx * tile;
      const differs = tx < cols && tileDiffers(rest, data, w, x, y, Math.min(tile, w - x), th);
      if (differs && from < 0) from = x;
      if (!differs && from >= 0) {
        spans.push({ x: from, y, w: Math.min(w, x) - from, h: th });
        from = -1;
      }
    }
  }
  if (!spans.length) return null;

  // each run is copied with a pixel of its surroundings, so scaling never blends in the atlas's empty space
  const atlas = makeCanvas(Math.max(...spans.map((r) => r.w)) + 2 * GUTTER, spans.reduce((sum, r) => sum + r.h + 2 * GUTTER, 0));
  const g = atlas.getContext('2d')!;
  // a face cut from its background gets its patches cut the same way, so they never paste background along
  const trim = mask ? makeCanvas(atlas.width, atlas.height) : null;
  const tg = trim?.getContext('2d');
  let top = 0;
  const runs = spans.map((r) => {
    const x0 = Math.max(0, r.x - GUTTER), y0 = Math.max(0, r.y - GUTTER);
    const x1 = Math.min(w, r.x + r.w + GUTTER), y1 = Math.min(h, r.y + r.h + GUTTER);
    const dx = GUTTER - (r.x - x0), dy = top + GUTTER - (r.y - y0);
    g.drawImage(posedStill, x0, y0, x1 - x0, y1 - y0, dx, dy, x1 - x0, y1 - y0);
    if (mask && tg) tg.drawImage(mask, x0, y0, x1 - x0, y1 - y0, dx, dy, x1 - x0, y1 - y0);
    const run = { sx: GUTTER, sy: top + GUTTER, x: r.x, y: r.y, w: r.w, h: r.h };
    top += r.h + 2 * GUTTER;
    return run;
  });
  if (trim) {
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(trim, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }
  return { look: pose.look ?? face.gaze, blink: pose.blink, atlas, runs };
}


function tileDiffers(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, x: number, y: number, tw: number, th: number): boolean {
  for (let j = y; j < y + th; j++) {
    for (let i = (j * w + x) * 4, end = i + tw * 4; i < end; i++) {
      if (Math.abs(a[i]! - b[i]!) > THRESHOLD) return true;
    }
  }
  return false;
}
