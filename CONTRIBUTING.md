# Contributing

Bug fixes, documentation improvements and small examples are welcome. For a new public API, look or breaking change, open an issue first so we can agree on the scope.

## Setup

Use Node 26 (`nvm use` reads `.nvmrc`). The published library supports Node 22 and newer; development tooling uses the versions pinned in this repository.

```sh
npm install --global pnpm@12.15.0
pnpm install --frozen-lockfile
pnpm dev --port 3417
```

Open http://localhost:3417. The website consumes the library's workspace source, so library edits appear as you save.

Browser checks also need Google Chrome. The helper finds a standard installation on macOS or Windows and `google-chrome` on Linux. Set `CHROME` to the executable path for another installation:

```sh
CHROME=/path/to/chrome pnpm --filter glorpies test:browser
```

CI installs Chrome for Testing explicitly. Browser checks use a fresh temporary profile and close it afterward.

## Repository map

| Path | Purpose |
| --- | --- |
| `packages/glorpies/src/` | The library, framework adapters, server renderer and CLI. |
| `packages/glorpies/test/` | Unit, pixel, packaging and browser regressions; an isolated tarball consumer smoke check. |
| `src/app/` | The Next.js website: landing page, gallery, painting explainer and MDX documentation. |
| `src/app/docs/` | User-facing guides and API documentation. |
| `src/components/`, `src/lib/` | Website UI and shared helpers. |
| `examples/react/`, `examples/vanilla/` | Standalone consumers of the published package, with separate npm lockfiles. |
| `public/readme/` | The single source of README artwork for GitHub, npm and the website. |
| `scripts/` | README synchronization, artwork generators, screenshots and site checks. |
| `.github/` | CI, release automation, dependency updates and contribution templates. |

The site lives at the repository root; the library is the pnpm workspace package. Examples deliberately install from npm rather than linking workspace source. Build outputs, local reports and marketing exports are ignored.

## Check a change

Run the documented checks from the root:

```sh
pnpm check
```

This runs source linting, formatting and README synchronization checks, site and library typechecks, and the library unit/packaging tests. Site typechecking runs `next typegen` first, so a fresh clone does not need a previous dev session or build.

Additional checks depend on the change:

```sh
pnpm build                              # website and MDX changes
pnpm --filter glorpies test:browser      # framework components and browser behaviour
pnpm --filter glorpies lint:package      # create and validate the npm tarball
pnpm --filter glorpies test:packed       # install that tarball in an isolated consumer
npm --prefix examples/react ci
npm --prefix examples/react run build
npm --prefix examples/vanilla ci
npm --prefix examples/vanilla run build
```

CI runs the library and tarball checks on Node 22, 24 and 26, the browser regressions on Node 26, the source checks, both starter builds and a production website build. The tarball check covers public imports, numeric seed identity, native PNG rendering, a secured SVG route, CLI output and the CDN entry.

Use `pnpm format` to format changes. After editing the root README, run `pnpm readme:sync`; the npm README is generated with absolute links. Do not edit the generated copy directly.

## Faces must remain stable

People store names, not pictures. An existing name must keep the same face in an existing look. Pixel fixtures in `packages/glorpies/test/fixtures/pixels.json` detect unintended changes on each renderer/platform.

If a change is intended to alter existing faces, describe it as breaking in the PR. To record an intended fixture change on your platform, run `GLORPIES_RECORD=1 pnpm test`. Review every changed fingerprint; do not refresh fixtures just to silence a failure. CI uses the Linux fixtures.

## Documentation and artwork

Keep examples small and independently runnable. Update the relevant MDX guide when public behaviour changes, and add a library changelog entry when appropriate.

`scripts/readme-art.mjs` redraws shared README artwork from the built library and a running site; `scripts/social-art.mjs` generates the section link-preview cards. Preserve the documented seed and painting style of the README hero.

## Releases

Dates in `packages/glorpies/CHANGELOG.md` use UTC. Historical GitHub releases correspond to versions already published on npm; creating release notes does not require republishing a package.

For a new npm release, maintainers:

1. Bump the library version and add dated changelog notes.
2. Run `pnpm check`, browser checks, `lint:package` and `test:packed`.
3. Commit the tested source and update starter dependencies if needed.
4. Publish manually with `pnpm publish --access public` from `packages/glorpies`, or use a new version tag only after configuring `release.yml` as an npm trusted publisher.
5. Add GitHub release notes linking to the changelog and identifying the tested source commit.

Never recreate a tag or publish an already published version. See [SECURITY.md](SECURITY.md) for private vulnerability reporting.
