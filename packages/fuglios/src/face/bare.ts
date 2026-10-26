import type { Face } from './types';

/**
 * The face taken out of its own picture: same paper, glazes and seed, but no
 * figure and no eyes. Rendering it in any style paints what lies behind the
 * face, which is how the animator separates a style's background (which stays
 * still) from the face (which breathes and sways).
 */
export function bareFace(face: Face): Face {
  return { ...face, figure: [], eyes: [] };
}
