// Runs against the build: `pnpm build && pnpm test`. GLORPIES_RECORD=1 records this platform's pixel fixtures.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  faceCanvas,
  faceSVG,
  FACES,
  LOOKS,
  randomName,
  seedOf,
  SHAPES,
  STATES,
} from '../dist/index.js';
import { faceOf } from '../dist/testing.js';
import {
  animationFrames,
  createFaceHandler,
  faceGIF,
  FRAME_BUDGET,
  renderImage,
  useNativeCanvas,
} from '../dist/server.js';

/**
 * Seeds and fingerprints of the face each name is built into: the painting,
 * and the sketch the avatar looks redraw it from. These are the public
 * contract: if one changes, every face with that name changes too.
 */
const KNOWN = {
  'agent-47': [1179788404427480, 'd7614fa4f301ff1f'],
  'ada@lovelace.dev': [816544292710256, '8710395f0d8b8357'],
  'research-bot': [4219008871287063, 'bc52ae628fc1eb57'],
  '': [3338908027751811, 'f4ce93dd5d0126cf'],
  'ünïcödé 🙂': [7080240272725757, '58649bc3e9562def'],
};

// Math.sin, exp and friends differ in the last bits between arm64 and x64, so coordinates are compared to a millionth of a pixel.
const toMillionths = (_, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const fingerprint = (face) =>
  createHash('sha256').update(JSON.stringify(face, toMillionths)).digest('hex').slice(0, 16);

test('a name always maps to the same seed', () => {
  for (const [name, [seed]] of Object.entries(KNOWN)) assert.equal(seedOf(name), seed, name);
  assert.equal(seedOf(123456), 123456, 'a seed number passes through');
});

test('a made-up name is two words and a hyphen', () => {
  for (let i = 0; i < 200; i++) assert.match(randomName(), /^[a-z]+-[a-z]+$/);
  assert.equal(
    randomName(() => 0),
    'soggy-glorp',
    'the words come from the source of numbers given',
  );
});

test('every bit of a seed counts: there are 9 quadrillion faces', () => {
  assert.equal(FACES, 9007199254740992);
  for (const [name] of Object.entries(KNOWN))
    assert.ok(seedOf(name) < FACES && Number.isSafeInteger(seedOf(name)));
  // seeds that differ only above the low 32 bits are different faces (a 32-bit generator would make them twins)
  assert.notEqual(fingerprint(faceOf(5)), fingerprint(faceOf(5 + 2 ** 32)));
  assert.notEqual(fingerprint(faceOf(5)), fingerprint(faceOf(5 + 2 ** 52)));
});

test('a name is always built into the same face', () => {
  for (const [name, [, print]] of Object.entries(KNOWN))
    assert.equal(fingerprint(faceOf(name)), print, name);
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
const MAGIC = {
  png: [0x89, 0x50, 0x4e, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46],
  jpeg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38],
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const pixelsOf = (canvas) =>
  canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;

test('every look paints on a server', async () => {
  for (const look of LOOKS) {
    const { body, type } = await renderImage('agent-47', { look: look.id, size: 96 });
    assert.equal(type, 'image/png', look.id);
    assert.deepEqual([...body.slice(0, 4)], PNG, look.id);
  }
});

/**
 * Every look's pixels, and an animation's frames, for a few names, sizes,
 * backgrounds and states. Native canvases anti-alias a little differently on
 * each platform, so each platform keeps its own fixtures.
 */
const FIXTURES = new URL('./fixtures/pixels.json', import.meta.url);
const PLATFORM = `${process.platform}-${process.arch}`;

async function pixelPrints() {
  await useNativeCanvas();
  const prints = {};
  for (const look of LOOKS) {
    const h = createHash('sha256');
    for (const name of ['agent-47', 'ünïcödé 🙂', 42])
      for (const size of [40, 200])
        for (const background of [true, false]) {
          h.update(
            pixelsOf(
              faceCanvas(name, {
                look: look.id,
                size,
                background,
                state: size === 40 ? 'blocked' : 'idle',
                shape: 'squircle',
              }),
            ),
          );
        }
    prints[look.id] = h.digest('hex').slice(0, 16);
  }
  const loop = await animationFrames('agent-47', { size: 64, loop: 1, fps: 8, state: 'thinking' });
  prints['animation'] = sha(Buffer.concat(loop.frames.map((f) => Buffer.from(f))));
  return prints;
}

test('every look paints exactly what it painted before', async (t) => {
  const all = JSON.parse(readFileSync(FIXTURES, 'utf8'));
  const prints = await pixelPrints();
  if (process.env.GLORPIES_RECORD) {
    writeFileSync(FIXTURES, `${JSON.stringify({ ...all, [PLATFORM]: prints }, null, 2)}\n`);
    return t.diagnostic(`recorded fixtures for ${PLATFORM}`);
  }
  if (!all[PLATFORM]) {
    t.diagnostic(`no fixtures for ${PLATFORM} yet; to record them: ${JSON.stringify(prints)}`);
    return t.skip(`no fixtures for ${PLATFORM}`);
  }
  // every look at once, so one run shows all that changed and what they paint now
  const now = Object.fromEntries(Object.keys(all[PLATFORM]).map((id) => [id, prints[id]]));
  assert.deepEqual(
    now,
    all[PLATFORM],
    'some looks paint differently; if that is intended, record them again with GLORPIES_RECORD=1',
  );
});

test('every state and shape paints, in every format', async () => {
  for (const state of STATES)
    for (const shape of SHAPES) {
      const { body } = await renderImage('research-bot', {
        look: 'ink',
        size: 64,
        state,
        shape,
        format: 'webp',
      });
      assert.deepEqual([...body.slice(0, 4)], MAGIC.webp, `${state} ${shape}`);
    }
  for (const format of ['png', 'webp', 'jpeg', 'gif']) {
    const { body } = await renderImage('agent-47', { look: 'ink', size: 48, format });
    assert.deepEqual([...body.slice(0, MAGIC[format].length)], MAGIC[format], format);
  }
  const svg = await renderImage('agent-47', { format: 'svg', size: 128 });
  assert.match(svg.body, /^<svg /);
});

test('an animated face loops, and its frames differ', async () => {
  const gif = await faceGIF('agent-47', {
    look: 'ink',
    size: 64,
    loop: 2,
    fps: 10,
    state: 'working',
  });
  assert.equal(Buffer.from(gif.slice(0, 6)).toString(), 'GIF89a');
  // a graphic control extension per frame, one per frame of the loop
  let count = 0;
  for (let i = 0; i < gif.length - 1; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xf9) count++;
  assert.equal(count, 20);
  const { frames } = await animationFrames('agent-47', {
    look: 'ink',
    size: 64,
    loop: 2,
    fps: 10,
    state: 'working',
  });
  assert.ok(
    new Set(frames.map((f) => sha(f))).size > frames.length / 2,
    'most frames are different pictures',
  );
});

test('a watercolour svg keeps its state marks', async () => {
  const idle = await renderImage('agent-47', { format: 'svg', size: 128 });
  const blocked = await renderImage('agent-47', { format: 'svg', size: 128, state: 'blocked' });
  const images = (svg) => svg.split('<image').length - 1;
  assert.equal(images(blocked.body), images(idle.body) + 1, 'the red ! is laid over the painting');
});

test('svgs of different faces can sit inline together', async () => {
  await useNativeCanvas();
  const ids = (svg) => new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const a = ids(faceSVG('agent-47', { look: 'watercolour', size: 64 }));
  const b = ids(faceSVG('agent-47', { look: 'watercolour', size: 64, state: 'done' }));
  const c = ids(faceSVG('ada@lovelace.dev', { look: 'watercolour', size: 64, shape: 'circle' }));
  assert.ok(a.size > 0);
  for (const id of a) assert.ok(!b.has(id) && !c.has(id), `${id} is shared`);
  assert.deepEqual(
    ids(faceSVG('agent-47', { look: 'watercolour', size: 64 })),
    a,
    'the same picture keeps its ids',
  );
  // two pictures whose ids once collided, when the options were hashed
  const p = ids(
    faceSVG('agent-47', { look: 'watercolour', state: 'idle', shape: 'squircle', size: 836 }),
  );
  const q = ids(
    faceSVG('agent-47', { look: 'watercolour', state: 'thinking', shape: 'rounded', size: 133 }),
  );
  for (const id of p) assert.ok(!q.has(id), `${id} is shared`);
});

test('unknown options are refused before they reach any markup', () => {
  assert.throws(() => faceSVG('agent-47', { shape: '"><script>alert(1)</script>' }), TypeError);
  assert.throws(() => faceCanvas('agent-47', { look: 'nope' }), TypeError);
  assert.throws(() => faceCanvas('agent-47', { state: 'sleepy' }), TypeError);
});

test('a loop stays inside its budget, and nonsense is refused', async () => {
  const { frames, size, loop } = await animationFrames('agent-47', {
    look: 'ink',
    size: 400,
    loop: 10,
    fps: 30,
  });
  assert.ok(frames.length * size * size <= FRAME_BUDGET, 'frames are dropped to fit');
  assert.equal(loop, 10, 'the loop keeps its length');
  for (const o of [
    { loop: Infinity },
    { loop: 0 },
    { fps: Number.NaN },
    { size: 1e9 },
    { size: 8192, loop: 0.001 },
  ])
    await assert.rejects(animationFrames('agent-47', o), RangeError);
});

test('a gif lasts as long as its loop', async () => {
  // each frame's delay sits in a graphics control extension: 21 f9 04 <flags> <delay lo> <delay hi>
  const centiseconds = (gif) => {
    let total = 0;
    for (let i = 0; i < gif.length - 5; i++)
      if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 4)
        total += gif[i + 4] | (gif[i + 5] << 8);
    return total;
  };
  for (const fps of [15, 30])
    assert.equal(
      centiseconds(await faceGIF('agent-47', { look: 'ink', size: 48, loop: 3, fps })),
      300,
      `${fps} fps`,
    );
});

test('the image handler refuses what it should and hardens svg', async () => {
  const get = (q, o) => createFaceHandler(o)(new Request(`http://x/api/face?${q}`));
  assert.equal((await get('')).status, 400);
  assert.equal((await get(`name=${'a'.repeat(300)}`)).status, 414);
  const svg = await get('name=agent-47&format=svg&size=64');
  assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
  assert.match(svg.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(svg.headers.get('x-content-type-options'), 'nosniff');
  assert.throws(() => createFaceHandler({ maxSize: 8 }), RangeError);
});

test('maxSize holds for the defaults too, not only for what a request asks', async () => {
  const sized = async (q, o) => {
    const res = await createFaceHandler(o)(new Request(`http://x/api/face?${q}`));
    return Buffer.from(await res.arrayBuffer()).readUInt32BE(16);
  };
  assert.equal(await sized('name=a', { maxSize: 32 }), 32);
  assert.equal(await sized('name=a', { maxSize: 32, size: 128 }), 32);
  assert.equal(await sized('name=a&size=9999', { maxSize: 64 }), 64);
});

test('without a background, every look keeps only the face', async () => {
  await useNativeCanvas();
  for (const look of LOOKS) {
    const px = pixelsOf(faceCanvas('agent-47', { look: look.id, size: 96, background: false }));
    let clear = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] === 0) clear++;
    // thermal paints its whole square as heat, so little of it is clear
    if (look.id !== 'thermal')
      assert.ok(clear > px.length / 4 / 4, `${look.id} is see-through around the face`);
  }
  const gif = await faceGIF('agent-47', { look: 'ink', size: 48, loop: 1, background: false });
  assert.ok(gif.length > 0);
  const svg = await renderImage('agent-47', { format: 'svg', size: 128, background: false });
  assert.match(svg.body, /<mask /, 'the vector paths stay, under a mask of the face');
});

test('a background colour sits behind the face, inside its crop, in every format', async () => {
  await useNativeCanvas();
  const at = (px, size, x, y) => [...px.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
  for (const look of ['watercolour', 'oil', 'ink']) {
    const square = pixelsOf(faceCanvas('agent-47', { look, size: 96, background: '#ffe9a8' }));
    assert.deepEqual(
      at(square, 96, 1, 1),
      [255, 233, 168, 255],
      `${look}: the colour fills the corner`,
    );
    const round = pixelsOf(
      faceCanvas('agent-47', { look, size: 96, background: 'tomato', shape: 'circle' }),
    );
    assert.equal(at(round, 96, 0, 0)[3], 0, `${look}: the crop still cuts`);
    assert.deepEqual(
      at(round, 96, 48, 3),
      [255, 99, 71, 255],
      `${look}: inside the crop it's the colour`,
    );
  }
  const svg = faceSVG('agent-47', {
    look: 'watercolour',
    size: 64,
    background: 'rgb(255 233 168)',
    shape: 'circle',
  });
  assert.match(
    svg,
    /<rect width="64" height="64" fill="#ffe9a8"\/>/,
    'an svg names the colour as canvas writes it',
  );
  assert.match(svg, /clip-path/);
  assert.throws(
    () => faceCanvas('agent-47', { background: 'not a colour' }),
    /unknown background colour/,
  );
  assert.throws(
    () => faceSVG('agent-47', { background: '"/><script>' }),
    /unknown background colour/,
  );

  const gif = await animationFrames('agent-47', {
    look: 'ink',
    size: 48,
    loop: 1,
    fps: 4,
    background: '#ffe9a8',
  });
  assert.deepEqual(
    at(gif.frames[0], 48, 1, 1),
    [255, 233, 168, 255],
    'every frame of a loop is on the colour',
  );

  const get = async (q) =>
    (await createFaceHandler()(new Request(`http://x/api/face?name=agent-47&size=32&${q}`))).status;
  for (const q of [
    'background=ffe9a8',
    'background=%23ffe9a8',
    'background=tomato',
    'background=nonsense',
    'format=jpeg&background=ffe9a8',
  ])
    assert.equal(await get(q), 200, q);
  const jpeg = await renderImage('agent-47', { format: 'jpeg', size: 32, background: '#000000' });
  assert.ok(jpeg.body.length > 0);

  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const out = join(mkdtempSync(join(tmpdir(), 'glorpies-')), 'face.png');
  execFileSync(
    process.execPath,
    [cli, 'agent-47', '--size', '32', '--background', 'ffe9a8', '-o', out],
    { stdio: 'pipe' },
  );
  assert.deepEqual([...readFileSync(out).subarray(0, 4)], PNG);
});

test('every server export works in a fresh process', () => {
  const server = new URL('../dist/server.js', import.meta.url).href;
  for (const call of [
    'faceGIF("a", { size: 32, loop: 1 })',
    'animationFrames("a", { size: 32, loop: 1 })',
    'renderImage("a", { size: 32 })',
  ]) {
    const run = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(server)}); await m.${call};`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(run.status, 0, `${call}: ${run.stderr}`);
  }
});

test('the cli paints a file, and keeps an existing one unless told to overwrite it', () => {
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const out = join(mkdtempSync(join(tmpdir(), 'glorpies-')), 'face.png');
  execFileSync(process.execPath, [cli, 'agent-47', '--size', '32', '-o', out], { stdio: 'pipe' });
  assert.deepEqual([...readFileSync(out).subarray(0, 4)], PNG);
  const again = spawnSync(process.execPath, [cli, 'agent-47', '--size', '32', '-o', out], {
    encoding: 'utf8',
  });
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already exists/);
  execFileSync(process.execPath, [cli, 'agent-47', '--size', '32', '-o', out, '--force'], {
    stdio: 'pipe',
  });
});

/** What every framework's <Glorpie> must render on the server: the element, its attributes, and a placeholder in the face's place. */
function assertPlaceholder(html, framework) {
  assert.match(html, /<glorpie-face\b/, framework);
  assert.match(html, /name="agent-47"/, framework);
  assert.match(html, /size="40"/, framework);
  assert.match(html, /state="thinking"/, framework);
  assert.match(html, /width:\s*40px/, `${framework} holds the face's place`);
  assert.match(html, /border-radius:\s*30%/, `${framework} crops it before it paints`);
}

const props = { name: 'agent-47', size: 40, state: 'thinking', shape: 'squircle' };

test('vue renders the face on the server', async () => {
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  const { Glorpie } = await import('../dist/vue.js');
  assertPlaceholder(await renderToString(createSSRApp({ render: () => h(Glorpie, props) })), 'vue');
});

test('preact renders the face on the server', async () => {
  const { h } = await import('preact');
  const { renderToString } = await import('preact-render-to-string');
  const { Glorpie } = await import('../dist/preact.js');
  assertPlaceholder(renderToString(h(Glorpie, props)), 'preact');
});

test('solid renders the face on the server', async () => {
  const { renderToString, createComponent } = await import('solid-js/web');
  const { Glorpie } = await import('../dist/solid.js');
  assertPlaceholder(
    renderToString(() => createComponent(Glorpie, props)),
    'solid',
  );
});

test('the svelte component compiles, and renders the face on the server', async () => {
  const { compile } = await import('svelte/compiler');
  const { render } = await import('svelte/server');
  const source = readFileSync(new URL('../dist/svelte/Glorpie.svelte', import.meta.url), 'utf8');
  compile(source, { generate: 'client' });
  const server = new URL('../dist/svelte/Glorpie.server.test.js', import.meta.url);
  writeFileSync(server, compile(source, { generate: 'server' }).js.code);
  try {
    const { default: Glorpie } = await import(server.href);
    assertPlaceholder(render(Glorpie, { props }).body, 'svelte');
  } finally {
    rmSync(server);
  }
});

test('node servers get faces through nodeFaceHandler', async () => {
  const { createServer } = await import('node:http');
  const { nodeFaceHandler } = await import('../dist/server.js');
  const server = createServer(nodeFaceHandler()).listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const res = await fetch(
      `http://localhost:${server.address().port}/face?name=agent-47&size=32&look=ink`,
    );
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer()).subarray(0, 4)], PNG);
    assert.equal((await fetch(`http://localhost:${server.address().port}/face`)).status, 400);
  } finally {
    server.close();
  }
});

test('the drop-in script stays small', () => {
  const kb =
    gzipSync(readFileSync(new URL('../dist/cdn/glorpies.js', import.meta.url))).length / 1024;
  assert.ok(kb < 48, `dist/cdn/glorpies.js is ${kb.toFixed(1)} KB gzipped`);
});
