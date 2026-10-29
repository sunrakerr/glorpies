import { makeCanvas } from './canvas';
import type { Engine } from './engine';
import { addPath, bbox, ribbon, type Pt } from './geometry';
import { rgba } from './palettes';
import { eyeState } from './face/eyes';
import { applyClip, renderStill, resolveColor } from './face/render';
import { hatchLines } from './face/strokes';
import type { Face } from './face/types';
import { W } from './face/types';

/**
 * Experimental renderings of the same face in other media. Each one reuses the
 * face's geometry (the display list and eye specs) but draws it with a
 * different primitive: dither dots, pixels, characters, stitches, halftone
 * dots, plotter lines, cut paper or neon tubes.
 */

type Ctx = CanvasRenderingContext2D;
type RGB = [number, number, number];

export type StyleId = 'watercolour' | 'atkinson' | 'bayer' | 'plotter' | 'cutout' | 'neon';

export const STYLES: { id: StyleId; name: string; note: string }[] = [
  { id: 'watercolour', name: 'Watercolour & dip pen', note: 'the original' },
  { id: 'atkinson', name: '1-bit, Atkinson', note: 'error diffusion, classic Mac' },
  { id: 'bayer', name: '1-bit, ordered', note: '8×8 Bayer threshold' },
  { id: 'plotter', name: 'Pen plotter', note: 'multi-pen hatching' },
  { id: 'cutout', name: 'Paper cut-out', note: 'layered card with shadows' },
  { id: 'neon', name: 'Neon sign', note: 'glowing tubes' },
];

function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = makeCanvas(w, h);
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

function faceSpace(px: number): [HTMLCanvasElement, Ctx] {
  const [c, g] = canvas(px);
  g.scale(px / W, px / W);
  return [c, g];
}

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function upscale(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  const [c, g] = canvas(px);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, px, px);
  return c;
}

function polyline(ctx: Ctx, pts: readonly Pt[], closed: boolean) {
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  if (closed) ctx.closePath();
}

// ================= flat rendition: the face as plain shapes =================

type FlatOpts = {
  /** Draw ink lines with this width in face units, or skip them. */
  ink: number | null;
  inkCol?: string;
  hatch?: boolean;
  eyes?: boolean;
  /** false leaves only the pen lines, on a transparent sheet, for use as a mask. */
  fills?: boolean;
  /** Recolour every fill, e.g. onto a print palette. */
  map?: (c: string) => string;
  /** Skip the backdrop (paper, background glazes, drops) and draw only the figure. */
  figureOnly?: boolean;
};

export const opsOf = (face: Face) => [...face.back.filter((o) => o.k !== 'ink'), ...face.figure];

/** Paint-by-numbers: every glaze as one opaque shape, every pen line at one width. */
export function drawFlat(ctx: Ctx, face: Face, E: Engine, o: FlatOpts) {
  const col = (c: string) => (o.map ?? ((x: string) => x))(resolveColor(c, face.pal, 'back'));
  const fills = o.fills !== false;
  for (const op of o.figureOnly ? face.figure : opsOf(face)) {
    if (!fills && op.k !== 'ink') continue;
    ctx.save();
    if (op.k === 'paper') {
      ctx.fillStyle = face.pal.paper;
      ctx.fillRect(0, 0, W, W);
    } else if (op.k === 'wash') {
      applyClip(ctx, op.clip, op.exclude);
      ctx.fillStyle = col(op.col);
      ctx.beginPath();
      addPath(ctx, op.pts);
      ctx.fill();
    } else if (op.k === 'solid') {
      applyClip(ctx, op.clip);
      ctx.fillStyle = rgba(col(op.col), op.alpha);
      ctx.beginPath();
      addPath(ctx, op.pts);
      ctx.fill();
    } else if (op.k === 'ink' && o.ink !== null) {
      applyClip(ctx, op.clip);
      ctx.strokeStyle = o.inkCol ?? col(op.col);
      ctx.lineWidth = o.ink;
      ctx.lineCap = ctx.lineJoin = 'round';
      polyline(ctx, op.pts, op.closed);
      ctx.stroke();
    } else if (op.k === 'hatch' && o.hatch) {
      applyClip(ctx, op.region, op.exclude);
      ctx.strokeStyle = o.inkCol ?? col(op.col);
      for (const l of hatchLines(op, E)) {
        ctx.lineWidth = (o.ink ?? 1) * 0.5;
        polyline(ctx, l.pts, false);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  if (o.eyes !== false) drawFlatEyes(ctx, face, o.ink, o.inkCol);
}

export function drawFlatEyes(ctx: Ctx, face: Face, ink: number | null, inkCol?: string) {
  for (const e of face.eyes) {
    const st = eyeState(e, face.gaze, 1);
    ctx.save();
    ctx.beginPath();
    addPath(ctx, e.clip);
    ctx.clip();
    ctx.translate(st.dx, st.dy);
    if (e.iris) {
      ctx.fillStyle = e.iris.col;
      ctx.beginPath();
      addPath(ctx, e.iris.pts);
      ctx.fill();
    }
    if (e.spiral) {
      // spirals are authored around the eye centre so the animator can spin them
      ctx.translate(-st.dx + e.x, -st.dy + e.y);
      ctx.strokeStyle = inkCol ?? face.pal.ink;
      ctx.lineWidth = ink ?? 2;
      ctx.lineCap = 'round';
      polyline(ctx, e.spiral.pts, false);
      ctx.stroke();
    } else {
      ctx.fillStyle = inkCol ?? face.pal.ink;
      ctx.beginPath();
      addPath(ctx, e.pupil);
      ctx.fill();
      ctx.fillStyle = face.pal.paper;
      ctx.beginPath();
      addPath(ctx, e.highlight);
      ctx.fill();
    }
    ctx.restore();
    if (st.lid) {
      ctx.save();
      ctx.beginPath();
      addPath(ctx, e.clip);
      ctx.clip();
      ctx.fillStyle = e.lidCol;
      ctx.beginPath();
      addPath(ctx, st.lid);
      ctx.fill();
      ctx.restore();
    }
    // the inked lid edge is what makes a closing eye read as shut rather than blank
    if (st.line && ink !== null) {
      ctx.fillStyle = inkCol ?? face.pal.ink;
      ctx.beginPath();
      addPath(ctx, ribbon(st.line.pts, st.line.widths.map((w) => (w * ink) / 2.2)));
      ctx.fill();
    }
  }
}

/** Every colour the face can contain, for snapping pixels back onto its palette. */
export function paletteOf(face: Face): RGB[] {
  const set = new Set<string>([face.pal.paper, face.pal.ink]);
  const add = (c: string) => set.add(resolveColor(c, face.pal, 'back'));
  for (const op of opsOf(face)) if (op.k !== 'paper') add(op.col);
  for (const e of face.eyes) {
    if (e.iris) add(e.iris.col);
    set.add(e.lidCol);
  }
  return [...set].map(rgb);
}

export function nearest(p: RGB[], r: number, g: number, b: number): RGB {
  let best = p[0]!, bd = Infinity;
  for (const c of p) {
    // weighted RGB distance: close enough to perceptual for snapping
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// ================= styles =================

function watercolour(face: Face, E: Engine, px: number) {
  return renderStill(face, E, px);
}

function luminanceOf(face: Face, E: Engine, n: number): Float32Array {
  const src = renderStill(face, E, n);
  const d = src.getContext('2d')!.getImageData(0, 0, n, n).data;
  const L = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const l = lum(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!);
    // stretch the levels so cream paper goes white and the mid-tones carry the dither
    L[i] = clamp01((l - 0.14) / (0.86 - 0.14)) ** 1.15;
  }
  return L;
}

function oneBit(n: number, on: (i: number) => boolean, ink: string, paper: string, px: number) {
  const [c, g] = canvas(n);
  const img = g.createImageData(n, n);
  const a = rgb(ink), b = rgb(paper);
  for (let i = 0; i < n * n; i++) {
    const p = on(i) ? a : b;
    img.data.set([p[0], p[1], p[2], 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  return upscale(c, px);
}

function atkinson(face: Face, E: Engine, px: number) {
  const n = 192;
  const L = luminanceOf(face, E, n);
  const out = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const old = L[i]!, v = old < 0.5 ? 0 : 1;
      out[i] = v ? 0 : 1;
      // Atkinson spreads only 6/8 of the error, which keeps highlights clean
      const err = (old - v) / 8;
      for (const [dx, dy] of [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]] as const) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < n && yy < n) L[yy * n + xx]! += err;
      }
    }
  }
  return oneBit(n, (i) => out[i] === 1, '#111111', '#f4f1ea', px);
}

const BAYER8 = (() => {
  const m = [[0, 2], [3, 1]];
  let cur = m;
  for (let s = 2; s < 8; s *= 2) {
    const next: number[][] = Array.from({ length: s * 2 }, () => Array<number>(s * 2).fill(0));
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const v = cur[y]![x]! * 4;
      next[y]![x] = v;
      next[y]![x + s] = v + 2;
      next[y + s]![x] = v + 3;
      next[y + s]![x + s] = v + 1;
    }
    cur = next;
  }
  return cur.map((r) => r.map((v) => (v + 0.5) / 64));
})();

function bayer(face: Face, E: Engine, px: number) {
  const n = 192;
  const L = luminanceOf(face, E, n);
  return oneBit(n, (i) => L[i]! < BAYER8[Math.floor(i / n) % 8]![(i % n) % 8]!, '#1f2347', '#ece6d4', px);
}

// ---- ASCII

// ---- print and paper

function plotter(face: Face, E: Engine, px: number) {
  const [c, g] = faceSpace(px);
  g.fillStyle = '#fbfaf5';
  g.fillRect(0, 0, W, W);
  const angles = [Math.PI / 4, -Math.PI / 4, 0, Math.PI / 2, Math.PI / 6, -Math.PI / 3];
  const hatchFill = (pts: Pt[], col: string, seed: number, clip?: Pt[], exclude?: Pt[][]) => {
    const [r, gg, b] = rgb(col);
    const l = lum(r, gg, b);
    const gap = 1.5 + l * l * 6;
    const ang = angles[seed % angles.length]!;
    g.save();
    applyClip(g, clip, exclude);
    g.beginPath();
    addPath(g, pts);
    g.clip();
    g.strokeStyle = `rgba(${r * 0.8},${gg * 0.8},${b * 0.8},0.95)`;
    g.lineWidth = 0.75;
    const bb = bbox(pts), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const reach = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2 + 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    g.beginPath();
    for (let s = -reach; s < reach; s += gap) {
      g.moveTo(cx - dy * s - dx * reach, cy + dx * s - dy * reach);
      g.lineTo(cx - dy * s + dx * reach, cy + dx * s + dy * reach);
    }
    g.stroke();
    g.restore();
  };
  const pen = '#1d2147';
  for (const op of opsOf(face)) {
    const col = resolveColor(op.k === 'paper' ? 'paper' : op.col, face.pal, 'back');
    if (op.k === 'wash' && col !== face.pal.paper) hatchFill(op.pts, col, op.seed, op.clip, op.exclude);
    else if (op.k === 'solid') hatchFill(op.pts, col === face.pal.paper ? '#ffffff' : pen, 3, op.clip);
    else if (op.k === 'hatch') {
      g.save();
      applyClip(g, op.region, op.exclude);
      g.strokeStyle = rgba(pen, 0.8);
      g.lineWidth = 0.55;
      for (const l of hatchLines(op, E)) { polyline(g, l.pts, false); g.stroke(); }
      g.restore();
    }
  }
  // white eye solids can't be hatched, so the paper shows; clear them back to paper first
  for (const op of face.figure) if (op.k === 'solid' && op.col === 'paper') {
    g.save(); applyClip(g, op.clip); g.fillStyle = '#fbfaf5'; g.beginPath(); addPath(g, op.pts); g.fill(); g.restore();
  }
  for (const op of face.figure) if (op.k === 'ink' && op.col !== 'paper') {
    g.save();
    applyClip(g, op.clip);
    g.strokeStyle = pen;
    g.lineWidth = 1.15;
    g.lineCap = g.lineJoin = 'round';
    polyline(g, op.pts, op.closed);
    g.stroke();
    g.restore();
  }
  drawFlatEyes(g, face, 1.15, pen);
  return c;
}

function cutout(face: Face, E: Engine, px: number) {
  const [c, g] = faceSpace(px);
  const k = px / W;
  g.fillStyle = '#e6d9c2';
  g.fillRect(0, 0, W, W);
  const r = rng(face.seed + 7);
  g.fillStyle = 'rgba(110,85,50,0.06)';
  for (let i = 0; i < 2600; i++) g.fillRect(r() * W, r() * W, 0.6 + r(), 0.6 + r());
  const shadow = (on: boolean) => {
    g.shadowColor = on ? 'rgba(50,30,10,0.32)' : 'transparent';
    g.shadowBlur = on ? 5 * k : 0;
    g.shadowOffsetX = on ? 1.2 * k : 0;
    g.shadowOffsetY = on ? 2.4 * k : 0;
  };
  for (const op of opsOf(face)) {
    if (op.k === 'paper' || op.k === 'hatch') continue;
    g.save();
    const col = resolveColor(op.col, face.pal, 'back');
    if (op.k === 'wash' || op.k === 'solid') {
      applyClip(g, op.clip, op.k === 'wash' ? op.exclude : undefined);
      shadow(true);
      g.fillStyle = col === face.pal.paper ? rgba('#fffaf0', op.k === 'solid' ? op.alpha : 1) : col;
      g.beginPath();
      addPath(g, op.pts);
      g.fill();
    } else if (op.k === 'ink' && op.col !== 'paper') {
      // pen lines become strips of black card
      applyClip(g, op.clip);
      shadow(true);
      g.strokeStyle = '#2a2420';
      g.lineWidth = Math.max(2.4, op.w * 0.75);
      g.lineCap = g.lineJoin = 'round';
      polyline(g, op.pts, op.closed);
      g.stroke();
    }
    g.restore();
  }
  shadow(true);
  drawFlatEyes(g, face, 2.6, '#2a2420');
  shadow(false);
  return c;
}

function neon(face: Face, E: Engine, px: number) {
  const [c, g] = faceSpace(px);
  const k = px / W;
  const wall = g.createRadialGradient(W / 2, W * 0.45, 20, W / 2, W / 2, W * 0.75);
  wall.addColorStop(0, '#2a1f2e');
  wall.addColorStop(1, '#0d0a0f');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, W);
  // each tube takes the colour of the paint it outlines, pushed to full saturation
  const [, rg] = faceSpace(W);
  drawFlat(rg, face, E, { ink: null, eyes: false });
  const refData = rg.getImageData(0, 0, W, W).data;
  const tubeCol = (p: Pt) => {
    const i = (Math.min(W - 1, Math.max(0, Math.round(p.y))) * W + Math.min(W - 1, Math.max(0, Math.round(p.x)))) * 4;
    const [r, gg, b] = [refData[i]!, refData[i + 1]!, refData[i + 2]!];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx - mn < 30) return '#ff4fa8';
    const s = (v: number) => Math.round(clamp01((v - mn) / (mx - mn)) * 200 + 55);
    return `rgb(${s(r)},${s(gg)},${s(b)})`;
  };
  const tube = (pts: Pt[], closed: boolean, col: string, w: number) => {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = g.lineJoin = 'round';
    g.shadowColor = col;
    g.shadowBlur = 16 * k;
    g.strokeStyle = col;
    g.globalAlpha = 0.7;
    g.lineWidth = w * 1.8;
    polyline(g, pts, closed);
    g.stroke();
    g.shadowBlur = 5 * k;
    g.globalAlpha = 0.95;
    g.lineWidth = w;
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,250,240,0.85)';
    g.lineWidth = w * 0.35;
    g.stroke();
    g.restore();
  };
  for (const op of face.figure) {
    if (op.k !== 'ink' || op.col === 'paper') continue;
    // sample just inside the line so outlines pick up the shape they wrap
    const mid = op.pts[Math.floor(op.pts.length / 2)]!;
    const bb = bbox(op.pts);
    const inner = { x: mid.x + ((bb.x0 + bb.x1) / 2 - mid.x) * 0.12, y: mid.y + ((bb.y0 + bb.y1) / 2 - mid.y) * 0.12 };
    tube(op.pts, op.closed, tubeCol(inner), Math.max(1.4, op.w * 0.6));
  }
  for (const e of face.eyes) {
    const st = eyeState(e, face.gaze, 1);
    // a closing eye becomes a single glowing lid line
    if (st.line && st.open < 0.4) tube(st.line.pts, false, '#7cf6ff', 1.6);
    else if (e.spiral) tube(e.spiral.pts.map((q) => ({ x: q.x + e.x, y: q.y + e.y })), false, '#7cf6ff', 1.6);
    else tube([...e.pupil, e.pupil[0]!].map((q) => ({ x: q.x + st.dx, y: q.y + st.dy })), true, '#7cf6ff', 1.8);
  }
  return c;
}

const RENDER: Record<StyleId, (face: Face, E: Engine, px: number) => HTMLCanvasElement> = {
  watercolour, atkinson, bayer, plotter, cutout, neon,
};

export function renderStyle(style: StyleId, face: Face, E: Engine, px: number): HTMLCanvasElement {
  E.noiseSeed(face.seed);
  return RENDER[style](face, E, px);
}

