// A screenshot of a page of the site: node scripts/shot.mjs <out.png> [path] [width] [height] [scale]
import { writeFileSync } from 'node:fs';
import { BASE_URL, sleep, withChrome } from './lib/chrome.mjs';

const [out, path = '/gallery', width = '1280', height = '800', scale = '2'] = process.argv.slice(2);
if (!out) {
  console.error('usage: node scripts/shot.mjs <out.png> [path] [width] [height] [scale]');
  process.exit(1);
}

await withChrome(async ({ send, goto, screenshot }) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width: +width,
    height: +height,
    deviceScaleFactor: +scale,
    mobile: +width < 600,
  });
  await goto(`${BASE_URL}${path}`);
  // faces paint after load, a few at a time
  await sleep(2500);
  writeFileSync(out, await screenshot());
  console.log('wrote', out);
});
