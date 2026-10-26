// Runs against the build: `pnpm build && pnpm test`.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { faceOf, LOOKS, seedOf, SHAPES, STATES } from '../dist/index.js';
import { faceGIF, renderImage } from '../dist/server.js';

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

test('the drop-in script stays small', () => {
  const kb = gzipSync(readFileSync(new URL('../dist/cdn/fuglios.js', import.meta.url))).length / 1024;
  assert.ok(kb < 60, `dist/cdn/fuglios.js is ${kb.toFixed(1)} KB gzipped`);
});
