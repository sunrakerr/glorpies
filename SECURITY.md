# Security

Report a vulnerability privately through [GitHub's advisory form](https://github.com/sunrakerr/glorpies/security/advisories/new), not as a public issue. Include the version, the entry point (`glorpies/server`, the CLI, a component) and a request or input that shows it. I'll reply as soon as I can.

The part most worth a look is `glorpies/server`: it turns query strings into images, so a request that makes it use unbounded time or memory, or that slips something into a response, counts. So does anything that gets markup into `faceSVG()` output or past the options it validates.

Only the latest release gets fixes.
