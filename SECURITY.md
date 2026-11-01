# Security

Report a vulnerability privately through [GitHub's advisory form](https://github.com/sunrakerr/glorpies/security/advisories/new), not as a public issue. I'll reply as soon as I can.

The part most worth a look is `glorpies/server`: it turns query strings into images, so a request that makes it use unbounded time or memory, or that slips something into a response, counts. Fixes land in the latest version.
