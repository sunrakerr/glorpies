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

## Releasing

1. Bump `version` in `packages/glorpies/package.json` and add the changes to `packages/glorpies/CHANGELOG.md`.
2. Commit, then tag and push: `git tag v0.2.0 && git push --tags`.

The release workflow checks the tag matches the version, runs the checks and publishes to npm with provenance. It uses npm's trusted publishing, so it needs no token, but the package's settings on npmjs.com have to trust this repository's `release.yml`. npm only offers that once a package exists, so the very first release is published by hand: `pnpm publish` from `packages/glorpies` (pnpm, not npm: it swaps the source exports for the built ones).

## Security

Don't open an issue for a vulnerability; report it privately, as [SECURITY.md](SECURITY.md) describes.
