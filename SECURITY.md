# Security policy

## Supported versions

Itemly is in an early MVP stage. Security fixes are provided for the current version on the `main` branch.

## Reporting a vulnerability

Do not disclose potential vulnerabilities in a public issue. Instead, use the private security advisory form:

https://github.com/Kamitoad/itemly/security/advisories/new

Where possible, include the affected version, reproduction steps, potential impact, and known mitigations. Do not share real receipt images, purchase data, or access keys.

## Security boundaries in v0.1.0

- Itemly is designed for a private computer or trusted home network.
- There are no user accounts, login, or role-based permissions yet.
- Do not expose the server directly to the public internet.
- Keep API keys in the local `.env` file, never in browser code, commits, or screenshots.
- Receipt text and AI output are untrusted data and must be validated.
- Original values and arithmetic discrepancies remain visible.

These limits describe the current design. They do not imply that public multi-user hosting is supported safely.
