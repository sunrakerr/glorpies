import type { Engine } from './engine';
import { addPath, bbox, resample, TAU, type Pt } from './geometry';
import { rgba } from './palettes';
import { eyeState, type EyeState } from './face/eyes';
import { applyClip, renderStill, resolveColor } from './face/render';
import { inkRibbons } from './face/strokes';
import type { EyeSpec, Face, InkOp } from './face/types';
import { W } from './face/types';
import { drawFlat, drawFlatEyes, nearest, opsOf, paletteOf, pixelGrid } from './styles';
import { voxelArt } from './pixels';
import {
  at, blur, canvas, clamp01, css, faceSpace, figureInks, figureMask, flat, flowField, fract, fromHsl, grain, hash01, hex, imageFrom, imgOf, inkMask, lum, lumField, mixRGB, pillow, polyline, pupils, rng, toHsl,
  type Ctx, type Img, type RGB,
} from './raster';


/**
 * More media for the same wobbly faces. Every style reads the face's display
 * list or a flat/watercolour rendering of it, then rebuilds the picture from
 * its own primitive: brush strokes, chalk, dots, carved lines, glass, tiles,
 * yarn, bricks, voxels, triangles, contour lines, foil or blueprint ink.
 */

type Render = (face: Face, E: Engine, px: number) => HTMLCanvasElement;

// ================= traditional paint =================

const gouache: Render = (face, E, px) => {
  const [c, g] = faceSpace(px);
  const r = rng(face.seed + 3);
  g.fillStyle = '#efe7d6';
  g.fillRect(0, 0, W, W);
  const matte = (col: string) => css(mixRGB(hex(col), [244, 236, 220], 0.1));
  for (const op of opsOf(face)) {
    if (op.k !== 'wash' && op.k !== 'solid') continue;
    const col = resolveColor(op.col, face.pal, 'back');
    g.save();
    applyClip(g, op.clip, op.k === 'wash' ? op.exclude : undefined);
    g.beginPath();
    addPath(g, op.pts);
    g.fillStyle = op.k === 'solid' ? rgba(col, op.alpha) : matte(col);
    g.fill();
    if (op.k === 'wash') {
      // dry-brush streaks: broken strokes of a lighter and a darker mix of the same paint
      g.clip();
      const b = bbox(op.pts), ang = r() * Math.PI;
      for (let k = 0; k < 18; k++) {
        const t = r(), cx = b.x0 + (b.x1 - b.x0) * r(), cy = b.y0 + (b.y1 - b.y0) * r(), len = 20 + r() * 60;
        g.strokeStyle = css(mixRGB(hex(col), t < 0.5 ? [255, 250, 240] : [40, 30, 30], 0.14), 0.45);
        g.lineWidth = 3 + r() * 6;
        g.setLineDash([4 + r() * 10, 2 + r() * 4]);
        g.beginPath();
        g.moveTo(cx - Math.cos(ang) * len, cy - Math.sin(ang) * len);
        g.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        g.stroke();
      }
      g.setLineDash([]);
    }
    g.restore();
  }
  for (const op of figureInks(face)) {
    g.save();
    applyClip(g, op.clip);
    g.strokeStyle = rgba(face.pal.ink, 0.9);
    g.lineWidth = Math.max(1.6, op.w * 0.55);
    g.lineCap = g.lineJoin = 'round';
    polyline(g, op.pts, op.closed);
    g.stroke();
    g.restore();
  }
  drawFlatEyes(g, face, 2.2);
  g.setTransform(1, 0, 0, 1, 0, 0);
  grain(g, px, face.seed, 0.05, 'rgba(255,255,255,0.18)');
  grain(g, px, face.seed + 1, 0.04, 'rgba(60,40,20,0.06)');
  return c;
};

const oil: Render = (face, E, px) => {
  const src = imgOf(renderStill(face, E, px));
  const L = lumField(src);
  const angle = flowField(blur(L, px, px / 70), px);
  const detail = blur(L, px, 2);
  const [c, g] = canvas(px);
  // underpainting: the picture, softened
  g.filter = `blur(${px / 60}px)`;
  g.drawImage(renderStill(face, E, px), 0, 0);
  g.filter = 'none';
  const r = rng(face.seed + 9);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [layer, R] of [px / 26, px / 48, px / 96].entries()) {
    const step = R * 1.1;
    const strokes: { pts: Pt[]; col: RGB; order: number; jit: number }[] = [];
    let cell = 0;
    for (let y = 0; y < px; y += step) for (let x = 0; x < px; x += step) {
      // every brush cell draws from its own stream, so posing the eyes can't reshuffle the rest of the painting
      const r = rng(Math.floor(hash01(face.seed + 9 + layer, cell++) * 4294967296));
      const sx = x + (r() - 0.5) * step, sy = y + (r() - 0.5) * step;
      const i = Math.min(px * px - 1, Math.max(0, Math.round(sy) * px + Math.round(sx)));
      // fine brushes only where there's detail to resolve
      if (R < px / 60 && Math.abs(detail[i]! - L[i]!) < 0.02 && r() < 0.8) continue;
      const col = at(src, sx, sy);
      const pts: Pt[] = [{ x: sx, y: sy }];
      let px0 = sx, py0 = sy, dir = r() < 0.5 ? 1 : -1;
      for (let s = 0; s < 6; s++) {
        const j = Math.min(px * px - 1, Math.max(0, Math.round(py0) * px + Math.round(px0)));
        const a = angle[j]! * 1;
        px0 += Math.cos(a) * R * 0.9 * dir;
        py0 += Math.sin(a) * R * 0.9 * dir;
        const here = at(src, px0, py0);
        if (Math.abs(lum(here) - lum(col)) > 0.12) break;
        pts.push({ x: px0, y: py0 });
      }
      strokes.push({ pts, col, order: r(), jit: 1 + (r() - 0.5) * 0.08 });
    }
    // a random painting order that doesn't depend on how many strokes there are
    strokes.sort((a, b) => a.order - b.order);
    for (const s of strokes) {
      const { jit } = s;
      polyline(g, s.pts.length > 1 ? s.pts : [s.pts[0]!, { x: s.pts[0]!.x + 0.5, y: s.pts[0]!.y + 0.5 }]);
      g.lineWidth = R * 1.7;
      g.strokeStyle = css([s.col[0] * jit, s.col[1] * jit, s.col[2] * jit]);
      g.stroke();
      // impasto relief: a lit ridge on one side of the stroke, a shadow on the other
      g.save();
      g.translate(-R * 0.22, -R * 0.22);
      g.lineWidth = R * 0.35;
      g.strokeStyle = 'rgba(255,250,235,0.22)';
      g.stroke();
      g.translate(R * 0.5, R * 0.5);
      g.strokeStyle = 'rgba(30,20,10,0.16)';
      g.stroke();
      g.restore();
    }
  }
  // the drawing, restated with a fine rigger brush on top
  g.save();
  g.scale(px / W, px / W);
  for (const op of figureInks(face)) {
    g.save();
    applyClip(g, op.clip);
    g.translate((r() - 0.5) * 0.8, (r() - 0.5) * 0.8);
    g.strokeStyle = rgba(face.pal.ink, 0.72);
    g.lineWidth = Math.max(1.3, op.w * 0.42);
    g.lineCap = g.lineJoin = 'round';
    polyline(g, op.pts, op.closed);
    g.stroke();
    g.restore();
  }
  pupils(g, face, face.pal.ink);
  g.restore();
  // canvas weave
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgba(120,100,80,0.05)';
  for (let y = 0; y < px; y += 3) g.fillRect(0, y, px, 1);
  for (let x = 0; x < px; x += 3) g.fillRect(x, 0, 1, px);
  g.globalCompositeOperation = 'source-over';
  return c;
};

const sumi: Render = (face, E, px) => {
  const [c, g] = faceSpace(px);
  const k = px / W;
  g.fillStyle = '#f4efe4';
  g.fillRect(0, 0, W, W);
  const r = rng(face.seed + 5);
  g.strokeStyle = 'rgba(150,130,100,0.12)';
  g.lineWidth = 0.4;
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = r() * W;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + r() * 20 - 10, y + r() * 20 - 10, x + r() * 40 - 20, y + r() * 40 - 20); g.stroke();
  }
  // grey ink washes bleeding into damp paper
  g.filter = `blur(${2.5 * k}px)`;
  for (const op of opsOf(face)) {
    if (op.k !== 'wash') continue;
    const col = hex(resolveColor(op.col, face.pal, 'back'));
    const a = 0.05 + (1 - lum(col)) * 0.32;
    g.save();
    applyClip(g, op.clip, op.exclude);
    g.fillStyle = `rgba(28,26,24,${a})`;
    g.beginPath();
    addPath(g, op.pts);
    g.fill();
    g.restore();
  }
  g.filter = 'none';
  for (const op of face.figure) {
    if (op.k !== 'ink' || op.col === 'paper') continue;
    g.save();
    applyClip(g, op.clip);
    for (const rb of inkRibbons({ ...op, w: op.w * 1.25, passes: 1 }, E, 0)) {
      g.fillStyle = `rgba(16,15,14,${Math.min(1, rb.alpha * 1.05)})`;
      g.beginPath();
      addPath(g, rb.pts);
      g.fill();
    }
    g.restore();
  }
  pupils(g, face, '#100f0e');
  // the artist's seal
  g.save();
  g.translate(W * 0.86, W * 0.86);
  g.rotate(-0.04);
  g.fillStyle = '#c0362c';
  g.fillRect(-20, -20, 40, 40);
  g.fillStyle = '#f4efe4';
  g.font = '700 28px "Hiragino Mincho ProN", "Songti SC", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('顔', 0, 1);
  g.restore();
  return c;
};

const pastel: Render = (face, E, px) => {
  const src = imgOf(flat(face, E, px));
  const paperRGB = hex(face.pal.paper);
  const [layer, lg] = canvas(px);
  const r = rng(face.seed + 11);
  const k = px / 480;
  lg.lineCap = 'round';
  for (let n = 0; n < (px * px) / 9; n++) {
    const x = r() * px, y = r() * px;
    const col = at(src, x, y);
    if (Math.abs(col[0] - paperRGB[0]) + Math.abs(col[1] - paperRGB[1]) + Math.abs(col[2] - paperRGB[2]) < 18) continue;
    const a = 1.0 + (r() - 0.5) * 0.4, len = (5 + r() * 8) * k;
    const j = 1 + (r() - 0.5) * 0.16;
    lg.strokeStyle = css([col[0] * j, col[1] * j, col[2] * j], 0.55 + r() * 0.35);
    lg.lineWidth = (1.8 + r() * 1.4) * k;
    lg.beginPath();
    lg.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
    lg.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    lg.stroke();
  }
  lg.save();
  lg.scale(px / W, px / W);
  for (const op of figureInks(face)) {
    for (let p = 0; p < 2; p++) {
      lg.save();
      applyClip(lg, op.clip);
      lg.translate((r() - 0.5) * 1.4, (r() - 0.5) * 1.4);
      lg.strokeStyle = rgba(face.pal.ink, 0.55);
      lg.lineWidth = Math.max(1.4, op.w * 0.45);
      lg.lineCap = lg.lineJoin = 'round';
      polyline(lg, op.pts, op.closed);
      lg.stroke();
      lg.restore();
    }
  }
  pupils(lg, face, face.pal.ink);
  lg.restore();
  // paper tooth: the chalk skips the pits of the paper
  lg.globalCompositeOperation = 'destination-out';
  grain(lg, px, face.seed + 2, 0.09, 'rgba(0,0,0,0.55)', 1.4 * k);
  const [c, g] = canvas(px);
  g.fillStyle = '#2f3b4a';
  g.fillRect(0, 0, px, px);
  grain(g, px, face.seed + 4, 0.03, 'rgba(255,255,255,0.05)');
  g.drawImage(layer, 0, 0);
  return c;
};

const charcoal: Render = (face, E, px) => {
  const still = imgOf(renderStill(face, E, px));
  const L = lumField(still);
  const fig = figureMask(face, E, px);
  const r = rng(face.seed + 13);
  const tone = imageFrom(px, (i) => {
    const d = clamp01((0.86 - L[i]!) / 0.7) ** 0.9 * (0.35 + 0.65 * fig[i]!);
    const v = 245 - d * 225;
    return [v, v * 0.985, v * 0.97];
  });
  const [c, g] = canvas(px);
  g.fillStyle = '#efebe2';
  g.fillRect(0, 0, px, px);
  g.globalCompositeOperation = 'multiply';
  g.filter = `blur(${px / 160}px)`;
  g.drawImage(tone, 0, 0);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  // the paper's tooth catches less charcoal
  grain(g, px, face.seed + 6, 0.12, 'rgba(250,248,242,0.42)', 1.2);
  g.save();
  g.scale(px / W, px / W);
  for (const op of figureInks(face)) {
    for (let p = 0; p < 3; p++) {
      g.save();
      applyClip(g, op.clip);
      g.translate((r() - 0.5) * 2, (r() - 0.5) * 2);
      g.strokeStyle = 'rgba(18,17,16,0.42)';
      g.lineWidth = Math.max(1.6, op.w * (0.4 + r() * 0.35));
      g.lineCap = g.lineJoin = 'round';
      polyline(g, op.pts, op.closed);
      g.stroke();
      g.restore();
    }
  }
  pupils(g, face, '#121110');
  g.restore();
  // a few eraser strokes lifting highlights
  g.strokeStyle = 'rgba(248,246,240,0.7)';
  g.lineCap = 'round';
  for (let n = 0, tries = 0; n < 22 && tries < 4000; tries++) {
    const x = r() * px, y = r() * px, i = Math.round(y) * px + Math.round(x);
    if (!fig[i] || L[i]! < 0.78) continue;
    g.lineWidth = px / 120;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + px / 40, y - px / 60);
    g.stroke();
    n++;
  }
  return c;
};

const pointillism: Render = (face, E, px) => {
  const src = imgOf(flat(face, E, px));
  const [c, g] = canvas(px);
  g.fillStyle = '#f4efe3';
  g.fillRect(0, 0, px, px);
  const r = rng(face.seed + 17);
  const k = px / 480;
  for (let n = 0; n < (px * px) / 13; n++) {
    const x = r() * px, y = r() * px;
    const [h, s, l] = toHsl(at(src, x, y));
    const roll = r();
    // pure dots side by side, mixed by the eye: mostly the colour, some lighter, a few complements
    const col = roll < 0.1 ? fromHsl([h + 180, s * 0.6, Math.min(0.85, l + 0.1)]) : roll < 0.35 ? fromHsl([h + 15, Math.min(1, s * 1.15), Math.min(0.92, l + 0.12)]) : fromHsl([h + (r() - 0.5) * 16, Math.min(1, s * 1.2), l]);
    g.fillStyle = css(col);
    g.beginPath();
    g.arc(x, y, (1.6 + r() * 1.1) * k, 0, TAU);
    g.fill();
  }
  g.save();
  g.scale(px / W, px / W);
  for (const op of figureInks(face)) {
    g.save();
    applyClip(g, op.clip);
    for (const q of resample(op.pts, 2.4)) {
      g.fillStyle = r() < 0.75 ? '#2a2350' : '#5b2a3a';
      g.beginPath();
      g.arc(q.x + (r() - 0.5) * 1.2, q.y + (r() - 0.5) * 1.2, 1.25 + r() * 0.5, 0, TAU);
      g.fill();
    }
    g.restore();
  }
  pupils(g, face, '#1d1838');
  g.restore();
  return c;
};

const fresco: Render = (face, E, px) => {
  const plaster: RGB = [222, 205, 172];
  const base = imgOf(flat(face, E, px, (col) => {
    const [h, s, l] = toHsl(hex(col));
    return css(mixRGB(fromHsl([h, s * 0.55, l]), plaster, 0.28));
  }));
  const [c, g] = canvas(px);
  const img = imageFrom(px, (i) => [base.d[i * 4]!, base.d[i * 4 + 1]!, base.d[i * 4 + 2]!]);
  g.filter = `blur(${px / 400}px)`;
  g.drawImage(img, 0, 0);
  g.filter = 'none';
  const r = rng(face.seed + 19);
  // mottled lime plaster
  for (let n = 0; n < 60; n++) {
    const x = r() * px, y = r() * px, rad = px * (0.03 + r() * 0.1);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, r() < 0.5 ? 'rgba(255,248,230,0.12)' : 'rgba(120,90,60,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  grain(g, px, face.seed + 3, 0.05, 'rgba(90,70,50,0.08)');
  g.save();
  g.scale(px / W, px / W);
  for (const op of figureInks(face)) {
    g.save();
    applyClip(g, op.clip);
    g.strokeStyle = 'rgba(122,48,32,0.78)';
    g.lineWidth = Math.max(1.2, op.w * 0.4);
    g.lineCap = g.lineJoin = 'round';
    polyline(g, op.pts, op.closed);
    g.stroke();
    g.restore();
  }
  pupils(g, face, '#4a2418');
  g.restore();
  // flaked plaster and hairline cracks
  for (let n = 0; n < 5; n++) {
    const x = r() * px, y = r() < 0.5 ? r() * px * 0.2 : px - r() * px * 0.2, rad = px * (0.02 + r() * 0.05);
    g.fillStyle = 'rgba(236,226,206,0.85)';
    g.beginPath();
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * TAU, rr = rad * (0.6 + r() * 0.6);
      if (a) g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); else g.moveTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
    }
    g.fill();
  }
  g.strokeStyle = 'rgba(70,50,35,0.4)';
  g.lineWidth = 0.8;
  for (let n = 0; n < 6; n++) {
    let x = r() * px, y = r() * px, a = r() * TAU;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 30; s++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * px * 0.012;
      y += Math.sin(a) * px * 0.012;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
};

// ================= prints and graphic =================

const UKIYO = ['#1f3a5f', '#2f5d8a', '#d24b2a', '#d9a441', '#7aa58c', '#d97a7f', '#e9c9a3', '#3a2a22', '#8a9a6a'].map(hex);

const ukiyoe: Render = (face, E, px) => {
  const pale = mixRGB(hex(face.pal.skin), [246, 232, 210], 0.6);
  const [c, g] = faceSpace(px);
  g.fillStyle = '#f1e5cc';
  g.fillRect(0, 0, W, W);
  drawFlat(g, face, E, {
    ink: null,
    map: (col) => {
      const rgb = hex(col);
      if (col === face.pal.paper) return '#f1e5cc';
      // faces are pale in woodblock prints; everything else moves onto the printer's few blocks
      if (col === face.pal.skin) return css(pale);
      if (col === face.pal.shade) return css(mixRGB(pale, [150, 110, 90], 0.22));
      return css(mixRGB(nearest(UKIYO, ...rgb), rgb, 0.25));
    },
  });
  for (const op of figureInks(face)) {
    g.save();
    applyClip(g, op.clip);
    g.strokeStyle = '#1b1a19';
    g.lineWidth = Math.max(1.1, op.w * 0.32);
    g.lineCap = g.lineJoin = 'round';
    polyline(g, op.pts, op.closed);
    g.stroke();
    g.restore();
  }
  drawFlatEyes(g, face, 1.3, '#1b1a19');
  g.setTransform(1, 0, 0, 1, 0, 0);
  // bokashi: indigo wiped onto the block so it fades down the sky
  const sky = g.createLinearGradient(0, 0, 0, px * 0.42);
  sky.addColorStop(0, 'rgba(31,58,95,0.85)');
  sky.addColorStop(1, 'rgba(31,58,95,0)');
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = sky;
  g.fillRect(0, 0, px, px * 0.42);
  // wood grain pressed into the flat colour
  const r = rng(face.seed + 23);
  g.strokeStyle = 'rgba(90,70,50,0.07)';
  g.lineWidth = 1;
  for (let y = 0; y < px; y += 3 + r() * 4) {
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= px; x += px / 16) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 1.5);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  grain(g, px, face.seed, 0.03, 'rgba(255,250,235,0.25)');
  // title cartouche and seal
  const u = px / 480;
  g.fillStyle = '#efe2c4';
  g.strokeStyle = '#1b1a19';
  g.lineWidth = 1.5 * u;
  g.fillRect(px - 52 * u, 16 * u, 30 * u, 110 * u);
  g.strokeRect(px - 52 * u, 16 * u, 30 * u, 110 * u);
  g.fillStyle = '#1b1a19';
  for (let k = 0; k < 5; k++) g.fillRect(px - 42 * u, (28 + k * 19) * u, 10 * u, 9 * u);
  g.fillStyle = '#c0362c';
  g.fillRect(px - 48 * u, 132 * u, 22 * u, 22 * u);
  return c;
};

/** Carving and engraving: lines that bow over the dome of the head, thick where it's dark. */
function cutLines(face: Face, E: Engine, px: number, period: number) {
  const src = imgOf(flat(face, E, px));
  const still = imgOf(renderStill(face, E, px));
  const L = lumField(still);
  const F = lumField(src);
  const { mask, h } = pillow(face, E, px);
  const phase = new Float32Array(px * px);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const i = y * px + x;
    phase[i] = y / period - h[i]! * 3.2 + Math.sin(x / (px * 0.12)) * 0.15;
  }
  return { L, F, mask, h, phase };
}

const linocut: Render = (face, E, px) => {
  const { L, mask, phase } = cutLines(face, E, px, px / 70);
  const ink = inkMask(face, E, px, 3);
  const flatImg = imgOf(flat(face, E, px));
  const paperRGB = hex(face.pal.paper);
  const chip = (i: number) => hash01(face.seed + 29, i);
  const inkCol: RGB = [26, 23, 22];
  const block = mixRGB(hex(face.pal.accent), [40, 20, 20], 0.15);
  const paper: RGB = [239, 230, 212];
  return imageFrom(px, (i, x, y) => {
    const fig = mask[i]! > 0;
    const dark = 1 - L[i]!;
    if (ink[i]) return chip(i) < 0.05 ? paper : inkCol;
    if (fig) {
      const on = dark > 0.72 || fract(phase[i]!) < dark * 0.95;
      return on && chip(i) > 0.035 ? inkCol : paper;
    }
    const c = [flatImg.d[i * 4]!, flatImg.d[i * 4 + 1]!, flatImg.d[i * 4 + 2]!];
    const bg = Math.abs(c[0]! - paperRGB[0]) + Math.abs(c[1]! - paperRGB[1]) + Math.abs(c[2]! - paperRGB[2]) > 24;
    // the background block, gouged with long horizontal strokes
    if (bg && fract((y + 4 * Math.sin(x * 0.05)) / (px / 60)) > 0.28 && chip(i) > 0.03) return block;
    return paper;
  });
};

const engraving: Render = (face, E, px) => {
  const { L, mask, phase } = cutLines(face, E, px, px / 110);
  const ink = inkMask(face, E, px, 1.4);
  const inkCol: RGB = [31, 51, 38], paper: RGB = [239, 233, 216];
  const cx = px / 2, cy = px * 0.52, rx = px * 0.4, ry = px * 0.45;
  const c = imageFrom(px, (i, x, y) => {
    const inside = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
    if (!inside) return paper;
    if (ink[i]) return inkCol;
    const dark = mask[i] ? clamp01((0.92 - L[i]!) / 0.8) : 0.18 + 0.1 * (y / px);
    const f = Math.abs(fract(mask[i] ? phase[i]! : y / (px / 110)) - 0.5) * 2;
    let on = f < dark ** 0.85;
    // cross-hatching for the deepest shadows
    if (!on && dark > 0.55) on = Math.abs(fract((x - y) / (px / 120)) - 0.5) * 2 < (dark - 0.55) * 1.7;
    return on ? inkCol : paper;
  });
  // a guilloché border around the oval, like a banknote portrait
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(31,51,38,0.75)';
  g.lineWidth = 0.7;
  for (let k = 0; k < 18; k++) {
    g.beginPath();
    for (let s = 0; s <= 720; s++) {
      const t = (s / 720) * TAU;
      const wob = 1 + 0.035 * Math.sin(t * 36 + (k * TAU) / 18);
      const x = cx + Math.cos(t) * (rx + px * 0.02) * wob, y = cy + Math.sin(t) * (ry + px * 0.02) * wob;
      if (s) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  g.lineWidth = 1.6;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  g.stroke();
  return c;
};

const WARHOL: [string, string, string, string][] = [
  ['#ff5bb0', '#ffe14d', '#1e90ff', '#ff6a00'],
  ['#36d6c3', '#ff7a59', '#7b2ff7', '#ffe14d'],
  ['#ffe14d', '#ff4f8b', '#16a34a', '#2563eb'],
  ['#ff6a00', '#9be15d', '#ff2e63', '#00b3ff'],
];

const warhol: Render = (face, E, px) => {
  const q = Math.round(px / 2);
  const src = imgOf(flat(face, E, q));
  const L = lumField(imgOf(renderStill(face, E, q)));
  const ink = inkMask(face, E, q, 2.6);
  const pal = face.pal;
  const keys: [string, number][] = [[pal.paper, 0], [pal.bg, 0], [pal.bg2, 0], [pal.skin, 1], [pal.shade, 1], [pal.blush, 1], [pal.hair, 2], [pal.hair2, 2], [pal.accent, 3], [pal.accent2, 3], [pal.ink, 4]];
  const ref = keys.map(([c]) => hex(c));
  const cls = new Uint8Array(q * q);
  for (let i = 0; i < q * q; i++) {
    const p: RGB = [src.d[i * 4]!, src.d[i * 4 + 1]!, src.d[i * 4 + 2]!];
    const n = nearest(ref, ...p);
    cls[i] = keys[ref.indexOf(n)]![1];
  }
  const [c, g] = canvas(px);
  WARHOL.forEach((set, k) => {
    const ox = (k % 2) * q, oy = Math.floor(k / 2) * q;
    const [bg, skin, hair, acc] = set.map(hex) as [RGB, RGB, RGB, RGB];
    const tile = imageFrom(q, (i) => {
      const k2 = cls[i]!;
      return k2 === 0 ? bg : k2 === 1 ? (L[i]! < 0.5 ? mixRGB(skin, [0, 0, 0], 0.18) : skin) : k2 === 2 ? hair : k2 === 3 ? acc : [20, 18, 22];
    });
    g.drawImage(tile, ox, oy);
    // the black screen, printed slightly off-register
    const keyLayer = imageFrom(q, (i) => (ink[i] || L[i]! < 0.22 ? [18, 16, 20] : [255, 255, 255]));
    g.save();
    g.beginPath();
    g.rect(ox, oy, q, q);
    g.clip();
    g.globalCompositeOperation = 'multiply';
    g.drawImage(keyLayer, ox + q * 0.012, oy + q * 0.008);
    g.restore();
  });
  return c;
};

const POP = { red: hex('#e2231a'), yellow: hex('#ffd400'), blue: hex('#1f5fbf'), black: hex('#121212'), white: hex('#ffffff') };

const popart: Render = (face, E, px) => {
  const src = imgOf(flat(face, E, px));
  const L = lumField(imgOf(renderStill(face, E, px)));
  const ink = inkMask(face, E, px, 3.6);
  const pal = face.pal;
  const roles: [string, string][] = [[pal.paper, 'bg'], [pal.bg, 'bg'], [pal.bg2, 'bg'], [pal.skin, 'skin'], [pal.shade, 'shade'], [pal.blush, 'red'], [pal.hair, 'hair'], [pal.hair2, 'hair'], [pal.accent, 'acc'], [pal.accent2, 'acc'], [pal.ink, 'black'], ['#5b1a26', 'red']];
  const ref = roles.map(([c]) => hex(c));
  const primary = (c: RGB): RGB => {
    const [h, s, l] = toHsl(c);
    if (l < 0.28) return POP.black;
    if (s < 0.18) return l > 0.7 ? POP.white : POP.black;
    return h < 25 || h > 320 ? POP.red : h < 75 ? POP.yellow : POP.blue;
  };
  const cell = px / 80;
  const dot = (x: number, y: number, rad: number) => {
    const u = x / cell, v = (y + ((Math.floor(u) % 2) * cell) / 2) / cell;
    return Math.hypot(fract(u) - 0.5, fract(v) - 0.5) < rad;
  };
  const hairCol = primary(hex(pal.hair));
  const c = imageFrom(px, (i, x, y) => {
    if (ink[i]) return POP.black;
    const p: RGB = [src.d[i * 4]!, src.d[i * 4 + 1]!, src.d[i * 4 + 2]!];
    const role = roles[ref.indexOf(nearest(ref, ...p))]![1];
    if (role === 'bg') return dot(x, y, 0.36) ? POP.blue : [104, 170, 240];
    if (role === 'skin' || role === 'shade') {
      // Ben-Day dots: red on white reads as pink, bigger dots in shadow
      const rad = role === 'shade' || L[i]! < 0.55 ? 0.42 : 0.28;
      return dot(x, y, rad) ? POP.red : POP.white;
    }
    if (role === 'hair') return hairCol;
    if (role === 'red') return POP.red;
    if (role === 'black') return POP.black;
    if (lum(p) > 0.85) return POP.white;
    return primary(p);
  });
  const g = c.getContext('2d')!;
  // a speech balloon
  const u = px / 480;
  g.fillStyle = '#fff';
  g.strokeStyle = '#111';
  g.lineWidth = 4 * u;
  g.beginPath();
  g.ellipse(px * 0.79, px * 0.13, 70 * u, 40 * u, -0.08, 0, TAU);
  g.moveTo(px * 0.72, px * 0.19);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(px * 0.71, px * 0.18);
  g.lineTo(px * 0.66, px * 0.3);
  g.lineTo(px * 0.77, px * 0.2);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.fillRect(px * 0.705, px * 0.165, 50 * u, 12 * u);
  g.fillStyle = '#111';
  g.font = `italic 900 ${34 * u}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('HI!', px * 0.79, px * 0.135);
  return c;
};

const stencil: Render = (face, E, px) => {
  const still = imgOf(renderStill(face, E, px));
  const L = blur(lumField(still), px, 1, 1);
  const fig = figureMask(face, E, px);
  const ink = inkMask(face, E, px, 3.2);
  const r = rng(face.seed + 31);
  const [c, g] = canvas(px);
  // concrete
  g.fillStyle = '#8f8b84';
  g.fillRect(0, 0, px, px);
  grain(g, px, face.seed + 1, 0.25, 'rgba(60,58,54,0.18)', 1.6);
  grain(g, px, face.seed + 2, 0.15, 'rgba(200,196,188,0.15)', 1.6);
  for (let n = 0; n < 8; n++) {
    const x = r() * px, y = r() * px, rad = px * (0.05 + r() * 0.12);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(60,55,45,0.14)');
    grd.addColorStop(1, 'rgba(60,55,45,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const layers: { test: (i: number) => boolean; col: RGB }[] = [
    { test: (i) => fig[i]! > 0, col: [240, 236, 228] },
    { test: (i) => fig[i]! > 0 && L[i]! < 0.66, col: hex('#ff2e88') },
    { test: (i) => ink[i] === 1 || (fig[i]! > 0 && L[i]! < 0.4), col: [16, 16, 18] },
  ];
  for (const [li, layer] of layers.entries()) {
    const m = new Float32Array(px * px);
    for (let i = 0; i < px * px; i++) m[i] = layer.test(i) ? 1 : 0;
    const mist = blur(m, px, px / 120, 2);
    const img = imageFrom(px, () => layer.col);
    const id = img.getContext('2d')!.getImageData(0, 0, px, px);
    for (let i = 0; i < px * px; i++) {
      // solid inside the stencil, a speckled overspray halo outside it
      const a = m[i] ? 1 : mist[i]! > 0.02 && hash01(face.seed + 31 + li, i) < mist[i]! * 1.6 ? 0.8 : 0;
      id.data[i * 4 + 3] = a * 255;
    }
    img.getContext('2d')!.putImageData(id, 0, 0);
    g.drawImage(img, 0, 0);
    // drips running off the bottom edges of the dark layer
    if (layer.col[0] < 30) {
      g.strokeStyle = css(layer.col, 0.85);
      g.lineCap = 'round';
      for (let n = 0, tries = 0; n < 9 && tries < 20000; tries++) {
        const x = Math.floor(r() * px), y = Math.floor(r() * (px - 2));
        const len = px * (0.03 + r() * 0.1), width = px / 240 + r() * 1.5;
        const i = y * px + x;
        if (!m[i] || m[i + px]) continue;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + len);
        g.stroke();
        g.beginPath();
        g.arc(x, y + len, g.lineWidth * 0.9, 0, TAU);
        g.fillStyle = css(layer.col, 0.85);
        g.fill();
        n++;
      }
    }
  }
  return c;
};

// ================= craft =================

const stainedGlass: Render = (face, E, px) => {
  const src = imgOf(flat(face, E, px));
  const pal = paletteOf(face);
  const ink = inkMask(face, E, px, 3);
  const s = px / 20;
  const r = rng(face.seed + 37);
  const n = Math.ceil(px / s) + 1;
  const seeds: Pt[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) seeds.push({ x: (i + 0.15 + r() * 0.7) * s, y: (j + 0.15 + r() * 0.7) * s });
  // each pane is one Voronoi cell clipped to one colour region
  const label = new Int32Array(px * px);
  const regionOf = (i: number) => pal.indexOf(nearest(pal, src.d[i * 4]!, src.d[i * 4 + 1]!, src.d[i * 4 + 2]!));
  const cellD = new Float32Array(px * px);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const gi = Math.floor(x / s), gj = Math.floor(y / s);
    let best = 0, bd = Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = gi + di, jj = gj + dj;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const p = seeds[jj * n + ii]!, d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = jj * n + ii; }
    }
    const i = y * px + x;
    label[i] = best * 64 + regionOf(i);
    cellD[i] = Math.sqrt(bd) / s;
  }
  const sums = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < px * px; i++) {
    const e = sums.get(label[i]!) ?? [0, 0, 0, 0];
    e[0] += src.d[i * 4]!; e[1] += src.d[i * 4 + 1]!; e[2] += src.d[i * 4 + 2]!; e[3]++;
    sums.set(label[i]!, e);
  }
  const glass = new Map<number, RGB>();
  for (const [k, [a, b, c, cnt]] of sums) {
    const [h, sat, l] = toHsl([a / cnt, b / cnt, c / cnt]);
    glass.set(k, fromHsl([h, Math.min(1, sat * 1.35 + 0.1), 0.3 + l * 0.45]));
  }
  const lead: RGB = [38, 36, 40];
  return imageFrom(px, (i, x, y) => {
    const L0 = label[i]!;
    const edge = (x < px - 1 && label[i + 1] !== L0) || (y < px - 1 && label[i + px] !== L0) || (x > 0 && label[i - 1] !== L0) || (y > 0 && label[i - px] !== L0);
    if (edge || ink[i]) return lead;
    const c = glass.get(L0)!;
    const glow = 1.18 - cellD[i]! * 0.45 + (Math.sin(x * 0.7 + y * 0.3) * 0.5 + 0.5) * 0.04;
    return [c[0] * glow, c[1] * glow, c[2] * glow];
  });
};

const mosaic: Render = (face, E, px) => {
  const src = imgOf(flat(face, E, px));
  const L = lumField(src);
  const angle = flowField(blur(L, px, px / 50), px);
  const ink = inkMask(face, E, px, 3);
  const [c, g] = canvas(px);
  g.fillStyle = '#d8d1c3';
  g.fillRect(0, 0, px, px);
  const r = rng(face.seed + 41);
  const t = px / 46;
  for (let y = t / 2; y < px; y += t * 0.92) for (let x = t / 2; x < px; x += t * 0.92) {
    const sx = x + (r() - 0.5) * t * 0.3, sy = y + (r() - 0.5) * t * 0.3;
    const i = Math.min(px * px - 1, Math.round(sy) * px + Math.round(sx));
    if (ink[i]) continue;
    const col = at(src, sx, sy), j = 1 + (r() - 0.5) * 0.14;
    g.save();
    g.translate(sx, sy);
    g.rotate(angle[i]! + (r() - 0.5) * 0.15);
    const w = t * (0.72 + r() * 0.1), h = t * (0.72 + r() * 0.1);
    g.fillStyle = css([col[0] * j, col[1] * j, col[2] * j]);
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(-w / 2, -h / 2, w, h * 0.22);
    g.restore();
  }
  // the outlines laid as a row of small dark tesserae
  g.save();
  g.scale(px / W, px / W);
  const tw = (t * W) / px;
  for (const op of figureInks(face)) {
    g.save();
    applyClip(g, op.clip);
    const pts = resample(op.pts, tw * 0.62);
    pts.forEach((q, k) => {
      const nx = pts[Math.min(pts.length - 1, k + 1)]!, pv = pts[Math.max(0, k - 1)]!;
      g.save();
      g.translate(q.x, q.y);
      g.rotate(Math.atan2(nx.y - pv.y, nx.x - pv.x));
      g.fillStyle = r() < 0.8 ? '#1d1b22' : '#3a2f3a';
      g.fillRect(-tw * 0.28, -tw * 0.24, tw * 0.52, tw * 0.48);
      g.restore();
    });
    g.restore();
  }
  pupils(g, face, '#1d1b22');
  g.restore();
  return c;
};

const knit: Render = (face, E, px) => {
  const { n, cells } = pixelGrid(face, E, 40);
  const [c, g] = canvas(px);
  const s = px / n;
  g.fillStyle = '#2b2522';
  g.fillRect(0, 0, px, px);
  const r = rng(face.seed + 43);
  cells.forEach((p, i) => {
    const x = (i % n) * s, y = Math.floor(i / n) * s;
    // a knit stitch is a V: two plump loops leaning in
    for (const side of [-1, 1]) {
      g.save();
      g.translate(x + s / 2 + side * s * 0.2, y + s * 0.52);
      g.rotate(side * 0.55);
      const grd = g.createLinearGradient(0, -s * 0.5, 0, s * 0.5);
      const j = 1 + (r() - 0.5) * 0.08;
      grd.addColorStop(0, css([p[0] * 1.12 * j, p[1] * 1.12 * j, p[2] * 1.12 * j]));
      grd.addColorStop(1, css([p[0] * 0.7, p[1] * 0.7, p[2] * 0.7]));
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(0, 0, s * 0.26, s * 0.56, 0, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = s * 0.05;
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(k * s * 0.08, -s * 0.4);
        g.lineTo(k * s * 0.08 + s * 0.04, s * 0.4);
        g.stroke();
      }
      g.restore();
    }
  });
  return c;
};

const felt: Render = (face, E, px) => {
  const [c, g] = faceSpace(px);
  const r = rng(face.seed + 47);
  const fibres = (col: RGB, n: number, b = { x0: 0, y0: 0, x1: W, y1: W }) => {
    for (let k = 0; k < n; k++) {
      const x = b.x0 + r() * (b.x1 - b.x0), y = b.y0 + r() * (b.y1 - b.y0), a = r() * TAU, l = 1 + r() * 3;
      g.strokeStyle = css(mixRGB(col, r() < 0.5 ? [255, 255, 255] : [0, 0, 0], 0.12 + r() * 0.1), 0.35);
      g.lineWidth = 0.35;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  };
  const bg = hex(face.pal.bg);
  g.fillStyle = css(bg);
  g.fillRect(0, 0, W, W);
  fibres(bg, 6000);
  for (const op of face.figure) {
    if (op.k !== 'wash' && op.k !== 'solid') continue;
    const col = hex(resolveColor(op.col, face.pal, 'back'));
    if (op.k === 'solid' && op.alpha < 0.5) continue;
    g.save();
    applyClip(g, op.clip, op.k === 'wash' ? op.exclude : undefined);
    g.shadowColor = 'rgba(40,25,15,0.3)';
    g.shadowBlur = (4 * px) / W;
    g.shadowOffsetY = (2 * px) / W;
    g.fillStyle = css(col);
    g.beginPath();
    addPath(g, op.pts);
    g.fill();
    g.shadowColor = 'transparent';
    // fuzzy cut edge
    for (const q of resample([...op.pts, op.pts[0]!], 2)) {
      const a = r() * TAU, l = 0.8 + r() * 1.6;
      g.strokeStyle = css(col, 0.7);
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(q.x, q.y);
      g.lineTo(q.x + Math.cos(a) * l, q.y + Math.sin(a) * l);
      g.stroke();
    }
    g.save();
    g.beginPath();
    addPath(g, op.pts);
    g.clip();
    fibres(col, 500, bbox(op.pts));
    g.restore();
    // running stitch just inside the edge
    if (op.k === 'wash' && op.layers >= 20) {
      const b = bbox(op.pts), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      g.strokeStyle = css(mixRGB(col, [255, 255, 255], 0.55), 0.85);
      g.lineWidth = 0.9;
      g.setLineDash([3, 2.5]);
      polyline(g, op.pts.map((q) => ({ x: cx + (q.x - cx) * 0.93, y: cy + (q.y - cy) * 0.93 })), true);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }
  // embroidered lines
  for (const op of figureInks(face)) {
    g.save();
    applyClip(g, op.clip);
    g.strokeStyle = '#2a201c';
    g.lineWidth = Math.max(1.4, op.w * 0.5);
    g.lineCap = 'round';
    g.setLineDash([4, 1.6]);
    polyline(g, op.pts, op.closed);
    g.stroke();
    g.restore();
  }
  /** A scrap of the face's own felt, stitched over the eye as it closes. */
  const feltLid = (e: EyeSpec, st: EyeState) => {
    if (!st.lid || !st.line) return;
    const col = hex(e.lidCol);
    g.save();
    g.beginPath();
    addPath(g, e.clip);
    g.clip();
    g.fillStyle = css(col);
    g.beginPath();
    addPath(g, st.lid);
    g.fill();
    fibres(col, 40, bbox(st.lid));
    g.restore();
    g.strokeStyle = css(mixRGB(col, [0, 0, 0], 0.45));
    g.lineWidth = 0.9;
    g.setLineDash([2.4, 1.6]);
    polyline(g, st.line.pts, false);
    g.stroke();
    g.setLineDash([]);
  };
  // button eyes: they shift a little with the gaze, and a felt lid is sewn over them as they close
  for (const e of face.eyes) {
    const st = eyeState(e, face.gaze, 1);
    const rad = Math.max(5, e.r * 0.62);
    if (st.open < 0.3) {
      feltLid(e, st);
      continue;
    }
    g.save();
    g.translate(st.dx * 0.6, st.dy * 0.6);
    g.save();
    g.shadowColor = 'rgba(30,20,10,0.4)';
    g.shadowBlur = (3 * px) / W;
    g.shadowOffsetY = (1.5 * px) / W;
    g.fillStyle = '#1f1b24';
    g.beginPath();
    g.arc(e.x, e.y, rad, 0, TAU);
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(e.x, e.y, rad * 0.78, 0, TAU);
    g.stroke();
    g.fillStyle = css(bg);
    g.strokeStyle = '#efe6d4';
    g.lineWidth = 0.9;
    const hd = rad * 0.28;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      g.beginPath();
      g.arc(e.x + dx * hd, e.y + dy * hd, rad * 0.11, 0, TAU);
      g.fill();
    }
    g.beginPath();
    g.moveTo(e.x - hd, e.y - hd); g.lineTo(e.x + hd, e.y + hd);
    g.moveTo(e.x + hd, e.y - hd); g.lineTo(e.x - hd, e.y + hd);
    g.stroke();
    g.restore();
    if (st.lid) feltLid(e, st);
  }
  return c;
};

const LEGO = ['#f4f4f4', '#1b1b1b', '#c91a09', '#0055bf', '#f2cd37', '#237841', '#e4cd9e', '#958a73', '#582a12', '#6c6e68', '#a0a5a9', '#fe8a18', '#c870a0', '#36aebf', '#bbe90b', '#720e0f', '#0a3463', '#a0bcac', '#aa7d55', '#f6d7b3', '#d09168', '#352100', '#e1d5ed', '#ff698f', '#fc97ac', '#078bc9', '#9b9a5a'].map(hex);

const lego: Render = (face, E, px) => {
  const { n, cells } = pixelGrid(face, E, 36);
  const [c, g] = canvas(px);
  const s = px / n;
  cells.forEach((p, i) => {
    const col = nearest(LEGO, ...p);
    const x = (i % n) * s, y = Math.floor(i / n) * s;
    g.fillStyle = css(col);
    g.fillRect(x, y, s, s);
    g.strokeStyle = css(mixRGB(col, [0, 0, 0], 0.25));
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    // the stud: a shadowed cylinder with a lit rim
    g.fillStyle = css(mixRGB(col, [0, 0, 0], 0.3));
    g.beginPath();
    g.arc(x + s / 2 + s * 0.05, y + s / 2 + s * 0.07, s * 0.31, 0, TAU);
    g.fill();
    g.fillStyle = css(col);
    g.beginPath();
    g.arc(x + s / 2, y + s / 2, s * 0.3, 0, TAU);
    g.fill();
    g.strokeStyle = css(mixRGB(col, [255, 255, 255], 0.45), 0.8);
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.arc(x + s / 2, y + s / 2, s * 0.24, Math.PI * 0.95, Math.PI * 1.6);
    g.stroke();
  });
  return c;
};

// ================= digital =================

/** Bowyer–Watson Delaunay triangulation. */
function delaunay(pts: Pt[]): [number, number, number][] {
  const big = 1e5;
  const P = [...pts, { x: -big, y: -big }, { x: big * 2, y: -big }, { x: -big, y: big * 2 }];
  const n = pts.length;
  type Tri = { a: number; b: number; c: number; x: number; y: number; r2: number };
  const make = (a: number, b: number, c: number): Tri => {
    const A = P[a]!, B = P[b]!, C = P[c]!;
    const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
    const ux = ((A.x ** 2 + A.y ** 2) * (B.y - C.y) + (B.x ** 2 + B.y ** 2) * (C.y - A.y) + (C.x ** 2 + C.y ** 2) * (A.y - B.y)) / d;
    const uy = ((A.x ** 2 + A.y ** 2) * (C.x - B.x) + (B.x ** 2 + B.y ** 2) * (A.x - C.x) + (C.x ** 2 + C.y ** 2) * (B.x - A.x)) / d;
    return { a, b, c, x: ux, y: uy, r2: (A.x - ux) ** 2 + (A.y - uy) ** 2 };
  };
  let tris: Tri[] = [make(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const p = P[i]!;
    const bad: Tri[] = [], keep: Tri[] = [];
    for (const t of tris) ((p.x - t.x) ** 2 + (p.y - t.y) ** 2 < t.r2 ? bad : keep).push(t);
    const edges = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as const) {
      const key = u < v ? `${u},${v}` : `${v},${u}`;
      if (edges.has(key)) edges.delete(key); else edges.set(key, [u, v]);
    }
    tris = keep;
    for (const [u, v] of edges.values()) tris.push(make(u, v, i));
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

const lowpoly: Render = (face, E, px) => {
  const src = imgOf(renderStill(face, E, px));
  const r = rng(face.seed + 53);
  const s = px / 22;
  const pts: Pt[] = [];
  for (let y = 0; y <= px + 1; y += s) for (let x = 0; x <= px + 1; x += s) {
    const edge = x === 0 || y === 0 || x + s > px + 1 || y + s > px + 1;
    pts.push({ x: Math.min(px, x + (edge ? 0 : (r() - 0.5) * s * 0.8)), y: Math.min(px, y + (edge ? 0 : (r() - 0.5) * s * 0.8)) });
  }
  // extra vertices along the pen lines keep the features sharp
  for (const op of figureInks(face)) for (const q of resample(op.pts, 9)) pts.push({ x: (q.x / W) * px + (r() - 0.5), y: (q.y / W) * px + (r() - 0.5) });
  for (const e of face.eyes) for (let k = 0; k < 6; k++) pts.push({ x: ((e.x + Math.cos((k / 6) * TAU) * e.r * 0.6) / W) * px, y: ((e.y + Math.sin((k / 6) * TAU) * e.r * 0.6) / W) * px });
  const [c, g] = canvas(px);
  for (const [a, b, d] of delaunay(pts)) {
    const A = pts[a]!, B = pts[b]!, D = pts[d]!;
    const cx = (A.x + B.x + D.x) / 3, cy = (A.y + B.y + D.y) / 3;
    const samples = [at(src, cx, cy), at(src, (cx + A.x) / 2, (cy + A.y) / 2), at(src, (cx + B.x) / 2, (cy + B.y) / 2), at(src, (cx + D.x) / 2, (cy + D.y) / 2)];
    const col = samples.reduce<RGB>((m, p) => [m[0] + p[0] / 4, m[1] + p[1] / 4, m[2] + p[2] / 4], [0, 0, 0]);
    // facets catch the light differently depending on which way they lean
    const k = 0.94 + ((A.x - D.x) * (B.y - D.y) - (A.y - D.y) * (B.x - D.x) > 0 ? 0.04 : -0.02) + (r() - 0.5) * 0.06;
    g.fillStyle = css([col[0] * k, col[1] * k, col[2] * k]);
    g.strokeStyle = g.fillStyle;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.lineTo(D.x, D.y); g.closePath();
    g.fill();
    g.stroke();
  }
  return c;
};

const HYPSO = ['#cfe3c0', '#e2e6b4', '#ead39a', '#ddb27e', '#c58f68', '#a9765a', '#f1ece2'].map(hex);

const topo: Render = (face, E, px) => {
  const still = imgOf(renderStill(face, E, px));
  const L = blur(lumField(still), px, px / 140);
  const { h: dome } = pillow(face, E, px);
  const ink = inkMask(face, E, px, 1.4);
  const H = new Float32Array(px * px);
  for (let i = 0; i < H.length; i++) H[i] = dome[i]! * 0.75 + (1 - L[i]!) * 0.25;
  const K = 26;
  const tint = (v: number): RGB => {
    const t = clamp01(v) * (HYPSO.length - 1), k = Math.floor(t);
    return mixRGB(HYPSO[k]!, HYPSO[Math.min(HYPSO.length - 1, k + 1)]!, t - k);
  };
  const c = imageFrom(px, (i, x, y) => {
    if (ink[i]) return [47, 93, 138];
    const lv = Math.floor(H[i]! * K);
    const right = x < px - 1 ? Math.floor(H[i + 1]! * K) : lv, down = y < px - 1 ? Math.floor(H[i + px]! * K) : lv;
    if (lv !== right || lv !== down) return Math.max(lv, right, down) % 5 === 0 ? [110, 66, 36] : [168, 117, 79];
    return mixRGB(tint(H[i]! * 1.15), [244, 238, 226], 0.25);
  });
  const g = c.getContext('2d')!;
  const u = px / 480;
  // the summit, marked like a peak on a survey map
  let top = 0;
  for (let i = 0; i < H.length; i++) if (H[i]! > H[top]!) top = i;
  const tx = top % px, ty = Math.floor(top / px);
  g.fillStyle = '#6e4224';
  g.beginPath(); g.moveTo(tx, ty - 6 * u); g.lineTo(tx + 5 * u, ty + 3 * u); g.lineTo(tx - 5 * u, ty + 3 * u); g.fill();
  g.font = `600 ${11 * u}px ui-monospace, Menlo, monospace`;
  g.fillText(`${Math.round(1800 + H[top]! * 1400)}`, tx + 8 * u, ty + 3 * u);
  // compass
  g.strokeStyle = '#6e4224';
  g.lineWidth = 1.2 * u;
  const cx = px - 34 * u, cy = px - 40 * u;
  g.beginPath(); g.moveTo(cx, cy - 18 * u); g.lineTo(cx, cy + 14 * u); g.moveTo(cx - 10 * u, cy); g.lineTo(cx + 10 * u, cy); g.stroke();
  g.beginPath(); g.moveTo(cx, cy - 18 * u); g.lineTo(cx + 5 * u, cy - 6 * u); g.lineTo(cx - 5 * u, cy - 6 * u); g.fill();
  g.textAlign = 'center';
  g.fillText('N', cx, cy - 24 * u);
  return c;
};

const IRON = ['#000014', '#1d0b4f', '#5c128a', '#a3197f', '#e0364d', '#f9752a', '#fbbf2c', '#fff3b8'].map(hex);

const thermal: Render = (face, E, px) => {
  const still = imgOf(renderStill(face, E, px));
  const L = blur(lumField(still), px, px / 200);
  const { h: dome, mask } = pillow(face, E, px);
  const ink = inkMask(face, E, px, 2.4);
  const r = rng(face.seed + 59);
  const T = new Float32Array(px * px);
  // warm in the middle of the face, hotter in the creases (eyes, mouth), cold air around it
  for (let i = 0; i < T.length; i++) T[i] = mask[i] ? 0.35 + dome[i]! * 0.45 + (1 - L[i]!) * 0.2 + (ink[i] ? 0.08 : 0) : 0.08 + dome[i]! * 0.3;
  const Tb = blur(T, px, px / 160, 2);
  const c = imageFrom(px, (i) => {
    const v = clamp01(Tb[i]! + (r() - 0.5) * 0.02) * (IRON.length - 1);
    const k = Math.floor(v);
    return mixRGB(IRON[k]!, IRON[Math.min(IRON.length - 1, k + 1)]!, v - k);
  });
  const g = c.getContext('2d')!;
  const u = px / 480;
  g.fillStyle = '#fff';
  g.font = `600 ${15 * u}px ui-monospace, Menlo, monospace`;
  g.fillText('36.8°C', 14 * u, 26 * u);
  g.font = `500 ${10 * u}px ui-monospace, Menlo, monospace`;
  g.fillText('MAX 37.4  MIN 18.2', 14 * u, 42 * u);
  g.strokeStyle = '#fff';
  g.lineWidth = 1.4 * u;
  const cx = px / 2, cy = px * 0.5;
  g.beginPath();
  g.moveTo(cx - 14 * u, cy); g.lineTo(cx - 5 * u, cy); g.moveTo(cx + 5 * u, cy); g.lineTo(cx + 14 * u, cy);
  g.moveTo(cx, cy - 14 * u); g.lineTo(cx, cy - 5 * u); g.moveTo(cx, cy + 5 * u); g.lineTo(cx, cy + 14 * u);
  g.stroke();
  const bar = g.createLinearGradient(0, px * 0.8, 0, px * 0.2);
  IRON.forEach((col, k) => bar.addColorStop(k / (IRON.length - 1), css(col)));
  g.fillStyle = bar;
  g.fillRect(px - 22 * u, px * 0.2, 8 * u, px * 0.6);
  g.strokeRect(px - 22 * u, px * 0.2, 8 * u, px * 0.6);
  return c;
};

const holo: Render = (face, E, px) => {
  const still = imgOf(renderStill(face, E, px));
  const L = blur(lumField(still), px, 1, 1);
  const { h: dome, mask } = pillow(face, E, px);
  const ink = inkMask(face, E, px, 1.8);
  const c = imageFrom(px, (i, x, y) => {
    if (ink[i]) return [58, 52, 82];
    const nx = x > 0 && x < px - 1 ? (dome[i + 1]! - dome[i - 1]!) * 40 : 0;
    const ny = y > 0 && y < px - 1 ? (dome[i + px]! - dome[i - px]!) * 40 : 0;
    // foil shifts hue with brightness, tilt and position; a diagonal sheen sweeps across
    const hue = (L[i]! * 220 + nx * 90 + ny * 60 + ((x + y) / px) * 160) % 360;
    const sheen = Math.exp(-(((x - y) / px - 0.1) ** 2) * 18) * 0.25;
    const base = fromHsl([hue, mask[i] ? 0.62 : 0.35, mask[i] ? 0.66 + L[i]! * 0.12 : 0.42]);
    return mixRGB(base, [255, 255, 255], sheen);
  });
  const g = c.getContext('2d')!;
  const r = rng(face.seed + 61);
  for (let n = 0; n < 40; n++) {
    const x = r() * px, y = r() * px, s = (1 + r() * 3) * (px / 480);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.moveTo(x, y - s * 3); g.lineTo(x + s * 0.6, y - s * 0.6); g.lineTo(x + s * 3, y); g.lineTo(x + s * 0.6, y + s * 0.6);
    g.lineTo(x, y + s * 3); g.lineTo(x - s * 0.6, y + s * 0.6); g.lineTo(x - s * 3, y); g.lineTo(x - s * 0.6, y - s * 0.6);
    g.fill();
  }
  return c;
};

const vapor: Render = (face, E, px) => {
  const still = imgOf(renderStill(face, E, px));
  const L = lumField(still);
  const fig = figureMask(face, E, px);
  const ink = inkMask(face, E, px, 2.2);
  const [c, g] = canvas(px);
  const horizon = px * 0.68;
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#190a3a');
  sky.addColorStop(0.55, '#7a1f86');
  sky.addColorStop(1, '#ff7aa8');
  g.fillStyle = sky;
  g.fillRect(0, 0, px, horizon);
  // a striped sun
  const sun = g.createLinearGradient(0, px * 0.18, 0, horizon);
  sun.addColorStop(0, '#ffe46b');
  sun.addColorStop(1, '#ff4f9a');
  g.save();
  g.beginPath();
  g.arc(px / 2, horizon - px * 0.04, px * 0.36, Math.PI, 0);
  g.clip();
  g.fillStyle = sun;
  g.fillRect(0, 0, px, horizon);
  g.fillStyle = sky;
  for (let k = 0; k < 7; k++) g.fillRect(0, horizon - px * 0.05 - k * k * px * 0.006 - k * px * 0.012, px, px * 0.006 + k * px * 0.0015);
  g.restore();
  g.fillStyle = '#12062a';
  g.fillRect(0, horizon, px, px - horizon);
  g.strokeStyle = '#ff3fd2';
  g.lineWidth = 1.2;
  for (let k = -12; k <= 12; k++) { g.beginPath(); g.moveTo(px / 2 + k * px * 0.02, horizon); g.lineTo(px / 2 + k * px * 0.16, px); g.stroke(); }
  for (let k = 1; k < 9; k++) { const y = horizon + (px - horizon) * (k / 9) ** 1.8; g.beginPath(); g.moveTo(0, y); g.lineTo(px, y); g.stroke(); }
  // the face as a pink-to-cyan duotone, with its lines split into colour channels
  const duo = [hex('#2b0f5c'), hex('#01cdfe'), hex('#ff71ce'), hex('#fff1fb')];
  const face2 = imageFrom(px, (i) => {
    const v = clamp01((L[i]! - 0.15) / 0.75) * (duo.length - 1), k = Math.floor(v);
    return mixRGB(duo[k]!, duo[Math.min(duo.length - 1, k + 1)]!, v - k);
  });
  const fd = face2.getContext('2d')!.getImageData(0, 0, px, px);
  for (let i = 0; i < px * px; i++) fd.data[i * 4 + 3] = fig[i] ? 255 : 0;
  face2.getContext('2d')!.putImageData(fd, 0, 0);
  g.drawImage(face2, 0, 0);
  const lines = (col: RGB) => {
    const im = imageFrom(px, () => col);
    const d = im.getContext('2d')!.getImageData(0, 0, px, px);
    for (let i = 0; i < px * px; i++) d.data[i * 4 + 3] = ink[i] ? 255 : 0;
    im.getContext('2d')!.putImageData(d, 0, 0);
    return im;
  };
  g.globalCompositeOperation = 'screen';
  g.drawImage(lines([0, 230, 255]), px * 0.006, 0);
  g.drawImage(lines([255, 40, 160]), -px * 0.006, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 0.85;
  g.drawImage(lines([30, 10, 60]), 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < px; y += 3) g.fillRect(0, y, px, 1);
  return c;
};

const blueprint: Render = (face, E, px) => {
  const [c, g] = canvas(px);
  const bg = g.createRadialGradient(px / 2, px / 2, px * 0.1, px / 2, px / 2, px * 0.8);
  bg.addColorStop(0, '#2463a8');
  bg.addColorStop(1, '#173f73');
  g.fillStyle = bg;
  g.fillRect(0, 0, px, px);
  const gs = px / 40;
  for (let k = 0; k <= 40; k++) {
    g.strokeStyle = `rgba(255,255,255,${k % 5 === 0 ? 0.2 : 0.08})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(k * gs, 0); g.lineTo(k * gs, px); g.moveTo(0, k * gs); g.lineTo(px, k * gs); g.stroke();
  }
  g.save();
  g.scale(px / W, px / W);
  const white = 'rgba(240,248,255,0.95)';
  // glaze shapes as dashed construction lines
  for (const op of face.figure) {
    if (op.k !== 'wash' || op.layers < 14) continue;
    g.strokeStyle = 'rgba(240,248,255,0.4)';
    g.lineWidth = 0.6;
    g.setLineDash([4, 3]);
    polyline(g, op.pts, true);
    g.stroke();
  }
  g.setLineDash([]);
  for (const op of figureInks(face)) {
    g.save();
    applyClip(g, op.clip);
    g.strokeStyle = white;
    g.lineWidth = 1.1;
    g.lineJoin = g.lineCap = 'round';
    polyline(g, op.pts, op.closed);
    g.stroke();
    g.restore();
  }
  for (const e of face.eyes) {
    g.strokeStyle = white;
    g.lineWidth = 0.8;
    g.beginPath(); g.arc(e.x, e.y, e.r * 0.45, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(e.x - e.r * 0.7, e.y); g.lineTo(e.x + e.r * 0.7, e.y); g.moveTo(e.x, e.y - e.r * 0.7); g.lineTo(e.x, e.y + e.r * 0.7); g.stroke();
  }
  // centre lines and dimensions
  const fig = face.figure.filter((o) => o.k === 'wash').flatMap((o) => (o.k === 'wash' ? o.pts : []));
  const b = bbox(fig);
  const ex = face.eyes.length ? face.eyes.reduce((s, e) => s + e.y, 0) / face.eyes.length : W / 2;
  g.strokeStyle = 'rgba(240,248,255,0.55)';
  g.lineWidth = 0.6;
  g.setLineDash([10, 3, 2, 3]);
  g.beginPath(); g.moveTo((b.x0 + b.x1) / 2, b.y0 - 12); g.lineTo((b.x0 + b.x1) / 2, b.y1 + 12); g.moveTo(b.x0 - 12, ex); g.lineTo(b.x1 + 12, ex); g.stroke();
  g.setLineDash([]);
  const arrow = (x0: number, y0: number, x1: number, y1: number, label: string) => {
    g.strokeStyle = white;
    g.fillStyle = white;
    g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    for (const [x, y, d] of [[x0, y0, 1], [x1, y1, -1]] as const) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + d * 6 * Math.cos(a) - 2.5 * Math.sin(a), y + d * 6 * Math.sin(a) + 2.5 * Math.cos(a));
      g.lineTo(x + d * 6 * Math.cos(a) + 2.5 * Math.sin(a), y + d * 6 * Math.sin(a) - 2.5 * Math.cos(a));
      g.fill();
    }
    g.save();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2);
    g.rotate(Math.abs(a) > 1 ? -Math.PI / 2 : 0);
    g.font = '600 9px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.fillStyle = '#1d4f8c';
    g.fillRect(-18, -6, 36, 11);
    g.fillStyle = white;
    g.fillText(label, 0, 3);
    g.restore();
  };
  arrow(b.x0, Math.min(W - 24, b.y1 + 16), b.x1, Math.min(W - 24, b.y1 + 16), `${Math.round(b.x1 - b.x0)}`);
  arrow(Math.min(W - 16, b.x1 + 16), b.y0, Math.min(W - 16, b.x1 + 16), b.y1, `${Math.round(b.y1 - b.y0)}`);
  g.restore();
  // title block, top left where the dimensions don't reach
  const u = px / 480;
  g.strokeStyle = 'rgba(240,248,255,0.85)';
  g.lineWidth = 1.2 * u;
  g.strokeRect(12 * u, 12 * u, 138 * u, 40 * u);
  g.beginPath(); g.moveTo(12 * u, 32 * u); g.lineTo(150 * u, 32 * u); g.stroke();
  g.fillStyle = 'rgba(240,248,255,0.95)';
  g.font = `600 ${10 * u}px ui-monospace, Menlo, monospace`;
  g.fillText(`FACE No. ${face.seed.toString(36).toUpperCase()}`, 18 * u, 26 * u);
  g.font = `500 ${8.5 * u}px ui-monospace, Menlo, monospace`;
  g.fillText('SCALE 1:1   DRN GLORPIES', 18 * u, 45 * u);
  return c;
};

// ================= registry =================

export type PaintGroup = { group: string; items: { id: string; name: string; note: string; render: Render }[] };

export const PAINTS: PaintGroup[] = [
  {
    group: 'Traditional paint',
    items: [
      { id: 'gouache', name: 'Gouache', note: 'flat matte colour with dry-brush streaks', render: gouache },
      { id: 'oil', name: 'Oil impasto', note: 'strokes follow the form, with raised ridges', render: oil },
      { id: 'sumi', name: 'Sumi-e', note: 'ink brush lines, grey washes, red seal', render: sumi },
      { id: 'pastel', name: 'Pastel', note: 'chalk strokes on blue-grey paper', render: pastel },
      { id: 'charcoal', name: 'Charcoal', note: 'smudged tone, eraser highlights', render: charcoal },
      { id: 'pointillism', name: 'Pointillism', note: 'pure-colour dots mixed by the eye', render: pointillism },
      { id: 'fresco', name: 'Fresco', note: 'muted lime plaster, sinopia lines, cracks', render: fresco },
    ],
  },
  {
    group: 'Prints & graphic',
    items: [
      { id: 'ukiyoe', name: 'Ukiyo-e', note: 'woodblock colours, bokashi sky, cartouche', render: ukiyoe },
      { id: 'linocut', name: 'Linocut', note: 'carved lines over the form, two blocks', render: linocut },
      { id: 'engraving', name: 'Engraving', note: 'banknote line work and guilloché', render: engraving },
      { id: 'warhol', name: 'Warhol screen print', note: 'four colourways, off-register black', render: warhol },
      { id: 'popart', name: 'Pop art', note: 'Ben-Day dots, primaries, speech balloon', render: popart },
      { id: 'stencil', name: 'Stencil graffiti', note: 'three sprayed layers, overspray, drips', render: stencil },
    ],
  },
  {
    group: 'Craft',
    items: [
      { id: 'stained', name: 'Stained glass', note: 'panes cut along colour, leaded', render: stainedGlass },
      { id: 'mosaic', name: 'Mosaic', note: 'tesserae laid along the form', render: mosaic },
      { id: 'knit', name: 'Knitted', note: '40 × 40 stitches', render: knit },
      { id: 'felt', name: 'Felt', note: 'cut felt, running stitch, button eyes', render: felt },
      { id: 'lego', name: 'Brick mosaic', note: '36 × 36 studs, toy-brick palette', render: lego },
    ],
  },
  {
    group: 'Digital',
    items: [
      { id: 'voxel', name: 'Voxel', note: 'a lit relief of cubes, seen from above and to one side', render: voxelArt },
      { id: 'lowpoly', name: 'Low-poly', note: 'Delaunay facets, denser along the lines', render: lowpoly },
      { id: 'topo', name: 'Topographic', note: 'contours over the head, rivers for lines', render: topo },
      { id: 'thermal', name: 'Thermal camera', note: 'iron palette with a HUD', render: thermal },
      { id: 'holo', name: 'Holographic foil', note: 'hue shifts with tone and tilt', render: holo },
      { id: 'vapor', name: 'Vaporwave', note: 'striped sun, grid, split channels, scanlines', render: vapor },
      { id: 'blueprint', name: 'Blueprint', note: 'white line drawing with dimensions', render: blueprint },
    ],
  },
];

export function renderPaint(id: string, face: Face, E: Engine, px: number): HTMLCanvasElement | null {
  for (const g of PAINTS) for (const s of g.items) if (s.id === id) {
    E.noiseSeed(face.seed);
    return s.render(face, E, px);
  }
  return null;
}

