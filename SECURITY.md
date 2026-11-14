# Security policy

## Supported versions

Security fixes are applied to the current `main` branch and the currently deployed public Site version.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository and include the affected endpoint or commit, reproduction steps, impact, and any suggested mitigation. Do not include real user data or working credentials.

You should receive an acknowledgement within three business days. The project will validate the report, coordinate a fix and disclosure window, rotate affected secrets, and credit the reporter unless anonymity is requested.

## Security boundaries

- Hosted visitors are isolated by an unguessable browser client identifier and D1 owner scope.
- Admin mutations require a constant-time bearer-token comparison.
- Public event and recommendation routes are quota limited and return `429` with `Retry-After`.
- Request bodies, identifiers, event timestamps, content fields, and serving artifacts are bounded and validated.
- Static responses apply CSP, HSTS, clickjacking, MIME-sniffing, referrer, and browser-permission restrictions.
- No OpenAI or third-party paid API credential is required by Affinity.

See [production operations](docs/operations.md) for backup, rotation, rollback, retention, and incident procedures.
