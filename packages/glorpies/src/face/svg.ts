import { makeCanvas } from '../canvas';
import type { Engine } from '../engine';
import { pathData, ribbon, type Pt } from '../geometry';
import { eyeState } from './eyes';
import { paintPaper, resolveColor, VIGNETTE, type Sheet } from './render';
import { hatchLines, inkRibbons } from './strokes';
import type { Face, Op } from './types';
import { W } from './types';
import { rasterizeWash } from './wash';

/** Glazes are raster by nature, so they're embedded near the resolution the SVG is shown at, with a cap. */
const GLAZE_SCALE = 1.6;
const PAPER_SCALE = 2;
const rasterScale = (sizePx: number, cap: number) => Math.min(cap, Math.max(0.3, (sizePx / W) * 1.25));

const num = (n: number) => String(Math.round(n * 100) / 100);
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * The same painting as the canvas, as SVG: every pen line, hatch and solid is
 * a vector path; watercolour glazes and the paper are embedded images placed
 * with the same clips and multiply blending.
 */
export function faceToSVG(face: Face, E: Engine, sizePx = 1024, prefix = 'glorpie'): string {
  E.noiseSeed(face.seed);
  const glaze = rasterScale(sizePx, GLAZE_SCALE), paper = rasterScale(sizePx, PAPER_SCALE);
  const defs: string[] = [];
  let ids = 0;

  const clipId = (pts: Pt[], evenodd: boolean) => {
    const id = `${prefix}-c${ids++}`;
    const d = evenodd ? `M${-W} ${-W}H${2 * W}V${2 * W}H${-W}Z${pathData(pts)}` : pathData(pts);
    defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${d}"${evenodd ? ' clip-rule="evenodd"' : ''}/></clipPath>`);
    return id;
  };
  /** Clips nest as groups; a blend mode must sit on the outermost one or the clip group isolates it. */
  const wrap = (inner: string, clip?: Pt[], exclude?: Pt[][], blend?: string) => {
    const groups = [...(clip ? [clipId(clip, false)] : []), ...(exclude ?? []).map((ex) => clipId(ex, true))];
    if (!groups.length) return blend ? `<g style="mix-blend-mode:${blend}">${inner}</g>` : inner;
    let out = inner;
    groups.reverse().forEach((id, i) => {
      const style = blend && i === groups.length - 1 ? ` style="mix-blend-mode:${blend}"` : '';
      out = `<g clip-path="url(#${id})"${style}>${out}</g>`;
    });
    return out;
  };
  const image = (canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number, type = 'image/png') =>
    `<image x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" preserveAspectRatio="none" href="${canvas.toDataURL(type, 0.9)}"/>`;
  const fill = (d: string, col: string, a: number) => `<path d="${d}" fill="${col}" fill-opacity="${num(a)}"/>`;

  const play = (ops: Op[], sheet: Sheet) =>
    ops.map((op) => {
      const col = (c: string) => resolveColor(c, face.pal, sheet);
      if (op.k === 'paper') {
        const c = makeCanvas(W * paper);
        const ctx = c.getContext('2d')!;
        ctx.scale(paper, paper);
        paintPaper(ctx, face.pal, op.seed, E);
        return image(c, 0, 0, W, W, 'image/jpeg');
      }
      if (op.k === 'wash') {
        const r = rasterizeWash(op, col(op.col), E, glaze);
        return wrap(image(r.canvas, r.x, r.y, r.w, r.h), op.clip, op.exclude, 'multiply');
      }
      if (op.k === 'ink') {
        const paths = inkRibbons(op, E, 0).map((r) => fill(pathData(r.pts), col(op.col), r.alpha)).join('');
        return wrap(paths, op.clip);
      }
      if (op.k === 'hatch') {
        const c = col(op.col);
        const lines = hatchLines(op, E)
          .map((l) => `<path d="${pathData(l.pts, false)}" stroke-width="${num(l.w)}"/>`)
          .join('');
        return wrap(`<g fill="none" stroke="${c}" stroke-opacity="${num(op.alpha)}" stroke-linecap="round">${lines}</g>`, op.region, op.exclude);
      }
      return wrap(fill(pathData(op.pts), col(op.col), op.alpha), op.clip);
    }).join('');

  const backdrop = play(face.back, 'back');
  const figure = play(face.figure, 'figure');

  const eyes = face.eyes.map((spec) => {
    const st = eyeState(spec, face.gaze, 1);
    let out = '';
    if (spec.iris) {
      const r = rasterizeWash(spec.iris, spec.iris.col, E, glaze * 1.5);
      out += wrap(image(r.canvas, r.x + st.dx, r.y + st.dy, r.w, r.h), spec.clip, undefined, 'multiply');
    }
    let inner = '';
    if (spec.spiral) {
      const d = inkRibbons(spec.spiral, E, 0).map((r) => pathData(r.pts)).join('');
      inner += `<path transform="translate(${num(spec.x)} ${num(spec.y)})" d="${d}" fill="${face.pal.ink}" fill-opacity="0.9"/>`;
    } else {
      inner += `<g transform="translate(${num(st.dx)} ${num(st.dy)})">${fill(pathData(spec.pupil), face.pal.ink, 0.95)}${fill(pathData(spec.highlight), face.pal.paper, 0.95)}</g>`;
    }
    if (st.lid) inner += fill(pathData(st.lid), spec.lidCol, 1);
    out += wrap(inner, spec.clip);
    if (st.line) out += fill(pathData(ribbon(st.line.pts, st.line.widths)), face.pal.ink, 0.9);
    return out;
  }).join('');

  defs.push(
    `<radialGradient id="${prefix}-vignette" gradientUnits="userSpaceOnUse" cx="${W / 2}" cy="${W / 2}" r="${W * VIGNETTE.outer}">` +
      `<stop offset="${VIGNETTE.inner / VIGNETTE.outer}" stop-color="#ffffff" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="${VIGNETTE.color}" stop-opacity="${VIGNETTE.alpha}"/></radialGradient>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${sizePx}" height="${sizePx}">`,
    `<title>${attr(`Face ${face.seed.toString(36)}`)}</title>`,
    `<defs>${defs.join('')}</defs>`,
    `<g>${backdrop}</g>`,
    `<g style="isolation:isolate;mix-blend-mode:multiply">${figure}</g>`,
    `<g>${eyes}</g>`,
    `<rect width="${W}" height="${W}" fill="url(#${prefix}-vignette)" style="mix-blend-mode:multiply"/>`,
    `</svg>`,
  ].join('');
}
