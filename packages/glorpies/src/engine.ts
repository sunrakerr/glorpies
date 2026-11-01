/**
 * Seeded randomness and smooth noise behind every face: sfc32, whose 128 bits
 * of state hold a whole 53-bit seed, and value noise on a 4096-height lattice,
 * cosine-eased over four octaves (what p5.js's noise gave the first faces).
 *
 * A face is built from one stream seeded once, and every paint and ink
 * operation reseeds before it runs, so any operation renders identically when
 * repeated. The lattice is shared: renderers call noiseSeed before sampling.
 */
export type Engine = {
  seed(n: number): void;
  random(lo: number, hi: number): number;
  gauss(): number;
  noiseSeed(n: number): void;
  noise(x: number, y?: number): number;
};

const TWO_32 = 4294967296;

/** A seed's two halves: the low 32 bits and the 21 above them. */
const halves = (n: number): [number, number] => [n >>> 0, Math.floor(n / TWO_32) >>> 0];

/** The noise lattice: how many heights there are (a power of two), how many to a row, and how many octaves are summed. */
const HEIGHTS = 4096, ROW = 16, OCTAVES = 4;

/** Eases 0..1 into 0..1 along half a cosine, so the noise has no corners at lattice points. */
const ease = (t: number) => 0.5 * (1 - Math.cos(t * Math.PI));
const mix = (a: number, b: number, t: number) => a + t * (b - a);

export function createEngine(): Engine {
  // sfc32: three words of state and a counter
  let a = 0, b = 0, c = 0, d = 1;
  let spare: number | null = null;
  const heights = new Float64Array(HEIGHTS);
  let noiseFor: number | null = null;

  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / TWO_32;
  };

  const random = (lo: number, hi: number) => {
    if (lo > hi) [lo, hi] = [hi, lo];
    return next() * (hi - lo) + lo;
  };

  return {
    seed: (n) => {
      const [lo, hi] = halves(n);
      a = lo;
      b = hi;
      c = lo ^ 0x9e3779b9;
      d = 1;
      // a few rounds so seeds that differ by a bit start far apart
      for (let i = 0; i < 12; i++) next();
      spare = null;
    },
    random,
    // Marsaglia's polar method; the second value of each pair is kept for the next call
    gauss: () => {
      if (spare !== null) {
        const y = spare;
        spare = null;
        return y;
      }
      let x1: number, x2: number, w: number;
      do {
        x1 = random(0, 2) - 1;
        x2 = random(0, 2) - 1;
        w = x1 * x1 + x2 * x2;
      } while (w >= 1);
      w = Math.sqrt((-2 * Math.log(w)) / w);
      spare = x2 * w;
      return x1 * w;
    },
    noiseSeed: (n) => {
      if (noiseFor === n) return;
      noiseFor = n;
      // the heights are a plain linear congruential sequence (Numerical Recipes' constants) from the seed's two halves
      const [lo, hi] = halves(n);
      let z = (lo ^ Math.imul(hi, 0x9e3779b1)) >>> 0;
      for (let i = 0; i < HEIGHTS; i++) {
        z = (1664525 * z + 1013904223) % TWO_32;
        heights[i] = z / TWO_32;
      }
    },
    noise: (x, y = 0) => {
      x = Math.abs(x);
      y = Math.abs(y);
      let sum = 0;
      for (let octave = 0, scale = 1, weight = 0.5; octave < OCTAVES; octave++, scale *= 2, weight *= 0.5) {
        // scaling by a power of two is exact, so every octave lands on the lattice the same way at any size
        const px = x * scale, py = y * scale;
        const col = Math.floor(px), row = Math.floor(py);
        const u = ease(px - col), v = ease(py - row);
        const at = col + row * ROW;
        const top = mix(heights[at & (HEIGHTS - 1)]!, heights[(at + 1) & (HEIGHTS - 1)]!, u);
        const bottom = mix(heights[(at + ROW) & (HEIGHTS - 1)]!, heights[(at + ROW + 1) & (HEIGHTS - 1)]!, u);
        sum += mix(top, bottom, v) * weight;
      }
      return sum;
    },
  };
}

let shared: Engine | null = null;

/** The one engine every face shares. */
export function getEngine(): Engine {
  shared ??= createEngine();
  return shared;
}

/** Kept async for callers written when the engine was loaded lazily. */
export function loadEngine(): Promise<Engine> {
  return Promise.resolve(getEngine());
}
