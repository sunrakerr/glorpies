import { renderGL } from './gl';
import { hexRGB, type Character, type V3 } from './spec';

/**
 * Avatar styles. The 3D ones share one raymarched character; the 2D ones
 * post-process its data pass (material, depth and light per pixel) with their
 * own primitives: dither dots, sprite pixels, glyphs, glowing tubes.
 */

export type AvatarStyle = 'clay' | 'comic' | 'onebit' | 'pixel' | 'ascii' | 'neon' | 'bauhaus';

export const AVATAR_STYLES: { id: AvatarStyle; name: string; note: string }[] = [
  { id: 'clay', name: '3D clay', note: 'raymarched, soft light and occlusion' },
  { id: 'comic', name: 'Comic', note: 'cel bands, halftone shadows, ink outlines' },
  { id: 'onebit', name: '1-bit', note: 'Atkinson dither with hard outlines' },
  { id: 'pixel', name: 'Pixel art', note: '64 × 64 sprite, 3-tone ramps, selective outline' },
  { id: 'ascii', name: 'ASCII', note: 'light as density, edges as line glyphs' },
  { id: 'neon', name: 'Neon', note: 'material edges as glowing tubes' },
  { id: 'bauhaus', name: 'Bauhaus', note: 'circles, half-discs and bars' },
];

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

function downscale(src: HTMLCanvasElement, px: number) {
  const [c, g] = canvas(px);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, px, px);
  return c;
}

function upscale(src: HTMLCanvasElement, px: number) {
  const [c, g] = canvas(px);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, px, px);
  return c;
}

const pixels = (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;

type Data = { w: number; id: Uint8Array; depth: Float32Array; light: Float32Array };

function dataPass(ch: Character, w: number): Data {
  const d = pixels(renderGL(ch, 'data', w));
  const id = new Uint8Array(w * w), depth = new Float32Array(w * w), light = new Float32Array(w * w);
  for (let i = 0; i < w * w; i++) {
    id[i] = Math.round((d[i * 4]! / 255) * 16);
    depth[i] = d[i * 4 + 1]! / 255;
    light[i] = d[i * 4 + 2]! / 255;
  }
  return { w, id, depth, light };
}

/** Pixels on the near side of a change in material, or of a jump in depth (an ear in front of a cheek). */
function edges(D: Data, depthJump = 0.03): Uint8Array {
  const { w, id, depth } = D;
  const e = new Uint8Array(w * w);
  for (let y = 1; y < w - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        const differs = id[j] !== id[i] || Math.abs(depth[j]! - depth[i]!) > depthJump;
        if (differs && (id[i] !== 0 && (id[j] === 0 || depth[i]! <= depth[j]!))) { e[i] = 1; break; }
      }
    }
  }
  return e;
}

function dilate(m: Uint8Array, w: number): Uint8Array {
  const o = new Uint8Array(m);
  for (let y = 1; y < w - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (m[i] || m[i - 1] || m[i + 1] || m[i - w] || m[i + w]) o[i] = 1;
  }
  return o;
}

// ================= styles =================

function clay(ch: Character, px: number) {
  return downscale(renderGL(ch, 'clay', Math.round(px * 1.5)), px);
}

function comic(ch: Character, px: number) {
  const n = Math.round(px * 1.5);
  const cel = renderGL(ch, 'cel', n);
  const D = dataPass(ch, n);
  const lines = dilate(edges(D), n);
  const g = cel.getContext('2d')!;
  const img = g.getImageData(0, 0, n, n);
  for (let i = 0; i < n * n; i++) if (lines[i]) img.data.set([24, 20, 28, 255], i * 4);
  g.putImageData(img, 0, 0);
  return downscale(cel, px);
}

function onebit(ch: Character, px: number) {
  const n = 208;
  const D = dataPass(ch, n);
  const line = edges(D, 0.02);
  // each material gets a printed tone of its own, so dark skin or black hair don't collapse into solid ink
  const tone = (id: number) => {
    const c = hexRGB(materialColour(ch, id));
    const l = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    if (id === 3 || id === 7) return 1;
    if (id === 5 || id === 11) return 0;
    if (id === 1) return 0.62 + l * 0.35;
    return 0.18 + l * 0.7;
  };
  const tones = new Map<number, number>();
  const L = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const id = D.id[i]!;
    if (!tones.has(id)) tones.set(id, tone(id));
    L[i] = id === 0 ? 1 : tones.get(id)! * (0.42 + 0.72 * D.light[i]!);
  }
  const on = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, old = L[i]!, v = old < 0.5 ? 0 : 1;
    on[i] = v ? 0 : 1;
    const err = (old - v) / 8;
    for (const [dx, dy] of [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]] as const) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < n && yy < n) L[yy * n + xx]! += err;
    }
  }
  const [c, g] = canvas(n);
  const img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const ink = on[i] || line[i];
    img.data.set(ink ? [17, 17, 20, 255] : [244, 241, 232, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  return upscale(c, px);
}

// ---- pixel art

/** Shadows cool toward violet and highlights warm toward cream, the way pixel artists build a ramp. */
function ramp(base: string): { dark: V3; shadow: V3; mid: V3; light: V3 } {
  const c = hexRGB(base);
  const tint = (k: V3): V3 => [c[0] * k[0], c[1] * k[1], c[2] * k[2]];
  const toward = (t: V3, a: number): V3 => [c[0] + (t[0] - c[0]) * a, c[1] + (t[1] - c[1]) * a, c[2] + (t[2] - c[2]) * a];
  return { dark: tint([0.42, 0.38, 0.52]), shadow: tint([0.8, 0.74, 0.86]), mid: c, light: toward([255, 246, 226], 0.32) };
}

function materialColour(ch: Character, id: number): string {
  return ['', ch.skin, ch.hairCol, '#ece8df', ch.iris, '#141218', ch.lip, '#f1ece0', ch.shirt, ch.hatCol, ch.frame, '#121318', '#e8b13c', '#d6545f'][id] ?? ch.skin;
}

function pixel(ch: Character, px: number) {
  const n = 64;
  const D = dataPass(ch, n);
  const [c, g] = canvas(n);
  const img = g.createImageData(n, n);
  const bg = hexRGB(ch.bg), bg2 = hexRGB(ch.bg2);
  const outline: V3 = [34, 26, 46];
  const ramps = new Map<number, ReturnType<typeof ramp>>();
  const rampFor = (id: number) => {
    if (!ramps.has(id)) ramps.set(id, ramp(materialColour(ch, id)));
    return ramps.get(id)!;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, id = D.id[i]!;
    let p: V3;
    if (id === 0) {
      // a dithered glow behind the head
      const r = Math.hypot(x - n / 2, y - n * 0.38) / (n * 0.5);
      p = r < 0.55 || (r < 0.7 && (x + y) % 2 === 0) ? bg2 : bg;
    } else {
      const R = rampFor(id);
      const l = D.light[i]!;
      p = l < 0.4 ? R.shadow : l > 0.84 ? R.light : R.mid;
      if (id === 5) p = R.mid;
      let edge = false, behind = false;
      for (const j of [i - 1, i + 1, i - n, i + n]) {
        if (j < 0 || j >= n * n) continue;
        if (D.id[j] === 0) edge = true;
        else if (D.depth[j]! < D.depth[i]! - 0.02) behind = true;
      }
      if (edge) p = outline;
      else if (behind) p = R.dark;
    }
    img.data.set([p[0], p[1], p[2], 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  return upscale(c, px);
}

// ---- ASCII

const GLYPHS = ` .,:;'"\`^-_=+*<>()[]{}/\\|!il1oc0O#@vVLJ`;

type Glyph = { ch: string; bits: Float32Array };

/** Each glyph rasterised into one character cell, for matching against the picture. */
function glyphAtlas(cw: number, chh: number, family: string): Glyph[] {
  const [, g] = canvas(cw, chh);
  return [...new Set(GLYPHS)].map((ch) => {
    g.clearRect(0, 0, cw, chh);
    g.fillStyle = '#000';
    g.fillRect(0, 0, cw, chh);
    g.fillStyle = '#fff';
    g.font = `600 ${chh * 0.92}px ${family}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, cw / 2, chh / 2 + 1);
    const d = g.getImageData(0, 0, cw, chh).data;
    const bits = new Float32Array(cw * chh);
    for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4]! / 255;
    return { ch, bits };
  });
}

function ascii(ch: Character, px: number) {
  const cols = 48, rows = 30;
  const cw = Math.floor(px / cols), chh = Math.floor(px / rows);
  const W = cw * cols, H = chh * rows;
  const family = 'ui-monospace, "SF Mono", Menlo, monospace';
  const atlas = glyphAtlas(cw, chh, family);
  const D = dataPass(ch, W);
  const shade = pixels(renderGL(ch, 'clay', W));
  // glyph strokes are ~2px, so the pen line is thickened to match before comparing
  const line = dilate(dilate(edges(D, 0.02), W), W);
  // what each pixel asks for: the pen line at full strength, a lighter texture where the figure is lit
  const want = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = Math.min(W - 1, Math.floor((y * W) / H)) * W + x;
    want[y * W + x] = line[i] ? 1 : D.id[i] ? 0.08 + 0.3 * D.light[i]! : 0;
  }
  const [c, g] = canvas(px);
  g.fillStyle = '#0d0c0f';
  g.fillRect(0, 0, px, px);
  g.font = `600 ${chh * 0.92}px ${family}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const ox = (px - W) / 2, oy = (px - H) / 2;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    let best = atlas[0]!, bestErr = Infinity;
    for (const gl of atlas) {
      let err = 0;
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
        const d = gl.bits[y * cw + x]! - want[(r * chh + y) * W + q * cw + x]!;
        err += d * d;
      }
      if (err < bestErr) { bestErr = err; best = gl; }
    }
    if (best.ch === ' ') continue;
    // colour from the middle of the cell, lifted so dark materials read on black
    const ci = Math.min(W - 1, Math.floor(((r + 0.5) * chh * W) / H)) * W + Math.floor((q + 0.5) * cw);
    let sr = shade[ci * 4]!, sg = shade[ci * 4 + 1]!, sb = shade[ci * 4 + 2]!;
    if (!D.id[ci]) { sr = 200; sg = 190; sb = 175; }
    const m = Math.max(sr, sg, sb, 1), lift = 235 / m;
    g.fillStyle = `rgb(${Math.min(255, sr * lift)},${Math.min(255, sg * lift)},${Math.min(255, sb * lift)})`;
    g.fillText(best.ch, ox + (q + 0.5) * cw, oy + (r + 0.5) * chh + 1);
  }
  return c;
}

// ---- neon

const NEON: Record<number, string> = {
  1: '#ff4fa3', 2: '#3de7ff', 3: '#f4fbff', 4: '#7dffb0', 5: '#f4fbff', 6: '#ff4560', 7: '#f4fbff',
  8: '#ffd23f', 9: '#ff8a3d', 10: '#b6ff3d', 11: '#b6ff3d', 12: '#ffd23f', 13: '#ff4560',
};

function neon(ch: Character, px: number) {
  const D = dataPass(ch, px);
  const line = edges(D, 0.025);
  const [tubes, tg] = canvas(px);
  const img = tg.createImageData(px, px);
  for (let i = 0; i < px * px; i++) {
    if (!line[i]) continue;
    const p = hexRGB(NEON[D.id[i]!] ?? '#ff4fa3');
    img.data.set([p[0], p[1], p[2], 255], i * 4);
  }
  tg.putImageData(img, 0, 0);
  const [c, g] = canvas(px);
  const wall = g.createRadialGradient(px / 2, px * 0.4, px * 0.05, px / 2, px / 2, px * 0.75);
  wall.addColorStop(0, '#271d33');
  wall.addColorStop(1, '#09070c');
  g.fillStyle = wall;
  g.fillRect(0, 0, px, px);
  g.globalCompositeOperation = 'lighter';
  for (const [blur, a] of [[px / 30, 0.9], [px / 90, 0.9], [0, 1]] as const) {
    g.filter = blur ? `blur(${blur}px)` : 'none';
    g.globalAlpha = a;
    g.drawImage(tubes, 0, 0);
  }
  // white-hot cores
  g.filter = 'none';
  g.globalAlpha = 0.55;
  g.globalCompositeOperation = 'lighter';
  g.drawImage(tubes, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return c;
}

// ---- Bauhaus: the same character, rebuilt from flat geometry

function bauhaus(ch: Character, px: number) {
  const [c, g] = canvas(px);
  const u = px / 8;
  const side = ch.yaw > 0 ? 1 : -1;
  g.fillStyle = ch.bg;
  g.fillRect(0, 0, px, px);
  // a quarter-disc in the corner, the poster's counterweight
  g.fillStyle = ch.accent;
  g.beginPath();
  g.moveTo(side > 0 ? 0 : px, px);
  g.arc(side > 0 ? 0 : px, px, u * 3.2, side > 0 ? -Math.PI / 2 : Math.PI, side > 0 ? 0 : -Math.PI / 2);
  g.fill();
  g.fillStyle = ch.bg2;
  g.beginPath();
  g.arc(px - (side > 0 ? u * 1.3 : px - u * 1.3), u * 1.3, u * 0.7, 0, Math.PI * 2);
  g.fill();

  const cx = px / 2, cy = u * 3.7, r = u * 1.9 * ch.headW;
  const disc = (x: number, y: number, rad: number, col: string, a0 = 0, a1 = Math.PI * 2) => {
    g.fillStyle = col;
    g.beginPath();
    if (a1 - a0 < Math.PI * 2) g.moveTo(x, y);
    g.arc(x, y, rad, a0, a1);
    g.fill();
  };
  const rect = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

  // behind the head
  if (ch.hair === 'afro') disc(cx, cy - u * 0.3, r * 1.45, ch.hairCol);
  if (ch.hair === 'long') { disc(cx, cy, r * 1.12, ch.hairCol, Math.PI, 0); rect(cx - r * 1.12, cy, r * 2.24, u * 2.6, ch.hairCol); }
  if (ch.hair === 'bob') { disc(cx, cy, r * 1.15, ch.hairCol, Math.PI, 0); rect(cx - r * 1.15, cy, r * 2.3, r * 0.75, ch.hairCol); }
  if (ch.hair === 'bun') disc(cx, cy - r * 1.15, r * 0.42, ch.hairCol);

  // shoulders and neck
  disc(cx, px + u * 0.2, u * 3.1, ch.shirt, Math.PI, 0);
  rect(cx - u * 0.5, cy + r * 0.6, u, u * 1.6, ch.skin);
  if (ch.top === 'turtleneck') rect(cx - u * 0.62, px - u * 3.1, u * 1.24, u * 0.9, ch.shirt);
  else disc(cx, px - u * 2.86, u * 0.62, ch.skin, 0, Math.PI);

  // ears and head
  disc(cx - r * 0.98, cy + u * 0.1, u * 0.34, ch.skin);
  disc(cx + r * 0.98, cy + u * 0.1, u * 0.34, ch.skin);
  if (ch.earring) disc(cx - r * 0.98, cy + u * 0.55, u * 0.1, '#e8b13c');
  g.fillStyle = ch.skin;
  g.beginPath();
  g.arc(cx, cy, r, Math.PI, 0);
  g.lineTo(cx + r, cy + r * 0.35);
  g.quadraticCurveTo(cx + r, cy + r * 1.25, cx, cy + r * 1.25);
  g.quadraticCurveTo(cx - r, cy + r * 1.25, cx - r, cy + r * 0.35);
  g.fill();

  // hair and hats on top
  const top = cy - r;
  if (ch.hair === 'short' || ch.hair === 'curly' || ch.hair === 'bob' || ch.hair === 'long') disc(cx, cy - r * 0.15, r * 1.03, ch.hairCol, Math.PI, 0);
  if (ch.hair === 'buzz') disc(cx, cy - r * 0.05, r * 1.0, ch.hairCol, Math.PI * 1.05, Math.PI * 1.95);
  if (ch.hair === 'curly') for (let k = 0; k < 7; k++) disc(cx - r + (k * r * 2) / 6, cy - r * 0.15 - Math.sin((k / 6) * Math.PI) * r * 0.95, r * 0.24, ch.hairCol);
  if (ch.hair === 'mohawk') rect(cx - u * 0.18, top - u * 0.7, u * 0.36, u * 1.2, ch.hairCol);
  if (ch.hair === 'afro') disc(cx, cy - r * 0.2, r * 1.05, ch.hairCol, Math.PI, 0);
  if (ch.hat === 'beanie') { disc(cx, cy - r * 0.1, r * 1.08, ch.hatCol, Math.PI, 0); rect(cx - r * 1.1, cy - r * 0.32, r * 2.2, r * 0.32, ch.accent); disc(cx, top - r * 0.2, u * 0.32, ch.accent); }
  if (ch.hat === 'cap') { disc(cx, cy - r * 0.18, r * 1.04, ch.hatCol, Math.PI, 0); rect(side > 0 ? cx : cx - r * 1.7, cy - r * 0.26, r * 1.7, r * 0.18, ch.hatCol); }

  // face
  const ey = cy + r * 0.28, ex = r * 0.42, er = r * 0.2;
  const gx = ch.gaze[0] * er * 0.5 + side * er * 0.2;
  for (const s of [-1, 1]) {
    const x = cx + s * ex;
    const happy = ch.eyes === 'happy' || (ch.eyes === 'wink' && s > 0);
    if (happy) disc(x, ey + er * 0.3, er, '#141218', Math.PI, 0);
    else if (ch.eyes === 'dot') disc(x, ey, er * 0.5, '#141218');
    else {
      disc(x, ey, er, '#f5f1e8');
      disc(x + gx, ey, er * 0.55, '#141218');
      if (ch.eyes === 'sleepy') disc(x, ey, er * 1.02, ch.skin, Math.PI, 0);
    }
    // brows as bars
    g.save();
    g.translate(x, ey - er * 1.75);
    g.rotate(-s * ch.browTilt * 3);
    rect(-er, -er * 0.16, er * 2, er * 0.32, ch.hairCol);
    g.restore();
    if (ch.blush > 0) { g.globalAlpha = 0.45; disc(cx + s * r * 0.62, ey + r * 0.42, er * 0.8, ch.blushCol); g.globalAlpha = 1; }
  }
  if (ch.glasses !== 'none') {
    g.strokeStyle = ch.glasses === 'shades' ? '#141218' : ch.frame;
    g.lineWidth = u * 0.12;
    for (const s of [-1, 1]) {
      g.beginPath();
      if (ch.glasses === 'square') g.rect(cx + s * ex - er * 1.45, ey - er * 1.15, er * 2.9, er * 2.3);
      else g.arc(cx + s * ex, ey, er * 1.45, 0, Math.PI * 2);
      if (ch.glasses === 'shades') { g.fillStyle = '#141218'; g.fill(); }
      g.stroke();
    }
    g.beginPath();
    g.moveTo(cx - ex + er * 1.45, ey);
    g.lineTo(cx + ex - er * 1.45, ey);
    g.stroke();
  }
  // nose: a quarter-disc pointing the way the head turns
  const ny = cy + r * 0.62;
  g.fillStyle = mix(ch.skin, '#000000', 0.18);
  g.beginPath();
  g.moveTo(cx, ny - r * 0.22);
  g.arc(cx, ny - r * 0.22, ch.nose === 'tiny' ? r * 0.14 : r * 0.24, side > 0 ? Math.PI / 2 : 0, side > 0 ? Math.PI : Math.PI / 2);
  g.fill();
  // beard and mouth
  const my = cy + r * 0.92;
  if (ch.beard === 'full') disc(cx, cy + r * 0.62, r * 0.8, ch.hairCol, 0, Math.PI);
  if (ch.beard !== 'none') rect(cx - r * 0.34, ny + r * 0.02, r * 0.68, r * 0.1, ch.hairCol);
  if (ch.mouth === 'smile' || ch.mouth === 'grin') {
    disc(cx, my - r * 0.06, r * 0.3, ch.mouth === 'grin' ? '#3b0f1a' : '#5a2230', 0, Math.PI);
    if (ch.mouth === 'grin') rect(cx - r * 0.27, my - r * 0.06, r * 0.54, r * 0.08, '#f5f1e8');
  } else if (ch.mouth === 'o') disc(cx, my, r * 0.1, '#3b0f1a');
  else if (ch.mouth === 'smirk') disc(cx + side * r * 0.08, my - r * 0.04, r * 0.24, '#5a2230', side > 0 ? 0 : Math.PI / 2, side > 0 ? Math.PI / 2 : Math.PI);
  else rect(cx - r * 0.2, my - r * 0.02, r * 0.4, r * 0.07, '#5a2230');
  return c;
}

function mix(a: string, b: string, t: number): string {
  const x = hexRGB(a), y = hexRGB(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * t)).join(',')})`;
}

const RENDER: Record<AvatarStyle, (ch: Character, px: number) => HTMLCanvasElement> = { clay, comic, onebit, pixel, ascii, neon, bauhaus };

export function renderAvatar(style: AvatarStyle, ch: Character, px: number): HTMLCanvasElement {
  return RENDER[style](ch, px);
}
