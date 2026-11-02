// The framework components, and late paint failures, in a real browser: node test/browser.mjs after a build. CHROME picks the browser.
import assert from 'node:assert/strict';
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withChrome } from '../../../scripts/lib/chrome.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

const server = createServer((req, res) => {
  const file = join(root, normalize(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));

try {
  await withChrome(async ({ goto, waitFor, evaluate, errors }) => {
    await goto(`http://127.0.0.1:${server.address().port}/test/browser/frameworks.html`);
    await waitFor('!!window.__results', 60_000);
    const results = await evaluate('window.__results');
    // the canvas is broken on purpose at the end, so faces still painting log that, and nothing else
    assert.deepEqual(
      errors.filter((e) => !e.includes('Error: no canvas')),
      [],
      'the page logged errors',
    );
    assert.deepEqual(results, {
      vue: { painted: true, upgraded: true, state: 'done' },
      preact: { painted: true, upgraded: true, state: 'blocked' },
      solid: { painted: true, upgraded: true, look: 'ink' },
      colour: {
        painted: true,
        colour: 'rgb(255, 233, 168)',
        radius: '50%',
        stillPainted: true,
        changed: 'rgb(255, 99, 71)',
      },
      deferred: { painted: true, reported: true },
      motionDefault: true,
      seeds: { vue: true, solid: true, preact: true, element: true },
    });
    console.log(
      'vue, preact and solid paint and follow their props; a background colour sits in the crop without repainting; a late failure reaches onError',
    );
  });
} finally {
  server.close();
}
