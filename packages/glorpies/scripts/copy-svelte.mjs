// Svelte components ship as source, for the app's own Svelte compiler to build.
import { copyFileSync } from 'node:fs';

for (const file of ['Glorpie.svelte', 'index.js', 'index.d.ts']) copyFileSync(new URL(`../src/svelte/${file}`, import.meta.url), new URL(`../dist/svelte/${file}`, import.meta.url));
