// Runs against the build: `pnpm build && pnpm test`.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { faceOf, LOOKS, randomName, seedOf, SHAPES, STATES } from '../dist/index.js';
import { animationFrames, createFaceHandler, faceGIF, FRAME_BUDGET, renderImage } from '../dist/server.js';

/**
 * Seeds and fingerprints of the painting each name is built into (everything
 * but the sketch, which is bookkeeping about the painting). These are the
 * public contract: if one changes, every face with that name changes too.
 * Recorded when the faces became aliens (the p5 port itself was verified
 * pixel-identical to p5).
 */
const KNOWN = {
  'agent-47': [2032515433, '55a1912a8fae05cb'],
  'ada@lovelace.dev': [1057956733, 'ee55faaa1809844c'],
  'research-bot': [1919146844, 'cb1a47cb96c3c27b'],
  '': [725515276, '7d147c372858ed4b'],
  'ünïcödé 🙂': [1291488839, '408cf6b629f0dc33'],
};

const fingerprint = ({ sketch, ...painting }) => createHash('sha256').update(JSON.stringify(painting)).digest('hex').slice(0, 16);

test('a name always maps to the same seed', () => {
  for (const [name, [seed]] of Object.entries(KNOWN)) assert.equal(seedOf(name), seed, name);
  assert.equal(seedOf(123456), 123456, 'a seed number passes through');
});

test('a made-up name is two words and a hyphen', () => {
  for (let i = 0; i < 200; i++) assert.match(randomName(), /^[a-z]+-[a-z]+$/);
  assert.equal(randomName(() => 0), 'soggy-glorp', 'the words come from the source of numbers given');
});

test('a name is always built into the same face', () => {
  for (const [name, [, print]] of Object.entries(KNOWN)) assert.equal(fingerprint(faceOf(name)), print, name);
});

test('a state reshapes the mouth and brows, and nothing else', () => {
  const idle = faceOf('agent-47');
  const { mouth, brows } = idle.sketch.ops;
  const ours = new Set();
  for (const [a, b] of [mouth, ...brows]) for (let i = a; i < b; i++) ours.add(i);
  for (const state of STATES.filter((s) => s !== 'idle')) {
    const f = faceOf('agent-47', state);
    assert.equal(f.figure.length, idle.figure.length, state);
    let changed = 0;
    f.figure.forEach((op, i) => {
      const same = JSON.stringify(op) === JSON.stringify(idle.figure[i]);
      if (!same) changed++;
      if (!ours.has(i)) assert.ok(same, `${state} touched op ${i}`);
    });
    assert.ok(changed > 0, `${state} changed nothing`);
    assert.deepEqual(f.back, idle.back);
  }
  assert.equal(faceOf('agent-47', 'done'), faceOf('agent-47', 'done'), 'expressions are cached');
});

const PNG = [0x89, 0x50, 0x4e, 0x47];

test('every look paints on a server', async () => {
  for (const look of LOOKS) {
    const { body, type } = await renderImage('agent-47', { look: look.id, size: 96 });
    assert.equal(type, 'image/png', look.id);
    assert.deepEqual([...body.slice(0, 4)], PNG, look.id);
  }
});

test('every state and shape paints, in every format', async () => {
  for (const state of STATES) for (const shape of SHAPES) {
    const { body } = await renderImage('research-bot', { look: 'ink', size: 64, state, shape, format: 'webp' });
    assert.ok(body.length > 200, `${state} ${shape}`);
  }
  const svg = await renderImage('agent-47', { format: 'svg', size: 128 });
  assert.match(svg.body, /^<svg /);
});

test('an animated face loops and actually moves', () => {
  const gif = faceGIF('agent-47', { look: 'ink', size: 64, loop: 2, fps: 10, state: 'working' });
  assert.equal(Buffer.from(gif.slice(0, 6)).toString(), 'GIF89a');
  // a graphic control extension per frame, one per frame of the loop
  let frames = 0;
  for (let i = 0; i < gif.length - 1; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xf9) frames++;
  assert.equal(frames, 20);
});

test('a watercolour svg keeps its state marks', async () => {
  const idle = await renderImage('agent-47', { format: 'svg', size: 128 });
  const blocked = await renderImage('agent-47', { format: 'svg', size: 128, state: 'blocked' });
  const images = (svg) => svg.split('<image').length - 1;
  assert.equal(images(blocked.body), images(idle.body) + 1, 'the red ! is laid over the painting');
});

test('a loop stays inside its budget, and nonsense is refused', async () => {
  const { frames, size, loop } = animationFrames('agent-47', { look: 'ink', size: 400, loop: 10, fps: 30 });
  assert.ok(frames.length * size * size <= FRAME_BUDGET, 'frames are dropped to fit');
  assert.equal(loop, 10, 'the loop keeps its length');
  for (const o of [{ loop: Infinity }, { loop: 0 }, { fps: Number.NaN }, { size: 1e9 }, { size: 8192, loop: 0.001 }]) assert.throws(() => animationFrames('agent-47', o), RangeError);
});

test('a gif lasts as long as its loop', () => {
  // each frame's delay sits in a graphics control extension: 21 f9 04 <flags> <delay lo> <delay hi>
  const centiseconds = (gif) => {
    let total = 0;
    for (let i = 0; i < gif.length - 5; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 4) total += gif[i + 4] | (gif[i + 5] << 8);
    return total;
  };
  for (const fps of [15, 30]) assert.equal(centiseconds(faceGIF('agent-47', { look: 'ink', size: 48, loop: 3, fps })), 300, `${fps} fps`);
});

test('the image handler refuses what it should and hardens svg', async () => {
  const get = (q) => createFaceHandler()(new Request(`http://x/api/face?${q}`));
  assert.equal((await get('')).status, 400);
  assert.equal((await get(`name=${'a'.repeat(300)}`)).status, 414);
  const svg = await get('name=agent-47&format=svg&size=64');
  assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
  assert.match(svg.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(svg.headers.get('x-content-type-options'), 'nosniff');
});

test('the drop-in script stays small', () => {
  const kb = gzipSync(readFileSync(new URL('../dist/cdn/fuglios.js', import.meta.url))).length / 1024;
  assert.ok(kb < 60, `dist/cdn/fuglios.js is ${kb.toFixed(1)} KB gzipped`);
});
