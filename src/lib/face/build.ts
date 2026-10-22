import type { Engine } from '../engine';
import { bbox, inside, shift, shrink, sparse, spline, TAU, type Pt } from '../geometry';
import { mix, multiply, PALETTES } from '../palettes';
import type { Color, EyeKind, EyeSpec, Face, HatchOp, InkOp, Op, WashOp } from './types';
import { W } from './types';

/** Pen lines are drawn this many times heavier than the authored widths. */
const INK_WEIGHT = 2;

type WashOpts = Partial<Omit<WashOp, 'k' | 'seed' | 'pts' | 'col'>>;
type InkOpts = Partial<Omit<InkOp, 'k' | 'seed' | 'pts'>> & { raw?: boolean };
type HatchOpts = Partial<Omit<HatchOp, 'k' | 'seed' | 'region'>>;

const MOUTH_DARK = '#5b1a26';

export function buildFace(seed: number, E: Engine): Face {
  E.seed(seed);
  E.noiseSeed(seed);
  const R = (a: number, b: number) => E.random(a, b);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.min(arr.length - 1, Math.floor(E.random(0, arr.length)))]!;
  const chance = (q: number) => E.random(0, 1) < q;
  const gauss = () => E.gauss();
  const nextSeed = () => Math.floor(E.random(0, 2147483647));

  const pal = pick(PALETTES);
  const weird = R(0.45, 1);
  const back: Op[] = [];
  const figure: Op[] = [];
  let out = back;

  const makeWash = (pts: Pt[], col: Color, o: WashOpts = {}): WashOp => ({
    k: 'wash', seed: nextSeed(), pts, col,
    layers: o.layers ?? 26, alpha: o.alpha ?? 0.045, v: o.v ?? 0.14, shift: o.shift ?? 4,
    depth: o.depth ?? 3, grain: o.grain ?? true, edge: o.edge ?? true, edgeAlpha: o.edgeAlpha ?? 0.3,
    bloom: o.bloom ?? 0, clip: o.clip, exclude: o.exclude,
  });
  const makeInk = (pts: Pt[], o: InkOpts = {}): InkOp => ({
    k: 'ink', seed: nextSeed(), pts, col: o.col ?? pal.ink,
    w: (o.w ?? 1.7) * (o.raw ? 1 : INK_WEIGHT), passes: o.passes ?? 2, jit: o.jit ?? 1.0,
    alpha: o.alpha ?? 0.9, ghost: o.ghost ?? 1.8, taper: o.taper ?? true, dry: o.dry ?? false,
    closed: o.closed ?? false, clip: o.clip,
  });
  const wash = (pts: Pt[], col: Color, o: WashOpts = {}) => { out.push(makeWash(pts, col, o)); };
  const ink = (pts: Pt[], o: InkOpts = {}) => { if (pts.length > 1) out.push(makeInk(pts, o)); };
  const solid = (pts: Pt[], col: Color, alpha = 0.95, clip?: Pt[]) => { out.push({ k: 'solid', pts, col, alpha, clip }); };
  const hatch = (region: Pt[], o: HatchOpts = {}) => {
    out.push({
      k: 'hatch', seed: nextSeed(), region, exclude: o.exclude ?? [], col: o.col ?? pal.ink,
      angle: o.angle ?? R(0, Math.PI), gap: (o.gap ?? 4) * 1.3, w: (o.w ?? 0.6) * 1.7, alpha: o.alpha ?? 0.45,
    });
  };

  function blob(x: number, y: number, rx: number, ry: number, n = 16, wob = 0.15, rot = 0): Pt[] {
    const o = R(0, 100);
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * TAU;
      const r = 1 + wob * (E.noise(o + Math.cos(a) * 0.9, o + Math.sin(a) * 0.9) - 0.5) * 2;
      const bx = Math.cos(a) * rx * r, by = Math.sin(a) * ry * r;
      return { x: x + bx * Math.cos(rot) - by * Math.sin(rot), y: y + bx * Math.sin(rot) + by * Math.cos(rot) };
    });
  }
  function arcPts(x: number, y: number, rx: number, ry: number, a0: number, a1: number, n = 40, wob = 0.05): Pt[] {
    const o = R(0, 100);
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / n;
      const r = 1 + wob * (E.noise(o + i * 0.15) - 0.5) * 2;
      return { x: x + Math.cos(a) * rx * r, y: y + Math.sin(a) * ry * r };
    });
  }

  // ================= geometry =================
  const cx = W / 2 + R(-10, 10), cy = W * 0.53 + R(-6, 6);
  const hrx = W * R(0.26, 0.31), hry = W * R(0.3, 0.34);
  const headKind = pick(['egg', 'pear', 'round', 'square', 'bean'] as const);
  const sq = headKind === 'square' ? R(0.55, 0.75) : 1;
  const taperK = headKind === 'egg' ? -R(0.1, 0.2) : headKind === 'pear' ? R(0.12, 0.25) : 0;
  const hNo = R(0, 100), hWob = 0.1 + 0.15 * weird, hRot = R(-0.12, 0.12) * weird;
  function headPoint(a: number, scale = 1): Pt {
    const c = Math.cos(a), s = Math.sin(a);
    let x = Math.sign(c) * Math.pow(Math.abs(c), sq) * hrx;
    let y = Math.sign(s) * Math.pow(Math.abs(s), sq) * hry;
    x *= 1 + taperK * s;
    if (headKind === 'bean') x += hrx * 0.1 * Math.sin(2 * a);
    const r = (1 + hWob * (E.noise(hNo + c * 1.1, hNo + s * 1.1) - 0.5) * 2) * scale;
    x *= r; y *= r;
    return { x: cx + x * Math.cos(hRot) - y * Math.sin(hRot), y: cy + x * Math.sin(hRot) + y * Math.cos(hRot) };
  }
  const headArc = (a0: number, a1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => headPoint(a0 + ((a1 - a0) * i) / n));
  const head = Array.from({ length: 160 }, (_, i) => headPoint((i / 160) * TAU));
  const headSparse = Array.from({ length: 18 }, (_, i) => headPoint((i / 18) * TAU));
  const headBottom = Math.max(...head.map((q) => q.y));
  const headIn = shrink(head, 0.97);
  const light = chance(0.5) ? 1 : -1;

  const eyeY = cy - hry * R(0.02, 0.16);
  const eyeCount = pick([2, 2, 2, 2, 2, 1, 3]);
  const spread = hrx * R(0.36, 0.5);
  const baseR = hrx * (eyeCount === 1 ? R(0.24, 0.32) : R(0.13, 0.21));
  const xs = eyeCount === 1 ? [0] : eyeCount === 2 ? [-1, 1] : [-1.1, 0, 1.1];
  const eyes = xs.map((k) => ({
    x: cx + k * spread + R(-4, 4) * weird,
    y: eyeY + R(-1, 1) * weird * hry * 0.07 - (eyeCount === 3 && k === 0 ? hry * R(0.18, 0.26) : 0),
    r: baseR * (1 + R(-0.35, 0.35) * weird) * (eyeCount === 3 && k === 0 ? 0.8 : 1),
  }));
  const topEye = Math.min(...eyes.map((e) => e.y - e.r));
  const noseY = eyeY + hry * R(0.28, 0.4);
  const mouthY = Math.min(noseY + hry * R(0.2, 0.3), headBottom - hry * 0.2);
  const sy = headBottom + R(10, 30);

  // hair
  const hairKind = pick(['curls', 'spikes', 'bowl', 'sprout', 'beanie', 'long', 'mop', 'curls', 'long', 'bowl'] as const);
  const hairLimit = topEye - baseR * 0.9;
  function capPoly(a0: number, a1: number, sc: number, hy: number, sideY: number): Pt[] {
    const top: Pt[] = [];
    for (let i = 0; i <= 24; i++) top.push(headPoint(a0 + ((a1 - a0) * i) / 24, sc * (1 + R(-0.015, 0.03))));
    const L = top[0]!, Rt = top[top.length - 1]!;
    const line = spline([
      Rt, { x: cx + hrx * 0.86, y: sideY + R(-4, 4) }, { x: cx + hrx * 0.45, y: hy + R(-6, 6) },
      { x: cx + R(-10, 10), y: hy + R(-4, 8) },
      { x: cx - hrx * 0.45, y: hy + R(-6, 6) }, { x: cx - hrx * 0.86, y: sideY + R(-4, 4) }, L,
    ], false, 8);
    return top.concat(line.slice(1, -1));
  }
  let cover: Pt[] | null = null;
  let coverA: [number, number] | null = null;
  let hairBack: Pt[] | null = null;
  let crownTips: Pt[] = [];
  let hat: { poly: Pt[]; bandY: number; topY: number } | null = null;
  let pompom: Pt[] | null = null;
  if (hairKind === 'curls' || hairKind === 'mop' || hairKind === 'long') {
    const d = hairKind === 'long' ? R(0.1, 0.25) : R(0.05, 0.4);
    const sc = hairKind === 'curls' ? R(1.1, 1.22) : R(1.06, 1.15);
    const hy = Math.min(cy - hry * R(0.34, 0.55), hairLimit);
    coverA = [Math.PI - d, TAU + d];
    cover = capPoly(coverA[0], coverA[1], sc, hy, Math.min(hy + hry * 0.25, topEye - 2));
  } else if (hairKind === 'bowl') {
    const d = R(0.25, 0.5);
    const hy = topEye - baseR * R(0.4, 0.9) - 4;
    coverA = [Math.PI - d, TAU + d];
    cover = capPoly(coverA[0], coverA[1], R(1.07, 1.14), hy, hy + R(2, 10));
  } else if (hairKind === 'spikes') {
    const n = Math.floor(R(9, 15)), a0 = Math.PI + 0.15, a1 = TAU - 0.15;
    const crown = [headPoint(a0, 1.0)];
    for (let i = 0; i < n; i++) {
      crown.push(headPoint(a0 + ((a1 - a0) * (i + 0.5)) / n + R(-0.05, 0.05), 1 + R(0.16, 0.42) * (0.6 + 0.4 * weird)));
      crown.push(headPoint(a0 + ((a1 - a0) * (i + 1)) / n, R(1.0, 1.06)));
    }
    const hy = Math.min(cy - hry * R(0.42, 0.6), hairLimit);
    const hl = spline([crown[crown.length - 1]!, { x: cx + hrx * 0.5, y: hy }, { x: cx, y: hy + R(-4, 8) }, { x: cx - hrx * 0.5, y: hy }, crown[0]!], false, 8);
    crownTips = crown;
    cover = crown.concat(hl.slice(1, -1));
    coverA = [a0, a1];
  } else if (hairKind === 'beanie') {
    const hy = Math.min(cy - hry * R(0.25, 0.4), hairLimit);
    const k = Math.min(0.95, (cy - hy) / hry);
    const a0 = Math.PI + Math.asin(k) - 0.18, a1 = TAU - Math.asin(k) + 0.18;
    const sc = R(1.1, 1.16);
    const top = Array.from({ length: 25 }, (_, i) => headPoint(a0 + ((a1 - a0) * i) / 24, sc));
    const L = top[0]!, Rt = top[top.length - 1]!;
    const brim = spline([Rt, { x: cx + hrx * 0.4, y: hy + R(2, 8) }, { x: cx - hrx * 0.4, y: hy + R(2, 8) }, L], false, 8);
    hat = { poly: top.concat(brim.slice(1, -1)), bandY: Math.max(L.y, Rt.y) - R(18, 26), topY: Math.min(...top.map((q) => q.y)) };
    const pr = hrx * R(0.16, 0.24);
    pompom = blob(cx + R(-10, 10), hat.topY - pr * 0.55, pr, pr * R(0.85, 1.05), 14, 0.25);
    cover = hat.poly;
    coverA = [a0 + 0.12, a1 - 0.12];
  }
  if (hairKind === 'long') {
    const hb = Array.from({ length: 15 }, (_, i) => headPoint(Math.PI - 0.3 + ((Math.PI + 0.6) * i) / 14, 1.17));
    hb.push(
      { x: cx + hrx * R(1.12, 1.3), y: cy + hry * 0.6 }, { x: cx + hrx * R(1.1, 1.45), y: sy + R(30, 80) },
      { x: cx + hrx * 0.4, y: sy + R(10, 40) }, { x: cx - hrx * 0.4, y: sy + R(10, 40) },
      { x: cx - hrx * R(1.1, 1.45), y: sy + R(30, 80) }, { x: cx - hrx * R(1.12, 1.3), y: cy + hry * 0.6 },
    );
    hairBack = hb;
  }

  const ears: { s: number; x: number; y: number; rx: number; ry: number }[] = [];
  if (hairKind !== 'long' && chance(0.75)) {
    for (const s of [-1, 1]) {
      const ep = headPoint(s < 0 ? Math.PI : 0);
      const er = hrx * R(0.13, 0.2) * (1 + R(-0.3, 0.3) * weird);
      ears.push({ s, x: ep.x + s * er * 0.5, y: ep.y + hry * R(-0.02, 0.14), rx: er, ry: er * R(1.25, 1.6) });
    }
  }

  const holes: Pt[][] = [headIn];
  if (cover) holes.push(shrink(cover, 0.97));
  if (hairBack) holes.push(shrink(hairBack, 0.97));
  if (pompom) holes.push(pompom);
  for (const e of ears) holes.push(blob(e.x, e.y, e.rx * 0.9, e.ry * 0.9, 12, 0.05));

  // ================= backdrop =================
  back.push({ k: 'paper', seed: nextSeed() });
  const graphite: InkOpts = { raw: true, col: '#55555f', alpha: 0.16, w: 0.7, passes: 1, jit: 0.5 };
  ink(arcPts(cx + R(-6, 6), cy + R(-6, 6), hrx * R(0.98, 1.1), hry * R(0.98, 1.08), R(0, TAU), R(0, TAU) + R(5, 6.6), 60, 0.03), graphite);
  ink(arcPts(cx + R(-6, 6), cy + R(-4, 4), hrx * R(0.95, 1.1), hry * R(0.95, 1.1), R(0, TAU), R(0, TAU) + R(3, 5), 50, 0.04), { ...graphite, alpha: 0.13 });
  ink([{ x: cx + R(-4, 4), y: cy - hry * 1.12 }, { x: cx + R(-4, 4), y: cy + hry * 1.12 }], { ...graphite, alpha: 0.08 });
  ink([{ x: cx - hrx * 1.2, y: eyeY + R(-3, 3) }, { x: cx + hrx * 1.2, y: eyeY + R(-3, 3) }], { ...graphite, alpha: 0.13 });
  wash(blob(W / 2 + R(-50, 50), W / 2 + R(-40, 40), W * R(0.4, 0.48), W * R(0.38, 0.46), 14, 0.3, R(0, TAU)), pal.bg, { layers: 30, alpha: 0.05, v: 0.22, exclude: holes, bloom: 0.7 });
  if (chance(0.75)) wash(blob(R(W * 0.15, W * 0.85), R(W * 0.12, W * 0.5), W * R(0.1, 0.2), W * R(0.09, 0.18), 12, 0.3), pal.bg2, { layers: 22, alpha: 0.055, v: 0.2, exclude: holes });
  if (chance(0.4)) {
    const sx = R(10, W - 10), sy2 = R(10, W - 10), rr = R(1.5, 7);
    wash(blob(sx, sy2, rr, rr, 8, 0.3), pick([pal.accent, pal.bg, pal.blush, pal.hair, pal.accent2]), { layers: 8, alpha: 0.16, v: 0.12, grain: false, edge: false, shift: 0 });
  }
  if (chance(0.12)) {
    const sx = R(20, W - 20), sy2 = R(20, W - 20), n = Math.floor(R(6, 18));
    for (let i = 0; i < n; i++) {
      const d = Math.abs(gauss()) * 18, a = R(0, TAU), r = Math.max(0.4, 2.6 - d * 0.08) * R(0.5, 1);
      solid(blob(sx + Math.cos(a) * d, sy2 + Math.sin(a) * d, r, r, 6, 0.2), pal.ink, 0.85);
    }
  }

  // ================= figure =================
  out = figure;
  if (hairBack) wash(hairBack, pal.hair, { layers: 30, alpha: 0.05, v: 0.12, exclude: [headIn] });
  for (const e of ears) wash(blob(e.x, e.y, e.rx, e.ry, 12, 0.15), pal.skin, { layers: 22, alpha: 0.05, v: 0.08, exclude: [headIn] });

  wash(headSparse, pal.skin, { layers: 30, alpha: 0.04, v: 0.07, bloom: 0.35, exclude: cover ? [shrink(cover, 0.94)] : [] });
  wash(blob(cx - light * hrx * 0.95, cy + hry * 0.12, hrx * 0.55, hry * 0.95, 14, 0.25), pal.shade, { layers: 22, alpha: 0.035, v: 0.26, clip: head, exclude: cover ? [cover] : [] });
  wash(blob(cx, headBottom - hry * 0.02, hrx * 0.55, hry * 0.16, 12, 0.25), pal.shade, { layers: 14, alpha: 0.035, v: 0.2, clip: head, grain: false });
  const blushes = eyeCount === 1 || chance(0.25) ? [chance(0.5) ? -1 : 1] : [-1, 1];
  if (chance(0.85)) for (const s of blushes) {
    const br = hrx * R(0.13, 0.22);
    wash(blob(cx + s * hrx * R(0.5, 0.65), eyeY + hry * R(0.28, 0.4), br, br * R(0.7, 0.95), 12, 0.2), pal.blush, { layers: 18, alpha: 0.05, v: 0.15, clip: head });
  }

  if (cover) {
    const hc = hairKind === 'beanie' ? pick([pal.accent, pal.accent2]) : pal.hair;
    wash(hairKind === 'spikes' ? cover : sparse(cover, 20), hc, { layers: 30, alpha: 0.052, v: 0.08, shift: 3, bloom: 0.4 });
    if (hat && pompom) {
      wash([{ x: 0, y: hat.bandY }, { x: W, y: hat.bandY }, { x: W, y: W }, { x: 0, y: W }], hc, { layers: 14, alpha: 0.05, v: 0.02, clip: hat.poly, grain: false });
      wash(pompom, pal.blush, { layers: 22, alpha: 0.06, v: 0.12 });
    } else {
      wash(blob(cx - light * hrx * 0.45, cy - hry * 0.75, hrx * 0.75, hry * 0.45, 12, 0.2), pal.hair2, { layers: 16, alpha: 0.045, v: 0.15, clip: cover });
    }
  }

  const away = cover ? [cover] : [];
  hatch(head, { exclude: [shift(head, light * hrx * 0.34, -hry * 0.06), ...away], angle: light > 0 ? R(0.6, 0.95) : Math.PI - R(0.6, 0.95), gap: R(3.8, 5), w: 0.6, alpha: 0.38 });
  hatch(head, { exclude: [shift(head, light * hrx * 0.17, -hry * 0.03), ...away], angle: light > 0 ? R(1.9, 2.3) : Math.PI - R(1.9, 2.3), gap: R(3.2, 4.2), w: 0.55, alpha: 0.32 });
  for (const e of ears) {
    const c = e.s > 0 ? 0 : Math.PI;
    ink(arcPts(e.x, e.y, e.rx, e.ry, c - 1.9 * e.s, c + 1.9 * e.s, 40, 0.06), { w: 1.7 });
    ink(arcPts(e.x + e.s * e.rx * 0.1, e.y, e.rx * 0.5, e.ry * 0.55, c - 1.5 * e.s, c + 1.2 * e.s, 20, 0.1), { w: 1.1, passes: 1 });
  }
  if (coverA) ink(headArc(coverA[1] - 0.1, coverA[0] + TAU + 0.1, 120), { w: 2.1 });
  else ink(head, { closed: true, w: 2.1 });

  // ---- hair ink
  if (hairKind === 'curls' && cover) {
    ink(cover.slice(0, 25), { w: 1.2, dry: true, alpha: 0.6, passes: 1 });
    const bb = bbox(cover);
    for (let k = 0, tries = 0; k < 60 && tries < 600; tries++) {
      const pt = { x: R(bb.x0, bb.x1), y: R(bb.y0, bb.y1) };
      if (!inside(pt, cover)) continue;
      k++;
      const cr = R(3.5, 8.5), a0 = R(0, TAU), turns = R(1.1, 1.7), pts: Pt[] = [];
      for (let t = 0; t <= 1; t += 0.04) {
        const a = a0 + t * turns * TAU, rr = cr * (0.35 + 0.65 * t);
        pts.push({ x: pt.x + Math.cos(a) * rr, y: pt.y + Math.sin(a) * rr });
      }
      ink(pts, { w: R(0.9, 1.5), passes: 1, jit: 0.3 });
    }
  } else if (hairKind === 'mop' && cover) {
    ink(cover.slice(0, 25), { w: 1.8, jit: 2.2 });
    const bb = bbox(cover), top = { x: cx, y: bb.y0 - hry * 0.2 };
    for (let k = 0, tries = 0; k < 90 && tries < 900; tries++) {
      const pt = { x: R(bb.x0, bb.x1), y: R(bb.y0, bb.y1) };
      if (!inside(pt, cover)) continue;
      k++;
      const dx = pt.x - top.x, dy = pt.y - top.y, d = Math.hypot(dx, dy), len = R(8, 18);
      const end = { x: pt.x + (dx / d) * len, y: pt.y + (dy / d) * len };
      ink(spline([pt, { x: (pt.x + end.x) / 2 + R(-3, 3), y: (pt.y + end.y) / 2 + R(-3, 3) }, end], false, 6), { w: R(0.8, 1.4), passes: 1, jit: 0.3 });
    }
  } else if (hairKind === 'bowl' && cover) {
    ink(cover.slice(0, 25), { w: 2 });
    const zig: Pt[] = [];
    cover.slice(25).forEach((q, i) => { if (i % 3 === 0) zig.push({ x: q.x, y: q.y + (i % 6 === 0 ? R(5, 11) : R(-2, 1)) }); });
    ink(zig, { w: 1.6, jit: 0.4 });
    const crown = headPoint(1.5 * Math.PI + R(-0.2, 0.2), 1.05);
    for (let i = 0; i < 9; i++) {
      const f = zig[Math.floor(((i + 0.5) * zig.length) / 9)];
      if (f) ink(spline([{ x: crown.x + R(-6, 6), y: crown.y + 8 }, { x: (crown.x + f.x) / 2 + R(-6, 6), y: (crown.y + f.y) / 2 }, { x: f.x, y: f.y - 6 }], false, 8), { w: 0.8, passes: 1, alpha: 0.6 });
    }
  } else if (hairKind === 'spikes' && cover) {
    ink(crownTips, { w: 1.9, jit: 0.4 });
    ink(cover.slice(crownTips.length), { w: 1.0, passes: 1, alpha: 0.6, dry: true });
  } else if (hairKind === 'long' && cover && hairBack) {
    ink(cover.slice(0, 25), { w: 1.8 });
    ink(hairBack.slice(15), { w: 1.3, passes: 1, alpha: 0.5, dry: true });
    const part = headPoint(1.5 * Math.PI + R(-0.25, 0.25), 1.08);
    for (let i = 0; i < 14; i++) {
      const s = i % 2 ? 1 : -1;
      ink(spline([
        part,
        headPoint(1.5 * Math.PI + s * R(0.35, 0.9), R(1.06, 1.14)),
        headPoint(s > 0 ? R(0.0, 0.35) : Math.PI - R(0.0, 0.35), R(1.1, 1.25)),
        { x: cx + s * hrx * R(1.0, 1.35), y: sy + R(0, 55) },
      ], false, 12), { w: R(0.7, 1.3), passes: 1, alpha: 0.7, dry: chance(0.5) });
    }
  } else if (hairKind === 'beanie' && hat && pompom) {
    ink(hat.poly, { closed: true, w: 2 });
    ink([{ x: cx - hrx * 1.3, y: hat.bandY }, { x: cx + hrx * 1.3, y: hat.bandY + R(-3, 3) }], { w: 1.5, clip: hat.poly });
    for (let x = cx - hrx * 1.2; x < cx + hrx * 1.2; x += R(6, 9)) ink([{ x, y: hat.bandY + 3 }, { x: x + R(-1, 1), y: hat.bandY + 26 }], { w: 0.8, passes: 1, alpha: 0.55, clip: hat.poly });
    const pb = bbox(pompom);
    for (let k = 0; k < 7; k++) ink(arcPts((pb.x0 + pb.x1) / 2 + R(-6, 6), (pb.y0 + pb.y1) / 2 + R(-6, 6), (pb.x1 - pb.x0) * R(0.25, 0.45), (pb.y1 - pb.y0) * R(0.25, 0.45), R(0, TAU), R(0, TAU) + R(2, 5), 20, 0.3), { w: 0.9, passes: 1, alpha: 0.7 });
    ink(pompom, { closed: true, w: 1.3, jit: 1.6 });
  } else {
    const base = headPoint(1.5 * Math.PI + R(-0.3, 0.3), 0.99);
    const n = pick([1, 1, 2, 3]);
    for (let i = 0; i < n; i++) {
      const h = R(30, 75), lean = R(-30, 30);
      const pts = spline([base, { x: base.x + lean * 0.3 + R(-8, 8), y: base.y - h * 0.35 }, { x: base.x + lean * 0.7 + R(-10, 10), y: base.y - h * 0.7 }, { x: base.x + lean, y: base.y - h }], false, 10);
      ink(pts, { w: 1.4, passes: 1 });
      if (i === 0 && chance(0.6)) {
        const tip = pts[pts.length - 1]!, rot = R(-1, 1);
        const leaf = blob(tip.x + Math.cos(rot - 0.6) * 12, tip.y + Math.sin(rot - 0.6) * 12, 14, 6, 14, 0.1, rot - 0.6);
        wash(leaf, pal.accent2, { layers: 16, alpha: 0.08, v: 0.1, grain: false });
        ink(leaf, { closed: true, w: 1.1 });
        ink([tip, leaf[0]!], { w: 0.8, passes: 1 });
      }
    }
    const shine = headArc(1.5 * Math.PI + light * 0.15, 1.5 * Math.PI + light * 0.75, 20).map((q) => ({ x: q.x - (q.x - cx) * 0.12, y: q.y - (q.y - cy) * 0.12 }));
    ink(shine, { col: 'paper', w: 3.4, passes: 1, alpha: 0.75 });
  }

  // ---- eyes: whites and outlines are painted; pupils and lids are left to the animator
  const gaze = { x: R(-1, 1), y: R(-0.6, 0.6) };
  const irisCol = pick([pal.accent2, pal.hair, pal.accent, pal.bg]);
  const eyeKinds = ['round', 'almond', 'sleepy', 'button', 'round', 'almond'] as const;
  const baseKind: EyeKind = pick(eyeKinds);
  const lidCol = mix(multiply(pal.paper, mix('#ffffff', pal.skin, 0.8)), multiply(pal.paper, pal.shade), 0.25);
  const specs: EyeSpec[] = [];

  function lidProfile(shape: Pt[]): Pick<EyeSpec, 'lidX' | 'lidTop' | 'lidBottom'> {
    const bb = bbox(shape), n = 14;
    const lidX: number[] = [], lidTop: number[] = [], lidBottom: number[] = [];
    for (let i = 0; i <= n; i++) {
      const x = bb.x0 + ((bb.x1 - bb.x0) * i) / n;
      let lo = Infinity, hi = -Infinity;
      for (let a = 0, b = shape.length - 1; a < shape.length; b = a++) {
        const p = shape[a]!, q = shape[b]!;
        if ((p.x <= x && q.x >= x) || (q.x <= x && p.x >= x)) {
          const y = Math.abs(q.x - p.x) < 1e-6 ? p.y : p.y + ((x - p.x) * (q.y - p.y)) / (q.x - p.x);
          lo = Math.min(lo, y); hi = Math.max(hi, y);
        }
      }
      const mid = (bb.y0 + bb.y1) / 2;
      lidX.push(x);
      lidTop.push(Number.isFinite(lo) ? lo : mid);
      lidBottom.push(Number.isFinite(hi) ? hi : mid);
    }
    return { lidX, lidTop, lidBottom };
  }

  function addEye(e: { x: number; y: number; r: number }, kind: EyeKind) {
    const { x, y, r } = e;
    const skew = { x: R(-0.6, 0.6) * weird, y: R(-0.5, 0.5) * weird };
    if (kind === 'button') {
      wash(blob(x, y + 1, r * 0.95, r * 0.9, 10, 0.2), pal.shade, { layers: 10, alpha: 0.06, v: 0.1, grain: false, shift: 1 });
      const clip = blob(x, y, r * 0.66, r * 0.7, 24, 0.05);
      specs.push({
        kind, x, y, r, clip, ...lidProfile(clip), restOpen: 1, skew, iris: null, spiral: null,
        pupil: blob(x, y, r * 0.5, r * 0.55, 14, 0.12), highlight: blob(x - r * 0.17, y - r * 0.2, r * 0.13, r * 0.13, 8, 0.1),
        lidCol, lidW: 1.8 * INK_WEIGHT,
      });
      return;
    }
    let shape: Pt[];
    if (kind === 'round' || kind === 'spiral') shape = blob(x, y, r, r * R(0.88, 1.08), 60, 0.06);
    else {
      const h = r * (kind === 'sleepy' ? R(0.5, 0.65) : R(0.55, 0.78)), tilt = R(-0.15, 0.15) * weird * r;
      const up = spline([{ x: x - r, y: y + tilt }, { x: x - r * 0.35, y: y - h }, { x: x + r * 0.4, y: y - h * R(0.9, 1.1) }, { x: x + r, y: y - tilt }], false, 10);
      const lo = spline([{ x: x + r, y: y - tilt }, { x: x + r * 0.4, y: y + h * R(0.6, 0.8) }, { x: x - r * 0.35, y: y + h * R(0.6, 0.8) }, { x: x - r, y: y + tilt }], false, 10);
      shape = up.concat(lo.slice(1, -1));
    }
    solid(shape, 'paper', 0.9);
    let spiral: InkOp | null = null, iris: WashOp | null = null;
    if (kind === 'spiral') {
      const pts: Pt[] = [], a0 = R(0, TAU);
      for (let t = 0; t <= 1; t += 0.01) pts.push({ x: Math.cos(a0 + t * 3.2 * TAU) * r * 0.85 * t, y: Math.sin(a0 + t * 3.2 * TAU) * r * 0.85 * t });
      spiral = makeInk(pts, { w: 1.3, passes: 1 });
    } else {
      iris = makeWash(blob(x, y, r * 0.58, r * 0.58, 10, 0.1), irisCol, { layers: 14, alpha: 0.09, v: 0.06, grain: false, shift: 1 });
    }
    const restOpen = kind === 'sleepy' ? R(0.42, 0.58) : 1;
    ink(shape, { closed: true, w: 1.5 });
    if (chance(0.4)) {
      const upper = shape.filter((q) => q.y < y - r * 0.25);
      const n = Math.floor(R(3, 6));
      for (let i = 0; i < n; i++) {
        const b = upper[Math.floor(((i + 0.5) * upper.length) / n)];
        if (!b) continue;
        const dx = b.x - x, dy = b.y - (y + r * 0.4), d = Math.hypot(dx, dy), l = r * R(0.3, 0.5);
        ink([b, { x: b.x + (dx / d) * l, y: b.y + (dy / d) * l }], { w: 1.1, passes: 1 });
      }
    }
    if (chance(0.35)) ink(arcPts(x, y + r * 0.2, r * 0.8, r * 0.55, 0.4, Math.PI - 0.4, 16, 0.05), { w: 0.9, passes: 1, alpha: 0.55 });
    const clip = shrink(shape, 0.96);
    specs.push({
      kind, x, y, r, clip, ...lidProfile(clip), restOpen, skew, iris, spiral,
      pupil: blob(x, y, r * 0.28, r * 0.28, 12, 0.12), highlight: blob(x - r * 0.12, y - r * 0.14, r * 0.09, r * 0.09, 8, 0.1),
      lidCol, lidW: 2.4 * INK_WEIGHT,
    });
  }
  for (const e of eyes) addEye(e, chance(0.25 * weird) ? pick([...eyeKinds, 'spiral'] as const) : baseKind);

  // brows
  const browKind = pick(['line', 'line', 'hairy', 'thick'] as const);
  for (const e of eyes) {
    if (!chance(0.85)) continue;
    const s = Math.sign(e.x - cx) || (chance(0.5) ? 1 : -1);
    const tilt = R(-0.45, 0.45) * weird * e.r;
    const inner = { x: e.x - s * e.r * 0.95, y: e.y - e.r * 1.35 + tilt };
    const mid = { x: e.x + s * e.r * 0.1, y: e.y - e.r * R(1.5, 1.85) };
    const outer = { x: e.x + s * e.r * 1.15, y: e.y - e.r * 1.3 - tilt * 0.4 };
    const path = spline([inner, mid, outer], false, 12);
    if (browKind === 'hairy') {
      path.forEach((q, i) => { if (i % 2 === 0) ink([{ x: q.x + R(-2, 2), y: q.y + R(1, 4) }, { x: q.x + s * R(2, 5), y: q.y - R(2, 5) }], { w: 1, passes: 1 }); });
    } else if (browKind === 'thick') {
      const band = path.map((q) => ({ x: q.x, y: q.y - 3 })).concat(path.slice().reverse().map((q) => ({ x: q.x, y: q.y + 3 })));
      wash(sparse(band, 12), pal.hair2, { layers: 14, alpha: 0.1, v: 0.05, grain: false, shift: 1 });
      ink(path, { w: 2.2 });
    } else ink(path, { w: R(2.2, 3.4) });
  }

  // nose
  const nd = chance(0.5) ? 1 : -1;
  const noseKind = pick(['hook', 'bulb', 'tri', 'long', 'dots', 'bulb', 'hook'] as const);
  if (noseKind === 'hook') {
    ink(spline([{ x: cx + nd * 2, y: eyeY + hry * 0.06 }, { x: cx + nd * hrx * 0.07, y: noseY - hry * 0.12 }, { x: cx + nd * hrx * R(0.15, 0.25), y: noseY }, { x: cx + nd * hrx * 0.03, y: noseY + R(5, 9) }, { x: cx - nd * hrx * 0.08, y: noseY + 2 }], false, 10), { w: 1.8 });
    wash(blob(cx + nd * hrx * 0.05, noseY + 4, hrx * 0.12, hrx * 0.06, 10, 0.2), pal.shade, { layers: 10, alpha: 0.07, v: 0.15, grain: false });
  } else if (noseKind === 'bulb') {
    const nr = hrx * R(0.11, 0.2);
    wash(blob(cx + nd * 3, noseY, nr, nr * R(0.8, 1.05), 12, 0.15), chance(0.5) ? pal.blush : pal.shade, { layers: 20, alpha: 0.06, v: 0.1 });
    ink(arcPts(cx + nd * 3, noseY, nr, nr * 0.95, -0.2, Math.PI + 0.2, 30, 0.06), { w: 1.7 });
    solid(blob(cx + nd * 3 - nr * 0.35, noseY + nr * 0.35, 1.8, 1.4, 6, 0.2), pal.ink, 0.85);
    solid(blob(cx + nd * 3 + nr * 0.35, noseY + nr * 0.35, 1.8, 1.4, 6, 0.2), pal.ink, 0.85);
  } else if (noseKind === 'tri') {
    ink([{ x: cx + R(-2, 2), y: eyeY + hry * 0.1 }, { x: cx + nd * hrx * R(0.12, 0.2), y: noseY + 4 }, { x: cx - nd * hrx * 0.06, y: noseY + 7 }], { w: 1.7 });
  } else if (noseKind === 'long') {
    const nose = blob(cx + nd * hrx * 0.32, noseY - 2, hrx * R(0.32, 0.45), hrx * R(0.08, 0.11), 30, 0.1, nd * R(0.05, 0.3));
    wash(sparse(nose, 14), pal.skin, { layers: 18, alpha: 0.06, v: 0.06 });
    solid(nose, 'paper', 0.25);
    ink(nose, { closed: true, w: 1.7 });
  } else {
    solid(blob(cx - 5, noseY + 3, 2, 1.6, 6, 0.2), pal.ink, 0.85);
    solid(blob(cx + 5, noseY + 3, 2, 1.6, 6, 0.2), pal.ink, 0.85);
    ink(arcPts(cx, noseY - 2, 9, 6, 0.3, Math.PI - 0.3, 12, 0.1), { w: 1.1, passes: 1 });
  }

  // mouth
  const mw = hrx * R(0.3, 0.6), mx = cx + R(-8, 8) * weird, my = mouthY;
  const mouthKind = pick(['smile', 'smile', 'frown', 'wavy', 'open', 'grin', 'o', 'smirk', 'open'] as const);
  if (mouthKind === 'smile' || mouthKind === 'frown' || mouthKind === 'smirk') {
    const sag = (mouthKind === 'frown' ? -1 : 1) * R(5, 15), sm = mouthKind === 'smirk' ? 1 : 0;
    const pts = spline([{ x: mx - mw, y: my - sag * 0.3 + sm * 6 }, { x: mx - mw * 0.4, y: my + sag * 0.8 }, { x: mx + mw * 0.4, y: my + sag * 0.85 }, { x: mx + mw, y: my - sag * 0.35 - sm * 12 }], false, 12);
    if (chance(0.5)) wash(blob(mx, my + sag * 0.55 + 3, mw * 0.7, R(4, 7), 12, 0.2), pal.blush, { layers: 14, alpha: 0.07, v: 0.1, grain: false });
    ink(pts, { w: 2.3 });
    if (chance(0.6)) for (const end of [pts[0]!, pts[pts.length - 1]!]) ink(arcPts(end.x, end.y, 4, 4, end.x < mx ? 2.2 : -1.0, end.x < mx ? 4.0 : 0.8, 6, 0.1), { w: 1.1, passes: 1 });
  } else if (mouthKind === 'wavy') {
    const f = R(1.5, 2.6), amp = R(2.5, 5);
    ink(Array.from({ length: 41 }, (_, i) => ({ x: mx - mw + (2 * mw * i) / 40, y: my + Math.sin((i / 40) * TAU * f) * amp })), { w: 2 });
  } else if (mouthKind === 'o') {
    const orr = R(6, 12);
    const o = blob(mx, my + 4, orr * 0.85, orr, 30, 0.1);
    wash(sparse(o, 10), MOUTH_DARK, { layers: 18, alpha: 0.09, v: 0.05, grain: false, shift: 1 });
    ink(o, { closed: true, w: 1.8 });
  } else {
    const wide = mouthKind === 'grin' ? 1.25 : 1, mh = mouthKind === 'grin' ? R(10, 16) : R(14, 28);
    const up = spline([{ x: mx - mw * wide, y: my }, { x: mx - mw * 0.4, y: my - R(1, 5) }, { x: mx + mw * 0.4, y: my - R(1, 5) }, { x: mx + mw * wide, y: my }], false, 10);
    const lo = spline([{ x: mx + mw * wide, y: my }, { x: mx + mw * 0.5, y: my + mh }, { x: mx - mw * 0.5, y: my + mh * R(0.85, 1.1) }, { x: mx - mw * wide, y: my }], false, 10);
    const shape = up.concat(lo.slice(1, -1));
    if (mouthKind === 'grin') {
      solid(shape, 'paper', 0.9);
      ink([{ x: mx - mw * 1.3, y: my + mh * 0.45 }, { x: mx + mw * 1.3, y: my + mh * 0.45 + R(-2, 2) }], { w: 1.1, passes: 1, clip: shape });
      for (let x = mx - mw; x < mx + mw; x += R(7, 11)) ink([{ x, y: my - 6 }, { x: x + R(-1, 1), y: my + mh + 6 }], { w: 1, passes: 1, clip: shape });
    } else {
      wash(sparse(shape, 14), MOUTH_DARK, { layers: 22, alpha: 0.08, v: 0.04, clip: shape, shift: 1 });
      wash(blob(mx + R(-mw * 0.2, mw * 0.2), my + mh * 0.85, mw * 0.5, mh * 0.42, 12, 0.15), pal.blush, { layers: 16, alpha: 0.09, v: 0.08, clip: shape, grain: false });
      const nt = pick([1, 2, 2, 3]);
      for (let i = 0; i < nt; i++) {
        const tx = mx + R(-mw * 0.6, mw * 0.5), tw = R(6, 11), th = R(6, 10);
        const tooth = [{ x: tx, y: my - 4 }, { x: tx + tw, y: my - 4 }, { x: tx + tw + R(-1, 1), y: my + th }, { x: tx + R(-1, 1), y: my + th + R(-1, 1) }];
        solid(tooth, 'paper', 0.95, shape);
        ink(tooth, { closed: true, w: 1, passes: 1, clip: shape });
      }
    }
    ink(shape, { closed: true, w: 2 });
  }

  // ---- oddities
  if (chance(0.45)) {
    const n = Math.floor(R(12, 30));
    for (let i = 0; i < n; i++) {
      const fx = cx + gauss() * hrx * 0.42, fy = noseY - hry * 0.06 + gauss() * hry * 0.07;
      if (inside({ x: fx, y: fy }, head)) solid(blob(fx, fy, R(0.6, 1.5), R(0.6, 1.5), 6, 0.2), chance(0.5) ? pal.ink : pal.shade, 0.6);
    }
  }
  const [e0, e1] = eyes;
  if (eyeCount === 2 && e0 && e1 && chance(0.25)) {
    const rims = eyes.map((e) => blob(e.x, e.y, e.r * R(1.45, 1.7), e.r * R(1.35, 1.6), 50, 0.04));
    for (const rim of rims) wash(sparse(rim, 12), pal.bg2, { layers: 8, alpha: 0.04, v: 0.05, grain: false, shift: 1 });
    for (const rim of rims) ink(rim, { closed: true, w: 1.8 });
    const [l, r] = e0.x < e1.x ? [rims[0]!, rims[1]!] : [rims[1]!, rims[0]!];
    const far = (pts: Pt[], dir: number) => pts.reduce((a, q) => (q.x * dir > a.x * dir ? q : a));
    const lr = far(l, 1), rl = far(r, -1), ll = far(l, -1), rr = far(r, 1);
    ink(spline([lr, { x: (lr.x + rl.x) / 2, y: Math.min(lr.y, rl.y) - 5 }, rl], false, 8), { w: 1.6 });
    ink([ll, { x: headPoint(Math.PI).x + 2, y: ll.y - 4 }], { w: 1.4 });
    ink([rr, { x: headPoint(0).x - 2, y: rr.y - 4 }], { w: 1.4 });
  }
  if ((mouthKind === 'smile' || mouthKind === 'frown' || mouthKind === 'wavy' || mouthKind === 'smirk') && chance(0.18)) {
    wash(blob(mx, my - 8, mw * 0.95, 6, 16, 0.25), pal.hair, { layers: 16, alpha: 0.07, v: 0.1 });
    for (let i = 0; i < 22; i++) {
      const sx = mx - mw * 0.9 + (1.8 * mw * i) / 21, s = sx < mx ? -1 : 1;
      ink([{ x: sx, y: my - 13 + R(-2, 2) }, { x: sx + s * R(2, 5), y: my - 3 + R(-2, 2) }], { w: 1, passes: 1 });
    }
  }
  if (chance(0.3)) {
    const lines = pick([2, 3]);
    for (let i = 0; i < lines; i++) {
      const wy = topEye - baseR * 1.4 - 6 - i * 6;
      if (!cover || !inside({ x: cx, y: wy }, cover)) ink(Array.from({ length: 13 }, (_, k) => ({ x: cx - hrx * 0.28 + (hrx * 0.56 * k) / 12, y: wy + Math.sin(k * 0.9 + i) * 1.6 })), { w: 0.9, passes: 1, alpha: 0.6 });
    }
  }
  if (chance(0.3)) solid(blob(cx + R(-hrx, hrx) * 0.6, cy + R(0, hry * 0.5), 2.2, 2.2, 8, 0.2), pal.ink, 0.85);
  if (chance(0.12)) {
    const bx = cx - light * hrx * 0.6, by = eyeY + hry * 0.38, rot = R(-0.6, 0.6);
    const at = (u: number, v: number) => ({ x: bx + u * Math.cos(rot) - v * Math.sin(rot), y: by + u * Math.sin(rot) + v * Math.cos(rot) });
    const band = [at(-16, -6), at(16, -6), at(16, 6), at(-16, 6)];
    wash(band, '#e3b98f', { layers: 14, alpha: 0.12, v: 0.03, grain: false, shift: 0 });
    ink(band, { closed: true, w: 1.2 });
    for (const [u, v] of [[-4, -2], [4, -2], [-4, 2], [4, 2]] as const) {
      const c = at(u, v);
      solid(blob(c.x, c.y, 0.9, 0.9, 6, 0.1), pal.ink, 0.6);
    }
  }
  if (chance(0.12)) {
    const dx = cx + light * hrx * 0.95, dy = cy - hry * 0.45;
    const drop = spline([{ x: dx, y: dy - 12 }, { x: dx + 6, y: dy + 2 }, { x: dx, y: dy + 8 }, { x: dx - 6, y: dy + 2 }], true, 8);
    wash(sparse(drop, 10), '#7fb3d5', { layers: 14, alpha: 0.1, v: 0.05, grain: false, shift: 1 });
    ink(drop, { closed: true, w: 1.2 });
  }
  if (ears.length && chance(0.4)) {
    const e = ears[Math.floor(R(0, ears.length))]!;
    const ring = arcPts(e.x + e.s * 2, e.y + e.ry + 6, 5, 6, 0, TAU, 20, 0.08);
    wash(sparse(ring, 8), pal.bg2, { layers: 12, alpha: 0.1, v: 0.05, grain: false, shift: 1 });
    ink(ring, { closed: true, w: 1.2, passes: 1 });
  }

  return {
    seed, pal, back, figure, eyes: specs,
    pivot: { x: cx, y: headBottom },
    gaze,
    temper: { breathe: R(3.2, 5.5), sway: R(0.5, 1.1), blinkEvery: R(2.5, 6), phase: R(0, TAU) },
  };
}
