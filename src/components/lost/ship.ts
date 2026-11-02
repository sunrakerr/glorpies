/**
 * The saucer as pixel art: the left half of each row, mirrored for the right.
 * o outline · 1–4 hull, light to dark · W hull glint · g/h/d glass · w glass glint
 * p/q pilot · L running lights · b beam emitter
 */
const HALF = [
  '..............oooooo',
  '............oohhgpgg',
  '...........ohwggggpp',
  '..........ohhgggpppp',
  '..........ohggpppppp',
  '..........oggppppppp',
  '..........oddgqqqqqq',
  '......oooooooooooooo',
  '....oo11W11111111111',
  '..oo1111111111111111',
  '.o222222222222222222',
  'o3L333L333L333L333L3',
  '.o333333333333333333',
  '..oo4444444444444444',
  '....oooooo4444444444',
  '..........oooobbbbbb',
  '..............oooooo',
];

/** Glints catch the light on the left only. */
const MIRROR: Record<string, string> = { h: 'g', w: 'g', W: '1' };
const ROWS = HALF.map(
  (half) =>
    half +
    [...half]
      .reverse()
      .map((c) => MIRROR[c] ?? c)
      .join(''),
);

export const SHIP_W = ROWS[0]!.length;
export const SHIP_H = ROWS.length;
/** The rim's row: where the ship's position sits on the sprite. */
const RIM = 11;
/** Rows from the rim down to the bottom of the emitter. */
export const UNDERSIDE = SHIP_H - RIM;
/** Half the emitter's width, in cells. */
export const EMITTER = 6;

const LIGHTS = ROWS[RIM]!.split('').flatMap((c, x) => (c === 'L' ? [x] : []));
const EYES = [16, 23];

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: number[], b: number[], k: number) =>
  a.map((v, i) => Math.round(v + (b[i]! - v) * k)) as [number, number, number];

const PALETTE: Record<string, [number, number, number]> = {
  o: rgb('#1b1726'),
  W: rgb('#ffffff'),
  '1': rgb('#e9e5f0'),
  '2': rgb('#c4bdd2'),
  '3': rgb('#958ca8'),
  '4': rgb('#686080'),
  g: rgb('#8ad5e6'),
  h: rgb('#dcf7fc'),
  w: rgb('#ffffff'),
  d: rgb('#5ba5bb'),
  p: rgb('#8fe050'),
  q: rgb('#5fae35'),
};
/** The lights glow the same in both themes; the light theme's accent is too dark to read as lit. */
const GLOW = rgb('#b4ff5a');

/** Ordered-dither thresholds, the same 4×4 Bayer matrix as the pixel field behind. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]!;

export type Look = { t: number; vx: number; beam: number };

let sprite: { canvas: HTMLCanvasElement; img: ImageData } | null = null;

/** One frame of the ship at a pixel a cell: lights chasing round the rim, the pilot looking where it's going, now and then blinking. */
function paintShip({ t, vx, beam }: Look) {
  if (!sprite) {
    const canvas = document.createElement('canvas');
    canvas.width = SHIP_W;
    canvas.height = SHIP_H;
    sprite = { canvas, img: canvas.getContext('2d')!.createImageData(SHIP_W, SHIP_H) };
  }
  const { canvas, img } = sprite;
  const lit = beam > 0.5 ? (Math.floor(t * 8) % 2 ? -1 : -2) : Math.floor(t * 9) % LIGHTS.length;
  const look = Math.abs(vx) > 15 ? Math.sign(vx) : 0;
  const blink = t % 3.7 < 0.14;
  const pulse = 0.35 + 0.25 * Math.sin(t * 4);

  const d = img.data;
  ROWS.forEach((row, y) => {
    for (let x = 0; x < SHIP_W; x++) {
      const c = row[x]!;
      const o = (y * SHIP_W + x) * 4;
      let colour = PALETTE[c];
      if (c === 'L') {
        const i = LIGHTS.indexOf(x);
        const on = lit === -2 || i === lit || i === (lit + LIGHTS.length / 2) % LIGHTS.length;
        colour = on ? GLOW : PALETTE['4'];
      } else if (c === 'b') {
        colour = mix(PALETTE['4']!, GLOW, Math.max(pulse, beam));
      } else if ((y === 4 || y === 5) && !blink && EYES.includes(x - look)) {
        colour = PALETTE.o;
      }
      d[o + 3] = colour ? 255 : 0;
      if (colour) [d[o], d[o + 1], d[o + 2]] = colour;
    }
  });
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  return canvas;
}

/** The ship with its rim at (x, y), `px` CSS pixels a cell, kept on whole pixels so the cells stay crisp. */
export function drawShip(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  look: Look,
) {
  g.imageSmoothingEnabled = false;
  g.drawImage(
    paintShip(look),
    Math.round(x - (SHIP_W * px) / 2),
    Math.round(y - (RIM + 0.5) * px),
    SHIP_W * px,
    SHIP_H * px,
  );
  g.imageSmoothingEnabled = true;
}

let field: { canvas: HTMLCanvasElement; img: ImageData } | null = null;

/**
 * The tractor beam in cells, dithered like the field behind: it spreads from the
 * emitter, fades with depth, and bands of light climb it towards the ship.
 */
export function drawBeam(
  g: CanvasRenderingContext2D,
  x: number,
  top: number,
  px: number,
  reach: number,
  spread: number,
  strength: number,
  t: number,
  accent: string,
) {
  const half = Math.ceil((EMITTER * px + reach * spread) / px);
  const w = half * 2,
    h = Math.ceil(reach / px);
  if (!field || field.canvas.width !== w || field.canvas.height !== h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    field = { canvas, img: canvas.getContext('2d')!.createImageData(w, h) };
  }
  const { canvas, img } = field;
  const [r, gr, b] = rgb(accent);
  const d = img.data;
  for (let cy = 0; cy < h; cy++) {
    const depth = (cy + 0.5) * px;
    const edge = EMITTER + (depth * spread) / px;
    const fall = 1 - depth / reach;
    const band = 0.5 + 0.5 * Math.sin((depth + t * 110) / 9);
    for (let cx = 0; cx < w; cx++) {
      const off = Math.abs(cx + 0.5 - half);
      const o = (cy * w + cx) * 4;
      let on = false;
      if (off < edge) {
        const level = off > edge - 1 ? 0.95 * fall : fall * (0.3 + 0.45 * band);
        on = level * strength > dither(cx, cy);
      }
      d[o] = r;
      d[o + 1] = gr;
      d[o + 2] = b;
      d[o + 3] = on ? 255 : 0;
    }
  }
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  g.save();
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 0.5;
  g.drawImage(canvas, Math.round(x - half * px), Math.round(top), w * px, h * px);
  g.restore();
}
