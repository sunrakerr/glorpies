import type { EyePose } from './alive';
import type { Pose } from './face/render';
import type { Face } from './face/types';
import { clamp, TAU, type Pt } from './geometry';
import { hash01 } from './raster';

/** What a face shows besides who it is: an agent's status, in its eyes, blinks, breathing and sway. */
export const STATES = ['idle', 'thinking', 'working', 'waiting', 'blocked', 'done'] as const;
export type FaceState = (typeof STATES)[number];

export const isState = (s: unknown): s is FaceState => typeof s === 'string' && (STATES as readonly string[]).includes(s);

export type Behaviour = {
  /** Where glances centre (null: the face's own resting gaze), how far they stray, and seconds between them. */
  gaze: Pt | null;
  spread: Pt;
  every: [number, number];
  /** Whether the eyes follow a pointer that's moving nearby. */
  follow: boolean;
  /** Multiplies the time between blinks. */
  blinks: number;
  /** How open the eyes are kept: 1 is wide, below 0.5 a contented squint. */
  open: number;
  /** Multiplies the breathing period and the sway. */
  breathe: number;
  sway: number;
  /** Seconds between small involuntary wobbles, or 0 for none. */
  nudge: number;
  /** How the head is carried, in face units (the face is 480 across) and radians. */
  body: {
    /** A lean toward the side the face glances. */
    tilt: number;
    /** A steady nod: cycles per second and depth. */
    nod: [number, number];
    /** A little hop every so many seconds, and how high. */
    hop: [number, number];
    /** How far the head sinks. */
    slump: number;
  };
};

const STILL_BODY: Behaviour['body'] = { tilt: 0, nod: [0, 0], hop: [0, 0], slump: 0 };

export const BEHAVIOUR: Record<FaceState, Behaviour> = {
  idle: { gaze: null, spread: { x: 1.4, y: 1 }, every: [0.6, 2.8], follow: true, blinks: 1, open: 1, breathe: 1, sway: 1, nudge: 0, body: STILL_BODY },
  // eyes up and to one side, slower and stiller
  thinking: { gaze: { x: 0.7, y: -0.85 }, spread: { x: 0.3, y: 0.15 }, every: [1.4, 3.2], follow: false, blinks: 1.6, open: 1, breathe: 1.25, sway: 0.5, nudge: 0, body: { tilt: 0.11, nod: [0, 0], hop: [0, 0], slump: 0 } },
  // reading: quick glances along a line below, blinking more
  working: { gaze: { x: 0, y: 0.8 }, spread: { x: 1.3, y: 0.1 }, every: [0.22, 0.5], follow: false, blinks: 0.7, open: 0.85, breathe: 0.8, sway: 0.4, nudge: 0, body: { tilt: 0, nod: [2.4, 4], hop: [0, 0], slump: 3 } },
  // looking straight out at you, a little expectant
  waiting: { gaze: { x: 0, y: 0 }, spread: { x: 0.2, y: 0.12 }, every: [1.5, 3], follow: true, blinks: 1, open: 1, breathe: 1, sway: 1.25, nudge: 0, body: { tilt: 0, nod: [0.9, 5], hop: [0, 0], slump: 0 } },
  // down and away, heavy-lidded, with a frustrated shake now and then
  blocked: { gaze: { x: -0.4, y: 0.7 }, spread: { x: 0.3, y: 0.2 }, every: [1.5, 3], follow: false, blinks: 0.8, open: 0.7, breathe: 1.4, sway: 0.4, nudge: 2.6, body: { tilt: 0, nod: [0, 0], hop: [0, 0], slump: 9 } },
  // a pleased squint and a looser sway
  done: { gaze: { x: 0, y: -0.1 }, spread: { x: 0.4, y: 0.2 }, every: [1, 2.5], follow: true, blinks: 1.3, open: 0.4, breathe: 0.9, sway: 1.4, nudge: 0, body: { tilt: 0, nod: [0, 0], hop: [2.8, 16], slump: 0 } },
};

/** The glance centre for a face in a state; a thinker looks off to whichever side the face already favours. */
export function gazeFor(face: Face, state: FaceState): Pt {
  const g = BEHAVIOUR[state].gaze;
  if (!g) return face.gaze;
  const side = face.gaze.x < 0 ? -1 : 1;
  return { x: state === 'thinking' ? g.x * side : g.x, y: g.y };
}

/** The eyes of a still image in a state: one representative moment. */
export function stillEyes(face: Face, state: FaceState): EyePose {
  const b = BEHAVIOUR[state];
  return { look: state === 'idle' ? null : gazeFor(face, state), blink: b.open };
}

/**
 * A pose with no randomness in it, for animated exports: everything loops
 * exactly every `loop` seconds. Breathing and sway are fitted to the loop, the
 * gaze visits a few points drawn from the seed and eases back to where it
 * started, and there is one blink per loop.
 */
export function scriptedPose(face: Face, state: FaceState, t: number, loop: number): Pose {
  const b = BEHAVIOUR[state];
  const u = (((t % loop) + loop) % loop) / loop;
  const { sway, phase } = face.temper;
  const breath = Math.sin(TAU * u + phase);
  const swing = Math.sin(TAU * u + phase * 1.7);

  const centre = gazeFor(face, state);
  const stops = Math.max(2, Math.min(5, Math.round(loop / ((b.every[0] + b.every[1]) / 2))));
  const at = (k: number): Pt => {
    if (k % stops === 0) return centre;
    const j = k % stops;
    return {
      x: clamp(centre.x + (hash01(face.seed, j * 2) - 0.5) * b.spread.x, -1, 1),
      y: clamp(centre.y + (hash01(face.seed, j * 2 + 1) - 0.5) * b.spread.y, -1, 1),
    };
  };
  // each stop holds, then the eyes move quickly to the next, as saccades do
  const s = u * stops, k = Math.floor(s), f = s - k;
  const ease = f < 0.8 ? 0 : smooth((f - 0.8) / 0.2);
  const from = at(k), to = at(k + 1);
  const look = { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease };

  const bu = (u - 0.62) / (0.18 / loop);
  const blinkCurve = bu < 0 || bu > 1 ? 1 : bu < 0.4 ? 1 - bu / 0.4 : (bu - 0.4) / 0.6;

  // a blocked face shakes its head once per loop: a damped wobble
  let jolt = 0;
  if (b.nudge) {
    const w = (u - 0.2) * loop;
    if (w > 0 && w < 1.2) jolt = Math.sin(w * 18) * Math.exp(-w * 4) * 0.05;
  }

  // nods and hops are fitted to the loop, so the last frame flows into the first
  const fit = (hz: number) => (hz ? Math.max(1, Math.round(hz * loop)) / loop : 0);
  const body = bodyAt(face, state, 0);
  const { nod, hop } = b.body;
  let lift = 0;
  if (nod[0]) lift += Math.sin(u * loop * TAU * fit(nod[0])) * nod[1];
  if (hop[0]) {
    const hu = ((u * loop) % (loop / Math.max(1, Math.round(loop / hop[0])))) / 0.42;
    if (hu < 1) lift -= Math.sin(hu * Math.PI) * hop[1];
  }

  return {
    phase: Math.floor(u * loop * 8),
    rot: ((sway * b.sway * Math.PI) / 180) * swing + jolt + body.rot,
    sx: 1 - 0.008 * breath,
    sy: 1 + 0.012 * breath,
    ty: -1.5 * breath + b.body.slump + lift,
    look,
    blink: blinkCurve * b.open,
    spin: t * 2.4,
    t: t + 1e-3,
  };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** How a state carries the head at time `t`: a lean, a nod, a hop and a slump, added to breathing and sway. */
export function bodyAt(face: Face, state: FaceState, t: number): { rot: number; ty: number } {
  const { tilt, nod, hop, slump } = BEHAVIOUR[state].body;
  const side = face.gaze.x < 0 ? -1 : 1;
  let ty = slump;
  if (nod[0]) ty += Math.sin(t * TAU * nod[0]) * nod[1];
  if (hop[0]) {
    // a quick up-and-down at the start of each period, then rest
    const u = (((t % hop[0]) + hop[0]) % hop[0]) / 0.42;
    if (u < 1) ty -= Math.sin(u * Math.PI) * hop[1];
  }
  return { rot: tilt * side, ty };
}
