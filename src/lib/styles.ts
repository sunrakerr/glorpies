import type { Engine } from './engine';
import { addPath, bbox, TAU, type Pt } from './geometry';
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

export type StyleId =
  | 'watercolour' | 'atkinson' | 'bayer' | 'pixel' | 'stitch' | 'ascii' | 'ascii-colour' | 'riso' | 'plotter' | 'cutout' | 'neon';

export const STYLES: { id: StyleId; name: string; note: string }[] = [
  { id: 'watercolour', name: 'Watercolour & dip pen', note: 'the original' },
  { id: 'atkinson', name: '1-bit, Atkinson', note: 'error diffusion, classic Mac' },
  { id: 'bayer', name: '1-bit, ordered', note: '8×8 Bayer threshold' },
  { id: 'pixel', name: 'Pixel art', note: '64 × 64, palette-locked' },
  { id: 'stitch', name: 'Cross-stitch', note: '44 × 44 on aida cloth' },
  { id: 'ascii', name: 'ASCII', note: 'density ramp + line glyphs' },
  { id: 'ascii-colour', name: 'ASCII, terminal', note: 'coloured glyphs on black' },
  { id: 'riso', name: 'Risograph', note: 'three-ink halftone, misregistered' },
  { id: 'plotter', name: 'Pen plotter', note: 'multi-pen hatching' },
  { id: 'cutout', name: 'Paper cut-out', note: 'layered card with shadows' },
  { id: 'neon', name: 'Neon sign', note: 'glowing tubes' },
];

function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
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

/** The face at n×n with every pixel on the palette and pen lines as hard 1px runs. */
export function pixelGrid(face: Face, E: Engine, n: number) {
  const [fill, fg] = faceSpace(n);
  drawFlat(fg, face, E, { ink: null });
  const [ink, ig] = faceSpace(n);
  drawFlat(ig, face, E, { ink: (W / n) * 0.95, inkCol: '#000000', eyes: false, fills: false });
  const pal = paletteOf(face);
  const inkRGB = rgb(face.pal.ink);
  const fd = fg.getImageData(0, 0, n, n), id = ig.getImageData(0, 0, n, n);
  const cells: RGB[] = [];
  const paper: boolean[] = [];
  const paperRGB = rgb(face.pal.paper);
  for (let i = 0; i < n * n; i++) {
    const j = i * 4;
    const isInk = id.data[j + 3]! > 150;
    const c = isInk ? inkRGB : nearest(pal, fd.data[j]!, fd.data[j + 1]!, fd.data[j + 2]!);
    cells.push(c);
    paper.push(c === paperRGB || (c[0] === paperRGB[0] && c[1] === paperRGB[1] && c[2] === paperRGB[2]));
  }
  // the pupils are tiny at this size; stamp them so every face keeps its eyes
  for (const e of face.eyes) {
    const st = eyeState(e, face.gaze, 1);
    const b = bbox(e.pupil);
    const x = Math.round((((b.x0 + b.x1) / 2 + st.dx) / W) * n - 0.5), y = Math.round((((b.y0 + b.y1) / 2 + st.dy) / W) * n - 0.5);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const k = (y + dy) * n + x + dx;
      if (k >= 0 && k < cells.length) { cells[k] = inkRGB; paper[k] = false; }
    }
  }
  return { n, cells, paper };
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

function pixel(face: Face, E: Engine, px: number) {
  const { n, cells } = pixelGrid(face, E, 64);
  const [c, g] = canvas(n);
  const img = g.createImageData(n, n);
  cells.forEach((p, i) => img.data.set([p[0], p[1], p[2], 255], i * 4));
  g.putImageData(img, 0, 0);
  return upscale(c, px);
}

function stitch(face: Face, E: Engine, px: number) {
  const { n, cells, paper } = pixelGrid(face, E, 44);
  const [c, g] = canvas(px);
  const s = px / n;
  const r = rng(face.seed);
  g.fillStyle = '#eee6d3';
  g.fillRect(0, 0, px, px);
  // aida weave: holes at every cell corner
  g.fillStyle = 'rgba(120,100,70,0.22)';
  for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) g.fillRect(x * s - 1, y * s - 1, 2, 2);
  g.lineCap = 'round';
  cells.forEach((p, i) => {
    if (paper[i]) return;
    const x = (i % n) * s, y = Math.floor(i / n) * s, m = s * 0.16;
    const col = `rgb(${p[0]},${p[1]},${p[2]})`;
    const dark = `rgba(${p[0] * 0.55},${p[1] * 0.55},${p[2] * 0.55},0.55)`;
    const lite = `rgba(255,255,255,${0.2 + r() * 0.12})`;
    for (const [ax, ay, bx, by] of [[x + m, y + m, x + s - m, y + s - m], [x + s - m, y + m, x + m, y + s - m]] as const) {
      const j = () => (r() - 0.5) * s * 0.06;
      g.strokeStyle = dark;
      g.lineWidth = s * 0.34;
      g.beginPath(); g.moveTo(ax + j(), ay + 1 + j()); g.lineTo(bx + j(), by + 1 + j()); g.stroke();
      g.strokeStyle = col;
      g.lineWidth = s * 0.27;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.strokeStyle = lite;
      g.lineWidth = s * 0.07;
      g.beginPath(); g.moveTo(ax + s * 0.04, ay - s * 0.03); g.lineTo(bx + s * 0.04, by - s * 0.03); g.stroke();
    }
  });
  return c;
}

// ---- ASCII

const RAMP = ' .,:;irsXA253hMHGS#9B&@';

type Cell = { ch: string; col: RGB; line: boolean };

/** Each character cell gets a density glyph, or a line glyph that follows the pen stroke through it. */
function asciiCells(face: Face, E: Engine, px: number, cols: number, rows: number): Cell[] {
  const still = renderStill(face, E, px);
  const sd = still.getContext('2d')!.getImageData(0, 0, px, px).data;
  const [, mg] = faceSpace(px);
  drawFlat(mg, face, E, { ink: 2.6, inkCol: '#000000', eyes: false, fills: false });
  const md = mg.getImageData(0, 0, px, px).data;
  // ink mask: 1 where the pen line is
  const M = new Float32Array(px * px);
  for (let i = 0; i < px * px; i++) M[i] = md[i * 4 + 3]! > 120 ? 1 : 0;
  const cw = px / cols, ch = px / rows;
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * cw), x1 = Math.floor((c + 1) * cw), y0 = Math.floor(r * ch), y1 = Math.floor((r + 1) * ch);
      let sr = 0, sg = 0, sb = 0, cov = 0, jxx = 0, jyy = 0, jxy = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * px + x;
          sr += sd[i * 4]!; sg += sd[i * 4 + 1]!; sb += sd[i * 4 + 2]!;
          cov += M[i]!;
          count++;
          if (x > 0 && y > 0 && x < px - 1 && y < px - 1) {
            const gx = M[i + 1]! - M[i - 1]!, gy = M[i + px]! - M[i - px]!;
            jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
          }
        }
      }
      const col: RGB = [sr / count, sg / count, sb / count];
      const coverage = cov / count;
      if (coverage > 0.13 && jxx + jyy > 0) {
        // structure tensor: the dominant gradient direction, turned 90° to run along the line
        const tangent = (0.5 * Math.atan2(2 * jxy, jxx - jyy) + Math.PI / 2 + Math.PI) % Math.PI;
        const deg = (tangent * 180) / Math.PI;
        const glyph = coverage > 0.6 ? '@' : deg < 22.5 || deg >= 157.5 ? '-' : deg < 67.5 ? '\\' : deg < 112.5 ? '|' : '/';
        cells.push({ ch: glyph, col, line: true });
        continue;
      }
      const l = clamp01((lum(col[0], col[1], col[2]) - 0.12) / 0.78);
      const d = 1 - l;
      cells.push({ ch: RAMP[Math.min(RAMP.length - 1, Math.floor(d ** 1.2 * RAMP.length * 1.1))]!, col, line: false });
    }
  }
  return cells;
}

function drawGlyphs(g: Ctx, cells: Cell[], cols: number, rows: number, px: number, paint: (c: Cell) => string, weight: (c: Cell) => string) {
  const cw = px / cols, ch = px / rows;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const family = 'ui-monospace, "SF Mono", Menlo, monospace';
  g.font = `600 ${ch}px ${family}`;
  const scale = cw / g.measureText('M').width;
  cells.forEach((c, i) => {
    if (c.ch === ' ') return;
    g.font = `${weight(c)} ${Math.min(ch * 1.05, ch * scale * 1.05)}px ${family}`;
    g.fillStyle = paint(c);
    g.fillText(c.ch, (i % cols) * cw + cw / 2, Math.floor(i / cols) * ch + ch / 2 + 1);
  });
}

function ascii(face: Face, E: Engine, px: number) {
  const cols = 50, rows = 31;
  const cells = asciiCells(face, E, px, cols, rows);
  const [c, g] = canvas(px);
  g.fillStyle = '#f3eee3';
  g.fillRect(0, 0, px, px);
  drawGlyphs(g, cells, cols, rows, px, (cl) => (cl.line ? '#1d1915' : 'rgba(40,33,27,0.82)'), (cl) => (cl.line ? '800' : '500'));
  return c;
}

function asciiColour(face: Face, E: Engine, px: number) {
  const cols = 50, rows = 31;
  const cells = asciiCells(face, E, px, cols, rows);
  const [c, g] = canvas(px);
  g.fillStyle = '#100e0d';
  g.fillRect(0, 0, px, px);
  drawGlyphs(g, cells, cols, rows, px, (cl) => {
    if (cl.line) return '#f6ead2';
    // dark pigments would vanish on black, so every colour is lifted to at least mid brightness
    const [r, gg, b] = cl.col, m = Math.max(r, gg, b, 1), k = Math.max(1, 200 / m);
    return `rgb(${Math.min(255, r * k)},${Math.min(255, gg * k)},${Math.min(255, b * k)})`;
  }, (cl) => (cl.line ? '800' : '600'));
  return c;
}

// ---- print and paper

function riso(face: Face, E: Engine, px: number) {
  const still = renderStill(face, E, px);
  const sd = still.getContext('2d')!.getImageData(0, 0, px, px).data;
  const sample = (x: number, y: number): RGB => {
    const xi = Math.min(px - 1, Math.max(0, Math.round(x))), yi = Math.min(px - 1, Math.max(0, Math.round(y)));
    const i = (yi * px + xi) * 4;
    return [sd[i]! / 255, sd[i + 1]! / 255, sd[i + 2]! / 255];
  };
  const [c, g] = canvas(px);
  g.fillStyle = '#f7f2e7';
  g.fillRect(0, 0, px, px);
  const cell = px / 86;
  // riso Yellow, Fluorescent Pink and Blue standing in for Y, M and C, each a little off-register
  const inks = [
    { col: '#ffe800', angle: 0, off: { x: -1.5, y: 2 }, amount: (p: RGB) => 1 - p[2] },
    { col: '#ff48b0', angle: (75 * Math.PI) / 180, off: { x: 2, y: -1 }, amount: (p: RGB) => 1 - p[1] },
    { col: '#0078bf', angle: (15 * Math.PI) / 180, off: { x: 0, y: 0 }, amount: (p: RGB) => 1 - p[0] },
  ];
  g.globalCompositeOperation = 'multiply';
  for (const ink of inks) {
    g.fillStyle = ink.col;
    const ca = Math.cos(ink.angle), sa = Math.sin(ink.angle);
    const reach = px * 0.75;
    for (let v = -reach; v < reach; v += cell) {
      for (let u = -reach; u < reach; u += cell) {
        const x = px / 2 + u * ca - v * sa, y = px / 2 + u * sa + v * ca;
        if (x < -cell || y < -cell || x > px + cell || y > px + cell) continue;
        const a = clamp01((ink.amount(sample(x, y)) - 0.06) * 1.25);
        if (a < 0.02) continue;
        g.beginPath();
        g.arc(x + ink.off.x, y + ink.off.y, cell * 0.72 * Math.sqrt(a), 0, TAU);
        g.fill();
      }
    }
  }
  // the key drawing printed solid in blue
  const [lines, lg] = faceSpace(px);
  drawFlat(lg, face, E, { ink: 2.2, inkCol: '#000000', eyes: false, fills: false });
  const ld = lg.getImageData(0, 0, px, px);
  const blue = rgb('#0b4f9c');
  for (let i = 0; i < px * px; i++) {
    const j = i * 4;
    const k = ld.data[j + 3]! > 120;
    ld.data.set(k ? [blue[0], blue[1], blue[2], 235] : [0, 0, 0, 0], j);
  }
  lg.putImageData(ld, 0, 0);
  g.drawImage(lines, 0, 0);
  // drum grain: specks where the ink didn't take
  g.globalCompositeOperation = 'source-over';
  const r = rng(face.seed);
  g.fillStyle = 'rgba(247,242,231,0.55)';
  for (let i = 0; i < px * px * 0.02; i++) g.fillRect(r() * px, r() * px, 1 + r(), 1 + r());
  return c;
}

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
    if (e.spiral) tube(e.spiral.pts.map((q) => ({ x: q.x + e.x, y: q.y + e.y })), false, '#7cf6ff', 1.6);
    else tube([...e.pupil, e.pupil[0]!].map((q) => ({ x: q.x + st.dx, y: q.y + st.dy })), true, '#7cf6ff', 1.8);
  }
  return c;
}

const RENDER: Record<StyleId, (face: Face, E: Engine, px: number) => HTMLCanvasElement> = {
  watercolour, atkinson, bayer, pixel, stitch, ascii, 'ascii-colour': asciiColour, riso, plotter, cutout, neon,
};

export function renderStyle(style: StyleId, face: Face, E: Engine, px: number): HTMLCanvasElement {
  E.noiseSeed(face.seed);
  return RENDER[style](face, E, px);
}

