import type { Face, Op, Sketch } from './face/types';
import type { Pt } from './geometry';
import type { FaceState } from './states';

/**
 * A state changes the face itself, not only how it moves: the mouth bends
 * into a smile or a frown, narrows or widens, and the brows lift, drop or
 * knit. The face's own strokes are reshaped (the ops that drew the mouth and
 * each brow, recorded in its sketch), so every look paints the expression in
 * its own hand, with the same wobble.
 */

type Brow = { lift: number; tilt: number };

type Expression = {
  mouth: {
    /** Target curve at the middle, as a share of the mouth's half-width: up is a smile, down a frown. */
    bend: number;
    width: number;
    height: number;
    /** Sideways, as a share of the half-width, toward the side the face glances (a thinking pout). */
    shift: number;
  };
  /** `near` is the brow on the side the face glances toward. Lift is in brow-heights, tilt in radians (inner end down). */
  brows: { near: Brow; far: Brow };
};

const EXPRESSIONS: Record<Exclude<FaceState, 'idle'>, Expression> = {
  // a small sideways pout under one quizzically raised brow
  thinking: { mouth: { bend: 0.02, width: 0.5, height: 0.55, shift: 0.45 }, brows: { near: { lift: 0.75, tilt: -0.28 }, far: { lift: -0.1, tilt: 0.12 } } },
  // a flat, set mouth and brows drawn down in concentration
  working: { mouth: { bend: 0, width: 0.75, height: 0.45, shift: 0 }, brows: { near: { lift: -0.25, tilt: 0.18 }, far: { lift: -0.25, tilt: 0.18 } } },
  // brows up, a hopeful little smile
  waiting: { mouth: { bend: 0.2, width: 0.8, height: 0.8, shift: 0 }, brows: { near: { lift: 0.6, tilt: -0.12 }, far: { lift: 0.6, tilt: -0.12 } } },
  // knitted brows and a clear frown
  blocked: { mouth: { bend: -0.42, width: 0.9, height: 0.6, shift: 0 }, brows: { near: { lift: -0.2, tilt: 0.5 }, far: { lift: -0.2, tilt: 0.5 } } },
  // a wide smile under lifted brows
  done: { mouth: { bend: 0.55, width: 1.12, height: 1.1, shift: 0 }, brows: { near: { lift: 0.4, tilt: -0.08 }, far: { lift: 0.4, tilt: -0.08 } } },
};

const cache = new WeakMap<Face, Map<FaceState, Face>>();

/** The face wearing a state's expression; idle is the face as painted. Cached, so asking again is free. */
export function expressed(face: Face, state: FaceState = 'idle'): Face {
  if (state === 'idle') return face;
  let byState = cache.get(face);
  if (!byState) cache.set(face, (byState = new Map()));
  let f = byState.get(state);
  if (!f) byState.set(state, (f = reshape(face, EXPRESSIONS[state])));
  return f;
}

function reshape(face: Face, x: Expression): Face {
  const k = face.sketch;
  const figure = face.figure.slice();
  const remap = ([from, to]: [number, number], warp: (p: Pt) => Pt) => {
    for (let i = from; i < to; i++) figure[i] = warpOp(figure[i]!, warp);
  };

  const mouthWarp = mouthWarpFor(face, x.mouth);
  remap(k.ops.mouth, mouthWarp);

  const side = face.gaze.x < 0 ? -1 : 1;
  const unit = k.rx * 0.13;
  const browWarps = k.brows.map((b) => {
    const mid = b[Math.floor(b.length / 2)]!;
    const s = Math.sign(mid.x - k.centre.x) || 1;
    const { lift, tilt } = s === side ? x.brows.near : x.brows.far;
    // turning clockwise lowers the inner end of a left brow, anticlockwise that of a right one
    const a = -s * tilt, c = Math.cos(a), sn = Math.sin(a);
    return (p: Pt): Pt => {
      const dx = p.x - mid.x, dy = p.y - mid.y;
      return { x: mid.x + dx * c - dy * sn, y: mid.y + dx * sn + dy * c - lift * unit };
    };
  });
  k.ops.brows.forEach((range, i) => remap(range, browWarps[i]!));

  const sketch: Sketch = {
    ...k,
    brows: k.brows.map((b, i) => b.map(browWarps[i]!)),
    mouth: { ...k.mouth, line: k.mouth.line.map(mouthWarp), shape: k.mouth.shape?.map(mouthWarp) ?? null },
  };
  return { ...face, figure, sketch };
}

/**
 * Bends the mouth to the target curve, whatever curve it was drawn with: a
 * frown can become a smile. Everything drawn with the mouth (teeth, the dark
 * inside, the blush beneath) bends with it.
 */
function mouthWarpFor(face: Face, m: Expression['mouth']): (p: Pt) => Pt {
  const { x: mx, y: my, w: mw, line } = face.sketch.mouth;
  const side = face.gaze.x < 0 ? -1 : 1;
  // how much the drawn line already curves at its middle, measured against the line between its ends
  let sag = 0;
  if (line.length > 2) {
    const a = line[0]!, b = line[line.length - 1]!, mid = line[Math.floor(line.length / 2)]!;
    sag = (mid.y - (a.y + b.y) / 2) * m.height;
  }
  const extra = m.bend * mw - sag;
  return (p) => {
    const u = Math.max(-1, Math.min(1, (p.x - mx) / (mw * 1.25)));
    return {
      x: mx + (p.x - mx) * m.width + m.shift * mw * side,
      y: my + (p.y - my) * m.height + extra * (1 - u * u),
    };
  };
}

function warpOp(op: Op, warp: (p: Pt) => Pt): Op {
  const pts = (ps: Pt[]) => ps.map(warp);
  switch (op.k) {
    case 'paper':
      return op;
    case 'hatch':
      return { ...op, region: pts(op.region), exclude: op.exclude.map(pts) };
    default:
      return { ...op, pts: pts(op.pts), clip: op.clip && pts(op.clip), exclude: 'exclude' in op && op.exclude ? op.exclude.map(pts) : undefined } as Op;
  }
}
