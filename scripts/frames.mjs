// Renders the /how explainer as image frames: node scripts/frames.mjs <name> <outDir> <"1,2.5,4" | "fps:30"> [jpeg|png]
import { mkdirSync, writeFileSync } from 'node:fs';
import { BASE_URL, withChrome } from './lib/chrome.mjs';

const [name, outDir, timesArg, format = 'jpeg'] = process.argv.slice(2);
if (!name || !outDir || !timesArg) {
  console.error('usage: node scripts/frames.mjs <name> <outDir> <"1,2.5,4" | "fps:30"> [jpeg|png]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

await withChrome(async ({ evaluate, waitFor, goto, errors }) => {
  const started = Date.now();
  await goto(`${BASE_URL}/how?name=${encodeURIComponent(name)}`);
  await waitFor('window.__explainer?.ready === true', 60_000);
  console.log('ready in', Date.now() - started, 'ms');
  // the page's own playback would fight the recorder
  await evaluate(`document.querySelector('[aria-label=Pause]')?.click(); true`);

  const duration = await evaluate('window.__explainer.duration');
  const fps = timesArg.startsWith('fps:') ? Number(timesArg.slice(4)) : 0;
  const times = fps
    ? Array.from({ length: Math.round(duration * fps) }, (_, i) => i / fps)
    : timesArg.split(',').map(Number);
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  let slowest = 0;
  for (const [i, t] of times.entries()) {
    const start = Date.now();
    const url = await evaluate(`(() => {
      window.__explainer.draw(${t});
      return document.querySelector('canvas[aria-label^="Animated explainer"]').toDataURL('${mime}', 0.93);
    })()`);
    slowest = Math.max(slowest, Date.now() - start);
    const file = fps ? `f${String(i).padStart(5, '0')}` : `t${t.toFixed(2)}`;
    writeFileSync(
      `${outDir}/${file}.${format === 'png' ? 'png' : 'jpg'}`,
      Buffer.from(url.split(',')[1], 'base64'),
    );
    if (i % 150 === 0) console.log('frame', i, '/', times.length);
  }
  console.log('done:', times.length, 'frames of', duration, 's; slowest frame', slowest, 'ms');
  if (errors.length) console.log('page errors:', errors);
});
