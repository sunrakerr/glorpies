import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { EYE_POSES, eyePatch, pixelsOf, posed } from './alive';
import { makeCanvas } from './canvas';
import { getEngine } from './engine';
import { drawFrame, drawStill, rasterizeFace, type Painting, type StillRaster } from './face/render';
import { splitLayers } from './layers';
import { lookOf, marksFor, renderLook, resolveLook } from './looks';
import { drawMarks } from './marks';
import { scriptedPose, type FaceState } from './states';
import { faceOf, shapePath, type StillOptions } from './still';
import type { FaceName } from './seed';

export type AnimationOptions = StillOptions & {
  /** Seconds before the animation repeats exactly. */
  loop?: number;
  fps?: number;
};

/**
 * A face's life as a seamless loop of frames, for places that can't run code
 * (email, chat apps, README files, an agent's profile picture). Painted the
 * same way the live faces are: the original's boiling layers, or a style split
 * into still background and moving face with all six eye poses, driven by a
 * scripted pose with no randomness, so the same name always loops the same way.
 */
export function animationFrames(name: FaceName, o: AnimationOptions = {}): { frames: Uint8ClampedArray[]; size: number; fps: number } {
  const size = Math.round(o.size ?? 256);
  const fps = o.fps ?? 15;
  const loop = o.loop ?? 3;
  const state: FaceState = o.state ?? 'idle';
  const look = resolveLook(o.look, size);
  const face = faceOf(name, state);
  const E = getEngine();

  let raster: Painting;
  if (look === 'watercolour') raster = rasterizeFace(face, E, size);
  else {
    const still = renderLook(look, face, E, size);
    const { motion, eyes, tiles } = lookOf(look);
    const r: StillRaster = { px: size, still, layers: 'whole', back: null, figure: null, mask: null, motion, eyes, tiles, patches: [], glance: null };
    const back = renderLook(look, face, E, size, true);
    const split = splitLayers(still, back);
    if (split) Object.assign(r, { layers: 'split', back, figure: split.figure, mask: split.mask });
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
  const count = Math.max(1, Math.round(loop * fps));
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < count; i++) {
    const pose = scriptedPose(face, state, i / fps, loop);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    if ('still' in raster) drawStill(g, face, raster, pose, size);
    else drawFrame(g, face, raster, pose, size);
    if (marks) drawMarks(g, face, state, marks, i / fps);
    if (o.shape && o.shape !== 'square') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'destination-in';
      shapePath(g, o.shape, size);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    frames.push(g.getImageData(0, 0, size, size).data);
  }
  return { frames, size, fps };
}

/**
 * The loop as an animated GIF. One palette is chosen for the whole loop, from
 * frames spread across it, so colours never flicker between frames; anything
 * outside the shape is transparent.
 */
export function faceGIF(name: FaceName, o: AnimationOptions = {}): Uint8Array {
  const { frames, size, fps } = animationFrames(name, o);
  const shaped = !!o.shape && o.shape !== 'square';
  const sample = new Uint8ClampedArray(frames.length > 4 ? size * size * 4 * 4 : frames[0]!.length);
  if (frames.length > 4) for (let k = 0; k < 4; k++) sample.set(frames[Math.floor((k * frames.length) / 4)]!, k * size * size * 4);
  else sample.set(frames[0]!);
  const palette = quantize(sample, shaped ? 255 : 256);
  const clear = palette.length;
  if (shaped) palette.push([0, 0, 0]);

  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (const f of frames) {
    const index = applyPalette(f, palette.slice(0, clear));
    if (shaped) for (let i = 0; i < index.length; i++) if (f[i * 4 + 3]! < 128) index[i] = clear;
    gif.writeFrame(index, size, size, { palette, delay, repeat: 0, ...(shaped ? { transparent: true, transparentIndex: clear, dispose: 2 } : {}) });
  }
  gif.finish();
  return gif.bytes();
}
