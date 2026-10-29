# Contributing

Issues and pull requests are welcome. For anything bigger than a fix, open an issue first so we can agree on it before you build it.

## Setup

Node 20 or newer and pnpm.

```bash
pnpm install
pnpm dev --port 3417     # the site, with the library compiled from source
```

`packages/glorpies` is the library; `src/` is the site. Changes to the library show up in the site as you save.

## Before a pull request

```bash
pnpm typecheck && pnpm --filter glorpies typecheck
pnpm test                # builds the library and runs its tests
```

CI runs the same, and lints the package as npm will see it.

## The one rule: faces don't change

The same name has to give the same face, forever: people store names, not pictures. A change that moves a single pixel of an existing face in an existing look is a breaking change, even if it looks better. New looks, states and options are fine, and so is anything that keeps every render byte for byte. If a change is meant to alter faces, say so in the pull request.

## Releasing

1. Bump `version` in `packages/glorpies/package.json` and add the changes to `packages/glorpies/CHANGELOG.md`.
2. Commit, then tag and push: `git tag v0.2.0 && git push --tags`.

The release workflow checks the tag matches the version, runs the checks and publishes to npm with provenance. Publishing by hand works too, with `pnpm publish` from `packages/glorpies` (pnpm, not npm: it swaps the source exports for the built ones).
