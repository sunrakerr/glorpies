// The gallery, end to end in headless Chrome: node scripts/run.mjs (BASE_URL picks the site, default the dev server)
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE_URL, sleep, withChrome } from './lib/chrome.mjs';

const out = mkdtempSync(join(tmpdir(), 'glorpies-e2e-'));
const downloads = join(out, 'downloads');
const gallery = `${BASE_URL}/gallery`;

await withChrome(async ({ send, evaluate, waitFor, goto, screenshot, errors }) => {
  const check = async (what, run) => {
    await run();
    console.log('ok', what);
  };
  const dialog = (selector) => `document.querySelector('dialog[open] ${selector}')`;
  const click = (label) => evaluate(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
  const toast = (text) => waitFor(`(${dialog('[aria-live]')}?.textContent ?? '').includes(${JSON.stringify(text)})`, 20_000);

  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: new URL(gallery).origin });
  await goto(gallery);

  await check('twelve faces paint', () => waitFor(`document.querySelectorAll('ul canvas.opacity-100').length >= 12`));

  await check('the page keeps animating smoothly', async () => {
    const frames = await evaluate(`(async () => {
      const tasks = [];
      const watch = new PerformanceObserver((list) => list.getEntries().forEach((e) => tasks.push(e.duration)));
      watch.observe({ type: 'longtask' });
      const start = performance.now();
      let count = 0;
      await new Promise((done) => { const tick = () => { count++; performance.now() - start < 3000 ? requestAnimationFrame(tick) : done(); }; requestAnimationFrame(tick); });
      watch.disconnect();
      return { perSecond: count / 3, worst: Math.max(0, ...tasks) };
    })()`);
    assert.ok(frames.perSecond > 30, `${frames.perSecond} frames a second`);
  });

  await check('faces move', async () => {
    assert.ok(await evaluate(`(async () => {
      const c = document.querySelector('ul canvas');
      const before = c.toDataURL();
      await new Promise((r) => setTimeout(r, 400));
      return before !== c.toDataURL();
    })()`));
  });
  writeFileSync(join(out, 'gallery.png'), await screenshot());

  await check('a face opens in the viewer', async () => {
    await evaluate(`document.querySelectorAll('ul li button[aria-label^="Open "]')[1].click()`);
    await waitFor(`!!${dialog('canvas.opacity-100')}`);
    assert.ok((await evaluate(`${dialog('canvas')}.width`)) >= 400);
  });
  await sleep(800);
  writeFileSync(join(out, 'viewer.png'), await screenshot());

  await check('png and svg download', async () => {
    await click('PNG');
    await toast('PNG saved');
    await click('SVG');
    await toast('SVG saved');
    await sleep(800);
    const files = readdirSync(downloads);
    assert.ok(files.some((f) => f.endsWith('.png')) && files.some((f) => f.endsWith('.svg')), files.join(', '));
    for (const f of files) assert.ok(statSync(join(downloads, f)).size > 1024, `${f} is empty`);
  });

  await check('the image and its svg copy', async () => {
    await click('Copy image');
    await toast('Copied');
    assert.ok((await evaluate(`navigator.clipboard.read().then((items) => items.flatMap((i) => i.types))`)).includes('image/png'));
    await click('Copy SVG');
    await toast('SVG markup copied');
    assert.match(await evaluate(`navigator.clipboard.readText()`), /^<svg /);
  });

  await check('the keyboard moves on and closes', async () => {
    const before = await evaluate(`${dialog('.tabular-nums')}.textContent`);
    await evaluate(`document.querySelector('dialog[open]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
    await waitFor(`${dialog('.tabular-nums')}.textContent !== ${JSON.stringify(before)}`);
    await evaluate(`${dialog('button[aria-label=Close]')}.click()`);
    await waitFor(`!document.querySelector('dialog[open]')`);
  });

  await check('a phone gets two columns', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(1500);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('main ul')).gridTemplateColumns.split(' ').length`), 2);
  });
  writeFileSync(join(out, 'phone.png'), await screenshot());

  assert.deepEqual(errors, [], 'the page logged errors');
});

console.log('screenshots and downloads in', out);
