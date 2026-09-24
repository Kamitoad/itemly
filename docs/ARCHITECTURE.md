# Architecture

Itemly is a local full-stack TypeScript application with replaceable boundaries for extraction, file storage, and persistence.

## Components

- `src/` contains the React UI, mobile review flow, and API client.
- `shared/` contains versioned Zod schemas, arithmetic rules, and normalization of imported data.
- `server/` contains Express routes, extraction adapters, SQLite access, backups, and restore.
- `server/migrations/` contains immutable, explicitly applied SQLite migrations.
- `tests/` covers domain logic, import boundaries, and persistence behavior.

## Data flow

```text
Receipt image or manual input
            |
            v
Optional extraction / JSON import
            |
            v
Schema validation and unverified draft
            |
            v
Visible review and arithmetic reconciliation
            |
            v
Atomic SQLite save + optional original image
```

## Domain rules

- Store money as integer minor units.
- Keep quantities and package sizes as exact decimal strings.
- Never replace printed totals with calculated values.
- A confirmed purchase must have complete prices and balanced arithmetic.
- Drafts may be incomplete or unbalanced.
- Verification checkboxes record human review only.
- Always treat raw receipt, OCR, and AI output as untrusted data.

## Persistence

SQLite stores merchant snapshots, purchases, items, adjustments, attachments, and audit events. Migrations are recorded exactly once in `_migrations`. Confirmed saves run in a transaction and use a client-generated mutation ID for idempotency.

Original images are content-addressed and stored beside the database. Portable backups include the database and images, but do not modify any external backup destination.

## Security boundary

The app has no login in version 0.1.0, so the network itself is the trust boundary. Public hosting requires a reverse proxy with HTTPS and access control in front of Itemly.
