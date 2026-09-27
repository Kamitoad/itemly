# Architecture

Itemly is a local TypeScript application with replaceable boundaries for extraction, file storage, and persistence. It has a server-backed web runtime and an experimental phone-local Android runtime.

## Components

- `src/` contains the React UI, mobile review flow, and API client.
- `shared/` contains versioned Zod schemas, arithmetic rules, and normalization of imported data.
- `server/` contains Express routes, extraction adapters, SQLite access, backups, and restore.
- `server/migrations/` contains immutable, explicitly applied SQLite migrations.
- `src/native/` contains the Capacitor Android persistence adapter and its own explicit SQLite migrations.
- `android/` contains the generated, version-controlled Android project.
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

In the web runtime, SQLite stores merchant snapshots, purchases, items, adjustments, attachments, and audit events. Migrations are recorded exactly once in `_migrations`. Confirmed saves run in a transaction and use a client-generated mutation ID for idempotency.

Original images are content-addressed and stored beside the database. Portable backups include the database and images, but do not modify any external backup destination.

In the Android prototype, a separate app-private SQLite database stores each validated receipt draft and metadata in one atomic row. The app-private Filesystem directory stores content-addressed originals before the SQLite reference is committed. The native schema uses `PRAGMA user_version` and an explicit migration in `src/native/migrations/`. The two databases are not synchronized. Backup, restore, and real-device verification are still open work.

## Security boundary

The app has no login in version 0.1.0, so the network itself is the trust boundary. Public hosting requires a reverse proxy with HTTPS and access control in front of Itemly.

## Phone-local runtime prototype

The Android runtime has no PC API dependency for core operations. It is not yet validated on a physical device. [ADR 001](decisions/001-phone-local-android.md) records the decision and acceptance tests; the [Android guide](ANDROID.md) describes setup and limitations.
