// The crowd's first frame is a cached atlas; only a few faces wake in the worker.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderImage } from '../packages/glorpies/dist/server.js';
import { randomName } from '../packages/glorpies/dist/index.js';
const require = createRequire(new URL('../packages/glorpies/package.json', import.meta.url));
const { createCanvas, loadImage } = require('@napi-rs/canvas');
let seed = 4711;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const names = new Set();
while (names.size < 98) names.add(randomName(random));
const canvas = createCanvas(14 * 96, 7 * 96),
  ctx = canvas.getContext('2d');
let index = 0;
for (const name of names) {
  const { body } = await renderImage(name, {
    size: 96,
    look: 'ink',
    shape: 'circle',
    format: 'png',
  });
  ctx.drawImage(await loadImage(body), (index % 14) * 96, Math.floor(index / 14) * 96);
  index++;
}
mkdirSync(new URL('../public/landing/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../public/landing/crowd.webp', import.meta.url),
  canvas.toBuffer('image/webp', 90),
);
writeFileSync(
  new URL('../src/components/landing/crowd-names.json', import.meta.url),
  JSON.stringify([...names], null, 2) + '\n',
);
console.log('wrote 98 original Glorpies in one cached crowd atlas');
