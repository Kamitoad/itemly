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

## Unreleased Android backup and signing boundaries

- Backup imports are untrusted data, not SQL or instructions. They are validated and restored only to an empty local database; image digests detect corruption, not authenticity. Import only files you trust.
- Backups contain personal data in unencrypted JSON, including trash and audit history. Keep exported documents confidential and outside app-private storage if they must survive uninstall.
- The durable preview signing key/password are local ignored recovery files plus GitHub Actions secrets, never repository source. Protect both copies. Do not rotate the key to fix an installation error.
- Durable signing runs only in the manually dispatched trusted workflow. PR validation uses a throwaway test key without repository credentials and distributes no APK.
- Repository write access is trusted; protect the signing environment with approval requirements before onboarding untrusted contributors. Fork isolation alone does not protect secrets from same-repository workflow changes.
- Preview APKs are still debuggable development builds, not hardened production releases. Physical-device update and restore acceptance is pending.
