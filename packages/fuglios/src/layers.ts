import { pixelsOf } from './alive';
import { makeCanvas } from './canvas';

/**
 * Splits a styled painting into a still background and a moving face, the way
 * the original watercolour is built. The style paints the same face twice,
 * once whole and once bare (`bareFace`); wherever the two differ is the face.
 *
 * The difference is taken on a coarse grid, grown a little, and closed: any
 * hole the background can't reach from the edge belongs to the face, so 1-bit
 * and dotted styles, whose faces share many pixels with their backgrounds,
 * still come out as one solid shape. The edge is feathered where the two
 * paintings already match, so the cut never shows while the face is at rest.
 */

/** Channel difference below which two pixels count as the same. */
const DIFF = 28;
/** At most this many grid cells per side. */
const GRID = 200;
/** Cells the face is grown by, so the feathered edge falls on matching pixels. */
const GROW = 2;
/**
 * Above this share of the picture, the style draws its background from the face
 * (a thermal glow, contour lines) and there's no clean background to keep still.
 */
const MAX_COVER = 0.8;

export type Layers = {
  /** The painting with everything but the face cut away, edges feathered. */
  figure: HTMLCanvasElement;
  /** The cut as alpha, at the painting's size, for trimming eye patches to match. */
  mask: HTMLCanvasElement;
  /** Share of the picture the face covers. */
  cover: number;
};

export function splitLayers(full: HTMLCanvasElement, back: HTMLCanvasElement): Layers | null {
  const w = full.width, h = full.height;
  const a = pixelsOf(full), b = pixelsOf(back);
  const step = Math.max(2, Math.ceil(Math.max(w, h) / GRID));
  const cols = Math.ceil(w / step), rows = Math.ceil(h / step);
  const cells = new Uint8Array(cols * rows);

  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / step) * cols;
    for (let x = 0; x < w; x++) {
      const c = row + Math.floor(x / step);
      if (cells[c]) continue;
      const i = (y * w + x) * 4;
      if (Math.abs(a[i]! - b[i]!) > DIFF || Math.abs(a[i + 1]! - b[i + 1]!) > DIFF || Math.abs(a[i + 2]! - b[i + 2]!) > DIFF) cells[c] = 1;
    }
  }

  const grown = grow(cells, cols, rows, GROW);
  const solid = closeHoles(grown, cols, rows);
  let on = 0;
  for (const v of solid) on += v;
  const cover = on / solid.length;
  if (!on || cover > MAX_COVER) return null;

  // a cell-wide box blur softens the edge before it is smoothed up to full size
  const small = makeCanvas(cols, rows);
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(cols, rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    let sum = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
      sum += solid[Y * cols + X]!;
      n++;
    }
    img.data[(y * cols + x) * 4 + 3] = Math.round((sum / n) * 255);
  }
  sg.putImageData(img, 0, 0);

  const mask = makeCanvas(w, h);
  const mg = mask.getContext('2d')!;
  mg.imageSmoothingEnabled = true;
  mg.imageSmoothingQuality = 'high';
  mg.drawImage(small, 0, 0, cols * step, rows * step);

  const figure = makeCanvas(w, h);
  const fg = figure.getContext('2d')!;
  fg.drawImage(full, 0, 0);
  fg.globalCompositeOperation = 'destination-in';
  fg.drawImage(mask, 0, 0);
  return { figure, mask, cover };
}

/** Square dilation by `r` cells, as two running passes. */
function grow(src: Uint8Array, cols: number, rows: number, r: number): Uint8Array {
  const pass = (from: Uint8Array, len: number, lines: number, at: (line: number, k: number) => number) => {
    const out = new Uint8Array(from.length);
    for (let l = 0; l < lines; l++) {
      let last = -Infinity;
      // forward: distance since the last set cell; backward: distance to the next
      for (let k = 0; k < len; k++) {
        if (from[at(l, k)]) last = k;
        if (k - last <= r) out[at(l, k)] = 1;
      }
      let next = Infinity;
      for (let k = len - 1; k >= 0; k--) {
        if (from[at(l, k)]) next = k;
        if (next - k <= r) out[at(l, k)] = 1;
      }
    }
    return out;
  };
  const across = pass(src, cols, rows, (y, x) => y * cols + x);
  return pass(across, rows, cols, (x, y) => y * cols + x);
}

/** Everything the background can't reach from the picture's edge joins the face. */
function closeHoles(src: Uint8Array, cols: number, rows: number): Uint8Array {
  const outside = new Uint8Array(src.length);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!src[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < cols; x++) { seed(x); seed((rows - 1) * cols + x); }
  for (let y = 0; y < rows; y++) { seed(y * cols); seed(y * cols + cols - 1); }
  while (stack.length) {
    const i = stack.pop()!, x = i % cols, y = (i - x) / cols;
    if (x > 0) seed(i - 1);
    if (x < cols - 1) seed(i + 1);
    if (y > 0) seed(i - cols);
    if (y < rows - 1) seed(i + cols);
  }
  const out = new Uint8Array(src.length);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}
