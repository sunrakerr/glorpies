import type { Engine } from 'fuglios/internal/engine';
import { addPath, bbox, resample, TAU, type Pt } from 'fuglios/internal/geometry';
import { rgba, type Palette } from 'fuglios/internal/palettes';
import { buildFace } from 'fuglios/internal/face/build';
import { applyClip, drawEyes, play, rasterizeFace, vignette, type FaceRaster, type Pose } from 'fuglios/internal/face/render';
import { hatchLines, inkRibbons, type HatchLine } from 'fuglios/internal/face/strokes';
import type { Face, HatchOp, InkOp, Op, WashOp } from 'fuglios/internal/face/types';
import { W } from 'fuglios/internal/face/types';
import { deform, plan, type Plan, type VPt } from 'fuglios/internal/face/wash';

/**
 * A narrated walk through how one face is painted, drawn with the real
 * renderer. Everything is a pure function of time, so the same `draw(t)`
 * plays live in the browser and renders frame-exact video.
 */

export const VW = 1280;
export const VH = 720;
const FACE = { x: 660, y: 58, s: 560 };
const COL = { x: 92, w: 470 };
const PAGE = '#f4eee4';
const INK = '#2b231d';
const INK_2 = '#75685c';
const CLAY = '#b8573a';

type SceneId = 'title' | 'seed' | 'paper' | 'pencil' | 'glaze' | 'glazes' | 'hatch' | 'ink' | 'eyes' | 'sheets' | 'boil' | 'outro';
type Scene = { id: SceneId; dur: number; num: string; title: string; body: string };

const SCENES: Scene[] = [
  { id: 'title', dur: 3.6, num: '', title: 'How a face\ngets painted', body: 'Watercolour and dip pen, painted from scratch by code every time a face appears.' },
  { id: 'seed', dur: 4, num: '01', title: 'One number', body: 'Every face starts as a seed. It drives p5.js random() and noise(), which choose the palette, head, antennae or horns, eyes, mouth and quirks. The same seed always paints the same face.' },
  { id: 'paper', dur: 2.6, num: '02', title: 'Paper', body: 'A cream sheet with tooth: 6,000 specks of pigment dust and a few stray fibres.' },
  { id: 'pencil', dur: 2.8, num: '03', title: 'Underdrawing', body: 'Faint graphite guides: the oval of the head and the lines where the eyes and nose will sit.' },
  { id: 'glaze', dur: 10, num: '04', title: 'A watercolour glaze', body: '' },
  { id: 'glazes', dur: 3.8, num: '05', title: 'More glazes', body: 'Background, horns, shadows and cheeks use the same recipe. Glazes multiply, so they darken where they overlap, like real pigment.' },
  { id: 'hatch', dur: 3.2, num: '06', title: 'Hatching', body: 'Two passes of wobbly parallel lines shade the side away from the light, clipped to the head.' },
  { id: 'ink', dur: 7, num: '07', title: 'Dip-pen ink', body: 'Lines are filled ribbons, not strokes. Perlin noise sets the pen pressure, the ends taper, a second off-register pass ghosts each line, and sometimes the nib runs dry.' },
  { id: 'eyes', dur: 4.4, num: '08', title: 'Eyes stay live', body: "Pupils and lids aren't painted in. They're drawn fresh every frame, so faces glance around, follow your cursor and blink." },
  { id: 'sheets', dur: 5, num: '09', title: 'Three sheets', body: '' },
  { id: 'boil', dur: 5, num: '10', title: 'Line boil', body: 'Every face is inked three times with shifted noise, and the three sheets cycle eight times a second: the shimmer of hand-drawn animation. The head breathes and sways around its neck.' },
  { id: 'outro', dur: 4.6, num: '', title: 'One list,\nevery format', body: '' },
];

const STARTS = SCENES.reduce<number[]>((acc, s, i) => [...acc, (acc[i - 1] ?? 0) + (SCENES[i - 1]?.dur ?? 0)], []);
export const DURATION = SCENES.reduce((s, c) => s + c.dur, 0);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const prog = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const ease = (v: number) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return [c, c.getContext('2d')!];
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const opKind = (op: Op): GlobalCompositeOperation => (op.k === 'wash' ? 'multiply' : 'source-over');

/** Ops painted one after another onto a copy of `base`, so the frame for any time only paints what changed. */
class Progressive {
  private acc: HTMLCanvasElement;
  private actx: Ctx;
  private n = 0;
  private tempFor = -1;
  private temp: HTMLCanvasElement;
  private tctx: Ctx;

  constructor(private base: HTMLCanvasElement, readonly ops: Op[], private paint: (ctx: Ctx, op: Op) => void) {
    [this.acc, this.actx] = canvas(base.width);
    [this.temp, this.tctx] = canvas(base.width);
    this.reset();
  }

  private reset() {
    this.actx.setTransform(1, 0, 0, 1, 0, 0);
    this.actx.clearRect(0, 0, this.acc.width, this.acc.height);
    this.actx.drawImage(this.base, 0, 0);
    this.n = 0;
  }

  /** The base with the first `n` ops painted. */
  upTo(n: number): HTMLCanvasElement {
    if (n < this.n) this.reset();
    for (; this.n < Math.min(n, this.ops.length); this.n++) {
      const op = this.ops[this.n]!;
      if (this.n === this.tempFor) {
        this.actx.setTransform(1, 0, 0, 1, 0, 0);
        this.actx.globalCompositeOperation = opKind(op);
        this.actx.drawImage(this.temp, 0, 0);
        this.actx.globalCompositeOperation = 'source-over';
      } else this.paint(this.actx, op);
    }
    return this.acc;
  }

  /** Op `i` alone on a transparent sheet, for fading it in. */
  single(i: number): HTMLCanvasElement {
    if (this.tempFor !== i) {
      this.tctx.setTransform(1, 0, 0, 1, 0, 0);
      this.tctx.clearRect(0, 0, this.temp.width, this.temp.height);
      this.paint(this.tctx, this.ops[i]!);
      this.tempFor = i;
    }
    return this.temp;
  }
}

export type Fonts = { display: string; text: string };

export type Explainer = { draw: (ctx: Ctx, t: number) => void; seed: number };

/** Builds the face and pre-paints the stages. `k` is output pixels per layout pixel (1.5 → 1920×1080). */
export function prepareExplainer(seed: number, E: Engine, k: number, fonts: Fonts): Explainer {
  const face = buildFace(seed, E);
  const pal = face.pal;
  const px = Math.round(FACE.s * k);
  const scale = px / W;
  E.noiseSeed(face.seed);

  const sheet = (): [HTMLCanvasElement, Ctx] => {
    const [c, g] = canvas(px);
    g.scale(scale, scale);
    return [c, g];
  };
  // figure ops are painted straight over the backdrop here, so 'paper' resolves to the paper colour
  const paint = (ctx: Ctx, op: Op) => {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    play([ctx], [op], face, E, 'back', scale);
    ctx.restore();
  };
  const snapshot = (src: HTMLCanvasElement) => {
    const [c, g] = canvas(px);
    g.drawImage(src, 0, 0);
    return c;
  };

  // ---- sort the display list into the order the story tells it
  const paperOp = face.back.find((o) => o.k === 'paper');
  const pencilOps = face.back.filter((o) => o.k === 'ink');
  const washes = (ops: Op[]) => ops.filter((o): o is WashOp => o.k === 'wash');
  const figureWashes = washes(face.figure);
  const showWash = figureWashes.find((o) => o.col === pal.skin && o.layers === 30)
    ?? figureWashes.reduce((a, b) => (area(b.pts) > area(a.pts) ? b : a), figureWashes[0]!);
  const glazeOps: Op[] = [...face.back.filter((o) => o.k === 'wash' || o.k === 'solid'), ...figureWashes.filter((o) => o !== showWash)];
  const hatchOps = face.figure.filter((o): o is HatchOp => o.k === 'hatch');
  const inkish = face.figure.filter((o) => o.k === 'ink' || o.k === 'solid');
  const figureInks = inkish.filter((o): o is InkOp => o.k === 'ink' && o.col !== 'paper');
  const showInk = figureInks.filter((o) => o.w > 3.9 && o.w < 4.4).reduce<InkOp | null>((a, b) => (!a || area(b.pts) > area(a.pts) ? b : a), null)
    ?? figureInks.reduce((a, b) => (area(b.pts) > area(a.pts) ? b : a), figureInks[0]!);
  const inkOps: Op[] = [showInk, ...inkish.filter((o) => o !== showInk)];

  // ---- stage snapshots
  const [paperC, paperG] = sheet();
  if (paperOp) play([paperG], [paperOp], face, E, 'back', scale);
  const pencil = new Progressive(paperC, pencilOps, paint);
  const afterPencil = snapshot(pencil.upTo(pencilOps.length));
  const afterShow = snapshot(afterPencil);
  paint(afterShow.getContext('2d')!, showWash);
  const glazes = new Progressive(afterShow, glazeOps, paint);
  const afterGlazes = snapshot(glazes.upTo(glazeOps.length));
  const hatch = new Progressive(afterGlazes, hatchOps, paint);
  const afterHatch = snapshot(hatch.upTo(hatchOps.length));
  const inks = new Progressive(afterHatch, inkOps, paint);
  const afterInk = snapshot(inks.upTo(inkOps.length));

  const raster: FaceRaster = rasterizeFace(face, E, px, 3);
  const [live, liveG] = canvas(px);
  const [eyeLayer, eyeG] = canvas(px);

  // ---- the glaze, step by step: the same random stream plan() uses, one subdivision at a time
  E.seed(showWash.seed);
  const dx = E.random(-showWash.shift, showWash.shift), dy = E.random(-showWash.shift, showWash.shift);
  const levels: VPt[][] = [showWash.pts.map((q) => ({ x: q.x + dx, y: q.y + dy, v: showWash.v * E.random(0.5, 1.5) }))];
  for (let i = 0; i < 2 + showWash.depth; i++) levels.push(deform(levels[i]!, 1, E));
  const glazePlan: Plan = plan(showWash, E);
  const [work, workG] = sheet();

  const hatchLinesFor = new Map<HatchOp, HatchLine[]>(hatchOps.map((o) => [o, hatchLines(o, E)]));

  // ---- sample strokes for the pen inset
  const sample = (seedN: number, dry: boolean): InkOp => ({
    k: 'ink', seed: seedN, col: pal.ink, w: 4.4, passes: dry ? 1 : 2, jit: 1, alpha: 0.9, ghost: 1.8, taper: true, dry, closed: false,
    pts: Array.from({ length: 24 }, (_, i) => ({ x: i * 8.4, y: Math.sin(i * 0.28) * 7 })),
  });
  const samples = [sample(41, false), sample(97, true)];

  // ---- page and card furniture
  const [bg, bgG] = canvas(VW * k, VH * k);
  bgG.fillStyle = PAGE;
  bgG.fillRect(0, 0, bg.width, bg.height);
  const r = rng(seed);
  for (let i = 0; i < 14000; i++) {
    bgG.fillStyle = rgba(INK, 0.012 + r() * 0.03);
    const s = (0.4 + r() * 1.1) * k;
    bgG.fillRect(r() * bg.width, r() * bg.height, s, s);
  }
  const dabs = swatches(pal, k, seed);

  const eyeCentre = face.eyes.length
    ? { x: face.eyes.reduce((s, e) => s + e.x, 0) / face.eyes.length, y: face.eyes.reduce((s, e) => s + e.y, 0) / face.eyes.length }
    : { x: W / 2, y: W * 0.45 };
  const opCount = face.back.length + face.figure.length + face.eyes.length;

  // ================= drawing =================
  const toFace = (ctx: Ctx) => ctx.setTransform((k * FACE.s) / W, 0, 0, (k * FACE.s) / W, k * FACE.x, k * FACE.y);
  const layout = (ctx: Ctx) => ctx.setTransform(k, 0, 0, k, 0, 0);
  const hair = W / FACE.s;

  function blit(ctx: Ctx, src: HTMLCanvasElement, alpha = 1, op: GlobalCompositeOperation = 'source-over') {
    if (alpha <= 0) return;
    layout(ctx);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = op;
    ctx.drawImage(src, FACE.x, FACE.y, FACE.s, FACE.s);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function withFace(ctx: Ctx, fn: () => void) {
    ctx.save();
    layout(ctx);
    ctx.beginPath();
    ctx.rect(FACE.x, FACE.y, FACE.s, FACE.s);
    ctx.clip();
    toFace(ctx);
    fn();
    ctx.restore();
  }

  function vignetteOver(ctx: Ctx, alpha = 1) {
    withFace(ctx, () => {
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = vignette(ctx);
      ctx.fillRect(0, 0, W, W);
    });
  }

  function inkPartial(ctx: Ctx, op: InkOp, reveal: number, alpha = 1) {
    withFace(ctx, () => {
      applyClip(ctx, op.clip);
      const col = op.col === 'paper' ? pal.paper : op.col;
      for (const rb of inkRibbons(op, E, 0, reveal)) {
        ctx.fillStyle = rgba(col, rb.alpha * alpha);
        ctx.beginPath();
        addPath(ctx, rb.pts);
        ctx.fill();
      }
    });
  }

  /** Draws ops in sequence over the window, each taking time in proportion to its length. */
  function sequence(ctx: Ctx, prog: Progressive, u: number, partial: (op: Op, f: number) => void) {
    const lens = prog.ops.map(opLength);
    const total = lens.reduce((s, l) => s + l, 0) || 1;
    let acc = 0, i = 0;
    for (; i < lens.length; i++) {
      const f = lens[i]! / total;
      if (u < acc + f) break;
      acc += f;
    }
    blit(ctx, prog.upTo(i));
    const op = prog.ops[i];
    if (op) partial(op, (u - acc) / (lens[i]! / total));
  }

  function fadeIn(ctx: Ctx, p: Progressive, i: number, f: number) {
    blit(ctx, p.single(i), ease(f), opKind(p.ops[i]!));
  }

  function partialOp(ctx: Ctx, p: Progressive) {
    return (op: Op, f: number) => {
      const i = p.ops.indexOf(op);
      if (op.k === 'ink') inkPartial(ctx, op, ease(f));
      else if (op.k === 'hatch') hatchPartial(ctx, op, f);
      else fadeIn(ctx, p, i, f);
    };
  }

  function hatchPartial(ctx: Ctx, op: HatchOp, f: number) {
    const lines = hatchLinesFor.get(op) ?? [];
    const n = f * lines.length;
    withFace(ctx, () => {
      applyClip(ctx, op.region, op.exclude);
      ctx.strokeStyle = rgba(op.col === 'paper' ? pal.paper : op.col, op.alpha);
      ctx.lineCap = 'round';
      lines.forEach((l, i) => {
        if (i > n) return;
        const part = clamp01(n - i);
        const pts = l.pts.slice(0, Math.max(2, Math.ceil(part * l.pts.length)));
        ctx.lineWidth = l.w;
        ctx.beginPath();
        pts.forEach((q, j) => (j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.stroke();
      });
    });
  }

  function outline(ctx: Ctx, pts: Pt[], color: string, alpha: number, width = 1.3, dash: number[] = []) {
    if (alpha <= 0) return;
    withFace(ctx, () => {
      ctx.strokeStyle = rgba(color, alpha);
      ctx.lineWidth = width * hair;
      ctx.lineJoin = 'round';
      ctx.setLineDash(dash.map((d) => d * hair));
      // open on purpose: closed shapes are passed with their first point repeated
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
    });
  }

  function pose(t: number, o: { move: number; look: Pt; blink: number; boil: boolean }): Pose {
    const { breathe, sway, phase } = face.temper;
    const breath = Math.sin((TAU * t) / breathe + phase) * o.move;
    const swing = Math.sin((TAU * t) / (breathe * 1.6) + phase * 1.7) * o.move;
    return {
      phase: o.boil ? Math.floor(t * 8) : 0,
      rot: ((sway * Math.PI) / 180) * swing,
      sx: 1 - 0.008 * breath,
      sy: 1 + 0.012 * breath,
      ty: -1.5 * breath,
      look: o.look,
      blink: o.blink,
      spin: t * 2.4,
      t,
    };
  }

  /** A scripted glance around the room, with saccades and blinks. */
  function gazeAt(t: number): { look: Pt; blink: number } {
    const keys: Pt[] = [face.gaze, { x: -0.95, y: 0.05 }, { x: 0.9, y: -0.45 }, { x: 0.15, y: 0.6 }, { x: 0, y: 0 }];
    const hold = 1.15;
    const i = Math.floor(t / hold);
    const from = keys[i % keys.length]!, to = keys[(i + 1) % keys.length]!;
    const look = lerpPt(from, to, ease(prog(t - i * hold, hold - 0.22, hold)));
    const blinkTimes = [0.9, 2.6, 2.95, 4.6];
    let blink = 1;
    for (const b of blinkTimes) {
      const u = (t % 5.2 - b) / 0.2;
      if (u >= 0 && u <= 1) blink = Math.min(blink, u < 0.4 ? 1 - u / 0.4 : (u - 0.4) / 0.6);
    }
    return { look, blink };
  }

  function liveFrame(ctx: Ctx, p: Pose, alpha = 1) {
    // drawFrame resets the transform, so it paints offscreen first
    liveG.setTransform(1, 0, 0, 1, 0, 0);
    liveG.drawImage(raster.back, 0, 0);
    liveG.save();
    liveG.scale(scale, scale);
    figureTransform(liveG, p);
    liveG.globalCompositeOperation = 'multiply';
    liveG.drawImage(raster.figures[p.phase % raster.figures.length]!, 0, 0, W, W);
    liveG.globalCompositeOperation = 'source-over';
    drawEyes(liveG, face, raster, p);
    liveG.restore();
    blit(ctx, live, alpha);
  }

  function figureTransform(g: Ctx, p: Pose) {
    const { x, y } = face.pivot;
    g.translate(x, y + p.ty);
    g.rotate(p.rot);
    g.scale(p.sx, p.sy);
    g.translate(-x, -y);
  }

  // ---- left column type
  function text(ctx: Ctx, s: string, x: number, y: number, font: string, color: string, alpha: number, maxW = COL.w, lh = 0, align: CanvasTextAlign = 'left'): number {
    layout(ctx);
    ctx.font = font;
    ctx.fillStyle = rgba(color, alpha);
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    let yy = y;
    for (const para of s.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxW && line) {
          ctx.fillText(line, x, yy);
          yy += lh;
          line = word;
        } else line = next;
      }
      ctx.fillText(line, x, yy);
      yy += lh;
    }
    return yy;
  }

  function caption(ctx: Ctx, sc: Scene, local: number, top = 214): number {
    const a = ease(prog(local, 0.1, 0.7)) * (1 - ease(prog(local, sc.dur - 0.45, sc.dur - 0.05)));
    const lift = (1 - ease(prog(local, 0.1, 0.8))) * 14;
    let y = top + lift;
    if (sc.num) {
      text(ctx, `${sc.num}`, COL.x, y, `600 13px ${fonts.text}`, CLAY, a);
      layout(ctx);
      ctx.fillStyle = rgba(CLAY, a * 0.5);
      ctx.fillRect(COL.x + 26, y - 5, 28, 1.2);
      y += 50;
    }
    const big = sc.id === 'title' || sc.id === 'outro';
    y = text(ctx, sc.title, COL.x - 2, y, `500 ${big ? 60 : 44}px ${fonts.display}`, INK, a, COL.w + 40, big ? 64 : 50);
    if (sc.body) y = text(ctx, sc.body, COL.x, y + 10, `400 18px ${fonts.text}`, INK_2, a, COL.w - 20, 28);
    return y;
  }

  /** A small label under the sheet, like a note pinned beside a drawing. */
  function chip(ctx: Ctx, s: string, alpha: number) {
    if (alpha <= 0 || !s) return;
    layout(ctx);
    ctx.font = `500 13px ${fonts.text}`;
    const w = ctx.measureText(s).width + 26;
    const x = FACE.x + FACE.s / 2 - w / 2, y = FACE.y + FACE.s + 22;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgba(INK, 0.86);
    roundRect(ctx, x, y, w, 26, 13);
    ctx.fill();
    ctx.fillStyle = PAGE;
    ctx.textAlign = 'center';
    ctx.fillText(s, x + w / 2, y + 17.5);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  function card(ctx: Ctx, alpha: number) {
    if (alpha <= 0) return;
    layout(ctx);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(60,40,20,0.28)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#fbf8f2';
    ctx.fillRect(FACE.x, FACE.y, FACE.s, FACE.s);
    ctx.restore();
  }

  function tape(ctx: Ctx, alpha: number) {
    if (alpha <= 0) return;
    layout(ctx);
    const strips = [
      { x: FACE.x + 6, y: FACE.y + 18, rot: -0.68, col: '#efc3bb' },
      { x: FACE.x + FACE.s - 6, y: FACE.y + 18, rot: 0.62, col: '#c9dccd' },
    ];
    for (const s of strips) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.globalAlpha = 0.84 * alpha;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = s.col;
      ctx.beginPath();
      const w = 150, h = 30;
      ctx.moveTo(-w / 2, -h / 2);
      for (let i = 0; i <= 6; i++) ctx.lineTo(-w / 2 + (w * i) / 6, -h / 2 + (i % 2 ? 1.5 : 0));
      for (let i = 0; i <= 5; i++) ctx.lineTo(w / 2 + (i % 2 ? -2.5 : 0), -h / 2 + (h * i) / 5);
      for (let i = 6; i >= 0; i--) ctx.lineTo(-w / 2 + (w * i) / 6, h / 2 - (i % 2 ? 1.5 : 0));
      for (let i = 5; i >= 0; i--) ctx.lineTo(-w / 2 + (i % 2 ? 2.5 : 0), -h / 2 + (h * i) / 5);
      ctx.fill();
      ctx.restore();
    }
  }

  // ================= scenes =================
  function scene(ctx: Ctx, sc: Scene, local: number, t: number) {
    const u = local / sc.dur;
    switch (sc.id) {
      case 'title': {
        card(ctx, 1);
        const g = gazeAt(t);
        liveFrame(ctx, pose(t, { move: 1, look: g.look, blink: g.blink, boil: true }), 1 - ease(prog(local, sc.dur - 0.7, sc.dur)));
        tape(ctx, 1);
        const y = caption(ctx, sc, local, 250);
        text(ctx, `seed ${seed}`, COL.x, y + 22, `500 14px ${fonts.text}`, CLAY, ease(prog(local, 0.6, 1.2)) * (1 - ease(prog(local, sc.dur - 0.45, sc.dur))));
        break;
      }
      case 'seed': {
        card(ctx, 1);
        const y = caption(ctx, sc, local);
        const settle = prog(local, 0.4, 1.6);
        const digits = String(seed).split('').map((d, i) => (settle >= (i + 1) / String(seed).length ? d : String(Math.floor(rng(Math.floor(t * 24) * 31 + i)() * 10))));
        text(ctx, digits.join(''), COL.x, y + 46, `500 46px ${fonts.display}`, CLAY, ease(prog(local, 0.3, 0.8)) * (1 - ease(prog(local, sc.dur - 0.45, sc.dur))));
        // the palette the seed picked, as dabs on the sheet
        const out = 1 - ease(prog(local, sc.dur - 0.5, sc.dur));
        dabs.forEach((d, i) => {
          const a = ease(prog(local, 1.2 + i * 0.12, 1.6 + i * 0.12)) * out;
          if (a <= 0) return;
          const col = i % 4, row = Math.floor(i / 4);
          const cx = FACE.x + 92 + col * 125, cy = FACE.y + 120 + row * 158;
          layout(ctx);
          ctx.globalAlpha = a;
          ctx.globalCompositeOperation = 'multiply';
          ctx.drawImage(d.canvas, cx - 48, cy - 48 + (1 - a) * 8, 96, 96);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          text(ctx, d.name, cx, cy + 70, `500 12px ${fonts.text}`, INK_2, a, 120, 0, 'center');
        });
        tape(ctx, 1);
        break;
      }
      case 'paper': {
        card(ctx, 1);
        const rr = ease(prog(local, 0.2, 1.8)) * W * 0.78;
        withFace(ctx, () => {
          ctx.beginPath();
          for (let i = 0; i <= 60; i++) {
            const a = (i / 60) * TAU;
            const w = rr * (1 + 0.06 * Math.sin(a * 5 + 1.3) + 0.04 * Math.sin(a * 9 + local * 3));
            const q = { x: W / 2 + Math.cos(a) * w, y: W / 2 + Math.sin(a) * w };
            if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
          }
          ctx.clip();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          layout(ctx);
          ctx.drawImage(paperC, FACE.x, FACE.y, FACE.s, FACE.s);
        });
        vignetteOver(ctx, ease(prog(local, 1, 2.2)));
        tape(ctx, 1);
        caption(ctx, sc, local);
        chip(ctx, '6,000 specks · 60 fibres', ease(prog(local, 0.6, 1)) * (1 - ease(prog(local, sc.dur - 0.4, sc.dur))));
        break;
      }
      case 'pencil': {
        card(ctx, 1);
        sequence(ctx, pencil, ease(prog(local, 0.2, sc.dur - 0.5)), partialOp(ctx, pencil));
        vignetteOver(ctx);
        tape(ctx, 1);
        caption(ctx, sc, local);
        chip(ctx, `${pencilOps.length} graphite lines`, ease(prog(local, 0.4, 0.8)) * (1 - ease(prog(local, sc.dur - 0.4, sc.dur))));
        break;
      }
      case 'glaze': {
        card(ctx, 1);
        blit(ctx, afterPencil);
        // 0–3.6s: subdivide; 3.6–6.6s: stack layers; 6.6–10s: grain, bloom, pooled edge
        const stackU = prog(local, 3.6, 6.6);
        const nLayers = Math.round(ease(stackU) * glazePlan.layers.length);
        if (nLayers > 0) {
          workG.setTransform(1, 0, 0, 1, 0, 0);
          workG.clearRect(0, 0, work.width, work.height);
          workG.setTransform(scale, 0, 0, scale, 0, 0);
          workG.save();
          applyClip(workG, showWash.clip, showWash.exclude);
          workG.fillStyle = rgba(showWash.col, showWash.alpha);
          for (const poly of glazePlan.layers.slice(0, nLayers)) {
            workG.beginPath();
            addPath(workG, poly);
            workG.fill();
          }
          workG.restore();
          const fin = ease(prog(local, 6.8, 8));
          blit(ctx, work, 1 - fin, 'multiply');
          blit(ctx, afterShow, fin);
        }
        vignetteOver(ctx);

        // the outline subdividing, new midpoints sliding out from the straight edge
        const levelT = prog(local, 0.4, 3.4) * (levels.length - 1);
        const li = Math.min(levels.length - 1, Math.floor(levelT));
        const morph = ease((levelT - li) * 1.6);
        const prev = levels[li]!, next = levels[Math.min(levels.length - 1, li + 1)]!;
        const shown = li === levels.length - 1 ? prev : next.map((q, j) => (j % 2 === 0 ? q : lerpPt(midpoint(prev, (j - 1) / 2), q, morph)));
        const lineA = (1 - ease(prog(local, 4.2, 5.4))) * ease(prog(local, 0, 0.4));
        outline(ctx, [...shown, shown[0]!], INK, 0.75 * lineA, 1.2);
        if (shown.length <= 140) {
          withFace(ctx, () => {
            shown.forEach((q, j) => {
              const fresh = li < levels.length - 1 && j % 2 === 1;
              ctx.fillStyle = rgba(fresh ? CLAY : INK, lineA * (fresh ? 0.95 : 0.7));
              ctx.beginPath();
              ctx.arc(q.x, q.y, (fresh ? 3 : 2.2) * hair, 0, TAU);
              ctx.fill();
            });
          });
        }
        // finishing touches, pointed out
        const finA = ease(prog(local, 7, 7.6)) * (1 - ease(prog(local, 9.2, 9.8)));
        if (glazePlan.edge) outline(ctx, [...glazePlan.edge.pts, glazePlan.edge.pts[0]!], CLAY, finA * 0.85, 1.4, [5, 5]);
        if (glazePlan.bloom) outline(ctx, [...glazePlan.bloom, glazePlan.bloom[0]!], CLAY, finA, 1.6, [3, 4]);

        const body =
          local < 3.6
            ? 'It starts as a rough polygon. Every edge is split and its midpoint nudged by a Gaussian random, again and again, until the outline wobbles like wet paint.'
            : local < 6.6
              ? `Then ${showWash.layers} slightly different wobbles are stacked at ${Math.round(showWash.alpha * 100)}% opacity. The edges stay soft and the middle goes deep.`
              : 'Last, specks of pigment are lifted for grain, a drop of water may push out a bloom, and the edge darkens where pigment pools.';
        const step = local < 3.6 ? 0 : local < 6.6 ? 1 : 2;
        const stepStart = [0, 3.6, 6.6][step]!, stepEnd = [3.6, 6.6, sc.dur][step]!;
        const y = caption(ctx, { ...sc, body: '' }, local);
        text(ctx, body, COL.x, y + 10 + (1 - ease(prog(local, stepStart + 0.05, stepStart + 0.6))) * 8, `400 18px ${fonts.text}`, INK_2,
          ease(prog(local, stepStart + 0.05, stepStart + 0.6)) * (1 - ease(prog(local, stepEnd - 0.4, stepEnd - 0.05))), COL.w - 20, 28);
        const label =
          local < 3.6 ? `split + nudge · depth ${li} · ${shown.length} points`
            : local < 6.6 ? `layer ${nLayers} / ${glazePlan.layers.length} · ${Math.round(showWash.alpha * 100)}% each`
              : [glazePlan.lifts.size ? 'grain lifted' : '', glazePlan.bloom ? 'bloom' : '', glazePlan.edge ? 'pigment pooled at the edge' : ''].filter(Boolean).join(' · ');
        chip(ctx, label, ease(prog(local, 0.3, 0.7)) * (1 - ease(prog(local, sc.dur - 0.4, sc.dur))));
        tape(ctx, 1);
        break;
      }
      case 'glazes': {
        card(ctx, 1);
        sequence(ctx, glazes, ease(prog(local, 0.2, sc.dur - 0.4)), partialOp(ctx, glazes));
        vignetteOver(ctx);
        tape(ctx, 1);
        caption(ctx, sc, local);
        chip(ctx, `${glazeOps.length + 1} glazes, multiplied`, ease(prog(local, 0.4, 0.8)) * (1 - ease(prog(local, sc.dur - 0.4, sc.dur))));
        break;
      }
      case 'hatch': {
        card(ctx, 1);
        sequence(ctx, hatch, ease(prog(local, 0.5, sc.dur - 0.4)), partialOp(ctx, hatch));
        vignetteOver(ctx);
        const region = hatchOps[0]?.region;
        if (region) outline(ctx, [...region, region[0]!], CLAY, ease(prog(local, 0, 0.4)) * (1 - ease(prog(local, 1.2, 1.9))) * 0.9, 1.5, [6, 5]);
        tape(ctx, 1);
        caption(ctx, sc, local);
        const lines = hatchOps.reduce((s, o) => s + (hatchLinesFor.get(o)?.length ?? 0), 0);
        chip(ctx, `${lines} hand-wobbled lines`, ease(prog(local, 0.4, 0.8)) * (1 - ease(prog(local, sc.dur - 0.4, sc.dur))));
        break;
      }
      case 'ink': {
        card(ctx, 1);
        // the head line on its own first, then everything else
        const pen = prog(local, 0.9, 3.4);
        if (local < 3.4) {
          blit(ctx, afterHatch);
          vignetteOver(ctx);
          const path = resample(showInk.pts, 1.8);
          outline(ctx, showInk.closed ? [...path, path[0]!] : path, CLAY, ease(prog(local, 0.1, 0.6)) * (1 - ease(prog(local, 2.6, 3.4))) * 0.9, 1.2, [2, 4]);
          if (pen > 0) {
            inkPartial(ctx, showInk, ease(pen));
            const tip = nibAt(showInk, ease(pen));
            if (tip && pen < 1) {
              withFace(ctx, () => {
                ctx.fillStyle = rgba(CLAY, 0.9);
                ctx.beginPath();
                ctx.arc(tip.x, tip.y, 5 * hair, 0, TAU);
                ctx.fill();
              });
            }
          }
        } else {
          const rest = ease(prog(local, 3.4, sc.dur - 0.5));
          // the head line is already down; the rest share the remaining time
          const partial = partialOp(ctx, inks);
          const others = inks.ops.slice(1);
          const lens = others.map(opLength);
          const total = lens.reduce((s, l) => s + l, 0) || 1;
          let acc = 0, i = 0;
          for (; i < lens.length; i++) {
            const f = lens[i]! / total;
            if (rest < acc + f) break;
            acc += f;
          }
          blit(ctx, inks.upTo(i + 1));
          vignetteOver(ctx);
          const op = others[i];
          if (op) partial(op, (rest - acc) / (lens[i]! / total));
        }
        tape(ctx, 1);
        const y = caption(ctx, sc, local);
        // the pen, magnified
        const insetA = ease(prog(local, 0.5, 1)) * (1 - ease(prog(local, sc.dur - 0.45, sc.dur)));
        samples.forEach((s, i) => {
          const sy = y + 34 + i * 82;
          ctx.save();
          layout(ctx);
          ctx.translate(COL.x, sy);
          ctx.scale(1.9, 1.9);
          for (const rb of inkRibbons(s, E, 0, ease(prog(local, 0.9 + i * 0.6, 3 + i * 0.6)))) {
            ctx.fillStyle = rgba(pal.ink, rb.alpha * insetA);
            ctx.beginPath();
            addPath(ctx, rb.pts);
            ctx.fill();
          }
          ctx.restore();
          text(ctx, i ? 'dry nib: gaps where the noise runs high' : 'pressure from noise · tapered ends · ghost pass', COL.x, sy + 34, `500 12px ${fonts.text}`, INK_2, insetA, 400);
        });
        chip(ctx, local < 3.4 ? 'one line: a ribbon whose width follows noise' : `${inkOps.length} lines and dots`, ease(prog(local, 0.4, 0.8)) * (1 - ease(prog(local, sc.dur - 0.4, sc.dur))));
        break;
      }
      case 'eyes': {
        card(ctx, 1);
        blit(ctx, afterInk);
        vignetteOver(ctx);
        const g = gazeAt(Math.max(0, local - 0.6));
        liveFrame(ctx, pose(t, { move: 0, look: g.look, blink: g.blink, boil: false }), ease(prog(local, 0.1, 0.9)));
        // ring the eyes while they come alive
        const ringA = ease(prog(local, 0.5, 1)) * (1 - ease(prog(local, 2.2, 2.8)));
        withFace(ctx, () => {
          for (const e of face.eyes) {
            ctx.strokeStyle = rgba(CLAY, ringA * 0.9);
            ctx.lineWidth = 1.5 * hair;
            ctx.setLineDash([4 * hair, 4 * hair]);
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r * 1.6, 0, TAU);
            ctx.stroke();
          }
        });
        tape(ctx, 1);
        caption(ctx, sc, local);
        chip(ctx, 'pupils · lids · spirals: drawn per frame', ease(prog(local, 0.4, 0.8)) * (1 - ease(prog(local, sc.dur - 0.4, sc.dur))));
        break;
      }
      case 'sheets': {
        const p = ease(prog(local, 0.3, 1.5)) * (1 - ease(prog(local, sc.dur - 1.3, sc.dur - 0.1)));
        card(ctx, 1 - p);
        const g = gazeAt(t);
        const ps = pose(t, { move: 1, look: g.look, blink: g.blink, boil: false });
        const plates = [-1, 0, 1].map((lvl) => plateMatrix(p, lvl * 128));
        ctx.save();
        if (p < 0.01) {
          layout(ctx);
          ctx.beginPath();
          ctx.rect(FACE.x, FACE.y, FACE.s, FACE.s);
          ctx.clip();
        }
        // backdrop
        setPlate(ctx, plates[0]!);
        ctx.drawImage(raster.back, 0, 0, W, W);
        plateEdge(ctx, p);
        // figure: multiplied, so its white sheet disappears and only the drawing floats
        setPlate(ctx, plates[1]!);
        plateFill(ctx, p);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, W);
        ctx.clip();
        figureTransform(ctx, ps);
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(raster.figures[0]!, 0, 0, W, W);
        ctx.restore();
        plateEdge(ctx, p);
        // eyes
        eyeG.setTransform(1, 0, 0, 1, 0, 0);
        eyeG.clearRect(0, 0, eyeLayer.width, eyeLayer.height);
        eyeG.scale(scale, scale);
        figureTransform(eyeG, ps);
        drawEyes(eyeG, face, raster, ps);
        setPlate(ctx, plates[2]!);
        plateFill(ctx, p);
        ctx.drawImage(eyeLayer, 0, 0, W, W);
        plateEdge(ctx, p);
        ctx.restore();
        tape(ctx, 1 - p);

        caption(ctx, sc, local, 120);
        const legend = [
          ['Eyes', 'drawn fresh every frame'],
          ['Figure', 'breathes and sways, multiplied on top'],
          ['Backdrop', 'paper, glazes, vignette: painted once'],
        ] as const;
        legend.forEach(([name, what], i) => {
          const m = plates[2 - i]!;
          const corner = { x: m.e + m.c * W, y: m.f + m.d * W };
          const a = ease(prog(local, 1 + i * 0.25, 1.6 + i * 0.25)) * (1 - ease(prog(local, sc.dur - 1.5, sc.dur - 1)));
          if (a <= 0) return;
          const ly = corner.y;
          text(ctx, name, COL.x, ly - 4, `500 26px ${fonts.display}`, INK, a, 300);
          text(ctx, what, COL.x, ly + 20, `400 15px ${fonts.text}`, INK_2, a, 300);
          layout(ctx);
          ctx.strokeStyle = rgba(CLAY, a * 0.7);
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(COL.x + 340, ly);
          ctx.lineTo(corner.x - 10, corner.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = rgba(CLAY, a);
          ctx.beginPath();
          ctx.arc(corner.x - 6, corner.y, 3, 0, TAU);
          ctx.fill();
        });
        break;
      }
      case 'boil': {
        card(ctx, 1);
        const g = gazeAt(t);
        const ps = pose(t, { move: 1, look: g.look, blink: g.blink, boil: true });
        liveFrame(ctx, ps);
        tape(ctx, 1);
        const y = caption(ctx, sc, local);
        const a = ease(prog(local, 0.6, 1.1)) * (1 - ease(prog(local, sc.dur - 0.45, sc.dur)));
        const size = W * 0.3;
        const src = { x: (eyeCentre.x - size / 2) * scale, y: (eyeCentre.y - size * 0.4) * scale, s: size * scale };
        raster.figures.forEach((fig, i) => {
          const x = COL.x + i * 128, ty = y + 30, s = 112;
          const on = ps.phase % raster.figures.length === i;
          layout(ctx);
          ctx.globalAlpha = a;
          ctx.fillStyle = '#fffdf8';
          ctx.fillRect(x, ty, s, s);
          ctx.globalCompositeOperation = 'multiply';
          ctx.drawImage(fig, src.x, src.y, src.s, src.s, x, ty, s, s);
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = on ? CLAY : rgba(INK, 0.15);
          ctx.lineWidth = on ? 2.5 : 1;
          ctx.strokeRect(x, ty, s, s);
          ctx.globalAlpha = 1;
          text(ctx, `sheet ${'ABC'[i]}`, x + s / 2, ty + s + 20, `500 12px ${fonts.text}`, on ? CLAY : INK_2, a, 120, 0, 'center');
        });
        chip(ctx, '3 inkings · 8 fps · breathing on its neck', ease(prog(local, 0.4, 0.8)) * (1 - ease(prog(local, sc.dur - 0.4, sc.dur))));
        break;
      }
      case 'outro': {
        card(ctx, 1);
        const g = gazeAt(t);
        liveFrame(ctx, pose(t, { move: 1, look: g.look, blink: g.blink, boil: true }));
        tape(ctx, 1);
        const y = caption(ctx, sc, local, 230);
        const a = (k: number) => ease(prog(local, 0.6 + k * 0.35, 1.1 + k * 0.35)) * (1 - ease(prog(local, sc.dur - 0.5, sc.dur - 0.05)));
        const row = [`seed ${seed}`, `${opCount} operations`];
        let x = COL.x;
        layout(ctx);
        ctx.font = `500 14px ${fonts.text}`;
        row.forEach((s, i) => {
          const w = ctx.measureText(s).width + 28;
          pill(ctx, x, y + 14, w, s, a(i), i === 0);
          x += w;
          if (i < row.length - 1) {
            text(ctx, '→', x + 14, y + 33, `400 18px ${fonts.text}`, INK_2, a(i + 0.5), 40, 0, 'center');
            x += 28;
          }
        });
        let ox = COL.x;
        ['canvas', 'PNG', 'SVG'].forEach((s, i) => {
          layout(ctx);
          ctx.font = `500 14px ${fonts.text}`;
          const w = ctx.measureText(s).width + 28;
          pill(ctx, ox, y + 64, w, s, a(2 + i * 0.4), false);
          ox += w + 10;
        });
        text(ctx, 'The same list paints this screen, a 2K PNG, or an SVG with real vector ink.', COL.x, y + 142, `400 18px ${fonts.text}`, INK_2, a(3), COL.w - 20, 28);
        break;
      }
    }
  }

  function pill(ctx: Ctx, x: number, y: number, w: number, s: string, a: number, strong: boolean) {
    if (a <= 0) return;
    layout(ctx);
    ctx.globalAlpha = a;
    ctx.fillStyle = strong ? rgba(CLAY, 0.92) : rgba(INK, 0.07);
    roundRect(ctx, x, y + (1 - a) * 6, w, 30, 15);
    ctx.fill();
    ctx.fillStyle = strong ? PAGE : INK;
    ctx.font = `500 14px ${fonts.text}`;
    ctx.textAlign = 'center';
    ctx.fillText(s, x + w / 2, y + 20 + (1 - a) * 6);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  type M = { a: number; b: number; c: number; d: number; e: number; f: number };
  /** Lays a W×W sheet flat on the card (p = 0) or as an isometric plate raised by `h` (p = 1). */
  function plateMatrix(p: number, h: number): M {
    const s = FACE.s / W;
    const flat: M = { a: s, b: 0, c: 0, d: s, e: FACE.x, f: FACE.y };
    const ia = s * 0.52, ib = s * 0.25;
    const cx = FACE.x + FACE.s / 2, cy = FACE.y + FACE.s / 2 + 20 - h;
    const iso: M = { a: ia, b: ib, c: -ia, d: ib, e: cx - ((ia - ia) * W) / 2, f: cy - ((ib + ib) * W) / 2 };
    return { a: lerp(flat.a, iso.a, p), b: lerp(flat.b, iso.b, p), c: lerp(flat.c, iso.c, p), d: lerp(flat.d, iso.d, p), e: lerp(flat.e, iso.e, p), f: lerp(flat.f, iso.f, p) };
  }

  function setPlate(ctx: Ctx, m: M) {
    ctx.setTransform(k * m.a, k * m.b, k * m.c, k * m.d, k * m.e, k * m.f);
  }

  /** Raised sheets read as frosted glass, so the one below shows through. */
  function plateFill(ctx: Ctx, p: number) {
    if (p <= 0.02) return;
    ctx.fillStyle = rgba('#fffdf8', 0.3 * p);
    ctx.fillRect(0, 0, W, W);
  }

  function plateEdge(ctx: Ctx, p: number) {
    if (p <= 0.02) return;
    ctx.save();
    ctx.strokeStyle = rgba(INK, 0.35 * p);
    ctx.lineWidth = 1.4 * hair;
    ctx.setLineDash([6 * hair, 5 * hair]);
    ctx.strokeRect(0, 0, W, W);
    ctx.restore();
  }

  function nibAt(op: InkOp, reveal: number): Pt | null {
    // mirror inkRibbons: closed lines start from a random point and overrun a little
    E.seed(op.seed);
    let path = resample(op.pts, 1.8);
    if (op.closed) {
      const s = Math.floor(E.random(0, path.length));
      path = path.slice(s).concat(path.slice(0, s));
      path = path.concat(path.slice(0, Math.max(2, Math.floor(path.length * E.random(0.04, 0.1)))));
    }
    return path[Math.max(0, Math.ceil(path.length * reveal) - 1)] ?? null;
  }

  return {
    seed,
    draw(ctx, time) {
      const t = ((time % DURATION) + DURATION) % DURATION;
      let i = SCENES.length - 1;
      while (i > 0 && t < STARTS[i]!) i--;
      const sc = SCENES[i]!;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(bg, 0, 0, ctx.canvas.width, ctx.canvas.height);
      scene(ctx, sc, t - STARTS[i]!, t);
      // progress hairline along the bottom
      layout(ctx);
      ctx.fillStyle = rgba(INK, 0.08);
      ctx.fillRect(COL.x, VH - 34, COL.w, 2);
      ctx.fillStyle = rgba(CLAY, 0.7);
      ctx.fillRect(COL.x, VH - 34, COL.w * (t / DURATION), 2);
      ctx.restore();
    },
  };
}

function midpoint(pts: Pt[], i: number): Pt {
  const a = pts[i % pts.length]!, b = pts[(i + 1) % pts.length]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function area(pts: Pt[]): number {
  const b = bbox(pts);
  return (b.x1 - b.x0) * (b.y1 - b.y0);
}

function opLength(op: Op): number {
  if (op.k === 'ink') {
    let l = 0;
    for (let i = 1; i < op.pts.length; i++) l += Math.hypot(op.pts[i]!.x - op.pts[i - 1]!.x, op.pts[i]!.y - op.pts[i - 1]!.y);
    return 18 + l;
  }
  if (op.k === 'hatch') return 400;
  if (op.k === 'wash') return 120;
  return 14;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const SWATCH_NAMES: [keyof Palette, string][] = [
  ['skin', 'skin'], ['shade', 'shade'], ['blush', 'blush'], ['hair', 'hair'],
  ['hair2', 'hair, dark'], ['accent', 'accent'], ['accent2', 'accent 2'], ['bg', 'ground'],
  ['bg2', 'ground 2'], ['ink', 'ink'], ['paper', 'paper'],
];

/** Each palette colour as a little watercolour dab: wobbly translucent discs with a darker rim. */
function swatches(pal: Palette, k: number, seed: number) {
  return SWATCH_NAMES.map(([key, name], i) => {
    const col = pal[key];
    const [c, g] = canvas(96 * k);
    g.scale(k, k);
    const r = rng(seed + i * 977);
    for (let l = 0; l < 14; l++) {
      g.fillStyle = rgba(col, 0.13);
      g.beginPath();
      const o = r() * TAU;
      for (let j = 0; j <= 28; j++) {
        const a = (j / 28) * TAU;
        const rad = 30 * (1 + 0.1 * Math.sin(a * 3 + o) + 0.06 * Math.sin(a * 7 + o * 2) + (r() - 0.5) * 0.05);
        const q = { x: 48 + Math.cos(a) * rad + (r() - 0.5) * 2, y: 48 + Math.sin(a) * rad + (r() - 0.5) * 2 };
        if (j) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
      }
      g.fill();
    }
    g.strokeStyle = rgba(col, key === 'paper' ? 0.5 : 0.35);
    g.lineWidth = 1.1;
    g.beginPath();
    g.arc(48, 48, 30.5, 0, TAU);
    g.stroke();
    return { name, canvas: c };
  });
}
