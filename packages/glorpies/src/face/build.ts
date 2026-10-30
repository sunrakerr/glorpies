import type { Engine } from '../engine';
import { bbox, inside, ribbon, shift, shrink, sparse, spline, TAU, type Pt } from '../geometry';
import { mix, multiply, PALETTES } from '../palettes';
import type { Color, EyeKind, EyeSpec, Face, HairKind, HatchOp, InkOp, Op, Sketch, WashOp } from './types';
import { GRAPHITE, W } from './types';

/** Pen lines are drawn this many times heavier than the authored widths. */
const INK_WEIGHT = 2;

type WashOpts = Partial<Omit<WashOp, 'k' | 'seed' | 'pts' | 'col'>>;
type InkOpts = Partial<Omit<InkOp, 'k' | 'seed' | 'pts'>> & { raw?: boolean };
type HatchOpts = Partial<Omit<HatchOp, 'k' | 'seed' | 'region'>>;

const MOUTH_DARK = '#4a0f2a';
const GUM = '#ff6f9c';
const BONE = '#f3e8c8';
const DROOL = '#8fd8ff';

/**
 * Every name is an alien: a lumpy head in a colour no person has, eyes in
 * the wrong number and size, something growing out of the top, and a mouth
 * with too many or too few teeth.
 *
 * The order of the random draws below is part of every name's face: removing
 * or reordering a single draw changes the face of every name.
 */
export function buildFace(seed: number, E: Engine): Face {
  E.seed(seed);
  E.noiseSeed(seed);
  const R = (a: number, b: number) => E.random(a, b);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.min(arr.length - 1, Math.floor(E.random(0, arr.length)))]!;
  const chance = (q: number) => E.random(0, 1) < q;
  const gauss = () => E.gauss();
  const nextSeed = () => Math.floor(E.random(0, 2147483647));

  const pal = pick(PALETTES);
  const weird = R(0.6, 1);
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
  /** A four-pointed sparkle. */
  function star(x: number, y: number, r: number, rot = 0): Pt[] {
    return Array.from({ length: 8 }, (_, i) => {
      const a = rot + (i / 8) * TAU, rr = i % 2 ? r * 0.26 : r;
      return { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr };
    });
  }
  /** The outline of a limb tapering from `w0` to `w1` along a centreline. */
  const limb = (line: Pt[], w0: number, w1: number) => ribbon(line, line.map((_, i) => w0 + ((w1 - w0) * i) / (line.length - 1)));
  /** Short pen ticks across a limb, like the rings on a horn or the segments of a stalk. */
  function rings(line: Pt[], w0: number, w1: number, n: number, o: InkOpts = {}) {
    for (let k = 1; k <= n; k++) {
      const i = Math.floor((k / (n + 1)) * (line.length - 1));
      const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!, c = line[i]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1, h = (w0 + ((w1 - w0) * i) / (line.length - 1)) * 0.42;
      const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
      ink([{ x: c.x + nx * h, y: c.y + ny * h }, { x: c.x - nx * h, y: c.y - ny * h + R(-1, 1) }], { w: 0.9, passes: 1, alpha: 0.7, ...o });
    }
  }

  // ================= geometry =================
  const eyePlan = pick(['two', 'two', 'two', 'mismatch', 'mismatch', 'one', 'one', 'three', 'row', 'cluster', 'grey', 'stalks'] as const);
  const headKind = pick(['dome', 'dome', 'egg', 'pear', 'pear', 'bean', 'peanut', 'tall', 'lumpy', 'lumpy', 'wide'] as const);
  const cx = W / 2 + R(-10, 10), cy = W * (eyePlan === 'stalks' ? 0.58 : 0.54) + R(-6, 6);
  let hrx = W * R(0.25, 0.31), hry = W * R(0.28, 0.33);
  if (headKind === 'tall') { hrx *= 0.8; hry *= 1.08; }
  if (headKind === 'wide') { hrx *= 1.2; hry *= 0.86; }
  if (headKind === 'dome') { hrx *= 1.06; hry *= 1.04; }
  if (eyePlan === 'stalks') hry *= 0.9;
  const sq = headKind === 'wide' ? R(0.6, 0.8) : 1;
  const taperK = headKind === 'dome' ? -R(0.3, 0.42) : headKind === 'egg' ? -R(0.1, 0.2) : headKind === 'pear' ? R(0.18, 0.32) : 0;
  const hNo = R(0, 100), hWob = (headKind === 'lumpy' ? 0.3 : 0.12) + 0.15 * weird, hRot = R(-0.14, 0.14) * weird;
  function headPoint(a: number, scale = 1): Pt {
    const c = Math.cos(a), s = Math.sin(a);
    let x = Math.sign(c) * Math.pow(Math.abs(c), sq) * hrx;
    let y = Math.sign(s) * Math.pow(Math.abs(s), sq) * hry;
    x *= 1 + taperK * s;
    if (headKind === 'bean') x += hrx * 0.12 * Math.sin(2 * a);
    if (headKind === 'peanut') x *= 1 - 0.24 * Math.exp(-((s - 0.2) ** 2) / 0.06);
    const r = (1 + hWob * (E.noise(hNo + c * 1.4, hNo + s * 1.4) - 0.5) * 2) * scale;
    x *= r; y *= r;
    return { x: cx + x * Math.cos(hRot) - y * Math.sin(hRot), y: cy + x * Math.sin(hRot) + y * Math.cos(hRot) };
  }
  /** As far out along `a` as `want`, but never off the top of the sheet. */
  function reach(a: number, want: number, margin = 12): Pt {
    let k = want, p = headPoint(a, k);
    while (p.y < margin && k > 1.02) p = headPoint(a, (k -= 0.03));
    return p;
  }
  const headArc = (a0: number, a1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => headPoint(a0 + ((a1 - a0) * i) / n));
  const head = Array.from({ length: 160 }, (_, i) => headPoint((i / 160) * TAU));
  const headSparse = Array.from({ length: 18 }, (_, i) => headPoint((i / 18) * TAU));
  const headTop = Math.min(...head.map((q) => q.y));
  const headBottom = Math.max(...head.map((q) => q.y));
  const headIn = shrink(head, 0.97);
  const headCore = shrink(head, 0.78);
  const light = chance(0.5) ? 1 : -1;

  // ---- eyes: how many, how big, and where
  type EyeAt = { x: number; y: number; r: number; tilt?: number; stalk?: Pt[] };
  const eyeY = cy - hry * R(0.04, 0.18);
  const spread = hrx * R(0.36, 0.5);
  let faceEyes: EyeAt[] = [];
  if (eyePlan === 'one') faceEyes = [{ x: cx + R(-6, 6), y: eyeY - hry * R(0, 0.08), r: hrx * R(0.28, 0.42) }];
  else if (eyePlan === 'two') {
    const r = hrx * R(0.15, 0.24);
    faceEyes = [-1, 1].map((k) => ({ x: cx + k * spread + R(-5, 5) * weird, y: eyeY + R(-1, 1) * hry * 0.06, r: r * (1 + R(-0.25, 0.25) * weird) }));
  } else if (eyePlan === 'mismatch') {
    // one bulging, one shrivelled: the giveaway of something not from here
    const big = chance(0.5) ? -1 : 1, r = hrx * R(0.16, 0.22);
    faceEyes = [-1, 1].map((k) => ({ x: cx + k * spread * (k === big ? 1.05 : 0.9), y: eyeY + (k === big ? -hry * 0.04 : hry * R(0.02, 0.1)), r: r * (k === big ? R(1.45, 1.8) : R(0.5, 0.7)) }));
  } else if (eyePlan === 'three') {
    const r = hrx * R(0.13, 0.2);
    faceEyes = [-1.1, 0, 1.1].map((k) => ({ x: cx + k * spread + R(-4, 4) * weird, y: eyeY - (k === 0 ? hry * R(0.18, 0.28) : 0), r: r * (k === 0 ? R(0.8, 1.25) : 1) }));
  } else if (eyePlan === 'row') {
    const n = pick([4, 4, 5]), r = hrx * R(0.09, 0.13);
    faceEyes = Array.from({ length: n }, (_, i) => {
      const u = (i / (n - 1)) * 2 - 1;
      return { x: cx + u * hrx * R(0.56, 0.62), y: eyeY - (1 - u * u) * hry * R(0.06, 0.14), r: r * R(0.8, 1.2) };
    });
  } else if (eyePlan === 'cluster') {
    const n = Math.floor(R(4, 8));
    for (let tries = 0; faceEyes.length < n && tries < 400; tries++) {
      const e = { x: cx + R(-0.62, 0.62) * hrx, y: eyeY + R(-0.42, 0.12) * hry, r: hrx * R(0.07, 0.18) };
      if (!inside(e, headCore)) continue;
      if (faceEyes.some((o) => Math.hypot(o.x - e.x, o.y - e.y) < o.r + e.r + 5)) continue;
      faceEyes.push(e);
    }
  } else if (eyePlan === 'grey') {
    const r = hrx * R(0.28, 0.34), tilt = R(0.22, 0.36);
    faceEyes = [-1, 1].map((k) => ({ x: cx + k * hrx * R(0.4, 0.46), y: eyeY + hry * 0.04, r, tilt: -k * tilt * r }));
  } else if (chance(0.45)) faceEyes = [{ x: cx + R(-6, 6), y: eyeY, r: hrx * R(0.1, 0.15) }];

  const stalkEyes: EyeAt[] = [];
  if (eyePlan === 'stalks') {
    const n = pick([2, 2, 3]);
    for (let i = 0; i < n; i++) {
      const a = 1.5 * Math.PI + (i - (n - 1) / 2) * R(0.42, 0.6) + R(-0.06, 0.06);
      const base = headPoint(a, 0.94), r = hrx * R(0.13, 0.19);
      const len = Math.min(R(55, 90), base.y - r - 14);
      const dir = a + R(-0.25, 0.25) * weird, sway = R(-12, 12);
      const tip = { x: base.x + Math.cos(dir) * len, y: base.y + Math.sin(dir) * len };
      const line = spline([base, { x: base.x + Math.cos(dir) * len * 0.45 + sway, y: base.y + Math.sin(dir) * len * 0.45 }, { x: tip.x - Math.cos(dir) * r * 0.6, y: tip.y - Math.sin(dir) * r * 0.6 }], false, 10);
      stalkEyes.push({ x: tip.x, y: tip.y, r, stalk: line });
    }
  }
  const eyes = [...faceEyes, ...stalkEyes];
  const maxR = Math.max(hrx * 0.12, ...faceEyes.map((e) => e.r));
  const topEye = faceEyes.length ? Math.min(...faceEyes.map((e) => e.y - e.r)) : eyeY - maxR;
  const lowEye = faceEyes.length ? Math.max(...faceEyes.map((e) => e.y + e.r)) : eyeY;
  const noseY = Math.max(eyeY + hry * R(0.26, 0.38), lowEye + 8);
  const mouthY = Math.min(noseY + hry * R(0.18, 0.28), headBottom - hry * 0.2);
  // a measurement no longer used; its draw stays, because every draw after it depends on it
  R(10, 30);

  // ---- what grows out of the top
  const crown: HairKind = eyePlan === 'stalks' ? 'stalks'
    : pick(['antennae', 'antennae', 'antennae', 'horns', 'horns', 'spines', 'brain', 'frill', 'halo', 'halo', 'crystals', 'tentacles', 'bald', 'bald'] as const);
  const hairLimit = topEye - 6;
  let cover: Pt[] | null = null;
  let coverA: [number, number] | null = null;
  let crownTips: Pt[] = [];
  if (crown === 'spines') {
    const n = Math.floor(R(7, 13)), a0 = Math.PI + 0.25, a1 = TAU - 0.25;
    const tips = [headPoint(a0, 1.0)];
    for (let i = 0; i < n; i++) {
      tips.push(reach(a0 + ((a1 - a0) * (i + 0.5)) / n + R(-0.05, 0.05), 1 + R(0.2, 0.5) * weird));
      tips.push(headPoint(a0 + ((a1 - a0) * (i + 1)) / n, R(1.0, 1.05)));
    }
    const hy = Math.min(cy - hry * R(0.45, 0.62), hairLimit);
    const hl = spline([tips[tips.length - 1]!, { x: cx + hrx * 0.5, y: hy }, { x: cx, y: hy + R(-4, 8) }, { x: cx - hrx * 0.5, y: hy }, tips[0]!], false, 8);
    crownTips = tips;
    cover = tips.concat(hl.slice(1, -1));
    coverA = [a0, a1];
  } else if (crown === 'brain') {
    const d = R(0.05, 0.3), sc = R(1.06, 1.14), hy = Math.min(cy - hry * R(0.32, 0.5), hairLimit);
    coverA = [Math.PI - d, TAU + d];
    const top: Pt[] = [];
    for (let i = 0; i <= 24; i++) top.push(headPoint(coverA[0] + ((coverA[1] - coverA[0]) * i) / 24, sc * (1 + R(-0.02, 0.04))));
    const L = top[0]!, Rt = top[top.length - 1]!;
    // a rim of skin it bulges out of, as if the skull were left open
    const rim = spline([Rt, { x: cx + hrx * 0.7, y: hy + R(-4, 4) }, { x: cx + R(-10, 10), y: hy + R(4, 12) }, { x: cx - hrx * 0.7, y: hy + R(-4, 4) }, L], false, 8);
    cover = top.concat(rim.slice(1, -1));
  }

  const holes: Pt[][] = [headIn];
  if (cover) holes.push(shrink(cover, 0.97));

  // the named parts, filled in as they are drawn
  const parts: Sketch['parts'] = [];
  let hairCol: Color = pal.hair;
  const brows: Pt[][] = [];
  let nosePts: Pt[] = [];
  let mouth: Pick<Sketch['mouth'], 'kind' | 'line' | 'shape'> = { kind: 'smile', line: [], shape: null };
  const browOps: [number, number][] = [];
  const blush: Pt[][] = [];

  /** A filled appendage: glazed, inked round, and recorded for the small styles. Behind the head unless `front`. */
  const part = (pts: Pt[], col: Color, front: boolean, o: WashOpts = {}, w = 1.6, loose = false) => {
    wash(pts, col, { layers: 22, alpha: 0.07, v: 0.1, shift: 2, ...(front ? {} : { exclude: [headIn] }), ...o });
    if (w > 0) ink(pts, { closed: true, w });
    parts.push(loose ? { pts, col, front, loose } : { pts, col, front });
  };

  // ================= backdrop =================
  back.push({ k: 'paper', seed: nextSeed() });
  const graphite: InkOpts = { raw: true, col: GRAPHITE, alpha: 0.16, w: 0.7, passes: 1, jit: 0.5 };
  ink(arcPts(cx + R(-6, 6), cy + R(-6, 6), hrx * R(0.98, 1.1), hry * R(0.98, 1.08), R(0, TAU), R(0, TAU) + R(5, 6.6), 60, 0.03), graphite);
  ink([{ x: cx + R(-4, 4), y: cy - hry * 1.12 }, { x: cx + R(-4, 4), y: cy + hry * 1.12 }], { ...graphite, alpha: 0.08 });
  ink([{ x: cx - hrx * 1.2, y: eyeY + R(-3, 3) }, { x: cx + hrx * 1.2, y: eyeY + R(-3, 3) }], { ...graphite, alpha: 0.13 });
  wash(blob(W / 2 + R(-50, 50), W / 2 + R(-40, 40), W * R(0.4, 0.48), W * R(0.38, 0.46), 14, 0.3, R(0, TAU)), pal.bg, { layers: 30, alpha: 0.06, v: 0.22, exclude: holes, bloom: 0.7 });
  if (chance(0.85)) wash(blob(R(W * 0.15, W * 0.85), R(W * 0.12, W * 0.5), W * R(0.1, 0.2), W * R(0.09, 0.18), 12, 0.3), pal.bg2, { layers: 22, alpha: 0.06, v: 0.2, exclude: holes });
  // the sky it came from: sparkles, specks of stars, sometimes a ringed planet
  const clear = (x: number, y: number, pad: number) => ((x - cx) / (hrx * 1.35 + pad)) ** 2 + ((y - cy) / (hry * 1.3 + pad)) ** 2 > 1;
  for (let i = 0, n = Math.floor(R(3, 7)), tries = 0; i < n && tries < 80; tries++) {
    const x = R(18, W - 18), y = R(18, W - 18), r = R(5, 12);
    if (!clear(x, y, r)) continue;
    i++;
    const s = star(x, y, r, R(-0.3, 0.3));
    wash(s, pick([pal.accent2, pal.accent, '#ffffff']), { layers: 8, alpha: 0.18, v: 0.05, grain: false, shift: 0 });
    ink(s, { closed: true, w: 0.8, passes: 1, alpha: 0.75 });
  }
  for (let i = 0, n = Math.floor(R(8, 20)); i < n; i++) {
    const x = R(8, W - 8), y = R(8, W - 8);
    if (clear(x, y, 0)) solid(blob(x, y, R(0.8, 2), R(0.8, 2), 6, 0.2), pal.ink, R(0.4, 0.8));
  }
  if (chance(0.35)) {
    for (let tries = 0; tries < 40; tries++) {
      const r = R(11, 20), x = R(r + 24, W - r - 24), y = R(r + 20, W * 0.6);
      if (!clear(x, y, r * 1.8)) continue;
      const ball = blob(x, y, r, r, 20, 0.05), rot = R(-0.5, 0.5);
      wash(ball, pick([pal.bg2, pal.hair, pal.accent]), { layers: 14, alpha: 0.12, v: 0.06, grain: false, shift: 1 });
      ink(ball, { closed: true, w: 1, passes: 1 });
      const ring = arcPts(0, 0, r * 1.8, r * 0.45, 0.1, Math.PI - 0.1, 24, 0.02).map((q) => ({ x: x + q.x * Math.cos(rot) - q.y * Math.sin(rot), y: y + q.x * Math.sin(rot) + q.y * Math.cos(rot) }));
      ink(ring, { w: 1, passes: 1 });
      break;
    }
  }

  // ================= figure: behind the head =================
  out = figure;
  let nimbus = false;
  if (crown === 'frill') {
    const n = Math.floor(R(5, 9)), a0 = Math.PI + 0.1, a1 = TAU - 0.1, step = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      const a = a0 + step * (i + 0.5), tip = reach(a + R(-0.06, 0.06), R(1.28, 1.5));
      const b0 = headPoint(a - step * 0.55, 0.92), b1 = headPoint(a + step * 0.55, 0.92);
      const fin = spline([b0, { x: (b0.x + tip.x) / 2 - (tip.y - b0.y) * 0.08, y: (b0.y + tip.y) / 2 }, tip, { x: (b1.x + tip.x) / 2, y: (b1.y + tip.y) / 2 }, b1], false, 6);
      part(fin, i % 2 ? pal.hair : pal.hair2, false);
      ink([headPoint(a, 1.0), { x: tip.x * 0.85 + headPoint(a).x * 0.15, y: tip.y * 0.85 + headPoint(a).y * 0.15 }], { w: 0.9, passes: 1, alpha: 0.6 });
    }
    hairCol = pal.hair;
  } else if (crown === 'halo' && chance(0.45)) {
    nimbus = true;
    // a nimbus: a gold disc behind the head, with rays
    const nr = Math.min(hrx * R(1.2, 1.38), cy - 10), disc = blob(cx, cy - hry * 0.1, nr, nr, 48, 0.03);
    part(disc, mix(pal.accent2, '#ffffff', 0.35), false, { layers: 16, alpha: 0.04, v: 0.05, bloom: 0.5 }, 1.2, true);
    for (let i = 0, n = Math.floor(R(14, 22)); i < n; i++) {
      const a = (i / n) * TAU + R(-0.05, 0.05), r0 = nr * 1.04, r1 = nr * R(1.1, 1.22);
      const p0 = { x: cx + Math.cos(a) * r0, y: cy - hry * 0.1 + Math.sin(a) * r0 }, p1 = { x: cx + Math.cos(a) * r1, y: cy - hry * 0.1 + Math.sin(a) * r1 };
      if (p1.y > 6 && p1.y < W - 6 && p1.x > 6 && p1.x < W - 6) ink([p0, p1], { w: 0.9, passes: 1, alpha: 0.7 });
    }
    hairCol = pal.accent2;
  } else if (crown === 'tentacles') {
    const n = Math.floor(R(4, 8));
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1, a = s > 0 ? R(1.6, 1.92) * Math.PI : R(1.08, 1.4) * Math.PI;
      const p0 = headPoint(a, 0.93), p1 = headPoint(a, 1.16);
      const p2 = { x: cx + s * hrx * R(1.05, 1.32), y: cy + hry * R(0.0, 0.35) };
      const p3 = { x: cx + s * hrx * R(0.95, 1.4) + R(-15, 15), y: Math.min(W - 14, cy + hry * R(0.7, 1.2)) };
      const p4 = { x: p3.x - s * R(8, 18), y: p3.y - R(0, 12) };
      const line = spline([p0, p1, p2, p3, p4], false, 10);
      part(limb(line, R(13, 19), 2.5), pal.hair, false);
      for (let k = 6; k < line.length - 4; k += 4) {
        const q = line[k]!;
        solid(blob(q.x - s * 3, q.y, 2, 2, 6, 0.1), pal.blush, 0.7);
      }
    }
  } else if (crown === 'antennae' || crown === 'stalks') {
    const lines: { line: Pt[]; w0: number; w1: number }[] = [];
    if (crown === 'stalks') for (const e of stalkEyes) lines.push({ line: e.stalk!, w0: R(12, 17), w1: R(7, 10) });
    else {
      const n = pick([1, 2, 2, 2, 3, 4]);
      for (let i = 0; i < n; i++) {
        const a = 1.5 * Math.PI + (i - (n - 1) / 2) * R(0.32, 0.55) + R(-0.08, 0.08);
        const base = headPoint(a, 0.95), len = Math.min(R(45, 95), base.y - 30);
        const dir = a + R(-0.3, 0.3) * weird;
        const tip = { x: base.x + Math.cos(dir) * len, y: base.y + Math.sin(dir) * len };
        lines.push({ line: spline([base, { x: base.x + Math.cos(dir) * len * 0.45 + R(-12, 12), y: base.y + Math.sin(dir) * len * 0.45 }, { x: base.x + Math.cos(dir) * len * 0.78 + R(-10, 10), y: base.y + Math.sin(dir) * len * 0.78 }, tip], false, 12), w0: R(6, 9), w1: R(3, 4.5) });
      }
    }
    for (const { line, w0, w1 } of lines) {
      part(limb(line, w0, w1), crown === 'stalks' ? pal.skin : pal.hair2, false, { layers: 16 }, 1.3);
      if (crown === 'stalks') rings(line, w0, w1, 3);
    }
    if (crown === 'antennae') {
      const knob = pick(['ball', 'ball', 'star', 'drop'] as const);
      for (const { line } of lines) {
        const t = line[line.length - 1]!, kr = R(7, 13);
        const shape = knob === 'star' ? star(t.x, t.y - kr * 0.4, kr * 1.5, R(-0.3, 0.3))
          : knob === 'drop' ? spline([{ x: t.x, y: t.y + kr * 0.4 }, { x: t.x + kr, y: t.y - kr * 0.6 }, { x: t.x, y: t.y - kr * 1.9 }, { x: t.x - kr, y: t.y - kr * 0.6 }], true, 6)
          : blob(t.x, t.y - kr * 0.5, kr, kr, 14, 0.12);
        part(shape, pal.accent, false, { layers: 18, alpha: 0.09, bloom: 0.6, exclude: undefined }, 1.3);
        const hl = bbox(shape);
        solid(blob(hl.x0 + (hl.x1 - hl.x0) * 0.35, hl.y0 + (hl.y1 - hl.y0) * 0.3, 2.4, 2, 6, 0.1), 'paper', 0.85);
      }
      hairCol = pal.accent;
    }
    // a socket of skin for each eye on a stalk; the eye itself is painted with the others
    for (const e of stalkEyes) part(blob(e.x, e.y, e.r * 1.28, e.r * 1.22, 20, 0.1), pal.skin, false, { exclude: undefined }, 1.6);
  }
  // fins where the ears would be
  const fins = crown !== 'tentacles' && crown !== 'frill' && chance(0.45);
  if (fins) for (const s of [-1, 1]) {
    const a = s > 0 ? 0 : Math.PI, side = headPoint(a);
    const b0 = headPoint(a - 0.34 * s, 0.95), b1 = headPoint(a + 0.3 * s, 0.95);
    const tip = { x: side.x + s * hrx * R(0.35, 0.6), y: side.y - hry * R(0.2, 0.6) };
    const fin = spline([b0, { x: (b0.x + tip.x) / 2 + s * 4, y: (b0.y + tip.y) / 2 - 6 }, tip, { x: (b1.x + tip.x) / 2 + s * 6, y: (b1.y + tip.y) / 2 + 4 }, b1], false, 8);
    part(fin, pal.skin, false);
    wash(fin, pal.shade, { layers: 10, alpha: 0.05, v: 0.15, clip: fin, exclude: [headIn], grain: false });
    for (let k = 0; k < 3; k++) {
      const from = headPoint(a + (k - 1) * 0.16 * s, 1.0);
      ink([from, { x: from.x + (tip.x - from.x) * 0.75, y: from.y + (tip.y - from.y) * 0.75 }], { w: 0.8, passes: 1, alpha: 0.6 });
    }
  }

  // ================= figure: the head =================
  wash(headSparse, pal.skin, { layers: 30, alpha: 0.058, v: 0.08, bloom: 0.3, exclude: cover ? [shrink(cover, 0.94)] : [] });
  wash(blob(cx - light * hrx * 0.95, cy + hry * 0.12, hrx * 0.55, hry * 0.95, 14, 0.25), pal.shade, { layers: 22, alpha: 0.04, v: 0.26, clip: head, exclude: cover ? [cover] : [] });
  wash(blob(cx, headBottom - hry * 0.02, hrx * 0.55, hry * 0.16, 12, 0.25), pal.shade, { layers: 14, alpha: 0.04, v: 0.2, clip: head, grain: false });
  if (chance(0.5)) {
    const sides = faceEyes.length === 1 || chance(0.3) ? [chance(0.5) ? -1 : 1] : [-1, 1];
    for (const s of sides) {
      const br = hrx * R(0.12, 0.2);
      const cheek = blob(cx + s * hrx * R(0.5, 0.65), noseY + R(-4, 6), br, br * R(0.7, 0.95), 12, 0.2);
      blush.push(cheek);
      wash(cheek, pal.blush, { layers: 18, alpha: 0.06, v: 0.15, clip: head });
    }
  }
  // spots, like a toad or a leopard that went wrong
  if (chance(0.45)) {
    const col = pick([pal.shade, pal.hair, pal.hair2]);
    for (let i = 0, n = Math.floor(R(5, 13)), tries = 0; i < n && tries < 120; tries++) {
      const r = R(3, 9) * (0.6 + 0.4 * weird), p = { x: cx + R(-1, 1) * hrx, y: cy + R(-1, 1) * hry };
      if (!inside(p, shrink(head, 0.86)) || eyes.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < e.r + r + 4)) continue;
      if (Math.abs(p.y - mouthY) < 22 && Math.abs(p.x - cx) < hrx * 0.6) continue;
      i++;
      part(blob(p.x, p.y, r, r * R(0.7, 1.1), 10, 0.25), col, true, { layers: 12, alpha: 0.09, v: 0.08, grain: false, shift: 1, clip: head }, 0);
    }
  }

  if (cover) {
    hairCol = crown === 'brain' ? mix(pal.blush, '#ff9db5', 0.5) : pal.hair;
    wash(crown === 'spines' ? cover : sparse(cover, 20), hairCol, { layers: 30, alpha: 0.06, v: 0.08, shift: 3, bloom: 0.4 });
    wash(blob(cx - light * hrx * 0.45, cy - hry * 0.75, hrx * 0.75, hry * 0.45, 12, 0.2), crown === 'brain' ? pal.blush : pal.hair2, { layers: 16, alpha: 0.05, v: 0.15, clip: cover });
  }

  const away = cover ? [cover] : [];
  hatch(head, { exclude: [shift(head, light * hrx * 0.34, -hry * 0.06), ...away], angle: light > 0 ? R(0.6, 0.95) : Math.PI - R(0.6, 0.95), gap: R(3.8, 5), w: 0.6, alpha: 0.38 });
  hatch(head, { exclude: [shift(head, light * hrx * 0.17, -hry * 0.03), ...away], angle: light > 0 ? R(1.9, 2.3) : Math.PI - R(1.9, 2.3), gap: R(3.2, 4.2), w: 0.55, alpha: 0.32 });
  if (coverA) ink(headArc(coverA[1] - 0.1, coverA[0] + TAU + 0.1, 120), { w: 2.1 });
  else ink(head, { closed: true, w: 2.1 });

  // ---- the crown, in front
  if (crown === 'spines' && cover) {
    ink(crownTips, { w: 1.9, jit: 0.4 });
    ink(cover.slice(crownTips.length), { w: 1.0, passes: 1, alpha: 0.6, dry: true });
  } else if (crown === 'brain' && cover) {
    ink(cover.slice(0, 25), { w: 2 });
    ink(cover.slice(25), { w: 1.6, jit: 1.4 });
    const bb = bbox(cover);
    ink(spline([{ x: cx + R(-4, 4), y: bb.y0 + 4 }, { x: cx + R(-8, 8), y: (bb.y0 + bb.y1) / 2 }, { x: cx + R(-4, 4), y: bb.y1 - 6 }], false, 10), { w: 1.4, clip: cover });
    // the folds: short wandering lines that turn back on themselves
    for (let k = 0, tries = 0; k < 26 && tries < 400; tries++) {
      const p = { x: R(bb.x0, bb.x1), y: R(bb.y0, bb.y1) };
      if (!inside(p, cover)) continue;
      k++;
      let a = R(0, TAU);
      const pts: Pt[] = [p];
      for (let i = 0; i < 7; i++) {
        a += R(-1.4, 1.4);
        const q = pts[pts.length - 1]!;
        pts.push({ x: q.x + Math.cos(a) * 5, y: q.y + Math.sin(a) * 5 });
      }
      ink(spline(pts, false, 4), { w: R(0.8, 1.2), passes: 1, jit: 0.3, clip: cover });
    }
  } else if (crown === 'horns') {
    const n = pick([2, 2, 2, 4, 1]), col = pick([BONE, BONE, pal.hair2, pal.hair]);
    hairCol = col;
    const pairs = n === 1 ? [[0, 0]] : n === 2 ? [[-1, 0], [1, 0]] : [[-1, 0], [1, 0], [-1, 1], [1, 1]];
    for (const [s, j] of pairs as [number, number][]) {
      const a = 1.5 * Math.PI + s * (R(0.45, 0.75) + j * 0.5);
      const base = headPoint(a, 0.9), len = Math.min(R(45, 85) * (j ? 0.6 : 1), (base.y - 12) / 1.1);
      const curl = R(-0.4, 0.6) * (s || 1);
      const line = spline([
        base,
        { x: base.x + s * len * 0.45, y: base.y - len * 0.3 },
        { x: base.x + s * len * R(0.55, 0.8), y: base.y - len * 0.75 },
        { x: base.x + (s * R(0.25, 0.6) - curl * 0.3) * len, y: base.y - len * R(0.95, 1.1) },
      ], false, 12);
      const w0 = R(15, 24) * (j ? 0.7 : 1);
      part(limb(line, w0, 1.5), col, true, { layers: 18 }, 1.6);
      rings(line, w0, 1.5, Math.floor(R(3, 6)));
    }
  } else if (crown === 'halo' && !nimbus) {
    const rx = hrx * R(0.55, 0.8), ry = rx * R(0.2, 0.28);
    const hcy = Math.max(headTop - R(14, 26), ry + 14), rot = R(-0.15, 0.15);
    const loop = blob(cx + R(-8, 8), hcy, rx, ry, 48, 0.02, rot);
    const band = ribbon([...loop, loop[0]!, loop[1]!], loop.concat(loop[0]!, loop[1]!).map(() => R(7, 9)));
    part(band, pal.accent2, true, { layers: 20, alpha: 0.1, bloom: 0.7, v: 0.04 }, 0);
    ink(shrink(loop, 1.09), { closed: true, w: 1.1 });
    ink(shrink(loop, 0.9), { closed: true, w: 1.1 });
    hairCol = pal.accent2;
  } else if (crown === 'crystals') {
    const col = pick([pal.accent, pal.bg2, pal.accent2]);
    hairCol = col;
    for (let i = 0, n = Math.floor(R(3, 6)); i < n; i++) {
      const a = 1.5 * Math.PI + R(-0.85, 0.85), base = headPoint(a, 0.94);
      const dir = a + R(-0.2, 0.2), len = Math.min(R(28, 62), (base.y - 12) / Math.max(0.3, -Math.sin(dir))), w = R(8, 15);
      const ux = Math.cos(dir), uy = Math.sin(dir), nx = -uy, ny = ux;
      const at = (t: number, k: number) => ({ x: base.x + ux * len * t + nx * w * k, y: base.y + uy * len * t + ny * w * k });
      const shard = [at(0, -0.5), at(0.7, -0.6), at(1, 0), at(0.7, 0.6), at(0, 0.5)];
      part(shard, col, true, { layers: 14, alpha: 0.09, v: 0.03, grain: false, bloom: 0.4 }, 1.3);
      ink([at(0.05, 0.1), at(0.7, 0.05), at(1, 0)], { w: 0.8, passes: 1, alpha: 0.6 });
    }
  } else if (crown === 'bald') {
    // bumps and veins over the cranium
    for (let i = 0, n = Math.floor(R(2, 4)); i < n; i++) {
      const y = headTop + hry * (0.18 + i * 0.12) + R(-4, 4), w = hrx * R(0.25, 0.45);
      if (y < topEye - 8) ink(arcPts(cx + R(-hrx * 0.25, hrx * 0.25), y + w * 0.3, w, w * 0.35, Math.PI + 0.5, TAU - 0.5, 14, 0.08), { w: 1, passes: 1, alpha: 0.6 });
    }
    if (chance(0.5)) {
      let p = { x: cx + light * hrx * R(0.2, 0.5), y: headTop + hry * 0.15 };
      const vein: Pt[] = [p];
      for (let i = 0; i < 6; i++) vein.push((p = { x: p.x + R(-7, 7), y: p.y + R(5, 9) }));
      ink(spline(vein, false, 4), { col: pal.hair2, w: 0.9, passes: 1, alpha: 0.7, clip: head });
    }
  }
  // sparkles around a celestial one
  if (crown === 'halo' || crown === 'crystals' || chance(0.15)) {
    for (let i = 0, n = Math.floor(R(2, 5)), tries = 0; i < n && tries < 40; tries++) {
      const a = R(Math.PI, TAU), d = R(1.15, 1.45), p = { x: cx + Math.cos(a) * hrx * d, y: cy + Math.sin(a) * hry * d };
      if (p.y < 12 || p.x < 12 || p.x > W - 12) continue;
      i++;
      const s = star(p.x, p.y, R(5, 9), R(-0.3, 0.3));
      wash(s, pal.accent2, { layers: 8, alpha: 0.18, v: 0.04, grain: false, shift: 0 });
      ink(s, { closed: true, w: 0.8, passes: 1 });
    }
  }

  // ---- eyes: whites and outlines are painted; pupils and lids are left to the animator
  const gaze = { x: R(-1, 1), y: R(-0.6, 0.6) };
  const irisCol = pick([pal.accent2, pal.hair, pal.accent, pal.bg, pal.blush]);
  const eyeKinds = ['round', 'round', 'round', 'almond', 'sleepy', 'sleepy', 'button'] as const;
  const baseKind: EyeKind = eyePlan === 'grey' ? 'almond' : pick(eyeKinds);
  // the looks that give it away: pinprick pupils in bulging eyes, a goat's slit, a yellowed white
  const pupilKind = eyePlan === 'grey' ? 'huge' : pick(['dot', 'dot', 'dot', 'normal', 'slit', 'normal'] as const);
  const sclera = chance(0.3) ? mix(pal.accent2, '#ffffff', 0.45) : null;
  const lidCol = mix(multiply(pal.paper, mix('#ffffff', pal.skin, 0.85)), multiply(pal.paper, pal.shade), 0.3);
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

  function addEye(e: EyeAt, kind: EyeKind) {
    const { x, y, r } = e;
    const skew = { x: R(-0.8, 0.8) * weird, y: R(-0.6, 0.6) * weird };
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
    if (kind === 'round' || kind === 'spiral') shape = blob(x, y, r, r * R(0.88, 1.12), 60, 0.08);
    else {
      const h = r * (kind === 'sleepy' ? R(0.55, 0.7) : eyePlan === 'grey' ? R(0.5, 0.6) : R(0.55, 0.78));
      const tilt = e.tilt ?? R(-0.2, 0.2) * weird * r;
      const up = spline([{ x: x - r, y: y + tilt }, { x: x - r * 0.35, y: y - h }, { x: x + r * 0.4, y: y - h * R(0.9, 1.1) }, { x: x + r, y: y - tilt }], false, 10);
      const lo = spline([{ x: x + r, y: y - tilt }, { x: x + r * 0.4, y: y + h * R(0.6, 0.8) }, { x: x - r * 0.35, y: y + h * R(0.6, 0.8) }, { x: x - r, y: y + tilt }], false, 10);
      shape = up.concat(lo.slice(1, -1));
    }
    solid(shape, 'paper', 0.9);
    if (sclera) solid(shape, sclera, 0.45);
    let spiral: InkOp | null = null, iris: WashOp | null = null;
    if (kind === 'spiral') {
      const pts: Pt[] = [], a0 = R(0, TAU);
      for (let t = 0; t <= 1; t += 0.01) pts.push({ x: Math.cos(a0 + t * 3.2 * TAU) * r * 0.85 * t, y: Math.sin(a0 + t * 3.2 * TAU) * r * 0.85 * t });
      spiral = makeInk(pts, { w: 1.3, passes: 1 });
    } else if (pupilKind === 'huge') {
      iris = makeWash(blob(x, y, r * 0.95, r * 0.95, 12, 0.08), pal.ink, { layers: 16, alpha: 0.12, v: 0.04, grain: false, shift: 1 });
    } else if (pupilKind !== 'dot') {
      iris = makeWash(blob(x, y, r * 0.58, r * 0.58, 10, 0.1), irisCol, { layers: 14, alpha: 0.1, v: 0.06, grain: false, shift: 1 });
    }
    const restOpen = kind === 'sleepy' ? R(0.38, 0.55) : 1;
    ink(shape, { closed: true, w: 1.5 });
    // bags, two or three deep
    if (chance(0.55)) for (let i = 0, n = pick([1, 1, 2, 3]); i < n; i++) {
      ink(arcPts(x + R(-2, 2), y + r * (0.15 + i * 0.22), r * (0.85 - i * 0.08), r * 0.75, 0.45, Math.PI - 0.45, 16, 0.06), { w: 0.9, passes: 1, alpha: 0.6 });
    }
    if (chance(0.25)) {
      const upper = shape.filter((q) => q.y < y - r * 0.25);
      const n = Math.floor(R(3, 6));
      for (let i = 0; i < n; i++) {
        const b = upper[Math.floor(((i + 0.5) * upper.length) / n)];
        if (!b) continue;
        const dx = b.x - x, dy = b.y - (y + r * 0.4), d = Math.hypot(dx, dy), l = r * R(0.3, 0.5);
        ink([b, { x: b.x + (dx / d) * l, y: b.y + (dy / d) * l }], { w: 1.1, passes: 1 });
      }
    }
    const clip = shrink(shape, 0.96);
    const pupil = pupilKind === 'huge' ? blob(x, y, r * 0.6, r * 0.5, 14, 0.1)
      : pupilKind === 'dot' ? blob(x, y, r * 0.13, r * 0.13, 10, 0.1)
      : pupilKind === 'slit' ? blob(x, y, r * 0.09, r * 0.36, 14, 0.06)
      : blob(x, y, r * 0.28, r * 0.28, 12, 0.12);
    specs.push({
      kind, x, y, r, clip, ...lidProfile(clip), restOpen, skew, iris, spiral, pupil,
      highlight: pupilKind === 'dot' ? blob(x - r * 0.05, y - r * 0.06, r * 0.04, r * 0.04, 6, 0.1) : blob(x - r * 0.12, y - r * 0.14, r * 0.09, r * 0.09, 8, 0.1),
      lidCol, lidW: 2.4 * INK_WEIGHT,
    });
  }
  for (const e of eyes) addEye(e, eyePlan !== 'grey' && chance(0.22 * weird) ? pick([...eyeKinds, 'spiral'] as const) : baseKind);

  // brows, only where there are a pair or so of eyes to frown over
  const browKind = pick(['line', 'line', 'thick', 'uni'] as const);
  if (faceEyes.length >= 1 && faceEyes.length <= 3 && chance(0.7)) {
    const browed = browKind === 'uni' && faceEyes.length >= 2 ? [] : faceEyes;
    if (!browed.length) {
      // one brow across the lot
      const l = faceEyes.reduce((a, e) => (e.x < a.x ? e : a)), r = faceEyes.reduce((a, e) => (e.x > a.x ? e : a));
      const path = spline([{ x: l.x - l.r, y: l.y - l.r * 1.3 }, { x: l.x + l.r * 0.3, y: l.y - l.r * 1.7 }, { x: cx, y: Math.min(l.y, r.y) - Math.max(l.r, r.r) * 1.2 }, { x: r.x - r.r * 0.3, y: r.y - r.r * 1.7 }, { x: r.x + r.r, y: r.y - r.r * 1.3 }], false, 8);
      brows.push(path);
      const first = figure.length;
      ink(path, { w: R(2.6, 3.6), jit: 1.6 });
      browOps.push([first, figure.length]);
    }
    for (const e of browed) {
      if (!chance(0.85)) continue;
      const s = Math.sign(e.x - cx) || (chance(0.5) ? 1 : -1);
      const tilt = R(-0.5, 0.5) * weird * e.r;
      const inner = { x: e.x - s * e.r * 0.95, y: e.y - e.r * 1.35 + tilt };
      const mid = { x: e.x + s * e.r * 0.1, y: e.y - e.r * R(1.5, 1.85) };
      const outer = { x: e.x + s * e.r * 1.15, y: e.y - e.r * 1.3 - tilt * 0.4 };
      const path = spline([inner, mid, outer], false, 12);
      brows.push(path);
      const first = figure.length;
      if (browKind === 'thick') {
        const band = path.map((q) => ({ x: q.x, y: q.y - 3 })).concat(path.slice().reverse().map((q) => ({ x: q.x, y: q.y + 3 })));
        wash(sparse(band, 12), pal.hair2, { layers: 14, alpha: 0.1, v: 0.05, grain: false, shift: 1 });
        ink(path, { w: 2.2 });
      } else ink(path, { w: R(2.2, 3.4) });
      browOps.push([first, figure.length]);
    }
  }

  // nose
  const nd = chance(0.5) ? 1 : -1;
  const noseKind = pick(['slits', 'slits', 'holes', 'none', 'bulb', 'bulb', 'snout', 'long', 'hook'] as const);
  if (noseKind === 'slits') {
    const gap = R(4, 9);
    for (const s of [-1, 1]) {
      const sl = [{ x: cx + s * gap, y: noseY - R(4, 7) }, { x: cx + s * (gap + R(1, 3)), y: noseY + R(3, 6) }];
      ink(sl, { w: 1.4, passes: 1 });
      if (s < 0) nosePts = sl;
    }
  } else if (noseKind === 'holes') {
    solid(blob(cx - 5, noseY + 3, 2.4, 1.8, 6, 0.2), pal.ink, 0.85);
    solid(blob(cx + 5, noseY + 3, 2.4, 1.8, 6, 0.2), pal.ink, 0.85);
  } else if (noseKind === 'hook') {
    nosePts = spline([{ x: cx + nd * 2, y: eyeY + hry * 0.06 }, { x: cx + nd * hrx * 0.07, y: noseY - hry * 0.12 }, { x: cx + nd * hrx * R(0.15, 0.25), y: noseY }, { x: cx + nd * hrx * 0.03, y: noseY + R(5, 9) }, { x: cx - nd * hrx * 0.08, y: noseY + 2 }], false, 10);
    ink(nosePts, { w: 1.8 });
    wash(blob(cx + nd * hrx * 0.05, noseY + 4, hrx * 0.12, hrx * 0.06, 10, 0.2), pal.shade, { layers: 10, alpha: 0.07, v: 0.15, grain: false });
  } else if (noseKind === 'bulb' || noseKind === 'snout') {
    // a snout is a bulb grown wide, flat and pig-like, with big nostrils
    const snout = noseKind === 'snout', nr = hrx * (snout ? R(0.2, 0.28) : R(0.12, 0.22));
    const bulb = blob(cx + nd * 3, noseY, nr, nr * (snout ? R(0.6, 0.75) : R(0.8, 1.05)), 14, 0.15);
    wash(bulb, snout ? pal.blush : chance(0.5) ? pal.blush : pal.shade, { layers: 20, alpha: 0.07, v: 0.1 });
    nosePts = snout ? bulb.concat(bulb[0]!) : arcPts(cx + nd * 3, noseY, nr, nr * 0.95, -0.2, Math.PI + 0.2, 30, 0.06);
    ink(snout ? bulb : nosePts, { w: 1.7, closed: snout });
    const hole = snout ? 3.4 : 1.8;
    solid(blob(cx + nd * 3 - nr * 0.38, noseY + nr * (snout ? 0.05 : 0.35), hole, hole * 1.3, 6, 0.2), pal.ink, 0.85);
    solid(blob(cx + nd * 3 + nr * 0.38, noseY + nr * (snout ? 0.05 : 0.35), hole, hole * 1.3, 6, 0.2), pal.ink, 0.85);
  } else if (noseKind === 'long') {
    const nose = blob(cx + nd * hrx * 0.34, noseY - 2, hrx * R(0.34, 0.5), hrx * R(0.08, 0.12), 30, 0.12, nd * R(0.05, 0.35));
    wash(sparse(nose, 14), pal.skin, { layers: 18, alpha: 0.07, v: 0.06 });
    solid(nose, 'paper', 0.25);
    nosePts = nose.concat(nose[0]!);
    ink(nose, { closed: true, w: 1.7 });
  }

  // mouth
  const mouthFrom = figure.length;
  const mw = hrx * R(0.28, 0.72), mx = cx + R(-10, 10) * weird, my = mouthY;
  const mouthKind = pick(['smile', 'frown', 'wavy', 'open', 'open', 'open', 'grin', 'grin', 'o', 'smirk'] as const);
  let mouthLow = my;
  if (mouthKind === 'smile' || mouthKind === 'frown' || mouthKind === 'smirk') {
    const sag = (mouthKind === 'frown' ? -1 : 1) * R(5, 16), sm = mouthKind === 'smirk' ? 1 : 0;
    const pts = spline([{ x: mx - mw, y: my - sag * 0.3 + sm * 6 }, { x: mx - mw * 0.4, y: my + sag * 0.8 }, { x: mx + mw * 0.4, y: my + sag * 0.85 }, { x: mx + mw, y: my - sag * 0.35 - sm * 12 }], false, 12);
    if (chance(0.5)) wash(blob(mx, my + sag * 0.55 + 3, mw * 0.7, R(4, 7), 12, 0.2), pal.blush, { layers: 14, alpha: 0.08, v: 0.1, grain: false });
    ink(pts, { w: 2.3 });
    // a tooth or two that won't stay in
    if (chance(0.45)) for (let i = 0, n = pick([1, 1, 2]); i < n; i++) {
      const t = pts[Math.floor(R(0.3, 0.7) * pts.length)]!, tw = R(5, 9), th = R(6, 11), up = mouthKind === 'frown' ? -1 : 1;
      const tooth = [{ x: t.x - tw / 2, y: t.y - 1 * up }, { x: t.x + tw / 2, y: t.y - 1 * up }, { x: t.x + tw / 2 + R(-1, 1), y: t.y + th * up }, { x: t.x - tw / 2, y: t.y + th * up * R(0.8, 1) }];
      solid(tooth, 'paper', 0.95);
      ink(tooth, { closed: true, w: 1, passes: 1 });
      mouthLow = Math.max(mouthLow, t.y + th);
    }
    mouth = { kind: mouthKind, line: pts, shape: null };
    if (chance(0.6)) for (const end of [pts[0]!, pts[pts.length - 1]!]) ink(arcPts(end.x, end.y, 4, 4, end.x < mx ? 2.2 : -1.0, end.x < mx ? 4.0 : 0.8, 6, 0.1), { w: 1.1, passes: 1 });
  } else if (mouthKind === 'wavy') {
    const f = R(1.5, 3.2), amp = R(2.5, 6);
    const line = Array.from({ length: 41 }, (_, i) => ({ x: mx - mw + (2 * mw * i) / 40, y: my + Math.sin((i / 40) * TAU * f) * amp }));
    ink(line, { w: 2 });
    mouth = { kind: mouthKind, line, shape: null };
  } else if (mouthKind === 'o') {
    const orr = R(6, 13);
    const o = blob(mx, my + 4, orr * 0.85, orr, 30, 0.1);
    wash(sparse(o, 10), MOUTH_DARK, { layers: 18, alpha: 0.1, v: 0.05, grain: false, shift: 1 });
    ink(o, { closed: true, w: 1.8 });
    mouth = { kind: mouthKind, line: [], shape: o };
    mouthLow = my + 4 + orr;
  } else {
    const wide = mouthKind === 'grin' ? 1.25 : 1, mh = mouthKind === 'grin' ? R(12, 20) : R(16, 30);
    const up = spline([{ x: mx - mw * wide, y: my }, { x: mx - mw * 0.4, y: my - R(1, 6) }, { x: mx + mw * 0.4, y: my - R(1, 6) }, { x: mx + mw * wide, y: my }], false, 10);
    const lo = spline([{ x: mx + mw * wide, y: my }, { x: mx + mw * 0.5, y: my + mh }, { x: mx - mw * 0.5, y: my + mh * R(0.85, 1.1) }, { x: mx - mw * wide, y: my }], false, 10);
    const shape = up.concat(lo.slice(1, -1));
    mouth = { kind: mouthKind, line: up, shape };
    mouthLow = my + mh * 1.1;
    if (mouthKind === 'grin') {
      // a mouthful of crooked teeth: every one a different height, the odd gap
      solid(shape, 'paper', 0.9);
      wash(shape, GUM, { layers: 10, alpha: 0.08, v: 0.03, clip: shape, exclude: [shift(shrink(shape, 0.86), 0, 1)], grain: false, shift: 0 });
      const midY = my + mh * 0.48 + R(-2, 2);
      ink([{ x: mx - mw * 1.3, y: midY }, { x: mx + mw * 1.3, y: midY + R(-2, 2) }], { w: 1.1, passes: 1, clip: shape });
      for (let x = mx - mw * 1.2; x < mx + mw * 1.2; x += R(6, 12)) {
        if (chance(0.12)) { solid([{ x, y: my - 8 }, { x: x + 6, y: my - 8 }, { x: x + 6, y: midY }, { x, y: midY }], MOUTH_DARK, 0.85, shape); continue; }
        ink([{ x, y: my - 6 }, { x: x + R(-2, 2), y: midY + R(-3, 1) }], { w: 1, passes: 1, clip: shape });
        ink([{ x: x + R(-3, 3), y: midY }, { x: x + R(-2, 2), y: my + mh + 6 }], { w: 1, passes: 1, clip: shape });
      }
    } else {
      wash(sparse(shape, 14), MOUTH_DARK, { layers: 22, alpha: 0.09, v: 0.04, clip: shape, shift: 1 });
      wash(blob(mx + R(-mw * 0.2, mw * 0.2), my + mh * 0.85, mw * 0.5, mh * 0.42, 12, 0.15), pal.blush, { layers: 16, alpha: 0.1, v: 0.08, clip: shape, grain: false });
      // fangs top and sometimes bottom, never matching
      const nt = pick([1, 2, 2, 3, 4, 5]);
      for (let i = 0; i < nt; i++) {
        const tx = mx + R(-mw * 0.75, mw * 0.6), tw = R(5, 11), th = R(7, Math.min(18, mh * 0.75));
        const fang = chance(0.6);
        const tooth = fang ? [{ x: tx, y: my - 4 }, { x: tx + tw, y: my - 4 }, { x: tx + tw * R(0.3, 0.7), y: my + th }]
          : [{ x: tx, y: my - 4 }, { x: tx + tw, y: my - 4 }, { x: tx + tw + R(-1, 1), y: my + th }, { x: tx + R(-1, 1), y: my + th + R(-2, 2) }];
        solid(tooth, 'paper', 0.95, shape);
        ink(tooth, { closed: true, w: 1, passes: 1, clip: shape });
      }
      if (chance(0.5)) for (let i = 0, n = pick([1, 2]); i < n; i++) {
        const tx = mx + R(-mw * 0.6, mw * 0.5), tw = R(5, 9), base = my + mh * 0.95;
        const tooth = [{ x: tx, y: base + 4 }, { x: tx + tw, y: base + 4 }, { x: tx + tw * 0.5, y: base - R(7, 12) }];
        solid(tooth, 'paper', 0.95, shape);
        ink(tooth, { closed: true, w: 1, passes: 1, clip: shape });
      }
    }
    ink(shape, { closed: true, w: 2 });
  }
  const mouthOps: [number, number] = [mouthFrom, figure.length];

  // ---- things hanging off the face
  if (chance(0.3)) {
    // drool from a corner
    const s = chance(0.5) ? -1 : 1, x0 = mx + s * mw * R(0.6, 0.95), y0 = Math.max(my, mouthLow - 4), len = R(16, 34);
    const drop = spline([{ x: x0 - 2.5, y: y0 }, { x: x0 - 1.6, y: y0 + len * 0.7 }, { x: x0 - 4, y: y0 + len }, { x: x0, y: y0 + len + 6 }, { x: x0 + 4, y: y0 + len }, { x: x0 + 1.6, y: y0 + len * 0.7 }, { x: x0 + 2.5, y: y0 }], false, 4);
    wash(drop, DROOL, { layers: 12, alpha: 0.12, v: 0.03, grain: false, shift: 0 });
    ink(drop.slice(1), { w: 0.9, passes: 1 });
  }
  if (crown !== 'tentacles' && chance(0.22)) {
    // tentacles for a chin
    const n = Math.floor(R(3, 6)), by = headBottom - hry * 0.08;
    for (let i = 0; i < n; i++) {
      const bx = cx + (i - (n - 1) / 2) * hrx * R(0.18, 0.24);
      const line = spline([{ x: bx, y: by - 6 }, { x: bx + R(-10, 10), y: by + R(16, 26) }, { x: bx + R(-16, 16), y: Math.min(W - 18, by + R(38, 60)) }, { x: bx + R(-12, 12), y: Math.min(W - 8, by + R(55, 78)) }], false, 10);
      part(limb(line, R(10, 15), 2), pal.skin, true, { layers: 18 }, 1.4);
    }
  } else if (chance(0.15)) {
    // mandibles
    for (const s of [-1, 1]) {
      const b = { x: mx + s * mw * 1.05, y: my + 2 };
      const line = spline([b, { x: b.x + s * R(10, 18), y: b.y + R(8, 14) }, { x: b.x + s * R(4, 10), y: b.y + R(26, 36) }, { x: b.x - s * R(4, 10), y: b.y + R(32, 42) }], false, 10);
      part(limb(line, 10, 1.5), pal.hair2, true, { layers: 16 }, 1.4);
    }
  }
  if (chance(0.25)) {
    // feelers from the cheeks
    for (const s of [-1, 1]) for (let i = 0, n = pick([1, 2, 3]); i < n; i++) {
      const b = { x: cx + s * hrx * R(0.35, 0.5), y: noseY + R(0, 10) + i * 5 };
      ink(spline([b, { x: b.x + s * hrx * R(0.4, 0.6), y: b.y + R(-14, 6) }, { x: b.x + s * hrx * R(0.8, 1.1), y: b.y + R(-24, 14) }], false, 10), { w: 0.9, passes: 1, alpha: 0.8 });
    }
  }
  if (faceEyes.length && faceEyes.length < 3 && crown !== 'brain' && chance(0.18)) {
    // a third eye that is a gem, between and above the others
    const gy = topEye - R(14, 22), gr = R(8, 13);
    if (inside({ x: cx, y: gy - gr }, head) && (!cover || !inside({ x: cx, y: gy }, cover))) {
      const gem = [{ x: cx, y: gy - gr * 1.3 }, { x: cx + gr * 0.8, y: gy }, { x: cx, y: gy + gr * 1.3 }, { x: cx - gr * 0.8, y: gy }];
      part(gem, pal.accent, true, { layers: 14, alpha: 0.1, v: 0.03, grain: false, bloom: 0.5 }, 1.2);
      ink([gem[0]!, gem[2]!], { w: 0.6, passes: 1, alpha: 0.6 });
    }
  }

  // ---- oddities
  if (chance(0.35)) {
    const n = Math.floor(R(12, 30));
    for (let i = 0; i < n; i++) {
      const fx = cx + gauss() * hrx * 0.42, fy = noseY - hry * 0.06 + gauss() * hry * 0.07;
      if (inside({ x: fx, y: fy }, head)) solid(blob(fx, fy, R(0.6, 1.5), R(0.6, 1.5), 6, 0.2), chance(0.5) ? pal.ink : pal.shade, 0.6);
    }
  }
  if (chance(0.4)) {
    // wrinkles: worry lines on the brow, or crow's feet
    const lines = pick([2, 3, 4]);
    for (let i = 0; i < lines; i++) {
      const wy = topEye - 10 - i * 6;
      if (wy > headTop + 12 && (!cover || !inside({ x: cx, y: wy }, cover))) ink(Array.from({ length: 13 }, (_, k) => ({ x: cx - hrx * 0.3 + (hrx * 0.6 * k) / 12, y: wy + Math.sin(k * 0.9 + i) * 1.8 })), { w: 0.9, passes: 1, alpha: 0.6 });
    }
  }
  if (chance(0.35)) {
    // warts
    for (let i = 0, n = pick([1, 1, 2, 3]); i < n; i++) {
      const p = { x: cx + R(-0.7, 0.7) * hrx, y: cy + R(-0.2, 0.6) * hry };
      if (!inside(p, shrink(head, 0.9)) || eyes.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < e.r + 8)) continue;
      const wr = R(3, 6), wart = blob(p.x, p.y, wr, wr, 10, 0.25);
      wash(wart, pal.shade, { layers: 10, alpha: 0.12, v: 0.05, grain: false, shift: 0 });
      ink(wart, { closed: true, w: 0.9, passes: 1 });
      ink([{ x: p.x, y: p.y - wr }, { x: p.x + R(-3, 3), y: p.y - wr - R(4, 7) }], { w: 0.5, passes: 1 });
    }
  }
  if (chance(0.12)) {
    const dx = cx + light * hrx * 0.95, dy = cy - hry * 0.45;
    const drop = spline([{ x: dx, y: dy - 12 }, { x: dx + 6, y: dy + 2 }, { x: dx, y: dy + 8 }, { x: dx - 6, y: dy + 2 }], true, 8);
    wash(sparse(drop, 10), DROOL, { layers: 14, alpha: 0.1, v: 0.05, grain: false, shift: 1 });
    ink(drop, { closed: true, w: 1.2 });
  }

  const sketch: Sketch = {
    head, centre: { x: cx, y: cy }, rx: hrx, ry: hry, light: light > 0 ? 1 : -1,
    hair: { kind: crown, col: hairCol, cover, back: null },
    hat: null,
    sprouts: [], leaf: null,
    ears: [],
    brows, nose: nosePts, mouth: { ...mouth, x: mx, y: my, w: mw }, blush, glasses: null,
    parts,
    ops: { mouth: mouthOps, brows: browOps },
  };

  return {
    seed, pal, sketch, back, figure, eyes: specs,
    pivot: { x: cx, y: headBottom },
    gaze,
    temper: { breathe: R(2.6, 5.5), sway: R(0.6, 1.4), blinkEvery: R(2, 6), phase: R(0, TAU) },
  };
}
