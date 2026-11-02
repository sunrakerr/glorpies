import type { Engine } from '../engine';
import { bbox, resample, ribbon, type Pt } from '../geometry';
import type { HatchOp, InkOp } from './types';

export type Ribbon = { pts: Pt[]; alpha: number };

/**
 * A dip-pen line as filled outlines: pressure from noise, tapered ends, an
 * off-register ghost pass, and gaps where the nib runs dry. `phase` only moves
 * where noise is sampled, so each phase is the same stroke redrawn by hand —
 * cycling phases gives the "line boil" of hand-drawn animation. `reveal` draws
 * only the first part of the line, as if the pen were still moving.
 */
export function inkRibbons(op: InkOp, E: Engine, phase = 0, reveal = 1): Ribbon[] {
  E.seed(op.seed);
  let path = resample(op.pts, 1.8);
  if (path.length < 2) return [];
  if (op.closed) {
    const s = Math.floor(E.random(0, path.length));
    path = path.slice(s).concat(path.slice(0, s));
    path = path.concat(path.slice(0, Math.max(2, Math.floor(path.length * E.random(0.04, 0.1)))));
  }
  const ph = phase * 23.17;
  const out: Ribbon[] = [];
  const n = path.length;
  // `reveal` cuts the pen off part-way; noise is indexed by point, so the drawn part matches the finished line
  const end = Math.ceil(n * Math.min(1, reveal));
  for (let ps = 0; ps < op.passes; ps++) {
    const no = E.random(0, 1000);
    const ox = ps ? E.random(-op.ghost, op.ghost) : 0;
    const oy = ps ? E.random(-op.ghost, op.ghost) : 0;
    const amp = op.jit * (1 + ps);
    const alpha = ps ? op.alpha * 0.4 : op.alpha;
    let run: Pt[] = [],
      widths: number[] = [];
    const flush = () => {
      if (run.length > 1) out.push({ pts: ribbon(run, widths), alpha });
      run = [];
      widths = [];
    };
    for (let i = 0; i < end; i++) {
      const p = path[i]!;
      const t = i / (n - 1);
      let w = op.w * (ps ? 0.45 : 1) * (0.45 + 1.1 * E.noise(no + 300 + ph + i * 0.03));
      if (op.taper) w *= Math.min(1, 0.15 + Math.sin(t * Math.PI) * 2.2);
      if (op.dry && E.noise(no + 600 + ph * 0.2 + i * 0.08) > 0.66) {
        flush();
        continue;
      }
      run.push({
        x: p.x + ox + (E.noise(no + ph + i * 0.05) - 0.5) * 2 * amp,
        y: p.y + oy + (E.noise(no + 91 + ph + i * 0.05) - 0.5) * 2 * amp,
      });
      widths.push(Math.max(0.25, w));
    }
    flush();
  }
  return out;
}

export type HatchLine = { pts: Pt[]; w: number };

export function hatchLines(op: HatchOp, E: Engine): HatchLine[] {
  E.seed(op.seed);
  const bb = bbox(op.region),
    hx = (bb.x0 + bb.x1) / 2,
    hy = (bb.y0 + bb.y1) / 2;
  const diag = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2 + 6;
  const dx = Math.cos(op.angle),
    dy = Math.sin(op.angle),
    nx = -dy,
    ny = dx;
  const lines: HatchLine[] = [];
  for (let s = -diag; s < diag; s += op.gap * E.random(0.75, 1.3)) {
    const ox = hx + nx * s,
      oy = hy + ny * s;
    const t0 = E.random(-diag, -diag * 0.2),
      t1 = E.random(diag * 0.2, diag);
    const w = op.w * E.random(0.6, 1.3);
    const pts: Pt[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = t0 + ((t1 - t0) * k) / 6;
      pts.push({ x: ox + dx * t + E.gauss() * 0.5, y: oy + dy * t + E.gauss() * 0.5 });
    }
    lines.push({ pts, w });
  }
  return lines;
}
