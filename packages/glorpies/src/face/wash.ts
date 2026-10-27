import { makeCanvas } from '../canvas';
import type { Engine } from '../engine';
import { addPath, bbox, TAU, type Pt } from '../geometry';
import { rgba } from '../palettes';
import type { WashOp } from './types';

export type VPt = Pt & { v: number };

/** Tyler Hobbs-style recursive midpoint displacement. */
export function deform(pts: VPt[], depth: number, E: Engine): VPt[] {
  for (let d = 0; d < depth; d++) {
    const out: VPt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      out.push(a);
      const len = Math.hypot(b.x - a.x, b.y - a.y), v = (a.v + b.v) / 2;
      out.push({ x: (a.x + b.x) / 2 + E.gauss() * len * v, y: (a.y + b.y) / 2 + E.gauss() * len * v, v: v * E.random(0.75, 1.1) });
    }
    pts = out;
  }
  return pts;
}

type Speck = { x: number; y: number; r: number };
export type Plan = {
  layers: Pt[][];
  /** Pigment lifted after the layer at the same index. */
  lifts: Map<number, Speck[]>;
  bloom: Pt[] | null;
  edge: { pts: Pt[]; w: number } | null;
};

export function plan(op: WashOp, E: Engine): Plan {
  E.seed(op.seed);
  const dx = E.random(-op.shift, op.shift), dy = E.random(-op.shift, op.shift);
  const base = deform(op.pts.map((q) => ({ x: q.x + dx, y: q.y + dy, v: op.v * E.random(0.5, 1.5) })), 2, E);
  const bb = bbox(base);
  const layers: Pt[][] = [];
  const lifts = new Map<number, Speck[]>();
  const count = Math.min(320, 14 + ((bb.x1 - bb.x0) * (bb.y1 - bb.y0)) / 160);
  for (let l = 0; l < op.layers; l++) {
    layers.push(deform(base, op.depth, E));
    if (op.grain && l % 5 === 4) {
      lifts.set(l, Array.from({ length: count }, () => ({ x: E.random(bb.x0, bb.x1), y: E.random(bb.y0, bb.y1), r: E.random(0.3, 1.8) })));
    }
  }
  let bloom: Pt[] | null = null;
  if (op.bloom && E.random(0, 1) < op.bloom) {
    const br = Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0) * E.random(0.1, 0.2);
    const bx = E.random(bb.x0 + br, bb.x1 - br), by = E.random(bb.y0 + br, bb.y1 - br), ry = br * E.random(0.7, 1);
    const ring = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * TAU, r = 1 + 0.3 * (E.noise(bx * 0.1 + Math.cos(a), by * 0.1 + Math.sin(a)) - 0.5) * 2;
      return { x: bx + Math.cos(a) * br * r, y: by + Math.sin(a) * ry * r, v: 0.25 };
    });
    bloom = deform(ring, 4, E);
  }
  const edge = op.edge ? { w: E.random(0.5, 1.2), pts: deform(base, 2, E) } : null;
  return { layers, lifts, bloom, edge };
}

export type WashRaster = { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number };

/** Paints one glaze onto its own transparent sheet, cropped to where the pigment landed. */
export function rasterizeWash(op: WashOp, col: string, E: Engine, scale: number): WashRaster {
  const p = plan(op, E);
  const all = p.layers.flat();
  if (p.edge) all.push(...p.edge.pts);
  const bb = bbox(all);
  const x = Math.floor(bb.x0) - 2, y = Math.floor(bb.y0) - 2;
  const w = Math.ceil(bb.x1) + 2 - x, h = Math.ceil(bb.y1) + 2 - y;
  const canvas = makeCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
  const g = canvas.getContext('2d')!;
  g.scale(scale, scale);
  g.translate(-x, -y);
  const fill = rgba(col, op.alpha);
  p.layers.forEach((poly, l) => {
    g.fillStyle = fill;
    g.beginPath();
    addPath(g, poly);
    g.fill();
    const specks = p.lifts.get(l);
    if (!specks) return;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (const s of specks) {
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, TAU);
      g.fill();
    }
    g.restore();
  });
  if (p.bloom) {
    // a backrun: pigment pushed out by a drop of water, leaving a dark tide line
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); addPath(g, p.bloom); g.fill();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = rgba(col, 0.5);
    g.lineWidth = 1.2;
    g.beginPath(); addPath(g, p.bloom); g.stroke();
    g.restore();
  }
  if (p.edge) {
    g.strokeStyle = rgba(col, op.edgeAlpha);
    g.lineJoin = 'round';
    g.lineWidth = p.edge.w;
    g.beginPath(); addPath(g, p.edge.pts); g.stroke();
  }
  return { canvas, x, y, w, h };
}
