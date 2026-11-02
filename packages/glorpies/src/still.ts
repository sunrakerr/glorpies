import { posed } from './alive';
import { makeCanvas } from './canvas';
import { getEngine } from './engine';
import { cutOut } from './cutout';
import { bareFace, unguided } from './face/bare';
import { renderStill } from './face/render';
import { faceToSVG } from './face/svg';
import { faceMask } from './layers';
import type { Face } from './face/types';
import { isLook, marksFor, renderLook, resolveLook, type LookChoice, type LookId } from './looks';
import { drawMarks } from './marks';
import type { Palette } from './palettes';
import { seedOf, type FaceName } from './seed';
import { isState, stillEyes, type FaceState } from './states';
import { faceFor } from './studio';

/** How a still is cropped. Anything outside the shape is transparent. */
export const SHAPES = ['square', 'rounded', 'squircle', 'circle'] as const;
export type Shape = (typeof SHAPES)[number];

export const isShape = (s: unknown): s is Shape =>
  typeof s === 'string' && (SHAPES as readonly string[]).includes(s);

export type StillOptions = {
  look?: LookChoice;
  /** Width and height in pixels. */
  size?: number;
  state?: FaceState;
  /** Crops the picture; ignored with `background: false`, which leaves nothing around the face to cut. */
  shape?: Shape;
  /**
   * `true` (the default) paints the face on its own paper. `false` keeps only the face: no backdrop,
   * no pencil lines, transparent all around. A colour (`#ffe9a8`, `rgb()`, `hsl()`, a name) puts the
   * face on that colour instead of its paper.
   */
  background?: boolean | string;
};

/** What `background` asks for: the face's own paper, or a colour behind the face (null for none). */
export function backdropOf(background: boolean | string | null | undefined): {
  paper: boolean;
  colour: string | null;
} {
  if (background === false || background === 'false') return { paper: false, colour: null };
  if (
    background === undefined ||
    background === null ||
    background === true ||
    background === '' ||
    background === 'true'
  )
    return { paper: true, colour: null };
  return { paper: false, colour: background };
}

/** A colour as canvas writes it (`#rrggbb` or `rgba(…)`), or null if canvas can't read it. */
export function colourOf(value: string): string | null {
  const g = makeCanvas(1).getContext('2d')!;
  // an unreadable colour leaves fillStyle as it was, so it reads differently after black than after white
  g.fillStyle = '#000000';
  g.fillStyle = value;
  const after = String(g.fillStyle);
  g.fillStyle = '#ffffff';
  g.fillStyle = value;
  return after === String(g.fillStyle) ? after : null;
}

/** The largest still there is: 8192² is already a quarter of a gigabyte of pixels. */
export const MAX_SIZE = 8192;

/** A size in whole pixels, refused unless it's a number from 1 to MAX_SIZE. */
export function sizeOf(size: number | undefined, fallback = 256): number {
  const px = Math.round(size ?? fallback);
  if (!(px >= 1 && px <= MAX_SIZE))
    throw new RangeError(`size must be a number from 1 to ${MAX_SIZE}, not ${size}`);
  return px;
}

/** The options, refused if any is unknown: they end up in markup, so nothing unchecked gets through. */
export function checked<T extends StillOptions>(o: T): T {
  if (o.look !== undefined && o.look !== 'auto' && !isLook(o.look))
    throw new TypeError(`glorpies: unknown look "${String(o.look)}"`);
  if (o.state !== undefined && !isState(o.state))
    throw new TypeError(`glorpies: unknown state "${String(o.state)}"`);
  if (o.shape !== undefined && !isShape(o.shape))
    throw new TypeError(`glorpies: unknown shape "${String(o.shape)}"`);
  const { colour } = backdropOf(o.background);
  if (colour === null) return o;
  // written back as canvas reads it, so what reaches the markup is a plain colour and nothing else
  const plain = colourOf(colour);
  if (!plain) throw new TypeError(`glorpies: unknown background colour "${colour}"`);
  return { ...o, background: plain };
}

/** Ids for an SVG's definitions: the same for the same picture and different for any other, so faces can sit inline side by side. */
function svgIds(name: FaceName, o: StillOptions, size: number): string {
  const { paper, colour } = backdropOf(o.background);
  const ground = colour ? `on${colour.replace(/\W/g, '')}` : paper ? 'paper' : 'bare';
  return [
    'glorpie',
    seedOf(name).toString(36),
    o.look ?? 'auto',
    o.state ?? 'idle',
    o.shape ?? 'square',
    ground,
    size,
  ].join('-');
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
export function faceCanvas(name: FaceName, options: StillOptions = {}): HTMLCanvasElement {
  const o = checked(options);
  const size = sizeOf(o.size);
  const look = resolveLook(o.look, size);
  const face = paintedFace(name, o);
  const { paper, colour } = backdropOf(o.background);
  const E = getEngine();
  let c = renderLook(look, face, E, size);
  if (!paper) c = cutOut(look, face, E, c)?.figure ?? c;
  // marks sit beside the head, so they go on after the cut
  drawStateMarks(c, face, look, o.state);
  if (colour) c = onColour(c, colour);
  if (!(paper || colour) || !o.shape || o.shape === 'square') return c;
  const out = makeCanvas(size);
  const g = out.getContext('2d')!;
  shapePath(g, o.shape, size);
  g.clip();
  g.drawImage(c, 0, 0);
  return out;
}

/** One face as SVG. The watercolour is real vector paths; any other look is a picture wrapped in SVG. */
export function faceSVG(name: FaceName, options: StillOptions = {}): string {
  const o = checked(options);
  const size = sizeOf(o.size);
  const look = resolveLook(o.look, size);
  const ids = svgIds(name, o, size);
  const { paper, colour } = backdropOf(o.background);
  const box = `xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"`;
  let inner =
    look === 'watercolour'
      ? watercolourSVG(paintedFace(name, o), size, o.state, paper, ids)
      : `<svg ${box}><image width="${size}" height="${size}" href="${faceCanvas(name, { ...o, shape: 'square' }).toDataURL('image/png')}"/></svg>`;
  // any other look has its colour painted in already
  if (colour && look === 'watercolour')
    inner = `<svg ${box}><rect width="${size}" height="${size}" fill="${colour}"/>${inner}</svg>`;
  if (!(paper || colour) || !o.shape || o.shape === 'square') return inner;
  const id = `${ids}-shape`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><clipPath id="${id}"><path d="${shapeD(o.shape, size)}"/></clipPath></defs><g clip-path="url(#${id})">${inner}</g></svg>`;
}

/** A state's marks (a thought cloud, a red !, sparkles) by the head, drawn onto a finished still. */
function drawStateMarks(
  c: HTMLCanvasElement,
  face: Face,
  look: LookId,
  state: FaceState | undefined,
) {
  const marks = state && state !== 'idle' ? marksFor(look, face, c.width) : null;
  if (marks) drawMarks(c.getContext('2d')!, face, state!, marks, 0, true);
}

/** The face as painted for these options: in its state's expression, and without its pencil lines when it's off its paper. */
function paintedFace(name: FaceName, o: StillOptions): Face {
  const face = inState(name, o.state);
  return backdropOf(o.background).paper ? face : unguided(face);
}

/** A face lifted off its paper, laid on a colour. */
function onColour(c: HTMLCanvasElement, colour: string): HTMLCanvasElement {
  const out = makeCanvas(c.width, c.height);
  const g = out.getContext('2d')!;
  g.fillStyle = colour;
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(c, 0, 0);
  return out;
}

/** Up to this size, a vector face's cut is worked out from a painting of it; it's a soft edge, so it needn't be sharper. */
const SVG_CUT_PX = 512;

/**
 * The watercolour as vector paths, with the state's marks laid over it as a
 * picture: they're drawn for canvas, not as paths. Off its background, the
 * paths stay vector under a soft mask of the face, painted white so it reads
 * the same as an alpha or a luminance mask.
 */
function watercolourSVG(
  face: Face,
  size: number,
  state: FaceState | undefined,
  background: boolean,
  ids: string,
): string {
  const E = getEngine();
  let svg = faceToSVG(face, E, size, ids);
  if (!background) {
    const m = Math.min(size, SVG_CUT_PX);
    const cut = faceMask(renderStill(face, E, m), renderStill(bareFace(face), E, m), true);
    if (cut) {
      const g = cut.mask.getContext('2d')!;
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, m, m);
      const id = `${ids}-cut`;
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}"><image width="${size}" height="${size}" href="${cut.mask.toDataURL('image/png')}"/></mask></defs><g mask="url(#${id})">${svg}</g></svg>`;
    }
  }
  if (!state || state === 'idle') return svg;
  const marks = makeCanvas(size);
  drawStateMarks(marks, face, 'watercolour', state);
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
  else if (shape === 'squircle') {
    for (const [i, q] of squircle(size).entries()) {
      if (i) g.lineTo(q[0], q[1]);
      else g.moveTo(q[0], q[1]);
    }
  } else g.rect(0, 0, size, size);
  g.closePath();
}

function shapeD(shape: Shape, size: number): string {
  const r = size / 2;
  if (shape === 'circle') return `M0 ${r}a${r} ${r} 0 1 0 ${size} 0a${r} ${r} 0 1 0 ${-size} 0Z`;
  if (shape === 'rounded') {
    const k = size * 0.16;
    return `M${k} 0H${size - k}Q${size} 0 ${size} ${k}V${size - k}Q${size} ${size} ${size - k} ${size}H${k}Q0 ${size} 0 ${size - k}V${k}Q0 0 ${k} 0Z`;
  }
  if (shape === 'squircle')
    return `M${squircle(size)
      .map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`)
      .join('L')}Z`;
  return `M0 0H${size}V${size}H0Z`;
}

/** A superellipse (|x|⁴ + |y|⁴ = 1): the soft square of app icons. */
function squircle(size: number): [number, number][] {
  const r = size / 2;
  return Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2,
      c = Math.cos(a),
      s = Math.sin(a);
    return [
      r + Math.sign(c) * Math.sqrt(Math.abs(c)) * r,
      r + Math.sign(s) * Math.sqrt(Math.abs(s)) * r,
    ] as [number, number];
  });
}
