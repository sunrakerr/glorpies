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

function makeCanvas(px: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(1, Math.round(px));
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
  const [back, bctx] = makeCanvas(px);
  play([bctx], face.back, face, E, 'back', scale);
  // multiply is order-independent, so the vignette is baked into the backdrop instead of redrawn every frame
  bctx.globalCompositeOperation = 'multiply';
  bctx.fillStyle = vignette(bctx);
  bctx.fillRect(0, 0, W, W);
  bctx.globalCompositeOperation = 'source-over';
  const sheets = Array.from({ length: phases }, () => makeCanvas(px));
  play(sheets.map(([, c]) => c), face.figure, face, E, 'figure', scale);
  const eyes = face.eyes.map((e): EyeRaster => {
    let spiral: Path2D | null = null;
    if (e.spiral) {
      spiral = new Path2D();
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
};

export const restPose = (face: Face): Pose => ({ phase: 0, rot: 0, sx: 1, sy: 1, ty: 0, look: face.gaze, blink: 1, spin: 0 });

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
  const c = document.createElement('canvas');
  c.width = c.height = px;
  drawFrame(c.getContext('2d')!, face, raster, restPose(face), px);
  return c;
}

