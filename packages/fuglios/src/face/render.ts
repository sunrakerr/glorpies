import { makeCanvas, makePath } from '../canvas';
import type { Engine } from '../engine';
import { addPath, ribbon, toPath2D, type Pt } from '../geometry';
import { rgba, type Palette } from '../palettes';
import { eyeState } from './eyes';
import { hatchLines, inkRibbons, type Ribbon } from './strokes';
import type { Color, Face, Op } from './types';
import { W } from './types';
import { rasterizeWash, type WashRaster } from './wash';

export type Sheet = 'back' | 'figure';

/** Inside the multiplied figure layer, white is what lets the paper show through. */
export function resolveColor(col: Color, pal: Palette, sheet: Sheet): string {
  if (col !== 'paper') return col;
  return sheet === 'figure' ? '#ffffff' : pal.paper;
}

type Ctx = CanvasRenderingContext2D;

function faceCanvas(px: number): [HTMLCanvasElement, Ctx] {
  const c = makeCanvas(px);
  const ctx = c.getContext('2d')!;
  ctx.scale(c.width / W, c.width / W);
  return [c, ctx];
}

export function applyClip(ctx: Ctx, clip?: Pt[], exclude?: Pt[][]) {
  if (clip) {
    ctx.beginPath();
    addPath(ctx, clip);
    ctx.clip();
  }
  for (const ex of exclude ?? []) {
    ctx.beginPath();
    ctx.rect(-W, -W, 3 * W, 3 * W);
    addPath(ctx, ex);
    ctx.clip('evenodd');
  }
}

function fillRibbons(ctx: Ctx, ribbons: Ribbon[], col: string) {
  for (const r of ribbons) {
    ctx.fillStyle = rgba(col, r.alpha);
    ctx.beginPath();
    addPath(ctx, r.pts);
    ctx.fill();
  }
}

/** Cream sheet with tooth: specks of pigment dust and a few paper fibres. */
export function paintPaper(ctx: Ctx, pal: Palette, seed: number, E: Engine) {
  E.seed(seed);
  ctx.fillStyle = pal.paper;
  ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 6000; i++) {
    const s = E.random(0.3, 1.2);
    ctx.fillStyle = rgba(pal.ink, E.random(0.015, 0.05));
    ctx.fillRect(E.random(0, W), E.random(0, W), s, s);
  }
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 60; i++) {
    const x = E.random(0, W), y = E.random(0, W);
    ctx.strokeStyle = rgba(pal.ink, E.random(0.03, 0.07));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + E.random(-8, 8), y + E.random(-8, 8), x + E.random(-16, 16), y + E.random(-16, 16));
    ctx.stroke();
  }
}

/** Plays a display list onto one canvas per boil phase; glazes are painted once and shared. */
export function play(targets: Ctx[], ops: Op[], face: Face, E: Engine, sheet: Sheet, scale: number) {
  const col = (c: Color) => resolveColor(c, face.pal, sheet);
  for (const op of ops) {
    if (op.k === 'paper') {
      for (const ctx of targets) paintPaper(ctx, face.pal, op.seed, E);
    } else if (op.k === 'wash') {
      const r = rasterizeWash(op, col(op.col), E, scale);
      for (const ctx of targets) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        applyClip(ctx, op.clip, op.exclude);
        ctx.drawImage(r.canvas, r.x, r.y, r.w, r.h);
        ctx.restore();
      }
    } else if (op.k === 'ink') {
      targets.forEach((ctx, phase) => {
        ctx.save();
        applyClip(ctx, op.clip);
        fillRibbons(ctx, inkRibbons(op, E, phase), col(op.col));
        ctx.restore();
      });
    } else if (op.k === 'hatch') {
      const lines = hatchLines(op, E);
      for (const ctx of targets) {
        ctx.save();
        applyClip(ctx, op.region, op.exclude);
        ctx.strokeStyle = rgba(col(op.col), op.alpha);
        ctx.lineCap = 'round';
        for (const l of lines) {
          ctx.lineWidth = l.w;
          ctx.beginPath();
          l.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      for (const ctx of targets) {
        ctx.save();
        applyClip(ctx, op.clip);
        ctx.fillStyle = rgba(col(op.col), op.alpha);
        ctx.beginPath();
        addPath(ctx, op.pts);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

type EyeRaster = { iris: WashRaster | null; clip: Path2D; pupil: Path2D; highlight: Path2D; spiral: Path2D | null };

export type FaceRaster = {
  px: number;
  back: HTMLCanvasElement;
  /** The figure redrawn once per boil phase. */
  figures: HTMLCanvasElement[];
  eyes: EyeRaster[];
};

export function rasterizeFace(face: Face, E: Engine, px: number, phases = 3): FaceRaster {
  E.noiseSeed(face.seed);
  const scale = px / W;
  const [back, bctx] = faceCanvas(px);
  play([bctx], face.back, face, E, 'back', scale);
  // multiply is order-independent, so the vignette is baked into the backdrop instead of redrawn every frame
  bctx.globalCompositeOperation = 'multiply';
  bctx.fillStyle = vignette(bctx);
  bctx.fillRect(0, 0, W, W);
  bctx.globalCompositeOperation = 'source-over';
  const sheets = Array.from({ length: phases }, () => faceCanvas(px));
  play(sheets.map(([, c]) => c), face.figure, face, E, 'figure', scale);
  const eyes = face.eyes.map((e): EyeRaster => {
    let spiral: Path2D | null = null;
    if (e.spiral) {
      spiral = makePath();
      for (const r of inkRibbons(e.spiral, E, 0)) addPath(spiral, r.pts);
    }
    return {
      iris: e.iris ? rasterizeWash(e.iris, e.iris.col, E, scale) : null,
      clip: toPath2D(e.clip),
      pupil: toPath2D(e.pupil),
      highlight: toPath2D(e.highlight),
      spiral,
    };
  });
  return { px, back, figures: sheets.map(([c]) => c), eyes };
}

export type Pose = {
  phase: number;
  rot: number;
  sx: number;
  sy: number;
  ty: number;
  look: Pt;
  blink: number;
  spin: number;
  /** Seconds on the stage clock, for easing between frames; 0 means a still with nothing to ease from. */
  t: number;
};

export const restPose = (face: Face): Pose => ({ phase: 0, rot: 0, sx: 1, sy: 1, ty: 0, look: face.gaze, blink: 1, spin: 0, t: 0 });

/** Composes one frame: still backdrop (vignette baked in), breathing figure multiplied over it, then live eyes. */
export function drawFrame(ctx: Ctx, face: Face, raster: FaceRaster, pose: Pose, px: number) {
  const k = px / W;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(raster.back, 0, 0, px, px);

  ctx.save();
  ctx.scale(k, k);
  const { x: pxv, y: pyv } = face.pivot;
  ctx.translate(pxv, pyv + pose.ty);
  ctx.rotate(pose.rot);
  ctx.scale(pose.sx, pose.sy);
  ctx.translate(-pxv, -pyv);
  ctx.globalCompositeOperation = 'multiply';
  const sheet = raster.figures[pose.phase % raster.figures.length]!;
  ctx.drawImage(sheet, 0, 0, W, W);
  ctx.globalCompositeOperation = 'source-over';

  drawEyes(ctx, face, raster, pose);
  ctx.restore();
}

/**
 * The parts of a styled still that differ when its eyes are posed: runs of
 * pixels at `x`, `y` in the still, packed into `atlas` at `sx`, `sy`.
 */
export type EyePatch = {
  look: Pt;
  blink: number;
  atlas: HTMLCanvasElement;
  runs: { sx: number; sy: number; x: number; y: number; w: number; h: number }[];
};

/**
 * A face in another style. It arrives as one finished still, held at rest
 * (`layers: 'pending'`) until the style has also painted its background bare.
 * Then it is split like the original (`'split'`): the background stays still
 * and only the face, cut out with a feathered mask, breathes and sways. A style
 * whose background is drawn from the face itself has nothing to keep still and
 * moves as one picture (`'whole'`). Eye patches arrive as they are painted.
 */
export type StillRaster = {
  px: number;
  still: HTMLCanvasElement;
  layers: 'pending' | 'split' | 'whole';
  back: HTMLCanvasElement | null;
  figure: HTMLCanvasElement | null;
  mask: HTMLCanvasElement | null;
  /** `snap` moves in whole pixels with no turn or squash, so crisp styles don't shimmer. */
  motion: 'sway' | 'snap';
  /** `snap` switches eye poses outright, for styles where a crossfade would show two pupils at once. */
  eyes: 'blend' | 'snap';
  /** Faces per side of the picture (Warhol prints four), each moved about its own neck. */
  tiles: number;
  patches: EyePatch[];
  /** The glance on screen and how far it has faded in, eased between frames. */
  glance: { patch: EyePatch | null; a: number; t: number } | null;
};

export type Painting = FaceRaster | StillRaster;

export const isStill = (p: Painting): p is StillRaster => 'still' in p;

/** Enough enlargement that ordinary sway never shows the picture's edge (worst case is about 5%). */
const STILL_OVERSCALE = 1.055;

export function drawStill(ctx: Ctx, face: Face, raster: StillRaster, pose: Pose, px: number) {
  const unit = px / raster.px;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  if (raster.layers === 'split' && raster.back && raster.figure) {
    ctx.drawImage(raster.back, 0, 0, px, px);
    const n = raster.tiles, tile = px / n;
    for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
      ctx.save();
      if (n > 1) {
        ctx.beginPath();
        ctx.rect(tx * tile, ty * tile, tile, tile);
        ctx.clip();
      }
      place(ctx, face, pose, raster.motion, tx * tile, ty * tile, tile);
      ctx.drawImage(raster.figure, 0, 0, px, px);
      drawPatches(ctx, raster, face, pose, unit);
      ctx.restore();
    }
    return;
  }

  if (raster.layers === 'pending' || raster.motion === 'snap') {
    // still at rest, or a crisp picture nudged by whole pixels over a copy of itself so no edge opens up
    ctx.drawImage(raster.still, 0, 0, px, px);
    if (raster.layers === 'pending') return drawPatches(ctx, raster, face, pose, unit);
    ctx.save();
    place(ctx, face, pose, 'snap', 0, 0, px);
    ctx.drawImage(raster.still, 0, 0, px, px);
    drawPatches(ctx, raster, face, pose, unit);
    ctx.restore();
    return;
  }

  // the whole picture sways, enlarged about its centre just enough that its edges never come into view
  const { x: pxv, y: pyv } = face.pivot;
  const c = Math.cos(-pose.rot), sn = Math.sin(-pose.rot);
  let need = 1;
  for (const [qx, qy] of [[0, 0], [W, 0], [0, W], [W, W]] as const) {
    const x = qx - pxv, y = qy - pyv - pose.ty;
    const ux = (x * c - y * sn) / pose.sx + pxv - W / 2;
    const uy = (x * sn + y * c) / pose.sy + pyv - W / 2;
    need = Math.max(need, Math.abs(ux) / (W / 2), Math.abs(uy) / (W / 2));
  }
  const grow = Math.max(STILL_OVERSCALE, need + 0.004);
  ctx.clearRect(0, 0, px, px);
  ctx.save();
  place(ctx, face, pose, 'sway', 0, 0, px);
  ctx.translate(px / 2, px / 2);
  ctx.scale(grow, grow);
  ctx.translate(-px / 2, -px / 2);
  ctx.drawImage(raster.still, 0, 0, px, px);
  drawPatches(ctx, raster, face, pose, unit);
  ctx.restore();
}

/**
 * Moves the drawing about the neck of the face in the tile at `ox`, `oy` (the
 * whole picture is one tile of size `size`). `snap` turns the sway into a
 * whole-pixel nudge: the head shifts as far as the turn would carry it, but
 * nothing is ever resampled.
 */
function place(ctx: Ctx, face: Face, pose: Pose, motion: 'sway' | 'snap', ox: number, oy: number, size: number) {
  const k = size / W;
  const px = ox + face.pivot.x * k, py = oy + face.pivot.y * k;
  if (motion === 'snap') {
    const reach = (face.pivot.y - face.sketch.centre.y) * k;
    ctx.translate(Math.round(Math.sin(pose.rot) * reach), Math.round(pose.ty * k));
    return;
  }
  ctx.translate(px, py + pose.ty * k);
  ctx.rotate(pose.rot);
  ctx.scale(pose.sx, pose.sy);
  ctx.translate(-px, -py);
}

/** Seconds for a glance patch to fade fully in or out. */
const GLANCE_FADE = 0.09;
/** A glance starts to show once the gaze is this far toward it. */
const GLANCE_FROM = 0.15;

/**
 * Lays the eye patches over the painting. A glance fades in as the gaze moves
 * its way and crossfades when another glance becomes nearer; a blink blends
 * from open through half-shut to shut with the blink itself, so eyes ease
 * rather than jump between the few poses that were painted.
 */
function drawPatches(ctx: Ctx, raster: StillRaster, face: Face, pose: Pose, unit: number) {
  const { patches } = raster;
  if (!patches.length) return;
  // a crisp or flat style can't show half a patch without greying its pixels or doubling its pupils, so it switches at the halfway point instead
  const crisp = raster.eyes === 'snap';
  const lay = (p: EyePatch | undefined, a: number) => {
    if (crisp) a = a >= 0.5 ? 1 : 0;
    if (!p || a <= 0.01) return;
    ctx.globalAlpha = Math.min(1, a);
    for (const r of p.runs) ctx.drawImage(p.atlas, r.sx, r.sy, r.w, r.h, r.x * unit, r.y * unit, r.w * unit, r.h * unit);
    ctx.globalAlpha = 1;
  };

  // how far the gaze has gone toward each glance, measured from the resting gaze
  const rel = { x: pose.look.x - face.gaze.x, y: pose.look.y - face.gaze.y };
  let best: EyePatch | null = null, bestW = 0;
  for (const p of patches) {
    if (p.blink !== 1) continue;
    const d = { x: p.look.x - face.gaze.x, y: p.look.y - face.gaze.y };
    const dd = d.x * d.x + d.y * d.y;
    if (dd < 1e-4) continue;
    const w = Math.min(1, Math.max(0, (rel.x * d.x + rel.y * d.y) / dd));
    if (w > bestW) { best = p; bestW = w; }
  }
  const target = smooth(Math.max(0, (bestW - GLANCE_FROM) / (1 - GLANCE_FROM)));
  const g = raster.glance;
  if (!g || pose.t === 0) {
    raster.glance = { patch: best, a: target, t: pose.t };
  } else {
    const step = Math.max(0, Math.min(0.1, pose.t - g.t)) / GLANCE_FADE;
    if (g.patch !== best) {
      g.a -= step;
      if (g.a <= 0) { g.patch = best; g.a = 0; }
    } else g.a += Math.max(-step, Math.min(step, target - g.a));
    g.t = pose.t;
  }
  const shown = raster.glance!;
  lay(shown.patch ?? undefined, shown.a);

  const b = pose.blink;
  if (b >= 0.999) return;
  const shut = patches.find((p) => p.blink === 0);
  const half = patches.find((p) => p.blink > 0 && p.blink < 1);
  if (half && shut) {
    if (b >= half.blink) lay(half, (1 - b) / (1 - half.blink));
    else {
      lay(half, 1);
      lay(shut, (half.blink - b) / half.blink);
    }
  } else if (shut) lay(shut, 1 - b);
  else if (half) lay(half, (1 - b) / (1 - half.blink));
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** The live parts of the eyes: irises and pupils (or spinning spirals), then lids, in face space. */
export function drawEyes(ctx: Ctx, face: Face, raster: FaceRaster, pose: Pose) {
  face.eyes.forEach((spec, i) => {
    const er = raster.eyes[i]!;
    const st = eyeState(spec, pose.look, pose.blink);
    ctx.save();
    ctx.clip(er.clip);
    if (er.iris) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(er.iris.canvas, er.iris.x + st.dx, er.iris.y + st.dy, er.iris.w, er.iris.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (er.spiral) {
      ctx.save();
      ctx.translate(spec.x, spec.y);
      ctx.rotate(pose.spin);
      ctx.fillStyle = rgba(face.pal.ink, 0.9);
      ctx.fill(er.spiral);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(st.dx, st.dy);
      ctx.fillStyle = rgba(face.pal.ink, 0.95);
      ctx.fill(er.pupil);
      ctx.fillStyle = rgba(face.pal.paper, 0.95);
      ctx.fill(er.highlight);
      ctx.restore();
    }
    if (st.lid) {
      ctx.fillStyle = spec.lidCol;
      ctx.beginPath();
      addPath(ctx, st.lid);
      ctx.fill();
    }
    ctx.restore();
    if (st.line) {
      ctx.fillStyle = rgba(face.pal.ink, 0.9);
      ctx.beginPath();
      addPath(ctx, ribbon(st.line.pts, st.line.widths));
      ctx.fill();
    }
  });
}

/** Aged-paper darkening toward the edges; shared with the SVG export. */
export const VIGNETTE = { inner: 0.32, outer: 0.76, color: '#b9a888', alpha: 0.32 };

export function vignette(ctx: Ctx): CanvasGradient {
  const g = ctx.createRadialGradient(W / 2, W / 2, W * VIGNETTE.inner, W / 2, W / 2, W * VIGNETTE.outer);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, rgba(VIGNETTE.color, VIGNETTE.alpha));
  return g;
}

/** A finished still at any size: the face at rest, eyes open, looking where it was painted to look. */
export function renderStill(face: Face, E: Engine, px: number): HTMLCanvasElement {
  const raster = rasterizeFace(face, E, px, 1);
  const c = makeCanvas(px);
  drawFrame(c.getContext('2d')!, face, raster, restPose(face), px);
  return c;
}

