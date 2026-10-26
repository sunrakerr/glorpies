import { posed } from './alive';
import { makeCanvas } from './canvas';
import { getEngine } from './engine';
import { faceToSVG } from './face/svg';
import type { Face } from './face/types';
import { marksFor, renderLook, resolveLook, type LookChoice, type LookId } from './looks';
import { drawMarks } from './marks';
import type { Palette } from './palettes';
import { seedOf, type FaceName } from './seed';
import { stillEyes, type FaceState } from './states';
import { faceFor } from './studio';

/** How a still is cropped. Anything outside the shape is transparent. */
export const SHAPES = ['square', 'rounded', 'squircle', 'circle'] as const;
export type Shape = (typeof SHAPES)[number];

export const isShape = (s: unknown): s is Shape => typeof s === 'string' && (SHAPES as readonly string[]).includes(s);

export type StillOptions = {
  look?: LookChoice;
  /** Width and height in pixels. */
  size?: number;
  state?: FaceState;
  shape?: Shape;
};

/** The largest still there is: 8192² is already a quarter of a gigabyte of pixels. */
export const MAX_SIZE = 8192;

/** A size in whole pixels, refused unless it's a number from 1 to MAX_SIZE. */
export function sizeOf(size: number | undefined, fallback = 256): number {
  const px = Math.round(size ?? fallback);
  if (!(px >= 1 && px <= MAX_SIZE)) throw new RangeError(`size must be a number from 1 to ${MAX_SIZE}, not ${size}`);
  return px;
}

/** The face for a name, built once and cached. */
export function faceOf(name: FaceName, state?: FaceState): Face {
  return faceFor(seedOf(name), getEngine(), state);
}

/** A face wearing a state's expression, its eyes posed for it: the painters read gaze and openness straight from the face. */
function inState(name: FaceName, state: FaceState | undefined): Face {
  const face = faceOf(name, state);
  return !state || state === 'idle' ? face : posed(face, stillEyes(face, state));
}

/** One face as a finished picture, on a canvas (a DOM canvas, or a native one on a server). */
export function faceCanvas(name: FaceName, o: StillOptions = {}): HTMLCanvasElement {
  const size = sizeOf(o.size);
  const look = resolveLook(o.look, size);
  const face = inState(name, o.state);
  const c = renderLook(look, face, getEngine(), size);
  drawStateMarks(c, face, look, o.state);
  if (!o.shape || o.shape === 'square') return c;
  const out = makeCanvas(size);
  const g = out.getContext('2d')!;
  shapePath(g, o.shape, size);
  g.clip();
  g.drawImage(c, 0, 0);
  return out;
}

/**
 * One face as SVG markup. The original watercolour is real vector paths (pen
 * lines, hatching, shapes) with its glazes embedded; every other style is built
 * from pixels, dots and tiles, so its SVG wraps the picture.
 */
export function faceSVG(name: FaceName, o: StillOptions = {}): string {
  const size = sizeOf(o.size);
  const look = resolveLook(o.look, size);
  const inner = look === 'watercolour'
    ? watercolourSVG(inState(name, o.state), size, o.state)
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image width="${size}" height="${size}" href="${faceCanvas(name, { ...o, shape: 'square' }).toDataURL('image/png')}"/></svg>`;
  if (!o.shape || o.shape === 'square') return inner;
  const id = `fuglio-${seedOf(name).toString(36)}-${o.shape}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><clipPath id="${id}"><path d="${shapeD(o.shape, size)}"/></clipPath></defs><g clip-path="url(#${id})">${inner}</g></svg>`;
}

/** A state's marks (a thought cloud, a red !, sparkles) by the head, drawn onto a finished still. */
function drawStateMarks(c: HTMLCanvasElement, face: Face, look: LookId, state: FaceState | undefined) {
  const marks = state && state !== 'idle' ? marksFor(look, face, c.width) : null;
  if (marks) drawMarks(c.getContext('2d')!, face, state!, marks, 0, true);
  return marks !== null;
}

/** The watercolour as vector paths, with the state's marks laid over it as a picture: they're drawn for canvas, not as paths. */
function watercolourSVG(face: Face, size: number, state: FaceState | undefined): string {
  const svg = faceToSVG(face, getEngine(), size);
  const marks = makeCanvas(size);
  if (!drawStateMarks(marks, face, 'watercolour', state)) return svg;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svg}<image width="${size}" height="${size}" href="${marks.toDataURL('image/png')}"/></svg>`;
}

/** The colours a face is painted in, for theming whatever sits around it (a chat bubble, a name tag). */
export function faceColors(name: FaceName): Palette {
  return { ...faceOf(name).pal };
}

/** Traces a crop shape on a canvas, ready to clip or fill. */
export function shapePath(g: CanvasRenderingContext2D, shape: Shape, size: number) {
  g.beginPath();
  if (shape === 'circle') g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  else if (shape === 'rounded') g.roundRect(0, 0, size, size, size * 0.16);
  else if (shape === 'squircle') for (const [i, q] of squircle(size).entries()) i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]);
  else g.rect(0, 0, size, size);
  g.closePath();
}

function shapeD(shape: Shape, size: number): string {
  const r = size / 2;
  if (shape === 'circle') return `M0 ${r}a${r} ${r} 0 1 0 ${size} 0a${r} ${r} 0 1 0 ${-size} 0Z`;
  if (shape === 'rounded') {
    const k = size * 0.16;
    return `M${k} 0H${size - k}Q${size} 0 ${size} ${k}V${size - k}Q${size} ${size} ${size - k} ${size}H${k}Q0 ${size} 0 ${size - k}V${k}Q0 0 ${k} 0Z`;
  }
  if (shape === 'squircle') return `M${squircle(size).map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L')}Z`;
  return `M0 0H${size}V${size}H0Z`;
}

/** A superellipse (|x|⁴ + |y|⁴ = 1): the soft square of app icons. */
function squircle(size: number): [number, number][] {
  const r = size / 2;
  return Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    return [r + Math.sign(c) * Math.sqrt(Math.abs(c)) * r, r + Math.sign(s) * Math.sqrt(Math.abs(s)) * r] as [number, number];
  });
}
