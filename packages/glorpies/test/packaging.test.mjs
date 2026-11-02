import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'tsup';

test('a side-effect import registers the packed web component after tree-shaking', async () => {
  const app = mkdtempSync(join(tmpdir(), 'glorpies-packed-'));
  const root = fileURLToPath(new URL('..', import.meta.url));
  try {
    execFileSync('pnpm', ['pack', '--pack-destination', app], { cwd: root, stdio: 'pipe' });
    const tarball = readdirSync(app).find((name) => name.endsWith('.tgz'));
    const installed = join(app, 'node_modules', 'glorpies');
    mkdirSync(installed, { recursive: true });
    execFileSync('tar', ['-xzf', join(app, tarball), '--strip-components=1', '-C', installed]);
    writeFileSync(join(app, 'package.json'), '{"private":true,"type":"module"}');
    writeFileSync(join(app, 'entry.js'), "import 'glorpies/element';\n");
    await build({
      entry: [join(app, 'entry.js')],
      outDir: join(app, 'out'),
      format: ['iife'],
      platform: 'browser',
      target: 'es2022',
      noExternal: [/^glorpies(?:\/|$)/],
      splitting: false,
      dts: false,
      config: false,
      silent: true,
    });
    const output = readdirSync(join(app, 'out')).find((name) => name.endsWith('.js'));
    const registered = new Map();
    runInNewContext(readFileSync(join(app, 'out', output), 'utf8'), {
      HTMLElement: class {},
      customElements: {
        get: (name) => registered.get(name),
        define: (name, type) => registered.set(name, type),
      },
    });
    assert.equal(typeof registered.get('glorpie-face'), 'function');
    assert.equal(registered.size, 1);
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
});
