/**
 * p5.js supplies the seeded randomness and Perlin noise behind every face.
 *
 * One headless p5 instance is shared. Determinism comes from discipline, not
 * isolation: a face is built from one random stream (seeded once), and every
 * paint/ink operation reseeds before it runs, so an operation can be rendered
 * again later (at another size, as SVG, or as a new "boil" frame) and come out
 * identical. p5 keeps its noise table module-wide, so renderers call noiseSeed
 * for their face before sampling.
 */
export type Engine = {
  seed(n: number): void;
  random(lo: number, hi: number): number;
  gauss(): number;
  noiseSeed(n: number): void;
  noise(x: number, y?: number): number;
};

let pending: Promise<Engine> | null = null;

export function loadEngine(): Promise<Engine> {
  pending ??= import('p5').then(({ default: P5 }) => {
    // the minified build already skips p5's friendly-error checks; set the flag anyway in case a dev build is resolved
    (P5 as unknown as { disableFriendlyErrors: boolean }).disableFriendlyErrors = true;
    const host = document.createElement('div');
    const p = new P5((s: InstanceType<typeof P5>) => {
      s.setup = () => {
        s.noCanvas();
        s.noLoop();
      };
    }, host);
    let noiseFor: number | null = null;
    return {
      seed: (n) => p.randomSeed(n),
      random: (lo, hi) => p.random(lo, hi),
      gauss: () => p.randomGaussian(0, 1),
      noiseSeed: (n) => {
        if (noiseFor === n) return;
        noiseFor = n;
        p.noiseSeed(n);
      },
      noise: (x, y = 0) => p.noise(x, y),
    };
  });
  return pending;
}
