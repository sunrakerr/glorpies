/**
 * glorpies: hand-painted, wobbly faces from any string.
 *
 *   import { mount, faceCanvas, faceSVG } from 'glorpies';
 *
 * 9 quadrillion faces, and the same name always paints the same one, in any look, at any size,
 * in the browser or on a server. Faces mounted on a canvas come alive: they
 * breathe, blink, glance at the pointer and show what an agent is doing.
 */
export { FACES, seedOf, type FaceName } from './seed';
export { randomName } from './names';
export {
  DEFAULT_LOOK, FULL_LOOKS, isLook, LOOKS, lookOf, resolveLook, SMALL_BELOW, SMALL_LOOKS,
  type Look, type LookChoice, type LookId,
} from './looks';
export { isState, STATES, type FaceState } from './states';
export { faceCanvas, faceColors, faceOf, faceSVG, isShape, shapePath, SHAPES, type Shape, type StillOptions } from './still';
export { mount, type FaceHandle, type MountOptions } from './mount';
export { getStage } from './stage';
export { setCanvasFactory, type CanvasFactory } from './canvas';
export type { Palette } from './palettes';
export type { Face } from './face/types';
export type { Pt } from './geometry';
