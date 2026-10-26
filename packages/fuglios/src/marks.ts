import type { Face } from './face/types';
import { W } from './face/types';
import { bbox, TAU, type Pt } from './geometry';
import { hash01 } from './raster';
import type { FaceState } from './states';

/**
 * The comic artist's marks for a state, drawn in ink beside the head: a
 * trail of thought bubbles, a typing bubble, a question mark, a red
 * exclamation mark, sparkles. Expressions carry a state at large sizes; these carry it
 * in a 32px sidebar, where a raised brow is a single pixel.
 */

/** Where the head is on the canvas, in canvas pixels. */
export type MarkFrame = { x0: number; y0: number; x1: number; y1: number; px: number; dark: boolean };

/** The head's box for a face painted full-frame (the paintings) or through an avatar's crop. */
export function markFrame(face: Face, px: number, map: { s: number; ox: number; oy: number } | null, dark: boolean): MarkFrame {
  const k = face.sketch;
  const b = bbox([...k.head, ...(k.hair.cover ?? [])]);
  const m = map ?? { s: px / W, ox: 0, oy: 0 };
  return { x0: b.x0 * m.s + m.ox, y0: b.y0 * m.s + m.oy, x1: b.x1 * m.s + m.ox, y1: b.y1 * m.s + m.oy, px, dark };
}

const GOLD = '#f2b632';
const RED = '#d0402c';

/**
 * Draws a state's marks for time `t` (seconds). `still` picks the moment that
 * says the most, for images and for faces held still.
 */
export function drawMarks(g: CanvasRenderingContext2D, face: Face, state: FaceState, f: MarkFrame, t: number, still = false) {
  if (state === 'idle') return;
  const { px } = f;
  const w = f.x1 - f.x0, h = f.y1 - f.y0;
  // up and to the right of the head, pulled in far enough that a circle crop never cuts it; at avatar
  // sizes the head fills the frame, so the mark sits over the hair, larger, cut out with a paper edge
  const c = px / 2;
  const small = px < 80;
  let ax = f.x1 - w * 0.04, ay = f.y0 + h * 0.1;
  const d = Math.hypot(ax - c, ay - c), lim = px * (small ? 0.3 : 0.34);
  if (d > lim) { ax = c + ((ax - c) * lim) / d; ay = c + ((ay - c) * lim) / d; }
  const S = small ? px * 0.4 : Math.min(px * 0.24, Math.max(px * 0.15, w * 0.3));
  const ink = f.dark ? '#f4f0ff' : face.pal.ink;
  const fill = f.dark ? '#1c1828' : '#fffdf8';
  const lw = Math.max(small ? 1.3 : 1, S * 0.1);
  /** Strokes the current path with a wide paper edge under the ink, so a mark reads over hair or a busy wash. */
  const edged = (width = lw, col = ink) => {
    g.lineWidth = width + Math.max(1.5, S * 0.12);
    g.strokeStyle = fill;
    g.stroke();
    g.lineWidth = width;
    g.strokeStyle = col;
    g.stroke();
  };
  const phase = still ? 1 : t;

  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.lineCap = g.lineJoin = 'round';
  g.lineWidth = lw;
  g.strokeStyle = ink;

  if (state === 'thinking') {
    // two bubbles rising from the head to a cloud, appearing one after another
    const cycle = still ? 1 : (phase % 2.6) / 2.6;
    const from = { x: ax - S * 0.55, y: ay + S * 0.55 };
    const cloud = { x: ax + S * 0.12, y: ay - S * 0.28 };
    const show = (i: number) => (still ? 1 : Math.max(0, Math.min(1, cycle * 4 - i)));
    bubble(g, from.x, from.y, S * 0.07, show(0), fill, lw * 0.8);
    bubble(g, (from.x + cloud.x) / 2 - S * 0.06, (from.y + cloud.y) / 2 + S * 0.08, S * 0.1, show(1), fill, lw * 0.85);
    if (show(2) > 0) {
      g.globalAlpha = show(2);
      puff(g, cloud.x, cloud.y, S * 0.38, S * 0.27, fill, face.seed);
      g.globalAlpha = 1;
    }
  } else if (state === 'working') {
    // a typing bubble with three dots that bounce in turn
    const bw = S * 1.05, bh = S * 0.52, x = ax - bw * 0.35, y = ay - bh * 0.15;
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x - bw / 2, y - bh / 2, bw, bh, bh / 2);
    g.moveTo(x - bw * 0.22, y + bh / 2 - lw * 0.3);
    g.lineTo(x - bw * 0.4, y + bh * 0.95);
    g.lineTo(x - bw * 0.02, y + bh / 2 - lw * 0.3);
    g.fill();
    g.stroke();
    g.fillStyle = ink;
    for (let i = 0; i < 3; i++) {
      const hop = still ? (i === 1 ? 1 : 0) : Math.max(0, Math.sin(phase * 7 - i * 0.9));
      g.beginPath();
      g.arc(x + (i - 1) * bw * 0.25, y - hop * bh * 0.16, S * 0.065, 0, TAU);
      g.fill();
    }
  } else if (state === 'waiting') {
    // a hand-lettered question mark, bobbing gently
    const bob = still ? 0 : Math.sin(phase * 2.6) * S * 0.07;
    const x = ax, y = ay + bob, r = S * 0.24;
    g.beginPath();
    g.arc(x, y - r * 0.6, r, Math.PI * 1.05, Math.PI * 2.35);
    g.quadraticCurveTo(x, y + r * 0.35, x, y + r * 0.85);
    edged(lw * 1.5);
    g.beginPath();
    g.arc(x, y + r * 1.55, lw * 0.95, 0, TAU);
    g.fillStyle = ink;
    g.lineWidth = Math.max(1.5, S * 0.12);
    g.strokeStyle = fill;
    g.stroke();
    g.fill();
  } else if (state === 'blocked') {
    // a red exclamation mark that gives a frustrated shake every couple of seconds
    const shake = still ? 0 : Math.sin(phase * 40) * Math.max(0, 1 - ((phase % 2.2) / 0.35)) * S * 0.05;
    const x = ax + shake, r = S * 0.3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x + r * 0.08, ay - r * 1.05);
    g.lineTo(x, ay + r * 0.35);
    edged(lw * 1.9, RED);
    g.beginPath();
    g.arc(x - r * 0.02, ay + r * 0.95, lw * 1.05, 0, TAU);
    g.lineWidth = Math.max(1.5, S * 0.12);
    g.strokeStyle = fill;
    g.stroke();
    g.fillStyle = RED;
    g.fill();
  } else if (state === 'done') {
    // sparkles twinkling out of step with each other
    const spots: [number, number, number][] = [[0, 0, 1], [-0.5, 0.55, 0.62], [0.42, 0.62, 0.48]];
    spots.forEach(([dx, dy, k], i) => {
      const s = (still ? 1 : 0.65 + 0.35 * Math.sin(phase * 3.4 + i * 2.1)) * k * S * 0.3;
      sparkle(g, ax + dx * S * 0.6, ay + dy * S * 0.6, s, GOLD, ink, lw * 0.8, fill, Math.max(1.5, S * 0.1));
    });
  }
  g.restore();
}

function bubble(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, fill: string, lw: number) {
  if (a <= 0) return;
  g.globalAlpha = a;
  g.lineWidth = lw;
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r * (0.6 + 0.4 * a), 0, TAU);
  g.fill();
  g.stroke();
  g.globalAlpha = 1;
}

/** A thought cloud: a ring of overlapping lobes, wobbling a little per face. */
function puff(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, seed: number) {
  const lobes = 7;
  const pts: Pt[] = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * TAU;
    pts.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry });
  }
  g.fillStyle = fill;
  g.beginPath();
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % lobes]!;
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const out = 1.55 + hash01(seed, i) * 0.25;
    const cx = x + (mx - x) * out, cy = y + (my - y) * out;
    i ? g.quadraticCurveTo(cx, cy, q.x, q.y) : (g.moveTo(p.x, p.y), g.quadraticCurveTo(cx, cy, q.x, q.y));
  });
  g.closePath();
  g.fill();
  g.stroke();
}

/** A four-pointed star with pinched sides. */
function sparkle(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, ink: string, lw: number, paper: string, edge: number) {
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU - Math.PI / 2, b = a + TAU / 8;
    const p = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
    const q = { x: x + Math.cos(a + TAU / 4) * r, y: y + Math.sin(a + TAU / 4) * r };
    if (i === 0) g.moveTo(p.x, p.y);
    g.quadraticCurveTo(x + Math.cos(b) * r * 0.18, y + Math.sin(b) * r * 0.18, q.x, q.y);
  }
  g.closePath();
  g.lineWidth = lw + edge;
  g.strokeStyle = paper;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = ink;
  g.stroke();
}
