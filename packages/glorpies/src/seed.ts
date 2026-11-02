/** A face is named by any string (an email, a username, a bot id) or by its seed number directly. */
export type FaceName = string | number;

/** How many faces there are: every whole number below 2^53, the largest JavaScript counts exactly. 9,007,199,254,740,992. */
export const FACES = 2 ** 53;

/**
 * The seed behind a name. Whole numbers below FACES are seeds already and
 * pass straight through; anything else is hashed (cyrb53) onto the same
 * range. This mapping is part of the public contract: changing it would give
 * every name in the world a different face.
 */
export function seedOf(name: FaceName): number {
  if (typeof name === 'number' && Number.isInteger(name) && name >= 0) return name % FACES;
  const s = String(name);
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  // 21 bits of one half above all 32 of the other: 53 bits, exact in a double
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
