import { makeCanvas } from './canvas';
import type { Engine } from './engine';
import { addPath, bbox, TAU, type Pt } from './geometry';
import { eyeState } from './face/eyes';
import type { Face, InkOp } from './face/types';
import { W } from './face/types';
import { drawFlat } from './styles';

/** Raster helpers shared by the experimental styles. */

export type Ctx = CanvasRenderingContext2D;
export type RGB = [number, number, number];


export function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = makeCanvas(w, h);
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

export function faceSpace(px: number): [HTMLCanvasElement, Ctx] {
  const [c, g] = canvas(px);
  g.scale(px / W, px / W);
  return [c, g];
}

export function rng(seed: number) {
  let a = Math.imul((seed ^ (seed >>> 16)) >>> 0, 0x45d9f3b) >>> 0;
  a = (a ^ (a >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A random number in [0, 1) tied to a seed and a position rather than to how
 * many numbers were drawn before it, so a change in one spot of a picture
 * (an eye closing) leaves the randomness everywhere else alone.
 */
export function hash01(seed: number, i: number): number {
  let t = Math.imul((seed ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((i + 0x632be5ab) >>> 0, 0xc2b2ae35);
  t = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d);
  t = Math.imul(t ^ (t >>> 12), 0x297a2d39);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}

export const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
export const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
export const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const fract = (v: number) => v - Math.floor(v);

export function toHsl([r, g, b]: RGB): RGB {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl([h, s, l]: RGB): RGB {
  h = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** A raster we can sample: RGBA bytes plus width. */
export type Img = { w: number; d: Uint8ClampedArray };
export const imgOf = (c: HTMLCanvasElement): Img => ({ w: c.width, d: c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data });
export function at(im: Img, x: number, y: number): RGB {
  const xi = Math.min(im.w - 1, Math.max(0, Math.round(x))), yi = Math.min(im.w - 1, Math.max(0, Math.round(y)));
  const i = (yi * im.w + xi) * 4;
  return [im.d[i]!, im.d[i + 1]!, im.d[i + 2]!];
}

export function flat(face: Face, E: Engine, px: number, map?: (c: string) => string): HTMLCanvasElement {
  const [c, g] = faceSpace(px);
  drawFlat(g, face, E, { ink: 2.2, map });
  return c;
}

/** Where the pen lines are, as a 0/1 mask. */
export function inkMask(face: Face, E: Engine, px: number, width: number): Uint8Array {
  const [c, g] = faceSpace(px);
  drawFlat(g, face, E, { ink: width, inkCol: '#000000', eyes: false, fills: false });
  const d = imgOf(c).d;
  const m = new Uint8Array(px * px);
  for (let i = 0; i < px * px; i++) m[i] = d[i * 4 + 3]! > 110 ? 1 : 0;
  return m;
}

/** The figure (head, hair, ears, hat) without the backdrop, as 0/1. */
export function figureMask(face: Face, E: Engine, px: number): Float32Array {
  const [c, g] = faceSpace(px);
  drawFlat(g, face, E, { ink: 2.2, figureOnly: true, map: () => '#000000', inkCol: '#000000' });
  const d = imgOf(c).d;
  const m = new Float32Array(px * px);
  for (let i = 0; i < px * px; i++) m[i] = d[i * 4 + 3]! > 100 ? 1 : 0;
  return m;
}

export function blur(a: Float32Array, w: number, r: number, passes = 3): Float32Array {
  let src = Float32Array.from(a);
  const rad = Math.max(1, Math.round(r));
  const tmp = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < w; y++) {
      let acc = 0;
      for (let x = -rad; x <= rad; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))]!;
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * rad + 1);
        acc += src[y * w + Math.min(w - 1, x + rad + 1)]! - src[y * w + Math.max(0, x - rad)]!;
      }
    }
    const out = new Float32Array(a.length);
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -rad; y <= rad; y++) acc += tmp[Math.min(w - 1, Math.max(0, y)) * w + x]!;
      for (let y = 0; y < w; y++) {
        out[y * w + x] = acc / (2 * rad + 1);
        acc += tmp[Math.min(w - 1, y + rad + 1) * w + x]! - tmp[Math.max(0, y - rad) * w + x]!;
      }
    }
    src = out;
  }
  return src;
}

export function lumField(im: Img): Float32Array {
  const f = new Float32Array(im.w * im.w);
  for (let i = 0; i < f.length; i++) f[i] = (0.2126 * im.d[i * 4]! + 0.7152 * im.d[i * 4 + 1]! + 0.0722 * im.d[i * 4 + 2]!) / 255;
  return f;
}

/** A dome over the figure: high in the middle of the head, falling off at its edges. */
export function pillow(face: Face, E: Engine, px: number) {
  const m = figureMask(face, E, px);
  const h = blur(m, px, px / 14);
  for (let i = 0; i < h.length; i++) h[i] = h[i]! * (0.4 + 0.6 * m[i]!);
  return { mask: m, h };
}

/** Direction along the contours of a field (perpendicular to its gradient), in radians. */
export function flowField(f: Float32Array, w: number): Float32Array {
  const a = new Float32Array(w * w);
  for (let y = 1; y < w - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = f[i + 1]! - f[i - 1]!, gy = f[i + w]! - f[i - w]!;
    a[i] = Math.hypot(gx, gy) < 1e-4 ? Math.PI / 4 : Math.atan2(gy, gx) + Math.PI / 2;
  }
  return a;
}

export function grain(g: Ctx, px: number, seed: number, amount: number, col: string, size = 1.3) {
  const r = rng(seed);
  g.fillStyle = col;
  for (let i = 0; i < px * px * amount; i++) g.fillRect(r() * px, r() * px, size * (0.4 + r()), size * (0.4 + r()));
}

export function polyline(g: Ctx, pts: readonly Pt[], closed = false) {
  g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  if (closed) g.closePath();
}

export const figureInks = (face: Face) => face.figure.filter((o): o is InkOp => o.k === 'ink' && o.col !== 'paper');

export function pupils(g: Ctx, face: Face, col: string, scale = 1) {
  for (const e of face.eyes) {
    const st = eyeState(e, face.gaze, 1);
    g.save();
    g.beginPath();
    addPath(g, e.clip);
    g.clip();
    if (st.lid) {
      // a closing lid hides the pupil behind it
      g.beginPath();
      g.rect(-W, -W, 3 * W, 3 * W);
      addPath(g, st.lid);
      g.clip('evenodd');
    }
    g.fillStyle = col;
    if (e.spiral) {
      g.translate(e.x, e.y);
      g.strokeStyle = col;
      g.lineWidth = 2.2;
      polyline(g, e.spiral.pts);
      g.stroke();
    } else {
      const b = bbox(e.pupil);
      g.beginPath();
      g.arc((b.x0 + b.x1) / 2 + st.dx, (b.y0 + b.y1) / 2 + st.dy, ((b.x1 - b.x0) / 2) * scale, 0, TAU);
      g.fill();
    }
    g.restore();
  }
}

export function imageFrom(px: number, fn: (i: number, x: number, y: number) => RGB): HTMLCanvasElement {
  const [c, g] = canvas(px);
  const im = g.createImageData(px, px);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const i = y * px + x, p = fn(i, x, y);
    im.data[i * 4] = p[0]; im.data[i * 4 + 1] = p[1]; im.data[i * 4 + 2] = p[2]; im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}

