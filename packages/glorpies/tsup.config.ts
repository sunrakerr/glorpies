import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // built together so every entry shares one copy of the engine (one animation loop, one face cache)
    entry: {
      index: 'src/index.ts', element: 'src/element.ts', react: 'src/react.tsx', vue: 'src/vue.ts', preact: 'src/preact.ts', solid: 'src/solid.ts',
      'svelte/action': 'src/svelte/action.ts', server: 'src/server.ts', testing: 'src/testing.ts',
    },
    format: ['esm'],
    target: 'es2022',
    dts: true,
    clean: true,
    external: ['react', 'vue', 'preact', 'solid-js', 'svelte', '@napi-rs/canvas'],
    // the 5KB gif encoder is bundled in, so the package has no runtime dependencies at all
    noExternal: ['gifenc'],
  },
  {
    // one self-contained file for <script type="module" src="…/glorpies.js">, no bundler needed
    entry: { glorpies: 'src/element.ts' },
    format: ['esm'],
    target: 'es2022',
    minify: true,
    outDir: 'dist/cdn',
    noExternal: [/.*/],
  },
  { entry: { cli: 'src/cli.ts' }, format: ['esm'], target: 'node22', external: ['@napi-rs/canvas'], noExternal: ['gifenc'], banner: { js: '#!/usr/bin/env node' } },
]);
