/** glorpies: hand-painted alien faces from any string, the same face for the same name everywhere. */
export { FACES, seedOf, type FaceName } from './seed';
export { randomName } from './names';
export {
  DEFAULT_LOOK,
  FULL_LOOKS,
  isLook,
  LOOKS,
  lookOf,
  resolveLook,
  SMALL_BELOW,
  SMALL_LOOKS,
  type Look,
  type LookChoice,
  type LookId,
} from './looks';
export { isState, STATES, type FaceState } from './states';
export {
  faceCanvas,
  faceColors,
  faceSVG,
  isShape,
  SHAPES,
  type Shape,
  type StillOptions,
} from './still';
export { mount, type FaceHandle, type MountOptions } from './mount';
export type { GlorpieOptions } from './host';
export { setCanvasFactory, type CanvasFactory } from './canvas';
export type { Palette } from './palettes';
