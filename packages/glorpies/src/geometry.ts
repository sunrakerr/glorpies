import { makePath } from './canvas';

export type Pt = { x: number; y: number };

export const TAU = Math.PI * 2;

type PathSink = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'closePath'>;

export function addPath(sink: PathSink, pts: readonly Pt[]): void {
  pts.forEach((q, i) => (i ? sink.lineTo(q.x, q.y) : sink.moveTo(q.x, q.y)));
  sink.closePath();
}

export function toPath2D(pts: readonly Pt[]): Path2D {
  const p = makePath();
  addPath(p, pts);
  return p;
}

/** SVG path data for a closed polygon, rounded to keep files small. */
export function pathData(pts: readonly Pt[], closed = true): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  let d = '';
  pts.forEach((q, i) => {
    d += `${i ? 'L' : 'M'}${r(q.x)} ${r(q.y)}`;
  });
  return closed ? `${d}Z` : d;
}

export type Box = { x0: number; y0: number; x1: number; y1: number };

export function bbox(pts: readonly Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of pts) {
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
  }
  return { x0, y0, x1, y1 };
}

export function centroid(pts: readonly Pt[]): Pt {
  return pts.reduce((a, q) => ({ x: a.x + q.x / pts.length, y: a.y + q.y / pts.length }), { x: 0, y: 0 });
}

export function shrink(pts: readonly Pt[], k: number): Pt[] {
  const c = centroid(pts);
  return pts.map((q) => ({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k }));
}

export function shift(pts: readonly Pt[], dx: number, dy: number): Pt[] {
  return pts.map((q) => ({ x: q.x + dx, y: q.y + dy }));
}

export function sparse(pts: readonly Pt[], n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => pts[Math.floor((i * pts.length) / n)]!);
}

export function inside(pt: Pt, poly: readonly Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Re-space a polyline so pen texture doesn't depend on how densely it was authored. */
export function resample(pts: readonly Pt[], step: number): Pt[] {
  const first = pts[0];
  if (!first) return [];
  const out: Pt[] = [first];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]!;
    const b = pts[i]!;
    let d = Math.hypot(b.x - a.x, b.y - a.y);
    while (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(q);
      a = q;
      d = Math.hypot(b.x - a.x, b.y - a.y);
      acc = 0;
    }
    acc += d;
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function spline(ctrl: readonly Pt[], closed = false, steps = 10): Pt[] {
  const last = ctrl[ctrl.length - 1]!;
  const c = closed ? [last, ...ctrl, ctrl[0]!, ctrl[1]!] : [ctrl[0]!, ...ctrl, last];
  const out: Pt[] = [];
  for (let i = 0; i < c.length - 3; i++) {
    const [a, b, d, e] = [c[i]!, c[i + 1]!, c[i + 2]!, c[i + 3]!];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: catmull(a.x, b.x, d.x, e.x, t), y: catmull(a.y, b.y, d.y, e.y, t) });
    }
  }
  if (!closed) out.push(last);
  return out;
}

/** Filled outline of a variable-width stroke with round caps, so pen lines are real vector shapes. */
export function ribbon(c: readonly Pt[], w: readonly number[]): Pt[] {
  const n = c.length;
  if (n < 2) return [];
  const L: Pt[] = [], Rt: Pt[] = [], norms: Pt[] = [];
  let prev = { x: 0, y: -1 };
  for (let i = 0; i < n; i++) {
    const a = c[Math.max(0, i - 1)]!, b = c[Math.min(n - 1, i + 1)]!;
    let tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty);
    if (len < 1e-6) ({ x: tx, y: ty } = { x: -prev.y, y: prev.x });
    else { tx /= len; ty /= len; }
    const nrm = { x: -ty, y: tx };
    prev = nrm;
    norms.push(nrm);
    const h = w[i]! / 2, q = c[i]!;
    L.push({ x: q.x + nrm.x * h, y: q.y + nrm.y * h });
    Rt.push({ x: q.x - nrm.x * h, y: q.y - nrm.y * h });
  }
  const cap = (q: Pt, from: number, h: number): Pt[] =>
    Array.from({ length: 5 }, (_, k) => {
      const a = from - ((k + 1) * Math.PI) / 6;
      return { x: q.x + Math.cos(a) * h, y: q.y + Math.sin(a) * h };
    });
  const ne = norms[n - 1]!, n0 = norms[0]!;
  const endCap = cap(c[n - 1]!, Math.atan2(ne.y, ne.x), w[n - 1]! / 2);
  const startCap = cap(c[0]!, Math.atan2(n0.y, n0.x) + Math.PI, w[0]! / 2);
  return [...L, ...endCap, ...Rt.reverse(), ...startCap];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
