import { makeCanvas } from './canvas';
import type { Engine } from './engine';
import { drawFrame, restPose, type FaceRaster } from './face/render';
import type { Face } from './face/types';
import { faceMask } from './layers';
import { renderLook, type LookId } from './looks';

/**
 * Faces lifted off their background. A look is painted twice, whole and bare,
 * and kept only where the two differ, so it works the same for the watercolour
 * and for most styles painted from it.
 */

/**
 * Looks where every pixel depends on its neighbours (tiles, triangles, strokes
 * along the grain, contours, shimmer): taking the face away changes the picture
 * all around it, so these are cut along the watercolour's outline instead.
 */
const BY_OUTLINE: ReadonlySet<LookId> = new Set(['oil', 'mosaic', 'lowpoly', 'topo', 'holo']);

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

/**
 * `full`, the face painted in `look`, with everything but the face made
 * transparent; or null for a style whose background can't be told from its
 * face. `bare` is the same look painted without the face, if it's at hand.
 */
export function cutOut(
  look: LookId,
  face: Face,
  E: Engine,
  full: HTMLCanvasElement,
  bare?: HTMLCanvasElement,
): { figure: HTMLCanvasElement; mask: HTMLCanvasElement } | null {
  const px = full.width;
  const cut = BY_OUTLINE.has(look)
    ? faceMask(
        renderLook('watercolour', face, E, px),
        renderLook('watercolour', face, E, px, true),
        true,
      )
    : faceMask(full, bare ?? renderLook(look, face, E, px, true), true);
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
