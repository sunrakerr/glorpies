# Examples

Small standalone apps using the published `glorpies` package:

| Example                       | What it shows                                               |
| ----------------------------- | ----------------------------------------------------------- |
| [React](react)                | A reactive `<Glorpie>` with name and look controls.         |
| [Vanilla JavaScript](vanilla) | The `<glorpie-face>` web component, without a UI framework. |

Each example has its own dependencies and lockfile. Copy either folder into a new project, then run `npm ci` and `npm run dev` there. They are intentionally outside the pnpm workspace so they behave like consumer apps.

For other frameworks and self-hosted image routes, see the [documentation](https://glorpies.sunrakerr.dev/docs). Regression and packed-package checks live in `packages/glorpies/test/`.
