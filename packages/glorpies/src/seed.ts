/** A face is named by any string (an email, a username, a bot id) or by its seed number directly. */
export type FaceName = string | number;

/**
 * The seed behind a name. Numbers that are already seeds pass straight
 * through; strings are hashed (FNV-1a with a final avalanche) onto the same
 * range. This mapping is part of the public contract: changing it would give
 * every name in the world a different face.
 */
export function seedOf(name: FaceName): number {
  if (typeof name === 'number' && Number.isInteger(name) && name >= 0) return name % 2147483647;
  const s = String(name);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % 2147483647;
}
