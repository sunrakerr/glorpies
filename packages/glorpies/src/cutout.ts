import { makeCanvas } from './canvas';
import { drawFrame, restPose, type FaceRaster } from './face/render';
import type { Face } from './face/types';
import { faceMask } from './layers';

/**
 * Faces lifted off their background. Every look is painted twice, whole and
 * bare, and kept only where the two differ, so it works the same for the
 * watercolour and for every style painted from it.
 */

/** Keeps only what lies under `mask`'s alpha, in place. */
function keepMasked(c: HTMLCanvasElement, mask: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d')!;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, 0, 0, c.width, c.height);
  g.restore();
  return c;
}

/** A painting with everything but its face made transparent, or null for a style whose background can't be told from its face. */
export function cutOut(full: HTMLCanvasElement, bare: HTMLCanvasElement): { figure: HTMLCanvasElement; mask: HTMLCanvasElement } | null {
  const cut = faceMask(full, bare, true);
  if (!cut) return null;
  const figure = makeCanvas(full.width, full.height);
  figure.getContext('2d')!.drawImage(full, 0, 0);
  return { figure: keepMasked(figure, cut.mask), mask: cut.mask };
}

/**
 * The watercolour's backdrop trimmed to the face, in place: the paper and
 * glazes that show through the head stay, so the figure still multiplies
 * over what it was painted on, and everything around it goes.
 */
export function cutBackdrop(raster: FaceRaster, face: Face): void {
  const whole = makeCanvas(raster.px);
  drawFrame(whole.getContext('2d')!, face, raster, restPose(face), raster.px);
  const cut = faceMask(whole, raster.back, true);
  if (cut) keepMasked(raster.back, cut.mask);
}
