# Release verification

Verified on 2026-11-02 (IST), using the published **glorpies@0.1.1** tarball and live `https://unpkg.com/glorpies@0.1.1` script. No workspace source imports or candidate CDN override were used in this final run.

- Package source: `https://registry.npmjs.org/glorpies/-/glorpies-0.1.1.tgz`.
- Registry tarball integrity: `sha512-lVt6DbIZFgOeoBBvtn8yBkJyuWGgvCxs96VH3oXb+q1tBssy4FDF15fNHBxaHWqJkg5pco0+PIqrJUIY5xwM4g==`.
- Platform: macOS arm64, Node 26.13.0, Chrome 156.
- **1,314 / 1,314 integration checks passed.**
- Library: all 27 unit/packaging tests, browser regressions, TypeScript, publint and ESM declaration resolution passed. Existing per-look pixel fixtures are unchanged.

| Integration | Passed |
| --- | ---: |
| react | 74 |
| vue | 73 |
| svelte | 73 |
| solid | 73 |
| preact | 73 |
| element | 73 |
| angular | 73 |
| mount | 50 |
| svelte-action | 49 |
| canvas | 42 |
| svg | 42 |
| avatar | 77 |
| lit | 73 |
| image | 47 |
| cdn | 73 |
| core | 2 |
| server | 315 |
| route | 9 |
| react SSR | 1 |
| node:http | 1 |
| express | 1 |
| hono | 1 |
| next route | 1 |
| sveltekit/astro route | 1 |
| nuxt route | 1 |
| CLI | 16 |

## Production framework consumers

All four consumers built in production mode, rendered a server placeholder, hydrated and painted without client errors, and served native PNG and secured SVG image responses. Missing names returned 400. Next.js, Nuxt and SvelteKit also updated from numeric seed `42` to string name `"42"`; Astro exercised its element and React island.

| Consumer | Versions | Result |
| --- | --- | --- |
| Next.js | 16.4.3 / React 19.3.1 | Passed |
| Nuxt | 4.6.3 / Vue 3.5.44 | Passed |
| SvelteKit | 3.1.1 / Svelte 5.57.3 | Passed |
| Astro | 7.4.4 / Node adapter 11.1.9 / React adapter 7.1.2 | Passed |

## Additional server runtimes

Bun 1.4.4 and Deno 2.9.6 both passed native rendering in PNG, WebP, JPEG, SVG and GIF, plus real HTTP PNG/SVG requests and missing/oversized-name errors. These are smoke checks, separate from the 1,314-check matrix. Deno's documented `npm:` import was tested with local dependencies and `--allow-net --allow-env --allow-sys --allow-ffi`.

## Issues fixed in 0.1.1

1. Numeric seed props were stringified in element-based integrations. Components and the element now preserve numeric identity, including SSR and number/string transitions.
2. Preact clearing `alive` could enable animation under reduced motion. Removing the prop now restores the default motion policy.
3. Svelte component registration could disappear during a SvelteKit production build. Registration now runs when the component is instantiated.
4. The server image guide omitted native canvas bundler configuration for Next.js and SvelteKit. The corrected setup is verified by the fixtures.

## Website and repository

- All 21 production pages returned 200, with valid headings and titles. Local navigation, linked assets and every README image resolved.
- Browser checks at 1280px and 375px found no horizontal page overflow. Desktop and mobile home layouts were inspected after the faces painted.
- Dark mode is the default; an explicit light selection persisted across navigation. The original dark selection was restored after testing.
- GitHub links display the GitHub mark and outward arrow, and point to the public repository.
- The old GitHub project homepage was replaced with `https://glorpies.sunrakerr.dev`. README and npm metadata use the custom domain.
- GitHub private vulnerability reporting is enabled, matching the security policy.
- `/api/face` remains a 404 on the public documentation site; image routes are self-hosted in consumers.
- Production site dependency audit: zero reported vulnerabilities. The isolated Astro fixture also audited clean.

## Limits

This verifies the tested versions on Chrome/macOS and Node. It does not establish compatibility with every browser, operating system or historical framework release. Bun and Deno received the server smoke checks above; the full matrix ran on Node.

The integration lab includes development toolchains for several frameworks. npm still reports low/moderate advisories in transitive Nuxt/Svelte build dependencies; automatic fixes would require unrelated version downgrades. These dependencies are absent from the published zero-runtime-dependency Glorpies package and the production website.

Run `npm test` and `npm run test:frameworks` to reproduce the checks. JSON results and build logs are generated under the ignored `reports/` folder; CI uploads them as an artifact.
