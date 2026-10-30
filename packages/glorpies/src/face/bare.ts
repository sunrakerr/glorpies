import { GRAPHITE, type Face } from './types';

/**
 * The face's picture without the face: same paper, glazes and seed. Painting it in any look gives
 * what lies behind the face, which stays still while the face moves.
 */
export function bareFace(face: Face): Face {
  return { ...face, figure: [], eyes: [] };
}

/** The face without its pencil construction lines, for a face shown off its paper. */
export function unguided(face: Face): Face {
  return { ...face, back: face.back.filter((op) => !(op.k === 'ink' && op.col === GRAPHITE)) };
}
