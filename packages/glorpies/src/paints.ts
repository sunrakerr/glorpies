import type { Engine } from './engine';
import { addPath, bbox, resample, TAU, type Pt } from './geometry';
import { rgba } from './palettes';
import { eyeState, type EyeState } from './face/eyes';
import { applyClip, renderStill, resolveColor } from './face/render';
import { inkRibbons } from './face/strokes';
import type { EyeSpec, Face } from './face/types';
import { W } from './face/types';
import { drawFlatEyes, nearest, opsOf, paletteOf } from './styles';
import {
  at, blur, canvas, clamp01, css, faceSpace, figureInks, figureMask, flat, flowField, fract, fromHsl, grain, hash01, hex, imageFrom, imgOf, inkMask, lum, lumField, mixRGB, pillow, polyline, pupils, rng, toHsl,
  type RGB,
} from './raster';


/** The paintings: each reads the face's display list, or a flat rendering of it, and rebuilds it in its own medium. */

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

// ================= prints and graphic =================

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

// ================= registry =================

export const PAINTS: { id: string; name: string; note: string; render: Render }[] = [
  { id: 'gouache', name: 'Gouache', note: 'flat matte colour with dry-brush streaks', render: gouache },
  { id: 'oil', name: 'Oil impasto', note: 'strokes follow the form, with raised ridges', render: oil },
  { id: 'sumi', name: 'Sumi-e', note: 'ink brush lines, grey washes, red seal', render: sumi },
  { id: 'charcoal', name: 'Charcoal', note: 'smudged tone, eraser highlights', render: charcoal },
  { id: 'pointillism', name: 'Pointillism', note: 'pure-colour dots mixed by the eye', render: pointillism },
  { id: 'linocut', name: 'Linocut', note: 'carved lines over the form, two blocks', render: linocut },
  { id: 'warhol', name: 'Warhol screen print', note: 'four colourways, off-register black', render: warhol },
  { id: 'stencil', name: 'Stencil graffiti', note: 'three sprayed layers, overspray, drips', render: stencil },
  { id: 'stained', name: 'Stained glass', note: 'panes cut along colour, leaded', render: stainedGlass },
  { id: 'mosaic', name: 'Mosaic', note: 'tesserae laid along the form', render: mosaic },
  { id: 'felt', name: 'Felt', note: 'cut felt, running stitch, button eyes', render: felt },
  { id: 'lowpoly', name: 'Low-poly', note: 'Delaunay facets, denser along the lines', render: lowpoly },
  { id: 'topo', name: 'Topographic', note: 'contours over the head, rivers for lines', render: topo },
  { id: 'thermal', name: 'Thermal camera', note: 'iron palette with a HUD', render: thermal },
  { id: 'holo', name: 'Holographic foil', note: 'hue shifts with tone and tilt', render: holo },
];

export function renderPaint(id: string, face: Face, E: Engine, px: number): HTMLCanvasElement | null {
  const paint = PAINTS.find((p) => p.id === id);
  if (!paint) return null;
  E.noiseSeed(face.seed);
  return paint.render(face, E, px);
}

