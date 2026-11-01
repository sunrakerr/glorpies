# Contributing

Issues and pull requests are welcome. For anything bigger than a fix, open an issue first so we can agree on it before you build it.

## Setup

Node 26 (the current LTS; `.nvmrc` pins it) and pnpm. The library itself supports Node 22 and newer.

```bash
pnpm install
pnpm dev --port 3417     # the site, with the library compiled from source
```

`packages/glorpies` is the library; `src/` is the site. Changes to the library show up in the site as you save.

## Before a pull request

```bash
pnpm typecheck && pnpm --filter glorpies typecheck
pnpm test                # builds the library and runs its tests
pnpm --filter glorpies test:browser   # the framework components in headless Chrome
```

CI runs the same on Node 22, 24 and 26, lints the package as npm will see it, and installs the packed package into a fresh app.

The code reads plainly and comments sparingly: a line where the why isn't obvious, not a narration of the what.

## The one rule: faces don't change

The same name has to give the same face, forever: people store names, not pictures. A change that moves a single pixel of an existing face in an existing look is a breaking change, even if it looks better. New looks, states and options are fine, and so is anything that keeps every render byte for byte. If a change is meant to alter faces, say so in the pull request.

The tests hold this in place. They pin the seed and geometry of known names, and a hash of every look's pixels per platform in `packages/glorpies/test/fixtures/pixels.json`. A failure there lists every look that changed. If the change is intended, record macOS or your own platform again with `GLORPIES_RECORD=1 pnpm test`. The `linux-x64` prints are the ones CI paints, so copy those from the failing CI run.

## Testing the published package

The [integration lab](examples/integration-lab/README.md) is a separate consumer app. It installs Glorpies from npm and exercises every component, the element, CDN, canvas APIs, server images and CLI. It also includes production Next.js, Nuxt, SvelteKit and Astro fixtures.

## Releasing

1. Bump `version` in `packages/glorpies/package.json` and update `packages/glorpies/CHANGELOG.md`.
2. Run the checks above and test a packed candidate in the integration lab.
3. Commit the tested changes, then run `pnpm publish --access public` from `packages/glorpies`. Use pnpm: it swaps source exports for the built ones.
4. Install the new version from npm in the lab and repeat its tests, including the CDN and production framework fixtures. Commit the updated lockfile and verification report, and push.

For automated releases, first configure this repository's `release.yml` as a trusted publisher in the package's npm settings. Then a matching version tag (for example `git tag v0.2.0 && git push origin v0.2.0`) runs the release workflow and publishes with provenance. Until that trust is configured, use the manual steps above and do not push a release tag.

## Security

Don't open an issue for a vulnerability; report it privately, as [SECURITY.md](SECURITY.md) describes.
