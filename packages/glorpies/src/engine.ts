/**
 * Seeded randomness and Perlin noise behind every face.
 *
 * Random numbers come from sfc32, whose 128 bits of state take a whole 53-bit
 * seed, so each of the 9 quadrillion seeds is a stream of its own. The noise is
 * p5.js 1.x's `noise`, ported exactly. Being plain arithmetic, both run
 * anywhere: browsers, workers, Node, Bun, Deno.
 *
 * Determinism comes from discipline, not isolation: a face is built from one
 * random stream (seeded once), and every paint/ink operation reseeds before it
 * runs, so an operation can be rendered again later (at another size, as SVG,
 * or as a new "boil" frame) and come out identical. The noise table is shared,
 * so renderers call noiseSeed for their face before sampling.
 */
export type Engine = {
  seed(n: number): void;
  random(lo: number, hi: number): number;
  gauss(): number;
  noiseSeed(n: number): void;
  noise(x: number, y?: number): number;
};

const TWO_32 = 4294967296;

// Numerical Recipes' linear congruential generator, which fills p5's noise table
const M = TWO_32;
const A = 1664525;
const C = 1013904223;

/** A seed's two halves: the low 32 bits and the 21 above them. */
const halves = (n: number): [number, number] => [n >>> 0, Math.floor(n / TWO_32) >>> 0];

const PERLIN_YWRAPB = 4;
const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
const PERLIN_SIZE = 4095;
const OCTAVES = 4;
const FALLOFF = 0.5;

const scaledCosine = (i: number) => 0.5 * (1 - Math.cos(i * Math.PI));

export function createEngine(): Engine {
  // sfc32: three words of state and a counter
  let a = 0, b = 0, c = 0, d = 1;
  let spare: number | null = null;
  const perlin = new Float64Array(PERLIN_SIZE + 1);
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
      const [lo, hi] = halves(n);
      let z = (lo ^ Math.imul(hi, 0x9e3779b1)) >>> 0;
      for (let i = 0; i <= PERLIN_SIZE; i++) {
        z = (A * z + C) % M;
        perlin[i] = z / M;
      }
    },
    noise: (x, y = 0) => {
      x = Math.abs(x);
      y = Math.abs(y);
      let xi = Math.floor(x), yi = Math.floor(y);
      let xf = x - xi, yf = y - yi;
      let r = 0, ampl = 0.5;
      for (let o = 0; o < OCTAVES; o++) {
        const of = xi + (yi << PERLIN_YWRAPB);
        const rxf = scaledCosine(xf), ryf = scaledCosine(yf);
        let n1 = perlin[of & PERLIN_SIZE]!;
        n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE]! - n1);
        let n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE]!;
        n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE]! - n2);
        // p5's noise is 3D; with z = 0 its third axis is interpolated with weight 0, so it is left out
        n1 += ryf * (n2 - n1);
        r += n1 * ampl;
        ampl *= FALLOFF;
        xi <<= 1; xf *= 2;
        yi <<= 1; yf *= 2;
        if (xf >= 1) { xi++; xf--; }
        if (yf >= 1) { yi++; yf--; }
      }
      return r;
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
