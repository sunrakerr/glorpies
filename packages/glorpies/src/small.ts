import type { Engine } from './engine';
import { bbox, ribbon, TAU, type Pt } from './geometry';
import { mix, rgba } from './palettes';
import { canvas, polyline, type Ctx } from './raster';
import { eyeState } from './face/eyes';
import { renderStill } from './face/render';
import { bareFace } from './face/bare';
import type { Face, Sketch } from './face/types';

/**
 * Faces for small places. Full looks turn to mud below about 64px, so these redraw the face from its
 * sketch with a few bold shapes, cropped in on the head with the eyes enlarged.
 */

export const SMALL_STYLES = [
  { id: 'blob', name: 'Soft blob', note: 'flat shapes, big eyes, nothing else' },
  {
    id: 'ink',
    name: 'Ink badge',
    note: 'the house style: flat colour under one bold wobbly pen line',
  },
  { id: 'sticker', name: 'Sticker', note: 'die-cut white border and a lifted shadow' },
  { id: 'cutpaper', name: 'Cut paper', note: 'three layers of card' },
  { id: 'pixel-icon', name: 'Pixel icon', note: '20 × 20, outlined, favicon-ready' },
  { id: 'line-icon', name: 'Line icon', note: 'one pen, one weight, no fills' },
  { id: 'glow', name: 'Neon glow', note: 'glowing tubes on black' },
  { id: 'wash', name: 'Watercolour, cropped', note: 'the original, framed tighter' },
] as const;

export type SmallId = (typeof SMALL_STYLES)[number]['id'];

const MOUTH_DARK = '#5b1a26';

/** Maps face units onto the avatar: the head and hair fill most of it, centred. */
type Frame = {
  s: number;
  ox: number;
  oy: number;
  /** One percent of the avatar, in face units. */ u: number;
};

function frameOf(k: Sketch, px: number, fill = 0.8): Frame {
  const pts: Pt[] = [...k.head, ...(k.hair.cover ?? []), ...(k.hat?.pompom ?? [])];
  for (const e of k.ears) pts.push({ x: e.x - e.rx, y: e.y }, { x: e.x + e.rx, y: e.y });
  const b = bbox(pts);
  // antennae, horns and tentacles widen the frame a little, then are cropped, so the face stays big
  const reach = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.22;
  const lim = { x0: b.x0 - reach, y0: b.y0 - reach, x1: b.x1 + reach, y1: b.y1 + reach };
  for (const q of k.parts)
    if (!q.loose)
      for (const pt of q.pts) {
        b.x0 = Math.min(b.x0, Math.max(pt.x, lim.x0));
        b.x1 = Math.max(b.x1, Math.min(pt.x, lim.x1));
        b.y0 = Math.min(b.y0, Math.max(pt.y, lim.y0));
        b.y1 = Math.max(b.y1, Math.min(pt.y, lim.y1));
      }
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0) / fill;
  const s = px / size;
  return {
    s,
    ox: px / 2 - ((b.x0 + b.x1) / 2) * s,
    oy: px / 2 - ((b.y0 + b.y1) / 2) * s,
    u: size / 100,
  };
}

/** How face units map onto an avatar of `px` pixels, for drawing over it (a state's marks). */
export function avatarMap(face: Face, px: number): { s: number; ox: number; oy: number } {
  const { s, ox, oy } = frameOf(face.sketch, px);
  return { s, ox, oy };
}

/** A canvas already transformed into face units for this avatar. */
function sheet(face: Face, px: number, fill?: number): [HTMLCanvasElement, Ctx, Frame] {
  const [c, g] = canvas(px);
  const f = frameOf(face.sketch, px, fill);
  g.setTransform(f.s, 0, 0, f.s, f.ox, f.oy);
  g.lineCap = g.lineJoin = 'round';
  return [c, g, f];
}

function backdrop(g: Ctx, fill: string | CanvasGradient) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = fill;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.restore();
}

function fillPts(g: Ctx, pts: readonly Pt[] | null | undefined, col: string | CanvasGradient) {
  if (!pts?.length) return;
  g.fillStyle = col;
  polyline(g, pts, true);
  g.fill();
}

function strokePts(
  g: Ctx,
  pts: readonly Pt[] | null | undefined,
  w: number,
  col: string,
  closed = false,
) {
  if (!pts || pts.length < 2) return;
  g.strokeStyle = col;
  g.lineWidth = w;
  polyline(g, pts, closed);
  g.stroke();
}

function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
}

/** A pen line whose width swells and thins along its length, so even a bold outline looks hand-drawn. */
function penLine(
  g: Ctx,
  pts: readonly Pt[],
  w: number,
  col: string,
  E: Engine,
  key: number,
  closed = false,
) {
  if (pts.length < 2) return;
  const line = closed ? [...pts, pts[0]!, pts[1]!] : pts;
  const widths = line.map((_, i) => w * (0.72 + 0.56 * E.noise(key * 7.3 + i * 0.09)));
  g.fillStyle = col;
  polyline(g, ribbon(line, widths), true);
  g.fill();
}

// ================= the parts, drawn simply =================

type Eye = {
  x: number;
  y: number;
  r: number;
  dx: number;
  dy: number;
  open: number;
  kind: Face['eyes'][number]['kind'];
};

/** Eyes enlarged by `k`, but never so far that neighbours touch. */
function bigEyes(face: Face, k: number): Eye[] {
  const es = face.eyes;
  return es.map((e) => {
    const gap = Math.min(
      Infinity,
      ...es.filter((o) => o !== e).map((o) => Math.hypot(o.x - e.x, o.y - e.y)),
    );
    const r = Math.min(e.r * k, gap * 0.46);
    const st = eyeState(e, face.gaze, 1);
    // the gaze shifts pupils by a share of the eye, so a bigger eye looks just as far
    return {
      x: e.x,
      y: e.y,
      r,
      dx: (st.dx / e.r) * r,
      dy: (st.dy / e.r) * r,
      open: e.restOpen,
      kind: e.kind,
    };
  });
}

type EyeLook = {
  white: string;
  pupil: string;
  outline?: { w: number; col: string };
  shine?: string;
  pupilK?: number;
};

function drawEyes(g: Ctx, eyes: Eye[], o: EyeLook) {
  for (const e of eyes) {
    const ry = e.kind === 'almond' || e.kind === 'sleepy' ? e.r * 0.78 : e.r;
    if (e.kind === 'button') {
      fillCircle(g, e.x + e.dx * 0.3, e.y + e.dy * 0.3, e.r * 0.8, o.pupil);
      if (o.shine) fillCircle(g, e.x - e.r * 0.25, e.y - e.r * 0.28, e.r * 0.2, o.shine);
      continue;
    }
    g.save();
    ellipse(g, e.x, e.y, e.r, ry);
    g.fillStyle = o.white;
    g.fill();
    g.clip();
    const pr = e.r * (o.pupilK ?? 0.5);
    if (e.kind === 'spiral') {
      g.strokeStyle = o.pupil;
      g.lineWidth = e.r * 0.16;
      g.beginPath();
      for (let t = 0; t <= 1; t += 0.02) {
        const a = t * 2.4 * TAU,
          rr = e.r * 0.8 * t;
        g.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
      }
      g.stroke();
    } else {
      fillCircle(g, e.x + e.dx, e.y + e.dy, pr, o.pupil);
      if (o.shine) fillCircle(g, e.x + e.dx - pr * 0.35, e.y + e.dy - pr * 0.4, pr * 0.32, o.shine);
    }
    // a sleepy eye keeps its heavy lid
    if (e.open < 0.9) {
      g.fillStyle = o.outline?.col ?? o.pupil;
      g.fillRect(e.x - e.r * 1.2, e.y - ry * 1.2, e.r * 2.4, ry * 2.2 * (1 - e.open));
    }
    g.restore();
    if (o.outline) {
      g.strokeStyle = o.outline.col;
      g.lineWidth = o.outline.w;
      ellipse(g, e.x, e.y, e.r, ry);
      g.stroke();
    }
  }
}

function fillCircle(g: Ctx, x: number, y: number, r: number, col: string) {
  g.fillStyle = col;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

function drawMouth(g: Ctx, k: Sketch, w: number, ink: string, inside = MOUTH_DARK) {
  const m = k.mouth;
  if (m.shape) {
    fillPts(g, m.shape, m.kind === 'grin' ? '#ffffff' : inside);
    strokePts(g, m.shape, w * 0.7, ink, true);
  } else strokePts(g, m.line, w, ink);
}

type Role = 'back' | 'ear' | 'head' | 'hair' | 'pompom' | 'part';

/** Back to front: parts behind, long hair, ears, head, parts in front, hair or hat on top, then the pompom. */
function drawBody(g: Ctx, face: Face, paint: (pts: Pt[], role: Role, col?: string) => void) {
  const k = face.sketch;
  for (const q of k.parts) if (!q.front) paint(q.pts, 'part', q.col);
  if (k.hair.back) paint(k.hair.back, 'back');
  for (const e of k.ears) paint(earPts(e), 'ear');
  paint(k.head, 'head');
  for (const q of k.parts) if (q.front) paint(q.pts, 'part', q.col);
  if (k.hair.cover) paint(k.hair.cover, 'hair');
  if (k.hat) paint(k.hat.pompom, 'pompom');
}

function earPts(e: Sketch['ears'][number]): Pt[] {
  return Array.from({ length: 20 }, (_, i) => ({
    x: e.x + Math.cos((i / 20) * TAU) * e.rx,
    y: e.y + Math.sin((i / 20) * TAU) * e.ry,
  }));
}

/** The colour each part is filled with. */
function roleCol(face: Face, role: Role, col?: string) {
  const p = face.pal,
    hair = face.sketch.hair.col;
  if (col) return col;
  return role === 'back'
    ? p.hair2
    : role === 'ear' || role === 'head'
      ? p.skin
      : role === 'hair'
        ? hair
        : p.blush;
}

/** Brows lifted clear of their enlarged eyes, so a bigger eye doesn't swallow its brow. */
function liftedBrows(face: Face, eyes: Eye[]): Pt[][] {
  return face.sketch.brows.map((b) => {
    const mid = b[Math.floor(b.length / 2)]!;
    let near = 0;
    eyes.forEach((e, i) => {
      if (
        Math.hypot(e.x - mid.x, e.y - mid.y) <
        Math.hypot(eyes[near]!.x - mid.x, eyes[near]!.y - mid.y)
      )
        near = i;
    });
    const grow = eyes.length ? eyes[near]!.r - face.eyes[near]!.r : 0;
    return b.map((q) => ({ x: q.x, y: q.y - grow * 1.1 }));
  });
}

function features(
  g: Ctx,
  face: Face,
  f: Frame,
  o: {
    ink: string;
    eyeK: number;
    brows?: number;
    nose?: number;
    mouth: number;
    blush?: number;
    eyes: EyeLook;
  },
) {
  const k = face.sketch;
  if (o.blush) for (const b of k.blush) fillPts(g, b, rgba(face.pal.blush, o.blush));
  const eyes = bigEyes(face, o.eyeK);
  drawEyes(g, eyes, o.eyes);
  if (o.brows) for (const b of liftedBrows(face, eyes)) strokePts(g, b, o.brows * f.u, o.ink);
  if (o.nose) strokePts(g, k.nose, o.nose * f.u, o.ink);
  drawMouth(g, k, o.mouth * f.u, o.ink);
}

// ================= styles =================

function blob(face: Face, E: Engine, px: number, bare: boolean) {
  const [c, g, f] = sheet(face, px);
  backdrop(g, face.pal.bg);
  if (bare) return c;
  drawBody(g, face, (pts, role, col) => fillPts(g, pts, roleCol(face, role, col)));
  features(g, face, f, {
    ink: face.pal.ink,
    eyeK: 1.55,
    brows: 2.4,
    mouth: 2.8,
    blush: 0.55,
    eyes: { white: '#ffffff', pupil: face.pal.ink },
  });
  return c;
}

function ink(face: Face, E: Engine, px: number, bare: boolean) {
  const [c, g, f] = sheet(face, px);
  const p = face.pal;
  backdrop(g, p.paper);
  E.noiseSeed(face.seed);
  const k = face.sketch;
  fillCircle(g, k.centre.x + 6, k.centre.y - 4, k.rx * 1.45, rgba(p.bg, 0.85));
  if (bare) return c;
  let n = 0;
  drawBody(g, face, (pts, role, col) => {
    fillPts(g, pts, roleCol(face, role, col));
    penLine(g, pts, 2.6 * f.u, p.ink, E, n++, true);
  });
  for (const b of k.blush) fillPts(g, b, rgba(p.blush, 0.6));
  const eyes = bigEyes(face, 1.4);
  drawEyes(g, eyes, { white: '#ffffff', pupil: p.ink, outline: { w: 1.8 * f.u, col: p.ink } });
  for (const b of liftedBrows(face, eyes)) penLine(g, b, 2.6 * f.u, p.ink, E, n++);
  penLine(g, k.nose, 1.8 * f.u, p.ink, E, n++);
  if (k.mouth.shape) {
    fillPts(g, k.mouth.shape, k.mouth.kind === 'grin' ? '#ffffff' : MOUTH_DARK);
    penLine(g, k.mouth.shape, 2.2 * f.u, p.ink, E, n++, true);
  } else penLine(g, k.mouth.line, 3 * f.u, p.ink, E, n++);
  return c;
}

function sticker(face: Face, E: Engine, px: number, bare: boolean) {
  const [c, g, f] = sheet(face, px, 0.74);
  const p = face.pal;
  backdrop(g, mix(p.bg2, '#ffffff', 0.25));
  if (bare) return c;
  // the die-cut border is every part's outline, stroked wide in white with one shadow under the lot
  g.save();
  g.shadowColor = 'rgba(40,30,20,0.28)';
  g.shadowBlur = 3 * f.u * f.s;
  g.shadowOffsetY = 1.6 * f.u * f.s;
  drawBody(g, face, (pts) => {
    strokePts(g, pts, 9 * f.u, '#ffffff', true);
    fillPts(g, pts, '#ffffff');
  });
  g.restore();
  drawBody(g, face, (pts, role, col) => fillPts(g, pts, roleCol(face, role, col)));
  features(g, face, f, {
    ink: p.ink,
    eyeK: 1.5,
    brows: 2.4,
    mouth: 2.8,
    blush: 0.55,
    eyes: { white: '#ffffff', pupil: p.ink, shine: '#ffffff' },
  });
  return c;
}

function cutpaper(face: Face, E: Engine, px: number, bare: boolean) {
  const [c, g, f] = sheet(face, px);
  const p = face.pal,
    k = face.sketch;
  backdrop(g, p.bg);
  const card = (fn: () => void) => {
    g.save();
    g.shadowColor = 'rgba(30,20,10,0.32)';
    g.shadowBlur = 1.8 * f.u * f.s;
    g.shadowOffsetX = 0.6 * f.u * f.s;
    g.shadowOffsetY = 1.2 * f.u * f.s;
    fn();
    g.restore();
  };
  card(() => fillCircle(g, k.centre.x - 10, k.centre.y + 12, k.rx * 1.5, p.bg2));
  if (bare) return c;
  drawBody(g, face, (pts, role, col) => card(() => fillPts(g, pts, roleCol(face, role, col))));
  card(() => {
    for (const b of k.blush) fillPts(g, b, p.blush);
  });
  const eyes = bigEyes(face, 1.45);
  card(() => drawEyes(g, eyes, { white: p.paper, pupil: p.ink }));
  card(() => {
    for (const b of liftedBrows(face, eyes)) strokePts(g, b, 3 * f.u, p.hair2);
  });
  card(() => drawMouth(g, k, 3 * f.u, p.ink));
  return c;
}

const PIXELS = 20;

function pixel(face: Face, E: Engine, px: number, bare: boolean) {
  const n = PIXELS,
    p = face.pal;
  if (bare) {
    const [c, g] = canvas(px);
    g.fillStyle = p.bg;
    g.fillRect(0, 0, px, px);
    return c;
  }
  // fills only, at one sample per cell, with eyes and mouth stamped in afterwards as whole cells
  const [, fg, f] = sheet(face, n);
  fg.imageSmoothingEnabled = false;
  backdrop(fg, p.bg);
  drawBody(fg, face, (pts, role, col) => fillPts(fg, pts, roleCol(face, role, col)));
  const [, lg] = sheet(face, n);
  drawMouth(lg, face.sketch, (100 / n) * f.u * 1.2, '#000000', '#000000');
  for (const b of liftedBrows(face, bigEyes(face, 1.5)))
    strokePts(lg, b, (100 / n) * f.u * 0.8, '#000000');
  const fd = fg.getImageData(0, 0, n, n).data,
    ld = lg.getImageData(0, 0, n, n).data;
  const palette = [p.bg, p.skin, p.hair2, face.sketch.hair.col, p.blush].map(hexRGB);
  const cells: string[] = [];
  const isBg: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    const j = i * 4;
    const best = nearestOf(palette, fd[j]!, fd[j + 1]!, fd[j + 2]!);
    isBg.push(best === 0);
    cells.push(
      ld[j + 3]! > 70 ? p.ink : [p.bg, p.skin, p.hair2, face.sketch.hair.col, p.blush][best]!,
    );
  }
  // a dark outline wherever the figure meets the background, as pixel art does
  const out = cells.slice();
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (!isBg[i]) continue;
      const touches = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const X = x + dx!,
          Y = y + dy!;
        return X >= 0 && Y >= 0 && X < n && Y < n && !isBg[Y * n + X];
      });
      if (touches) out[i] = mix(p.bg, p.ink, 0.55);
    }
  const cell = (x: number, y: number, col: string) => {
    if (x >= 0 && y >= 0 && x < n && y < n) out[y * n + x] = col;
  };
  // eyes as discs of whole cells, never smaller than one white cell around one pupil cell
  for (const e of bigEyes(face, 1.6)) {
    const ex = e.x * f.s + f.ox,
      ey = e.y * f.s + f.oy,
      re = Math.max(1, e.r * f.s);
    const px0 = ex + e.dx * f.s,
      py0 = ey + e.dy * f.s,
      pr = e.kind === 'button' ? re : Math.max(0.6, re * 0.5);
    for (let y = Math.floor(ey - re - 1); y <= ey + re + 1; y++)
      for (let x = Math.floor(ex - re - 1); x <= ex + re + 1; x++) {
        if (Math.hypot(x + 0.5 - ex, y + 0.5 - ey) < re + 0.2) cell(x, y, '#ffffff');
      }
    for (let y = Math.floor(py0 - pr - 1); y <= py0 + pr + 1; y++)
      for (let x = Math.floor(px0 - pr - 1); x <= px0 + pr + 1; x++) {
        if (Math.hypot(x + 0.5 - px0, y + 0.5 - py0) < pr) cell(x, y, p.ink);
      }
    cell(Math.floor(px0), Math.floor(py0), p.ink);
  }
  const [c, g] = canvas(px);
  const q = px / n;
  out.forEach((col, i) => {
    g.fillStyle = col;
    // overlap by a hair so no seams show between cells at fractional sizes
    g.fillRect(
      Math.floor((i % n) * q),
      Math.floor(Math.floor(i / n) * q),
      Math.ceil(q) + 1,
      Math.ceil(q) + 1,
    );
  });
  return c;
}

function hexRGB(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
}

function nearestOf(pal: [number, number, number][], r: number, g: number, b: number) {
  let best = 0,
    bd = Infinity;
  pal.forEach((c, i) => {
    const d = 2 * (r - c[0]) ** 2 + 4 * (g - c[1]) ** 2 + 3 * (b - c[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function line(face: Face, E: Engine, px: number, bare: boolean) {
  const [c, g, f] = sheet(face, px);
  const p = face.pal;
  backdrop(g, p.paper);
  const w = 3 * f.u;
  if (bare) return c;
  // paper fills hide whatever each part overlaps, so the lines read like a single drawing
  drawBody(g, face, (pts) => {
    fillPts(g, pts, p.paper);
    strokePts(g, pts, w, p.ink, true);
  });
  features(g, face, f, {
    ink: p.ink,
    eyeK: 1.4,
    brows: 3,
    nose: 2.4,
    mouth: 3,
    eyes: { white: p.paper, pupil: p.ink, outline: { w: w * 0.8, col: p.ink } },
  });
  return c;
}

function neon(face: Face, E: Engine, px: number, bare: boolean) {
  const [c, g, f] = sheet(face, px);
  const p = face.pal;
  backdrop(g, '#0c0a14');
  if (bare) return c;
  const tube = (pts: Pt[] | null | undefined, col: string, w: number, closed = false) => {
    if (!pts || pts.length < 2) return;
    g.save();
    g.shadowColor = col;
    g.shadowBlur = 4 * f.u * f.s;
    strokePts(g, pts, w, col, closed);
    g.shadowBlur = 0;
    strokePts(g, pts, w * 0.4, mix(col, '#ffffff', 0.75), closed);
    g.restore();
  };
  const k = face.sketch;
  const glow = mix(p.accent2, '#ffffff', 0.15),
    hair = mix(p.accent, '#ffffff', 0.1);
  for (const q of k.parts) if (!q.loose) tube(q.pts, mix(q.col, '#ffffff', 0.1), 2 * f.u, true);
  tube(k.head, glow, 2.6 * f.u, true);
  tube(k.hair.cover, hair, 2.6 * f.u, true);
  for (const e of bigEyes(face, 1.35)) {
    g.save();
    g.shadowColor = '#ffffff';
    g.shadowBlur = 3 * f.u * f.s;
    g.strokeStyle = '#f4f0ff';
    g.lineWidth = 2 * f.u;
    ellipse(g, e.x, e.y, e.r, e.r * (e.open < 0.9 ? 0.6 : 1));
    g.stroke();
    fillCircle(g, e.x + e.dx, e.y + e.dy, e.r * 0.42, '#f4f0ff');
    g.restore();
  }
  tube(k.mouth.shape ?? k.mouth.line, mix(p.blush, '#ffffff', 0.1), 2.6 * f.u, !!k.mouth.shape);
  return c;
}

function wash(face: Face, E: Engine, px: number, bare: boolean) {
  const f = frameOf(face.sketch, px);
  // paint the whole sheet large enough that the framed region lands at px
  const full = Math.min(2048, Math.round(f.s * 480));
  const src = renderStill(bare ? bareFace(face) : face, E, full);
  const [c, g] = canvas(px);
  const k = full / 480;
  g.drawImage(
    src,
    (-f.ox / f.s) * k,
    (-f.oy / f.s) * k,
    (px / f.s) * k,
    (px / f.s) * k,
    0,
    0,
    px,
    px,
  );
  return c;
}

const RENDER: Record<
  SmallId,
  (face: Face, E: Engine, px: number, bare: boolean) => HTMLCanvasElement
> = {
  blob,
  ink,
  sticker,
  cutpaper,
  'pixel-icon': pixel,
  'line-icon': line,
  glow: neon,
  wash,
};

/**
 * One face as a small avatar, square and full-bleed; the caller crops it to a
 * circle or any other shape. `bare` paints only what lies behind the face, so
 * the animator can keep the background still while the face moves.
 */
export function renderSmall(
  id: SmallId,
  face: Face,
  E: Engine,
  px: number,
  bare = false,
): HTMLCanvasElement {
  E.noiseSeed(face.seed);
  return RENDER[id](face, E, px, bare);
}
