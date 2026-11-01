# Glorpies integration lab

A standalone consumer of the published npm package. The main site uses workspace source; this app deliberately installs the registry release and builds production browser bundles.

```sh
cd examples/integration-lab
npm ci
npm run dev
```

Open http://127.0.0.1:3421. Controls change the same props across React, Vue, Svelte, Solid, Preact, Angular, Lit, the web component, the CDN script, the Svelte action, `mount()`, `faceCanvas()`, `faceSVG()`, React photo fallbacks and server images. Each card has its own document so one integration cannot register another's element accidentally.

The image routes in `vite.config.js` run only in this local test app. The public documentation site does not host an image API.

## Tests

Use Node 26 and Google Chrome. Set `CHROME` to its executable if it is not installed at the path in `../../scripts/lib/chrome.mjs`.

```sh
npm test
npm ci --prefix test/fixtures/astro
npm run test:frameworks
```

The browser matrix covers every look and state, numeric and string identities, empty/unicode/markup-looking names, shape, background colours and transparency, sizes around the `auto` threshold, CSS lengths, accessibility, class/style props, animation and reduced motion, high-DPI rendering, rapid updates, teardown/remount, paint errors and photo load/failure states.

The server matrix covers every output format, look, state and shape; colour backgrounds; seed and size limits; malformed options; image headers and caching; real Node/Express requests; fetch adapters; React SSR; and the CLI's formats, flags, invalid input and overwrite protection.

Production Next.js, Nuxt, SvelteKit and Astro fixtures test the documented imports, SSR, hydration, rendered canvas pixels, reactive seed updates and native image routes. Astro has an isolated install so its adapter and cookie dependencies are resolved as they would be in an independent app. The fixture configurations include the native canvas externalization needed by Next.js and SvelteKit.

Results and framework logs are written to `reports/`. The committed [verification report](VERIFICATION.md) records the last release run. A run is not exhaustive across browsers, operating systems or every historical framework version. The full integration matrix runs on Node; the optional smoke checks below also exercise Bun and Deno.

## Bun and Deno

Optional runtime smoke tests exercise all five image formats and real HTTP image routes:

```sh
npx -y bun@1.4.4 test/runtimes.mjs
npx -y deno@2.9.6 run --allow-net --allow-env --allow-sys --allow-ffi test/runtimes.mjs
```

Deno uses the documented `npm:glorpies/server` import and the native canvas from this project's local `node_modules`.

## Testing a candidate before publishing

Build and pack from the repository root:

```sh
pnpm --filter glorpies build
pnpm --filter glorpies pack --pack-destination /tmp
```

Install that tarball in this app and the isolated Astro fixture. For the CDN check, copy `packages/glorpies/dist/cdn/glorpies.js` to this app's `public/candidate.js`, then build with `VITE_GLORPIES_CDN=/candidate.js`. This explicitly tests a candidate, rather than the live CDN. After publishing, remove the candidate file, install the exact registry version in both consumers, and run the tests without that override.

For focused debugging, `LAB_KINDS=lit,cdn LAB_SKIP_SERVER=1 node test/run.mjs` runs selected browser integrations after a build. Always run the complete matrix for a release.
