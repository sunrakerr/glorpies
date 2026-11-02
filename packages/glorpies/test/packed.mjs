// Smoke-test the actual tarball in a temporary consumer, without workspace imports.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tarball = readdirSync(join(root, '.pack')).find((file) => file.endsWith('.tgz'));
assert.ok(tarball, 'run pnpm --filter glorpies lint:package first');
const app = mkdtempSync(join(tmpdir(), 'glorpies-consumer-'));
try {
  writeFileSync(join(app, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      resolve(root, '.pack', tarball),
      '@napi-rs/canvas',
      'react',
    ],
    { cwd: app, stdio: 'inherit' },
  );
  writeFileSync(
    join(app, 'check.mjs'),
    `
    import assert from 'node:assert/strict';
    import { seedOf } from 'glorpies';
    import { Glorpie } from 'glorpies/react';
    import 'glorpies/element';
    import { renderImage, createFaceHandler } from 'glorpies/server';
    assert.equal(seedOf(42), 42);
    assert.notEqual(seedOf('42'), 42);
    assert.equal(typeof Glorpie, 'function');
    const { body, type } = await renderImage('agent-47', { size: 64 });
    assert.equal(type, 'image/png');
    assert.deepEqual([...body.slice(0, 4)], [137, 80, 78, 71]);
    const response = await createFaceHandler()(new Request('https://example.test/face?name=agent-47&format=svg'));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /^<svg/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  `,
  );
  execFileSync(process.execPath, ['check.mjs'], { cwd: app, stdio: 'inherit' });
  execFileSync(
    process.execPath,
    [join(app, 'node_modules/glorpies/dist/cli.js'), 'agent-47', '--size', '64', '-o', 'face.png'],
    { cwd: app, stdio: 'inherit' },
  );
  assert.equal(readFileSync(join(app, 'face.png'))[0], 0x89);
  assert.ok(readFileSync(join(app, 'node_modules/glorpies/dist/cdn/glorpies.js')).length > 1000);
  console.log('packed imports, seed identity, native PNG, SVG route, CLI and CDN entry passed');
} finally {
  rmSync(app, { recursive: true, force: true });
}
