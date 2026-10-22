/**
 * A character: a set of traits picked from a seed, plus the layout that pins
 * eyes, nose, mouth and brows onto the surface of the head. Every avatar style
 * draws from the same character, so a seed is the same person in clay, pixels
 * or ASCII.
 */

export type V3 = [number, number, number];

export const HAIR = ['none', 'short', 'buzz', 'bob', 'long', 'bun', 'afro', 'mohawk', 'curly'] as const;
export const HAT = ['none', 'beanie', 'cap'] as const;
export const EYES = ['round', 'dot', 'sleepy', 'happy', 'wink'] as const;
export const MOUTH = ['smile', 'flat', 'grin', 'o', 'smirk'] as const;
export const NOSE = ['button', 'long', 'tiny'] as const;
export const GLASSES = ['none', 'round', 'square', 'shades'] as const;
export const BEARD = ['none', 'full', 'moustache'] as const;
export const TOP = ['tee', 'turtleneck'] as const;

export type Hair = (typeof HAIR)[number];
export type Hat = (typeof HAT)[number];
export type Eyes = (typeof EYES)[number];
export type Mouth = (typeof MOUTH)[number];
export type Nose = (typeof NOSE)[number];
export type Glasses = (typeof GLASSES)[number];
export type Beard = (typeof BEARD)[number];
export type Top = (typeof TOP)[number];

export type Character = {
  seed: number;
  hair: Hair; hat: Hat; eyes: Eyes; mouth: Mouth; nose: Nose; glasses: Glasses; beard: Beard; top: Top;
  skin: string; hairCol: string; hatCol: string; iris: string; shirt: string; frame: string; lip: string; blushCol: string;
  bg: string; bg2: string; accent: string;
  blush: number; freckles: boolean; earring: boolean;
  headW: number; yaw: number; pitch: number; gaze: [number, number];
  hairline: number; fringe: number; browTilt: number;
  /** Curl centres and radii for curly hair, in head space. */
  curls: [number, number, number, number][];
  layout: Layout;
};

export type Layout = {
  eyeL: V3; eyeR: V3; eyeNL: V3; eyeNR: V3;
  nose: V3; mouth: V3;
  browL: [V3, V3]; browR: [V3, V3];
};

const SKIN = ['#f7d7bd', '#efc19c', '#e2a77c', '#c68653', '#a5693f', '#7d4a2c', '#5b3420'];
const SKIN_FUN = ['#a8dcc8', '#c7b8f0', '#9fc6f2'];
const HAIR_NATURAL = ['#211a16', '#3a281d', '#5c3a22', '#8a5530', '#c58b4a', '#e7c784', '#cfc8c0'];
const HAIR_DYED = ['#ff6b8b', '#4f7cff', '#3ccf91', '#9b6bff', '#ff9a3c', '#f2f2f2'];
const IRIS = ['#4a2e1a', '#3f78c2', '#3f8f56', '#7a5434', '#22252b', '#6f8f9a'];
const SHIRTS = ['#1f2a44', '#e2583e', '#1fa187', '#f2b84b', '#3346a8', '#f07a9b', '#7b4ddb', '#efe7da', '#2b2b2b', '#4aa3df'];
const BGS: [string, string][] = [
  ['#ffd8b1', '#ffe9d4'], ['#c9f0d5', '#e3f8ea'], ['#bfe6ff', '#def2ff'], ['#d9cdfc', '#ebe4ff'],
  ['#ffd0e2', '#ffe5ef'], ['#fff0a8', '#fff8d6'], ['#cbe7e3', '#e2f3f0'], ['#ffc9b9', '#ffe2d8'], ['#e8e2d6', '#f5f1ea'],
];
const HATS = ['#e2583e', '#1f2a44', '#f2b84b', '#1fa187', '#7b4ddb', '#f07a9b', '#efe7da'];
const FRAMES = ['#1c1c1f', '#b2462e', '#2d5bd8', '#d8a531', '#efefef'];

function rng(seed: number) {
  // mulberry32's first outputs track the seed closely; scramble it so neighbouring seeds are strangers
  let a = Math.imul((seed ^ (seed >>> 16)) >>> 0, 0x45d9f3b) >>> 0;
  a = Math.imul(a ^ (a >>> 16), 0x45d9f3b) >>> 0;
  a = (a ^ (a >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(hex: string): V3 {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

const dist = (a: string, b: string) => {
  const x = rgb(a), y = rgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

// ---- the head's surface, mirrored from headShape() in the shader

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

function ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return (k0 * (k0 - 1)) / k1;
}

export function headShape(x: number, y: number, z: number, w: number) {
  const qx = x / w;
  const d = smin(Math.hypot(qx, y - 0.1, z) - 1, ellipsoid(qx, y + 0.32, z - 0.06, 0.8, 0.72, 0.82), 0.35);
  return d * Math.min(w, 1);
}

/** Where a ray along -z first meets the head, with the surface normal there. */
function surface(x: number, y: number, w: number): { p: V3; n: V3 } {
  let lo = -0.2, hi = 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (headShape(x, y, mid, w) > 0) hi = mid;
    else lo = mid;
  }
  const z = (lo + hi) / 2, e = 1e-3;
  const n: V3 = [
    headShape(x + e, y, z, w) - headShape(x - e, y, z, w),
    headShape(x, y + e, z, w) - headShape(x, y - e, z, w),
    headShape(x, y, z + e, w) - headShape(x, y, z - e, w),
  ];
  const l = Math.hypot(...n);
  return { p: [x, y, z], n: [n[0] / l, n[1] / l, n[2] / l] };
}

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

function layoutFor(c: Omit<Character, 'layout'>, spread: number): Layout {
  const w = c.headW;
  const eL = surface(-spread, -0.02, w), eR = surface(spread, -0.02, w);
  const nose = surface(0, -0.25, w), mouth = surface(0, -0.53, w);
  const brow = (x: number, inner: number, sign: number): [V3, V3] => {
    const a = surface(x - sign * 0.12, 0.25 + inner, w), b = surface(x + sign * 0.11, 0.26 - inner * 0.6, w);
    return [add(a.p, a.n, 0.02), add(b.p, b.n, 0.02)];
  };
  return {
    eyeL: eL.p, eyeR: eR.p, eyeNL: eL.n, eyeNR: eR.n,
    nose: add(nose.p, nose.n, c.nose === 'tiny' ? 0.0 : 0.02),
    mouth: mouth.p,
    // inner ends first; a positive tilt lowers them, which reads as determined
    browL: brow(-spread, -c.browTilt, -1),
    browR: brow(spread, -c.browTilt, 1),
  };
}

export function character(seed: number): Character {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const weighted = <T,>(xs: readonly [T, number][]): T => {
    let x = r() * xs.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of xs) if ((x -= w) <= 0) return v;
    return xs[0]![0];
  };

  const skin = r() < 0.12 ? pick(SKIN_FUN) : pick(SKIN);
  let hair = weighted<Hair>([['short', 3], ['bob', 2], ['long', 2], ['curly', 2], ['buzz', 1], ['bun', 1.4], ['afro', 1.2], ['mohawk', 0.7], ['none', 0.8]]);
  const hat = weighted<Hat>([['none', 5], ['beanie', 1.2], ['cap', 1]]);
  if (hat !== 'none' && (hair === 'afro' || hair === 'bun' || hair === 'mohawk' || hair === 'curly')) hair = r() < 0.5 ? 'short' : 'long';
  const hairCol = r() < 0.28 ? pick(HAIR_DYED) : pick(HAIR_NATURAL);
  const shirt = pick(SHIRTS);
  let bgPair = pick(BGS);
  for (let i = 0; i < 6 && (dist(bgPair[0], shirt) < 90 || dist(bgPair[0], hairCol) < 80); i++) bgPair = pick(BGS);
  const glasses = weighted<Glasses>([['none', 6], ['round', 1.4], ['square', 1.1], ['shades', 0.7]]);
  const beard = weighted<Beard>([['none', 7], ['full', 1.1], ['moustache', 1]]);

  const base = {
    seed,
    hair, hat,
    eyes: weighted<Eyes>([['round', 6], ['dot', 1.6], ['sleepy', 1.4], ['happy', 1.2], ['wink', 0.6]]),
    mouth: weighted<Mouth>([['smile', 4], ['grin', 2], ['flat', 1.2], ['o', 0.8], ['smirk', 1.5]]),
    nose: weighted<Nose>([['button', 3], ['long', 1.3], ['tiny', 2]]),
    glasses, beard,
    top: weighted<Top>([['tee', 3], ['turtleneck', 1]]),
    skin, hairCol,
    hatCol: pick(HATS.filter((h) => dist(h, shirt) > 60)),
    iris: pick(IRIS),
    shirt,
    frame: pick(FRAMES),
    lip: '#5a2230',
    blushCol: '#ff7d8f',
    bg: bgPair[0], bg2: bgPair[1],
    accent: pick(HATS),
    blush: r() < 0.6 ? 0.5 + r() * 0.5 : 0,
    freckles: r() < 0.22,
    earring: r() < 0.3,
    headW: 0.93 + r() * 0.13,
    yaw: (r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.22),
    pitch: -0.04 + r() * 0.1,
    gaze: [(r() - 0.5) * 0.5, (r() - 0.5) * 0.25] as [number, number],
    hairline: 0.4 + r() * 0.12,
    fringe: r() < 0.5 ? (r() < 0.5 ? -1 : 1) : 0,
    browTilt: (r() - 0.45) * 0.1,
    curls: [] as [number, number, number, number][],
  };
  if (base.fringe) base.hairline -= 0.08;
  if (hair === 'curly') {
    for (let i = 0; i < 40 && base.curls.length < 14; i++) {
      const th = r() * Math.PI * 2, y = 0.15 + r() * 0.85;
      const rr = Math.sqrt(1 - y * y);
      const d: V3 = [Math.cos(th) * rr, y, Math.sin(th) * rr];
      if (d[2] > 0.45 && d[1] < 0.6) continue;
      base.curls.push([d[0] * 1.06, 0.12 + d[1] * 1.06, -0.03 + d[2] * 1.06, 0.22 + r() * 0.09]);
    }
  }
  const spread = 0.33 + r() * 0.06;
  return { ...base, layout: layoutFor(base, spread) };
}

export function srgbToLinear(hex: string): V3 {
  return rgb(hex).map((v) => (v / 255) ** 2.2) as V3;
}

export function hexRGB(hex: string): V3 {
  return rgb(hex);
}
