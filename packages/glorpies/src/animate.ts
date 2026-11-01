import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { EYE_POSES, eyePatch, pixelsOf, posed } from './alive';
import { makeCanvas } from './canvas';
import { getEngine } from './engine';
import { drawFrame, drawStill, rasterizeFace, type Painting, type StillRaster } from './face/render';
import { cutBackdrop, cutOut } from './cutout';
import { unguided } from './face/bare';
import { splitLayers } from './layers';
import { lookOf, marksFor, renderLook, resolveLook } from './looks';
import { drawMarks } from './marks';
import { scriptedPose, type FaceState } from './states';
import { backdropOf, checked, faceOf, shapePath, sizeOf, type StillOptions } from './still';
import type { FaceName } from './seed';

export type AnimationOptions = StillOptions & {
  /** Seconds before the animation repeats exactly, up to 10. */
  loop?: number;
  /** Up to 30; a loop too large for its frames to fit in FRAME_BUDGET gets fewer. */
  fps?: number;
};

/**
 * Every frame of a loop is held until it's encoded, so a loop is bounded by
 * its pixels across all frames (size² × frames): 256px at 15 fps for 8
 * seconds, about 31 MB.
 */
export const FRAME_BUDGET = 256 * 256 * 120;

/** The size, length and frame count of a loop, checked before anything is painted, with frames dropped to fit the budget. */
function timing(o: AnimationOptions) {
  const size = sizeOf(o.size);
  const loop = o.loop ?? 3;
  if (!(loop > 0 && loop <= 10)) throw new RangeError(`loop must be from 0 to 10 seconds, not ${o.loop}`);
  const fps = o.fps ?? 15;
  if (!(fps >= 1 && fps <= 30)) throw new RangeError(`fps must be from 1 to 30, not ${o.fps}`);
  const most = Math.floor(FRAME_BUDGET / (size * size));
  if (most < 1) throw new RangeError(`a ${size}px frame is too big to animate; try ${Math.floor(Math.sqrt(FRAME_BUDGET))}px or less`);
  // a long or large loop keeps its length and moves in fewer steps
  const count = Math.min(most, Math.max(1, Math.round(loop * fps)));
  return { size, loop, count };
}

/**
 * A face's life as a seamless loop of frames, for places that can't run code. A scripted pose drives it,
 * so the same name always loops the same way.
 */
export function animationFrames(name: FaceName, options: AnimationOptions = {}): { frames: Uint8ClampedArray[]; size: number; fps: number; loop: number } {
  const o = checked(options);
  const { size, loop, count } = timing(o);
  const state: FaceState = o.state ?? 'idle';
  const look = resolveLook(o.look, size);
  const { paper, colour } = backdropOf(o.background);
  const face = paper ? faceOf(name, state) : unguided(faceOf(name, state));
  const E = getEngine();

  let raster: Painting;
  if (look === 'watercolour') {
    raster = rasterizeFace(face, E, size);
    if (!paper) cutBackdrop(raster, face);
  } else {
    const still = renderLook(look, face, E, size);
    const { motion, eyes, tiles } = lookOf(look);
    const r: StillRaster = { px: size, still, layers: 'whole', back: null, figure: null, mask: null, motion, eyes, tiles, patches: [], glance: null };
    const back = renderLook(look, face, E, size, true);
    // off its background the face moves over nothing; otherwise over its own background, held still
    const cut = paper ? null : cutOut(look, face, E, still, back);
    const split = cut ? { figure: cut.figure, mask: cut.mask } : splitLayers(still, back);
    if (split) Object.assign(r, { layers: 'split', back: cut ? makeCanvas(size) : back, figure: split.figure, mask: split.mask });
    const rest = pixelsOf(still);
    for (const pose of EYE_POSES) {
      const patch = eyePatch(rest, renderLook(look, posed(face, pose), E, size), face, pose, r.mask);
      if (patch) r.patches.push(patch);
    }
    raster = r;
  }

  const marks = state === 'idle' ? null : marksFor(look, face, size);
  const canvas = makeCanvas(size);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i * loop) / count;
    const pose = scriptedPose(face, state, t, loop);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    if ('still' in raster) drawStill(g, face, raster, pose, size);
    else drawFrame(g, face, raster, pose, size);
    if (marks) drawMarks(g, face, state, marks, t);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (colour) {
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = colour;
      g.fillRect(0, 0, size, size);
      g.globalCompositeOperation = 'source-over';
    }
    if ((paper || colour) && o.shape && o.shape !== 'square') {
      g.globalCompositeOperation = 'destination-in';
      shapePath(g, o.shape, size);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    frames.push(g.getImageData(0, 0, size, size).data);
  }
  // frames are evenly spaced across the loop, so this is the rate they actually play at
  return { frames, size, fps: count / loop, loop };
}

/** The loop as a GIF, with one palette for the whole loop so colours never flicker between frames. */
export function faceGIF(name: FaceName, o: AnimationOptions = {}): Uint8Array {
  const { frames, size, loop } = animationFrames(name, o);
  // a crop or a face on nothing leaves pixels to keep transparent
  const { paper, colour } = backdropOf(o.background);
  const shaped = (!paper && !colour) || (!!o.shape && o.shape !== 'square');
  const sample = new Uint8ClampedArray(frames.length > 4 ? size * size * 4 * 4 : frames[0]!.length);
  if (frames.length > 4) for (let k = 0; k < 4; k++) sample.set(frames[Math.floor((k * frames.length) / 4)]!, k * size * size * 4);
  else sample.set(frames[0]!);
  const palette = quantize(sample, shaped ? 255 : 256);
  const clear = palette.length;
  if (shaped) palette.push([0, 0, 0]);

  const gif = GIFEncoder();
  // a GIF counts time in hundredths of a second: each frame ends at its own rounded mark, so the loop lasts what was asked
  const end = (i: number) => Math.round((i * loop * 100) / frames.length);
  for (const [i, f] of frames.entries()) {
    const delay = (end(i + 1) - end(i)) * 10;
    const index = applyPalette(f, palette.slice(0, clear));
    if (shaped) for (let i = 0; i < index.length; i++) if (f[i * 4 + 3]! < 128) index[i] = clear;
    gif.writeFrame(index, size, size, { palette, delay, repeat: 0, ...(shaped ? { transparent: true, transparentIndex: clear, dispose: 2 } : {}) });
  }
  gif.finish();
  return gif.bytes();
}
