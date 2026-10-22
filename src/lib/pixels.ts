import type { Engine } from './engine';
import { bbox, inside, resample, TAU, type Pt } from './geometry';
import { eyeState } from './face/eyes';
import { renderStill } from './face/render';
import type { Face } from './face/types';
import { W } from './face/types';
import { blur, canvas, clamp01, css, faceSpace, figureInks, hex, imgOf, mixRGB, rng, type RGB } from './raster';
import { drawFlat, nearest, paletteOf } from './styles';

/**
 * The voxel style: a careful downsampling of the face (palette-true fills by
 * majority vote, pen lines kept as unbroken 1-cell runs, guaranteed pupils)
 * extruded into lit cubes, with a per-face variant picked from the seed.
 */

const SS = 8;

const same = (a: RGB, b: RGB) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const luma = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const tint = (c: RGB, k: RGB): RGB => [c[0] * k[0], c[1] * k[1], c[2] * k[2]];
const ramp = (c: RGB) => ({
  dark: tint(c, [0.42, 0.37, 0.5]),
  shadow: tint(c, [0.8, 0.74, 0.86]),
  mid: c,
  light: mixRGB(c, [255, 246, 226], 0.3),
});

/** Picks one of several options from the seed, with optional weights. */
function variant<T>(seed: number, salt: number, options: readonly T[], weights?: readonly number[]): T {
  const r = rng(seed * 31 + salt)();
  const w = weights ?? options.map(() => 1);
  let x = r * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) if ((x -= w[i]!) <= 0) return options[i]!;
  return options[0]!;
}

export type Sprite = {
  n: number;
  /** Fill colour of each cell, before pen lines. */
  fill: RGB[];
  /** 1 where a pen line passes through the cell. */
  ink: Uint8Array;
  /** 1 where the cell belongs to the figure rather than the backdrop. */
  figure: Uint8Array;
  /** How much darker the watercolour is than the flat fill: <1 in shadow. */
  shade: Float32Array;
  /** Pupil cells, stamped so eyes survive at any size. */
  pupil: Uint8Array;
  highlight: Uint8Array;
  paper: RGB;
};

export function sprite(face: Face, E: Engine, n: number, lineWidth = 1): Sprite {
  const S = n * SS;
  const pal = paletteOf(face);
  const paper = hex(face.pal.paper);

  // fills: every subpixel snapped to the palette, then each cell takes the majority
  const [fc, fg] = faceSpace(S);
  drawFlat(fg, face, E, { ink: null });
  const fd = imgOf(fc).d;
  // pen lines, about one cell wide
  const [ic, ig] = faceSpace(S);
  drawFlat(ig, face, E, { ink: (W / n) * lineWidth, inkCol: '#000', eyes: false, fills: false });
  const id = imgOf(ic).d;
  const [mc, mg] = faceSpace(S);
  drawFlat(mg, face, E, { ink: 2, figureOnly: true, map: () => '#000', inkCol: '#000' });
  const md = imgOf(mc).d;
  const still = imgOf(renderStill(face, E, S)).d;

  const fill: RGB[] = [], ink = new Uint8Array(n * n), figure = new Uint8Array(n * n), shade = new Float32Array(n * n);
  const votes = new Map<RGB, number>();
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    votes.clear();
    let inkCov = 0, figCov = 0, sl = 0, fl = 0;
    for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) {
      const j = ((cy * SS + y) * S + cx * SS + x) * 4;
      const c = nearest(pal, fd[j]!, fd[j + 1]!, fd[j + 2]!);
      votes.set(c, (votes.get(c) ?? 0) + 1);
      if (id[j + 3]! > 100) inkCov++;
      if (md[j + 3]! > 100) figCov++;
      sl += (0.2126 * still[j]! + 0.7152 * still[j + 1]! + 0.0722 * still[j + 2]!) / 255;
      fl += (0.2126 * fd[j]! + 0.7152 * fd[j + 1]! + 0.0722 * fd[j + 2]!) / 255;
    }
    let best = paper, bv = -1;
    for (const [c, v] of votes) if (v > bv) { bv = v; best = c; }
    const i = cy * n + cx;
    fill.push(best);
    ink[i] = inkCov / (SS * SS) > 0.2 ? 1 : 0;
    figure[i] = figCov / (SS * SS) > 0.5 ? 1 : 0;
    shade[i] = fl > 0 ? sl / fl : 1;
  }

  // pixel-perfect lines: drop the corner pixel of every L so diagonals read as clean steps
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = y * n + x;
    if (!ink[i]) continue;
    const l = ink[i - 1], r = ink[i + 1], u = ink[i - n], d = ink[i + n];
    const corner = (l && u && !r && !d && !ink[i + n + 1] && !ink[i - n - 1]) || (r && u && !l && !d && !ink[i + n - 1] && !ink[i - n + 1])
      || (l && d && !r && !u && !ink[i - n - 1] && !ink[i + n + 1]) || (r && d && !l && !u && !ink[i - n + 1] && !ink[i + n - 1]);
    if (corner && (ink[i - n - 1] || ink[i - n + 1] || ink[i + n - 1] || ink[i + n + 1])) ink[i] = 0;
  }

  const pupil = new Uint8Array(n * n), highlight = new Uint8Array(n * n);
  for (const e of face.eyes) {
    if (e.spiral) continue;
    const st = eyeState(e, face.gaze, 1);
    const b = bbox(e.pupil);
    const px = ((b.x0 + b.x1) / 2 + st.dx) / W * n, py = ((b.y0 + b.y1) / 2 + st.dy) / W * n;
    const size = (b.x1 - b.x0) / W * n > 2.2 ? 2 : 1;
    const x0 = Math.round(px - size / 2), y0 = Math.round(py - size / 2);
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const k = (y0 + dy) * n + x0 + dx;
      if (k >= 0 && k < n * n) pupil[k] = 1;
    }
    if (size === 2) highlight[y0 * n + x0] = 1;
  }
  return { n, fill, ink, figure, shade, pupil, highlight, paper };
}

const OUTLINE: RGB = [29, 23, 38];

/** One colour per cell: shaded fills, selectively outlined lines, an outline around the figure. */
function spriteColours(s: Sprite, bg: (x: number, y: number) => RGB): RGB[] {
  const { n } = s;
  const out: RGB[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, f = s.fill[i]!;
    let c: RGB;
    if (s.highlight[i]) c = [250, 246, 238];
    else if (s.pupil[i]) c = OUTLINE;
    else if (s.ink[i]) {
      // lines take the darkest tone of whatever they cross, so hair lines stay in the hair's family
      c = luma(f) > 0.82 ? OUTLINE : mixRGB(ramp(f).dark, OUTLINE, 0.35);
    } else if (!s.figure[i] && same(f, s.paper)) {
      const near = [i - 1, i + 1, i - n, i + n].some((j) => j >= 0 && j < n * n && s.figure[j]);
      c = near ? OUTLINE : bg(x, y);
    } else if (s.figure[i]) {
      const R = ramp(f), sh = s.shade[i]!;
      c = sh < 0.86 ? R.shadow : sh > 1.03 && x + y < n * 0.95 ? R.light : R.mid;
    } else c = f;
    out.push(c);
  }
  return out;
}

// ================= voxels =================

/** The face as a relief of cubes, lit from the upper left and seen from slightly above. */
export function voxelArt(face: Face, E: Engine, px: number): HTMLCanvasElement {
  const n = variant(face.seed, 41, [32, 38, 44] as const);
  const yawSign = variant(face.seed, 42, [1, -1] as const);
  const mood = variant(face.seed, 43, ['dusk', 'studio', 'mint'] as const);
  const s = sprite(face, E, n, 1.1);
  const colours = spriteColours({ ...s }, () => s.paper);
  // height: a dome over the figure, hair and pen lines standing a little proud
  const dome = blur(Float32Array.from(s.figure), n, n / 8, 3);
  const hairRef = [hex(face.pal.hair), hex(face.pal.hair2)];
  const H = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    if (!s.figure[i]) { H[i] = same(s.fill[i]!, s.paper) ? 0 : 1; continue; }
    const hair = hairRef.some((h) => same(h, s.fill[i]!));
    H[i] = 2 + Math.round(dome[i]! * 5) + (hair ? 1 : 0) + (s.ink[i] || s.pupil[i] ? 1 : 0);
  }
  const yaw = 0.42 * yawSign, pitch = 0.42;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const project = (x: number, y: number, z: number) => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    return { X: x1, Y: -y2, Z: z2 };
  };
  type Quad = { pts: { X: number; Y: number }[]; depth: number; col: RGB };
  const quads: Quad[] = [];
  const add = (corners: [number, number, number][], col: RGB) => {
    const p = corners.map(([x, y, z]) => project(x, y, z));
    quads.push({ pts: p, depth: p.reduce((a, q) => a + q.Z, 0) / 4, col });
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, h = H[k]!, col = colours[k]!;
    const x0 = i - n / 2, x1 = x0 + 1, y1 = n / 2 - j, y0 = y1 - 1;
    // shade the front face by how many taller neighbours crowd it
    const crowd = [k - 1, k + 1, k - n, k + n].filter((q) => q >= 0 && q < n * n && H[q]! > h).length;
    add([[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]], tint(col, [1 - crowd * 0.06, 1 - crowd * 0.06, 1 - crowd * 0.05]));
    const top = j > 0 ? H[k - n]! : 0;
    if (h > top) add([[x0, y1, top], [x1, y1, top], [x1, y1, h], [x0, y1, h]], mixRGB(col, [255, 250, 240], 0.18));
    const sideIdx = yawSign > 0 ? (i > 0 ? k - 1 : -1) : (i < n - 1 ? k + 1 : -1);
    const side = sideIdx >= 0 ? H[sideIdx]! : 0;
    const sx = yawSign > 0 ? x0 : x1;
    if (h > side) add([[sx, y0, side], [sx, y1, side], [sx, y1, h], [sx, y0, h]], tint(col, [0.7, 0.66, 0.74]));
  }
  quads.sort((a, b) => a.depth - b.depth);
  const [c, g] = canvas(px);
  const bg = { dusk: ['#2a2238', '#120f1a'], studio: ['#f1ece4', '#d9d1c4'], mint: ['#d8efe6', '#a9cfc2'] }[mood];
  const grad = g.createRadialGradient(px / 2, px * 0.42, px * 0.05, px / 2, px / 2, px * 0.75);
  grad.addColorStop(0, bg[0]!);
  grad.addColorStop(1, bg[1]!);
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  const xs = quads.flatMap((q) => q.pts.map((p) => p.X)), ys = quads.flatMap((q) => q.pts.map((p) => p.Y));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = (px * 0.88) / Math.max(maxX - minX, maxY - minY);
  const ox = px / 2 - ((minX + maxX) / 2) * scale, oy = px / 2 - ((minY + maxY) / 2) * scale;
  // a soft contact shadow under the slab
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.filter = `blur(${px / 40}px)`;
  g.beginPath();
  g.ellipse(px / 2, oy + maxY * scale + px * 0.01, (maxX - minX) * scale * 0.42, px * 0.03, 0, 0, TAU);
  g.fill();
  g.filter = 'none';
  g.lineJoin = 'round';
  for (const q of quads) {
    g.beginPath();
    q.pts.forEach((p, k) => (k ? g.lineTo(ox + p.X * scale, oy + p.Y * scale) : g.moveTo(ox + p.X * scale, oy + p.Y * scale)));
    g.closePath();
    g.fillStyle = css(q.col);
    g.fill();
    g.strokeStyle = css(tint(q.col, [0.82, 0.8, 0.85]));
    g.lineWidth = Math.max(0.6, scale * 0.04);
    g.stroke();
  }
  return c;
}

