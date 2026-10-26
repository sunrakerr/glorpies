/**
 * Alien writing, from scripts nobody on Earth reads any more: Egyptian
 * hieroglyphs, Linear A (still undeciphered) and runes. Purely for looks;
 * the glyphs mean nothing.
 */
const SCRIPTS: readonly (readonly [number, number])[] = [
  [0x13000, 0x1342e], // egyptian hieroglyphs
  [0x10600, 0x10736], // linear a
  [0x16a0, 0x16ea], // runic
];

/** The same few numbers in [0, 1) from a seed, every time (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One word of 2 to 5 glyphs, all from one script. */
function word(random: () => number): string {
  const [lo, hi] = SCRIPTS[Math.floor(random() * SCRIPTS.length)]!;
  const n = 2 + Math.floor(random() * 4);
  return Array.from({ length: n }, () => String.fromCodePoint(lo + Math.floor(random() * (hi - lo + 1)))).join('');
}

/** A line of alien writing, `words` words long. */
export function alienScript(words: number, random: () => number = Math.random): string {
  return Array.from({ length: words }, () => word(random)).join(' ');
}

/** A face's true name, in its own script: the same seed always writes the same glyphs. */
export const trueName = (seed: number) => alienScript(1, seeded(seed));

/** Marks for the landing page's sections: the eye, the scarab, the scribe's kit, the ankh. */
export const MARKS = { eye: '𓂀', scarab: '𓆣', scribe: '𓏞', ankh: '𓋹' } as const;
